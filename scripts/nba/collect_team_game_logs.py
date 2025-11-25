#!/usr/bin/env python3
"""Collect team-level NBA game logs via nba_api.

This script pulls game-level box score summaries from the official NBA Stats
API (accessed through the open-source `nba_api` package) and stores them in a
JSON structure that mirrors the existing `data/nba/games/games_YYYY_YY.json`
files used throughout the project.

Usage example:

    python scripts/nba/collect_team_game_logs.py \
        --seasons 2022-23 2023-24 2024-25 2025-26 \
        --start-date 2023-01-01 \
        --end-date 2025-11-23 \
        --output-dir data/nba/games/nba_api

The script respects the requested date window (defaulting to Jan 1, 2023
through the day before execution) and only writes games that fall within that
range. Each season is saved to `games_{season}_nba_api.json` under the output
directory.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, date, timezone
from pathlib import Path
from time import sleep
from typing import Dict, List, Any

from nba_api.stats.endpoints import leaguegamelog


DEFAULT_SEASONS = ["2022-23", "2023-24", "2024-25", "2025-26"]
RATE_LIMIT_SECONDS = 1.0  # Be gentle with the NBA Stats API


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect NBA team game logs")
    parser.add_argument(
        "--seasons",
        nargs="*",
        default=DEFAULT_SEASONS,
        help="Season codes to collect (e.g. 2024-25)",
    )
    parser.add_argument(
        "--start-date",
        default="2023-01-01",
        help="Inclusive start date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end-date",
        default=datetime.now(timezone.utc).date().isoformat(),
        help="Inclusive end date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--season-type",
        default="Regular Season",
        choices=["Regular Season", "Playoffs"],
        help="Season type to collect",
    )
    parser.add_argument(
        "--output-dir",
        default="data/nba/games/nba_api",
        help="Directory to write JSON files",
    )
    return parser.parse_args()


def iso_date(value: str) -> date:
    """Parse NBA API date strings into `date`."""
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return datetime.strptime(value, "%b %d, %Y").date()


def build_stats(row: Dict[str, Any]) -> Dict[str, Any]:
    """Convert nba_api row into the stats schema used by the project."""
    return {
        "fgm": row["FGM"],
        "fga": row["FGA"],
        "fgPct": row["FG_PCT"],
        "fg3m": row["FG3M"],
        "fg3a": row["FG3A"],
        "fg3Pct": row["FG3_PCT"],
        "ftm": row["FTM"],
        "fta": row["FTA"],
        "ftPct": row["FT_PCT"],
        "rebounds": row["REB"],
        "offRebounds": row["OREB"],
        "defRebounds": row["DREB"],
        "assists": row["AST"],
        "steals": row["STL"],
        "blocks": row["BLK"],
        "turnovers": row["TOV"],
        "fouls": row["PF"],
        "points": row["PTS"],
    }


def process_season(
    season: str,
    start_date: date,
    end_date: date,
    season_type: str,
) -> List[Dict[str, Any]]:
    """Fetch and structure all games for a season within the date window."""
    print(f"\n📅 Season {season} ({season_type})")
    log = leaguegamelog.LeagueGameLog(
        season=season,
        season_type_all_star=season_type,
    )
    df = log.get_data_frames()[0]
    print(f"  • Retrieved {len(df)} team entries")

    games: Dict[str, Dict[str, Any]] = {}

    for _, row in df.iterrows():
        game_date = iso_date(row["GAME_DATE"])
        if game_date < start_date or game_date > end_date:
            continue

        game_id = row["GAME_ID"]
        entry = games.setdefault(
            game_id,
            {
                "gameId": game_id,
                "date": game_date.isoformat(),
                "season": season,
                "seasonType": season_type,
            },
        )

        team_payload = {
            "teamId": int(row["TEAM_ID"]),
            "team": row["TEAM_ABBREVIATION"],
            "teamName": row["TEAM_NAME"],
            "score": int(row["PTS"]),
            "stats": build_stats(row),
        }

        matchup = row["MATCHUP"].lower()
        if "vs" in matchup:
            # Home team
            entry.update(
                {
                    "homeTeamId": team_payload["teamId"],
                    "homeTeam": team_payload["team"],
                    "homeTeamName": team_payload["teamName"],
                    "homeScore": team_payload["score"],
                    "homeStats": team_payload["stats"],
                }
            )
        else:
            entry.update(
                {
                    "awayTeamId": team_payload["teamId"],
                    "awayTeam": team_payload["team"],
                    "awayTeamName": team_payload["teamName"],
                    "awayScore": team_payload["score"],
                    "awayStats": team_payload["stats"],
                }
            )

    completed_games = [
        g
        for g in games.values()
        if "homeStats" in g and "awayStats" in g
    ]

    completed_games.sort(key=lambda g: g["date"])
    print(f"  • Stored {len(completed_games)} completed games in range")
    return completed_games


def main() -> None:
    args = parse_args()
    start_date = datetime.strptime(args.start_date, "%Y-%m-%d").date()
    end_date = datetime.strptime(args.end_date, "%Y-%m-%d").date()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    for idx, season in enumerate(args.seasons):
        games = process_season(season, start_date, end_date, args.season_type)
        if not games:
            print(f"  ⚠️  No games found for season {season} in range")
            continue

        output_file = output_dir / f"games_{season.replace('-', '_')}_nba_api.json"
        with output_file.open("w", encoding="utf-8") as f:
            json.dump(games, f, indent=2)

        print(f"  💾 Wrote {len(games)} games to {output_file}\n")

        if idx < len(args.seasons) - 1:
            sleep(RATE_LIMIT_SECONDS)


if __name__ == "__main__":
    main()