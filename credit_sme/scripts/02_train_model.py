"""
02_train_model.py —— Parameterized training; can train a single model or train all models at once.

Each model trained, besides test set metrics, also calculates AUC for train/val/test:
  - The gap between train and validation ≈ overfitting signal (model has seen training data but not validation data)
  - The gap between validation and test ≈ temporal shift signal (neither has seen the other, but test data is from a later/harder period)

Output:
  - models/{name}.joblib            model
  - reports/preds_{name}.parquet    test set y_true + proba (for 03 comparison / 04 decision making)
  - reports/fit_auc.csv             AUC for each model across train/val/test (for reporting)

Running:
  python scripts/02_train_model.py                  # Train all models
  python scripts/02_train_model.py --model xgboost  # Only retrain xgboost (other predictions/AUC remain unchanged)
"""

import argparse
import joblib
import pandas as pd
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss

from sba_common import (
    load_clean, temporal_split, get_feature_setup, build_xy, to_category,
    save_predictions, model_path, MODELS_DIR, REPORTS_DIR, MODEL_NAMES,
)

RANDOM_SEED = 42


def prepare():
    """Prepare the data pipeline for all models, run once."""
    df = load_clean()
    train_df, val_df, test_df = temporal_split(df)
    feature_cols, cat_features = get_feature_setup(df)
    d = {"cat_features": cat_features}
    d["Xtr"], d["ytr"] = build_xy(train_df, feature_cols, cat_features)
    d["Xval"], d["yval"] = build_xy(val_df, feature_cols, cat_features)
    d["Xte"], d["yte"] = build_xy(test_df, feature_cols, cat_features)
    return d


def _scale_pos_weight(ytr):
    pos = int(ytr.sum())
    return (len(ytr) - pos) / pos


def train_catboost(d):
    from catboost import CatBoostClassifier, Pool
    cat = d["cat_features"]
    m = CatBoostClassifier(
        iterations=3000, learning_rate=0.03, depth=6, l2_leaf_reg=3.0,
        loss_function="Logloss", eval_metric="AUC", auto_class_weights="Balanced",
        random_seed=RANDOM_SEED, early_stopping_rounds=150, verbose=200,
    )
    m.fit(Pool(d["Xtr"], d["ytr"], cat_features=cat),
          eval_set=Pool(d["Xval"], d["yval"], cat_features=cat), use_best_model=True)
    proba = {
        "train": m.predict_proba(Pool(d["Xtr"], cat_features=cat))[:, 1],
        "val":   m.predict_proba(Pool(d["Xval"], cat_features=cat))[:, 1],
        "test":  m.predict_proba(Pool(d["Xte"], cat_features=cat))[:, 1],
    }
    return m, proba


def train_lightgbm(d):
    import lightgbm as lgb
    Xtr, Xval, Xte = to_category([d["Xtr"], d["Xval"], d["Xte"]], d["cat_features"])
    m = lgb.LGBMClassifier(
        n_estimators=3000, learning_rate=0.03, num_leaves=31,
        class_weight="balanced", random_state=RANDOM_SEED, n_jobs=-1, verbose=-1,
    )
    m.fit(Xtr, d["ytr"], eval_set=[(Xval, d["yval"])], eval_metric="auc",
          callbacks=[lgb.early_stopping(150), lgb.log_evaluation(200)])
    proba = {
        "train": m.predict_proba(Xtr)[:, 1],
        "val":   m.predict_proba(Xval)[:, 1],
        "test":  m.predict_proba(Xte)[:, 1],
    }
    return m, proba


def train_xgboost(d):
    import xgboost as xgb
    Xtr, Xval, Xte = to_category([d["Xtr"], d["Xval"], d["Xte"]], d["cat_features"])
    m = xgb.XGBClassifier(
        n_estimators=3000, learning_rate=0.03, max_depth=6,
        tree_method="hist", enable_categorical=True, eval_metric="auc",
        early_stopping_rounds=150, scale_pos_weight=_scale_pos_weight(d["ytr"]),
        random_state=RANDOM_SEED, n_jobs=-1,
    )
    m.fit(Xtr, d["ytr"], eval_set=[(Xval, d["yval"])], verbose=False)
    proba = {
        "train": m.predict_proba(Xtr)[:, 1],
        "val":   m.predict_proba(Xval)[:, 1],
        "test":  m.predict_proba(Xte)[:, 1],
    }
    return m, proba


TRAINERS = {"catboost": train_catboost, "lightgbm": train_lightgbm, "xgboost": train_xgboost}


def _update_fit_csv(name, auc_tr, auc_val, auc_te):
    """Update the fit_auc.csv file with the train/val/test AUC for the current model."""
    path = REPORTS_DIR / "fit_auc.csv"
    row = {"model": name,
           "auc_train": round(auc_tr, 4), "auc_val": round(auc_val, 4), "auc_test": round(auc_te, 4),
           "gap_overfit_train_val": round(auc_tr - auc_val, 4),
           "gap_drift_val_test": round(auc_val - auc_te, 4)}
    if path.exists():
        df = pd.read_csv(path)
        df = df[df["model"] != name]                       # Delete old rows to avoid duplication.
        df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    else:
        df = pd.DataFrame([row])
    df = df.sort_values("model").reset_index(drop=True)
    df.to_csv(path, index=False)


def train_one(name, d):
    print(f"\n===== training {name} =====")
    model, proba = TRAINERS[name](d)

    # 3 AUC
    auc_tr = roc_auc_score(d["ytr"], proba["train"])
    auc_val = roc_auc_score(d["yval"], proba["val"])
    auc_te = roc_auc_score(d["yte"], proba["test"])
    
    # 2 other metrics on the test set（PR-AUC / Brier）
    pr = average_precision_score(d["yte"], proba["test"])
    brier = brier_score_loss(d["yte"], proba["test"])

    # Store the model + store only the test set predictions (03/04 Only the test set is needed)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, model_path(name))
    save_predictions(name, d["yte"].values, proba["test"])
    _update_fit_csv(name, auc_tr, auc_val, auc_te)

    print(f"{name}:  AUC  train={auc_tr:.4f}  val={auc_val:.4f}  test={auc_te:.4f}")
    print(f"  gap  train->val (Overfitting) = {auc_tr - auc_val:+.4f}   "
          f"val->test (Time Drift) = {auc_val - auc_te:+.4f}")
    print(f"  test:  PR-AUC={pr:.4f}  Brier={brier:.4f}")
    print(f"  saved -> {model_path(name).name} + reports/preds_{name}.parquet")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=MODEL_NAMES + ["all"], default="all")
    args = ap.parse_args()

    names = MODEL_NAMES if args.model == "all" else [args.model]
    d = prepare()                 # Shared pipeline, prepare once
    for name in names:
        train_one(name, d)

    print("\n===== fit_auc.csv =====")
    print(pd.read_csv(REPORTS_DIR / "fit_auc.csv").to_string(index=False))
    print("\nNext step: python scripts/03_compare_model.py  Compare and select models")