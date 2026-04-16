# Person 2 — Backend & Math (Deliverables)

This track implements the **Kitegarden.md** Section 8 backend using the **existing** on-chain stack in this repo (**AttractorGuard.sol**, **AgentPaymentSimulator.sol**) — **no separate AgentRegistry contract**.

---

## Status — Person 2 scope (done)

The items below are **implemented in-repo** and wired for local + Kite testnet use. What remains is mostly **operational** (your keys, funded wallets, deployed subgraph URL, seeding payments for each `agentId` — coordinated with Person 1 / onchain).

| Area | Done |
|------|------|
| Python `/analyze` + `/health` | Yes (`python-service/`) |
| Express API (gate, register, agents, events, demo attack, health) | Yes (`backend/src/index.js`) |
| Mongo `agents` / `events` | Yes (`backend/src/db.js`) |
| Goldsky client (history → series) | Yes (`backend/src/goldsky.js`) |
| x402 + dev skip | Yes (`backend/src/x402.js`, `SKIP_X402_VALIDATION`) |
| Baseline stats, tamper-evident hash, gate + chain | Yes (`gateLogic.js`, `chain.js`, gate route) |
| Python HTTP client (timeout, no throw on failure) | Yes (`backend/src/pythonClient.js`) |
| Optional AA `logDecision` / session-key batch | Yes (`kiteAaLogDecision.js`, env flags) |
| Env template + runbook | Yes (`.env.example`, `README.md`) |
| Optional Mongo-only demo row | Yes (`backend/scripts/seed-demo-agent.mjs`) |

---

## What was delivered (detail)

### 1. Python Flask microservice (`python-service/`)

- **POST `/analyze`** — `nolds.sampen` for early mode; `nolds.corr_dim` for mature mode when `n >= 200` and `mode === "mature"`.
- **GET `/health`**
- Returns `insufficient_data` when the posted series is empty or below `min_data_points` (gate sends `min_data_points: 1`; optional env `GATE_MIN_INDEXED_PAYMENTS` in Python for stricter defaults).
- Dependencies: `requirements.txt` (`flask`, `nolds`, `numpy`, …).

### 2. Node.js Express API (`backend/`)

- **GET `/health`** — `ok`, `demoMode`, `skipX402Validation`, Kite AA flags, `predictedAaBackendAddress`, and whether AA log-decision / session-key paths are configured.
- **POST `/api/gate`** — x402 validation → Goldsky history → (if empty, **synthetic pad** for analysis) → Python → baseline band → `logDecision` on AttractorGuard (AA path first when configured, else backend EOA) → Mongo `agents` / `events`. Persists **`amount`** on each event. Returns **`gateDiagnostics`** (`goldskyPaymentCount`, `paymentCountUsed`, `analysisUsedSyntheticOnly`). Optional **`logDecisionError`** when `GATE_VERBOSE_RESPONSE=true` or x402 skipped. **403** for `revoked` / `frozen` agents before analysis.
- **POST `/api/agents/register`** — `registerAgent` with `AGENT_OWNER_PRIVATE_KEY` (must match `ownerAddress` in body). Accepts **`agentId` (bytes32 hex)** or **`didLabel`** (→ `encodeBytes32String`, max **31** chars).
- **GET `/api/agents`** — Dashboard-oriented list from Mongo + last event; includes `lastDecision`, `lastMetric`, `currentMetric`, `deviationPct`, etc.
- **GET `/api/agents/:agentId`** — Full agent doc + **`sessionKeyLog`** + **`recentTx`** derived from gate **`events`** (chronological, with `amount` / `verdict` / explorer links).
- **GET `/api/events`** — Recent gate rows for a dashboard feed; query **`limit`** (1–100, default 50); includes `agentName`, `amount`, `verdict`, `metricValue`.
- **POST `/api/agents/:agentId/reauthorize`** — `setAgentStatus(true)`, `resetBaseline`, clear baseline history in Mongo, set `pendingBaselineCommit`.
- **POST `/api/agents/:agentId/revoke`** — `revokeAgent` (owner signer).
- **POST `/api/demo/inject-attack`** — `AgentPaymentSimulator.simulateAttack` when **`DEMO_MODE=true`**.

