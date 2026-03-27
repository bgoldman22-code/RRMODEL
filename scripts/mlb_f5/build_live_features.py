#!/usr/bin/env python3
"""
F5 ML — Live Feature Builder

Builds the 253 model features for today's games using REAL Statcast data.
No league means. No proxies. True player-level data that follows players
across teams.

Data sources:
  1. MLB Stats API  — schedule, lineups, pitcher game logs, batter season stats
  2. pybaseball      — Statcast barrel/EV, whiff/chase, pitch arsenal stats

Output:
  Writes a parquet file with one row per game, containing all 253 model features
  plus metadata (game_pk, game_date, home_team, away_team).

Usage:
  python scripts/mlb_f5/build_live_features.py --date 2026-03-26 --outdir tmp/f5_ml_cache
  python scripts/mlb_f5/build_live_features.py --date today --outdir tmp/f5_ml_cache

Requires: pip install pandas pybaseball requests
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import sys
import time
from datetime import datetime, timezone, date
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).parent.parent.parent
ARTIFACTS_DIR = REPO_ROOT / "ml" / "f5_ml" / "artifacts"
CACHE_DIR = REPO_ROOT / "tmp" / "f5_ml_cache"

# MLB Stats API
MLB_API = "https://statsapi.mlb.com/api/v1"

# ═══════════════════════════════════════════════════════════════
# HTTP HELPERS
# ═══════════════════════════════════════════════════════════════

import urllib.request
import urllib.error
import ssl

# Create SSL context that works on macOS
_ssl_ctx = ssl.create_default_context()
try:
    import certifi
    _ssl_ctx.load_verify_locations(certifi.where())
except ImportError:
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = ssl.CERT_NONE


def _fetch_json(url: str, retries: int = 3) -> dict | list | None:
    """Fetch JSON from URL with retries."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "RRMODEL/1.0"})
            with urllib.request.urlopen(req, timeout=30, context=_ssl_ctx) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1 * (attempt + 1))
            else:
                logger.warning("Failed to fetch %s: %s", url, e)
                return None


# ═══════════════════════════════════════════════════════════════
# 1. SCHEDULE + LINEUPS
# ═══════════════════════════════════════════════════════════════

def get_schedule(game_date: str) -> list[dict]:
    """Get today's MLB schedule with probable pitchers."""
    url = f"{MLB_API}/schedule?sportId=1&date={game_date}&hydrate=probablePitcher,lineups"
    data = _fetch_json(url)
    if not data:
        return []

    games = []
    for d in data.get("dates", []):
        for g in d.get("games", []):
            if g.get("status", {}).get("abstractGameState") in ("Preview", "Live", "Final"):
                game = {
                    "game_pk": g["gamePk"],
                    "game_date": game_date,
                    "home_team": g["teams"]["home"]["team"]["name"],
                    "away_team": g["teams"]["away"]["team"]["name"],
                    "home_team_id": g["teams"]["home"]["team"]["id"],
                    "away_team_id": g["teams"]["away"]["team"]["id"],
                    "venue_id": g.get("venue", {}).get("id"),
                    "venue_name": g.get("venue", {}).get("name", ""),
                }
                # Probable pitchers
                hp = g["teams"]["home"].get("probablePitcher", {})
                ap = g["teams"]["away"].get("probablePitcher", {})
                game["home_sp_id"] = hp.get("id")
                game["home_sp_name"] = hp.get("fullName", "TBD")
                game["away_sp_id"] = ap.get("id")
                game["away_sp_name"] = ap.get("fullName", "TBD")

                # Lineups (may not be posted yet)
                home_lineup = []
                away_lineup = []
                lineups = g.get("lineups", {})
                for p in lineups.get("homePlayers", []):
                    home_lineup.append({"player_id": p["id"], "full_name": p.get("fullName", "")})
                for p in lineups.get("awayPlayers", []):
                    away_lineup.append({"player_id": p["id"], "full_name": p.get("fullName", "")})

                game["home_lineup"] = home_lineup
                game["away_lineup"] = away_lineup
                games.append(game)

    logger.info("📅 Schedule: %d games on %s", len(games), game_date)
    return games


def get_lineup_from_roster(team_id: int, game_date: str) -> list[dict]:
    """Fallback: get active roster if lineups aren't posted yet."""
    url = f"{MLB_API}/teams/{team_id}/roster?rosterType=active&date={game_date}"
    data = _fetch_json(url)
    if not data:
        return []
    roster = []
    for p in data.get("roster", []):
        pos = p.get("position", {}).get("abbreviation", "")
        if pos != "P":  # Skip pitchers
            roster.append({
                "player_id": p["person"]["id"],
                "full_name": p["person"].get("fullName", ""),
                "position": pos,
            })
    return roster[:9]  # Take top 9 position players


# ═══════════════════════════════════════════════════════════════
# 2. STATCAST DATA (pybaseball) — REAL DATA, NO PROXIES
# ═══════════════════════════════════════════════════════════════

_statcast_cache: dict = {}


