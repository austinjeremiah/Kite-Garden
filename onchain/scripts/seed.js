const hre = require("hardhat");
require("dotenv").config();

/**
 * Seed script for populating demo agent transaction history
 * 
 * Creates 300 normal transactions for two demo agents:
 * - alice's expense agent (stable, consistent pattern)
 * - bob's trading agent (stable initially, will be compromised in demo)
 */

async function main() {
  console.log("🌱 Starting transaction seeding...\n");

  const simulatorAddress = process.env.AGENT_PAYMENT_SIMULATOR_ADDRESS;
  if (!simulatorAddress) {
    throw new Error("AGENT_PAYMENT_SIMULATOR_ADDRESS not set in .env");
  }

  const [signer] = await hre.ethers.getSigners();
  console.log("Seeding with account:", signer.address);

  // Connect to deployed simulator contract
  const Simulator = await hre.ethers.getContractFactory("AgentPaymentSimulator");
  const simulator = Simulator.attach(simulatorAddress);
  console.log("Connected to AgentPaymentSimulator at:", simulatorAddress);

  // Define demo agents
  const demoAgents = [
    {
      did: hre.ethers.encodeBytes32String("alice-expense-v1"),
      name: "Alice's Expense Agent",
      count: 300,
      description: "Stable expense tracking agent with consistent payment patterns"
    },
    {
      did: hre.ethers.encodeBytes32String("bob-trading-v1"),
      name: "Bob's Trading Agent",
      count: 300,
      description: "Trading agent with regular transaction patterns (will be compromised in demo)"
    }
  ];

  console.log("\n📊 Seeding agents:");
  for (const agent of demoAgents) {
    console.log(`   - ${agent.name}: ${agent.count} transactions`);
  }
  console.log();

  // Seed each agent
  for (const agent of demoAgents) {
    console.log(`\n🔄 Seeding ${agent.name}...`);
    console.log(`   DID: ${hre.ethers.decodeBytes32String(agent.did)}`);
    
    try {
      const tx = await simulator.seedHistory(agent.did, agent.count);
      console.log(`   Transaction hash: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
      
      // Verify payment count
      const paymentCount = await simulator.getPaymentCount(agent.did);
      console.log(`   Total payments for agent: ${paymentCount.toString()}`);
      
    } catch (error) {
      console.error(`   ❌ Error seeding ${agent.name}:`, error.message);
    }
  }

  // Get total payments across all agents
  const totalPayments = await simulator.totalPayments();
  console.log(`\n📈 Total payments simulated: ${totalPayments.toString()}`);

  console.log("\n✅ Seeding complete!");
  console.log("\n💡 Next steps:");
  console.log("   1. Deploy Goldsky subgraph to index these events");
  console.log("   2. Verify events on Kite testnet explorer");
  console.log("   3. Configure backend to query Goldsky for transaction history");
  console.log("\n🔗 View transactions on explorer:");
  console.log(`   https://testnet.kitescan.ai/address/${simulatorAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
