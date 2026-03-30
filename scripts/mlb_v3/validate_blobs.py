"""
validate_blobs.py — Phase 2 validation gate (dual-year)

Reads every Statcast blob key from rrmodelblobs for BOTH current and
prior year, printing row counts and date_range labels.

Usage:
    NETLIFY_AUTH_TOKEN=... NETLIFY_SITE_ID=... python scripts/mlb_v3/validate_blobs.py [--year YYYY]
"""

import argparse
import datetime
import json
import os
import sys

import requests

# ── Config ─────────────────────────────────────────────────────────────────────
STORE_NAME      = "rrmodelblobs"
SITE_ID_FALLBACK = "967be648-eddc-4cc5-a7cc-e2ab7db8ac75"
TOKEN_FALLBACK   = "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263"

SITE_ID = os.environ.get("NETLIFY_SITE_ID") or SITE_ID_FALLBACK
TOKEN   = os.environ.get("NETLIFY_AUTH_TOKEN") or TOKEN_FALLBACK

# ── CLI ─────────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--year", type=int, default=datetime.datetime.now().year,
                    help="Current season year (prior year = year-1)")
args   = parser.parse_args()
YEAR  = args.year
PRIOR = YEAR - 1

BASE_URL = f"https://api.netlify.com/api/v1/blobs/{SITE_ID}/{STORE_NAME}"
HEADERS  = {"Authorization": f"Bearer {TOKEN}"}

DS_KEYS = [
    "batters-{year}.json",
    "spray-{year}.json",
    "pitchers-ev-{year}.json",
    "arsenal-{year}.json",
    "park-factors-{year}.json",
    "fangraphs-pitching-{year}.json",
]

# ── Fetch + report ──────────────────────────────────────────────────────────────
print(f"\n{'='*68}")
print(f"  Statcast Blob Validation — current={YEAR}, prior={PRIOR}")
print(f"  Store: {STORE_NAME}  Site: {SITE_ID[:8]}...")
print(f"{'='*68}\n")

all_ok = True


def check_blob(key: str) -> bool:
    url = f"{BASE_URL}/{key}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        if r.status_code == 404:
            print(f"  ❌  {key:<52}  NOT FOUND (404)")
            return False
        if r.status_code != 200:
            print(f"  ❌  {key:<52}  HTTP {r.status_code}")
            return False

        data = r.json()

        # Extract date_range for display
        dr = data.get("date_range", "")
        dr_str = f"  [{dr}]" if dr else ""

        if isinstance(data, dict) and "players" in data:
            n = len(data["players"])
            print(f"  ✅  {key:<52}  {n:>6} players{dr_str}")
        elif isinstance(data, dict) and "pitchers" in data:
            pitchers = data["pitchers"]
            # arsenal is list-of-dicts with nested pitches
            if pitchers and isinstance(pitchers[0], dict) and "pitches" in pitchers[0]:
                total_pitches = sum(len(p.get("pitches", [])) for p in pitchers)
                print(f"  ✅  {key:<52}  {len(pitchers):>6} pitchers  ({total_pitches} pitch entries){dr_str}")
            else:
                print(f"  ✅  {key:<52}  {len(pitchers):>6} pitchers{dr_str}")
        elif isinstance(data, dict) and "venues" in data:
            n = len(data["venues"])
            src = f"  source={data['source']}" if data.get("source") else ""
            print(f"  ✅  {key:<52}  {n:>6} venues{dr_str}{src}")
        else:
            print(f"  ⚠️  {key:<52}  unexpected structure: {list(data.keys())[:6]}")
        return True

    except requests.exceptions.Timeout:
        print(f"  ❌  {key:<52}  TIMEOUT")
        return False
    except json.JSONDecodeError:
        print(f"  ❌  {key:<52}  INVALID JSON")
        return False
    except Exception as exc:
        print(f"  ❌  {key:<52}  ERROR: {exc}")
        return False


for year in [PRIOR, YEAR]:
    yr_label = "PRIOR" if year < YEAR else "CURRENT"
    print(f"  ── {year} ({yr_label}) {'─'*46}")
    for tmpl in DS_KEYS:
        key = f"statcast/{tmpl.format(year=year)}"
        ok  = check_blob(key)
        if not ok:
            all_ok = False
    print()

# ── meta.json ──────────────────────────────────────────────────────────────────
print(f"  ── meta.json {'─'*54}")
url = f"{BASE_URL}/statcast/meta.json"
try:
    r = requests.get(url, headers=HEADERS, timeout=30)
    if r.status_code == 200:
        meta = r.json()
        run_at       = meta.get("run_at", "unknown")
        years_fetched = meta.get("years_fetched", [])
        print(f"  ✅  statcast/meta.json  run_at={run_at}  years_fetched={years_fetched}")
        for yr_str, ds_map in meta.get("datasets", {}).items():
            print(f"\n    [{yr_str}]")
            for ds_name, info in ds_map.items():
                icon = "✅" if info.get("ok") else "❌"
                rows = info.get("rows", "?")
                dr   = info.get("date_range", "")
                note = info.get("note", "")
                dr_str   = f"  [{dr}]"   if dr   else ""
                note_str = f"  ({note})" if note  else ""
                print(f"      {icon}  {ds_name:<28} rows={rows}{dr_str}{note_str}")
    else:
        print(f"  ❌  statcast/meta.json  HTTP {r.status_code}")
        all_ok = False
except Exception as e:
    print(f"  ❌  statcast/meta.json  ERROR: {e}")
    all_ok = False

# ── Result ─────────────────────────────────────────────────────────────────────
print(f"\n{'='*68}")
if all_ok:
    print("  ✅  All blob keys present and valid.")
else:
    print("  ❌  One or more blob keys missing or invalid — see above.")
print(f"{'='*68}\n")

sys.exit(0 if all_ok else 1)