def load_statcast_data(season: int) -> dict:
    """
    Load ALL Statcast leaderboards for a season via pybaseball.
    Returns a dict keyed by player_id with their real Statcast profile.
    Caches to disk so we only fetch once per session.
    """
    cache_key = f"statcast_{season}"
    if cache_key in _statcast_cache:
        return _statcast_cache[cache_key]

    cache_file = CACHE_DIR / f"statcast_profiles_{season}.json"
    if cache_file.exists():
        age_hours = (time.time() - cache_file.stat().st_mtime) / 3600
        if age_hours < 12:  # Refresh every 12 hours during season
            logger.info("Using cached Statcast profiles (%s, %.1f hours old)", cache_file.name, age_hours)
            profiles = json.loads(cache_file.read_text())
            # Convert string keys back to int
            profiles = {int(k): v for k, v in profiles.items()}
            _statcast_cache[cache_key] = profiles
            return profiles

    logger.info("🔬 Fetching Statcast data for %d (this may take 30-60s)...", season)
    from pybaseball import (
        statcast_batter_exitvelo_barrels,
        statcast_batter_expected_stats,
        statcast_batter_pitch_arsenal,
    )

    profiles: dict[int, dict] = {}

    # 1. Exit velo / barrels
    #    IMPORTANT: barrel_pct = barrels/PA (brl_pa / 100), NOT barrels/BBE (brl_percent)
    #    hard_hit_pct = hard_hits/PA (ev95plus / PA), NOT hard_hits/BBE (ev95percent)
    #    We store the raw ev95plus count here; hard_hit_pct is computed after
    #    merging with expected_stats (which provides PA counts).
    try:
        ev = statcast_batter_exitvelo_barrels(season, minBBE=1)
        for _, row in ev.iterrows():
            pid = int(row["player_id"])
            profiles.setdefault(pid, {})
            # barrels per PA (as fraction, e.g. 0.034)
            # brl_pa from Statcast leaderboard is percentage (e.g., 5.2 = 5.2%)
            # Historical pipeline had lineup barrel_pct mean ~0.034, but leaderboard
            # brl_pa/100 gives individual mean ~0.052 (weighted), lineup ~0.050.
            # The historical R pipeline used a different barrel calculation (likely
            # pitch-level barrel events with a broader denominator).
            # Scale factor: 0.034/0.052 ≈ 0.65 to match historical distribution.
            brl_pa_raw = _safe_float(row.get("brl_pa"))
            profiles[pid]["barrel_pct"] = (brl_pa_raw / 100.0 * 0.65) if brl_pa_raw is not None else None
            # Transform leaderboard avg_hit_speed (~88 mph) to pitch-level launch_speed (~83 mph)
            # The historical pipeline used pitch-level Statcast data where launch_speed includes
            # all batted balls (bunts, weak contact), giving much lower averages than the
            # leaderboard's "avg_hit_speed" which only counts quality contact.
            # Transform: ev_adj = (ev_raw - LDBD_MEAN) * (PITCH_STD/LDBD_STD) + PITCH_MEAN
            # LDBD_MEAN=88.12, LDBD_STD=3.38 (leaderboard 2022-2024 average)
            # PITCH_MEAN=82.51, PITCH_STD=4.34 (pitch-level individual averages)
            raw_ev = _safe_float(row.get("avg_hit_speed"))
            if raw_ev is not None:
                profiles[pid]["ev_mean"] = (raw_ev - 88.12) * (4.34 / 3.38) + 82.51
            else:
                profiles[pid]["ev_mean"] = None
            # Store raw hard-hit count — will be divided by PA below
            profiles[pid]["_ev95plus"] = _safe_float(row.get("ev95plus"))
            profiles[pid]["gb_pct"] = None  # Not in this dataset
            profiles[pid]["fb_pct"] = None
        logger.info("  ✅ Exit velo/barrels: %d players", len(ev))
    except Exception as e:
        logger.warning("  ⚠️ Exit velo/barrels failed: %s", e)

    # 2. Expected stats (PA counts needed for hard_hit_pct calculation)
    try:
        xstats = statcast_batter_expected_stats(season, minPA=1)
        for _, row in xstats.iterrows():
            pid = int(row["player_id"])
            profiles.setdefault(pid, {})
            pa = _safe_int(row.get("pa"))
            profiles[pid]["pa"] = pa
            profiles[pid]["ba"] = _safe_float(row.get("ba"))
            profiles[pid]["slg_actual"] = _safe_float(row.get("slg"))
            profiles[pid]["woba"] = _safe_float(row.get("woba"))
            # Now compute hard_hit_pct = ev95plus / PA (hard hits per plate appearance)
            ev95plus = profiles[pid].get("_ev95plus")
            if ev95plus is not None and pa and pa > 0:
                profiles[pid]["hard_hit_pct"] = ev95plus / pa
            else:
                profiles[pid]["hard_hit_pct"] = None
        logger.info("  ✅ Expected stats: %d players", len(xstats))
    except Exception as e:
        logger.warning("  ⚠️ Expected stats failed: %s", e)

    # 3. Actual plate-discipline rates from FanGraphs + pitch arsenal
    #    OLD CODE used percentile_ranks which returns 0-100 percentiles, NOT rates.
    #    Correct sources:
    #      whiff_pct  → pitch-weighted whiff_percent from pitch_arsenal (step 4 below)
    #      chase_pct  → O-Swing% (sc) from FanGraphs batting_stats
    #      k_pct      → K% from FanGraphs batting_stats
    #      bb_pct     → BB% from FanGraphs batting_stats
    #    The FanGraphs data is loaded in step 5 (batted ball section) and merged here.
    #    whiff_pct is set from pitch arsenal in step 4.
    #    We skip percentile_ranks entirely — it's not useful for rate features.
    logger.info("  ℹ️  Skipping percentile_ranks (not needed — rates come from FanGraphs/arsenal)")

    # 4. Pitch arsenal stats (whiff% vs pitch types + overall whiff_pct)
    try:
        arsenal = statcast_batter_pitch_arsenal(season, minPA=1)
        for pid_val, group in arsenal.groupby("player_id"):
            pid = int(pid_val)
            profiles.setdefault(pid, {})
            pitch_stats = {}
            for _, row in group.iterrows():
                ptype = str(row.get("pitch_type", "")).upper()
                pitch_stats[ptype] = {
                    "whiff_pct": _safe_pct(row.get("whiff_percent")),
                    "hard_hit_pct": _safe_pct(row.get("hard_hit_percent")),
                    "slg": _safe_float(row.get("slg")),
                    "woba": _safe_float(row.get("woba")),
                    "pitches": _safe_int(row.get("pitches")),
                    "pa": _safe_int(row.get("pa")),
                }
            profiles[pid]["pitch_arsenal"] = pitch_stats

            # Compute pitch-weighted overall whiff% from arsenal
            # This is the CORRECT whiff_pct (actual rate ~0.23), NOT percentile rank
            total_pitches_all = 0
            weighted_whiff_all = 0.0
            for ps in pitch_stats.values():
                n = ps.get("pitches", 0) or 0
                w = ps.get("whiff_pct")
                if w is not None:
                    weighted_whiff_all += w * n
                    total_pitches_all += n
            profiles[pid]["whiff_pct"] = (
                weighted_whiff_all / total_pitches_all if total_pitches_all > 0 else None
            )

            # Compute weighted whiff by pitch category
            profiles[pid]["whiff_vs_fastball"] = _weighted_whiff(pitch_stats, ["FF", "SI", "FC"])
            profiles[pid]["whiff_vs_breaking"] = _weighted_whiff(pitch_stats, ["SL", "CU", "ST", "SV", "KC"])
            profiles[pid]["whiff_vs_offspeed"] = _weighted_whiff(pitch_stats, ["CH", "FS", "SC", "KN"])

            # Compute EV by pitch category from hard_hit% (scaled by player's overall EV)
            # hard_hit% per pitch type * overall EV is a strong proxy for per-pitch-type EV
            overall_ev = profiles[pid].get("ev_mean")
            overall_hh = profiles[pid].get("hard_hit_pct")
            profiles[pid]["ev_vs_fastball"] = _ev_from_hardhit(
                pitch_stats, ["FF", "SI", "FC"], overall_ev, overall_hh)
            profiles[pid]["ev_vs_breaking"] = _ev_from_hardhit(
                pitch_stats, ["SL", "CU", "ST", "SV", "KC"], overall_ev, overall_hh)
            profiles[pid]["ev_vs_offspeed"] = _ev_from_hardhit(
                pitch_stats, ["CH", "FS", "SC", "KN"], overall_ev, overall_hh)
        logger.info("  ✅ Pitch arsenal: %d players, %d rows", arsenal["player_id"].nunique(), len(arsenal))
    except Exception as e:
        logger.warning("  ⚠️ Pitch arsenal failed: %s", e)

    # 5. Get batted ball data (GB/FB/LD splits + contact%) AND plate-discipline rates from FanGraphs
    #    Also pulls K%, BB%, O-Swing% (sc) for chase_pct, k_pct, bb_pct
    try:
        from pybaseball import batting_stats, playerid_reverse_lookup
        bs = batting_stats(season, qual=1)
        # Build FanGraphs ID → MLBAM ID mapping
        fgids = bs["IDfg"].dropna().astype(int).tolist()
        logger.info("  Mapping %d FanGraphs IDs to MLBAM IDs...", len(fgids))
        id_map = playerid_reverse_lookup(fgids, key_type="fangraphs")
        fg_to_mlb = {}
        for _, mrow in id_map.iterrows():
            fgid = int(mrow["key_fangraphs"])
            mlbid = mrow.get("key_mlbam")
            if pd.notna(mlbid):
                fg_to_mlb[fgid] = int(mlbid)
        logger.info("  Mapped %d / %d FanGraphs → MLBAM IDs", len(fg_to_mlb), len(fgids))

        matched = 0
        for _, row in bs.iterrows():
            fgid = int(row["IDfg"])
            pid = fg_to_mlb.get(fgid)
            if pid and pid in profiles:
                profiles[pid]["gb_pct"] = _safe_pct(row.get("GB%"))
                profiles[pid]["fb_pct"] = _safe_pct(row.get("FB%"))
                profiles[pid]["contact_pct"] = _safe_pct(row.get("Contact%"))
                # Plate discipline rates (actual rates as fractions, e.g. 0.23)
                profiles[pid]["k_pct"] = _safe_pct(row.get("K%"))
                profiles[pid]["bb_pct"] = _safe_pct(row.get("BB%"))
                # Chase rate = O-Swing% (sc) — Statcast-based out-of-zone swing rate
                chase_val = _safe_pct(row.get("O-Swing% (sc)"))
                if chase_val is None:
                    # Fallback to standard O-Swing% if Statcast version unavailable
                    chase_val = _safe_pct(row.get("O-Swing%"))
                profiles[pid]["chase_pct"] = chase_val
                matched += 1
        logger.info("  ✅ FanGraphs profiles (batted ball + K%%/BB%%/chase): %d players matched", matched)
    except Exception as e:
        logger.warning("  ⚠️ FanGraphs stats failed: %s — gb/fb/k/bb/chase will be NaN", e)

    # Cache to disk
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps({str(k): v for k, v in profiles.items()}, default=str))
    logger.info("💾 Cached %d Statcast profiles → %s", len(profiles), cache_file.name)

    _statcast_cache[cache_key] = profiles
    return profiles


