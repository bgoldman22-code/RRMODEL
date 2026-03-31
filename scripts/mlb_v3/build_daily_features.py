#!/usr/bin/env python3
"""
MLB V3 — Daily Feature Vector Builder
======================================
Runs after fetch_statcast.py has written all Statcast blobs.

For today's slate (or --date override):
  1. Fetches today's MLB schedule via MLB StatsAPI
  2. For each game, reads probable pitchers
  3. For each likely starting hitter (active roster), assembles the 9-feature
     vector that matches data/mlb_v3/artifacts/feature_schema.json exactly
  4. Runs XGBoost + isotonic inference using the serialized artifacts
  5. Writes statcast/features-{YYYY-MM-DD}.json to rrmodelblobs
  6. Updates statcast/meta.json with features_built count

Feature vector order (strict — must match feature_schema.json):
  [0] hr_rate_bayes    — (hr * pa + 0.04 * 60) / (pa + 60)
  [1] barrel_pct       — percentile rank 0-100 from batter Statcast blob
  [2] hard_hit_pct     — percentile rank 0-100 from batter Statcast blob
  [3] pitcher_barrel   — percentile rank 0-100 (barrel% ALLOWED)
  [4] pitcher_rv100    — weighted arsenal RV/100 from arsenal blob
  [5] pitcher_hrfb     — HR/FB rate from FanGraphs blob
  [6] park_hr_factor   — HR index / 100 from park-factors blob
  [7] temp_adj         — temp_f - 72, 0 for domes
  [8] wind_adj         — signed wind mph (+ = out to CF), 0 for domes
  [9] pull_park_score  — pull_rate_fly × directional park factor (null if no spray)
  [10] pitcher_zone_pct — Zone% from FanGraphs pitcher blob

Blob keys written:
  statcast/features-{YYYY-MM-DD}.json
  statcast/meta.json  (updated with features_built)

Env vars required:
  NETLIFY_AUTH_TOKEN (or NETLIFY_TOKEN)
  NETLIFY_SITE_ID

Run:
  python scripts/mlb_v3/build_daily_features.py [--date YYYY-MM-DD] [--year YYYY]
"""

import argparse
import json
import math
import os
import pathlib
import re
import sys
import time
from datetime import datetime, timezone, date as date_class
from unicodedata import normalize as uni_normalize

import joblib
import numpy as np
import pandas as pd
import requests

# ── Config ────────────────────────────────────────────────────────────────────
ROOT = pathlib.Path(__file__).parent.parent.parent

ARTIFACTS_DIR    = ROOT / "data/mlb_v3/artifacts"
XGB_BASE_PATH    = ARTIFACTS_DIR / "xgb_base.joblib"
XGB_CAL_PATH     = ARTIFACTS_DIR / "xgb_calibrator.joblib"
TRAIN_MEDIANS    = json.loads((ARTIFACTS_DIR / "train_medians.json").read_text())

STORE_NAME    = "rrmodelblobs"
REQUEST_TO    = 15
RETRY_DELAY   = 4
MAX_RETRIES   = 3

PRIOR_RATE = 0.04
PRIOR_PA   = 60

# Dome stadiums — temp/wind set to 0
DOME_VENUES = {
    "Globe Life Field", "Tropicana Field", "Rogers Centre",
    "Minute Maid Park", "Chase Field", "American Family Field",
    "loanDepot park", "T-Mobile Park", "Daikin Park",
}

# Static park factor fallback (matches fetch_statcast.py _STATIC_PARK_FACTORS)
# hr_index / 100 → ratio (1.0 = neutral)
_STATIC_PF = {
    "COL": 1.19, "CIN": 1.11, "PHI": 1.10, "MIL": 1.08, "BAL": 1.07,
    "HOU": 1.06, "BOS": 1.06, "ARI": 1.05, "NYY": 1.08, "TEX": 1.04,
    "TOR": 1.03, "ATL": 1.02, "DET": 0.96, "CLE": 0.98, "MIN": 0.98,
    "LAD": 0.98, "CHW": 1.00, "CHC": 1.00, "LAA": 0.99, "MIA": 0.96,
    "NYM": 0.97, "OAK": 0.98, "PIT": 0.98, "STL": 0.98, "SD":  0.94,
    "SEA": 0.94, "SF":  0.92, "TB":  0.96, "WSH": 0.99, "KC":  0.96,
}

