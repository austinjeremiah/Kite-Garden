"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────────

const FLOW_STEPS = [
  {
    number: "01",
    title: "Agent registers on-chain",
    detail: "Owner calls register() on AttractorGuard.sol. A unique agentId is derived on-chain. AgentRegistered event emitted and indexed by Goldsky within one block.",
    code: 'register("alice-expense-agent", wallet)\n→ agentId: 0x4a3b...f9c2\n→ AgentRegistered event',
    color: "border-white/25 text-white",
  },
  {
    number: "02",
    title: "Agent assembles payment intent",
    detail: "The autonomous agent builds an x402-format payment intent — amount, destination, agentId, and a signed EIP-712 authorization from its current session key.",
    code: "x402Payload = {\n  amount: 12.50,\n  destination: 0xRecip...,\n  agentId, sessionKeySig\n}",
    color: "border-white/25 text-white",
  },
  {
    number: "03",
    title: "POST /api/gate — nothing goes on-chain yet",
    detail: "Before any payment, the agent calls the KiteGarden gate API. This is the chokepoint. No session key is issued, no payment submitted, until this step passes.",
    code: "POST /api/gate\n{ agentId, amount,\n  destination, x402Payload }",
    color: "border-[#eca8d6]/30 text-[#eca8d6]",
  },
  {
    number: "04",
    title: "Backend queries Goldsky for history",
    detail: "Gate fetches the agent's full on-chain transaction history from the Goldsky GraphQL API — amounts, timestamps, counterparties for the last 500 transactions.",
    code: "agentPayments(\n  where: { agent: agentId }\n  first: 500\n) { amount, timestamp }",
    color: "border-white/25 text-white",
  },
  {
    number: "05",
    title: "Python microservice runs nolds analysis",
    detail: "Amounts array posted to Flask /analyze. If <200 tx: nolds.sampen() measures payment rhythm irregularity. If ≥200 tx: nolds.corr_dim() computes the correlation dimension D₂ via RANSAC.",
    code: "# <200 tx\nnolds.sampen(amounts)\n# ≥200 tx\nnolds.corr_dim(amounts,\n  emb_dim=3, fit='RANSAC')",
    color: "border-white/25 text-white",
  },
  {
    number: "06",
    title: "Compare against stored baseline",
    detail: "Current metric vs rolling mean ± 2σ from the last 50 computed values. Two outcomes: STABLE (within bounds) or DIVERGED (outside bounds).",
    code: "STABLE   if metric ∈ [μ-2σ, μ+2σ]\nDIVERGED if metric ∉ [μ-2σ, μ+2σ]",
    color: "border-white/25 text-white",
  },
  {
    number: "07",
    title: "STABLE → session key issued",
    detail: "gokite-aa-sdk calls addSessionKeyRule() on the agent's AA wallet. A 60-second session key is issued with the exact parameters of the requested transaction.",
    code: "addSessionKeyRule(\n  sessionKey, agentId,\n  selector, valueLimit\n)\n→ verdict: ISSUED",
    color: "border-green-500/40 text-green-400",
  },
  {
    number: "08",
    title: "DIVERGED → agent frozen on-chain",
    detail: "Backend calls logDecision() on AttractorGuard.sol, emitting AgentFrozen. No session key issued. The 60s window expires naturally. Agent cannot pay until a human re-authorizes.",
    code: "logDecision(agentId,\n  issued=false, metricValue,\n  baselineValue, amount)\n→ verdict: DENIED",
    color: "border-red-500/40 text-red-400",
  },
  {
    number: "09",
    title: "Human reviews dashboard",
    detail: "User sees the freeze event on the KiteGarden dashboard. Sees divergence metric, recent tx history, chart showing anomaly. Can reset baseline + re-authorize or permanently revoke.",
    code: "POST /api/agents/:id/reauthorize\n→ new baseline hash\n→ session key resumed\n\nPOST /api/agents/:id/revoke",
    color: "border-white/25 text-white",
  },
];

