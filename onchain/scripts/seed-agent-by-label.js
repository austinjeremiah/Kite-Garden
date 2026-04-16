const hre = require("hardhat");
require("dotenv").config();

/**
 * Emit PaymentExecuted events for one agent DID (string → bytes32 via ethers.encodeBytes32String).
 * Subgraph payment-simulator.ts indexes these into AgentPayment.
 *
 * Env:
 *   SEED_AGENT_LABEL — required, max 31 chars (ethers bytes32 string encoding)
 *   SEED_COUNT — optional, default 100, must be 30–500 (contract seedHistory bounds)
 */
async function main() {
  const label = (process.env.SEED_AGENT_LABEL || "").trim();
  const count = Math.min(500, Math.max(30, Number(process.env.SEED_COUNT || 100)));

  if (!label) {
    throw new Error(
      "Set SEED_AGENT_LABEL (e.g. suganthanagent). Example PowerShell:\n" +
        '  $env:SEED_AGENT_LABEL="suganthanagent"; $env:SEED_COUNT="100"; npm run seed:agent'
    );
  }
  if (label.length > 31) {
    throw new Error("SEED_AGENT_LABEL must be at most 31 characters for encodeBytes32String");
  }

  const simulatorAddress = process.env.AGENT_PAYMENT_SIMULATOR_ADDRESS;
  if (!simulatorAddress) {
    throw new Error("AGENT_PAYMENT_SIMULATOR_ADDRESS not set in onchain/.env");
  }

  const [signer] = await hre.ethers.getSigners();
  const Simulator = await hre.ethers.getContractFactory("AgentPaymentSimulator");
  const simulator = Simulator.attach(simulatorAddress);

  const did = hre.ethers.encodeBytes32String(label);
  console.log("Signer:", signer.address);
  console.log("Simulator:", simulatorAddress);
  console.log("Label:", label);
  console.log("agentDID (bytes32):", did);
  console.log("seedHistory count:", count);

  const tx = await simulator.seedHistory(did, count);
  console.log("tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("confirmed block:", receipt.blockNumber);

  const paymentCount = await simulator.getPaymentCount(did);
  console.log("on-chain payment count for this DID:", paymentCount.toString());
  console.log("\nWait for Goldsky to index, then re-query agentPayments for agent:", did);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
