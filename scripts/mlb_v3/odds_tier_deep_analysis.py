#!/usr/bin/env python3
"""
odds_tier_deep_analysis.py
==========================
Analysis only — no production model changes.

Four questions for +350–+600 players in 2025 holdout:

  Q1. Model prob vs book implied prob — where is the edge gap?
  Q2. EV≥25% clearing rate, actual vs predicted HR rate for the tier
  Q3. Feature profiles for missed HRs (hit HR but never cleared EV≥25%)
  Q4. Simulation: add pull_rate_fly + pitcher_zone_pct + batter_oswing_pct,
      retrain on 2022-2024, test on 2025 — does mean qualifying odds shift toward +400?

Feature sources for Q4:
  - pull_rate_fly      → pybaseball.statcast_batter (hc_x, fly balls) [complex, use proxy]
  - pitcher_zone_pct   → pybaseball.pitching_stats (Zone% column)
  - batter_oswing_pct  → pybaseball.batting_stats  (O-Swing% column)

Since fetching full Statcast pitch data at script runtime is prohibitive
(~1M rows/year), we:
  - Build pull_rate_fly PROXY from existing spray blob data where available,
    otherwise from batter barrel_pct percentile (highly correlated with pull tendency).
  - Fetch pitcher Zone% from pybaseball.pitching_stats — already called in
    fetch_statcast.py, just a new column. Fetch 2022-2025 now.
  - Fetch batter O-Swing% from pybaseball.batting_stats — similar call.

Output: data/mlb_v3/odds_tier_deep_analysis.json + printed report
"""

import json, pathlib, warnings
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import roc_auc_score
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

ROOT     = pathlib.Path(__file__).parent.parent.parent
OUT_PATH = ROOT / "data/mlb_v3/odds_tier_deep_analysis.json"

# ── Shared constants (match production pipeline exactly) ──────────────────────
FEATURE_COLS = [
    "hr_rate_bayes", "barrel_pct", "hard_hit_pct", "pitcher_barrel",
    "pitcher_rv100", "pitcher_hrfb", "park_hr_factor", "temp_adj", "wind_adj",
]
PRIOR_RATE, PRIOR_PA = 0.04, 60
BEST_PARAMS = dict(
    n_estimators=600, max_depth=4, learning_rate=0.02,
    subsample=0.8, colsample_bytree=0.7, min_child_weight=80,
)
EV_THRESHOLD = 0.25   # EV ≥ 25%

print("=" * 72)
print("Odds Tier Deep Analysis — +350 to +600 Focus")
print("=" * 72)

# ══════════════════════════════════════════════════════════════════════════════
# 0. LOAD + ENGINEER FEATURE MATRIX
# ══════════════════════════════════════════════════════════════════════════════
print("\n[0] Loading feature matrix …")

df = pd.read_parquet(ROOT / "data/mlb_v3/feature_matrix.parquet")

# Bayesian HR rate
df["hr_rate_bayes"] = (
    (df["hr_rate_std"] * df["pa_std"] + PRIOR_RATE * PRIOR_PA) /
    (df["pa_std"] + PRIOR_PA)
)
df["temp_adj"] = df["temp_f"].fillna(72) - 72
df.loc[df["is_dome"], "temp_adj"] = 0.0
df["wind_adj"] = df["wind_out_mph"].fillna(0.0)
df.loc[df["is_dome"], "wind_adj"] = 0.0

# Market-derived columns
df["decimal_odds"] = np.where(df["market_prob"] > 0, 1.0 / df["market_prob"], np.nan)
df["american_odds"] = df["decimal_odds"].apply(
    lambda d: (round((d - 1) * 100)      if pd.notna(d) and d >= 2.0
               else (round(-100 / (d-1)) if pd.notna(d) and d >  1.0
               else np.nan))
)

# Train / val / test splits
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
X_test, y_test   = prep(test)

# Fit production model (train+val, calibrated on val)
scale_pos = float((y_train == 0).sum() / (y_train == 1).sum())
xgb_base = XGBClassifier(**BEST_PARAMS, scale_pos_weight=scale_pos,
                          eval_metric="auc", use_label_encoder=False,
                          random_state=42, n_jobs=-1, verbosity=0)
xgb_base.fit(X_tv, y_tv)
xgb_cal = CalibratedClassifierCV(xgb_base, method="isotonic", cv="prefit")
xgb_cal.fit(X_val, y_val)

test = test.copy()
test["model_prob"] = xgb_cal.predict_proba(X_test)[:, 1]

# EV: (model_prob / market_prob) - 1
test["ev"] = np.where(
    test["market_prob"].notna() & (test["market_prob"] > 0),
    test["model_prob"] / test["market_prob"] - 1,
    np.nan,
)

has_odds = test[test["market_prob"].notna()].copy()
tier_focus = has_odds[
    (has_odds["american_odds"] >= 350) & (has_odds["american_odds"] <= 600)
].copy()

print(f"    2025 rows with odds:       {len(has_odds):,}")
print(f"    +350–+600 tier rows:       {len(tier_focus):,}")
print(f"    +350–+600 HR outcomes:     {tier_focus['did_hr'].sum():.0f} "
      f"({tier_focus['did_hr'].mean():.3f} rate)")

