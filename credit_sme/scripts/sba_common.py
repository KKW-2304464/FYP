"""
sba_common.py —— 项目共享模块（parquet 版）

整条数据管线只在这里定义一次，所有脚本和 notebook 都 import 它：
- 单一真相：清洗/划分/编码逻辑只有一份。
- 公平对比：所有模型吃完全相同的划分与预处理。

放置位置：scripts/sba_common.py
"""

from pathlib import Path
import numpy as np
import pandas as pd

# ---- 路径锚定到项目根 -----------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"

RAW_CSV = DATA_DIR / "SBAnational.csv"
CLEAN_PARQUET = DATA_DIR / "sba_clean.parquet"
WINNER_FILE = REPORTS_DIR / "winner.txt"

MODEL_NAMES = ["logistic", "catboost", "lightgbm", "xgboost"]

# ---- 建模配置 -------------------------------------------------------------
TARGET = "is_default"
DROP_FROM_FEATURES = [TARGET, "ApprovalFY", "end_year", "FranchiseCode"]

# 显式声明类别特征（按列名，不靠 dtype 猜）：parquet 往返后文本列的 dtype 可能
# 在某些 pandas/pyarrow 版本下变形，导致自动推断漏掉它们、被当成数值列而报错。
# 写死列名最稳，也最清楚。这里以外的特征一律按数值处理。
CATEGORICAL_COLS = [
    "State", "BankState", "NewExist", "UrbanRural",
    "RevLineCr", "LowDoc", "naics_sector",
    "is_franchise", "same_state_bank", "recession_0709",
]

VAL_QUANTILE = 0.70
TEST_QUANTILE = 0.85


# ---- 产物路径 -------------------------------------------------------------
def model_path(name: str) -> Path:
    return MODELS_DIR / f"{name}.joblib"

def preds_path(name: str) -> Path:
    return REPORTS_DIR / f"preds_{name}.parquet"


# ---- 清洗数据 IO ----------------------------------------------------------
def load_clean(path: Path = CLEAN_PARQUET) -> pd.DataFrame:
    df = pd.read_parquet(path)
    df = df[df["ApprovalFY"].notna()].copy()
    return df


# ---- 数据管线 -------------------------------------------------------------
def temporal_split(df, val_q=VAL_QUANTILE, test_q=TEST_QUANTILE, verbose=True):
    val_cut = int(df["ApprovalFY"].quantile(val_q))
    test_cut = int(df["ApprovalFY"].quantile(test_q))
    train = df[df["ApprovalFY"] < val_cut].copy()
    val = df[(df["ApprovalFY"] >= val_cut) & (df["ApprovalFY"] < test_cut)].copy()
    test = df[df["ApprovalFY"] >= test_cut].copy()
    if verbose:
        print(f"cutoffs -> train < {val_cut} | val {val_cut}-{test_cut - 1} | test >= {test_cut}")
        for nm, part in [("train", train), ("val", val), ("test", test)]:
            print(f"{nm:5s}: {len(part):>7d} rows | default rate = {part[TARGET].mean():.4f}")
    return train, val, test


def get_feature_setup(df):
    """返回 (feature_cols, cat_features)。类别列按 CATEGORICAL_COLS 显式指定。"""
    feature_cols = [c for c in df.columns if c not in DROP_FROM_FEATURES]
    cat_features = [c for c in feature_cols if c in CATEGORICAL_COLS]
    return feature_cols, cat_features


def build_xy(part, feature_cols, cat_features):
    """类别列统一转成字符串、NaN 填 'missing'（无泄露）；数值列保留原样。"""
    X = part[feature_cols].copy()
    for c in cat_features:
        X[c] = X[c].fillna("missing").astype(str)
    # 数值特征保险起见强制转数值（防 parquet 往返把数值列读成 object）
    for c in feature_cols:
        if c not in cat_features:
            X[c] = pd.to_numeric(X[c], errors="coerce")
    y = part[TARGET].astype(int)
    return X, y


def to_category(parts, cols):
    """用统一类别全集给所有划分编码（只枚举标签，不碰目标，无泄露）。"""
    out = [p.copy() for p in parts]
    for c in cols:
        universe = sorted(set().union(*[set(p[c].unique()) for p in out]))
        dt = pd.CategoricalDtype(categories=universe)
        for p in out:
            p[c] = p[c].astype(dt)
    return out


# ---- 预测缓存 -------------------------------------------------------------
def save_predictions(name, y_true, proba):
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"y_true": np.asarray(y_true), "proba": np.asarray(proba)}).to_parquet(preds_path(name))

def load_predictions(name) -> pd.DataFrame:
    return pd.read_parquet(preds_path(name))


# ---- 放款决策口径 ---------------------------------------------------------
def decision_report(y_true, proba, threshold: float) -> dict:
    y_true = np.asarray(y_true)
    approve = proba < threshold
    n = len(y_true)
    n_app = int(approve.sum())
    defaults = y_true == 1
    bad_rate_approved = float(y_true[approve].mean()) if n_app > 0 else float("nan")
    default_recall = (float((defaults & ~approve).sum() / defaults.sum())
                      if defaults.sum() > 0 else float("nan"))
    return {"threshold": threshold, "approval_rate": n_app / n,
            "bad_rate_approved": bad_rate_approved, "default_recall": default_recall}