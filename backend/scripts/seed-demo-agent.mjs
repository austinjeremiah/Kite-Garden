/**
 * Inserts a demo agent into MongoDB when chain registration is not available.
 * Usage: from backend/: `node scripts/seed-demo-agent.mjs`
 */
import { ethers } from "ethers";
import { closeDb, getDb } from "../src/db.js";

const agentId = ethers.hexlify(ethers.randomBytes(32));
const now = new Date();

const doc = {
  agentId,
  name: "demo-seeded-agent",
  walletAddress: ethers.Wallet.createRandom().address,
  ownerAddress: ethers.Wallet.createRandom().address,
  spendingLimit: 100,
  thresholdMultiplier: 2,
  mode: "early",
  transactionCount: 0,
  baselineMean: 0,
  baselineStdDev: 0,
  baselineHistory: [],
  baselineHash: null,
  baselineCommittedAt: null,
  pendingBaselineCommit: true,
  status: "active",
  createdAt: now,
  lastCheckedAt: now,
};

const db = await getDb();
const r = await db.collection("agents").updateOne({ agentId }, { $set: doc }, { upsert: true });
console.log("Seeded demo agent:", agentId);
console.log("matched:", r.matchedCount, "modified:", r.modifiedCount, "upserted:", r.upsertedCount);
await closeDb();
process.exit(0);
