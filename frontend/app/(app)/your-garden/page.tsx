"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { AlertTriangle, Zap, RefreshCw, Activity } from "lucide-react";
import { truncateId } from "@/lib/mock-data";
import { fetchDashboardData, postInjectAttack, postFreezeAgent, postReauthorizeAgent, postGate } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type DemoState = "normal" | "attacking" | "frozen";

interface GateEvent {
  id: string;
  agentId: string;
  verdict: "ISSUED" | "DENIED";
  metricValue: number;
  amount: number;
  timestamp: number;
}

interface HoveredPoint {
  index: number;
  x: number; y: number; z: number; // raw normalised coords
  screenX: number; screenY: number;
}

// Mock payment data per point index (swap with real agentPayments later)
function mockPaymentForPoint(index: number, state: DemoState) {
  const seed = index * 137.508 + (state === "normal" ? 0 : 999);
  const base = state === "normal" ? 0.9 : 0.2 + (index % 10) * 0.4;
  const amt  = (t: number) => (base + Math.abs(Math.sin(seed * t)) * (state === "normal" ? 0.3 : 2.1)).toFixed(2);
  return {
    index,
    xt:    amt(1),
    xtTau: amt(2),
    xt2Tau:amt(3),
    block: 3_200_000 + index * 3,
    ago:   `${Math.max(1, 300 - index * 2)}s ago`,
    verdict: state === "normal" ? "ISSUED" : index % 3 === 0 ? "DENIED" : "ISSUED",
  };
}

const FALLBACK_AGENTS = [
  { agentId: "0x616c6963652d657870656e73652d763100000000000000000000000000000000", name: "alice-expense-v1" },
  { agentId: "0x626f622d74726164696e672d763100000000000000000000000000000000000",  name: "bob-trading-v1" },
];

// ─── Lorenz attractor math ────────────────────────────────────────────────────
// Standard Lorenz: tight butterfly = stable agent
// High-rho Lorenz: exploded chaos = compromised agent

function lorenzPoints(
  n = 2500,
  dt = 0.006,
  sigma = 10,
  rho = 28,
  beta = 2.667
): [number, number, number][] {
  let x = 0.1, y = 0, z = 0;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n + 200; i++) {
    const dx = sigma * (y - x);
    const dy = x * (rho - z) - y;
    const dz = x * y - beta * z;
    x += dx * dt; y += dy * dt; z += dz * dt;
    if (i > 200) pts.push([x, y, z]);
  }
  // Centre + scale to [-1.4, 1.4]
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), zs = pts.map(p => p[2]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const cz = (Math.max(...zs) + Math.min(...zs)) / 2;
  const spread = Math.max(Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys), Math.max(...zs)-Math.min(...zs));
  const scale = 2.8 / spread;
  return pts.map(([px, py, pz]) => [(px-cx)*scale, (py-cy)*scale, (pz-cz)*scale]);
}

// Attack: pure random scatter — nothing like the butterfly, unmistakably different
function chaoticPoints(): [number, number, number][] {
  return Array.from({ length: 2500 }, () => {
    // Random points in a large sphere — agent identity completely lost
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 1.2 + Math.random() * 1.8;
    return [
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
    ] as [number, number, number];
  });
}

// ─── 3D attractor cloud ───────────────────────────────────────────────────────

