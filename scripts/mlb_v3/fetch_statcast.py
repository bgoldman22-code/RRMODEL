#!/usr/bin/env python3
"""
MLB V3 — Statcast Daily Data Pipeline
======================================
Fetches 6 datasets from Baseball Savant + FanGraphs and uploads to Netlify Blobs.

Writes BOTH the current season AND the prior season so the JS backend can
blend them per-player at runtime based on accumulated PA/BF counts.

Blending strategy (decided by JS backend at runtime, not here):
  Games  1–14  → 100% prior season   (current year too sparse)
  Games 15–40  → Bayesian blend:  weight_cur = PA_cur / (PA_cur + PA_prior)
  Games  40+   → 100% current season

Datasets written to rrmodelblobs for BOTH current and prior year:
  statcast/batters-{YEAR}.json              batter EV / barrel / hard-hit
  statcast/spray-{YEAR}.json                batter pull-rate by fly-ball / overall
  statcast/pitchers-ev-{YEAR}.json          pitcher EV allowed / barrel allowed
  statcast/arsenal-{YEAR}.json              pitcher pitch-type usage / run-value
  statcast/park-factors-{YEAR}.json         venue HR index by batter side
  statcast/fangraphs-pitching-{YEAR}.json   xFIP / HR-FB / GB% / FB%
  statcast/meta.json                        run timestamp + per-dataset status

Run:
  python scripts/mlb_v3/fetch_statcast.py [--year YYYY] [--dry-run]
  python scripts/mlb_v3/fetch_statcast.py --prior-only   # backfill prior year only
  python scripts/mlb_v3/fetch_statcast.py --current-only # daily update of current year only

Env vars required:
  NETLIFY_SITE_ID
  NETLIFY_AUTH_TOKEN  (or NETLIFY_TOKEN or NETLIFY_BLOBS_TOKEN)
"""

import argparse
import io
import json
import os
import sys
import time
from datetime import datetime, timezone

import pandas as pd
import requests


# ── Utility helpers ────────────────────────────────────────────────────────────

