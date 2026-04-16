import { ethers } from "ethers";
import { config } from "./config.js";

/**
 * Validates x402-style EIP-712 authorization (TransferWithAuthorization family).
 * Accepts either full typed-data envelope or a minimal testing shape.
 *
 * @param {object} x402Payload
 * @param {{ walletAddress: string, amountWei?: bigint }} agentContext
 */
export function validateX402Payload(x402Payload, agentContext) {
  if (config.skipX402) return { ok: true, recovered: null };

  if (!x402Payload || typeof x402Payload !== "object") {
    return { ok: false, reason: "missing x402Payload" };
  }

  const domain = x402Payload.domain;
  const types = x402Payload.types;
  const primaryType = x402Payload.primaryType || "TransferWithAuthorization";
  const message = x402Payload.message || x402Payload;
  const signature = x402Payload.signature;

  if (!domain || !types || !message || !signature) {
    return { ok: false, reason: "incomplete typed data (domain/types/message/signature)" };
  }

  let recovered;
  try {
    recovered = ethers.verifyTypedData(domain, types, message, signature);
  } catch (e) {
    return { ok: false, reason: `invalid signature: ${e.message}` };
  }

  const from = (message.from || message.owner || "").toString().toLowerCase();
  const expectedFrom = agentContext.walletAddress.toLowerCase();
  if (from !== expectedFrom) {
    return { ok: false, reason: "signed from does not match registered agent wallet" };
  }

  const validBefore = message.validBefore != null ? BigInt(message.validBefore) : null;
  if (validBefore != null) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now > validBefore) {
      return { ok: false, reason: "authorization expired (validBefore)" };
    }
  }

  const value = message.value != null ? BigInt(message.value) : null;
  if (value != null && agentContext.amountWei != null) {
    if (value !== agentContext.amountWei) {
      return { ok: false, reason: "signed value does not match requested amount" };
    }
  }

  return { ok: true, recovered };
}
