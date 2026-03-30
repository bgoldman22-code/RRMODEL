"""
validate_blobs.py — Phase 2 validation gate

Reads every Statcast blob key from rrmodelblobs and prints row counts.
Run after the first successful mlb-statcast-daily workflow to confirm
real data is flowing before Phase 3 model code is written.

Usage:
    NETLIFY_AUTH_TOKEN=... NETLIFY_SITE_ID=... python scripts/mlb_v3/validate_blobs.py [--year YYYY]
"""

import os
import sys
import json
import argparse
import datetime
import requests

# ── Config ─────────────────────────────────────────────────────────────────────
STORE_NAME = "rrmodelblobs"
SITE_ID_FALLBACK = "967be648-eddc-4cc5-a7cc-e2ab7db8ac75"
TOKEN_FALLBACK = "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263"

SITE_ID = os.environ.get("NETLIFY_SITE_ID") or SITE_ID_FALLBACK
TOKEN   = os.environ.get("NETLIFY_AUTH_TOKEN") or TOKEN_FALLBACK

# ── CLI ─────────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Validate Statcast blobs row counts")
parser.add_argument("--year", type=int, default=datetime.datetime.now().year,
                    help="Season year to check (default: current year)")
args = parser.parse_args()
YEAR = args.year

# ── Blob keys to validate ───────────────────────────────────────────────────────
KEYS = [
    f"statcast/batters-{YEAR}.json",
    f"statcast/spray-{YEAR}.json",
    f"statcast/pitchers-ev-{YEAR}.json",
    f"statcast/arsenal-{YEAR}.json",
    f"statcast/park-factors-{YEAR}.json",
    f"statcast/fangraphs-pitching-{YEAR}.json",
    "statcast/meta.json",
]

BASE_URL = f"https://api.netlify.com/api/v1/blobs/{SITE_ID}/{STORE_NAME}"
HEADERS  = {"Authorization": f"Bearer {TOKEN}"}

# ── Fetch + report ──────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"  Statcast Blob Validation — year={YEAR}")
print(f"  Store: {STORE_NAME}  Site: {SITE_ID[:8]}...")
print(f"{'='*60}\n")

all_ok = True
meta_status = {}

for key in KEYS:
    url = f"{BASE_URL}/{key}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        if r.status_code == 404:
            print(f"  ❌  {key:<45}  NOT FOUND (404)")
            all_ok = False
            continue
        if r.status_code != 200:
            print(f"  ❌  {key:<45}  HTTP {r.status_code}")
            all_ok = False
            continue

        data = r.json()

        # ── meta.json: print status fields ─────────────────────────────────────
        if key == "statcast/meta.json":
            fetched_at = data.get("fetched_at", "unknown")
            year_from_meta = data.get("year", "?")
            statuses = data.get("datasets", {})
            print(f"  ✅  {key:<45}  fetched_at={fetched_at}  year={year_from_meta}")
            for ds_name, ds_info in statuses.items():
                ok_flag = "✅" if ds_info.get("ok") else "❌"
                rows = ds_info.get("rows", "?")
                err  = ds_info.get("error", "")
                detail = f"rows={rows}" if ds_info.get("ok") else f"error={err}"
                print(f"        {ok_flag}  {ds_name:<35} {detail}")
            meta_status = statuses
            continue

        # ── All other keys: count rows ─────────────────────────────────────────
        if isinstance(data, list):
            row_count = len(data)
            print(f"  ✅  {key:<45}  {row_count:>6} rows")
        elif isinstance(data, dict):
            # arsenal is a dict-of-dicts: count top-level pitcher IDs
            top_count = len(data)
            # count total pitch entries across all pitchers
            total_entries = sum(
                len(v) if isinstance(v, (list, dict)) else 1
                for v in data.values()
            )
            print(f"  ✅  {key:<45}  {top_count:>6} pitchers  ({total_entries} pitch entries)")
        else:
            print(f"  ⚠️  {key:<45}  unexpected type: {type(data).__name__}")

    except requests.exceptions.Timeout:
        print(f"  ❌  {key:<45}  TIMEOUT")
        all_ok = False
    except json.JSONDecodeError:
        print(f"  ❌  {key:<45}  INVALID JSON")
        all_ok = False
    except Exception as exc:
        print(f"  ❌  {key:<45}  ERROR: {exc}")
        all_ok = False

# ── Cross-check meta vs actual blobs ───────────────────────────────────────────
print(f"\n{'='*60}")
if all_ok:
    print("  ✅  All blob keys present and valid.")
else:
    print("  ❌  One or more blob keys missing or invalid — check errors above.")
print(f"{'='*60}\n")

sys.exit(0 if all_ok else 1)
