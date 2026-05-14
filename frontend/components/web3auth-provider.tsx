"use client";

import { Web3AuthProvider } from "@web3auth/modal/react";
import { web3AuthContextConfig } from "@/lib/web3auth-config";

export function Web3AuthWrapper({ children }: { children: React.ReactNode }) {
  return <Web3AuthProvider config={web3AuthContextConfig}>{children}</Web3AuthProvider>;
}
