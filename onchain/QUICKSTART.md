# AttractorGuard Quick Start - Person 1

## TL;DR
All blockchain infrastructure is **ready to deploy**. Smart contracts compiled, tests written, Goldsky subgraph configured.

## Quick Commands

### Compile
```bash
cd onchain
npm install --legacy-peer-deps
npm run compile
```

### Deploy to Kite Testnet
```bash
# 1. Get testnet ETH: https://faucet.gokite.ai
# 2. Configure .env with PRIVATE_KEY
# 3. Deploy
npm run deploy
```

### Seed Demo Data
```bash
# After deployment, update .env with contract addresses
npm run seed
```

### Deploy Goldsky Subgraph
```bash
cd subgraph
# Update subgraph.yaml with contract addresses
goldsky subgraph deploy attractorguard-kite-ai-testnet/1.0.0
```

## What's Built

| Component | Status | Lines |
|-----------|--------|-------|
| AttractorGuard.sol | ✅ | 390 |
| AgentPaymentSimulator.sol | ✅ | 360 |
| Deployment script | ✅ | 128 |
| Seed script | ✅ | 86 |
| Goldsky subgraph | ✅ | 450 |
| Tests | ✅ | 250+ |
| Documentation | ✅ | 500+ |

## Share with Team

After deployment, share these files/info:

**For Person 2 (Backend):**
- `./abis/AttractorGuard.json`
- `./abis/AgentPaymentSimulator.json`
- Contract addresses from deployment
- Goldsky GraphQL endpoint

**For Person 3 (Frontend):**
- Same as above
- Explorer links: https://testnet.kitescan.ai/address/0x...

## Test Coverage

```bash
npm test
```

Expected: 20+ tests passing covering:
- Agent registration
- Gate decisions (issued/denied)
- Authorization
- Payment simulation
- Attack injection

## Folder Structure
```
onchain/
├── contracts/       # Solidity files ✅
├── scripts/         # Deploy & seed ✅
├── test/           # Test suite ✅
├── subgraph/       # Goldsky config ✅
├── abis/           # Generated after deploy
└── deployments/    # Generated after deploy
```

## Key Environment Variables

```bash
KITE_RPC_URL=https://rpc-testnet.gokite.ai/
PRIVATE_KEY=your_private_key_here
ATTRACTOR_GUARD_ADDRESS=0x... # After deployment
AGENT_PAYMENT_SIMULATOR_ADDRESS=0x... # After deployment
GOLDSKY_API_KEY=your_goldsky_api_key
```

## Support

- Full docs: `./README.md`
- Deliverables: `./PERSON1_DELIVERABLES.md`
- Kite docs: https://docs.gokite.ai
- Goldsky docs: https://docs.goldsky.com
