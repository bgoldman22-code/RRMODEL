#!/usr/bin/env python3
"""
Decision 1 — Feature Sprint
============================
Adds three new features to the MLB V3 pipeline:

  1. pull_park_score   = pull_rate_fly × park_hr_factor_directional
     (pull_rate_fly already computed by fetch_statcast.py spray fetcher;
      directional park factor = hr_index_L for RHH pulling to LF,
      hr_index_R for LHH pulling to RF)

  2. pitcher_zone_pct  — FanGraphs Zone% for opposing SP
     (Zone% already in pitching_stats() DataFrame; add to fangraphs cache)

  3. batter_oswing_pct — FanGraphs O-Swing% for batter
     (new pybaseball batting_stats() fetch; both current + prior year)

Pipeline
--------
  Phase A: Fetch new data for all seasons 2022-2025 (spray, Zone%, O-Swing%).
            Augments statcast_local/*.json caches in-place.
  Phase B: Rebuild feature matrix (9 → 12 features: adds pull_park_score,
            pitcher_zone_pct, batter_oswing_pct). Saves alongside existing matrix.
  Phase C: Retrain XGBoost + refit isotonic calibrator. Report 5 metrics.

Do NOT deploy until metrics are reported and approved.

Run:
  python scripts/mlb_v3/feature_sprint_d1.py [--skip-fetch] [--seasons 2022 2023 2024 2025]
"""

import argparse
import io
import json
import math
import pathlib
import sys
import time
import unicodedata
from collections import defaultdict, deque
from datetime import datetime

import numpy as np
import pandas as pd
import requests
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import roc_auc_score
from xgboost import XGBClassifier

ROOT = pathlib.Path(__file__).parent.parent.parent

# ── CLI ───────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Feature Sprint D1: add pull_park_score, pitcher_zone_pct, batter_oswing_pct")
parser.add_argument("--skip-fetch",  action="store_true", help="Skip data fetch phase (use existing augmented cache)")
parser.add_argument("--seasons",     nargs="+", type=int, default=[2022, 2023, 2024, 2025])
parser.add_argument("--out",         type=str,  default=str(ROOT / "data/mlb_v3/feature_matrix_v2.parquet"))
parser.add_argument("--artifacts",   type=str,  default=str(ROOT / "data/mlb_v3/artifacts_v2"))
args = parser.parse_args()

SEASONS      = sorted(args.seasons)
OUT_PATH     = pathlib.Path(args.out)
ARTIFACTS    = pathlib.Path(args.artifacts)
STATCAST_DIR = ROOT / "data/mlb_v3/statcast_local"
GAMES_DIR    = ROOT / "data/mlb_research/raw/statsapi_games"
ODDS_DIR     = ROOT / "data/mlb_historical/odds"

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
ARTIFACTS.mkdir(parents=True, exist_ok=True)

TODAY = datetime.utcnow().strftime("%Y-%m-%d")
CURRENT_YEAR = datetime.utcnow().year

