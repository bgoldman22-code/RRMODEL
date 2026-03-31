#!/usr/bin/env python3
"""
Stage 1 — Build Player-Game Feature Matrix
===========================================
One row per player-game appearance (hitters only) across 2022–2025.

Columns produced
----------------
  game_pk          int       MLB game PK
  game_date        str       YYYY-MM-DD
  season           int       2022–2025
  player_id        int       MLB player ID
  player_name      str
  team_abbrev      str
  home_team        bool
  batting_order    int       1–9
  bats             str       R/L/S

  # Rolling season-to-date features (no leakage — use stats BEFORE this game)
  hr_rate_std      float     season-to-date HR / PA (0.0 if <20 PA)
  pa_std           int       season-to-date PA before this game

  # Statcast season-wide features (full-season blob, prior year only for 2025)
  barrel_pct       float     barrel batted rate (%)
  exit_velo        float     avg exit velocity (mph)
  hard_hit_pct     float     hard hit % (%)
  pull_rate_fly    float     pull rate on fly balls (0–1)

  # Pitcher features (opposing SP)
  pitcher_id       int       opposing SP MLB ID
  pitcher_barrel   float     barrel % allowed by SP
  pitcher_xfip     float     SP xFIP (lower = harder to hit)
  pitcher_hrfb     float     SP HR/FB rate (0–1)

  # Park factor (home team park)
  park_hr_factor   float     HR index / 100  (1.0 = neutral)

  # Weather
  temp_f           float     game temp in °F (null if dome)
  wind_out_mph     float     wind blowing out to CF (negative = in)
  is_dome          bool

  # Market implied probability (median book odds → decimal probability)
  market_prob      float     implied prob from closing HR prop odds (null if no line)

  # Outcome
  did_hr           int       1 if player hit ≥1 HR, else 0

Data sources
------------
  data/mlb_research/raw/statsapi_games/{season}/*.json  (outcomes + lineups + weather)
  data/mlb_historical/statcast/*.json                   (LFS — skipped; use rrmodelblobs)
  data/mlb_historical/odds/{season}/*.json              (market odds)

  For Statcast features we use the season-long blobs already fetched by
  fetch_statcast.py and stored in data/mlb_v3/statcast_local/*.json
  (downloaded below if missing via fetch_statcast.py --dry-run equivalent).

Run
---
  python scripts/mlb_v3/build_feature_matrix.py [--seasons 2022 2023 2024 2025] [--out PATH]
"""

import argparse
import json
import math
import pathlib
import sys
from collections import defaultdict

import pandas as pd

ROOT = pathlib.Path(__file__).parent.parent.parent  # repo root

# ── CLI ───────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Build MLB HR feature matrix (player-game)")
parser.add_argument("--seasons", nargs="+", type=int, default=[2022, 2023, 2024, 2025],
                    help="Seasons to include (default: 2022 2023 2024 2025)")
parser.add_argument("--out", type=str,
                    default=str(ROOT / "data/mlb_v3/feature_matrix.parquet"),
                    help="Output parquet path")
parser.add_argument("--statcast-dir", type=str,
                    default=str(ROOT / "data/mlb_v3/statcast_local"),
                    help="Directory containing statcast JSON blobs (one per season)")
args = parser.parse_args()

SEASONS = sorted(args.seasons)
OUT_PATH = pathlib.Path(args.out)
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
STATCAST_DIR = pathlib.Path(args.statcast_dir)
STATCAST_DIR.mkdir(parents=True, exist_ok=True)
GAMES_DIR = ROOT / "data/mlb_research/raw/statsapi_games"
ODDS_DIR  = ROOT / "data/mlb_historical/odds"

print(f"Building feature matrix for seasons: {SEASONS}")
print(f"Output: {OUT_PATH}")


# ══════════════════════════════════════════════════════════════════════════════
# 1. Load Statcast blobs (downloaded from rrmodelblobs or local cache)
# ══════════════════════════════════════════════════════════════════════════════
# We need season-long Statcast features for each season.
# The rrmodelblobs store has 2025 and 2026. For 2022–2024 we use pybaseball
# directly (same logic as fetch_statcast.py fetch_batters_ev / fetch_pitchers_ev
# / fetch_arsenal / fetch_fangraphs).

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


