import type {
  Agent,
  AgentDetail,
  DashboardMetrics,
  GateEvent,
  MetricPoint,
  SessionKey,
  TxRecord,
  Verdict,
} from "@/lib/mock-data";

export function getApiBase(): string {
  const b = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  return b || "http://localhost:4000";
}

/** Kite documentation (Account Abstraction SDK). */
export const KITE_AA_SDK_DOC_URL = "https://docs.gokite.ai/kite-chain/account-abstraction-sdk";

/** Session keys & unified account model (Kite docs). */
export const KITE_CORE_CONCEPTS_DOC_URL =
  "https://docs.gokite.ai/get-started-why-kite/core-concepts-and-terminology";

export type BackendHealth = {
  ok: boolean;
  demoMode?: boolean;
  skipX402Validation?: boolean;
  kiteAaNetwork?: string;
  aaLogDecisionConfigured?: boolean;
  aaSessionKeyRuleConfigured?: boolean;
  useAaSdkForLogDecision?: boolean;
  useAaSessionKeyRule?: boolean;
  predictedAaBackendAddress?: string | null;
};

export async function fetchBackendHealth(): Promise<BackendHealth> {
  return apiJson<BackendHealth>("/health");
}

export type BackendConfig = {
  ownerAddress: string;
  walletAddress: string; // Agent's payment wallet (Kite Passport wallet for authenticated owner)
  passportUsername: string;
  explorerBase: string;
  attractorGuardAddress: string;
  demoMode: boolean;
};

export async function fetchBackendConfig(): Promise<BackendConfig> {
  return apiJson<BackendConfig>("/api/config");
}

export type PassportStatus = {
  enabled: boolean;
  authenticated: boolean;
  status: string;
  credentials?: {
    userId: string;
    email: string;
    hasJwt: boolean;
  };
  agentCount: number;
  agents: Array<{
    agentId: string;
    type: string;
    ownerId?: string;
    createdAt?: string;
  }>;
  error?: string;
};

export async function fetchPassportStatus(): Promise<PassportStatus> {
  return apiJson<PassportStatus>("/api/passport/status");
}

export type PassportVerification = {
  verified: boolean;
  agent?: {
    agent_id: string;
    agent_type: string;
  };
  attempt?: number;
  error?: string;
  skipped?: boolean;
};

export async function verifyPassportAgent(agentType: string): Promise<PassportVerification> {
  return apiJson<PassportVerification>("/api/passport/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentType }),
  });
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function coerceVerdict(v: string): Verdict {
  if (v === "DENIED") return "DENIED";
  if (v === "DRIFTING") return "DRIFTING";
  return "ISSUED";
}

type ApiAgentRow = {
  agentId: string;
  name: string;
  status: Agent["status"];
  mode?: Agent["mode"];
  walletAddress: string;
  ownerAddress?: string;
  baselineMean: number;
  baselineStdDev: number;
  baselineHash: string | null;
  baselineExplorerLink?: string | null;
  passportDid?: string | null;
  passportUsername?: string | null;
  transactionCount: number;
  currentMetric: number;
  deviationPct: number;
  lastCheckedAt?: string;
};

type ApiEventRow = {
  id: string;
  agentId: string;
  agentName: string;
  amount: number;
  verdict: string;
  timestamp: string;
  metricValue: number;
};

export function mapListAgent(r: ApiAgentRow): Agent {
  return {
    agentId: r.agentId,
    name: r.name,
    walletAddress: r.walletAddress,
    ownerAddress: r.ownerAddress || "—",
    status: r.status,
    mode: r.mode ?? "early",
    transactionCount: r.transactionCount ?? 0,
    currentMetric: Number(r.currentMetric) || 0,
    baselineMean: Number(r.baselineMean) || 0,
    baselineStdDev: Number(r.baselineStdDev) || 0,
    deviationPct: Number(r.deviationPct) || 0,
    baselineHash: r.baselineHash ? String(r.baselineHash) : "—",
    baselineExplorerLink: r.baselineExplorerLink ?? null,
    passportDid: r.passportDid ?? null,
    passportUsername: r.passportUsername ?? null,
    lastCheckedAt: r.lastCheckedAt || new Date().toISOString(),
  };
}

