# KiteGarden

**Behavioral session key revocation for autonomous AI agents on Kite AI**

Static spending limits ask one question — *how much?* KiteGarden asks a different one — *does this still look like the same agent?* Every agent's real on-chain payment history is mapped into phase space, its geometric complexity signature is computed using chaos-theory invariants (Sample Entropy / correlation dimension), and the moment that signature diverges from baseline the next Kite session key is refused. Identity is anchored by the **Kite Agent Passport** DID system; behavioral baselines are hashed and committed on-chain, making the threshold itself tamper-evident.

> *Static limits check the amount. KiteGarden checks whether the agent is still itself.*

---

## Why this matters

When a user gives an AI agent payment authority, the only protection today is a static rule set: max-per-tx, max-per-day, expiry. None of them ask whether the agent's **behavior** has changed. Three concrete attack patterns existing systems miss entirely:

1. **Limit-aware draining** — attacker compromises agent, fires nine payments just under the per-tx limit to unknown addresses in rapid succession. Every single one passes. Funds leave.
2. **Gradual behavioral drift** — prompt injection slowly manipulates an agent over days. Each individual action is small. The cumulative behavioral shift is massive. Static limits see nothing abnormal.
3. **Hallucination burst** — model starts firing payments to nonsensical targets at irregular intervals because of context corruption. Nothing exceeds the daily cap. Wallet drains slowly.

In all three the **amount** is fine. The **pattern** is broken. No tool today detects that at the session-key level on a blockchain.

KiteGarden treats the agent's transaction history as a **time series in phase space**. A well-behaved agent traces out a recognizable geometric structure — its *behavioral attractor*. A compromised agent's geometry collapses or deforms. That shift is detectable mathematically, in real-time, with sub-second math.

---

## How it works

```
                  ┌──────────────────────────────────────┐
                  │   Frontend (Next.js 16)              │
                  │   Dashboard · Register · Your Garden │
                  │   Web3Auth wallet · 3D attractor     │
                  └────────────────┬─────────────────────┘
                                   │ REST
                  ┌────────────────▼─────────────────────┐
                  │   Backend (Express)                  │
                  │   Gate · Sessions · Baselines · AA   │
                  └──────┬─────────┬─────────┬───────────┘
                         │         │         │
                ┌────────▼─┐  ┌────▼────┐  ┌─▼───────────┐
                │  Python  │  │ Goldsky │  │ Kite L1     │
                │  nolds   │  │ Subgraph│  │ Testnet     │
                │  SampEn  │  │ GraphQL │  │ Contracts   │
                │  D₂      │  └────┬────┘  └─┬───────────┘
                └──────────┘       │         │
                                   └─────────┘ (indexes events)
```

**End-to-end flow on every payment attempt:**

1. Agent (DID anchored in **Kite Agent Passport**) signs an x402 payment intent
2. Frontend / agent calls `POST /api/gate`
3. Backend fetches full on-chain payment history from **Goldsky** subgraph (last N transactions for that agentId)
4. Amounts are converted from indexed wei to a float series (÷ 1e18) and posted to the Python micro-service
5. Python service computes the chaos-theory metric:
   - `< 200 tx` → **Sample Entropy** (rhythm irregularity)
   - `≥ 200 tx` → **Correlation Dimension D₂** (full attractor geometry)
6. Backend compares the metric to the rolling baseline (`mean ± thresholdMultiplier × σ`)
7. **STABLE** → 60s Kite session key issued via AA SDK, `logDecision(issued=true)` written on-chain, baseline-history rolling window updated
8. **DIVERGED** → no session key, `logDecision(issued=false)` written, `AgentFrozen` event emitted, MongoDB status flipped to `frozen`, agent halts until a human re-authorizes
9. Every event — register, payment, decision, freeze, reset, revoke — is indexed by Goldsky so the next gate run has fresh history

---

## Behavioral geometry — the math in depth

### Phase space — why we project at all

Most fraud / anomaly systems flag deviations from an **average** (e.g. "amount > 2× mean"). That is a one-dimensional view: a single number per transaction. An attacker who mimics the average defeats it.

