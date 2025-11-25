#!/usr/bin/env python3
"""
Builds the RESIDUAL training dataset for NBA totals model with advanced features.

This is an ENHANCED version that adds:
- Team strength metrics (ORtg, DRtg, Net Rating, Pace)
- Four Factors (eFG%, TOV%, ORB%, FT Rate)
- Contextual features (rest days, back-to-backs, scheduling)
- Matchup interactions
- Market residuals (target = actual_total - market_line)

All features computed CHRONOLOGICALLY with ZERO lookahead.

Usage:
  python ml/nba_totals_build_residual_dataset.py --seasons 2022_23 2023_24 2024_25 2025_26
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import pandas as pd
import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = REPO_ROOT / "data" / "nba" / "games" / "nba_api"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data" / "nba" / "datasets"
ODDS_DIR = REPO_ROOT / "data" / "nba" / "historical_odds" / "game_totals"

DATASET_FILENAME = "nba_totals_residual_dataset.csv"
METADATA_FILENAME = "nba_totals_residual_metadata.json"
PARQUET_FILENAME = "nba_totals_residual_dataset.parquet"

SEASON_STARTS = {
    "2022_23": "2022-10-18",
    "2023_24": "2023-10-24",
    "2024_25": "2024-10-22",
    "2025_26": "2025-10-21",
}

# League averages for initialization
LEAGUE_AVERAGES = {
    "ortg": 115.0,
    "drtg": 115.0,
    "pace": 100.0,
    "efg": 0.545,
    "tov_pct": 13.5,
    "orb_pct": 25.0,
    "ft_rate": 0.23,
}


@dataclass
class GameRecord:
    """Represents a single NBA game with all stats."""
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


@dataclass
class TeamGameHistory:
    """Tracks a team's game history for rolling calculations."""
    team_id: int
    team_abbrev: str
    games: deque  # Recent games with stats
    game_dates: deque  # Dates of games for rest day calculation
    
    def __init__(self, team_id: int, team_abbrev: str, max_history: int = 30):
        self.team_id = team_id
        self.team_abbrev = team_abbrev
        self.games = deque(maxlen=max_history)
        self.game_dates = deque(maxlen=max_history)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build NBA totals residual training dataset")
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--seasons", nargs="*", default=["2022_23", "2023_24", "2024_25", "2025_26"])
    parser.add_argument("--min-games", type=int, default=5, help="Min games before including samples")
    parser.add_argument("--include-playoffs", action="store_true")
    parser.add_argument("--parquet", action="store_true", default=True)
    return parser.parse_args()


def discover_game_files(source_dir: Path, seasons: Iterable[str]) -> List[Path]:
    """Find all game JSON files for requested seasons."""
    if not source_dir.exists():
        raise FileNotFoundError(f"Source directory not found: {source_dir}")
    
    normalized = {s.replace("-", "_") for s in seasons}
    files = []
    for path in sorted(source_dir.glob("games_*_nba_api.json")):
        season_slug = path.stem.replace("games_", "").replace("_nba_api", "").replace("-", "_")
        if season_slug in normalized:
            files.append(path)
    return files


def load_games(path: Path) -> List[GameRecord]:
    """Load games from JSON file."""
    with open(path, "r") as f:
        raw_games = json.load(f)
    
    games: List[GameRecord] = []
    for game in raw_games:
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
    """Filter games based on criteria."""
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


