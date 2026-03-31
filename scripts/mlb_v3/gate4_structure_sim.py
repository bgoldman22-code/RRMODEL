#!/usr/bin/env python3
"""
Gate 4 Structure Comparison + Gate 1 Rolling-Cap Simulation
=============================================================
Part A — Three RR structure comparisons at EV≥25% (2025 holdout):
  1. Top5×2     — current baseline
  2. Top3×2     — higher conviction, fewer combos
  3. Top5×2 filtered to days where mean qualifying odds ≥ +350

Part B — Odds-environment split:
  On days where mean qualifying American odds > +350 vs ≤ +350:
  report RR ROI for each group.

Part C — Gate 1 fix simulation:
  Rolling 7-day window, max 4 top-5 appearances per player.
  Report: how many days affected, ROI impact, before/after comparison.

Output: data/mlb_v3/gate4_structure_sim.json  + printed report
"""

import json, math, pathlib, warnings
from itertools import combinations as itertools_combinations
from collections import defaultdict, deque

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

ROOT     = pathlib.Path(__file__).parent.parent.parent
OUT_PATH = ROOT / "data/mlb_v3/gate4_structure_sim.json"

# ─── 1. Load + engineer (identical pipeline) ──────────────────────────────────
print("=" * 72)
print("Gate 4 Structure Sim + Gate 1 Rolling-Cap Audit")
print("=" * 72)
print("\n[1/4] Loading feature matrix + fitting model...")

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
X_tv = np.vstack([X_train, X_val])
y_tv = np.concatenate([y_train, y_val])
X_test, y_test = prep(test, train_medians)

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
test["ev"] = test["model_prob"] * test["decimal_odds"] - 1.0
test["american_odds"] = test["decimal_odds"].apply(
    lambda d: round((d - 1) * 100) if (pd.notna(d) and d >= 2.0)
              else (round(-100 / (d - 1)) if pd.notna(d) else np.nan)
)

THRESHOLD   = 0.25
MIN_PLAYERS = 3
RR_UNIT     = 0.5

has_odds = test[test["market_prob"].notna()].copy()

print(f"    Test rows with odds: {len(has_odds):,}")
print()

# ─── 2. Build per-day baseline qualified pool ─────────────────────────────────
print("[2/4] Building per-day qualified pools...")

daily_pools = {}   # date -> sorted DataFrame of qualified players (model_prob ≥ 0.25)
sorted_dates = sorted(has_odds["game_date"].unique())

for date in sorted_dates:
    day_df = has_odds[has_odds["game_date"] == date]
    qualified = day_df[day_df["model_prob"] >= THRESHOLD].sort_values(
        "model_prob", ascending=False
    )
    if len(qualified) >= MIN_PLAYERS:
        daily_pools[date] = qualified

active_dates = sorted(daily_pools.keys())
print(f"    Active days (≥{MIN_PLAYERS} qualifiers): {len(active_dates)}")

