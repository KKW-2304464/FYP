"""
01_clean_sba.py —— Cleaning SBAnational, Outputing data/sba_clean.parquet

Perform only cleaning and feature extraction; do not perform imputation or plotting. Output Parquet with missing values.

File location:scripts/01_clean_sba.py
Run: Execute in the project root directory  - python scripts/01_clean_sba.py
"""

import numpy as np
import pandas as pd
from sba_common import RAW_CSV, CLEAN_PARQUET

# Pre-approval scoring scenario => Remove DisbursementGross (scenario/time leak,
#different from ChgOffPrinGr/BalanceGross, which unconditionally leak results that should be deleted).
# If changing to "predicting default after loan disbursement", setting this to False will retain it.
PRE_APPROVAL_FRAMING = True

DTYPE_OVERRIDES = {
    "NAICS": "string", "Zip": "string", "FranchiseCode": "string",
    "RevLineCr": "string", "LowDoc": "string", "NewExist": "string", "UrbanRural": "string",
}

df = pd.read_csv(RAW_CSV, dtype=DTYPE_OVERRIDES)

# ---------- target variable ----------
df = df[df["MIS_Status"].notna()].copy()
status = df["MIS_Status"].astype(str).str.strip().str.upper()
df["is_default"] = status.map({"P I F": 0, "PIF": 0, "CHGOFF": 1})
df = df[df["is_default"].notna()].copy()
df["is_default"] = df["is_default"].astype(int)

# ---------- Discard columns ----------
LEAK = ["MIS_Status", "ChgOffDate", "ChgOffPrinGr", "BalanceGross"]   # Results leak (unconditionally dropped)
ID_COLS = ["LoanNr_ChkDgt", "Name", "City", "Zip", "Bank"]            # Identifier/High-cardinality text
DATE_COLS = ["ApprovalDate", "DisbursementDate"]                     # Original date strings

DROP = LEAK + ID_COLS + DATE_COLS
if PRE_APPROVAL_FRAMING:
    DROP.append("DisbursementGross")                                # <- Pre-approval scenario only

df.drop(columns=[c for c in DROP if c in df.columns], inplace=True)

# ---------- Amount Cleaning ----------
# Assumption (Pre-approval Scoring): The dataset does not have a "Application Amount" column; GrAppv (Bank Approved Amount) is used as a proxy for the application amount.
# Assumption: Approved Amount ≈ Application Amount. SBA_Appv and sba_guar_ratio share this assumption. This must be stated in the report.
def clean_money(s):
    return pd.to_numeric(
        s.astype(str).str.replace("$", "", regex=False)
                     .str.replace(",", "", regex=False).str.strip(),
        errors="coerce")

for col in ["DisbursementGross", "GrAppv", "SBA_Appv"]:
    if col in df.columns:
        df[col] = clean_money(df[col])

# ---------- Standardization of dirty labels ----------
def norm_yn(s):
    x = s.astype(str).str.strip().str.upper()
    return x.where(x.isin(["Y", "N"]), "Unknown")

if "RevLineCr" in df.columns:
    df["RevLineCr"] = norm_yn(df["RevLineCr"])
if "LowDoc" in df.columns:
    df["LowDoc"] = norm_yn(df["LowDoc"])
if "NewExist" in df.columns:
    df["NewExist"] = df["NewExist"].astype(str).str.strip().map(
        {"1": "Existing", "2": "New"}).fillna("Unknown")

# ---------- Feature Engineering ----------
df["naics_sector"] = (
    pd.to_numeric(df["NAICS"], errors="coerce").floordiv(10000).astype("Int64").astype(str))
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

# ---------- Type Standardization Before Writing ----------
# Use regular object strings for writing, **do not** use pandas 'string' extension type:
# The latter will write a Python extension type in parquet, and some pyarrow / Python versions
# (e.g., 3.14) will fail to find this extension type when reading back, causing an ArrowKeyError.
# Converting to object + using None for missing values is the most stable approach.
for c in df.select_dtypes(include=["object", "string"]).columns:
    s = df[c].astype("object")
    df[c] = s.where(s.notna(), None)

# Confirm that the leaked columns are indeed removed from the final features (should be False)
print("DisbursementGross in final features?", "DisbursementGross" in df.columns)

CLEAN_PARQUET.parent.mkdir(parents=True, exist_ok=True)
df.to_parquet(CLEAN_PARQUET)
print(f"saved {df.shape[0]} rows x {df.shape[1]} cols -> {CLEAN_PARQUET}")
print("default rate:", round(float(df["is_default"].mean()), 4))