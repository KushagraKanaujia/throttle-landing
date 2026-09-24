#!/usr/bin/env python3
"""Build assets/js/demo-data.js for /demo from recorded Throttle JSON reports.

Standard library only. The investor demo page (demo.html) is a *replay* of
recorded measurements: every total, rate and cost it shows comes from the file
this script writes, and that file is computed only from Throttle's own run
reports.

Default input: the 2026-08-17 golden live run (one A100 80GB PCIe, vLLM
0.16.0, Qwen2.5-0.5B-Instruct), six positions B1 C1 B2 C2 B3 C3 plus
golden.json.

Pointing it at other reports
----------------------------
Any two groups of Throttle `throttle_run` JSON reports can be replayed, for
example a future A100-vs-H100 run or config A vs config B:

    python3 scripts/build_demo_data.py \
        --before path/to/A1.json path/to/A2.json path/to/A3.json \
        --after  path/to/H1.json path/to/H2.json path/to/H3.json \
        --golden path/to/golden.json \
        --before-label "A100 80GB PCIe" --after-label "H100 80GB SXM" \
        --source-url https://github.com/.../validation/<run-dir>

--golden is optional; without it the page shows no confidence interval or
decision_eligible line. Each side may have a different hourly rate (each
report's manifest.cost.total_hourly_rate is used for its own side), which is
what a GPU-vs-GPU comparison needs. The page labels its panes from
--before-label / --after-label, so update those (and the hero copy in
demo.html) when the comparison is not a max_num_seqs change.

What is computed here (all shown on the page):
  * per position: measured wall seconds, completion tokens, requests,
    requests/s, output tok/s, block-mean output tok/s, $/M output tokens
    (Throttle's own conditions[0].metrics.cost_per_million_output_tokens),
    e2e and TTFT mean/p50/p90/p95/p99, and each block's wall seconds
  * per side: arithmetic mean over positions of the above
  * cost change = after $/M / before $/M - 1
  * $/M change range implied by the golden throughput CI: 1/(1+x) - 1
  * per-request latency sampling anchors for the illustrative request lines:
    the recorded p50/p90/p95/p99 plus a lower anchor at quantile 0 chosen
    so that the piecewise-linear distribution's mean equals the recorded
    mean (clamped to [0, p50]). No latency value on the page is otherwise
    invented.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
DEFAULT_DIR = "/Users/kush/throttle-main-wt/validation/golden-live-20260817"
DEFAULT_URL = "https://github.com/KushagraKanaujia/throttle/tree/main/validation/golden-live-20260817"
PCTS = ("mean", "p50", "p90", "p95", "p99")


def load(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def pct_block(m: dict) -> dict:
    return {k: m[k] for k in PCTS}


def lower_anchor(p: dict) -> float:
    """Quantile-0 anchor so a piecewise-linear inverse CDF through
    (0,L) (.5,p50) (.9,p90) (.95,p95) (.99,p99) (1,p99) has the recorded mean."""
    rest = (0.4 * (p["p50"] + p["p90"]) / 2 + 0.05 * (p["p90"] + p["p95"]) / 2
            + 0.04 * (p["p95"] + p["p99"]) / 2 + 0.01 * p["p99"])
    low = 4 * (p["mean"] - rest) - p["p50"]
    return max(0.0, min(low, p["p50"]))


def run_summary(path: str) -> dict:
    d = load(path)
    if d.get("artifact_type") != "throttle_run":
        sys.exit(f"{path}: not a throttle_run report")
    c = d["conditions"][0]
    m = c["metrics"]
    man = d["manifest"]
    e2e, ttft = pct_block(m["e2e_latency_ms"]), pct_block(m["ttft_ms"])
    return {
        "file": os.path.basename(path),
        "position": man.get("provenance", {}).get("sequence_position"),
        "variant": man.get("provenance", {}).get("variant"),
        "max_num_seqs": man["engine"]["effective_flags"].get("max_num_seqs"),
        "hourly_rate": man["cost"]["total_hourly_rate"],
        "gpu": man["runtime"]["gpu"],
        "model": man["model"]["id"],
        "engine_version": man["engine"]["server_version"],
        "concurrency": c["condition"]["max_in_flight"],
        "max_tokens": man["request"]["max_tokens"],
        "wall_s": c["measured_wall_seconds"],
        "completion_tokens": m["completion_tokens"],
        "requests": m["valid_response_count"],
        "errors": d["run_totals"]["errors"],
        "req_per_s": m["requests_per_second"],
        "tok_per_s": m["output_tokens_per_second"],
        "block_mean_tok_per_s": m["block_mean_output_tokens_per_second"],
        "cost_per_m": m["cost_per_million_output_tokens"],
        "e2e_ms": e2e,
        "ttft_ms": ttft,
        "e2e_q0_ms": lower_anchor(e2e),
        "ttft_q0_ms": lower_anchor(ttft),
        "blocks": [
            {
                "wall_s": b["wall_duration_seconds"],
                "requests": b["metrics"]["valid_response_count"],
                "completion_tokens": b["metrics"]["completion_tokens"],
                "tok_per_s": b["metrics"]["output_tokens_per_second"],
                "req_per_s": b["metrics"]["requests_per_second"],
                "e2e_ms": pct_block(b["metrics"]["e2e_latency_ms"]),
                "ttft_ms": pct_block(b["metrics"]["ttft_ms"]),
                "e2e_q0_ms": lower_anchor(pct_block(b["metrics"]["e2e_latency_ms"])),
                "ttft_q0_ms": lower_anchor(pct_block(b["metrics"]["ttft_ms"])),
            }
            for b in c["blocks"]
        ],
    }


def mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs)


def side(paths: list[str], label: str) -> dict:
    runs = [run_summary(p) for p in paths]
    nblocks = len(runs[0]["blocks"])
    res = {
        "label": label,
        "runs": runs,
        "mean": {
            "wall_s": mean(r["wall_s"] for r in runs),
            "completion_tokens": mean(r["completion_tokens"] for r in runs),
            "requests": mean(r["requests"] for r in runs),
            "req_per_s": mean(r["req_per_s"] for r in runs),
            "tok_per_s": mean(r["tok_per_s"] for r in runs),
            "block_mean_tok_per_s": mean(r["block_mean_tok_per_s"] for r in runs),
            "cost_per_m": mean(r["cost_per_m"] for r in runs),
            "hourly_rate": mean(r["hourly_rate"] for r in runs),
            "e2e_ms": {k: mean(r["e2e_ms"][k] for r in runs) for k in PCTS},
            "ttft_ms": {k: mean(r["ttft_ms"][k] for r in runs) for k in PCTS},
            "block_wall_s": [mean(r["blocks"][i]["wall_s"] for r in runs) for i in range(nblocks)],
        },
    }
    res["mean"]["e2e_q0_ms"] = lower_anchor(res["mean"]["e2e_ms"])
    res["mean"]["ttft_q0_ms"] = lower_anchor(res["mean"]["ttft_ms"])
    return res


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--before", nargs="+", default=[os.path.join(DEFAULT_DIR, f"B{i}.json") for i in (1, 2, 3)])
    ap.add_argument("--after", nargs="+", default=[os.path.join(DEFAULT_DIR, f"C{i}.json") for i in (1, 2, 3)])
    ap.add_argument("--golden", default=os.path.join(DEFAULT_DIR, "golden.json"))
    ap.add_argument("--before-label", default="max_num_seqs=1")
    ap.add_argument("--after-label", default="max_num_seqs=8")
    ap.add_argument("--source-url", default=DEFAULT_URL)
    ap.add_argument("--out", default=os.path.join(SITE, "assets", "js", "demo-data.js"))
    a = ap.parse_args()

    before, after = side(a.before, a.before_label), side(a.after, a.after_label)
    for s in (before, after):
        s["mean"]["block_wall_s"] = [round(x, 6) for x in s["mean"]["block_wall_s"]]
    b, c = before["mean"], after["mean"]
    out = {
        "source_url": a.source_url,
        "built_from": [os.path.basename(p) for p in a.before + a.after] + ([os.path.basename(a.golden)] if a.golden else []),
        "context": {
            "gpu": before["runs"][0]["gpu"],
            "gpu_after": after["runs"][0]["gpu"],
            "model": before["runs"][0]["model"],
            "engine": "vLLM " + before["runs"][0]["engine_version"],
            "concurrency": before["runs"][0]["concurrency"],
            "max_tokens": before["runs"][0]["max_tokens"],
        },
        "before": before,
        "after": after,
        "derived": {
            "cost_change": c["cost_per_m"] / b["cost_per_m"] - 1,
            "cost_ratio_before_over_after": b["cost_per_m"] / c["cost_per_m"],
            "gpu_hours_ratio": b["wall_s"] / c["wall_s"],
            "pooled_tok_per_s_change": c["tok_per_s"] / b["tok_per_s"] - 1,
        },
        "golden": None,
    }
    if a.golden and os.path.exists(a.golden):
        g = load(a.golden)
        cond = g["conditions"][0]
        ci = cond["throughput_delta_percent_ci"]
        out["golden"] = {
            "decision_eligible": g["decision_eligible"],
            "golden_protocol_eligible": g["golden_protocol_eligible"],
            "decision_state": g["decision_state"],
            "overall_outcome": g["overall_outcome"],
            "sequence": g["sequence"],
            "changed_flag": g["optimization_credit"]["changed_flag"],
            "eligibility_reasons": g["eligibility_reasons"],
            "tool_version": g["tool_version"],
            "generated_at": g["generated_at"],
            "throughput_ci": {k: ci[k] for k in ("estimate", "low", "high", "confidence", "method", "n")},
            # $/M change implied by a throughput change x (in percent): 1/(1+x) - 1.
            # A higher throughput bound gives the larger cost reduction.
            "cost_change_from_ci": {
                "estimate": 1 / (1 + ci["estimate"] / 100) - 1,
                "best": 1 / (1 + ci["high"] / 100) - 1,
                "worst": 1 / (1 + ci["low"] / 100) - 1,
            },
            "disclaimer": g["disclaimer"],
        }

    body = json.dumps(out, indent=1, sort_keys=False)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    js = (
        "/* GENERATED by scripts/build_demo_data.py - do not edit by hand.\n"
        f" * Source: {a.source_url}\n"
        f" * Built {stamp} from: {', '.join(out['built_from'])}\n"
        " * Recorded measurements only; the page replays them. */\n"
        f"window.THROTTLE_DEMO = {body};\n"
    )
    with open(a.out, "w", encoding="utf-8") as fh:
        fh.write(js)
    print(f"wrote {a.out} ({len(js)} bytes)")
    print(f"before $/M {b['cost_per_m']:.6f}  after $/M {c['cost_per_m']:.6f}  change {out['derived']['cost_change']*100:.2f}%")


if __name__ == "__main__":
    main()
