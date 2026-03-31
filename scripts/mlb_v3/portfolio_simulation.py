#!/usr/bin/env python3
"""
Combined Portfolio Simulation — 2025 Holdout
==============================================
Structure: On each day where ≥3 qualifying players exist at EV≥25%:
  - Straight leg: 1 unit per qualifying player
  - RR leg:       top5×2 parlays at 0.5 units per combination

Reports:
  - Daily P&L (straight + RR combined)
  - Cumulative ROI on total capital deployed
  - % days net-positive
  - Maximum drawdown (consecutive net-negative day streak + capital drawdown)
  - On days RR misses entirely: straight-bet ROI cushion

Run:
  python scripts/mlb_v3/portfolio_simulation.py
"""

import json, math, pathlib, warnings
from itertools import combinations

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

ROOT     = pathlib.Path(__file__).parent.parent.parent
OUT_PATH = ROOT / "data/mlb_v3/portfolio_simulation.json"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

# ─── 1. Load + engineer features (identical to rr_simulation.py) ─────────────
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
X_tv = np.vstack([X_train, X_val])
y_tv = np.concatenate([y_train, y_val])
X_test,  y_test  = prep(test,  train_medians)

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

test = test.copy()
test["model_prob"]  = xgb_cal.predict_proba(X_test)[:, 1]
test["decimal_odds"] = np.where(test["market_prob"] > 0,
                                1.0 / test["market_prob"], np.nan)

# EV = model_prob * decimal_odds - 1
test["ev"] = test["model_prob"] * test["decimal_odds"] - 1.0

print(f"Test rows: {len(test):,} | with odds: {test['market_prob'].notna().sum():,}")

# ─── 2. Portfolio constants ───────────────────────────────────────────────────
THRESHOLD     = 0.25       # model prob cutoff (EV≥25% at typical odds)
MIN_PLAYERS   = 3          # skip day if fewer than this qualify
TOP_N         = 5          # RR pool size
RR_LEGS       = 2          # parlay length
STRAIGHT_UNIT = 1.0        # per player
RR_UNIT       = 0.5        # per combination

# ─── 3. Day-by-day simulation ─────────────────────────────────────────────────
has_odds = test[test["market_prob"].notna()].copy()

daily_records = []

for date, day_df in has_odds.groupby("game_date"):
    day_df = day_df[day_df["model_prob"] >= THRESHOLD].sort_values(
        "model_prob", ascending=False
    )
    n_qual = len(day_df)
    if n_qual < MIN_PLAYERS:
        continue

    # ── Straight leg ──────────────────────────────────────────────────────────
    straight_stake  = STRAIGHT_UNIT * n_qual
    straight_payout = 0.0
    straight_wins   = 0
    for _, row in day_df.iterrows():
        if row["did_hr"]:
            straight_payout += STRAIGHT_UNIT * row["decimal_odds"]
            straight_wins   += 1
    straight_pnl = straight_payout - straight_stake
    straight_roi = straight_pnl / straight_stake

    # ── RR leg: top-5 × 2-leg parlays ────────────────────────────────────────
    pool        = day_df.head(TOP_N)
    rr_combos   = list(combinations(range(len(pool)), RR_LEGS))
    odds_arr    = pool["decimal_odds"].values
    hit_arr     = pool["did_hr"].values

    rr_stake    = RR_UNIT * len(rr_combos)
    rr_payout   = 0.0
    rr_hits     = 0
    for idxs in rr_combos:
        if all(hit_arr[i] for i in idxs):
            parlay_odds  = math.prod(odds_arr[i] for i in idxs)
            rr_payout   += RR_UNIT * parlay_odds
            rr_hits     += 1
    rr_pnl     = rr_payout - rr_stake
    rr_roi     = rr_pnl / rr_stake if rr_stake > 0 else 0.0
    rr_missed  = rr_hits == 0

    # ── Combined ──────────────────────────────────────────────────────────────
    total_stake  = straight_stake + rr_stake
    total_payout = straight_payout + rr_payout
    total_pnl    = total_payout - total_stake
    total_roi    = total_pnl / total_stake

    daily_records.append({
        "date":           str(date),
        "n_qual":         n_qual,
        "n_combos":       len(rr_combos),
        # straight
        "s_stake":        round(straight_stake, 4),
        "s_payout":       round(straight_payout, 4),
        "s_pnl":          round(straight_pnl, 4),
        "s_roi":          round(straight_roi, 5),
        "s_wins":         straight_wins,
        # rr
        "rr_stake":       round(rr_stake, 4),
        "rr_payout":      round(rr_payout, 4),
        "rr_pnl":         round(rr_pnl, 4),
        "rr_roi":         round(rr_roi, 5),
        "rr_hits":        rr_hits,
        "rr_missed":      rr_missed,
        # combined
        "total_stake":    round(total_stake, 4),
        "total_payout":   round(total_payout, 4),
        "total_pnl":      round(total_pnl, 4),
        "total_roi":      round(total_roi, 5),
        "net_positive":   total_pnl > 0,
    })

