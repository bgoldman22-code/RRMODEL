#!/usr/bin/env python3
"""
F5 ML Pick Generator — Self-Contained for GitHub Actions

Loads frozen model artifacts from ml/f5_ml/artifacts/,
downloads features + odds from Netlify Blobs (or local cache),
generates production picks, writes output JSON.

Usage (from RRMODEL root):
    python scripts/mlb_f5/generate_f5_ml.py \
        --date 2026-04-10 \
        --run-label morning \
        --outdir tmp/f5_ml_out \
        --first-pitch-et 13:10 \
        --last-pitch-et 22:10 \
        --games-count 15

Requires: pip install pandas scikit-learn joblib requests
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).parent.parent.parent  # RRMODEL/
ARTIFACTS_DIR = REPO_ROOT / "ml" / "f5_ml" / "artifacts"
PROD_CONFIG   = REPO_ROOT / "ml" / "f5_ml" / "prod_config.json"
CACHE_DIR     = REPO_ROOT / "tmp" / "f5_ml_cache"


# ═══════════════════════════════════════════════════════════════
# DATA LOADING (Blobs → local cache)
# ═══════════════════════════════════════════════════════════════

def _download_from_blobs(blob_key: str, local_path: Path) -> bool:
    """Download a file from Netlify Blobs to local cache."""
    try:
        import requests
        from requests.adapters import HTTPAdapter
        from urllib3.util.retry import Retry
    except ImportError:
        logger.error("requests not installed — can't download from Blobs")
        return False

    site_id = os.environ.get("NETLIFY_SITE_ID", "")
    token   = os.environ.get("NETLIFY_AUTH_TOKEN") or os.environ.get("NETLIFY_TOKEN", "")
    store   = os.environ.get("BLOBS_STORE", "rrmodelblobs")

    if not site_id or not token:
        logger.warning("No Netlify Blobs credentials — skipping download for %s", blob_key)
        return False

    url = f"https://api.netlify.com/api/v1/blobs/{site_id}/{store}/{blob_key}"
    headers = {"Authorization": f"Bearer {token}"}

    logger.info("Downloading %s …", blob_key)
    session = requests.Session()
    retry_strategy = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[502, 503, 504],
    )
    session.mount("https://", HTTPAdapter(max_retries=retry_strategy))

    resp = session.get(url, headers=headers, timeout=120)
    if resp.status_code != 200:
        logger.error("Blobs download failed: HTTP %d for %s", resp.status_code, blob_key)
        return False

    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(resp.content)
    logger.info("  ✅ Cached → %s  (%d KB)", local_path, len(resp.content) // 1024)
    return True


def _ensure_data_file(blob_key: str, cache_name: str) -> Path:
    """Ensure a data file exists locally (download from Blobs if missing)."""
    cached = CACHE_DIR / cache_name
    if cached.exists():
        logger.info("Using cached %s", cached)
        return cached

    if _download_from_blobs(blob_key, cached):
        return cached

    raise FileNotFoundError(
        f"Cannot find {cache_name}: not cached and Blobs download failed. "
        f"Blob key: {blob_key}"
    )


# ═══════════════════════════════════════════════════════════════
# ODDS HELPERS
# ═══════════════════════════════════════════════════════════════

def _american_to_decimal(oa: float) -> float:
    if pd.isna(oa): return np.nan
    return 1.0 + oa / 100.0 if oa > 0 else 1.0 + 100.0 / abs(oa)


def _decimal_to_american(d: float) -> float:
    if pd.isna(d) or d <= 1.0: return np.nan
    return round((d - 1.0) * 100.0, 1) if d >= 2.0 else round(-100.0 / (d - 1.0), 1)


def _implied_prob(d: float) -> float:
    if pd.isna(d) or d <= 1.0: return np.nan
    return 1.0 / d


# ═══════════════════════════════════════════════════════════════
# LIVE ODDS LOADING (JSON from Blobs, fallback to static parquet)
# ═══════════════════════════════════════════════════════════════

def _load_live_odds_json(game_date: str) -> pd.DataFrame | None:
    """
    Try to load live odds JSON from Netlify Blobs.
    Key: mlb/f5_ml/odds/live/{YYYY-MM-DD}.json

    Returns a DataFrame with columns matching the consensus parquet schema
    (game_pk, bet_side, odds_decimal, odds_american, implied_prob_raw, etc.)
    or None if not available.
    """
    blob_key   = f"mlb/f5_ml/odds/live/{game_date}.json"
    cache_name = f"live_odds_{game_date}.json"
    cached     = CACHE_DIR / cache_name

    # Try local cache first
    if cached.exists():
        logger.info("Using cached live odds: %s", cached)
    else:
        if not _download_from_blobs(blob_key, cached):
            return None

    try:
        import json as _json
        raw = cached.read_text()
        records = _json.loads(raw)
        if not isinstance(records, list) or len(records) == 0:
            logger.info("Live odds JSON is empty for %s", game_date)
            return None
        df = pd.DataFrame(records)
        # Ensure game_pk is numeric (float64 to match parquet convention)
        if "game_pk" in df.columns:
            df["game_pk"] = pd.to_numeric(df["game_pk"], errors="coerce")
        logger.info("✅  Loaded %d live odds records for %s", len(df), game_date)
        return df
    except Exception as e:
        logger.warning("Failed to parse live odds JSON: %s", e)
        return None


def _load_static_parquet_odds(game_date: str, target_ts: pd.Timestamp) -> pd.DataFrame | None:
    """
    Fall back to the static consensus parquet for historical dates.
    """
    year = int(game_date[:4])
    odds_key  = f"mlb/f5_ml/data/consensus_{year}.parquet"
    odds_file = f"consensus_{year}.parquet"

    try:
        odds_path = _ensure_data_file(odds_key, odds_file)
    except FileNotFoundError:
        logger.info("No static consensus parquet for %d", year)
        return None

    odds = pd.read_parquet(odds_path)
    odds["game_date"] = pd.to_datetime(odds["game_date"], errors="coerce")
    odds = odds[odds["game_date"].dt.normalize() == target_ts].copy()

    if odds.empty:
        logger.info("Static parquet exists but no rows for %s", game_date)
        return None

    logger.info("✅  Loaded %d static parquet odds for %s", len(odds), game_date)
    return odds


def _load_odds(game_date: str, target_ts: pd.Timestamp) -> pd.DataFrame | None:
    """
    Load odds with priority: live JSON → static parquet.
    """
    # 1) Try live JSON first (in-season / current dates)
    live = _load_live_odds_json(game_date)
    if live is not None and not live.empty:
        return live

    # 2) Fall back to static parquet (historical / pre-seeded)
    static = _load_static_parquet_odds(game_date, target_ts)
    if static is not None and not static.empty:
        return static

    logger.warning("No odds available for %s (neither live nor static)", game_date)
    return None


# ═══════════════════════════════════════════════════════════════
# CORE GENERATOR
# ═══════════════════════════════════════════════════════════════

def generate(
    game_date: str,
    run_label: str,
    first_pitch_et: str = "",
    last_pitch_et: str = "",
    games_count: int = 0,
) -> dict:
    """Generate F5 ML picks for a date."""
    ts_start = datetime.now(timezone.utc)

    # 1. Load config + artifacts
    with open(PROD_CONFIG) as f:
        cfg = json.load(f)

    model  = joblib.load(ARTIFACTS_DIR / "model.joblib")
    scaler = joblib.load(ARTIFACTS_DIR / "scaler.joblib")
    with open(ARTIFACTS_DIR / "features.json") as f:
        feature_cols = json.load(f)
    with open(ARTIFACTS_DIR / "means.json") as f:
        means = pd.Series(json.load(f))

    ev_min   = cfg["thresholds"]["ev_min"]
    edge_min = cfg["thresholds"]["edge_min"]
    min_odds = cfg["thresholds"]["min_odds_american"]
    max_odds = cfg["thresholds"]["max_odds_american"]
    stake    = cfg["stake"]["unit"]

    logger.info("F5 ML generate: date=%s label=%s ev≥%.2f edge≥%.2f", game_date, run_label, ev_min, edge_min)

    target_ts = pd.Timestamp(game_date)

    # 2. Load features — try historical parquet first, fall back to live builder
    feats = None
    live_path = CACHE_DIR / f"live_features_{game_date}.parquet"

    # Check if we already have freshly built live features (< 2 hours old)
    if live_path.exists():
        age_hours = (time.time() - live_path.stat().st_mtime) / 3600
        if age_hours < 2:
            logger.info("Using cached live features (%.1f hours old): %s", age_hours, live_path)
            feats = pd.read_parquet(live_path)

    # Try the historical parquet
    if feats is None:
        try:
            features_path = _ensure_data_file("mlb/f5_ml/data/features_v2.parquet", "features_v2.parquet")
            hist = pd.read_parquet(features_path)
            hist["game_date"] = pd.to_datetime(hist["game_date"], errors="coerce")
            hist = hist[hist["game_date"].dt.normalize() == target_ts].copy()
            if not hist.empty:
                feats = hist
                logger.info("Using historical parquet: %d rows for %s", len(feats), game_date)
        except FileNotFoundError:
            logger.info("No historical features parquet available")

    # If still no features, invoke live builder
    if feats is None or feats.empty:
        logger.info("No historical features for %s — invoking live feature builder…", game_date)
        try:
            from build_live_features import build_features_for_date
            feats = build_features_for_date(game_date)
            if not feats.empty:
                CACHE_DIR.mkdir(parents=True, exist_ok=True)
                feats.to_parquet(live_path, index=False)
                logger.info("Live features built & cached: %d games → %s", len(feats), live_path)
        except ImportError:
            logger.warning("build_live_features not importable — trying subprocess fallback")
            import subprocess
            builder = Path(__file__).parent / "build_live_features.py"
            result_code = subprocess.call(
                [sys.executable, str(builder), "--date", game_date, "--outdir", str(CACHE_DIR)],
                cwd=str(REPO_ROOT),
            )
            if result_code == 0 and live_path.exists():
                feats = pd.read_parquet(live_path)
                logger.info("Live features built via subprocess: %d games", len(feats))
            else:
                feats = pd.DataFrame()
        except Exception as e:
            logger.error("Live feature builder failed: %s", e)
            feats = pd.DataFrame()

    if feats is None or feats.empty:
        return _empty_response(cfg, game_date, run_label, ts_start,
                               first_pitch_et, last_pitch_et, games_count, "No feature rows for date")

    # 3. Score → P(home_win)
    X = feats[feature_cols].copy().fillna(means.reindex(feature_cols)).fillna(0.0)
    p_home = model.predict_proba(scaler.transform(X.values))[:, 1]
    feats = feats.reset_index(drop=True)
    feats["p_home"] = p_home

    # 4. Load consensus odds — try live JSON first, fall back to static parquet
    odds = _load_odds(game_date, target_ts)
    if odds is None or odds.empty:
        return _empty_response(cfg, game_date, run_label, ts_start,
                               first_pitch_et, last_pitch_et, games_count, "No odds for date")

    # 5. Build picks (one per qualifying side)
    picks = []
    games_scored = 0

    for _, row in feats.iterrows():
        game_pk = int(row["game_pk"])
        p_h = float(row["p_home"])
        games_scored += 1

        for side in ("home", "away"):
            side_odds = odds[(odds["game_pk"] == game_pk) & (odds["bet_side"].str.lower().str.strip() == side)]
            if side_odds.empty:
                continue

            orow = side_odds.iloc[0]
            dec = float(orow.get("odds_decimal", np.nan))
            if pd.isna(dec) or dec <= 1.0:
                continue

            imp = _implied_prob(dec)
            p_m = p_h if side == "home" else 1.0 - p_h
            ev  = p_m * (dec - 1.0) - (1.0 - p_m)
            edge = p_m - imp
            amer = _decimal_to_american(dec)

            if ev < ev_min or edge < edge_min:
                continue
            if not pd.isna(amer) and (amer < min_odds or amer > max_odds):
                continue

            home_team = str(row.get("home_team", ""))
            away_team = str(row.get("away_team", ""))
            label_txt = f"{home_team} F5 ML" if side == "home" else f"{away_team} F5 ML"

            picks.append({
                "pick_id": f"{game_pk}:{side}:consensus:{cfg['model_id']}",
                "game_pk": game_pk,
                "game_date": game_date,
                "bet_side": side,
                "bet_label": label_txt.strip(),
                "home_team": home_team,
                "away_team": away_team,
                "pricing_mode": "consensus",
                "odds_decimal": round(dec, 4),
                "odds_american": amer,
                "implied_prob": round(imp, 4),
                "p_model": round(p_m, 4),
                "ev": round(ev, 4),
                "edge": round(edge, 4),
                "stake": stake,
                "potential_profit": round(stake * (dec - 1.0), 2),
            })

    picks.sort(key=lambda p: p["ev"], reverse=True)

    # 6. Build response
    ts_end = datetime.now(timezone.utc)
    return {
        "schema_version": cfg["schema_version"],
        "model_id": cfg["model_id"],
        "generated_at": ts_end.isoformat(),
        "game_date": game_date,
        "pricing_mode": "consensus",
        "run_label": run_label,
        "thresholds": {
            "ev_min": ev_min,
            "edge_min": edge_min,
            "min_odds_american": min_odds,
            "max_odds_american": max_odds,
        },
        "schedule_context": {
            "first_pitch_et": first_pitch_et,
            "last_pitch_et": last_pitch_et,
            "games_on_slate": games_count or len(feats),
        },
        "picks": picks,
        "meta": {
            "games_on_slate": len(feats),
            "games_scored": games_scored,
            "total_picks": len(picks),
            "generation_time_ms": int((ts_end - ts_start).total_seconds() * 1000),
        },
    }


def _empty_response(cfg, game_date, run_label, ts_start, fp, lp, gc, reason):
    ts_end = datetime.now(timezone.utc)
    return {
        "schema_version": cfg["schema_version"],
        "model_id": cfg["model_id"],
        "generated_at": ts_end.isoformat(),
        "game_date": game_date,
        "pricing_mode": "consensus",
        "run_label": run_label,
        "thresholds": {
            "ev_min": cfg["thresholds"]["ev_min"],
            "edge_min": cfg["thresholds"]["edge_min"],
            "min_odds_american": cfg["thresholds"]["min_odds_american"],
            "max_odds_american": cfg["thresholds"]["max_odds_american"],
        },
        "schedule_context": {"first_pitch_et": fp, "last_pitch_et": lp, "games_on_slate": gc},
        "picks": [],
        "meta": {
            "games_on_slate": 0, "games_scored": 0, "total_picks": 0,
            "generation_time_ms": int((ts_end - ts_start).total_seconds() * 1000),
            "reason": reason,
        },
    }


# ═══════════════════════════════════════════════════════════════
# OUTPUT VALIDATION
# ═══════════════════════════════════════════════════════════════

def _validate_output(result: dict) -> None:
    """Validate the output JSON schema before writing to disk."""
    errors = []

    # Required top-level fields
    for field in ("schema_version", "model_id", "generated_at", "thresholds", "picks", "meta"):
        if field not in result:
            errors.append(f"missing top-level field: {field}")

    # Thresholds lock check
    th = result.get("thresholds", {})
    if th.get("ev_min") != 0.10:
        errors.append(f"ev_min={th.get('ev_min')} != 0.10")
    if th.get("edge_min") != 0.07:
        errors.append(f"edge_min={th.get('edge_min')} != 0.07")

    # Meta must have total_picks
    meta = result.get("meta", {})
    if "total_picks" not in meta:
        errors.append("missing meta.total_picks")

    # Every pick must have finite numeric fields
    for i, p in enumerate(result.get("picks", [])):
        for k in ("odds_decimal", "p_model", "ev", "edge"):
            v = p.get(k)
            if not isinstance(v, (int, float)) or not np.isfinite(v):
                errors.append(f"pick[{i}].{k} = {v} (not finite)")

    if errors:
        msg = "Output validation failed:\n  • " + "\n  • ".join(errors)
        logger.error(msg)
        raise ValueError(msg)

    logger.info("✅  Output validation passed (schema_version=%s, picks=%d)",
                result.get("schema_version"), len(result.get("picks", [])))


# ═══════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="F5 ML Pick Generator")
    parser.add_argument("--date", required=True, help="YYYY-MM-DD")
    parser.add_argument("--run-label", required=True, help="morning|pre_afternoon|pre_night")
    parser.add_argument("--outdir", required=True, help="Output directory")
    parser.add_argument("--first-pitch-et", default="", help="HH:MM first pitch ET")
    parser.add_argument("--last-pitch-et", default="", help="HH:MM last pitch ET")
    parser.add_argument("--games-count", type=int, default=0, help="Games on slate")
    args = parser.parse_args()

    result = generate(
        game_date=args.date,
        run_label=args.run_label,
        first_pitch_et=args.first_pitch_et,
        last_pitch_et=args.last_pitch_et,
        games_count=args.games_count,
    )

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    # Validate output schema before writing
    _validate_output(result)

    # Write dated snapshot
    snapshot = outdir / f"{args.date}_{args.run_label}.json"
    snapshot.write_text(json.dumps(result, indent=2, default=str))
    logger.info("Wrote %d picks → %s", result["meta"]["total_picks"], snapshot)

    # Write latest.json (always — upload script decides whether to publish)
    latest = outdir / "latest.json"
    latest.write_text(json.dumps(result, indent=2, default=str))
    logger.info("Wrote latest.json")

    # One-line summary
    n = result["meta"]["total_picks"]
    print(f"✅  F5 ML: {n} picks for {args.date} ({args.run_label})")


if __name__ == "__main__":
    main()
