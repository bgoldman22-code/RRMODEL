#!/usr/bin/env python3
"""
Final Analytical Gate — Pre-Real-Unit-Sizing Audit
====================================================
Gate 1: Player frequency in top-5 EV picks — flag anyone >40% of eligible days
Gate 2: Day-over-day Jaccard similarity of top-5 pick lists — flag mean >60%
Gate 3: Top-10 players: model_prob vs pitcher_rv100 quartile split — flag diff <5pp
Gate 4: Odds distribution of all qualifying picks — flag if mean outside +420-+480 target

Output: data/mlb_v3/final_analytical_gates.json + printed report
"""

import json, math, pathlib, warnings
from itertools import combinations
from collections import defaultdict

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

ROOT     = pathlib.Path(__file__).parent.parent.parent
OUT_PATH = ROOT / "data/mlb_v3/final_analytical_gates.json"

# ─── 1. Load + engineer features (identical to portfolio_simulation.py) ───────
print("=" * 72)
print("FINAL ANALYTICAL GATES — Pre-Real-Unit-Sizing Audit")
print("=" * 72)
print("\n[1/5] Loading feature matrix...")
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
X_test,  y_test  = prep(test,  train_medians)

print("[2/5] Fitting XGBoost + isotonic calibrator...")
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

# American odds from decimal
def dec_to_american(d):
    if pd.isna(d):
        return np.nan
    if d >= 2.0:
        return round((d - 1) * 100)
    else:
        return round(-100 / (d - 1))

test["american_odds"] = test["decimal_odds"].apply(dec_to_american)

THRESHOLD   = 0.25
MIN_PLAYERS = 3
TOP_N       = 5

has_odds = test[test["market_prob"].notna()].copy()

# ─── Reconstruct per-day top-5 picks ─────────────────────────────────────────
print("[3/5] Reconstructing top-5 picks per active day...")

# Determine player identity column (prefer mlbam_id, fall back to player_name)
pid_col = "mlbam_id" if "mlbam_id" in test.columns else "player_id" if "player_id" in test.columns else None
name_col = "player_name" if "player_name" in test.columns else "batter_name" if "batter_name" in test.columns else None

print(f"    Player ID column: {pid_col}")
print(f"    Player name column: {name_col}")
print(f"    Available columns: {sorted(test.columns.tolist())}")

# Build the unique player key
def player_key(row):
    parts = []
    if pid_col and pd.notna(row.get(pid_col)):
        parts.append(str(int(row[pid_col])))
    if name_col and pd.notna(row.get(name_col)):
        parts.append(str(row[name_col]))
    return "_".join(parts) if parts else f"unknown_{row.name}"

# ------- per-day picks dict -------
daily_picks = {}          # date -> list of full row dicts for top-5
all_qualifying = []       # all rows that cleared threshold (for Gate 4)

sorted_dates = sorted(has_odds["game_date"].unique())

for date in sorted_dates:
    day_df = has_odds[has_odds["game_date"] == date]
    qualified = day_df[day_df["model_prob"] >= THRESHOLD].sort_values(
        "model_prob", ascending=False
    )
    if len(qualified) < MIN_PLAYERS:
        continue

    all_qualifying.append(qualified)

    top5 = qualified.head(TOP_N).copy()
    picks = []
    for _, row in top5.iterrows():
        pkey = player_key(row)
        pname = row[name_col] if name_col else pkey
        picks.append({
            "player_key":    pkey,
            "player_name":   str(pname),
            "model_prob":    float(row["model_prob"]),
            "pitcher_rv100": float(row["pitcher_rv100"]) if pd.notna(row.get("pitcher_rv100")) else None,
            "american_odds": float(row["american_odds"]) if pd.notna(row.get("american_odds")) else None,
            "decimal_odds":  float(row["decimal_odds"]) if pd.notna(row.get("decimal_odds")) else None,
            "ev":            float(row["ev"]) if pd.notna(row.get("ev")) else None,
            "did_hr":        bool(row["did_hr"]) if pd.notna(row.get("did_hr")) else None,
        })
    daily_picks[str(date)[:10]] = picks

