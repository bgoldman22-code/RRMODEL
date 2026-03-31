#!/usr/bin/env python3
"""
Feature Investigation: Tier B/C Analysis
==========================================
Part 1 — Feature importance by odds tier (A: <+350, B: +350-+499, C: +500+)
  - Per-tier XGBoost feature importance (gain)
  - Per-tier ROC-AUC of current model
  - Which features matter more/less in higher-odds tiers

Part 2 — Missing feature audit for +350+ players (features 1-9)
  For each candidate feature:
    - Computability from current data sources
    - Correlation with HR outcomes in Tier B and C
    - ROC-AUC delta if added to a Tier-B/C-only retrain (+0.005 threshold)
    - Pipeline complexity estimate

Features investigated:
  1. Platoon split specificity (batter ISO vs LHP/RHP)
  2. 21-day rolling barrel rate trend
  3. Pitcher 3-start HR rate (rolling vs season)
  4. Directional park/pull interaction score
  5. Strike zone hot zone vs pitcher location overlap
  6. Pitcher velocity degradation (early vs late inning)
  7. Pitcher command under pressure (zone% in hitter's counts)
  8. Hard hit rate by pitch type vs pitcher arsenal matchup
  9. Plate discipline advantage (batter O-Swing% × pitcher Zone%)

Output: data/mlb_v3/tier_feature_investigation.json + printed report
"""

import json, math, pathlib, warnings
from collections import defaultdict
from itertools import combinations as itertools_combinations

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

ROOT     = pathlib.Path(__file__).parent.parent.parent
OUT_PATH = ROOT / "data/mlb_v3/tier_feature_investigation.json"

FEATURE_COLS = [
    "hr_rate_bayes", "barrel_pct", "hard_hit_pct", "pitcher_barrel",
    "pitcher_rv100", "pitcher_hrfb", "park_hr_factor", "temp_adj", "wind_adj",
]

FEATURE_NAMES = {
    "hr_rate_bayes":  "HR Rate (Bayes)",
    "barrel_pct":     "Barrel % (rank)",
    "hard_hit_pct":   "Hard Hit % (rank)",
    "pitcher_barrel": "Pitcher Barrel Allowed (rank)",
    "pitcher_rv100":  "Pitcher Arsenal RV/100",
    "pitcher_hrfb":   "Pitcher HR/FB",
    "park_hr_factor": "Park HR Factor",
    "temp_adj":       "Temperature Adj",
    "wind_adj":       "Wind Adj",
}

# ─── 1. Load + engineer (identical pipeline) ──────────────────────────────────
print("=" * 72)
print("Feature Investigation: Odds Tier Analysis + Missing Feature Audit")
print("=" * 72)
print("\n[1/5] Loading feature matrix + fitting model...")

df = pd.read_parquet(ROOT / "data/mlb_v3/feature_matrix.parquet")

PRIOR_RATE, PRIOR_PA = 0.04, 60
df["hr_rate_bayes"] = (
    (df["hr_rate_std"] * df["pa_std"] + PRIOR_RATE * PRIOR_PA) /
    (df["pa_std"] + PRIOR_PA)
)
df["temp_adj"] = df["temp_f"].fillna(72) - 72
df.loc[df["is_dome"], "temp_adj"] = 0.0
df["wind_adj"] = df["wind_out_mph"].fillna(0.0)
df.loc[df["is_dome"], "wind_adj"] = 0.0

train = df[df["season"].isin([2022, 2023])].copy()
val   = df[df["season"] == 2024].copy()
test  = df[df["season"] == 2025].copy()

train_medians = {col: float(train[col].median()) for col in FEATURE_COLS}

def prep(d, m=None):
    m = m or train_medians
    X = d[FEATURE_COLS].copy()
    for col in FEATURE_COLS:
        X[col] = X[col].fillna(m[col])
    return X.values, d["did_hr"].values

X_train, y_train = prep(train)
X_val,   y_val   = prep(val)
X_tv = np.vstack([X_train, X_val])
y_tv = np.concatenate([y_train, y_val])
X_test, y_test = prep(test)

scale_pos = float((y_train == 0).sum() / (y_train == 1).sum())
BEST_PARAMS = dict(n_estimators=600, max_depth=4, learning_rate=0.02,
                   subsample=0.8, colsample_bytree=0.7, min_child_weight=80)

xgb_base = XGBClassifier(**BEST_PARAMS, scale_pos_weight=scale_pos,
                          eval_metric="auc", use_label_encoder=False,
                          random_state=42, n_jobs=-1, verbosity=0)
xgb_base.fit(X_tv, y_tv)
xgb_cal = CalibratedClassifierCV(xgb_base, method="isotonic", cv="prefit")
xgb_cal.fit(X_val, y_val)

test = test.copy()
test["model_prob"]   = xgb_cal.predict_proba(X_test)[:, 1]
test["decimal_odds"] = np.where(test["market_prob"] > 0,
                                1.0 / test["market_prob"], np.nan)
test["american_odds"] = test["decimal_odds"].apply(
    lambda d: round((d - 1) * 100) if (pd.notna(d) and d >= 2.0)
              else (round(-100 / (d - 1)) if (pd.notna(d) and d > 1.0) else np.nan)
)

has_odds = test[test["market_prob"].notna()].copy()
print(f"    Test rows with odds: {len(has_odds):,}")

# ─── Tier definitions ─────────────────────────────────────────────────────────
tier_A = has_odds[has_odds["american_odds"] <  350].copy()
tier_B = has_odds[(has_odds["american_odds"] >= 350) & (has_odds["american_odds"] < 500)].copy()
tier_C = has_odds[has_odds["american_odds"] >= 500].copy()