KiteGarden does not look at single transactions. It looks at the **shape traced out by the entire history** when you embed the time series in higher dimensions. The shape is the agent's *behavioral fingerprint* — geometric, multi-dimensional, hard to forge.

The mathematical tool that makes this rigorous is **Takens' delay-embedding theorem (1981)**:

> Given a scalar time series `x(t)`, the delay embedding with dimension `m` and lag `τ` produces vectors
> ```
> v(t) = [x(t), x(t+τ), x(t+2τ), …, x(t+(m-1)τ)]
> ```
> Plotted in m-dimensional space, these vectors **reconstruct the attractor of the underlying dynamical system**.

So a 1D amount series like `[12.5, 8.0, 15.2, 11.1, 9.4, …]` becomes a cloud of 3D points (for `m=3`, `τ=3`):
```
v(0) = [12.5, 11.1, 9.4, …]
v(1) = [8.0, 9.4, …]
…
```
A stable agent's points trace a tight, recognizable manifold. A compromised agent's points scatter or collapse to a different shape.

### Sample Entropy — the early-stage metric

For an agent with fewer than 200 payments we cannot reliably reconstruct an attractor (too few points). Instead we measure **rhythm regularity** using **Sample Entropy (SampEn)**:

> The probability that a sequence of `m` data points matching another sequence of `m` points also matches at the `(m+1)`th point.

- Low SampEn → highly regular and predictable
- High SampEn → irregular, complex, unpredictable

A sudden SampEn **spike** means the agent's payment rhythm has become unexpectedly irregular — the classic signature of a context-corrupted or hijacked agent.

We use `nolds.sampen(amounts, emb_dim=2, tolerance=0.2 * std)`.

### Correlation dimension D₂ — the mature-agent metric

Once the agent has 200+ transactions we switch to **correlation dimension D₂** (Grassberger-Procaccia, 1983):

1. Take all pairs of embedded vectors and compute pairwise distances
2. For each radius `r`, count the fraction of pairs closer than `r` — this is the correlation integral `C(r)`
3. The **slope of `log C(r)` vs `log r`** in the scaling region is `D₂`

Intuition: `D₂` is a fractal-style measure of how "filled out" the attractor is. Structured behaviour stays in a narrow band; chaotic behaviour fills more dimensions.

| `D₂` value | Interpretation |
|---|---|
| **1.5 – 3.5** | Healthy structured behaviour. Stable agent. |
| **→ embedding dim (e.g. 3+)** | Random / noise-like. Possible compromise. |
| **Sudden drop toward 0** | Highly repetitive constrained behaviour. Possible automated attack. |

We use `nolds.corr_dim(amounts, emb_dim=3, lag=1, fit='RANSAC')`. RANSAC fitting is robust to the inevitable outliers in real payment histories.

### Why two metrics, switched automatically

| Mode | When | Why |
|---|---|---|
| `early` (SampEn) | `n < 200` | Reliable on small N. Detects rhythm spikes. |
| `mature` (D₂) | `n ≥ 200` | Phase-space geometry becomes meaningful. Detects pattern-shape shifts. |

The transition is automatic, per-agent, based on `transactionCount` in MongoDB.

### Tamper-evident baseline hash

The baseline parameters (`mean`, `stdDev`, `thresholdMultiplier`, `transactionCount`, `ts`) are hashed with `keccak256` and committed on-chain via `AttractorGuard.resetBaseline()`. If anyone quietly raises the threshold in MongoDB to hide an attack, the hash diverges from the on-chain commitment and the tampering is provable.

---

## Per-agent attractor signatures

The 3D visualisation on the **Your Garden** page does more than look pretty — each agent gets a **different attractor system**, deterministically picked from its `agentId` hash. This means every agent has its **own visual behavioural fingerprint** at a glance.

The five attractor systems we rotate through:

### 1. Lorenz attractor — the classic butterfly
```
dx/dt = σ(y − x)
dy/dt = x(ρ − z) − y
dz/dt = xy − βz
```
With `σ = 10`, `ρ = 28`, `β = 8/3` you get the iconic two-winged butterfly. Discovered by Edward Lorenz in 1963 while modelling atmospheric convection — the first known example of deterministic chaos. Our default agent geometry.

