"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postRegisterAgent } from "@/lib/api";
import { truncateId } from "@/lib/mock-data";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [spendingLimit, setSpendingLimit] = useState("100");
  const [thresholdMultiplier, setThresholdMultiplier] = useState("2");
  const [agentIdHex, setAgentIdHex] = useState("");
  const [didLabel, setDidLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<{ agentId: string; txHash: string; explorerLink?: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const lim = Number(spendingLimit);
    const th = Number(thresholdMultiplier);
    if (!name.trim() || !walletAddress.trim() || !ownerAddress.trim()) {
      setErr("Name, wallet address, and owner address are required.");
      return;
    }
    if (!Number.isFinite(lim) || lim <= 0) {
      setErr("Spending limit must be a positive number (USDC).");
      return;
    }
    if (!Number.isFinite(th) || th < 1 || th > 5) {
      setErr("Threshold multiplier must be between 1 and 5 (maps on-chain to 1.0–5.0×).");
      return;
    }
    const aid = agentIdHex.trim();
    const did = didLabel.trim();
    if (!aid && !did) {
      setErr("Provide either a bytes32 agent ID (0x…) or a short didLabel (e.g. alice-v1).");
      return;
    }

    setBusy(true);
    try {
      const res = await postRegisterAgent({
        name: name.trim(),
        walletAddress: walletAddress.trim(),
        ownerAddress: ownerAddress.trim(),
        spendingLimit: lim,
        thresholdMultiplier: th,
        ...(aid ? { agentId: aid } : {}),
        ...(did && !aid ? { didLabel: did.slice(0, 31) } : {}),
      });
      setOk(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen overflow-y-auto">
      <div className="px-8 py-5 border-b border-white/25 shrink-0">
        <h1 className="font-mono font-bold text-white text-lg">Register agent</h1>
        <p className="font-mono text-white/40 text-xs mt-0.5 max-w-2xl">
          Calls <span className="text-white/60">POST /api/agents/register</span> on the backend. The owner address must match{" "}
          <span className="text-white/60">AGENT_OWNER_PRIVATE_KEY</span> in <span className="text-white/60">backend/.env</span>, and on-chain config must be valid.
        </p>
      </div>

      <div className="px-8 py-8 max-w-xl flex flex-col gap-6">
        <form onSubmit={onSubmit} className="border border-white/25 bg-black/40 backdrop-blur-sm p-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-black/60 border border-white/20 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/40"
              placeholder="alice-expense-agent"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Wallet address</span>
            <input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="bg-black/60 border border-white/20 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/40"
              placeholder="0x…"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Owner address</span>
            <input
              value={ownerAddress}
              onChange={(e) => setOwnerAddress(e.target.value)}
              className="bg-black/60 border border-white/20 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/40"
              placeholder="Must match AGENT_OWNER_PRIVATE_KEY"
              autoComplete="off"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Spending limit (USDC)</span>
              <input
                value={spendingLimit}
                onChange={(e) => setSpendingLimit(e.target.value)}
                className="bg-black/60 border border-white/20 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/40"
                inputMode="decimal"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Threshold ×</span>
              <input
                value={thresholdMultiplier}
                onChange={(e) => setThresholdMultiplier(e.target.value)}
                className="bg-black/60 border border-white/20 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/40"
                inputMode="decimal"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Agent ID (bytes32 hex, optional if using label)</span>
            <input
              value={agentIdHex}
              onChange={(e) => setAgentIdHex(e.target.value)}
              className="bg-black/60 border border-white/20 px-3 py-2 font-mono text-xs text-white outline-none focus:border-white/40"
              placeholder="0x… (66 chars)"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Short label (→ bytes32 if no agent ID)</span>
            <input
              value={didLabel}
              onChange={(e) => setDidLabel(e.target.value)}
              className="bg-black/60 border border-white/20 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/40"
              placeholder="e.g. my-agent-v1 (max 31 chars)"
              maxLength={31}
              autoComplete="off"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="mt-2 border border-[#eca8d6]/50 bg-[#eca8d6]/10 text-[#eca8d6] font-mono font-bold text-sm py-3 hover:bg-[#eca8d6]/20 disabled:opacity-40"
          >
            {busy ? "Submitting…" : "Register on-chain & save"}
          </button>
        </form>

        {err && (
          <div className="border border-red-500/40 bg-red-500/10 p-4 font-mono text-xs text-red-300 whitespace-pre-wrap break-words">
            {err}
          </div>
        )}

        {ok && (
          <div className="border border-green-500/40 bg-green-500/10 p-4 flex flex-col gap-3 font-mono text-xs text-green-200">
            <p className="font-bold text-sm text-green-400">Registered</p>
            <p>
              <span className="text-white/50">agentId</span>{" "}
              <span className="text-white break-all">{ok.agentId}</span>
            </p>
            <p>
              <span className="text-white/50">tx</span>{" "}
              <span className="text-white break-all">{ok.txHash}</span>
            </p>
            {ok.explorerLink && (
              <a href={ok.explorerLink} target="_blank" rel="noopener noreferrer" className="text-[#eca8d6] underline w-fit">
                View on explorer
              </a>
            )}
            <button
              type="button"
              onClick={() => router.push(`/agent/${encodeURIComponent(ok.agentId)}`)}
              className="text-left text-white/80 underline w-fit hover:text-white"
            >
              Open agent → {truncateId(ok.agentId, 6)}
            </button>
            <Link href="/dashboard" className="text-white/50 hover:text-white underline w-fit">
              ← Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
