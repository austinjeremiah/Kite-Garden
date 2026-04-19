"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postRegisterAgent } from "@/lib/api";
import { truncateId } from "@/lib/mock-data";

export default function RegisterPage() {
  const router = useRouter();
  const [didLabel, setDidLabel] = useState("");
  const [description, setDescription] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [spendingLimit, setSpendingLimit] = useState("100");
  const [thresholdMultiplier, setThresholdMultiplier] = useState("2");
  const [agentIdHex, setAgentIdHex] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<{ agentId: string; txHash: string; explorerLink?: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);

    const aid = agentIdHex.trim();
    const did = didLabel.trim();
    const lim = Number(spendingLimit);
    const th  = Number(thresholdMultiplier);

    if (!did && !aid) {
      setErr("Agent label (or bytes32 agent ID) is required.");
      return;
    }
    if (!walletAddress.trim() || !ownerAddress.trim()) {
      setErr("Wallet address and owner address are required.");
      return;
    }
    if (!Number.isFinite(lim) || lim <= 0) {
      setErr("Spending limit must be a positive number (USDC).");
      return;
    }
    if (!Number.isFinite(th) || th < 1 || th > 5) {
      setErr("Threshold multiplier must be between 1 and 5.");
      return;
    }

    setBusy(true);
    try {
      const res = await postRegisterAgent({
        name: did || aid,           // label becomes the name
        walletAddress: walletAddress.trim(),
        ownerAddress: ownerAddress.trim(),
        spendingLimit: lim,
        thresholdMultiplier: th,
        ...(aid ? { agentId: aid } : {}),
        ...(did && !aid ? { didLabel: did.slice(0, 31) } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setOk(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "bg-black/80 border border-white/40 px-4 py-3.5 font-mono text-base text-white placeholder:text-white/30 focus:outline-none focus:border-[#eca8d6]/60 transition-colors";
  const labelCls = "text-sm font-mono font-bold text-white/80 uppercase tracking-widest";
  const hintCls  = "text-xs font-mono text-white/40";

  return (
    <div className="flex flex-col min-h-screen overflow-y-auto">
      <div className="px-8 py-5 border-b border-white/25 shrink-0">
        <h1 className="font-mono font-bold text-white text-2xl">Register Agent</h1>
        <p className="font-mono text-white/40 text-sm mt-0.5">
          On-chain registration · Kite testnet
        </p>
      </div>

      <div className="px-8 py-8 max-w-xl flex flex-col gap-6">
        <form onSubmit={onSubmit} className="border border-white/25 bg-black/70 backdrop-blur-sm p-8 flex flex-col gap-6">

          {/* Agent label — becomes name */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label className={labelCls}>Agent Label</label>
              <span className={hintCls}>becomes agentId on-chain · max 31 chars</span>
            </div>
            <input
              value={didLabel}
              onChange={(e) => setDidLabel(e.target.value)}
              className={inputCls}
              placeholder="alice-expense-v1"
              maxLength={31}
              autoComplete="off"
            />
          </div>

          {/* Description — optional */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label className={labelCls}>Description</label>
              <span className={hintCls}>optional</span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputCls + " resize-none h-20"}
              placeholder="What does this agent do? e.g. Handles expense payments for Alice's team"
            />
          </div>

          {/* Wallet address */}
          <div className="flex flex-col gap-2">
            <label className={labelCls}>Agent Wallet Address</label>
            <input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className={inputCls}
              placeholder="0x…"
              autoComplete="off"
            />
          </div>

          {/* Owner address */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label className={labelCls}>Owner Address</label>
              <span className={hintCls}>must match AGENT_OWNER_PRIVATE_KEY</span>
            </div>
            <input
              value={ownerAddress}
              onChange={(e) => setOwnerAddress(e.target.value)}
              className={inputCls}
              placeholder="0x…"
              autoComplete="off"
            />
          </div>

          {/* Spending limit + threshold */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <label className={labelCls}>Spending Limit</label>
                <span className={hintCls}>USDC</span>
              </div>
              <input
                value={spendingLimit}
                onChange={(e) => setSpendingLimit(e.target.value)}
                className={inputCls}
                inputMode="decimal"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <label className={labelCls}>Threshold ×</label>
                <span className={hintCls}>1–5σ</span>
              </div>
              <input
                value={thresholdMultiplier}
                onChange={(e) => setThresholdMultiplier(e.target.value)}
                className={inputCls}
                inputMode="decimal"
              />
            </div>
          </div>

          {/* Optional bytes32 override */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label className={labelCls}>Agent ID (bytes32)</label>
              <span className={hintCls}>optional — overrides label</span>
            </div>
            <input
              value={agentIdHex}
              onChange={(e) => setAgentIdHex(e.target.value)}
              className={inputCls + " font-mono text-sm"}
              placeholder="0x… (66 chars)"
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full border border-white/40 text-white font-mono font-bold text-base py-4 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {busy ? "Registering on-chain..." : "Register agent →"}
          </button>
        </form>

        {err && (
          <div className="border border-red-500/40 bg-red-500/10 p-4 font-mono text-sm text-red-300 whitespace-pre-wrap break-words">
            {err}
          </div>
        )}

        {ok && (
          <div className="border border-green-500/40 bg-green-500/10 p-6 flex flex-col gap-3 font-mono text-sm text-green-200">
            <p className="font-bold text-base text-green-400">Agent registered on-chain ✓</p>
            <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-white/40 text-xs uppercase tracking-widest">Agent ID</span>
                <span className="text-white break-all text-xs">{ok.agentId}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-white/40 text-xs uppercase tracking-widest">Transaction</span>
                <span className="text-white break-all text-xs">{ok.txHash}</span>
              </div>
            </div>
            {ok.explorerLink && (
              <a href={ok.explorerLink} target="_blank" rel="noopener noreferrer" className="text-[#eca8d6] underline w-fit">
                View on Kitescan ↗
              </a>
            )}
            <div className="flex gap-4 mt-1">
              <button
                type="button"
                onClick={() => router.push(`/agent/${encodeURIComponent(ok.agentId)}`)}
                className="text-white/80 underline hover:text-white"
              >
                Open agent → {truncateId(ok.agentId, 6)}
              </button>
              <Link href="/dashboard" className="text-white/50 hover:text-white underline">
                ← Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* Info box */}
        <div className="border border-white/25 bg-black/70 backdrop-blur-sm p-6 flex flex-col gap-4">
          <span className="text-sm font-mono font-bold text-white/60 uppercase tracking-widest">What happens on submit</span>
          {[
            "Agent label encoded as bytes32 → passed as name to AttractorGuard.sol",
            "AgentRegistered event emitted and indexed by Goldsky",
            "Baseline record created in MongoDB",
            "First 30 transactions build behavioral baseline automatically",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="font-mono text-xs text-white/30 shrink-0 mt-0.5">{String(i+1).padStart(2,"0")}</span>
              <span className="font-mono text-sm text-white/70 leading-relaxed">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