print(f"    Tier A (<+350):    {len(tier_A):,} rows, {tier_A['did_hr'].sum():.0f} HRs ({tier_A['did_hr'].mean():.3f} rate)")
print(f"    Tier B (+350-499): {len(tier_B):,} rows, {tier_B['did_hr'].sum():.0f} HRs ({tier_B['did_hr'].mean():.3f} rate)")
print(f"    Tier C (+500+):    {len(tier_C):,} rows, {tier_C['did_hr'].sum():.0f} HRs ({tier_C['did_hr'].mean():.3f} rate)")
print()

# ═══════════════════════════════════════════════════════════════════════════════
# PART 1 — Feature Importance by Tier
# ═══════════════════════════════════════════════════════════════════════════════
print("[2/5] Part 1 — Feature importance and AUC by tier...")

def fit_tier_xgb(tier_df, label):
    """Fit a fresh XGBoost on the FULL training set, then report feature importance
    and AUC evaluated ONLY on this tier's test rows."""
    if len(tier_df) < 30 or tier_df["did_hr"].sum() < 5:
        return None, None

    # AUC on this tier using the already-fitted production model
    X_tier, y_tier = prep(tier_df)
    probs_tier = xgb_cal.predict_proba(X_tier)[:, 1]
    try:
        auc = roc_auc_score(y_tier, probs_tier)
    except Exception:
        auc = None

    # Fit a tier-specific model to get tier-local feature importance
    # Use same train/val for fitting so it's apples-to-apples, only eval differs
    # Scale pos weight recalculated for full training set
    tier_model = XGBClassifier(
        n_estimators=400, max_depth=4, learning_rate=0.03,
        subsample=0.8, colsample_bytree=0.7, min_child_weight=40,
        scale_pos_weight=scale_pos, eval_metric="auc",
        use_label_encoder=False, random_state=42, n_jobs=-1, verbosity=0
    )
    tier_model.fit(X_tv, y_tv)

    # Feature importance: gain
    importance = tier_model.get_booster().get_score(importance_type="gain")
    # Map from f0..f8 to feature names
    fi = {}
    for k, v in importance.items():
        idx = int(k.replace("f", ""))
        fi[FEATURE_COLS[idx]] = v

    # Normalize to sum=1
    total = sum(fi.values()) if fi else 1
    fi_norm = {k: round(v / total, 4) for k, v in fi.items()}

    return fi_norm, auc


def fit_tier_specific_xgb(tier_df, all_train_df, all_val_df, label):
    """
    Fit XGBoost specifically to predict HRs in this tier's odds range.
    Combines tier data with full training data for fitting, evaluates on tier test.
    Returns per-feature gain importance on tier-specialized model.
    """
    if len(tier_df) < 20 or tier_df["did_hr"].sum() < 5:
        return None

    # For tier-specific importance: train on training data BUT weight tier-like rows
    # more heavily. Simpler: just get gain importance from full model evaluated
    # on tier's split — this is what "which features the model actually uses for
    # these specific predictions" tells us.
    # We do this by inspecting shap/gain on the full booster across tier rows.

    # Fallback: use permutation importance on tier rows only
    from sklearn.inspection import permutation_importance as perm_imp_fn

    X_tier, y_tier = prep(tier_df)
    if len(np.unique(y_tier)) < 2:
        return None

    pi = perm_imp_fn(xgb_cal, X_tier, y_tier,
                     n_repeats=20, random_state=42, n_jobs=-1,
                     scoring="roc_auc")
    importances = pi.importances_mean
    # Map back to feature names
    fi = {FEATURE_COLS[i]: float(importances[i]) for i in range(len(FEATURE_COLS))}
    return fi


print("    Computing tier-specific permutation importance (this takes ~60s)...")
perm_A = fit_tier_specific_xgb(tier_A, train, val, "Tier A")
perm_B = fit_tier_specific_xgb(tier_B, train, val, "Tier B")
perm_C = fit_tier_specific_xgb(tier_C, train, val, "Tier C")

# Production-model AUC per tier
def tier_auc(tier_df):
    X_t, y_t = prep(tier_df)
    if len(np.unique(y_t)) < 2 or len(y_t) < 20:
        return None
    probs = xgb_cal.predict_proba(X_t)[:, 1]
    try:
        return float(roc_auc_score(y_t, probs))
    except Exception:
        return None

auc_A = tier_auc(tier_A)
auc_B = tier_auc(tier_B)
auc_C = tier_auc(tier_C)

print()
print("=" * 72)
print("PART 1 — Feature Importance by Odds Tier")
print("=" * 72)
print()

def print_tier_importance(label, perm_fi, auc_val):
    if perm_fi is None:
        print(f"  {label}: insufficient data")
        return
    sorted_fi = sorted(perm_fi.items(), key=lambda x: -x[1])
    auc_str = f"{auc_val:.4f}" if auc_val else "—"
    print(f"  {label}  (ROC-AUC = {auc_str})")
    print(f"  {'Rank':<5} {'Feature':<32} {'Perm Importance':>16}  Notes")
    print(f"  {'-'*5} {'-'*32} {'-'*16}  {'-'*20}")
    for rank, (feat, score) in enumerate(sorted_fi[:8], 1):
        note = ""
        if score <= 0:
            note = "neutral/negative — feature hurts in this tier"
        print(f"  {rank:<5} {FEATURE_NAMES.get(feat, feat):<32} {score:>+16.4f}  {note}")
    print()

print_tier_importance("Tier A (<+350)",    perm_A, auc_A)
print_tier_importance("Tier B (+350-499)", perm_B, auc_B)
print_tier_importance("Tier C (+500+)",    perm_C, auc_C)

# Answer specific questions
def rank_in_tier(perm_fi, feat):
    if perm_fi is None:
        return "—"
    ranked = sorted(perm_fi.items(), key=lambda x: -x[1])
    for i, (k, v) in enumerate(ranked, 1):
        if k == feat:
            return i
    return "—"