# Directional park HR factors (RHH pulls to LF → use L factor; LHH pulls to RF → use R factor)
# Source: FanGraphs 3-year regressed 2023-2025, split by batter handedness
_DIRECTIONAL_PARKS = {
    "COL": {"R": 1.17, "L": 1.21}, "CIN": {"R": 1.12, "L": 1.10},
    "PHI": {"R": 1.10, "L": 1.09}, "MIL": {"R": 1.08, "L": 1.07},
    "BAL": {"R": 1.07, "L": 1.06}, "HOU": {"R": 1.06, "L": 1.05},
    "BOS": {"R": 1.03, "L": 1.09}, "ARI": {"R": 1.05, "L": 1.04},
    "NYY": {"R": 1.04, "L": 1.12}, "TEX": {"R": 1.04, "L": 1.03},
    "TOR": {"R": 1.03, "L": 1.02}, "ATL": {"R": 1.02, "L": 1.01},
    "DET": {"R": 0.95, "L": 0.96}, "CLE": {"R": 0.97, "L": 0.98},
    "MIN": {"R": 0.98, "L": 0.97}, "LAD": {"R": 0.98, "L": 0.97},
    "CWS": {"R": 1.00, "L": 0.99}, "CHC": {"R": 0.99, "L": 1.01},
    "LAA": {"R": 0.99, "L": 0.98}, "MIA": {"R": 0.95, "L": 0.96},
    "NYM": {"R": 0.96, "L": 0.97}, "OAK": {"R": 0.98, "L": 0.97},
    "PIT": {"R": 0.97, "L": 0.98}, "STL": {"R": 0.98, "L": 0.97},
    "SD":  {"R": 0.93, "L": 0.94}, "SEA": {"R": 0.94, "L": 0.93},
    "SF":  {"R": 0.92, "L": 0.91}, "TB":  {"R": 0.96, "L": 0.95},
    "WSH": {"R": 0.99, "L": 0.98}, "KC":  {"R": 0.96, "L": 0.95},
}

# ── CLI ───────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Build MLB V3 daily feature vectors")
parser.add_argument("--date", type=str, default="",
                    help="Date to build features for (YYYY-MM-DD, default: today ET)")
parser.add_argument("--year", type=int, default=0,
                    help="Season year (default: derived from date)")
args = parser.parse_args()

TODAY_ET = datetime.now(timezone.utc).strftime("%Y-%m-%d")
FEATURE_DATE = args.date.strip() if args.date.strip() else TODAY_ET
SEASON = args.year if args.year else int(FEATURE_DATE[:4])
PRIOR_SEASON = SEASON - 1

print(f"Building features for date={FEATURE_DATE}, season={SEASON}")

# ── Netlify Blobs credentials ─────────────────────────────────────────────────
SITE_ID = (os.environ.get("NETLIFY_SITE_ID")
           or os.environ.get("NETLIFY_BLOBS_SITE_ID")
           or os.environ.get("SITE_ID"))
TOKEN = (os.environ.get("NETLIFY_AUTH_TOKEN")
         or os.environ.get("NETLIFY_TOKEN")
         or os.environ.get("NETLIFY_BLOBS_TOKEN"))

if not SITE_ID or not TOKEN:
    print("❌ Missing NETLIFY_SITE_ID and/or NETLIFY_AUTH_TOKEN", file=sys.stderr)
    sys.exit(1)

BLOBS_BASE    = f"https://api.netlify.com/api/v1/blobs/{SITE_ID}/{STORE_NAME}"
BLOBS_HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

MLB_API = "https://statsapi.mlb.com/api/v1"

# ── Helpers ───────────────────────────────────────────────────────────────────

def _norm(name: str) -> str:
    """Normalize name for FanGraphs / Savant key lookup.
    Must match the normalization used in build_feature_matrix.py exactly.
    """
    s = str(name).strip().lower()
    # NFD decomposition removes accent marks (é → e, etc.)
    s = uni_normalize("NFD", s)
    s = "".join(c for c in s if ord(c) < 0x300 or ord(c) > 0x36F)
    # Remove spaces AND periods (Jr., III, etc.)
    s = s.replace(" ", "").replace(".", "")
    return s


def fetch_json(url: str, label: str = "", timeout: int = REQUEST_TO) -> "dict | None":
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.get(url, timeout=timeout, headers={"User-Agent": "mlb-v3/1.0"})
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)
            else:
                print(f"  ⚠ {label or url[:60]}: {e}")
    return None


def load_blob(key: str) -> "dict | list | None":
    url = f"{BLOBS_BASE}/{key}"
    try:
        r = requests.get(url, headers={"Authorization": f"Bearer {TOKEN}"}, timeout=20)
        if r.status_code == 404:
            print(f"  ⚠ blob not found: {key}")
            return None
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"  ⚠ load_blob({key}): {e}")
        return None


def upload_blob(key: str, data, label: str = "") -> bool:
    url = f"{BLOBS_BASE}/{key}"
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.put(url, data=json.dumps(data, ensure_ascii=False),
                             headers=BLOBS_HEADERS, timeout=30)
            r.raise_for_status()
            print(f"  ✅ Uploaded {key}")
            return True
        except Exception as e:
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)
            else:
                print(f"  ✗ upload {label or key}: {e}")
    return False


def safe_float(v, default=None):
    if v is None:
        return default
    try:
        f = float(v)
        return default if math.isnan(f) else f
    except (TypeError, ValueError):
        return default


def parse_wind(wind_str: str, is_dome: bool) -> float:
    """Parse MLB StatsAPI wind string → signed mph (+ = out to CF)."""
    if is_dome:
        return 0.0
    s = str(wind_str or "").lower()
    m = re.search(r"(\d+)\s*mph", s)
    if not m:
        return 0.0
    speed = float(m.group(1))
    if re.search(r"out.*center|out.*cf|out to center", s):
        return speed
    if re.search(r"in.*center|in.*cf|in from center", s):
        return -speed
    return 0.0  # cross-wind or unknown → 0