def _safe_float(val) -> "float | None":
    """Convert to float, return None on failure or NaN."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if (f != f) else round(f, 6)
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> "int | None":
    """Convert to int, return None on failure."""
    if val is None:
        return None
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return None


def season_start(year: int) -> str:
    return f"{year}-03-20"


def season_end(year: int) -> str:
    """Approximate end of regular season."""
    return f"{year}-10-01"


def is_csv_response(text: str) -> bool:
    """
    Return True only if the HTTP body looks like a CSV file.
    Savant sometimes returns an HTML page (HTTP 200) when a leaderboard
    has no data for the requested season — e.g. on Opening Day the
    statcast leaderboards are empty and the endpoint serves HTML.
    A CSV response must start with a comma-delimited header row.
    """
    if not text or len(text.strip()) < 10:
        return False
    first = text.strip().split("\n")[0]
    if first.strip().startswith("<"):
        return False
    if "," not in first:
        return False
    return True


# ── Arg parsing ────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(
    description="Fetch Statcast/FanGraphs data for MLB V3 (both current + prior year)"
)
parser.add_argument("--year",         type=int, default=datetime.now().year,
                    help="Current season year (default: current calendar year)")
parser.add_argument("--dry-run",      action="store_true",
                    help="Fetch and print row counts, skip Blobs upload")
parser.add_argument("--prior-only",   action="store_true",
                    help="Only fetch and upload prior-year datasets (useful for initial backfill)")
parser.add_argument("--current-only", action="store_true",
                    help="Only fetch and upload current-year datasets (faster daily refresh)")
args = parser.parse_args()

YEAR    = args.year
PRIOR   = YEAR - 1
DRY_RUN = args.dry_run
TODAY   = datetime.now(timezone.utc).strftime("%Y-%m-%d")

FETCH_PRIOR   = not args.current_only
FETCH_CURRENT = not args.prior_only

years_to_fetch = []
if FETCH_PRIOR:
    years_to_fetch.append(PRIOR)
if FETCH_CURRENT:
    years_to_fetch.append(YEAR)

print(f"{'[DRY-RUN] ' if DRY_RUN else ''}MLB V3 Statcast Pipeline — current={YEAR}, prior={PRIOR}, date={TODAY}")
print(f"  Fetching years: {years_to_fetch}")


# ── Netlify Blobs credentials ──────────────────────────────────────────────────
SITE_ID = (
    os.environ.get("NETLIFY_SITE_ID")
    or os.environ.get("NETLIFY_BLOBS_SITE_ID")
    or os.environ.get("SITE_ID")
)
TOKEN = (
    os.environ.get("NETLIFY_AUTH_TOKEN")
    or os.environ.get("NETLIFY_TOKEN")
    or os.environ.get("NETLIFY_BLOBS_TOKEN")
)
# HARDCODED: never read from BLOBS_STORE env var — Netlify sets
# BLOBS_STORE=mlb-odds which would silently write to the wrong store.
STORE_NAME = "rrmodelblobs"

if not DRY_RUN and (not SITE_ID or not TOKEN):
    print("❌  Missing NETLIFY_SITE_ID and/or NETLIFY_AUTH_TOKEN", file=sys.stderr)
    sys.exit(1)

BLOBS_BASE    = f"https://api.netlify.com/api/v1/blobs/{SITE_ID}/{STORE_NAME}"
BLOBS_HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

REQUEST_TIMEOUT = 60
MAX_RETRIES     = 3
RETRY_DELAY     = 5


# ── Network helpers ────────────────────────────────────────────────────────────

def fetch_csv(url: str, label: str, timeout: int = REQUEST_TIMEOUT) -> "pd.DataFrame | None":
    """
    GET a URL, validate it is CSV (not an HTML error page), parse into a
    DataFrame and return it. Retries up to MAX_RETRIES on any failure or
    non-CSV body.
    """
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"  ↓ [{label}] attempt {attempt}: {url[:95]}{'…' if len(url) > 95 else ''}")
            r = requests.get(url, timeout=timeout,
                             headers={"User-Agent": "mlb-v3-pipeline/1.0"})
            r.raise_for_status()
            if not is_csv_response(r.text):
                preview = r.text[:120].replace("\n", " ")
                print(f"  ⚠ [{label}] attempt {attempt} — not CSV (HTML?): {preview!r}")
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY * attempt)
                continue
            df = pd.read_csv(io.StringIO(r.text))
            print(f"  ✓ [{label}] {len(df)} rows, {len(df.columns)} cols")
            return df
        except Exception as e:
            print(f"  ⚠ [{label}] attempt {attempt} failed: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)
    print(f"  ✗ [{label}] all {MAX_RETRIES} attempts failed — skipping")
    return None


def upload_blob(key: str, data: "dict | list", label: str) -> bool:
    """Upload a JSON payload to Netlify Blobs. Returns True on success."""
    if DRY_RUN:
        n = len(data) if isinstance(data, list) else "dict"
        print(f"  [dry-run] would upload {key!r} ({n} records)")
        return True
    url = f"{BLOBS_BASE}/{key}"
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            payload = json.dumps(data, ensure_ascii=False)
            r = requests.put(url, data=payload, headers=BLOBS_HEADERS, timeout=30)
            r.raise_for_status()
            print(f"  ✅ Uploaded {key!r}")
            return True
        except Exception as e:
            print(f"  ⚠ upload [{label}] attempt {attempt} failed: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY)
    print(f"  ✗ upload [{label}] all attempts failed")
    return False



# ── Per-year results tracker ───────────────────────────────────────────────────
# results[year][ds_label] = { ok, rows, note, date_range }
results: dict[int, dict[str, dict]] = {y: {} for y in years_to_fetch}


def record(year: int, label: str, ok: bool, rows: int = 0,
           note: str = "", date_range: str = "") -> None:
    results[year][label] = {
        "ok":         ok,
        "rows":       rows,
        "note":       note,
        "date_range": date_range,
    }
    icon = "✅" if ok else "❌"
    dr   = f"  [{date_range}]" if date_range else ""
    msg  = f" ({note})" if note else ""
    print(f"{icon} [{year}] {label}: {rows} rows{dr}{msg}")


# ══════════════════════════════════════════════════════════════════════════════
# DATASET FETCHERS
# Each fetcher accepts a year, returns (payload_dict | None, date_range_str).
# payload_dict always contains: year, fetched, date_range, + data key.
# ══════════════════════════════════════════════════════════════════════════════

def fetch_batters_ev(year: int) -> "tuple[dict | None, str]":
    """
    Batter EV / Barrel / Hard-Hit from the Savant statcast leaderboard.
    Includes `pa` field so the JS backend can compute Bayesian blend weights.
    """
    label      = f"batters-ev-{year}"
    is_prior   = (year < YEAR)
    date_high  = season_end(year) if is_prior else TODAY
    date_range = f"{season_start(year)} – {date_high}"

    # min=1 so early-season data (even 1 PA) is included.
    # The JS backend applies its own PA-threshold logic for blend weighting.
    url = (
        f"https://baseballsavant.mlb.com/leaderboard/statcast"
        f"?type=batter&year={year}&position=&team=&min=1&csv=true"
    )
    df = fetch_csv(url, label)
    if df is None or len(df) == 0:
        return None, date_range

    df.columns = [c.lower().strip() for c in df.columns]
    out = []
    for _, row in df.iterrows():
        brl_raw = (row.get("barrel_batted_rate")
                   or row.get("barrel%")
                   or row.get("brl_percent"))
        rec = {
            "player_id":          _safe_int(row.get("player_id")),
            "player_name":        str(row.get("player_name", "")).strip(),
            "exit_velocity_avg":  _safe_float(row.get("exit_velocity_avg") or row.get("ev")),
            "launch_angle_avg":   _safe_float(row.get("launch_angle_avg")  or row.get("la")),
            "barrel_batted_rate": _safe_float(brl_raw),
            "hard_hit_percent":   _safe_float(row.get("hard_hit_percent")  or row.get("hard_hit%")),
            "brl_pa":             _safe_float(row.get("brl_pa") or row.get("barrels_per_pa_percent")),
            # PA is used by the JS backend to compute blend weights
            "pa":                 _safe_int(row.get("pa") or row.get("attempts")),
        }
        if rec["player_id"]:
            out.append(rec)

    return {"year": year, "fetched": TODAY, "date_range": date_range, "players": out}, date_range


def fetch_spray(year: int) -> "tuple[dict | None, str]":
    """
    Batter pull-rate (overall + fly-ball) from Savant pitch-by-pitch search.
    Full season for prior year; YTD for current year.

    Savant caps individual requests at ~25k rows. To get full-season coverage
    we split into monthly date chunks (Apr-Sep for prior; Apr-today for current)
    and concatenate all pages. This pushes coverage from ~85% to ~95%+.
    """
    import calendar

    label      = f"spray-{year}"
    is_prior   = (year < YEAR)
    date_low   = season_start(year)
    date_high  = season_end(year) if is_prior else TODAY
    date_range = f"{date_low} – {date_high}"

    # Build monthly date chunks: (chunk_start, chunk_end) strings
    start_dt = datetime.strptime(date_low,  "%Y-%m-%d")
    end_dt   = datetime.strptime(date_high, "%Y-%m-%d")

    chunks = []
    cur = start_dt.replace(day=1)
    while cur <= end_dt:
        last_day = calendar.monthrange(cur.year, cur.month)[1]
        chunk_end = cur.replace(day=last_day)
        chunks.append((
            cur.strftime("%Y-%m-%d"),
            min(chunk_end, end_dt).strftime("%Y-%m-%d"),
        ))
        # Advance to first day of next month
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1, day=1)
        else:
            cur = cur.replace(month=cur.month + 1, day=1)

    # Fetch all chunks and concatenate
    frames: list = []
    for chunk_lo, chunk_hi in chunks:
        url = (
            f"https://baseballsavant.mlb.com/statcast_search/csv"
            f"?all=true&hfGT=R%7C&hfSea={year}%7C"
            f"&player_type=batter"
            f"&game_date_gt={chunk_lo}&game_date_lt={chunk_hi}"
            f"&hfAB=home_run%7Csingle%7Cdouble%7Ctriple%7Cfield_out%7C"
            f"&type=details"
        )
        chunk_label = f"{label}-{chunk_lo[:7]}"
        df_chunk = fetch_csv(url, chunk_label, timeout=120)
        if df_chunk is not None and len(df_chunk) > 0:
            frames.append(df_chunk)
            print(f"  ✓ [{chunk_label}] {len(df_chunk):,} rows")
        else:
            print(f"  ⚠ [{chunk_label}] 0 rows or error — skipping")

    if not frames:
        return None, date_range

    df = pd.concat(frames, ignore_index=True)
    print(f"  [{label}] total {len(df):,} rows from {len(frames)} chunks")

    df.columns = [c.lower().strip() for c in df.columns]
    needed = {"batter", "stand", "hc_x", "launch_angle"}
    if not needed.issubset(set(df.columns)):
        missing = needed - set(df.columns)
        print(f"  ⚠ [{label}] missing cols: {missing}")
        return None, date_range

    df["hc_x"]         = pd.to_numeric(df["hc_x"],         errors="coerce")
    df["launch_angle"] = pd.to_numeric(df["launch_angle"], errors="coerce")
    df = df.dropna(subset=["hc_x", "launch_angle", "batter", "stand"])
    df["batter"] = df["batter"].astype(int)
    df_fly = df[df["launch_angle"] > 10].copy()

    def is_pull(row):
        if row["stand"] == "R":
            return row["hc_x"] > 170   # pull toward RF
        elif row["stand"] == "L":
            return row["hc_x"] < 80    # pull toward LF
        return False

    df["is_pull"]     = df.apply(is_pull, axis=1)
    df_fly["is_pull"] = df_fly.apply(is_pull, axis=1)

    spray_agg = (
        df.groupby("batter")["is_pull"]
        .agg(pull_overall="sum", total_overall="count")
        .reset_index()
    )
    fly_agg = (
        df_fly.groupby("batter")["is_pull"]
        .agg(pull_fly="sum", total_fly="count")
        .reset_index()
    )
    agg      = spray_agg.merge(fly_agg, on="batter", how="left")
    side_map = df.groupby("batter")["stand"].first().to_dict()

    agg["pull_rate_overall"] = (agg["pull_overall"] / agg["total_overall"]).round(4)
    agg["pull_rate_fly"]     = (agg["pull_fly"]     / agg["total_fly"]).round(4)

    out = []
    for _, row in agg.iterrows():
        bid = int(row["batter"])
        out.append({
            "player_id":          bid,
            "stand":              side_map.get(bid, "?"),
            "pull_rate_overall":  float(row["pull_rate_overall"]) if pd.notna(row["pull_rate_overall"]) else None,
            "pull_rate_fly":      float(row["pull_rate_fly"])     if pd.notna(row["pull_rate_fly"])     else None,
            "total_batted_balls": int(row["total_overall"]),
            "total_fly_balls":    int(row["total_fly"]) if pd.notna(row["total_fly"]) else 0,
        })

    return {"year": year, "fetched": TODAY, "date_range": date_range, "players": out}, date_range


def fetch_pitchers_ev(year: int) -> "tuple[dict | None, str]":
    """
    Pitcher EV allowed / barrel allowed from Savant statcast leaderboard.
    Includes `bf` (batters faced) so the JS backend can compute blend weights.
    """
    label      = f"pitchers-ev-{year}"
    is_prior   = (year < YEAR)
    date_high  = season_end(year) if is_prior else TODAY
    date_range = f"{season_start(year)} – {date_high}"

    # min=1 so early-season data is included; blend weighting handled by JS backend.
    url = (
        f"https://baseballsavant.mlb.com/leaderboard/statcast"
        f"?type=pitcher&year={year}&position=&team=&min=1&csv=true"
    )
    df = fetch_csv(url, label)
    if df is None or len(df) == 0:
        return None, date_range

    df.columns = [c.lower().strip() for c in df.columns]
    out = []
    for _, row in df.iterrows():
        rec = {
            "player_id":          _safe_int(row.get("player_id")),
            "player_name":        str(row.get("player_name", "")).strip(),
            "exit_velocity_avg":  _safe_float(row.get("exit_velocity_avg") or row.get("ev")),
            "launch_angle_avg":   _safe_float(row.get("launch_angle_avg")  or row.get("la")),
            "barrel_batted_rate": _safe_float(row.get("barrel_batted_rate") or row.get("barrel%")),
            "hard_hit_percent":   _safe_float(row.get("hard_hit_percent")  or row.get("hard_hit%")),
            # BF is used by the JS backend to compute blend weights
            "bf":                 _safe_int(row.get("pa") or row.get("attempts") or row.get("bf")),
        }
        if rec["player_id"]:
            out.append(rec)

    return {"year": year, "fetched": TODAY, "date_range": date_range, "pitchers": out}, date_range


def fetch_arsenal(year: int) -> "tuple[dict | None, str]":
    """
    Pitcher pitch-type usage / run-value from Savant arsenal leaderboard.
    One entry per pitcher with a list of pitches sorted by usage descending.
    """
    label      = f"arsenal-{year}"
    is_prior   = (year < YEAR)
    date_high  = season_end(year) if is_prior else TODAY
    date_range = f"{season_start(year)} – {date_high}"

    # min=1 so early-season data is included; blend weighting handled by JS backend.
    url = (
        f"https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats"
        f"?type=pitcher&pitchType=&year={year}&team=&min=1&csv=true"
    )
    df = fetch_csv(url, label)
    if df is None or len(df) == 0:
        return None, date_range

    df.columns = [c.lower().strip() for c in df.columns]
    pit_map: dict[int, dict] = {}

    for _, row in df.iterrows():
        pid = _safe_int(row.get("pitcher_id") or row.get("player_id"))
        if not pid:
            continue
        if pid not in pit_map:
            pit_map[pid] = {
                "player_id":   pid,
                "player_name": str(row.get("pitcher_name") or row.get("player_name", "")).strip(),
                "pitches":     [],
            }
        pitch = {
            "pitch_type":        str(row.get("pitch_type", "")).strip().upper(),
            "pitch_name":        str(row.get("pitch_name", "")).strip(),
            "pitch_usage":       _safe_float(row.get("pitch_usage") or row.get("pitch_percent") or row.get("usage%")),
            "avg_speed":         _safe_float(row.get("avg_speed")   or row.get("velocity")),
            "avg_spin":          _safe_float(row.get("avg_spin")    or row.get("spin_rate")),
            "run_value_per_100": _safe_float(row.get("run_value_per_100") or row.get("rv/100")),
            "whiff_percent":     _safe_float(row.get("whiff_percent") or row.get("whiff%")),
            "zone_percent":      _safe_float(row.get("zone_percent") or row.get("zone%")),
        }
        if pitch["pitch_type"]:
            pit_map[pid]["pitches"].append(pitch)

    for pid in pit_map:
        pit_map[pid]["pitches"].sort(key=lambda p: (p.get("pitch_usage") or 0), reverse=True)

    out = list(pit_map.values())
    return {"year": year, "fetched": TODAY, "date_range": date_range, "pitchers": out}, date_range


# ── Static park factor fallback ────────────────────────────────────────────────
# Used if pybaseball park_factors_by_handedness() fails.
# Values are HR index (100 = neutral). Source: FanGraphs 3-year regressed 2023–2025.
# Keyed by FanGraphs team abbreviation; venue name added for display.
_STATIC_PARK_FACTORS: list[dict] = [
    {"team": "COL", "venue": "Coors Field",               "hr_index_R": 117, "hr_index_L": 121, "hr_index_all": 119},
    {"team": "CIN", "venue": "Great American Ball Park",  "hr_index_R": 112, "hr_index_L": 110, "hr_index_all": 111},
    {"team": "PHI", "venue": "Citizens Bank Park",        "hr_index_R": 110, "hr_index_L": 109, "hr_index_all": 110},
    {"team": "MIL", "venue": "American Family Field",     "hr_index_R": 108, "hr_index_L": 107, "hr_index_all": 108},
    {"team": "BAL", "venue": "Oriole Park at Camden Yards","hr_index_R": 107, "hr_index_L": 106, "hr_index_all": 107},
    {"team": "HOU", "venue": "Minute Maid Park",          "hr_index_R": 106, "hr_index_L": 105, "hr_index_all": 106},
    {"team": "BOS", "venue": "Fenway Park",               "hr_index_R": 103, "hr_index_L": 109, "hr_index_all": 106},
    {"team": "ARI", "venue": "Chase Field",               "hr_index_R": 105, "hr_index_L": 104, "hr_index_all": 105},
    {"team": "NYY", "venue": "Yankee Stadium",            "hr_index_R": 104, "hr_index_L": 112, "hr_index_all": 108},
    {"team": "TEX", "venue": "Globe Life Field",          "hr_index_R": 104, "hr_index_L": 103, "hr_index_all": 104},
    {"team": "TOR", "venue": "Rogers Centre",             "hr_index_R": 103, "hr_index_L": 102, "hr_index_all": 103},
    {"team": "ATL", "venue": "Truist Park",               "hr_index_R": 102, "hr_index_L": 101, "hr_index_all": 102},
    {"team": "DET", "venue": "Comerica Park",             "hr_index_R":  95, "hr_index_L":  96, "hr_index_all":  96},
    {"team": "CLE", "venue": "Progressive Field",         "hr_index_R":  97, "hr_index_L":  98, "hr_index_all":  98},
    {"team": "MIN", "venue": "Target Field",              "hr_index_R":  98, "hr_index_L":  97, "hr_index_all":  98},
    {"team": "LAD", "venue": "Dodger Stadium",            "hr_index_R":  98, "hr_index_L":  97, "hr_index_all":  98},
    {"team": "CHW", "venue": "Rate Field",                "hr_index_R": 100, "hr_index_L":  99, "hr_index_all": 100},
    {"team": "CHC", "venue": "Wrigley Field",             "hr_index_R":  99, "hr_index_L": 101, "hr_index_all": 100},
    {"team": "LAA", "venue": "Angel Stadium",             "hr_index_R":  99, "hr_index_L":  98, "hr_index_all":  99},
    {"team": "MIA", "venue": "loanDepot park",            "hr_index_R":  95, "hr_index_L":  96, "hr_index_all":  96},
    {"team": "NYM", "venue": "Citi Field",                "hr_index_R":  96, "hr_index_L":  97, "hr_index_all":  97},
    {"team": "OAK", "venue": "Sutter Health Park",        "hr_index_R":  98, "hr_index_L":  97, "hr_index_all":  98},
    {"team": "PIT", "venue": "PNC Park",                  "hr_index_R":  97, "hr_index_L":  98, "hr_index_all":  98},
    {"team": "STL", "venue": "Busch Stadium",             "hr_index_R":  98, "hr_index_L":  97, "hr_index_all":  98},
    {"team": "SD",  "venue": "Petco Park",                "hr_index_R":  93, "hr_index_L":  94, "hr_index_all":  94},
    {"team": "SEA", "venue": "T-Mobile Park",             "hr_index_R":  94, "hr_index_L":  93, "hr_index_all":  94},
    {"team": "SF",  "venue": "Oracle Park",               "hr_index_R":  92, "hr_index_L":  91, "hr_index_all":  92},
    {"team": "TB",  "venue": "Tropicana Field",           "hr_index_R":  96, "hr_index_L":  95, "hr_index_all":  96},
    {"team": "WSH", "venue": "Nationals Park",            "hr_index_R":  99, "hr_index_L":  98, "hr_index_all":  99},
    {"team": "KC",  "venue": "Kauffman Stadium",          "hr_index_R":  96, "hr_index_L":  95, "hr_index_all":  96},
]


def fetch_park_factors(year: int) -> "tuple[dict | None, str]":
    """
    HR park factors by batter handedness via pybaseball.park_factors_by_handedness().

    FanGraphs uses a 3-to-5-year regressed methodology — more stable than
    single-season Savant data. The Savant CSV endpoint returns HTML for both
    2025 and 2026, so we use FanGraphs exclusively here.

    Since park factors don't meaningfully change year-to-year, the main loop
    uses the PRIOR-year fetch and writes identical data to both year keys.
    If pybaseball fails, falls back to _STATIC_PARK_FACTORS.

    Returns (payload, date_range) or (None, "").
    """
    from pybaseball import cache as pb_cache
    pb_cache.enable()

    # FanGraphs regresses over multiple years — use PRIOR as the canonical source.
    # The year arg here is the season to query; for current year early in season
    # there's no data, so callers should pass PRIOR.
    label      = f"park-factors-{year}"
    date_range = f"FanGraphs {year} regressed (3yr)"

    print(f"  ↓ [{label}] park_factors_by_handedness({year}) ...")
    try:
        from pybaseball import park_factors_by_handedness
        df = park_factors_by_handedness(year)
        print(f"  ✓ [{label}] {len(df)} rows, cols: {list(df.columns)[:10]}")

        if df is None or len(df) == 0:
            raise ValueError("empty dataframe")

        df.columns = [str(c).strip() for c in df.columns]

        # FanGraphs columns vary by pybaseball version. Common names:
        #   teamid / Team / team  — team abbreviation
        #   handedness / hand / Handedness — LHB / RHB
        #   HR / hr / HR_factor  — HR park factor index (100=neutral)
        team_col = next((c for c in df.columns if c.lower() in ("teamid", "team", "teamabbrev")), None)
        hand_col = next((c for c in df.columns if c.lower() in ("handedness", "hand", "split")), None)
        hr_col   = next((c for c in df.columns if c.lower() in ("hr", "hr_factor", "home_run")), None)
        venue_col = next((c for c in df.columns if "venue" in c.lower() or "park" in c.lower()), None)

        print(f"  ↓ [{label}] columns mapped: team={team_col} hand={hand_col} hr={hr_col} venue={venue_col}")

        if not team_col or not hr_col:
            raise ValueError(f"can't map required cols — available: {list(df.columns)}")

        park_map: dict[str, dict] = {}
        for _, row in df.iterrows():
            team  = str(row.get(team_col, "")).strip().upper()
            hand  = str(row.get(hand_col, "")).strip().upper() if hand_col else "ALL"
            hr_val = _safe_float(row.get(hr_col))
            venue  = str(row.get(venue_col, "")).strip() if venue_col else ""

            if not team:
                continue
            if team not in park_map:
                park_map[team] = {"team_abbr": team, "venue": venue or team}

            # Normalise handedness labels → R / L / all
            if hand in ("RHB", "R", "RIGHT"):
                park_map[team]["hr_index_R"] = hr_val
            elif hand in ("LHB", "L", "LEFT"):
                park_map[team]["hr_index_L"] = hr_val
            else:
                park_map[team]["hr_index_all"] = hr_val

        out = list(park_map.values())
        if len(out) < 15:
            raise ValueError(f"only {len(out)} teams parsed — likely column mapping issue")

        return {"year": year, "fetched": TODAY, "date_range": date_range, "venues": out}, date_range

    except Exception as e:
        print(f"  ⚠ [{label}] park_factors_by_handedness failed: {e} — using static fallback")
        out = [dict(row) for row in _STATIC_PARK_FACTORS]
        dr  = f"static fallback (FanGraphs 3yr regressed 2023–2025)"
        return {"year": year, "fetched": TODAY, "date_range": dr,
                "source": "static_fallback", "venues": out}, dr


def fetch_fangraphs(year: int) -> "tuple[dict | None, str]":
    """
    FanGraphs xFIP / HR-FB / GB% / FB% via pybaseball.pitching_stats().

    Strategy:
      1. Try pitching_stats(year) — works once IP has accumulated.
      2. If that returns <5 rows (e.g. season just started), explicitly
         fall back to pitching_stats(PRIOR) — NOT pitching_stats_range(),
         which has a known 'list index out of range' crash on empty results.
    Includes `bf` (total batters faced) for blend weighting by JS backend.
    """
    from pybaseball import pitching_stats
    from pybaseball import cache as pb_cache
    pb_cache.enable()

    is_prior   = (year < YEAR)
    date_low   = season_start(year)
    date_high  = season_end(year) if is_prior else TODAY
    date_range = f"{date_low} – {date_high}"
    label      = f"fangraphs-{year}"

    col_map = {
        "Name":    "player_name",
        "IDfg":    "fg_id",
        "xFIP":    "xfip",
        "HR/FB":   "hr_fb_rate",
        "GB%":     "gb_pct",
        "FB%":     "fb_pct",
        "FIP":     "fip",
        "ERA":     "era",
        "IP":      "ip",
        "TBF":     "bf",      # total batters faced — used for JS blend weighting
        "Zone%":   "zone_pct",  # pitcher Zone% — feature [10] in v2 schema
    }

    def _rows_from_df(fg: pd.DataFrame, dr: str) -> "dict | None":
        if fg is None or len(fg) < 5:
            return None
        fg.columns = [str(c).strip() for c in fg.columns]
        out = []
        for _, row in fg.iterrows():
            rec: dict = {}
            for src, dst in col_map.items():
                if src in fg.columns:
                    val = row[src]
                    if dst == "player_name":
                        rec[dst] = str(val).strip()
                    elif dst in ("fg_id", "bf"):
                        rec[dst] = _safe_int(val)
                    else:
                        rec[dst] = _safe_float(val)
            if rec.get("player_name"):
                out.append(rec)
        if not out:
            return None
        return {"year": year, "fetched": TODAY, "date_range": dr, "pitchers": out}

    # ── Attempt 1: requested season ────────────────────────────────────────────
    print(f"  ↓ [{label}] pitching_stats({year}) ...")
    try:
        fg = pitching_stats(year, year, qual=10)
        print(f"  ✓ [{label}] {len(fg)} rows")
        payload = _rows_from_df(fg, date_range)
        if payload:
            return payload, date_range
        print(f"  ⚠ [{label}] <5 usable rows — trying prior season fallback")
    except Exception as e:
        print(f"  ⚠ [{label}] pitching_stats({year}) failed: {e}")

    # ── Attempt 2: explicit prior season via pitching_stats() ─────────────────
    # NOTE: pitching_stats_range() has a known crash ('list index out of range')
    # when the date range returns no data. Use pitching_stats(PRIOR) instead —
    # it is stable and always has a full season of data.
    if not is_prior:
        print(f"  ↓ [{label}] pitching_stats({PRIOR}) [prior season fallback] ...")
        fb_dr = f"{season_start(PRIOR)} – {season_end(PRIOR)} (prior season fallback)"
        try:
            fg2 = pitching_stats(PRIOR, PRIOR, qual=10)
            print(f"  ✓ [{label}] {len(fg2)} rows from prior season")
            payload = _rows_from_df(fg2, fb_dr)
            if payload:
                return payload, fb_dr
            print(f"  ⚠ [{label}] prior season also returned <5 usable rows")
        except Exception as e:
            print(f"  ⚠ [{label}] pitching_stats({PRIOR}) failed: {e}")

    return None, date_range


# ══════════════════════════════════════════════════════════════════════════════
# MAIN LOOP — run all 6 fetchers for each year in [PRIOR, YEAR]
# Prior year is fetched first so the park-factors reuse logic can read it.
# ══════════════════════════════════════════════════════════════════════════════

DATASETS: list[tuple] = [
    # (label,              fetcher_fn,         blob_key_template)
    ("batters-ev",         fetch_batters_ev,   "statcast/batters-{year}.json"),
    ("spray",              fetch_spray,        "statcast/spray-{year}.json"),
    ("pitchers-ev",        fetch_pitchers_ev,  "statcast/pitchers-ev-{year}.json"),
    ("arsenal",            fetch_arsenal,      "statcast/arsenal-{year}.json"),
    ("park-factors",       fetch_park_factors, "statcast/park-factors-{year}.json"),
    ("fangraphs-pitching", fetch_fangraphs,    "statcast/fangraphs-pitching-{year}.json"),
]

# ── Park factors: fetch once from PRIOR, write to both year keys ───────────────
# FanGraphs park factors are regressed over 3–5 years; there is no meaningful
# difference between the 2025 and 2026 values for an established park.
# The Savant CSV endpoint returns HTML for all years, so we use pybaseball only.
print(f"\n{'═'*64}")
print(f"  PARK FACTORS (fetched from {PRIOR}, written to both {PRIOR} and {YEAR})")
print(f"{'═'*64}")

_park_payload: "dict | None" = None
_park_dr: str = ""
try:
    _park_payload, _park_dr = fetch_park_factors(PRIOR)
except Exception as e:
    print(f"  ⚠ park_factors fetch raised unexpectedly: {e} — using static fallback directly")
    dr  = "static fallback (FanGraphs 3yr regressed 2023–2025)"
    _park_payload = {"year": PRIOR, "fetched": TODAY, "date_range": dr,
                     "source": "static_fallback", "venues": [dict(r) for r in _STATIC_PARK_FACTORS]}
    _park_dr = dr

if _park_payload is None:
    # Should never reach here — fetch_park_factors() always returns the static table
    print("  ⚠ park_factors returned None even with static fallback — this is a bug")

for year in years_to_fetch:
    if _park_payload is not None:
        # Stamp each year's blob with the correct year key but same data
        stamped = dict(_park_payload)
        stamped["year"]    = year
        stamped["fetched"] = TODAY
        if year == YEAR and year != PRIOR:
            stamped["date_range"] = f"{_park_dr} (applied to {year})"
            stamped["source"]     = f"fetched_from_{PRIOR}"
        blob_key = f"statcast/park-factors-{year}.json"
        ok = upload_blob(blob_key, stamped, f"park-factors-{year}")
        n  = len(stamped.get("venues", []))
        record(year, "park-factors", ok, n, date_range=stamped["date_range"])
    else:
        record(year, "park-factors", False, 0, note="fetch failed")

for year in years_to_fetch:
    yr_label = "PRIOR" if year < YEAR else "CURRENT"
    print(f"\n{'═'*64}")
    print(f"  YEAR {year}  ({yr_label})")
    print(f"{'═'*64}")

    for ds_label, fetcher, key_tmpl in DATASETS:
        # Park factors are handled above (fetched once, written to both years)
        if ds_label == "park-factors":
            continue

        print(f"\n{'─'*60}")
        print(f"  [{year}] {ds_label.upper()}")
        print(f"{'─'*60}")

        # Guard pybaseball import for fangraphs
        if ds_label == "fangraphs-pitching":
            try:
                import pybaseball  # noqa: F401
            except ImportError:
                record(year, ds_label, False, 0, note="pybaseball not installed")
                continue

        try:
            payload, date_range = fetcher(year)
        except Exception as e:
            record(year, ds_label, False, 0, note=str(e))
            continue

        if payload is None:
            record(year, ds_label, False, 0, note="empty response")
            continue

        blob_key = key_tmpl.format(year=year)
        ok = upload_blob(blob_key, payload, ds_label)

        n = (
            len(payload.get("players",  []))
            or len(payload.get("pitchers", []))
            or len(payload.get("venues",  []))
        )
        record(year, ds_label, ok, n, date_range=date_range)


# ══════════════════════════════════════════════════════════════════════════════
# META.JSON
# Written once, covers all years. The JS frontend reads this to determine
# which blend weights to apply and to show data-freshness indicators.
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{'═'*64}")
print("  Writing statcast/meta.json")
print(f"{'═'*64}")

meta = {
    "current_year":   YEAR,
    "prior_year":     PRIOR,
    "run_at":         datetime.now(timezone.utc).isoformat(),
    "dry_run":        DRY_RUN,
    "years_fetched":  years_to_fetch,
    # Per-year, per-dataset status. date_range lets the frontend show
    # "Using Sep–Oct 2025 data" rather than just "Using 2025 data".
    "datasets": {str(y): results[y] for y in years_to_fetch},
    "all_ok": all(
        v["ok"]
        for y in years_to_fetch
        for v in results[y].values()
    ),
}
upload_blob("statcast/meta.json", meta, "meta")


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{'═'*64}")
print("  SUMMARY")
print(f"{'═'*64}")

total  = sum(len(results[y]) for y in years_to_fetch)
passed = sum(1 for y in years_to_fetch for v in results[y].values() if v["ok"])
failed = total - passed
print(f"  Datasets: {passed}/{total} succeeded, {failed} failed")

for year in years_to_fetch:
    yr_label = "PRIOR" if year < YEAR else "CURRENT"
    print(f"\n  [{year}] {yr_label}")
    for ds, r in results[year].items():
        icon = "✅" if r["ok"] else "❌"
        dr   = f"  [{r['date_range']}]" if r.get("date_range") else ""
        note = f" ({r['note']})"        if r.get("note")       else ""
        print(f"    {icon} {ds}: {r['rows']} rows{dr}{note}")

if failed > 0:
    print(f"\n⚠️  {failed} dataset(s) failed — "
          f"JS backend will degrade gracefully for missing multipliers")
else:
    print("\n🎉 All datasets fetched successfully!")

sys.exit(0)