# ══════════════════════════════════════════════════════════════════════════════
# Q1. MODEL PROB vs BOOK IMPLIED PROB — WHERE IS THE EDGE?
# ══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 72)
print("Q1. Model Prob vs Book Implied Prob — Edge Gap Analysis")
print("=" * 72)

results_q1 = {}
bands = [
    ("<+350",    has_odds[has_odds["american_odds"] < 350]),
    ("+350–399", has_odds[(has_odds["american_odds"] >= 350) & (has_odds["american_odds"] < 400)]),
    ("+400–449", has_odds[(has_odds["american_odds"] >= 400) & (has_odds["american_odds"] < 450)]),
    ("+450–499", has_odds[(has_odds["american_odds"] >= 450) & (has_odds["american_odds"] < 500)]),
    ("+500–599", has_odds[(has_odds["american_odds"] >= 500) & (has_odds["american_odds"] < 600)]),
    ("+600+",    has_odds[has_odds["american_odds"] >= 600]),
]

print(f"\n  {'Band':<12} {'N':>6} {'Book %':>8} {'Model %':>8} {'Gap (pp)':>10} "
      f"{'Actual HR%':>11} {'EV≥25% N':>9} {'EV≥25% %':>9}")
print(f"  {'-'*12} {'-'*6} {'-'*8} {'-'*8} {'-'*10} {'-'*11} {'-'*9} {'-'*9}")

for label, band_df in bands:
    if len(band_df) < 5:
        continue
    book_pct  = float(band_df["market_prob"].mean()) * 100
    model_pct = float(band_df["model_prob"].mean()) * 100
    gap_pp    = model_pct - book_pct
    actual_hr = float(band_df["did_hr"].mean()) * 100
    ev_cleared = band_df[band_df["ev"] >= EV_THRESHOLD]
    ev_n       = len(ev_cleared)
    ev_pct     = ev_n / len(band_df) * 100

    print(f"  {label:<12} {len(band_df):>6,} {book_pct:>7.2f}% {model_pct:>7.2f}% "
          f"{gap_pp:>+9.2f}pp {actual_hr:>10.2f}% {ev_n:>9,} {ev_pct:>8.1f}%")

    results_q1[label] = {
        "n": len(band_df),
        "book_pct": round(book_pct, 3),
        "model_pct": round(model_pct, 3),
        "gap_pp": round(gap_pp, 3),
        "actual_hr_pct": round(actual_hr, 3),
        "ev_cleared_n": ev_n,
        "ev_cleared_pct": round(ev_pct, 2),
    }

# Core edge question: for +350–600 players, is model consistently
# above or below book? Are we finding positive edge anywhere?
tf_book  = float(tier_focus["market_prob"].mean()) * 100
tf_model = float(tier_focus["model_prob"].mean()) * 100
tf_gap   = tf_model - tf_book

print(f"\n  Combined +350–+600:")
print(f"    Book implied:  {tf_book:.2f}%")
print(f"    Model output:  {tf_model:.2f}%")
print(f"    Gap:           {tf_gap:+.2f}pp")
print()

# Where is edge positive? Find sub-bands where model > book + 1pp
positive_edge_bands = {k: v for k, v in results_q1.items() if v["gap_pp"] > 1.0}
print(f"  Bands with positive edge (gap > +1pp): "
      f"{list(positive_edge_bands.keys()) or 'NONE'}")
print(f"  Bands with negative edge (model < book): "
      f"{[k for k, v in results_q1.items() if v['gap_pp'] < -0.5]}")

# Model calibration check in tier: does model_prob track actual HR rate?
print()
print(f"  Calibration check for +350–600 tier:")
for label, band_df in bands[1:-1]:   # skip extremes
    if len(band_df) < 30:
        continue
    model_avg = float(band_df["model_prob"].mean()) * 100
    actual_hr = float(band_df["did_hr"].mean()) * 100
    calib_err = model_avg - actual_hr
    print(f"    {label:<12}: model avg {model_avg:.2f}%  actual {actual_hr:.2f}%  "
          f"over-estimates by {calib_err:+.2f}pp")


# ══════════════════════════════════════════════════════════════════════════════
# Q2. EV≥25% CLEARING RATE, ACTUAL vs PREDICTED HR RATE
# ══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 72)
print("Q2. EV≥25% Clearing Rate and Accuracy in +350–+600 Tier")
print("=" * 72)

results_q2 = {}
all_350_600 = tier_focus.copy()

cleared_ev   = all_350_600[all_350_600["ev"] >= EV_THRESHOLD]
not_cleared  = all_350_600[all_350_600["ev"] <  EV_THRESHOLD]

n_total    = len(all_350_600)
n_cleared  = len(cleared_ev)
pct_clear  = n_cleared / n_total * 100 if n_total > 0 else 0

# HR rates
hr_cleared_actual  = float(cleared_ev["did_hr"].mean())  if len(cleared_ev) > 0 else 0
hr_cleared_model   = float(cleared_ev["model_prob"].mean()) if len(cleared_ev) > 0 else 0
hr_notclear_actual = float(not_cleared["did_hr"].mean()) if len(not_cleared) > 0 else 0
hr_notclear_model  = float(not_cleared["model_prob"].mean()) if len(not_cleared) > 0 else 0

