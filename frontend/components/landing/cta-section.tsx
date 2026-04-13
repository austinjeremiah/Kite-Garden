"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CtaSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <section ref={sectionRef} className="relative py-24 lg:py-32 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div
          className={`relative border border-foreground transition-all duration-1000 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
          onMouseMove={handleMouseMove}
        >
          {/* Spotlight effect */}
          <div 
            className="absolute inset-0 opacity-10 pointer-events-none transition-opacity duration-300"
            style={{
              background: `radial-gradient(600px circle at ${mousePosition.x}% ${mousePosition.y}%, rgba(0,0,0,0.15), transparent 40%)`
            }}
          />
          
          <div className="relative z-10 px-8 lg:px-16 py-16 lg:py-24">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
              {/* Left content */}
              <div className="flex-1">
                <h2 className="text-6xl md:text-7xl lg:text-[72px] font-display tracking-tight mb-8 leading-[0.95]">
                  Ready to protect
                  <br />
                  your AI agents?
                </h2>

                <p className="text-xl text-muted-foreground mb-12 leading-relaxed max-w-xl">
                  Register an agent on Kite testnet. Its behavioral baseline is committed on-chain. The gate runs on every payment. Any shape shift triggers a cryptographic freeze.
                </p>

                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <Button
                    size="lg"
                    className="bg-foreground hover:bg-foreground/90 text-background px-8 h-14 text-base rounded-full group font-mono"
                    asChild
                  >
                    <a href="/register">
                      Register an agent
                      <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                    </a>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 px-8 text-base rounded-full border-foreground/20 hover:bg-foreground/5 font-mono"
                    asChild
                  >
                    <a href="/demo">Watch the demo</a>
                  </Button>
                </div>

                <p className="text-sm text-muted-foreground mt-8 font-mono">
                  Built on Kite L1 testnet · Goldsky · x402 · nolds
                </p>
              </div>

              {/* Right — terminal block */}
              <div className="hidden lg:flex items-center justify-center w-[480px]">
                <div className="border border-foreground/20 bg-black/60 w-full p-6 font-mono text-sm">
                  <div className="text-white/30 mb-4 text-xs">// AgentFrozen event · Kite testnet</div>
                  <div className="space-y-1">
                    <div><span className="text-white/40">event  </span><span className="text-[#eca8d6]">AgentFrozen</span></div>
                    <div><span className="text-white/40">agentId  </span><span className="text-white/80">0x4a3b...f9c2</span></div>
                    <div><span className="text-white/40">metric   </span><span className="text-red-400">4.87</span></div>
                    <div><span className="text-white/40">baseline </span><span className="text-white/80">2.09 ± 0.22</span></div>
                    <div><span className="text-white/40">block    </span><span className="text-white/80">1,847,293</span></div>
                    <div><span className="text-white/40">status   </span><span className="text-red-400">FROZEN</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Decorative corner */}
          <div className="absolute top-0 right-0 w-32 h-32 border-b border-l border-foreground/10" />
          <div className="absolute bottom-0 left-0 w-32 h-32 border-t border-r border-foreground/10" />
        </div>
      </div>
    </section>
  );
}
