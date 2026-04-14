import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  AgentRegistered,
  SessionKeyIssued,
  SessionKeyDenied,
  AgentRevoked,
  BaselineReset,
  AgentStatusChanged,
  BaselineHistoryRecorded,
  AgentFrozen,
  AgentReauthorized,
  AgentMetadataUpdated
} from "../generated/AttractorGuard/AttractorGuard";
import {
  Agent,
  GateDecision,
  SessionKeyEvent,
  BaselineResetEvent,
  AgentStatusChangeEvent,
  BaselineRecord,
  AgentFreezeEvent,
  AgentReauthorizationEvent,
  SystemStats
} from "../generated/schema";

// Helper to get or create system stats
function getSystemStats(): SystemStats {
  let stats = SystemStats.load("system");
  if (stats == null) {
    stats = new SystemStats("system");
    stats.totalAgents = BigInt.fromI32(0);
    stats.totalPayments = BigInt.fromI32(0);
    stats.totalDecisions = BigInt.fromI32(0);
    stats.totalSessionsIssued = BigInt.fromI32(0);
    stats.totalSessionsDenied = BigInt.fromI32(0);
    stats.totalAttacksDetected = BigInt.fromI32(0);
    stats.lastUpdateTimestamp = BigInt.fromI32(0);
    stats.lastUpdateBlock = BigInt.fromI32(0);
  }
  return stats;
}

export function handleAgentRegistered(event: AgentRegistered): void {
  let agent = new Agent(event.params.agentDID);
  
  agent.owner = event.params.owner;
  agent.spendingLimit = event.params.spendingLimit;
  agent.thresholdMultiplier = BigInt.fromI32(200); // Default 2.0σ
  agent.transactionCount = BigInt.fromI32(0);
  agent.isActive = true;
  agent.isRevoked = false;
  agent.registeredAt = event.params.timestamp;
  agent.lastActivityAt = event.params.timestamp;
  
  agent.totalPaid = BigInt.fromI32(0);
  agent.sessionsIssued = BigInt.fromI32(0);
  agent.sessionsDenied = BigInt.fromI32(0);
  agent.attacksDetected = BigInt.fromI32(0);
  
  agent.save();
  
  // Update system stats
  let stats = getSystemStats();
  stats.totalAgents = stats.totalAgents.plus(BigInt.fromI32(1));
  stats.lastUpdateTimestamp = event.block.timestamp;
  stats.lastUpdateBlock = event.block.number;
  stats.save();
}

export function handleSessionKeyIssued(event: SessionKeyIssued): void {
  let agent = Agent.load(event.params.agentDID);
  if (agent == null) {
    // Create agent if it doesn't exist (shouldn't happen)
    agent = new Agent(event.params.agentDID);
    agent.owner = Bytes.fromHexString("0x0000000000000000000000000000000000000000");
    agent.spendingLimit = BigInt.fromI32(0);
    agent.thresholdMultiplier = BigInt.fromI32(200);
    agent.transactionCount = BigInt.fromI32(0);
    agent.isActive = true;
    agent.isRevoked = false;
    agent.registeredAt = event.block.timestamp;
    agent.lastActivityAt = event.block.timestamp;
    agent.totalPaid = BigInt.fromI32(0);
    agent.sessionsIssued = BigInt.fromI32(0);
    agent.sessionsDenied = BigInt.fromI32(0);
    agent.attacksDetected = BigInt.fromI32(0);
  }
  
  // Update agent stats
  agent.transactionCount = agent.transactionCount.plus(BigInt.fromI32(1));
  agent.sessionsIssued = agent.sessionsIssued.plus(BigInt.fromI32(1));
  agent.totalPaid = agent.totalPaid.plus(event.params.amount);
  agent.lastActivityAt = event.params.timestamp;
  agent.save();
  
  // Create gate decision record
  let decisionId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let decision = new GateDecision(decisionId);
  decision.agent = event.params.agentDID;
  decision.agentDID = event.params.agentDID;
  decision.issued = true;
  decision.metricValue = event.params.metricValue;
  decision.baselineValue = event.params.baselineValue;
  decision.amount = event.params.amount;
  decision.sessionKey = event.params.sessionKey;
  decision.timestamp = event.params.timestamp;
  decision.blockNumber = event.block.number;
  decision.transactionHash = event.transaction.hash;
  decision.save();
  
  // Create session key event
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let sessionEvent = new SessionKeyEvent(eventId);
  sessionEvent.agent = event.params.agentDID;
  sessionEvent.agentDID = event.params.agentDID;
  sessionEvent.eventType = "ISSUED";
  sessionEvent.sessionKey = event.params.sessionKey;
  sessionEvent.amount = event.params.amount;
  sessionEvent.metricValue = event.params.metricValue;
  sessionEvent.baselineValue = event.params.baselineValue;
  sessionEvent.timestamp = event.params.timestamp;
  sessionEvent.blockNumber = event.block.number;
  sessionEvent.transactionHash = event.transaction.hash;
  sessionEvent.save();
  
  // Update system stats
  let stats = getSystemStats();
  stats.totalDecisions = stats.totalDecisions.plus(BigInt.fromI32(1));
  stats.totalSessionsIssued = stats.totalSessionsIssued.plus(BigInt.fromI32(1));
  stats.lastUpdateTimestamp = event.block.timestamp;
  stats.lastUpdateBlock = event.block.number;
  stats.save();
}

