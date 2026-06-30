"""
03_compare.py —— Horizontal comparison + selection (read-only cache prediction, completely decoupled from "how to train the model")

Read reports/preds_{name}.parquet, calculate ROC-AUC / PR-AUC / Brier, rank,
and provide a "suggested winner" based on PR-AUC, written to reports/winner.txt (suggestion rather than conclusion, 04 can override).

Placement: scripts/03_compare.py
Run: python scripts/03_compare.py   (requires running 02_train.py first)
"""

import pandas as pd
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss

from sba_common import (
    load_predictions, preds_path, REPORTS_DIR, WINNER_FILE, MODEL_NAMES,
)

rows = []
for name in MODEL_NAMES:
    if not preds_path(name).exists():
        print(f"Skipping {name}: {preds_path(name).name} not found"
              f" (run python scripts/02_train.py --model {name} first)")
        continue
    pred = load_predictions(name)
    y, proba = pred["y_true"].to_numpy(), pred["proba"].to_numpy()
    rows.append({
        "model": name,
        "roc_auc": round(roc_auc_score(y, proba), 4),
        "pr_auc": round(average_precision_score(y, proba), 4),
        "brier": round(brier_score_loss(y, proba), 4),
    })

if not rows:
    raise SystemExit("No model predictions available for comparison. Please run python scripts/02_train.py first.")

results = pd.DataFrame(rows).sort_values("pr_auc", ascending=False).reset_index(drop=True)
print("\n========== Model Comparison (test) ==========")
print(results.to_string(index=False))
# Reading method: PR-AUC is most sensitive to imbalance, so prioritize it; a lower Brier score indicates more accurate probabilities (important for admin decision-making based on probabilities).

REPORTS_DIR.mkdir(parents=True, exist_ok=True)
results.to_csv(REPORTS_DIR / "comparison_metrics.csv", index=False)

suggested = results.iloc[0]["model"]
WINNER_FILE.write_text(suggested, encoding="utf-8")
print(f"\nSuggested winner based on PR-AUC: {suggested}  -> Written to {WINNER_FILE.name}")
print("Note: This is a suggestion, not a conclusion. After considering calibration/explainability/speed,")
print("the winner can be overridden in 04 using  python scripts/04_decision.py --model <name>  .")
print("\nNext step: python scripts/04_decision.py")