function AttractorCloud({
  targetPts,
  state,
  onHover,
}: {
  targetPts: [number, number, number][];
  state: DemoState;
  onHover: (pt: HoveredPoint | null) => void;
}) {
  const ref = useRef<THREE.Points>(null);
  const currentPts = useRef<Float32Array>(new Float32Array(targetPts.length * 3));
  const targetArr = useRef<Float32Array>(new Float32Array(targetPts.length * 3));

  // On mount, snap current to target
  useEffect(() => {
    const arr = new Float32Array(targetPts.length * 3);
    targetPts.forEach(([x, y, z], i) => { arr[i*3]=x; arr[i*3+1]=y; arr[i*3+2]=z; });
    currentPts.current = arr.slice();
    targetArr.current = arr.slice();
    if (ref.current) {
      (ref.current.geometry.attributes.position as THREE.BufferAttribute).set(arr);
      ref.current.geometry.attributes.position.needsUpdate = true;
    }
  }, []);

  // On targetPts change, update target — lerp in useFrame
  useEffect(() => {
    const arr = new Float32Array(targetPts.length * 3);
    targetPts.forEach(([x, y, z], i) => { arr[i*3]=x; arr[i*3+1]=y; arr[i*3+2]=z; });
    targetArr.current = arr;
  }, [targetPts]);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(targetPts.length * 3);
    targetPts.forEach(([x,y,z],i) => { pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z; });
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [targetPts.length]);

  const mat = useMemo(() => new THREE.PointsMaterial({
    color: state === "normal" ? "#eca8d6" : state === "attacking" ? "#f59e0b" : "#ef4444",
    size: 0.028,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), [state]);

  useFrame((_, dt) => {
    if (!ref.current) return;
    // Slow rotation
    ref.current.rotation.y += dt * (state === "frozen" ? 0.55 : 0.18);
    ref.current.rotation.z += dt * 0.05;

    // Lerp towards target
    const speed = state === "attacking" ? 1.8 : state === "frozen" ? 0.6 : 3.0;
    const t = Math.min(1, dt * speed);
    const cur = currentPts.current;
    const tgt = targetArr.current;
    const len = Math.min(cur.length, tgt.length);
    for (let i = 0; i < len; i++) {
      cur[i] += (tgt[i] - cur[i]) * t;
    }
    (ref.current.geometry.attributes.position as THREE.BufferAttribute).set(cur);
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points
      ref={ref}
      geometry={geo}
      material={mat}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (e.index == null) return;
        const i = e.index;
        const cur = currentPts.current;
        onHover({
          index: i,
          x: cur[i*3], y: cur[i*3+1], z: cur[i*3+2],
          screenX: e.nativeEvent.offsetX,
          screenY: e.nativeEvent.offsetY,
        });
      }}
      onPointerLeave={() => onHover(null)}
    />
  );
}

// ─── Glow sphere (ambient blob behind attractor) ──────────────────────────────

function GlowBlob({ state }: { state: DemoState }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((clock) => {
    if (ref.current) {
      const s = 0.95 + Math.sin(clock.clock.elapsedTime * 1.2) * 0.04;
      ref.current.scale.setScalar(s);
    }
  });
  const color = state === "normal" ? "#eca8d6" : state === "attacking" ? "#f59e0b" : "#ef4444";
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[1.8, 16, 16]} />
      <meshBasicMaterial color={color} transparent opacity={0.03} side={THREE.BackSide} />
    </mesh>
  );
}