### 3. MongoDB

Collections per spec:

- **`agents`** — `agentId`, `name`, `walletAddress`, `ownerAddress`, `spendingLimit`, `thresholdMultiplier`, `mode`, `transactionCount`, `baselineMean`, `baselineStdDev`, `baselineHistory` (≤50), `baselineHash`, `baselineCommittedAt`, `pendingBaselineCommit`, `status`, `currentMetric`, timestamps.
- **`events`** — one row per gate invocation with `verdict`, `metric`, `baseline`, `deviation`, **`amount`**, `sessionKey`, `onChainTxHash`, `explorerLink`, `timestamp`.

### 4. Goldsky GraphQL

- **`GOLDSKY_ENDPOINT`** or **`SUBGRAPH_GRAPHQL_ENDPOINT`** (first non-empty wins in `config.js`).
- **`GOLDSKY_HISTORY_LIMIT`** — `first: N` on `agentPayments` ordered by `timestamp` desc.
- Primary filter: `where: { agent: $agentId }` with **`ID!`**. If no rows, fallback **`where: { agentDID: $agentId }`** with **`String!`** (ignored if the subgraph rejects it).
- Optional **`GOLDSKY_API_KEY`**: **Bearer is not sent** for URLs containing **`/api/public/`** unless **`GOLDSKY_BEARER_WITH_PUBLIC=true`** (avoids bad auth on public hosted subgraphs).
- Amounts converted from indexed wei to **float series** for `nolds` (÷ 1e18).
- **`syntheticAgentPayments`** — when Goldsky returns **zero** rows, the gate pads with a fixed-length synthetic series so Python still runs; **`reason`** and **`gateDiagnostics.analysisUsedSyntheticOnly`** reflect that (not a substitute for real **`AgentPayment`** rows — use **onchain** `seed.js` / `seed:agent` with the **same** `didLabel` / `agentId`).

### 5. x402

- **EIP-712** verification via `ethers.verifyTypedData`.
- Checks `from` vs registered wallet, `validBefore`, and `value` vs **`amount * 1e18`**.
- **`SKIP_X402_VALIDATION=true`** for local dev only.

### 6. Gate logic

- **No Goldsky rows:** pad with **40** synthetic points, run Python, set **`analysisUsedSyntheticOnly`**; **`reason`** prefixes with a Goldsky/synthetic note.
- **Python `insufficient_data` / `compute_error` / `error`:** **ISSUED** (fail-open, per spec note); reason mentions Python status (and truncated error when present).
- **First metric (no baseline history yet):** establish band from the **current** metric (single-point stats) so thresholds are non-degenerate; subsequent calls use rolling history.
- **Baseline:** last **50** metrics on **ISSUED** + Python **`ok`**; band **mean ± thresholdMultiplier × std** (Mongo `thresholdMultiplier` is human, e.g. `2`; on-chain register uses `×100`).
- **Tamper-evident hash:** Mongo `baselineHash` = `keccak256(JSON.stringify({ mean, std, thresholdMultiplier, transactionCount, ts }))` after successful **`resetBaseline`** on first baseline commit path (owner key + `pendingBaselineCommit`).
- **DENIED:** optional owner **`setAgentStatus(false)`**; Mongo agent set **`frozen`**.

### 7. AttractorGuard (ethers.js)

- **Backend signer:** `logDecision`, (demo) simulator txs if using backend key.
- **Owner signer:** `registerAgent`, `resetBaseline`, `setAgentStatus`, `revokeAgent`.
- Person 1 (or deployer) must **`setBackendAuthorization`** for whichever address actually calls `logDecision`: backend EOA for the direct path, or the **predicted AA account** when using `USE_AA_SDK_FOR_LOG_DECISION` (see **`GET /health`** → `predictedAaBackendAddress`).