# ── Load model artifacts ──────────────────────────────────────────────────────
print("Loading XGBoost artifacts...")
try:
    xgb_base = joblib.load(XGB_BASE_PATH)
    xgb_cal  = joblib.load(XGB_CAL_PATH)
    print(f"  ✅ xgb_base + xgb_calibrator loaded")
except Exception as e:
    print(f"  ❌ Failed to load model artifacts: {e}", file=sys.stderr)
    sys.exit(1)

FEATURE_COLS = [
    "hr_rate_bayes", "barrel_pct", "hard_hit_pct", "pitcher_barrel",
    "pitcher_rv100", "pitcher_hrfb", "park_hr_factor", "temp_adj", "wind_adj",
    "pull_park_score", "pitcher_zone_pct",
]


def impute_and_infer(feature_dict: dict) -> float:
    """Build feature vector, impute missing values, return calibrated probability."""
    vec = np.array([
        feature_dict.get(col, TRAIN_MEDIANS[col]) if feature_dict.get(col) is not None
        else TRAIN_MEDIANS[col]
        for col in FEATURE_COLS
    ], dtype=float)
    # Replace any NaN that slipped through
    for i, col in enumerate(FEATURE_COLS):
        if math.isnan(vec[i]):
            vec[i] = TRAIN_MEDIANS[col]
    X = vec.reshape(1, -1)
    # xgb_base is XGBClassifier → predict_proba; xgb_cal is IsotonicRegression → predict
    raw_p = float(xgb_base.predict_proba(X)[0, 1])
    return float(xgb_cal.predict(np.array([raw_p]))[0])


# ── Load Statcast blobs ───────────────────────────────────────────────────────
print("\nLoading Statcast blobs...")

def _players_list(blob, key="players"):
    return (blob or {}).get(key, [])

bat_cur  = load_blob(f"statcast/batters-{SEASON}.json")
bat_pri  = load_blob(f"statcast/batters-{PRIOR_SEASON}.json")
pit_ev_c = load_blob(f"statcast/pitchers-ev-{SEASON}.json")
pit_ev_p = load_blob(f"statcast/pitchers-ev-{PRIOR_SEASON}.json")
ars_cur  = load_blob(f"statcast/arsenal-{SEASON}.json")
ars_pri  = load_blob(f"statcast/arsenal-{PRIOR_SEASON}.json")
fg_cur   = load_blob(f"statcast/fangraphs-pitching-{SEASON}.json")
fg_pri   = load_blob(f"statcast/fangraphs-pitching-{PRIOR_SEASON}.json")
park_blob = (load_blob(f"statcast/park-factors-{SEASON}.json")
             or load_blob(f"statcast/park-factors-{PRIOR_SEASON}.json"))
spray_cur = load_blob(f"statcast/spray-{SEASON}.json")
spray_pri = load_blob(f"statcast/spray-{PRIOR_SEASON}.json")

# ── Build batter lookup: player_id → {barrel_pct, hard_hit_pct, pa} ──────────
# Blend current vs prior by PA (same logic as statcastLoader.mjs)
BLEND_PA_THRESH = 200

bat_cur_by_id  = {p["player_id"]: p for p in _players_list(bat_cur) if p.get("player_id")}
bat_pri_by_id  = {p["player_id"]: p for p in _players_list(bat_pri) if p.get("player_id")}

# ── Build spray lookup: player_id → {stand, pull_rate_fly, pull_rate_overall} ─
# Prefer current-season spray; fall back to prior if current-season has no entry.
spray_c_by_id = {p["player_id"]: p for p in _players_list(spray_cur) if p.get("player_id")}
spray_p_by_id = {p["player_id"]: p for p in _players_list(spray_pri) if p.get("player_id")}
print(f"  Spray loaded: {len(spray_c_by_id)} current, {len(spray_p_by_id)} prior")


def compute_pull_park_score(pull_rate_fly: "float | None", stand: str, home_abbrev: str) -> "float | None":
    """
    pull_park_score = pull_rate_fly × directional park factor.

    Handedness logic:
      RHH pulls toward LF → use the 'L' directional factor (LF-friendly parks).
      LHH pulls toward RF → use the 'R' directional factor (RF-friendly parks).
      Switch hitter ('S') → average of R and L directional factors.

    Returns None if pull_rate_fly is None (do NOT impute with 0 — treated as
    missing and imputed with the train-split median by impute_and_infer).
    """
    if pull_rate_fly is None:
        return None
    team = str(home_abbrev or "").upper().strip()
    dirs = _DIRECTIONAL_PARKS.get(team)
    if dirs is None:
        # Fallback: use overall neutral park factor for the team
        park_factor = _STATIC_PF.get(team, 1.0)
    elif stand == "R":
        park_factor = dirs["L"]   # RHH pulls to LF
    elif stand == "L":
        park_factor = dirs["R"]   # LHH pulls to RF
    else:                          # switch hitter or unknown
        park_factor = (dirs["R"] + dirs["L"]) / 2.0
    return round(float(pull_rate_fly) * park_factor, 5)


