/**
 * gokite-aa-sdk UserOps for AttractorGuard.logDecision and optional addSessionKeyRule on the AA account.
 * Docs: https://docs.gokite.ai/kite-chain/account-abstraction-sdk — signing uses signMessage(getBytes(userOpHash)).
 */
import { createRequire } from "module";
import { ethers } from "ethers";
import { config } from "./config.js";
import { encodeLogDecisionCalldata } from "./chain.js";

const require = createRequire(import.meta.url);
const { GokiteAASDK, getAccountAddress, NETWORKS } = require("gokite-aa-sdk");

/** Kite / EIP-3009 style payment authorization (first 4 bytes). */
const EIP3009_TRANSFER_WITH_AUTH =
  "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)";

/** Minimal ABI for Kite AA account session rules (Kitegarden.md). Verify against live implementation if calls revert. */
const GOKITE_ACCOUNT_SESSION_ABI = [
  "function addSessionKeyRule(address sessionKeyAddress, bytes32 agentId, bytes4 functionSelector, uint256 valueLimit) external",
];

/** SDK internal default when salt is omitted (see gokite-aa-sdk dist/utils.js). */
const SDK_DEFAULT_SALT = 2n;

function parseAaSalt(raw) {
  if (!raw || !String(raw).trim()) return undefined;
  const s = String(raw).trim();
  try {
    if (s.startsWith("0x") || s.startsWith("0X")) return BigInt(s);
    return BigInt(s);
  } catch {
    return undefined;
  }
}

function aaSalt() {
  return parseAaSalt(config.aaAccountSalt) ?? SDK_DEFAULT_SALT;
}

function defaultSessionKeySelector() {
  return ethers.id(EIP3009_TRANSFER_WITH_AUTH).slice(0, 10);
}

function resolvedSessionKeySelector() {
  const s = config.sessionKeyAllowedSelector;
  if (s && /^0x[0-9a-fA-F]{8}$/.test(s)) return s;
  return defaultSessionKeySelector();
}

function createSignFunction(wallet) {
  return async (userOpHash) => {
    const digest = ethers.getBytes(userOpHash);
    return wallet.signMessage(digest);
  };
}

function makeSdk() {
  return new GokiteAASDK(config.kiteAaNetwork, config.kiteRpcUrl, config.kiteAaBundlerUrl);
}

export function isAaLogDecisionConfigured() {
  return (
    config.useAaSdkForLogDecision &&
    Boolean(config.kiteAaBundlerUrl) &&
    Boolean(config.kiteRpcUrl) &&
    Boolean(config.attractorGuardAddress) &&
    Boolean(config.backendPrivateKey)
  );
}

export function isAaSessionKeyRuleConfigured() {
  return isAaLogDecisionConfigured() && config.useAaSessionKeyRule;
}

/**
 * Counterfactual AA address (same salt/owner as UserOps).
 */
export function predictAaBackendAccountAddress() {
  const net = NETWORKS[config.kiteAaNetwork];
  if (!net || !config.backendPrivateKey) return null;
  const wallet = new ethers.Wallet(config.backendPrivateKey);
  const owner = config.aaOwnerAddress || wallet.address;
  const salt = aaSalt();
  return getAccountAddress(net.accountFactory, net.accountImplementation, owner, salt);
}

/** AA contract that should receive addSessionKeyRule (self-call on smart account). */
export function resolveAaAccountForSessionRules() {
  const explicit = config.kiteAaAccountAddress?.trim();
  if (explicit) {
    try {
      return ethers.getAddress(explicit);
    } catch {
      return null;
    }
  }
  return predictAaBackendAccountAddress();
}

export function encodeAddSessionKeyRuleCalldata(sessionKeyAddress, agentId, functionSelector, valueLimitWei) {
  const iface = new ethers.Interface(GOKITE_ACCOUNT_SESSION_ABI);
  return iface.encodeFunctionData("addSessionKeyRule", [
    sessionKeyAddress,
    agentId,
    functionSelector,
    valueLimitWei,
  ]);
}

/**
 * @returns {Promise<{ ok: true, transactionHash: string, userOpHash: string } | { ok: false, error: string }>}
 */
