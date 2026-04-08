# AttractorGuard

Behavioral session key revocation for autonomous AI agents on Kite AI.

Instead of blocking AI agents when they exceed a spending limit, AttractorGuard blocks them when they stop behaving like themselves — by mapping every agent's real on-chain payment history into phase space, computing its geometric complexity signature, and refusing to issue the next Kite session key the moment that signature diverges from baseline.

## Table of Contents

1. Problem
2. Solution
3. How It Works — Full Technical Flow
4. Math Foundation
5. Architecture Overview
6. Kite AI Stack — What We Use and Why
7. Frontend — Pages, Design, and User Flow
8. Backend — Services, APIs, and Integration
9. Smart Contracts
10. Goldsky Subgraph
11. How Everything Connects
12. Team Split and Responsibilities
13. End Products Per Person
14. Demo Structure
15. Research and Prior Art
16. Docs and References

## 1. Problem

When a user gives an AI agent payment authority on Kite, the only protection is a static spending rule set at the start:

- Maximum amount per transaction
- Maximum amount per day
- Expiry timestamp

These rules only ask one question: how much?

They never ask: does this still look like the same agent?

A compromised agent, a hallucinating model, or a gradually manipulated agent can operate entirely within those limits while exhibiting completely different behavior. It can change who it pays, how frequently, at what rhythm, across how many counterparties — and no existing system notices.

Three concrete attack patterns that static limits miss entirely:

Pattern 1 — Limit-aware draining. Attacker compromises agent. Sends 9 transactions of just under the per-transaction limit, to different unknown addresses, in rapid succession. Every single one passes. Funds leave.

Pattern 2 — Gradual behavioral drift. Over days, an agent is slowly manipulated via prompt injection. Each individual action is small. The cumulative behavioral shift is massive. Static limits see nothing abnormal.

Pattern 3 — Hallucination burst. Model starts behaving erratically due to context corruption. Begins firing payments to nonsensical targets at irregular intervals. Nothing exceeds the daily cap. Wallet drains slowly.

In all three cases, the agent's spending amount is fine. The agent's spending pattern is broken. No tool exists today to detect this difference at the session key level on a blockchain.

## 2. Solution

AttractorGuard treats an agent's transaction history as a time series and maps it into a multi-dimensional space where the shape of the data reveals the agent's behavioral identity.

Every normal agent — one that pays the same types of services, at similar amounts, with similar timing — produces a recognizable geometric structure when its transactions are plotted this way. This structure is stable over time. It is the agent's behavioral fingerprint.

When the agent is compromised or misbehaving, its transaction pattern changes. The geometric structure shifts. This shift is mathematically detectable — not by comparing individual transactions, but by measuring how the overall shape of behavior changes.

When a shape shift is detected, AttractorGuard does one thing: it does not issue the next Kite session key. Since session keys expire every 60 seconds, a refused renewal is a cryptographic freeze. The agent cannot make another payment until a human reviews and re-authorizes.

The gate is behavioral, not numerical. This is the novel part.

## 3. How It Works — Full Technical Flow

This is the complete step-by-step flow of what happens every time an AI agent attempts a payment.

Step 1 — Agent constructs payment intent

The agent (running as an autonomous process with a registered Kite Agent Passport) assembles an x402-format payment intent. This contains: the amount in testnet stablecoin, the destination address, the agent's DID, and a signed authorization from its current session key.

Step 2 — Intent arrives at AttractorGuard API

Before the payment is submitted to Kite, the agent calls the AttractorGuard backend API. This is the gate. Nothing goes on-chain until this step completes.

Step 3 — Backend queries Goldsky for transaction history

The backend takes the agent's DID and queries the Goldsky GraphQL endpoint to fetch the agent's full on-chain transaction history indexed from Kite testnet. It retrieves: amounts, timestamps, counterparty addresses, and block numbers for the last N transactions.

Step 4 — Two-mode behavioral analysis

The backend checks how many confirmed transactions exist for this agent.

If fewer than 200 transactions (early-stage agent): The backend runs sample entropy analysis using `nolds.sampen()`. Sample entropy measures the irregularity of a time series. It works reliably on 30+ data points. A sudden spike in entropy means the agent's payment rhythm has become unexpectedly irregular — a signal of compromise or malfunction.