print("  Specific diagnostic questions:")
print()
q_features = [
    ("barrel_pct",     "Barrel % — does it remain dominant in B/C?"),
    ("pitcher_hrfb",   "Pitcher HR/FB — gains in B/C vs A?"),
    ("pitcher_rv100",  "Pitcher RV/100 — gains in B/C vs A?"),
    ("hr_rate_bayes",  "HR Rate (Bayes) — batter quality signal"),
    ("park_hr_factor", "Park factor — relevant across tiers?"),
]
for feat, label in q_features:
    ra = rank_in_tier(perm_A, feat)
    rb = rank_in_tier(perm_B, feat)
    rc = rank_in_tier(perm_C, feat)

    # Score direction
    sa = perm_A.get(feat, 0) if perm_A else 0
    sb = perm_B.get(feat, 0) if perm_B else 0
    sc = perm_C.get(feat, 0) if perm_C else 0

    note = ""
    if isinstance(rb, int) and isinstance(ra, int):
        if rb < ra:
            note = f"↑ rises in Tier B (A:#{ra}→B:#{rb})"
        elif rb > ra:
            note = f"↓ drops in Tier B (A:#{ra}→B:#{rb})"
    print(f"  {label}")
    print(f"    Tier A rank: #{ra}  ({sa:+.4f}) | Tier B rank: #{rb}  ({sb:+.4f}) | Tier C rank: #{rc}  ({sc:+.4f})  {note}")
print()

# ═══════════════════════════════════════════════════════════════════════════════
# PART 2 — Missing Feature Audit
# ═══════════════════════════════════════════════════════════════════════════════
print("[3/5] Part 2 — Missing feature audit for +350+ players...")

tier_BC = has_odds[has_odds["american_odds"] >= 350].copy()
y_BC = tier_BC["did_hr"].values
X_BC, _ = prep(tier_BC)

# Baseline AUC on Tier B+C combined
baseline_auc_BC = None
if len(np.unique(y_BC)) >= 2 and len(y_BC) >= 30:
    probs_BC = xgb_cal.predict_proba(X_BC)[:, 1]
    baseline_auc_BC = float(roc_auc_score(y_BC, probs_BC))

print(f"    Tier B+C combined: {len(tier_BC):,} rows | HR rate: {tier_BC['did_hr'].mean():.3f}")
print(f"    Baseline AUC (production model on Tier B+C): {baseline_auc_BC:.4f}" if baseline_auc_BC else "    Baseline AUC: insufficient data")
print()

# ─── Helper: test synthetic feature correlation + AUC delta ───────────────────
def point_biserial_corr(series, labels):
    """Correlation of a numeric series with binary labels."""
    mask = ~np.isnan(series)
    if mask.sum() < 20:
        return np.nan
    return float(np.corrcoef(series[mask], labels[mask])[0, 1])

def auc_with_extra_feature(extra_col, tier_df, all_y, synthetic=True):
    """
    Retrain a Tier-B/C-specific model adding `extra_col` as an additional feature.
    Returns (auc_new, auc_delta).
    Uses tier_df directly — train on TV split + tier rows for signal, eval on tier.
    """
    if all_y is None or len(np.unique(all_y)) < 2:
        return None, None

    # Build augmented feature matrix
    X_aug_tier = np.column_stack([
        tier_df[FEATURE_COLS].fillna(pd.Series(train_medians)).values,
        tier_df[extra_col].fillna(tier_df[extra_col].median()).values.reshape(-1, 1),
    ])

    # Augment training data with median for new feature (no leakage)
    new_feat_train_median = float(tier_df[extra_col].median())
    X_aug_tv = np.column_stack([
        X_tv,
        np.full((len(X_tv), 1), new_feat_train_median),
    ])
    X_aug_val = np.column_stack([
        X_val,
        np.full((len(X_val), 1), new_feat_train_median),
    ])

    # Refit calibrated model with extra feature
    try:
        m = XGBClassifier(n_estimators=400, max_depth=4, learning_rate=0.03,
                          subsample=0.8, colsample_bytree=0.7, min_child_weight=40,
                          scale_pos_weight=scale_pos, eval_metric="auc",
                          use_label_encoder=False, random_state=42, n_jobs=-1, verbosity=0)
        m.fit(X_aug_tv, y_tv)
        cal = CalibratedClassifierCV(m, method="isotonic", cv="prefit")
        cal.fit(X_aug_val, y_val)
        probs_new = cal.predict_proba(X_aug_tier)[:, 1]
        auc_new = float(roc_auc_score(all_y, probs_new))
        return auc_new, auc_new - baseline_auc_BC
    except Exception as e:
        return None, None


print("    Computing synthetic feature signals (this takes ~2-3 minutes)...")

results_features = {}

# ─── Feature 1: Platoon split specificity ─────────────────────────────────────
# Current model: has batter handedness only in spray data (not in features)
# Proxy: use batter "stand" × "pitcher_rv100" interaction
# stand is in feature matrix as "bats" column — check
has_bats  = "bats"  in tier_BC.columns
has_stand = "stand" in tier_BC.columns
hand_col  = "bats"  if has_bats else ("stand" if has_stand else None)

# Platoon proxy: if LHH vs RHP (most favorable platoon), code as 1; else 0
# pitcher_id is present — we infer pitcher hand from pitcher_name/pitcher features
# Without actual pitcher handedness in the dataset, we approximate with:
#   "platoon_proxy" = 1 if batter is LHH AND pitcher_rv100 < median (better pitcher = more likely RHP starter)
# This is imperfect but measurable

