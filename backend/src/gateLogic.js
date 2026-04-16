import { ethers } from "ethers";

/**
 * Rolling baseline over prior gate metrics (last ≤50). With one sample, true σ is undefined;
 * use a small floor relative to |mean| so mean ± k·σ is a sensible first band (spec: threshold vs rolling stats).
 */
export function statsForBaseline(history) {
  if (!history.length) return { mean: 0, std: 0 };
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  if (history.length < 2) {
    const floor = Math.max(1e-6, Math.abs(mean) * 0.02);
    return { mean, std: floor };
  }
  const v =
    history.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / (history.length - 1);
  const std = Math.sqrt(Math.max(v, 0));
  return { mean, std: std < 1e-12 ? 1e-12 : std };
}

/**
 * Stable if metric within [mean - k*std, mean + k*std]
 */
export function isStable(metric, history, thresholdMultiplier) {
  const { mean, std } = statsForBaseline(history);
  const k = thresholdMultiplier;
  const low = mean - k * std;
  const high = mean + k * std;
  return { stable: metric >= low && metric <= high, mean, std, low, high };
}

export function hashBaselinePayload(payload) {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload)));
}
