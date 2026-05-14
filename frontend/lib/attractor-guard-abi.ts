// Minimal ABI for the 4 functions the frontend signs via the connected wallet
export const ATTRACTOR_GUARD_ABI = [
  "function registerAgent(bytes32 agentId, uint256 spendingLimit, uint256 thresholdMultiplier) external",
  "function revokeAgent(bytes32 agentId) external",
  "function setAgentStatus(bytes32 agentId, bool isActive) external",
  "function resetBaseline(bytes32 agentId, uint256 baselineValue) external",
] as const;
