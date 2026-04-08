const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting AttractorGuard deployment to Kite AI testnet...\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Deploy AttractorGuard
  console.log("📝 Deploying AttractorGuard...");
  const AttractorGuard = await hre.ethers.getContractFactory("AttractorGuard");
  const attractorGuard = await AttractorGuard.deploy();
  await attractorGuard.waitForDeployment();
  const attractorGuardAddress = await attractorGuard.getAddress();
  console.log("✅ AttractorGuard deployed to:", attractorGuardAddress);

  // Deploy AgentPaymentSimulator
  console.log("\n📝 Deploying AgentPaymentSimulator...");
  const AgentPaymentSimulator = await hre.ethers.getContractFactory("AgentPaymentSimulator");
  const simulator = await AgentPaymentSimulator.deploy();
  await simulator.waitForDeployment();
  const simulatorAddress = await simulator.getAddress();
  console.log("✅ AgentPaymentSimulator deployed to:", simulatorAddress);

  // Wait for a few block confirmations
  console.log("\n⏳ Waiting for block confirmations...");
  await attractorGuard.deploymentTransaction().wait(3);
  await simulator.deploymentTransaction().wait(3);
  console.log("✅ Confirmations received");

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      AttractorGuard: {
        address: attractorGuardAddress,
        transactionHash: attractorGuard.deploymentTransaction().hash
      },
      AgentPaymentSimulator: {
        address: simulatorAddress,
        transactionHash: simulator.deploymentTransaction().hash
      }
    }
  };

  // Save to JSON file
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(
    deploymentsDir,
    `${hre.network.name}-${Date.now()}.json`
  );
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n💾 Deployment info saved to:", deploymentFile);

  // Update .env file references (for easy copy-paste)
  console.log("\n📋 Add these to your .env file:");
  console.log(`ATTRACTOR_GUARD_ADDRESS=${attractorGuardAddress}`);
  console.log(`AGENT_PAYMENT_SIMULATOR_ADDRESS=${simulatorAddress}`);

  // Export ABIs for frontend/backend
  console.log("\n📦 Exporting ABIs...");
  const attractorGuardArtifact = await hre.artifacts.readArtifact("AttractorGuard");
  const simulatorArtifact = await hre.artifacts.readArtifact("AgentPaymentSimulator");

  const abisDir = path.join(__dirname, "..", "abis");
  if (!fs.existsSync(abisDir)) {
    fs.mkdirSync(abisDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(abisDir, "AttractorGuard.json"),
    JSON.stringify(attractorGuardArtifact.abi, null, 2)
  );
  fs.writeFileSync(
    path.join(abisDir, "AgentPaymentSimulator.json"),
    JSON.stringify(simulatorArtifact.abi, null, 2)
  );
  console.log("✅ ABIs exported to ./abis/");

  console.log("\n🎉 Deployment complete!");
  console.log("\n📍 Contract Addresses:");
  console.log(`   AttractorGuard:         ${attractorGuardAddress}`);
  console.log(`   AgentPaymentSimulator:  ${simulatorAddress}`);
  console.log("\n🔗 View on explorer:");
  console.log(`   https://testnet.kitescan.ai/address/${attractorGuardAddress}`);
  console.log(`   https://testnet.kitescan.ai/address/${simulatorAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
