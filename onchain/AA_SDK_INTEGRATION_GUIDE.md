# GoKite Account Abstraction SDK - Integration Guide

## Overview

This project integrates the **GoKite Account Abstraction (AA) SDK** (`gokite-aa-sdk`) for secure, gasless session key issuance and management on the Kite AI Layer 1 testnet.

**Package:** `gokite-aa-sdk` on npm  
**Docs:** https://www.npmjs.com/package/gokite-aa-sdk

---

## Installation

```bash
npm install gokite-aa-sdk
```

---

## Architecture

### Components

1. **AttractorGuard Smart Contract**
   - On-chain behavioral monitoring and session key gate
   - `logDecision()` - Records session key issuance/denial with behavioral metrics
   - `freezeAgentWithReason()` - Freeze agent based on attractor alert
   - `reauthorizeAgent()` - Recovery from frozen state

2. **GoKite AA SDK**
   - ERC-4337 Account Abstraction wallet management
   - Bundler integration for gasless transactions
   - User operation construction and submission

3. **Session Key Workflow**
   - EOA → AA Wallet via SDK
   - Backend authorizes, simulates behavioral metrics
   - User operation sent to bundler
   - `SessionKeyIssued` event emitted on-chain
   - Event indexed by Goldsky subgraph

---

## Session Key Issuance Flow

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ User/Backend Application                                        │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Issue Session Key Request                                │   │
│ │ - Agent DID                                              │   │
│ │ - Behavioral metrics (metric vs baseline)               │   │
│ │ - Transaction amount                                     │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────────┐
│ GoKite AA SDK (gokite-aa-sdk)                                   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ 1. Initialize SDK                                        │   │
│ │    - Network: kite_testnet                               │   │
│ │    - RPC: https://rpc-testnet.gokite.ai/               │   │
│ │    - Bundler: bundler-service.staging.gokite.ai        │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ 2. Get AA Wallet Address                                 │   │
│ │    - Input: signer EOA address                           │   │
│ │    - Output: AA wallet address (deterministic)           │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ 3. Construct User Operation                              │   │
│ │    - target: AttractorGuard contract                     │   │
│ │    - callData: logDecision() encoded                     │   │
│ │    - value: 0 ETH (zero-value operation)                │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ 4. Sign User Operation Hash                              │   │
│ │    - Signature required from EOA                         │   │
│ │    - Used for bundler validation                         │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ 5. Submit to Bundler                                     │   │
│ │    - Bundler aggregates user operations                  │   │
│ │    - Bundles into single transaction                     │   │
│ │    - Pays gas on behalf of AA wallet                     │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────────┐
│ AttractorGuard Smart Contract (Kite Testnet)                   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ logDecision(                                              │   │
│ │   agentDID,                                               │   │
│ │   issued,          // true = session key approved        │   │
│ │   metricValue,     // behavioral metric (4.2)            │   │
│ │   baselineValue,   // baseline (2.5)                     │   │
│ │   amount,          // transaction amount (0.5 ETH)       │   │
│ │   sessionKey       // new session key address            │   │
│ │ )                                                         │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Emits: SessionKeyIssued(                                  │   │
│ │   agentDID, issued, metricValue, baselineValue,          │   │
│ │   amount, sessionKey, timestamp, blockNumber             │   │
│ │ )                                                         │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────────┐
│ Goldsky Subgraph                                                │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ handleSessionKeyIssued()                                 │   │
│ │ - Indexes event                                          │   │
│ │ - Creates GateDecision entity                            │   │
│ │ - Updates Agent stats (sessionsIssued, totalPaid)       │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────────┐
│ GraphQL Query API                                               │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Available for frontend/backend queries:                  │   │
│ │ - Agent metadata and statistics                          │   │
│ │ - Session key decision history                           │   │
│ │ - Baseline history and trends                            │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Code Implementation

### 1. SDK Initialization

```typescript
import { GokiteAASDK } from 'gokite-aa-sdk';

const sdk = new GokiteAASDK(
  'kite_testnet',                                  // Network
  'https://rpc-testnet.gokite.ai/',               // RPC URL
  'https://bundler-service.staging.gokite.ai/rpc/' // Bundler URL
);
```

**Configuration Details:**
- **Network:** `kite_testnet` - Kite AI Layer 1 testnet
- **RPC:** https://rpc-testnet.gokite.ai/ - Public Kite RPC endpoint
- **Bundler:** https://bundler-service.staging.gokite.ai/rpc/ - ERC-4337 bundler service

### 2. Get AA Wallet Address

```typescript
const signerEOA = '0x...'; // Your EOA address
const aaWalletAddress = sdk.getAccountAddress(signerEOA);

console.log(`AA Wallet: ${aaWalletAddress}`);
// Example: 0xAbcDef123... (deterministic from EOA)
```

