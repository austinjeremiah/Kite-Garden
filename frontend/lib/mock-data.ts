// Mock data — mirrors exact API shape from KiteGarden.md Section 8
// Swap fetch calls to real endpoints when backend is ready

export type AgentStatus = "active" | "frozen" | "revoked";
export type Verdict = "ISSUED" | "DENIED" | "DRIFTING";

export interface Agent {
  agentId: string;
  name: string;
  walletAddress: string;
  ownerAddress: string;
  status: AgentStatus;
  mode: "early" | "mature";
  transactionCount: number;
  currentMetric: number;
  baselineMean: number;
  baselineStdDev: number;
  deviationPct: number;
  baselineHash: string;
  lastCheckedAt: string;
}

export interface GateEvent {
  id: string;
  agentId: string;
  agentName: string;
  amount: number;
  verdict: Verdict;
  timestamp: string;
  metricValue: number;
}

export interface DashboardMetrics {
  totalAgents: number;
  keysIssuedToday: number;
  keysDeniedToday: number;
  avgMetric: number;
  avgMetricHealth: "stable" | "drifting" | "critical";
}

// ─── Mock agents ────────────────────────────────────────────────────────────

export const MOCK_AGENTS: Agent[] = [
  {
    agentId: "0x4a3b8f2c1d9e7a05b6c3f8d2e1a94b7c0f3d6e9a2b5c8d1f4e7a0b3c6d9e2f5",
    name: "alice-expense-agent",
    walletAddress: "0xAlice1234...5678",
    ownerAddress: "0xOwnerAlice...abcd",
    status: "active",
    mode: "mature",
    transactionCount: 347,
    currentMetric: 2.14,
    baselineMean: 2.09,
    baselineStdDev: 0.11,
    deviationPct: 2.4,
    baselineHash: "0xba5e6c3f...9d2a",
    lastCheckedAt: new Date(Date.now() - 12_000).toISOString(),
  },
  {
    agentId: "0xb7c0f3d6e9a2b5c8d1f4e7a0b3c6d9e2f54a3b8f2c1d9e7a05b6c3f8d2e1a94",
    name: "bob-trading-agent",
    walletAddress: "0xBob5678...9abc",
    ownerAddress: "0xOwnerBob...ef01",
    status: "frozen",
    mode: "mature",
    transactionCount: 312,
    currentMetric: 4.87,
    baselineMean: 2.11,
    baselineStdDev: 0.13,
    deviationPct: 213.5,
    baselineHash: "0xcc7a1b4e...8f3d",
    lastCheckedAt: new Date(Date.now() - 45_000).toISOString(),
  },
  {
    agentId: "0xd1f4e7a0b3c6d9e2f54a3b8f2c1d9e7a05b6c3f8d2e1a94b7c0f3d6e9a2b5c8",
    name: "carol-payments-agent",
    walletAddress: "0xCarol9abc...def0",
    ownerAddress: "0xOwnerCarol...2345",
    status: "active",
    mode: "early",
    transactionCount: 67,
    currentMetric: 0.72,
    baselineMean: 0.68,
    baselineStdDev: 0.09,
    deviationPct: 5.9,
    baselineHash: "0xee3b9c7a...1f4d",
    lastCheckedAt: new Date(Date.now() - 8_000).toISOString(),
  },
  {
    agentId: "0xe7a0b3c6d9e2f54a3b8f2c1d9e7a05b6c3f8d2e1a94b7c0f3d6e9a2b5c8d1f4",
    name: "dave-ops-agent",
    walletAddress: "0xDave2345...6789",
    ownerAddress: "0xOwnerDave...89ab",
    status: "active",
    mode: "mature",
    transactionCount: 501,
    currentMetric: 1.88,
    baselineMean: 1.95,
    baselineStdDev: 0.14,
    deviationPct: -3.6,
    baselineHash: "0xff1d2e8b...3c6a",
    lastCheckedAt: new Date(Date.now() - 3_000).toISOString(),
  },
];

// ─── Mock gate events ────────────────────────────────────────────────────────

const VERDICTS: Verdict[] = ["ISSUED", "ISSUED", "ISSUED", "ISSUED", "DENIED", "ISSUED", "DRIFTING", "ISSUED"];
const AMOUNTS = [12.5, 8.0, 25.0, 5.5, 100.0, 3.25, 50.0, 15.0, 7.5, 30.0];

function makeEvents(): GateEvent[] {
  const events: GateEvent[] = [];
  for (let i = 0; i < 20; i++) {
    const agent = MOCK_AGENTS[i % MOCK_AGENTS.length];
    events.push({
      id: `evt-${i}`,
      agentId: agent.agentId,
      agentName: agent.name,
      amount: AMOUNTS[i % AMOUNTS.length],
      verdict: i === 4 ? "DENIED" : i === 6 ? "DRIFTING" : "ISSUED",
      timestamp: new Date(Date.now() - i * 18_000).toISOString(),
      metricValue: parseFloat((agent.currentMetric + (Math.random() - 0.5) * 0.2).toFixed(2)),
    });
  }
  return events;
}

export const MOCK_EVENTS: GateEvent[] = makeEvents();

// ─── Mock dashboard metrics ──────────────────────────────────────────────────

export const MOCK_METRICS: DashboardMetrics = {
  totalAgents: 4,
  keysIssuedToday: 847,
  keysDeniedToday: 3,
  avgMetric: 2.37,
  avgMetricHealth: "drifting",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function truncateId(id: string, chars = 8): string {
  return `${id.slice(0, chars + 2)}...${id.slice(-4)}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function getStatusColor(status: AgentStatus): string {
  if (status === "active") return "bg-green-500";
  if (status === "frozen") return "bg-red-500";
  return "bg-white/20";
}

export function getVerdictColor(verdict: Verdict): string {
  if (verdict === "ISSUED") return "text-green-400";
  if (verdict === "DENIED") return "text-red-400";
  return "text-amber-400";
}

export function getDeviationColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 20) return "text-green-400";
  if (abs < 50) return "text-amber-400";
  return "text-red-400";
}