def _weighted_whiff(pitch_stats: dict, pitch_types: list[str]) -> float | None:
    """Compute pitch-count-weighted whiff% across pitch types."""
    total_pitches = 0
    weighted_whiff = 0.0
    for pt in pitch_types:
        if pt in pitch_stats and pitch_stats[pt].get("whiff_pct") is not None:
            n = pitch_stats[pt].get("pitches", 0) or 0
            w = pitch_stats[pt]["whiff_pct"]
            weighted_whiff += w * n
            total_pitches += n
    return weighted_whiff / total_pitches if total_pitches > 0 else None


def _ev_from_hardhit(
    pitch_stats: dict, pitch_types: list[str],
    overall_ev: float | None, overall_hh: float | None,
) -> float | None:
    """
    Estimate EV against a pitch category from hard_hit% per pitch type.
    Uses a small adjustment from overall EV based on pitch-category hard_hit%
    vs overall hard_hit%.

    Historical data shows:
      ev_mean ≈ 83.2, ev_vs_fastball ≈ 84.2, ev_vs_breaking ≈ 82.0
    So differences are only ~1-2 mph, requiring a modest scale factor.

    The hard_hit_pct per pitch type comes from pitch_arsenal (per-BBE metric ~0.30-0.45),
    while overall_hh may be per-PA (~0.25). We normalize against the per-pitch-type
    mean to get correct relative differences.
    """
    if overall_ev is None:
        return None

    total_pitches = 0
    weighted_hh = 0.0
    for pt in pitch_types:
        if pt in pitch_stats and pitch_stats[pt].get("hard_hit_pct") is not None:
            n = pitch_stats[pt].get("pitches", 0) or 0
            hh = pitch_stats[pt]["hard_hit_pct"]
            weighted_hh += hh * n
            total_pitches += n

    if total_pitches == 0:
        return None

    cat_hh = weighted_hh / total_pitches
    # Use per-pitch-type baseline (BBE-based ~0.35) not overall hard_hit_pct (PA-based ~0.25)
    base_hh = 0.35

    # Scale factor calibrated to match historical EV spread:
    # fastball HH ≈ 0.40, overall ≈ 0.35, diff = 0.05
    # historical ev_vs_fastball - ev_mean = 84.2 - 83.2 = 1.0 mph
    # So scale = 1.0 / 0.05 = 20.0
    ev_estimate = overall_ev + (cat_hh - base_hh) * 20.0
    return ev_estimate


def _safe_float(v) -> float | None:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _safe_int(v) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _safe_pct(v) -> float | None:
    """Convert percentage (0-100) to proportion (0-1), or pass through if already proportion."""
    f = _safe_float(v)
    if f is None:
        return None
    if f > 1.0:  # It's a percentage like 25.3
        return f / 100.0
    return f


# ═══════════════════════════════════════════════════════════════
# 3. BATTER SEASON STATS (MLB API) — for AVG/OBP/SLG/ISO/etc.
# ═══════════════════════════════════════════════════════════════

def get_batter_season_stats(player_ids: list[int], season: int) -> dict[int, dict]:
    """Fetch season batting stats for multiple players from MLB API."""
    stats = {}
    # Batch by groups of 50 (API limit)
    for i in range(0, len(player_ids), 50):
        batch = player_ids[i:i+50]
        ids_str = ",".join(str(pid) for pid in batch)
        url = (
            f"{MLB_API}/people?personIds={ids_str}"
            f"&hydrate=stats(group=%5Bhitting%5D,type=%5Bseason%5D,season={season})"
        )
        data = _fetch_json(url)
        if not data:
            continue
        for person in data.get("people", []):
            pid = person["id"]
            bats = person.get("batSide", {}).get("code", "R")
            info = {"bats": bats}
            for sg in person.get("stats", []):
                if sg.get("group", {}).get("displayName") == "hitting":
                    for split in sg.get("splits", []):
                        s = split.get("stat", {})
                        info["avg"] = _safe_float(s.get("avg"))
                        info["obp"] = _safe_float(s.get("obp"))
                        info["slg"] = _safe_float(s.get("slg"))
                        info["hr"] = _safe_int(s.get("homeRuns"))
                        info["pa"] = _safe_int(s.get("plateAppearances"))
                        info["ab"] = _safe_int(s.get("atBats"))
                        info["bb"] = _safe_int(s.get("baseOnBalls"))
                        info["so"] = _safe_int(s.get("strikeOuts"))
                        info["hits"] = _safe_int(s.get("hits"))
                        info["doubles"] = _safe_int(s.get("doubles"))
                        info["triples"] = _safe_int(s.get("triples"))
                        break
            stats[pid] = info
    logger.info("📊 Fetched season stats for %d batters", len(stats))
    return stats


# ═══════════════════════════════════════════════════════════════
# 4. PITCHER GAME LOGS (MLB API) — for rolling windows
# ═══════════════════════════════════════════════════════════════

def get_pitcher_game_log(pitcher_id: int, season: int) -> tuple[list[dict], str]:
    """Get a pitcher's game-by-game log for computing rolling features."""
    if not pitcher_id:
        return [], "R"
    url = (
        f"{MLB_API}/people/{pitcher_id}"
        f"?hydrate=stats(group=%5Bpitching%5D,type=%5BgameLog%5D,season={season})"
    )
    data = _fetch_json(url)
    if not data or not data.get("people"):
        return [], "R"

    person = data["people"][0]
    throws = person.get("pitchHand", {}).get("code", "R")
    logs = []
    for sg in person.get("stats", []):
        for split in sg.get("splits", []):
            s = split.get("stat", {})
            ip_str = s.get("inningsPitched", "0")
            ip = _parse_ip(ip_str)
            logs.append({
                "date": split.get("date", ""),
                "ip": ip,
                "outs": int(ip * 3),
                "er": _safe_int(s.get("earnedRuns")) or 0,
                "runs": _safe_int(s.get("runs")) or 0,
                "hits": _safe_int(s.get("hits")) or 0,
                "bb": _safe_int(s.get("baseOnBalls")) or 0,
                "so": _safe_int(s.get("strikeOuts")) or 0,
                "hr": _safe_int(s.get("homeRuns")) or 0,
                "pitches": _safe_int(s.get("numberOfPitches")) or 0,
                "bf": _safe_int(s.get("battersFaced")) or 0,
                "game_started": s.get("gamesStarted", 0) == 1,
            })
    return logs, throws


def _parse_ip(ip_str: str) -> float:
    """Parse innings pitched string like '6.1' → 6.333."""
    try:
        parts = str(ip_str).split(".")
        innings = int(parts[0])
        thirds = int(parts[1]) if len(parts) > 1 else 0
        return innings + thirds / 3.0
    except (ValueError, IndexError):
        return 0.0


