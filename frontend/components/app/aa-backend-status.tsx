"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  fetchBackendHealth,
  getApiBase,
  KITE_AA_SDK_DOC_URL,
  type BackendHealth,
} from "@/lib/api";

const KITESCAN_ADDRESS = (addr: string) =>
  `https://testnet.kitescan.ai/address/${encodeURIComponent(addr)}`;

export function AaBackendStatus() {
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const h = await fetchBackendHealth();
        if (!cancelled) {
          setHealth(h);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
          setHealth(null);
        }
      }
    }
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (err) {
    return (
      <div className="mt-3 pt-3 border-t border-white/10">
        <p className="text-[10px] font-mono text-amber-500/90 leading-snug break-words">API: {err.slice(0, 120)}</p>
        <p className="text-[9px] font-mono text-white/25 mt-1">{getApiBase()}</p>
      </div>
    );
  }

  if (!health?.ok) return null;

  const aa = health.aaLogDecisionConfigured;
  const batch = health.aaSessionKeyRuleConfigured;
  const pred = health.predictedAaBackendAddress;

  return (
    <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-2">
      <span className="text-[9px] font-mono font-bold text-white/35 uppercase tracking-widest">Backend AA</span>
      <div className="text-[10px] font-mono text-white/50 leading-relaxed space-y-1">
        <p>
          <span className="text-white/35">SDK path</span>{" "}
          <span className={aa ? "text-green-400/90" : "text-white/30"}>{aa ? "on" : "off"}</span>
          {health.kiteAaNetwork ? <span className="text-white/25"> · {health.kiteAaNetwork}</span> : null}
        </p>
        <p>
          <span className="text-white/35">addSessionKeyRule + logDecision</span>{" "}
          <span className={batch ? "text-green-400/90" : "text-white/30"}>{batch ? "on" : "off"}</span>
        </p>
        {pred ? (
          <a
            href={KITESCAN_ADDRESS(pred)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-1 text-[#eca8d6]/90 hover:text-[#eca8d6] break-all"
            title={pred}
          >
            <span className="shrink-0 mt-0.5">
              <ExternalLink className="w-3 h-3" />
            </span>
            <span>Predicted AA (authorize on AttractorGuard)</span>
          </a>
        ) : (
          <p className="text-white/25">No predicted AA (set BACKEND_PRIVATE_KEY)</p>
        )}
      </div>
      <a
        href={KITE_AA_SDK_DOC_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] font-mono text-white/35 hover:text-white/55 flex items-center gap-1"
      >
        Kite AA SDK docs <ExternalLink className="w-3 h-3 shrink-0" />
      </a>
    </div>
  );
}