active_days     = list(daily_picks.keys())
n_active        = len(active_days)
all_qual_df     = pd.concat(all_qualifying, ignore_index=True) if all_qualifying else pd.DataFrame()

print(f"    Active days with ≥{MIN_PLAYERS} qualifiers: {n_active}")
print(f"    Total qualifying pick-instances: {len(all_qual_df)}")
print()

# ═══════════════════════════════════════════════════════════════════════════════
# GATE 1: Player frequency in top-5
# ═══════════════════════════════════════════════════════════════════════════════
print("=" * 72)
print("GATE 1 — Player Frequency in Top-5 EV Picks")
print("=" * 72)

# Count appearances and eligible days per player
# "Eligible" = any day the player had odds and appeared in the 2025 test set
player_eligible = defaultdict(set)   # player_key -> set of dates they appeared (with odds)
player_top5     = defaultdict(int)   # player_key -> count of top-5 appearances
player_names    = {}                  # player_key -> display name

for date_str, picks in daily_picks.items():
    for p in picks:
        player_top5[p["player_key"]] += 1
        player_names[p["player_key"]] = p["player_name"]

# Eligible days: days player appeared in has_odds (regardless of qualification)
if pid_col or name_col:
    for date in sorted_dates:
        day_df = has_odds[has_odds["game_date"] == date]
        date_s = str(date)[:10]
        for _, row in day_df.iterrows():
            pkey = player_key(row)
            player_eligible[pkey].add(date_s)

# Build frequency table for players who appeared in top-5 at least once
freq_rows = []
for pkey, top5_count in player_top5.items():
    elig = len(player_eligible.get(pkey, set()))
    pct  = top5_count / elig if elig > 0 else 0.0
    freq_rows.append({
        "player_key":    pkey,
        "player_name":   player_names.get(pkey, pkey),
        "top5_days":     top5_count,
        "eligible_days": elig,
        "pct_eligible":  pct,
        "flag_40pct":    pct > 0.40,
    })

freq_df = pd.DataFrame(freq_rows).sort_values("top5_days", ascending=False).reset_index(drop=True)
flagged_g1 = freq_df[freq_df["flag_40pct"]]

print(f"  Total unique players in top-5 ever: {len(freq_df)}")
print(f"  Players flagged >40% of eligible days: {len(flagged_g1)}")
print()
print(f"  {'Rank':<5} {'Player':<30} {'Top5 Days':>10} {'Eligible':>9} {'% Elig':>8} {'FLAG':>6}")
print(f"  {'-'*5} {'-'*30} {'-'*10} {'-'*9} {'-'*8} {'-'*6}")
for i, row in freq_df.head(30).iterrows():
    flag = "⚠️ 40%" if row["flag_40pct"] else ""
    print(f"  {i+1:<5} {row['player_name']:<30} {row['top5_days']:>10} {row['eligible_days']:>9} {row['pct_eligible']:>7.1%} {flag:>6}")

if len(freq_df) > 30:
    print(f"  ... {len(freq_df)-30} more players (all with top5_days < {freq_df.iloc[29]['top5_days']})")

g1_verdict = "⚠️  CONCERN" if len(flagged_g1) > 0 else "✅ PASS"
print(f"\n  GATE 1 VERDICT: {g1_verdict}")
if len(flagged_g1) > 0:
    print(f"  Flagged players: {', '.join(flagged_g1['player_name'].tolist())}")
    print("  High repeat appearance suggests model over-indexes on a few high-EV regulars.")
    print("  Concentration risk: if these players underperform, drawdown is correlated.")
print()

# ═══════════════════════════════════════════════════════════════════════════════
# GATE 2: Day-over-day Jaccard Similarity
# ═══════════════════════════════════════════════════════════════════════════════
print("=" * 72)
print("GATE 2 — Day-over-Day Jaccard Similarity of Top-5 Pick Lists")
print("=" * 72)

jaccards = []
consecutive_pairs = []

