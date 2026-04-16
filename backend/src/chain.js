import { ethers } from "ethers";
import { config } from "./config.js";

const AGUARD_ABI = [
  "function registerAgent(bytes32 agentDID, uint256 spendingLimit, uint256 thresholdMultiplier) external returns (bool)",
  "function logDecision(bytes32 agentDID, bool issued, uint256 metricValue, uint256 baselineValue, uint256 amount, address sessionKey) external returns (uint256)",
  "function revokeAgent(bytes32 agentDID) external returns (bool)",
  "function setAgentStatus(bytes32 agentDID, bool isActive) external returns (bool)",
  "function resetBaseline(bytes32 agentDID, uint256 newBaseline) external returns (bool)",
  "function getAgent(bytes32 agentDID) view returns (tuple(address owner, uint256 spendingLimit, uint256 thresholdMultiplier, uint256 transactionCount, bool isActive, bool isRevoked, uint256 registeredAt, uint256 lastActivityAt))",
];

const SIM_ABI = ["function simulateAttack(bytes32 agentDID) external returns (uint256)"];

export function getProvider() {
  return new ethers.JsonRpcProvider(config.kiteRpcUrl);
}

export function encodeLogDecisionCalldata(agentId, issued, metricValue, baselineValue, amountWei, sessionKey) {
  const iface = new ethers.Interface(AGUARD_ABI);
  return iface.encodeFunctionData("logDecision", [
    agentId,
    issued,
    metricValue,
    baselineValue,
    amountWei,
    sessionKey,
  ]);
}

export function getAttractorGuard(signer) {
  if (!config.attractorGuardAddress) throw new Error("ATTRACTOR_GUARD_ADDRESS not set");
  return new ethers.Contract(config.attractorGuardAddress, AGUARD_ABI, signer);
}

export function getSimulator(signer) {
  if (!config.agentPaymentSimulatorAddress) {
    throw new Error("AGENT_PAYMENT_SIMULATOR_ADDRESS not set");
  }
  return new ethers.Contract(config.agentPaymentSimulatorAddress, SIM_ABI, signer);
}

export function getBackendSigner() {
  if (!config.backendPrivateKey) throw new Error("BACKEND_PRIVATE_KEY not set");
  return new ethers.Wallet(config.backendPrivateKey, getProvider());
}

export function getOwnerSigner() {
  if (!config.agentOwnerPrivateKey) throw new Error("AGENT_OWNER_PRIVATE_KEY not set");
  return new ethers.Wallet(config.agentOwnerPrivateKey, getProvider());
}

export function scaledMetric(n) {
  const s = BigInt(Math.floor(Math.abs(Number(n)) * 1e12)); // preserve precision in fixed space
  return s * 10n ** 6n; // *1e18 total
}

export function explorerTxUrl(hash) {
  if (!hash) return null;
  return `${config.explorerBase}/tx/${hash}`;
}
