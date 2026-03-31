#!/usr/bin/env python3
"""
Round Robin Simulation on 2025 Holdout
========================================
For each game date in the 2025 holdout:
  1. Take all players with model_prob >= threshold
  2. Select top-N by model_prob (N = 5, 8, 10)
  3. Simulate all 2-leg and 3-leg parlays from those N players
  4. Score each combo using actual book odds (decimal = 1/market_prob)
  5. Report daily ROI, cumulative ROI, worst-day loss, % profitable days

Also reports:
  - Player HR outcome correlation (same-game, same-team effects)
  - Comparison vs straight-bet ROI at same threshold
  - Recommendation: RR vs straight bet

Run:
  python scripts/mlb_v3/rr_simulation.py
"""

import json, math, pathlib, warnings
from itertools import combinations

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegressionCV, LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

ROOT = pathlib.Path(__file__).parent.parent.parent
OUT_PATH = ROOT / "data/mlb_v3/rr_simulation.json"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

# ── Reproduce exact features + model (same as serialize_model.py) ─────────────
print("Loading feature matrix...")
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

FEATURE_COLS = [
    "hr_rate_bayes", "barrel_pct", "hard_hit_pct", "pitcher_barrel",
    "pitcher_rv100", "pitcher_hrfb", "park_hr_factor", "temp_adj", "wind_adj",
]

train = df[df["season"].isin([2022, 2023])].copy()
val   = df[df["season"] == 2024].copy()
test  = df[df["season"] == 2025].copy()

train_medians = {col: float(train[col].median()) for col in FEATURE_COLS}

def prep(d, m):
    X = d[FEATURE_COLS].copy()
    for col in FEATURE_COLS:
        X[col] = X[col].fillna(m[col])
    return X.values, d["did_hr"].values

X_train, y_train = prep(train, train_medians)
X_val,   y_val   = prep(val,   train_medians)
X_test,  y_test  = prep(test,  train_medians)
X_tv = np.vstack([X_train, X_val])
y_tv = np.concatenate([y_train, y_val])

print("Fitting XGBoost + isotonic calibrator...")
scale_pos = float((y_train == 0).sum() / (y_train == 1).sum())
BEST_PARAMS = dict(n_estimators=600, max_depth=4, learning_rate=0.02,
                   subsample=0.8, colsample_bytree=0.7, min_child_weight=80)
xgb_base = XGBClassifier(**BEST_PARAMS, scale_pos_weight=scale_pos,
                          eval_metric="auc", use_label_encoder=False,
                          random_state=42, n_jobs=-1, verbosity=0)
xgb_base.fit(X_tv, y_tv)
xgb_cal = CalibratedClassifierCV(xgb_base, method="isotonic", cv="prefit")
xgb_cal.fit(X_val, y_val)

# Attach model probs to test frame
test = test.copy()
test["model_prob"] = xgb_cal.predict_proba(X_test)[:, 1]
test["decimal_odds"] = np.where(test["market_prob"] > 0,
                                1.0 / test["market_prob"], np.nan)
print(f"Test set: {len(test):,} rows, {test['model_prob'].notna().sum():,} with model prob")

# ── Helper: simulate one day of round robins ──────────────────────────────────
def simulate_rr_day(players_df, top_n, legs):
    """
    players_df: rows already filtered to model_prob >= threshold, sorted desc
    top_n:      how many top players to include in the pool
    legs:       2 or 3 (parlay length)

    Returns:
        total_stake  (= n_combos, each bet is 1 unit)
        total_payout
        n_combos_hit
        n_combos_total
    """
    pool = players_df.head(top_n)
    if len(pool) < legs:
        return 0, 0, 0, 0

    combos = list(combinations(range(len(pool)), legs))
    odds_arr = pool["decimal_odds"].values
    hit_arr  = pool["did_hr"].values

    total_stake  = len(combos)
    total_payout = 0.0
    n_hit        = 0

    for idxs in combos:
        # All legs must hit for parlay to win
        if all(hit_arr[i] for i in idxs):
            parlay_odds = math.prod(odds_arr[i] for i in idxs)
            total_payout += parlay_odds
            n_hit += 1

    return total_stake, total_payout, n_hit, len(combos)


# ── Straight-bet baseline helper ──────────────────────────────────────────────
def straight_bet_day(players_df, top_n):
    pool = players_df.head(top_n)
    if len(pool) == 0:
        return 0, 0, 0
    stake   = len(pool)
    payout  = pool.apply(
        lambda r: r["decimal_odds"] if r["did_hr"] else 0.0, axis=1
    ).sum()
    return stake, payout, len(pool)


