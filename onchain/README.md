# AttractorGuard - Onchain Infrastructure

Smart contracts, deployment scripts, and Goldsky subgraph for AttractorGuard on Kite AI testnet.

## 📁 Structure

```
onchain/
├── contracts/               # Solidity smart contracts
│   ├── AttractorGuard.sol          # Main contract for behavioral monitoring
│   └── AgentPaymentSimulator.sol   # Demo contract for simulating payments
├── scripts/                 # Deployment and utility scripts
│   ├── deploy.js                   # Deploy contracts to Kite testnet
│   └── seed.js                     # Seed demo agent transaction history
├── test/                    # Contract tests (to be implemented)
├── subgraph/               # Goldsky subgraph configuration
│   ├── subgraph.yaml              # Subgraph manifest
│   ├── schema.graphql             # GraphQL schema
│   └── src/                       # Subgraph mapping handlers
│       ├── attractor-guard.ts
│       └── payment-simulator.ts
├── abis/                   # Exported contract ABIs (generated)
├── deployments/            # Deployment records (generated)
├── hardhat.config.js       # Hardhat configuration
├── .env.example           # Environment variables template
└── package.json
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd onchain
npm install --legacy-peer-deps
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `PRIVATE_KEY` - Your deployer wallet private key (get testnet ETH from faucet)
- `KITE_RPC_URL` - Kite testnet RPC (default: https://rpc-testnet.gokite.ai/)
- `GOLDSKY_API_KEY` - Your Goldsky API key for subgraph deployment

### 3. Get Testnet Funds

Visit the Kite faucet: https://faucet.gokite.ai

### 4. Compile Contracts

```bash
npx hardhat compile
```

### 5. Deploy to Kite Testnet

```bash
npx hardhat run scripts/deploy.js --network kiteTestnet
```

This will:
- Deploy `AttractorGuard.sol`
- Deploy `AgentPaymentSimulator.sol`
- Export ABIs to `./abis/`
- Save deployment info to `./deployments/`
- Print contract addresses for `.env`

### 6. Seed Demo Data

After deployment, update `.env` with the deployed contract addresses, then:

```bash
npx hardhat run scripts/seed.js --network kiteTestnet
```

This seeds 300 normal transactions for two demo agents:
- `alice-expense-v1` - Stable expense tracking agent
- `bob-trading-v1` - Trading agent (will be compromised in demo)

### 7. Deploy Goldsky Subgraph

#### Option A: Using Goldsky CLI

```bash
# Install Goldsky CLI
npm install -g @goldsky/cli

# Login
goldsky login

# Update contract addresses in subgraph.yaml
# Replace ATTRACTOR_GUARD_ADDRESS_PLACEHOLDER and AGENT_PAYMENT_SIMULATOR_ADDRESS_PLACEHOLDER

# Deploy
cd subgraph
goldsky subgraph deploy attractorguard-kite-ai-testnet/1.0.0 \
  --path . \
  --network kite-ai-testnet