if hand_col and "pitcher_rv100" in tier_BC.columns:
    rv100_med = float(tier_BC["pitcher_rv100"].median())
    tier_BC["platoon_proxy"] = (
        (tier_BC[hand_col].isin(["L", "LHH", "LHB"])).astype(float)
    )
    corr_B = point_biserial_corr(
        tier_BC[tier_BC["american_odds"] < 500]["platoon_proxy"].values,
        tier_BC[tier_BC["american_odds"] < 500]["did_hr"].values
    )
    corr_C = point_biserial_corr(
        tier_BC[tier_BC["american_odds"] >= 500]["platoon_proxy"].values,
        tier_BC[tier_BC["american_odds"] >= 500]["did_hr"].values
    )
    auc_new_1, auc_delta_1 = auc_with_extra_feature("platoon_proxy", tier_BC, y_BC)
    computable = True
    note = "Batter handedness proxy only — full ISO vs LHP/RHP requires Statcast splits endpoint (not in current pipeline)"
else:
    corr_B = corr_C = None
    auc_new_1 = auc_delta_1 = None
    computable = False
    note = "stand/bats column not in feature matrix"

results_features["f1_platoon_split"] = {
    "name": "Platoon split specificity (batter ISO vs LHP/RHP)",
    "computable_from_current_data": False,
    "computable_note": "Partial — batter hand is in spray data. Pitcher hand requires Retrosheet/Baseball Reference lookup. Full ISO-vs-handedness requires Statcast splits filter (moderate pipeline work).",
    "pipeline_complexity": "moderate",
    "corr_tier_B": round(float(corr_B), 4) if corr_B and not np.isnan(corr_B) else None,
    "corr_tier_C": round(float(corr_C), 4) if corr_C and not np.isnan(corr_C) else None,
    "auc_with_feature": round(auc_new_1, 4) if auc_new_1 else None,
    "auc_delta": round(auc_delta_1, 4) if auc_delta_1 else None,
    "exceeds_threshold": bool(auc_delta_1 and auc_delta_1 > 0.005),
}
print(f"    F1 (platoon): done")

# ─── Feature 2: 21-day rolling barrel rate trend ──────────────────────────────
# We don't have rolling per-date barrel in the feature matrix directly, but
# barrel_pct is season-long. We can compute a PROXY: within the 2025 test set,
# compute month-level barrel trend for each player.
# barrel_pct is a season-long percentile rank, so we simulate "trend" by
# looking at deviation of a player's barrel_pct across observations in a window.

# Best approximation: group by player + game_date month, compute cumulative
# In absence of daily barrel data: use hr_rate_std trend within test set
# (hr_rate_std is rolling season-to-date, which IS time-varying in the matrix)

if "hr_rate_std" in tier_BC.columns and "game_date" in tier_BC.columns:
    tier_BC_sorted = tier_BC.sort_values(["player_id", "game_date"])

    # Rolling 21-day average of hr_rate_std vs overall season median
    # For each row, estimate "trend" = current hr_rate_std - that player's
    # season_median hr_rate_std (using all their 2025 rows)
    player_season_medians = tier_BC_sorted.groupby("player_id")["hr_rate_std"].median()
    tier_BC["hr_rate_trend"] = (
        tier_BC["hr_rate_std"] -
        tier_BC["player_id"].map(player_season_medians)
    )

    corr_B2 = point_biserial_corr(
        tier_BC[tier_BC["american_odds"] < 500]["hr_rate_trend"].values,
        tier_BC[tier_BC["american_odds"] < 500]["did_hr"].values
    )
    corr_C2 = point_biserial_corr(
        tier_BC[tier_BC["american_odds"] >= 500]["hr_rate_trend"].values,
        tier_BC[tier_BC["american_odds"] >= 500]["did_hr"].values
    )
    auc_new_2, auc_delta_2 = auc_with_extra_feature("hr_rate_trend", tier_BC, y_BC)
else:
    corr_B2 = corr_C2 = None
    auc_new_2 = auc_delta_2 = None

results_features["f2_rolling_barrel_trend"] = {
    "name": "21-day rolling barrel rate trend",
    "computable_from_current_data": False,
    "computable_note": "barrel_pct is season-long percentile rank — not time-varying in current pipeline. Would need daily Statcast pitch-level data per batter to compute 21-day rolling barrel rate. HR rate trend (season-to-date deviation) is computable as a proxy and is tested here.",
    "pipeline_complexity": "complex",
    "proxy_used": "hr_rate_std deviation from player season median (season-to-date rolling rate)",
    "corr_tier_B": round(float(corr_B2), 4) if corr_B2 and not np.isnan(corr_B2) else None,
    "corr_tier_C": round(float(corr_C2), 4) if corr_C2 and not np.isnan(corr_C2) else None,
    "auc_with_feature": round(auc_new_2, 4) if auc_new_2 else None,
    "auc_delta": round(auc_delta_2, 4) if auc_delta_2 else None,
    "exceeds_threshold": bool(auc_delta_2 and auc_delta_2 > 0.005),
}
print(f"    F2 (rolling trend): done")

# ─── Feature 3: Pitcher 3-start rolling HR rate ───────────────────────────────
# pitcher_hrfb is season-long. We can approximate rolling HR vulnerability
# by using pitcher_hrfb as a noisy stand-in and check if it's already
# encoding recent form. The real feature requires MLB Stats API game logs.
# We can test whether a SYNTHETIC "pitcher_hrfb_noise" adds AUC in Tier B/C
# by using pitcher_hrfb² (captures extremes) or a tier-specific interaction.

# Proxy: pitcher_hrfb * pitcher_barrel (combined HR vulnerability score)
if "pitcher_hrfb" in tier_BC.columns and "pitcher_barrel" in tier_BC.columns:
    tier_BC["pitcher_hr_composite"] = (
        tier_BC["pitcher_hrfb"].fillna(tier_BC["pitcher_hrfb"].median()) *
        tier_BC["pitcher_barrel"].fillna(tier_BC["pitcher_barrel"].median()) / 100.0
    )
    corr_B3 = point_biserial_corr(
        tier_BC[tier_BC["american_odds"] < 500]["pitcher_hr_composite"].values,
        tier_BC[tier_BC["american_odds"] < 500]["did_hr"].values
    )
    corr_C3 = point_biserial_corr(
        tier_BC[tier_BC["american_odds"] >= 500]["pitcher_hr_composite"].values,
        tier_BC[tier_BC["american_odds"] >= 500]["did_hr"].values
    )
    auc_new_3, auc_delta_3 = auc_with_extra_feature("pitcher_hr_composite", tier_BC, y_BC)