rec = pd.DataFrame(daily_records)
print(f"\nActive days (≥{MIN_PLAYERS} qualifying players): {len(rec)}/{has_odds['game_date'].nunique()}")

# ─── 4. Aggregate metrics ─────────────────────────────────────────────────────
total_s_stake   = rec["s_stake"].sum()
total_rr_stake  = rec["rr_stake"].sum()
total_capital   = rec["total_stake"].sum()
total_pnl_sum   = rec["total_pnl"].sum()

cum_roi         = total_pnl_sum / total_capital
avg_daily_roi   = rec["total_roi"].mean()
med_daily_roi   = rec["total_roi"].median()
pct_positive    = rec["net_positive"].mean()
worst_day_roi   = rec["total_roi"].min()
best_day_roi    = rec["total_roi"].max()

# Straight-only and RR-only aggregates for comparison
s_cum_roi  = (rec["s_payout"].sum() - total_s_stake)  / total_s_stake
rr_cum_roi = (rec["rr_payout"].sum() - total_rr_stake) / total_rr_stake

# ─── 5. Drawdown analysis ─────────────────────────────────────────────────────
# (a) Longest consecutive losing streak (days with total_pnl < 0)
pnl_signs = (rec["total_pnl"] > 0).tolist()
max_streak = cur_streak = 0
for win in pnl_signs:
    if not win:
        cur_streak += 1
        max_streak  = max(max_streak, cur_streak)
    else:
        cur_streak  = 0

# (b) Peak-to-trough drawdown on cumulative P&L curve
cum_pnl   = rec["total_pnl"].cumsum().values
peak      = cum_pnl[0]
max_dd    = 0.0
for val in cum_pnl:
    if val > peak:
        peak = val
    dd = peak - val
    if dd > max_dd:
        max_dd = dd

# Express drawdown as fraction of total capital deployed (apples-to-apples with ROI)
max_dd_pct = max_dd / total_capital

# ─── 6. RR zero-day cushion analysis ─────────────────────────────────────────
rr_zero_days = rec[rec["rr_missed"]].copy()
rr_hit_days  = rec[~rec["rr_missed"]].copy()

rr_zero_s_roi_avg  = rr_zero_days["s_roi"].mean()  if len(rr_zero_days) > 0 else float("nan")
rr_zero_s_roi_med  = rr_zero_days["s_roi"].median() if len(rr_zero_days) > 0 else float("nan")
rr_zero_net_pos    = rr_zero_days["net_positive"].mean() if len(rr_zero_days) > 0 else float("nan")
rr_zero_net_pnl_avg = rr_zero_days["total_pnl"].mean()  if len(rr_zero_days) > 0 else float("nan")

rr_hit_net_pnl_avg  = rr_hit_days["total_pnl"].mean()   if len(rr_hit_days) > 0 else float("nan")
rr_hit_net_roi_avg  = rr_hit_days["total_roi"].mean()   if len(rr_hit_days) > 0 else float("nan")

