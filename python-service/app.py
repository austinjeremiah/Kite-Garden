"""
Kite Garden — behavioral metric microservice (nolds).
POST /analyze per Kitegarden.md Section 8.
"""

from __future__ import annotations

import logging
import os
import numpy as np

# ── Python 3.13 compatibility ─────────────────────────────────────────────────
# nolds 0.5.x uses pkg_resources (removed from Python 3.13 stdlib).
# Step 1: inject a stub so datasets.py can import without crashing.
# Step 2: load nolds.measures directly via importlib (skips nolds/__init__ which
#         eagerly calls load_brown72() at module level and crashes on np.load(empty)).
import sys, types as _types, io as _io, importlib, importlib.util as _iutil

if "pkg_resources" not in sys.modules:
    _pkg = _types.ModuleType("pkg_resources")
    _pkg.resource_string = lambda *a: b""
    _pkg.resource_listdir = lambda *a: []
    _pkg.resource_stream = lambda *a: _io.BytesIO(b"")
    sys.modules["pkg_resources"] = _pkg

# Load nolds.measures without triggering nolds/__init__ → nolds.datasets
def _load_nolds_measures():
    import importlib.util as _u
    import importlib.machinery as _m
    import pathlib, sysconfig

    # Find the nolds package directory
    nolds_init = None
    for p in sys.path:
        candidate = pathlib.Path(p) / "nolds" / "__init__.py"
        if candidate.exists():
            nolds_init = candidate
            break
    if nolds_init is None:
        raise ImportError("nolds package not found in sys.path")

    measures_path = nolds_init.parent / "measures.py"
    spec = _u.spec_from_file_location("nolds.measures", measures_path)
    mod = _u.module_from_spec(spec)
    sys.modules["nolds.measures"] = mod
    spec.loader.exec_module(mod)
    return mod

_measures = _load_nolds_measures()

import types as _t
nolds = _t.SimpleNamespace(sampen=_measures.sampen, corr_dim=_measures.corr_dim)

from flask import Flask, jsonify, request
from flask_cors import CORS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)


def _sampen(series: np.ndarray) -> float:
    std = float(np.std(series))
    if std < 1e-12:
        std = 1e-12

    # Robust ladder: nolds.sampen can return inf for tight tolerances on short/ordered series.
    for k in (0.2, 0.3, 0.4, 0.5, 0.8, 1.0):
        metric = float(nolds.sampen(series, emb_dim=2, tolerance=max(1e-12, k * std)))
        if np.isfinite(metric):
            return metric

    # Fallback: apply SampEn to first differences to avoid monotonic-sequence degeneracy.
    diffs = np.diff(series)
    if diffs.size >= 3:
        dstd = float(np.std(diffs))
        if dstd < 1e-12:
            dstd = 1e-12
        for k in (0.2, 0.3, 0.4, 0.5, 0.8, 1.0):
            metric = float(nolds.sampen(diffs, emb_dim=2, tolerance=max(1e-12, k * dstd)))
            if np.isfinite(metric):
                return metric

    # Last-resort finite value keeps the gate fail-open path from pinning baseline at zero forever.
    return 0.0


def _corr_dim(series: np.ndarray, emb_dim: int) -> float:
    """nolds 0.5.x corr_dim(data, emb_dim, ...) — no lag/delay in this API."""
    emb = max(2, int(emb_dim))
    try:
        return float(nolds.corr_dim(series, emb_dim=emb, fit="RANSAC"))
    except (TypeError, ValueError):
        try:
            return float(nolds.corr_dim(series, emb_dim=emb))
        except Exception:
            return float(nolds.corr_dim(series, emb))


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json(silent=True) or {}
    amounts = data.get("amounts") or []
    mode = data.get("mode") or "early"
    emb_dim = int(data.get("emb_dim") or 3)
    # lag accepted for API compat; nolds 0.5 corr_dim has no delay parameter
    _ = int(data.get("lag") or 1)

    if not isinstance(amounts, list) or len(amounts) == 0:
        return jsonify(
            {"metric": 0.0, "metric_type": "none", "data_points": 0, "status": "insufficient_data"}
        ), 200

    arr = np.asarray(amounts, dtype=np.float64)
    n = int(arr.size)

    raw_min = data.get("min_data_points")
    if raw_min is not None:
        min_points = max(1, int(raw_min))
    else:
        min_points = max(1, int(os.environ.get("GATE_MIN_INDEXED_PAYMENTS", "1")))
    if n < min_points:
        return jsonify(
            {"metric": 0.0, "metric_type": "none", "data_points": n, "status": "insufficient_data"}
        ), 200

    try:
        if mode == "mature" and n >= 200:
            metric = _corr_dim(arr, max(2, emb_dim))
            metric_type = "corr_dim"
        else:
            metric = _sampen(arr)
            metric_type = "sampen"
        if not np.isfinite(metric):
            return jsonify(
                {
                    "metric": 0.0,
                    "metric_type": metric_type,
                    "data_points": n,
                    "status": "compute_error",
                }
            ), 200
        return jsonify(
            {"metric": metric, "metric_type": metric_type, "data_points": n, "status": "ok"}
        ), 200
    except Exception as e:
        logger.exception("analyze failed: %s", e)
        return jsonify(
            {
                "metric": 0.0,
                "metric_type": "error",
                "data_points": n,
                "status": "compute_error",
                "error": str(e),
            }
        ), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(__import__("os").environ.get("PORT", "5050")))
