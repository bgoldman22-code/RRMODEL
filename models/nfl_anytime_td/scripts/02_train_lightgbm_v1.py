#!/usr/bin/env python3
"""
NFL Anytime TD Model Training Script (v1.5)
============================================
Trains a LightGBM classifier to predict whether a player scores a TD.

Inputs
------
- models/nfl_anytime_td/data/player_td_core.csv  (produced by 01_collect_nflverse_data_v2.R)

Outputs
-------
- models/nfl_anytime_td/data/v1/lightgbm_v1.pkl
- models/nfl_anytime_td/data/v1/feature_list_v1.json
- models/nfl_anytime_td/data/v1.2/gate_config_v1.2.json

Author: NFL TD Model v1.5
Date: December 2025
"""

from __future__ import annotations

import json
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

try:
    import lightgbm as lgb
except ImportError:
    lgb = None

try:
    from sklearn.ensemble import GradientBoostingClassifier
except ImportError:
    GradientBoostingClassifier = None

# =====================================================================
# PATHS
# =====================================================================
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MODEL_OUT_DIR = DATA_DIR / "v1"
GATE_OUT_DIR = DATA_DIR / "v1.2"

# =====================================================================
# FEATURE DEFINITIONS (must match 14_live_picks_generator.py)
# =====================================================================
FEATURE_COLS = [
    "feat_is_rb",
    "feat_is_wr",
    "feat_is_te",
    "feat_is_qb",
    "feat_is_home",
    "feat_carries_L5",
    "feat_targets_L5",
    "feat_touches_L5",
    "feat_rz_touches_L5",
    "feat_rz_touches_i10_L5",
    "feat_rz_opp_share_L5",
    "feat_exp_plays_L5",
    "feat_snap_pct_L5",
    "feat_td_rate_L5",
    "feat_td_rate_L10",
]

