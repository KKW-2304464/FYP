"""
train_stub_model.py
-------------------
Trains a SMALL CatBoost classifier on SYNTHETIC data so the scoring service runs
standalone for integration testing / the demo. This is NOT your real model.

To use your real model instead:
  1. Drop your trained `catboost.joblib` into app/artifacts/model.joblib
  2. Write app/artifacts/feature_schema.json with your real feature_cols /
     categorical_cols / model_version (must match what the model was trained on).
  3. (Strongly recommended) replace app/features.py with an import of your actual
     sba_common so feature engineering is shared with training — no skew.

Run:  python train_stub_model.py
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from catboost import CatBoostClassifier, Pool

from app.features import (
    CATEGORICAL_COLS,
    FEATURE_COLS,
    engineer_features,
    to_model_frame,
)

ARTIFACT_DIR = Path(__file__).resolve().parent / "app" / "artifacts"
RNG = np.random.default_rng(42)

STATES = ["CA", "TX", "NY", "FL", "IL", "WA", "GA", "OH"]
SECTORS = ["23", "31", "44", "54", "62", "72", "81"]
YN = ["Y", "N", "Unknown"]
NEW_EXIST = ["Existing", "New", "Unknown"]
URBAN = ["0", "1", "2"]


def _synth_raw() -> dict:
    gr = float(RNG.choice([0, 25_000, 75_000, 150_000, 350_000, 800_000],
                          p=[0.02, 0.2, 0.3, 0.28, 0.15, 0.05]))
    sba = gr * RNG.uniform(0.4, 0.9) if gr > 0 else 0.0
    state = RNG.choice(STATES)
    bank_state = state if RNG.random() < 0.55 else RNG.choice(STATES)
    return {
        "state": str(state),
        "bank_state": str(bank_state),
        "naics_sector": str(RNG.choice(SECTORS)),
        "term_months": int(RNG.choice([12, 36, 60, 84, 120, 240])),
        "no_emp": int(RNG.integers(0, 80)),
        "new_exist": str(RNG.choice(NEW_EXIST)),
        "create_job": int(RNG.integers(0, 20)),
        "retained_job": int(RNG.integers(0, 40)),
        "urban_rural": str(RNG.choice(URBAN)),
        "rev_line_cr": str(RNG.choice(YN)),
        "low_doc": str(RNG.choice(YN)),
        "gr_appv": gr,
        "sba_appv": float(sba),
        "franchise_code": int(RNG.choice([0, 1, 5000], p=[0.5, 0.4, 0.1])),
    }


def _label(row: dict) -> int:
    """Synthetic default propensity: a few intuitive drivers + noise."""
    z = -1.4
    z += 0.9 if row["term_years"] >= 10 else 0.0          # long term -> riskier
    ratio = row["sba_guar_ratio"]
    if isinstance(ratio, float) and not np.isnan(ratio):
        z += -1.2 * ratio                                  # higher guarantee -> safer
    z += 0.6 if row["zero_appv_flag"] == 1 else 0.0        # odd zero-amount loans
    z += 0.5 if row["naics_sector"] in ("72", "23") else 0  # hospitality/construction
    z += 0.4 if row["NewExist"] == "New" else 0.0          # new businesses riskier
    z += 0.3 if row["State"] != row["BankState"] else 0.0
    p = 1.0 / (1.0 + np.exp(-z))
    return int(RNG.random() < p)


def main() -> None:
    n = 5000
    raws = [_synth_raw() for _ in range(n)]
    engineered = [engineer_features(r) for r in raws]
    y = np.array([_label(e) for e in engineered])

    X = to_model_frame(engineered)
    cat_idx = [i for i, c in enumerate(FEATURE_COLS) if c in set(CATEGORICAL_COLS)]
    pool = Pool(X, label=y, cat_features=cat_idx)

    model = CatBoostClassifier(
        iterations=300,
        learning_rate=0.05,
        depth=6,
        l2_leaf_reg=3.0,
        loss_function="Logloss",
        eval_metric="AUC",
        auto_class_weights="Balanced",
        random_seed=42,
        verbose=False,
    )
    model.fit(pool)

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, ARTIFACT_DIR / "model.joblib")

    schema = {
        "model_version": "stub-catboost-0.1",
        "model_type": "CatBoostClassifier",
        "feature_cols": FEATURE_COLS,
        "categorical_cols": CATEGORICAL_COLS,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    (ARTIFACT_DIR / "feature_schema.json").write_text(json.dumps(schema, indent=2))

    print(f"trained stub model on {n} synthetic rows, default rate = {y.mean():.3f}")
    print(f"saved -> {ARTIFACT_DIR / 'model.joblib'}")
    print(f"saved -> {ARTIFACT_DIR / 'feature_schema.json'}")


if __name__ == "__main__":
    main()