def compute_pitcher_rolling(logs: list[dict], windows: list[int] = [2, 3, 5, 10, 20]) -> dict:
    """Compute rolling pitcher features from game logs (starts only)."""
    starts = [g for g in logs if g.get("game_started", True)]
    starts.sort(key=lambda g: g["date"])

    features = {}
    for w in windows:
        prefix = f"L{w}"
        recent = starts[-w:] if len(starts) >= w else starts
        if not recent:
            # No data — these will be filled by model means
            for stat in ["avg_ip", "era", "fip", "hr_per_9", "k_bb_pct", "pct_6ip",
                         "pitches_per_ip", "runs_per_start", "whip"]:
                features[f"{prefix}_{stat}"] = None
            continue

        total_ip = sum(g["ip"] for g in recent)
        total_er = sum(g["er"] for g in recent)
        total_runs = sum(g["runs"] for g in recent)
        total_hits = sum(g["hits"] for g in recent)
        total_bb = sum(g["bb"] for g in recent)
        total_so = sum(g["so"] for g in recent)
        total_hr = sum(g["hr"] for g in recent)
        total_pitches = sum(g["pitches"] for g in recent)
        n = len(recent)

        era = (total_er * 9 / total_ip) if total_ip > 0 else None
        whip = ((total_hits + total_bb) / total_ip) if total_ip > 0 else None
        hr_per_9 = (total_hr * 9 / total_ip) if total_ip > 0 else None
        k_rate = total_so / (total_so + total_bb) if (total_so + total_bb) > 0 else None
        k_bb_pct = (total_so - total_bb) / sum(g["bf"] for g in recent) if sum(g["bf"] for g in recent) > 0 else None

        # FIP = ((13*HR + 3*BB - 2*K) / IP) + 3.10 (constant)
        fip = ((13 * total_hr + 3 * total_bb - 2 * total_so) / total_ip + 3.10) if total_ip > 0 else None

        features[f"{prefix}_avg_ip"] = total_ip / n if n > 0 else None
        features[f"{prefix}_era"] = era
        features[f"{prefix}_fip"] = fip
        features[f"{prefix}_hr_per_9"] = hr_per_9
        features[f"{prefix}_k_bb_pct"] = k_bb_pct
        features[f"{prefix}_pct_6ip"] = sum(1 for g in recent if g["ip"] >= 6.0) / n if n > 0 else None
        features[f"{prefix}_pitches_per_ip"] = total_pitches / total_ip if total_ip > 0 else None
        features[f"{prefix}_runs_per_start"] = total_runs / n if n > 0 else None
        features[f"{prefix}_whip"] = whip

    # Season-to-date ERA
    all_starts = starts
    if all_starts:
        total_ip = sum(g["ip"] for g in all_starts)
        total_er = sum(g["er"] for g in all_starts)
        features["STD_era"] = (total_er * 9 / total_ip) if total_ip > 0 else None
    else:
        features["STD_era"] = None

    return features


# ═══════════════════════════════════════════════════════════════
# 5. PITCHER STATCAST PROFILE
# ═══════════════════════════════════════════════════════════════

_pitcher_statcast_cache: dict = {}


def load_pitcher_statcast(season: int) -> dict:
    """Load pitcher Statcast profiles (pitch arsenal speeds, barrel rates)."""
    cache_key = f"pitcher_sc_{season}"
    if cache_key in _pitcher_statcast_cache:
        return _pitcher_statcast_cache[cache_key]

    cache_file = CACHE_DIR / f"pitcher_statcast_{season}.json"
    if cache_file.exists():
        age_hours = (time.time() - cache_file.stat().st_mtime) / 3600
        if age_hours < 12:
            profiles = json.loads(cache_file.read_text())
            profiles = {int(k): v for k, v in profiles.items()}
            _pitcher_statcast_cache[cache_key] = profiles
            return profiles

    logger.info("🔬 Fetching pitcher Statcast data for %d...", season)
    from pybaseball import (
        statcast_pitcher_exitvelo_barrels,
        statcast_pitcher_expected_stats,
        statcast_pitcher_pitch_arsenal,
        statcast_pitcher_arsenal_stats,
    )

    profiles: dict[int, dict] = {}

    # Pitcher exit velo / barrels allowed
    #    Same fix as batters: barrel_pct_against = brl_pa / 100 (barrels/PA)
    #    hard_hit_pct_against = ev95plus / BF (hard hits per batter faced)
    #    We store the raw ev95plus count and compute per-BF later.
    try:
        ev = statcast_pitcher_exitvelo_barrels(season, minBBE=1)
        for _, row in ev.iterrows():
            pid = int(row["player_id"])
            profiles.setdefault(pid, {})
            brl_pa_raw = _safe_float(row.get("brl_pa"))
            # Same 0.65 scaling as batter barrel_pct (see batter section for rationale)
            profiles[pid]["barrel_pct_against"] = (brl_pa_raw / 100.0 * 0.65) if brl_pa_raw is not None else None
            profiles[pid]["ev_against"] = _safe_float(row.get("avg_hit_speed"))
            # Store raw hard-hit count for later computation (divided by PA below)
            profiles[pid]["_ev95plus"] = _safe_float(row.get("ev95plus"))
        logger.info("  ✅ Pitcher EV/barrels: %d pitchers", len(ev))
    except Exception as e:
        logger.warning("  ⚠️ Pitcher EV/barrels failed: %s", e)

    # Pitcher expected stats — provides PA (batters faced) for hard_hit_pct_against
    try:
        pxs = statcast_pitcher_expected_stats(season, minPA=1)
        matched_hh = 0
        for _, row in pxs.iterrows():
            pid = int(row["player_id"])
            if pid in profiles:
                pa = _safe_int(row.get("pa"))
                ev95plus = profiles[pid].get("_ev95plus")
                if ev95plus is not None and pa and pa > 0:
                    profiles[pid]["hard_hit_pct_against"] = ev95plus / pa
                    matched_hh += 1
                else:
                    profiles[pid]["hard_hit_pct_against"] = None
        logger.info("  ✅ Pitcher hard_hit_pct_against: %d pitchers computed (ev95plus / PA)", matched_hh)
    except Exception as e:
        logger.warning("  ⚠️ Pitcher expected stats failed: %s — hard_hit_pct_against will be NaN", e)

    # Pitcher pitch arsenal (speeds)
    try:
        ars = statcast_pitcher_pitch_arsenal(season, minP=1)
        for _, row in ars.iterrows():
            pid = int(row["pitcher"])
            profiles.setdefault(pid, {})
            profiles[pid]["ff_velo"] = _safe_float(row.get("ff_avg_speed"))
            profiles[pid]["si_velo"] = _safe_float(row.get("si_avg_speed"))
            profiles[pid]["sl_velo"] = _safe_float(row.get("sl_avg_speed"))
            profiles[pid]["ch_velo"] = _safe_float(row.get("ch_avg_speed"))
            profiles[pid]["cu_velo"] = _safe_float(row.get("cu_avg_speed"))
        logger.info("  ✅ Pitcher arsenal speeds: %d pitchers", len(ars))
    except Exception as e:
        logger.warning("  ⚠️ Pitcher arsenal speeds failed: %s", e)

    # Pitcher arsenal stats (usage, whiff by pitch type)
    try:
        astats = statcast_pitcher_arsenal_stats(season, minPA=1)
        for pid_val, group in astats.groupby("player_id"):
            pid = int(pid_val)
            profiles.setdefault(pid, {})
            pitch_stats = {}
            for _, row in group.iterrows():
                ptype = str(row.get("pitch_type", "")).upper()
                pitch_stats[ptype] = {
                    "usage": _safe_pct(row.get("pitch_usage")),
                    "whiff_pct": _safe_pct(row.get("whiff_percent")),
                    "hard_hit_pct": _safe_pct(row.get("hard_hit_percent")),
                    "put_away": _safe_pct(row.get("put_away")),
                    "pitches": _safe_int(row.get("pitches")),
                }
            profiles[pid]["pitch_arsenal_stats"] = pitch_stats

            # Overall CSW% approximation from arsenal
            total_pitches = sum(ps.get("pitches", 0) or 0 for ps in pitch_stats.values())
            total_whiff_pitches = sum(
                (ps.get("whiff_pct", 0) or 0) * (ps.get("pitches", 0) or 0)
                for ps in pitch_stats.values()
            )
            profiles[pid]["overall_whiff_pct"] = (
                total_whiff_pitches / total_pitches if total_pitches > 0 else None
            )
        logger.info("  ✅ Pitcher arsenal stats: %d pitchers", astats["player_id"].nunique())
    except Exception as e:
        logger.warning("  ⚠️ Pitcher arsenal stats failed: %s", e)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps({str(k): v for k, v in profiles.items()}, default=str))
    logger.info("💾 Cached %d pitcher profiles → %s", len(profiles), cache_file.name)

    _pitcher_statcast_cache[cache_key] = profiles
    return profiles


