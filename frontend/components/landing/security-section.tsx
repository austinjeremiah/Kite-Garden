"use client";

import { useEffect, useState, useRef } from "react";

const analysisFeatures = [
  {
    title: "Delay embedding",
    description: "Transaction amounts form a scalar time series. Takens' theorem reconstructs the full attractor geometry in m-dimensional phase space using time delays.",
  },
  {
    title: "Correlation dimension D₂",
    description: "Grassberger-Procaccia algorithm computes the slope of log C(r) vs log r. Stable agents produce consistent D₂ ∈ [1.5, 3.5]. Compromised agents shift.",
  },
  {
    title: "Sample entropy (early-stage)",
    description: "For <200 transactions, SampEn measures payment rhythm irregularity. A sudden spike means the agent's behavior has become unexpectedly unpredictable.",
  },
  {
    title: "On-chain baseline hash",
    description: "The baseline parameters are hashed and committed on-chain, anchored to the agent's Kite Passport DID. Any quiet alteration produces a new transaction — visible, timestamped, permanent.",
  },
];

export function SecuritySection() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
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
      setActiveFeature((prev) => (prev + 1) % analysisFeatures.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="math" ref={sectionRef} className="relative py-32 lg:py-40 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-20">
          <span className={`inline-flex items-center gap-4 text-sm font-mono text-muted-foreground mb-8 transition-all duration-700 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}>
            <span className="w-12 h-px bg-foreground/20" />
            Math
          </span>

          <h2 className={`text-6xl md:text-7xl lg:text-[128px] font-display tracking-tight leading-[0.9] mb-12 transition-all duration-1000 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}>
            Phase space,
            <br />
            <span className="text-muted-foreground">not thresholds.</span>
          </h2>

          <div className={`transition-all duration-1000 delay-100 ${isVisible ? "opacity-100" : "opacity-0"}`}>
            <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl">
              Every agent's transaction history is a time series. KiteGarden maps it into phase space and measures the geometric complexity of its behavioral attractor. Shape shift = anomaly.
            </p>
          </div>
        </div>

        {/* Main content */}
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Large visual card — phase space visualization */}
          <div className={`lg:col-span-7 relative p-8 lg:p-12 border border-foreground/10 min-h-[400px] overflow-hidden transition-all duration-700 bg-foreground/[0.02] ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}>
            {/* Attractor visualization */}
            <AttractorCanvas active={activeFeature} />

            <div className="relative z-10">
              <span className="font-mono text-sm text-muted-foreground">Current mode</span>
              <div className="mt-8">
                <span className="text-4xl lg:text-5xl font-display font-mono">
                  {activeFeature < 2 ? "corr_dim" : activeFeature === 2 ? "sampen" : "baseline_hash"}
                </span>
                <span className="block text-muted-foreground font-mono text-sm mt-2">
                  {activeFeature < 2 ? "≥200 transactions — mature agent" : activeFeature === 2 ? "<200 transactions — early-stage agent" : "anchored to the agent's Passport DID"}
                </span>
              </div>
            </div>

            {/* Mode badges */}
            <div className="absolute bottom-8 left-8 right-8 flex flex-wrap gap-2">
              {["SampEn", "D₂", "RANSAC fit", "tamper-evident"].map((badge, index) => (
                <span
                  key={badge}
                  className={`px-3 py-1 border border-foreground/10 text-xs font-mono text-muted-foreground transition-all duration-500 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  }`}
                  style={{ transitionDelay: `${index * 100 + 300}ms` }}
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {/* Feature cards */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {analysisFeatures.map((feature, index) => (
              <div
                key={feature.title}
                className={`p-6 border transition-all duration-500 cursor-default ${
                  activeFeature === index
                    ? "border-foreground/30 bg-foreground/[0.04]"
                    : "border-foreground/10"
                } ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
                style={{ transitionDelay: `${index * 80}ms` }}
                onClick={() => setActiveFeature(index)}
                onMouseEnter={() => setActiveFeature(index)}
              >
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 w-10 h-10 flex items-center justify-center border font-mono text-xs transition-colors ${
                    activeFeature === index
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/20 text-muted-foreground"
                  }`}>
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <h3 className="font-mono font-medium mb-1">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AttractorCanvas({ active }: { active: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      ctx.clearRect(0, 0, W, H);

      const t = timeRef.current;
      const cx = W * 0.6;
      const cy = H * 0.45;
      const scale = Math.min(W, H) * 0.28;

      // Draw attractor — stable = smooth lorenz-like loop, diverged = jagged
      const points = 300;
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        // active === 3 (on-chain) makes it very tight/stable; active === 2 (sampen diverge) makes it noisy
        const noise = active === 3 ? 0.02 : active === 2 ? 0.25 : 0.08;
        const r = 1 + 0.4 * Math.sin(angle * 3 + t) + noise * Math.sin(angle * 17 + t * 2.3);
        const x = cx + scale * r * Math.cos(angle + t * 0.3);
        const y = cy + scale * r * 0.6 * Math.sin(angle + t * 0.3);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(236, 168, 214, 0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw a few orbit dots
      for (let d = 0; d < 6; d++) {
        const angle = (d / 6) * Math.PI * 2 + t * 0.5;
        const noise = active === 3 ? 0.02 : active === 2 ? 0.3 : 0.1;
        const r = 1 + 0.4 * Math.sin(angle * 3 + t) + noise * Math.sin(angle * 17 + t * 2.3);
        const x = cx + scale * r * Math.cos(angle + t * 0.3);
        const y = cy + scale * r * 0.6 * Math.sin(angle + t * 0.3);
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(236, 168, 214, 0.7)";
        ctx.fill();
      }

      timeRef.current += 0.012;
      frameRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameRef.current);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