print(f"\n  +350–+600 total rows:  {n_total:,}")
print(f"  Cleared EV≥25%:        {n_cleared:,}  ({pct_clear:.1f}%)")
print(f"  Did NOT clear EV≥25%:  {len(not_cleared):,}  ({100-pct_clear:.1f}%)")
print()
print(f"  {'Group':<22} {'N':>6} {'Actual HR%':>11} {'Model HR%':>10} {'Over-est (pp)':>14}")
print(f"  {'-'*22} {'-'*6} {'-'*11} {'-'*10} {'-'*14}")
print(f"  {'Cleared EV≥25%':<22} {n_cleared:>6,} {hr_cleared_actual*100:>10.2f}% "
      f"{hr_cleared_model*100:>9.2f}% {(hr_cleared_model-hr_cleared_actual)*100:>+13.2f}pp")
print(f"  {'Did not clear':<22} {len(not_cleared):>6,} {hr_notclear_actual*100:>10.2f}% "
      f"{hr_notclear_model*100:>9.2f}% {(hr_notclear_model-hr_notclear_actual)*100:>+13.2f}pp")

# EV distribution in tier
ev_pcts = [0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]
print(f"\n  EV distribution in +350–+600 tier:")
for pct in ev_pcts:
    n_above = (all_350_600["ev"] >= pct).sum()
    hr_above = all_350_600[all_350_600["ev"] >= pct]["did_hr"].mean() if n_above > 0 else 0
    print(f"    EV≥{pct*100:4.0f}%: {n_above:>5,} players ({n_above/n_total*100:4.1f}%)  "
          f"actual HR rate: {hr_above*100:.2f}%")

# Model vs actual HR rate at different EV thresholds
print(f"\n  Is the model UNDERESTIMATING +350–+600 players?")
print(f"  (Under-estimation = model < actual HR rate = we're leaving edge on the table)")

# Among players who DID hit a HR: what was their model_prob?
did_hr_in_tier = all_350_600[all_350_600["did_hr"] == 1]
no_hr_in_tier  = all_350_600[all_350_600["did_hr"] == 0]
print(f"\n  Players who DID hit a HR (n={len(did_hr_in_tier):,}):")
print(f"    Mean model prob:   {did_hr_in_tier['model_prob'].mean()*100:.2f}%")
print(f"    Mean book prob:    {did_hr_in_tier['market_prob'].mean()*100:.2f}%")
print(f"    Mean EV:           {did_hr_in_tier['ev'].mean()*100:.1f}%")
print(f"    % who cleared EV≥25%: {(did_hr_in_tier['ev'] >= EV_THRESHOLD).mean()*100:.1f}%")
print(f"\n  Players who did NOT hit a HR (n={len(no_hr_in_tier):,}):")
print(f"    Mean model prob:   {no_hr_in_tier['model_prob'].mean()*100:.2f}%")
print(f"    Mean book prob:    {no_hr_in_tier['market_prob'].mean()*100:.2f}%")
print(f"    Mean EV:           {no_hr_in_tier['ev'].mean()*100:.1f}%")
print(f"    % who cleared EV≥25%: {(no_hr_in_tier['ev'] >= EV_THRESHOLD).mean()*100:.1f}%")

results_q2 = {
    "n_total": n_total, "n_cleared": n_cleared, "pct_cleared": round(pct_clear, 2),
    "cleared_actual_hr": round(hr_cleared_actual, 4),
    "cleared_model_hr":  round(hr_cleared_model,  4),
    "not_cleared_actual_hr": round(hr_notclear_actual, 4),
    "not_cleared_model_hr":  round(hr_notclear_model,  4),
    "did_hr_mean_model_prob": round(float(did_hr_in_tier["model_prob"].mean()), 4),
    "did_hr_pct_cleared_ev":  round(float((did_hr_in_tier["ev"] >= EV_THRESHOLD).mean()), 4),
}


# ══════════════════════════════════════════════════════════════════════════════
# Q3. FEATURE PROFILES: MISSED HRS vs EV-CLEARED PLAYERS
# ══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 72)
print("Q3. Feature Profiles — Missed HRs vs EV≥25% Cleared Players")
print("=" * 72)

# "Missed HR" = hit a HR in the 2025 holdout BUT never appeared in
# the EV≥25% pool on the days they hit the HR.
# We compare their feature values to players who DID clear EV≥25%.

# Group A: Hit HR in +350-600, DID clear EV≥25% on that day
hit_hr_and_cleared = all_350_600[(all_350_600["did_hr"] == 1) & (all_350_600["ev"] >= EV_THRESHOLD)]
# Group B: Hit HR in +350-600, did NOT clear EV≥25% (missed)
hit_hr_not_cleared = all_350_600[(all_350_600["did_hr"] == 1) & (all_350_600["ev"] <  EV_THRESHOLD)]
# Group C: Did not hit HR but DID clear EV≥25% (false positives)
no_hr_but_cleared  = all_350_600[(all_350_600["did_hr"] == 0) & (all_350_600["ev"] >= EV_THRESHOLD)]

print(f"\n  Group A — Hit HR + cleared EV≥25%:      {len(hit_hr_and_cleared):>5,} rows")
print(f"  Group B — Hit HR + MISSED EV≥25%:       {len(hit_hr_not_cleared):>5,} rows  ← key group")
print(f"  Group C — No HR but cleared EV≥25%:     {len(no_hr_but_cleared):>5,} rows  (false positives)")