def calculate_advanced_stats(stats: Dict, opp_stats: Dict) -> Dict[str, float]:
    """
    Calculate advanced stats from box score.
    
    Returns: ortg, drtg, pace, efg, tov_pct, orb_pct, ft_rate
    """
    # Basic stats
    fgm = stats.get("fgm", 0) or 0
    fga = stats.get("fga", 1) or 1
    fg3m = stats.get("fg3m", 0) or 0
    ftm = stats.get("ftm", 0) or 0
    fta = stats.get("fta", 0) or 0
    oreb = stats.get("offRebounds", 0) or 0
    dreb = stats.get("defRebounds", 0) or 0
    tov = stats.get("turnovers", 0) or 0
    pts = stats.get("points", 0) or 0
    
    opp_fga = opp_stats.get("fga", 1) or 1
    opp_ftm = opp_stats.get("ftm", 0) or 0
    opp_fta = opp_stats.get("fta", 0) or 0
    opp_oreb = opp_stats.get("offRebounds", 0) or 0
    opp_dreb = opp_stats.get("defRebounds", 0) or 0
    opp_tov = opp_stats.get("turnovers", 0) or 0
    opp_pts = opp_stats.get("points", 0) or 0
    
    # Possessions (estimate)
    poss = 0.5 * ((fga + 0.4 * fta - 1.07 * (oreb / (oreb + opp_dreb + 0.1)) * (fga - fgm) + tov) + 
                  (opp_fga + 0.4 * opp_fta - 1.07 * (opp_oreb / (opp_oreb + dreb + 0.1)) * (opp_fga - opp_stats.get("fgm", 0)) + opp_tov))
    poss = max(poss, 80)  # Floor at reasonable minimum
    
    # Offensive Rating (points per 100 possessions)
    ortg = (pts / poss) * 100 if poss > 0 else LEAGUE_AVERAGES["ortg"]
    
    # Defensive Rating (opp points per 100 possessions)
    drtg = (opp_pts / poss) * 100 if poss > 0 else LEAGUE_AVERAGES["drtg"]
    
    # Pace (possessions per 48 minutes)
    pace = (poss / 48) * 48 if poss > 0 else LEAGUE_AVERAGES["pace"]
    
    # Effective FG% = (FGM + 0.5 * 3PM) / FGA
    efg = (fgm + 0.5 * fg3m) / fga if fga > 0 else LEAGUE_AVERAGES["efg"]
    
    # Turnover % = TOV / (FGA + 0.44 * FTA + TOV)
    tov_pct = tov / (fga + 0.44 * fta + tov) * 100 if (fga + 0.44 * fta + tov) > 0 else LEAGUE_AVERAGES["tov_pct"]
    
    # Offensive Rebound % = OREB / (OREB + OPP_DREB)
    orb_pct = oreb / (oreb + opp_dreb + 0.1) * 100
    
    # FT Rate = FTA / FGA
    ft_rate = fta / fga if fga > 0 else LEAGUE_AVERAGES["ft_rate"]
    
    return {
        "ortg": ortg,
        "drtg": drtg,
        "pace": pace,
        "efg": efg,
        "tov_pct": tov_pct,
        "orb_pct": orb_pct,
        "ft_rate": ft_rate,
    }


def rolling_average(history: List[Dict], keys: List[str], window: int) -> Dict[str, float]:
    """Calculate rolling average of specified keys."""
    if not history:
        return {key: LEAGUE_AVERAGES.get(key, 0) for key in keys}
    
    sample = history[-window:]
    result = {}
    for key in keys:
        values = [g[key] for g in sample if key in g and g[key] is not None]
        if values:
            result[key] = np.mean(values)
        else:
            result[key] = LEAGUE_AVERAGES.get(key, 0)
    return result


def calculate_rest_days(team_history: TeamGameHistory, current_date: datetime) -> int:
    """Calculate days since last game."""
    if not team_history.game_dates:
        return 3  # Default to well-rested
    
    last_game = team_history.game_dates[-1]
    delta = (current_date.date() - last_game.date()).days
    return min(delta, 5)  # Cap at 5+


def calculate_schedule_flags(team_history: TeamGameHistory, current_date: datetime) -> Dict[str, int]:
    """Calculate scheduling density flags (back-to-back, 3-in-4, etc.)."""
    if len(team_history.game_dates) < 2:
        return {"b2b": 0, "three_in_four": 0, "four_in_six": 0}
    
    dates = list(team_history.game_dates) + [current_date]
    
    # Back-to-back: game yesterday
    b2b = 1 if (current_date.date() - dates[-2].date()).days == 1 else 0
    
    # 3-in-4: 3 games in 4 days
    three_in_four = 0
    if len(dates) >= 3:
        span = (current_date.date() - dates[-3].date()).days
        if span <= 4:
            three_in_four = 1
    
    # 4-in-6: 4 games in 6 days
    four_in_six = 0
    if len(dates) >= 4:
        span = (current_date.date() - dates[-4].date()).days
        if span <= 6:
            four_in_six = 1
    
    return {"b2b": b2b, "three_in_four": three_in_four, "four_in_six": four_in_six}


