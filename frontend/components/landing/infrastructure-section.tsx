"use client";

import { useEffect, useState, useRef } from "react";

const components = [
  {
    name: "AgentRegistry.sol",
    tag: "Kite L1 Testnet",
    description: "On-chain identity and state layer. Stores agentId, baseline hash, and status. Emits AgentRegistered, BaselineCommitted, AgentFrozen events.",
    status: "deployed",
  },
  {
    name: "Goldsky Subgraph",
    tag: "GraphQL · public",
    description: "Indexes all events from all three contracts in real time. Provides agent history, gate decisions, and baseline commits via GraphQL.",
    status: "live",
  },
  {
    name: "Python Microservice",
    tag: "nolds · Flask",
    description: "Stateless math service. Runs nolds.sampen() for early-stage agents (<200 tx) and nolds.corr_dim() for mature agents (≥200 tx).",
    status: "operational",
  },
  {
    name: "Session Key Gate",
    tag: "gokite-aa-sdk",
    description: "After STABLE verdict: addSessionKeyRule() issues a 60s session key. After DIVERGED: freezeAgent() fires on-chain. No key issued.",
    status: "operational",
  },
];

export function InfrastructureSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeComponent, setActiveComponent] = useState(0);
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
    const interval = setInterval(() => {
      setActiveComponent((prev) => (prev + 1) % components.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="stack" ref={sectionRef} className="relative py-32 lg:py-40 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-20">
          <span className={`inline-flex items-center gap-4 text-sm font-mono text-muted-foreground mb-8 transition-all duration-700 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}>
            <span className="w-12 h-px bg-foreground/20" />
            Stack
          </span>

          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-end">
            <h2 className={`text-6xl md:text-7xl lg:text-[96px] font-display tracking-tight leading-[0.9] transition-all duration-1000 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}>
              Every layer
              <br />
              <span className="text-muted-foreground">on-chain.</span>
            </h2>

            <p className={`text-xl text-muted-foreground leading-relaxed transition-all duration-1000 delay-100 ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}>
              Four components. Each with a single job. The entire lifecycle of an agent — registration, baseline commitment, gate decisions, freezes — is visible on the Kite block explorer with no external dependencies.
            </p>
          </div>
        </div>

        {/* Main content grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Large stat card */}
          <div className={`lg:col-span-2 relative p-8 lg:p-12 border border-foreground/10 bg-foreground/[0.02] overflow-hidden transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}>
            {/* Animated connecting lines */}
            <div className="absolute inset-0 opacity-70">
              <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
                <defs>
                  <style>{`
                    @keyframes drawLine {
                      0%   { stroke-dashoffset: 1000; opacity: 0; }
                      15%  { opacity: 1; }
                      70%  { opacity: 0.7; }
                      100% { stroke-dashoffset: 0; opacity: 0; }
                    }
                    .connecting-line {
                      stroke: #eca8d6;
                      stroke-width: 1.2;
                      fill: none;
                      stroke-dasharray: 1000;
                      animation: drawLine 3s ease-in-out infinite;
                    }
                  `}</style>
                </defs>
                {[...Array(19)].map((_, i) => {
                  const x1 = 10 + (i % 5) * 20;
                  const y1 = 10 + Math.floor(i / 5) * 25;
                  const x2 = 10 + ((i + 1) % 5) * 20;
                  const y2 = 10 + Math.floor((i + 1) / 5) * 25;
                  return (
                    <line
                      key={`line-${i}`}
                      x1={`${x1}%`} y1={`${y1}%`}
                      x2={`${x2}%`} y2={`${y2}%`}
                      className="connecting-line"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  );
                })}
              </svg>
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full bg-[#eca8d6]"
                  style={{
                    left: `${10 + (i % 5) * 20}%`,
                    top: `${10 + Math.floor(i / 5) * 25}%`,
                    animation: `pulse 2s ease-in-out ${i * 0.1}s infinite`,
                  }}
                />
              ))}
            </div>

            <div className="relative z-10">
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-8xl lg:text-[10rem] font-display leading-none">3</span>
                <span className="text-2xl text-muted-foreground">contracts</span>
              </div>
              <p className="text-muted-foreground max-w-md font-mono text-sm">
                All deployed on Kite AI testnet. All indexed by Goldsky.
              </p>
            </div>
          </div>

          {/* Stacked stat cards */}
          <div className="flex flex-col gap-6">
            <div className={`p-8 border border-foreground/10 bg-foreground/[0.02] transition-all duration-700 delay-100 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}>
              <span className="text-5xl lg:text-6xl font-display">200</span>
              <span className="block text-sm text-muted-foreground font-mono mt-2">tx → corr_dim mode</span>
            </div>
            <div className={`p-8 border border-foreground/10 bg-foreground/[0.02] transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}>
              <span className="text-5xl lg:text-6xl font-display">5s</span>
              <span className="block text-sm text-muted-foreground font-mono mt-2">Goldsky poll interval</span>
            </div>
          </div>
        </div>

        {/* Component list */}
        <div className={`mt-12 grid grid-cols-1 lg:grid-cols-4 gap-4 transition-all duration-1000 delay-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
          {components.map((component, index) => (
            <div
              key={component.name}
              className={`p-6 border transition-all duration-300 cursor-default ${
                activeComponent === index
                  ? "border-foreground/30 bg-foreground/[0.04]"
                  : "border-foreground/10"
              }`}
              onMouseEnter={() => setActiveComponent(index)}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full transition-colors ${
                  activeComponent === index ? "bg-[#eca8d6]" : "bg-foreground/20"
                }`} />
                <span className="text-xs font-mono text-muted-foreground">
                  {component.tag}
                </span>
              </div>
              <span className="font-mono font-medium block mb-2 text-sm">{component.name}</span>
              <span className="text-xs text-muted-foreground leading-relaxed">{component.description}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