PROFILE_COLS = [
    ("barrel_pct",     "Barrel % (rank)"),
    ("hard_hit_pct",   "Hard Hit % (rank)"),
    ("hr_rate_bayes",  "HR Rate Bayes"),
    ("pitcher_hrfb",   "Pitcher HR/FB"),
    ("pitcher_rv100",  "Pitcher RV/100"),
    ("pitcher_barrel", "Pitcher Barrel (rank)"),
    ("park_hr_factor", "Park HR Factor"),
    ("temp_adj",       "Temp Adj"),
    ("wind_adj",       "Wind Adj"),
    ("model_prob",     "Model Prob"),
    ("market_prob",    "Book Prob"),
    ("ev",             "EV"),
    ("american_odds",  "American Odds"),
]

print(f"\n  {'Feature':<26} {'A: Hit+Cleared':>14} {'B: Hit+Missed':>14} "
      f"{'Gap (B-A)':>10} {'Meaningful?':>12}")
print(f"  {'-'*26} {'-'*14} {'-'*14} {'-'*10} {'-'*12}")

results_q3 = {}
for col, label in PROFILE_COLS:
    if col not in all_350_600.columns:
        continue
    a_val = float(hit_hr_and_cleared[col].median()) if len(hit_hr_and_cleared) > 0 else None
    b_val = float(hit_hr_not_cleared[col].median()) if len(hit_hr_not_cleared) > 0 else None
    if a_val is None or b_val is None:
        continue
    gap  = b_val - a_val
    # Flag as "meaningful" if gap > 5% of median absolute value
    baseline = abs(a_val) if abs(a_val) > 0.001 else 1.0
    flag = "YES" if abs(gap) / baseline > 0.05 else ""

    fmt_a = f"{a_val:.4f}" if abs(a_val) < 10 else f"{a_val:.1f}"
    fmt_b = f"{b_val:.4f}" if abs(b_val) < 10 else f"{b_val:.1f}"
    fmt_g = f"{gap:+.4f}"  if abs(gap)   < 10 else f"{gap:+.1f}"

    print(f"  {label:<26} {fmt_a:>14} {fmt_b:>14} {fmt_g:>10} {flag:>12}")
    results_q3[col] = {
        "group_A_hit_cleared_median":  round(a_val, 5),
        "group_B_hit_missed_median":   round(b_val, 5),
        "gap_B_minus_A":               round(gap,   5),
        "meaningful": bool(abs(gap) / baseline > 0.05),
    }

# Odds distribution comparison
print(f"\n  American Odds Distribution:")
for grp_label, grp in [("A: Hit + Cleared", hit_hr_and_cleared),
                        ("B: Hit + Missed",  hit_hr_not_cleared)]:
    if len(grp) == 0:
        continue
    q1, med, q3 = (grp["american_odds"].quantile(q) for q in [0.25, 0.50, 0.75])
    print(f"    {grp_label}: p25={q1:.0f}  median={med:.0f}  p75={q3:.0f}")

# Key question: why did Group B miss? Model underestimation?
print(f"\n  Why did Group B (Hit HR but NOT cleared EV≥25%) miss?")
if len(hit_hr_not_cleared) > 0:
    b_model = float(hit_hr_not_cleared["model_prob"].mean()) * 100
    b_book  = float(hit_hr_not_cleared["market_prob"].mean()) * 100
    b_ev    = float(hit_hr_not_cleared["ev"].mean()) * 100
    b_odds  = float(hit_hr_not_cleared["american_odds"].mean())
    print(f"    Mean model prob: {b_model:.2f}%  (needed ≥{b_book*(1+EV_THRESHOLD):.2f}% for EV≥25%)")
    print(f"    Mean book prob:  {b_book:.2f}%")
    print(f"    Mean EV:         {b_ev:+.1f}%  (needed ≥+25%)")
    print(f"    Mean odds:       +{b_odds:.0f}")
    model_gap_needed = b_book * (1 + EV_THRESHOLD) - b_model
    print(f"    → Model needed to be {model_gap_needed:+.2f}pp HIGHER to flag these players")
    print(f"    → This is a {'model underestimation' if model_gap_needed > 0 else 'threshold calibration'} problem")


# ══════════════════════════════════════════════════════════════════════════════
# Q4. SIMULATION: ADD pull_rate_fly + pitcher_zone_pct + batter_oswing_pct
#     Retrain 2022-2024, test 2025, compare mean qualifying odds EV≥25%
# ══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 72)
print("Q4. New-Feature Simulation — Do They Shift Qualifying Odds?")
print("=" * 72)

print("\n  [4a] Fetching pitcher Zone% from FanGraphs (2022-2025) …")

pitcher_zone_pct = {}   # pitcher_id → zone_pct  (float, 0-1)
batter_oswing    = {}   # player_id  → o_swing    (float, 0-1)