export function computeDashboardMetrics(agents: Agent[], events: GateEvent[]): DashboardMetrics {
  const today = new Date().toISOString().slice(0, 10);
  let keysIssuedToday = 0;
  let keysDeniedToday = 0;
  for (const e of events) {
    if (e.timestamp.slice(0, 10) !== today) continue;
    if (e.verdict === "ISSUED") keysIssuedToday++;
    if (e.verdict === "DENIED") keysDeniedToday++;
  }
  const avgMetric =
    agents.length > 0 ? agents.reduce((s, a) => s + a.currentMetric, 0) / agents.length : 0;
  const avgDev =
    agents.length > 0 ? agents.reduce((s, a) => s + Math.abs(a.deviationPct), 0) / agents.length : 0;
  const avgMetricHealth: DashboardMetrics["avgMetricHealth"] =
    avgDev < 15 ? "stable" : avgDev < 40 ? "drifting" : "critical";
  return {
    totalAgents: agents.length,
    keysIssuedToday,
    keysDeniedToday,
    avgMetric,
    avgMetricHealth,
  };
}

export async function fetchDashboardData(): Promise<{
  agents: Agent[];
  events: GateEvent[];
  metrics: DashboardMetrics;
}> {
  const [rawAgents, rawEvents] = await Promise.all([
    apiJson<ApiAgentRow[]>("/api/agents"),
    apiJson<ApiEventRow[]>("/api/events?limit=50"),
  ]);
  const agents = rawAgents.map(mapListAgent);
  const events: GateEvent[] = rawEvents.map((e) => ({
    id: e.id,
    agentId: e.agentId,
    agentName: e.agentName,
    amount: Number(e.amount) || 0,
    verdict: coerceVerdict(e.verdict),
    timestamp: e.timestamp,
    metricValue: Number(e.metricValue) || 0,
  }));
  const metrics = computeDashboardMetrics(agents, events);
  return { agents, events, metrics };
}

type ApiAgentDetail = ApiAgentRow & {
  spendingLimit?: number;
  baselineHistory?: number[];
  sessionKeyLog?: Array<{
    verdict: string;
    metric: number;
    sessionKey: string | null;
    timestamp: string | Date;
    explorerLink?: string | null;
  }>;
  recentTx?: Array<{
    id: string;
    blockNumber: number;
    amount: number;
    counterparty: string;
    timeDelta: number;
    verdict: string;
    txHash: string;
    explorerLink?: string | null;
  }>;
};

function iso(d: string | Date | undefined): string {
  if (!d) return new Date().toISOString();
  if (d instanceof Date) return d.toISOString();
  return new Date(d).toISOString();
}

