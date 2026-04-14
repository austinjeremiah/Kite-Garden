// Real values from Person 1 deployment
// All NEXT_PUBLIC_ vars are safe to expose in the browser

export const GOLDSKY_ENDPOINT =
  process.env.NEXT_PUBLIC_GOLDSKY_ENDPOINT ??
  "https://api.goldsky.com/api/public/project_cmnxhd74o47i501vvc35oe0mc/subgraphs/attractorguard-kite-ai-testnet/5.0.2/gn";

export const ATTRACTOR_GUARD_ADDRESS =
  process.env.NEXT_PUBLIC_ATTRACTOR_GUARD_ADDRESS ??
  "0x1F958d24298e04e8516EA972eFc2A3Bd50B4BF4F";

export const AGENT_PAYMENT_SIMULATOR_ADDRESS =
  process.env.NEXT_PUBLIC_AGENT_PAYMENT_SIMULATOR_ADDRESS ??
  "0x1634edA803e70dF6a674B2E67B6D0B11C0b4B9aC";

export const KITE_EXPLORER = "https://testnet.kitescan.ai";
export const KITE_RPC      = "https://rpc-testnet.gokite.ai/";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

export function explorerAddress(address: string) {
  return `${KITE_EXPLORER}/address/${address}`;
}

export function explorerTx(hash: string) {
  return `${KITE_EXPLORER}/tx/${hash}`;
}