try:
    from pybaseball import pitching_stats, batting_stats
    from pybaseball import cache as pb_cache
    pb_cache.enable()

    for yr in [2022, 2023, 2024, 2025]:
        try:
            pg = pitching_stats(yr, yr, qual=10)
            if pg is None or len(pg) < 5:
                print(f"    {yr}: no pitching data")
                continue
            pg.columns = [str(c).strip() for c in pg.columns]

            # Locate IDfg column (many aliases)
            id_col   = next((c for c in pg.columns if c.lower() in ("idfg", "playerid")), None)
            zone_col = next((c for c in pg.columns if "zone" in c.lower()), None)

            if id_col and zone_col:
                for _, row in pg.iterrows():
                    pid = str(row[id_col]).strip()
                    val = row[zone_col]
                    if pd.notna(val):
                        # Keep most recent year (overwrite)
                        pitcher_zone_pct[pid] = float(val) / 100.0 if float(val) > 1 else float(val)
                print(f"    {yr}: {len(pg)} pitchers, Zone% mapped for {sum(1 for _ in pg.iterrows()):,} → {len(pitcher_zone_pct):,} total")
            else:
                print(f"    {yr}: pitching_stats — id_col={id_col} zone_col={zone_col} — Zone% not found")
                if zone_col is None:
                    # Print available cols so we can debug
                    print(f"    Available cols sample: {list(pg.columns[:30])}")
        except Exception as e:
            print(f"    {yr} pitching_stats error: {e}")

except ImportError:
    print("    pybaseball not installed — using fallback proxy for Zone%")

print(f"  Pitcher Zone% entries collected: {len(pitcher_zone_pct)}")

print("\n  [4b] Fetching batter O-Swing% from FanGraphs (2022-2025) …")
try:
    from pybaseball import batting_stats
    from pybaseball import cache as pb_cache
    pb_cache.enable()

    for yr in [2022, 2023, 2024, 2025]:
        try:
            bg = batting_stats(yr, yr, qual=50)
            if bg is None or len(bg) < 5:
                print(f"    {yr}: no batting data")
                continue
            bg.columns = [str(c).strip() for c in bg.columns]

            id_col     = next((c for c in bg.columns if c.lower() in ("idfg", "playerid")), None)
            oswing_col = next((c for c in bg.columns
                               if "o-swing" in c.lower() or "oswing" in c.lower()
                               or c.lower() == "o-swing%"), None)

            if id_col and oswing_col:
                for _, row in bg.iterrows():
                    pid = str(row[id_col]).strip()
                    val = row[oswing_col]
                    if pd.notna(val):
                        batter_oswing[pid] = float(val) / 100.0 if float(val) > 1 else float(val)
                print(f"    {yr}: {len(bg)} batters, O-Swing% mapped → {len(batter_oswing):,} total")
            else:
                print(f"    {yr}: id_col={id_col} o_swing_col={oswing_col}")
                if oswing_col is None:
                    oswing_candidates = [c for c in bg.columns if "swing" in c.lower() or "o%" in c.lower()]
                    print(f"    Swing-related cols: {oswing_candidates}")
        except Exception as e:
            print(f"    {yr} batting_stats error: {e}")

except ImportError:
    print("    pybaseball not installed — will use proxy for O-Swing%")

print(f"  Batter O-Swing% entries collected: {len(batter_oswing)}")

# ── Build proxy features where real data is absent ────────────────────────────
# pull_rate_fly proxy: barrel_pct percentile-based
# Strong hitters (high barrel_pct) tend to be pull-heavy fly-ball hitters.
# Correlation between barrel% and pull_rate_fly ≈ 0.35-0.45 in Statcast data.
# This proxy INTENTIONALLY uses existing data to test the *marginal* signal
# of the true feature. If even the proxy shifts odds, the real feature will too.

print("\n  [4c] Building feature enriched matrix …")

# ── Merge pitcher_zone_pct via pitcher_id ────────────────────────────────────
# Feature matrix has pitcher_id as integer. FanGraphs uses IDfg (different system).
# Map via pitcher_name as fallback.
# For each year build a name→zone_pct map using pitching_stats Name column.

pitcher_name_zone = {}   # pitcher_name (lower) → zone_pct
try:
    from pybaseball import pitching_stats
    from pybaseball import cache as pb_cache
    pb_cache.enable()
    for yr in [2022, 2023, 2024, 2025]:
        try:
            pg = pitching_stats(yr, yr, qual=10)
            if pg is None or len(pg) < 5:
                continue
            pg.columns = [str(c).strip() for c in pg.columns]
            name_col = next((c for c in pg.columns if c.lower() == "name"), None)
            zone_col = next((c for c in pg.columns if "zone" in c.lower()), None)
            if name_col and zone_col:
                for _, row in pg.iterrows():
                    nm  = str(row[name_col]).strip().lower()
                    val = row[zone_col]
                    if pd.notna(val) and nm:
                        pitcher_name_zone[nm] = float(val) / 100.0 if float(val) > 1 else float(val)
        except Exception:
            pass
except Exception:
    pass

print(f"  Pitcher name→Zone% entries: {len(pitcher_name_zone)}")

# ── Merge batter_oswing via player_name ───────────────────────────────────────
batter_name_oswing = {}
try:
    from pybaseball import batting_stats
    from pybaseball import cache as pb_cache
    pb_cache.enable()
    for yr in [2022, 2023, 2024, 2025]:
        try:
            bg = batting_stats(yr, yr, qual=50)
            if bg is None or len(bg) < 5:
                continue
            bg.columns = [str(c).strip() for c in bg.columns]
            name_col   = next((c for c in bg.columns if c.lower() == "name"), None)
            oswing_col = next((c for c in bg.columns
                               if "o-swing" in c.lower() or "oswing" in c.lower()
                               or c.lower() == "o-swing%"), None)
            if name_col and oswing_col:
                for _, row in bg.iterrows():
                    nm  = str(row[name_col]).strip().lower()
                    val = row[oswing_col]
                    if pd.notna(val) and nm:
                        batter_name_oswing[nm] = float(val) / 100.0 if float(val) > 1 else float(val)
        except Exception:
            pass