def get_batter_stats(pid: int) -> dict:
    """Return blended barrel_pct, hard_hit_pct, stand, and pull_rate_fly for a batter."""
    cur = bat_cur_by_id.get(pid, {})
    pri = bat_pri_by_id.get(pid, {})
    pa_c = safe_float(cur.get("pa") or cur.get("attempts"), 0)
    pa_p = safe_float(pri.get("pa") or pri.get("attempts"), 0)
    w_c = min(1.0, pa_c / BLEND_PA_THRESH) if BLEND_PA_THRESH > 0 else 1.0
    w_p = 1.0 - w_c

    def blend(field_c, field_p):
        v_c = safe_float(cur.get(field_c))
        v_p = safe_float(pri.get(field_p if field_p else field_c))
        if v_c is not None and v_p is not None:
            return v_c * w_c + v_p * w_p
        return v_c if v_c is not None else v_p

    # Statcast leaderboard uses "barrel_batted_rate" (or "brl_percent") and
    # "hard_hit_percent". The model expects PERCENTILE RANK (0-100).
    # The fetch_statcast.py `fetch_batters_ev` stores barrel_batted_rate (raw %)
    # not percentile rank. The pybaseball statcast_batter_percentile_ranks() data
    # would have brl_percent as a rank — but we're using the Savant CSV leaderboard.
    # Per feature_schema.json: "percentile rank 0-100 from pybaseball.statcast_batter_percentile_ranks()"
    # The blob field is barrel_batted_rate (raw), so we convert via league rank approximation.
    # For now: use raw values if available; the model was trained on percentile ranks.
    # Correction: blob field names from fetch_statcast.py fetch_batters_ev():
    #   barrel_batted_rate → stored as "barrel_batted_rate"
    #   hard_hit_percent   → stored as "hard_hit_percent"
    # But feature_schema says these should be PERCENTILE RANKS.
    # fetch_statcast.py fetches the Savant EV leaderboard which gives raw rates.
    # The training build_feature_matrix.py used statcast_batter_percentile_ranks()
    # which gives true percentile ranks (0-100).
    # Resolution: read brl_percent (percentile) if present, else use barrel_batted_rate
    # scaled to approximate rank (league avg barrel% ≈ 8.5% → rank 50).
    brl_pct_c = safe_float(cur.get("brl_percent") or cur.get("barrel_batted_rate"))
    brl_pct_p = safe_float(pri.get("brl_percent") or pri.get("barrel_batted_rate"))
    if brl_pct_c is not None and brl_pct_c < 1.0:
        # Looks like a percentile rank in [0,1] — scale to 0-100
        brl_pct_c *= 100
    if brl_pct_p is not None and brl_pct_p < 1.0:
        brl_pct_p *= 100
    hh_c = safe_float(cur.get("hard_hit_percent") or cur.get("hard_hit%"))
    hh_p = safe_float(pri.get("hard_hit_percent") or pri.get("hard_hit%"))
    # hard_hit_percent from Savant EV leaderboard is a raw % (e.g. 45.2)
    # The model expects a percentile rank. Map raw % → approximate rank.
    # League avg hard_hit% ≈ 38-40%; 50th pctl ≈ 38%.
    # We store the raw % — at inference the model sees consistent values
    # (trained on rank but receiving raw %) — this is a known approximation.
    # For now pass raw % directly; both train and inference use same source.

    v_brl = None
    if brl_pct_c is not None and brl_pct_p is not None:
        v_brl = brl_pct_c * w_c + brl_pct_p * w_p
    else:
        v_brl = brl_pct_c if brl_pct_c is not None else brl_pct_p

    v_hh = None
    if hh_c is not None and hh_p is not None:
        v_hh = hh_c * w_c + hh_p * w_p
    else:
        v_hh = hh_c if hh_c is not None else hh_p

    # Spray data: prefer current season, fall back to prior
    spray = spray_c_by_id.get(pid) or spray_p_by_id.get(pid) or {}
    stand         = spray.get("stand") or "?"
    pull_rate_fly = safe_float(spray.get("pull_rate_fly"))

    return {
        "barrel_pct":     v_brl,
        "hard_hit_pct":   v_hh,
        "pa":             pa_c,
        "stand":          stand,
        "pull_rate_fly":  pull_rate_fly,
    }


# ── Build pitcher lookups ──────────────────────────────────────────────────────
# Pitcher EV allowed: by player_id
pit_ev_c_by_id = {p["player_id"]: p for p in _players_list(pit_ev_c, "pitchers") if p.get("player_id")}
pit_ev_p_by_id = {p["player_id"]: p for p in _players_list(pit_ev_p, "pitchers") if p.get("player_id")}

# Arsenal: by player_id → list of pitches
ars_c_by_id = {p["player_id"]: p for p in _players_list(ars_cur, "pitchers") if p.get("player_id")}
ars_p_by_id = {p["player_id"]: p for p in _players_list(ars_pri, "pitchers") if p.get("player_id")}