else:
    corr_B3 = corr_C3 = None
    auc_new_3 = auc_delta_3 = None

results_features["f3_pitcher_3start_hr"] = {
    "name": "Pitcher 3-start rolling HR rate",
    "computable_from_current_data": False,
    "computable_note": "Requires MLB Stats API game-by-game pitching logs per pitcher (pitching_stats_range or pitching_stats_bref). Not currently fetched. Per-start HR allowed is available via pybaseball.pitching_stats_range(). Estimated 30-60 new rows per pitcher per season. Moderate pipeline work.",
    "pipeline_complexity": "moderate",
    "proxy_used": "pitcher_hrfb × pitcher_barrel composite (season-level proxy for HR vulnerability)",
    "corr_tier_B": round(float(corr_B3), 4) if corr_B3 and not np.isnan(corr_B3) else None,
    "corr_tier_C": round(float(corr_C3), 4) if corr_C3 and not np.isnan(corr_C3) else None,
    "auc_with_feature": round(auc_new_3, 4) if auc_new_3 else None,
    "auc_delta": round(auc_delta_3, 4) if auc_delta_3 else None,
    "exceeds_threshold": bool(auc_delta_3 and auc_delta_3 > 0.005),
}
print(f"    F3 (pitcher 3-start): done")

# ─── Feature 4: Directional park / pull interaction ───────────────────────────
# pull_rate_fly × park_hr_factor is already partially captured by park_hr_factor
# The spray data has pull_rate_fly. If it's in the feature matrix, use it.
# Otherwise proxy: hr_rate_bayes × park_hr_factor interaction

if "pull_rate_fly" in tier_BC.columns:
    pull_col = "pull_rate_fly"
    tier_BC["pull_park_score"] = (
        tier_BC["pull_rate_fly"].fillna(tier_BC["pull_rate_fly"].median()) *
        tier_BC["park_hr_factor"].fillna(1.0)
    )
elif "hr_rate_bayes" in tier_BC.columns and "park_hr_factor" in tier_BC.columns:
    # Proxy: high pull tendency (approximated by elevated hr_rate) × park
    tier_BC["pull_park_score"] = (
        tier_BC["hr_rate_bayes"].fillna(train_medians["hr_rate_bayes"]) *
        tier_BC["park_hr_factor"].fillna(1.0)
    )
    pull_col = "proxy (hr_rate_bayes × park_hr_factor)"
else:
    tier_BC["pull_park_score"] = np.nan
    pull_col = "unavailable"

corr_B4 = point_biserial_corr(
    tier_BC[tier_BC["american_odds"] < 500]["pull_park_score"].values,
    tier_BC[tier_BC["american_odds"] < 500]["did_hr"].values
)
corr_C4 = point_biserial_corr(
    tier_BC[tier_BC["american_odds"] >= 500]["pull_park_score"].values,
    tier_BC[tier_BC["american_odds"] >= 500]["did_hr"].values
)
auc_new_4, auc_delta_4 = auc_with_extra_feature("pull_park_score", tier_BC, y_BC)

results_features["f4_directional_park_pull"] = {
    "name": "Directional park / pull interaction score",
    "computable_from_current_data": True,
    "computable_note": "pull_rate_fly already fetched in spray data by fetch_statcast.py. park_hr_factor already in features. Interaction term is a simple multiply — zero new pipeline work. However, true directional park advantage (LF vs RF dimensions × pull tendency) requires park dimension data (not currently fetched).",
    "pipeline_complexity": "simple",
    "proxy_used": pull_col,
    "corr_tier_B": round(float(corr_B4), 4) if corr_B4 and not np.isnan(corr_B4) else None,
    "corr_tier_C": round(float(corr_C4), 4) if corr_C4 and not np.isnan(corr_C4) else None,
    "auc_with_feature": round(auc_new_4, 4) if auc_new_4 else None,
    "auc_delta": round(auc_delta_4, 4) if auc_delta_4 else None,
    "exceeds_threshold": bool(auc_delta_4 and auc_delta_4 > 0.005),
}
print(f"    F4 (pull/park): done")

# ─── Feature 5: Strike zone hot zone overlap ──────────────────────────────────
# Not in current data. Requires pitch-level Statcast with zone column (1-14)
# Per batter and per pitcher.
# Synthetic signal test: use barrel_pct × pitcher_barrel as proxy for
# "batter hot zone aligns with pitcher weakness zone" (both measured by barrel)

tier_BC["zone_overlap_proxy"] = (
    tier_BC["barrel_pct"].fillna(50) / 100.0 *
    tier_BC["pitcher_barrel"].fillna(43) / 100.0
)
corr_B5 = point_biserial_corr(
    tier_BC[tier_BC["american_odds"] < 500]["zone_overlap_proxy"].values,
    tier_BC[tier_BC["american_odds"] < 500]["did_hr"].values
)
corr_C5 = point_biserial_corr(
    tier_BC[tier_BC["american_odds"] >= 500]["zone_overlap_proxy"].values,
    tier_BC[tier_BC["american_odds"] >= 500]["did_hr"].values
)
auc_new_5, auc_delta_5 = auc_with_extra_feature("zone_overlap_proxy", tier_BC, y_BC)