except Exception:
    pass

print(f"  Batter name→O-Swing% entries: {len(batter_name_oswing)}")

# ── Add features to full df ───────────────────────────────────────────────────
df_aug = df.copy()

# pitcher_zone_pct: look up by pitcher_name (lowercase)
df_aug["pitcher_zone_pct"] = (
    df_aug["pitcher_name"]
    .str.strip().str.lower()
    .map(pitcher_name_zone)
)

# batter_oswing_pct: look up by player_name (lowercase)
df_aug["batter_oswing_pct"] = (
    df_aug["player_name"]
    .str.strip().str.lower()
    .map(batter_name_oswing)
)

# pull_rate_fly PROXY: from barrel_pct, scaled to [0.25, 0.65]
# Barrel percentile rank 0-100 → 0.25 + 0.40 * (barrel_pct/100)
barrel_fill = float(df_aug["barrel_pct"].median())
df_aug["pull_rate_fly_proxy"] = (
    0.25 + 0.40 * (df_aug["barrel_pct"].fillna(barrel_fill) / 100.0)
)

# Plate discipline score: (1 - batter_o_swing) × pitcher_zone_pct
# Interpretation: patient batter vs pitcher who pounds the zone = batter advantage
df_aug["plate_discipline_score"] = (
    (1 - df_aug["batter_oswing_pct"].fillna(df_aug["batter_oswing_pct"].median()))
    * df_aug["pitcher_zone_pct"].fillna(df_aug["pitcher_zone_pct"].median())
)

# Pull × park interaction
df_aug["pull_park_score"] = (
    df_aug["pull_rate_fly_proxy"] * df_aug["park_hr_factor"].fillna(1.0)
)

# Coverage stats
for feat in ["pitcher_zone_pct", "batter_oswing_pct", "pull_rate_fly_proxy"]:
    col_df = df_aug[df_aug["season"] == 2025]
    n_total_aug = len(col_df)
    n_filled    = col_df[feat].notna().sum()
    print(f"  {feat}: {n_filled}/{n_total_aug} rows filled "
          f"({n_filled/n_total_aug*100:.1f}%)")

# ── Augmented feature set ─────────────────────────────────────────────────────
FEATURE_COLS_AUG = FEATURE_COLS + [
    "pitcher_zone_pct",
    "batter_oswing_pct",
    "pull_park_score",
]

# Medians computed on training set
train_aug   = df_aug[df_aug["season"].isin([2022, 2023])].copy()
val_aug     = df_aug[df_aug["season"] == 2024].copy()
test_aug    = df_aug[df_aug["season"] == 2025].copy()

train_medians_aug = {}
for col in FEATURE_COLS_AUG:
    series = train_aug[col]
    med = float(series.median()) if series.notna().sum() > 0 else 0.0
    train_medians_aug[col] = med

def prep_aug(d, m=None):
    m = m or train_medians_aug
    X = d[FEATURE_COLS_AUG].copy()
    for col in FEATURE_COLS_AUG:
        X[col] = X[col].fillna(m[col])
    return X.values, d["did_hr"].values

X_train_a, y_train_a = prep_aug(train_aug)
X_val_a,   y_val_a   = prep_aug(val_aug)
X_tv_a = np.vstack([X_train_a, X_val_a])
y_tv_a = np.concatenate([y_train_a, y_val_a])
X_test_a, y_test_a   = prep_aug(test_aug)

print("\n  [4d] Fitting augmented model (9+3 features) …")
scale_pos_a = float((y_train_a == 0).sum() / (y_train_a == 1).sum())
xgb_aug = XGBClassifier(**BEST_PARAMS, scale_pos_weight=scale_pos_a,
                         eval_metric="auc", use_label_encoder=False,
                         random_state=42, n_jobs=-1, verbosity=0)
xgb_aug.fit(X_tv_a, y_tv_a)
cal_aug = CalibratedClassifierCV(xgb_aug, method="isotonic", cv="prefit")
cal_aug.fit(X_val_a, y_val_a)

test_aug = test_aug.copy()
test_aug["model_prob_aug"] = cal_aug.predict_proba(X_test_a)[:, 1]
test_aug["model_prob_base"] = xgb_cal.predict_proba(X_test)[:, 1]

# Recompute EV for both models
test_aug_odds = test_aug[test_aug["market_prob"].notna()].copy()
test_aug_odds["decimal_odds"] = 1.0 / test_aug_odds["market_prob"]
test_aug_odds["american_odds"] = test_aug_odds["decimal_odds"].apply(
    lambda d: (round((d - 1) * 100)      if pd.notna(d) and d >= 2.0
               else (round(-100 / (d-1)) if pd.notna(d) and d >  1.0
               else np.nan))
)
test_aug_odds["ev_base"] = (
    test_aug_odds["model_prob_base"] / test_aug_odds["market_prob"] - 1
)
test_aug_odds["ev_aug"] = (
    test_aug_odds["model_prob_aug"] / test_aug_odds["market_prob"] - 1
)

