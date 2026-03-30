#!/usr/bin/env python3
"""
MLB V3 — Statcast Daily Data Pipeline
======================================
Fetches 6 datasets from Baseball Savant + FanGraphs and uploads to Netlify Blobs.

Datasets written to store: rrmodelblobs
  statcast/batters-{YEAR}.json          batter EV / barrel / hard-hit
  statcast/spray-{YEAR}.json            batter pull-rate by fly-ball / overall
  statcast/pitchers-ev-{YEAR}.json      pitcher EV allowed / barrel allowed
  statcast/arsenal-{YEAR}.json          pitcher pitch-type usage / run-value
  statcast/park-factors-{YEAR}.json     venue HR index by batter side
  statcast/fangraphs-pitching-{YEAR}.json  xFIP / HR-FB / GB% / FB%
  statcast/meta.json                    run timestamp + per-dataset status

Run:
  python scripts/mlb_v3/fetch_statcast.py [--year YYYY] [--dry-run]

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


# ── Utility functions ──────────────────────────────────────
# Defined early so they're available throughout the module.

def _safe_float(val) -> "float | None":
    """Convert to float, return None on failure or NaN."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if (f != f) else round(f, 6)  # NaN check via self-equality
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


# ── Arg parsing ────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Fetch Statcast data for MLB V3")
parser.add_argument("--year", type=int, default=datetime.now().year, help="Season year")
parser.add_argument("--dry-run", action="store_true", help="Fetch and print row counts, skip Blobs upload")
args = parser.parse_args()

YEAR = args.year
DRY_RUN = args.dry_run
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")

print(f"{'[DRY-RUN] ' if DRY_RUN else ''}MLB V3 Statcast Pipeline — year={YEAR}, date={TODAY}")

# ── Netlify Blobs credentials ──────────────────────────────
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
STORE_NAME = os.environ.get("BLOBS_STORE", "rrmodelblobs")

if not DRY_RUN and (not SITE_ID or not TOKEN):
    print("❌  Missing NETLIFY_SITE_ID and/or NETLIFY_AUTH_TOKEN", file=sys.stderr)
    sys.exit(1)

BLOBS_BASE = f"https://api.netlify.com/api/v1/blobs/{SITE_ID}/{STORE_NAME}"
BLOBS_HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

REQUEST_TIMEOUT = 60   # seconds per HTTP request
MAX_RETRIES = 3
RETRY_DELAY = 5        # seconds between retries

# ── Helpers ────────────────────────────────────────────────