### 8. Account abstraction (Person 2 owns backend AA)

- **Person 2** implements and maintains AA in the backend: `backend/src/kiteAaLogDecision.js`, `USE_AA_SDK_FOR_LOG_DECISION`, `USE_AA_SESSION_KEY_RULE` (batched `addSessionKeyRule` + `logDecision`), bundler URL, EOA fallback, and alignment with `onchain/AA_SDK_INTEGRATION_GUIDE.md`.
- **`STUB_SESSION_KEY_ADDRESS`** — used on **ISSUED** when **`USE_AA_SESSION_KEY_RULE`** is off (demo placeholder address; must be checksummed / valid hex).
- With **`USE_AA_SESSION_KEY_RULE`** + **`DEMO_MODE`**, optional **`EXPOSE_GENERATED_SESSION_KEY_PRIVATE_KEY`** (unsafe) returns a generated key in the gate JSON for demos.

---

## Files to review

| Path | Role |
|------|------|
| `python-service/app.py` | `/analyze`, `/health` |
| `python-service/requirements.txt` | deps |
| `backend/src/index.js` | HTTP routes |
| `backend/src/config.js` | env |
| `backend/src/db.js` | Mongo |
| `backend/src/goldsky.js` | history query + series + synthetic pad |
| `backend/src/pythonClient.js` | call Flask (120s timeout, structured errors) |
| `backend/src/x402.js` | typed-data validation |
| `backend/src/chain.js` | ethers + ABIs + `encodeLogDecisionCalldata` |
| `backend/src/kiteAaLogDecision.js` | optional `gokite-aa-sdk` UserOp `logDecision` / session batch |
| `backend/src/gateLogic.js` | stats / hash |
| `backend/scripts/seed-demo-agent.mjs` | optional Mongo-only agent row |
| `backend/.env.example` | configuration template |
| `backend/README.md` | runbook |

---

## Integration checklist (with Person 1)

1. Deploy contracts; copy **AttractorGuard** + **AgentPaymentSimulator** addresses into `backend/.env`.
2. Authorize **backend** wallet on AttractorGuard (EOA path). If using **`USE_AA_SDK_FOR_LOG_DECISION`**, also authorize **`predictedAaBackendAddress`** from **`GET /health`**.
3. Deploy subgraph; set **`GOLDSKY_ENDPOINT`** or **`SUBGRAPH_GRAPHQL_ENDPOINT`** (same GraphQL URL as onchain).
4. Seed **`AgentPayment`** data for the **same bytes32** as registration: e.g. onchain **`npm run seed`** (Alice/Bob) or **`npm run seed:agent`** with **`SEED_AGENT_LABEL`** exactly matching **`didLabel`** / `agentId` encoding — then register via **`POST /api/agents/register`** (owner key funded).
5. Confirm **`POST /api/gate`** returns **ISSUED/DENIED** and **Kitescan** shows **`SessionKeyIssued` / `SessionKeyDenied`**.
6. With **`DEMO_MODE=true`**, **`POST /api/demo/inject-attack`** triggers **`simulateAttack`** and Goldsky should show new payments for the victim DID.

---

## Known differences vs Kitegarden.md “AgentRegistry” wording

The **repo README / contracts** use **AttractorGuard** instead of a separate **AgentRegistry**. This backend follows **AttractorGuard**’s access control (`registerAgent` = owner, `logDecision` = authorized backend, `resetBaseline` / `revokeAgent` = owner). The narrative in Kitegarden.md maps as described in **`backend/README.md`**.

---

## Spec note (warmup / Python)

Earlier drafts described **fewer than 30 indexed payments → ISSUED without Python**. The **current** implementation always attempts Python after building a series (including **synthetic** padding when Goldsky returns no rows). Python still returns **`insufficient_data`** for empty/too-short series when configured; the gate **fail-opens** to **ISSUED** for Python failure statuses as above.