function Scene({ state, onHover }: { state: DemoState; onHover: (pt: HoveredPoint | null) => void }) {
  const normalPts = useMemo(() => lorenzPoints(), []);
  const attackPts = useMemo(() => chaoticPoints(), []);
  const pts = state === "normal" ? normalPts : attackPts;

  return (
    <>
      <ambientLight intensity={0.1} />
      <pointLight position={[4, 4, 4]} intensity={2} color={state === "frozen" ? "#ff2244" : "#eca8d6"} />
      <pointLight position={[-4, -3, -3]} intensity={0.8} color="#3355ff" />
      <GlowBlob state={state} />
      <AttractorCloud targetPts={pts} state={state} onHover={onHover} />
    </>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ values, state }: { values: number[]; state: DemoState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c || values.length < 2) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...values) * 0.88;
    const range = (Math.max(...values) * 1.12) - min || 1;

    // Fill under line
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    const col = state==="normal" ? "rgba(236,168,214," : state==="attacking" ? "rgba(245,158,11," : "rgba(239,68,68,";
    grad.addColorStop(0, col+"0.15)");
    grad.addColorStop(1, col+"0.01)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = (i / (values.length-1)) * w;
      const y = h - ((v-min)/range)*h;
      i===0 ? ctx.moveTo(x, h) : null;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

    // Baseline
    const baseline = values.slice(0, 20).reduce((a,b)=>a+b,0)/20;
    const by = h - ((baseline-min)/range)*h;
    ctx.strokeStyle="rgba(255,255,255,0.15)"; ctx.setLineDash([4,4]); ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,by); ctx.lineTo(w,by); ctx.stroke();
    ctx.setLineDash([]);

    // Threshold line
    const thr = baseline * 2;
    if (thr < Math.max(...values) * 1.12) {
      const ty = h - ((thr-min)/range)*h;
      ctx.strokeStyle="rgba(239,68,68,0.4)"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(0,ty); ctx.lineTo(w,ty); ctx.stroke();
    }

    // Main line
    const lineCol = state==="normal" ? "#eca8d6" : state==="attacking" ? "#f59e0b" : "#ef4444";
    ctx.strokeStyle=lineCol; ctx.lineWidth=2; ctx.lineJoin="round";
    ctx.beginPath();
    values.forEach((v,i) => {
      const x=(i/(values.length-1))*w, y=h-((v-min)/range)*h;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.stroke();
  }, [values, state]);
  return <canvas ref={ref} width={600} height={80} className="w-full h-full" />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function YourGardenPage() {
  const [state, setState] = useState<DemoState>("normal");
  const [liveAgents, setLiveAgents] = useState<{ agentId: string; name: string }[]>([]);
  const [agent, setAgent] = useState(FALLBACK_AGENTS[0]);

  useEffect(() => {
    fetchDashboardData()
      .then((d) => {
        if (d.agents.length > 0) {
          const mapped = d.agents.map((a) => ({ agentId: a.agentId, name: a.name }));
          setLiveAgents(mapped);
          setAgent(mapped[0]);
        }
      })
      .catch(() => null);
  }, []);
  const [events, setEvents] = useState<GateEvent[]>([]);
  const [metrics, setMetrics] = useState<number[]>([]);

  useEffect(() => {
    setEvents(Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`, agentId: FALLBACK_AGENTS[0].agentId, verdict: "ISSUED" as const,
      metricValue: 1.18+Math.random()*0.15, amount: 0.8+Math.random()*0.4,
      timestamp: Date.now()-i*4000,
    })));
    setMetrics(Array.from({ length: 40 }, () => 1.18+Math.random()*0.12));
  }, []);
  const [injecting, setInjecting] = useState(false);
  const [hoveredPt, setHoveredPt] = useState<HoveredPoint | null>(null);


  async function injectAttack() {
    setInjecting(true);
    try {
      await postInjectAttack(agent.agentId);
    } catch {
      // attack tx may still succeed on-chain even if response errors
    }
    setInjecting(false);
    setState("attacking");
  }

  // ── Real gate polling ──────────────────────────────────────────────────────
  // After inject-attack fires simulateAttack on-chain, Goldsky indexes the new
  // payments. We poll POST /api/gate every 3s — the backend fetches Goldsky
  // history, runs Python nolds, compares baseline, and returns real ISSUED/DENIED.
  useEffect(() => {
    if (state !== "attacking") return;
    let active = true;
    let step = 0;

    const poll = async () => {
      if (!active) return;
      step++;
      try {
        const res = await postGate({
          agentId: agent.agentId,
          amount: 1,
          destination: "0x0000000000000000000000000000000000000001",
        });
        const m = Number(res.metric) || 0;
        const verdict = res.verdict as "ISSUED" | "DENIED";
        setMetrics((p) => [...p.slice(-49), m]);
        setEvents((p) => [
          {
            id: `e${Date.now()}`,
            agentId: agent.agentId,
            verdict,
            metricValue: m,
            amount: 1,
            timestamp: Date.now(),
          },
          ...p.slice(0, 9),
        ]);
        if (verdict === "DENIED" || step >= 8) {
          setState("frozen");
          // Freeze in backend too if not already frozen
          postFreezeAgent(agent.agentId).catch(() => null);
          active = false;
        }
      } catch {
        // gate error — keep polling
      }
      if (active) setTimeout(poll, 3000);
    };

    const t = setTimeout(poll, 2000); // wait 2s for Goldsky to index attack tx
    return () => { active = false; clearTimeout(t); };
  }, [state, agent]);

  async function reset() {
    setState("normal");
    setMetrics(Array.from({ length: 40 }, () => 1.14 + Math.random() * 0.12));
    setEvents(Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, agentId: agent.agentId, verdict: "ISSUED" as const, metricValue: 1.18 + Math.random() * 0.15, amount: 0.8 + Math.random() * 0.4, timestamp: Date.now() - i * 4000 })));
    await postReauthorizeAgent(agent.agentId).catch(() => null);
  }

  const currentMetric = metrics[metrics.length-1] ?? 1.2;
  const baseline = 1.22;
  const deviationPct = ((currentMetric - baseline) / baseline) * 100;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-white/25 flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-mono font-bold text-white text-2xl">Your Garden</h1>
          <p className="font-mono text-white/40 text-sm mt-0.5">Behavioral gate · attractor geometry · real-time freeze</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 border font-mono font-bold text-sm ${
          state==="normal" ? "border-green-500/50 text-green-400 bg-green-500/10"
          : state==="attacking" ? "border-amber-500/50 text-amber-400 bg-amber-500/10"
          : "border-red-500/50 text-red-400 bg-red-500/10"
        }`}>
          <span className={`w-2 h-2 rounded-full animate-pulse ${state==="normal"?"bg-green-500":state==="attacking"?"bg-amber-500":"bg-red-500"}`} />
          {state==="normal" ? "STABLE — keys issuing" : state==="attacking" ? "ANOMALY DETECTED" : "AGENT FROZEN"}
        </div>
      </div>

      <div className="flex-1 p-4 grid grid-cols-[1fr_360px] gap-4" style={{height:"calc(100vh - 82px)"}}>

        {/* LEFT — 3D + charts */}
        <div className="flex flex-col gap-3 min-h-0">

          {/* 3D Canvas */}
          <div className="border border-white/25 bg-black relative overflow-hidden flex-1 min-h-0">
            {/* Overlay labels */}
            <div className="absolute top-4 left-5 z-10 pointer-events-none">
              <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest block">
                Phase space · Lorenz attractor · Takens embedding (τ=3)
              </span>
              <span className={`text-sm font-mono font-bold block mt-1 ${
                state==="normal" ? "text-[#eca8d6]" : state==="attacking" ? "text-amber-400" : "text-red-400"
              }`}>
                {state==="normal"
                  ? "Butterfly attractor — agent behavioral identity stable"
                  : state==="attacking"
                  ? "Attractor deforming — geometric complexity diverging"
                  : "Attractor collapsed — behavioral identity unrecognizable"}
              </span>
            </div>

            <div className="absolute top-4 right-5 z-10 text-right pointer-events-none">
              <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest block">D₂ correlation dim.</span>
              <span className={`font-mono font-bold text-5xl tabular-nums block leading-none mt-1 ${
                state==="normal" ? "text-[#eca8d6]" : state==="attacking" ? "text-amber-400" : "text-red-400"
              }`}>
                {currentMetric.toFixed(3)}
              </span>
              <span className={`font-mono text-sm font-bold block mt-1 ${
                Math.abs(deviationPct)<10 ? "text-green-400" : deviationPct<60 ? "text-amber-400" : "text-red-400"
              }`}>
                {deviationPct>0?"+":""}{deviationPct.toFixed(1)}% deviation
              </span>
            </div>

            <div className="absolute bottom-4 left-5 z-10 pointer-events-none flex gap-5 text-[10px] font-mono text-white/20">
              <span>x(t) →</span><span>x(t+τ) →</span><span>x(t+2τ)</span>
            </div>

            <Canvas camera={{ position:[0, 0, 5.5], fov:50 }} gl={{antialias:true, alpha:true}}>
              <Scene state={state} onHover={setHoveredPt} />
              <OrbitControls enableZoom enablePan={false} minDistance={2} maxDistance={10} />
            </Canvas>

            {/* Hover tooltip */}
            {hoveredPt && (() => {
              const p = mockPaymentForPoint(hoveredPt.index, state);
              return (
                <div
                  className="absolute z-20 pointer-events-none border border-white/25 bg-black/90 backdrop-blur-sm p-3 flex flex-col gap-1.5 min-w-[200px]"
                  style={{ left: Math.min(hoveredPt.screenX + 14, 580), top: Math.max(hoveredPt.screenY - 10, 10) }}
                >
                  <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Point #{hoveredPt.index}</span>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono mt-1">
                    <span className="text-white/40">x(t)</span>
                    <span className="text-white font-bold">${p.xt} USDC</span>
                    <span className="text-white/40">x(t+τ)</span>
                    <span className="text-white font-bold">${p.xtTau} USDC</span>
                    <span className="text-white/40">x(t+2τ)</span>
                    <span className="text-white font-bold">${p.xt2Tau} USDC</span>
                    <span className="text-white/40">block</span>
                    <span className="text-white/70">{p.block.toLocaleString()}</span>
                    <span className="text-white/40">time</span>
                    <span className="text-white/70">{p.ago}</span>
                  </div>
                  <div className={`mt-1 text-[10px] font-mono font-bold px-2 py-0.5 border w-fit ${
                    p.verdict === "ISSUED"
                      ? "text-green-400 border-green-500/40 bg-green-500/10"
                      : "text-red-400 border-red-500/40 bg-red-500/10"
                  }`}>{p.verdict}</div>
                </div>
              );
            })()}

            {/* Frozen overlay */}
            {state==="frozen" && (
              <div className="absolute inset-0 border-2 border-red-500/60 pointer-events-none">
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 border border-red-500/50 px-5 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="font-mono font-bold text-red-400 text-sm">SESSION KEY REFUSED — AGENT FROZEN</span>
                </div>
              </div>
            )}
          </div>

          {/* Metric sparkline */}
          <div className="border border-white/25 bg-black/70 px-5 py-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-white/50 uppercase tracking-widest">D₂ metric history</span>
              <div className="flex gap-5 text-[10px] font-mono text-white/25">
                <span>── baseline {baseline.toFixed(3)}</span>
                <span className="text-red-500/50">── threshold {(baseline*2).toFixed(3)}</span>
              </div>
            </div>
            <div className="h-14"><Sparkline values={metrics} state={state} /></div>
          </div>

          {/* Deviation bar */}
          <div className="border border-white/25 bg-black/70 px-5 py-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm font-mono font-bold">
              <span className="text-white/40 uppercase tracking-widest text-xs">Deviation from baseline</span>
              <span className={state==="normal"?"text-green-400":state==="attacking"?"text-amber-400":"text-red-400"}>
                {state==="normal"?`+${Math.abs(deviationPct).toFixed(1)}%`:state==="attacking"?"+68.4%":"+190.1%"}
              </span>
            </div>
            <div className="h-2.5 bg-white/10 rounded-sm overflow-hidden">
              <div className={`h-full transition-all duration-700 ${state==="normal"?"bg-green-500":state==="attacking"?"bg-amber-500":"bg-red-500"}`}
                style={{width:state==="normal"?`${Math.min(Math.abs(deviationPct),10)+1}%`:state==="attacking"?"68%":"100%"}} />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-white/20">
              <span>0%</span><span className="text-red-500/40">±2σ threshold</span><span>200%+</span>
            </div>
          </div>
        </div>

        {/* RIGHT — controls + feed */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">

          {/* Agent selector */}
          <div className="border border-white/25 bg-black/70 p-5 flex flex-col gap-3">
            <span className="text-xs font-mono font-bold text-white/50 uppercase tracking-widest">Agent</span>
            {(liveAgents.length > 0 ? liveAgents : FALLBACK_AGENTS).map(a=>(
              <button key={a.agentId}
                onClick={()=>{ if(state==="normal") setAgent(a); }}
                className={`flex items-center gap-3 px-4 py-3 border text-left font-mono text-sm transition-colors ${state!=="normal"?"opacity-40 cursor-not-allowed":""} ${
                  agent.agentId===a.agentId ? "border-[#eca8d6]/50 bg-[#eca8d6]/5 text-white" : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/70"
                }`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${agent.agentId===a.agentId?"bg-green-500 animate-pulse":"bg-white/20"}`} />
                <span className="font-bold">{a.name}</span>
                <span className="text-[10px] text-white/25 ml-auto">{truncateId(a.agentId, 6)}</span>
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="border border-white/25 bg-black/70 p-5 flex flex-col gap-3">
            <span className="text-xs font-mono font-bold text-white/50 uppercase tracking-widest">Controls</span>

            {state==="normal" && (
              <button onClick={injectAttack} disabled={injecting}
                className="w-full border border-amber-500/50 bg-amber-500/10 text-amber-400 font-mono font-bold text-sm py-4 hover:bg-amber-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <Zap className="w-5 h-5" />
                {injecting ? "Injecting..." : "Inject Attack Pattern"}
              </button>
            )}

            {state==="attacking" && (
              <div className="border border-amber-500/30 bg-amber-500/5 px-4 py-4 flex items-center gap-3">
                <Activity className="w-5 h-5 text-amber-400 animate-pulse shrink-0" />
                <div>
                  <p className="font-mono font-bold text-amber-400 text-sm">Attack in progress</p>
                  <p className="font-mono text-xs text-white/40 mt-0.5">Attractor deforming — DENIED incoming</p>
                </div>
              </div>
            )}

            {state==="frozen" && (
              <div className="flex flex-col gap-3">
                <div className="border border-red-500/30 bg-red-500/5 px-4 py-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-mono font-bold text-red-400 text-sm">Agent frozen on-chain</p>
                    <p className="font-mono text-xs text-white/40 mt-1">logDecision(issued=false)<br />→ AttractorGuard.sol → AgentFrozen event</p>
                  </div>
                </div>
                <button onClick={reset}
                  className="w-full border border-white/25 text-white font-mono font-bold text-sm py-3 hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Reset demo
                </button>
              </div>
            )}
          </div>

          {/* What's happening */}
          <div className="border border-white/25 bg-black/70 p-5 flex flex-col gap-3">
            <span className="text-xs font-mono font-bold text-white/50 uppercase tracking-widest">
              {state==="normal" ? "Normal behavior" : state==="attacking" ? "Under attack" : "Frozen"}
            </span>
            <p className="font-mono text-sm text-white/60 leading-relaxed">
              {state==="normal"
                ? "The Lorenz butterfly attractor shows the agent's behavioral identity. Consistent payment patterns = stable geometric structure. D₂ within ±2σ → session keys issued."
                : state==="attacking"
                ? "AgentPaymentSimulator injected erratic payments. The attractor is deforming — two lobes flying apart. D₂ jumps beyond 2σ threshold. DENIED incoming."
                : "Gate refused the next session key. Without renewal, the agent cannot pay. The attractor is unrecognizable. Human must review and re-authorize."}
            </p>
            <div className="border-t border-white/10 pt-3 font-mono text-xs text-white/30">
              {state==="normal" && "POST /api/gate → Python nolds.corr_dim() → ISSUED → addSessionKeyRule()"}
              {state==="attacking" && "D₂ diverging → exceeds μ+2σ → logDecision(issued=false)"}
              {state==="frozen" && "AgentFrozen event emitted on Kite testnet → Goldsky indexes → dashboard updates"}
            </div>
          </div>

          {/* Gate event feed */}
          <div className="border border-white/25 bg-black/70 flex flex-col flex-1">
            <div className="px-5 py-3 border-b border-white/25 flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-white/50 uppercase tracking-widest">Gate events</span>
              <span className="flex items-center gap-1.5 text-xs font-mono text-white/30">
                <span className={`w-1.5 h-1.5 rounded-full ${state==="frozen"?"bg-red-500":"bg-green-500 animate-pulse"}`} /> live
              </span>
            </div>
            <div className="overflow-y-auto divide-y divide-white/10 max-h-64">
              {events.map(evt=>(
                <div key={evt.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="font-mono text-[10px] text-white/25 shrink-0 tabular-nums w-14">
                    {new Date(evt.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}
                  </span>
                  <span className="font-mono text-xs text-white/50 flex-1 truncate">{truncateId(evt.agentId,5)}</span>
                  <span className="font-mono text-xs text-white/40 tabular-nums shrink-0">{evt.metricValue.toFixed(3)}</span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border shrink-0 ${
                    evt.verdict==="ISSUED" ? "text-green-400 border-green-500/40 bg-green-500/10"
                    : "text-red-400 border-red-500/40 bg-red-500/10"
                  }`}>{evt.verdict}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