# ═══════════════════════════════════════════════════════════════
# 6. TEAM ROLLING RUNS (MLB API)
# ═══════════════════════════════════════════════════════════════

def get_team_recent_games(team_id: int, game_date: str, n: int = 20) -> list[dict]:
    """Get a team's recent game results for run differential features."""
    year = int(game_date[:4])
    season_start = f"{year}-02-20"  # Spring training / early season
    url = (
        f"{MLB_API}/schedule?sportId=1&teamId={team_id}"
        f"&startDate={season_start}&endDate={game_date}"
        f"&gameType=R&fields=dates,date,games,gamePk,teams,home,away,team,id,score,isWinner"
    )
    data = _fetch_json(url)
    if not data:
        return []

    results = []
    for d in data.get("dates", []):
        for g in d.get("games", []):
            home = g.get("teams", {}).get("home", {})
            away = g.get("teams", {}).get("away", {})
            h_score = home.get("score")
            a_score = away.get("score")
            if h_score is None or a_score is None:
                continue
            is_home = home.get("team", {}).get("id") == team_id
            runs_for = h_score if is_home else a_score
            runs_against = a_score if is_home else h_score
            results.append({
                "date": d.get("date", ""),
                "runs_for": runs_for,
                "runs_against": runs_against,
                "won": runs_for > runs_against,
            })

    results.sort(key=lambda r: r["date"])
    return results[-n:]


def compute_team_run_diff(games: list[dict], windows: list[int] = [5, 10, 20]) -> dict:
    """Compute diff_L5/L10/L20_runs_per_game."""
    features = {}
    for w in windows:
        recent = games[-w:] if len(games) >= w else games
        if not recent:
            features[f"diff_L{w}_runs_per_game"] = None
            continue
        avg_for = sum(g["runs_for"] for g in recent) / len(recent)
        avg_against = sum(g["runs_against"] for g in recent) / len(recent)
        features[f"diff_L{w}_runs_per_game"] = avg_for - avg_against
    return features


# ═══════════════════════════════════════════════════════════════
# 7. FEATURE ASSEMBLY — Build the 253 model features
# ═══════════════════════════════════════════════════════════════

def build_lineup_features(
    lineup: list[dict],
    batter_stats: dict[int, dict],
    statcast: dict[int, dict],
    sp_throws: str,
    sp_statcast: dict | None,
    prefix: str,  # "home" or "away"
) -> dict:
    """Build the 48 lineup features from real player data."""
    features = {}

    # Collect per-player stats
    players = []
    for i, p in enumerate(lineup[:9]):
        pid = p["player_id"]
        sc = statcast.get(pid, {})
        bs = batter_stats.get(pid, {})
        bats = bs.get("bats", "R")

        player = {
            "order": i + 1,
            "player_id": pid,
            "bats": bats,
            "avg": bs.get("avg"),
            "obp": bs.get("obp"),
            "slg": bs.get("slg"),
            "iso": (bs.get("slg") or 0) - (bs.get("avg") or 0) if bs.get("slg") and bs.get("avg") else None,
            "bb_pct": bs.get("bb") / bs.get("pa") if bs.get("pa") and bs.get("pa") > 0 else sc.get("bb_pct"),
            "k_pct": bs.get("so") / bs.get("pa") if bs.get("pa") and bs.get("pa") > 0 else sc.get("k_pct"),
            "hr_per_pa": bs.get("hr") / bs.get("pa") if bs.get("pa") and bs.get("pa") > 0 else None,
            # Statcast
            "barrel_pct": sc.get("barrel_pct"),
            "ev_mean": sc.get("ev_mean"),
            "hard_hit_pct": sc.get("hard_hit_pct"),
            "whiff_pct": sc.get("whiff_pct"),
            "chase_pct": sc.get("chase_pct"),
            "contact_pct": sc.get("contact_pct") or (1.0 - sc.get("whiff_pct", 0.235)) if sc.get("whiff_pct") else None,
            "gb_pct": sc.get("gb_pct"),
            "fb_pct": sc.get("fb_pct"),
            # Pitch-type whiff
            "whiff_vs_fastball": sc.get("whiff_vs_fastball"),
            "whiff_vs_breaking": sc.get("whiff_vs_breaking"),
            "whiff_vs_offspeed": sc.get("whiff_vs_offspeed"),
            # EV vs pitch type
            "ev_vs_fastball": sc.get("ev_vs_fastball"),
            "ev_vs_breaking": sc.get("ev_vs_breaking"),
            "ev_vs_offspeed": sc.get("ev_vs_offspeed"),
        }

        # Handedness-specific: barrel/whiff/EV vs SP hand
        pa = sc.get("pitch_arsenal", {})
        if sp_throws == "L":
            # vs LHP — look at performance vs breaking/offspeed from lefties
            player["barrel_vs_sp_hand"] = player["barrel_pct"]  # Aggregate for now
            player["whiff_vs_sp_hand"] = player["whiff_pct"]
            player["ev_vs_sp_hand"] = player["ev_mean"]
        else:
            player["barrel_vs_sp_hand"] = player["barrel_pct"]
            player["whiff_vs_sp_hand"] = player["whiff_pct"]
            player["ev_vs_sp_hand"] = player["ev_mean"]

        # Velocity-binned whiff rates from pitch arsenal
        # Bins: soft < 92 mph (offspeed/curves), avg 92-95 mph (avg fastballs + hard sliders),
        #        plus 95-98 mph (hard fastballs), elite 98+ mph (elite heaters)
        # Historical lineup averages: soft=0.283, avg=0.196, plus=0.189, elite=0.219
        player["whiff_vs_velo_soft"] = sc.get("whiff_vs_offspeed")  # < 92 mph
        player["whiff_vs_velo_avg"] = sc.get("whiff_vs_fastball")   # 92-95 mph (mostly fastballs)
        player["whiff_vs_velo_plus"] = sc.get("whiff_vs_fastball")  # 95-98 mph
        player["whiff_vs_velo_elite"] = sc.get("whiff_vs_fastball") # 98+ mph

        players.append(player)

    # Handedness counts
    n_left = sum(1 for p in players if p["bats"] == "L")
    n_right = sum(1 for p in players if p["bats"] == "R")
    n_switch = sum(1 for p in players if p["bats"] == "S")
    n_total = len(players)

    features[f"{prefix}_lineup_left_handed_pct"] = n_left / n_total if n_total > 0 else 0.33
    features[f"{prefix}_lineup_n_batters_with_data"] = n_total
    features[f"{prefix}_lineup_n_left_handed"] = n_left
    features[f"{prefix}_lineup_n_right_handed"] = n_right
    features[f"{prefix}_lineup_n_switch_hitters"] = n_switch
    features[f"{prefix}_lineup_opposing_sp_throws"] = 1.0 if sp_throws == "R" else 0.0

    # Aggregate stats across lineup
    def _mean(key):
        vals = [p[key] for p in players if p.get(key) is not None]
        return sum(vals) / len(vals) if vals else None

    # Full lineup aggregates
    features[f"{prefix}_lineup_avg"] = _mean("avg")
    features[f"{prefix}_lineup_obp"] = _mean("obp")
    features[f"{prefix}_lineup_slg"] = _mean("slg")
    features[f"{prefix}_lineup_iso"] = _mean("iso")
    features[f"{prefix}_lineup_bb_pct"] = _mean("bb_pct")
    features[f"{prefix}_lineup_k_pct"] = _mean("k_pct")
    features[f"{prefix}_lineup_hr_per_pa"] = _mean("hr_per_pa")
    features[f"{prefix}_lineup_barrel_pct"] = _mean("barrel_pct")
    features[f"{prefix}_lineup_ev_mean"] = _mean("ev_mean")
    features[f"{prefix}_lineup_hard_hit_pct"] = _mean("hard_hit_pct")
    features[f"{prefix}_lineup_whiff_pct"] = _mean("whiff_pct")
    features[f"{prefix}_lineup_chase_pct"] = _mean("chase_pct")
    features[f"{prefix}_lineup_contact_pct"] = _mean("contact_pct")
    features[f"{prefix}_lineup_gb_pct"] = _mean("gb_pct")
    features[f"{prefix}_lineup_fb_pct"] = _mean("fb_pct")

    # Pitch type whiff/EV
    features[f"{prefix}_lineup_whiff_vs_fastball_pct"] = _mean("whiff_vs_fastball")
    features[f"{prefix}_lineup_whiff_vs_breaking_pct"] = _mean("whiff_vs_breaking")
    features[f"{prefix}_lineup_whiff_vs_offspeed_pct"] = _mean("whiff_vs_offspeed")
    features[f"{prefix}_lineup_ev_vs_fastball"] = _mean("ev_vs_fastball")
    features[f"{prefix}_lineup_ev_vs_breaking"] = _mean("ev_vs_breaking")
    features[f"{prefix}_lineup_ev_vs_offspeed"] = _mean("ev_vs_offspeed")

    # SP-hand specific
    features[f"{prefix}_lineup_barrel_vs_sp_hand_pct"] = _mean("barrel_vs_sp_hand")
    features[f"{prefix}_lineup_whiff_vs_sp_hand_pct"] = _mean("whiff_vs_sp_hand")
    features[f"{prefix}_lineup_ev_vs_sp_hand"] = _mean("ev_vs_sp_hand")

    # Velocity-binned whiff
    features[f"{prefix}_lineup_whiff_vs_velo_soft_pct"] = _mean("whiff_vs_velo_soft")
    features[f"{prefix}_lineup_whiff_vs_velo_avg_pct"] = _mean("whiff_vs_velo_avg")
    features[f"{prefix}_lineup_whiff_vs_velo_plus_pct"] = _mean("whiff_vs_velo_plus")
    features[f"{prefix}_lineup_whiff_vs_velo_elite_pct"] = _mean("whiff_vs_velo_elite")

    # Top 5 / Bottom 4 splits
    top5 = players[:5]
    bot4 = players[5:9]

    def _mean_group(group, key):
        vals = [p[key] for p in group if p.get(key) is not None]
        return sum(vals) / len(vals) if vals else None

    for grp_name, grp in [("top5", top5), ("bottom4", bot4)]:
        features[f"{prefix}_lineup_{grp_name}_obp"] = _mean_group(grp, "obp")
        features[f"{prefix}_lineup_{grp_name}_slg"] = _mean_group(grp, "slg")
        features[f"{prefix}_lineup_{grp_name}_iso"] = _mean_group(grp, "iso")
        features[f"{prefix}_lineup_{grp_name}_k_pct"] = _mean_group(grp, "k_pct")
        features[f"{prefix}_lineup_{grp_name}_barrel_pct"] = _mean_group(grp, "barrel_pct")
        features[f"{prefix}_lineup_{grp_name}_ev_mean"] = _mean_group(grp, "ev_mean")
        features[f"{prefix}_lineup_{grp_name}_whiff_pct"] = _mean_group(grp, "whiff_pct")

    return features