for i in range(len(active_days) - 1):
    d1, d2 = active_days[i], active_days[i+1]
    set1 = {p["player_key"] for p in daily_picks[d1]}
    set2 = {p["player_key"] for p in daily_picks[d2]}
    inter = len(set1 & set2)
    union = len(set1 | set2)
    j = inter / union if union > 0 else 0.0
    jaccards.append(j)
    consecutive_pairs.append({
        "day1": d1, "day2": d2,
        "set1_size": len(set1), "set2_size": len(set2),
        "intersection": inter, "union": union, "jaccard": round(j, 4)
    })

j_arr    = np.array(jaccards)
j_mean   = float(j_arr.mean())
j_median = float(np.median(j_arr))
j_std    = float(j_arr.std())
j_p25    = float(np.percentile(j_arr, 25))
j_p75    = float(np.percentile(j_arr, 75))
j_p90    = float(np.percentile(j_arr, 90))

# Distribution buckets
buckets = {
    "0%  overlap (0.0)":       int((j_arr == 0.0).sum()),
    "1-19% overlap (0.0-0.2)": int(((j_arr > 0.0) & (j_arr < 0.2)).sum()),
    "20-39% (0.2-0.4)":        int(((j_arr >= 0.2) & (j_arr < 0.4)).sum()),
    "40-59% (0.4-0.6)":        int(((j_arr >= 0.4) & (j_arr < 0.6)).sum()),
    "60-79% (0.6-0.8)":        int(((j_arr >= 0.6) & (j_arr < 0.8)).sum()),
    "80-100% (0.8-1.0)":       int((j_arr >= 0.8).sum()),
}

print(f"  Consecutive active-day pairs evaluated: {len(jaccards)}")
print(f"  Mean Jaccard similarity:   {j_mean:.3f}  ({j_mean*100:.1f}%)")
print(f"  Median Jaccard:            {j_median:.3f}  ({j_median*100:.1f}%)")
print(f"  Std dev:                   {j_std:.3f}")
print(f"  P25 / P75 / P90:           {j_p25:.3f} / {j_p75:.3f} / {j_p90:.3f}")
print()
print("  Distribution:")
for label, cnt in buckets.items():
    bar = "█" * cnt
    pct = cnt / len(jaccards) * 100
    print(f"    {label:<28} {cnt:>4} days ({pct:5.1f}%)  {bar}")

# Top-10 most similar consecutive pairs
top_overlap = sorted(consecutive_pairs, key=lambda x: x["jaccard"], reverse=True)[:10]
print(f"\n  Top-10 highest-overlap consecutive day pairs:")
print(f"  {'Day 1':<12} {'Day 2':<12} {'Jaccard':>8} {'Shared':>7}")
for pair in top_overlap:
    print(f"  {pair['day1']:<12} {pair['day2']:<12} {pair['jaccard']:>8.3f} {pair['intersection']:>7}/{min(pair['set1_size'], pair['set2_size'])}")

g2_flag    = j_mean > 0.60
g2_verdict = "⚠️  CONCERN — mean >60%" if g2_flag else "✅ PASS"
print(f"\n  GATE 2 VERDICT: {g2_verdict}")
if g2_flag:
    print("  High day-to-day overlap means RR capital is correlated across consecutive")
    print("  days. Losing streaks will be structurally amplified.")
else:
    print(f"  Mean overlap {j_mean*100:.1f}% is below the 60% flag threshold.")
    print("  Daily pick lists rotate sufficiently to limit sequential correlation.")
print()

# ═══════════════════════════════════════════════════════════════════════════════
# GATE 3: Top-10 players — high vs low pitcher_rv100 split
# ═══════════════════════════════════════════════════════════════════════════════
print("=" * 72)
print("GATE 3 — Model Sensitivity to Pitcher Quality (pitcher_rv100 Split)")
print("=" * 72)

top10_keys = freq_df.head(10)["player_key"].tolist()

