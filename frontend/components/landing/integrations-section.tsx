"use client";

import { useEffect, useState, useRef } from "react";

const integrations = [
  {
    name: "Kite Agent Passport",
    category: "Identity · DID",
    description: "Official Kite DID system. Every agent gets a Passport (did:kite:user/agent/name-v1) — the cryptographic anchor of agent identity. Registration is automatic.",
  },
  {
    name: "Kite AI",
    category: "L1 Testnet",
    description: "Base chain. Agent registry, gate decisions, and freeze events all live here. Bundler RPC and gasless transactions for session keys.",
  },
  {
    name: "Session Keys",
    category: "Short-lived auth",
    description: "60-second keys issued on STABLE verdicts. Refusing to renew is a cryptographic freeze — no override possible without human review.",
  },
  {
    name: "Goldsky",
    category: "Indexing",
    description: "Real-time subgraph over Kite. Powers the payment history, gate decisions, and audit trail you see on every page.",
  },
  {
    name: "x402",
    category: "Payment Protocol",
    description: "Signed payment intents (EIP-3009). Agent signs, gate validates, then the payment is forwarded — never the other way around.",
  },
  {
    name: "Chaos-theory math",
    category: "Behavioral analysis",
    description: "Sample entropy for early-stage agents, correlation dimension for mature agents. Switches automatically once enough history exists.",
  },
  {
    name: "On-chain anchor",
    category: "Tamper-evident baseline",
    description: "Behavioral baseline is hashed and committed on-chain. Quietly raising the threshold is impossible without leaving a permanent record.",
  },
  {
    name: "Hardhat",
    category: "Contracts",
    description: "Solidity compilation and deployment to kite-ai-testnet. ABIs generated for backend and subgraph.",
  },
  {
    name: "Privy AA",
    category: "Wallet",
    description: "Smart contract account on Kite testnet. Funds live here. Session keys delegate spend authority.",
  },
  {
    name: "MongoDB",
    category: "Database",
    description: "Stores agent baseline history, rolling mean/stddev, mode (early/mature), and gate decision log.",
  },
  {
    name: "React Query",
    category: "Frontend",
    description: "Polls Goldsky every 5–10s. Powers dashboard feed, agent detail charts, live metric updates.",
  },
  {
    name: "Recharts",
    category: "Charts",
    description: "Behavioral metric chart and transaction amount chart on agent detail page. Threshold lines overlaid.",
  },
  {
    name: "Next.js",
    category: "Frontend",
    description: "App router. API routes proxy to backend — frontend never exposes backend URL to the browser.",
  },
];

export function IntegrationsSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
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

  return (
    <section id="stack-integrations" ref={sectionRef} className="relative overflow-hidden">
      {/* Header */}
      <div className="relative z-10 pt-32 lg:pt-40 text-center">
        <span className={`inline-flex items-center gap-4 text-sm font-mono text-muted-foreground mb-8 transition-all duration-700 justify-center ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
          <span className="w-12 h-px bg-foreground/20" />
          Full stack
          <span className="w-12 h-px bg-foreground/20" />
        </span>

        <h2 className={`text-6xl md:text-7xl lg:text-[128px] font-display tracking-tight leading-[0.9] transition-all duration-1000 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}>
          Built on
          <br />
          <span className="text-muted-foreground">real tools.</span>
        </h2>

        <p className={`mt-8 text-xl text-muted-foreground leading-relaxed max-w-lg mx-auto transition-all duration-1000 delay-100 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
          Every component is a real integration — no mock data, no simulated events. Gate decisions, freezes, and baseline commits all happen on Kite L1.
        </p>
      </div>

      {/* Integration grid */}
      <div className="relative z-10 mt-16 max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-16">
          {integrations.map((integration, index) => (
            <div
              key={integration.name}
              className={`group relative overflow-hidden p-6 lg:p-8 border transition-all duration-500 cursor-default ${
                hoveredIndex === index
                  ? "border-foreground bg-foreground/[0.04] scale-[1.02]"
                  : "border-foreground/10 hover:border-foreground/30"
              } ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${index * 30 + 300}ms` }}
              onMouseEnter={(e) => {
                setHoveredIndex(index);
                const rect = e.currentTarget.getBoundingClientRect();
                setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseLeave={() => {
                setHoveredIndex(null);
                setMousePos(null);
              }}
            >
              {/* Cursor-following halo */}
              {hoveredIndex === index && mousePos && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-0"
                  style={{
                    background: `radial-gradient(200px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255,255,255,0.1) 0%, transparent 70%)`,
                  }}
                />
              )}

              {/* Category tag */}
              <span className={`absolute top-3 right-3 text-[10px] font-mono px-2 py-0.5 transition-colors ${
                hoveredIndex === index
                  ? "bg-foreground text-background"
                  : "bg-foreground/10 text-muted-foreground"
              }`}>
                {integration.category}
              </span>

              {/* Name */}
              <span className="font-mono font-medium block mb-3 mt-4 relative z-10">{integration.name}</span>

              {/* Description — only visible on hover */}
              <p className={`text-xs text-muted-foreground leading-relaxed relative z-10 transition-all duration-300 ${
                hoveredIndex === index ? "opacity-100 max-h-24" : "opacity-0 max-h-0 overflow-hidden"
              }`}>
                {integration.description}
              </p>

              {/* Animated underline */}
              <div className="absolute bottom-0 left-0 right-0 h-px bg-foreground/20 overflow-hidden">
                <div className={`h-full bg-foreground transition-all duration-500 ${
                  hoveredIndex === index ? "w-full" : "w-0"
                }`} />
              </div>
            </div>
          ))}
        </div>

        {/* Bottom stats row */}
        <div className={`flex flex-wrap items-center justify-between gap-8 pt-12 border-t border-foreground/10 transition-all duration-1000 delay-500 pb-32 lg:pb-40 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
          <div className="flex flex-wrap gap-12">
            {[
              { value: "3", label: "Smart contracts" },
              { value: "1", label: "Subgraph" },
              { value: "100%", label: "On-chain audit trail" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-baseline gap-3">
                <span className="text-3xl font-display">{stat.value}</span>
                <span className="text-sm text-muted-foreground font-mono">{stat.label}</span>
              </div>
            ))}
          </div>

          <a href="/how-it-works" className="group inline-flex items-center gap-2 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors">
            View full architecture
            <span className="group-hover:translate-x-1 transition-transform">&rarr;</span>
          </a>
        </div>
      </div>
    </section>
  );
}
