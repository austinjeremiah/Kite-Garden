import { config } from "./config.js";

/** Longer timeout: nolds on ~300 points can exceed a few seconds on cold start. */
const ANALYZE_TIMEOUT_MS = 120_000;

/**
 * @param {{ amounts: number[], timestamps: number[], mode: 'early'|'mature', emb_dim?: number, lag?: number, min_data_points?: number }} payload
 * @returns {Promise<{ status: string; metric?: number; metric_type?: string; data_points?: number; error?: string }>}
 */
export async function analyzeSeries(payload) {
  const url = `${config.pythonServiceUrl.replace(/\/$/, "")}/analyze`;
  const timeout =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(ANALYZE_TIMEOUT_MS)
      : undefined;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: timeout,
    });
    if (!res.ok) {
      const t = await res.text();
      const msg = `Python service ${res.status}: ${t.slice(0, 500)}`;
      console.error("[python] analyze failed:", msg);
      return { status: "error", metric: 0, metric_type: "none", error: msg };
    }
    const json = await res.json();
    if (!json || typeof json.status !== "string") {
      console.error("[python] analyze invalid JSON:", json);
      return { status: "error", metric: 0, metric_type: "none", error: "invalid JSON from /analyze" };
    }
    return json;
  } catch (e) {
    const msg = e?.cause?.message || e?.message || String(e);
    console.error("[python] analyze failed:", msg, "| URL:", url);
    return {
      status: "error",
      metric: 0,
      metric_type: "none",
      error: msg.includes("fetch failed") || msg.includes("ECONNREFUSED")
        ? `Cannot reach Python at ${url} — start python-service (PORT 5050) and check PYTHON_SERVICE_URL in backend/.env`
        : msg,
    };
  }
}
