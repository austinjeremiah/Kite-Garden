"use client";

import { useEffect, useRef, useState } from "react";
import { useWeb3Auth, useWeb3AuthConnect, useWeb3AuthDisconnect } from "@web3auth/modal/react";

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletConnectButton({
  variant = "dark",
  onConnected,
}: {
  variant?: "dark" | "light";
  onConnected?: (address: string) => void;
}) {
  const { provider, isConnected } = useWeb3Auth();
  const { connect, loading: connecting } = useWeb3AuthConnect();
  const { disconnect } = useWeb3AuthDisconnect();
  const [address, setAddress] = useState<string>("");
  const notified = useRef(false);

  useEffect(() => {
    if (!provider || !isConnected) {
      setAddress("");
      notified.current = false;
      return;
    }
    (provider.request({ method: "eth_accounts" }) as Promise<string[]>)
      .then((accounts) => {
        const a = accounts?.[0] ?? "";
        setAddress(a);
        if (a && !notified.current) {
          notified.current = true;
          onConnected?.(a);
        }
      })
      .catch(() => null);
  }, [provider, isConnected, onConnected]);

  const handleClick = () => {
    if (isConnected) {
      void disconnect();
    } else {
      void connect();
    }
  };

  const baseCls =
    "inline-flex items-center gap-2 px-4 py-2 font-mono text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-full";
  const skin =
    variant === "light"
      ? "bg-white text-black hover:bg-white/90"
      : "border border-white/40 text-white hover:bg-white/10";

  let label: string;
  if (connecting) label = "Connecting…";
  else if (isConnected && address) label = shortAddress(address);
  else label = "Connect wallet";

  return (
    <button onClick={handleClick} disabled={connecting} className={`${baseCls} ${skin}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-white/30"}`} />
      {label}
    </button>
  );
}