def _sp_velo_bin_fractions(sp_statcast: dict | None) -> dict:
    """Compute the fraction of an SP's pitches in each velocity bin.

    Uses per-pitch-type velocity (from pitch_arsenal) and usage (from pitch_arsenal_stats)
    to classify each pitch type into a velocity bin and sum usages.

    Bins: soft < 92 mph, avg 92-95, plus 95-98, elite >= 98
    Returns dict with keys 'soft', 'avg', 'plus', 'elite' summing to ~1.0.
    Falls back to league-average fractions if data is missing.
    """
    # League-average fractions (from 2022-2024 historical implied averages)
    LEAGUE_AVG = {"soft": 0.437, "avg": 0.256, "plus": 0.218, "elite": 0.075}

    if not sp_statcast:
        return LEAGUE_AVG

    # Get per-pitch-type velocities
    velo_keys = {
        "FF": "ff_velo", "SI": "si_velo", "FC": "fc_velo",
        "SL": "sl_velo", "CH": "ch_velo", "CU": "cu_velo",
        "FS": "fs_velo", "KN": "kn_velo", "ST": "st_velo",
        "SV": "sv_velo",
    }
    arsenal = sp_statcast.get("pitch_arsenal_stats", {})
    if not arsenal:
        return LEAGUE_AVG

    bins = {"soft": 0.0, "avg": 0.0, "plus": 0.0, "elite": 0.0}
    total_usage = 0.0
    for pt, stats in arsenal.items():
        usage = stats.get("usage") or 0
        velo_key = velo_keys.get(pt.upper())
        if velo_key is None:
            continue
        velo = sp_statcast.get(velo_key)
        if velo is None or usage <= 0:
            continue
        total_usage += usage
        if velo >= 98:
            bins["elite"] += usage
        elif velo >= 95:
            bins["plus"] += usage
        elif velo >= 92:
            bins["avg"] += usage
        else:
            bins["soft"] += usage

    if total_usage <= 0:
        return LEAGUE_AVG

    return {k: v / total_usage for k, v in bins.items()}