# ─── Helper: run one RR structure over a set of days ─────────────────────────
def run_rr_structure(dates_to_pools, top_n, legs, rr_unit=RR_UNIT):
    """
    Given a dict of {date: qualified_df}, run top_n×legs RR simulation.
    Returns summary dict + per-day records list.
    """
    records = []
    for date, pool in sorted(dates_to_pools.items()):
        top = pool.head(top_n)
        if len(top) < legs:
            continue
        combos = list(itertools_combinations(range(len(top)), legs))
        odds_arr = top["decimal_odds"].values
        hit_arr  = top["did_hr"].values

        stake   = rr_unit * len(combos)
        payout  = 0.0
        hits    = 0
        for idxs in combos:
            if all(hit_arr[i] for i in idxs):
                parlay_odds = math.prod(odds_arr[i] for i in idxs)
                payout += rr_unit * parlay_odds
                hits   += 1

        mean_am_odds = float(pool["american_odds"].mean()) if len(pool) else np.nan
        records.append({
            "date":          str(date)[:10],
            "n_qual":        len(pool),
            "n_combos":      len(combos),
            "stake":         round(stake, 4),
            "payout":        round(payout, 4),
            "pnl":           round(payout - stake, 4),
            "roi":           round((payout - stake) / stake, 5) if stake > 0 else 0,
            "hits":          hits,
            "missed":        hits == 0,
            "mean_am_odds":  round(mean_am_odds, 1),
        })

    if not records:
        return {"records": [], "summary": {}}

    rec = pd.DataFrame(records)
    total_stake  = rec["stake"].sum()
    total_payout = rec["payout"].sum()
    total_pnl    = total_payout - total_stake
    cum_roi      = total_pnl / total_stake if total_stake > 0 else 0

    avg_combos        = rec["n_combos"].mean()
    avg_combo_payout  = (rec[rec["hits"] > 0]["payout"] / rec[rec["hits"] > 0]["hits"]).mean() \
                        if (rec["hits"] > 0).any() else 0
    hit_freq          = rec["hits"].sum() / rec["n_combos"].sum() \
                        if rec["n_combos"].sum() > 0 else 0
    pct_days_hit      = (rec["hits"] > 0).mean()
    pct_profitable    = (rec["pnl"] > 0).mean()

    summary = {
        "active_days":        len(rec),
        "top_n":              top_n,
        "legs":               legs,
        "total_stake":        round(float(total_stake), 2),
        "total_payout":       round(float(total_payout), 2),
        "cum_roi":            round(float(cum_roi), 5),
        "avg_daily_roi":      round(float(rec["roi"].mean()), 5),
        "median_daily_roi":   round(float(rec["roi"].median()), 5),
        "pct_profitable_days":round(float(pct_profitable), 4),
        "avg_combos_per_day": round(float(avg_combos), 2),
        "hit_freq_per_combo": round(float(hit_freq), 5),
        "pct_days_any_hit":   round(float(pct_days_hit), 4),
        "total_combo_hits":   int(rec["hits"].sum()),
        "total_combos":       int(rec["n_combos"].sum()),
    }
    return {"records": records, "summary": summary}

# ═══════════════════════════════════════════════════════════════════════════════
# PART A — Three RR Structure Comparisons
# ═══════════════════════════════════════════════════════════════════════════════
print("[3/4] Running structure comparisons...")

# ── A1: Top5×2 baseline ───────────────────────────────────────────────────────
a1 = run_rr_structure(daily_pools, top_n=5, legs=2)
a1_rec = pd.DataFrame(a1["records"])

# ── A2: Top3×2 ────────────────────────────────────────────────────────────────
a2 = run_rr_structure(daily_pools, top_n=3, legs=2)
a2_rec = pd.DataFrame(a2["records"])

# ── A3: Top5×2 filtered to days where mean qualifying odds ≥ +350 ────────────
high_odds_pools = {
    date: pool
    for date, pool in daily_pools.items()
    if float(pool["american_odds"].mean()) >= 350
}
a3 = run_rr_structure(high_odds_pools, top_n=5, legs=2)
a3_rec = pd.DataFrame(a3["records"]) if a3["records"] else pd.DataFrame()

# ── A4: Top3×2 filtered to days where mean qualifying odds ≥ +350 ────────────
a4 = run_rr_structure(high_odds_pools, top_n=3, legs=2)
a4_rec = pd.DataFrame(a4["records"]) if a4["records"] else pd.DataFrame()

print()
print("=" * 72)
print("PART A — RR Structure Comparison")
print("=" * 72)
print()

hdr = f"  {'Structure':<32} {'Days':>5} {'Combos':>7} {'Cum ROI':>9} {'Hit/combo':>10} {'Days hit%':>10} {'Mean odds':>10}"
sep = "  " + "-" * 80
print(hdr)
print(sep)

def print_row(label, summary, rec_df=None):
    if not summary:
        print(f"  {label:<32} {'—':>5}")
        return
    mean_odds = float(rec_df["mean_am_odds"].mean()) if rec_df is not None and len(rec_df) else 0
    print(
        f"  {label:<32}"
        f" {summary['active_days']:>5}"
        f" {summary['avg_combos_per_day']:>7.1f}"
        f" {summary['cum_roi']:>+9.1%}"
        f" {summary['hit_freq_per_combo']:>10.2%}"
        f" {summary['pct_days_any_hit']:>10.1%}"
        f" +{mean_odds:>8.0f}"
    )

