#!/usr/bin/env python3
"""
Decision 2 — RR Sort Validation Backtest
=========================================
Compares pure-EV sort vs RR-optimized sort (60% model_prob + 40% norm_odds)
on 2025 holdout days where the qualifying pool after rolling cap exceeded TOP_N.

Methodology
-----------
1. Fit production model on 2022-2023 train, 2024 val (same split as all prior scripts).
2. Simulate the live pipeline day-by-day through 2025 holdout:
   - Compute ev = model_prob / market_prob - 1 for all players with odds.
   - Apply rolling cap (max 4 appearances in 7-day window per player).
   - Identify "overflow days": days where len(cap_filtered) > TOP_N (5).
3. On overflow days only, compare:
   - Method A (current): pure EV sort → top 5
   - Method B (proposed): 60% model_prob + 40% norm_odds sort → top 5
4. For both methods, simulate C(5,2)=10 two-leg RR combos using actual did_hr outcomes.
5. Report:
   - N overflow days
   - Mean qualifying odds per method (must improve for Method B)
   - Cumulative RR ROI per method (Method B must not degrade >2pp vs Method A)
   - Per-day breakdown table

Gate: Method B implemented only if:
  - mean_odds_B > mean_odds_A   (any improvement)
  - cumROI_B >= cumROI_A - 0.02 (no more than -2pp degradation)
"""

import json
import math
import pathlib
import sys
from collections import defaultdict, deque
from itertools import combinations
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from xgboost import XGBClassifier

ROOT = pathlib.Path(__file__).parent.parent.parent

# ── Constants (mirror mlb-slate-v3.mjs) ──────────────────────────────────────
EV_THRESHOLD   = 0.25   # qualifying EV floor
EV_FLOOR_RR    = 0.20   # slight EV floor when pool > TOP_N (Decision 2 spec)
TOP_N          = 5      # players per RR combo set
CAP_WINDOW     = 7      # days
CAP_MAX        = 4      # max appearances in window
RR_LEGS        = 2      # 2-leg parlays
UNIT           = 1.0    # 1 unit base stake per combo

# ── Feature order (production 9-feature model) ────────────────────────────────
FEATURES = [
    "hr_rate_bayes",
    "barrel_pct",
    "hard_hit_pct",
    "pitcher_barrel",
    "pitcher_rv100",
    "pitcher_hrfb",
    "park_hr_factor",
    "temp_adj",
    "wind_adj",
]

BEST_PARAMS = {
    "n_estimators":     400,
    "max_depth":        3,
    "learning_rate":    0.05,
    "subsample":        0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 10,
    "gamma":            1.0,
    "reg_alpha":        0.1,
    "reg_lambda":       1.0,
    "use_label_encoder": False,
    "eval_metric":      "logloss",
    "random_state":     42,
    "n_jobs":           -1,
}


# ════════════════════════════════════════════════════════════════════════════
# 1. Load feature matrix + build model
# ════════════════════════════════════════════════════════════════════════════

print("=" * 64)
print("  RR Sort Validation — Decision 2 Backtest")
print("=" * 64)

fm_path = ROOT / "data/mlb_v3/feature_matrix.parquet"
if not fm_path.exists():
    print(f"❌ Feature matrix not found at {fm_path}")
    sys.exit(1)

df_full = pd.read_parquet(fm_path)
print(f"Loaded feature matrix: {len(df_full):,} rows, {df_full.shape[1]} cols")

# ── Derived features (same as train_mlb_v3.py) ────────────────────────────

GLOBAL_MEAN_HR = df_full[df_full["season"] < 2025]["did_hr"].mean()
PRIOR_ALPHA    = 200 * GLOBAL_MEAN_HR
PRIOR_BETA     = 200 * (1 - GLOBAL_MEAN_HR)

def make_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    # Bayesian HR rate
    hr_total = out["hr_rate_std"] * out["pa_std"]
    out["hr_rate_bayes"] = (
        (hr_total + PRIOR_ALPHA) / (out["pa_std"] + PRIOR_ALPHA + PRIOR_BETA)
    ).fillna(GLOBAL_MEAN_HR)

    # Fill nulls with global medians (train-set)
    for col in FEATURES:
        if col in out.columns and out[col].isna().any():
            med = df_full[df_full["season"] < 2025][col].median() if col in df_full.columns else 0
            out[col] = out[col].fillna(med)

    # Weather adjustments
    if "temp_f" in out.columns:
        out["temp_adj"] = out["temp_f"].fillna(70).clip(40, 100).apply(
            lambda t: (t - 70) * 0.003
        )
    else:
        out["temp_adj"] = 0.0

    if "wind_out_mph" in out.columns:
        out["wind_adj"] = out["wind_out_mph"].fillna(0).clip(-20, 20).apply(
            lambda w: w * 0.002
        )
    else:
        out["wind_adj"] = 0.0

    return out