# AUC comparison
auc_base = roc_auc_score(test_aug_odds["did_hr"], test_aug_odds["model_prob_base"])
auc_aug  = roc_auc_score(test_aug_odds["did_hr"], test_aug_odds["model_prob_aug"])

# EV≥25% qualifying pools
base_pool = test_aug_odds[test_aug_odds["ev_base"] >= EV_THRESHOLD].copy()
aug_pool  = test_aug_odds[test_aug_odds["ev_aug"]  >= EV_THRESHOLD].copy()

print(f"\n  Results: Augmented Model vs Production Baseline")
print(f"  {'Metric':<40} {'Baseline':>12} {'Augmented':>12} {'Δ':>8}")
print(f"  {'-'*40} {'-'*12} {'-'*12} {'-'*8}")

# Global AUC
print(f"  {'ROC-AUC (all 2025)':<40} {auc_base:>12.4f} {auc_aug:>12.4f} "
      f"{auc_aug-auc_base:>+8.4f}")

# EV≥25% pool stats
base_n  = len(base_pool)
aug_n   = len(aug_pool)
print(f"  {'EV≥25% qualifying rows (n)':<40} {base_n:>12,} {aug_n:>12,} {aug_n-base_n:>+8,}")

if base_n > 0 and aug_n > 0:
    base_mean_odds = float(base_pool["american_odds"].mean())
    aug_mean_odds  = float(aug_pool["american_odds"].mean())
    base_med_odds  = float(base_pool["american_odds"].median())
    aug_med_odds   = float(aug_pool["american_odds"].median())
    base_hr_rate   = float(base_pool["did_hr"].mean())
    aug_hr_rate    = float(aug_pool["did_hr"].mean())

    print(f"  {'Mean qualifying odds (american)':<40} +{base_mean_odds:>10.0f} "
          f"+{aug_mean_odds:>10.0f} {aug_mean_odds-base_mean_odds:>+8.0f}")
    print(f"  {'Median qualifying odds':<40} +{base_med_odds:>10.0f} "
          f"+{aug_med_odds:>10.0f} {aug_med_odds-base_med_odds:>+8.0f}")
    print(f"  {'Actual HR rate in pool':<40} {base_hr_rate*100:>11.2f}% "
          f"{aug_hr_rate*100:>11.2f}% {(aug_hr_rate-base_hr_rate)*100:>+7.2f}pp")

    # Odds distribution of qualifying pool
    print(f"\n  Odds distribution of EV≥25% qualifying pool:")
    print(f"  {'Band':<14} {'Base N':>8} {'Aug N':>8} {'Base %':>8} {'Aug %':>8}")
    print(f"  {'-'*14} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
    bands_q4 = [
        ("<+250",    lambda d: d < 250),
        ("+250–349", lambda d: (d >= 250) & (d < 350)),
        ("+350–449", lambda d: (d >= 350) & (d < 450)),
        ("+450–549", lambda d: (d >= 450) & (d < 550)),
        ("+550+",    lambda d: d >= 550),
    ]
    for bl, fn in bands_q4:
        bn = fn(base_pool["american_odds"]).sum()
        an = fn(aug_pool["american_odds"]).sum()
        bp = bn / base_n * 100
        ap = an / aug_n  * 100
        print(f"  {bl:<14} {bn:>8,} {an:>8,} {bp:>7.1f}% {ap:>7.1f}%")

    # The money question: does the augmented model push MORE high-odds players in?
    base_high_odds = (base_pool["american_odds"] >= 350).sum()
    aug_high_odds  = (aug_pool["american_odds"]  >= 350).sum()
    base_ho_pct = base_high_odds / base_n * 100
    aug_ho_pct  = aug_high_odds  / aug_n  * 100
    print(f"\n  +350+ players in qualifying pool:")
    print(f"    Baseline:  {base_high_odds:,} ({base_ho_pct:.1f}% of pool)")
    print(f"    Augmented: {aug_high_odds:,}  ({aug_ho_pct:.1f}% of pool)")

    # Implication
    odds_shift = aug_mean_odds - base_mean_odds
    print(f"\n  Mean odds shift: {odds_shift:+.0f} american odds points")
    if odds_shift >= 15:
        print(f"  → Meaningful upward shift — augmented features do push qualifying")
        print(f"    pool toward higher-odds players. WORTH building.")
    elif odds_shift >= 5:
        print(f"  → Modest shift — features have directional value but won't alone")
        print(f"    solve the +285→+400 gap. Combine with EV threshold lowering or")
        print(f"    tier-specific calibration.")
    else:
        print(f"  → Negligible shift — augmented features do NOT materially change")
        print(f"    which players qualify. Problem is model calibration in the tier,")
        print(f"    not missing features.")

    results_q4 = {
        "auc_baseline": round(auc_base, 4),
        "auc_augmented": round(auc_aug, 4),
        "auc_delta": round(auc_aug - auc_base, 4),
        "pool_baseline_n":  base_n,
        "pool_augmented_n": aug_n,
        "mean_odds_baseline":  round(base_mean_odds, 1),
        "mean_odds_augmented": round(aug_mean_odds,  1),
        "mean_odds_delta":     round(odds_shift,      1),
        "median_odds_baseline":  round(base_med_odds, 1),
        "median_odds_augmented": round(aug_med_odds,  1),
        "hr_rate_baseline":  round(base_hr_rate,  4),
        "hr_rate_augmented": round(aug_hr_rate,   4),
        "pct_350plus_baseline":  round(base_ho_pct, 2),
        "pct_350plus_augmented": round(aug_ho_pct,  2),
        "feature_coverage": {
            "pitcher_zone_pct_pct": round(
                test_aug[test_aug["season"]==2025]["pitcher_zone_pct"].notna().mean() * 100, 1),
            "batter_oswing_pct": round(
                test_aug[test_aug["season"]==2025]["batter_oswing_pct"].notna().mean() * 100, 1),
        },
    }
else:
    print("  (Insufficient qualifying rows for comparison)")
    results_q4 = {"error": "insufficient qualifying rows"}

# ── Feature importance in augmented model ─────────────────────────────────────
print(f"\n  Augmented model feature importance (gain):")
gain_aug = xgb_aug.get_booster().get_score(importance_type="gain")
total_gain = sum(gain_aug.values()) or 1
gain_normed = {}
for k, v in gain_aug.items():
    idx = int(k.replace("f", ""))
    col = FEATURE_COLS_AUG[idx]
    gain_normed[col] = v / total_gain
for col, imp in sorted(gain_normed.items(), key=lambda x: -x[1]):
    is_new = "  ← NEW" if col in ("pitcher_zone_pct", "batter_oswing_pct", "pull_park_score") else ""
    print(f"    {col:<30} {imp:.4f}{is_new}")


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 72)
print("SUMMARY — Decision Points")
print("=" * 72)
print()