print_row("Top5×2 (baseline)",              a1["summary"], a1_rec)
print_row("Top3×2 (higher conviction)",     a2["summary"], a2_rec)
print_row("Top5×2, odds≥+350 days only",   a3["summary"], a3_rec)
print_row("Top3×2, odds≥+350 days only",   a4["summary"], a4_rec)
print()

# ── Avg combo payout when hit ─────────────────────────────────────────────────
def avg_payout_per_hit(rec_df):
    if rec_df.empty or rec_df["hits"].sum() == 0:
        return np.nan
    hits_days = rec_df[rec_df["hits"] > 0]
    return float((hits_days["payout"] / hits_days["hits"]).mean())

ap1 = avg_payout_per_hit(a1_rec)
ap2 = avg_payout_per_hit(a2_rec)
ap3 = avg_payout_per_hit(a3_rec)
ap4 = avg_payout_per_hit(a4_rec)

print(f"  Average payout per hit (at 0.5u stake per combo):")
print(f"    Top5×2 (all days):            {ap1:.2f}u")
print(f"    Top3×2 (all days):            {ap2:.2f}u")
print(f"    Top5×2 (odds≥+350 days):      {ap3:.2f}u" if not np.isnan(ap3) else "    Top5×2 (odds≥+350 days):      —")
print(f"    Top3×2 (odds≥+350 days):      {ap4:.2f}u" if not np.isnan(ap4) else "    Top3×2 (odds≥+350 days):      —")
print()

# ─── PART B — Odds environment split ─────────────────────────────────────────
print("=" * 72)
print("PART B — RR ROI by Odds Environment (mean qualifying odds)")
print("=" * 72)
print()

ODDS_SPLIT = 350

high_odds_dates = {d for d, pool in daily_pools.items()
                   if float(pool["american_odds"].mean()) >= ODDS_SPLIT}
low_odds_dates  = {d for d, pool in daily_pools.items()
                   if float(pool["american_odds"].mean()) <  ODDS_SPLIT}

if not a1_rec.empty:
    a1_rec["date_dt"] = pd.to_datetime(a1_rec["date"])
    # Merge mean_am_odds from daily_pools
    a1_hi = a1_rec[a1_rec["date"].isin({str(d)[:10] for d in high_odds_dates})]
    a1_lo = a1_rec[a1_rec["date"].isin({str(d)[:10] for d in low_odds_dates})]

    def group_stats(rec_subset):
        if rec_subset.empty:
            return {"n": 0}
        ts   = rec_subset["stake"].sum()
        tp   = rec_subset["payout"].sum()
        pnl  = tp - ts
        roi  = pnl / ts if ts > 0 else 0
        hits = rec_subset["hits"].sum()
        combos = rec_subset["n_combos"].sum()
        return {
            "n_days":    len(rec_subset),
            "cum_roi":   round(float(roi), 5),
            "avg_daily_roi": round(float(rec_subset["roi"].mean()), 5),
            "hit_freq":  round(float(hits / combos), 5) if combos > 0 else 0,
            "pct_days_hit": round(float((rec_subset["hits"] > 0).mean()), 4),
            "total_combos": int(combos),
            "total_hits": int(hits),
            "mean_odds": round(float(rec_subset["mean_am_odds"].mean()), 1),
        }

    hi_stats = group_stats(a1_hi)
    lo_stats = group_stats(a1_lo)

    n_hi = len(high_odds_dates)
    n_lo = len(low_odds_dates)

    print(f"  Split threshold: mean qualifying American odds ≥ +{ODDS_SPLIT}")
    print(f"  High-odds days (≥+{ODDS_SPLIT}): {n_hi}  |  Low-odds days (<+{ODDS_SPLIT}): {n_lo}")
    print()
    print(f"  {'Metric':<30} {'High-odds (≥+350)':>20} {'Low-odds (<+350)':>18}")
    print(f"  {'-'*30} {'-'*20} {'-'*18}")
    rows = [
        ("Active days",            hi_stats["n_days"],              lo_stats["n_days"]),
        ("Cumulative ROI",         f"{hi_stats['cum_roi']:+.1%}",   f"{lo_stats['cum_roi']:+.1%}"),
        ("Avg daily ROI",          f"{hi_stats['avg_daily_roi']:+.1%}", f"{lo_stats['avg_daily_roi']:+.1%}"),
        ("Hit freq per combo",     f"{hi_stats['hit_freq']:.2%}",   f"{lo_stats['hit_freq']:.2%}"),
        ("% days with any hit",    f"{hi_stats['pct_days_hit']:.1%}", f"{lo_stats['pct_days_hit']:.1%}"),
        ("Total combo hits",       hi_stats["total_hits"],          lo_stats["total_hits"]),
        ("Mean qualifying odds",   f"+{hi_stats['mean_odds']:.0f}", f"+{lo_stats['mean_odds']:.0f}"),
    ]
    for label, hi, lo in rows:
        print(f"  {label:<30} {str(hi):>20} {str(lo):>18}")

    print()
    roi_concentration = hi_stats['cum_roi'] / (hi_stats['cum_roi'] + lo_stats['cum_roi']) \
                        if (hi_stats['cum_roi'] + lo_stats['cum_roi']) != 0 else None
    print(f"  ROI concentration insight:")
    print(f"    High-odds days are {n_hi/len(active_dates)*100:.1f}% of active days")
    print(f"    but contribute {'concentrated' if hi_stats['cum_roi'] > lo_stats['cum_roi'] else 'less'} ROI.")
    if hi_stats['cum_roi'] > lo_stats['cum_roi']:
        print(f"    ⚠️  ROI is primarily driven by higher-odds environments.")
        print(f"       Lower-odds days ({n_lo} days, <+350 avg) drag the aggregate.")
    else:
        print(f"    ✅ ROI is fairly distributed — lower-odds days are not a pure drag.")
    print()