# ── HR Outcome Correlation Analysis ──────────────────────────────────────────
print("\n" + "═"*60)
print("  HR OUTCOME CORRELATION ANALYSIS")
print("═"*60)

has_odds = test[test["market_prob"].notna()].copy()

# Same-game correlation (pairs of players sharing game_pk)
# Sample 10k random pairs from the same game
same_game_corrs = []
for gpk, grp in has_odds.groupby("game_pk"):
    if len(grp) < 2:
        continue
    y = grp["did_hr"].values
    # Pairwise correlation = (P(both HR) - P(A)*P(B)) / sqrt(...)
    # Use simple: count co-occurrences
    for i, j in combinations(range(len(y)), 2):
        same_game_corrs.append((y[i], y[j]))

if same_game_corrs:
    arr = np.array(same_game_corrs)
    sg_corr = np.corrcoef(arr[:, 0], arr[:, 1])[0, 1]
    p_both  = (arr[:, 0] * arr[:, 1]).mean()
    p_a     = arr[:, 0].mean()
    p_b     = arr[:, 1].mean()
    print(f"  Same-game player pairs: {len(same_game_corrs):,}")
    print(f"  Correlation (HR_i, HR_j | same game): {sg_corr:+.4f}")
    print(f"  P(both HR)={p_both:.4f}  P(A)*P(B)={p_a*p_b:.4f}  Lift={p_both/(p_a*p_b):.3f}x")

# Same-team same-game
same_team_corrs = []
for (gpk, team), grp in has_odds.groupby(["game_pk", "team_abbrev"]):
    y = grp["did_hr"].values
    if len(y) < 2:
        continue
    for i, j in combinations(range(len(y)), 2):
        same_team_corrs.append((y[i], y[j]))

if same_team_corrs:
    arr_t = np.array(same_team_corrs)
    st_corr = np.corrcoef(arr_t[:, 0], arr_t[:, 1])[0, 1]
    p_both_t = (arr_t[:, 0] * arr_t[:, 1]).mean()
    p_at = arr_t[:, 0].mean()
    print(f"\n  Same-team pairs: {len(same_team_corrs):,}")
    print(f"  Correlation (HR_i, HR_j | same team+game): {st_corr:+.4f}")
    print(f"  P(both HR)={p_both_t:.4f}  P(A)*P(B)={p_at**2:.4f}  Lift={p_both_t/(p_at**2):.3f}x")

# Cross-game correlation (should be ~0, sanity check)
cross_corrs_sample = []
dates = has_odds["game_date"].unique()[:30]
for d in dates:
    day_df = has_odds[has_odds["game_date"] == d]
    games  = day_df["game_pk"].unique()
    if len(games) < 2:
        continue
    for g1, g2 in list(combinations(games, 2))[:5]:
        p1 = day_df[day_df["game_pk"] == g1]["did_hr"].values
        p2 = day_df[day_df["game_pk"] == g2]["did_hr"].values
        if len(p1) > 0 and len(p2) > 0:
            # Sample one player from each game
            cross_corrs_sample.append((p1[0], p2[0]))

if cross_corrs_sample:
    arr_c = np.array(cross_corrs_sample)
    xg_corr = np.corrcoef(arr_c[:, 0], arr_c[:, 1])[0, 1] if len(arr_c) > 2 else float("nan")
    print(f"\n  Cross-game pairs (sanity): {len(cross_corrs_sample)}")
    print(f"  Correlation (HR_i, HR_j | different games): {xg_corr:+.4f}  (expected ≈0)")

print(f"\n  KEY FINDING: Same-team HR outcomes are {'positively' if st_corr > 0 else 'negatively'} correlated")
print(f"  This {'HELPS' if st_corr > 0 else 'HURTS'} round robins vs independent assumption")
print(f"  RR math assumes independence — actual correlation = {st_corr:+.4f}")

# ── Main RR simulation ────────────────────────────────────────────────────────
THRESHOLDS = [0.25, 0.28, 0.30, 0.32]
STRUCTURES = [
    (5,  2), (5,  3),
    (8,  2), (8,  3),
    (10, 2), (10, 3),
]

all_results = {}

print("\n" + "═"*60)
print("  ROUND ROBIN SIMULATION (2025 holdout, 182 days)")
print("═"*60)