**Important:** The AA wallet address is deterministic based on the signer's EOA. Same EOA always produces the same AA wallet address.

### 3. Construct User Operation

```typescript
import { ethers } from 'ethers';

const AttractorGuardABI = require('./abis/AttractorGuard.json');
const iface = new ethers.Interface(AttractorGuardABI);

const callData = iface.encodeFunctionData('logDecision', [
  agentDID,           // bytes32
  true,               // issued (boolean)
  metricValue,        // uint256 (in wei)
  baselineValue,      // uint256 (in wei)
  transactionAmount,  // uint256 (in wei)
  sessionKey          // address
]);

const userOp = {
  target: contractAddress,  // AttractorGuard address
  value: 0n,                // 0 ETH
  callData: callData        // Encoded function call
};
```

### 4. Sign User Operation

```typescript
// Define sign function
const signFunction = async (userOpHash: string): Promise<string> => {
  // Sign with your private key (ethers v6)
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY!);
  return signer.signMessage(ethers.getBytes(userOpHash));
};

// SDK will call this to sign user operation hash
```

### 5. Send via Bundler

```typescript
const result = await sdk.sendUserOperationAndWait(
  signerEOA,      // EOA address
  userOp,         // User operation
  signFunction    // Sign callback
);

if (result.status.status === 'success') {
  console.log('✅ Session key issued!');
  console.log(`TX Hash: ${result.status.transactionHash}`);
  console.log(`Block: ${result.status.blockNumber}`);
} else {
  console.log(`❌ Failed: ${result.status.reason}`);
}
```

---

## Key Concepts

### ERC-4337 Account Abstraction

- **AbstractAccount (AA):** Smart contract wallet derived from EOA
- **User Operation:** Transaction-like object executed by bundler
- **Bundler:** Aggregates user operations and pays gas
- **EntryPoint:** Contract that orchestrates AA wallet execution

### Gasless Transactions

```
Traditional Flow:
User EOA (pays gas) → Network → Contract

AA Flow:
User EOA (free) → Bundler → EntryPoint → AA Wallet → Contract
                                (pays gas)
```

---

## Session Key Issuance Workflow

### Step-by-Step

1. **Backend receives session key request**
   ```javascript
   // e.g., from Agent API
   {
     agentDID: "alice-expense-v2",
     metricValue: 4.2,  // behavioral metric
     baselineValue: 2.5,
     amount: 0.5 // ETH
   }
   ```

2. **Validate behavioral metrics**
   ```javascript
   if (metricValue > baselineValue * thresholdMultiplier) {
     // Reject: Attractor divergence detected
     logDecision(..., false, ...); // issued = false
   } else {
     // Approve: Within normal bounds
     logDecision(..., true, ...);  // issued = true
   }
   ```

3. **Create random session key**
   ```javascript
   const sessionKey = ethers.Wallet.createRandom().address;
   ```

4. **Use AA SDK to submit**
   ```javascript
   const result = await sdk.sendUserOperationAndWait(
     signerEOA,
     { target: AttractorGuard, callData: ... },
     signFunction
   );
   ```

5. **Event indexed by subgraph**
   - `SessionKeyIssued` emitted
   - Goldsky indexer captures event
   - GraphQL query becomes available

6. **Query results via GraphQL**
   ```graphql
   query {
     gateDecisions(where: { agent: "alice-expense-v2" }) {
       issued
       metricValue
       baselineValue
       amount
       sessionKey
       timestamp
     }
   }
   ```

---

## Comparison: Direct vs AA SDK

### Without AA SDK (Current Demo)
```javascript
// Direct Call - Requires gas from signer EOA
const tx = await contract.logDecision(...);
const receipt = await tx.wait();
```

**Pros:** Simple, immediate
**Cons:** Signer must have ETH for gas, not true AA

### With AA SDK (Production)
```javascript
// User Operation - Gasless via bundler
const result = await sdk.sendUserOperationAndWait(
  signerEOA,
  userOp,
  signFunction
);
```

**Pros:** Gasless, AA wallet management, flexible signing
**Cons:** Bundler dependency, slightly more complex

---

## Production Environment

### Set Environment Variables

```bash
# .env file
PRIVATE_KEY=0x...                          # Signer's private key
ATTRACTOR_GUARD_ADDRESS=0x1F958d...       # Contract address
KITE_RPC_URL=https://rpc-testnet.gokite.ai/
KITE_BUNDLER_URL=https://bundler-service.staging.gokite.ai/rpc/
```

### Install SDK

```bash
npm install gokite-aa-sdk
```

### Run Session Key Issuance

```bash
# Demo version (without AA SDK)
npm run issue-session-keys

# AA SDK version (with full integration)
npm run issue-session-keys-aa
```

---

## Advanced Features

### 1. Batch Operations