### 2. Rössler attractor — single-wing spiral with a fold
```
dx/dt = −y − z
dy/dt = x + ay
dz/dt = b + z(x − c)
```
With `a = 0.2`, `b = 0.2`, `c = 5.7` it traces a single flat spiral that periodically folds upward. Simpler than Lorenz — only one nonlinear term — but still chaotic. Visually distinct: a flat coil rather than two wings.

### 3. Aizawa attractor — twisted 3D rosette
```
dx/dt = (z − b)x − dy
dy/dt = dx + (z − b)y
dz/dt = c + az − z³/3 − (x² + y²)(1 + ez) + fzx³
```
Parameters tuned to `a=0.95, b=0.7, c=0.6, d=3.5, e=0.25, f=0.1`. Produces a 3D twisted rosette — looks like a knot in space. Distinct, immediately recognisable.

### 4. Halvorsen attractor — curly tripod
```
dx/dt = −ax − 4y − 4z − y²
dy/dt = −ay − 4z − 4x − z²
dz/dt = −az − 4x − 4y − x²
```
With `a = 1.4`. Three curls arranged like a tripod. Cyclic symmetry in the equations produces the visual symmetry.

### 5. Thomas attractor — symmetric coil
```
dx/dt = sin(y) − bx
dy/dt = sin(z) − by
dz/dt = sin(x) − bz
```
With `b ≈ 0.208`. The sinusoidal nonlinearity gives it a 3D coil structure. Cyclically symmetric in (x, y, z).

### Why we use this

- **Visual** — each agent has its own immediately recognisable shape; a compromised agent's geometry visibly collapses (scattered sphere) in real-time during the demo
- **Pedagogical** — judges and viewers can *see* the chaos-theory concept rather than just reading about it
- **Math-aligned** — the visualisation is the same kind of object (`R³` attractor reconstructed from a 1D signal) that `nolds.corr_dim` is measuring numerically