# ─── 7. Print report ──────────────────────────────────────────────────────────
div  = "═" * 62
divs = "─" * 62

print(f"\n{div}")
print("  COMBINED PORTFOLIO — 2025 HOLDOUT (≥3 qualifying players, EV≥25%)")
print(f"{div}")
print(f"  Structure:  1u straight each qualifier  +  top5×2 RR @ 0.5u/combo")
print(f"  Threshold:  model_prob ≥ {THRESHOLD:.0%}")
print(f"{divs}")

print(f"\n  ACTIVE DAYS")
print(f"  Total calendar days with odds:    {has_odds['game_date'].nunique()}")
print(f"  Days with ≥{MIN_PLAYERS} qualifiers:          {len(rec)}")
print(f"  Avg qualifiers/active day:        {rec['n_qual'].mean():.1f}")
print(f"  Avg RR combos/active day:         {rec['n_combos'].mean():.1f}")

print(f"\n  CAPITAL DEPLOYMENT")
print(f"  Total straight stake:             {total_s_stake:.1f} units")
print(f"  Total RR stake:                   {total_rr_stake:.1f} units")
print(f"  Total capital deployed:           {total_capital:.1f} units")
print(f"  RR share of capital:              {total_rr_stake/total_capital:.1%}")

print(f"\n  P&L SUMMARY (combined portfolio)")
print(f"  Cumulative ROI:                   {cum_roi:+.2%}")
print(f"  Average daily ROI:                {avg_daily_roi:+.2%}")
print(f"  Median daily ROI:                 {med_daily_roi:+.2%}")
print(f"  % days net-positive:              {pct_positive:.1%}")
print(f"  Best single day:                  {best_day_roi:+.2%}")
print(f"  Worst single day:                 {worst_day_roi:+.2%}")

print(f"\n  DRAWDOWN")
print(f"  Max consecutive losing days:      {max_streak}")
print(f"  Peak-to-trough drawdown:          {max_dd:.2f} units ({max_dd_pct:.1%} of total capital)")

print(f"\n  COMPONENT BREAKDOWN (same active days)")
print(f"  Straight-only cumROI:             {s_cum_roi:+.2%}")
print(f"  RR-only cumROI:                   {rr_cum_roi:+.2%}")
print(f"  Combined cumROI:                  {cum_roi:+.2%}")

print(f"\n  RR ZERO-DAY CUSHION ANALYSIS")
print(f"  Days RR missed entirely:          {len(rr_zero_days)}/{len(rec)}  ({len(rr_zero_days)/len(rec):.1%})")
print(f"  On RR-zero days:")
print(f"    Straight ROI avg:               {rr_zero_s_roi_avg:+.2%}")
print(f"    Straight ROI median:            {rr_zero_s_roi_med:+.2%}")
print(f"    % days portfolio still net+:    {rr_zero_net_pos:.1%}")
print(f"    Avg combined P&L:               {rr_zero_net_pnl_avg:+.3f} units")
print(f"  On RR-hit days:")
print(f"    Avg combined P&L:               {rr_hit_net_pnl_avg:+.3f} units")
print(f"    Avg combined ROI:               {rr_hit_net_roi_avg:+.2%}")

# ─── 8. Cumulative P&L curve (text sparkline for terminal) ───────────────────
print(f"\n{divs}")
print("  CUMULATIVE P&L CURVE (unit P&L, each point = 1 active day)")
print(f"{divs}")
cum_vals = rec["total_pnl"].cumsum().values
n        = len(cum_vals)
width    = 60
lo, hi   = cum_vals.min(), cum_vals.max()
span     = hi - lo if hi != lo else 1.0
rows     = 8
grid     = [[" "] * width for _ in range(rows)]
for col_i, val in enumerate(cum_vals):
    x     = int(col_i * (width - 1) / max(n - 1, 1))
    y_raw = (val - lo) / span
    y     = rows - 1 - int(y_raw * (rows - 1))
    grid[y][x] = "█"