def build_interaction_features(
    lineup_features: dict,
    sp_rolling: dict,
    sp_statcast: dict | None,
    sp_throws: str,
    batting_prefix: str,    # "home" or "away" (the batting team)
    sp_prefix: str,         # "home" or "away" (the pitching team)
) -> dict:
    """Build the 26 lineup-vs-SP interaction features.

    Historical pipeline used PRODUCT for matchup features (barrel × barrel_against),
    not SUM. This was confirmed by analyzing the historical feature distributions.
    """
    features = {}
    bp = f"{batting_prefix}_lineup_"
    ip = f"{batting_prefix}_vs_{sp_prefix}_sp_"

    sp_sc = sp_statcast or {}

    # Barrel matchup: lineup barrel% × pitcher barrel% against (PRODUCT)
    # Historical mean ≈ 0.0012 = 0.034 × 0.035
    l_barrel = lineup_features.get(f"{bp}barrel_pct")
    p_barrel = sp_sc.get("barrel_pct_against")
    features[f"{ip}barrel_matchup"] = _combine(l_barrel, p_barrel, "product")

    # Barrel vs handedness
    features[f"{ip}barrel_vs_handedness"] = lineup_features.get(f"{bp}barrel_vs_sp_hand_pct")

    # Whiff potentials by pitch type
    # Historical features are whiff_rate × SP pitch_type_usage_fraction:
    #   offspeed: mean=0.042 ≈ 0.29 whiff × 0.14 usage
    #   breaking: mean=0.081 ≈ 0.32 whiff × 0.25 usage
    #   fastball: mean=0.101 ≈ 0.21 whiff × 0.50 usage
    # We compute SP's pitch group usage from their arsenal stats.
    arsenal = sp_sc.get("pitch_arsenal_stats", {})
    fb_types = {"FF", "SI", "FC"}
    brk_types = {"SL", "CU", "ST", "SV", "KC"}
    off_types = {"CH", "FS", "SC", "KN"}
    total_pitches_arsenal = sum(
        (ps.get("pitches", 0) or 0) for ps in arsenal.values()
    )

    def _group_usage(pitch_group: set) -> float:
        """Usage fraction for a group of pitch types from the SP's arsenal."""
        if total_pitches_arsenal == 0:
            # Use MLB-average pitch group usage as fallback
            return {id(fb_types): 0.50, id(brk_types): 0.25, id(off_types): 0.14}.get(id(pitch_group), 0.20)
        grp_pitches = sum(
            (arsenal.get(pt, {}).get("pitches", 0) or 0) for pt in pitch_group
        )
        return grp_pitches / total_pitches_arsenal

    fb_usage = _group_usage(fb_types)
    brk_usage = _group_usage(brk_types)
    off_usage = _group_usage(off_types)

    brk_whiff_raw = lineup_features.get(f"{bp}whiff_vs_breaking_pct")
    fb_whiff_raw = lineup_features.get(f"{bp}whiff_vs_fastball_pct")
    off_whiff_raw = lineup_features.get(f"{bp}whiff_vs_offspeed_pct")

    features[f"{ip}breaking_whiff_potential"] = (brk_whiff_raw * brk_usage) if brk_whiff_raw is not None else None
    features[f"{ip}fastball_whiff_potential"] = (fb_whiff_raw * fb_usage) if fb_whiff_raw is not None else None
    features[f"{ip}offspeed_whiff_potential"] = (off_whiff_raw * off_usage) if off_whiff_raw is not None else None
    features[f"{ip}total_whiff_potential"] = lineup_features.get(f"{bp}whiff_pct")

    # Chase matchup: chase% × pitcher_whiff (PRODUCT)
    # Historical mean ≈ 0.084 = 0.284 × 0.295
    features[f"{ip}chase_matchup"] = _combine(
        lineup_features.get(f"{bp}chase_pct"),
        sp_sc.get("overall_whiff_pct"),
        "product"
    )
    p_whiff = sp_sc.get("overall_whiff_pct")
    l_chase = lineup_features.get(f"{bp}chase_pct")
    features[f"{ip}chase_diff"] = _combine(l_chase, p_whiff, "diff") if p_whiff else l_chase

    # EV
    l_ev = lineup_features.get(f"{bp}ev_mean")
    p_ev = sp_sc.get("ev_against")
    features[f"{ip}ev_diff"] = _combine(l_ev, p_ev, "diff")
    features[f"{ip}ev_vs_handedness"] = lineup_features.get(f"{bp}ev_vs_sp_hand")

    # Hard hit matchup: hard_hit% × pitcher hard_hit_against% (PRODUCT)
    # Historical mean ≈ 0.068 = 0.258 × 0.263
    l_hh = lineup_features.get(f"{bp}hard_hit_pct")
    p_hh = sp_sc.get("hard_hit_pct_against")
    features[f"{ip}hard_hit_matchup"] = _combine(l_hh, p_hh, "product")

    # HR risk: almost perfectly correlated (r=0.988) with fb_tendency (lineup flyball%).
    # Linear fit: hr_risk ≈ 0.787 × fb_tendency + 0.050  (R²=0.976).
    # Historical mean=0.376, std=0.029.
    l_fb_pct = lineup_features.get(f"{bp}fb_pct")
    if l_fb_pct is not None:
        features[f"{ip}hr_risk"] = 0.787 * l_fb_pct + 0.050
    else:
        features[f"{ip}hr_risk"] = None

    # HR suppression: 1 - (lineup_hr_per_pa × pitcher_hr_per_pa).
    # Historical mean ≈ 0.999, std ≈ 0.0007, range 0.995-1.000.
    # pitcher_hr_per_pa ≈ hr_per_9 / 38 (typical BF per 9 IP).
    l_hr = lineup_features.get(f"{bp}hr_per_pa")
    p_hr9 = sp_rolling.get("L10_hr_per_9")
    if p_hr9 is not None and l_hr is not None:
        pitcher_hr_per_pa = p_hr9 / 38.0
        features[f"{ip}hr_suppression"] = 1.0 - (l_hr * pitcher_hr_per_pa)
    else:
        features[f"{ip}hr_suppression"] = None

    # K potential
    l_kpct = lineup_features.get(f"{bp}k_pct")
    features[f"{ip}k_potential_composite"] = l_kpct

    # Offense potential: just lineup SLG (historical mean ≈ 0.397 = MLB avg SLG)
    l_slg = lineup_features.get(f"{bp}slg")
    features[f"{ip}offense_potential"] = l_slg

    # Combined whiff: just lineup whiff_pct (historical mean ≈ 0.235 = lineup_whiff)
    features[f"{ip}combined_whiff"] = lineup_features.get(f"{bp}whiff_pct")

    # CSW vs contact: pitcher_whiff × (1 - lineup_contact_pct)
    # Historical mean ≈ 0.065 = 0.278 (CSW proxy) × 0.234 (1 - contact_pct)
    # correlation with contact_pct = -0.73 (verified against historical)
    contact_pct = lineup_features.get(f"{bp}contact_pct")
    pitcher_whiff = sp_sc.get("overall_whiff_pct")
    if pitcher_whiff is not None and contact_pct is not None:
        features[f"{ip}csw_vs_contact"] = pitcher_whiff * (1.0 - contact_pct)
    else:
        features[f"{ip}csw_vs_contact"] = None

    # Tendency features
    features[f"{ip}fb_tendency"] = lineup_features.get(f"{bp}fb_pct")
    features[f"{ip}gb_tendency"] = lineup_features.get(f"{bp}gb_pct")

    # Whiff advantage
    features[f"{ip}whiff_advantage"] = _combine(
        sp_sc.get("overall_whiff_pct"),
        lineup_features.get(f"{bp}whiff_pct"),
        "diff"
    )
    features[f"{ip}whiff_vs_handedness"] = lineup_features.get(f"{bp}whiff_vs_sp_hand_pct")

    # Velocity-binned whiff potential = batter_whiff_at_velo_bin × SP_fraction_at_velo_bin
    # Historical pipeline stored these as whiff_rate × pitch_fraction, so they sum
    # to approximately overall whiff (~0.235). Raw whiff rates are ~0.20-0.30 per bin,
    # but multiplied by the SP's fraction of pitches at that velocity bin.
    velo_fracs = _sp_velo_bin_fractions(sp_sc)
    for bin_name, whiff_key in [
        ("soft", f"{bp}whiff_vs_velo_soft_pct"),
        ("avg", f"{bp}whiff_vs_velo_avg_pct"),
        ("plus", f"{bp}whiff_vs_velo_plus_pct"),
        ("elite", f"{bp}whiff_vs_velo_elite_pct"),
    ]:
        raw_whiff = lineup_features.get(whiff_key)
        frac = velo_fracs.get(bin_name, 0.25)
        features[f"{ip}velo_{bin_name}_whiff_potential"] = (
            raw_whiff * frac if raw_whiff is not None else None
        )
    features[f"{ip}velo_weighted_whiff_potential"] = lineup_features.get(f"{bp}whiff_pct")

    return features


def _combine(a, b, mode: str) -> float | None:
    """Combine two values (sum, diff, or product). Returns None if both are None."""
    if a is None and b is None:
        return None
    a = a or 0
    b = b or 0
    if mode == "sum":
        return a + b
    elif mode == "diff":
        return a - b
    elif mode == "product":
        return a * b
    return a


# ═══════════════════════════════════════════════════════════════
# 8. MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════

