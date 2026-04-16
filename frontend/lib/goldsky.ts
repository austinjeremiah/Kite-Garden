// Goldsky GraphQL client — real data from Person 1's deployed subgraph
// metricValue / baselineValue stored as BigInt scaled by 1e18

import { GOLDSKY_ENDPOINT, KITE_EXPLORER } from "./config";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert 1e18-scaled BigInt string to float */
export function fromWei(val: string | null | undefined): number {
  if (!val) return 0;
  return Number(BigInt(val)) / 1e18;
}

/** Convert 100-scaled int to σ multiplier (200 → 2.0) */
export function fromSigmaScale(val: string | null | undefined): number {
  if (!val) return 2;
  return Number(val) / 100;
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(GOLDSKY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data as T;
}

// ─── Query types ──────────────────────────────────────────────────────────────

export interface GoldskyAgent {
  id: string;
  owner: string;
  spendingLimit: string;
  thresholdMultiplier: string;
  transactionCount: string;
  isActive: boolean;
  isRevoked: boolean;
  registeredAt: string;
  lastActivityAt: string;
  name: string | null;
  totalPaid: string;
  sessionsIssued: string;
  sessionsDenied: string;
  attacksDetected: string;
  freezeCount: string | null;
}

export interface GoldskyPayment {
  id: string;
  agentDID: string;
  amount: string;
  to: string;
  paymentType: "NORMAL" | "ATTACK" | "SEEDED";
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
}

export interface GoldskyDecision {
  id: string;
  agentDID: string;
  issued: boolean;
  metricValue: string;
  baselineValue: string;
  amount: string;
  sessionKey: string | null;
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
}

export interface GoldskySystemStats {
  totalAgents: string;
  totalPayments: string;
  totalDecisions: string;
  totalSessionsIssued: string;
  totalSessionsDenied: string;
  totalAttacksDetected: string;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const AGENT_FIELDS = `
  id
  owner
  spendingLimit
  thresholdMultiplier
  transactionCount
  isActive
  isRevoked
  registeredAt
  lastActivityAt
  name
  totalPaid
  sessionsIssued
  sessionsDenied
  attacksDetected
  freezeCount
`;

const PAYMENT_FIELDS = `
  id
  agentDID
  amount
  to
  paymentType
  timestamp
  blockNumber
  transactionHash
`;

const DECISION_FIELDS = `
  id
  agentDID
  issued
  metricValue
  baselineValue
  amount
  sessionKey
  timestamp
  blockNumber
  transactionHash
`;

// ─── Fetchers ─────────────────────────────────────────────────────────────────

/** Dashboard: system-wide stats */
export async function fetchSystemStats(): Promise<GoldskySystemStats | null> {
  const data = await gql<{ systemStats: GoldskySystemStats | null }>(`
    query {
      systemStats(id: "system") {
        totalAgents
        totalPayments
        totalDecisions
        totalSessionsIssued
        totalSessionsDenied
        totalAttacksDetected
      }
    }
  `);
  return data.systemStats;
}

/** Dashboard: all agents */
export async function fetchAllAgents(): Promise<GoldskyAgent[]> {
  const data = await gql<{ agents: GoldskyAgent[] }>(`
    query {
      agents(orderBy: registeredAt, orderDirection: desc, first: 50) {
        ${AGENT_FIELDS}
      }
    }
  `);
  return data.agents ?? [];
}

/** Dashboard: live tx feed — latest payments across all agents */
export async function fetchLiveFeed(): Promise<{
  payments: GoldskyPayment[];
  decisions: GoldskyDecision[];
}> {
  const data = await gql<{
    agentPayments: GoldskyPayment[];
    gateDecisions: GoldskyDecision[];
  }>(`
    query {
      agentPayments(orderBy: timestamp, orderDirection: desc, first: 20) {
        ${PAYMENT_FIELDS}
      }
      gateDecisions(orderBy: timestamp, orderDirection: desc, first: 20) {
        ${DECISION_FIELDS}
      }
    }
  `);
  return {
    payments: data.agentPayments ?? [],
    decisions: data.gateDecisions ?? [],
  };
}

/** Agent detail: single agent */
export async function fetchAgent(agentId: string): Promise<GoldskyAgent | null> {
  const data = await gql<{ agent: GoldskyAgent | null }>(
    `query Agent($id: ID!) {
      agent(id: $id) { ${AGENT_FIELDS} }
    }`,
    { id: agentId }
  );
  return data.agent;
}

/** Agent detail: last 50 gate decisions (for metric chart) */
export async function fetchAgentDecisions(agentId: string): Promise<GoldskyDecision[]> {
  const data = await gql<{ gateDecisions: GoldskyDecision[] }>(
    `query AgentDecisions($agentId: Bytes!) {
      gateDecisions(
        where: { agentDID: $agentId }
        orderBy: timestamp
        orderDirection: asc
        first: 50
      ) { ${DECISION_FIELDS} }
    }`,
    { agentId }
  );
  return data.gateDecisions ?? [];
}

/** Agent detail: payment history */
export async function fetchAgentPayments(agentId: string): Promise<GoldskyPayment[]> {
  const data = await gql<{ agentPayments: GoldskyPayment[] }>(
    `query AgentPayments($agentId: Bytes!) {
      agentPayments(
        where: { agentDID: $agentId }
        orderBy: timestamp
        orderDirection: desc
        first: 30
      ) { ${PAYMENT_FIELDS} }
    }`,
    { agentId }
  );
  return data.agentPayments ?? [];
}

// ─── Normalised view models (used by pages) ───────────────────────────────────

export interface AgentRow {
  agentId: string;
  name: string;
  status: "active" | "frozen" | "revoked";
  transactionCount: number;
  sessionsIssued: number;
  sessionsDenied: number;
  // metric data comes from last gate decision
  currentMetric: number | null;
  baselineValue: number | null;
  explorerLink: string;
}

export function normaliseAgent(a: GoldskyAgent, lastDecision?: GoldskyDecision): AgentRow {
  const status: AgentRow["status"] = a.isRevoked
    ? "revoked"
    : lastDecision && !lastDecision.issued
    ? "frozen"
    : "active";

  return {
    agentId: a.id,
    name: a.name ?? a.id.slice(0, 12) + "...",
    status,
    transactionCount: Number(a.transactionCount),
    sessionsIssued: Number(a.sessionsIssued),
    sessionsDenied: Number(a.sessionsDenied),
    currentMetric: lastDecision ? fromWei(lastDecision.metricValue) : null,
    baselineValue: lastDecision ? fromWei(lastDecision.baselineValue) : null,
    explorerLink: `${KITE_EXPLORER}/address/${a.id}`,
  };
}

/** Merge payments + decisions into a unified live feed row */
export interface FeedRow {
  id: string;
  agentId: string;
  amount: number;
  verdict: "ISSUED" | "DENIED" | "SEEDED" | "ATTACK";
  timestamp: number;
}

export function buildFeed(
  payments: GoldskyPayment[],
  decisions: GoldskyDecision[]
): FeedRow[] {
  // index decisions by txHash for O(1) lookup
  const decisionMap = new Map(decisions.map((d) => [d.transactionHash, d]));

  return payments.map((p) => {
    const dec = decisionMap.get(p.transactionHash);
    const verdict: FeedRow["verdict"] =
      p.paymentType === "ATTACK" ? "ATTACK"
      : p.paymentType === "SEEDED" ? "SEEDED"
      : dec ? (dec.issued ? "ISSUED" : "DENIED")
      : "ISSUED";

    return {
      id: p.id,
      agentId: p.agentDID,
      amount: Number(BigInt(p.amount)) / 1e18, // amounts stored as 1e18-scaled
      verdict,
      timestamp: Number(p.timestamp) * 1000,
    };
  });
}