def fetch_statcast_local(season: int) -> dict:
    """
    Load season-long Statcast features for batters and pitchers.
    Tries local cache first, then pybaseball.
    Returns dict with keys: batters, pitchers_ev, arsenal, fangraphs, park_factors
    Each is a dict keyed by player_id (int).
    """
    cache_file = STATCAST_DIR / f"statcast_{season}.json"
    if cache_file.exists():
        print(f"  [statcast] Loading cached {season} from {cache_file}")
        d = json.loads(cache_file.read_text())
        # Rebuild int-keyed maps
        return {
            "batters":     {int(k): v for k, v in d.get("batters", {}).items()},
            "pitchers_ev": {int(k): v for k, v in d.get("pitchers_ev", {}).items()},
            "arsenal":     {int(k): v for k, v in d.get("arsenal", {}).items()},
            "fangraphs":   {k: v for k, v in d.get("fangraphs", {}).items()},  # keyed by name
            "park_factors":{k: v for k, v in d.get("park_factors", {}).items()},  # keyed by abbrev
        }

    print(f"  [statcast] Fetching {season} from pybaseball...")
    try:
        import pybaseball as pb
        pb.cache.enable()
    except ImportError:
        print("  ⚠ pybaseball not installed — Statcast features will be missing for this season")
        return _empty_statcast()

    result = {"batters": {}, "pitchers_ev": {}, "arsenal": {}, "fangraphs": {}, "park_factors": {}, "batting": {}}

    # -- Batters EV --
    try:
        df = pb.statcast_batter_percentile_ranks(season)
        if df is not None and len(df) > 0:
            df.columns = [c.lower().strip() for c in df.columns]
            for _, row in df.iterrows():
                pid = _safe_int(row.get("player_id"))
                if pid:
                    result["batters"][pid] = {
                        # Column names from pybaseball percentile ranks
                        "exit_velo":    _safe_float(
                            row.get("exit_velocity_avg") or row.get("exit_velocity") or row.get("ev")),
                        "barrel_pct":   _safe_float(
                            row.get("barrel_batted_rate") or row.get("brl_percent") or row.get("barrel%") or row.get("brl")),
                        "hard_hit_pct": _safe_float(
                            row.get("hard_hit_percent") or row.get("hard_hit%")),
                    }
            print(f"    batters_ev: {len(result['batters'])} players")
    except Exception as e:
        print(f"    ⚠ batters_ev failed: {e}")

    # -- Pitchers EV --
    try:
        df = pb.statcast_pitcher_percentile_ranks(season)
        if df is not None and len(df) > 0:
            df.columns = [c.lower().strip() for c in df.columns]
            for _, row in df.iterrows():
                pid = _safe_int(row.get("player_id"))
                if pid:
                    result["pitchers_ev"][pid] = {
                        "barrel_pct": _safe_float(
                            row.get("barrel_batted_rate") or row.get("brl_percent") or row.get("barrel%") or row.get("brl")),
                        "exit_velo":  _safe_float(
                            row.get("exit_velocity_avg") or row.get("exit_velocity") or row.get("ev")),
                    }
            print(f"    pitchers_ev: {len(result['pitchers_ev'])} pitchers")
    except Exception as e:
        print(f"    ⚠ pitchers_ev failed: {e}")

    # -- Arsenal (pitch run value) --
    try:
        url = (f"https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats"
               f"?type=pitcher&pitchType=&year={season}&team=&min=25&csv=true")
        import requests, io
        r = requests.get(url, timeout=60, headers={"User-Agent": "mlb-v3-train/1.0"})
        if r.ok and "," in r.text[:200]:
            df = pd.read_csv(io.StringIO(r.text))
            df.columns = [c.lower().strip() for c in df.columns]
            pit_map = {}
            for _, row in df.iterrows():
                pid = _safe_int(row.get("pitcher_id") or row.get("player_id"))
                if not pid: continue
                if pid not in pit_map:
                    pit_map[pid] = {"pitches": []}
                pit_map[pid]["pitches"].append({
                    "pitch_type":  str(row.get("pitch_type","")).upper(),
                    "pitch_usage": _safe_float(row.get("pitch_usage") or row.get("pitch_percent")),
                    "rv100":       _safe_float(row.get("run_value_per_100") or row.get("rv/100")),
                    "whiff_pct":   _safe_float(row.get("whiff_percent")),
                })
            # Compute weighted avg RV per pitcher
            for pid, rec in pit_map.items():
                pitches = rec["pitches"]
                total_u, w_rv = 0, 0
                for p in pitches:
                    u = p.get("pitch_usage") or 0
                    rv = p.get("rv100")
                    if u > 0 and rv is not None:
                        w_rv += rv * u; total_u += u
                result["arsenal"][pid] = {
                    "rv100": round(w_rv / total_u, 4) if total_u > 0 else None
                }
            print(f"    arsenal: {len(result['arsenal'])} pitchers")
    except Exception as e:
        print(f"    ⚠ arsenal failed: {e}")

    # -- FanGraphs pitching (xFIP / HR-FB / Zone%) --
    try:
        fg = pb.pitching_stats(season, season, qual=10)
        if fg is not None and len(fg) > 0:
            fg.columns = [str(c).strip() for c in fg.columns]
            norm = lambda s: str(s or "").lower().replace(" ","").replace(".","")
            # Zone% column name varies by pybaseball version
            zone_col = next((c for c in fg.columns if "zone" in c.lower()), None)
            for _, row in fg.iterrows():
                name = norm(row.get("Name",""))
                if name:
                    zone_raw = _safe_float(row.get(zone_col)) if zone_col else None
                    result["fangraphs"][name] = {
                        "xfip":          _safe_float(row.get("xFIP")),
                        "hr_fb":         _safe_float(row.get("HR/FB")),
                        "gb_pct":        _safe_float(row.get("GB%")),
                        "fb_pct":        _safe_float(row.get("FB%")),
                        # Zone% — proportion of pitches in the strike zone (0-1 or 0-100)
                        # Normalise to [0, 1]
                        "zone_pct": (zone_raw / 100.0 if zone_raw is not None and zone_raw > 1
                                     else zone_raw),
                    }
            print(f"    fangraphs: {len(result['fangraphs'])} pitchers"
                  f"  (Zone% col: {zone_col or 'not found'})")
    except Exception as e:
        print(f"    ⚠ fangraphs failed: {e}")

    # -- FanGraphs batting (O-Swing%) --
    try:
        bg = pb.batting_stats(season, season, qual=50)
        if bg is not None and len(bg) > 0:
            bg.columns = [str(c).strip() for c in bg.columns]
            norm_b = lambda s: str(s or "").lower().replace(" ","").replace(".","")
            oswing_col = next(
                (c for c in bg.columns
                 if "o-swing" in c.lower() or "oswing" in c.lower()
                 or c.lower() == "o-swing%"),
                None,
            )
            if oswing_col:
                for _, row in bg.iterrows():
                    name = norm_b(row.get("Name",""))
                    if name:
                        val = _safe_float(row.get(oswing_col))
                        if val is not None:
                            # Normalise to [0, 1]
                            result["batting"][name] = {
                                "oswing_pct": val / 100.0 if val > 1 else val,
                            }
                print(f"    batting (O-Swing%): {len(result.get('batting', {}))} batters"
                      f"  (col: {oswing_col})")
            else:
                swing_candidates = [c for c in bg.columns if "swing" in c.lower()]
                print(f"    ⚠ O-Swing% col not found. Swing cols: {swing_candidates}")
    except Exception as e:
        print(f"    ⚠ batting_stats failed: {e}")

    # -- Static park factors --
    STATIC_PARKS = {
        "COL":1.19,"CIN":1.11,"PHI":1.10,"MIL":1.08,"BAL":1.07,"HOU":1.06,
        "BOS":1.06,"ARI":1.05,"NYY":1.08,"TEX":1.04,"TOR":1.03,"ATL":1.02,
        "DET":0.96,"CLE":0.98,"MIN":0.98,"LAD":0.98,"CWS":1.00,"CHC":1.00,
        "LAA":0.99,"MIA":0.96,"NYM":0.97,"OAK":0.98,"PIT":0.98,"STL":0.98,
        "SD":0.94,"SEA":0.94,"SF":0.92,"TB":0.96,"WSH":0.99,"KC":0.96,
    }
    result["park_factors"] = {k: {"hr_factor": v} for k, v in STATIC_PARKS.items()}

    # Save cache
    cache_file.write_text(json.dumps(result, ensure_ascii=False))
    print(f"  ✅ Saved statcast cache: {cache_file}")
    return result