df_full = make_features(df_full)

# ── Train/val/test split ───────────────────────────────────────────────────
train = df_full[df_full["season"].isin([2022, 2023])]
val   = df_full[df_full["season"] == 2024]
test  = df_full[df_full["season"] == 2025].copy()

print(f"Train: {len(train):,}  Val: {len(val):,}  Test(2025): {len(test):,}")

# ── Fit model ─────────────────────────────────────────────────────────────
print("\nFitting XGBoost on train 2022-2023 ...")
X_train = train[FEATURES].values
y_train = train["did_hr"].values
model = XGBClassifier(**BEST_PARAMS)
model.fit(X_train, y_train, verbose=False)

# ── Fit calibrator on validation set ────────────────────────────────────
print("Fitting isotonic calibrator on val 2024 ...")
X_val = val[FEATURES].values
raw_val = model.predict_proba(X_val)[:, 1]
iso = IsotonicRegression(out_of_bounds="clip")
iso.fit(raw_val, val["did_hr"].values)

# ── Score 2025 test set ──────────────────────────────────────────────────
print("Scoring 2025 holdout ...")
X_test = test[FEATURES].values
raw_test = model.predict_proba(X_test)[:, 1]
test["model_prob"] = iso.transform(raw_test)

# Only keep rows with market_prob (have live odds)
test_odds = test[test["market_prob"].notna()].copy()
test_odds["ev"] = test_odds["model_prob"] / test_odds["market_prob"] - 1.0

print(f"  2025 rows with market odds: {len(test_odds):,}")
print(f"  Qualifying (EV≥{EV_THRESHOLD}): {(test_odds['ev']>=EV_THRESHOLD).sum():,}")


# ════════════════════════════════════════════════════════════════════════════
# 2. Reconstruct American odds from market_prob
# ════════════════════════════════════════════════════════════════════════════
# market_prob = implied prob. Back-convert to American for norm_odds scoring.
# For prob < 0.5: odds = (100 / prob) - 100  (positive)
# For prob >= 0.5: odds = -(prob / (1-prob)) * 100  (negative)

def prob_to_american(prob: float) -> float:
    """Convert implied probability to American odds."""
    if prob <= 0 or prob >= 1:
        return 100.0
    if prob < 0.5:
        return (100.0 / prob) - 100.0
    else:
        return -prob / (1.0 - prob) * 100.0

test_odds["american_odds"] = test_odds["market_prob"].apply(prob_to_american)


# ════════════════════════════════════════════════════════════════════════════
# 3. Rolling cap simulation (stateful, replays day-by-day)
# ════════════════════════════════════════════════════════════════════════════

def apply_rolling_cap(
    qualified: pd.DataFrame,  # filtered EV≥threshold for this day
    game_date: str,
    appearance_log: dict,     # player_id → deque of date strings
) -> tuple[pd.DataFrame, list[int]]:
    """
    Mirror of mlb-slate-v3.mjs applyRollingCap().
    Returns (cap_filtered_df, capped_out_ids).
    Mutates appearance_log in place.
    """
    cutoff = (datetime.strptime(game_date, "%Y-%m-%d") - timedelta(days=CAP_WINDOW)).strftime("%Y-%m-%d")

    passed = []
    capped = []
    for _, row in qualified.iterrows():
        pid = int(row["player_id"])
        history = appearance_log.setdefault(pid, deque())
        # Prune old entries
        while history and history[0] <= cutoff:
            history.popleft()
        if len(history) < CAP_MAX:
            passed.append(row)
        else:
            capped.append(pid)

    if passed:
        return pd.DataFrame(passed), capped
    else:
        return qualified.iloc[0:0].copy(), capped  # empty with correct columns


def record_appearances(top5: pd.DataFrame, game_date: str, appearance_log: dict) -> None:
    """Record top-5 players in appearance log (same as JS backend)."""
    for _, row in top5.iterrows():
        pid = int(row["player_id"])
        appearance_log.setdefault(pid, deque()).append(game_date)


