import { config } from "./config.js";

const QUERY_BY_AGENT_REF = `
query AgentHistoryByRef($agentId: ID!, $limit: Int!) {
  agentPayments(
    where: { agent: $agentId }
    orderBy: timestamp
    orderDirection: desc
    first: $limit
  ) {
    id
    amount
    timestamp
    to
    blockNumber
  }
}
`;

const QUERY_BY_AGENT_DID = `
query AgentHistoryByDid($agentId: String!, $limit: Int!) {
  agentPayments(
    where: { agentDID: $agentId }
    orderBy: timestamp
    orderDirection: desc
    first: $limit
  ) {
    id
    amount
    timestamp
    to
    blockNumber
  }
}
`;

function goldskyHeaders() {
  const headers = { "Content-Type": "application/json" };
  const ep = config.goldskyEndpoint || "";
  const isPublic = ep.includes("/api/public/");
  const sendBearer =
    Boolean(config.goldskyApiKey) && (!isPublic || config.goldskyBearerWithPublic);
  if (sendBearer) {
    headers.Authorization = `Bearer ${config.goldskyApiKey}`;
  }
  return headers;
}

async function postGoldsky(query, variables) {
  const headers = goldskyHeaders();
  const res = await fetch(config.goldskyEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Goldsky HTTP ${res.status}: ${t.slice(0, 500)}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    const msg = JSON.stringify(json.errors);
    throw new Error(`Goldsky GraphQL errors: ${msg.slice(0, 800)}`);
  }
  return json.data?.agentPayments || [];
}

/**
 * @param {string} agentId 0x-prefixed bytes32 id used as subgraph Agent entity id
 * @returns {Promise<Array<{ amount: string, timestamp: string, to: string, blockNumber: string }>>}
 */
export async function fetchAgentPaymentHistory(agentId) {
  if (!config.goldskyEndpoint) {
    console.warn(
      "[goldsky] No endpoint: set GOLDSKY_ENDPOINT or SUBGRAPH_GRAPHQL_ENDPOINT in backend/.env (same URL as onchain/.env SUBGRAPH_GRAPHQL_ENDPOINT)"
    );
    return [];
  }

  const id = agentId.toLowerCase();
  const limit = config.goldskyHistoryLimit;

  let rows = await postGoldsky(QUERY_BY_AGENT_REF, { agentId: id, limit });
  if (rows.length === 0) {
    try {
      rows = await postGoldsky(QUERY_BY_AGENT_DID, { agentId: id, limit });
    } catch (e) {
      console.warn("[goldsky] agentDID filter query skipped:", e.message);
    }
  }

  if (rows.length > 0) {
    console.info(`[goldsky] ${rows.length} payments for agent ${id.slice(0, 12)}…`);
  } else {
    console.warn(
      `[goldsky] 0 payments for agent ${id.slice(0, 14)}… — subgraph has no AgentPayment rows for this DID yet (run on-chain payments via AgentPaymentSimulator for this agent), or wrong agentId`
    );
  }
  return rows;
}

/** Pad empty/short Goldsky history for local demos (not real on-chain data). */
export function syntheticAgentPayments(count) {
  const n = Math.max(0, Math.floor(Number(count)));
  if (n === 0) return [];
  const now = Math.floor(Date.now() / 1000);
  const out = [];
  for (let i = 0; i < n; i++) {
    // Deterministic non-linear pattern (still reproducible) so SampEn is not pinned at 0.
    const base = 0.12;
    const wave1 = 0.035 * Math.sin(i * 0.71);
    const wave2 = 0.018 * Math.cos(i * 0.19 + 0.6);
    const jitter = ((i * 17) % 11 - 5) * 0.0015;
    const amount = Math.max(0.01, base + wave1 + wave2 + jitter);
    const wei = BigInt(Math.round(amount * 1e18));
    out.push({
      amount: wei.toString(),
      timestamp: String(now - (n - i) * 3600),
      to: "0x0000000000000000000000000000000000000000",
      blockNumber: "0",
    });
  }
  return out;
}

/** Oldest-first amounts (wei / simulator units as decimal strings) and unix seconds for Python. */
export function historyToSeries(paymentsDesc) {
  const asc = [...paymentsDesc].reverse();
  const amounts = asc.map((p) => {
    const raw = BigInt(p.amount);
    return Number(raw) / 1e18;
  });
  const timestamps = asc.map((p) => Number(p.timestamp));
  return { amounts, timestamps };
}
