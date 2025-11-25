#!/usr/bin/env python3
"""
Builds the training dataset for the NBA totals model from nba_api game logs.

Steps:
  1. Load raw game files from data/nba/games/nba_api (multiple seasons)
  2. Filter to regular-season games (drops preseason by start-date heuristics)
  3. Compute rolling L10 stats per team (fg%, fg3%, ft%, rebounds, assists, turnovers)
  4. Assemble model-ready features mirroring the production totals model
  5. Write the consolidated dataset to CSV/Parquet along with a summary report

Usage:
  python ml/nba_totals_build_dataset.py --seasons 2022_23 2023_24 2024_25 2025_26
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = REPO_ROOT / "data" / "nba" / "games" / "nba_api"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data" / "nba" / "datasets"
DATASET_FILENAME = "nba_totals_training_dataset.csv"
METADATA_FILENAME = "nba_totals_training_metadata.json"
PARQUET_FILENAME = "nba_totals_training_dataset.parquet"

SEASON_STARTS = {
    "2022_23": "2022-10-18",
    "2023_24": "2023-10-24",
    "2024_25": "2024-10-22",
    "2025_26": "2025-10-21",
}

LEAGUE_AVERAGE_STATS = {
    "fgPct": 0.47,
    "fg3Pct": 0.36,
    "ftPct": 0.78,
    "rebounds": 44.0,
    "assists": 26.0,
    "turnovers": 13.5,
}

STAT_FIELDS = list(LEAGUE_AVERAGE_STATS.keys())


@dataclass
class GameRecord:
    game_id: str
    date: datetime
    season: str
    season_type: str
    home_team_id: int
    away_team_id: int
    home_team: str
    away_team: str
    home_stats: Dict
    away_stats: Dict
    home_score: Optional[int]
    away_score: Optional[int]

    @property
    def season_slug(self) -> str:
        return self.season.replace("-", "_")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build NBA totals training dataset")
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=DEFAULT_SOURCE_DIR,
        help="Directory containing games_*_nba_api.json files",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory where dataset outputs will be stored",
    )
    parser.add_argument(
        "--seasons",
        nargs="*",
        default=["2022_23", "2023_24", "2024_25", "2025_26"],
        help="Season slugs to include (e.g., 2024_25)",
    )
    parser.add_argument(
        "--window",
        type=int,
        default=10,
        help="Rolling window size per team for L10 stats",
    )
    parser.add_argument(
        "--min-games",
        type=int,
        default=0,
        help="Minimum number of previously completed team games required before including a sample",
    )
    parser.add_argument(
        "--start-date",
        type=str,
        default=None,
        help="Global YYYY-MM-DD start date override (applies to all seasons)",
    )
    parser.add_argument(
        "--include-playoffs",
        action="store_true",
        help="Include playoff/Postseason games as well as regular season",
    )
    parser.add_argument(
        "--parquet",
        action="store_true",
        help="Also write a Parquet copy of the dataset",
    )
    return parser.parse_args()


def discover_game_files(source_dir: Path, seasons: Iterable[str]) -> List[Path]:
    if not source_dir.exists():
        raise FileNotFoundError(f"Source directory not found: {source_dir}")

    normalized = {s.replace("-", "_") for s in seasons}
    files = []
    for path in sorted(source_dir.glob("games_*_nba_api.json")):
        season_slug = (
            path.stem.replace("games_", "")
            .replace("_nba_api", "")
            .replace("-", "_")
        )
        if season_slug in normalized:
            files.append(path)
    return files


def load_games(path: Path) -> List[GameRecord]:
    with open(path, "r") as f:
        raw_games = json.load(f)

    games: List[GameRecord] = []
    for game in raw_games:
        # Skip entries without scores to avoid incomplete stats
        home_score = game.get("homeScore")
        away_score = game.get("awayScore")
        games.append(
            GameRecord(
                game_id=str(game.get("gameId")),
                date=datetime.fromisoformat(game.get("date")),
                season=game.get("season", ""),
                season_type=(game.get("seasonType") or "").strip(),
                home_team_id=int(game.get("homeTeamId")),
                away_team_id=int(game.get("awayTeamId")),
                home_team=game.get("homeTeam"),
                away_team=game.get("awayTeam"),
                home_stats=game.get("homeStats", {}) or {},
                away_stats=game.get("awayStats", {}) or {},
                home_score=home_score if home_score is None else int(home_score),
                away_score=away_score if away_score is None else int(away_score),
            )
        )
    return games


def should_include_game(game: GameRecord, include_playoffs: bool, start_override: Optional[str]) -> bool:
    season_slug = game.season_slug
    start_date = start_override or SEASON_STARTS.get(season_slug)
    if start_date and game.date.date() < datetime.fromisoformat(start_date).date():
        return False
    if game.home_score is None or game.away_score is None:
        return False
    if not include_playoffs:
        season_type = (game.season_type or "Regular Season").lower()
        if "regular" not in season_type:
            return False
    return True


def summarize_history(history: List[Dict], window: int) -> Dict[str, float]:
    if not history:
        return LEAGUE_AVERAGE_STATS.copy()
    sample = history[-window:]
    summary = {}
    for field, default in LEAGUE_AVERAGE_STATS.items():
        values = [entry.get(field) for entry in sample if entry.get(field) is not None]
        if not values:
            summary[field] = default
        else:
            summary[field] = sum(values) / len(values)
    return summary


def build_features(home_l10: Dict[str, float], away_l10: Dict[str, float]) -> Dict[str, float]:
    features = {
        "home_l10_fgPct": home_l10["fgPct"],
        "home_l10_fg3Pct": home_l10["fg3Pct"],
        "home_l10_ftPct": home_l10["ftPct"],
        "home_l10_rebounds": home_l10["rebounds"],
        "home_l10_assists": home_l10["assists"],
        "home_l10_turnovers": home_l10["turnovers"],
        "away_l10_fgPct": away_l10["fgPct"],
        "away_l10_fg3Pct": away_l10["fg3Pct"],
        "away_l10_ftPct": away_l10["ftPct"],
        "away_l10_rebounds": away_l10["rebounds"],
        "away_l10_assists": away_l10["assists"],
        "away_l10_turnovers": away_l10["turnovers"],
    }
    features.update(
        {
            "fgPct_diff": features["home_l10_fgPct"] - features["away_l10_fgPct"],
            "fg3Pct_diff": features["home_l10_fg3Pct"] - features["away_l10_fg3Pct"],
            "rebounds_diff": features["home_l10_rebounds"] - features["away_l10_rebounds"],
            "assists_diff": features["home_l10_assists"] - features["away_l10_assists"],
            # fewer turnovers is better → away minus home mirrors historical script
            "turnovers_diff": features["away_l10_turnovers"] - features["home_l10_turnovers"],
            "home_court": 1.0,
        }
    )
    return features


def stats_from_game(stats_obj: Dict) -> Dict[str, float]:
    output = {}
    for field, default in LEAGUE_AVERAGE_STATS.items():
        value = stats_obj.get(field)
        output[field] = float(value) if value is not None else default
    return output


def build_dataset(args: argparse.Namespace) -> pd.DataFrame:
    files = discover_game_files(args.source_dir, args.seasons)
    if not files:
        raise SystemExit("No source files found for requested seasons")

    team_histories: Dict[int, List[Dict[str, float]]] = defaultdict(list)
    rows: List[Dict] = []

    for file_path in files:
        games = [g for g in load_games(file_path) if should_include_game(g, args.include_playoffs, args.start_date)]
        games.sort(key=lambda g: (g.date, g.game_id))
        season_slug = file_path.stem.replace("games_", "").replace("_nba_api", "").replace("-", "_")
        print(f"Processing {season_slug}: {len(games)} games after filtering")

        for game in games:
            home_history = team_histories[game.home_team_id]
            away_history = team_histories[game.away_team_id]
            min_hist = min(len(home_history), len(away_history))
            if min_hist < args.min_games:
                # update histories but skip sample until both teams have enough track record
                home_history.append(stats_from_game(game.home_stats))
                away_history.append(stats_from_game(game.away_stats))
                continue

            home_l10 = summarize_history(home_history, args.window)
            away_l10 = summarize_history(away_history, args.window)
            features = build_features(home_l10, away_l10)

            total_points = (game.home_score or 0) + (game.away_score or 0)
            spread = (game.home_score or 0) - (game.away_score or 0)

            rows.append(
                {
                    "season": game.season_slug,
                    "game_id": game.game_id,
                    "date": game.date.strftime("%Y-%m-%d"),
                    "home_team": game.home_team,
                    "away_team": game.away_team,
                    "home_score": game.home_score,
                    "away_score": game.away_score,
                    "actual_total": total_points,
                    "actual_spread": spread,
                    **features,
                }
            )

            home_history.append(stats_from_game(game.home_stats))
            away_history.append(stats_from_game(game.away_stats))

    if not rows:
        raise SystemExit("No training rows generated. Loosen --min-games or verify data availability.")

    df = pd.DataFrame(rows)
    df.sort_values("date", inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


def write_outputs(df: pd.DataFrame, output_dir: Path, write_parquet: bool) -> Dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / DATASET_FILENAME
    df.to_csv(csv_path, index=False)
    print(f"\n✅ Wrote dataset: {csv_path} ({len(df)} samples)")

    parquet_path = None
    if write_parquet:
        parquet_path = output_dir / PARQUET_FILENAME
        df.to_parquet(parquet_path, index=False)
        print(f"✅ Wrote parquet:  {parquet_path}")

    summary = (
        df.groupby("season")
        .agg(count=("game_id", "count"), start_date=("date", "min"), end_date=("date", "max"))
        .reset_index()
        .to_dict(orient="records")
    )
    metadata = {
        "samples": len(df),
        "features": [col for col in df.columns if col not in {"season", "game_id", "date", "home_team", "away_team", "home_score", "away_score", "actual_total", "actual_spread"}],
        "seasons": summary,
        "csv_path": str(csv_path.relative_to(REPO_ROOT)),
    }
    if parquet_path:
        metadata["parquet_path"] = str(parquet_path.relative_to(REPO_ROOT))

    metadata_path = output_dir / METADATA_FILENAME
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"✅ Wrote metadata: {metadata_path}")

    return metadata


def main() -> None:
    args = parse_args()
    df = build_dataset(args)
    metadata = write_outputs(df, args.output_dir, args.parquet)

    print("\n📊 Dataset summary:")
    for season_info in metadata["seasons"]:
        print(
            f"  - {season_info['season']}: {season_info['count']} games between {season_info['start_date']} and {season_info['end_date']}"
        )


if __name__ == "__main__":
    main()
