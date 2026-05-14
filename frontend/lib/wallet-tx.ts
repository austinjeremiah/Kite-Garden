import { BrowserProvider, Contract, encodeBytes32String, parseEther, parseUnits } from "ethers";
import type { IProvider } from "@web3auth/modal";
import { ATTRACTOR_GUARD_ABI } from "./attractor-guard-abi";
import { ATTRACTOR_GUARD_ADDRESS } from "./config";

/**
 * Try to perform an on-chain action via the connected Web3Auth wallet.
 * Returns the txHash on success, or null on ANY failure (silent fallback).
 */
async function withWallet<T>(
  provider: IProvider | null,
  fn: (contract: Contract) => Promise<T>
): Promise<T | null> {
  if (!provider) return null;
  try {
    const ethers = new BrowserProvider(provider as never);
    const signer = await ethers.getSigner();
    const contract = new Contract(ATTRACTOR_GUARD_ADDRESS, ATTRACTOR_GUARD_ABI, signer);
    return await fn(contract);
  } catch {
    return null;
  }
}

export async function walletRegister(
  provider: IProvider | null,
  didLabel: string,
  spendingLimitUSDC: number,
  thresholdMultiplier: number
): Promise<string | null> {
  return withWallet(provider, async (contract) => {
    const agentId = encodeBytes32String(didLabel.slice(0, 31));
    const spendingLimitWei = parseUnits(String(spendingLimitUSDC), 18);
    const th = Math.round(thresholdMultiplier * 100);
    const tx = await contract.registerAgent(agentId, spendingLimitWei, th);
    const receipt = await tx.wait();
    return receipt.hash as string;
  });
}

export async function walletRevoke(provider: IProvider | null, agentId: string): Promise<string | null> {
  return withWallet(provider, async (contract) => {
    const tx = await contract.revokeAgent(agentId);
    const receipt = await tx.wait();
    return receipt.hash as string;
  });
}

export async function walletReauthorize(provider: IProvider | null, agentId: string): Promise<string | null> {
  return withWallet(provider, async (contract) => {
    const tx1 = await contract.setAgentStatus(agentId, true);
    await tx1.wait();
    const tx2 = await contract.resetBaseline(agentId, 0);
    const receipt = await tx2.wait();
    return receipt.hash as string;
  });
}

/**
 * Fire a real native KITE token transfer on Kite testnet from the connected wallet.
 * Returns null silently if wallet not connected, balance too low, or any failure.
 */
export async function walletTransferNative(
  provider: IProvider | null,
  to: string,
  amountKITE: number
): Promise<string | null> {
  if (!provider) return null;
  try {
    const ethers = new BrowserProvider(provider as never);
    const signer = await ethers.getSigner();
    const value = parseEther(String(amountKITE));

    const signerAddress = await signer.getAddress();
    const balance = await ethers.getBalance(signerAddress);
    if (balance < value) return null;

    const tx = await signer.sendTransaction({ to, value });
    const receipt = await tx.wait();
    return receipt?.hash ?? null;
  } catch {
    return null;
  }
}