export function mapAgentDetail(raw: ApiAgentDetail): AgentDetail {
  const mean = Number(raw.baselineMean) || 0;
  const std = Number(raw.baselineStdDev) || 0;
  const logs = [...(raw.sessionKeyLog || [])].sort((a, b) => +new Date(iso(b.timestamp)) - +new Date(iso(a.timestamp)));
  const lastMetric = logs[0]?.metric;
  const currentMetric = lastMetric != null && Number.isFinite(Number(lastMetric)) ? Number(lastMetric) : mean;
  const deviationPct = mean !== 0 ? ((currentMetric - mean) / Math.abs(mean)) * 100 : 0;

  const agent: Agent = {
    agentId: raw.agentId,
    name: raw.name,
    walletAddress: raw.walletAddress,
    ownerAddress: raw.ownerAddress || "—",
    status: raw.status,
    mode: raw.mode ?? "early",
    transactionCount: raw.transactionCount ?? 0,
    currentMetric,
    baselineMean: mean,
    baselineStdDev: std,
    deviationPct,
    baselineHash: raw.baselineHash ? String(raw.baselineHash) : "—",
    baselineExplorerLink: (raw as ApiAgentRow).baselineExplorerLink ?? null,
    passportDid: (raw as ApiAgentRow).passportDid ?? null,
    passportUsername: (raw as ApiAgentRow).passportUsername ?? null,
    lastCheckedAt: iso(raw.lastCheckedAt as string | Date | undefined),
  };

  const bh = raw.baselineHistory || [];
  const metricHistory: MetricPoint[] = bh.map((value, index) => ({
    index,
    value: Number(value) || 0,
    timestamp: new Date(Date.now() - (bh.length - index) * 30_000).toISOString(),
  }));

  const txHistory: TxRecord[] = (raw.recentTx || []).map((tx) => ({
    id: tx.id,
    blockNumber: tx.blockNumber ?? 0,
    amount: Number(tx.amount) || 0,
    counterparty: tx.counterparty || "—",
    timeDelta: tx.timeDelta ?? 0,
    verdict: coerceVerdict(tx.verdict),
    txHash: tx.txHash || "",
  }));

  const zero = "0x0000000000000000000000000000000000000000";
  const issued = logs.find(
    (x) =>
      x.verdict === "ISSUED" &&
      x.sessionKey &&
      String(x.sessionKey).toLowerCase() !== zero
  );
  const skAddr = issued?.sessionKey ? String(issued.sessionKey) : null;

  const sessionKey: SessionKey | null =
    agent.status === "active" && skAddr
      ? {
          address: skAddr,
          expiresAt: new Date(Date.now() + 86400_000).toISOString(),
          valueLimit: Number(raw.spendingLimit) || 0,
          functionSelector: "0xa9059cbb",
        }
      : null;

  let freezeReason: AgentDetail["freezeReason"];
  if (agent.status === "frozen") {
    const denied = logs.find((x) => x.verdict === "DENIED");
    freezeReason = {
      metricValue: denied?.metric != null ? Number(denied.metric) : currentMetric,
      threshold: mean + std * 2,
      timestamp: denied ? iso(denied.timestamp) : agent.lastCheckedAt,
      explorerLink:
        (denied?.explorerLink as string) ||
        "https://testnet.kitescan.ai",
    };
  }

  return { agent, metricHistory, txHistory, sessionKey, freezeReason };
}

export async function fetchAgentDetailFromApi(agentId: string): Promise<AgentDetail | null> {
  const url = `${getApiBase()}/api/agents/${encodeURIComponent(agentId)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await res.text());
  const raw = (await res.json()) as ApiAgentDetail;
  return mapAgentDetail(raw);
}

export type GateRequestBody = {
  agentId: string;
  amount: number;
  destination: string;
  x402Payload?: unknown;
};

/** Shape of `POST /api/gate` JSON (includes AA / diagnostics when enabled). */
export type GateResponse = {
  verdict: string;
  sessionKey: string | null;
  metric: number;
  baseline: number;
  threshold: number;
  reason: string;
  explorerLink?: string | null;
  gateDiagnostics?: {
    goldskyPaymentCount: number;
    paymentCountUsed: number;
    analysisUsedSyntheticOnly: boolean;
  };
  logDecisionError?: string;
  sessionKeyPrivateKey?: string;
};

export async function postGate(body: GateRequestBody): Promise<GateResponse> {
  return apiJson<GateResponse>("/api/gate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type RegisterAgentBody = {
  name: string;
  walletAddress: string;
  ownerAddress: string;
  spendingLimit: number;
  thresholdMultiplier?: number;
  agentId?: string;
  didLabel?: string;
  description?: string;
  passportDid?: string;
  passportUsername?: string;
};

export async function postReauthorizeAgent(agentId: string): Promise<{ ok: boolean; agentId: string }> {
  return apiJson(`/api/agents/${encodeURIComponent(agentId)}/reauthorize`, { method: "POST" });
}

export async function postFreezeAgent(agentId: string): Promise<{ ok: boolean; agentId: string }> {
  return apiJson(`/api/agents/${encodeURIComponent(agentId)}/freeze`, { method: "POST" });
}

export async function postRevokeAgent(agentId: string): Promise<{ ok: boolean; agentId: string }> {
  return apiJson(`/api/agents/${encodeURIComponent(agentId)}/revoke`, { method: "POST" });
}

export async function postInjectAttack(agentId: string): Promise<{ ok: boolean; txHash?: string; explorerLink?: string }> {
  return apiJson("/api/demo/inject-attack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId }),
  });
}

export async function postRegisterAgent(
  body: RegisterAgentBody
): Promise<{ agentId: string; txHash: string; explorerLink?: string }> {
  const res = await fetch(`${getApiBase()}/api/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `${res.status} ${res.statusText}`);
  return JSON.parse(text) as { agentId: string; txHash: string; explorerLink?: string };
}
