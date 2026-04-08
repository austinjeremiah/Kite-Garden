# AttractorGuard Goldsky Subgraph

GraphQL API for querying AttractorGuard events on Kite AI testnet.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Update contract addresses in `subgraph.yaml`:
- Replace `ATTRACTOR_GUARD_ADDRESS_PLACEHOLDER` with deployed AttractorGuard address
- Replace `AGENT_PAYMENT_SIMULATOR_ADDRESS_PLACEHOLDER` with deployed simulator address

3. Copy ABIs from parent directory:
The deployment script automatically exports ABIs to `../abis/`. Verify these files exist:
- `../abis/AttractorGuard.json`
- `../abis/AgentPaymentSimulator.json`

## Deploy to Goldsky

### Using CLI:

```bash
# Login to Goldsky
goldsky login

# Deploy subgraph
npm run deploy
```

### Using Dashboard:

1. Go to https://app.goldsky.com
2. Create new subgraph
3. Select network: `kite-ai-testnet`
4. Upload files: `subgraph.yaml`, `schema.graphql`, ABIs
5. Enter contract addresses
6. Deploy

## GraphQL Endpoint

After deployment, your endpoint will be:
```
https://api.goldsky.com/api/public/[PROJECT_ID]/subgraphs/attractorguard-kite-ai-testnet/1.0.0/gn
```

## Example Queries

See parent README.md for example queries.

## Development

Generate TypeScript types:
```bash
npm run codegen
```

Build subgraph:
```bash
npm run build
```

## Network Configuration

- Network: `kite-ai-testnet`
- Chain ID: 1337 (verify with Kite docs)
- RPC: https://rpc-testnet.gokite.ai/
- Explorer: https://testnet.kitescan.ai
