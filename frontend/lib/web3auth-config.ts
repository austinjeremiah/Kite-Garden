import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/modal";
import type { Web3AuthContextConfig } from "@web3auth/modal/react";

const CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? "";

export const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
    clientId: CLIENT_ID,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    chains: [
      {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: "0x940", // 2368 — Kite testnet
        rpcTarget: "https://rpc-testnet.gokite.ai/",
        displayName: "Kite Testnet",
        blockExplorerUrl: "https://testnet.kitescan.ai",
        ticker: "KITE",
        tickerName: "Kite",
        logo: "",
      },
    ],
    defaultChainId: "0x940",
  },
};
