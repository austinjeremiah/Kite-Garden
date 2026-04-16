import { MongoClient } from "mongodb";
import { config } from "./config.js";

let client;
let db;

export async function getDb() {
  if (db) return db;
  client = new MongoClient(config.mongoUri);
  await client.connect();
  db = client.db();
  await db.collection("agents").createIndex({ agentId: 1 }, { unique: true });
  await db.collection("events").createIndex({ timestamp: -1 });
  return db;
}

export async function closeDb() {
  if (client) await client.close();
  client = undefined;
  db = undefined;
}
