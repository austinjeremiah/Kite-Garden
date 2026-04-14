"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, AlertTriangle, RefreshCw, XCircle } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  fetchAgent,
  fetchAgentDecisions,
  fetchAgentPayments,
  fromWei,
  type GoldskyDecision,
  type GoldskyPayment,
} from "@/lib/goldsky";
import { explorerTx, explorerAddress, KITE_EXPLORER } from "@/lib/config";
import { truncateId } from "@/lib/mock-data";

// ─── Person 2 mock — session key (swap when backend ready) ───────────────────
// Backend will provide: active session key address + expiry per agent
function getMockSessionKey(status: string) {
  if (status !== "active") return null;
  return {
    address: "0xA3f2...9c14",
    valueLimit: "50.00",
    functionSelector: "0xa9059cbb",
    expiresAt: new Date(Date.now() + 38_000).toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function deriveStatus(
  isRevoked: boolean,
  lastDecision: GoldskyDecision | undefined
): "active" | "frozen" | "revoked" {
  if (isRevoked) return "revoked";
  if (lastDecision && !lastDecision.issued) return "frozen";
  return "active";
}

// ─── Session key countdown ────────────────────────────────────────────────────

function SessionCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const calc = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(diff);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const pct = (remaining / 60) * 100;
  const color = remaining > 20 ? "text-green-400" : remaining > 8 ? "text-amber-400" : "text-red-400";
  const barColor = remaining > 20 ? "bg-green-500" : remaining > 8 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-white/40">Expires in</span>
        <span className={`font-mono font-bold text-lg tabular-nums ${color}`}>{remaining}s</span>
      </div>
      <div className="h-1 w-full bg-white/10">
        <div
          className={`h-full transition-all duration-1000 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Metric chart ─────────────────────────────────────────────────────────────

function MetricChart({ data, mean, stdDev, label }: {
  data: { index: number; value: number }[];
  mean: number;
  stdDev: number;
  label: string;
}) {
  const ceiling = parseFloat((mean + stdDev * 2).toFixed(4));
  const floor   = parseFloat((mean - stdDev * 2).toFixed(4));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold text-white/50 uppercase tracking-widest">{label}</span>
        <div className="flex items-center gap-4 text-[10px] font-mono text-white/30">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-px bg-white/40" /> baseline {mean.toFixed(4)}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-px bg-red-500/70" /> ±2σ {ceiling.toFixed(4)}
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="index" tick={false} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "#000", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 0, fontFamily: "monospace", fontSize: 11 }}
            labelStyle={{ color: "rgba(255,255,255,0.4)" }}
            itemStyle={{ color: "#fff" }}
            formatter={(v: number) => [v.toFixed(5), label]}
          />
          <ReferenceLine y={mean}    stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" />
          <ReferenceLine y={ceiling} stroke="rgba(239,68,68,0.6)"   strokeDasharray="4 4" />
          <ReferenceLine y={floor}   stroke="rgba(239,68,68,0.3)"   strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#eca8d6"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: "#eca8d6" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Amount chart ─────────────────────────────────────────────────────────────

function AmountChart({ data }: { data: { index: number; amount: number }[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-mono font-bold text-white/50 uppercase tracking-widest">Raw tx amounts (USDC)</span>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="index" tick={false} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "#000", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 0, fontFamily: "monospace", fontSize: 11 }}
            itemStyle={{ color: "#fff" }}
            formatter={(v: number) => [`${v.toFixed(2)} USDC`, "amount"]}
          />
          <Line type="monotone" dataKey="amount" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const router = useRouter();
  const decoded = decodeURIComponent(agentId);

  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ["agent", decoded],
    queryFn: () => fetchAgent(decoded),
    refetchInterval: 10_000,
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ["agentDecisions", decoded],
    queryFn: () => fetchAgentDecisions(decoded),
    refetchInterval: 10_000,
    enabled: !!agent,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["agentPayments", decoded],
    queryFn: () => fetchAgentPayments(decoded),
    refetchInterval: 10_000,
    enabled: !!agent,
  });

  if (agentLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="font-mono text-white/30 text-sm animate-pulse">Loading agent...</span>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <span className="font-mono text-white/40 text-sm">Agent not found</span>
        <button
          onClick={() => router.push("/dashboard")}
          className="font-mono text-xs text-white/30 hover:text-white underline"
        >
          ← Back to dashboard
        </button>
      </div>
    );
  }

  // ── Derive view model from Goldsky data ──────────────────────────────────
  // decisions come back ASC by timestamp (last = most recent)
  const sortedDecisions = [...decisions].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const lastDecision = sortedDecisions[sortedDecisions.length - 1];

  const status = deriveStatus(agent.isRevoked, lastDecision);

  // Metric history for chart
  const metricHistory = sortedDecisions.map((d, i) => ({
    index: i,
    value: fromWei(d.metricValue),
  }));

  // Baseline: use baselineValue from last decision, fall back to mean of metricValues
  const metricValues = sortedDecisions.map((d) => fromWei(d.metricValue));
  const baselineMean = lastDecision
    ? fromWei(lastDecision.baselineValue)
    : metricValues.length > 0
    ? metricValues.reduce((a, b) => a + b, 0) / metricValues.length
    : 0;

  const baselineStdDev = computeStdDev(metricValues);
  const currentMetric = lastDecision ? fromWei(lastDecision.metricValue) : null;
  const deviationPct = currentMetric != null && baselineMean !== 0
    ? ((currentMetric - baselineMean) / baselineMean) * 100
    : 0;

  // Mode based on tx count
  const txCount = Number(agent.transactionCount);
  const mode = txCount >= 200 ? "mature" : "early";
  const metricLabel = mode === "mature" ? "D₂ corr_dim" : "SampEn";

  // Amount data for chart (payments come back DESC, reverse for chart)
  const sortedPayments = [...payments].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const amountData = sortedPayments.map((p, i) => ({
    index: i,
    amount: Number(p.amount) / 1e6,
  }));

  // Tx table: cross-reference payments with decisions
  const decisionByTxHash = new Map(decisions.map((d) => [d.transactionHash, d]));
  const txRows = sortedPayments.map((p, i) => {
    const dec = decisionByTxHash.get(p.transactionHash);
    const verdict: "ISSUED" | "DENIED" | "ATTACK" | "SEEDED" =
      p.paymentType === "ATTACK" ? "ATTACK"
      : p.paymentType === "SEEDED" ? "SEEDED"
      : dec ? (dec.issued ? "ISSUED" : "DENIED")
      : "ISSUED";
    const prevTs = i > 0 ? Number(sortedPayments[i - 1].timestamp) : null;
    const timeDelta = prevTs ? Number(p.timestamp) - prevTs : 0;
    return {
      id: p.id,
      blockNumber: Number(p.blockNumber),
      amount: Number(p.amount) / 1e6,
      to: p.to,
      timeDelta,
      verdict,
      txHash: p.transactionHash,
    };
  }).reverse(); // show newest first

  // Freeze event from last denied decision
  const freezeDecision = status === "frozen" ? lastDecision : null;

  // Session key — mock until Person 2 ready
  const sessionKey = getMockSessionKey(status);

  // Ceiling for display
  const ceiling = baselineMean + baselineStdDev * 2;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-white/25 flex items-center gap-4 shrink-0">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-white/40 hover:text-white transition-colors font-mono text-xs"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <span className="text-white/20">/</span>
        <span className="font-mono text-white text-sm font-bold">
          {agent.name ?? truncateId(agent.id, 8)}
        </span>

        {/* Status badge */}
        <span className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-3 py-1 border ${
          status === "active"
            ? "border-green-500/50 text-green-400 bg-green-500/10"
            : status === "frozen"
            ? "border-red-500/50 text-red-400 bg-red-500/10"
            : "border-white/20 text-white/40"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            status === "active" ? "bg-green-500" : status === "frozen" ? "bg-red-500" : "bg-white/20"
          }`} />
          {status.toUpperCase()}
        </span>
      </div>

      <div className="flex-1 p-8 flex flex-col gap-6">

        {/* Agent header info */}
        <div className="border border-white/25 bg-black/40 backdrop-blur-sm p-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Agent ID</span>
            <span className="font-mono text-xs text-white/70 break-all">{truncateId(agent.id, 10)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Owner</span>
            <a
              href={explorerAddress(agent.owner)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-[#eca8d6]/70 hover:text-[#eca8d6] flex items-center gap-1 transition-colors truncate"
            >
              {truncateId(agent.owner, 8)} <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Mode</span>
            <span className="font-mono text-xs text-white/70">
              {mode === "mature"
                ? `mature · corr_dim (${txCount} tx)`
                : `early · sampen (${txCount} tx)`}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Last decision</span>
            {lastDecision ? (
              <a
                href={explorerTx(lastDecision.transactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-[#eca8d6]/70 hover:text-[#eca8d6] flex items-center gap-1 transition-colors"
              >
                {truncateId(lastDecision.transactionHash, 8)} <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            ) : (
              <span className="font-mono text-xs text-white/30">No decisions yet</span>
            )}
          </div>
        </div>

        {/* Freeze alert */}
        {status === "frozen" && freezeDecision && (
          <div className="border border-red-500/40 bg-red-500/10 p-5 flex items-start gap-4">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-mono font-bold text-red-400 text-sm mb-1">Agent frozen — behavioral anomaly detected</p>
              <p className="font-mono text-xs text-white/50">
                Metric{" "}
                <span className="text-red-400 font-bold">{fromWei(freezeDecision.metricValue).toFixed(5)}</span>
                {" "}exceeded threshold{" "}
                <span className="text-white/70">{ceiling.toFixed(5)}</span>
                {" "}at {new Date(Number(freezeDecision.timestamp) * 1000).toLocaleTimeString()}
              </p>
            </div>
            <a
              href={explorerTx(freezeDecision.transactionHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-red-400/70 hover:text-red-400 flex items-center gap-1 shrink-0"
            >
              AgentFrozen event <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Main two-column grid */}
        <div className="grid grid-cols-[55fr_45fr] gap-6">

          {/* LEFT — charts + current metric */}
          <div className="flex flex-col gap-4">

            {/* Current metric large */}
            <div className="border border-white/25 bg-black/40 backdrop-blur-sm p-6 flex items-start gap-8">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">{metricLabel}</span>
                <span className={`text-5xl font-mono font-bold tabular-nums ${
                  currentMetric == null ? "text-white/20" :
                  status === "frozen" ? "text-red-400" :
                  Math.abs(deviationPct) < 20 ? "text-green-400" : "text-amber-400"
                }`}>
                  {currentMetric != null ? currentMetric.toFixed(4) : "—"}
                </span>
              </div>
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-white/40">baseline</span>
                  <span className="text-white/70 font-semibold">{baselineMean.toFixed(4)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-white/40">±2σ range</span>
                  <span className="text-white/70 font-semibold">
                    {(baselineMean - baselineStdDev * 2).toFixed(4)} – {ceiling.toFixed(4)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-white/40">deviation</span>
                  <span className={`font-bold ${
                    Math.abs(deviationPct) < 20 ? "text-green-400" :
                    Math.abs(deviationPct) < 50 ? "text-amber-400" : "text-red-400"
                  }`}>
                    {deviationPct > 0 ? "+" : ""}{deviationPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Metric chart */}
            <div className="border border-white/25 bg-black/40 backdrop-blur-sm p-6">
              {metricHistory.length > 0 ? (
                <MetricChart
                  data={metricHistory}
                  mean={baselineMean}
                  stdDev={baselineStdDev}
                  label={metricLabel}
                />
              ) : (
                <div className="flex items-center justify-center h-[160px]">
                  <span className="font-mono text-xs text-white/25 animate-pulse">Waiting for gate decisions...</span>
                </div>
              )}
            </div>

            {/* Amount chart */}
            <div className="border border-white/25 bg-black/40 backdrop-blur-sm p-6">
              {amountData.length > 0 ? (
                <AmountChart data={amountData} />
              ) : (
                <div className="flex items-center justify-center h-[100px]">
                  <span className="font-mono text-xs text-white/25 animate-pulse">Waiting for payments...</span>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — tx table + session key */}
          <div className="flex flex-col gap-4">

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Sessions issued", value: Number(agent.sessionsIssued), color: "text-green-400" },
                { label: "Sessions denied", value: Number(agent.sessionsDenied), color: "text-red-400" },
                { label: "Attacks detected", value: Number(agent.attacksDetected), color: "text-amber-400" },
              ].map((s) => (
                <div key={s.label} className="border border-white/25 bg-black/40 backdrop-blur-sm p-4 flex flex-col gap-1">
                  <span className="text-[9px] font-mono font-bold text-white/40 uppercase tracking-widest leading-tight">{s.label}</span>
                  <span className={`font-mono font-bold text-2xl tabular-nums ${s.color}`}>{s.value}</span>
                </div>
              ))}
            </div>

            {/* Session key panel */}
            <div className="border border-white/25 bg-black/40 backdrop-blur-sm p-6 flex flex-col gap-4">
              <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">
                Session key
                <span className="ml-2 text-white/20 normal-case font-normal">(mock — Person 2 pending)</span>
              </span>

              {sessionKey ? (
                <>
                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="flex flex-col gap-1">
                      <span className="text-white/40">Address</span>
                      <span className="text-white/70 font-semibold truncate">{sessionKey.address}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-white/40">Value limit</span>
                      <span className="text-white/70 font-semibold">{sessionKey.valueLimit} USDC</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-white/40">Selector</span>
                      <span className="text-white/70 font-semibold">{sessionKey.functionSelector}</span>
                    </div>
                  </div>
                  <SessionCountdown expiresAt={sessionKey.expiresAt} />
                  <button className="w-full border border-red-500/30 text-red-400 font-mono font-bold text-xs py-2.5 hover:bg-red-500/10 transition-colors">
                    Force Freeze
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-red-400 font-semibold">No active session key</span>
                  <span className="font-mono text-[10px] text-white/30">Agent is frozen — re-authorize to resume</span>
                </div>
              )}
            </div>

            {/* Re-authorize panel — only when frozen */}
            {status === "frozen" && (
              <div className="border border-red-500/30 bg-red-500/5 p-5 flex flex-col gap-4">
                <span className="text-[10px] font-mono font-bold text-red-400/70 uppercase tracking-widest">Human review required</span>
                <p className="font-mono text-xs text-white/50 leading-relaxed">
                  Reset the behavioral baseline and commit a new hash on-chain to re-authorize, or permanently revoke this agent.
                </p>
                <button className="w-full border border-white/25 text-white font-mono font-bold text-xs py-2.5 hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5" /> Reset baseline &amp; re-authorize
                </button>
                <button className="w-full border border-red-500/40 text-red-400 font-mono font-bold text-xs py-2.5 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2">
                  <XCircle className="w-3.5 h-3.5" /> Permanently revoke agent
                </button>
              </div>
            )}

            {/* Transaction history */}
            <div className="border border-white/25 bg-black/40 backdrop-blur-sm flex flex-col flex-1">
              <div className="px-5 py-3 border-b border-white/25 grid grid-cols-[70px_60px_70px_50px_70px] gap-2 items-center">
                <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Block</span>
                <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">USDC</span>
                <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">To</span>
                <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Δt</span>
                <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Verdict</span>
              </div>
              <div className="overflow-y-auto divide-y divide-white/10 flex-1 max-h-[400px]">
                {txRows.length === 0 ? (
                  <div className="flex items-center justify-center h-20">
                    <span className="font-mono text-xs text-white/25 animate-pulse">No transactions yet...</span>
                  </div>
                ) : (
                  txRows.map((tx) => (
                    <a
                      key={tx.id}
                      href={explorerTx(tx.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-2.5 grid grid-cols-[70px_60px_70px_50px_70px] gap-2 items-center hover:bg-white/[0.03] transition-colors"
                    >
                      <span className="font-mono text-[10px] text-white/40 tabular-nums">{tx.blockNumber.toLocaleString()}</span>
                      <span className="font-mono text-xs font-semibold text-white/80 tabular-nums">{tx.amount.toFixed(2)}</span>
                      <span className="font-mono text-[10px] text-white/40 truncate">{truncateId(tx.to, 4)}</span>
                      <span className="font-mono text-[10px] text-white/40 tabular-nums">{tx.timeDelta}s</span>
                      <span className={`font-mono text-[10px] font-bold ${
                        tx.verdict === "ISSUED"  ? "text-green-400" :
                        tx.verdict === "DENIED"  ? "text-red-400"   :
                        tx.verdict === "ATTACK"  ? "text-amber-400" : "text-white/30"
                      }`}>
                        {tx.verdict}
                      </span>
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
