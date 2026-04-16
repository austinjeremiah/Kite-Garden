# Kite Garden — Backend (Person 2)

Node.js Express API: payment gate, MongoDB state, Goldsky history, Python `nolds` analysis, x402 validation, and **AttractorGuard** + **AgentPaymentSimulator** via ethers.js.

## Prerequisites

- Node 20+
- MongoDB (local or Atlas)
- Python service (`../python-service`) running
- Deployed **AttractorGuard** + **AgentPaymentSimulator** on Kite testnet (Person 1)
- Goldsky subgraph URL indexing those contracts
- **Backend EOA** authorized on AttractorGuard. Run from `onchain/` (uses **owner** `PRIVATE_KEY` in `onchain/.env`):

  `npm run authorize-backend`

  Set `ATTRACTOR_GUARD_ADDRESS` and either `BACKEND_ADDRESS` or `BACKEND_PRIVATE_KEY` in `onchain/.env`. See `onchain/scripts/authorize-backend.js`.

## Setup

```bash
cd backend
cp .env.example .env
# fill in keys, contract addresses, GOLDSKY_ENDPOINT
npm install
npm start
```

## Python service

```bash
cd ../python-service
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
set PORT=5050
python app.py
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| POST | `/api/gate` | Payment gate (Section 8) |
| POST | `/api/agents/register` | On-chain `registerAgent` + Mongo upsert |
| GET | `/api/agents` | List agents + last decision |
| GET | `/api/agents/:agentId` | Agent detail + recent gate events |
| POST | `/api/agents/:agentId/reauthorize` | `setAgentStatus(true)` + `resetBaseline` + Mongo reset |
| POST | `/api/agents/:agentId/revoke` | On-chain `revokeAgent` |
| POST | `/api/demo/inject-attack` | `simulateAttack` when `DEMO_MODE=true` |

`agentId` is `bytes32` hex (same as subgraph agent id / seed `encodeBytes32String("alice-expense-v1")`).

## x402

Send `x402Payload` as an EIP-712 envelope: `domain`, `types`, `primaryType`, `message`, `signature`. The signed `from` must match the agent `walletAddress`; `value` must match `amount` (converted to wei as `amount * 1e18`). Set `SKIP_X402_VALIDATION=true` only for local testing.

## Session keys (AA)

- **Stub:** set `STUB_SESSION_KEY_ADDRESS` when not using `USE_AA_SESSION_KEY_RULE`.
- **On-chain rule + audit:** `USE_AA_SDK_FOR_LOG_DECISION=true`, `USE_AA_SESSION_KEY_RULE=true`, bundler URL, and authorize the **AA account** on `AttractorGuard`. The gate then batches `addSessionKeyRule` + `logDecision` via `backend/src/kiteAaLogDecision.js` (verify ABI vs live Gokite account if UserOps revert).
- **Never** enable `EXPOSE_GENERATED_SESSION_KEY_PRIVATE_KEY` outside local `DEMO_MODE`.

## AttractorGuard mapping (not AgentRegistry)

This backend targets the repo’s **AttractorGuard** contract:

| Spec / doc term | AttractorGuard |
|-----------------|----------------|
| `register` | `registerAgent(agentDID, spendingLimitWei, threshold×100)` |
| `commitBaseline` (hash in spec) | `resetBaseline(agentDID, newBaselineScaled)` + Mongo `baselineHash` |
| `freezeAgent` | `logDecision(..., issued=false)` + optional `setAgentStatus(false)` (owner key) |
| Gate audit | `logDecision` → `SessionKeyIssued` / `SessionKeyDenied` |

Owner-only calls use `AGENT_OWNER_PRIVATE_KEY`. Backend-only calls use `BACKEND_PRIVATE_KEY`.

See **PERSON2_DELIVERABLES.md** for the full checklist.