export async function logDecisionViaAaSdk(params) {
  const { agentId, issued, metricValue, baselineValue, amountWei, sessionKey } = params;

  if (!isAaLogDecisionConfigured()) {
    return { ok: false, error: "AA logDecision not configured (USE_AA_SDK_FOR_LOG_DECISION, KITE_AA_BUNDLER_URL, …)" };
  }

  const net = NETWORKS[config.kiteAaNetwork];
  if (!net) {
    return { ok: false, error: `Unsupported KITE_AA_NETWORK: ${config.kiteAaNetwork}` };
  }

  let wallet;
  try {
    wallet = new ethers.Wallet(config.backendPrivateKey, new ethers.JsonRpcProvider(config.kiteRpcUrl));
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }

  const owner = config.aaOwnerAddress || wallet.address;
  const salt = aaSalt();
  const callData = encodeLogDecisionCalldata(
    agentId,
    issued,
    metricValue,
    baselineValue,
    amountWei,
    sessionKey
  );

  const sdk = makeSdk();
  const request = {
    target: ethers.getAddress(config.attractorGuardAddress),
    value: 0n,
    callData,
  };

  try {
    const { userOpHash, status } = await sdk.sendUserOperationAndWait(
      owner,
      request,
      createSignFunction(wallet),
      salt,
      undefined,
      { interval: 2000, timeout: 180000, maxRetries: 90 }
    );

    const transactionHash = status?.transactionHash || null;
    if (status?.status !== "success" || !transactionHash) {
      return {
        ok: false,
        error: `UserOp finished with status=${status?.status ?? "unknown"} reason=${status?.reason ?? ""}`,
      };
    }

    return { ok: true, transactionHash, userOpHash };
  } catch (e) {
    const msg = e?.message || e?.shortMessage || String(e);
    return { ok: false, error: msg };
  }
}

/**
 * One UserOp: addSessionKeyRule on AA account + logDecision on AttractorGuard (ISSUED path).
 * @param {{ agentId, issued, metricValue, baselineValue, amountWei, sessionKeyAddress, valueLimitWei }} params
 */
export async function issueSessionKeyRuleAndLogDecisionViaAa(params) {
  const {
    agentId,
    issued,
    metricValue,
    baselineValue,
    amountWei,
    sessionKeyAddress,
    valueLimitWei,
  } = params;

  if (!isAaSessionKeyRuleConfigured()) {
    return { ok: false, error: "AA session key rule path not configured" };
  }

  const aaAccount = resolveAaAccountForSessionRules();
  if (!aaAccount) {
    return { ok: false, error: "Could not resolve AA account for addSessionKeyRule (KITE_AA_ACCOUNT_ADDRESS or prediction)" };
  }

  const net = NETWORKS[config.kiteAaNetwork];
  if (!net) {
    return { ok: false, error: `Unsupported KITE_AA_NETWORK: ${config.kiteAaNetwork}` };
  }

  let wallet;
  try {
    wallet = new ethers.Wallet(config.backendPrivateKey, new ethers.JsonRpcProvider(config.kiteRpcUrl));
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }

  const owner = config.aaOwnerAddress || wallet.address;
  const salt = aaSalt();
  const selector = resolvedSessionKeySelector();
  const ruleCalldata = encodeAddSessionKeyRuleCalldata(
    sessionKeyAddress,
    agentId,
    selector,
    valueLimitWei
  );
  const logCalldata = encodeLogDecisionCalldata(
    agentId,
    issued,
    metricValue,
    baselineValue,
    amountWei,
    sessionKeyAddress
  );

  const guard = ethers.getAddress(config.attractorGuardAddress);
  const batchRequest = {
    targets: [aaAccount, guard],
    values: [0n, 0n],
    callDatas: [ruleCalldata, logCalldata],
  };

  const sdk = makeSdk();

  try {
    const { userOpHash, status } = await sdk.sendUserOperationAndWait(
      owner,
      batchRequest,
      createSignFunction(wallet),
      salt,
      undefined,
      { interval: 2000, timeout: 180000, maxRetries: 90 }
    );

    const transactionHash = status?.transactionHash || null;
    if (status?.status !== "success" || !transactionHash) {
      return {
        ok: false,
        error: `UserOp finished with status=${status?.status ?? "unknown"} reason=${status?.reason ?? ""}`,
      };
    }

    return { ok: true, transactionHash, userOpHash };
  } catch (e) {
    const msg = e?.message || e?.shortMessage || String(e);
    return { ok: false, error: msg };
  }
}