const MATH_CARDS = [
  {
    title: "Takens' Embedding Theorem (1981)",
    body: "A scalar time series — transaction amounts — can reconstruct the full attractor geometry of the underlying system via delay embedding. v(t) = [x(t), x(t+τ), ..., x(t+(m-1)τ)]",
  },
  {
    title: "Grassberger-Procaccia Correlation Dimension (1983)",
    body: "D₂ is the slope of log C(r) vs log r, where C(r) is the correlation integral. Stable agents: consistent D₂ ∈ [1.5, 3.5]. Compromised agents: D₂ shifts outside this range.",
  },
  {
    title: "Sample Entropy (early-stage)",
    body: "For <200 transactions, SampEn measures payment rhythm irregularity. Low SampEn = predictable. High SampEn = irregular. A sudden spike signals unexpected behavior change.",
  },
  {
    title: "On-chain baseline hash",
    body: "Baseline parameters (mean, stdDev, threshold) are hashed and committed to AttractorGuard.sol via logDecision(). Any quiet alteration produces a new on-chain transaction — auditable forever.",
  },
];

const CONTRACTS = [
  {
    name: "AttractorGuard.sol",
    address: "0x1F958d24298e04e8516EA972eFc2A3Bd50B4BF4F",
    desc: "Agent registration, gate decision logging, freeze/revoke lifecycle",
  },
  {
    name: "AgentPaymentSimulator.sol",
    address: "0x1634edA803e70dF6a674B2E67B6D0B11C0b4B9aC",
    desc: "Demo payment simulation, normal pattern seeding, attack injection",
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <span className="w-8 h-px bg-white/25" />
      <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">{children}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HowItWorksPage() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-white/25 shrink-0">
        <h1 className="font-mono font-bold text-white text-lg">How It Works</h1>
        <p className="font-mono text-white/40 text-xs mt-0.5">Full technical flow · 9 steps</p>
      </div>

      <div className="flex-1 p-8 flex flex-col gap-16">

        {/* ── Section 1: Problem ─────────────────────────────────────────── */}
        <section>
          <SectionLabel>The problem with static limits</SectionLabel>
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                n: "01", title: "Limit-aware draining",
                body: "9 transactions just under the cap, different recipients, rapid succession. Every one passes. Static limits never notice.",
                stat: "9×", statLabel: "transactions, all approved",
              },
              {
                n: "02", title: "Gradual behavioral drift",
                body: "Agent slowly manipulated via prompt injection over days. Each action is small. The cumulative shift is massive. No alert fires.",
                stat: "∞", statLabel: "days undetected",
              },
              {
                n: "03", title: "Hallucination burst",
                body: "Model fires payments to nonsensical targets at irregular intervals. Nothing exceeds the daily cap. Wallet drains slowly.",
                stat: "0", statLabel: "alerts triggered",
              },
            ].map((card) => (
              <div key={card.n} className="border border-white/25 bg-black/40 backdrop-blur-sm p-6 flex flex-col gap-4">
                <span className="font-mono text-[10px] text-white/25">{card.n}</span>
                <h3 className="font-mono font-bold text-white text-sm">{card.title}</h3>
                <p className="font-mono text-xs text-white/50 leading-relaxed flex-1">{card.body}</p>
                <div className="border-t border-white/10 pt-4">
                  <span className="font-mono font-bold text-red-400 text-2xl">{card.stat}</span>
                  <span className="font-mono text-xs text-white/30 block mt-0.5">{card.statLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 2: Flow ────────────────────────────────────────────── */}
        <section>
          <SectionLabel>Full gate flow — 9 steps</SectionLabel>
          <div className="grid grid-cols-[280px_1fr] gap-6">
            {/* Step list */}
            <div className="flex flex-col gap-1">
              {FLOW_STEPS.map((step, i) => (
                <button
                  key={step.number}
                  onClick={() => setActiveStep(i)}
                  className={`flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-2 ${
                    activeStep === i
                      ? "border-[#eca8d6] bg-white/[0.04]"
                      : "border-transparent hover:bg-white/[0.02]"
                  }`}
                >
                  <span className={`font-mono text-[10px] shrink-0 tabular-nums ${
                    activeStep === i ? "text-[#eca8d6]" : "text-white/25"
                  }`}>{step.number}</span>
                  <span className={`font-mono text-xs leading-tight ${
                    activeStep === i ? "text-white font-bold" : "text-white/40"
                  }`}>{step.title}</span>
                </button>
              ))}
            </div>

            {/* Step detail */}
            <div className="border border-white/25 bg-black/40 backdrop-blur-sm p-8 flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <span className={`font-mono font-bold text-3xl ${FLOW_STEPS[activeStep].color.includes("green") ? "text-green-400" : FLOW_STEPS[activeStep].color.includes("red") ? "text-red-400" : FLOW_STEPS[activeStep].color.includes("eca8d6") ? "text-[#eca8d6]" : "text-white"}`}>
                  {FLOW_STEPS[activeStep].number}
                </span>
                <h2 className="font-mono font-bold text-white text-base">
                  {FLOW_STEPS[activeStep].title}
                </h2>
              </div>
              <p className="font-mono text-sm text-white/60 leading-relaxed">
                {FLOW_STEPS[activeStep].detail}
              </p>
              <div className="border border-white/10 bg-black/60 p-5">
                <pre className="font-mono text-xs text-[#eca8d6]/80 leading-relaxed whitespace-pre-wrap">
                  {FLOW_STEPS[activeStep].code}
                </pre>
              </div>
              {/* Step nav */}
              <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/10">
                <button
                  onClick={() => setActiveStep((p) => Math.max(0, p - 1))}
                  disabled={activeStep === 0}
                  className="font-mono text-xs text-white/30 hover:text-white transition-colors disabled:opacity-20"
                >
                  ← prev
                </button>
                <span className="font-mono text-[10px] text-white/20">
                  {activeStep + 1} / {FLOW_STEPS.length}
                </span>
                <button
                  onClick={() => setActiveStep((p) => Math.min(FLOW_STEPS.length - 1, p + 1))}
                  disabled={activeStep === FLOW_STEPS.length - 1}
                  className="font-mono text-xs text-white/30 hover:text-white transition-colors disabled:opacity-20"
                >
                  next →
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 3: Math ────────────────────────────────────────────── */}
        <section>
          <SectionLabel>Math foundation</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            {MATH_CARDS.map((card) => (
              <div key={card.title} className="border border-white/25 bg-black/40 backdrop-blur-sm p-6 flex flex-col gap-3">
                <h3 className="font-mono font-bold text-white text-sm">{card.title}</h3>
                <p className="font-mono text-xs text-white/50 leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 4: Contracts ───────────────────────────────────────── */}
        <section>
          <SectionLabel>Live contracts · Kite testnet</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            {CONTRACTS.map((c) => (
              <div key={c.name} className="border border-white/25 bg-black/40 backdrop-blur-sm p-6 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-mono font-bold text-white text-sm">{c.name}</h3>
                  <a
                    href={`https://testnet.kitescan.ai/address/${c.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] font-mono text-[#eca8d6]/70 hover:text-[#eca8d6] transition-colors shrink-0"
                  >
                    Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <span className="font-mono text-[10px] text-white/30 break-all">{c.address}</span>
                <p className="font-mono text-xs text-white/50">{c.desc}</p>
              </div>
            ))}
          </div>
          {/* Goldsky */}
          <div className="mt-4 border border-white/25 bg-black/40 backdrop-blur-sm p-6 flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-mono font-bold text-white text-sm">Goldsky Subgraph</span>
              <span className="font-mono text-[10px] text-white/30 break-all">
                https://api.goldsky.com/api/public/project_cmnxhd74o47i501vvc35oe0mc/subgraphs/attractorguard-kite-ai-testnet/5.0.2/gn
              </span>
            </div>
            <a
              href="https://app.goldsky.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-mono text-[#eca8d6]/70 hover:text-[#eca8d6] transition-colors shrink-0"
            >
              Goldsky <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </section>

      </div>
    </div>
  );
}