# pitcher_rv100 quartile cutoffs across the entire test set (all qualifying days)
if not all_qual_df.empty and "pitcher_rv100" in all_qual_df.columns:
    rv_q25 = float(all_qual_df["pitcher_rv100"].quantile(0.25))
    rv_q75 = float(all_qual_df["pitcher_rv100"].quantile(0.75))
    print(f"  pitcher_rv100 quartile cutoffs (across all qualifying picks):")
    print(f"    Q25 (bottom): {rv_q25:.4f}   Q75 (top): {rv_q75:.4f}")
    print(f"    Median: {float(all_qual_df['pitcher_rv100'].median()):.4f}")
    print()

    g3_rows = []
    print(f"  {'Player':<30} {'High-RV days':>12} {'Low-RV days':>12} {'ΔProb':>8} {'FLAG':>6}")
    print(f"  {'-'*30} {'-'*12} {'-'*12} {'-'*8} {'-'*6}")
    for pkey in top10_keys:
        pname = player_names.get(pkey, pkey)
        # Pull all rows for this player in all_qual_df
        # Reconstruct from top-5 appearances in daily_picks
        player_rows = []
        for date_str, picks in daily_picks.items():
            for p in picks:
                if p["player_key"] == pkey and p["pitcher_rv100"] is not None:
                    player_rows.append({
                        "pitcher_rv100": p["pitcher_rv100"],
                        "model_prob": p["model_prob"],
                    })

        if not player_rows:
            continue

        pr_df = pd.DataFrame(player_rows)
        high_rv = pr_df[pr_df["pitcher_rv100"] >= rv_q75]
        low_rv  = pr_df[pr_df["pitcher_rv100"] <= rv_q25]

        p_high = float(high_rv["model_prob"].mean()) if len(high_rv) > 0 else np.nan
        p_low  = float(low_rv["model_prob"].mean())  if len(low_rv) > 0 else np.nan
        delta  = p_high - p_low if not (np.isnan(p_high) or np.isnan(p_low)) else np.nan
        flag   = (not np.isnan(delta)) and abs(delta) < 0.05

        n_high = len(high_rv)
        n_low  = len(low_rv)

        high_str = f"{p_high:.3f} (n={n_high})" if not np.isnan(p_high) else f"— (n={n_high})"
        low_str  = f"{p_low:.3f} (n={n_low})"   if not np.isnan(p_low)  else f"— (n={n_low})"
        delta_str = f"{delta:+.3f}" if not np.isnan(delta) else "—"
        flag_str  = "⚠️ <5pp" if flag else ""

        print(f"  {pname:<30} {high_str:>12} {low_str:>12} {delta_str:>8} {flag_str:>6}")
        g3_rows.append({
            "player_key": pkey, "player_name": pname,
            "p_high_rv100": round(p_high, 4) if not np.isnan(p_high) else None,
            "p_low_rv100":  round(p_low, 4)  if not np.isnan(p_low)  else None,
            "n_high": n_high, "n_low": n_low,
            "delta_prob": round(delta, 4) if not np.isnan(delta) else None,
            "flag_lt5pp": flag,
        })

    g3_flagged = [r for r in g3_rows if r["flag_lt5pp"]]
    g3_verdict = "⚠️  CONCERN — delta <5pp for some players" if g3_flagged else "✅ PASS"

    # Overall: pool all top-10 appearances, split by rv100 quartile
    all_p10_rows = []
    for pkey in top10_keys:
        for date_str, picks in daily_picks.items():
            for p in picks:
                if p["player_key"] == pkey and p["pitcher_rv100"] is not None:
                    all_p10_rows.append(p)
    all_p10_df = pd.DataFrame(all_p10_rows) if all_p10_rows else pd.DataFrame()

    if not all_p10_df.empty:
        p_high_agg = all_p10_df[all_p10_df["pitcher_rv100"] >= rv_q75]["model_prob"].mean()
        p_low_agg  = all_p10_df[all_p10_df["pitcher_rv100"] <= rv_q25]["model_prob"].mean()
        delta_agg  = p_high_agg - p_low_agg
        print(f"\n  Pooled top-10 aggregate:")
        print(f"    vs top-quartile pitchers (rv100 ≥ {rv_q75:.4f}): mean P = {p_high_agg:.3f}")
        print(f"    vs bot-quartile pitchers (rv100 ≤ {rv_q25:.4f}): mean P = {p_low_agg:.3f}")
        print(f"    Δ = {delta_agg:+.3f} ({delta_agg*100:+.1f}pp)")
        if abs(delta_agg) < 0.05:
            print("    ⚠️  Pooled delta < 5pp — pitcher quality feature has weak per-player discriminative power.")
        else:
            print("    ✅ Pooled delta ≥ 5pp — pitcher quality feature is discriminative.")
