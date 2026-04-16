# Kite Garden

Monorepo for the Kite Garden demo: **Next.js dashboard**, **Express backend** (behavioral gate, MongoDB, Goldsky, x402), **Python** service (`nolds`), and **on-chain** contracts (AttractorGuard, AgentPaymentSimulator) plus subgraph docs.

---

## Person 2 (backend & math) — status

**Person 2 deliverables are implemented** in this repository: API routes, gate logic, Mongo persistence, Goldsky client, Python integration, x402 validation, and optional AA paths for `logDecision`. Details, file map, and integration notes are in:

**[backend/PERSON2_DELIVERABLES.md](backend/PERSON2_DELIVERABLES.md)**

The backend runbook and API summary remain in **[backend/README.md](backend/README.md)**.

---

## What you run locally

| Component | Directory | Default URL / port |
|-----------|-----------|---------------------|
| MongoDB | (system install or Docker) | `mongodb://127.0.0.1:27017` |
| Python (`nolds`) | `python-service/` | `http://127.0.0.1:5050` |
| Express API | `backend/` | `http://localhost:4000` |
| Next.js UI | `frontend/` | `http://localhost:3000` |

On-chain scripts (deploy, seed payments, authorize backend) live under **`onchain/`** — see **[onchain/README.md](onchain/README.md)**.

---

## Prerequisites

- **Node.js 20+** and **npm**
- **Python 3.10+** (for `python-service`)
- **MongoDB** reachable at the URI you put in `backend/.env` (default: local `27017`)
- **Person 1 / ops**: deployed **AttractorGuard** and **AgentPaymentSimulator** on Kite testnet, subgraph on **Goldsky** with the same contract addresses, and a funded **owner** wallet for `registerAgent` / optional **backend** wallet authorized via `setBackendAuthorization` (see `onchain/scripts/authorize-backend.js` and `npm run authorize-backend` from `onchain/`).

---

## How to run the whole system

Do these in order the first time you set up a machine.

### 1. MongoDB

Start MongoDB so it accepts connections (for example local default `mongodb://127.0.0.1:27017/kite-garden`). The backend creates indexes on first connect.

### 2. Python service

```bash
cd python-service
python -m venv .venv
```

**Windows (PowerShell):**

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:PORT = "5050"
python app.py
```

**macOS / Linux:**

```bash
source .venv/bin/activate
pip install -r requirements.txt
export PORT=5050
python app.py
```

Confirm: open `http://127.0.0.1:5050/health` — you should see a JSON `status` of `ok`.

### 3. Backend

```bash
cd backend
cp .env.example .env
```

Edit **`backend/.env`** at minimum:

- **`MONGODB_URI`** — match your MongoDB.
- **`GOLDSKY_ENDPOINT`** or **`SUBGRAPH_GRAPHQL_ENDPOINT`** — same GraphQL HTTP URL as in `onchain/.env` (`SUBGRAPH_GRAPHQL_ENDPOINT`).
- **`ATTRACTOR_GUARD_ADDRESS`**, **`AGENT_PAYMENT_SIMULATOR_ADDRESS`** — from deployment / `onchain/.env`.
- **`BACKEND_PRIVATE_KEY`** — EOA authorized on AttractorGuard to call `logDecision`.
- **`AGENT_OWNER_PRIVATE_KEY`** — must match the owner address you use for `POST /api/agents/register` and related owner txs.

For local UI testing without EIP-712 signatures, you can set **`SKIP_X402_VALIDATION=true`** (development only).

```bash
npm install
npm start
```

Confirm: `http://localhost:4000/health` returns JSON with `"ok": true`.

### 4. Frontend

```bash
cd frontend
cp .env.example .env.local
```

Ensure **`NEXT_PUBLIC_API_URL`** points at the API (default `http://localhost:4000`).

```bash
npm install
npm run dev
```

Open **`http://localhost:3000`**. The dashboard and agent pages call the backend using `NEXT_PUBLIC_API_URL`.

### 5. On-chain data for Goldsky (so the gate is not “synthetic only”)

The gate reads **`agentPayments`** from your Goldsky subgraph. For a given agent, the **`agentId`** (bytes32) must match payments emitted by **AgentPaymentSimulator** (or your real flow).

From **`onchain/`** (with `onchain/.env` filled, including **`PRIVATE_KEY`** and simulator address):

- Seed demo agents (Alice / Bob): **`npm run seed`**
- Seed a specific label (must match **`didLabel`** used at register, max 31 characters):

  **PowerShell:**

  ```powershell
  $env:SEED_AGENT_LABEL = "your-did-label"
  $env:SEED_COUNT = "100"
  npm run seed:agent
  ```

  **bash:**

  ```bash
  SEED_AGENT_LABEL=your-did-label SEED_COUNT=100 npm run seed:agent
  ```

Wait for Goldsky to index, then run the gate again for that **`agentId`**.

---

## Optional: Mongo-only demo row

If you only need an agent document in Mongo without registering on-chain:

```bash
cd backend
node scripts/seed-demo-agent.mjs
```

Use the printed **`agentId`** only if it is also registered and funded on-chain where your stack expects it.

---

## Quick verification checklist

1. **`GET http://localhost:4000/health`** — API up; check AA flags if you use them.
2. **`GET http://127.0.0.1:5050/health`** — Python up.
3. Register an agent (**`POST /api/agents/register`**) or use the UI register flow with **`AGENT_OWNER_PRIVATE_KEY`** matching **`ownerAddress`**.
4. Seed payments for the **same** bytes32 / `didLabel` as in step 3.
5. Open the agent in the UI and run **Run gate** — metrics should reflect real history once Goldsky returns rows.

---

## Repository layout

| Path | Role |
|------|------|
| `frontend/` | Next.js app (dashboard, register, demo, agent detail). |
| `backend/` | Express API, Mongo, Goldsky, x402, gate, AA helpers. |
| `python-service/` | Flask **`/analyze`** (SampEn / correlation dimension). |
| `onchain/` | Hardhat contracts, deploy/seed scripts, subgraph sources. |

---

## Documentation links

- [backend/PERSON2_DELIVERABLES.md](backend/PERSON2_DELIVERABLES.md) — Person 2 scope and spec notes  
- [backend/README.md](backend/README.md) — Backend API and env details  
- [onchain/README.md](onchain/README.md) — Deploy, seed, subgraph  
- [onchain/AA_SDK_INTEGRATION_GUIDE.md](onchain/AA_SDK_INTEGRATION_GUIDE.md) — Optional AA `logDecision` path  