If 200 or more transactions (mature agent): The backend switches to full correlation dimension analysis using `nolds.corr_dim()`. It takes the transaction amount time series, applies delay embedding (Takens' theorem) to reconstruct the attractor in phase space, and computes the correlation dimension D₂ using the Grassberger-Procaccia algorithm. This produces a single number that characterizes the geometric complexity of the agent's behavioral attractor.

Step 5 — Comparison against stored baseline

The backend compares the current metric (sample entropy or correlation dimension) against the agent's stored baseline. The baseline is the rolling mean of the last 50 computed values, with a threshold set at mean ± 2 standard deviations.

Two outcomes:

- STABLE — current metric is within threshold. The agent is behaving like itself.
- DIVERGED — current metric has moved outside threshold. The agent is behaving differently from its established pattern.

Step 6a — STABLE path

Backend calls `addSessionKeyRule()` on the Kite AA wallet via `gokite-aa-sdk`. A new 60-second session key is issued with the exact parameters of the requested transaction (address, function selector, value limit). The signed session key is returned to the agent. The agent submits the x402 payment intent with the session key signature. The Kite bundler processes the gasless UserOperation. The transaction executes on-chain.

Goldsky automatically indexes the new transaction. The agent's history grows by one. The baseline updates.

Step 7a — DIVERGED path

Backend does NOT call `addSessionKeyRule()`. No session key is issued. The agent receives a rejection response with the divergence metrics included. The current session key (if any) expires naturally in under 60 seconds. The agent is frozen — it cannot submit any payment without a new session key, and no new session key is issued until a human re-authorizes.

The divergence event is logged on-chain via a lightweight event emitted from the AttractorGuard smart contract. This creates an immutable audit trail of exactly when and why the agent was frozen.

Step 8 — Human review

The user sees the freeze event on the AttractorGuard dashboard. They see: the divergence metric, the agent's recent transaction history, the behavioral chart showing where the anomaly was detected. They can choose to re-authorize (reset baseline, issue new session key) or permanently revoke the agent's spending authority.

## 4. Math Foundation

Takens' Embedding Theorem (1981)

A scalar time series (in our case, transaction amounts over time) can be used to reconstruct the full attractor of the underlying dynamical system by embedding it in a higher-dimensional space using time delays.

Given a time series `x(t)`, the delay embedding with dimension `m` and lag `τ` produces vectors:

`v(t) = [x(t), x(t+τ), x(t+2τ), ..., x(t+(m-1)τ)]`

These vectors, plotted in m-dimensional space, trace out the attractor of the system. For a predictable, stable agent, this attractor has a consistent, recognizable shape. For a compromised agent, the shape changes.

Grassberger-Procaccia Correlation Dimension (1983)

Given the embedded vectors, the correlation dimension D₂ is computed by:

1. Computing all pairwise distances between embedded vectors
2. For each radius r, counting the fraction of pairs closer than r — this is the correlation integral C(r)
3. Finding the slope of log(C(r)) versus log(r) in the scaling region

The slope is D₂. A stable agent has a consistent D₂. A compromised agent has a shifted D₂.

Normal ranges observed in financial time series: D₂ between 1.5 and 3.5 for structured behavior. Values approaching the embedding dimension indicate random/noise-like behavior (potential compromise). Sudden drops indicate highly repetitive, constrained behavior (potential automated attack).

Sample Entropy (for small N)

For agents with fewer than 200 transactions, sample entropy (SampEn) measures the probability that a sequence of m data points that matches another sequence of m points also matches at the (m+1)th point. Low SampEn = highly regular, predictable. High SampEn = irregular, complex. A sudden SampEn spike indicates the agent's payment rhythm has become unexpectedly irregular.

Why These Two Metrics Together

SampEn handles the early-stage agent problem (small N, no reliable attractor reconstruction). Correlation dimension handles the mature agent case where the full phase space geometry is meaningful. The transition between modes happens automatically at N=200.

## 5. Architecture Overview

```text
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                  │
│  Dashboard · Agent Registry · Tx Feed · Analysis View  │
└────────────────────┬────────────────────────────────────┘
										 │ HTTP / REST
┌────────────────────▼────────────────────────────────────┐
│               BACKEND API (Node.js / Express)          │
│  Payment Gate · Session Key Manager · Baseline Store   │
└──────┬─────────────────────────┬────────────────────────┘
			 │                         │
┌──────▼──────┐         ┌────────▼────────┐
│  PYTHON     │         │  GOLDSKY        │
│  MICROSERVICE│        │  GRAPHQL API    │
│  nolds math │         │  kite-ai-testnet│
│  sampen     │         │  subgraph       │
│  corr_dim   │         └────────┬────────┘
└─────────────┘                  │
													┌───────▼─────────┐
┌─────────────┐           │  KITE L1        │
│  gokite-aa  │◄──────────│  TESTNET        │
│  sdk        │           │  Smart Contracts│
│  bundler rpc│           │  AA Wallets     │
└─────────────┘           │  Agent Passports│
													└─────────────────┘
```

## 6. Kite AI Stack — What We Use and Why

Agent Passport (Kite DID)

Every agent that interacts with AttractorGuard must have a registered Kite Agent Passport. This is the DID that anchors the agent's identity and is the key used to query its transaction history from Goldsky.

Format: `did:kite:username.eth/agenttype/name-v1`

Created through: Kite Portal at <https://x402-portal-eight.vercel.app/>

Docs: <https://docs.gokite.ai/kite-agent-passport/developer-guide>

Note: Programmatic DID registration API is listed as "coming soon" in Kite docs. For this hackathon, agent DIDs are created manually through the portal before the demo.

Privy AA Wallet

The user's smart contract account on Kite testnet. This is where funds live. Multiple agents operate this wallet via session keys, each with isolated spending rules.

Only supported wallet type on testnet. Initialized through the Kite Portal.

Docs: <https://docs.gokite.ai/kite-chain/account-abstraction-sdk>

gokite-aa-sdk

npm package that wraps ERC-4337 operations on Kite. Used to:

- Initialize connection to Kite testnet and bundler
- Call `addSessionKeyRule()` with spending parameters
- Submit UserOperations via `sendUserOperationAndWait()`

Bundler RPC: <https://bundler-service.staging.gokite.ai/rpc/>

Testnet RPC: <https://rpc-testnet.gokite.ai/>

Key contract addresses on testnet:

- GokiteAccount: `0x93F5310eFd0f09db0666CA5146E63CA6Cdc6FC21`
- GokiteAccountFactory: `0xF0Fc19F0dc393867F19351d25EDfc5E099561cb7`
- Settlement Token: `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`

Session Key Mechanism

`addSessionKeyRule(address sessionKeyAddress, bytes32 agentId, bytes4 functionSelector, uint256 valueLimit)`

This is the gate. AttractorGuard calls this only when behavioral analysis passes. If analysis fails, this call is never made. Session keys expire in ~60 seconds, so refusing to renew = freeze.

Gasless Transactions

After a session key is issued, the actual payment fires through the Kite bundler/paymaster. The agent holds zero gas. The bundler covers transaction costs.

For stablecoin transfers, EIP-3009 signed payloads can also be submitted to the gasless relayer endpoint.

x402 Payment Protocol

The payment intent format used by agents. Built on EIP-3009 `TransferWithAuthorization`. The agent signs a typed authorization (EIP-712), attaches it as a header, and submits to a service. The service verifies and forwards to the facilitator who submits on-chain.

Spec: <https://github.com/coinbase/x402/blob/main/specs/x402-specification.md>

Goldsky Subgraph

Indexes all on-chain events from the AttractorGuard contract and the AA wallet on `kite-ai-testnet`. Provides a GraphQL API for querying full transaction history per agent DID.

Chain slug: `kite-ai-testnet`

Docs: <https://docs.goldsky.com/chains/kite-ai>

## 7. Frontend — Pages, Design, and User Flow

The frontend is built in Next.js. It serves two audiences: the human user who owns agents, and judges who need to understand what is happening. Every page should be immediately readable without prior explanation.

Design Principles

The visual language is dark, monospace, terminal-adjacent. Think: a security operations dashboard, not a DeFi protocol. Color is used only for status: green for stable, amber for drifting, red for frozen. Everything else is near-black backgrounds, white text, thin borders.

Typography: monospace for all metrics, DIDs, addresses, and numbers. Sans-serif for labels and descriptions. Never mix them within a single data element.

Layout: fixed sidebar navigation, content area fills the right side, no horizontal scrolling. All charts are inline, no modal pop-ups for primary data.

Page 1 — Dashboard (default landing page)

This is the overview. Four metric cards at the top, full-width layout below.

Metric cards (top row, 4 across):

- Total registered agents (count)
- Session keys issued today (count, green)
- Session keys denied today (count, red)
- Average behavioral metric across all agents (number, colored by health)

Agent list (left column, 60% width): Table with one row per agent. Columns: status dot (green/amber/red), agent DID (truncated), current metric value, baseline value, deviation percentage, status badge.

Clicking any agent row navigates to that agent's detail page.

Live transaction feed (right column, 40% width): Scrolling list of the last 20 payment attempts. Each row: timestamp, agent DID (short), amount in USDC, verdict (ISSUED / DENIED / DRIFTING). Color-coded by verdict. Goldsky GraphQL polling every 5 seconds drives this feed.

No charts on the dashboard itself. Charts live on the agent detail page. The dashboard is a triage view.

Page 2 — Agent Detail Page

Accessed by clicking any agent on the dashboard. URL: `/agent/[did]`

This page is the full behavioral analysis view for one agent.

Header section: Full agent DID displayed in monospace. Status badge large and prominent. AA wallet address. Session key status (active / expired / denied).

Behavioral metric panel (left, 55% width):

Top: current metric value displayed large (e.g., "SampEn: 0.847" or "D₂: 2.14").

Below it: baseline value and threshold bounds. Text indicating which mode is active (early-stage / mature).

Below that: a line chart showing the metric value over the last 50 computations. X-axis is time (or transaction count). Y-axis is the metric value. Two horizontal dashed lines: baseline mean (white) and threshold ceiling (red). When the line crosses the ceiling, the background of that section of the chart turns red. This is the visual moment of detection.

Below the chart: a secondary line chart showing raw transaction amounts over time. This gives context — judges can visually see when the pattern changed.

Transaction history table (right, 45% width): All transactions for this agent, newest first. Columns: block number, amount, counterparty address (truncated), time delta from previous tx, session key verdict. Rows are colored based on verdict.

Session key panel (bottom): Current session key address (if active). Time remaining before expiry (countdown). Value limit. Function selector. A "Force Revoke" button for the user to manually deny renewal before expiry.

Re-authorize panel (only visible when agent is frozen): Explanation of why the agent was frozen (metric value, threshold, timestamp). Two buttons: "Reset Baseline and Re-authorize" and "Permanently Revoke Agent".

Page 3 — Register Agent

Simple form page. URL: `/register`

The user connects their Privy AA wallet. Then fills in:

- Agent DID (text input, with format hint)
- Agent description (optional)
- Spending limit per session key in USDC
- Threshold sensitivity (a slider from "strict" to "lenient" that maps to the standard deviation multiplier)

On submit, the backend creates a baseline record for this agent in the database, sets the initial threshold parameters, and returns a confirmation. The agent is now registered and will be analyzed on its first payment attempt.

Note: the agent's Kite Passport must already exist in the Kite Portal before registering here. This page only registers the agent with AttractorGuard's analysis layer.

Page 4 — Demo / Simulation Page

URL: `/demo`

This page exists specifically for the hackathon demo. It is not a production feature — it is an honest demonstration tool.

Two side-by-side panels. Left panel is "Normal Agent" (alice's expense agent). Right panel is "Compromised Agent" (bob's trading agent).

Each panel shows:

- Live metric chart (updating every few seconds as Goldsky indexes new blocks)
- Transaction feed specific to that agent
- Session key verdict for the most recent attempt

A button in the right panel: "Inject Attack Pattern". Pressing this triggers the backend to fire a burst of anomalous mock transactions from the compromised agent contract — different amounts, faster timing, different recipients. Within a few block confirmations, Goldsky indexes them, the backend computes the new metric, and the chart spikes. The panel turns red.

"SESSION KEY DENIED" appears.

The left panel remains green and unaffected throughout.

This is the exact moment judges need to see.

Page 5 — How It Works

URL: `/how-it-works`

Static explainer page. Not marketing, just technical. Three sections:

1. The problem with static limits — plain explanation with a simple diagram showing how a compromised agent stays under the limit
2. Phase space and behavioral geometry — a static visual of a Lorenz attractor next to a description of what it represents for agent behavior
3. The full flow — a step diagram of: x402 intent -> Goldsky query -> math computation -> session key decision

This page is for judges who want to understand the technical depth without reading the README.

Frontend to Backend Connection

All frontend data fetching goes through two sources:

Next.js API routes — wrap the backend Express API. The frontend never calls the backend directly; it calls `/api/...` routes in Next.js which proxy to the backend. This keeps CORS clean and avoids exposing the backend URL.

Goldsky GraphQL — the dashboard's live tx feed and the agent detail charts poll Goldsky directly from the frontend using `fetch` with the public GraphQL endpoint. This is fine because Goldsky's public API requires no authentication for read queries.

State management: React Query for all async data. No Redux. Polling intervals: dashboard feed every 5 seconds, agent detail charts every 10 seconds.

## 8. Backend — Services, APIs, and Integration

The backend is a Node.js Express server. It has one Python microservice for math. They communicate via HTTP.

Node.js Express Server

Responsible for:

- Receiving payment gate requests from agents
- Managing agent baseline records
- Calling the Python microservice for behavioral analysis
- Calling `gokite-aa-sdk` to issue or deny session keys
- Emitting on-chain events via the AttractorGuard contract
- Serving the frontend via Next.js API routes

Endpoints

`POST /api/gate` The main payment gate. Called by an agent before every payment attempt.

Request body:

- `agentDID: string`
- `amount: number` (in stablecoin units)
- `destination: string` (address)
- `x402Payload: object` (the full signed x402 authorization)

Response:

- `verdict: "ISSUED" | "DENIED"`
- `sessionKey: string | null` (address of issued key, or null if denied)
- `metric: number` (current computed value)
- `baseline: number`
- `threshold: number`
- `reason: string` (human-readable explanation)

Internal flow of this endpoint:

1. Fetch transaction history from Goldsky GraphQL
2. POST history array to Python microservice at `/analyze`
3. Compare returned metric against stored baseline for this agent
4. If stable: call `gokite-aa-sdk addSessionKeyRule()`, return ISSUED with session key
5. If diverged: log event on-chain, return DENIED with metric data
6. Update baseline rolling window in database

`POST /api/agents/register` Registers a new agent with AttractorGuard. Creates baseline record in database.

`GET /api/agents` Returns list of all registered agents with current status. Used by dashboard.

`GET /api/agents/[did]` Returns full detail for one agent: metric history, transaction history (from Goldsky), baseline parameters, session key log.

`POST /api/agents/[did]/reauthorize` Called when user approves a frozen agent. Resets baseline, issues new session key with zero transaction value to unfreeze.

`POST /api/agents/[did]/revoke` Permanently marks agent as revoked. No further session keys issued regardless of metrics.

`POST /api/demo/inject-attack` Demo-only endpoint. Calls the mock contract to emit a burst of anomalous payment events. Only active when `DEMO_MODE=true` in environment.

Database

MongoDB (matching existing SellerGeni stack). Two collections:

`agents` — one document per registered agent:

- `agentDID: string`
- `walletAddress: string`
- `spendingLimit: number`
- `thresholdMultiplier: number` (default 2.0 for 2σ)
- `mode: "early" | "mature"`
- `transactionCount: number`
- `baselineMean: number`
- `baselineStdDev: number`
- `baselineHistory: number[]` (last 50 computed metrics)
- `status: "active" | "frozen" | "revoked"`
- `createdAt: timestamp`
- `lastCheckedAt: timestamp`

`events` — one document per gate decision:

- `agentDID: string`
- `verdict: "ISSUED" | "DENIED"`
- `metric: number`
- `baseline: number`
- `deviation: number`
- `sessionKey: string | null`
- `txHash: string | null` (on-chain log tx)
- `timestamp: timestamp`

Goldsky GraphQL Integration

The backend queries Goldsky for transaction history using the public GraphQL endpoint generated after subgraph deployment.

Query used in `/api/gate`:

```graphql
query AgentHistory($did: String!, $limit: Int!) {
	agentPayments(
		where: { agentDID: $did }
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

The response gives an array of amounts and timestamps. The backend converts this to two arrays: amounts (for the math) and timestamps (for computing time deltas).

Goldsky endpoint format:

`https://api.goldsky.com/api/public/PROJECT_ID/subgraphs/attractorguard-kite-ai-testnet/1.0.0/gn`

This endpoint is stored as an environment variable. No authentication required for read queries.

Docs: <https://docs.goldsky.com/subgraphs/querying>

gokite-aa-sdk Integration

The backend initializes the SDK once on startup:

SDK initialized with:

- `network: 'kite_testnet'`
- `rpcUrl: 'https://rpc-testnet.gokite.ai'`
- `bundlerUrl: 'https://bundler-service.staging.gokite.ai/rpc/'`

When `addSessionKeyRule()` is called, the backend signs the UserOperation using the user's delegated signing key (held server-side for demo purposes; in production this would be a hardware enclave or user-side signing).

The SDK returns a transaction hash confirming the session key is live on-chain. This hash is stored in the `events` collection and returned to the agent.

Docs: <https://docs.gokite.ai/kite-chain/account-abstraction-sdk>

x402 Integration

The backend validates the x402 payload included in the gate request before doing any behavioral analysis. An invalid or expired x402 authorization is rejected immediately without consulting the math microservice.

Validation checks:

- Signature validity (EIP-712 typed data recovery)
- `validBefore` timestamp not expired
- `from` address matches the agent's registered wallet
- `value` matches the requested amount

x402 spec: <https://github.com/coinbase/x402/blob/main/specs/x402-specification.md>

Python Microservice

Separate process running Flask. Single endpoint: `POST /analyze`

Request body:

```json
{
	"amounts": [12.5, 8.0, 15.2],
	"timestamps": [1714000000, 1714000120],
	"mode": "early" | "mature",
	"emb_dim": 3,
	"lag": 1
}
```

Response:

```json
{
	"metric": 0.847,
	"metric_type": "sampen" | "corr_dim",
	"data_points": 47,
	"status": "ok" | "insufficient_data"
}
```

Internal logic:

If mode is `"early"` or data points < 200:

- Run `nolds.sampen(amounts, emb_dim=2, tolerance=0.2*std(amounts))`
- Return result as `metric_type: "sampen"`

If mode is `"mature"` and data points >= 200:

- Run `nolds.corr_dim(amounts, emb_dim=emb_dim, lag=lag, fit='RANSAC')`
- Return result as `metric_type: "corr_dim"`

If data points < 30:

- Return `status: "insufficient_data"`
- Backend defaults to ISSUED until baseline is established (first 30 transactions always pass to allow baseline to form)

The microservice is stateless. All state (baselines, agent records) lives in MongoDB on the Node.js side.

nolds docs: <https://cschoel.github.io/nolds/nolds.html>

nolds GitHub: <https://github.com/CSchoel/nolds>

## 9. Smart Contracts

Two contracts deployed on Kite AI testnet. Written in Solidity, deployed with Hardhat.

Contract 1 — AttractorGuard.sol

This contract does two things: records gate decisions as on-chain events, and stores agent registration data.

Events emitted:

- `SessionKeyIssued(agentDID, sessionKey, amount, metricValue, timestamp)`
- `SessionKeyDenied(agentDID, amount, metricValue, baselineValue, timestamp)`
- `AgentRegistered(agentDID, owner, spendingLimit, timestamp)`
- `AgentRevoked(agentDID, owner, timestamp)`
- `BaselineReset(agentDID, newBaseline, timestamp)`

These events are what Goldsky indexes. Every gate decision is permanently on-chain.

Functions:

- `registerAgent(bytes32 agentDID, uint256 spendingLimit)` — called on agent registration
- `logDecision(bytes32 agentDID, bool issued, uint256 metricValue, uint256 baselineValue)` — called by backend on every gate decision
- `revokeAgent(bytes32 agentDID)` — called when user permanently revokes

The backend calls these functions via ethers.js using the Kite testnet RPC.

Contract 2 — AgentPaymentSimulator.sol

Demo-only contract. Allows the backend to emit mock payment events that Goldsky will index. Used to seed transaction history for demo agents and to inject attack patterns during the live demo.

Events emitted:

- `PaymentExecuted(agentDID, amount, to, timestamp)`
- `AttackInjected(agentDID, burstSize, timestamp)`

Functions:

- `simulatePayment(bytes32 agentDID, uint256 amount, address to)` — emits a single payment event
- `simulateNormal(bytes32 agentDID, uint256 count)` — emits count payments with normal distribution amounts and timing
- `simulateAttack(bytes32 agentDID)` — emits a burst of anomalous payments: high amounts, fast succession, random addresses

This contract is the demo data source. It means the demo runs on real on-chain events, real Goldsky indexing, and real math — nothing is faked client-side.

Deployment target: Kite AI testnet using Hardhat with network config pointing to `https://rpc-testnet.gokite.ai/`.

Docs for deploying on Kite: <https://docs.gokite.ai/kite-chain/building-dapps>

## 10. Goldsky Subgraph

The subgraph indexes events from both contracts and provides the GraphQL API.

What Gets Indexed

From `AttractorGuard.sol`:

- All `SessionKeyIssued` events -> stored as `GateDecision` entities with `verdict: "ISSUED"`
- All `SessionKeyDenied` events -> stored as `GateDecision` entities with `verdict: "DENIED"`
- All `AgentRegistered` events -> stored as `Agent` entities
- `AgentRevoked` events -> updates `Agent.status`

From `AgentPaymentSimulator.sol`:

- All `PaymentExecuted` events -> stored as `AgentPayment` entities linked to the agent

Schema

Three entity types:

- `Agent` — one per registered agent DID. Tracks payment count, first/last seen, current status.
- `AgentPayment` — one per payment event. Stores amount, timestamp, recipient, block number, transaction hash. Linked to parent Agent.
- `GateDecision` — one per gate call. Stores verdict, metric value, baseline, session key address (if issued), timestamp. Linked to parent Agent.

Deployment

The subgraph is deployed using Goldsky CLI:

```bash
goldsky subgraph deploy attractorguard-kite-ai-testnet/1.0.0 --path ./subgraph --network kite-ai-testnet
```

Or using the no-code wizard in the Goldsky dashboard with the contract ABIs and addresses.

After deployment, the GraphQL endpoint is available immediately. No authentication needed for queries.

Key Queries Used by the System

- Agent list for dashboard: fetches all agents with their payment count and last decision verdict.
- Transaction history for math: fetches last N payment amounts and timestamps for a specific agent DID. This is the array fed into the Python microservice.
- Gate decision history for agent detail page: fetches the last 50 gate decisions for an agent, including metric values, to power the behavioral chart.

Goldsky query docs: <https://docs.goldsky.com/subgraphs/querying>

Goldsky Kite integration: <https://docs.goldsky.com/chains/kite-ai>

## 11. How Everything Connects

This section describes the exact data flow between every component, so it is clear what calls what and in what order.

Connection 1 — Frontend <-> Backend

The Next.js frontend communicates with the Node.js backend exclusively through Next.js API routes (`/pages/api/...` or `/app/api/...`). These routes are thin proxies that forward requests to the Express server running on a separate port (e.g., 3001).

Example: when the dashboard loads, it calls `GET /api/agents` on the Next.js server, which forwards to `GET http://localhost:3001/api/agents` on Express, which queries MongoDB and returns the agent list.

This is the only coupling between frontend and backend. Environment variable `BACKEND_URL` controls the backend address.

Connection 2 — Frontend <-> Goldsky

The dashboard's live transaction feed and the agent detail charts call the Goldsky GraphQL endpoint directly from the browser using `fetch`. The endpoint URL is stored as a Next.js public environment variable (`NEXT_PUBLIC_GOLDSKY_ENDPOINT`). No authentication header needed.

React Query manages polling (every 5–10 seconds depending on the page). On fresh data, charts re-render with the new data points appended.

Connection 3 — Backend <-> Python Microservice

The Node.js Express server makes synchronous HTTP POST requests to the Python Flask microservice when a gate decision is being processed. The Python server runs on a separate port (e.g., 5001).

The request contains the raw amounts and timestamps arrays extracted from Goldsky. The Python server runs `nolds` and returns the metric value. The Express server then uses this value for threshold comparison.

If the Python microservice is down, the Express server defaults to ISSUED (fail-open) but logs the error. This is a deliberate choice for the hackathon — we do not want a microservice crash to freeze all agents.

Environment variable `PYTHON_SERVICE_URL` controls the Python microservice address.

Connection 4 — Backend <-> Goldsky

The Express server queries Goldsky via HTTP POST to the GraphQL endpoint. This happens inside the `/api/gate` endpoint handler, after receiving the agent DID. The query fetches the last 500 transactions for that agent (capped at 500 for performance). If fewer than 500 exist, all available are returned.

The response is parsed to extract `amounts` and `timestamps` arrays. These arrays are what gets sent to the Python microservice.

Connection 5 — Backend <-> Kite (gokite-aa-sdk)

After the Python microservice returns STABLE (metric within threshold), the Express server calls `addSessionKeyRule()` via the `gokite-aa-sdk`. This call goes to the Kite bundler RPC, which packages a UserOperation and submits it to Kite testnet.

The SDK returns a transaction hash when the session key is live. This hash is stored in MongoDB and returned to the agent in the gate response.

If the metric indicates DIVERGED, this call is never made. The backend skips directly to logging the denial event.

Connection 6 — Backend <-> AttractorGuard Contract

After every gate decision (ISSUED or DENIED), the backend calls `logDecision()` on the AttractorGuard contract via ethers.js and the Kite testnet RPC. This emits an on-chain event that Goldsky then indexes.

This creates the complete audit loop: Goldsky indexes payment events -> backend reads them for math -> backend makes decision -> backend writes decision event -> Goldsky indexes that too -> frontend reads both from Goldsky.

Connection 7 — Agent <-> Backend

The autonomous AI agent (simulated in the demo as a Node.js script) calls `POST /api/gate` before every payment. The agent waits for the response. If ISSUED, it uses the returned session key to sign the x402 authorization and submit the payment to Kite. If DENIED, it logs the denial and halts.

In the demo, the "agent" is a script that fires payment requests in a loop on a timer. For the normal agent, the amounts and timing follow a stable distribution. For the compromised agent, after the "inject attack" button is pressed, the distribution changes dramatically.

## 12. Team Split and Responsibilities

The work is divided into three parallel tracks that can be built simultaneously after Day 1 setup. The integration points are well-defined enough that each person can work independently and connect at specific checkpoints.

Person 1 — Blockchain and Indexing

Primary ownership:

- Smart contract development (`AttractorGuard.sol` and `AgentPaymentSimulator.sol`)
- Contract deployment to Kite AI testnet
- Goldsky subgraph deployment and schema
- `gokite-aa-sdk` integration in the backend (session key issuance calls only)
- Testnet faucet setup for demo agents
- Agent Passport creation in Kite Portal for demo agents

What Person 1 delivers:

- Two deployed contracts on Kite testnet with verified addresses
- Live Goldsky subgraph with GraphQL endpoint URL
- A working session key issuance call from Node.js using gokite-aa-sdk
- Contract ABIs for Person 3 to use in frontend
- A seed script that populates 300 normal transactions for demo agents

Docs to use:

- <https://docs.gokite.ai/kite-chain/building-dapps>
- <https://docs.gokite.ai/kite-chain/account-abstraction-sdk>
- <https://docs.goldsky.com/chains/kite-ai>
- <https://docs.goldsky.com/subgraphs/deploying-subgraphs>
- <https://docs.gokite.ai/kite-agent-passport/developer-guide>

Kite testnet explorer: <https://testnet.kitescan.ai>

Faucet: <https://faucet.gokite.ai>

Checkpoint for integration: Goldsky endpoint URL + contract addresses + ABI files. Person 2 and 3 need these to connect.

Person 2 — Backend and Math

Primary ownership:

- Python Flask microservice with `nolds`
- Node.js Express API server
- MongoDB schema and queries
- Goldsky GraphQL query integration
- x402 payload validation logic
- Gate decision logic (threshold comparison, mode switching)
- Demo attack injection endpoint
- Environment configuration

What Person 2 delivers:

- Python microservice running locally (and deployable) that accepts amounts array and returns metric value
- Express API server with all endpoints documented in Section 8
- MongoDB collections initialized with correct schema
- Working Goldsky GraphQL queries returning real data from Person 1's subgraph
- Full gate logic that connects Goldsky -> Python math -> threshold comparison -> session key call

Docs to use:

- <https://cschoel.github.io/nolds/nolds.html>
- <https://github.com/CSchoel/nolds>
- <https://docs.goldsky.com/subgraphs/querying>
- <https://github.com/coinbase/x402/blob/main/specs/x402-specification.md>

nolds pip install: `pip install nolds`

Checkpoint for integration: Working `/api/gate` endpoint that Person 3's frontend can call, with a test agent DID returning a real ISSUED or DENIED response.

Person 3 — Frontend and Demo Orchestration

Primary ownership:

- Next.js application setup and routing
- All five pages (Dashboard, Agent Detail, Register, Demo, How It Works)
- Goldsky GraphQL polling from browser
- Charts (behavioral metric chart, transaction amount chart)
- Demo page and attack injection button
- Environment variables and API route proxies
- Final demo script rehearsal and execution

What Person 3 delivers:

- Complete Next.js application with all pages functional
- Live dashboard pulling from Goldsky and backend
- Agent detail page with real-time updating charts
- Demo page that shows the split-screen normal vs. compromised comparison
- Working "Inject Attack" button that triggers Person 2's demo endpoint and shows the spike on the chart in real time

Docs to use:

- Goldsky GraphQL endpoint (from Person 1)
- Backend API spec (from Person 2)
- <https://tanstack.com/query/latest> (React Query for polling)
- Chart library: Recharts (already works in Next.js, no canvas issues)

Checkpoint for integration: Demo page showing live data from both Goldsky and the backend gate API, with the attack injection working end to end.

## 13. End Products Per Person

At the end of the hackathon, each person has a concrete set of deliverables that can be pointed to independently.

Person 1 Delivers

1. `AttractorGuard.sol` — deployed at a verified Kite testnet address
2. `AgentPaymentSimulator.sol` — deployed at a verified Kite testnet address
3. Goldsky subgraph — live at a public GraphQL URL, indexing both contracts
4. Seed data — 300+ normal transactions per demo agent, confirmed in Goldsky
5. Agent Passport entries — two demo agents registered in Kite Portal with known DIDs
6. `contracts/` folder — ABIs and deployment addresses for team use
7. `scripts/seed.js` — the seeding script

Person 2 Delivers

1. `python-service/` — Flask app with `nolds` running at `/analyze`
2. `backend/` — Express app with all endpoints from Section 8
3. `backend/.env.example` — all required environment variables documented
4. MongoDB populated with two demo agent records with baselines set
5. Working Goldsky integration confirmed with a test query returning real data
6. Working gokite-aa-sdk call confirmed with a test session key on testnet
7. `backend/README.md` — how to run the backend locally

Person 3 Delivers

1. `frontend/` — complete Next.js app
2. All five pages implemented and navigable
3. Dashboard with live Goldsky feed (confirmed updating)
4. Agent detail page with metric and amount charts
5. Demo page with split screen and attack injection button
6. `frontend/.env.example` — frontend environment variables
7. Demo rehearsal completed with Person 1 and 2 at least once before submission

## 14. Demo Structure

The demo is 3 minutes maximum. It follows a single narrative: normal agent works, compromised agent gets caught.

Pre-demo setup (done before judges arrive)

- Both demo contracts deployed and verified on Kite testnet
- Goldsky subgraph live and indexing
- 300 normal transactions seeded for both demo agents (alice's expense agent and bob's trading agent)
- Both agent baselines computed and stored in MongoDB
- Frontend running and showing both agents as STABLE (green)
- Backend and Python microservice running
- Demo page open in browser, not minimized

Minute 1 — Show the problem (30 seconds talking, 30 seconds showing)

Open with one sentence: "AI agents with payment authority today are only protected by a maximum spend amount. Here is what that misses."

Show the dashboard. Point to bob's agent. Click into its detail page. Show the metric chart — flat, stable, green. Now explain: "If this agent gets compromised and stays under the limit, nothing here would have caught it."

Minute 2 — Show the detection

Navigate to the Demo page. Split screen: alice (normal) on the left, bob (compromised) on the right. Both are green and stable.

Press "Inject Attack Pattern" on bob's side.

Wait 15–20 seconds while transactions confirm and Goldsky indexes them.

Watch the chart update. Bob's metric spikes above the red threshold line. The panel border turns red. "SESSION KEY DENIED" appears.

On alice's side: nothing changed. Still green. Still issuing.

Point to the transaction feed on bob's side: "The amounts were not large. The frequency was not extreme. But the pattern stopped looking like bob's agent. That's what we caught."

Minute 3 — Show the on-chain proof

Open Kite testnet explorer. Show the `SessionKeyDenied` event emitted from the AttractorGuard contract. Show the timestamp matches the denial shown on the frontend.

Navigate back to bob's detail page. Show the gate decision history table: ISSUED, ISSUED, ISSUED, DENIED. Show the metric values in the table — the number that crossed the threshold.

Final line: "Static limits check the amount. AttractorGuard checks whether the agent is still itself. That is the difference."

## 15. Research and Prior Art

Mathematical Foundations

Takens, F. (1981). "Detecting strange attractors in turbulence." Dynamical Systems and Turbulence, Lecture Notes in Mathematics, vol 898. Springer. This establishes that a scalar time series can reconstruct the full attractor of the underlying dynamical system via delay embedding. The theoretical basis for using transaction amounts to represent agent behavior in phase space.

Grassberger, P. & Procaccia, I. (1983). "Measuring the strangeness of strange attractors." Physica D: Nonlinear Phenomena, 9(1–2), 189–208. The original paper defining the correlation dimension algorithm implemented in `nolds.corr_dim()`. Establishes how to compute D₂ as the slope of the correlation integral on a log-log plot.

Direct Prior Art for the Application

Tellenbach, G. et al. (2019). "Network anomaly detection based on logistic regression of nonlinear chaotic invariants." Journal of Network and Computer Applications, 148, 102447. This is the closest existing work: applies Lyapunov exponents, correlation dimension, and entropy measures to network traffic time series for anomaly detection — the same mathematical tools, applied to a different domain. Validates that these chaos-theoretic invariants work for anomaly detection in sequential data.

Springer (2006). "Sequence Outlier Detection Based on Chaos Theory and Its Application on Stock Market." PAKDD Workshop. Applies phase space reconstruction to financial time series for outlier detection. Validates that transaction-style data (amounts over time) is amenable to attractor-based analysis.

The Novel Contribution

No prior work applies correlation dimension, sample entropy, or any chaos-theoretic invariant to:

- Blockchain transaction sequences
- AI agent behavioral monitoring
- Session key governance on any chain

This is confirmed by searches across Google Scholar, arXiv, and Semantic Scholar. The application domain is new.

## 16. Docs and References

### Kite AI

| Topic | URL |
|---|---|
| Main docs | <https://docs.gokite.ai> |
| Core concepts | <https://docs.gokite.ai/get-started-why-kite/core-concepts-and-terminology> |
| AA SDK | <https://docs.gokite.ai/kite-chain/account-abstraction-sdk> |
| Building dApps | <https://docs.gokite.ai/kite-chain/building-dapps> |
| Agent Passport developer guide | <https://docs.gokite.ai/kite-agent-passport/developer-guide> |
| Service provider guide | <https://docs.gokite.ai/kite-agent-passport/service-provider-guide> |
| Testnet notice | <https://docs.gokite.ai/kite-agent-passport/testnet-notice> |
| Smart contracts list | <https://docs.gokite.ai/blockchain-development/smart-contracts-list> |
| Gasless integration | <https://docs.gokite.ai/kite-chain/stablecoin-gasless-transfer> |
| Kite Portal | <https://x402-portal-eight.vercel.app/> |
| Testnet RPC | <https://rpc-testnet.gokite.ai/> |
| Testnet explorer | <https://testnet.kitescan.ai> |
| Faucet | <https://faucet.gokite.ai> |
| Bundler RPC | <https://bundler-service.staging.gokite.ai/rpc/> |

### Goldsky

| Topic | URL |
|---|---|
| Kite AI integration | <https://docs.goldsky.com/chains/kite-ai> |
| Supported networks | <https://docs.goldsky.com/chains/supported-networks> |
| Deploy subgraph | <https://docs.goldsky.com/subgraphs/deploying-subgraphs> |
| No-code subgraph | <https://docs.goldsky.com/subgraphs/guides/create-a-no-code-subgraph> |
| Querying | <https://docs.goldsky.com/subgraphs/querying> |

### x402

| Topic | URL |
|---|---|
| Specification | <https://github.com/coinbase/x402/blob/main/specs/x402-specification.md> |
| Awesome x402 list | <https://github.com/xpaysh/awesome-x402> |
| Quicknode guide | <https://www.quicknode.com/guides/infrastructure/how-to-use-x402-payment-required> |

### Math Libraries

| Topic | URL |
|---|---|
| nolds docs | <https://cschoel.github.io/nolds/nolds.html> |
| nolds GitHub | <https://github.com/CSchoel/nolds> |
| nolds PyPI | <https://pypi.org/project/nolds/> |

### Kite Testnet Contract Addresses

| Contract | Address |
|---|---|
| GokiteAccount | `0x93F5310eFd0f09db0666CA5146E63CA6Cdc6FC21` |
| GokiteAccountFactory | `0xF0Fc19F0dc393867F19351d25EDfc5E099561cb7` |
| Settlement Token (stablecoin) | `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63` |
| Settlement Contract | `0x8d9FaD78d5Ce247aA01C140798B9558fd64a63E3` |
| ServiceRegistry | `0xc67a4AbcD8853221F241a041ACb1117b38DA587F` |
| ClientAgentVault Implementation | `0xB5AAFCC6DD4DFc2B80fb8BCcf406E1a2Fd559e23` |

Built for Kite AI Novel Track Hackathon.

AttractorGuard — session key revocation driven by transaction topology and behavioral drift detection.