export function handleSessionKeyDenied(event: SessionKeyDenied): void {
  let agent = Agent.load(event.params.agentDID);
  if (agent == null) {
    return; // Agent should exist if we got a denial
  }
  
  // Update agent stats
  agent.transactionCount = agent.transactionCount.plus(BigInt.fromI32(1));
  agent.sessionsDenied = agent.sessionsDenied.plus(BigInt.fromI32(1));
  agent.attacksDetected = agent.attacksDetected.plus(BigInt.fromI32(1));
  agent.lastActivityAt = event.params.timestamp;
  agent.save();
  
  // Create gate decision record
  let decisionId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let decision = new GateDecision(decisionId);
  decision.agent = event.params.agentDID;
  decision.agentDID = event.params.agentDID;
  decision.issued = false;
  decision.metricValue = event.params.metricValue;
  decision.baselineValue = event.params.baselineValue;
  decision.amount = event.params.amount;
  decision.sessionKey = null;
  decision.timestamp = event.params.timestamp;
  decision.blockNumber = event.block.number;
  decision.transactionHash = event.transaction.hash;
  decision.save();
  
  // Create session key event
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let sessionEvent = new SessionKeyEvent(eventId);
  sessionEvent.agent = event.params.agentDID;
  sessionEvent.agentDID = event.params.agentDID;
  sessionEvent.eventType = "DENIED";
  sessionEvent.sessionKey = null;
  sessionEvent.amount = event.params.amount;
  sessionEvent.metricValue = event.params.metricValue;
  sessionEvent.baselineValue = event.params.baselineValue;
  sessionEvent.timestamp = event.params.timestamp;
  sessionEvent.blockNumber = event.block.number;
  sessionEvent.transactionHash = event.transaction.hash;
  sessionEvent.save();
  
  // Update system stats
  let stats = getSystemStats();
  stats.totalDecisions = stats.totalDecisions.plus(BigInt.fromI32(1));
  stats.totalSessionsDenied = stats.totalSessionsDenied.plus(BigInt.fromI32(1));
  stats.totalAttacksDetected = stats.totalAttacksDetected.plus(BigInt.fromI32(1));
  stats.lastUpdateTimestamp = event.block.timestamp;
  stats.lastUpdateBlock = event.block.number;
  stats.save();
}

export function handleAgentRevoked(event: AgentRevoked): void {
  let agent = Agent.load(event.params.agentDID);
  if (agent == null) {
    return;
  }
  
  agent.isRevoked = true;
  agent.isActive = false;
  agent.lastActivityAt = event.params.timestamp;
  agent.save();
}

export function handleBaselineReset(event: BaselineReset): void {
  let agent = Agent.load(event.params.agentDID);
  if (agent == null) {
    return;
  }
  
  agent.lastActivityAt = event.params.timestamp;
  agent.save();
  
  // Create baseline reset event
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let resetEvent = new BaselineResetEvent(eventId);
  resetEvent.agent = event.params.agentDID;
  resetEvent.agentDID = event.params.agentDID;
  resetEvent.newBaseline = event.params.newBaseline;
  resetEvent.timestamp = event.params.timestamp;
  resetEvent.blockNumber = event.block.number;
  resetEvent.transactionHash = event.transaction.hash;
  resetEvent.save();
}