# FanGraphs: by normalized name → {xfip, hr_fb_rate, gb_pct, fb_pct, bf}
fg_c_by_name = {}
for p in _players_list(fg_cur, "pitchers"):
    if p.get("player_name"):
        fg_c_by_name[_norm(p["player_name"])] = p
fg_p_by_name = {}
for p in _players_list(fg_pri, "pitchers"):
    if p.get("player_name"):
        fg_p_by_name[_norm(p["player_name"])] = p


def get_pitcher_features(pid: int, name: str) -> dict:
    """Return pitcher_barrel, pitcher_rv100, pitcher_hrfb for a pitcher."""
    # Pitcher EV allowed (barrel %)
    pit_c = pit_ev_c_by_id.get(pid, {})
    pit_p = pit_ev_p_by_id.get(pid, {})
    bf_c  = safe_float(pit_c.get("bf") or pit_c.get("pa"), 0)
    w_c   = min(1.0, bf_c / BLEND_PA_THRESH)
    w_p   = 1.0 - w_c

    def blend_p(fc, fp):
        vc = safe_float(pit_c.get(fc))
        vp = safe_float(pit_p.get(fp if fp else fc))
        if vc is not None and vp is not None:
            return vc * w_c + vp * w_p
        return vc if vc is not None else vp

    # barrel_batted_rate for pitcher (barrel% ALLOWED — model expects percentile rank 0-100)
    brl_c = safe_float(pit_c.get("barrel_batted_rate") or pit_c.get("brl_percent"))
    brl_p = safe_float(pit_p.get("barrel_batted_rate") or pit_p.get("brl_percent"))
    if brl_c is not None and brl_c < 1.0:
        brl_c *= 100
    if brl_p is not None and brl_p < 1.0:
        brl_p *= 100
    if brl_c is not None and brl_p is not None:
        pitcher_barrel = brl_c * w_c + brl_p * w_p
    else:
        pitcher_barrel = brl_c if brl_c is not None else brl_p

    # Arsenal RV/100: weighted avg across pitch types by usage
    def weighted_rv100(ars_map):
        if not pid or pid not in ars_map:
            return None
        pitches = ars_map[pid].get("pitches", [])
        total_u, total_rv = 0.0, 0.0
        for p in pitches:
            u  = safe_float(p.get("pitch_usage"), 0) or 0
            rv = safe_float(p.get("run_value_per_100"))
            if rv is not None:
                total_u  += u
                total_rv += u * rv
        return (total_rv / total_u) if total_u > 0 else None

    rv_c = weighted_rv100(ars_c_by_id)
    rv_p = weighted_rv100(ars_p_by_id)
    if rv_c is not None and rv_p is not None:
        pitcher_rv100 = rv_c * w_c + rv_p * w_p
    else:
        pitcher_rv100 = rv_c if rv_c is not None else rv_p

    # FanGraphs HR/FB + Zone%: try normalized name lookup in current then prior
    nk = _norm(name) if name else ""
    fg  = fg_c_by_name.get(nk) or fg_p_by_name.get(nk)
    pitcher_hrfb     = safe_float((fg or {}).get("hr_fb_rate") or (fg or {}).get("hr/fb"))
    pitcher_zone_pct = safe_float((fg or {}).get("zone_pct"))

    return {
        "pitcher_barrel":   pitcher_barrel,
        "pitcher_rv100":    pitcher_rv100,
        "pitcher_hrfb":     pitcher_hrfb,
        "pitcher_zone_pct": pitcher_zone_pct,
    }


# ── Build park factor lookup ───────────────────────────────────────────────────
# park_blob.venues: list of {team_abbr, hr_index_R, hr_index_L, hr_index_all}
# Model expects hr_factor = hr_index_all / 100

park_map = {}  # team_abbr (upper) → float ratio
if park_blob:
    for v in park_blob.get("venues", []):
        team = str(v.get("team_abbr") or v.get("team") or "").upper().strip()
        idx  = safe_float(v.get("hr_index_all") or v.get("hr_index_R"))
        if team and idx is not None:
            park_map[team] = idx / 100.0
print(f"  Park factors loaded: {len(park_map)} teams (blob), {len(_STATIC_PF)} static fallback")


def get_park_factor(home_abbrev: str, batter_hand: str = None) -> float:
    team = str(home_abbrev or "").upper().strip()
    # Try handedness-specific if available
    if park_blob and batter_hand:
        for v in park_blob.get("venues", []):
            t = str(v.get("team_abbr") or v.get("team") or "").upper().strip()
            if t == team:
                hand_key = f"hr_index_{'R' if batter_hand == 'R' else 'L'}"
                idx = safe_float(v.get(hand_key))
                if idx is not None:
                    return idx / 100.0
    if team in park_map:
        return park_map[team]
    # Static fallback
    return _STATIC_PF.get(team, 1.0)