# zero line
zero_y = rows - 1 - int(((0 - lo) / span) * (rows - 1))
zero_y = max(0, min(rows - 1, zero_y))
for x in range(width):
    if grid[zero_y][x] == " ":
        grid[zero_y][x] = "·"
for row_i, row in enumerate(grid):
    label = f"{hi - (hi - lo) * row_i / (rows - 1):+6.1f}u"
    print(f"  {label} │{''.join(row)}")
print(f"  {'':7} └{'─'*width}")
print(f"  {'':8}Day 1{'':22}Day {n}")
print(f"  (zero-line = ·  |  P&L = █)")

# ─── 9. Bottom-10 worst days (for unit sizing awareness) ─────────────────────
print(f"\n{divs}")
print("  WORST 10 DAYS (for unit sizing)")
print(f"  {'Date':<12} {'Qual':>5} {'Combos':>7} {'S-ROI':>7} {'RR-ROI':>8} {'Net P&L':>9} {'Net ROI':>8}")
print(f"{divs}")
worst10 = rec.nsmallest(10, "total_pnl")
for _, r in worst10.iterrows():
    print(f"  {r['date']:<12} {r['n_qual']:>5} {r['n_combos']:>7} "
          f"{r['s_roi']:>+7.1%} {r['rr_roi']:>+8.1%} "
          f"{r['total_pnl']:>+9.3f}u {r['total_roi']:>+8.1%}")

# ─── 10. Save full daily log + summary ───────────────────────────────────────
output = {
    "config": {
        "threshold":     THRESHOLD,
        "min_players":   MIN_PLAYERS,
        "top_n":         TOP_N,
        "rr_legs":       RR_LEGS,
        "straight_unit": STRAIGHT_UNIT,
        "rr_unit":       RR_UNIT,
    },
    "summary": {
        "active_days":             len(rec),
        "total_calendar_days":     int(has_odds["game_date"].nunique()),
        "avg_qualifiers_per_day":  round(float(rec["n_qual"].mean()), 2),
        "avg_combos_per_day":      round(float(rec["n_combos"].mean()), 2),
        "total_capital_deployed":  round(float(total_capital), 2),
        "total_pnl":               round(float(total_pnl_sum), 4),
        "cum_roi":                 round(float(cum_roi), 5),
        "avg_daily_roi":           round(float(avg_daily_roi), 5),
        "median_daily_roi":        round(float(med_daily_roi), 5),
        "pct_profitable_days":     round(float(pct_positive), 4),
        "best_day_roi":            round(float(best_day_roi), 5),
        "worst_day_roi":           round(float(worst_day_roi), 5),
        "max_consecutive_losses":  int(max_streak),
        "peak_to_trough_units":    round(float(max_dd), 4),
        "peak_to_trough_pct":      round(float(max_dd_pct), 5),
        "straight_only_cum_roi":   round(float(s_cum_roi), 5),
        "rr_only_cum_roi":         round(float(rr_cum_roi), 5),
    },
    "rr_zero_day_cushion": {
        "n_rr_zero_days":                int(len(rr_zero_days)),
        "pct_rr_zero_days":              round(float(len(rr_zero_days) / len(rec)), 4),
        "straight_roi_avg_on_zero_days": round(float(rr_zero_s_roi_avg), 5),
        "straight_roi_med_on_zero_days": round(float(rr_zero_s_roi_med), 5),
        "portfolio_pct_net_pos_on_zero": round(float(rr_zero_net_pos), 4),
        "avg_combined_pnl_on_zero_days": round(float(rr_zero_net_pnl_avg), 4),
        "avg_combined_pnl_on_hit_days":  round(float(rr_hit_net_pnl_avg), 4),
        "avg_combined_roi_on_hit_days":  round(float(rr_hit_net_roi_avg), 5),
    },
    "daily_log": daily_records,
}

OUT_PATH.write_text(json.dumps(output, indent=2, default=str))
print(f"\n✅ Full daily log saved → {OUT_PATH}")