The transition from any stable attractor to the **chaotic scatter** state (used during simulated compromise) is the most important visual in the entire product.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router · Turbopack) · TailwindCSS v4 · React 19 · React Three Fiber + @react-three/drei · Web3Auth Modal · ethers v6 · Recharts |
| Backend | Node 20 · Express · ethers v6 · `gokite-aa-sdk` (optional AA path) · MongoDB driver |
| Math | Python 3.11 · Flask · [nolds](https://github.com/CSchoel/nolds) (SampEn, correlation dimension, RANSAC fitting) · NumPy |
| Database | MongoDB (`agents` + `events` collections) |
| Indexing | Goldsky-hosted subgraph on chain `kite-ai-testnet` |
| Chain | Kite L1 Testnet · ChainID **2368** · `gokite-aa-sdk` ERC-4337 bundler |
| Identity | Kite Agent Passport · CLI: `kpass` · DID format: `did:kite:user/agent/label-vN` |
| Wallet | Web3Auth Modal v10 (MetaMask, Google, email, etc.) signing native KITE transfers |

---

## On-chain deployment (Kite Testnet)

| Contract | Address |
|---|---|
| **AttractorGuard.sol** — registry, gate decisions, baseline commitments, freeze | `0x1F958d24298e04e8516EA972eFc2A3Bd50B4BF4F` |
| **AgentPaymentSimulator.sol** — demo payment / attack injection events | `0x1634edA803e70dF6a674B2E67B6D0B11C0b4B9aC` |

**Network constants:**

| | |
|---|---|
| Chain ID | `2368` (`0x940`) |
| RPC | `https://rpc-testnet.gokite.ai/` |
| Explorer | `https://testnet.kitescan.ai` |
| Faucet | `https://faucet.gokite.ai` |
| Bundler | `https://bundler-service.staging.gokite.ai/rpc/` |
| Settlement token | `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63` |
| Native currency | `KITE` (18 decimals) |

**Goldsky subgraph (live):**
```
https://api.goldsky.com/api/public/project_cmnxhd74o47i501vvc35oe0mc/subgraphs/attractorguard-kite-ai-testnet/5.0.2/gn
```

**Other relevant Kite addresses (reference):**

| Contract | Address |
|---|---|
| GokiteAccount | `0x93F5310eFd0f09db0666CA5146E63CA6Cdc6FC21` |
| GokiteAccountFactory | `0xF0Fc19F0dc393867F19351d25EDfc5E099561cb7` |
| Settlement Contract | `0x8d9FaD78d5Ce247aA01C140798B9558fd64a63E3` |
| ServiceRegistry | `0xc67a4AbcD8853221F241a041ACb1117b38DA587F` |

---

## Smart contracts

### `AttractorGuard.sol` (~390 LOC)

Main behavioural monitoring + agent registry. Owner = the agent's owner address (set at registration). Backend EOA (or predicted AA account) must be authorised via `setBackendAuthorization()` to call `logDecision`.

**Stored per agent:**
- `agentDID` — bytes32 derived from `encodeBytes32String(label)` (≤ 31 chars), or supplied directly
- `ownerAddress` — `msg.sender` of `registerAgent`
- `spendingLimit` — uint256 (wei-scaled)
- `thresholdMultiplier` — uint16 (scaled ×100, e.g. `200` = `2.0σ`)
- `baselineHash` — bytes32 (the off-chain baseline's keccak commitment)
- `baselineCommittedAt` — uint256 timestamp
- `status` — enum `Active | Frozen | Revoked`
- `registeredAt` — uint256 timestamp

**Public functions**
| Function | Caller |
|---|---|
| `registerAgent(bytes32 agentId, uint256 spendingLimit, uint256 thresholdMultiplier)` | owner |
| `logDecision(bytes32 agentId, bool issued, uint256 metric, uint256 baseline)` | authorised backend |
| `resetBaseline(bytes32 agentId, uint256 newBaselineHash)` | owner |
| `setAgentStatus(bytes32 agentId, bool isActive)` | owner (freeze / unfreeze) |
| `revokeAgent(bytes32 agentId)` | owner (permanent) |
| `setBackendAuthorization(address backend, bool authorized)` | owner of contract |
| `getAgent(bytes32 agentId) → Agent` | view |

**Events** (all indexed by Goldsky)
- `AgentRegistered(agentId, owner, spendingLimit, thresholdMultiplier, timestamp)`
- `SessionKeyIssued(agentId, sessionKey, metric, baseline, timestamp)`
- `SessionKeyDenied(agentId, metric, baseline, timestamp)`
- `BaselineReset(agentId, newBaselineHash, timestamp)`
- `AgentStatusChanged(agentId, isActive, timestamp)`
- `AgentRevoked(agentId, owner, timestamp)`
- `BackendAuthorizationChanged(backend, authorized, timestamp)`

### `AgentPaymentSimulator.sol` (~360 LOC)

Demo-only contract that emits realistic payment patterns indexed by Goldsky. The seed scripts use this to populate baseline history without needing real x402 flows.

**Public functions**
| Function | Purpose |
|---|---|
| `simulatePayment(bytes32 agentId, uint256 amount, address to)` | Single normal payment |
| `seedNormalHistory(bytes32 agentId, uint256 count)` | Batch-emit normal-pattern payments (used for the 100+ baseline payments per agent) |
| `simulateAttack(bytes32 agentId)` | Emit anomalous burst — large amounts, fast cadence, random destinations. Drives the demo freeze. |
| `setDemoMode(bool enabled)` | Owner-only gate |

**Events**
- `PaymentExecuted(agentId, amount, to, paymentType, timestamp)` — `paymentType` ∈ `NORMAL | ATTACK | SEEDED`
- `AttackInjected(agentId, burstSize, timestamp)`
- `DemoModeChanged(enabled, timestamp)`

---

## Goldsky subgraph

The subgraph indexes events from both contracts into queryable entities.

**Entities:**

| Type | Source events | Purpose |
|---|---|---|
| `Agent` | `AgentRegistered`, `AgentRevoked`, `AgentStatusChanged` | One per registered agent. Tracks lifecycle state. |
| `AgentPayment` | `PaymentExecuted` | Every payment, with `amount`, `to`, `paymentType`, `timestamp`, `blockNumber`, `txHash` |
| `GateDecision` | `SessionKeyIssued`, `SessionKeyDenied` | Every gate verdict with `metric`, `baseline`, `sessionKey` |
| `BaselineCommit` | `BaselineReset` | Tamper-evident hash commitments |
| `AttackEvent` | `AttackInjected` | Demo attack injections |
| `SystemStats` | Aggregated | Per-system counters |

**Sample queries** (used in production):

```graphql
# Payment history for an agent (used by the gate)
query AgentHistory($agentId: ID!, $limit: Int!) {
  agentPayments(
    where: { agentDID: $agentId }
    orderBy: timestamp
    orderDirection: desc
    first: $limit
  ) {
    amount
    timestamp
    to
    blockNumber
    transactionHash
    paymentType
  }
}
```

```graphql
# Live dashboard feed
query Feed {
  agentPayments(orderBy: timestamp, orderDirection: desc, first: 20) { … }
  gateDecisions(orderBy: timestamp, orderDirection: desc, first: 20) { … }
}
```

```graphql
# Agent detail charts
query AgentDecisions($agentId: Bytes!) {
  gateDecisions(
    where: { agentDID: $agentId }
    orderBy: timestamp
    orderDirection: asc
    first: 50
  ) { verdict metricValue baselineValue timestamp txHash }
}
```

---

## Backend API

Base URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).

### Health & config
| Method · Path | Notes |
|---|---|
| `GET /health` | Liveness; reports `demoMode`, `skipX402Validation`, AA flags, `predictedAaBackendAddress`, Python config |
| `GET /api/config` | Public config (owner address, explorer base, demo mode) |

### Agents (lifecycle)
| Method · Path | Notes |
|---|---|
| `POST /api/agents/register` | Register agent. Body: `name`, `walletAddress`, `ownerAddress`, `spendingLimit`, `thresholdMultiplier`, plus either `agentId` (bytes32) or `didLabel` (≤31 chars → encoded). Optional `walletTxHash` (skips on-chain re-registration when the frontend signed it via Web3Auth). Optional `passportDid`, `passportUsername`, `description`. |
| `GET  /api/agents` | List all agents. Includes `lastDecision`, `currentMetric`, `deviationPct`. |
| `GET  /api/agents/:agentId` | Full detail incl. `sessionKeyLog`, `recentTx` (chronological with explorer links). |
| `POST /api/agents/:agentId/freeze` | Instant MongoDB-only freeze (no chain tx). Used by Inject Attack flow. |
| `POST /api/agents/:agentId/reauthorize` | `setAgentStatus(true)` + `resetBaseline`. Clears baseline history. Accepts `walletTxHash` to skip on-chain when wallet signs. |
| `POST /api/agents/:agentId/revoke` | `revokeAgent` on-chain (permanent). Accepts `walletTxHash`. |

### Gate & events
| Method · Path | Notes |
|---|---|
| `POST /api/gate` | The behavioural gate. Body: `agentId`, `amount`, `destination`, `x402Payload?`. Returns `verdict`, `sessionKey`, `metric`, `baseline`, `threshold`, `reason`, `explorerLink`, `gateDiagnostics` (`goldskyPaymentCount`, `paymentCountUsed`, `analysisUsedSyntheticOnly`). Returns **403** for revoked/frozen agents. |
| `GET  /api/events?limit=N` | Recent gate decisions (max 100). |

### Kite Passport
| Method · Path | Notes |
|---|---|
| `GET  /api/passport/status` | `kpass status` — checks auth, lists user's agents |
| `POST /api/passport/verify` | Verify an agent exists in Passport (with retry) |

### Demo
| Method · Path | Notes |
|---|---|
| `POST /api/demo/inject-attack` | Fires `simulateAttack(agentId)` on-chain. Requires `DEMO_MODE=true`. |

### Python micro-service (port 5050)
- `POST /analyze` — `nolds.sampen` (`mode: "early"`) or `nolds.corr_dim` (`mode: "mature"`)
- `GET  /health`

Request:
```json
{
  "amounts":    [12.5, 8.0, 15.2, ...],
  "timestamps": [1714000000, 1714000120, ...],
  "mode":       "early",
  "emb_dim":    3,
  "lag":        1
}
```

Response (success):
```json
{ "metric": 0.847, "metric_type": "sampen", "data_points": 47, "status": "ok" }
```

Response (insufficient data):
```json
{ "status": "insufficient_data", "data_points": 8 }
```

The gate **fail-opens** to ISSUED when Python returns `insufficient_data`, `compute_error`, or `error` (per spec — first 30 transactions establish baseline regardless).

---

## MongoDB schema

### `agents` (one document per registered agent)
```jsonc
{
  agentId:            "0x...",          // bytes32
  name:               "alice-expense-v1",
  walletAddress:      "0x...",
  ownerAddress:       "0x...",
  spendingLimit:      100,
  thresholdMultiplier: 2,                // human-scale; on-chain ×100
  mode:               "early"|"mature",
  transactionCount:   number,
  baselineMean:       number,
  baselineStdDev:     number,
  baselineHistory:    [number],          // rolling window of last 50 metrics
  baselineHash:       "0x...",           // keccak(baseline payload)
  baselineCommittedAt: Date,
  pendingBaselineCommit: boolean,
  status:             "active"|"frozen"|"revoked",
  currentMetric:      number,
  createdAt:          Date,
  lastCheckedAt:      Date,
  passportDid:        string,            // optional Kite Passport DID
}
```

### `events` (one document per gate invocation)
```jsonc
{
  agentId:        "0x...",
  verdict:        "ISSUED"|"DENIED",
  metric:         number,
  baseline:       number,
  deviation:      number,
  amount:         number,
  sessionKey:     "0x..."|null,
  onChainTxHash:  "0x..."|null,
  explorerLink:   string|null,
  timestamp:      Date,
}
```

---

## Frontend pages

| Route | Purpose |
|---|---|
| `/` | Landing — pitch + how-it-works + math + tech stack. Web3Auth connect button in nav. |
| `/dashboard` | All agents (status, metric, baseline, Δ%) + live tx feed polling Goldsky every 5s. |
| `/register` | Register a new agent. Signs `registerAgent` via Web3Auth wallet (silent fallback to backend env key). |
| `/agent/[agentId]` | Per-agent detail — large current metric, baseline chart (with ±2σ band), raw amounts chart, gate runner with KITE transfer, session-key panel with countdown, freeze / re-authorize / revoke (all wallet-signed when connected), on-chain payment history (Goldsky) with Kitescan links. |
| `/your-garden` | The "moneyshot" demo. Per-agent 3D attractor visualisation (Lorenz / Rössler / Aizawa / Halvorsen / Thomas) with hover tooltips revealing the underlying Takens embedding values per point. Inject-attack button fires `simulateAttack` on-chain; attractor scatters in real-time; `AgentFrozen` event surfaces. Reset returns the attractor to its agent-specific shape. |
| `/how-it-works` | Static explainer of phase space, attractor reconstruction, the two metrics, and the freeze flow. |

### Wallet integration (Web3Auth)

- Connect button in the landing nav and embedded in protected actions
- All on-chain actions (register / freeze / reauthorize / revoke) try wallet first, fall back silently to backend env key
- On gate **ISSUED**, frontend signs a native **KITE transfer** to the destination (real on-chain payment, visible on Kitescan)
- On gate **DENIED**, no transfer fires — the gate has done its job
- Chain config: chainId `0x940` (`2368`), RPC `https://rpc-testnet.gokite.ai/`

### Per-agent geometry

The `your-garden` page hashes the agentId and picks one of five attractor systems for that agent. Same agent → same geometry, forever. Compromised agent → geometry collapses to a random scatter sphere. This is the **visual fingerprint** that complements the numeric `D₂` / SampEn fingerprint.

---

## Running locally

### Prereqs
- Node 20+ · pnpm 10+
- Python 3.11 (3.14 has a known `nolds` incompatibility — `pkg_resources` removal)
- MongoDB on `127.0.0.1:27017`
- A Kite testnet wallet funded from the faucet (for any on-chain registration or KITE transfer)

### 1. MongoDB
```bash
mongod                                              # or:
brew services start mongodb-community
```

### 2. Python micro-service
```bash
cd python-service
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
# → http://127.0.0.1:5050/health
```

### 3. Backend
```bash
cd backend
cp .env.example .env
# Fill in BACKEND_PRIVATE_KEY, AGENT_OWNER_PRIVATE_KEY, GOLDSKY_ENDPOINT
npm install
npm start
# → http://localhost:4000/health
```

### 4. Frontend
```bash
cd frontend
cp .env.example .env.local
# Fill in NEXT_PUBLIC_WEB3AUTH_CLIENT_ID
pnpm install
pnpm dev
# → http://localhost:3000
```

### 5. Seed payment history (so the math is meaningful)
```bash
cd onchain
SEED_AGENT_LABEL=alice-expense-v1 SEED_COUNT=100 npm run seed:agent
```
Wait ~30s for Goldsky to index, then run the gate for that agent.

---

## Environment variables

### Backend (`backend/.env`)
| Var | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | yes | `mongodb://127.0.0.1:27017/kite-garden` | Mongo |
| `GOLDSKY_ENDPOINT` | yes | live URL above | Subgraph |
| `GOLDSKY_HISTORY_LIMIT` | no | `500` | `first:` on history query |
| `GOLDSKY_API_KEY` | no | — | Only required for private subgraphs |
| `PYTHON_SERVICE_URL` | yes | `http://127.0.0.1:5050` | Math |
| `KITE_RPC_URL` | yes | `https://rpc-testnet.gokite.ai/` | Chain |
| `KITE_EXPLORER_BASE` | no | `https://testnet.kitescan.ai` | Kitescan |
| `ATTRACTOR_GUARD_ADDRESS` | yes | (deployed addr above) | Main contract |
| `AGENT_PAYMENT_SIMULATOR_ADDRESS` | yes | (deployed addr above) | Demo contract |
| `BACKEND_PRIVATE_KEY` | yes | — | Authorised to call `logDecision` |
| `AGENT_OWNER_PRIVATE_KEY` | yes | — | Signs register / reauthorize / revoke |
| `STUB_SESSION_KEY_ADDRESS` | no | — | Demo placeholder when AA SDK off |
| `DEMO_MODE` | no | `false` | Enables `/api/demo/inject-attack` |
| `SKIP_X402_VALIDATION` | no | `false` | Local dev only |
| `USE_AA_SDK_FOR_LOG_DECISION` | no | `false` | Optional Kite AA path |
| `USE_AA_SESSION_KEY_RULE` | no | `false` | Batched `addSessionKeyRule` + `logDecision` |
| `KITE_AA_BUNDLER_URL` | no | bundler above | When AA SDK enabled |
| `GATE_VERBOSE_RESPONSE` | no | `false` | Surfaces `logDecisionError` to client |

### Frontend (`frontend/.env.local`)
| Var | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` | yes | Wallet connect |
| `NEXT_PUBLIC_API_URL` | yes | Backend URL |
| `NEXT_PUBLIC_BACKEND_URL` | yes | Backend URL (same) |
| `NEXT_PUBLIC_GOLDSKY_ENDPOINT` | no | Defaults to live URL |
| `NEXT_PUBLIC_ATTRACTOR_GUARD_ADDRESS` | no | Defaults baked in |
| `NEXT_PUBLIC_AGENT_PAYMENT_SIMULATOR_ADDRESS` | no | Defaults baked in |

---

## Repository layout

```
kitegarden/
├── frontend/                     Next.js 16 app
│   ├── app/(app)/               protected pages (dashboard, register, your-garden, agent detail)
│   ├── app/page.tsx             landing
│   ├── components/              UI + wallet + landing sections
│   ├── lib/api.ts               backend REST client
│   ├── lib/goldsky.ts           Goldsky GraphQL client
│   ├── lib/wallet-tx.ts         wallet-signed contract calls (walletRegister, walletRevoke, walletReauthorize, walletTransferNative)
│   ├── lib/web3auth-config.ts   Web3Auth + Kite chain config
│   └── lib/attractor-guard-abi.ts
│
├── backend/                      Express API
│   ├── src/index.js             all routes
│   ├── src/gateLogic.js         baseline stats + tamper-evident hash
│   ├── src/goldsky.js           GraphQL history query + synthetic pad
│   ├── src/pythonClient.js      Flask call wrapper
│   ├── src/chain.js             ethers + AttractorGuard ABI
│   ├── src/kiteAaLogDecision.js optional Kite AA SDK path
│   ├── src/x402.js              EIP-712 typed-data validation
│   ├── src/db.js                MongoDB
│   └── src/config.js            env
│
├── python-service/               Flask + nolds
│   ├── app.py                   /analyze + /health
│   └── requirements.txt
│
├── onchain/                      Hardhat
│   ├── contracts/
│   │   ├── AttractorGuard.sol
│   │   └── AgentPaymentSimulator.sol
│   ├── scripts/
│   │   ├── deploy.js
│   │   ├── seed.js              alice + bob (300 tx each)
│   │   └── seed-agent-by-label.js (per-label seeding)
│   ├── subgraph/                Goldsky subgraph (schema + mappings)
│   └── hardhat.config.js
│
└── README.md                     (this file)
```

---

## Research & prior art

### Mathematical foundations

- **Takens, F. (1981).** *Detecting strange attractors in turbulence.* Lecture Notes in Mathematics 898, Springer. Establishes that a scalar time series can reconstruct the full attractor geometry of the underlying dynamical system via delay embedding. Theoretical basis for using transaction amounts as input to phase-space analysis.

- **Grassberger, P. & Procaccia, I. (1983).** *Measuring the strangeness of strange attractors.* Physica D, 9(1–2), 189–208. Original paper defining the correlation dimension algorithm implemented by `nolds.corr_dim()`.

- **Richman, J.S. & Moorman, J.R. (2000).** *Physiological time-series analysis using approximate entropy and sample entropy.* American J. Physiology. The standard reference for Sample Entropy.

### Direct prior art for the anomaly-detection approach

- **Tellenbach et al. (2019).** *Network anomaly detection based on logistic regression of nonlinear chaotic invariants.* Journal of Network and Computer Applications, 148, 102447. Applies Lyapunov exponents, correlation dimension, and entropy measures to network traffic time series. Closest existing work — same mathematical tools, different domain.

- **PAKDD (2006).** *Sequence Outlier Detection Based on Chaos Theory and Its Application on Stock Market.* Applies phase-space reconstruction to financial time series for outlier detection. Validates that transaction-amount sequences are amenable to attractor-based analysis.

### The novel contribution

No prior work applies correlation dimension, sample entropy, or any chaos-theoretic invariant to:
- Blockchain transaction sequences
- AI agent behavioural monitoring
- Session-key governance on any blockchain

The combination of on-chain Passport identity, on-chain baseline-hash commitment, behavioural-attractor analysis, and session-key revocation on Kite L1 is the novel contribution — confirmed by searches across Google Scholar, arXiv, and Semantic Scholar.

---

## References

| | |
|---|---|
| Kite docs | https://docs.gokite.ai |
| Kite core concepts | https://docs.gokite.ai/get-started-why-kite/core-concepts-and-terminology |
| Kite Agent Passport CLI | https://docs.gokite.ai/kite-agent-passport/cli-reference |
| Kite AA SDK | https://docs.gokite.ai/kite-chain/account-abstraction-sdk |
| Kite building dApps | https://docs.gokite.ai/kite-chain/building-dapps |
| Kite gasless stablecoin transfer | https://docs.gokite.ai/kite-chain/stablecoin-gasless-transfer |
| Kite Portal | https://x402-portal-eight.vercel.app/ |
| Kitescan explorer | https://testnet.kitescan.ai |
| Kite faucet | https://faucet.gokite.ai |
| Goldsky docs | https://docs.goldsky.com |
| Goldsky × Kite | https://docs.goldsky.com/chains/kite-ai |
| Goldsky subgraph deploy | https://docs.goldsky.com/subgraphs/deploying-subgraphs |
| Goldsky querying | https://docs.goldsky.com/subgraphs/querying |
| x402 specification | https://github.com/coinbase/x402/blob/main/specs/x402-specification.md |
| Coinbase awesome-x402 | https://github.com/xpaysh/awesome-x402 |
| nolds docs | https://cschoel.github.io/nolds/nolds.html |
| nolds GitHub | https://github.com/CSchoel/nolds |

---

*Built for Kite AI Novel Track Hackathon — session-key revocation driven by transaction topology and tamper-evident on-chain baselines.*
