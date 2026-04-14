const hre = require("hardhat");
require("dotenv").config();

/**
 * Testnet Faucet and Demo Agent Funding Script
 * Funds demo agents with ETH from the deployer account
 */
async function main() {
  console.log("💰 Testnet Faucet Setup for Demo Agents\n");

  const [signer] = await hre.ethers.getSigners();
  const signerBalance = await hre.ethers.provider.getBalance(signer.address);
  
  console.log("🔍 Current Status:");
  console.log(`   Signer: ${signer.address}`);
  console.log(`   Balance: ${hre.ethers.formatEther(signerBalance)} ETH\n`);

  // Demo agents that need funding
  const demoAgents = [
    {
      did: hre.ethers.encodeBytes32String("alice-expense-v2"),
      name: "Alice's Expense Agent",
      fundingAmount: hre.ethers.parseEther("5"), // 5 ETH
    },
    {
      did: hre.ethers.encodeBytes32String("bob-trading-v2"),
      name: "Bob's Trading Agent",
      fundingAmount: hre.ethers.parseEther("10"), // 10 ETH
    },
    {
      did: hre.ethers.encodeBytes32String("carol-nft-v1"),
      name: "Carol's NFT Trading Agent",
      fundingAmount: hre.ethers.parseEther("7.5"), // 7.5 ETH
    },
  ];

  // In a real scenario, agents would have wallet addresses
  // For now, we'll demonstrate the funding pattern
  // In production, you'd:
  // 1. Create agent wallets
  // 2. Register them in the Portal
  // 3. Fund them from faucet

  console.log("📋 Agent Funding Plan:\n");
  let totalNeeded = hre.ethers.parseEther("0");

  for (const agent of demoAgents) {
    const decodedDid = hre.ethers.decodeBytes32String(agent.did);
    console.log(`   ${agent.name}`);
    console.log(`   DID: ${decodedDid}`);
    console.log(`   Funding: ${hre.ethers.formatEther(agent.fundingAmount)} ETH`);
    console.log();
    
    totalNeeded = totalNeeded + agent.fundingAmount;
  }

  console.log(`📊 Total Funding Required: ${hre.ethers.formatEther(totalNeeded)} ETH`);
  console.log(`💼 Available Balance: ${hre.ethers.formatEther(signerBalance)} ETH`);

  if (signerBalance < totalNeeded) {
    console.log("\n⚠️  Insufficient balance to fund all agents!");
    console.log(`   Need: ${hre.ethers.formatEther(totalNeeded)} ETH`);
    console.log(`   Have: ${hre.ethers.formatEther(signerBalance)} ETH`);
    console.log("\n💡 To fund agents on Kite testnet, use:");
    console.log("   1. Kite Faucet: https://faucet.staging.gokite.ai/");
    console.log("   2. Discord Faucet: Request on Kite Discord");
    console.log("   3. Manual funding: Send ETH from funded account\n");
    return;
  }

  console.log("\n✅ Sufficient balance to fund agents!");

  // Funding example pattern (agents would have wallets in real scenario)
  console.log("\n📝 Funding Instructions for Demo Agents:\n");

  for (const agent of demoAgents) {
    console.log(`${agent.name}:`);
    console.log(`   Amount: ${hre.ethers.formatEther(agent.fundingAmount)} ETH`);
    console.log(`   Steps:`);
    console.log(`   1. Create agent wallet on Kite Portal`);
    console.log(`   2. Get wallet address from Portal`);
    console.log(`   3. Send ${hre.ethers.formatEther(agent.fundingAmount)} ETH to that address`);
    console.log(`   4. Verify on Kite testnet explorer`);
    console.log();
  }

  console.log("🔗 Useful Resources:");
  console.log("   - Kite Faucet: https://faucet.staging.gokite.ai/");
  console.log("   - Kite Explorer: https://testnet.kitescan.ai/");
  console.log("   - Kite Portal: https://portal.staging.gokite.ai/");
  console.log("   - RPC: https://rpc-testnet.gokite.ai/\n");

  console.log("💡 Alternative: Use this script to fund specific addresses\n");

  // Example: Fund a specific address (if needed)
  if (process.argv[2]) {
    const recipientAddress = process.argv[2];
    const amount = hre.ethers.parseEther(process.argv[3] || "1");

    console.log(`🚀 Funding ${recipientAddress} with ${hre.ethers.formatEther(amount)} ETH...`);
    
    try {
      const tx = await signer.sendTransaction({
        to: recipientAddress,
        value: amount,
      });
      
      console.log(`   TX: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`   ✅ Funded in block ${receipt.blockNumber}`);
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