export function handleAgentStatusChanged(event: AgentStatusChanged): void {
  let agent = Agent.load(event.params.agentDID);
  if (agent == null) {
    return;
  }
  
  agent.isActive = event.params.isActive;
  agent.lastActivityAt = event.params.timestamp;
  agent.save();
  
  // Create status change event
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let statusEvent = new AgentStatusChangeEvent(eventId);
  statusEvent.agent = event.params.agentDID;
  statusEvent.agentDID = event.params.agentDID;
  statusEvent.isActive = event.params.isActive;
  statusEvent.timestamp = event.params.timestamp;
  statusEvent.blockNumber = event.block.number;
  statusEvent.transactionHash = event.transaction.hash;
  statusEvent.save();
}

// ============ NEW EVENT HANDLERS ============

export function handleBaselineHistoryRecorded(event: BaselineHistoryRecorded): void {
  let agent = Agent.load(event.params.agentDID);
  if (agent == null) {
    return;
  }
  
  agent.lastActivityAt = event.params.timestamp;
  agent.save();
  
  // Create baseline record 
  let recordId = event.params.agentDID.toHex() + "-" + event.logIndex.toString();
  let record = new BaselineRecord(recordId);
  record.agent = event.params.agentDID;
  record.agentDID = event.params.agentDID;
  record.baselineValue = event.params.baselineValue;
  record.timestamp = event.params.timestamp;
  record.isActive = true;
  record.reason = event.params.reason;
  record.blockNumber = event.block.number;
  record.save();
}

export function handleAgentFrozen(event: AgentFrozen): void {
  let agent = Agent.load(event.params.agentDID);
  if (agent == null) {
    return;
  }
  
  agent.isActive = false;
  agent.freezeCount = event.params.freezeCount;
  agent.lastFreezeTime = event.block.timestamp;
  agent.lastActivityAt = event.block.timestamp;
  agent.save();
  
  // Create freeze event
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let freezeEvent = new AgentFreezeEvent(eventId);
  freezeEvent.agent = event.params.agentDID;
  freezeEvent.agentDID = event.params.agentDID;
  freezeEvent.freezeCount = event.params.freezeCount;
  freezeEvent.reason = event.params.reason;
  freezeEvent.timestamp = event.block.timestamp;
  freezeEvent.blockNumber = event.block.number;
  freezeEvent.transactionHash = event.transaction.hash;
  freezeEvent.save();
}

export function handleAgentReauthorized(event: AgentReauthorized): void {
  let agent = Agent.load(event.params.agentDID);
  if (agent == null) {
    return;
  }
  
  agent.isActive = true;
  agent.lastActivityAt = event.block.timestamp;
  agent.save();
  
  // Record new baseline
  let recordId = event.params.agentDID.toHex() + "-" + event.logIndex.toString();
  let record = new BaselineRecord(recordId);
  record.agent = event.params.agentDID;
  record.agentDID = event.params.agentDID;
  record.baselineValue = event.params.newBaselineValue;
  record.timestamp = event.block.timestamp;
  record.isActive = true;
  record.reason = event.params.reason;
  record.blockNumber = event.block.number;
  record.save();
  
  // Create reauthorization event
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let reAuthEvent = new AgentReauthorizationEvent(eventId);
  reAuthEvent.agent = event.params.agentDID;
  reAuthEvent.agentDID = event.params.agentDID;
  reAuthEvent.newBaselineValue = event.params.newBaselineValue;
  reAuthEvent.reason = event.params.reason;
  reAuthEvent.timestamp = event.block.timestamp;
  reAuthEvent.blockNumber = event.block.number;
  reAuthEvent.transactionHash = event.transaction.hash;
  reAuthEvent.save();
}

export function handleAgentMetadataUpdated(event: AgentMetadataUpdated): void {
  let agent = Agent.load(event.params.agentDID);
  if (agent == null) {
    return;
  }
  
  agent.name = event.params.name;
  agent.description = event.params.description;
  agent.freezeCount = BigInt.fromI32(0);
  agent.lastFreezeTime = null;
  agent.lastActivityAt = event.block.timestamp;
  agent.save();
}