# ════════════════════════════════════════════════════════════════════════════
# 4. RR outcome simulation
# ════════════════════════════════════════════════════════════════════════════

def american_to_decimal(american: float) -> float:
    """Convert American odds to decimal."""
    if american >= 100:
        return 1.0 + american / 100.0
    else:
        return 1.0 + 100.0 / abs(american)


def simulate_rr(top5_df: pd.DataFrame, legs: int = RR_LEGS) -> dict:
    """
    Simulate C(n, legs) RR parlays from top5.
    Each leg: american_odds for payout.
    Returns dict with total_stake, total_payout, profit, roi.
    """
    players = top5_df.to_dict("records")
    n = len(players)
    if n < legs:
        return {"combos": 0, "stake": 0, "profit": 0, "roi": None}

    total_stake  = 0.0
    total_profit = 0.0

    for combo in combinations(range(n), legs):
        legs_players = [players[i] for i in combo]
        stake = UNIT
        total_stake += stake

        # Parlay wins only if ALL legs hit HR
        all_hit = all(p.get("did_hr", 0) == 1 for p in legs_players)
        if all_hit:
            payout = stake
            for p in legs_players:
                payout *= american_to_decimal(p["american_odds"])
            total_profit += payout - stake
        else:
            total_profit -= stake

    roi = total_profit / total_stake if total_stake > 0 else None
    return {
        "combos":  len(list(combinations(range(n), legs))),
        "stake":   total_stake,
        "profit":  total_profit,
        "roi":     roi,
    }


# ════════════════════════════════════════════════════════════════════════════
# 5. Sort functions
# ════════════════════════════════════════════════════════════════════════════

def norm_odds(american: float) -> float:
    """Normalise American odds to [0, 1]. Same formula as Decision 2 spec."""
    return min(1.0, (american - 150.0) / 650.0)


def sort_pure_ev(pool: pd.DataFrame) -> pd.DataFrame:
    """Sort by EV descending, take top 5."""
    if pool.empty or "ev" not in pool.columns:
        return pool
    return pool.sort_values("ev", ascending=False).head(TOP_N)


def sort_rr_optimized(pool: pd.DataFrame) -> pd.DataFrame:
    """
    Decision 2 proposed sort: 60% model_prob + 40% norm_odds.
    Apply EV floor of 0.20, then sort, take top 5.
    """
    if pool.empty:
        return pool
    floored = pool[pool["ev"] >= EV_FLOOR_RR].copy()
    if len(floored) == 0:
        # Fallback to pure EV if floor wipes everyone
        return sort_pure_ev(pool)
    floored["rr_score"] = (
        floored["model_prob"] * 0.60
        + floored["american_odds"].apply(norm_odds) * 0.40
    )
    return floored.sort_values("rr_score", ascending=False).head(TOP_N)


# ════════════════════════════════════════════════════════════════════════════
# 6. Day-by-day simulation
# ════════════════════════════════════════════════════════════════════════════

dates = sorted(test_odds["game_date"].unique())
print(f"\nSimulating {len(dates)} dates in 2025 holdout with market odds...")

# Two separate appearance logs (one per method — they diverge on overflow days)
log_ev  = {}   # Method A: pure EV
log_rr  = {}   # Method B: RR-optimized

overflow_days = []   # days where cap_filtered > TOP_N

# All-days accumulators (both methods see all same qualifying picks)
results_ev = []
results_rr = []

