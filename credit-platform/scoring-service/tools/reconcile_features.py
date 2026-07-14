"""
reconcile_features.py -- prove the scoring service's features.py produces the SAME
feature frame as your real training pipeline (01_clean_sba.py + sba_common.build_xy).

Run from the scoring-service directory:
    python tools/reconcile_features.py

Point SBA_COMMON_DIR at the folder containing your real sba_common.py (your
project's scripts/ directory). The 01_clean_sba.py engineering is replicated inline
below so this check is self-contained; if you change 01_clean_sba.py, update the
run_01_cleaning() function here too.

The principled alternative (no duplication): refactor a shared featurize_one(raw)
into sba_common.py and call it from BOTH 01_clean_sba.py and app/features.py — then
this reconciliation becomes unnecessary because there is only one implementation.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# --- EDIT THIS to your project's scripts/ folder that contains sba_common.py ---
SBA_COMMON_DIR = "/path/to/your/project/scripts"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # scoring-service (for app.*)
sys.path.insert(0, SBA_COMMON_DIR)

from app.features import engineer_features, to_model_frame, FEATURE_COLS as SVC_FEATURES  # noqa: E402

try:
    import sba_common as sc  # noqa: E402
except ModuleNotFoundError:
    raise SystemExit(
        f"Could not import sba_common from {SBA_COMMON_DIR!r}. "
        "Set SBA_COMMON_DIR at the top of this file to your scripts/ directory."
    )

RAW_COLS_ORDER = [
    "LoanNr_ChkDgt", "Name", "City", "State", "Zip", "Bank", "BankState", "NAICS",
    "ApprovalDate", "ApprovalFY", "Term", "NoEmp", "NewExist", "CreateJob",
    "RetainedJob", "FranchiseCode", "UrbanRural", "RevLineCr", "LowDoc",
    "ChgOffDate", "DisbursementDate", "DisbursementGross", "BalanceGross",
    "ChgOffPrinGr", "GrAppv", "SBA_Appv", "MIS_Status",
]

PRE_APPROVAL_FRAMING = True


def clean_money(s):
    return pd.to_numeric(
        s.astype(str).str.replace("$", "", regex=False)
                     .str.replace(",", "", regex=False).str.strip(), errors="coerce")


def norm_yn(s):
    x = s.astype(str).str.strip().str.upper()
    return x.where(x.isin(["Y", "N"]), "Unknown")


def run_01_cleaning(df):
    """Verbatim mirror of 01_clean_sba.py feature engineering (single source for the test)."""
    df = df[df["MIS_Status"].notna()].copy()
    status = df["MIS_Status"].astype(str).str.strip().str.upper()
    df["is_default"] = status.map({"P I F": 0, "PIF": 0, "CHGOFF": 1})
    df = df[df["is_default"].notna()].copy()
    df["is_default"] = df["is_default"].astype(int)

    LEAK = ["MIS_Status", "ChgOffDate", "ChgOffPrinGr", "BalanceGross"]
    ID_COLS = ["LoanNr_ChkDgt", "Name", "City", "Zip", "Bank"]
    DATE_COLS = ["ApprovalDate", "DisbursementDate"]
    DROP = LEAK + ID_COLS + DATE_COLS
    if PRE_APPROVAL_FRAMING:
        DROP.append("DisbursementGross")
    df.drop(columns=[c for c in DROP if c in df.columns], inplace=True)

    for col in ["DisbursementGross", "GrAppv", "SBA_Appv"]:
        if col in df.columns:
            df[col] = clean_money(df[col])

    df["RevLineCr"] = norm_yn(df["RevLineCr"])
    df["LowDoc"] = norm_yn(df["LowDoc"])
    df["NewExist"] = df["NewExist"].astype(str).str.strip().map(
        {"1": "Existing", "2": "New"}).fillna("Unknown")

    df["naics_sector"] = (
        pd.to_numeric(df["NAICS"], errors="coerce").floordiv(10000)
        .astype("Int64").astype(str))
    df.drop(columns=["NAICS"], inplace=True)

    gr = df["GrAppv"].replace(0, np.nan)
    df["sba_guar_ratio"] = df["SBA_Appv"] / gr
    df["zero_appv_flag"] = np.where(df["GrAppv"].fillna(0) == 0, 1, 0)
    df["term_years"] = df["Term"] / 12
    df["is_franchise"] = np.where(
        pd.to_numeric(df["FranchiseCode"], errors="coerce").fillna(0) > 1, "Yes", "No")
    df["same_state_bank"] = np.where(df["State"] == df["BankState"], "Yes", "No")
    df["ApprovalFY"] = df["ApprovalFY"].astype(str).str.extract(r"(\d{4})")[0].astype(float)
    df["end_year"] = df["ApprovalFY"] + df["term_years"]
    df["recession_0709"] = np.where(
        (df["ApprovalFY"] <= 2009) & (df["end_year"] >= 2007), "Yes", "No")
    return df


# A present-day applicant (so recession_0709 is "No" on both sides, by design).
RAW = {
    "LoanNr_ChkDgt": "1000014003", "Name": "ACME LLC", "City": "LOS ANGELES",
    "State": "CA", "Zip": "90001", "Bank": "SOME BANK", "BankState": "CA",
    "NAICS": "722110", "ApprovalDate": "28-Feb-26", "ApprovalFY": "2026",
    "Term": 120, "NoEmp": 8, "NewExist": "2", "CreateJob": 5, "RetainedJob": 3,
    "FranchiseCode": "1", "UrbanRural": "1", "RevLineCr": "N", "LowDoc": "N",
    "ChgOffDate": np.nan, "DisbursementDate": "31-Mar-26",
    "DisbursementGross": "$120,000.00", "BalanceGross": "$0.00",
    "ChgOffPrinGr": "$0.00", "GrAppv": "$250,000.00", "SBA_Appv": "$120,000.00",
    "MIS_Status": "P I F",
}
SERVING_RAW = {
    "state": "CA", "bank_state": "CA", "naics_sector": "72",
    "term_months": 120, "no_emp": 8, "new_exist": "New",
    "create_job": 5, "retained_job": 3, "urban_rural": "1",
    "rev_line_cr": "N", "low_doc": "N",
    "gr_appv": 250000, "sba_appv": 120000, "franchise_code": 1,
}


def main():
    clean_df = run_01_cleaning(pd.DataFrame([RAW])[RAW_COLS_ORDER])
    feat_cols, _ = sc.get_feature_setup(clean_df)
    X_train, _ = sc.build_xy(clean_df, feat_cols, sc.get_feature_setup(clean_df)[1])
    X_serve = to_model_frame([engineer_features(SERVING_RAW)])

    missing = sorted(set(feat_cols) - set(SVC_FEATURES))
    extra = sorted(set(SVC_FEATURES) - set(feat_cols))
    print(f"training features: {len(feat_cols)}   serving features: {len(SVC_FEATURES)}")
    print(f"missing from serving: {missing}")
    print(f"extra in serving   : {extra}")

    shared = [c for c in feat_cols if c in set(SVC_FEATURES)]
    mismatches = [c for c in shared
                  if str(X_train.iloc[0][c]) != str(X_serve.iloc[0][c])]
    print(f"value mismatches   : {mismatches}")

    ok = not missing and not extra and not mismatches
    print("\nRESULT:", "ALIGNED — no training/serving skew" if ok else "SKEW DETECTED")


if __name__ == "__main__":
    main()
