import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  PaymentExecuted,
  AttackInjected,
  SeedingCompleted
} from "../generated/AgentPaymentSimulator/AgentPaymentSimulator";
import {
  Agent,
  AgentPayment,
  AttackEvent,
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

// Helper to get or create agent
function getOrCreateAgent(agentDID: Bytes): Agent {
  let agent = Agent.load(agentDID);
  if (agent == null) {
    agent = new Agent(agentDID);
    agent.owner = Bytes.fromHexString("0x0000000000000000000000000000000000000000");
    agent.spendingLimit = BigInt.fromI32(0);
    agent.thresholdMultiplier = BigInt.fromI32(200);
    agent.transactionCount = BigInt.fromI32(0);
    agent.isActive = true;
    agent.isRevoked = false;
    agent.registeredAt = BigInt.fromI32(0);
    agent.lastActivityAt = BigInt.fromI32(0);
    agent.totalPaid = BigInt.fromI32(0);
    agent.sessionsIssued = BigInt.fromI32(0);
    agent.sessionsDenied = BigInt.fromI32(0);
    agent.attacksDetected = BigInt.fromI32(0);
    agent.save();
  }
  return agent;
}

export function handlePaymentExecuted(event: PaymentExecuted): void {
  // Get or create agent
  let agent = getOrCreateAgent(event.params.agentDID);
  
  // Update agent stats
  agent.transactionCount = agent.transactionCount.plus(BigInt.fromI32(1));
  agent.totalPaid = agent.totalPaid.plus(event.params.amount);
  agent.lastActivityAt = event.params.timestamp;
  agent.save();
  
  // Create payment record
  let paymentId = event.params.paymentId.toString();
  let payment = new AgentPayment(paymentId);
  payment.agent = event.params.agentDID;
  payment.agentDID = event.params.agentDID;
  payment.amount = event.params.amount;
  payment.to = event.params.to;
  
  // Map payment type enum
  if (event.params.paymentType == 0) {
    payment.paymentType = "NORMAL";
  } else if (event.params.paymentType == 1) {
    payment.paymentType = "ATTACK";
  } else {
    payment.paymentType = "SEEDED";
  }
  
  payment.timestamp = event.params.timestamp;
  payment.blockNumber = event.block.number;
  payment.transactionHash = event.transaction.hash;
  payment.save();
  
  // Update system stats
  let stats = getSystemStats();
  stats.totalPayments = stats.totalPayments.plus(BigInt.fromI32(1));
  stats.lastUpdateTimestamp = event.block.timestamp;
  stats.lastUpdateBlock = event.block.number;
  stats.save();
}

export function handleAttackInjected(event: AttackInjected): void {
  // Get agent
  let agent = getOrCreateAgent(event.params.agentDID);
  agent.lastActivityAt = event.params.timestamp;
  agent.save();
  
  // Create attack event
  let eventId = event.transaction.hash.toHex() + "-" + event.logIndex.toString();
  let attackEvent = new AttackEvent(eventId);
  attackEvent.agent = event.params.agentDID;
  attackEvent.agentDID = event.params.agentDID;
  attackEvent.burstSize = event.params.burstSize;
  attackEvent.timestamp = event.params.timestamp;
  attackEvent.blockNumber = event.block.number;
  attackEvent.transactionHash = event.transaction.hash;
  attackEvent.save();
}

export function handleSeedingCompleted(event: SeedingCompleted): void {
  // Get agent
  let agent = getOrCreateAgent(event.params.agentDID);
  agent.lastActivityAt = event.params.timestamp;
  agent.save();
  
  // Seeding event is logged but we don't create a separate entity
  // The payments themselves are already indexed via PaymentExecuted events
}