```

#### Option B: Using Goldsky No-Code Dashboard

1. Go to https://app.goldsky.com
2. Create new subgraph
3. Select "kite-ai-testnet" network
4. Upload `subgraph.yaml`, `schema.graphql`, and ABIs
5. Enter contract addresses from deployment
6. Deploy

The GraphQL endpoint will be available at:
```
https://api.goldsky.com/api/public/[PROJECT_ID]/subgraphs/attractorguard-kite-ai-testnet/1.0.0/gn
```

## 📋 Contract Addresses (Kite Testnet)

After deployment, update these in your `.env`:

```
ATTRACTOR_GUARD_ADDRESS=0x...
AGENT_PAYMENT_SIMULATOR_ADDRESS=0x...
```

## 🏗️ Smart Contracts

### AttractorGuard.sol

The main behavioral monitoring contract. Records gate decisions and manages agent state.

**Key Functions:**
- `registerAgent()` - Register new agent with spending limit and threshold
- `logDecision()` - Log session key decision (called by authorized backend)
- `revokeAgent()` - Permanently revoke agent (owner only)
- `setAgentStatus()` - Enable/disable agent (owner only)
- `resetBaseline()` - Reset behavioral baseline (owner only)

**Events:**
- `AgentRegistered` - Agent registered
- `SessionKeyIssued` - Session key issued (behavior stable)
- `SessionKeyDenied` - Session key denied (behavior diverged)
- `AgentRevoked` - Agent permanently revoked
- `BaselineReset` - Baseline reset by owner

### AgentPaymentSimulator.sol

Demo contract for simulating payment events that Goldsky indexes.

**Key Functions:**
- `simulatePayment()` - Simulate single payment
- `simulateNormal()` - Simulate N normal payments with stable distribution
- `simulateAttack()` - Inject burst of anomalous payments
- `seedHistory()` - Seed initial transaction history (200-500 transactions)
- `batchSimulate()` - Batch simulate multiple payments

**Events:**
- `PaymentExecuted` - Payment simulated
- `AttackInjected` - Attack pattern injected
- `SeedingCompleted` - Seeding completed

## 📊 Goldsky Subgraph

### GraphQL Schema

**Entities:**
- `Agent` - Agent registration and stats
- `AgentPayment` - Simulated payment events
- `GateDecision` - Session key decisions
- `SessionKeyEvent` - Session key issued/denied events
- `AttackEvent` - Attack injection events
- `SystemStats` - Global statistics

### Example Queries

**Get all agents:**
```graphql
query {
  agents {
    id
    owner
    transactionCount
    sessionsIssued
    sessionsDenied
    isActive
    isRevoked
  }
}
```

**Get agent payment history:**
```graphql
query {
  agentPayments(
    where: { agentDID: "0x616c6963652d657870656e73652d763100000000000000000000000000000000" }
    orderBy: timestamp
    orderDirection: desc
    first: 100
  ) {
    amount
    to
    paymentType
    timestamp
  }
}
```

**Get gate decisions:**
```graphql
query {
  gateDecisions(
    where: { agentDID: "0x626f622d74726164696e672d76310000000000000000000000000000000000000" }
    orderBy: timestamp
    orderDirection: desc
  ) {
    issued
    metricValue
    baselineValue
    amount
    timestamp
  }
}
```

**Get system stats:**
```graphql
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
```

## 🧪 Testing

To run contract tests (once implemented):

```bash
npx hardhat test
```

To run coverage:

```bash
npx hardhat coverage
```

## 🔍 Verification

Verify contracts on Kite testnet explorer:

```bash
npx hardhat verify --network kiteTestnet <CONTRACT_ADDRESS>
```

## 📚 Resources

- **Kite Docs**: https://docs.gokite.ai
- **Kite Testnet Explorer**: https://testnet.kitescan.ai
- **Kite Faucet**: https://faucet.gokite.ai
- **Goldsky Docs**: https://docs.goldsky.com
- **Goldsky Kite Integration**: https://docs.goldsky.com/chains/kite-ai

## 🎯 Person 1 Deliverables Checklist

- [x] Smart contract development
  - [x] AttractorGuard.sol
  - [x] AgentPaymentSimulator.sol
- [x] Deployment scripts
  - [x] deploy.js
  - [x] seed.js
- [x] Goldsky subgraph
  - [x] schema.graphql
  - [x] subgraph.yaml
  - [x] Mapping handlers (TypeScript)
- [ ] Contract deployment to Kite testnet
- [ ] Contract verification on explorer
- [ ] Seed 300 transactions for demo agents
- [ ] Goldsky subgraph deployment
- [ ] Agent Passport creation in Kite Portal
  - [ ] alice-expense-v1
  - [ ] bob-trading-v1
- [ ] Share deployment info with team
  - [ ] Contract addresses
  - [ ] ABIs
  - [ ] Goldsky GraphQL endpoint

## 🤝 Integration Points

**For Person 2 (Backend):**
- ABIs exported to `./abis/` for ethers.js integration
- Deployment addresses in `.env` template
- Goldsky GraphQL endpoint for querying transaction history

**For Person 3 (Frontend):**
- ABIs for contract interaction
- Contract addresses for ethers.js
- GraphQL schema for querying indexed data

## 💡 Tips

1. **Gas Optimization**: Both contracts are optimized for gas efficiency
2. **Demo Mode**: AgentPaymentSimulator has demo mode enabled by default
3. **Event Indexing**: All critical actions emit events for Goldsky indexing
4. **Baseline Storage**: Baselines are stored off-chain (MongoDB) but resets are logged on-chain
5. **Authorization**: Backend must be authorized via `setBackendAuthorization()` before calling `logDecision()`

## 🐛 Troubleshooting

**"Insufficient funds for gas"**
- Get testnet ETH from faucet: https://faucet.gokite.ai

**"Network kiteTestnet not found"**
- Check `KITE_RPC_URL` in `.env`
- Verify you're connected to testnet RPC

**"Contract not verified"**
- Run verification command with contract address
- May need to wait a few minutes after deployment

**"Subgraph deployment failed"**
- Verify contract addresses in `subgraph.yaml`
- Check ABIs are in `../abis/` directory
- Ensure network is set to `kite-ai-testnet`

## 📝 Notes

- Session keys expire every 60 seconds on Kite (per spec)
- Metric values are scaled by 1e18 for precision in contracts
- Agent DIDs are stored as bytes32 (keccak256 hash or encoded string)
- Demo mode can be toggled via `setDemoMode()` in AgentPaymentSimulator
