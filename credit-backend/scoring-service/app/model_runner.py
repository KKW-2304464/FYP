"""
model_runner.py
---------------
Loads the trained model + its feature schema, and runs scoring + SHAP.

Artifact pattern (versioned together):
  - model.joblib          : the fitted estimator (CatBoost here; the winner from 03)
  - feature_schema.json   : feature_cols, categorical_cols, model_version, trained_at

Keeping the schema next to the model means the service never guesses what columns
the model expects, and a model swap is a file swap — no code change.

SHAP: CatBoost computes exact TreeSHAP natively via get_feature_importance(type="ShapValues").
The last column returned is the base (expected) value; the rest align with feature order.
These are genuine SHAP values (TreeSHAP), suitable for the per-applicant explanation
that goes into the SME report.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from catboost import CatBoostClassifier, Pool

from app.features import FEATURE_COLS, engineer_features, to_model_frame

ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "model.joblib"
SCHEMA_PATH = ARTIFACT_DIR / "feature_schema.json"


class ModelRunner:
    """Holds the loaded model + schema and serves scoring/explanation requests."""

    def __init__(self) -> None:
        self.model: CatBoostClassifier | None = None
        self.schema: dict[str, Any] = {}
        self.feature_order: list[str] = []
        self._cat_idx: list[int] = []

    # ---- lifecycle ----

    def load(self) -> None:
        if not MODEL_PATH.exists() or not SCHEMA_PATH.exists():
            raise FileNotFoundError(
                f"Model artifacts not found in {ARTIFACT_DIR}. "
                "Run `python train_stub_model.py` (demo) or drop your real "
                "catboost.joblib + feature_schema.json here."
            )
        self.model = joblib.load(MODEL_PATH)
        self.schema = json.loads(SCHEMA_PATH.read_text())

        # Prefer the model's OWN feature metadata as the source of truth for column
        # order and which columns are categorical. This makes dropping in your real
        # trained model safe: the feature order is whatever the model was trained on
        # (e.g. sba_common.get_feature_setup order), so there is no chance of an
        # ordering mismatch between training and serving. Fall back to the schema
        # file only if the model does not carry names (it normally does).
        names = list(getattr(self.model, "feature_names_", []) or [])
        if names:
            self.feature_order = names
            self._cat_idx = list(self.model.get_cat_feature_indices())
        else:
            self.feature_order = self.schema["feature_cols"]
            cat_cols = set(self.schema["categorical_cols"])
            self._cat_idx = [i for i, c in enumerate(self.feature_order) if c in cat_cols]

        # Fail LOUDLY at startup if features.py cannot produce every column the model
        # expects (this is exactly the training/serving skew that otherwise shows up
        # as silent garbage scores). Better a clear error here than a wrong decision.
        producible = set(FEATURE_COLS)
        required = set(self.feature_order)
        missing = required - producible
        if missing:
            raise RuntimeError(
                "Feature skew: the model expects columns that features.py does not "
                f"produce: {sorted(missing)}. Align app/features.py (ideally import "
                "your real sba_common) with the trained model before serving."
            )

    @property
    def is_loaded(self) -> bool:
        return self.model is not None

    # ---- inference ----

    def _build_frame(self, raw: dict[str, Any]) -> pd.DataFrame:
        engineered = engineer_features(raw)
        frame = to_model_frame([engineered])
        # reorder to the model's exact training order (alignment by name)
        return frame[self.feature_order]

    def score(self, raw: dict[str, Any]) -> dict[str, Any]:
        """Return probability of default + per-feature SHAP attribution.

        Probability and SHAP are computed on the SAME engineered row in one pass,
        so the explanation is always consistent with the score it explains
        (this directly supports the reproducibility requirement).
        """
        assert self.model is not None
        frame = self._build_frame(raw)
        pool = Pool(frame, cat_features=self._cat_idx)

        proba = float(self.model.predict_proba(pool)[0, 1])

        shap_matrix = self.model.get_feature_importance(pool, type="ShapValues")
        row = shap_matrix[0]
        base_value = float(row[-1])
        contribs = row[:-1]

        feature_cols = self.feature_order
        display_vals = frame.iloc[0]
        shap = [
            {
                "feature": feature_cols[i],
                "value": _fmt(display_vals.iloc[i]),
                "shap_value": float(contribs[i]),
            }
            for i in range(len(feature_cols))
        ]
        # most influential first
        shap.sort(key=lambda d: abs(d["shap_value"]), reverse=True)

        return {
            "model_version": self.schema["model_version"],
            "probability": proba,
            "base_value": base_value,
            "shap": shap,
        }

    def info(self) -> dict[str, Any]:
        return {
            "model_version": self.schema["model_version"],
            "model_type": self.schema.get("model_type", "unknown"),
            "n_features": len(self.schema["feature_cols"]),
            "feature_cols": self.schema["feature_cols"],
            "categorical_cols": self.schema["categorical_cols"],
            "trained_at": self.schema.get("trained_at", "unknown"),
        }


def _fmt(v: Any) -> str:
    if isinstance(v, float) and np.isnan(v):
        return "missing"
    if isinstance(v, float):
        return f"{v:.4g}"
    return str(v)


# single shared instance
runner = ModelRunner()
