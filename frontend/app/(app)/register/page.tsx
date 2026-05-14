"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { postRegisterAgent, fetchBackendConfig } from "@/lib/api";
import { truncateId } from "@/lib/mock-data";
import { ExternalLink, CheckCircle, Info } from "lucide-react";

// ─── DID helpers ─────────────────────────────────────────────────────────────

/** Format a full Kite Passport DID from components */
function formatDid(username: string, agentLabel: string): string {
  const u = (username || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  const l = (agentLabel || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!u || !l) return "";
  return `did:kite:${u}/agent/${l}`;
}

/**
 * Preview the bytes32 hex that the backend will derive from the label.
 * Mirrors ethers.encodeBytes32String: UTF-8 encode, right-pad to 32 bytes, hex.
 */
function encodeBytes32Preview(label: string): string {
  const safe = label.trim().slice(0, 31);
  if (!safe) return "";
  const bytes = new TextEncoder().encode(safe);
  const padded = new Uint8Array(32);
  padded.set(bytes);
  return "0x" + Array.from(padded).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Basic Ethereum address format check (no checksum — backend validates) */
function isAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s.trim());
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();

  // Form state
  const [passportUsername, setPassportUsername] = useState("");
  const [agentLabel, setAgentLabel]             = useState("");
  const [description, setDescription]           = useState("");
  const [walletAddress, setWalletAddress]       = useState("");
  const [ownerAddress, setOwnerAddress]         = useState("");
  const [spendingLimit, setSpendingLimit]       = useState("10");
  const [thresholdMultiplier, setThresholdMultiplier] = useState("2");

  // Derived
  const fullDid    = formatDid(passportUsername, agentLabel);
  const bytes32Id  = encodeBytes32Preview(agentLabel);
  const labelBytes = new TextEncoder().encode(agentLabel.trim()).length;

  // Status
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState<string | null>(null);
  const [ok, setOk]       = useState<{ agentId: string; txHash: string; explorerLink?: string } | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Auto-fill from backend config
  useEffect(() => {
    fetchBackendConfig()
      .then((cfg) => {
        // Lock wallet addresses to backend-configured values (Kite Passport wallet)
        if (cfg.walletAddress) setWalletAddress(cfg.walletAddress);
        if (cfg.ownerAddress) setOwnerAddress(cfg.ownerAddress);
        if (cfg.passportUsername && !passportUsername) setPassportUsername(cfg.passportUsername);
        setConfigLoaded(true);
      })
      .catch(() => setConfigLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);

    const lim = Number(spendingLimit);
    const th  = Number(thresholdMultiplier);

    if (!agentLabel.trim()) {
      setErr("Agent label is required (e.g. alice-expense-v1).");
      return;
    }
    if (labelBytes > 31) {
      setErr("Agent label must be ≤ 31 bytes.");
      return;
    }
    if (!walletAddress.trim() || !isAddress(walletAddress.trim())) {
      setErr("Valid agent wallet address required.");
      return;
    }
    if (!ownerAddress.trim() || !isAddress(ownerAddress.trim())) {
      setErr("Valid owner address required.");
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
        name: agentLabel.trim(),           // short label = display name
        walletAddress: walletAddress.trim(),
        ownerAddress: ownerAddress.trim(),
        spendingLimit: lim,
        thresholdMultiplier: th,
        didLabel: agentLabel.trim().slice(0, 31),
        passportDid: fullDid || undefined,
        passportUsername: passportUsername.trim() || undefined,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setOk(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputCls  = "bg-black/80 border border-white/30 px-4 py-3 font-mono text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#eca8d6]/60 transition-colors w-full";
  const labelCls  = "text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest";
  const fieldCls  = "flex flex-col gap-1.5";

  return (
    <div className="flex flex-col min-h-screen overflow-y-auto">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-white/25 shrink-0">
        <h1 className="font-mono font-bold text-white text-2xl">Register Agent</h1>
        <p className="font-mono text-white/40 text-xs mt-0.5">
          Kite Passport DID → AttractorGuard.sol · Kite testnet
        </p>
      </div>

      <div className="px-8 py-8 w-full max-w-2xl mx-auto flex flex-col gap-6">

        {/* Passport banner */}
        <div className="border border-[#eca8d6]/20 bg-[#eca8d6]/5 px-5 py-4 flex items-start gap-3">
          <Info className="w-4 h-4 text-[#eca8d6]/60 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs font-bold text-[#eca8d6]/80">Kite Passport Identity</span>
            <p className="font-mono text-[10px] text-white/40 leading-relaxed">
              Each agent identity is anchored by a <span className="text-white/60">Kite Agent Passport</span> DID.
              Your passport username and agent label combine into a canonical DID
              (<code className="text-[#eca8d6]/70">did:kite:username/agent/label</code>) that gets encoded as
              the on-chain <code className="text-white/60">bytes32 agentDID</code> in AttractorGuard.sol.
              <span className="block mt-2 text-[#eca8d6]/70">
                Agent wallet (payment wallet) is editable—use your Kite Passport wallet address.
              </span>
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="border border-white/20 bg-black/70 backdrop-blur-sm p-8 flex flex-col gap-5">

          {/* Row 1: Passport username + Agent label */}
          <div className="grid grid-cols-[1fr_1fr] gap-4">
            <div className={fieldCls}>
              <div className="flex items-baseline justify-between">
                <label className={labelCls}>Passport Username</label>
                <a
                  href="https://x402-portal-eight.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] font-mono text-[#eca8d6]/60 hover:text-[#eca8d6] flex items-center gap-0.5"
                >
                  Kite Portal <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <input
                value={passportUsername}
                onChange={(e) => setPassportUsername(e.target.value)}
                className={inputCls}
                placeholder="syleshrpsa"
                autoComplete="off"
              />
            </div>
            <div className={fieldCls}>
              <div className="flex items-baseline justify-between">
                <label className={labelCls}>Agent Label</label>
                <span className="text-[9px] font-mono text-white/30">≤ 31 bytes · {labelBytes}/31</span>
              </div>
              <input
                value={agentLabel}
                onChange={(e) => setAgentLabel(e.target.value.slice(0, 31))}
                className={inputCls}
                placeholder="alice-expense-v1"
                autoComplete="off"
              />
            </div>
          </div>

          {/* DID preview */}
          {fullDid && (
            <div className="border border-white/10 bg-black/50 px-4 py-3 flex flex-col gap-1.5">
              <span className="text-[9px] font-mono font-bold text-white/30 uppercase tracking-widest">Computed Passport DID</span>
              <code className="font-mono text-xs text-[#eca8d6] break-all">{fullDid}</code>
              {bytes32Id && (
                <div className="flex flex-col gap-0.5 mt-1 border-t border-white/5 pt-2">
                  <span className="text-[9px] font-mono text-white/25 uppercase tracking-widest">On-chain agentId (bytes32 — label portion)</span>
                  <code className="font-mono text-[10px] text-white/45 break-all">{bytes32Id}</code>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div className={fieldCls}>
            <div className="flex items-baseline justify-between">
              <label className={labelCls}>Description</label>
              <span className="text-[9px] font-mono text-white/25">optional</span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputCls + " resize-none h-16"}
              placeholder="What does this agent do?"
            />
          </div>

          {/* Wallet + Owner — Wallet is editable, Owner is locked to backend config */}
          <div className="grid grid-cols-2 gap-4">
            <div className={fieldCls}>
              <div className="flex items-baseline justify-between">
                <label className={labelCls}>Agent Wallet Address</label>
                {configLoaded && walletAddress && (
                  <span className="text-[9px] font-mono text-[#eca8d6]/70">✓ Prefilled</span>
                )}
              </div>
              <input
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                className={inputCls}
                placeholder="0x… (your Kite Passport wallet)"
                autoComplete="off"
              />
              <p className="text-[9px] font-mono text-white/30 mt-1">
                Agents registered to this wallet will appear in your Kite Passport
              </p>
            </div>
            <div className={fieldCls}>
              <div className="flex items-baseline justify-between">
                <label className={labelCls}>Owner Address</label>
                {configLoaded && ownerAddress && (
                  <span className="text-[9px] font-mono text-green-400/70">✓ Locked</span>
                )}
              </div>
              <div className="bg-black/80 border border-white/30 px-4 py-3 font-mono text-sm text-white/80 rounded break-all">
                {ownerAddress || "Loading…"}
              </div>
              <p className="text-[9px] font-mono text-white/30 mt-1">
                Blockchain owner (from backend config)
              </p>
            </div>
          </div>

          {/* Spending limit + threshold */}
          <div className="grid grid-cols-2 gap-4">
            <div className={fieldCls}>
              <div className="flex items-baseline justify-between">
                <label className={labelCls}>Spending Limit</label>
                <span className="text-[9px] font-mono text-white/25">USDC</span>
              </div>
              <input
                value={spendingLimit}
                onChange={(e) => setSpendingLimit(e.target.value)}
                className={inputCls}
                inputMode="decimal"
              />
            </div>
            <div className={fieldCls}>
              <div className="flex items-baseline justify-between">
                <label className={labelCls}>Threshold ×</label>
                <span className="text-[9px] font-mono text-white/25">1–5σ</span>
              </div>
              <input
                value={thresholdMultiplier}
                onChange={(e) => setThresholdMultiplier(e.target.value)}
                className={inputCls}
                inputMode="decimal"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || !agentLabel.trim()}
            className="w-full border border-[#eca8d6]/40 bg-[#eca8d6]/10 text-[#eca8d6] font-mono font-bold text-sm py-4 hover:bg-[#eca8d6]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed mt-1"
          >
            {busy ? "Registering on-chain…" : "Register agent →"}
          </button>
        </form>

        {err && (
          <div className="border border-red-500/40 bg-red-500/5 p-4 font-mono text-xs text-red-300 whitespace-pre-wrap break-words">
            {err}
          </div>
        )}

        {ok && (
          <div className="border border-green-500/30 bg-green-500/5 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="font-mono font-bold text-green-400 text-sm">Agent registered on-chain ✓</span>
            </div>
            <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
              <div className={fieldCls}>
                <span className={labelCls}>Passport DID</span>
                <code className="font-mono text-xs text-[#eca8d6] break-all">{fullDid || agentLabel}</code>
              </div>
              <div className={fieldCls}>
                <span className={labelCls}>On-chain Agent ID (bytes32)</span>
                <code className="font-mono text-xs text-white/60 break-all">{ok.agentId}</code>
              </div>
              {ok.txHash && (
                <div className={fieldCls}>
                  <span className={labelCls}>Registration Tx</span>
                  <code className="font-mono text-xs text-white/50 break-all">{ok.txHash}</code>
                </div>
              )}
            </div>
            {ok.explorerLink && (
              <a
                href={ok.explorerLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#eca8d6] hover:underline font-mono text-xs flex items-center gap-1 w-fit"
              >
                View on Kitescan <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <div className="flex gap-4 mt-1">
              <button
                type="button"
                onClick={() => router.push(`/agent/${encodeURIComponent(ok.agentId)}`)}
                className="font-mono text-xs text-white/70 underline hover:text-white"
              >
                Open agent → {truncateId(ok.agentId, 6)}
              </button>
              <Link href="/dashboard" className="font-mono text-xs text-white/40 hover:text-white underline">
                ← Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* What happens info box */}
        <div className="border border-white/15 bg-black/60 p-6 flex flex-col gap-4">
          <span className="text-[10px] font-mono font-bold text-white/50 uppercase tracking-widest">What happens on submit</span>
          {[
            ["01", "Passport DID formatted as did:kite:{username}/agent/{label}"],
            ["02", "Agent label encoded as bytes32 → registerAgent() called on AttractorGuard.sol"],
            ["03", "AgentRegistered event emitted → Goldsky indexes the DID on Kite testnet"],
            ["04", "MongoDB record created with status=active, pendingBaselineCommit=true"],
            ["05", "First POST /api/gate call runs nolds math and commits baseline hash on-chain"],
          ].map(([n, step]) => (
            <div key={n} className="flex items-start gap-3">
              <span className="font-mono text-[10px] text-white/20 shrink-0 mt-0.5">{n}</span>
              <span className="font-mono text-xs text-white/60 leading-relaxed">{step}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