print(f"{'='*64}")
print(f"  Feature Sprint D1 — {TODAY}")
print(f"  Seasons: {SEASONS}")
print(f"  Output:  {OUT_PATH}")
print(f"{'='*64}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_float(v):
    if v is None: return None
    try:
        f = float(v)
        return None if math.isnan(f) else round(f, 6)
    except: return None

def _safe_int(v):
    if v is None: return None
    try: return int(float(v))
    except: return None

def _norm(s):
    """Normalise name: lowercase, strip accents, remove spaces/dots/apostrophes."""
    s = str(s or "").lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.replace(".", "").replace("'", "").replace(" ", "").strip()


# ── Static directional park factors (from fetch_statcast._STATIC_PARK_FACTORS) ──
# hr_index_R = HR index for RHH (pull to LF); hr_index_L = HR index for LHH (pull to RF).
# Normalised to ratio form (÷ 100) for multiplication with pull_rate_fly.
_DIRECTIONAL_PARKS = {
    "COL": {"R": 1.17, "L": 1.21},
    "CIN": {"R": 1.12, "L": 1.10},
    "PHI": {"R": 1.10, "L": 1.09},
    "MIL": {"R": 1.08, "L": 1.07},
    "BAL": {"R": 1.07, "L": 1.06},
    "HOU": {"R": 1.06, "L": 1.05},
    "BOS": {"R": 1.03, "L": 1.09},
    "ARI": {"R": 1.05, "L": 1.04},
    "NYY": {"R": 1.04, "L": 1.12},
    "TEX": {"R": 1.04, "L": 1.03},
    "TOR": {"R": 1.03, "L": 1.02},
    "ATL": {"R": 1.02, "L": 1.01},
    "DET": {"R": 0.95, "L": 0.96},
    "CLE": {"R": 0.97, "L": 0.98},
    "MIN": {"R": 0.98, "L": 0.97},
    "LAD": {"R": 0.98, "L": 0.97},
    "CWS": {"R": 1.00, "L": 0.99},
    "CHC": {"R": 0.99, "L": 1.01},
    "LAA": {"R": 0.99, "L": 0.98},
    "MIA": {"R": 0.95, "L": 0.96},
    "NYM": {"R": 0.96, "L": 0.97},
    "OAK": {"R": 0.98, "L": 0.97},
    "PIT": {"R": 0.97, "L": 0.98},
    "STL": {"R": 0.98, "L": 0.97},
    "SD":  {"R": 0.93, "L": 0.94},
    "SEA": {"R": 0.94, "L": 0.93},
    "SF":  {"R": 0.92, "L": 0.91},
    "TB":  {"R": 0.96, "L": 0.95},
    "WSH": {"R": 0.99, "L": 0.98},
    "KC":  {"R": 0.96, "L": 0.95},
}


# ══════════════════════════════════════════════════════════════════════════════
# PHASE A — Fetch new data and augment local caches
# ══════════════════════════════════════════════════════════════════════════════

def fetch_spray_year(year: int) -> "dict[int, dict]":
    """
    Fetch spray chart data from Baseball Savant for pull_rate_fly.
    Returns {player_id: {pull_rate_fly, stand, total_fly_balls}}.

    Uses the same fetch_statcast.py fetch_spray() logic:
      RHH pull = hc_x > 170 on fly balls (launch_angle > 10)
      LHH pull = hc_x < 80 on fly balls
    """
    is_prior = (year < CURRENT_YEAR)
    date_low  = f"{year}-03-20"
    date_high = f"{year}-10-01" if is_prior else TODAY
    label     = f"spray-{year}"

    url = (
        f"https://baseballsavant.mlb.com/statcast_search/csv"
        f"?all=true&hfGT=R%7C&hfSea={year}%7C"
        f"&player_type=batter"
        f"&game_date_gt={date_low}&game_date_lt={date_high}"
        f"&hfAB=home_run%7Csingle%7Cdouble%7Ctriple%7Cfield_out%7C"
        f"&type=details"
    )

    print(f"  ↓ [{label}] fetching Savant pitch-by-pitch (may take ~60s)...")
    for attempt in range(1, 4):
        try:
            r = requests.get(url, timeout=180, headers={"User-Agent": "mlb-v3-sprint/1.0"})
            r.raise_for_status()
            if not r.text.strip() or r.text.strip().startswith("<"):
                print(f"  ⚠ [{label}] attempt {attempt} — got HTML, not CSV")
                time.sleep(10 * attempt)
                continue
            df = pd.read_csv(io.StringIO(r.text))
            print(f"  ✓ [{label}] {len(df):,} rows, {len(df.columns)} cols")
            break
        except Exception as e:
            print(f"  ⚠ [{label}] attempt {attempt} failed: {e}")
            if attempt < 3:
                time.sleep(10 * attempt)
    else:
        print(f"  ✗ [{label}] all attempts failed")
        return {}

    df.columns = [c.lower().strip() for c in df.columns]
    needed = {"batter", "stand", "hc_x", "launch_angle"}
    if not needed.issubset(set(df.columns)):
        missing = needed - set(df.columns)
        print(f"  ⚠ [{label}] missing required columns: {missing}")
        return {}

    df["hc_x"]         = pd.to_numeric(df["hc_x"],         errors="coerce")
    df["launch_angle"] = pd.to_numeric(df["launch_angle"], errors="coerce")
    df = df.dropna(subset=["hc_x", "launch_angle", "batter", "stand"])
    df["batter"] = df["batter"].astype(int)
    df_fly = df[df["launch_angle"] > 10].copy()

    def is_pull(row):
        if row["stand"] == "R":
            return row["hc_x"] > 170
        elif row["stand"] == "L":
            return row["hc_x"] < 80
        return False

    df_fly["is_pull"] = df_fly.apply(is_pull, axis=1)
    fly_agg = (
        df_fly.groupby("batter")["is_pull"]
        .agg(pull_fly="sum", total_fly="count")
        .reset_index()
    )
    side_map = df.groupby("batter")["stand"].first().to_dict()

    result = {}
    for _, row in fly_agg.iterrows():
        bid  = int(row["batter"])
        prf  = float(row["pull_fly"] / row["total_fly"]) if row["total_fly"] >= 5 else None
        result[bid] = {
            "pull_rate_fly":   round(prf, 4) if prf is not None else None,
            "stand":           side_map.get(bid, "?"),
            "total_fly_balls": int(row["total_fly"]),
        }

    non_null = sum(1 for v in result.values() if v["pull_rate_fly"] is not None)
    print(f"  ✓ [{label}] {len(result)} batters, {non_null} with pull_rate_fly (≥5 fly balls)")
    return result


def fetch_zone_pct_year(year: int) -> "dict[str, float]":
    """
    Fetch FanGraphs Zone% for pitchers via pybaseball pitching_stats().
    Returns {norm_name: zone_pct}.
    Zone% is the fraction of pitches thrown in the strike zone.
    """
    label = f"zone_pct-{year}"
    try:
        from pybaseball import pitching_stats
        from pybaseball import cache as pb_cache
        pb_cache.enable()
    except ImportError:
        print(f"  ✗ [{label}] pybaseball not installed")
        return {}

    print(f"  ↓ [{label}] pitching_stats({year}) ...")
    for attempt in range(1, 3):
        try:
            fg = pitching_stats(year, year, qual=10)
            if fg is None or len(fg) < 5:
                # Try prior year
                prior = year - 1
                print(f"  ⚠ [{label}] <5 rows for {year}, trying {prior}")
                fg = pitching_stats(prior, prior, qual=10)
            print(f"  ✓ [{label}] {len(fg)} rows")
            break
        except Exception as e:
            print(f"  ⚠ [{label}] attempt {attempt}: {e}")
            if attempt < 2:
                time.sleep(5)
    else:
        return {}

    fg.columns = [str(c).strip() for c in fg.columns]

    # Zone% column names FanGraphs uses
    zone_col = next((c for c in fg.columns if c in ("Zone%", "Zone", "zone_pct", "Zone %")), None)
    name_col = next((c for c in fg.columns if c in ("Name", "name")), None)

    if not zone_col or not name_col:
        print(f"  ⚠ [{label}] cols available: {list(fg.columns[:20])}")
        print(f"  ⚠ [{label}] zone_col={zone_col} name_col={name_col} — cannot extract Zone%")
        return {}

    result = {}
    for _, row in fg.iterrows():
        name = _norm(row[name_col])
        val  = _safe_float(row[zone_col])
        if name and val is not None:
            # FanGraphs reports as percentage (e.g. 47.3 means 47.3%)
            # Normalise to 0-1 if > 1 (some versions report as fraction)
            result[name] = val / 100.0 if val > 1.0 else val

    print(f"  ✓ [{label}] {len(result)} pitchers with Zone%")
    return result


def fetch_oswing_year(year: int) -> "dict[str, float]":
    """
    Fetch FanGraphs O-Swing% for batters via pybaseball batting_stats().
    Returns {norm_name: oswing_pct} (as 0-1 fraction).
    O-Swing% = fraction of pitches outside zone the batter swings at (chase rate).
    """
    label = f"oswing-{year}"
    try:
        from pybaseball import batting_stats
        from pybaseball import cache as pb_cache
        pb_cache.enable()
    except ImportError:
        print(f"  ✗ [{label}] pybaseball not installed")
        return {}

    print(f"  ↓ [{label}] batting_stats({year}) ...")
    for attempt in range(1, 3):
        try:
            bg = batting_stats(year, year, qual=25)
            if bg is None or len(bg) < 5:
                prior = year - 1
                print(f"  ⚠ [{label}] <5 rows for {year}, trying {prior}")
                bg = batting_stats(prior, prior, qual=25)
            print(f"  ✓ [{label}] {len(bg)} rows")
            break
        except Exception as e:
            print(f"  ⚠ [{label}] attempt {attempt}: {e}")
            if attempt < 2:
                time.sleep(5)
    else:
        return {}

    bg.columns = [str(c).strip() for c in bg.columns]

    # O-Swing% column names
    oswing_col = next((c for c in bg.columns if c in ("O-Swing%", "O-Swing", "o_swing_pct", "O-Swing %")), None)
    name_col   = next((c for c in bg.columns if c in ("Name", "name")), None)

    if not oswing_col or not name_col:
        print(f"  ⚠ [{label}] cols (first 30): {list(bg.columns[:30])}")
        print(f"  ⚠ [{label}] oswing_col={oswing_col} name_col={name_col} — cannot extract O-Swing%")
        return {}

    result = {}
    for _, row in bg.iterrows():
        name = _norm(row[name_col])
        val  = _safe_float(row[oswing_col])
        if name and val is not None:
            result[name] = val / 100.0 if val > 1.0 else val

    print(f"  ✓ [{label}] {len(result)} batters with O-Swing%")
    return result


if not args.skip_fetch:
    print(f"\n{'='*64}")
    print("  PHASE A — Fetching new features for all seasons")
    print(f"{'='*64}")

    for season in SEASONS:
        print(f"\n{'─'*60}")
        print(f"  Season {season}")
        print(f"{'─'*60}")

        cache_path = STATCAST_DIR / f"statcast_{season}.json"
        if not cache_path.exists():
            print(f"  ⚠ Cache not found: {cache_path} — skipping")
            continue

        cache = json.loads(cache_path.read_text())

        # ── 1. Spray / pull_rate_fly ──────────────────────────────────────
        spray = fetch_spray_year(season)
        if spray:
            cache["spray"] = {str(k): v for k, v in spray.items()}
            print(f"  Stored {len(spray)} spray records → cache['spray']")
        else:
            print(f"  ⚠ No spray data for {season} — pull_park_score will be null for this season")
            cache.setdefault("spray", {})

        # ── 2. Zone% (pitchers) ───────────────────────────────────────────
        zone = fetch_zone_pct_year(season)
        # Merge into existing fangraphs dict
        merged_zone = 0
        for norm_name, zval in zone.items():
            if norm_name in cache.get("fangraphs", {}):
                cache["fangraphs"][norm_name]["zone_pct"] = zval
                merged_zone += 1
            else:
                # Pitcher in Zone% data but not in existing cache — add new entry
                cache.setdefault("fangraphs", {})[norm_name] = {"zone_pct": zval}
                merged_zone += 1
        print(f"  Merged zone_pct into {merged_zone} pitchers")

        # ── 3. O-Swing% (batters) ─────────────────────────────────────────
        oswing = fetch_oswing_year(season)
        # Store in new 'fangraphs_batting' dict keyed by norm_name
        cache["fangraphs_batting"] = {k: {"oswing_pct": v} for k, v in oswing.items()}
        print(f"  Stored {len(oswing)} batter O-Swing% records → cache['fangraphs_batting']")

        # ── Save augmented cache ──────────────────────────────────────────
        cache_path.write_text(json.dumps(cache, ensure_ascii=False))
        print(f"  ✅ Saved augmented cache → {cache_path.name}")

else:
    print("\n[--skip-fetch] Skipping data fetch phase, using existing cache.")


# ══════════════════════════════════════════════════════════════════════════════
# PHASE B — Rebuild feature matrix with 3 new features
# ══════════════════════════════════════════════════════════════════════════════

print(f"\n{'='*64}")
print("  PHASE B — Rebuilding feature matrix (9 → 12 features)")
print(f"{'='*64}")

# ── Re-use existing helpers from build_feature_matrix.py ──────────────────

def load_odds_for_date(date_str: str, season: int) -> dict:
    path = ODDS_DIR / str(season) / f"{date_str}.json"
    if not path.exists():
        return {}
    d = json.loads(path.read_text())
    by_player = defaultdict(list)
    for game in d.get("games", []):
        for bk in game.get("bookmakers", []):
            for mkt in bk.get("markets", []):
                if mkt.get("key") != "batter_home_runs":
                    continue
                for o in mkt.get("outcomes", []):
                    if o.get("name") != "Over" or o.get("point") != 0.5:
                        continue
                    price = o.get("price")
                    if price is None:
                        continue
                    if abs(price) >= 1.5 and abs(price) <= 10:
                        prob = 1.0 / price
                    elif price > 100:
                        prob = 100 / (price + 100)
                    elif price < -100:
                        prob = abs(price) / (abs(price) + 100)
                    else:
                        continue
                    desc = _norm(o.get("description", ""))
                    if desc:
                        by_player[desc].append(prob)
    return {name: sorted(probs)[len(probs) // 2] for name, probs in by_player.items()}


def extract_weather(game: dict):
    wx = game.get("weather") or {}
    venue = game.get("venue") or {}
    roof = str(venue.get("roof_type", "")).lower()
    is_dome = any(x in roof for x in ["retractable", "dome", "closed", "indoor"])
    temp_f = _safe_float(wx.get("temp_f"))
    wind_str = str(wx.get("wind") or "")
    wind_out_mph = None
    if wind_str and "mph" in wind_str:
        parts = wind_str.lower().split()
        try:
            speed = float(parts[0])
            direction = " ".join(parts[2:])
            if any(x in direction for x in ["out to center", "out to cf", "out"]):
                wind_out_mph = speed
            elif any(x in direction for x in ["in from center", "in from cf", "in"]):
                wind_out_mph = -speed
            else:
                wind_out_mph = 0.0
        except:
            wind_out_mph = 0.0
    return {
        "temp_f":        temp_f if not is_dome else None,
        "wind_out_mph":  wind_out_mph if not is_dome else None,
        "is_dome":       is_dome,
    }


class RollingStats:
    def __init__(self):
        self._store = defaultdict(lambda: {"hr": 0, "pa": 0})

    def get_rate(self, pid: int):
        s = self._store[pid]
        pa = s["pa"]
        rate = (s["hr"] / pa) if pa >= 20 else 0.0
        return rate, pa

    def update(self, pid: int, hr: int, pa: int):
        self._store[pid]["hr"] += hr
        self._store[pid]["pa"] += pa


# ── New feature coverage counters ─────────────────────────────────────────────
cov = {
    "pull_park_score":   {"n_nonnull": 0, "n_total": 0},
    "pitcher_zone_pct":  {"n_nonnull": 0, "n_total": 0},
    "batter_oswing_pct": {"n_nonnull": 0, "n_total": 0},
}

all_rows = []

for season in SEASONS:
    print(f"\n{'─'*60}")
    print(f"  Season {season}")
    print(f"{'─'*60}")

    # Load augmented statcast cache
    cache_path = STATCAST_DIR / f"statcast_{season}.json"
    if not cache_path.exists():
        print(f"  ⚠ Cache not found: {cache_path}")
        continue

    cache = json.loads(cache_path.read_text())

    batters_sc      = {int(k): v for k, v in cache.get("batters", {}).items()}
    pitchers_sc     = {int(k): v for k, v in cache.get("pitchers_ev", {}).items()}
    arsenal_sc      = {int(k): v for k, v in cache.get("arsenal", {}).items()}
    fg_sc           = cache.get("fangraphs", {})            # norm_name → {xfip, hr_fb, zone_pct, ...}
    parks_sc        = cache.get("park_factors", {})         # abbrev → {hr_factor}
    spray_sc        = {int(k): v for k, v in cache.get("spray", {}).items()}        # player_id → {pull_rate_fly, stand}
    fg_batting_sc   = cache.get("fangraphs_batting", {})    # norm_name → {oswing_pct}

    games_dir = GAMES_DIR / str(season)
    if not games_dir.exists():
        print(f"  ⚠ No game files for {season}")
        continue

    game_files = sorted(
        games_dir.glob("*.json"),
        key=lambda f: json.loads(f.read_text()).get("game_date", "")
    )
    print(f"  {len(game_files)} game files")

    rolling = RollingStats()
    season_rows = 0

    for gf in game_files:
        try:
            game = json.loads(gf.read_text())
        except:
            continue

        game_pk   = game.get("game_pk")
        game_date = game.get("game_date", "")
        if not game_date:
            continue

        odds = load_odds_for_date(game_date, season)

        sp = game.get("starting_pitchers") or {}
        home_sp    = sp.get("home") or {}
        away_sp    = sp.get("away") or {}
        home_sp_id = _safe_int(home_sp.get("player_id"))
        away_sp_id = _safe_int(away_sp.get("player_id"))
        home_sp_name = str(home_sp.get("full_name") or "")
        away_sp_name = str(away_sp.get("full_name") or "")

        home_abbrev = str(game.get("home_team", {}).get("abbreviation") or "").upper()
        park_factor = parks_sc.get(home_abbrev, {}).get("hr_factor", 1.0)

        wx = extract_weather(game)

        bs = game.get("boxscore") or {}
        outcomes = {}
        for side in ("home", "away"):
            for batter in (bs.get(side) or {}).get("batters", []):
                pid = _safe_int(batter.get("player_id"))
                if pid:
                    outcomes[pid] = {
                        "hr": int(batter.get("hr") or 0),
                        "pa": int(batter.get("pa") or 0),
                    }

        lineups = game.get("lineups", {})

        for side in ("home", "away"):
            lineup = lineups.get(side, [])
            if not lineup:
                lineup = [
                    {"player_id": b["player_id"],
                     "batting_order": _safe_int(b.get("batting_order", 0)) or 0,
                     "bats": None}
                    for b in (bs.get(side) or {}).get("batters", [])
                    if b.get("player_id")
                ]

            is_home     = (side == "home")
            opp_sp_id   = away_sp_id   if is_home else home_sp_id
            opp_sp_name = away_sp_name if is_home else home_sp_name
            team_abbrev = str(game.get(f"{side}_team", {}).get("abbreviation") or "").upper()

            # Existing pitcher features
            pit_barrel = pitchers_sc.get(opp_sp_id, {}).get("barrel_pct") if opp_sp_id else None
            pit_rv100  = arsenal_sc.get(opp_sp_id, {}).get("rv100")        if opp_sp_id else None
            norm_sp    = _norm(opp_sp_name)
            fg_rec     = fg_sc.get(norm_sp, {})
            pit_xfip   = _safe_float(fg_rec.get("xfip"))
            pit_hrfb   = _safe_float(fg_rec.get("hr_fb"))

            # NEW: pitcher_zone_pct
            pit_zone   = _safe_float(fg_rec.get("zone_pct"))

            for batter_entry in lineup:
                pid = _safe_int(batter_entry.get("player_id"))
                if not pid:
                    continue

                outcome = outcomes.get(pid)
                if outcome is None:
                    continue

                did_hr  = 1 if outcome["hr"] >= 1 else 0
                pa_game = outcome["pa"]

                hr_rate_std, pa_std = rolling.get_rate(pid)

                bat_sc       = batters_sc.get(pid, {})
                barrel_pct   = _safe_float(bat_sc.get("barrel_pct"))
                exit_velo    = _safe_float(bat_sc.get("exit_velo"))
                hard_hit_pct = _safe_float(bat_sc.get("hard_hit_pct"))

                player_name = str(batter_entry.get("full_name") or "")
                market_prob = odds.get(_norm(player_name))

                # ── NEW: pull_park_score ──────────────────────────────────
                spray_rec      = spray_sc.get(pid, {})
                pull_rate_fly  = _safe_float(spray_rec.get("pull_rate_fly"))
                batter_stand   = str(spray_rec.get("stand") or batter_entry.get("bats") or "")

                pull_park_score = None
                if pull_rate_fly is not None and home_abbrev in _DIRECTIONAL_PARKS:
                    dp = _DIRECTIONAL_PARKS[home_abbrev]
                    # RHH pulls to LF → use LHH park factor (shared wall effect)
                    # LHH pulls to RF → use RHH park factor
                    if batter_stand == "R":
                        directional_pf = dp["L"]
                    elif batter_stand == "L":
                        directional_pf = dp["R"]
                    else:
                        directional_pf = (dp["R"] + dp["L"]) / 2.0  # switch hitter: average
                    pull_park_score = round(pull_rate_fly * directional_pf, 6)

                # ── NEW: batter_oswing_pct ────────────────────────────────
                norm_batter   = _norm(player_name)
                bfg_rec       = fg_batting_sc.get(norm_batter, {})
                batter_oswing = _safe_float(bfg_rec.get("oswing_pct"))

                # Coverage tracking
                cov["pull_park_score"]["n_total"] += 1
                cov["pitcher_zone_pct"]["n_total"] += 1
                cov["batter_oswing_pct"]["n_total"] += 1
                if pull_park_score is not None:   cov["pull_park_score"]["n_nonnull"] += 1
                if pit_zone is not None:          cov["pitcher_zone_pct"]["n_nonnull"] += 1
                if batter_oswing is not None:     cov["batter_oswing_pct"]["n_nonnull"] += 1

                row = {
                    # Identifiers
                    "game_pk":           game_pk,
                    "game_date":         game_date,
                    "season":            season,
                    "player_id":         pid,
                    "player_name":       player_name,
                    "team_abbrev":       team_abbrev,
                    "home_team":         is_home,
                    "batting_order":     _safe_int(batter_entry.get("batting_order")) or 0,
                    "bats":              str(batter_entry.get("bats") or ""),
                    # Rolling (no leakage)
                    "hr_rate_std":       hr_rate_std,
                    "pa_std":            pa_std,
                    # Statcast batter
                    "barrel_pct":        barrel_pct,
                    "exit_velo":         exit_velo,
                    "hard_hit_pct":      hard_hit_pct,
                    # Pitcher
                    "pitcher_id":        opp_sp_id,
                    "pitcher_name":      opp_sp_name,
                    "pitcher_barrel":    pit_barrel,
                    "pitcher_rv100":     pit_rv100,
                    "pitcher_xfip":      pit_xfip,
                    "pitcher_hrfb":      pit_hrfb,
                    # NEW features
                    "pull_park_score":   pull_park_score,
                    "pitcher_zone_pct":  pit_zone,
                    "batter_oswing_pct": batter_oswing,
                    # Park / weather
                    "park_hr_factor":    park_factor,
                    "temp_f":            wx["temp_f"],
                    "wind_out_mph":      wx["wind_out_mph"],
                    "is_dome":           wx["is_dome"],
                    # Market / outcome
                    "market_prob":       market_prob,
                    "did_hr":            did_hr,
                }
                all_rows.append(row)
                season_rows += 1

                rolling.update(pid, outcome["hr"], pa_game)

    print(f"  ✅ {season}: {season_rows:,} player-game rows")

df_new = pd.DataFrame(all_rows)
print(f"\nTotal rows: {len(df_new):,}")
print(f"HR rate: {df_new['did_hr'].mean():.4f} ({df_new['did_hr'].sum():,} HRs)")
print(f"Seasons: {df_new['season'].value_counts().sort_index().to_dict()}")

print(f"\nNew feature coverage:")
for feat, c in cov.items():
    pct = c["n_nonnull"] / c["n_total"] * 100 if c["n_total"] > 0 else 0
    print(f"  {feat:<25}: {c['n_nonnull']:>7,} / {c['n_total']:>7,}  ({pct:.1f}%)")

df_new.to_parquet(OUT_PATH, index=False)
print(f"\n✅ Saved new matrix → {OUT_PATH}")
print(f"   Shape: {df_new.shape}")


# ══════════════════════════════════════════════════════════════════════════════
# PHASE C — Retrain and report metrics
# ══════════════════════════════════════════════════════════════════════════════

print(f"\n{'='*64}")
print("  PHASE C — Retrain XGBoost + report metrics")
print(f"{'='*64}")

# ── Feature sets ──────────────────────────────────────────────────────────────
OLD_FEATURES = [
    "hr_rate_bayes", "barrel_pct", "hard_hit_pct",
    "pitcher_barrel", "pitcher_rv100", "pitcher_hrfb",
    "park_hr_factor", "temp_adj", "wind_adj",
]

NEW_FEATURES = [
    "hr_rate_bayes", "barrel_pct", "hard_hit_pct",
    "pitcher_barrel", "pitcher_rv100", "pitcher_hrfb",
    "park_hr_factor", "temp_adj", "wind_adj",
    # New
    "pull_park_score", "pitcher_zone_pct", "batter_oswing_pct",
]

BEST_PARAMS = {
    "n_estimators":      400,
    "max_depth":         3,
    "learning_rate":     0.05,
    "subsample":         0.8,
    "colsample_bytree":  0.8,
    "min_child_weight":  10,
    "gamma":             1.0,
    "reg_alpha":         0.1,
    "reg_lambda":        1.0,
    "eval_metric":       "logloss",
    "random_state":      42,
    "n_jobs":            -1,
}


def make_derived(df: pd.DataFrame, train_df: pd.DataFrame) -> pd.DataFrame:
    """Add hr_rate_bayes, temp_adj, wind_adj. Fill nulls with train medians."""
    out = df.copy()

    GLOBAL_HR = train_df["did_hr"].mean()
    ALPHA = 200 * GLOBAL_HR
    BETA  = 200 * (1 - GLOBAL_HR)
    hr_total = out["hr_rate_std"] * out["pa_std"]
    out["hr_rate_bayes"] = ((hr_total + ALPHA) / (out["pa_std"] + ALPHA + BETA)).fillna(GLOBAL_HR)

    out["temp_adj"] = out["temp_f"].fillna(70).clip(40, 100).apply(lambda t: (t - 70) * 0.003)
    out.loc[out["is_dome"] == True, "temp_adj"] = 0.0
    out["wind_adj"] = out["wind_out_mph"].fillna(0).clip(-20, 20).apply(lambda w: w * 0.002)
    out.loc[out["is_dome"] == True, "wind_adj"] = 0.0

    return out


def fill_nulls(df: pd.DataFrame, features: list, medians: dict) -> pd.DataFrame:
    out = df.copy()
    for col in features:
        if col in out.columns and out[col].isna().any():
            out[col] = out[col].fillna(medians.get(col, 0.0))
    return out


def bootstrap_roi(top5_df_by_date: "list[pd.DataFrame]", n_boot: int = 2000,
                  ci: float = 0.90) -> "tuple[float, float, float]":
    """
    Bootstrap 90% CI on cumulative RR ROI.
    Each bootstrap sample = resample of days with replacement.
    Returns (point_estimate, lower_ci, upper_ci).
    """
    rng = np.random.default_rng(42)
    n_days = len(top5_df_by_date)
    if n_days == 0:
        return 0.0, 0.0, 0.0

    from itertools import combinations as combs

    def day_pnl(day_df):
        players = day_df.to_dict("records")
        if len(players) < 2:
            return 0.0, 0.0
        stake  = 0.0
        profit = 0.0
        for idx_pair in combs(range(len(players)), 2):
            a, b = players[idx_pair[0]], players[idx_pair[1]]
            stake += 1.0
            if a["did_hr"] == 1 and b["did_hr"] == 1:
                dec_a = 1.0 / a["market_prob"] if a["market_prob"] else 6.0
                dec_b = 1.0 / b["market_prob"] if b["market_prob"] else 6.0
                profit += dec_a * dec_b - 1.0
            else:
                profit -= 1.0
        return profit, stake

    # Point estimate
    total_profit = total_stake = 0.0
    for day_df in top5_df_by_date:
        p, s = day_pnl(day_df)
        total_profit += p
        total_stake  += s
    point = total_profit / total_stake if total_stake > 0 else 0.0

    # Bootstrap
    boot_rois = []
    for _ in range(n_boot):
        idx   = rng.integers(0, n_days, size=n_days)
        bp = bs_ = 0.0
        for i in idx:
            p, s = day_pnl(top5_df_by_date[i])
            bp += p; bs_ += s
        boot_rois.append(bp / bs_ if bs_ > 0 else 0.0)

    alpha_half = (1 - ci) / 2
    lo = float(np.quantile(boot_rois, alpha_half))
    hi = float(np.quantile(boot_rois, 1 - alpha_half))
    return point, lo, hi


def run_experiment(label: str, df_full: pd.DataFrame, features: list) -> dict:
    """Full train/val/test pipeline. Returns metrics dict."""
    print(f"\n  [{label}]")
    train = df_full[df_full["season"].isin([2022, 2023])].copy()
    val   = df_full[df_full["season"] == 2024].copy()
    test  = df_full[df_full["season"] == 2025].copy()

    train = make_derived(train, train)
    val   = make_derived(val,   train)
    test  = make_derived(test,  train)

    # Medians from train only (no leakage)
    medians = {}
    for col in features:
        if col in train.columns:
            medians[col] = float(train[col].median()) if train[col].notna().any() else 0.0
        else:
            medians[col] = 0.0

    train = fill_nulls(train, features, medians)
    val   = fill_nulls(val,   features, medians)
    test  = fill_nulls(test,  features, medians)

    # Verify all feature cols exist
    missing = [f for f in features if f not in train.columns]
    if missing:
        print(f"    ⚠ Missing feature columns: {missing}")
        for m in missing:
            for df_ in [train, val, test]:
                df_[m] = 0.0

    X_train = train[features].values;  y_train = train["did_hr"].values
    X_val   = val[features].values;    y_val   = val["did_hr"].values
    X_test  = test[features].values;   y_test  = test["did_hr"].values

    # Fit model
    model = XGBClassifier(**BEST_PARAMS)
    model.fit(X_train, y_train, verbose=False)

    # Fit calibrator on val
    raw_val = model.predict_proba(X_val)[:, 1]
    iso = IsotonicRegression(out_of_bounds="clip")
    iso.fit(raw_val, y_val)

    # Score test
    raw_test  = model.predict_proba(X_test)[:, 1]
    cal_test  = iso.transform(raw_test)
    test      = test.copy()
    test["model_prob"] = cal_test

    # ── Metric 1: AUC on 2025 holdout ────────────────────────────────────
    auc = roc_auc_score(y_test, cal_test)
    print(f"    AUC (2025 holdout):          {auc:.5f}")

    # ── Metric 2: Feature importance ─────────────────────────────────────
    importances = model.feature_importances_
    fi_pairs = sorted(zip(features, importances), key=lambda x: -x[1])
    print(f"    Feature importance (gain):")
    for rank, (fname, gain) in enumerate(fi_pairs, 1):
        marker = " ← NEW" if fname in ("pull_park_score", "pitcher_zone_pct", "batter_oswing_pct") else ""
        print(f"      #{rank:>2}  {fname:<25} {gain:.4f}{marker}")

    # ── Metric 3: Mean qualifying odds at EV≥25% ─────────────────────────
    test_odds = test[test["market_prob"].notna()].copy()
    test_odds["ev"] = test_odds["model_prob"] / test_odds["market_prob"] - 1.0
    qualifying = test_odds[test_odds["ev"] >= 0.25]

    if len(qualifying) > 0:
        # Convert market_prob → American odds for display
        def prob_to_american(p):
            if p <= 0 or p >= 1: return 100.0
            return (100.0 / p - 100.0) if p < 0.5 else (-p / (1.0 - p) * 100.0)
        qualifying = qualifying.copy()
        qualifying["american_odds"] = qualifying["market_prob"].apply(prob_to_american)
        mean_odds = qualifying["american_odds"].mean()
        n_qual    = len(qualifying)
        n_days    = qualifying["game_date"].nunique()
        print(f"    Qualifying (EV≥25%):         {n_qual} player-days across {n_days} dates")
        print(f"    Mean qualifying odds:         +{mean_odds:.0f}")
    else:
        mean_odds = None
        n_qual    = 0
        n_days    = 0
        print(f"    No qualifying picks at EV≥25%")

    # ── Metric 4: Bootstrap 90% CI on 2025 RR ROI ────────────────────────
    print(f"    Computing bootstrap CI (2000 iterations)...")
    top5_by_date = []
    if n_qual > 0:
        for date_str, day_df in qualifying.groupby("game_date"):
            day_sorted = day_df.sort_values("ev", ascending=False).head(5)
            if len(day_sorted) >= 2:
                top5_by_date.append(day_sorted)

    if top5_by_date:
        point_roi, ci_lo, ci_hi = bootstrap_roi(top5_by_date)
        print(f"    RR ROI point estimate:        {point_roi:+.4f}  ({point_roi*100:+.2f}%)")
        print(f"    Bootstrap 90% CI:             [{ci_lo:+.4f}, {ci_hi:+.4f}]")
        print(f"                                  [{ci_lo*100:+.2f}%, {ci_hi*100:+.2f}%]")
        ci_lo_pos = ci_lo > 0
        print(f"    CI lower bound positive:      {'✅ YES' if ci_lo_pos else '❌ NO'}")
    else:
        point_roi = ci_lo = ci_hi = 0.0
        ci_lo_pos = False
        print(f"    Insufficient qualifying days for bootstrap")

    return {
        "label":         label,
        "features":      features,
        "auc":           round(auc, 6),
        "feature_importance": {f: round(float(g), 6) for f, g in fi_pairs},
        "n_qualifying":  n_qual,
        "n_qualifying_days": n_days,
        "mean_qualifying_odds": round(mean_odds, 1) if mean_odds else None,
        "rr_roi_point":  round(point_roi, 6),
        "rr_roi_ci_lo":  round(ci_lo, 6),
        "rr_roi_ci_hi":  round(ci_hi, 6),
        "ci_lo_positive": ci_lo_pos,
    }


# Load OLD matrix for baseline (before sprint)
print("\nLoading original feature matrix for baseline...")
old_matrix_path = ROOT / "data/mlb_v3/feature_matrix.parquet"
df_old = pd.read_parquet(old_matrix_path)
# Add null columns for new features so the function doesn't crash
for col in ("pull_park_score", "pitcher_zone_pct", "batter_oswing_pct"):
    if col not in df_old.columns:
        df_old[col] = None

baseline = run_experiment("BASELINE (9 features, original matrix)", df_old, OLD_FEATURES)

print("\nLoading new feature matrix for sprint...")
df_new_reloaded = pd.read_parquet(OUT_PATH)
sprint   = run_experiment("SPRINT D1 (12 features, new matrix)", df_new_reloaded, NEW_FEATURES)


# ══════════════════════════════════════════════════════════════════════════════
# Final report
# ══════════════════════════════════════════════════════════════════════════════

print(f"\n{'='*64}")
print("  DECISION 1 — FEATURE SPRINT REPORT")
print(f"{'='*64}")

print(f"\n  {'Metric':<35}  {'Baseline':>12}  {'Sprint D1':>12}  {'Delta':>10}")
print(f"  {'-'*72}")

metrics_report = [
    ("AUC (2025 holdout)",              "auc",                    True),
    ("Qualifying picks (EV≥25%)",       "n_qualifying",           False),
    ("Qualifying dates",                "n_qualifying_days",      False),
    ("Mean qualifying odds",            "mean_qualifying_odds",   True),
    ("RR ROI point estimate",           "rr_roi_point",           True),
    ("Bootstrap 90% CI lower bound",   "rr_roi_ci_lo",           True),
    ("Bootstrap 90% CI upper bound",   "rr_roi_ci_hi",           True),
    ("CI lower bound > 0",             "ci_lo_positive",         False),
]

for label, key, show_delta in metrics_report:
    va = baseline.get(key)
    vb = sprint.get(key)
    if isinstance(va, float) and isinstance(vb, float):
        sa = f"{va:+.4f}" if key != "mean_qualifying_odds" else f"+{va:.0f}"
        sb = f"{vb:+.4f}" if key != "mean_qualifying_odds" else f"+{vb:.0f}"
        sd = f"{vb - va:+.4f}" if show_delta else ""
        if key == "mean_qualifying_odds":
            sd = f"{vb - va:+.0f}" if show_delta else ""
    elif isinstance(va, bool) or isinstance(vb, bool):
        sa = str(va)
        sb = str(vb)
        sd = ""
    else:
        sa = str(va) if va is not None else "N/A"
        sb = str(vb) if vb is not None else "N/A"
        sd = ""
    print(f"  {label:<35}  {sa:>12}  {sb:>12}  {sd:>10}")

print(f"\n  Coverage of new features (2025 holdout rows with market odds):")
for feat, c in cov.items():
    n_test = sum(1 for r in all_rows if r.get("market_prob") is not None and r.get("season") == 2025)
    # Use full-population coverage since we computed it during matrix build
    total   = c["n_total"]
    nonnull = c["n_nonnull"]
    pct     = nonnull / total * 100 if total > 0 else 0
    print(f"    {feat:<25}: {nonnull:>7,} / {total:>7,}  ({pct:.1f}%)")

print(f"\n  Feature importance ranking — Sprint D1:")
fi = sprint["feature_importance"]
for rank, (fname, gain) in enumerate(sorted(fi.items(), key=lambda x: -x[1]), 1):
    marker = " ← NEW" if fname in ("pull_park_score", "pitcher_zone_pct", "batter_oswing_pct") else ""
    print(f"    #{rank:>2}  {fname:<25}  {gain:.4f}  ({gain*100:.1f}%){marker}")

# ── Save report ────────────────────────────────────────────────────────────
report = {
    "run_at":       TODAY,
    "coverage":     {
        k: {"n_nonnull": v["n_nonnull"], "n_total": v["n_total"],
            "pct": round(v["n_nonnull"] / v["n_total"] * 100, 1) if v["n_total"] > 0 else 0}
        for k, v in cov.items()
    },
    "baseline":     baseline,
    "sprint_d1":    sprint,
    "delta": {
        "auc":                 round(sprint["auc"] - baseline["auc"], 6),
        "mean_qualifying_odds": (
            round(sprint["mean_qualifying_odds"] - baseline["mean_qualifying_odds"], 1)
            if sprint["mean_qualifying_odds"] and baseline["mean_qualifying_odds"] else None
        ),
        "rr_roi_point":        round(sprint["rr_roi_point"] - baseline["rr_roi_point"], 6),
        "rr_roi_ci_lo":        round(sprint["rr_roi_ci_lo"] - baseline["rr_roi_ci_lo"], 6),
    },
    "verdict": "PENDING APPROVAL",
}

report_path = ROOT / "data/mlb_v3/feature_sprint_d1_report.json"
report_path.write_text(json.dumps(report, indent=2, default=str))
print(f"\n✅ Report saved → {report_path}")
print(f"\n⚠️  DO NOT DEPLOY — awaiting approval on metrics above.")