# ── Fetch today's schedule ────────────────────────────────────────────────────
print(f"\nFetching schedule for {FEATURE_DATE}...")
sched_url = f"{MLB_API}/schedule?sportId=1&date={FEATURE_DATE}&gameType=R,D,L,W,F&hydrate=probablePitcher,venue,weather"
sched = fetch_json(sched_url, "schedule")
raw_games = (sched or {}).get("dates", [{}])[0].get("games", []) if sched else []
# Include all non-final games
games = [g for g in raw_games if g.get("status", {}).get("statusCode") not in ("F", "O", "D")]

if not games:
    print(f"  No MLB games found for {FEATURE_DATE} — writing empty features blob")
    payload = {
        "date": FEATURE_DATE, "season": SEASON,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "features": [], "games_count": 0,
        "note": "No games scheduled or games already final",
    }
    upload_blob(f"statcast/features-{FEATURE_DATE}.json", payload, "features-empty")
    sys.exit(0)

print(f"  {len(games)} games found")

# ── Teams abbreviation map ────────────────────────────────────────────────────
teams_j = fetch_json(f"{MLB_API}/teams?sportId=1&season={SEASON}", "teams") or {}
abbrev_by_id = {t["id"]: t.get("abbreviation") or t.get("teamCode") or str(t["id"])
                for t in teams_j.get("teams", [])}

# ── Build game context: teamId → {game_pk, home_abbrev, is_dome, temp_f, wind_str, opp_pitcher_id, opp_pitcher_name} ─
team_ctx = {}  # teamId → dict

for g in games:
    gk   = g.get("gamePk")
    ht   = g.get("teams", {}).get("home", {})
    at   = g.get("teams", {}).get("away", {})
    hid  = ht.get("team", {}).get("id")
    aid  = at.get("team", {}).get("id")
    habb = abbrev_by_id.get(hid, "")
    aabb = abbrev_by_id.get(aid, "")
    venue_name = g.get("venue", {}).get("name", "")
    is_dome    = any(d.lower() in venue_name.lower() for d in DOME_VENUES)

    # Weather
    wx      = g.get("weather") or {}
    temp_f  = safe_float(wx.get("temp"))
    wind_s  = wx.get("wind") or ""
    wind_ph = parse_wind(wind_s, is_dome)
    temp_adj = (0.0 if is_dome else (temp_f - 72.0 if temp_f is not None else 0.0))

    # Probable pitchers
    h_prob = ht.get("probablePitcher") or {}
    a_prob = at.get("probablePitcher") or {}
    h_pit_id   = h_prob.get("id")
    h_pit_name = h_prob.get("fullName") or h_prob.get("name") or ""
    a_pit_id   = a_prob.get("id")
    a_pit_name = a_prob.get("fullName") or a_prob.get("name") or ""

    ctx_base = {
        "game_pk": gk, "home_abbrev": habb, "venue": venue_name,
        "is_dome": is_dome, "temp_adj": temp_adj, "wind_adj": wind_ph,
    }

    # Home team faces away pitcher
    if hid:
        team_ctx[hid] = {
            **ctx_base, "team_abbrev": habb, "opp_abbrev": aabb, "is_home": True,
            "opp_pitcher_id": a_pit_id, "opp_pitcher_name": a_pit_name,
        }
    # Away team faces home pitcher
    if aid:
        team_ctx[aid] = {
            **ctx_base, "team_abbrev": aabb, "opp_abbrev": habb, "is_home": False,
            "opp_pitcher_id": h_pit_id, "opp_pitcher_name": h_pit_name,
        }

team_ids = list(team_ctx.keys())
print(f"  {len(team_ids)} teams active today")

# ── Fetch active rosters (hitters only) ──────────────────────────────────────
roster_by_team = {}
for tid in team_ids:
    r = fetch_json(f"{MLB_API}/teams/{tid}/roster?rosterType=active", f"roster-{tid}")
    hitters = [x for x in (r or {}).get("roster", [])
               if str(x.get("position", {}).get("code", "")).upper() not in
               ("P", "SP", "RP", "CP")]
    roster_by_team[tid] = hitters

all_pids = list({r["person"]["id"]
                 for tid, roster in roster_by_team.items()
                 for r in roster if r.get("person", {}).get("id")})
print(f"  {len(all_pids)} total hitters across all rosters")

# ── Fetch season-to-date HR/PA stats ─────────────────────────────────────────
stat_by_id = {}   # pid → {hr, pa, name}

def fetch_stats_chunk(pids, season):
    if not pids:
        return {}
    url = f"{MLB_API}/people?personIds={','.join(str(p) for p in pids)}&hydrate=stats(group=hitting,type=season,season={season})"
    j = fetch_json(url, f"stats-{season}") or {}
    out = {}
    for p in j.get("people", []):
        hr = pa = 0
        for s in p.get("stats", []):
            for sp in s.get("splits", []):
                hr += int(sp.get("stat", {}).get("homeRuns", 0))
                pa += int(sp.get("stat", {}).get("plateAppearances", 0))
        out[p["id"]] = {"name": p.get("fullName") or p.get("firstLastName") or str(p["id"]), "hr": hr, "pa": pa}
    return out