```typescript
const batchRequest = {
  targets: [contractA, contractB],
  values: [0n, 0n],
  callDatas: [callData1, callData2]
};

await sdk.sendUserOperationAndWait(
  signerEOA,
  batchRequest,
  signFunction
);
```

### 2. Spending Rules

```typescript
const rules = [{
  timeWindow: 86400n,        // 24 hours
  budget: parseEther('100'), // 100 tokens
  targetProviders: []
}];

// Configure on agent vault
await contract.setSpendingRules(rules);
```

### 3. Vault Withdrawal

```typescript
const withdrawCallData = iface.encodeFunctionData('withdraw', [
  token,
  amount,
  recipient
]);

await sdk.sendUserOperationAndWait(
  signerEOA,
  { target: vaultAddress, callData: withdrawCallData },
  signFunction
);
```

---

## Backend integration (Person 2) — optional

The **`sendUserOperationAndWait`** flow for `AttractorGuard.logDecision` is specified in this guide and in **`gokite-aa-sdk`**. **Person 2 owns** backend AA integration: env flags, `kiteAaLogDecision.js`, signing, bundler calls, fallback to EOA `logDecision`, and keeping this guide accurate as the integration is verified.

**Person 1** supplies what the chain and indexer already own: deployed addresses, subgraph/Goldsky URLs, and operational values (e.g. bundler RPC URL from infra or docs) that Person 2 plugs into `backend/.env`.

Enable AA in the backend: `USE_AA_SDK_FOR_LOG_DECISION=true` and `KITE_AA_BUNDLER_URL` (see `backend/.env.example`). Implementation: `backend/src/kiteAaLogDecision.js` (same `logDecision` encoding as direct EOA calls via `encodeLogDecisionCalldata` in `chain.js`). **`GET /health`** returns `predictedAaBackendAddress` when AA mode is on — that address must be **authorized as backend** on `AttractorGuard` (the AA account is `msg.sender` on `logDecision`, not the bare backend EOA).

**Session key rule (Kitegarden / Kite AA):** set `USE_AA_SESSION_KEY_RULE=true` (with AA enabled). On **ISSUED**, the backend sends a **single batched UserOp**: `addSessionKeyRule(sessionKey, agentId, selector, valueLimit)` on the AA account (see `encodeAddSessionKeyRuleCalldata` — **verify the ABI against the live Gokite account implementation** if the bundler reverts) followed by `logDecision` on **AttractorGuard** with the same `sessionKey` address. `SESSION_KEY_ALLOWED_SELECTOR` defaults to the EIP-3009 `transferWithAuthorization` selector; `valueLimit` uses the agent’s on-chain spending limit (Mongo `spendingLimit` → wei). **Gasless x402 execution** after issuance is still a separate integration (facilitator / relayer).

---

## Useful Kite Testnet Addresses

| Contract | Address |
|----------|---------|
| **AttractorGuard** | 0x1F958d24298e04e8516EA972eFc2A3Bd50B4BF4F |
| **AgentPaymentSimulator** | 0x1634edA803e70dF6a674B2E67B6D0B11C0b4B9aC |
| **Settlement Token** | 0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63 |
| **Settlement Contract** | 0x8d9FaD78d5Ce247aA01C140798B9558fd64a63E3 |
| **ClientAgentVault Impl** | 0xB5AAFCC6DD4DFc2B80fb8BCcf406E1a2Fd559e23 |

---

## Documentation & Resources

- **GoKite AA SDK:** https://www.npmjs.com/package/gokite-aa-sdk
- **ERC-4337 Standard:** https://eips.ethereum.org/EIPS/eip-4337
- **EntryPoint Contract:** https://github.com/eth-infinitism/account-abstraction
- **Kite Testnet Explorer:** https://testnet.kitescan.ai
- **Kite Faucet:** https://faucet.staging.gokite.ai

---

## Troubleshooting

### Issue: "Bundler service unavailable"
**Solution:** Check bundler URL and ensure Kite testnet RPC is accessible

### Issue: "User operation failed validation"
**Solution:** Verify AA wallet has sufficient balance or bundler covers gas

### Issue: "Session key not indexed"
**Solution:** Wait for Goldsky subgraph to index (usually <1 minute), verify event emitted on-chain

### Issue: "Function not found on SDK"
**Solution:** Check gokite-aa-sdk version, may be on older version, run `npm update gokite-aa-sdk`

---

## Next Steps

1. ✅ Install `gokite-aa-sdk` via npm
2. ✅ Initialize SDK with network/RPC/bundler URLs
3. ✅ Get AA wallet address for your EOA
4. ✅ Construct user operations for session key issuance
5. ✅ Sign and send via bundler
6. ✅ Monitor GraphQL subgraph for indexed events

---

*Last Updated: April 14, 2026*
*AttractorGuard on Kite AI Testnet*
