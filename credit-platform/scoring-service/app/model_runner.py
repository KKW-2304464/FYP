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

from app.counterfactual import build_candidates, change_distance, describe_changes
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

    def predict_probabilities(self, records: list[dict[str, Any]]) -> list[float]:
        """Vectorised probability-only inference for counterfactual candidates."""
        assert self.model is not None
        engineered = [engineer_features(record) for record in records]
        frame = to_model_frame(engineered)[self.feature_order]
        pool = Pool(frame, cat_features=self._cat_idx)
        return [float(value) for value in self.model.predict_proba(pool)[:, 1]]

    def counterfactual(
        self,
        raw: dict[str, Any],
        target_probability: float,
        allowed_fields: list[str],
        max_results: int,
    ) -> dict[str, Any]:
        """Search realistic, whitelisted facility changes with the loaded model."""
        candidates, reference_source = build_candidates(raw, allowed_fields)
        probabilities = self.predict_probabilities(candidates)
        original_probability = self.predict_probabilities([raw])[0]

        improved: list[dict[str, Any]] = []
        for candidate, probability in zip(candidates, probabilities, strict=True):
            changes = describe_changes(raw, candidate, allowed_fields)
            if not changes or probability >= original_probability - 1e-6:
                continue
            improved.append({
                "probability": probability,
                "probability_reduction": original_probability - probability,
                "target_met": probability < target_probability,
                "changes": changes,
                "distance": change_distance(raw, candidate, allowed_fields),
            })

        improved.sort(key=lambda item: (
            not item["target_met"],
            len(item["changes"]),
            item["distance"],
            item["probability"],
        ))
        selected = improved[:max_results]
        results = [
            {
                "rank": index + 1,
                "probability": item["probability"],
                "probability_reduction": item["probability_reduction"],
                "target_met": item["target_met"],
                "changes": item["changes"],
            }
            for index, item in enumerate(selected)
        ]

        if not results:
            message = "No lower-risk scenario was found inside the allowed, training-anchored search space."
        elif any(item["target_met"] for item in results):
            message = "The model found one or more scenarios below the review threshold. These are scenarios, not approval promises."
        else:
            message = "The model found lower-risk scenarios, but none crossed the review threshold."

        return {
            "model_version": self.schema["model_version"],
            "original_probability": original_probability,
            "target_probability": target_probability,
            "allowed_fields": allowed_fields,
            "reference_source": reference_source,
            "generated_candidates": len(candidates),
            "results": results,
            "message": message,
        }

    def info(self) -> dict[str, Any]:
        return {
            "model_version": self.schema["model_version"],
            "model_type": self.schema.get("model_type", "unknown"),
            "n_features": len(self.schema["feature_cols"]),
            "feature_cols": self.schema["feature_cols"],
            "categorical_cols": self.schema["categorical_cols"],
            "trained_at": self.schema.get("trained_at", "unknown"),
            "dataset_name": self.schema.get("dataset_name"),
            "training_rows": self.schema.get("training_rows"),
            "validation_rows": self.schema.get("validation_rows"),
            "test_rows": self.schema.get("test_rows"),
            "split_strategy": self.schema.get("split_strategy"),
            "offline_metrics": self.schema.get("offline_metrics"),
            "intended_use": self.schema.get("intended_use"),
            "limitations": self.schema.get("limitations", []),
        }


def _fmt(v: Any) -> str:
    if isinstance(v, float) and np.isnan(v):
        return "missing"
    if isinstance(v, float):
        return f"{v:.4g}"
    return str(v)


# single shared instance
runner = ModelRunner()
