"""
features.py
-----------
Inference-time feature engineering for the Scoring & XAI service.

CRITICAL — training/serving skew:
The transformations here MUST be byte-for-byte identical to what the model
saw during training. In production you should NOT re-implement this; you
should import the SAME `sba_common` module used by 01_clean_sba.py / 02_train_model.py
so there is a single source of truth. This file is a faithful mirror of that
logic for a runnable standalone demo.

Two stages:
  1. engineer_features(raw)  : raw application dict  ->  engineered feature dict
                               (term_years, sba_guar_ratio, is_franchise, ...)
  2. to_model_frame(records) : list of engineered dicts -> single DataFrame with
                               the EXACT dtype handling from sba_common.build_xy:
                                 - categorical cols: fillna("missing").astype(str)
                                 - numeric cols    : pd.to_numeric(errors="coerce")
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

# ---- The model's feature contract (must match get_feature_setup in sba_common) ----

CATEGORICAL_COLS: list[str] = [
    "State",
    "BankState",
    "NewExist",
    "UrbanRural",
    "RevLineCr",
    "LowDoc",
    "naics_sector",
    "is_franchise",
    "same_state_bank",
    "recession_0709",
]

NUMERIC_COLS: list[str] = [
    "Term",            # raw term in MONTHS (the real model keeps both Term and term_years)
    "term_years",
    "sba_guar_ratio",
    "zero_appv_flag",
    "NoEmp",
    "CreateJob",
    "RetainedJob",
    "GrAppv",
    "SBA_Appv",
]

FEATURE_COLS: list[str] = NUMERIC_COLS + CATEGORICAL_COLS


def engineer_features(raw: dict[str, Any]) -> dict[str, Any]:
    """Raw application payload -> engineered feature dict.

    Mirrors the derived features built in 01_clean_sba.py. For a *new* application
    at decision time, `recession_0709` is always "No": the 2007-09 window is in the
    past, so the loan's lifecycle cannot overlap it. It is a state-control variable,
    not a risk driver for new applicants.
    """
    gr_appv = float(raw["gr_appv"])
    sba_appv = float(raw["sba_appv"])
    term_months = raw["term_months"]  # keep raw (int months) to match training dtype

    # sba_guar_ratio: NaN (kept, not imputed) when GrAppv == 0, plus a flag.
    if gr_appv == 0:
        sba_guar_ratio: float = np.nan
        zero_appv_flag = 1
    else:
        sba_guar_ratio = sba_appv / gr_appv
        zero_appv_flag = 0

    state = str(raw["state"]).strip().upper()
    bank_state = str(raw["bank_state"]).strip().upper()

    return {
        # numeric
        "Term": term_months,                 # raw months, as the model was trained on
        "term_years": term_months / 12.0,
        "sba_guar_ratio": sba_guar_ratio,
        "zero_appv_flag": zero_appv_flag,
        "NoEmp": raw.get("no_emp"),
        "CreateJob": raw.get("create_job"),
        "RetainedJob": raw.get("retained_job"),
        "GrAppv": gr_appv,
        "SBA_Appv": sba_appv,
        # categorical
        "State": state,
        "BankState": bank_state,
        "NewExist": raw.get("new_exist", "Unknown"),
        "UrbanRural": str(raw.get("urban_rural", "Unknown")),
        "RevLineCr": raw.get("rev_line_cr", "Unknown"),
        "LowDoc": raw.get("low_doc", "Unknown"),
        "naics_sector": str(raw["naics_sector"]),
        "is_franchise": "Yes" if int(raw.get("franchise_code", 0)) > 1 else "No",
        "same_state_bank": "Yes" if state == bank_state else "No",
        "recession_0709": "No",  # always "No" for a new application
    }


def to_model_frame(records: list[dict[str, Any]]) -> pd.DataFrame:
    """Engineered dicts -> model-ready DataFrame.

    Replicates sba_common.build_xy exactly:
      - categorical columns: fillna("missing").astype(str)  (constant fill, no leakage)
      - numeric columns    : pd.to_numeric(errors="coerce") (guards parquet/json round-trips)
    Column order is pinned to FEATURE_COLS so the matrix matches the trained model.
    """
    df = pd.DataFrame.from_records(records)

    # ensure every expected column exists even if a record omitted it
    for col in FEATURE_COLS:
        if col not in df.columns:
            df[col] = np.nan

    for col in CATEGORICAL_COLS:
        df[col] = df[col].fillna("missing").astype(str)

    for col in NUMERIC_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    return df[FEATURE_COLS]