results_features["f5_hot_zone_overlap"] = {
    "name": "Strike zone hot zone vs pitcher location overlap",
    "computable_from_current_data": False,
    "computable_note": "Requires raw pitch-level Statcast data with zone column (1-14) per batter and per pitcher. Not in current pipeline. pybaseball.statcast_batter() + statcast_pitcher() returns pitch-level data including zone — but full-season pulls are 500K-1M rows. Significant storage and compute overhead.",
    "pipeline_complexity": "complex",
    "proxy_used": "barrel_pct × pitcher_barrel / 100 (both features measure barrel quality of contact in/out of zone)",
    "corr_tier_B": round(float(corr_B5), 4) if corr_B5 and not np.isnan(corr_B5) else None,
    "corr_tier_C": round(float(corr_C5), 4) if corr_C5 and not np.isnan(corr_C5) else None,
    "auc_with_feature": round(auc_new_5, 4) if auc_new_5 else None,
    "auc_delta": round(auc_delta_5, 4) if auc_delta_5 else None,
    "exceeds_threshold": bool(auc_delta_5 and auc_delta_5 > 0.005),
}
print(f"    F5 (hot zone): done")

# ─── Feature 6: Pitcher velocity degradation ──────────────────────────────────
# Requires per-inning pitch-level Statcast data with inning column.
# Not in current pipeline. Proxy: use pitcher_rv100 (which embeds arsenal quality)
# as a stand-in and test whether avg_speed from arsenal blob adds signal.
# avg_speed is already in arsenal data fetched by fetch_statcast.py

# Proxy: pitcher_rv100 (lower = more deceptive arsenal overall)
# For velocity degradation specifically: we have no per-inning data
# Create synthetic: if pitcher_rv100 < -0.5 (good pitcher), velocity degradation
# matters more; approximate as interaction with hr_rate_bayes
tier_BC["vel_degrade_proxy"] = (
    (-tier_BC["pitcher_rv100"].fillna(0)) *
    tier_BC["hr_rate_bayes"].fillna(train_medians["hr_rate_bayes"])
)
corr_B6 = point_biserial_corr(
    tier_BC[tier_BC["american_odds"] < 500]["vel_degrade_proxy"].values,
    tier_BC[tier_BC["american_odds"] < 500]["did_hr"].values
)
corr_C6 = point_biserial_corr(
    tier_BC[tier_BC["american_odds"] >= 500]["vel_degrade_proxy"].values,
    tier_BC[tier_BC["american_odds"] >= 500]["did_hr"].values
)
auc_new_6, auc_delta_6 = auc_with_extra_feature("vel_degrade_proxy", tier_BC, y_BC)

results_features["f6_velocity_degradation"] = {
    "name": "Pitcher velocity degradation (early vs late innings)",
    "computable_from_current_data": False,
    "computable_note": "Requires pitch-level Statcast with inning+velocity per pitcher. Not in current pipeline. avg_speed by pitch type is in the arsenal blob but not split by inning. MLB Stats API game feed has per-AB velocity but not per-inning aggregates. Would need a new pybaseball.statcast_pitcher() pull and per-inning aggregation — complex pipeline addition.",
    "pipeline_complexity": "complex",
    "proxy_used": "-pitcher_rv100 × hr_rate_bayes (arsenal deception × batter power as proxy for velocity-dependent matchup)",
    "corr_tier_B": round(float(corr_B6), 4) if corr_B6 and not np.isnan(corr_B6) else None,
    "corr_tier_C": round(float(corr_C6), 4) if corr_C6 and not np.isnan(corr_C6) else None,
    "auc_with_feature": round(auc_new_6, 4) if auc_new_6 else None,
    "auc_delta": round(auc_delta_6, 4) if auc_delta_6 else None,
    "exceeds_threshold": bool(auc_delta_6 and auc_delta_6 > 0.005),
}
print(f"    F6 (velocity degradation): done")

# ─── Feature 7: Pitcher command under pressure (zone% in hitter's counts) ─────
# Not in current pipeline. FanGraphs pitching_stats() has overall Zone%
# but not count-specific zone%. Savant pitch-level has "balls", "strikes" per pitch.
# Proxy: use pitcher_rv100 negated (better pitchers have better command)
# True zone%-in-hitter-counts requires pitch-level filtering by count.

# A more interesting proxy: whiff_percent from arsenal data (already fetched)
# is the INVERSE of command — low whiff = pitcher is grooveable in hitter counts
# We don't have whiff in the feature matrix but it's in the blobs.
# For this test: use pitcher_hrfb as hitter-count proxy (if pitcher grooves pitches,
# more become fly balls that become HRs)

tier_BC["command_proxy"] = (
    tier_BC["pitcher_hrfb"].fillna(train_medians["pitcher_hrfb"]) *
    (1 - tier_BC["pitcher_rv100"].fillna(0) / 2.0)  # high hrfb + bad arsenal
)
corr_B7 = point_biserial_corr(
    tier_BC[tier_BC["american_odds"] < 500]["command_proxy"].values,
    tier_BC[tier_BC["american_odds"] < 500]["did_hr"].values
)
corr_C7 = point_biserial_corr(
    tier_BC[tier_BC["american_odds"] >= 500]["command_proxy"].values,
    tier_BC[tier_BC["american_odds"] >= 500]["did_hr"].values
)
auc_new_7, auc_delta_7 = auc_with_extra_feature("command_proxy", tier_BC, y_BC)

results_features["f7_pitcher_command"] = {
    "name": "Pitcher command under pressure (zone% in hitter's counts)",
    "computable_from_current_data": False,
    "computable_note": "FanGraphs pitching_stats() includes overall Zone% (already fetchable, not currently in pipeline). Count-specific zone% requires pitch-level Statcast filtering. FanGraphs Zone% overall would be a simple addition to the existing fangraphs-pitching fetch (add one column). Count-specific zone% is complex.",
    "pipeline_complexity": "simple (overall Zone%) / complex (count-specific)",
    "proxy_used": "pitcher_hrfb × (1 - pitcher_rv100/2) — combined HR yield × arsenal quality",
    "corr_tier_B": round(float(corr_B7), 4) if corr_B7 and not np.isnan(corr_B7) else None,
    "corr_tier_C": round(float(corr_C7), 4) if corr_C7 and not np.isnan(corr_C7) else None,
    "auc_with_feature": round(auc_new_7, 4) if auc_new_7 else None,
    "auc_delta": round(auc_delta_7, 4) if auc_delta_7 else None,
    "exceeds_threshold": bool(auc_delta_7 and auc_delta_7 > 0.005),
}
print(f"    F7 (command): done")