def load_market_odds() -> Dict[str, Dict]:
    """Load all market odds files into a lookup dict by (date, home_team, away_team)."""
    print("📊 Loading historical market odds...")
    
    odds_lookup = {}
    manifest_path = ODDS_DIR / "game_totals_manifest_v1.json"
    
    if not manifest_path.exists():
        print("  ⚠️  No market odds found - residual features will be NaN")
        return odds_lookup
    
    with open(manifest_path) as f:
        manifest = json.load(f)
    
    for file_info in manifest['files']:
        date_str = file_info['date']
        date_slug = date_str.replace('-', '')
        odds_file = ODDS_DIR / f"game_totals_{date_slug}_v1.json"
        
        if not odds_file.exists():
            continue
        
        with open(odds_file) as f:
            odds_data = json.load(f)
        
        for game in odds_data.get('games', []):
            # Normalize team names (same as in backtest dataset builder)
            home_team = normalize_team_name(game['home_team'])
            away_team = normalize_team_name(game['away_team'])
            
            consensus = game.get('consensus', {}).get('totals', {})
            bookmakers = game.get('bookmakers', {}).get('totals', {})
            
            key = (date_str, home_team, away_team)
            odds_lookup[key] = {
                'consensus_line': consensus.get('line'),
                'fanduel_line': bookmakers.get('fanduel', {}).get('line'),
                'draftkings_line': bookmakers.get('draftkings', {}).get('line'),
                'betmgm_line': bookmakers.get('betmgm', {}).get('line'),
            }
    
    print(f"  ✅ Loaded odds for {len(odds_lookup):,} games")
    return odds_lookup


def normalize_team_name(name: str) -> str:
    """Normalize team names between odds API and games data."""
    # Abbreviations to full names
    abbrev_map = {
        'ATL': 'Atlanta Hawks', 'BOS': 'Boston Celtics', 'BKN': 'Brooklyn Nets',
        'CHA': 'Charlotte Hornets', 'CHI': 'Chicago Bulls', 'CLE': 'Cleveland Cavaliers',
        'DAL': 'Dallas Mavericks', 'DEN': 'Denver Nuggets', 'DET': 'Detroit Pistons',
        'GSW': 'Golden State Warriors', 'HOU': 'Houston Rockets', 'IND': 'Indiana Pacers',
        'LAC': 'LA Clippers', 'LAL': 'Los Angeles Lakers', 'MEM': 'Memphis Grizzlies',
        'MIA': 'Miami Heat', 'MIL': 'Milwaukee Bucks', 'MIN': 'Minnesota Timberwolves',
        'NOP': 'New Orleans Pelicans', 'NYK': 'New York Knicks', 'OKC': 'Oklahoma City Thunder',
        'ORL': 'Orlando Magic', 'PHI': 'Philadelphia 76ers', 'PHX': 'Phoenix Suns',
        'POR': 'Portland Trail Blazers', 'SAC': 'Sacramento Kings', 'SAS': 'San Antonio Spurs',
        'TOR': 'Toronto Raptors', 'UTA': 'Utah Jazz', 'WAS': 'Washington Wizards',
    }
    
    # Handle LA Clippers variation
    if name == 'Los Angeles Clippers':
        return 'LA Clippers'
    
    return abbrev_map.get(name, name)


def build_features(
    home_history: TeamGameHistory,
    away_history: TeamGameHistory,
    current_date: datetime,
    is_home: bool = True
) -> Dict[str, float]:
    """
    Build comprehensive feature set for a matchup.
    
    All features computed from games BEFORE current_date only.
    """
    features = {}
    
    # Extract recent game stats
    home_games = list(home_history.games)
    away_games = list(away_history.games)
    
    if not home_games or not away_games:
        # Not enough history - return defaults
        return {}
    
    # ==============================================================
    # 1. TEAM STRENGTH METRICS
    # ==============================================================
    
    # L5, L10, Season averages
    for window, suffix in [(5, "l5"), (10, "l10"), (len(home_games), "season")]:
        home_avg = rolling_average(home_games, ["ortg", "drtg", "pace", "efg", "tov_pct", "orb_pct", "ft_rate"], min(window, len(home_games)))
        away_avg = rolling_average(away_games, ["ortg", "drtg", "pace", "efg", "tov_pct", "orb_pct", "ft_rate"], min(window, len(away_games)))
        
        for stat in ["ortg", "drtg", "pace", "efg", "tov_pct", "orb_pct", "ft_rate"]:
            features[f"home_{suffix}_{stat}"] = home_avg[stat]
            features[f"away_{suffix}_{stat}"] = away_avg[stat]
    
    # Net rating
    features["home_l10_net_rtg"] = features["home_l10_ortg"] - features["home_l10_drtg"]
    features["away_l10_net_rtg"] = features["away_l10_ortg"] - features["away_l10_drtg"]
    
    # ==============================================================
    # 2. CONTEXTUAL FEATURES
    # ==============================================================
    
    # Rest days
    features["home_rest_days"] = calculate_rest_days(home_history, current_date)
    features["away_rest_days"] = calculate_rest_days(away_history, current_date)
    
    # Schedule flags
    home_sched = calculate_schedule_flags(home_history, current_date)
    away_sched = calculate_schedule_flags(away_history, current_date)
    
    features["home_b2b"] = home_sched["b2b"]
    features["away_b2b"] = away_sched["b2b"]
    features["home_three_in_four"] = home_sched["three_in_four"]
    features["away_three_in_four"] = away_sched["three_in_four"]
    features["home_four_in_six"] = home_sched["four_in_six"]
    features["away_four_in_six"] = away_sched["four_in_six"]
    
    # ==============================================================
    # 3. MATCHUP INTERACTIONS
    # ==============================================================
    
    # Pace differential
    features["pace_diff"] = features["home_l10_pace"] - features["away_l10_pace"]
    
    # ORtg vs DRtg mismatches
    features["home_ortg_vs_away_drtg"] = features["home_l10_ortg"] - features["away_l10_drtg"]
    features["away_ortg_vs_home_drtg"] = features["away_l10_ortg"] - features["home_l10_drtg"]
    
    # Rating differentials
    features["ortg_diff"] = features["home_l10_ortg"] - features["away_l10_ortg"]
    features["drtg_diff"] = features["home_l10_drtg"] - features["away_l10_drtg"]
    features["net_rtg_diff"] = features["home_l10_net_rtg"] - features["away_l10_net_rtg"]
    
    # Four Factors differentials
    features["efg_diff"] = features["home_l10_efg"] - features["away_l10_efg"]
    features["tov_pct_diff"] = features["away_l10_tov_pct"] - features["home_l10_tov_pct"]  # Lower is better
    features["orb_pct_diff"] = features["home_l10_orb_pct"] - features["away_l10_orb_pct"]
    features["ft_rate_diff"] = features["home_l10_ft_rate"] - features["away_l10_ft_rate"]
    
    # ==============================================================
    # 4. HOME COURT
    # ==============================================================
    
    features["home_court"] = 1.0 if is_home else 0.0
    
    return features