TARGET_COL = "scored_td"


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Build feature matrix from player_td_core."""
    # Parse is_home
    if "is_home" in df.columns:
        if df["is_home"].dtype == object:
            df["is_home_bool"] = df["is_home"].map(
                {"TRUE": 1, "FALSE": 0, "True": 1, "False": 0, True: 1, False: 0}
            ).fillna(0)
        else:
            df["is_home_bool"] = df["is_home"].fillna(0)
    else:
        df["is_home_bool"] = 0

    feature_map = {
        "feat_is_rb": lambda d: (d["position"] == "RB").astype(float),
        "feat_is_wr": lambda d: (d["position"] == "WR").astype(float),
        "feat_is_te": lambda d: (d["position"] == "TE").astype(float),
        "feat_is_qb": lambda d: (d["position"] == "QB").astype(float),
        "feat_is_home": lambda d: d["is_home_bool"].astype(float),
        "feat_carries_L5": lambda d: d.get("use_carries_L5", pd.Series(0, index=d.index)).fillna(0),
        "feat_targets_L5": lambda d: d.get("use_targets_L5", pd.Series(0, index=d.index)).fillna(0),
        "feat_touches_L5": lambda d: d.get("use_touches_L5", pd.Series(0, index=d.index)).fillna(0),
        "feat_rz_touches_L5": lambda d: d.get("rz_touches_L5", pd.Series(0, index=d.index)).fillna(0),
        "feat_rz_touches_i10_L5": lambda d: d.get("rz_touches_inside10_L5", pd.Series(0, index=d.index)).fillna(0),
        "feat_rz_opp_share_L5": lambda d: d.get("rz_opportunity_share_L5", pd.Series(0, index=d.index)).fillna(0),
        "feat_exp_plays_L5": lambda d: d.get("use_explosive_plays_L5", pd.Series(0, index=d.index)).fillna(0),
        "feat_snap_pct_L5": lambda d: d.get("snap_offense_pct_L5", pd.Series(0, index=d.index)).fillna(0),
        "feat_td_rate_L5": lambda d: d.get("ply_scored_td_L5", pd.Series(0, index=d.index)).fillna(0),
        "feat_td_rate_L10": lambda d: d.get("ply_scored_td_L10", pd.Series(0, index=d.index)).fillna(0),
    }

    X = pd.DataFrame(index=df.index)
    for feat in FEATURE_COLS:
        if feat in feature_map:
            X[feat] = feature_map[feat](df)
        elif feat in df.columns:
            X[feat] = df[feat].fillna(0)
        else:
            X[feat] = 0.0

    return X


def load_data() -> pd.DataFrame:
    """Load and minimally clean the player_td_core.csv."""
    csv_path = DATA_DIR / "player_td_core.csv"
    if not csv_path.exists():
        raise FileNotFoundError(
            f"Missing feature file: {csv_path}. Run the R script (01_collect_nflverse_data_v2.R) first."
        )
    df = pd.read_csv(csv_path)
    print(f"📂 Loaded {len(df):,} rows from player_td_core.csv")

    # Ensure target column exists
    if TARGET_COL not in df.columns:
        # Fallback: if we have 'ply_any_td' or similar
        if "ply_any_td" in df.columns:
            df[TARGET_COL] = (df["ply_any_td"] > 0).astype(int)
        else:
            raise ValueError(f"Target column '{TARGET_COL}' not found in data.")

    return df


def train_model(X: pd.DataFrame, y: pd.Series):
    """Train LightGBM (or sklearn fallback) classifier."""
    if lgb is not None:
        print("🚀 Training LightGBM classifier...")
        params = {
            "objective": "binary",
            "metric": "auc",
            "boosting_type": "gbdt",
            "num_leaves": 31,
            "learning_rate": 0.05,
            "feature_fraction": 0.8,
            "bagging_fraction": 0.8,
            "bagging_freq": 5,
            "verbose": -1,
            "n_estimators": 200,
            "random_state": 42,
        }
        model = lgb.LGBMClassifier(**params)
        model.fit(X, y)
    elif GradientBoostingClassifier is not None:
        print("🚀 LightGBM not available. Training sklearn GradientBoostingClassifier...")
        model = GradientBoostingClassifier(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=5,
            random_state=42,
        )
        model.fit(X, y)
    else:
        raise ImportError("Neither lightgbm nor sklearn is installed.")

    return model


def save_artifacts(model, features: list[str]) -> None:
    """Persist model, feature list, and gate config."""
    MODEL_OUT_DIR.mkdir(parents=True, exist_ok=True)
    GATE_OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Model pickle
    model_path = MODEL_OUT_DIR / "lightgbm_v1.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    print(f"✅ Saved model: {model_path}")

    # Feature list
    features_path = MODEL_OUT_DIR / "feature_list_v1.json"
    with open(features_path, "w") as f:
        json.dump({"features": features}, f, indent=2)
    print(f"✅ Saved features: {features_path}")

    # Gate config (thresholds used by profitable strategy logic)
    gate_config = {
        "version": "1.2",
        "description": "Gate thresholds for profitable strategies",
        "thresholds": {
            "tier1_edge_pct": 0.07,
            "tier1_3pct_longshots_min_odds": 400,
            "tier1_cap_deep_min_odds": 300,
            "tier2_edge_pct": 0.05,
            "tier2_5pct_cap_min_odds": 200,
            "tier2_10pct_min_prob": 0.10,
            "kelly_fraction": 0.25,
            "max_kelly_raw": 0.10,
        },
        "notes": "Auto-generated by 02_train_lightgbm_v1.py",
    }
    gate_path = GATE_OUT_DIR / "gate_config_v1.2.json"
    with open(gate_path, "w") as f:
        json.dump(gate_config, f, indent=2)
    print(f"✅ Saved gate config: {gate_path}")


def main() -> None:
    print("=" * 60)
    print("NFL Anytime TD Model Training (v1.5)")
    print("=" * 60)

    df = load_data()
    X = build_features(df)
    y = df[TARGET_COL].astype(int)

    print(f"📊 Features: {list(X.columns)}")
    print(f"📊 Samples: {len(X):,}  |  Positive rate: {y.mean():.2%}")

    model = train_model(X, y)

    # Quick eval
    preds = model.predict_proba(X)[:, 1]
    from sklearn.metrics import roc_auc_score

    auc = roc_auc_score(y, preds)
    print(f"📈 Training AUC: {auc:.4f}")

    save_artifacts(model, list(X.columns))

    print("\n🎉 Training complete! Artifacts saved to:")
    print(f"   {MODEL_OUT_DIR}")
    print(f"   {GATE_OUT_DIR}")


if __name__ == "__main__":
    main()