else:
    print("  pitcher_rv100 column missing or all_qual_df empty — skipping Gate 3.")
    g3_rows = []
    g3_flagged = []
    g3_verdict = "⚠️  SKIPPED (missing data)"
    p_high_agg = p_low_agg = delta_agg = rv_q25 = rv_q75 = None

print(f"\n  GATE 3 VERDICT: {g3_verdict}")
if g3_flagged:
    names = [r["player_name"] for r in g3_flagged]
    print(f"  Flagged: {', '.join(names)}")
    print("  Model probability is not materially sensitive to pitcher quality for these")
    print("  players. May indicate sparse pitcher_rv100 data or overfitting to batter features.")
print()

# ═══════════════════════════════════════════════════════════════════════════════
# GATE 4: Odds distribution of all qualifying picks
# ═══════════════════════════════════════════════════════════════════════════════
print("=" * 72)
print("GATE 4 — Odds Distribution of All Qualifying Picks")
print("=" * 72)
print("  Target: mean American odds +420 to +480")
print()

if not all_qual_df.empty and "american_odds" in all_qual_df.columns:
    odds_series = all_qual_df["american_odds"].dropna()
    # Keep only positive odds (home run props are always positive)
    odds_pos = odds_series[odds_series > 0]

    total_picks   = len(odds_pos)
    mean_odds     = float(odds_pos.mean())
    median_odds   = float(odds_pos.median())
    std_odds      = float(odds_pos.std())
    p10_odds      = float(np.percentile(odds_pos, 10))
    p90_odds      = float(np.percentile(odds_pos, 90))

    # Bucket counts
    b150_299 = int(((odds_pos >= 150) & (odds_pos <= 299)).sum())
    b300_499 = int(((odds_pos >= 300) & (odds_pos <= 499)).sum())
    b500_699 = int(((odds_pos >= 500) & (odds_pos <= 699)).sum())
    b700p    = int((odds_pos >= 700).sum())
    b_other  = int(((odds_pos < 150)).sum())   # shouldn't exist but check

    print(f"  Total qualifying picks with positive odds: {total_picks:,}")
    print()
    print(f"  Mean odds:    +{mean_odds:.0f}")
    print(f"  Median odds:  +{median_odds:.0f}")
    print(f"  Std dev:      {std_odds:.0f}")
    print(f"  P10 / P90:    +{p10_odds:.0f} / +{p90_odds:.0f}")
    print()
    print("  Distribution by bucket:")
    for label, cnt in [
        ("+150–+299", b150_299),
        ("+300–+499", b300_499),
        ("+500–+699", b500_699),
        ("+700+",     b700p),
        ("<+150 (unexpected)", b_other),
    ]:
        pct = cnt / total_picks * 100 if total_picks > 0 else 0
        bar = "█" * int(pct / 2)
        print(f"    {label:<24} {cnt:>5} picks ({pct:5.1f}%)  {bar}")

    # Flag check
    in_target = 420 <= mean_odds <= 480
    g4_verdict = "✅ PASS — mean in +420–+480 target" if in_target else f"⚠️  CONCERN — mean +{mean_odds:.0f} is outside +420–+480 target"

    # Implied prob check
    avg_impl = float((1.0 / (1.0 + odds_pos / 100)).mean())
    print()
    print(f"  Average implied probability: {avg_impl:.3f} ({avg_impl*100:.1f}%)")
    print(f"  (Vs model EV threshold ≥25% implies model_prob typically ≥ implied_prob × 1.25)")

    g4_detail = {
        "total_picks": total_picks,
        "mean_american_odds": round(mean_odds, 1),
        "median_american_odds": round(median_odds, 1),
        "std_american_odds": round(std_odds, 1),
        "p10": round(p10_odds, 1),
        "p90": round(p90_odds, 1),
        "bucket_150_299": b150_299,
        "bucket_300_499": b300_499,
        "bucket_500_699": b500_699,
        "bucket_700plus": b700p,
        "bucket_under150": b_other,
        "pct_150_299": round(b150_299 / total_picks * 100, 1) if total_picks else 0,
        "pct_300_499": round(b300_499 / total_picks * 100, 1) if total_picks else 0,
        "pct_500_699": round(b500_699 / total_picks * 100, 1) if total_picks else 0,
        "pct_700plus": round(b700p / total_picks * 100, 1) if total_picks else 0,
        "avg_implied_prob": round(avg_impl, 4),
        "in_target_range": in_target,
    }