def build_dataset(args: argparse.Namespace) -> pd.DataFrame:
    """Build the complete residual dataset."""
    print("\n" + "="*70)
    print("NBA TOTALS RESIDUAL DATASET BUILDER")
    print("="*70)
    
    files = discover_game_files(args.source_dir, args.seasons)
    if not files:
        raise SystemExit("No source files found for requested seasons")
    
    # Load market odds
    market_odds = load_market_odds()
    
    # Track team histories
    team_histories: Dict[int, TeamGameHistory] = {}
    rows: List[Dict] = []
    
    total_games_processed = 0
    games_with_odds = 0
    
    for file_path in files:
        games = [g for g in load_games(file_path) if should_include_game(g, args.include_playoffs, None)]
        games.sort(key=lambda g: (g.date, g.game_id))
        season_slug = file_path.stem.replace("games_", "").replace("_nba_api", "").replace("-", "_")
        print(f"\n📅 Processing {season_slug}: {len(games)} games")
        
        for game in games:
            total_games_processed += 1
            
            # Initialize team histories if needed
            if game.home_team_id not in team_histories:
                team_histories[game.home_team_id] = TeamGameHistory(game.home_team_id, game.home_team)
            if game.away_team_id not in team_histories:
                team_histories[game.away_team_id] = TeamGameHistory(game.away_team_id, game.away_team)
            
            home_hist = team_histories[game.home_team_id]
            away_hist = team_histories[game.away_team_id]
            
            # Check minimum games
            if len(home_hist.games) < args.min_games or len(away_hist.games) < args.min_games:
                # Update histories but don't create training sample yet
                home_adv = calculate_advanced_stats(game.home_stats, game.away_stats)
                away_adv = calculate_advanced_stats(game.away_stats, game.home_stats)
                home_hist.games.append(home_adv)
                away_hist.games.append(away_adv)
                home_hist.game_dates.append(game.date)
                away_hist.game_dates.append(game.date)
                continue
            
            # Build features (using only past data)
            features = build_features(home_hist, away_hist, game.date, is_home=True)
            
            if not features:
                # Skip if features couldn't be computed
                home_adv = calculate_advanced_stats(game.home_stats, game.away_stats)
                away_adv = calculate_advanced_stats(game.away_stats, game.home_stats)
                home_hist.games.append(home_adv)
                away_hist.games.append(away_adv)
                home_hist.game_dates.append(game.date)
                away_hist.game_dates.append(game.date)
                continue
            
            # Get market odds for this game
            date_str = game.date.strftime("%Y-%m-%d")
            home_team_full = normalize_team_name(game.home_team)
            away_team_full = normalize_team_name(game.away_team)
            odds_key = (date_str, home_team_full, away_team_full)
            
            odds = market_odds.get(odds_key, {})
            consensus_line = odds.get('consensus_line')
            
            if consensus_line is not None:
                games_with_odds += 1
            
            # Calculate targets
            actual_total = (game.home_score or 0) + (game.away_score or 0)
            actual_spread = (game.home_score or 0) - (game.away_score or 0)
            
            # Residual target (if we have market line)
            target_residual = actual_total - consensus_line if consensus_line is not None else None
            
            # Create row
            row = {
                "season": game.season_slug,
                "game_id": game.game_id,
                "date": date_str,
                "home_team": game.home_team,
                "away_team": game.away_team,
                "home_score": game.home_score,
                "away_score": game.away_score,
                "actual_total": actual_total,
                "actual_spread": actual_spread,
                # Market features
                "consensus_total_line": consensus_line,
                "fanduel_total_line": odds.get('fanduel_line'),
                "draftkings_total_line": odds.get('draftkings_line'),
                "betmgm_total_line": odds.get('betmgm_line'),
                "target_residual": target_residual,
                **features,
            }
            
            rows.append(row)
            
            # Update histories (THIS GAME NOW BECOMES PART OF HISTORY)
            home_adv = calculate_advanced_stats(game.home_stats, game.away_stats)
            away_adv = calculate_advanced_stats(game.away_stats, game.home_stats)
            home_hist.games.append(home_adv)
            away_hist.games.append(away_adv)
            home_hist.game_dates.append(game.date)
            away_hist.game_dates.append(game.date)
    
    if not rows:
        raise SystemExit("No training rows generated")
    
    df = pd.DataFrame(rows)
    df.sort_values("date", inplace=True)
    df.reset_index(drop=True, inplace=True)
    
    print(f"\n📊 Dataset Statistics:")
    print(f"  Total games processed: {total_games_processed:,}")
    print(f"  Training samples: {len(df):,}")
    print(f"  Games with market odds: {games_with_odds:,} ({100*games_with_odds/len(df):.1f}%)")
    print(f"  Date range: {df['date'].min()} → {df['date'].max()}")
    
    return df


