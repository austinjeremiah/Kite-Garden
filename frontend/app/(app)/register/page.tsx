"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, CheckCircle, Loader2, AlertCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegisterResult {
  agentId: string;
  txHash: string;
  explorerLink: string;
}

type FormState = "idle" | "submitting" | "success" | "error";

// ─── Mock register (swap for real POST /api/agents/register) ──────────────────

async function registerAgent(data: {
  name: string;
  walletAddress: string;
  ownerAddress: string;
  spendingLimit: number;
  thresholdMultiplier: number;
}): Promise<RegisterResult> {
  await new Promise((r) => setTimeout(r, 1800)); // simulate network
  const agentId = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("")}`;
  const txHash = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("")}`;
  return {
    agentId,
    txHash,
    explorerLink: `https://testnet.kitescan.ai/tx/${txHash}`,
  };
}

// ─── Threshold labels ─────────────────────────────────────────────────────────

const THRESHOLD_LABELS: Record<number, { label: string; desc: string }> = {
  1: { label: "Strict",  desc: "±1σ — triggers on small deviations" },
  2: { label: "Default", desc: "±2σ — recommended for most agents"  },
  3: { label: "Lenient", desc: "±3σ — only triggers on large shifts" },
};

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label, hint, children,
}: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-mono font-bold text-white/50 uppercase tracking-widest">
          {label}
        </label>
        {hint && <span className="text-[10px] font-mono text-white/25">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-black/60 border border-white/25 px-4 py-3 font-mono text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/50 transition-colors";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName]                     = useState("");
  const [wallet, setWallet]                 = useState("");
  const [owner, setOwner]                   = useState("");
  const [spendingLimit, setSpendingLimit]   = useState("100");
  const [threshold, setThreshold]           = useState(2);
  const [state, setState]                   = useState<FormState>("idle");
  const [result, setResult]                 = useState<RegisterResult | null>(null);
  const [error, setError]                   = useState("");

  const valid = name.trim() && wallet.trim() && owner.trim() && Number(spendingLimit) > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setState("submitting");
    setError("");
    try {
      const res = await registerAgent({
        name: name.trim(),
        walletAddress: wallet.trim(),
        ownerAddress: owner.trim(),
        spendingLimit: Number(spendingLimit),
        thresholdMultiplier: threshold,
      });
      setResult(res);
      setState("success");
    } catch {
      setError("Registration failed. Check the backend is running.");
      setState("error");
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (state === "success" && result) {
    return (
      <div className="flex flex-col min-h-screen">
        <div className="px-8 py-5 border-b border-white/25">
          <h1 className="font-mono font-bold text-white text-lg">Register Agent</h1>
          <p className="font-mono text-white/40 text-xs mt-0.5">On-chain registration · Kite testnet</p>
        </div>

        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-xl flex flex-col gap-6">
            {/* Success card */}
            <div className="border border-green-500/40 bg-green-500/5 p-8 flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-400 shrink-0" />
                <div>
                  <p className="font-mono font-bold text-green-400">Agent registered on-chain</p>
                  <p className="font-mono text-xs text-white/40 mt-0.5">
                    AgentRegistered event emitted · Goldsky indexing now
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4 border-t border-white/10 pt-5">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Agent name</span>
                  <span className="font-mono text-sm text-white font-semibold">{name}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Agent ID</span>
                  <span className="font-mono text-xs text-white/80 break-all">{result.agentId}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Transaction hash</span>
                  <a
                    href={result.explorerLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-[#eca8d6] hover:text-[#eca8d6]/80 flex items-center gap-1.5 transition-colors break-all"
                  >
                    {result.txHash} <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">Threshold sensitivity</span>
                  <span className="font-mono text-xs text-white/70">
                    ±{threshold}σ · {THRESHOLD_LABELS[threshold].label}
                  </span>
                </div>
              </div>
            </div>

            {/* Note */}
            <p className="font-mono text-xs text-white/30 leading-relaxed">
              The first 30 transactions will establish the behavioral baseline. After that, every payment attempt is gated against the committed baseline hash on Kite testnet.
            </p>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => router.push("/dashboard")}
                className="flex-1 border border-white/25 text-white font-mono font-bold text-sm py-3 hover:bg-white/5 transition-colors"
              >
                View dashboard
              </button>
              <button
                onClick={() => { setState("idle"); setResult(null); setName(""); setWallet(""); setOwner(""); }}
                className="flex-1 border border-white/10 text-white/40 font-mono text-sm py-3 hover:bg-white/5 hover:text-white/70 transition-colors"
              >
                Register another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-white/25 shrink-0">
        <h1 className="font-mono font-bold text-white text-lg">Register Agent</h1>
        <p className="font-mono text-white/40 text-xs mt-0.5">On-chain registration · Kite testnet</p>
      </div>

      <div className="flex-1 flex items-start justify-center p-8">
        <div className="w-full max-w-xl flex flex-col gap-8">

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">

            {/* Name */}
            <Field label="Agent name" hint="human-readable identifier">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="alice-expense-agent"
                className={inputCls}
                required
              />
            </Field>

            {/* Agent wallet */}
            <Field label="Agent wallet address" hint="address this agent pays from">
              <input
                type="text"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="0x..."
                className={inputCls}
                required
              />
            </Field>

            {/* Owner */}
            <Field label="Owner address" hint="your Privy AA wallet">
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="0x..."
                className={inputCls}
                required
              />
            </Field>

            {/* Spending limit */}
            <Field label="Spending limit per session key" hint="USDC">
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  value={spendingLimit}
                  onChange={(e) => setSpendingLimit(e.target.value)}
                  className={inputCls + " pr-16"}
                  required
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-white/30">
                  USDC
                </span>
              </div>
            </Field>

            {/* Threshold slider */}
            <Field label="Threshold sensitivity" hint={THRESHOLD_LABELS[threshold].desc}>
              <div className="flex flex-col gap-3">
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={1}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-[#eca8d6] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-white/30">
                  <span>Strict (±1σ)</span>
                  <span className="text-[#eca8d6] font-bold">{THRESHOLD_LABELS[threshold].label}</span>
                  <span>Lenient (±3σ)</span>
                </div>
              </div>
            </Field>

            {/* Error */}
            {state === "error" && (
              <div className="flex items-center gap-3 border border-red-500/30 bg-red-500/5 px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="font-mono text-xs text-red-400">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!valid || state === "submitting"}
              className="w-full border border-white/25 text-white font-mono font-bold text-sm py-4 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {state === "submitting" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Registering on-chain...
                </>
              ) : (
                "Register agent →"
              )}
            </button>
          </form>

          {/* Info box */}
          <div className="border border-white/10 bg-white/[0.02] p-5 flex flex-col gap-3">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">What happens on submit</span>
            {[
              "register() called on AgentRegistry.sol — agentId derived on-chain",
              "AgentRegistered event emitted and indexed by Goldsky",
              "Baseline record created in MongoDB",
              "First 30 transactions build behavioral baseline automatically",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="font-mono text-[10px] text-white/25 shrink-0 mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-mono text-xs text-white/50 leading-relaxed">{step}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
