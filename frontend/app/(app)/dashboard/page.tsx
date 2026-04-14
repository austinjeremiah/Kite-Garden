"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  fetchSystemStats,
  fetchAllAgents,
  fetchLiveFeed,
  fetchAgentDecisions,
  normaliseAgent,
  buildFeed,
  type AgentRow,
  type FeedRow,
  type GoldskyAgent,
} from "@/lib/goldsky";
import { KITE_EXPLORER } from "@/lib/config";
import { truncateId, formatTime } from "@/lib/mock-data";

// ─── Person 2 mock — swap when backend ready ──────────────────────────────────
// Backend provides: baselineStdDev, deviationPct per agent
// These come from MongoDB where nolds results are stored
const MOCK_BACKEND_METRICS: Record<string, { stdDev: number; deviationPct: number }> = {
  default: { stdDev: 0.12, deviationPct: 2.4 },
};
function getBackendMetric(agentId: string) {
  return MOCK_BACKEND_METRICS[agentId] ?? MOCK_BACKEND_METRICS.default;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function StatusDot({ status }: { status: AgentRow["status"] }) {
  const color = status === "active" ? "bg-green-500" : status === "frozen" ? "bg-red-500" : "bg-white/20";
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

function AgentList({ agents }: { agents: AgentRow[] }) {
  const router = useRouter();

  if (agents.length === 0) {
    return (
      <div className="border border-white/25 bg-black/40 backdrop-blur-sm flex items-center justify-center h-full">
        <span className="font-mono text-xs text-white/25">No agents registered yet</span>
      </div>
    );
  }

  return (
    <div className="border border-white/25 bg-black/40 backdrop-blur-sm flex flex-col h-full">
      <div className="px-5 py-3 border-b border-white/25 grid grid-cols-[16px_1fr_130px_100px_90px] gap-3 items-center">
        <span />
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Agent</span>
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Metric</span>
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Issued / Denied</span>
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Status</span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-white/10">
        {agents.map((agent) => {
          const { deviationPct } = getBackendMetric(agent.agentId);
          const metricDisplay = agent.currentMetric != null
            ? agent.currentMetric.toFixed(3)
            : "—";

          return (
            <button
              key={agent.agentId}
              onClick={() => router.push(`/agent/${encodeURIComponent(agent.agentId)}`)}
              className="w-full px-5 py-4 grid grid-cols-[16px_1fr_130px_100px_90px] gap-3 items-center hover:bg-white/[0.05] transition-colors text-left group"
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
                {metricDisplay}
              </span>

              <span className="font-mono text-xs font-semibold tabular-nums">
                <span className="text-green-400">{agent.sessionsIssued}</span>
                <span className="text-white/20"> / </span>
                <span className="text-red-400">{agent.sessionsDenied}</span>
              </span>

              <span className={`inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-2 py-0.5 border w-fit ${
                agent.status === "active"
                  ? "border-green-500/50 text-green-400 bg-green-500/10"
                  : agent.status === "frozen"
                  ? "border-red-500/50 text-red-400 bg-red-500/10"
                  : "border-white/20 text-white/40"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  agent.status === "active" ? "bg-green-500" : agent.status === "frozen" ? "bg-red-500" : "bg-white/20"
                }`} />
                {agent.status.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: FeedRow["verdict"] }) {
  const styles: Record<string, string> = {
    ISSUED:  "text-green-400 border-green-500/40 bg-green-500/10",
    DENIED:  "text-red-400 border-red-500/40 bg-red-500/10",
    ATTACK:  "text-amber-400 border-amber-500/40 bg-amber-500/10",
    SEEDED:  "text-white/30 border-white/10 bg-white/5",
  };
  return (
    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border shrink-0 ${styles[verdict] ?? styles.ISSUED}`}>
      {verdict}
    </span>
  );
}

function TxFeed({ rows }: { rows: FeedRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border border-white/25 bg-black/40 backdrop-blur-sm flex items-center justify-center h-full">
        <span className="font-mono text-xs text-white/25 animate-pulse">Waiting for transactions...</span>
      </div>
    );
  }

  return (
    <div className="border border-white/25 bg-black/40 backdrop-blur-sm flex flex-col h-full">
      <div className="px-5 py-3 border-b border-white/25 flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">Live tx feed</span>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-white/40">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Goldsky · 5s
        </span>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-white/10">
        {rows.map((row) => (
          <div key={row.id} className="px-5 py-3 flex items-center gap-3">
            <span className="font-mono text-[10px] text-white/30 shrink-0 w-16 tabular-nums">
              {formatTime(new Date(row.timestamp).toISOString())}
            </span>
            <span className="font-mono text-xs font-semibold text-white/70 flex-1 truncate min-w-0">
              {truncateId(row.agentId, 6)}
            </span>
            <span className="font-mono text-xs font-semibold text-white/60 tabular-nums shrink-0">
              {row.amount.toFixed(2)} USDC
            </span>
            <VerdictBadge verdict={row.verdict} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // ── Real Goldsky queries ──────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ["systemStats"],
    queryFn: fetchSystemStats,
    refetchInterval: 10_000,
  });

  const { data: rawAgents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: fetchAllAgents,
    refetchInterval: 10_000,
  });

  const { data: feed } = useQuery({
    queryKey: ["liveFeed"],
    queryFn: fetchLiveFeed,
    refetchInterval: 5_000,
  });

  // ── Per-agent last decision (for status + metric) ─────────────────────────
  // We fetch last decisions for each agent to derive frozen status + current metric
  const agentIds = rawAgents.map((a) => a.id);
  const { data: allDecisions = [] } = useQuery({
    queryKey: ["allDecisions", agentIds.join(",")],
    queryFn: async () => {
      if (!agentIds.length) return [];
      // Fetch last decision per agent in one query
      const data = await import("@/lib/goldsky").then((m) =>
        m.gql ? null : null
      );
      // Fetch all recent decisions and find latest per agent
      const { gateDecisions } = await fetch(
        (await import("@/lib/config")).GOLDSKY_ENDPOINT,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `{
              gateDecisions(orderBy: timestamp, orderDirection: desc, first: 200) {
                id agentDID issued metricValue baselineValue amount sessionKey timestamp blockNumber transactionHash
              }
            }`,
          }),
        }
      ).then((r) => r.json()).then((j) => j.data ?? { gateDecisions: [] });
      return gateDecisions as import("@/lib/goldsky").GoldskyDecision[];
    },
    refetchInterval: 10_000,
    enabled: agentIds.length > 0,
  });

  // Build latest decision per agent
  const latestDecisionMap = new Map<string, import("@/lib/goldsky").GoldskyDecision>();
  for (const dec of allDecisions) {
    if (!latestDecisionMap.has(dec.agentDID)) {
      latestDecisionMap.set(dec.agentDID, dec);
    }
  }

  const agents: AgentRow[] = rawAgents.map((a: GoldskyAgent) =>
    normaliseAgent(a, latestDecisionMap.get(a.id))
  );

  const feedRows: FeedRow[] = feed
    ? buildFeed(feed.payments, feed.decisions)
    : [];

  // ── Metric cards ──────────────────────────────────────────────────────────
  const totalAgents   = stats ? Number(stats.totalAgents)          : agents.length;
  const keysIssued    = stats ? Number(stats.totalSessionsIssued)  : 0;
  const keysDenied    = stats ? Number(stats.totalSessionsDenied)  : 0;
  const attacksFound  = stats ? Number(stats.totalAttacksDetected) : 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-white/25 flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-mono font-bold text-white text-lg">Dashboard</h1>
          <p className="font-mono text-white/40 text-xs mt-0.5">
            Behavioral gate · Kite testnet ·{" "}
            <a
              href={`${KITE_EXPLORER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#eca8d6]/60 hover:text-[#eca8d6] transition-colors"
            >
              kitescan.ai ↗
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono font-bold text-white/40">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Goldsky live
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Metric cards */}
        <div className="px-8 pt-6 grid grid-cols-4 gap-4">
          <MetricCard label="Total agents"      value={totalAgents}  sub="registered on-chain" />
          <MetricCard label="Keys issued"        value={keysIssued}   color="text-green-400" sub="STABLE verdicts" />
          <MetricCard label="Keys denied"        value={keysDenied}   color="text-red-400"   sub="DIVERGED verdicts" />
          <MetricCard label="Attacks detected"   value={attacksFound} color="text-amber-400" sub="anomalous bursts" />
        </div>

        {/* Main grid */}
        <div className="px-8 py-6 grid grid-cols-[3fr_2fr] gap-4" style={{ minHeight: "calc(100vh - 220px)" }}>
          <AgentList agents={agents} />
          <TxFeed rows={feedRows} />
        </div>
      </div>
    </div>
  );
}