for threshold in THRESHOLDS:
    print(f"\n{'─'*60}")
    print(f"  Model probability threshold: ≥{threshold:.0%}")
    print(f"{'─'*60}")

    threshold_results = {}

    # Eligible players per day (has model prob AND market odds AND above threshold)
    eligible = has_odds[has_odds["model_prob"] >= threshold].copy()
    eligible = eligible.sort_values(["game_date", "model_prob"], ascending=[True, False])

    days_with_bets = eligible["game_date"].nunique()
    avg_players    = eligible.groupby("game_date").size().mean()
    print(f"  Days with ≥1 qualifying player: {days_with_bets}/182")
    print(f"  Avg qualifying players/day: {avg_players:.1f}")

    # Straight-bet baseline at this threshold
    straight_daily = []
    for date, day_df in eligible.groupby("game_date"):
        day_df = day_df.sort_values("model_prob", ascending=False)
        stake, payout, n = straight_bet_day(day_df, top_n=999)
        if stake > 0:
            straight_daily.append({
                "date": date, "stake": stake, "payout": payout,
                "roi": (payout - stake) / stake,
            })

    if straight_daily:
        s_df = pd.DataFrame(straight_daily)
        s_roi = (s_df["payout"].sum() - s_df["stake"].sum()) / s_df["stake"].sum()
        s_avg = s_df["roi"].mean()
        s_med = s_df["roi"].median()
        s_pct = (s_df["roi"] > 0).mean()
        s_worst = s_df["roi"].min()
        print(f"\n  Straight bets (all ≥{threshold:.0%}):  cumROI={s_roi:+.1%}  "
              f"avgDay={s_avg:+.1%}  median={s_med:+.1%}  "
              f"pct_profit={s_pct:.1%}  worst={s_worst:+.1%}")
        threshold_results["straight"] = {
            "cum_roi": s_roi, "avg_daily_roi": s_avg,
            "median_daily_roi": s_med, "pct_profitable_days": s_pct,
            "worst_day": s_worst, "total_bets": int(s_df["stake"].sum()),
        }

    # RR structures
    for top_n, legs in STRUCTURES:
        daily_records = []
        days_below_topn = 0

        for date, day_df in eligible.groupby("game_date"):
            day_df = day_df.sort_values("model_prob", ascending=False)

            if len(day_df) < legs:
                days_below_topn += 1
                continue

            stake, payout, n_hit, n_combos = simulate_rr_day(day_df, top_n, legs)
            if stake == 0:
                days_below_topn += 1
                continue

            daily_records.append({
                "date":     date,
                "stake":    stake,
                "payout":   payout,
                "n_hit":    n_hit,
                "n_combos": n_combos,
                "n_players": min(len(day_df), top_n),
                "roi":      (payout - stake) / stake,
            })

        if not daily_records:
            print(f"  top{top_n}x{legs}: No qualifying days")
            continue

        rec_df = pd.DataFrame(daily_records)

        cum_roi     = (rec_df["payout"].sum() - rec_df["stake"].sum()) / rec_df["stake"].sum()
        avg_roi     = rec_df["roi"].mean()
        med_roi     = rec_df["roi"].median()
        pct_profit  = (rec_df["roi"] > 0).mean()
        worst_day   = rec_df["roi"].min()
        total_stake = int(rec_df["stake"].sum())
        total_hit   = int(rec_df["n_hit"].sum())
        total_combos= int(rec_df["n_combos"].sum())
        hit_rate    = total_hit / total_combos if total_combos > 0 else 0
        avg_combos  = rec_df["n_combos"].mean()

        label = f"top{top_n}x{legs}"
        print(f"  {label:<12}  cumROI={cum_roi:+.1%}  avgDay={avg_roi:+.1%}  "
              f"median={med_roi:+.1%}  pct%={pct_profit:.1%}  "
              f"worst={worst_day:+.1%}  combos/day≈{avg_combos:.0f}  "
              f"hit%={hit_rate:.2%}  n={total_stake}")

        threshold_results[label] = {
            "top_n": top_n, "legs": legs,
            "cum_roi": round(cum_roi, 5),
            "avg_daily_roi": round(avg_roi, 5),
            "median_daily_roi": round(med_roi, 5),
            "pct_profitable_days": round(pct_profit, 4),
            "worst_day": round(worst_day, 5),
            "avg_combos_per_day": round(avg_combos, 1),
            "hit_rate": round(hit_rate, 5),
            "total_stake": total_stake,
            "total_combos_hit": total_hit,
            "total_combos": total_combos,
            "days_skipped_insufficient_players": days_below_topn,
        }

    all_results[str(threshold)] = threshold_results

