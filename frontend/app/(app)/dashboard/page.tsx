"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  MOCK_AGENTS,
  MOCK_EVENTS,
  MOCK_METRICS,
  type Agent,
  type GateEvent,
  truncateId,
  formatTime,
  getStatusColor,
  getVerdictColor,
  getDeviationColor,
} from "@/lib/mock-data";

async function fetchMetrics() { return MOCK_METRICS; }
async function fetchAgents(): Promise<Agent[]> { return MOCK_AGENTS; }
async function fetchEvents(): Promise<GateEvent[]> { return MOCK_EVENTS; }

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, color = "text-white",
}: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="border border-white/25 bg-black/40 p-6 flex flex-col gap-3 backdrop-blur-sm">
      <span className="text-xs font-mono font-bold text-white/50 uppercase tracking-widest">{label}</span>
      <span className={`text-4xl font-mono font-bold tabular-nums ${color}`}>{value}</span>
      {sub && <span className="text-xs font-mono text-white/40">{sub}</span>}
    </div>
  );
}

// ─── Agent list ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: Agent["status"] }) {
  const color = status === "active" ? "bg-green-500" : status === "frozen" ? "bg-red-500" : "bg-white/20";
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

function AgentList({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  return (
    <div className="border border-white/25 bg-black/40 backdrop-blur-sm flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-white/25 grid grid-cols-[16px_1fr_120px_80px_80px_90px] gap-3 items-center">
        <span />
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Agent</span>
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Metric</span>
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Baseline</span>
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Δ%</span>
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Status</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/10">
        {agents.map((agent) => (
          <button
            key={agent.agentId}
            onClick={() => router.push(`/agent/${agent.agentId}`)}
            className="w-full px-5 py-4 grid grid-cols-[16px_1fr_120px_80px_80px_90px] gap-3 items-center hover:bg-white/[0.05] transition-colors text-left group"
          >
            <StatusDot status={agent.status} />

            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-mono text-sm font-bold text-white group-hover:text-white/90 truncate">
                {agent.name}
              </span>
              <span className="font-mono text-[10px] text-white/30 truncate">
                {truncateId(agent.agentId)}
              </span>
            </div>

            <span className="font-mono text-sm font-semibold text-white/90 tabular-nums">
              {agent.mode === "mature"
                ? `D₂ ${agent.currentMetric.toFixed(2)}`
                : `SampEn ${agent.currentMetric.toFixed(2)}`}
            </span>

            <span className="font-mono text-sm font-semibold text-white/60 tabular-nums">
              {agent.baselineMean.toFixed(2)}
            </span>

            <span className={`font-mono text-sm font-bold tabular-nums ${getDeviationColor(agent.deviationPct)}`}>
              {agent.deviationPct > 0 ? "+" : ""}{agent.deviationPct.toFixed(1)}%
            </span>

            <span className={`inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-2 py-0.5 border w-fit ${
              agent.status === "active"
                ? "border-green-500/50 text-green-400 bg-green-500/10"
                : agent.status === "frozen"
                ? "border-red-500/50 text-red-400 bg-red-500/10"
                : "border-white/20 text-white/40"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(agent.status)}`} />
              {agent.status.toUpperCase()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Tx feed ──────────────────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: GateEvent["verdict"] }) {
  const styles = {
    ISSUED:   "text-green-400 border-green-500/40 bg-green-500/10",
    DENIED:   "text-red-400 border-red-500/40 bg-red-500/10",
    DRIFTING: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  }[verdict];
  return (
    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border shrink-0 ${styles}`}>
      {verdict}
    </span>
  );
}

function TxFeed({ events }: { events: GateEvent[] }) {
  return (
    <div className="border border-white/25 bg-black/40 backdrop-blur-sm flex flex-col h-full">
      <div className="px-5 py-3 border-b border-white/25 flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Live tx feed</span>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-white/40">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          5s poll
        </span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-white/10">
        {events.map((evt) => (
          <div key={evt.id} className="px-5 py-3 flex items-center gap-3">
            <span className="font-mono text-[10px] text-white/30 shrink-0 w-16 tabular-nums">
              {formatTime(evt.timestamp)}
            </span>
            <span className="font-mono text-xs font-semibold text-white/70 flex-1 truncate min-w-0">
              {evt.agentName}
            </span>
            <span className="font-mono text-xs font-semibold text-white/60 tabular-nums shrink-0">
              {evt.amount.toFixed(2)} USDC
            </span>
            <VerdictBadge verdict={evt.verdict} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: metrics } = useQuery({ queryKey: ["metrics"], queryFn: fetchMetrics, refetchInterval: 10_000 });
  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: fetchAgents, refetchInterval: 10_000 });
  const { data: events = [] } = useQuery({ queryKey: ["events"], queryFn: fetchEvents, refetchInterval: 5_000 });

  const metricHealthColor =
    metrics?.avgMetricHealth === "stable" ? "text-green-400"
    : metrics?.avgMetricHealth === "drifting" ? "text-amber-400"
    : "text-red-400";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-white/25 flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-mono font-bold text-white text-lg">Dashboard</h1>
          <p className="font-mono text-white/40 text-xs mt-0.5">Behavioral gate · Kite testnet</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono font-bold text-white/40">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Live
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Metric cards */}
        <div className="px-8 pt-6 grid grid-cols-4 gap-4">
          <MetricCard label="Total agents"      value={metrics?.totalAgents ?? "—"}                     sub="registered on-chain" />
          <MetricCard label="Keys issued today" value={metrics?.keysIssuedToday ?? "—"}  color="text-green-400" sub="STABLE verdicts" />
          <MetricCard label="Keys denied today" value={metrics?.keysDeniedToday ?? "—"}  color="text-red-400"   sub="DIVERGED verdicts" />
          <MetricCard label="Avg metric"        value={metrics ? metrics.avgMetric.toFixed(2) : "—"} color={metricHealthColor} sub={`${metrics?.avgMetricHealth ?? "—"} · all agents`} />
        </div>

        {/* Main grid */}
        <div className="px-8 py-6 grid grid-cols-[3fr_2fr] gap-4" style={{ minHeight: "calc(100vh - 220px)" }}>
          <AgentList agents={agents} />
          <TxFeed events={events} />
        </div>
      </div>
    </div>
  );
}