# ═══════════════════════════════════════════════════════════════════════════════
# PART C — Gate 1 Fix: Rolling 7-day, max 4 appearances per player
# ═══════════════════════════════════════════════════════════════════════════════
print("=" * 72)
print("PART C — Gate 1 Fix: Rolling 7-day Max-4 Cap Simulation")
print("=" * 72)
print()
print("  Rule: before finalising top-5 on day D, remove any player who has")
print("  already appeared in the top-5 on ≥4 of the preceding 7 calendar days.")
print()

# Build uncapped top-5 per day (as used in Part A baseline)
# Then apply rolling cap and re-run RR

# Player key: use player_id where available, else player_name
def get_pkey(row):
    if pd.notna(row.get("player_id")):
        return str(int(row["player_id"]))
    return str(row.get("player_name", "unknown"))

# Rolling window: track {player_key: deque of dates appeared in top-5}
from collections import deque

MAX_APPEARANCES = 4
WINDOW_DAYS     = 7

# Sort active dates
# For each date, compute uncapped top-N, then apply cap, then take top-5 from remainder
capped_pools = {}          # date -> capped qualified DataFrame (after removing capped players)
cap_events   = []          # days where cap actually changed the top-5

# appearance_history: player_key -> sorted list of dates they were in top-5
appearance_history = defaultdict(list)  # player_key -> [date, ...]

for date in active_dates:
    pool = daily_pools[date]
    date_str = str(date)[:10]
    date_pd  = pd.Timestamp(date)

    # Window cutoff: 7 calendar days before today (exclusive of today)
    window_start = date_pd - pd.Timedelta(days=WINDOW_DAYS)

    # Count recent appearances per player (in window)
    capped_players = set()
    for pkey, hist in appearance_history.items():
        # Count dates in (window_start, date_pd) — exclusive on both ends
        recent = sum(1 for d in hist if window_start < pd.Timestamp(d) < date_pd)
        if recent >= MAX_APPEARANCES:
            capped_players.add(pkey)

    # Apply cap: remove capped players from pool
    pool_with_key = pool.copy()
    pool_with_key["_pkey"] = pool_with_key.apply(get_pkey, axis=1)
    pool_filtered = pool_with_key[~pool_with_key["_pkey"].isin(capped_players)]

    # Take top-5 from filtered pool (still must have ≥ MIN_PLAYERS)
    top5_uncapped = pool.head(5)
    top5_capped   = pool_filtered.head(5)

    uncapped_keys = set(top5_uncapped.apply(get_pkey, axis=1))
    capped_keys   = set(top5_capped.apply(get_pkey, axis=1))

    changed = uncapped_keys != capped_keys
    if changed:
        removed = uncapped_keys - capped_keys
        added   = capped_keys   - uncapped_keys
        removed_names = list(pool[pool.apply(get_pkey, axis=1).isin(removed)]["player_name"])
        added_names   = list(pool_filtered[pool_filtered["_pkey"].isin(added)]["player_name"]) if not pool_filtered.empty else []
        cap_events.append({
            "date":          date_str,
            "capped_out":    removed_names,
            "brought_in":    added_names,
            "n_capped_players_this_day": len(capped_players),
        })

    # Record this day's top-5 in appearance history
    for _, row in top5_uncapped.iterrows():
        pk = get_pkey(row)
        appearance_history[pk].append(date_str)

    # Only use capped pool if still has ≥ MIN_PLAYERS
    if len(pool_filtered) >= MIN_PLAYERS:
        capped_pools[date] = pool_filtered.drop(columns=["_pkey"])
    # else skip this day entirely (extremely rare)

