const hre = require("hardhat");
require("dotenv").config();

/**
 * Register new agents with full metadata in AttractorGuard
 */
async function main() {
  console.log("📝 Registering agents with metadata...\n");

  const contractAddress = process.env.ATTRACTOR_GUARD_ADDRESS;
  if (!contractAddress) {
    throw new Error("ATTRACTOR_GUARD_ADDRESS not set in .env");
  }

  const [signer] = await hre.ethers.getSigners();
  console.log("Registering with account:", signer.address);

  // Connect to deployed contract
  const AttractorGuard = await hre.ethers.getContractFactory("AttractorGuard");
  const contract = AttractorGuard.attach(contractAddress);
  console.log("Connected to AttractorGuard at:", contractAddress);

  // Define agents to register
  const agentsToRegister = [
    {
      did: hre.ethers.encodeBytes32String("alice-expense-v2"),
      name: "Alice's Expense Agent v2",
      description: "Monitors expense transactions and detects behavioral anomalies",
      spendingLimit: hre.ethers.parseEther("10"),
      thresholdMultiplier: 200,  // 2.0σ
      initialBaseline: hre.ethers.parseEther("2.5")
    },
    {
      did: hre.ethers.encodeBytes32String("bob-trading-v2"),
      name: "Bob's Trading Agent v2",
      description: "Autonomous trading agent with behavioral guardrails",
      spendingLimit: hre.ethers.parseEther("50"),
      thresholdMultiplier: 250,  // 2.5σ
      initialBaseline: hre.ethers.parseEther("5.0")
    },
    {
      did: hre.ethers.encodeBytes32String("carol-nft-v1"),
      name: "Carol's NFT Trading Agent",
      description: "NFT marketplace monitor with divergence detection",
      spendingLimit: hre.ethers.parseEther("100"),
      thresholdMultiplier: 180,  // 1.8σ
      initialBaseline: hre.ethers.parseEther("8.5")
    }
  ];

  console.log("\n🔄 Registering agents:");
  for (const agent of agentsToRegister) {
    const decodedDid = hre.ethers.decodeBytes32String(agent.did);
    console.log(`\n   📌 ${agent.name}`);
    console.log(`      DID: ${decodedDid}`);
    console.log(`      Description: ${agent.description}`);
    console.log(`      Spending Limit: ${hre.ethers.formatEther(agent.spendingLimit)} ETH`);
    console.log(`      Threshold: ${agent.thresholdMultiplier / 100}σ`);
    
    try {
      const tx = await contract.registerAgentWithMetadata(
        agent.did,
        agent.name,
        agent.description,
        agent.spendingLimit,
        agent.thresholdMultiplier,
        agent.initialBaseline
      );
      
      console.log(`      ⏳ Transaction: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`      ✅ Registered in block ${receipt.blockNumber}`);
      console.log(`      Gas used: ${receipt.gasUsed.toString()}`);
      
    } catch (error) {
      console.error(`      ❌ Error: ${error.message}`);
    }
  }

  console.log("\n✅ Agent registration complete!");
  console.log("\n💡 Next steps:");
  console.log("   1. Query the subgraph to see agents with metadata");
  console.log("   2. Test freeze/reauthorize events");
  console.log("   3. Monitor baseline history tracking");
  console.log("\n🔗 View on explorer:");
  console.log(`   https://testnet.kitescan.ai/address/${contractAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
