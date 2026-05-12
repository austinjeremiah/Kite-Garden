# Kite Garden

**Behavioral session key revocation for autonomous AI agents on Kite AI**

Instead of blocking AI agents when they exceed a spending limit, Kite Garden blocks them when they stop behaving like themselves — by mapping every agent's real on-chain payment history into phase space, computing its geometric complexity signature, and refusing to issue the next Kite session key the moment that signature diverges from baseline. Agent identity is anchored by a custom on-chain registry with tamper-evident baseline commitments, built entirely on Kite L1 testnet.

---

## Table of Contents

1. [Problem](#1-problem)
2. [Solution](#2-solution)
3. [How It Works — Full Technical Flow](#3-how-it-works--full-technical-flow)
4. [Math Foundation](#4-math-foundation)
5. [Architecture Overview](#5-architecture-overview)
6. [Kite AI Stack — What We Use and Why](#6-kite-ai-stack--what-we-use-and-why)
7. [Frontend — Pages, Design, and User Flow](#7-frontend--pages-design-and-user-flow)
8. [Backend — Services, APIs, and Integration](#8-backend--services-apis-and-integration)
9. [Smart Contracts](#9-smart-contracts)
10. [Goldsky Subgraph](#10-goldsky-subgraph)
11. [How Everything Connects](#11-how-everything-connects)
12. [Team Split and Responsibilities](#12-team-split-and-responsibilities)
13. [End Products Per Person](#13-end-products-per-person)
14. [Demo Structure](#14-demo-structure)
15. [Research and Prior Art](#15-research-and-prior-art)
16. [Docs and References](#16-docs-and-references)

---

## 1. Problem

When a user gives an AI agent payment authority on Kite, the only protection is a static spending rule set at the start:

- Maximum amount per transaction
- Maximum amount per day
- Expiry timestamp

These rules only ask one question: **how much?**

They never ask: **does this still look like the same agent?**

A compromised agent, a hallucinating model, or a gradually manipulated agent can operate entirely within those limits while exhibiting completely different behavior. It can change who it pays, how frequently, at what rhythm, across how many counterparties — and no existing system notices.

Three concrete attack patterns that static limits miss entirely:

**Pattern 1 — Limit-aware draining.** Attacker compromises agent. Sends 9 transactions of just under the per-transaction limit, to different unknown addresses, in rapid succession. Every single one passes. Funds leave.

**Pattern 2 — Gradual behavioral drift.** Over days, an agent is slowly manipulated via prompt injection. Each individual action is small. The cumulative behavioral shift is massive. Static limits see nothing abnormal.

**Pattern 3 — Hallucination burst.** Model starts behaving erratically due to context corruption. Begins firing payments to nonsensical targets at irregular intervals. Nothing exceeds the daily cap. Wallet drains slowly.

In all three cases, the agent's spending amount is fine. The agent's spending pattern is broken. No tool exists today to detect this difference at the session key level on a blockchain.

---

## 2. Solution

Kite Garden treats an agent's transaction history as a time series and maps it into a multi-dimensional space where the shape of the data reveals the agent's behavioral identity.

Every normal agent — one that pays the same types of services, at similar amounts, with similar timing — produces a recognizable geometric structure when its transactions are plotted this way. This structure is stable over time. It is the agent's behavioral fingerprint.

When the agent is compromised or misbehaving, its transaction pattern changes. The geometric structure shifts. This shift is mathematically detectable — not by comparing individual transactions, but by measuring how the overall shape of behavior changes.

When a shape shift is detected, Kite Garden does one thing: it does not issue the next Kite session key. Since session keys expire every 60 seconds, a refused renewal is a cryptographic freeze. The agent cannot make another payment until a human reviews and re-authorizes.

Agent identity in Kite Garden is anchored by a **Kite Agent Passport** — the official DID system for autonomous agents on Kite. Each agent has a unique Passport DID (format: `did:kite:username.eth/agenttype/name-v1`) created through the Kite Portal. The behavioral baseline for that agent is hashed and committed to the `AttractorGuard` contract on Kite L1 testnet — making the threshold tamper-evident and permanently auditable. This means the entire lifecycle of an agent — registration via Passport, baseline commitment, anomaly detection, freeze — is visible on the Kite block explorer with the Passport as the cryptographic anchor.

**The gate is behavioral, not numerical. The identity is managed by Kite's official Passport system. The baseline commitments are on-chain via AttractorGuard. This is the novel part.**

---

## 3. How It Works — Full Technical Flow

This is the complete step-by-step flow of what happens every time an AI agent attempts a payment.

### Step 1 — Agent registers with Kite Agent Passport

Before an agent can interact with Kite Garden, it must have a registered **Kite Agent Passport**. The Passport is created through the **Kite Portal** at <https://x402-portal-eight.vercel.app/>. This produces a unique Passport DID with format `did:kite:username.eth/agenttype/name-v1`. The agent's identity is now cryptographically anchored on Kite.

When registering the agent with Kite Garden (via the `/api/agents/register` endpoint), the backend stores the Passport DID and creates a baseline record. The `AgentRegistered` event is emitted from the `AttractorGuard` contract. Goldsky indexes this event immediately, linking the Passport DID to the on-chain record.

### Step 2 — Agent constructs payment intent

The agent (running as an autonomous process identified by its Kite Agent Passport DID) assembles an x402-format payment intent. This contains: the amount in testnet stablecoin, the destination address, the Passport DID, and a signed authorization from its current session key.

### Step 3 — Intent arrives at Kite Garden API

Before the payment is submitted to Kite, the agent calls the Kite Garden backend API at `POST /api/gate`. This is the gate. Nothing goes on-chain until this step completes.

### Step 4 — Backend queries Goldsky for transaction history

The backend takes the agent's Passport DID and queries the Goldsky GraphQL endpoint to fetch the agent's full on-chain transaction history indexed from Kite testnet. It retrieves: amounts, timestamps, counterparty addresses, and block numbers for the last N transactions.

### Step 5 — Two-mode behavioral analysis

The backend checks how many confirmed transactions exist for this agent.

**If fewer than 200 transactions (early-stage agent):**
The backend runs sample entropy analysis using `nolds.sampen()`. Sample entropy measures the irregularity of a time series. It works reliably at 30 or more data points. A sudden spike in entropy means the agent's payment rhythm has become unexpectedly irregular — a signal of compromise or malfunction.

**If 200 or more transactions (mature agent):**
The backend switches to full correlation dimension analysis using `nolds.corr_dim()`. It takes the transaction amount time series, applies delay embedding (Takens' theorem) to reconstruct the attractor in phase space, and computes the correlation dimension D₂ using the Grassberger-Procaccia algorithm. This produces a single number that characterizes the geometric complexity of the agent's behavioral attractor.

### Step 6 — Comparison against stored baseline

The backend compares the current metric (sample entropy or correlation dimension) against the agent's stored baseline. The baseline is the rolling mean of the last 50 computed values, with a threshold set at mean plus or minus 2 standard deviations.

Two outcomes:

**STABLE** — current metric is within threshold. The agent is behaving like itself.

**DIVERGED** — current metric has moved outside threshold. The agent is behaving differently from its established pattern.

### Step 7 — Baseline hash commitment (first time and on reset)

When an agent's baseline is first established (after 30 transactions) or reset by a human after a freeze, the backend computes a hash of the baseline parameters (mean, standard deviation, threshold multiplier, transaction count, timestamp) and calls `logDecision()` on the `AttractorGuard` contract with the baseline hash. This hash is stored on-chain permanently. Anyone can verify that the baseline has not been quietly altered between now and when it was first set.

### Step 8a — STABLE path

Backend calls `addSessionKeyRule()` on the Kite AA wallet via `gokite-aa-sdk`. A new 60-second session key is issued with the exact parameters of the requested transaction (address, function selector, value limit). The signed session key is returned to the agent. The agent submits the x402 payment intent with the session key signature. The Kite bundler processes the gasless UserOperation. The transaction executes on-chain.

Goldsky automatically indexes the new transaction. The agent's history grows by one. The baseline updates.

### Step 8b — DIVERGED path

Backend does NOT call `addSessionKeyRule()`. No session key is issued. The backend emits a `SessionKeyDenied` event from the `AttractorGuard` contract on-chain. The agent receives a rejection response with the divergence metrics included. The current session key (if any) expires naturally in under 60 seconds. The agent is frozen — it cannot submit any payment without a new session key, and no new session key is issued until a human re-authorizes.

### Step 9 — Human review

The user sees the denial event on the Kite Garden dashboard. They see: the divergence metric, the agent's recent transaction history, the behavioral chart showing where the anomaly was detected. They can choose to re-authorize (reset baseline, commit new hash on-chain, issue new session key) or permanently revoke the agent.

---

## 4. Math Foundation

### Takens' Embedding Theorem (1981)

A scalar time series (in our case, transaction amounts over time) can be used to reconstruct the full attractor of the underlying dynamical system by embedding it in a higher-dimensional space using time delays.

Given a time series `x(t)`, the delay embedding with dimension `m` and lag `τ` produces vectors:

```
v(t) = [x(t), x(t+τ), x(t+2τ), ..., x(t+(m-1)τ)]
```

These vectors, plotted in m-dimensional space, trace out the attractor of the system. For a predictable, stable agent, this attractor has a consistent, recognizable shape. For a compromised agent, the shape changes.

### Grassberger-Procaccia Correlation Dimension (1983)

Given the embedded vectors, the correlation dimension D₂ is computed by:

1. Computing all pairwise distances between embedded vectors
2. For each radius r, counting the fraction of pairs closer than r — this is the correlation integral C(r)
3. Finding the slope of log(C(r)) versus log(r) in the scaling region

The slope is D₂. A stable agent has a consistent D₂. A compromised agent has a shifted D₂.

Normal ranges observed in financial time series: D₂ between 1.5 and 3.5 for structured behavior. Values approaching the embedding dimension indicate random or noise-like behavior (potential compromise). Sudden drops indicate highly repetitive, constrained behavior (potential automated attack).

### Sample Entropy (for small N)

For agents with fewer than 200 transactions, sample entropy (SampEn) measures the probability that a sequence of m data points that matches another sequence of m points also matches at the (m+1)th point. Low SampEn means highly regular and predictable. High SampEn means irregular and complex. A sudden SampEn spike indicates the agent's payment rhythm has become unexpectedly irregular.

### Why These Two Metrics Together

SampEn handles the early-stage agent problem (small N, no reliable attractor reconstruction). Correlation dimension handles the mature agent case where the full phase space geometry is meaningful. The transition between modes happens automatically at N equals 200.

### Why On-Chain Baseline Hash

The baseline parameters (mean, standard deviation, threshold) are the core of the detection system. If someone could quietly shift these numbers in the database, they could raise the anomaly threshold and hide attacks. By hashing the baseline and committing that hash via the `AttractorGuard` contract, the baseline becomes tamper-evident. Any change to the baseline produces a new hash and a new on-chain transaction — visible, timestamped, and permanent on Kite testnet.

---

## 5. Architecture Overview

```
+----------------------------------------------------------+
|                   FRONTEND (Next.js)                     |
|  Dashboard · Agent Registry · Tx Feed · Analysis View   |
+--------------------+-------------------------------------+
                     | HTTP / REST (Next.js API routes)
+--------------------v-------------------------------------+
|              BACKEND API (Node.js / Express)             |
|  Payment Gate · Session Key Manager · Baseline Store     |
+------+---------------------------+----------------------+
       |                           |
+------v------+           +--------v--------+
|  PYTHON     |           |  GOLDSKY        |
|  MICROSERVICE|           |  GRAPHQL API    |
|  nolds math |           |  kite-ai-testnet|
|  sampen     |           |  subgraph       |
|  corr_dim   |           +--------+--------+
+-------------+                    |
                          +--------v--------+
+--------------+           |  KITE L1        |
|  gokite-aa   |           |  TESTNET        |
|  sdk         +<----------+  AgentRegistry  |
|  bundler rpc |           |  AttractorGuard |
+--------------+           |  Simulator      |
                           |  AA Wallets     |
                           +-----------------+
```

---

## 6. Kite AI Stack — What We Use and Why

### Agent Passport (Kite DID)

Every agent that interacts with Kite Garden must have a registered **Kite Agent Passport**. This is the official DID system on Kite, and it anchors the agent's identity cryptographically.

**Format:** `did:kite:username.eth/agenttype/name-v1`

**Created through:** Kite Portal at https://x402-portal-eight.vercel.app/

**Docs:** https://docs.gokite.ai/kite-agent-passport/developer-guide

The Agent Passport is the cryptographic anchor of the agent's identity on Kite. When an agent registers with Kite Garden, its Passport DID becomes the key used throughout the system to query its transaction history from Goldsky, track its baseline, and receive gate decisions. The Passport ensures that identity is managed by Kite's official system, not by a custom contract.

**Note:** Programmatic DID registration API is listed as "coming soon" in Kite docs. For now, agent DIDs are created manually through the Kite Portal before registering with Kite Garden.

### Privy AA Wallet

The user's smart contract account on Kite testnet. This is where funds live. Multiple agents operate this wallet via session keys, each with isolated spending rules.

Only supported wallet type on testnet. Initialized through the Kite Portal.

Docs: `https://docs.gokite.ai/kite-chain/account-abstraction-sdk`

### gokite-aa-sdk

npm package that wraps ERC-4337 operations on Kite. Used to:
- Initialize connection to Kite testnet and bundler
- Call `addSessionKeyRule()` with spending parameters
- Submit UserOperations via `sendUserOperationAndWait()`

Bundler RPC: `https://bundler-service.staging.gokite.ai/rpc/`
Testnet RPC: `https://rpc-testnet.gokite.ai/`

Key contract addresses on testnet:
- GokiteAccount: `0x93F5310eFd0f09db0666CA5146E63CA6Cdc6FC21`
- GokiteAccountFactory: `0xF0Fc19F0dc393867F19351d25EDfc5E099561cb7`
- Settlement Token: `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`

### Session Key Mechanism

`addSessionKeyRule(address sessionKeyAddress, bytes32 agentDID, bytes4 functionSelector, uint256 valueLimit)`

This is the payment gate. Kite Garden calls this only when behavioral analysis passes. If analysis fails, this call is never made. Session keys expire in approximately 60 seconds, so refusing to renew equals a cryptographic freeze.

### Gasless Transactions

After a session key is issued, the actual payment fires through the Kite bundler and paymaster. The agent holds zero gas. The bundler covers transaction costs.

For stablecoin transfers, EIP-3009 signed payloads can also be submitted to the gasless relayer endpoint.

### x402 Payment Protocol

The payment intent format used by agents. Built on EIP-3009 `TransferWithAuthorization`. The agent signs a typed authorization (EIP-712), attaches it as a header, and submits to a service. The service verifies and forwards to the facilitator who submits on-chain.

Spec: `https://github.com/coinbase/x402/blob/main/specs/x402-specification.md`

### Goldsky Subgraph

Indexes all on-chain events from all three contracts on `kite-ai-testnet`. Provides a GraphQL API for querying full transaction history per `agentId`, gate decisions, registration events, and baseline commitments.

Chain slug: `kite-ai-testnet`
Docs: `https://docs.goldsky.com/chains/kite-ai`

---

## 7. Frontend — Pages, Design, and User Flow

The frontend is built in Next.js. It serves two audiences: the human user who owns agents, and judges who need to understand what is happening. Every page should be immediately readable without prior explanation.

### Design Principles

The visual language is dark, monospace, terminal-adjacent. Think: a security operations dashboard, not a DeFi protocol. Color is used only for status: green for stable, amber for drifting, red for frozen. Everything else is near-black backgrounds, white text, thin borders.

Typography: monospace for all metrics, agent IDs, addresses, and numbers. Sans-serif for labels and descriptions. Never mix them within a single data element.

Layout: fixed sidebar navigation, content area fills the right side, no horizontal scrolling. All charts are inline, no modal pop-ups for primary data.

### Page 1 — Dashboard (default landing page)

This is the overview. Four metric cards at the top, full-width layout below.

**Metric cards (top row, 4 across):**
- Total registered agents (count)
- Session keys issued today (count, green)
- Session keys denied today (count, red)
- Average behavioral metric across all agents (number, colored by health)

**Agent list (left column, 60% width):**
Table with one row per agent. Columns: status dot (green/amber/red), agent name, agentId (truncated bytes32), current metric value, baseline value, deviation percentage, status badge.

Clicking any agent row navigates to that agent's detail page.

**Live transaction feed (right column, 40% width):**
Scrolling list of the last 20 payment attempts. Each row: timestamp, agent name, amount in USDC, verdict (ISSUED / DENIED / DRIFTING). Color-coded by verdict. Goldsky GraphQL polling every 5 seconds drives this feed.

No charts on the dashboard itself. Charts live on the agent detail page. The dashboard is a triage view.

### Page 2 — Agent Detail Page

Accessed by clicking any agent on the dashboard. URL: `/agent/[agentId]`

This page is the full behavioral analysis view for one agent.

**Header section:**
Agent name large and prominent. AgentId in monospace below it. Status badge. Owner wallet address. AA wallet address. On-chain registration timestamp (from Goldsky). Baseline hash (truncated, with link to Kite explorer showing the `BaselineCommitted` event). Session key status (active / expired / denied).

The baseline hash with explorer link is the detail that makes judges pause. They can click it and see the actual on-chain commitment. This is what separates Kite Garden from any other agent payment system.

**Behavioral metric panel (left, 55% width):**

Top: current metric value displayed large (for example, "SampEn: 0.847" or "D₂: 2.14"). Below it: baseline value and threshold bounds. Text indicating which mode is active (early-stage or mature).

Below that: a line chart showing the metric value over the last 50 computations. X-axis is time or transaction count. Y-axis is the metric value. Two horizontal dashed lines: baseline mean (white) and threshold ceiling (red). When the line crosses the ceiling, the background of that section of the chart turns red. This is the visual moment of detection.

Below the chart: a secondary line chart showing raw transaction amounts over time. This gives context — judges can visually see when the pattern changed.

**Transaction history table (right, 45% width):**
All transactions for this agent, newest first. Columns: block number, amount, counterparty address (truncated), time delta from previous transaction, session key verdict. Rows colored based on verdict.

**Session key panel (bottom):**
Current session key address if active. Time remaining before expiry shown as a countdown. Value limit. Function selector. A "Force Freeze" button for the user to manually deny renewal before expiry.

**Re-authorize panel (only visible when agent is frozen):**
Explanation of why the agent was frozen (metric value, threshold, timestamp). The on-chain `AgentFrozen` event link. Two buttons: "Reset Baseline and Re-authorize" (commits new baseline hash on-chain, then issues session key) and "Permanently Revoke Agent" (calls `revokeAgent` on registry).

### Page 3 — Register Agent

Simple form page. URL: `/register`

The user connects their Privy AA wallet. Then fills in:
- Agent name (text input)
- Agent wallet address (the address this agent will pay from)
- Spending limit per session key in USDC
- Threshold sensitivity (a slider from strict to lenient that maps to the standard deviation multiplier, default 2.0)

On submit, the frontend calls the backend which calls `register()` on the `AgentRegistry` contract. The returned `agentId` is shown to the user. A baseline record is created in MongoDB. The agent is now registered and will be analyzed on its first payment attempt.

The page also shows a confirmation card after registration: agent name, agentId in monospace, a link to the Kite testnet explorer showing the `AgentRegistered` event. This gives the user immediate proof their agent exists on-chain.

### Page 4 — Demo Page

URL: `/demo`

This page exists specifically for the hackathon demo. It is not a production feature — it is an honest demonstration tool.

Two side-by-side panels. Left panel is the normal agent (alice's expense agent). Right panel is the compromised agent (bob's trading agent).

Each panel shows:
- Agent name and agentId
- Live metric chart updating as Goldsky indexes new blocks
- Transaction feed specific to that agent
- Session key verdict for the most recent attempt
- Baseline hash with explorer link

A button in the right panel: "Inject Attack Pattern". Pressing this triggers the backend to fire a burst of anomalous mock transactions from the `AgentPaymentSimulator` contract — different amounts, faster timing, different recipients. Within a few block confirmations, Goldsky indexes them, the backend computes the new metric, and the chart spikes. The panel border turns red. "SESSION KEY DENIED" appears. The `AgentFrozen` event link appears below, clickable to the Kite explorer.

The left panel remains green and unaffected throughout.

This is the exact moment judges need to see.

### Page 5 — How It Works

URL: `/how-it-works`

Static explainer page. Three sections:

1. The problem with static limits — plain explanation with a simple diagram showing how a compromised agent stays under the limit while the pattern changes
2. Phase space and behavioral geometry — a static visual of what a stable attractor looks like versus a diverged one, with a plain description of what correlation dimension and sample entropy measure
3. The full flow — a step diagram of: agent registers on-chain → x402 intent → Goldsky query → math computation → session key decision → on-chain event

### Frontend to Backend Connection

All frontend data fetching goes through two sources:

**Next.js API routes** — wrap the backend Express API. The frontend never calls the backend directly; it calls `/api/...` routes in Next.js which proxy to the backend. This keeps CORS clean and avoids exposing the backend URL in the browser.

**Goldsky GraphQL** — the dashboard live feed and agent detail charts poll Goldsky directly from the frontend using `fetch` with the public GraphQL endpoint. No authentication header needed.

State management: React Query for all async data. No Redux. Polling intervals: dashboard feed every 5 seconds, agent detail charts every 10 seconds.

---

## 8. Backend — Services, APIs, and Integration

The backend is a Node.js Express server. It has one Python microservice for math. They communicate via HTTP.

### Node.js Express Server

Responsible for:
- Receiving payment gate requests from agents
- Validating x402 payment payloads
- Managing agent baseline records in MongoDB
- Calling the Python microservice for behavioral analysis
- Calling `gokite-aa-sdk` to issue or deny session keys
- Calling `AgentRegistry.sol` to commit baselines, freeze agents, and revoke agents
- Serving the frontend via Next.js API routes

#### Endpoints

**POST /api/gate**
The main payment gate. Called by an agent before every payment attempt.

Request body:
```
agentId: string (bytes32 from AgentRegistry)
amount: number (in stablecoin units)
destination: string (address)
x402Payload: object (the full signed x402 authorization)
```

Response:
```
verdict: "ISSUED" | "DENIED"
sessionKey: string | null (address of issued key, or null if denied)
metric: number (current computed value)
baseline: number
threshold: number
reason: string
explorerLink: string | null (link to AgentFrozen event if denied)
```

Internal flow of this endpoint:
1. Validate x402 payload signature and expiry
2. Check agentId exists and is active in MongoDB (cross-reference with Goldsky AgentRegistered events)
3. Fetch transaction history from Goldsky GraphQL for this agentId
4. POST history array to Python microservice at `/analyze`
5. Compare returned metric against stored baseline
6. If stable: call `gokite-aa-sdk` `addSessionKeyRule()`, return ISSUED with session key address
7. If diverged: call `AgentRegistry.freezeAgent(agentId, metricValue)` on-chain, return DENIED with metric data and explorer link
8. Update baseline rolling window in MongoDB
9. If this is a baseline commitment point (first 30 tx or after reset): call `AgentRegistry.commitBaseline(agentId, hash)`

**POST /api/agents/register**
Registers a new agent. Calls `AgentRegistry.register()` on-chain. Creates baseline record in MongoDB.

Request body:
```
name: string
walletAddress: string
ownerAddress: string
spendingLimit: number
thresholdMultiplier: number (default 2.0)
```

Response:
```
agentId: string (bytes32 returned from contract)
txHash: string (registration transaction hash)
explorerLink: string
```

**GET /api/agents**
Returns all registered agents with current status, metric value, baseline, and last decision. Powers the dashboard agent list.

**GET /api/agents/[agentId]**
Returns full detail for one agent: metric history array, baseline parameters, baseline hash (from on-chain), session key log, status.

**POST /api/agents/[agentId]/reauthorize**
Called when user approves a frozen agent. Resets baseline in MongoDB, calls `AgentRegistry.commitBaseline()` with new hash on-chain, issues a zero-value session key to mark the agent as active again.

**POST /api/agents/[agentId]/revoke**
Calls `AgentRegistry.revokeAgent()` on-chain. Marks agent as permanently revoked in MongoDB. No further session keys issued.

**POST /api/demo/inject-attack**
Demo-only endpoint. Calls `AgentPaymentSimulator.simulateAttack(agentId)` on-chain to emit a burst of anomalous payment events. Only active when `DEMO_MODE=true` in environment.

#### Database

MongoDB. Two collections:

`agents` — one document per registered agent:
```
agentId: string (bytes32)
name: string
walletAddress: string
ownerAddress: string
spendingLimit: number
thresholdMultiplier: number
mode: "early" | "mature"
transactionCount: number
baselineMean: number
baselineStdDev: number
baselineHistory: number[] (last 50 computed metrics)
baselineHash: string (last committed hash, matches on-chain)
baselineCommittedAt: timestamp
status: "active" | "frozen" | "revoked"
createdAt: timestamp
lastCheckedAt: timestamp
```

`events` — one document per gate decision:
```
agentId: string
verdict: "ISSUED" | "DENIED"
metric: number
baseline: number
deviation: number
sessionKey: string | null
onChainTxHash: string | null
explorerLink: string | null
timestamp: timestamp
```

#### Goldsky GraphQL Integration

The backend queries Goldsky for transaction history using the public GraphQL endpoint.

Query used inside `/api/gate`:
```graphql
query AgentHistory($agentId: String!, $limit: Int!) {
  agentPayments(
    where: { agentId: $agentId }
    orderBy: timestamp
    orderDirection: desc
    first: $limit
  ) {
    amount
    timestamp
    to
    blockNumber
  }
}
```

The response gives an array of amounts and timestamps. The backend converts this to two arrays: amounts for the math computation and timestamps for computing time deltas.

Goldsky endpoint format:
`https://api.goldsky.com/api/public/PROJECT_ID/subgraphs/kitegarden-kite-ai-testnet/1.0.0/gn`

Stored as environment variable `GOLDSKY_ENDPOINT`. No authentication required for read queries.

Docs: `https://docs.goldsky.com/subgraphs/querying`

#### gokite-aa-sdk Integration

The backend initializes the SDK once on startup:
```
network: 'kite_testnet'
rpcUrl: 'https://rpc-testnet.gokite.ai'
bundlerUrl: 'https://bundler-service.staging.gokite.ai/rpc/'
```

When `addSessionKeyRule()` is called, the backend signs the UserOperation using the user's delegated signing key. The SDK returns a transaction hash confirming the session key is live on-chain.

Docs: `https://docs.gokite.ai/kite-chain/account-abstraction-sdk`

#### AgentRegistry Contract Integration

The backend interacts with `AgentRegistry.sol` via ethers.js using the Kite testnet RPC. Three calls are made:

- `register(name, walletAddress)` — on agent registration, returns `agentId`
- `commitBaseline(agentId, baselineHash)` — when baseline is first set or reset
- `freezeAgent(agentId, metricValue)` — when analysis detects divergence
- `revokeAgent(agentId)` — when user permanently revokes

All calls use the backend's own signing key (a server-side wallet funded from the testnet faucet at `https://faucet.gokite.ai`).

#### x402 Payload Validation

The backend validates the x402 payload before any behavioral analysis runs. An invalid or expired authorization is rejected immediately.

Validation checks:
- EIP-712 signature validity (recover signer from typed data)
- `validBefore` timestamp not expired
- `from` address matches the agent's registered wallet address
- `value` matches the requested amount

x402 spec: `https://github.com/coinbase/x402/blob/main/specs/x402-specification.md`

### Python Microservice

Separate Flask process. Single endpoint: `POST /analyze`

Request body:
```json
{
  "amounts": [12.5, 8.0, 15.2],
  "timestamps": [1714000000, 1714000120],
  "mode": "early",
  "emb_dim": 3,
  "lag": 1
}
```

Response:
```json
{
  "metric": 0.847,
  "metric_type": "sampen",
  "data_points": 47,
  "status": "ok"
}
```

Internal logic:

If mode is `"early"` or data points are fewer than 200:
- Run `nolds.sampen(amounts, emb_dim=2, tolerance=0.2*std(amounts))`
- Return as `metric_type: "sampen"`

If mode is `"mature"` and data points are 200 or more:
- Run `nolds.corr_dim(amounts, emb_dim=emb_dim, lag=lag, fit='RANSAC')`
- Return as `metric_type: "corr_dim"`

If data points are fewer than 30:
- Return `status: "insufficient_data"` — backend defaults to ISSUED for first 30 transactions

The microservice is stateless. All state lives in MongoDB on the Node.js side.

nolds docs: `https://cschoel.github.io/nolds/nolds.html`

---

## 9. Smart Contracts

Two contracts deployed on Kite AI testnet. Written in Solidity, deployed with Hardhat.

### Contract 1 — AttractorGuard.sol

This contract records all gate decisions as on-chain events and stores agent registration data with baseline commitments.

**Stored per agent:**
```
agentDID: bytes32 (derived from Kite Agent Passport)
ownerAddress: address
spendingLimit: uint256
thresholdMultiplier: uint256
baselineHash: bytes32
baselineCommittedAt: uint256
status: enum (Active, Frozen, Revoked)
registeredAt: uint256
```

**Events emitted:**
- `AgentRegistered(agentDID, owner, spendingLimit, thresholdMultiplier, timestamp)`
- `BaselineReset(agentDID, newBaselineHash, timestamp)`
- `SessionKeyIssued(agentDID, sessionKey, amount, metricValue, timestamp)`
- `SessionKeyDenied(agentDID, amount, metricValue, baselineValue, timestamp)`
- `AgentRevoked(agentDID, owner, timestamp)`

**Functions:**
- `registerAgent(bytes32 agentDID, uint256 spendingLimit, uint256 thresholdMultiplier)` — registers agent; emits `AgentRegistered`
- `logDecision(bytes32 agentDID, bool issued, uint256 metricValue, uint256 baselineValue)` — logs gate decision; emits `SessionKeyIssued` or `SessionKeyDenied`
- `resetBaseline(bytes32 agentDID, bytes32 newBaselineHash)` — commits new baseline hash; emits `BaselineReset`
- `setAgentStatus(bytes32 agentDID, bool isActive)` — freeze/unfreeze agent
- `revokeAgent(bytes32 agentDID)` — permanently revoke agent; emits `AgentRevoked`
- `getAgent(bytes32 agentDID) returns (Agent)` — view function

This contract is the source of truth for agent state and baseline commitments. Goldsky indexes all its events.

### Contract 2 — AgentPaymentSimulator.sol

Demo-only contract. Allows the backend to emit mock payment events that Goldsky indexes. Used to seed transaction history for demo agents and to inject attack patterns during the live demo.

**Events emitted:**
- `PaymentExecuted(agentDID, amount, to, timestamp)`
- `AttackInjected(agentDID, burstSize, timestamp)`

**Functions:**
- `simulatePayment(bytes32 agentDID, uint256 amount, address to)` — emits a single payment event
- `simulateNormal(bytes32 agentDID, uint256 count)` — emits normal distribution payments
- `simulateAttack(bytes32 agentDID)` — emits anomalous burst: high amounts, fast succession, random addresses

This contract means the demo runs on real on-chain events and real Goldsky indexing. Nothing is faked client-side.

**Deployment:** Hardhat with network config pointing to `https://rpc-testnet.gokite.ai/`

**Docs:** `https://docs.gokite.ai/kite-chain/building-dapps`

---

## 10. Goldsky Subgraph

The subgraph indexes events from all three contracts and provides the GraphQL API.

### What Gets Indexed

From `AttractorGuard.sol`:
- `AgentRegistered` → stored as `Agent` entities
- `BaselineReset` → updates `Agent.baselineHash` and creates `BaselineCommit` entity
- `SessionKeyIssued` → stored as `GateDecision` with verdict ISSUED
- `SessionKeyDenied` → stored as `GateDecision` with verdict DENIED
- `AgentRevoked` → updates `Agent.status` to Revoked

From `AgentPaymentSimulator.sol`:
- `PaymentExecuted` → stored as `AgentPayment` linked to Agent

### Schema

```graphql
type Agent @entity {
  id: ID!
  didString: String!
  ownerAddress: Bytes!
  spendingLimit: BigInt!
  thresholdMultiplier: BigInt!
  baselineHash: Bytes
  baselineCommittedAt: BigInt
  status: String!
  registeredAt: BigInt!
  paymentCount: BigInt!
  payments: [AgentPayment!]! @derivedFrom(field: "agent")
  decisions: [GateDecision!]! @derivedFrom(field: "agent")
  baselineCommits: [BaselineCommit!]! @derivedFrom(field: "agent")
}

type AgentPayment @entity {
  id: ID!
  agent: Agent!
  amount: BigInt!
  to: Bytes!
  timestamp: BigInt!
  blockNumber: BigInt!
  txHash: Bytes!
}

type GateDecision @entity {
  id: ID!
  agent: Agent!
  verdict: String!
  metricValue: BigInt!
  baselineValue: BigInt!
  sessionKey: Bytes
  timestamp: BigInt!
  txHash: Bytes!
}

type BaselineCommit @entity {
  id: ID!
  agent: Agent!
  baselineHash: Bytes!
  timestamp: BigInt!
  txHash: Bytes!
}
```

### Deployment

```bash
goldsky subgraph deploy kitegarden-kite-ai-testnet/1.0.0 \
  --path ./subgraph \
  --network kite-ai-testnet
```

Or use the Goldsky no-code wizard with all three contract ABIs and addresses.

### Key Queries Used by the System

**Transaction history for math (backend gate):**
```graphql
query AgentHistory($agentDID: ID!, $limit: Int!) {
  agentPayments(
    where: { agent: $agentDID }
    orderBy: timestamp
    orderDirection: desc
    first: $limit
  ) {
    amount
    timestamp
    to
    blockNumber
  }
}
```

**Agent list for dashboard (frontend):**
```graphql
query AllAgents {
  agents(orderBy: registeredAt, orderDirection: desc) {
    id
    didString
    ownerAddress
    status
    paymentCount
    baselineHash
    baselineCommittedAt
  }
}
```

**Gate decision history for agent detail chart (frontend):**
```graphql
query AgentDecisions($agentDID: ID!) {
  gateDecisions(
    where: { agent: $agentDID }
    orderBy: timestamp
    orderDirection: asc
    first: 50
  ) {
    verdict
    metricValue
    baselineValue
    timestamp
    txHash
  }
}
```

Goldsky query docs: `https://docs.goldsky.com/subgraphs/querying`
Goldsky Kite integration: `https://docs.goldsky.com/chains/kite-ai`

---

## 11. How Everything Connects

### Connection 1 — Frontend to Backend

Next.js frontend calls only `/api/...` routes on the Next.js server. These routes proxy to the Express backend running on a separate port. Environment variable `BACKEND_URL` controls backend address. The frontend never knows the backend's direct URL.

### Connection 2 — Frontend to Goldsky

Dashboard feed and agent detail charts call the Goldsky GraphQL endpoint directly from the browser. The endpoint URL is stored as `NEXT_PUBLIC_GOLDSKY_ENDPOINT`. React Query polls every 5 to 10 seconds depending on page. No authentication needed.

### Connection 3 — Backend to Python Microservice

Express makes synchronous HTTP POST to Python Flask at `/analyze`. Request contains amounts and timestamps arrays from Goldsky. Python returns the metric value. If Python is down, Express defaults to ISSUED and logs the error. Environment variable `PYTHON_SERVICE_URL` controls Python address.

### Connection 4 — Backend to Goldsky

Express queries Goldsky via HTTP POST to GraphQL endpoint inside the `/api/gate` handler. Fetches last 500 transactions for the agentId. Parses response into amounts and timestamps arrays for the Python microservice.

### Connection 5 — Backend to Kite via gokite-aa-sdk

After Python returns STABLE, Express calls `addSessionKeyRule()` via `gokite-aa-sdk`. SDK sends UserOperation to Kite bundler RPC. Returns transaction hash when session key is live. Hash stored in MongoDB and returned to agent.

### Connection 6 — Backend to AgentRegistry Contract

After every gate decision, Express calls either `freezeAgent()` (on DENIED) or nothing (on ISSUED, registry unchanged). On baseline commitment points, Express calls `commitBaseline()`. All calls via ethers.js to Kite testnet RPC. These emit events that Goldsky then indexes, completing the audit loop.

### Connection 7 — Goldsky to Frontend (audit trail loop)

The full cycle: payment event emitted → Goldsky indexes → backend reads for math → backend makes decision → backend emits gate decision event → Goldsky indexes that → frontend reads gate decisions for charts. The baseline commitment events are also indexed, so the agent detail page can show the on-chain baseline hash with explorer links.

### Connection 8 — Agent to Backend

The autonomous agent (simulated in demo as a Node.js script) calls `POST /api/gate` before every payment. If ISSUED, it uses the returned session key to sign the x402 authorization and submit the payment to Kite. If DENIED, it logs and halts.

---

## 12. Team Split and Responsibilities

Work is divided into three parallel tracks buildable simultaneously after Day 1 setup.

### Person 1 — Blockchain and Indexing

**Primary ownership:**
- All three smart contracts (AgentRegistry, AttractorGuard, AgentPaymentSimulator)
- Contract deployment to Kite AI testnet with verified addresses
- Goldsky subgraph schema, mappings, and deployment
- gokite-aa-sdk integration in backend (session key issuance calls)
- Testnet faucet funding for demo wallets
- Seed script: 300 normal transactions per demo agent

**Docs to use:**
- `https://docs.gokite.ai/kite-chain/building-dapps`
- `https://docs.gokite.ai/kite-chain/account-abstraction-sdk`
- `https://docs.goldsky.com/chains/kite-ai`
- `https://docs.goldsky.com/subgraphs/deploying-subgraphs`
- Kite testnet explorer: `https://testnet.kitescan.ai`
- Faucet: `https://faucet.gokite.ai`

**Checkpoint for integration:**
Deliver to team: three deployed contract addresses, contract ABIs, Goldsky GraphQL endpoint URL, two demo agentIds from registry.

### Person 2 — Backend and Math

**Primary ownership:**
- Python Flask microservice with nolds
- Node.js Express API server with all endpoints
- MongoDB schema and queries
- Goldsky GraphQL query integration
- x402 payload validation
- Gate decision logic (threshold comparison, mode switching, baseline hashing)
- AgentRegistry contract calls via ethers.js (freeze, commitBaseline, revoke)
- Demo attack injection endpoint

**Docs to use:**
- `https://cschoel.github.io/nolds/nolds.html`
- `https://github.com/CSchoel/nolds`
- `https://docs.goldsky.com/subgraphs/querying`
- `https://github.com/coinbase/x402/blob/main/specs/x402-specification.md`
- nolds install: `pip install nolds`

**Checkpoint for integration:**
Deliver to team: working `POST /api/gate` endpoint returning real ISSUED or DENIED response using Person 1's Goldsky endpoint and agentIds.

### Person 3 — Frontend and Demo

**Primary ownership:**
- Next.js application setup and routing
- All five pages (Dashboard, Agent Detail, Register, Demo, How It Works)
- Goldsky GraphQL polling from browser
- Behavioral metric chart and transaction amount chart (Recharts)
- Demo page with split screen and inject attack button
- Next.js API route proxies to backend
- Environment variable setup
- Demo rehearsal with full team

**Docs to use:**
- Goldsky GraphQL endpoint (from Person 1)
- Backend API spec from this document Section 8
- `https://tanstack.com/query/latest` for React Query
- Recharts for charts

**Checkpoint for integration:**
Demo page showing live data from Goldsky and backend gate API. Attack injection showing chart spike. Agent detail page showing baseline hash with Kite explorer link.

---

## 13. End Products Per Person

### Person 1 Delivers

1. `AgentRegistry.sol` — deployed at verified Kite testnet address
2. `AttractorGuard.sol` — deployed at verified Kite testnet address
3. `AgentPaymentSimulator.sol` — deployed at verified Kite testnet address
4. Goldsky subgraph — live at public GraphQL URL indexing all three contracts
5. Seed data — 300 or more normal transactions per demo agent confirmed in Goldsky
6. Two demo agentIds — registered in AgentRegistry, known names and wallets
7. `contracts/` folder — ABIs and deployment addresses for team use
8. `scripts/seed.js` — the seeding script using AgentPaymentSimulator

### Person 2 Delivers

1. `python-service/` — Flask app with nolds at `/analyze` endpoint
2. `backend/` — Express app with all endpoints from Section 8
3. `backend/.env.example` — all required environment variables documented
4. MongoDB populated with two demo agent records with initial baselines
5. Working Goldsky integration confirmed with test query returning real data
6. Working gokite-aa-sdk call confirmed with test session key on testnet
7. Working AgentRegistry calls confirmed (freeze, commitBaseline) via ethers.js
8. `backend/README.md` — how to run locally

### Person 3 Delivers

1. `frontend/` — complete Next.js app
2. All five pages implemented and navigable
3. Dashboard with live Goldsky feed confirmed updating
4. Agent detail page with metric chart, amount chart, and baseline hash explorer link
5. Register page creating real on-chain agents
6. Demo page with split screen and working attack injection
7. `frontend/.env.example` — frontend environment variables
8. Full demo rehearsed with team at least once before submission

---

## 14. Demo Structure

The demo is 3 minutes maximum. It follows one narrative: normal agent works, compromised agent gets caught, everything is on-chain.

### Pre-demo setup (done before judges arrive)

- All three contracts deployed and verified on Kite testnet
- Goldsky subgraph live and indexing all contracts
- 300 normal transactions seeded for both demo agents
- Both agent baselines committed on-chain (BaselineCommitted events visible on explorer)
- Both agents showing as STABLE and green on dashboard
- Backend, Python microservice, and frontend all running
- Demo page open in browser

### Minute 1 — Show normal operation

Open with: "Every AI agent with payment authority today is protected only by a number — a maximum spend. Kite Garden protects agents by their behavioral identity."

Show dashboard. Two agents, both green. Click alice's agent detail. Show the metric chart — flat, stable. Point to the baseline hash: "This hash is committed on-chain. Anyone can verify what alice's normal behavior looks like." Click the explorer link. Show the BaselineCommitted event. Come back.

### Minute 2 — Show the detection

Navigate to demo page. Split screen. Both agents green.

Press "Inject Attack Pattern" on bob's side.

Wait 15 to 20 seconds.

Watch the chart spike. Panel turns red. "SESSION KEY DENIED" appears. The AgentFrozen event link appears. Click it — show the explorer with the on-chain freeze event, the metric value embedded in the event data, and the timestamp.

Point to alice: still green, still issuing. "Same system. Different behavior. Different outcome."

### Minute 3 — Show the complete audit trail

On the Kite explorer, show bob's contract event history in order:
1. AgentRegistered
2. BaselineCommitted
3. Multiple SessionKeyIssued events
4. AgentFrozen

"Every step of this agent's life is on-chain. When it was registered. When the baseline was committed. Every payment cleared. The exact moment it was frozen and why. This is not a dashboard number — this is an immutable record on Kite L1."

Final line: "Static limits check the amount. Kite Garden checks whether the agent is still itself."

---

## 15. Research and Prior Art

### Mathematical Foundations

**Takens, F. (1981).** "Detecting strange attractors in turbulence." Dynamical Systems and Turbulence, Lecture Notes in Mathematics, vol 898. Springer, Berlin, Heidelberg.
Establishes that a scalar time series can reconstruct the full attractor geometry of the underlying dynamical system via delay embedding. Theoretical basis for using transaction amounts as the input to phase space analysis.

**Grassberger, P. and Procaccia, I. (1983).** "Measuring the strangeness of strange attractors." Physica D: Nonlinear Phenomena, 9(1–2), 189–208.
Original paper defining the correlation dimension algorithm implemented by `nolds.corr_dim()`. Establishes how to compute D₂ as the slope of the correlation integral on a log-log plot.

### Direct Prior Art for the Anomaly Detection Approach

**Tellenbach, G. et al. (2019).** "Network anomaly detection based on logistic regression of nonlinear chaotic invariants." Journal of Network and Computer Applications, 148, 102447.
Applies Lyapunov exponents, correlation dimension, and entropy measures to network traffic time series for anomaly detection. This is the closest existing work — same mathematical tools, different domain. Validates that chaos-theoretic invariants work for anomaly detection in sequential behavioral data.

**Proceedings PAKDD (2006).** "Sequence Outlier Detection Based on Chaos Theory and Its Application on Stock Market."
Applies phase space reconstruction to financial time series for outlier detection. Validates that transaction-amount sequences (amounts over time) are amenable to attractor-based analysis.

### The Novel Contribution

No prior work applies correlation dimension, sample entropy, or any chaos-theoretic invariant to:
- Blockchain transaction sequences
- AI agent behavioral monitoring
- Session key governance on any blockchain

The combination of on-chain identity registry, on-chain baseline hash commitment, behavioral attractor analysis, and session key revocation on Kite L1 is confirmed novel by searches across Google Scholar, arXiv, and Semantic Scholar.

---

## 16. Docs and References

### Kite AI

| Topic | URL |
|-------|-----|
| Main docs | `https://docs.gokite.ai` |
| Core concepts | `https://docs.gokite.ai/get-started-why-kite/core-concepts-and-terminology` |
| AA SDK | `https://docs.gokite.ai/kite-chain/account-abstraction-sdk` |
| Building dApps | `https://docs.gokite.ai/kite-chain/building-dapps` |
| Smart contracts list | `https://docs.gokite.ai/blockchain-development/smart-contracts-list` |
| Gasless integration | `https://docs.gokite.ai/kite-chain/stablecoin-gasless-transfer` |
| Kite Portal | `https://x402-portal-eight.vercel.app/` |
| Testnet RPC | `https://rpc-testnet.gokite.ai/` |
| Testnet explorer | `https://testnet.kitescan.ai` |
| Faucet | `https://faucet.gokite.ai` |
| Bundler RPC | `https://bundler-service.staging.gokite.ai/rpc/` |

### Goldsky

| Topic | URL |
|-------|-----|
| Kite AI integration | `https://docs.goldsky.com/chains/kite-ai` |
| Supported networks | `https://docs.goldsky.com/chains/supported-networks` |
| Deploy subgraph | `https://docs.goldsky.com/subgraphs/deploying-subgraphs` |
| No-code subgraph | `https://docs.goldsky.com/subgraphs/guides/create-a-no-code-subgraph` |
| Querying | `https://docs.goldsky.com/subgraphs/querying` |

### x402

| Topic | URL |
|-------|-----|
| Specification | `https://github.com/coinbase/x402/blob/main/specs/x402-specification.md` |
| Awesome x402 list | `https://github.com/xpaysh/awesome-x402` |
| Quicknode guide | `https://www.quicknode.com/guides/infrastructure/how-to-use-x402-payment-required` |

### Math Libraries

| Topic | URL |
|-------|-----|
| nolds docs | `https://cschoel.github.io/nolds/nolds.html` |
| nolds GitHub | `https://github.com/CSchoel/nolds` |
| nolds PyPI | `https://pypi.org/project/nolds/` |

### Kite Testnet Contract Addresses (Existing)

| Contract | Address |
|----------|---------|
| GokiteAccount | `0x93F5310eFd0f09db0666CA5146E63CA6Cdc6FC21` |
| GokiteAccountFactory | `0xF0Fc19F0dc393867F19351d25EDfc5E099561cb7` |
| Settlement Token (stablecoin) | `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63` |
| Settlement Contract | `0x8d9FaD78d5Ce247aA01C140798B9558fd64a63E3` |
| ServiceRegistry | `0xc67a4AbcD8853221F241a041ACb1117b38DA587F` |
| ClientAgentVault Implementation | `0xB5AAFCC6DD4DFc2B80fb8BCcf406E1a2Fd559e23` |

### Kite Garden Contracts (Deploy These)

| Contract | Description |
|----------|-------------|
| AgentRegistry.sol | On-chain agent identity, baseline hash, freeze and revoke |
| AttractorGuard.sol | Gate decision audit log (SessionKeyIssued / SessionKeyDenied events) |
| AgentPaymentSimulator.sol | Demo data emitter for seeding and attack injection |

---

*Built for Kite AI Novel Track Hackathon*
*Kite Garden — session key revocation driven by transaction topology and tamper-evident on-chain baselines*