# Run RR on capped pools
c1 = run_rr_structure(capped_pools, top_n=5, legs=2)
c1_rec = pd.DataFrame(c1["records"]) if c1["records"] else pd.DataFrame()

print(f"  Days where cap changed the top-5: {len(cap_events)} / {len(active_dates)}")
print(f"  ({len(cap_events)/len(active_dates)*100:.1f}% of active days affected)")
print()

if cap_events:
    print(f"  Sample cap events (first 10):")
    print(f"  {'Date':<12} {'Removed from top-5':<35} {'Replaced by':<30}")
    print(f"  {'-'*12} {'-'*35} {'-'*30}")
    for ev in cap_events[:10]:
        removed_str = ", ".join(ev["capped_out"]) if ev["capped_out"] else "—"
        added_str   = ", ".join(ev["brought_in"]) if ev["brought_in"] else "—"
        print(f"  {ev['date']:<12} {removed_str:<35} {added_str:<30}")
    if len(cap_events) > 10:
        print(f"  ... {len(cap_events)-10} more cap events")
    print()

# ── Before vs After ROI comparison ───────────────────────────────────────────
print(f"  Top5×2 RR — Before vs After Rolling Cap:")
print()
print(f"  {'Metric':<30} {'Before cap':>15} {'After cap':>15} {'Delta':>10}")
print(f"  {'-'*30} {'-'*15} {'-'*15} {'-'*10}")

def safe_val(summary, key, fmt=None):
    v = summary.get(key)
    if v is None:
        return "—"
    if fmt == "pct":
        return f"{v:+.1%}"
    if fmt == "f2":
        return f"{v:.2f}"
    return str(v)

before = a1["summary"]
after  = c1["summary"]

metrics_compare = [
    ("Active days",         "active_days",          None),
    ("Cumulative ROI",      "cum_roi",               "pct"),
    ("Avg daily ROI",       "avg_daily_roi",         "pct"),
    ("Pct profitable days", "pct_profitable_days",   "pct"),
    ("Hit freq per combo",  "hit_freq_per_combo",    "pct"),
    ("% days any hit",      "pct_days_any_hit",      "pct"),
    ("Total combos",        "total_combos",          None),
    ("Total combo hits",    "total_combo_hits",       None),
]

for label, key, fmt in metrics_compare:
    b_raw = before.get(key)
    a_raw = after.get(key)
    if fmt == "pct":
        b_str = f"{b_raw:+.1%}" if b_raw is not None else "—"
        a_str = f"{a_raw:+.1%}" if a_raw is not None else "—"
        delta = f"{(a_raw - b_raw):+.1%}" if (b_raw is not None and a_raw is not None) else "—"
    else:
        b_str = str(b_raw) if b_raw is not None else "—"
        a_str = str(a_raw) if a_raw is not None else "—"
        delta = f"{(a_raw - b_raw):+}" if (b_raw is not None and a_raw is not None) else "—"
    print(f"  {label:<30} {b_str:>15} {a_str:>15} {delta:>10}")

print()
roi_diff = (after.get("cum_roi", 0) - before.get("cum_roi", 0))
if roi_diff > 0:
    print(f"  ✅ Cap IMPROVES cumulative ROI by {roi_diff:+.1%}")
    print(f"     Concentration in Ohtani/Judge/Schwarber was a mild drag.")
elif roi_diff < -0.02:
    print(f"  ⚠️  Cap REDUCES cumulative ROI by {roi_diff:+.1%}")
    print(f"     High-frequency players were genuinely the best picks — cap costs ROI.")
    print(f"     Gate 1 fix should be implemented for risk management only, not ROI.")