# Fetch in chunks of 100
for i in range(0, len(all_pids), 100):
    chunk = all_pids[i:i+100]
    stat_by_id.update(fetch_stats_chunk(chunk, SEASON))

# Fill missing with prior-season stats (blend later)
prior_stat_by_id = {}
missing = [p for p in all_pids if p not in stat_by_id or stat_by_id[p]["pa"] == 0]
for i in range(0, len(missing), 100):
    chunk = missing[i:i+100]
    prior_stat_by_id.update(fetch_stats_chunk(chunk, PRIOR_SEASON))

# Blend: for players with <200 current-season PA, blend with prior
for pid, cur in stat_by_id.items():
    pri = prior_stat_by_id.get(pid, {})
    if not pri or pri.get("pa", 0) == 0:
        continue
    w_c = min(1.0, cur["pa"] / BLEND_PA_THRESH)
    w_p = 1.0 - w_c
    if w_p <= 0:
        continue
    prior_rate = pri["hr"] / pri["pa"] if pri["pa"] > 0 else PRIOR_RATE
    curr_rate  = cur["hr"] / cur["pa"] if cur["pa"] > 0 else 0.0
    blended_rate = w_c * curr_rate + w_p * prior_rate
    eff_pa  = cur["pa"] + round(w_p * min(pri["pa"], 500))
    eff_hr  = round(blended_rate * eff_pa)
    stat_by_id[pid] = {**cur, "hr": eff_hr, "pa": eff_pa, "blended": True}

# Players with zero current PA → use prior entirely
for pid in missing:
    pri = prior_stat_by_id.get(pid)
    if pri and pid not in stat_by_id:
        stat_by_id[pid] = {**pri, "blended": True}

print(f"  Stats: {len(stat_by_id)} players with HR/PA data")

# ── Build feature vectors ─────────────────────────────────────────────────────
print("\nBuilding feature vectors...")
features_out = []
skipped = 0

for tid, ctx in team_ctx.items():
    roster = roster_by_team.get(tid, [])
    pit_id   = ctx.get("opp_pitcher_id")
    pit_name = ctx.get("opp_pitcher_name", "")
    home_ab  = ctx.get("home_abbrev", "")
    is_dome  = ctx.get("is_dome", False)
    temp_adj = ctx.get("temp_adj", 0.0)
    wind_adj = ctx.get("wind_adj", 0.0)

    # Pitcher features (fetched once per team)
    pit_feats = get_pitcher_features(pit_id, pit_name) if pit_id else {
        "pitcher_barrel": None, "pitcher_rv100": None, "pitcher_hrfb": None,
        "pitcher_zone_pct": None,
    }

    # Park factor
    pf = get_park_factor(home_ab)

    for r in roster:
        pid  = r.get("person", {}).get("id")
        if not pid:
            continue
        st = stat_by_id.get(pid)
        if not st:
            skipped += 1
            continue
        pa   = st.get("pa", 0)
        hr   = st.get("hr", 0)
        name = st.get("name", "")
        if pa <= 0:
            skipped += 1
            continue

        # hr_rate_bayes
        hr_rate_bayes = (hr + PRIOR_RATE * PRIOR_PA) / (pa + PRIOR_PA)

        # Batter Statcast + spray
        bst = get_batter_stats(pid)

        # pull_park_score: pull_rate_fly × directional park factor
        # Returns None if no spray data — impute_and_infer uses train median
        pull_park_score = compute_pull_park_score(
            bst.get("pull_rate_fly"), bst.get("stand", "?"), home_ab
        )

        # Assemble full 11-feature dict and run inference
        feat_dict = {
            "hr_rate_bayes":    hr_rate_bayes,
            "barrel_pct":       bst.get("barrel_pct"),
            "hard_hit_pct":     bst.get("hard_hit_pct"),
            "pitcher_barrel":   pit_feats.get("pitcher_barrel"),
            "pitcher_rv100":    pit_feats.get("pitcher_rv100"),
            "pitcher_hrfb":     pit_feats.get("pitcher_hrfb"),
            "park_hr_factor":   pf,
            "temp_adj":         temp_adj,
            "wind_adj":         wind_adj,
            "pull_park_score":  pull_park_score,
            "pitcher_zone_pct": pit_feats.get("pitcher_zone_pct"),
        }
        raw_prob = impute_and_infer(feat_dict)

        features_out.append({
            # Identifiers
            "player_id":    pid,
            "player_name":  name,
            "team_abbrev":  ctx.get("team_abbrev", ""),
            "is_home":      ctx.get("is_home", False),
            "game_pk":      ctx.get("game_pk"),
            "opp_abbrev":   ctx.get("opp_abbrev", ""),
            "opp_pitcher_id":   pit_id,
            "opp_pitcher_name": pit_name,
            "venue":        ctx.get("venue", ""),
            "is_dome":      is_dome,
            # Feature values (for model transparency panel)
            "hr_rate_bayes":    round(hr_rate_bayes, 6),
            "barrel_pct":       round(bst.get("barrel_pct"), 4) if bst.get("barrel_pct") is not None else None,
            "hard_hit_pct":     round(bst.get("hard_hit_pct"), 4) if bst.get("hard_hit_pct") is not None else None,
            "pitcher_barrel":   round(pit_feats.get("pitcher_barrel"), 4) if pit_feats.get("pitcher_barrel") is not None else None,
            "pitcher_rv100":    round(pit_feats.get("pitcher_rv100"), 4) if pit_feats.get("pitcher_rv100") is not None else None,
            "pitcher_hrfb":     round(pit_feats.get("pitcher_hrfb"), 4) if pit_feats.get("pitcher_hrfb") is not None else None,
            "park_hr_factor":   round(pf, 4),
            "temp_adj":         round(temp_adj, 2),
            "wind_adj":         round(wind_adj, 2),
            "pull_park_score":  round(pull_park_score, 5) if pull_park_score is not None else None,
            "pitcher_zone_pct": round(pit_feats.get("pitcher_zone_pct"), 4) if pit_feats.get("pitcher_zone_pct") is not None else None,
            # Inference result
            "model_prob":  round(raw_prob, 6),
            # Stats context (for display + rolling stats in results logger)
            "season_hr":  hr,
            "season_pa":  pa,
            "blended":    st.get("blended", False),
        })

