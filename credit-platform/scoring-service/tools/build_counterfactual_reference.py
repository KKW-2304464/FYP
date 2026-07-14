"""Build the counterfactual reference profile from the temporal training split."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "app" / "artifacts" / "counterfactual_reference.json",
    )
    args = parser.parse_args()

    frame = pd.read_parquet(args.data)
    frame = frame[frame["ApprovalFY"].notna()].copy()
    validation_cut = int(frame["ApprovalFY"].quantile(0.70))
    training = frame[frame["ApprovalFY"] < validation_cut].copy()
    quantiles = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]

    common_terms = training["Term"].dropna().astype(int).value_counts().head(12).index.tolist()
    term_quantiles = training["Term"].dropna().quantile(quantiles).tolist()
    amount_quantiles = training["GrAppv"].dropna().quantile(quantiles).tolist()
    ratios = training["sba_guar_ratio"].replace([float("inf"), float("-inf")], pd.NA).dropna().clip(0, 1)
    ratio_quantiles = ratios.quantile(quantiles).tolist()

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "SBAnational cleaned training split",
        "split_rule": f"ApprovalFY < {validation_cut} (70% temporal training split)",
        "training_rows": int(len(training)),
        "term_months": {"values": sorted({int(round(v)) for v in common_terms + term_quantiles if v >= 1})},
        "gr_appv": {"quantiles": sorted({round(float(v), 2) for v in amount_quantiles if v > 0})},
        "sba_guar_ratio": {"quantiles": sorted({round(float(v), 4) for v in ratio_quantiles if 0 <= v <= 1})},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"wrote {args.output} from {len(training):,} training rows")


if __name__ == "__main__":
    main()
