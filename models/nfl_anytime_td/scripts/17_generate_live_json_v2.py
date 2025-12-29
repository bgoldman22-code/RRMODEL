#!/usr/bin/env python3
"""NFL Anytime TD V2 — Live JSON Generator

Purpose
-------
Generate a static JSON payload for the webapp route `/nfl-anytime-td-v2`.

This mirrors the NBA "V2" pattern:
- A scheduled job (GitHub Actions) runs daily at 7am ET.
- It regenerates a single JSON file in `public/data/nfl/`.
- Netlify automatically deploys the updated static asset.

Inputs
------
- Odds API (player_anytime_td odds) via `ODDS_API_KEY`
- Model + features from `models/nfl_anytime_td/v1` + `models/nfl_anytime_td/v1.2`
- Latest historical features from `models/nfl_anytime_td/data/player_td_core.csv`

Outputs
-------
- `public/data/nfl/nfl-anytime-td-v2-live.json`

Notes
-----
This generator intentionally focuses on *picks* (players with positive EV edges)
including strategy tier(s). It is designed for the live site, not for research.

"""

from __future__ import annotations

import importlib.util
import json
import os
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd


def _load_live_picks_generator():
    """Dynamically import `14_live_picks_generator.py`.

    Python modules can't start with a digit, so we import by file path.
    """
    script_path = Path(__file__).resolve().parent / "14_live_picks_generator.py"
    if not script_path.exists():
        raise FileNotFoundError(f"Missing script: {script_path}")

    spec = importlib.util.spec_from_file_location("live_picks_generator", script_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to import: {script_path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[attr-defined]
    return mod


BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_OUT = BASE_DIR.parent.parent / "public" / "data" / "nfl" / "nfl-anytime-td-v2-live.json"


@dataclass
class Metadata:
    generated_at: str
    date_from: str
    date_to: str
    total_games: int
    total_props: int
    total_matched: int
    total_best_odds_players: int
    total_profitable: int
    model_version: str
    pipeline: str


def _atomic_write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=False), encoding="utf-8")
    tmp.replace(path)


def _ensure_odds_key() -> str:
    key = os.environ.get("ODDS_API_KEY")
    if not key:
        raise RuntimeError("ODDS_API_KEY env var is required")
    return key


def _infer_season_week(today: date) -> Dict[str, int]:
    # Matches the Netlify function logic (season start hardcoded)
    season_start = date(2025, 9, 4)
    diff_days = (today - season_start).days
    week = diff_days // 7 + 1
    week = max(1, min(18, week))
    return {"season": 2025, "week": week}


def generate(date_from: date, date_to: date) -> Dict[str, Any]:
    _ensure_odds_key()

    lpg = _load_live_picks_generator()

    # Fetch events + props
    api_key = os.environ["ODDS_API_KEY"]
    events = lpg.fetch_nfl_events(
        api_key,
        datetime.combine(date_from, datetime.min.time()),
        datetime.combine(date_to, datetime.min.time()),
    )

    all_odds: List[Dict[str, Any]] = []
    for event in events:
        odds = lpg.fetch_player_props(api_key, event["id"])
        all_odds.extend(odds)

    odds_df = pd.DataFrame(all_odds)

    model, features, gate_config = lpg.load_model_artifacts()
    season_week = _infer_season_week(date_from)
    # use max_week = week-1 for strict pregame
    max_week = max(1, season_week["week"] - 1)
    player_latest, _player_history = lpg.load_player_data(season=season_week["season"], max_week=max_week)

    pred_df = lpg.generate_predictions(model, features, player_latest)

    matched_df, unmatched = lpg.match_odds_to_predictions(odds_df, pred_df)

    best_odds_df = lpg.select_best_odds(matched_df)

    picks_df = lpg.apply_strategies(best_odds_df)

    # Convert to "live page" row format
    # Keep only profitable players (ANY profitable)
    profitable = picks_df[picks_df.get("strat_any_profitable", False) == True].copy() if "strat_any_profitable" in picks_df.columns else picks_df[picks_df.filter(like="strat_").any(axis=1)].copy()

    def tier_for_row(r: pd.Series) -> str:
        # Prefer highest tier hit
        tier_map = [
            ("strat_tier1_longshots", "TIER_1_LONGSHOTS"),
            ("strat_tier1_cap_deep", "TIER_1_CAP_DEEP"),
            ("strat_tier1_3pct_longshots", "TIER_1_3PCT_LONGSHOTS"),
            ("strat_tier2_10pct", "TIER_2_10PCT"),
            ("strat_tier2_5pct_cap", "TIER_2_5PCT_CAP"),
        ]
        for col, label in tier_map:
            if col in profitable.columns and bool(r.get(col)):
                return label
        return "PROFITABLE"

    rows: List[Dict[str, Any]] = []
    for _, r in profitable.sort_values("edge", ascending=False).iterrows():
        rows.append(
            {
                "player": r.get("player_name"),
                "team": r.get("team"),
                "opponent": r.get("opponent"),
                "position": r.get("position"),
                "modelProbability": float(r.get("p_model", 0.0)),
                "odds": int(r.get("odds_american", 0)) if pd.notna(r.get("odds_american")) else 0,
                "impliedProbability": float(r.get("implied_prob", 0.0)),
                "edge": float(r.get("edge_pct", 0.0)),
                "kelly": float(r.get("kelly", 0.0)),
                "book": r.get("bookmaker"),
                "tier": tier_for_row(r),
                "game": f"{r.get('team')} vs {r.get('opponent')}" if r.get("team") and r.get("opponent") else None,
                "commenceTime": r.get("commence_time"),
            }
        )

    meta = Metadata(
        generated_at=datetime.utcnow().isoformat() + "Z",
        date_from=str(date_from),
        date_to=str(date_to),
        total_games=len(events),
        total_props=int(len(odds_df)) if not odds_df.empty else 0,
        total_matched=int(len(matched_df)) if matched_df is not None else 0,
        total_best_odds_players=int(len(best_odds_df)) if best_odds_df is not None else 0,
        total_profitable=len(rows),
        model_version="LightGBM v1.5 (Anytime TD)",
        pipeline="nfl_anytime_td_v2_live_json",
    )

    return {"metadata": asdict(meta), "picks": rows}


def main() -> None:
    # Defaults: today -> today+6
    today = date.today()
    date_from = today
    date_to = today + timedelta(days=6)

    payload = generate(date_from, date_to)
    _atomic_write_json(PUBLIC_OUT, payload)
    print(f"✅ Wrote {PUBLIC_OUT}")
    print(f"   Picks: {len(payload.get('picks', []))}")


if __name__ == "__main__":
    main()
