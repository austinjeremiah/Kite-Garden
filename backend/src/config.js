import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Always load backend/.env (dotenv default uses cwd — breaks `node backend/src/index.js` from repo root).
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath, override: true });

function envFlag(name) {
  const v = process.env[name];
  if (v == null) return false;
  let s = String(v).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  s = s.toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function firstNonEmpty(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/kite-garden",
  /** Goldsky hosted subgraph HTTP URL (same as onchain `SUBGRAPH_GRAPHQL_ENDPOINT`). */
  goldskyEndpoint: firstNonEmpty("GOLDSKY_ENDPOINT", "SUBGRAPH_GRAPHQL_ENDPOINT"),
  /** Optional; sent as `Authorization: Bearer …` when enabled (see goldskyBearerWithPublic). */
  goldskyApiKey: (process.env.GOLDSKY_API_KEY || "").trim(),
  /**
   * When true, send Bearer token even for `/api/public/` Goldsky URLs.
   * Default false: public hosted subgraphs usually work without auth; a Bearer can break responses.
   */
  goldskyBearerWithPublic: envFlag("GOLDSKY_BEARER_WITH_PUBLIC"),
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:5050",
  demoMode: envFlag("DEMO_MODE"),
  skipX402: envFlag("SKIP_X402_VALIDATION"),
  kiteRpcUrl: process.env.KITE_RPC_URL || "https://rpc-testnet.gokite.ai/",
  attractorGuardAddress: process.env.ATTRACTOR_GUARD_ADDRESS || "",
  agentPaymentSimulatorAddress: process.env.AGENT_PAYMENT_SIMULATOR_ADDRESS || "",
  backendPrivateKey: process.env.BACKEND_PRIVATE_KEY || "",
  /** Signs registerAgent / revokeAgent / resetBaseline / setAgentStatus (must be agent owner on-chain). */
  agentOwnerPrivateKey: process.env.AGENT_OWNER_PRIVATE_KEY || "",
  explorerBase: process.env.KITE_EXPLORER_BASE || "https://testnet.kitescan.ai",
  /** Trim so Windows CRLF / spaces do not break address parsing */
  stubSessionKeyAddress: (process.env.STUB_SESSION_KEY_ADDRESS || "").trim(),
  goldskyHistoryLimit: Number(process.env.GOLDSKY_HISTORY_LIMIT || 500),
  /** Include logDecision error text on /api/gate when on-chain write fails (dev). */
  gateVerboseResponse: envFlag("GATE_VERBOSE_RESPONSE"),
  /** When true, POST /api/gate uses gokite-aa-sdk sendUserOperationAndWait for logDecision (see onchain/AA_SDK_INTEGRATION_GUIDE.md). */
  useAaSdkForLogDecision: envFlag("USE_AA_SDK_FOR_LOG_DECISION"),
  kiteAaNetwork: (process.env.KITE_AA_NETWORK || "kite_testnet").trim(),
  kiteAaBundlerUrl: (process.env.KITE_AA_BUNDLER_URL || "").trim(),
  /** EOA that owns the counterfactual AA account; defaults to address derived from BACKEND_PRIVATE_KEY. */
  aaOwnerAddress: (process.env.AA_OWNER_ADDRESS || "").trim(),
  /** Optional account salt (decimal or 0x hex). Omit to match SDK default salt (2). */
  aaAccountSalt: (process.env.AA_ACCOUNT_SALT || "").trim(),
  /**
   * When true with USE_AA_SDK_FOR_LOG_DECISION, gate ISSUED sends one UserOp batch:
   * addSessionKeyRule on the AA account + logDecision on AttractorGuard (spec / Kitegarden.md).
   */
  useAaSessionKeyRule: envFlag("USE_AA_SESSION_KEY_RULE"),
  /** AA account that receives addSessionKeyRule (defaults to predicted AA from BACKEND_PRIVATE_KEY). */
  kiteAaAccountAddress: (process.env.KITE_AA_ACCOUNT_ADDRESS || "").trim(),
  /** bytes4 allowed function for the session key, e.g. EIP-3009 transferWithAuthorization. Empty = default selector. */
  sessionKeyAllowedSelector: (process.env.SESSION_KEY_ALLOWED_SELECTOR || "").trim(),
  /** Dev only with DEMO_MODE: gate JSON may include generated session key private key (unsafe). */
  exposeGeneratedSessionKeyPrivateKey: envFlag("EXPOSE_GENERATED_SESSION_KEY_PRIVATE_KEY"),
};