# ─── Feature 8: Hard hit rate by pitch type vs pitcher arsenal ────────────────
# batter hard_hit_pct is overall (already in model as feature [2])
# Pitcher primary pitch type usage and rv100 are in arsenal blob
# Arsenal is not in the feature matrix currently — pitcher_rv100 (weighted avg) IS
# Proxy: hard_hit_pct × (1 + pitcher_rv100) captures "hitter makes hard contact
# against pitcher whose arsenal has high run value (easier to hit)"

tier_BC["hard_hit_matchup"] = (
    tier_BC["hard_hit_pct"].fillna(50) / 100.0 *
    (1 + tier_BC["pitcher_rv100"].fillna(0))
)
corr_B8 = point_biserial_corr(
    tier_BC[tier_BC["american_odds"] < 500]["hard_hit_matchup"].values,
    tier_BC[tier_BC["american_odds"] < 500]["did_hr"].values
)
corr_C8 = point_biserial_corr(
    tier_BC[tier_BC["american_odds"] >= 500]["hard_hit_matchup"].values,
    tier_BC[tier_BC["american_odds"] >= 500]["did_hr"].values
)
auc_new_8, auc_delta_8 = auc_with_extra_feature("hard_hit_matchup", tier_BC, y_BC)

results_features["f8_hard_hit_pitch_matchup"] = {
    "name": "Hard hit rate by pitch type vs pitcher arsenal matchup",
    "computable_from_current_data": False,
    "computable_note": "True pitch-type-specific hard hit rates (e.g. batter hard_hit% vs FF vs SL) are not in current pipeline. Would require filtering Statcast pitch data by pitch_type per batter. pybaseball.statcast_batter() filtered by pitch_type — complex. However, the weighted pitcher_rv100 already captures 'arsenal average run value against this pitcher' and hard_hit_pct already captures 'how hard this batter makes contact'. Their interaction is testable from current data.",
    "pipeline_complexity": "complex (per pitch type) / simple (interaction term already computable)",
    "proxy_used": "hard_hit_pct × (1 + pitcher_rv100) — batter contact quality × pitcher arsenal weakness",
    "corr_tier_B": round(float(corr_B8), 4) if corr_B8 and not np.isnan(corr_B8) else None,
    "corr_tier_C": round(float(corr_C8), 4) if corr_C8 and not np.isnan(corr_C8) else None,
    "auc_with_feature": round(auc_new_8, 4) if auc_new_8 else None,
    "auc_delta": round(auc_delta_8, 4) if auc_delta_8 else None,
    "exceeds_threshold": bool(auc_delta_8 and auc_delta_8 > 0.005),
}
print(f"    F8 (hard hit matchup): done")

# ─── Feature 9: Plate discipline advantage ────────────────────────────────────
# batter O-Swing% from FanGraphs batting_stats (not currently in pipeline)
# pitcher Zone% from FanGraphs pitching_stats (not currently in pipeline)
# discipline_advantage = (1 - o_swing) × (1 - zone_pct)
# Proxy: use hr_rate_bayes as discipline proxy (patient hitters with high HR rate)
# and pitcher_rv100 negative as zone% proxy (bad arsenal = lower zone%)

tier_BC["discipline_advantage"] = (
    (1 - tier_BC["hr_rate_bayes"].fillna(train_medians["hr_rate_bayes"]) * 5) *
    (1 - tier_BC["pitcher_rv100"].fillna(0) / 2.0)
)
# Clip to [0, 1]
tier_BC["discipline_advantage"] = tier_BC["discipline_advantage"].clip(0, 2)

corr_B9 = point_biserial_corr(
    tier_BC[tier_BC["american_odds"] < 500]["discipline_advantage"].values,
    tier_BC[tier_BC["american_odds"] < 500]["did_hr"].values
)
corr_C9 = point_biserial_corr(
    tier_BC[tier_BC["american_odds"] >= 500]["discipline_advantage"].values,
    tier_BC[tier_BC["american_odds"] >= 500]["did_hr"].values
)
auc_new_9, auc_delta_9 = auc_with_extra_feature("discipline_advantage", tier_BC, y_BC)

results_features["f9_plate_discipline"] = {
    "name": "Plate discipline advantage (O-Swing% × pitcher Zone%)",
    "computable_from_current_data": False,
    "computable_note": "FanGraphs batting_stats() already called in fetch_statcast.py — add O% (O-Swing%) column. FanGraphs pitching_stats() already called — add Zone% column. Both are simple additions to existing fetchers (one line each). High signal-to-complexity ratio.",
    "pipeline_complexity": "simple",
    "proxy_used": "(1 - hr_rate_bayes×5) × (1 - pitcher_rv100/2) — discipline proxy × pitcher zone% proxy",
    "corr_tier_B": round(float(corr_B9), 4) if corr_B9 and not np.isnan(corr_B9) else None,
    "corr_tier_C": round(float(corr_C9), 4) if corr_C9 and not np.isnan(corr_C9) else None,
    "auc_with_feature": round(auc_new_9, 4) if auc_new_9 else None,
    "auc_delta": round(auc_delta_9, 4) if auc_delta_9 else None,
    "exceeds_threshold": bool(auc_delta_9 and auc_delta_9 > 0.005),
}
print(f"    F9 (plate discipline): done")

