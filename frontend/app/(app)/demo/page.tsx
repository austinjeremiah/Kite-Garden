"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { postGate, KITE_AA_SDK_DOC_URL, type GateResponse } from "@/lib/api";

export default function DemoPage() {
  const [agentId, setAgentId] = useState("");
  const [amount, setAmount] = useState("1");
  const [destination, setDestination] = useState("0x0000000000000000000000000000000000000001");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<GateResponse | null>(null);

  async function onRunGate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    const n = Number(amount);
    if (!agentId.trim() || !Number.isFinite(n) || !destination.trim()) {
      setErr("agentId, amount, and destination are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await postGate({
        agentId: agentId.trim(),
        amount: n,
        destination: destination.trim(),
      });
      setResult(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen overflow-y-auto">
      <div className="px-8 py-5 border-b border-white/25 shrink-0 flex flex-col gap-2">
        <h1 className="font-mono font-bold text-white text-lg">Demo · Gate</h1>
        <p className="font-mono text-white/40 text-xs max-w-3xl leading-relaxed">
          Calls <span className="text-white/60">POST /api/gate</span>. With AA enabled on the backend, a successful{" "}
          <span className="text-white/60">ISSUED</span> response includes <span className="text-white/60">sessionKey</span>,{" "}
          <span className="text-white/60">explorerLink</span>, and optional <span className="text-white/60">gateDiagnostics</span> /{" "}
          <span className="text-white/60">logDecisionError</span>. See{" "}
          <a href={KITE_AA_SDK_DOC_URL} target="_blank" rel="noopener noreferrer" className="text-[#eca8d6] hover:underline inline-flex items-center gap-0.5">
            Kite AA SDK <ExternalLink className="w-3 h-3" />
          </a>
          .
        </p>
        <Link href="/dashboard" className="font-mono text-xs text-white/30 hover:text-white w-fit">
          ← Dashboard
        </Link>
      </div>

      <div className="px-8 py-8 max-w-3xl flex flex-col gap-6">
        <form onSubmit={onRunGate} className="border border-white/25 bg-black/40 backdrop-blur-sm p-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">agentId (bytes32 hex)</span>
            <input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="bg-black/60 border border-white/20 px-3 py-2 font-mono text-xs text-white outline-none focus:border-white/40"
              placeholder="0x…"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">amount (USDC number)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-black/60 border border-white/20 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/40"
              inputMode="decimal"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono font-bold text-white/40 uppercase tracking-widest">destination</span>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="bg-black/60 border border-white/20 px-3 py-2 font-mono text-xs text-white outline-none focus:border-white/40"
              placeholder="0x…"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="border border-[#eca8d6]/50 bg-[#eca8d6]/10 text-[#eca8d6] font-mono font-bold text-sm py-3 hover:bg-[#eca8d6]/20 disabled:opacity-40"
          >
            {busy ? "Running gate…" : "POST /api/gate"}
          </button>
        </form>

        {err && (
          <pre className="border border-red-500/40 bg-red-500/10 p-4 font-mono text-xs text-red-200 whitespace-pre-wrap break-words">
            {err}
          </pre>
        )}

        {result && (
          <div className="border border-white/20 bg-black/50 p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 font-mono text-sm">
              <span className="text-white/40">verdict</span>
              <span
                className={
                  result.verdict === "ISSUED"
                    ? "text-green-400 font-bold"
                    : result.verdict === "DENIED"
                      ? "text-red-400 font-bold"
                      : "text-amber-400 font-bold"
                }
              >
                {result.verdict}
              </span>
              {result.explorerLink && (
                <a
                  href={result.explorerLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#eca8d6] text-xs hover:underline inline-flex items-center gap-1"
                >
                  Explorer <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            {result.sessionKey && (
              <p className="font-mono text-xs text-white/70 break-all">
                <span className="text-white/40">sessionKey </span>
                {result.sessionKey}
              </p>
            )}
            {result.sessionKeyPrivateKey && (
              <p className="font-mono text-[10px] text-amber-400/90 break-all">
                <span className="text-white/40">sessionKeyPrivateKey (demo only) </span>
                {result.sessionKeyPrivateKey}
              </p>
            )}
            {result.logDecisionError && (
              <p className="font-mono text-[10px] text-red-400/90 whitespace-pre-wrap break-words">
                <span className="text-white/40">logDecisionError </span>
                {result.logDecisionError}
              </p>
            )}
            <pre className="font-mono text-[10px] text-white/60 overflow-x-auto border border-white/10 p-3 bg-black/40">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
