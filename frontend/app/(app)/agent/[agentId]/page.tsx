"use client";

import { useParams, useRouter } from "next/navigation";
import { useAsyncPoll } from "@/lib/use-async-poll";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, AlertTriangle, RefreshCw, XCircle, Shield } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { type AgentDetail, truncateId, getStatusColor } from "@/lib/mock-data";
import {
  fetchAgentDetailFromApi,
  KITE_AA_SDK_DOC_URL,
  KITE_CORE_CONCEPTS_DOC_URL,
  postGate,
  postReauthorizeAgent,
  postRevokeAgent,
  postFreezeAgent,
  type GateResponse,
} from "@/lib/api";
import { fetchAgentPayments, type GoldskyPayment } from "@/lib/goldsky";
import { explorerTx } from "@/lib/config";
import { useWeb3Auth } from "@web3auth/modal/react";
import { walletRevoke, walletReauthorize, walletTransferNative } from "@/lib/wallet-tx";

/** Extract a friendly error message from a backend JSON error or raw revert reason. */
function prettyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  // Backend response may be a JSON blob — try to extract { error: "..." }
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) {
      const msg = String(parsed.error);
      const reasonMatch = msg.match(/execution reverted:\s*\\?"([^"\\]+)\\?"/);
      if (reasonMatch) return reasonMatch[1];
      return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
    }
  } catch { /* not json */ }
  // Plain revert reason inside the string
  const m = raw.match(/execution reverted:\s*"?([^"\\]+)"?/);
  if (m) return m[1];
  return raw.length > 160 ? raw.slice(0, 160) + "…" : raw;
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

  // Session keys are valid for 24h (86400s); show progress over the full window, capped to [0, 100]
  const total = 86400;
  const pct = Math.min(100, Math.max(0, (remaining / total) * 100));
  const color = remaining > 600 ? "text-green-400" : remaining > 60 ? "text-amber-400" : "text-red-400";
  const barColor = remaining > 600 ? "bg-green-500" : remaining > 60 ? "bg-amber-500" : "bg-red-500";

  function formatRemaining(s: number) {
    if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${s}s`;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-white/40">Expires in</span>
        <span className={`font-mono font-bold text-lg tabular-nums ${color}`}>{formatRemaining(remaining)}</span>
      </div>
      <div className="h-1 w-full bg-white/10 overflow-hidden">
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
  const ceiling = parseFloat((mean + stdDev * 2).toFixed(3));
  const floor = parseFloat((mean - stdDev * 2).toFixed(3));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold text-white/50 uppercase tracking-widest">{label}</span>
        <div className="flex items-center gap-4 text-[10px] font-mono text-white/30">
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-px bg-white/40" /> baseline {mean.toFixed(3)}</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-px bg-red-500/70" /> threshold {ceiling.toFixed(3)}</span>
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
            formatter={(v: number) => [v.toFixed(4), label]}
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
  const { provider: walletProvider } = useWeb3Auth();
  const [gateRefresh, setGateRefresh] = useState(0);
  const [gateAmount, setGateAmount] = useState("0.001");
  const [gateDestination, setGateDestination] = useState("0xe01Add0c3640a8314132bAF491d101A38ffEF4f0");
  const [gateBusy, setGateBusy] = useState(false);
  const [gateResult, setGateResult] = useState<GateResponse | null>(null);
  const [gateErr, setGateErr] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [paymentTxHash, setPaymentTxHash] = useState<string | null>(null);
  const [paymentPending, setPaymentPending] = useState(false);
  const [payments, setPayments] = useState<GoldskyPayment[]>([]);

  useEffect(() => {
    if (!agentId) return;
    fetchAgentPayments(agentId).then(setPayments).catch(() => null);
  }, [agentId]);

  const { data: detail, isLoading, isError, error } = useAsyncPoll(
    [agentId, gateRefresh],
    () => (agentId ? fetchAgentDetailFromApi(agentId) : Promise.resolve(null)),
    agentId ? 10_000 : null
  );

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 px-8">
        <span className="font-mono text-red-400/80 text-sm text-center max-w-lg">
          {String(error)}
        </span>
        <button onClick={() => router.push("/dashboard")} className="font-mono text-xs text-white/30 hover:text-white underline">
          ← Back to dashboard
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="font-mono text-white/30 text-sm animate-pulse">Loading agent...</span>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <span className="font-mono text-white/40 text-sm">Agent not found</span>
        <button onClick={() => router.push("/dashboard")} className="font-mono text-xs text-white/30 hover:text-white underline">
          ← Back to dashboard
        </button>
      </div>
    );
  }

  const { agent, metricHistory, txHistory, sessionKey, freezeReason } = detail;
  const ceiling = parseFloat((agent.baselineMean + agent.baselineStdDev * 2).toFixed(3));
  const hasMetric = agent.currentMetric > 0;
  const metricLabel = agent.mode === "mature" ? "D₂ corr_dim" : "SampEn";
  const amountData = txHistory.map((tx, i) => ({ index: i, amount: tx.amount }));

  async function runGate() {
    setGateErr(null);
    setGateResult(null);
    setPaymentTxHash(null);
    const n = Number(gateAmount);
    if (!Number.isFinite(n) || !gateDestination.trim()) {
      setGateErr("Enter a valid amount and destination address.");
      return;
    }
    setGateBusy(true);
    try {
      const res = await postGate({
        agentId: agent.agentId,
        amount: n,
        destination: gateDestination.trim(),
      });
      setGateResult(res);
      setGateRefresh((x) => x + 1);

      // On ISSUED: fire a real native KITE transfer from the connected wallet
      if (res.verdict === "ISSUED") {
        setPaymentPending(true);
        const txHash = await walletTransferNative(walletProvider, gateDestination.trim(), n);
        if (txHash) setPaymentTxHash(txHash);
        setPaymentPending(false);
      }
    } catch (e) {
      setGateErr(prettyError(e));
    } finally {
      setGateBusy(false);
    }
  }

  async function reauthorize() {
    setActionErr(null);
    setActionBusy(true);
    try {
      const walletTxHash = await walletReauthorize(walletProvider, agent.agentId);
      await postReauthorizeAgent(agent.agentId, walletTxHash);
      setGateRefresh((x) => x + 1);
    } catch (e) {
      setActionErr(prettyError(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function revoke() {
    setActionErr(null);
    setActionBusy(true);
    try {
      const walletTxHash = await walletRevoke(walletProvider, agent.agentId);
      await postRevokeAgent(agent.agentId, walletTxHash);
      setGateRefresh((x) => x + 1);
    } catch (e) {
      setActionErr(prettyError(e));
    } finally {
      setActionBusy(false);
    }
  }

  async function freeze() {
    setActionErr(null);
    setActionBusy(true);
    try {
      await postFreezeAgent(agent.agentId);
      setGateRefresh((x) => x + 1);
    } catch (e) {
      setActionErr(prettyError(e));
    } finally {
      setActionBusy(false);
    }
  }

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
        <span className="font-mono text-white text-sm font-bold">{agent.name}</span>

        {/* Status badge */}
        <span className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-3 py-1 border ${
          agent.status === "active"
            ? "border-green-500/50 text-green-400 bg-green-500/10"
            : agent.status === "frozen"
            ? "border-red-500/50 text-red-400 bg-red-500/10"
            : "border-white/20 text-white/40"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(agent.status)}`} />
          {agent.status.toUpperCase()}
        </span>
      </div>

      <div className="flex-1 p-8 flex flex-col gap-6">

        {/* Agent header info */}
        <div className="border border-white/25 bg-black/40 backdrop-blur-sm p-6 flex flex-col gap-5">

          {/* Passport DID banner — shown when registered with Kite Passport */}
          {agent.passportDid && (
            <div className="border border-[#eca8d6]/20 bg-[#eca8d6]/5 px-4 py-3 flex items-center gap-3">
              <Shield className="w-4 h-4 text-[#eca8d6]/60 shrink-0" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[9px] font-mono font-bold text-[#eca8d6]/50 uppercase tracking-widest">Kite Passport DID</span>
                <code className="font-mono text-xs text-[#eca8d6] break-all">{agent.passportDid}</code>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Agent ID (bytes32)</span>
              <span className="font-mono text-xs text-white/70 break-all">{truncateId(agent.agentId, 10)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Owner</span>
              <span className="font-mono text-xs text-white/70 break-all">{truncateId(agent.ownerAddress, 8)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Mode</span>
              <span className="font-mono text-xs text-white/70">
                {agent.mode === "mature" ? `mature · corr_dim (${agent.transactionCount} tx)` : `early · sampen (${agent.transactionCount} tx)`}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Baseline hash</span>
              {agent.baselineHash && agent.baselineHash !== "—" ? (
                agent.baselineExplorerLink ? (
                  <a
                    href={agent.baselineExplorerLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-[#eca8d6] hover:text-[#eca8d6]/80 flex items-center gap-1 transition-colors break-all"
                  >
                    {agent.baselineHash.slice(0, 14)}… <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : (
                  <span className="font-mono text-xs text-[#eca8d6]/70 break-all">
                    {agent.baselineHash.slice(0, 14)}…
                    <span className="text-white/25 text-[9px] ml-1">(pending explorer link)</span>
                  </span>
                )
              ) : (
                <span className="font-mono text-xs text-white/25 italic">
                  pending first gate call
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Freeze alert */}
        {agent.status === "frozen" && freezeReason && (
          <div className="border border-white/25 bg-black/70 backdrop-blur-sm p-5 flex items-start gap-4">
            <AlertTriangle className="w-5 h-5 text-red-300 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-mono font-bold text-white text-sm mb-1">Agent frozen — behavioral anomaly detected</p>
              <p className="font-mono text-xs text-white/75">
                Metric <span className="text-red-300 font-bold">{freezeReason.metricValue}</span> exceeded threshold <span className="text-white font-semibold">{freezeReason.threshold}</span> at {new Date(freezeReason.timestamp).toLocaleTimeString()}
              </p>
            </div>
            <a
              href={freezeReason.explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-white/70 hover:text-white flex items-center gap-1 shrink-0"
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
                  !hasMetric ? "text-white/40" :
                  agent.status === "frozen" ? "text-red-400" :
                  Math.abs(agent.deviationPct) < 20 ? "text-green-400" : "text-amber-400"
                }`}>
                  {hasMetric ? agent.currentMetric.toFixed(3) : "—"}
                </span>
              </div>
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-white/40">baseline</span>
                  <span className="text-white/70 font-semibold">{agent.baselineMean.toFixed(3)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-white/40">±2σ range</span>
                  <span className="text-white/70 font-semibold">
                    {(agent.baselineMean - agent.baselineStdDev * 2).toFixed(3)} – {ceiling.toFixed(3)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-white/40">deviation</span>
                  {hasMetric ? (
                    <span className={`font-bold ${
                      Math.abs(agent.deviationPct) < 20 ? "text-green-400" :
                      Math.abs(agent.deviationPct) < 50 ? "text-amber-400" : "text-red-400"
                    }`}>
                      {agent.deviationPct > 0 ? "+" : ""}{agent.deviationPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-white/40">not measured yet</span>
                  )}
                </div>
              </div>
            </div>

            {/* Metric chart */}
            <div className="border border-white/25 bg-black/40 backdrop-blur-sm p-6">
              <MetricChart
                data={metricHistory}
                mean={agent.baselineMean}
                stdDev={agent.baselineStdDev}
                label={metricLabel}
              />
            </div>

            {/* Amount chart */}
            <div className="border border-white/25 bg-black/40 backdrop-blur-sm p-6">
              <AmountChart data={amountData} />
            </div>
          </div>

          {/* RIGHT — gate + session key + tx */}
          <div className="flex flex-col gap-4">

            {/* Behavioral gate */}
            <div className="border border-[#eca8d6]/25 bg-black/40 backdrop-blur-sm p-6 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#eca8d6]" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-widest">
                  Request a session key
                </span>
              </div>
              <p className="text-xs font-mono text-white/55 leading-relaxed">
                Simulate a payment. The gate checks the agent's behavioral fingerprint and either issues a session key or freezes the agent.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider">Amount</span>
                  <div className="flex items-center bg-black/50 border border-white/15 focus-within:border-white/40 transition-colors">
                    <input
                      value={gateAmount}
                      onChange={(e) => setGateAmount(e.target.value)}
                      className="flex-1 bg-transparent px-3 py-2 font-mono text-sm text-white outline-none"
                      inputMode="decimal"
                    />
                    <span className="px-3 py-2 border-l border-white/15 font-mono text-xs text-white/50">KITE</span>
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono text-white/60 uppercase tracking-wider">Destination</span>
                  <input
                    value={gateDestination}
                    onChange={(e) => setGateDestination(e.target.value)}
                    className="bg-black/50 border border-white/15 focus:border-white/40 transition-colors px-3 py-2 font-mono text-[11px] text-white outline-none"
                    placeholder="0x…"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void runGate()}
                disabled={gateBusy || agent.status === "revoked"}
                className="border border-[#eca8d6]/50 bg-[#eca8d6]/15 text-[#eca8d6] font-mono font-bold text-sm py-3 hover:bg-[#eca8d6]/25 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {gateBusy ? "Checking behavior…" : "Run gate →"}
              </button>
              {gateErr && (
                <p className="text-[10px] font-mono text-red-400/90 whitespace-pre-wrap break-words">{gateErr}</p>
              )}
              {gateResult && (
                <div className="text-[10px] font-mono space-y-1 border border-white/10 p-2 bg-black/30">
                  <p>
                    <span className="text-white/40">verdict</span>{" "}
                    <span
                      className={
                        gateResult.verdict === "ISSUED"
                          ? "text-green-400 font-bold"
                          : gateResult.verdict === "DENIED"
                            ? "text-red-400 font-bold"
                            : "text-amber-400"
                      }
                    >
                      {gateResult.verdict}
                    </span>
                  </p>
                  {gateResult.reason && (
                    <p className="text-white/45 break-words">
                      <span className="text-white/30">reason</span> {gateResult.reason}
                    </p>
                  )}
                  {gateResult.sessionKey && (
                    <p className="text-white/55 break-all">
                      <span className="text-white/30">sessionKey</span> {gateResult.sessionKey}
                    </p>
                  )}
                  {gateResult.explorerLink && (
                    <a
                      href={gateResult.explorerLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#eca8d6] hover:underline inline-flex items-center gap-1"
                    >
                      Gate decision on Kitescan <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {paymentPending && (
                    <p className="text-amber-400/80 mt-1">
                      Firing real KITE transfer from your wallet…
                    </p>
                  )}
                  {paymentTxHash && (
                    <div className="mt-1 pt-1 border-t border-white/10">
                      <p className="text-green-400 font-bold">Real KITE sent on-chain ✓</p>
                      <a
                        href={explorerTx(paymentTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#eca8d6] hover:underline inline-flex items-center gap-1"
                      >
                        View payment tx <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Session key panel */}
            <div className="border border-white/25 bg-black/40 backdrop-blur-sm p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-white uppercase tracking-widest">Session key</span>
                {sessionKey && (
                  <span className="text-[10px] font-mono text-green-400 inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    active
                  </span>
                )}
              </div>

              {sessionKey ? (
                <>
                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-white/50 uppercase tracking-wider">Key address</span>
                      <span className="text-white font-semibold truncate">{sessionKey.address}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-white/50 uppercase tracking-wider">Spend limit</span>
                      <span className="text-white font-semibold">{sessionKey.valueLimit} USDC</span>
                    </div>
                  </div>
                  <SessionCountdown expiresAt={sessionKey.expiresAt} />
                  <button
                    onClick={() => void freeze()}
                    disabled={actionBusy}
                    className="w-full border border-red-500/40 text-red-400 font-mono font-bold text-xs py-3 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                  >
                    {actionBusy ? "Freezing…" : "Force freeze"}
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="font-mono text-sm text-red-400 font-semibold">No active session key</span>
                  <span className="font-mono text-xs text-white/60 leading-relaxed">
                    {agent.status === "frozen"
                      ? "Agent is frozen. Re-authorize below to resume payments."
                      : "Run the gate to request a session key for this agent."}
                  </span>
                </div>
              )}
            </div>

            {/* Re-authorize panel — only when frozen */}
            {agent.status === "frozen" && (
              <div className="border border-white/25 bg-black/70 backdrop-blur-sm p-5 flex flex-col gap-4">
                <span className="text-xs font-mono font-bold text-white uppercase tracking-widest">Human review required</span>
                <p className="font-mono text-xs text-white/75 leading-relaxed">
                  Reset the behavioral baseline and commit a new hash on-chain to re-authorize, or permanently revoke this agent.
                </p>
                {actionErr && (
                  <p className="text-xs font-mono text-red-300 break-words">{actionErr}</p>
                )}
                <button
                  onClick={() => void reauthorize()}
                  disabled={actionBusy}
                  className="w-full border border-white/40 bg-white/5 text-white font-mono font-bold text-xs py-3 hover:bg-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {actionBusy ? "Processing…" : "Reset baseline & re-authorize"}
                </button>
                <button
                  onClick={() => void revoke()}
                  disabled={actionBusy}
                  className="w-full border border-red-500/60 text-red-300 font-mono font-bold text-xs py-3 hover:bg-red-500/15 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  {actionBusy ? "Processing…" : "Permanently revoke agent"}
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
              <div className="overflow-y-auto divide-y divide-white/10 flex-1 max-h-[420px]">
                {txHistory.map((tx) => (
                  <div key={tx.id} className="px-5 py-2.5 grid grid-cols-[70px_60px_70px_50px_70px] gap-2 items-center">
                    <span className="font-mono text-[10px] text-white/40 tabular-nums">{tx.blockNumber.toLocaleString()}</span>
                    <span className="font-mono text-xs font-semibold text-white/80 tabular-nums">{tx.amount.toFixed(2)}</span>
                    <span className="font-mono text-[10px] text-white/40 truncate">{tx.counterparty}</span>
                    <span className="font-mono text-[10px] text-white/40 tabular-nums">{tx.timeDelta}s</span>
                    <span className={`font-mono text-[10px] font-bold ${
                      tx.verdict === "ISSUED" ? "text-green-400" :
                      tx.verdict === "DENIED" ? "text-red-400" : "text-amber-400"
                    }`}>
                      {tx.verdict}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* On-chain payment history from Goldsky */}
        {payments.length > 0 && (
          <div className="border border-white/25 bg-black/40 backdrop-blur-sm flex flex-col">
            <div className="px-5 py-3 border-b border-white/25 flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">
                On-chain payment history · Goldsky
              </span>
              <span className="text-[10px] font-mono text-white/30">{payments.length} payments</span>
            </div>
            <div className="overflow-y-auto divide-y divide-white/10 max-h-[320px]">
              <div className="px-5 py-2 grid grid-cols-[60px_90px_80px_1fr_80px] gap-3 items-center border-b border-white/10">
                <span className="text-[9px] font-mono font-bold text-white/30 uppercase">Block</span>
                <span className="text-[9px] font-mono font-bold text-white/30 uppercase">Amount</span>
                <span className="text-[9px] font-mono font-bold text-white/30 uppercase">Type</span>
                <span className="text-[9px] font-mono font-bold text-white/30 uppercase">Tx Hash</span>
                <span className="text-[9px] font-mono font-bold text-white/30 uppercase">Explorer</span>
              </div>
              {payments.map((p) => (
                <div key={p.id} className="px-5 py-2.5 grid grid-cols-[60px_90px_80px_1fr_80px] gap-3 items-center hover:bg-white/[0.03]">
                  <span className="font-mono text-[10px] text-white/40 tabular-nums">{p.blockNumber}</span>
                  <span className="font-mono text-xs font-semibold text-white/80 tabular-nums">
                    {(Number(BigInt(p.amount)) / 1e18).toFixed(4)} USDC
                  </span>
                  <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 border w-fit ${
                    p.paymentType === "ATTACK"
                      ? "border-red-500/40 text-red-400 bg-red-500/10"
                      : p.paymentType === "SEEDED"
                      ? "border-white/20 text-white/40"
                      : "border-green-500/40 text-green-400 bg-green-500/10"
                  }`}>
                    {p.paymentType}
                  </span>
                  <span className="font-mono text-[10px] text-white/30 truncate">{p.transactionHash.slice(0, 18)}…</span>
                  <a
                    href={explorerTx(p.transactionHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] text-[#eca8d6] hover:underline flex items-center gap-1"
                  >
                    Kitescan <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