# ── Best structure summary ────────────────────────────────────────────────────
print(f"\n{'═'*60}")
print("  SUMMARY: BEST STRUCTURE PER THRESHOLD (by cumulative ROI)")
print(f"{'═'*60}")
print(f"  {'Threshold':<12}  {'Best structure':<15}  {'CumROI':>8}  {'vs Straight':>12}  {'AvgDay':>8}  {'Worst':>8}  {'%Profit':>8}")

for thresh_str, t_results in all_results.items():
    straight_roi = t_results.get("straight", {}).get("cum_roi", 0.0)
    rr_only = {k: v for k, v in t_results.items() if k != "straight" and isinstance(v, dict)}
    if not rr_only:
        continue
    best_k  = max(rr_only, key=lambda k: rr_only[k]["cum_roi"])
    best    = rr_only[best_k]
    vs_str  = best["cum_roi"] - straight_roi
    print(f"  {thresh_str:<12}  {best_k:<15}  {best['cum_roi']:>+8.1%}  "
          f"{vs_str:>+12.1%}  {best['avg_daily_roi']:>+8.1%}  "
          f"{best['worst_day']:>+8.1%}  {best['pct_profitable_days']:>8.1%}")

# ── Recommendation ────────────────────────────────────────────────────────────
print(f"\n{'═'*60}")
print("  RECOMMENDATION")
print(f"{'═'*60}")

# Find the globally best RR structure
global_best_roi  = -999
global_best_key  = None
global_best_thresh = None
for thresh_str, t_results in all_results.items():
    for k, v in t_results.items():
        if k == "straight" or not isinstance(v, dict):
            continue
        if v["cum_roi"] > global_best_roi:
            global_best_roi = v["cum_roi"]
            global_best_key = k
            global_best_thresh = thresh_str

best_straight_roi = max(
    all_results[t].get("straight", {}).get("cum_roi", -999)
    for t in all_results
)

if global_best_roi > best_straight_roi:
    margin = global_best_roi - best_straight_roi
    print(f"  ✅ ROUND ROBINS WIN: best structure {global_best_key} at threshold={global_best_thresh}")
    print(f"     CumROI={global_best_roi:+.1%} vs best straight={best_straight_roi:+.1%} (+{margin:.1%} margin)")
else:
    margin = best_straight_roi - global_best_roi
    print(f"  📊 STRAIGHT BETS WIN: best straight ROI={best_straight_roi:+.1%}")
    print(f"     Best RR={global_best_roi:+.1%} ({-margin:.1%} margin)")
    print(f"  Reason: RR variance amplification eats the edge faster than it compounds it.")

print(f"\n  Correlation impact:")
print(f"  Same-team HR correlation={st_corr:+.4f}")
if st_corr > 0.02:
    print(f"  Positive correlation HELPS RR: when one teammate hits, others more likely to.")
    print(f"  Actual RR payouts exceed independence assumption by ~{(p_both_t/(p_at**2)-1)*100:.1f}%")
elif st_corr < -0.02:
    print(f"  Negative correlation HURTS RR vs independent assumption.")
else:
    print(f"  Near-zero correlation: RR independence assumption is approximately valid.")

# ── Save ──────────────────────────────────────────────────────────────────────
output = {
    "simulation_date": "2025-holdout",
    "n_test_days": 182,
    "correlation": {
        "same_game": round(float(sg_corr), 5),
        "same_team_same_game": round(float(st_corr), 5),
        "cross_game_sanity": round(float(xg_corr), 5) if not math.isnan(xg_corr) else None,
        "same_team_lift": round(float(p_both_t / (p_at**2)), 4),
    },
    "results_by_threshold": all_results,
    "recommendation": {
        "best_rr_structure": global_best_key,
        "best_rr_threshold": global_best_thresh,
        "best_rr_cum_roi": round(global_best_roi, 5),
        "best_straight_cum_roi": round(best_straight_roi, 5),
        "rr_wins": global_best_roi > best_straight_roi,
    },
}
OUT_PATH.write_text(json.dumps(output, indent=2, default=str))
print(f"\n✅ Results saved → {OUT_PATH}")
