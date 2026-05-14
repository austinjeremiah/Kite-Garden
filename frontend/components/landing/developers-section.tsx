"use client";

import { useState, useEffect, useRef } from "react";

const gateFeatures = [
  {
    title: "x402 payload validation",
    description: "EIP-712 signature recovery, validBefore check, from-address match — all before behavioral analysis runs.",
  },
  {
    title: "Two-mode analysis",
    description: "Automatic mode switch at 200 transactions. SampEn for early-stage, corr_dim with RANSAC for mature.",
  },
  {
    title: "On-chain audit log",
    description: "Every gate decision — issue, deny, freeze, re-authorize — is anchored to the agent's Kite Passport DID and indexed in real time.",
  },
  {
    title: "60-second session keys",
    description: "Refusing to renew equals a cryptographic freeze. No key, no payment. No override without human review.",
  },
];

const codeLines = [
  { text: "// Agent calls gate before every payment", color: "text-white/30" },
  { text: "POST /api/gate", color: "text-[#eca8d6]" },
  { text: "{", color: "text-white/60" },
  { text: '  agentId: "0x4a3b...f9c2",', color: "text-white/80" },
  { text: "  amount: 12.50,", color: "text-white/80" },
  { text: '  destination: "0xRecipient...",', color: "text-white/80" },
  { text: "  x402Payload: { ... }", color: "text-white/80" },
  { text: "}", color: "text-white/60" },
  { text: "", color: "" },
  { text: "// Response — STABLE path", color: "text-white/30" },
  { text: "{", color: "text-white/60" },
  { text: '  verdict: "ISSUED",', color: "text-green-400/80" },
  { text: '  sessionKey: "0xSK...",', color: "text-white/80" },
  { text: "  metric: 2.14,", color: "text-white/80" },
  { text: "  baseline: 2.09,", color: "text-white/80" },
  { text: "  threshold: 2.31", color: "text-white/80" },
  { text: "}", color: "text-white/60" },
  { text: "", color: "" },
  { text: "// Response — DIVERGED path", color: "text-white/30" },
  { text: "{", color: "text-white/60" },
  { text: '  verdict: "DENIED",', color: "text-red-400/80" },
  { text: "  sessionKey: null,", color: "text-white/80" },
  { text: "  metric: 4.87,", color: "text-red-400/60" },
  { text: '  explorerLink: "https://testnet.kitescan.ai/..."', color: "text-[#eca8d6]/60" },
  { text: "}", color: "text-white/60" },
];

export function DevelopersSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [visibleLines, setVisibleLines] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const interval = setInterval(() => {
      setVisibleLines((prev) => {
        if (prev >= codeLines.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 60);
    return () => clearInterval(interval);
  }, [isVisible]);

  return (
    <section id="api" ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className={`mb-16 transition-all duration-700 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}>
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Gate API
          </span>
          <h2 className="text-6xl md:text-7xl lg:text-[128px] font-display tracking-tight leading-[0.9]">
            One endpoint.
            <br />
            <span className="text-muted-foreground">Every payment.</span>
          </h2>
        </div>

        {/* Two column layout */}
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left — features */}
          <div className={`transition-all duration-700 delay-100 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}>
            <p className="text-xl text-muted-foreground mb-12 leading-relaxed">
              Every AI agent with payment authority calls <span className="font-mono text-foreground">POST /api/gate</span> before submitting any payment. The gate runs behavioral analysis and returns a verdict in under 500ms.
            </p>
            <div className="grid grid-cols-1 gap-6">
              {gateFeatures.map((feature, index) => (
                <div
                  key={feature.title}
                  className={`flex gap-4 transition-all duration-500 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  }`}
                  style={{ transitionDelay: `${index * 50 + 200}ms` }}
                >
                  <span className="font-mono text-xs text-muted-foreground mt-1 shrink-0">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-mono font-medium mb-1 text-sm">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — live code terminal */}
          <div className={`transition-all duration-700 delay-200 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}>
            <div className="border border-foreground/10 bg-black">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/10">
                <span className="w-3 h-3 rounded-full bg-red-500/60" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <span className="w-3 h-3 rounded-full bg-green-500/60" />
                <span className="ml-4 text-xs font-mono text-white/30">gate-request.json</span>
              </div>
              {/* Code */}
              <div className="p-6 font-mono text-sm overflow-auto max-h-[520px]">
                {codeLines.slice(0, visibleLines).map((line, i) => (
                  <div key={i} className={`leading-6 ${line.color}`}>
                    {line.text || "\u00A0"}
                  </div>
                ))}
                {/* Cursor */}
                {visibleLines < codeLines.length && (
                  <span className="inline-block w-2 h-4 bg-white/60 animate-pulse" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