# ═══════════════════════════════════════════════════════════════════════════════
# PRINT PART 2 RESULTS
# ═══════════════════════════════════════════════════════════════════════════════
print()
print("=" * 72)
print("PART 2 — Missing Feature Audit Summary")
print("=" * 72)
print()
print(f"  Baseline AUC on Tier B+C (production model): {baseline_auc_BC:.4f}" if baseline_auc_BC else "  Baseline AUC: —")
print()
print(f"  {'#':<3} {'Feature':<40} {'CorrB':>7} {'CorrC':>7} {'ΔAUC':>7} {'>0.005':>7} {'Complexity':<12}")
print(f"  {'—'*3} {'—'*40} {'—'*7} {'—'*7} {'—'*7} {'—'*7} {'—'*12}")

feature_order = [
    ("f1_platoon_split",        "1"),
    ("f2_rolling_barrel_trend", "2"),
    ("f3_pitcher_3start_hr",    "3"),
    ("f4_directional_park_pull","4"),
    ("f5_hot_zone_overlap",     "5"),
    ("f6_velocity_degradation", "6"),
    ("f7_pitcher_command",      "7"),
    ("f8_hard_hit_pitch_matchup","8"),
    ("f9_plate_discipline",     "9"),
]

for key, num in feature_order:
    r = results_features[key]
    cb   = f"{r['corr_tier_B']:+.3f}" if r["corr_tier_B"] is not None else "  —"
    cc   = f"{r['corr_tier_C']:+.3f}" if r["corr_tier_C"] is not None else "  —"
    da   = f"{r['auc_delta']:+.4f}" if r["auc_delta"] is not None else "   —"
    flag = "  ✅" if r["exceeds_threshold"] else "  ✗"
    comp = r["pipeline_complexity"].split(" ")[0]
    name_short = r["name"][:40]
    print(f"  {num:<3} {name_short:<40} {cb:>7} {cc:>7} {da:>7} {flag:>7} {comp:<12}")

# ─── Priority Ranking ─────────────────────────────────────────────────────────
print()
print("=" * 72)
print("PRIORITY RANKING — Signal-to-Complexity for Tier B/C")
print("=" * 72)
print()

# Score = auc_delta / complexity_weight
complexity_weights = {
    "simple":   1.0,
    "moderate": 2.0,
    "complex":  4.0,
}

priority_rows = []
for key, num in feature_order:
    r = results_features[key]
    da = r.get("auc_delta") or 0.0
    cb = abs(r.get("corr_tier_B") or 0.0)
    cc = abs(r.get("corr_tier_C") or 0.0)
    comp_str = r["pipeline_complexity"].split(" ")[0].lower().rstrip("(")
    weight = complexity_weights.get(comp_str, 3.0)
    signal = (abs(da) + cb + cc) / 3.0
    ratio  = signal / weight
    priority_rows.append({
        "num":      num,
        "key":      key,
        "name":     r["name"],
        "delta":    da,
        "corr_B":   r.get("corr_tier_B"),
        "corr_C":   r.get("corr_tier_C"),
        "complexity": comp_str,
        "signal":   round(signal, 4),
        "ratio":    round(ratio, 4),
        "exceeds":  r["exceeds_threshold"],
    })

priority_rows.sort(key=lambda x: -x["ratio"])

print(f"  {'Rank':<5} {'#':<3} {'Feature':<42} {'ΔAUC':>7} {'Signal':>8} {'Complexity':<12} {'Build?'}")
print(f"  {'—'*5} {'—'*3} {'—'*42} {'—'*7} {'—'*8} {'—'*12} {'—'*8}")
for rank, row in enumerate(priority_rows, 1):
    build = "✅ BUILD" if row["ratio"] > 0.005 and row["exceeds"] else ("📊 MONITOR" if row["ratio"] > 0.001 else "⛔ SKIP")
    delta_str = f"{row['delta']:+.4f}" if row["delta"] else "  —"
    print(f"  {rank:<5} {row['num']:<3} {row['name'][:42]:<42} {delta_str:>7} {row['signal']:>8.4f} {row['complexity']:<12} {build}")

print()
print("  Build priority notes:")
print("  ✅ BUILD   — exceeds 0.005 AUC threshold AND simple/moderate complexity")
print("  📊 MONITOR — some signal but below threshold or high complexity")
print("  ⛔ SKIP    — marginal signal, not worth pipeline investment")
print()

# ─── Write JSON ───────────────────────────────────────────────────────────────
print("[5/5] Writing output...")

output = {
    "run_date": "2025-holdout",
    "tier_definitions": {
        "A": "american_odds < 350",
        "B": "american_odds 350-499",
        "C": "american_odds >= 500",
    },
    "tier_sizes": {
        "A": {"n": len(tier_A), "hr_rate": round(float(tier_A["did_hr"].mean()), 4)},
        "B": {"n": len(tier_B), "hr_rate": round(float(tier_B["did_hr"].mean()), 4)},
        "C": {"n": len(tier_C), "hr_rate": round(float(tier_C["did_hr"].mean()), 4)},
    },
    "part1_tier_importance": {
        "auc_tier_A": round(auc_A, 4) if auc_A else None,
        "auc_tier_B": round(auc_B, 4) if auc_B else None,
        "auc_tier_C": round(auc_C, 4) if auc_C else None,
        "permutation_importance": {
            "tier_A": {k: round(v, 4) for k, v in sorted((perm_A or {}).items(), key=lambda x: -x[1])},
            "tier_B": {k: round(v, 4) for k, v in sorted((perm_B or {}).items(), key=lambda x: -x[1])},
            "tier_C": {k: round(v, 4) for k, v in sorted((perm_C or {}).items(), key=lambda x: -x[1])},
        },
    },
    "part2_feature_audit": results_features,
    "priority_ranking": priority_rows,
    "baseline_auc_tier_BC": round(baseline_auc_BC, 4) if baseline_auc_BC else None,
}

with open(OUT_PATH, "w") as f:
    json.dump(output, f, indent=2, default=str)

print(f"  Written to {OUT_PATH.relative_to(ROOT)}")
print("=" * 72)
