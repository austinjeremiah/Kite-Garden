/**
 * Authorize the backend EOA on AttractorGuard so it can call logDecision().
 *
 * Must be run with the AttractorGuard *contract owner* key (same as deployer / PRIVATE_KEY).
 *
 * Env (onchain/.env):
 *   PRIVATE_KEY              — owner signer (authorized to call setBackendAuthorization)
 *   ATTRACTOR_GUARD_ADDRESS  — deployed AttractorGuard
 *   BACKEND_ADDRESS          — address to whitelist (from backend BACKEND_PRIVATE_KEY)
 *   — or —
 *   BACKEND_PRIVATE_KEY      — if set, address is derived and used as BACKEND_ADDRESS
 *
 * If BACKEND_* are omitted here, the script also reads only those keys from ../../backend/.env
 *
 * Usage:
 *   npx hardhat run scripts/authorize-backend.js --network kiteTestnet
 */

const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const dotenv = require("dotenv");

require("dotenv").config();

/**
 * If BACKEND_* are only in backend/.env, read those keys (do not merge whole file — avoids clashing PORT etc.).
 */
function mergeBackendEnvForAuth() {
  const backendEnvPath = path.join(__dirname, "..", "..", "backend", ".env");
  if (!fs.existsSync(backendEnvPath)) return;
  const parsed = dotenv.parse(fs.readFileSync(backendEnvPath, "utf8"));
  if (!process.env.BACKEND_ADDRESS && parsed.BACKEND_ADDRESS) {
    process.env.BACKEND_ADDRESS = parsed.BACKEND_ADDRESS.trim();
  }
  if (!process.env.BACKEND_PRIVATE_KEY && parsed.BACKEND_PRIVATE_KEY) {
    process.env.BACKEND_PRIVATE_KEY = parsed.BACKEND_PRIVATE_KEY.trim();
  }
}

async function main() {
  mergeBackendEnvForAuth();

  const guardAddr = process.env.ATTRACTOR_GUARD_ADDRESS;
  let backendAddr = process.env.BACKEND_ADDRESS;

  if (!backendAddr && process.env.BACKEND_PRIVATE_KEY) {
    backendAddr = new hre.ethers.Wallet(process.env.BACKEND_PRIVATE_KEY).address;
  }

  if (!guardAddr) {
    throw new Error("Set ATTRACTOR_GUARD_ADDRESS in onchain/.env");
  }
  if (!backendAddr) {
    throw new Error(
      "Set BACKEND_ADDRESS or BACKEND_PRIVATE_KEY in onchain/.env, or set BACKEND_PRIVATE_KEY in backend/.env"
    );
  }

  const [owner] = await hre.ethers.getSigners();
  if (!owner) {
    throw new Error("No signer: set PRIVATE_KEY in onchain/.env for kiteTestnet");
  }

  console.log("AttractorGuard:", guardAddr);
  console.log("Signer (contract owner):", owner.address);
  console.log("Backend to authorize:", backendAddr);

  const abi = [
    "function setBackendAuthorization(address backend, bool authorized) external returns (bool)",
    "function authorizedBackends(address) view returns (bool)",
  ];
  const guard = new hre.ethers.Contract(guardAddr, abi, owner);

  const already = await guard.authorizedBackends(backendAddr);
  if (already) {
    console.log("Already authorized; nothing to do.");
    return;
  }

  const tx = await guard.setBackendAuthorization(backendAddr, true);
  console.log("Tx:", tx.hash);
  await tx.wait();
  console.log("Done. Backend can call logDecision().");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
