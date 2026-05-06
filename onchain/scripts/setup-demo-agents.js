const hre = require("hardhat");
require("dotenv").config();

/**
 * Person 1 — Demo agent setup script.
 *
 * Does everything in one run:
 *   1. Connects to deployed AttractorGuard + AgentPaymentSimulator
 *   2. Registers alice-expense-v1 and bob-trading-v1 (skips if already registered)
 *   3. Seeds 300 normal payments for each via AgentPaymentSimulator
 *   4. Prints a summary with bytes32 agentIds and explorer links
 *
 * Usage (from onchain/):
 *   npm run setup:demo
 *
 * Environment (onchain/.env):
 *   PRIVATE_KEY, ATTRACTOR_GUARD_ADDRESS, AGENT_PAYMENT_SIMULATOR_ADDRESS
 */

const DEMO_AGENTS = [
  {
    label: "alice-expense-v1",      // must be ≤31 chars
    name: "Alice's Expense Agent",
    description: "Stable expense tracking agent — baseline demo agent for AttractorGuard",
    spendingLimit: hre.ethers.parseEther("10"),   // 10 KITE/USDC per session key
    thresholdMultiplier: 200,                      // 2.0σ
    initialBaseline: hre.ethers.parseEther("0.12"), // ~0.12 ETH avg tx (matches synthetic seed)
    seedCount: 300,
  },
  {
    label: "bob-trading-v1",
    name: "Bob's Trading Agent",
    description: "Trading agent — will be compromised in demo to show behavioral divergence",
    spendingLimit: hre.ethers.parseEther("50"),
    thresholdMultiplier: 200,
    initialBaseline: hre.ethers.parseEther("0.12"),
    seedCount: 300,
  },
];

async function getContracts(signer) {
  const guardAddr = process.env.ATTRACTOR_GUARD_ADDRESS;
  const simAddr   = process.env.AGENT_PAYMENT_SIMULATOR_ADDRESS;

  if (!guardAddr) throw new Error("ATTRACTOR_GUARD_ADDRESS not set in .env");
  if (!simAddr)   throw new Error("AGENT_PAYMENT_SIMULATOR_ADDRESS not set in .env");

  const Guard = await hre.ethers.getContractFactory("AttractorGuard");
  const Sim   = await hre.ethers.getContractFactory("AgentPaymentSimulator");

  return {
    guard:     Guard.attach(guardAddr).connect(signer),
    simulator: Sim.attach(simAddr).connect(signer),
    guardAddr,
    simAddr,
  };
}

async function registerAgent(guard, agent, signerAddr) {
  const did = hre.ethers.encodeBytes32String(agent.label);

  // Check if already registered
  const existing = await guard.getAgent(did);
  if (existing.owner !== "0x0000000000000000000000000000000000000000") {
    const active  = existing.isActive;
    const revoked = existing.isRevoked;
    if (revoked) {
      console.log(`   ⚠️  ${agent.label} is REVOKED on-chain — skipping (use a new label)`);
      return { did, skipped: true, revoked: true };
    }
    console.log(`   ℹ️  ${agent.label} already registered (owner: ${existing.owner}, active: ${active})`);
    return { did, skipped: true, revoked: false };
  }

  // Register with metadata
  const tx = await guard.registerAgentWithMetadata(
    did,
    agent.name,
    agent.description,
    agent.spendingLimit,
    agent.thresholdMultiplier,
    agent.initialBaseline
  );
  console.log(`   ⏳ registerAgentWithMetadata tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`   ✅ Registered in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);
  return { did, skipped: false, revoked: false };
}

async function seedPayments(simulator, did, label, count) {
  // Check existing count
  const existing = await simulator.getPaymentCount(did);
  const already  = Number(existing);

  if (already >= count) {
    console.log(`   ℹ️  Already has ${already} payments — skipping seed`);
    return already;
  }

  const toSeed = Math.min(count - already, 300); // contract max per call is 300
  console.log(`   🌱 Seeding ${toSeed} payments (already: ${already})...`);

  const tx = await simulator.seedHistory(did, toSeed);
  console.log(`   ⏳ seedHistory tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`   ✅ Seeded in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);

  const total = await simulator.getPaymentCount(did);
  return Number(total);
}

async function main() {
  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║  AttractorGuard — Demo Agent Setup         ║");
  console.log("╚════════════════════════════════════════════╝\n");

  const [signer] = await hre.ethers.getSigners();
  console.log(`Signer:  ${signer.address}`);

  const { guard, simulator, guardAddr, simAddr } = await getContracts(signer);
  console.log(`AttractorGuard:          ${guardAddr}`);
  console.log(`AgentPaymentSimulator:   ${simAddr}\n`);

  const results = [];

  for (const agent of DEMO_AGENTS) {
    console.log(`\n┌─ ${agent.name} (${agent.label})`);

    // 1. Register
    console.log("│  Step 1 — Register on AttractorGuard");
    const { did, skipped, revoked } = await registerAgent(guard, agent, signer.address);

    if (revoked) {
      results.push({ label: agent.label, did, status: "REVOKED — needs new label" });
      console.log("└─ ❌ Skipped (revoked)\n");
      continue;
    }

    // 2. Seed payments
    console.log("│  Step 2 — Seed payment history on AgentPaymentSimulator");
    const totalPayments = await seedPayments(simulator, did, agent.label, agent.seedCount);

    // 3. Verify on-chain state
    const agentState = await guard.getAgent(did);
    console.log(`│  Step 3 — Verification`);
    console.log(`│     owner:    ${agentState.owner}`);
    console.log(`│     active:   ${agentState.isActive}`);
    console.log(`│     payments: ${totalPayments}`);
    console.log(`│     agentId:  ${did}`);
    console.log(`└─ ✅ Ready`);

    results.push({
      label: agent.label,
      did,
      name: agent.name,
      owner: agentState.owner,
      active: agentState.isActive,
      payments: totalPayments,
      status: "OK",
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║  Summary                                    ║");
  console.log("╚════════════════════════════════════════════╝\n");

  for (const r of results) {
    console.log(`${r.status === "OK" ? "✅" : "❌"} ${r.label}`);
    console.log(`   agentId (bytes32): ${r.did}`);
    if (r.status === "OK") {
      console.log(`   owner:            ${r.owner}`);
      console.log(`   payments seeded:  ${r.payments}`);
    } else {
      console.log(`   status:           ${r.status}`);
    }
    console.log();
  }

  const explorerBase = process.env.KITE_EXPLORER_BASE || "https://testnet.kitescan.ai";
  console.log("🔗 Explorer links:");
  console.log(`   AttractorGuard:        ${explorerBase}/address/${guardAddr}`);
  console.log(`   AgentPaymentSimulator: ${explorerBase}/address/${simAddr}`);

  console.log("\n💡 Next — wait ~30s for Goldsky to index, then:");
  console.log("   • Open frontend dashboard: http://localhost:3000/dashboard");
  console.log("   • Run gate for alice: POST http://localhost:4000/api/gate");
  console.log("   • Demo page: http://localhost:3000/your-garden\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Fatal:", err.message || err);
    process.exit(1);
  });
