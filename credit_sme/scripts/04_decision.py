"""
04_decision.py —— Perform loan decision analysis on the selected master model.

Read-only cache prediction, independent of model type. Defaults to using reports/winner.txt written by 03,
but can be overridden with --model (since selection considers more than just PR-AUC, also calibration/explainability, etc.).

Output: reports/decision_threshold.csv (threshold analysis table)

Placement: scripts/04_decision.py
Run:
  python scripts/04_decision.py                      # Use the model from winner.txt
  python scripts/04_decision.py --model lightgbm     # Manually specify
  python scripts/04_decision.py --cost-ratio 8       # Change the cost ratio
"""

import argparse
import numpy as np
import pandas as pd

from sba_common import load_predictions, preds_path, WINNER_FILE, REPORTS_DIR, decision_report

ap = argparse.ArgumentParser()
ap.add_argument("--model", default=None, help="Defaults to reading reports/winner.txt")
ap.add_argument("--cost-ratio", type=float, default=5.0,
                help="Bad debt loss : Missed profit ratio (set according to your business needs)")
args = ap.parse_args()

name = args.model or (WINNER_FILE.read_text(encoding="utf-8").strip()
                      if WINNER_FILE.exists() else None)
if name is None:
    raise SystemExit("No model specified and no winner.txt found. Please run 03_compare.py first, or use --model to specify.")
if not preds_path(name).exists():
    raise SystemExit(f"Prediction file for {name} not found. Please run python scripts/02_train.py --model {name} first.")

pred = load_predictions(name)
y, proba = pred["y_true"].to_numpy(), pred["proba"].to_numpy()
print(f"Decision Analysis Model: {name} | test Default Rate Baseline = {y.mean():.4f}\n")

# ---- Threshold Analysis Table ----
table = pd.DataFrame(
    [decision_report(y, proba, t) for t in [0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]]
).round(4)
print("===== Loan Approval Threshold Analysis =====")
print(table.to_string(index=False))
# Reading: Lowering the threshold -> more rejections, lower approval rate, but a lower bad debt rate for approved loans.

# ---- Cost-Optimal Threshold ----
# Assumption: The cost of missing a default = COST_RATIO times the cost of rejecting a good customer. This value is set according to business needs.
ths = np.linspace(0.02, 0.8, 200)
costs = []
for t in ths:
    approve = proba < t
    missed_default = int(((y == 1) & approve).sum())
    rejected_good = int(((y == 0) & ~approve).sum())
    costs.append(args.cost_ratio * missed_default + rejected_good)

best = float(ths[int(np.argmin(costs))])
print(f"\nCOST_RATIO={args.cost_ratio} -> Cost-Optimal Threshold ≈ {best:.3f}")
print(decision_report(y, proba, best))

REPORTS_DIR.mkdir(parents=True, exist_ok=True)
table.to_csv(REPORTS_DIR / "decision_threshold.csv", index=False)
print(f"\nsaved -> {REPORTS_DIR / 'decision_threshold.csv'}")
print("Visualization (Decision Curve + SHAP) see notebooks/04_decision.ipynb")