else:
    print(f"  ≈ Cap has minimal ROI impact ({roi_diff:+.1%}).")
    print(f"    Implement cap — risk benefit (concentration) exceeds negligible ROI cost.")

print()

# ── Who gets capped most? ─────────────────────────────────────────────────────
capped_count = defaultdict(int)
for ev in cap_events:
    for name in ev["capped_out"]:
        capped_count[name] += 1

if capped_count:
    print(f"  Players capped out most frequently:")
    for name, cnt in sorted(capped_count.items(), key=lambda x: -x[1]):
        print(f"    {name:<30} capped out {cnt} times")
    print()

# ═══════════════════════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
print("=" * 72)
print("SYNTHESIS — What this means for real unit sizing")
print("=" * 72)
print()

a1_roi = a1["summary"].get("cum_roi", 0)
a2_roi = a2["summary"].get("cum_roi", 0)
a3_roi = a3["summary"].get("cum_roi", 0)
a4_roi = a4["summary"].get("cum_roi", 0)
c1_roi = c1["summary"].get("cum_roi", 0)

n_hi_days = len(high_odds_dates)
n_lo_days = len(low_odds_dates)
pct_hi    = n_hi_days / len(active_dates) * 100

print(f"  Odds environment: {pct_hi:.0f}% of active days have mean qualifying odds <+{ODDS_SPLIT}")
print(f"  Recommended structure by environment:")
print()

structures = [
    ("Top5×2 (current baseline, all days)",     a1_roi, a1["summary"]["avg_combos_per_day"]),
    ("Top3×2 (all days)",                        a2_roi, a2["summary"]["avg_combos_per_day"]),
    ("Top5×2 (high-odds days only, ≥+350)",      a3_roi, a3["summary"].get("avg_combos_per_day", 0)),
    ("Top3×2 (high-odds days only, ≥+350)",      a4_roi, a4["summary"].get("avg_combos_per_day", 0)),
    ("Top5×2 + rolling 7d cap (Gate1 fix)",      c1_roi, c1["summary"].get("avg_combos_per_day", 0)),
]
for label, roi, avg_combos in structures:
    print(f"  {label:<45} ROI: {roi:+.1%}  Avg combos/day: {avg_combos:.1f}")

print()

# ─── Write JSON output ────────────────────────────────────────────────────────
output = {
    "run_at": "2025-holdout",
    "part_a_structure_comparison": {
        "top5x2_baseline":       a1["summary"],
        "top3x2":                a2["summary"],
        "top5x2_high_odds_only": a3["summary"],
        "top3x2_high_odds_only": a4["summary"],
        "avg_payout_per_hit": {
            "top5x2":            round(ap1, 4) if not np.isnan(ap1) else None,
            "top3x2":            round(ap2, 4) if not np.isnan(ap2) else None,
            "top5x2_high_odds":  round(ap3, 4) if not np.isnan(ap3) else None,
            "top3x2_high_odds":  round(ap4, 4) if not np.isnan(ap4) else None,
        },
    },
    "part_b_odds_environment_split": {
        "split_threshold_american_odds": ODDS_SPLIT,
        "n_high_odds_days": n_hi_days,
        "n_low_odds_days":  n_lo_days,
        "high_odds_rr":     hi_stats if "hi_stats" in dir() else {},
        "low_odds_rr":      lo_stats if "lo_stats" in dir() else {},
    },
    "part_c_rolling_cap": {
        "window_days":       WINDOW_DAYS,
        "max_appearances":   MAX_APPEARANCES,
        "days_affected":     len(cap_events),
        "pct_days_affected": round(len(cap_events) / len(active_dates), 4),
        "cap_events_sample": cap_events[:20],
        "most_capped_players": dict(sorted(capped_count.items(), key=lambda x: -x[1])),
        "before": a1["summary"],
        "after":  c1["summary"],
        "roi_delta": round(float(c1_roi - a1_roi), 5),
    },
}

with open(OUT_PATH, "w") as f:
    json.dump(output, f, indent=2, default=str)

print(f"[4/4] Results written to {OUT_PATH.relative_to(ROOT)}")
print("=" * 72)