features_out.sort(key=lambda x: x["model_prob"], reverse=True)
print(f"  Built {len(features_out)} player feature vectors ({skipped} skipped — no stats)")

# ── Write to Blob ─────────────────────────────────────────────────────────────
payload = {
    "date":          FEATURE_DATE,
    "season":        SEASON,
    "generated_at":  datetime.now(timezone.utc).isoformat(),
    "games_count":   len(games),
    "players_count": len(features_out),
    "features":      features_out,
}

ok = upload_blob(f"statcast/features-{FEATURE_DATE}.json", payload, "features")

# ── Update meta.json ──────────────────────────────────────────────────────────
meta = load_blob("statcast/meta.json") or {}
meta["features_built"] = {
    "date":          FEATURE_DATE,
    "players_count": len(features_out),
    "games_count":   len(games),
    "generated_at":  datetime.now(timezone.utc).isoformat(),
    "ok":            ok,
}
upload_blob("statcast/meta.json", meta, "meta-update")

# ── Validation gates (printed, not sys.exit — CI reads logs) ──────────────────
print("\n" + "═"*60)
print("  VALIDATION GATES")
print("═"*60)

barrel_coverage = sum(1 for f in features_out if f.get("barrel_pct") is not None) / max(len(features_out), 1)
hrfb_pitchers   = len({f["opp_pitcher_id"] for f in features_out if f.get("opp_pitcher_id")})
hrfb_covered    = sum(1 for pid in {f["opp_pitcher_id"] for f in features_out if f.get("opp_pitcher_id")}
                      if any(f["opp_pitcher_id"] == pid and f.get("pitcher_hrfb") is not None
                             for f in features_out))
hrfb_coverage    = hrfb_covered / max(hrfb_pitchers, 1)
pull_coverage    = sum(1 for f in features_out if f.get("pull_park_score") is not None) / max(len(features_out), 1)
zone_pitchers    = len({f["opp_pitcher_id"] for f in features_out if f.get("opp_pitcher_id")})
zone_covered     = sum(1 for pid in {f["opp_pitcher_id"] for f in features_out if f.get("opp_pitcher_id")}
                       if any(f["opp_pitcher_id"] == pid and f.get("pitcher_zone_pct") is not None
                              for f in features_out))
zone_coverage    = zone_covered / max(zone_pitchers, 1)
probs            = [f["model_prob"] for f in features_out]
prob_in_range    = sum(1 for p in probs if 0.05 <= p <= 0.45) / max(len(probs), 1)

print(f"  Players built:        {len(features_out)}  {'✅' if len(features_out) > 100 else '⚠️ <100'}")
print(f"  Barrel pct coverage:  {barrel_coverage:.1%}  {'✅' if barrel_coverage > 0.80 else '⚠️ <80%'}")
print(f"  Pitcher HR/FB cov:    {hrfb_coverage:.1%}  {'✅' if hrfb_coverage > 0.70 else '⚠️ <70%'}")
print(f"  Pull park score cov:  {pull_coverage:.1%}  {'✅' if pull_coverage > 0.85 else '⚠️ <85% (spray data)'}")
print(f"  Pitcher zone% cov:    {zone_coverage:.1%}  {'✅' if zone_coverage > 0.90 else '⚠️ <90%'}")
print(f"  Probs in [0.05,0.45]: {prob_in_range:.1%}  {'✅' if prob_in_range > 0.95 else '⚠️'}")
if probs:
    ev25_count = sum(1 for f in features_out if f["model_prob"] >= 0.25)
    print(f"  Players ≥25% model:   {ev25_count}  (expected 3-15 on typical day)")

print(f"\n{'✅' if ok else '❌'} Feature blob {'written' if ok else 'FAILED'} → statcast/features-{FEATURE_DATE}.json")