core_gap = results_q2.get("did_hr_mean_model_prob", 0)
model_underest = (results_q2.get("cleared_model_hr", 0) > results_q2.get("cleared_actual_hr", 0))

print("  Q1 Takeaway: Edge Gap")
print(f"    Combined +350–+600: model {tf_model:.2f}% vs book {tf_book:.2f}% "
      f"({tf_gap:+.2f}pp)")
if tf_gap > 1:
    print("    → Model finds positive edge in this tier on average.")
elif tf_gap < -1:
    print("    → Model finds NEGATIVE edge — it under-assigns probability to high-odds players.")
    print("    → The EV≥25% gate is correct to exclude most of them.")
else:
    print("    → Model is approximately fair-value on this tier (near-zero gap).")

print()
print("  Q2 Takeaway: EV≥25% Clearing Rate")
pct_c = results_q2.get("pct_cleared", 0)
did_hr_cleared = results_q2.get("did_hr_pct_cleared_ev", 0) * 100
print(f"    {pct_c:.1f}% of +350–+600 players cleared EV≥25%")
print(f"    Of players who HIT a HR in this tier, only {did_hr_cleared:.1f}% had cleared EV≥25%")
if did_hr_cleared < 30:
    print("    → Most HRs in this tier came from players the model DID NOT flag.")
    print("    → This is the structural gap. Model needs higher confidence in tier,")
    print("      OR EV threshold needs to be lower specifically for this odds range.")

print()
print("  Q3 Takeaway: Missed HR Feature Profile")
barrel_gap = results_q3.get("barrel_pct", {}).get("gap_B_minus_A", None)
hrfb_gap   = results_q3.get("pitcher_hrfb", {}).get("gap_B_minus_A", None)
rv100_gap  = results_q3.get("pitcher_rv100", {}).get("gap_B_minus_A", None)
if barrel_gap is not None:
    print(f"    barrel_pct gap (missed vs flagged):   {barrel_gap:+.2f}")
if hrfb_gap is not None:
    print(f"    pitcher_hrfb gap (missed vs flagged): {hrfb_gap:+.4f}")
if rv100_gap is not None:
    print(f"    pitcher_rv100 gap (missed vs flagged):{rv100_gap:+.4f}")
print("    → Interpretation: are missed HRs lower-quality batters vs worse pitchers,")
print("      or similar profiles? See median table above.")

print()
print("  Q4 Takeaway: Feature Addition Effect on Mean Qualifying Odds")
odds_delta = results_q4.get("mean_odds_delta", 0) if isinstance(results_q4, dict) else 0
print(f"    Mean odds shift with 3 new features: {odds_delta:+.0f} points")
if odds_delta >= 15:
    print("    → BUILD: Features meaningfully shift pool toward higher-odds players.")
elif odds_delta >= 5:
    print("    → PARTIAL: Features help but won't close the +285→+400 gap alone.")
    print("      Combine with tier-specific EV calibration.")
else:
    print("    → SKIP: Features do not shift qualifying pool odds distribution.")
    print("      Problem is structural — model assigns similar probability to")
    print("      low-odds and high-odds players who have similar stat profiles.")
    print("      The path to +400 mean odds is NOT new features — it is changing")
    print("      what 'qualifies': either a lower EV threshold (to let more +400+")
    print("      players in) or a tier-specific calibration layer.")

# ── Write JSON ─────────────────────────────────────────────────────────────────
output = {
    "run_date": "2025-holdout",
    "ev_threshold": EV_THRESHOLD,
    "focus_tier": "+350-600 american_odds",
    "q1_edge_gap":             results_q1,
    "q2_clearing_rate":        results_q2,
    "q3_feature_profiles":     results_q3,
    "q4_augmented_simulation": results_q4,
}

with open(OUT_PATH, "w") as f:
    json.dump(output, f, indent=2, default=str)

print(f"\n  Written to {OUT_PATH.relative_to(ROOT)}")
print("=" * 72)