def _empty_statcast():
    return {"batters": {}, "pitchers_ev": {}, "arsenal": {}, "fangraphs": {}, "park_factors": {}}


# ══════════════════════════════════════════════════════════════════════════════
# 2. Load odds for a date → dict: normalized_name → implied_prob
# ══════════════════════════════════════════════════════════════════════════════

def _norm(s):
    import unicodedata
    s = str(s or "").lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.replace(".", "").replace("'", "").replace(" ", "").strip()


def load_odds_for_date(date_str: str, season: int) -> dict:
    """Returns {normalized_player_name: implied_prob} from median book odds."""
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
                    # American or decimal?
                    if abs(price) >= 1.5 and abs(price) <= 10:
                        # Decimal (e.g. 4.3)
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
    # Median across books
    return {name: sorted(probs)[len(probs) // 2] for name, probs in by_player.items()}


# ══════════════════════════════════════════════════════════════════════════════
# 3. Extract weather features from game record
# ══════════════════════════════════════════════════════════════════════════════

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
        "temp_f": temp_f if not is_dome else None,
        "wind_out_mph": wind_out_mph if not is_dome else None,
        "is_dome": is_dome,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 4. Build rolling season-to-date HR/PA per player (no leakage)
# ══════════════════════════════════════════════════════════════════════════════
# We accumulate per-season as we iterate games chronologically.
# For each game, the rate reflects PRIOR games only.

class RollingStats:
    def __init__(self):
        # player_id → {hr, pa} accumulated BEFORE current game
        self._store: dict[int, dict] = defaultdict(lambda: {"hr": 0, "pa": 0})

    def get_rate(self, pid: int) -> tuple[float, int]:
        """Returns (hr_rate, pa_before) before this game."""
        s = self._store[pid]
        pa = s["pa"]
        rate = (s["hr"] / pa) if pa >= 20 else 0.0  # 0.0 until 20 PA
        return rate, pa

    def update(self, pid: int, hr: int, pa: int):
        """Call AFTER extracting features for this game."""
        self._store[pid]["hr"] += hr
        self._store[pid]["pa"] += pa


# ══════════════════════════════════════════════════════════════════════════════
# 5. Main build loop
# ══════════════════════════════════════════════════════════════════════════════

all_rows = []

for season in SEASONS:
    print(f"\n{'═'*60}")
    print(f"  Season {season}")
    print(f"{'═'*60}")

    # Load Statcast features for this season
    sc = fetch_statcast_local(season)
    batters_sc   = sc["batters"]       # player_id → {exit_velo, barrel_pct, hard_hit_pct}
    pitchers_sc  = sc["pitchers_ev"]   # player_id → {barrel_pct, exit_velo}
    arsenal_sc   = sc["arsenal"]       # player_id → {rv100}
    fg_sc        = sc["fangraphs"]     # norm_name → {xfip, hr_fb, gb_pct, fb_pct}
    parks_sc     = sc["park_factors"]  # abbrev → {hr_factor}

    # Get all game files for this season, sorted by date
    games_dir = GAMES_DIR / str(season)
    if not games_dir.exists():
        print(f"  ⚠ No game files for {season}")
        continue

    game_files = sorted(games_dir.glob("*.json"),
                        key=lambda f: json.loads(f.read_text()).get("game_date", ""))
    print(f"  {len(game_files)} game files")

    # Rolling season-to-date accumulator (reset per season)
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

        # Load odds for this date
        odds = load_odds_for_date(game_date, season)

        # Starting pitchers (home and away)
        sp = game.get("starting_pitchers") or {}
        home_sp      = sp.get("home") or {}
        away_sp      = sp.get("away") or {}
        home_sp_id   = _safe_int(home_sp.get("player_id"))
        away_sp_id   = _safe_int(away_sp.get("player_id"))
        home_sp_name = str(home_sp.get("full_name") or "")
        away_sp_name = str(away_sp.get("full_name") or "")

        # Park factor
        home_abbrev = str(game.get("home_team", {}).get("abbreviation") or "").upper()
        park_factor = parks_sc.get(home_abbrev, {}).get("hr_factor", 1.0)

        # Weather
        wx = extract_weather(game)

        # Boxscore → outcomes per player
        bs = game.get("boxscore") or {}
        outcomes: dict[int, dict] = {}  # player_id → {hr, pa}
        for side in ("home", "away"):
            for batter in (bs.get(side) or {}).get("batters", []):
                pid = _safe_int(batter.get("player_id"))
                if pid:
                    outcomes[pid] = {
                        "hr": int(batter.get("hr") or 0),
                        "pa": int(batter.get("pa") or 0),
                    }

        # Lineups
        lineups = game.get("lineups", {})

        for side in ("home", "away"):
            lineup = lineups.get(side, [])
            if not lineup:
                # Fall back to boxscore batters
                lineup = [
                    {"player_id": b["player_id"],
                     "batting_order": _safe_int(b.get("batting_order", 0)) or 0,
                     "bats": None}
                    for b in (bs.get(side) or {}).get("batters", [])
                    if b.get("player_id")
                ]

            is_home = (side == "home")
            opp_sp_id   = away_sp_id   if is_home else home_sp_id
            opp_sp_name = away_sp_name if is_home else home_sp_name
            team_abbrev = str(game.get(f"{side}_team", {}).get("abbreviation") or "").upper()

            # Pitcher features
            pit_barrel = pitchers_sc.get(opp_sp_id, {}).get("barrel_pct") if opp_sp_id else None
            pit_rv100  = arsenal_sc.get(opp_sp_id, {}).get("rv100") if opp_sp_id else None
            norm_sp    = _norm(opp_sp_name)
            fg_rec     = fg_sc.get(norm_sp, {})
            pit_xfip   = _safe_float(fg_rec.get("xfip"))
            pit_hrfb   = _safe_float(fg_rec.get("hr_fb"))

            for batter_entry in lineup:
                pid = _safe_int(batter_entry.get("player_id"))
                if not pid:
                    continue

                outcome = outcomes.get(pid)
                if outcome is None:
                    continue  # not in boxscore (didn't play)

                did_hr = 1 if outcome["hr"] >= 1 else 0
                pa_game = outcome["pa"]

                # Rolling season-to-date BEFORE this game
                hr_rate_std, pa_std = rolling.get_rate(pid)

                # Statcast batter features
                bat_sc = batters_sc.get(pid, {})
                barrel_pct   = _safe_float(bat_sc.get("barrel_pct"))
                exit_velo    = _safe_float(bat_sc.get("exit_velo"))
                hard_hit_pct = _safe_float(bat_sc.get("hard_hit_pct"))

                # Market odds
                player_name = str(batter_entry.get("full_name") or "")
                market_prob = odds.get(_norm(player_name))

                row = {
                    "game_pk":        game_pk,
                    "game_date":      game_date,
                    "season":         season,
                    "player_id":      pid,
                    "player_name":    player_name,
                    "team_abbrev":    team_abbrev,
                    "home_team":      is_home,
                    "batting_order":  _safe_int(batter_entry.get("batting_order")) or 0,
                    "bats":           str(batter_entry.get("bats") or ""),
                    # Rolling features (no leakage)
                    "hr_rate_std":    hr_rate_std,
                    "pa_std":         pa_std,
                    # Statcast batter
                    "barrel_pct":     barrel_pct,
                    "exit_velo":      exit_velo,
                    "hard_hit_pct":   hard_hit_pct,
                    # Opposing pitcher
                    "pitcher_id":     opp_sp_id,
                    "pitcher_name":   opp_sp_name,
                    "pitcher_barrel": pit_barrel,
                    "pitcher_rv100":  pit_rv100,
                    "pitcher_xfip":   pit_xfip,
                    "pitcher_hrfb":   pit_hrfb,
                    # Park
                    "park_hr_factor": park_factor,
                    # Weather
                    "temp_f":         wx["temp_f"],
                    "wind_out_mph":   wx["wind_out_mph"],
                    "is_dome":        wx["is_dome"],
                    # Market
                    "market_prob":    market_prob,
                    # Outcome
                    "did_hr":         did_hr,
                }
                all_rows.append(row)
                season_rows += 1

                # Update rolling stats AFTER recording features
                rolling.update(pid, outcome["hr"], pa_game)

    print(f"  ✅ {season}: {season_rows:,} player-game rows")

# ══════════════════════════════════════════════════════════════════════════════
# 6. Save
# ══════════════════════════════════════════════════════════════════════════════

df = pd.DataFrame(all_rows)
print(f"\nTotal rows: {len(df):,}")
print(f"HR rate: {df['did_hr'].mean():.4f} ({df['did_hr'].sum():,} HRs)")
print(f"Rows with market_prob: {df['market_prob'].notna().sum():,}")
print(f"Rows with barrel_pct: {df['barrel_pct'].notna().sum():,}")
print(f"Seasons: {df['season'].value_counts().sort_index().to_dict()}")

df.to_parquet(OUT_PATH, index=False)
print(f"\n✅ Saved → {OUT_PATH}")
print(f"   Shape: {df.shape}")