for date_str in dates:
    day = test_odds[test_odds["game_date"] == date_str].copy()

    # Qualifying picks (EV ≥ 25%)
    qualified = day[day["ev"] >= EV_THRESHOLD].copy()
    if len(qualified) == 0:
        continue

    # ── Method A rolling cap ──────────────────────────────────────────────
    cap_a, capped_a = apply_rolling_cap(qualified, date_str, log_ev)
    top5_a = sort_pure_ev(cap_a)
    record_appearances(top5_a, date_str, log_ev)

    # ── Method B rolling cap ──────────────────────────────────────────────
    cap_b, capped_b = apply_rolling_cap(qualified, date_str, log_rr)
    if len(cap_b) > TOP_N:
        # OVERFLOW: use RR-optimized sort
        top5_b = sort_rr_optimized(cap_b)
        is_overflow = True
    else:
        # No overflow: same as pure EV
        top5_b = sort_pure_ev(cap_b)
        is_overflow = False

    record_appearances(top5_b, date_str, log_rr)

    if len(top5_a) < 2 or len(top5_b) < 2:
        continue

    # ── Simulate RR outcomes ─────────────────────────────────────────────
    rr_a = simulate_rr(top5_a)
    rr_b = simulate_rr(top5_b)

    # Mean American odds of top-5 selections
    mean_odds_a = top5_a["american_odds"].mean()
    mean_odds_b = top5_b["american_odds"].mean()

    # Players selected
    names_a = top5_a["player_name"].tolist()
    names_b = top5_b["player_name"].tolist()

    day_rec_ev = {
        "date":       date_str,
        "n_qual":     len(qualified),
        "n_cap_pass": len(cap_a),
        "is_overflow": is_overflow,
        "method":     "pure_ev",
        "top5_names": names_a,
        "mean_odds":  mean_odds_a,
        "combos":     rr_a["combos"],
        "stake":      rr_a["stake"],
        "profit":     rr_a["profit"],
        "roi":        rr_a["roi"],
    }
    day_rec_rr = {
        "date":       date_str,
        "n_qual":     len(qualified),
        "n_cap_pass": len(cap_b),
        "is_overflow": is_overflow,
        "method":     "rr_optimized",
        "top5_names": names_b,
        "mean_odds":  mean_odds_b,
        "combos":     rr_b["combos"],
        "stake":      rr_b["stake"],
        "profit":     rr_b["profit"],
        "roi":        rr_b["roi"],
    }

    results_ev.append(day_rec_ev)
    results_rr.append(day_rec_rr)

    if is_overflow:
        overflow_days.append({
            "date":        date_str,
            "pool_size":   len(cap_b),
            "method_a":    {"names": names_a, "mean_odds": round(mean_odds_a, 1), "roi": rr_a["roi"]},
            "method_b":    {"names": names_b, "mean_odds": round(mean_odds_b, 1), "roi": rr_b["roi"]},
            "odds_delta":  round(mean_odds_b - mean_odds_a, 1),
            "roi_delta":   round((rr_b["roi"] or 0) - (rr_a["roi"] or 0), 4),
        })


# ════════════════════════════════════════════════════════════════════════════
# 7. Results compilation
# ════════════════════════════════════════════════════════════════════════════

def summarise(records: list[dict], label: str) -> dict:
    """Compute aggregate stats across all days."""
    total_stake  = sum(r["stake"]  for r in records)
    total_profit = sum(r["profit"] for r in records)
    all_odds     = [r["mean_odds"] for r in records if r["mean_odds"] is not None]
    over_records = [r for r in records if r["is_overflow"]]

    return {
        "label":          label,
        "n_days":         len(records),
        "n_overflow_days":len(over_records),
        "total_combos":   sum(r["combos"] for r in records),
        "total_stake":    round(total_stake, 2),
        "total_profit":   round(total_profit, 4),
        "cum_roi":        round(total_profit / total_stake, 4) if total_stake > 0 else None,
        "mean_top5_odds": round(np.mean(all_odds), 1) if all_odds else None,
        "median_top5_odds": round(np.median(all_odds), 1) if all_odds else None,
        # overflow-day specific stats
        "overflow_cum_roi": round(
            sum(r["profit"] for r in over_records) / sum(r["stake"] for r in over_records), 4
        ) if over_records and sum(r["stake"] for r in over_records) > 0 else None,
        "overflow_mean_odds": round(
            np.mean([r["mean_odds"] for r in over_records]), 1
        ) if over_records else None,
    }


summary_ev = summarise(results_ev, "pure_ev")
summary_rr = summarise(results_rr, "rr_optimized")

print(f"\n{'═'*64}")
print("  RESULTS")
print(f"{'═'*64}")

print(f"\n  Total simulation days (with qualifying picks): {summary_ev['n_days']}")
print(f"  Overflow days (pool > {TOP_N} after cap):       {len(overflow_days)}")

print(f"\n  {'Metric':<30}  {'Pure EV':>12}  {'RR-Optimized':>12}  {'Delta':>10}")
print(f"  {'-'*68}")

metrics = [
    ("Cumulative ROI (all days)",    "cum_roi",             True),
    ("Mean top-5 odds (all days)",   "mean_top5_odds",      True),
    ("Median top-5 odds (all days)", "median_top5_odds",    True),
    ("Overflow days ROI",            "overflow_cum_roi",    True),
    ("Overflow days mean odds",      "overflow_mean_odds",  True),
    ("Total combos",                 "total_combos",        False),
    ("Total stake (units)",          "total_stake",         False),
    ("Total profit (units)",         "total_profit",        True),
]

