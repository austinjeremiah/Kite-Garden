// Minimal ERC-20 ABI for Kite testnet Settlement Token
export const USDC_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
] as const;

// Kite testnet settlement token (per Kite docs)
export const KITE_USDC_ADDRESS = "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