def fetch_csv(url: str, label: str, timeout: int = REQUEST_TIMEOUT) -> pd.DataFrame | None:
    """Fetch a CSV URL with retries. Returns DataFrame or None on failure."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"  ↓ [{label}] attempt {attempt}: {url[:90]}{'…' if len(url)>90 else ''}")
            r = requests.get(url, timeout=timeout, headers={"User-Agent": "mlb-v3-pipeline/1.0"})
            r.raise_for_status()
            df = pd.read_csv(io.StringIO(r.text))
            print(f"  ✓ [{label}] {len(df)} rows, {len(df.columns)} cols")
            return df
        except Exception as e:
            print(f"  ⚠ [{label}] attempt {attempt} failed: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)
    print(f"  ✗ [{label}] all {MAX_RETRIES} attempts failed — skipping")
    return None


def upload_blob(key: str, data: dict | list, label: str) -> bool:
    """Upload a JSON payload to Netlify Blobs. Returns True on success."""
    if DRY_RUN:
        rows = len(data) if isinstance(data, list) else len(data.get("players", data.get("pitchers", data.get("venues", []))))
        print(f"  [dry-run] would upload {key!r} ({rows} records)")
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


def season_start(year: int) -> str:
    """Approximate MLB Opening Day (late March)."""
    return f"{year}-03-20"


# ── Status tracker ─────────────────────────────────────────
results: dict[str, dict] = {}


def record(label: str, ok: bool, rows: int = 0, note: str = ""):
    results[label] = {"ok": ok, "rows": rows, "note": note}
    status = "✅" if ok else "❌"
    print(f"{status} {label}: {rows} rows" + (f" ({note})" if note else ""))


# ══════════════════════════════════════════════════════════════
# DATASET 1: Batter EV / Barrel / Hard-Hit
# ══════════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print("DATASET 1: Batter EV / Barrel / Hard-Hit")
print(f"{'='*60}")

BATTER_URL = (
    f"https://baseballsavant.mlb.com/leaderboard/statcast"
    f"?type=batter&year={YEAR}&position=&team=&min=25&csv=true"
)

BATTER_COLS_WANTED = {
    "player_id": "player_id",
    "player_name": "player_name",
    "exit_velocity_avg": "exit_velocity_avg",
    "launch_angle_avg": "launch_angle_avg",
    "barrel_batted_rate": "barrel_batted_rate",
    "hard_hit_percent": "hard_hit_percent",
    "brl_pa": "brl_pa",
    # fallbacks — Savant sometimes renames columns
    "barrel%": "barrel_batted_rate",
    "ev": "exit_velocity_avg",
    "la": "launch_angle_avg",
    "hard_hit%": "hard_hit_percent",
}

try:
    df_bat = fetch_csv(BATTER_URL, "batters-ev")
    if df_bat is not None and len(df_bat) > 0:
        # Normalize columns — lowercase, strip whitespace
        df_bat.columns = [c.lower().strip() for c in df_bat.columns]

        # Build output with graceful missing-column handling
        out_batters = []
        for _, row in df_bat.iterrows():
            rec = {}
            rec["player_id"] = _safe_int(row.get("player_id"))
            rec["player_name"] = str(row.get("player_name", "")).strip()
            rec["exit_velocity_avg"] = _safe_float(row.get("exit_velocity_avg") or row.get("ev"))
            rec["launch_angle_avg"] = _safe_float(row.get("launch_angle_avg") or row.get("la"))
            # barrel_batted_rate may be expressed as 0–100 or 0–1; normalize to 0–100
            brl_raw = row.get("barrel_batted_rate") or row.get("barrel%") or row.get("brl_percent")
            brl_val = _safe_float(brl_raw)
            rec["barrel_batted_rate"] = brl_val  # keep as-is; we'll normalize in the multiplier
            rec["hard_hit_percent"] = _safe_float(row.get("hard_hit_percent") or row.get("hard_hit%"))
            rec["brl_pa"] = _safe_float(row.get("brl_pa") or row.get("barrels_per_pa_percent"))
            if rec["player_id"]:
                out_batters.append(rec)

        payload = {"year": YEAR, "fetched": TODAY, "players": out_batters}
        ok = upload_blob(f"statcast/batters-{YEAR}.json", payload, "batters-ev")
        record("batters-ev", ok, len(out_batters))
    else:
        record("batters-ev", False, 0, "empty response")
except Exception as e:
    record("batters-ev", False, 0, str(e))


# ══════════════════════════════════════════════════════════════
# DATASET 2: Batter Pull Rate / Spray Direction
# ══════════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print("DATASET 2: Batter Pull Rate / Spray Direction")
print(f"{'='*60}")

SPRAY_URL = (
    f"https://baseballsavant.mlb.com/statcast_search/csv"
    f"?all=true&hfGT=R%7C&hfSea={YEAR}%7C"
    f"&player_type=batter"
    f"&game_date_gt={season_start(YEAR)}&game_date_lt={TODAY}"
    f"&hfAB=home_run%7Csingle%7Cdouble%7Ctriple%7Cfield_out%7C"
    f"&type=details"
    f"&hfFlag=is_pull%7Cis_opposite%7C"   # request pull/oppo flags
)

# Fallback simpler URL if the above 403s (Savant can be picky with flags)
SPRAY_URL_SIMPLE = (
    f"https://baseballsavant.mlb.com/statcast_search/csv"
    f"?all=true&hfGT=R%7C&hfSea={YEAR}%7C"
    f"&player_type=batter"
    f"&game_date_gt={season_start(YEAR)}&game_date_lt={TODAY}"
    f"&hfAB=home_run%7Csingle%7Cdouble%7Ctriple%7Cfield_out%7C"
    f"&type=details"
)

try:
    df_spray = fetch_csv(SPRAY_URL, "spray-batted-balls")
    if df_spray is None or len(df_spray) == 0:
        print("  ↻ Trying simpler spray URL...")
        df_spray = fetch_csv(SPRAY_URL_SIMPLE, "spray-batted-balls-simple", timeout=90)

    if df_spray is not None and len(df_spray) > 0:
        df_spray.columns = [c.lower().strip() for c in df_spray.columns]

        # Columns we need: batter (MLBAM id), stand (bat side), hc_x, launch_angle
        # hc_x: 0=LF line, ~125=CF, ~250=RF line (from batter perspective)
        # Pull for RHH = hc_x > 170 (toward 1B/RF side); Pull for LHH = hc_x < 80 (toward 3B/LF side)

        needed = {"batter", "stand", "hc_x", "launch_angle"}
        available = set(df_spray.columns)
        if not needed.issubset(available):
            missing = needed - available
            print(f"  ⚠ Spray CSV missing columns: {missing} — skipping pull rate computation")
            record("spray", False, 0, f"missing cols: {missing}")
        else:
            # Filter to batted balls only (exclude pitches not in play)
            df_spray["hc_x"] = pd.to_numeric(df_spray["hc_x"], errors="coerce")
            df_spray["launch_angle"] = pd.to_numeric(df_spray["launch_angle"], errors="coerce")
            df_spray = df_spray.dropna(subset=["hc_x", "launch_angle", "batter", "stand"])
            df_spray["batter"] = df_spray["batter"].astype(int)

            # Fly balls: launch_angle > 10
            df_fly = df_spray[df_spray["launch_angle"] > 10].copy()

            # Pull determination by batter side
            # RHH (stand=R): pull = hc_x > 170  (toward RF)
            # LHH (stand=L): pull = hc_x < 80   (toward LF)
            def is_pull(row):
                if row["stand"] == "R":
                    return row["hc_x"] > 170
                elif row["stand"] == "L":
                    return row["hc_x"] < 80
                return False

            df_spray["is_pull"] = df_spray.apply(is_pull, axis=1)
            df_fly["is_pull"] = df_fly.apply(is_pull, axis=1)

            # Aggregate per batter
            spray_agg = (
                df_spray.groupby("batter")["is_pull"]
                .agg(pull_overall="sum", total_overall="count")
                .reset_index()
            )
            fly_agg = (
                df_fly.groupby("batter")["is_pull"]
                .agg(pull_fly="sum", total_fly="count")
                .reset_index()
            )
            agg = spray_agg.merge(fly_agg, on="batter", how="left")
            agg["pull_rate_overall"] = (agg["pull_overall"] / agg["total_overall"]).round(4)
            agg["pull_rate_fly"] = (agg["pull_fly"] / agg["total_fly"]).round(4)

            # Also capture bat side
            side_map = df_spray.groupby("batter")["stand"].first().to_dict()

            out_spray = []
            for _, row in agg.iterrows():
                bid = int(row["batter"])
                out_spray.append({
                    "player_id": bid,
                    "stand": side_map.get(bid, "?"),
                    "pull_rate_overall": float(row["pull_rate_overall"]) if pd.notna(row["pull_rate_overall"]) else None,
                    "pull_rate_fly": float(row["pull_rate_fly"]) if pd.notna(row["pull_rate_fly"]) else None,
                    "total_batted_balls": int(row["total_overall"]),
                    "total_fly_balls": int(row["total_fly"]) if pd.notna(row["total_fly"]) else 0,
                })

            payload = {"year": YEAR, "fetched": TODAY, "players": out_spray}
            ok = upload_blob(f"statcast/spray-{YEAR}.json", payload, "spray")
            record("spray", ok, len(out_spray))
    else:
        record("spray", False, 0, "empty response")
except Exception as e:
    record("spray", False, 0, str(e))


# ══════════════════════════════════════════════════════════════
# DATASET 3: Pitcher EV Allowed / Barrel Allowed
# ══════════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print("DATASET 3: Pitcher EV Allowed / Barrel Allowed")
print(f"{'='*60}")

PITCHER_EV_URL = (
    f"https://baseballsavant.mlb.com/leaderboard/statcast"
    f"?type=pitcher&year={YEAR}&position=&team=&min=25&csv=true"
)

try:
    df_pit_ev = fetch_csv(PITCHER_EV_URL, "pitchers-ev")
    if df_pit_ev is not None and len(df_pit_ev) > 0:
        df_pit_ev.columns = [c.lower().strip() for c in df_pit_ev.columns]

        out_pit_ev = []
        for _, row in df_pit_ev.iterrows():
            rec = {
                "player_id": _safe_int(row.get("player_id")),
                "player_name": str(row.get("player_name", "")).strip(),
                "exit_velocity_avg": _safe_float(row.get("exit_velocity_avg") or row.get("ev")),
                "launch_angle_avg": _safe_float(row.get("launch_angle_avg") or row.get("la")),
                "barrel_batted_rate": _safe_float(row.get("barrel_batted_rate") or row.get("barrel%")),
                "hard_hit_percent": _safe_float(row.get("hard_hit_percent") or row.get("hard_hit%")),
            }
            if rec["player_id"]:
                out_pit_ev.append(rec)

        payload = {"year": YEAR, "fetched": TODAY, "pitchers": out_pit_ev}
        ok = upload_blob(f"statcast/pitchers-ev-{YEAR}.json", payload, "pitchers-ev")
        record("pitchers-ev", ok, len(out_pit_ev))
    else:
        record("pitchers-ev", False, 0, "empty response")
except Exception as e:
    record("pitchers-ev", False, 0, str(e))


# ══════════════════════════════════════════════════════════════
# DATASET 4: Pitcher Arsenal (pitch type / usage / run-value)
# ══════════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print("DATASET 4: Pitcher Arsenal")
print(f"{'='*60}")

ARSENAL_URL = (
    f"https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats"
    f"?type=pitcher&pitchType=&year={YEAR}&team=&min=25&csv=true"
)

try:
    df_ars = fetch_csv(ARSENAL_URL, "arsenal")
    if df_ars is not None and len(df_ars) > 0:
        df_ars.columns = [c.lower().strip() for c in df_ars.columns]

        # The arsenal CSV has one row per pitcher×pitch_type
        # We'll group into a dict: pitcher_id -> [{ pitch_type, usage, ... }, ...]
        pit_map: dict[int, dict] = {}

        for _, row in df_ars.iterrows():
            pid = _safe_int(row.get("pitcher_id") or row.get("player_id"))
            if not pid:
                continue
            if pid not in pit_map:
                pit_map[pid] = {
                    "player_id": pid,
                    "player_name": str(row.get("pitcher_name") or row.get("player_name", "")).strip(),
                    "pitches": [],
                }
            pitch_rec = {
                "pitch_type": str(row.get("pitch_type", "")).strip().upper(),
                "pitch_name": str(row.get("pitch_name", "")).strip(),
                "pitch_usage": _safe_float(row.get("pitch_usage") or row.get("pitch_percent") or row.get("usage%")),
                "avg_speed": _safe_float(row.get("avg_speed") or row.get("velocity")),
                "avg_spin": _safe_float(row.get("avg_spin") or row.get("spin_rate")),
                "run_value_per_100": _safe_float(row.get("run_value_per_100") or row.get("rv/100")),
                "whiff_percent": _safe_float(row.get("whiff_percent") or row.get("whiff%")),
            }
            if pitch_rec["pitch_type"]:
                pit_map[pid]["pitches"].append(pitch_rec)

        # Sort each pitcher's pitches by usage desc (primary pitches first)
        for pid in pit_map:
            pit_map[pid]["pitches"].sort(
                key=lambda p: (p.get("pitch_usage") or 0), reverse=True
            )

        out_arsenal = list(pit_map.values())
        payload = {"year": YEAR, "fetched": TODAY, "pitchers": out_arsenal}
        ok = upload_blob(f"statcast/arsenal-{YEAR}.json", payload, "arsenal")
        record("arsenal", ok, len(out_arsenal))
    else:
        record("arsenal", False, 0, "empty response")
except Exception as e:
    record("arsenal", False, 0, str(e))


# ══════════════════════════════════════════════════════════════
# DATASET 5: Park Factors (venue HR index by batter side)
# ══════════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print("DATASET 5: Park Factors (HR index by batter side)")
print(f"{'='*60}")

PARK_URLS = {
    "all": f"https://baseballsavant.mlb.com/leaderboard/statcast-park-factors?type=venue&year={YEAR}&batSide=&stat=index_HR&condition=z&rolling=no&csv=true",
    "R": f"https://baseballsavant.mlb.com/leaderboard/statcast-park-factors?type=venue&year={YEAR}&batSide=R&stat=index_HR&condition=z&rolling=no&csv=true",
    "L": f"https://baseballsavant.mlb.com/leaderboard/statcast-park-factors?type=venue&year={YEAR}&batSide=L&stat=index_HR&condition=z&rolling=no&csv=true",
}

try:
    park_data: dict[str, dict] = {}  # venue_name -> { hr_index_all, hr_index_R, hr_index_L, team_abbr }

    for side, url in PARK_URLS.items():
        df_pk = fetch_csv(url, f"park-factors-{side}")
        if df_pk is None or len(df_pk) == 0:
            print(f"  ⚠ Park factors ({side}) fetch failed — skipping side")
            continue
        df_pk.columns = [c.lower().strip() for c in df_pk.columns]

        # Column names vary: 'venue', 'venue_name', 'team_home', 'park', 'name'
        venue_col = next(
            (c for c in df_pk.columns if "venue" in c or "park" in c or c == "name"), None
        )
        # HR index: 'index_hr', 'hr_index', 'hr', '1.0'
        idx_col = next(
            (c for c in df_pk.columns if "index_hr" in c or "hr_index" in c or c == "hr"), None
        )
        team_col = next(
            (c for c in df_pk.columns if "team" in c), None
        )

        if not venue_col or not idx_col:
            print(f"  ⚠ Park CSV ({side}) — can't find venue/index cols. Available: {list(df_pk.columns)[:10]}")
            continue

        for _, row in df_pk.iterrows():
            venue = str(row.get(venue_col, "")).strip()
            if not venue:
                continue
            idx_val = _safe_float(row.get(idx_col))
            if venue not in park_data:
                park_data[venue] = {
                    "venue": venue,
                    "team_abbr": str(row.get(team_col, "")).strip() if team_col else None,
                }
            key = f"hr_index_{side}"
            park_data[venue][key] = idx_val

    out_parks = list(park_data.values())
    payload = {"year": YEAR, "fetched": TODAY, "venues": out_parks}
    ok = upload_blob(f"statcast/park-factors-{YEAR}.json", payload, "park-factors")
    record("park-factors", ok, len(out_parks))
except Exception as e:
    record("park-factors", False, 0, str(e))


# ══════════════════════════════════════════════════════════════
# DATASET 6: FanGraphs xFIP / HR-FB (via pybaseball)
# ══════════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print("DATASET 6: FanGraphs xFIP / HR-FB (pybaseball)")
print(f"{'='*60}")

try:
    from pybaseball import pitching_stats
    from pybaseball import cache as pb_cache
    pb_cache.enable()

    print(f"  ↓ [fangraphs-pitching] fetching {YEAR} season...")
    fg = pitching_stats(YEAR, YEAR, qual=10)
    fg.columns = [str(c).strip() for c in fg.columns]
    print(f"  ✓ [fangraphs-pitching] {len(fg)} rows")

    # Map columns — FanGraphs API column names vary by pybaseball version
    col_map = {
        "Name": "player_name",
        "IDfg": "fg_id",
        "xFIP": "xfip",
        "HR/FB": "hr_fb_rate",
        "GB%": "gb_pct",
        "FB%": "fb_pct",
        "FIP": "fip",
        "ERA": "era",
        "IP": "ip",
    }

    out_fg = []
    for _, row in fg.iterrows():
        rec: dict = {}
        for src, dst in col_map.items():
            if src in fg.columns:
                val = row[src]
                if dst in ("player_name",):
                    rec[dst] = str(val).strip()
                elif dst == "fg_id":
                    rec[dst] = _safe_int(val)
                else:
                    rec[dst] = _safe_float(val)
        if rec.get("player_name"):
            out_fg.append(rec)

    payload = {"year": YEAR, "fetched": TODAY, "pitchers": out_fg}
    ok = upload_blob(f"statcast/fangraphs-pitching-{YEAR}.json", payload, "fangraphs-pitching")
    record("fangraphs-pitching", ok, len(out_fg))

except ImportError:
    record("fangraphs-pitching", False, 0, "pybaseball not installed")
except Exception as e:
    record("fangraphs-pitching", False, 0, str(e))


# ══════════════════════════════════════════════════════════════
# WRITE meta.json
# ══════════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print("Writing statcast/meta.json")
print(f"{'='*60}")

meta = {
    "year": YEAR,
    "run_at": datetime.now(timezone.utc).isoformat(),
    "dry_run": DRY_RUN,
    "datasets": results,
    "all_ok": all(v["ok"] for v in results.values()),
}
upload_blob("statcast/meta.json", meta, "meta")

# ── Final summary ──────────────────────────────────────────
print(f"\n{'='*60}")
print("SUMMARY")
print(f"{'='*60}")
total = len(results)
passed = sum(1 for v in results.values() if v["ok"])
failed = total - passed
print(f"  Datasets: {passed}/{total} succeeded, {failed} failed")
for name, r in results.items():
    icon = "✅" if r["ok"] else "❌"
    note = f" — {r['note']}" if r["note"] else ""
    print(f"  {icon} {name}: {r['rows']} rows{note}")

if failed > 0:
    print(f"\n⚠️  {failed} dataset(s) failed — V3 will fall back to V2 formula for those multipliers")
    # Don't exit(1) — partial data is still useful; meta.json records which fetches failed
else:
    print("\n🎉 All datasets fetched successfully!")

sys.exit(0)