def write_outputs(df: pd.DataFrame, output_dir: Path, write_parquet: bool) -> Dict:
    """Write dataset and metadata."""
    output_dir.mkdir(parents=True, exist_ok=True)
    
    csv_path = output_dir / DATASET_FILENAME
    df.to_csv(csv_path, index=False)
    print(f"\n✅ Wrote CSV: {csv_path} ({len(df):,} samples)")
    
    parquet_path = None
    if write_parquet:
        parquet_path = output_dir / PARQUET_FILENAME
        df.to_parquet(parquet_path, index=False)
        print(f"✅ Wrote Parquet: {parquet_path}")
    
    # Feature columns (everything except meta/target columns)
    exclude_cols = {"season", "game_id", "date", "home_team", "away_team", "home_score", "away_score", 
                    "actual_total", "actual_spread", "consensus_total_line", "fanduel_total_line", 
                    "draftkings_total_line", "betmgm_total_line", "target_residual"}
    feature_cols = [col for col in df.columns if col not in exclude_cols]
    
    # Create metadata
    summary = df.groupby("season").agg(
        count=("game_id", "count"),
        start_date=("date", "min"),
        end_date=("date", "max"),
        with_odds=("consensus_total_line", lambda x: x.notna().sum())
    ).reset_index().to_dict(orient="records")
    
    metadata = {
        "samples": len(df),
        "features": feature_cols,
        "num_features": len(feature_cols),
        "seasons": summary,
        "csv_path": str(csv_path.relative_to(REPO_ROOT)),
        "targets": ["actual_total", "target_residual"],
        "market_features": ["consensus_total_line", "fanduel_total_line", "draftkings_total_line", "betmgm_total_line"],
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
    
    print("\n" + "="*70)
    print("✅ RESIDUAL DATASET BUILD COMPLETE")
    print("="*70)
    print(f"\n📈 Feature Summary:")
    print(f"  Total features: {metadata['num_features']}")
    print(f"  Feature categories:")
    print(f"    - Team strength: ORtg, DRtg, Pace, Net Rating (L5/L10/Season)")
    print(f"    - Four Factors: eFG%, TOV%, ORB%, FT Rate")
    print(f"    - Context: Rest days, B2B, 3-in-4, 4-in-6")
    print(f"    - Matchups: Pace diff, ORtg vs DRtg, differentials")
    print(f"    - Market: Consensus & per-book lines")
    print(f"\n📊 Per-Season Summary:")
    for season_info in metadata["seasons"]:
        print(f"  {season_info['season']}: {season_info['count']:,} games, "
              f"{season_info['with_odds']:,} with odds "
              f"({season_info['start_date']} → {season_info['end_date']})")


if __name__ == "__main__":
    main()
