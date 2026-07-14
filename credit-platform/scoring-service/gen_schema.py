"""
gen_schema.py -- generate app/artifacts/feature_schema.json from your real model.

RUN THIS *AFTER* you have copied your real model to app/artifacts/model.joblib.
Paths are anchored to this file, so you can run it from any directory. The Python
environment you run it with must have catboost installed (so the model unpickles).

    python gen_schema.py                 # version label defaults to "catboost-v1"
    python gen_schema.py catboost-v2     # custom version label
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib

HERE = Path(__file__).resolve().parent
ART = HERE / "app" / "artifacts"
MODEL_PATH = ART / "model.joblib"

version = sys.argv[1] if len(sys.argv) > 1 else "catboost-v1"

if not MODEL_PATH.exists():
    raise SystemExit(
        f"{MODEL_PATH} not found. Copy your real catboost.joblib there first."
    )

m = joblib.load(MODEL_PATH)
names = list(getattr(m, "feature_names_", []) or [])
if not names:
    raise SystemExit("Model has no feature_names_; cannot infer the feature contract.")

if hasattr(m, "get_cat_feature_indices"):           # CatBoost
    cat = [names[i] for i in m.get_cat_feature_indices()]
else:                                               # non-CatBoost: set these by hand
    cat = []
    print("NOTE: not a CatBoost model -> categorical_cols left empty; fill them in, "
          "and update model_runner's SHAP extraction for this model type.")

(ART / "feature_schema.json").write_text(json.dumps({
    "model_version": version,
    "model_type": type(m).__name__,
    "feature_cols": names,
    "categorical_cols": cat,
    "trained_at": datetime.now(timezone.utc).isoformat(),
}, indent=2))

print(f"wrote {ART / 'feature_schema.json'}")
print(f"  model_type : {type(m).__name__}")
print(f"  version    : {version}")
print(f"  features   : {len(names)} -> {names}")
if version.startswith("stub"):
    print("WARNING: version label still looks like a stub.")