for label, key, show_delta in metrics:
    va = summary_ev.get(key)
    vb = summary_rr.get(key)
    if va is None and vb is None:
        continue
    sa = f"{va:+.4f}" if isinstance(va, float) else str(va) if va is not None else "N/A"
    sb = f"{vb:+.4f}" if isinstance(vb, float) else str(vb) if vb is not None else "N/A"
    if show_delta and isinstance(va, (int, float)) and isinstance(vb, (int, float)):
        delta = vb - va
        sd = f"{delta:+.4f}"
    else:
        sd = ""
    print(f"  {label:<30}  {sa:>12}  {sb:>12}  {sd:>10}")


# ── Gate evaluation ────────────────────────────────────────────────────────
print(f"\n{'═'*64}")
print("  GATE EVALUATION")
print(f"{'═'*64}")

roi_a = summary_ev["cum_roi"] or 0
roi_b = summary_rr["cum_roi"] or 0
odds_a = summary_ev["mean_top5_odds"] or 0
odds_b = summary_rr["mean_top5_odds"] or 0

gate_odds = odds_b > odds_a
gate_roi  = roi_b >= roi_a - 0.02   # no more than -2pp degradation

print(f"\n  Gate 1 — Mean odds improve:           {odds_b:.1f} vs {odds_a:.1f}  → {'✅ PASS' if gate_odds else '❌ FAIL'}")
print(f"  Gate 2 — ROI does not degrade >2pp:   {roi_b:+.4f} vs {roi_a:+.4f}  → {'✅ PASS' if gate_roi else '❌ FAIL'}")

if gate_odds and gate_roi:
    verdict = "✅ VALIDATED — Decision 2 approved for implementation"
else:
    verdict = "❌ NOT VALIDATED — Revert to pure EV sort"

print(f"\n  VERDICT: {verdict}")


# ── Overflow day detail ────────────────────────────────────────────────────
if overflow_days:
    print(f"\n{'═'*64}")
    print(f"  OVERFLOW DAY BREAKDOWN (n={len(overflow_days)})")
    print(f"{'═'*64}")
    print(f"\n  {'Date':<12}  {'Pool':>4}  {'Odds_A':>7}  {'Odds_B':>7}  {'ΔODDS':>7}  {'ROI_A':>7}  {'ROI_B':>7}  {'ΔROI':>7}")
    print(f"  {'-'*70}")
    for day in sorted(overflow_days, key=lambda d: d["date"]):
        oa = day["method_a"]["mean_odds"]
        ob = day["method_b"]["mean_odds"]
        ra = day["method_a"]["roi"]
        rb = day["method_b"]["roi"]
        sa = f"{ra:+.3f}" if ra is not None else "  N/A"
        sb = f"{rb:+.3f}" if rb is not None else "  N/A"
        sd = f"{day['roi_delta']:+.3f}"
        print(f"  {day['date']:<12}  {day['pool_size']:>4}  {oa:>7.1f}  {ob:>7.1f}  {day['odds_delta']:>+7.1f}  {sa:>7}  {sb:>7}  {sd:>7}")
else:
    print("\n  ⚠ No overflow days found in 2025 holdout with available odds data.")
    print("     (This is expected if market odds file coverage is sparse.)")
    print("     Cannot validate Decision 2 statistically — insufficient overflow days.")


# ── Save results ──────────────────────────────────────────────────────────
out_dir = ROOT / "data/mlb_v3"
out_path = out_dir / "rr_sort_validation.json"

output = {
    "run_at":          datetime.utcnow().isoformat() + "Z",
    "config": {
        "ev_threshold":  EV_THRESHOLD,
        "ev_floor_rr":   EV_FLOOR_RR,
        "top_n":         TOP_N,
        "cap_window":    CAP_WINDOW,
        "cap_max":       CAP_MAX,
        "rr_legs":       RR_LEGS,
    },
    "summary": {
        "pure_ev":      summary_ev,
        "rr_optimized": summary_rr,
    },
    "gates": {
        "odds_improve":  gate_odds,
        "roi_no_degrade": gate_roi,
        "validated":     gate_odds and gate_roi,
        "verdict":       verdict,
    },
    "overflow_days":    overflow_days,
    "n_overflow_days":  len(overflow_days),
}

out_path.write_text(json.dumps(output, indent=2, default=str))
print(f"\n✅ Results saved → {out_path}")