else:
    print("  american_odds column missing or all_qual_df empty — skipping Gate 4.")
    g4_verdict = "⚠️  SKIPPED (missing data)"
    g4_detail  = {}

print(f"\n  GATE 4 VERDICT: {g4_verdict}")
print()

# ═══════════════════════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
print("=" * 72)
print("FINAL GATE SUMMARY")
print("=" * 72)

verdicts = {
    "Gate 1 (Player concentration >40%)": g1_verdict,
    "Gate 2 (Day-over-day Jaccard >60%)": g2_verdict,
    "Gate 3 (Pitcher split <5pp)":        g3_verdict,
    "Gate 4 (Odds mean outside +420-480)":g4_verdict,
}

all_pass = all("PASS" in v for v in verdicts.values())

for gate, verdict in verdicts.items():
    print(f"  {gate:<42} {verdict}")

print()
if all_pass:
    print("  🟢 ALL GATES PASSED — Model meets pre-sizing analytical thresholds.")
    print("     Proceed with real unit sizing on next qualifying slate day.")
else:
    concerns = [g for g, v in verdicts.items() if "CONCERN" in v or "SKIPPED" in v]
    print(f"  🔴 {len(concerns)} CONCERN(S) FLAGGED — review above before committing real units.")
    for c in concerns:
        print(f"     • {c}")
print()

# ─── Write JSON output ────────────────────────────────────────────────────────
output = {
    "run_date":     "2025-holdout",
    "active_days":  n_active,
    "gate1_player_frequency": {
        "total_unique_players": len(freq_df),
        "flagged_above_40pct":  len(flagged_g1),
        "flagged_players":      flagged_g1[["player_name", "top5_days", "eligible_days", "pct_eligible"]].rename(columns={"pct_eligible":"pct_elig_float"}).to_dict(orient="records"),
        "full_table":           freq_df.head(30).to_dict(orient="records"),
        "verdict":              g1_verdict,
    },
    "gate2_jaccard": {
        "n_pairs":       len(jaccards),
        "mean":          round(j_mean, 4),
        "median":        round(j_median, 4),
        "std":           round(j_std, 4),
        "p25":           round(j_p25, 4),
        "p75":           round(j_p75, 4),
        "p90":           round(j_p90, 4),
        "distribution":  {k: int(v) for k, v in buckets.items()},
        "top10_pairs":   top_overlap,
        "verdict":       g2_verdict,
    },
    "gate3_pitcher_split": {
        "rv100_q25":     float(rv_q25) if rv_q25 is not None else None,
        "rv100_q75":     float(rv_q75) if rv_q75 is not None else None,
        "player_splits": g3_rows,
        "pooled_p_high": round(float(p_high_agg), 4) if 'p_high_agg' in dir() and p_high_agg is not None and not (isinstance(p_high_agg, float) and math.isnan(p_high_agg)) else None,
        "pooled_p_low":  round(float(p_low_agg), 4)  if 'p_low_agg'  in dir() and p_low_agg  is not None and not (isinstance(p_low_agg,  float) and math.isnan(p_low_agg))  else None,
        "pooled_delta":  round(float(delta_agg), 4)   if 'delta_agg'  in dir() and delta_agg  is not None and not (isinstance(delta_agg,  float) and math.isnan(delta_agg))  else None,
        "flagged_players": [r["player_name"] for r in g3_flagged],
        "verdict":       g3_verdict,
    },
    "gate4_odds_distribution": g4_detail | {"verdict": g4_verdict},
    "overall_pass": all_pass,
}

with open(OUT_PATH, "w") as f:
    json.dump(output, f, indent=2, default=str)

print(f"[5/5] Results written to {OUT_PATH.relative_to(ROOT)}")
print("=" * 72)