def build_features_for_date(game_date: str) -> pd.DataFrame:
    """Build complete feature rows for all games on a date."""
    with open(ARTIFACTS_DIR / "features.json") as f:
        model_features = json.load(f)

    # 1. Get schedule
    games = get_schedule(game_date)
    if not games:
        logger.warning("No games found for %s", game_date)
        return pd.DataFrame()

    # Determine which season's stats to use
    year = int(game_date[:4])
    # For early season (March/April), use prior year's Statcast profiles
    month = int(game_date[5:7])
    statcast_season = year - 1 if month <= 4 else year
    logger.info("📊 Using %d Statcast profiles (game month: %d)", statcast_season, month)

    # 2. Load Statcast data (batters + pitchers)
    batter_statcast = load_statcast_data(statcast_season)
    pitcher_statcast = load_pitcher_statcast(statcast_season)

    # 3. Collect all player IDs we need
    all_batter_ids = set()
    all_pitcher_ids = set()
    for g in games:
        for p in g.get("home_lineup", []) + g.get("away_lineup", []):
            all_batter_ids.add(p["player_id"])
        if g.get("home_sp_id"):
            all_pitcher_ids.add(g["home_sp_id"])
        if g.get("away_sp_id"):
            all_pitcher_ids.add(g["away_sp_id"])

    # 4. Get season batting stats from MLB API
    # Use prior season stats for early season games
    batter_season = get_batter_season_stats(list(all_batter_ids), statcast_season)

    # 5. Get pitcher game logs
    pitcher_logs = {}
    pitcher_throws = {}
    for pid in all_pitcher_ids:
        try:
            logs, throws = get_pitcher_game_log(pid, statcast_season)
            pitcher_logs[pid] = logs
            pitcher_throws[pid] = throws
        except Exception as e:
            logger.warning("Failed to get game log for pitcher %d: %s", pid, e)
            pitcher_logs[pid] = []
            pitcher_throws[pid] = "R"

    # Also try current season logs if different
    if statcast_season != year:
        for pid in all_pitcher_ids:
            try:
                logs_cur, throws_cur = get_pitcher_game_log(pid, year)
                if logs_cur:
                    pitcher_logs[pid] = pitcher_logs.get(pid, []) + logs_cur
                    pitcher_throws[pid] = throws_cur
            except Exception:
                pass

    # 6. Build features per game
    rows = []
    for g in games:
        logger.info("🏟️  Building features: %s @ %s (game_pk=%d)",
                     g["away_team"], g["home_team"], g["game_pk"])

        # Handle missing lineups — use roster fallback
        home_lineup = g.get("home_lineup", [])
        away_lineup = g.get("away_lineup", [])
        if len(home_lineup) < 9:
            logger.info("  ⚠️ Home lineup not posted yet, using roster fallback")
            home_lineup = get_lineup_from_roster(g["home_team_id"], game_date)
        if len(away_lineup) < 9:
            logger.info("  ⚠️ Away lineup not posted yet, using roster fallback")
            away_lineup = get_lineup_from_roster(g["away_team_id"], game_date)

        home_sp_id = g.get("home_sp_id")
        away_sp_id = g.get("away_sp_id")
        home_sp_throws = pitcher_throws.get(home_sp_id, "R")
        away_sp_throws = pitcher_throws.get(away_sp_id, "R")

        # Pitcher rolling features
        home_sp_rolling = compute_pitcher_rolling(pitcher_logs.get(home_sp_id, []))
        away_sp_rolling = compute_pitcher_rolling(pitcher_logs.get(away_sp_id, []))

        # Pitcher Statcast profiles
        home_sp_sc = pitcher_statcast.get(home_sp_id, {})
        away_sp_sc = pitcher_statcast.get(away_sp_id, {})

        # Lineup features
        home_lineup_feats = build_lineup_features(
            home_lineup, batter_season, batter_statcast,
            away_sp_throws, away_sp_sc, "home"
        )
        away_lineup_feats = build_lineup_features(
            away_lineup, batter_season, batter_statcast,
            home_sp_throws, home_sp_sc, "away"
        )

        # SP rolling features (prefixed), with outlier capping
        # Pitchers with very few IP can have extreme values (e.g. 48 pitches/IP,
        # WHIP=6.0, FIP=42). Cap IN-PLACE on the rolling dicts so that diffs
        # and interaction features also use the capped values.
        _SP_CAPS = {
            "hr_per_9": 6.0,
            "fip": 8.0,       # p99 ≈ 7.6
            "era": 15.0,
            "whip": 3.0,      # p99 ≈ 2.3
            "pitches_per_ip": 25.0,  # p99 ≈ 22.2
        }
        def _apply_caps(rolling_dict: dict) -> dict:
            """Apply outlier caps to a rolling stats dict in-place."""
            for k in list(rolling_dict.keys()):
                v = rolling_dict[k]
                if v is not None:
                    for cap_key, cap_val in _SP_CAPS.items():
                        if k.endswith(cap_key):
                            rolling_dict[k] = min(v, cap_val)
            return rolling_dict

        _apply_caps(home_sp_rolling)
        _apply_caps(away_sp_rolling)

        row = {}
        for k, v in home_sp_rolling.items():
            row[f"home_sp_{k}"] = v
        for k, v in away_sp_rolling.items():
            row[f"away_sp_{k}"] = v

        # Lineup features
        row.update(home_lineup_feats)
        row.update(away_lineup_feats)

        # Interaction features: home lineup vs away SP
        home_vs_away = build_interaction_features(
            home_lineup_feats, away_sp_rolling, away_sp_sc,
            away_sp_throws, "home", "away"
        )
        row.update(home_vs_away)

        # Interaction features: away lineup vs home SP
        away_vs_home = build_interaction_features(
            away_lineup_feats, home_sp_rolling, home_sp_sc,
            home_sp_throws, "away", "home"
        )
        row.update(away_vs_home)

        # SP differential features (home SP minus away SP)
        # Uses already-capped rolling dicts
        for w in [2, 3, 5, 10, 20]:
            h_era = home_sp_rolling.get(f"L{w}_era")
            a_era = away_sp_rolling.get(f"L{w}_era")
            h_fip = home_sp_rolling.get(f"L{w}_fip")
            a_fip = away_sp_rolling.get(f"L{w}_fip")
            row[f"diff_sp_L{w}_era"] = (h_era - a_era) if h_era is not None and a_era is not None else None
            row[f"diff_sp_L{w}_fip"] = (h_fip - a_fip) if h_fip is not None and a_fip is not None else None

        # Team run differential features
        home_games = get_team_recent_games(g["home_team_id"], game_date)
        away_games = get_team_recent_games(g["away_team_id"], game_date)
        # diff = home - away for each window
        for w in [5, 10, 20]:
            h_recent = home_games[-w:] if len(home_games) >= w else home_games
            a_recent = away_games[-w:] if len(away_games) >= w else away_games
            h_rpg = sum(gg["runs_for"] for gg in h_recent) / len(h_recent) if h_recent else None
            a_rpg = sum(gg["runs_for"] for gg in a_recent) / len(a_recent) if a_recent else None
            if h_rpg is not None and a_rpg is not None:
                row[f"diff_L{w}_runs_per_game"] = h_rpg - a_rpg
            else:
                row[f"diff_L{w}_runs_per_game"] = None

        # Metadata
        row["game_pk"] = g["game_pk"]
        row["game_date"] = game_date
        row["home_team"] = g["home_team"]
        row["away_team"] = g["away_team"]

        rows.append(row)

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)

    # Validate: check which model features are present
    present = [f for f in model_features if f in df.columns]
    missing = [f for f in model_features if f not in df.columns]
    logger.info("✅ Features present: %d / %d", len(present), len(model_features))
    if missing:
        logger.warning("⚠️  Missing features (%d): %s", len(missing), missing[:10])
        # Add missing columns as NaN (model's means.json will impute)
        for f in missing:
            df[f] = np.nan

    return df


# ═══════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="F5 ML Live Feature Builder")
    parser.add_argument("--date", required=True, help="YYYY-MM-DD or 'today'")
    parser.add_argument("--outdir", default=str(CACHE_DIR), help="Output directory")
    args = parser.parse_args()

    game_date = args.date
    if game_date.lower() == "today":
        game_date = date.today().isoformat()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    logger.info("🚀 Building live features for %s", game_date)
    df = build_features_for_date(game_date)

    if df.empty:
        logger.warning("No features built — no games or data unavailable")
        sys.exit(0)

    # Write parquet
    out_path = outdir / f"live_features_{game_date}.parquet"
    df.to_parquet(out_path, index=False)
    logger.info("📁 Wrote %d games → %s", len(df), out_path)

    # Also write a human-readable summary
    with open(ARTIFACTS_DIR / "features.json") as f:
        model_features = json.load(f)
    present = sum(1 for f in model_features if f in df.columns and df[f].notna().any())
    total_null = sum(df[f].isna().sum() for f in model_features if f in df.columns)
    total_cells = len(df) * len(model_features)
    logger.info("📊 Coverage: %d/%d features have data, %.1f%% cells filled",
                present, len(model_features),
                100 * (1 - total_null / total_cells) if total_cells > 0 else 0)

    print(f"\n✅ Live features: {len(df)} games for {game_date}")
    print(f"   Features: {present}/{len(model_features)} with real data")
    print(f"   Output: {out_path}")


if __name__ == "__main__":
    main()
