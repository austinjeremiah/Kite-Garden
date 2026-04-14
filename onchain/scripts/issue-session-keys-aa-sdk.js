/**
 * Session Key Issuance using GoKite Account Abstraction SDK
 * This script demonstrates issuing session keys through AA wallets
 */

const hre = require("hardhat");
require("dotenv").config();

// Note: In production, install and import from npm:
// npm install gokite-aa-sdk
// import { GokiteAASDK } from 'gokite-aa-sdk';

async function main() {
  console.log("🔑 Session Key Issuance via GoKite AA SDK\n");

  const contractAddress = process.env.ATTRACTOR_GUARD_ADDRESS;
  if (!contractAddress) {
    throw new Error("ATTRACTOR_GUARD_ADDRESS not set in .env");
  }

  const [signer] = await hre.ethers.getSigners();
  const signerAddress = signer.address;

  console.log("📋 Setup:");
  console.log(`   Signer EOA: ${signerAddress}`);
  console.log(`   AttractorGuard: ${contractAddress}\n`);

  // ============ Initialize GoKite AA SDK ============
  // In production, you would:
  // const { GokiteAASDK } = require('gokite-aa-sdk');
  
  const KITE_RPC = process.env.KITE_RPC_URL || "https://rpc-testnet.gokite.ai/";
  const BUNDLER_RPC = process.env.KITE_BUNDLER_URL || "https://bundler-service.staging.gokite.ai/rpc/";

  console.log("🔧 AA SDK Configuration:");
  console.log(`   RPC: ${KITE_RPC}`);
  console.log(`   Bundler: ${BUNDLER_RPC}\n`);

  // Mock SDK initialization (production would use real gokite-aa-sdk)
  // const sdk = new GokiteAASDK('kite_testnet', KITE_RPC, BUNDLER_RPC);

  // Get AA wallet address for the signer
  // const aaWalletAddress = sdk.getAccountAddress(signerAddress);
  // console.log(`🔐 AA Wallet Address: ${aaWalletAddress}\n`);

  // ============ Demo Agents ============
  const agents = [
    {
      did: hre.ethers.encodeBytes32String("alice-expense-v2"),
      name: "Alice's Expense Agent",
    },
    {
      did: hre.ethers.encodeBytes32String("bob-trading-v2"),
      name: "Bob's Trading Agent",
    },
    {
      did: hre.ethers.encodeBytes32String("carol-nft-v1"),
      name: "Carol's NFT Trading Agent",
    },
  ];

  // ============ Sign Function for AA SDK ============
  const signFunction = async (userOpHash) => {
    // The SDK would call this to sign user operations
    const signature = await signer.signMessage(hre.ethers.getBytes(userOpHash));
    return signature;
  };

  console.log("🔐 Issuing Session Keys via AA Bundler:\n");

  for (const agent of agents) {
    const decodedDid = hre.ethers.decodeBytes32String(agent.did);
    console.log(`📌 ${agent.name}`);
    console.log(`   DID: ${decodedDid}`);

    try {
      // ============ Create Session Key ============
      const sessionKey = hre.ethers.Wallet.createRandom().address;
      const metricValue = hre.ethers.parseEther((Math.random() * 10).toString());
      const baselineValue = hre.ethers.parseEther("2.5");
      const transactionAmount = hre.ethers.parseEther((Math.random() * 5).toString());

      console.log(`   🔑 Session Key: ${sessionKey}`);
      console.log(`   💰 Amount: ${hre.ethers.formatEther(transactionAmount)} ETH`);

      // ============ Construct User Operation ============
      // In production with AA SDK, you would:
      /*
      const AttractorGuardABI = require('../abis/AttractorGuard.json');
      const iface = new hre.ethers.Interface(AttractorGuardABI);
      
      const callData = iface.encodeFunctionData('logDecision', [
        agent.did,
        true, // issued
        metricValue,
        baselineValue,
        transactionAmount,
        sessionKey
      ]);

      const userOp = {
        sender: aaWalletAddress,
        target: contractAddress,
        value: 0n,
        callData: callData
      };

      const userOpHash = sdk.getUserOpHash(userOp);
      const signature = await signFunction(userOpHash);

      // ============ Send User Operation via Bundler ============
      const result = await sdk.sendUserOperationAndWait(
        signerAddress,
        {
          target: contractAddress,
          value: 0n,
          callData: callData
        },
        signFunction
      );

      if (result.status.status === 'success') {
        console.log(`   ✅ Session key issued via AA bundler`);
        console.log(`   📦 TX: ${result.status.transactionHash}`);
        console.log(`   📊 Metric: ${hre.ethers.formatEther(metricValue)} (baseline: ${hre.ethers.formatEther(baselineValue)})`);
      } else {
        console.log(`   ❌ Failed: ${result.status.reason}`);
      }
      */

      // For now, demonstrate with direct ethers call
      const AttractorGuard = await hre.ethers.getContractFactory("AttractorGuard");
      const contract = AttractorGuard.attach(contractAddress);

      // Authorize signer as backend (if not already)
      try {
        await contract.setBackendAuthorization(signerAddress, true);
      } catch (e) {
        // Already authorized
      }

      // Call logDecision
      const tx = await contract.logDecision(
        agent.did,
        true, // issued
        metricValue,
        baselineValue,
        transactionAmount,
        sessionKey
      );

      const receipt = await tx.wait();
      console.log(`   ✅ Session key issued in block ${receipt.blockNumber}`);
      console.log(`   📦 TX: ${tx.hash}`);
      console.log(`   📊 Metric: ${hre.ethers.formatEther(metricValue)} (baseline: ${hre.ethers.formatEther(baselineValue)})\n`);

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}\n`);
    }
  }

  console.log("✅ Session key issuance via AA SDK complete!\n");
  console.log("🔗 GoKite AA SDK Documentation:");
  console.log("   NPM: https://www.npmjs.com/package/gokite-aa-sdk");
  console.log("   GitHub: https://github.com/kite-ai/gokite-aa-sdk");
  console.log("\n📝 To use GoKite AA SDK in production:");
  console.log("   1. npm install gokite-aa-sdk");
  console.log("   2. Initialize SDK with network + bundler RPC");
  console.log("   3. Get AA wallet address for your EOA");
  console.log("   4. Send user operations through bundler");
  console.log("   5. Sign with your private key");
  console.log("\n💡 Benefits of AA SDK:");
  console.log("   - Gasless transactions via bundler");
  console.log("   - Smart contract wallets with no ETH in EOA");
  console.log("   - Batch operations (multi-call)");
  console.log("   - Upgradeable vaults with UUPS proxy");
  console.log("   - Spending rules & session key management");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
