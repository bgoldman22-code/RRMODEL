#!/usr/bin/env python3
"""
Builds the UNDER-specific training dataset for NBA totals model.

This extends the residual dataset builder with UNDER-focused features:
- Blowout/spread risk indicators
- Pace suppression metrics
- Defensive suppression proxies
- Time-of-day/scheduling factors
- Classification target: target_under_win (1 if actual < market, else 0)

All features computed CHRONOLOGICALLY with ZERO lookahead.

Usage:
  python ml/nba_totals_build_under_dataset.py --seasons 2022_23 2023_24 2024_25 2025_26
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

# Reuse the core dataset builder logic
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))

# Import shared utilities from residual builder
from nba_totals_build_residual_dataset import (
    GameRecord,
    TeamGameHistory,
    discover_game_files,
    load_games,
    should_include_game,
    calculate_advanced_stats,
    rolling_average,
    calculate_rest_days,
    calculate_schedule_flags,
    load_market_odds,
    normalize_team_name,
    REPO_ROOT,
    DEFAULT_SOURCE_DIR,
    SEASON_STARTS,
    LEAGUE_AVERAGES,
)

DEFAULT_OUTPUT_DIR = REPO_ROOT / "data" / "nba" / "datasets"
ODDS_DIR = REPO_ROOT / "data" / "nba" / "historical_odds" / "game_totals"

DATASET_FILENAME = "nba_totals_under_dataset.csv"
METADATA_FILENAME = "nba_totals_under_metadata.json"
PARQUET_FILENAME = "nba_totals_under_dataset.parquet"


def load_market_odds_with_spreads() -> Dict[str, Dict]:
    """
    Load market odds INCLUDING spread data for UNDER features.
    
    This is a specialized version of load_market_odds() that also extracts spreads.
    """
    print("📊 Loading historical market odds (with spreads)...")
    
    odds_lookup = {}
    manifest_path = ODDS_DIR / "game_totals_manifest_v1.json"
    
    if not manifest_path.exists():
        print("  ⚠️  No market odds found")
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
            home_team = normalize_team_name(game['home_team'])
            away_team = normalize_team_name(game['away_team'])
            
            # Extract totals
            consensus_totals = game.get('consensus', {}).get('totals', {})
            bookmakers_totals = game.get('bookmakers', {}).get('totals', {})
            
            # Extract spreads (NEW for UNDER model)
            consensus_spreads = game.get('consensus', {}).get('spreads', {})
            bookmakers_spreads = game.get('bookmakers', {}).get('spreads', {})
            
            # Consensus spread (home perspective: negative = home underdog)
            consensus_spread = consensus_spreads.get('home_line')
            
            # If no consensus, try bookmaker averages
            if consensus_spread is None:
                spread_lines = []
                for book in ['fanduel', 'draftkings', 'betmgm']:
                    book_spread = bookmakers_spreads.get(book, {}).get('home_line')
                    if book_spread is not None:
                        spread_lines.append(book_spread)
                consensus_spread = np.mean(spread_lines) if spread_lines else None
            
            key = (date_str, home_team, away_team)
            odds_lookup[key] = {
                # Totals (existing)
                'consensus_line': consensus_totals.get('line'),
                'fanduel_line': bookmakers_totals.get('fanduel', {}).get('line'),
                'draftkings_line': bookmakers_totals.get('draftkings', {}).get('line'),
                'betmgm_line': bookmakers_totals.get('betmgm', {}).get('line'),
                # Spreads (NEW)
                'closing_spread': consensus_spread,
            }
    
    print(f"  ✅ Loaded odds for {len(odds_lookup):,} games")
    
    # Count how many have spread data
    with_spreads = sum(1 for v in odds_lookup.values() if v.get('closing_spread') is not None)
    print(f"  📊 Games with spread data: {with_spreads:,} ({100*with_spreads/len(odds_lookup):.1f}%)")
    
    return odds_lookup


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build NBA totals UNDER-specific training dataset")
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--seasons", nargs="*", default=["2022_23", "2023_24", "2024_25", "2025_26"])
    parser.add_argument("--min-games", type=int, default=5, help="Min games before including samples")
    parser.add_argument("--include-playoffs", action="store_true")
    parser.add_argument("--parquet", action="store_true", default=True)
    return parser.parse_args()


def calculate_blowout_features(
    spread: Optional[float],
    actual_margin: Optional[float],
) -> Dict[str, float]:
    """
    Calculate blowout risk indicators.
    
    Args:
        spread: Closing spread (positive = home favored)
        actual_margin: Actual final margin (home - away)
    
    Returns dict with:
        - spread_abs: Absolute value of spread
        - spread_squared: Square of spread (captures non-linear blowout risk)
        - blowout_risk_index: Normalized blowout risk (0-1 scale)
        - close_game_flag: 1 if actual margin <= 5, else 0 (for analysis)
        - blowout_flag: 1 if actual margin >= 15, else 0 (for analysis)
    """
    if spread is None:
        # No spread data available
        return {
            "spread_abs": np.nan,
            "spread_squared": np.nan,
            "blowout_risk_index": np.nan,
            "close_game_flag": np.nan,
            "blowout_flag": np.nan,
        }
    
    spread_abs = abs(spread)
    spread_squared = spread ** 2
    
    # Blowout risk index: normalized sigmoid-ish function
    # Higher spread = higher blowout risk
    # Cap at spread_abs = 15 (extreme blowout territory)
    blowout_risk = min(spread_abs / 15.0, 1.0)
    
    # Actual game outcome flags (for label analysis, not model input)
    if actual_margin is not None:
        close_game = 1 if abs(actual_margin) <= 5 else 0
        blowout = 1 if abs(actual_margin) >= 15 else 0
    else:
        close_game = np.nan
        blowout = np.nan
    
    return {
        "spread_abs": spread_abs,
        "spread_squared": spread_squared,
        "blowout_risk_index": blowout_risk,
        "close_game_flag": close_game,
        "blowout_flag": blowout,
    }


def calculate_pace_suppression_features(
    home_pace_history: List[Dict],
    away_pace_history: List[Dict],
    home_drtg_history: List[Dict],
    away_drtg_history: List[Dict],
) -> Dict[str, float]:
    """
    Calculate pace suppression and matchup pace indicators.
    
    Returns:
        - pace_elasticity: How much faster/slower than league average
        - pace_diff: Home pace - Away pace (mismatch indicator)
        - home_pace_suppression_proxy: How much home defense slows opponent
        - away_pace_suppression_proxy: How much away defense slows opponent
    """
    # Get recent pace averages
    home_pace_l5 = rolling_average(home_pace_history, ["pace"], 5).get("pace", LEAGUE_AVERAGES["pace"])
    away_pace_l5 = rolling_average(away_pace_history, ["pace"], 5).get("pace", LEAGUE_AVERAGES["pace"])
    
    # Pace elasticity: deviation from league average
    avg_pace = (home_pace_l5 + away_pace_l5) / 2
    pace_elasticity = avg_pace - LEAGUE_AVERAGES["pace"]
    
    # Pace differential
    pace_diff = home_pace_l5 - away_pace_l5
    
    # Pace suppression proxies
    # TODO: Need opponent pace data for true suppression metrics
    # For now, use DRtg as a proxy (better defense = slower opponent pace)
    home_drtg_l5 = rolling_average(home_drtg_history, ["drtg"], 5).get("drtg", LEAGUE_AVERAGES["drtg"])
    away_drtg_l5 = rolling_average(away_drtg_history, ["drtg"], 5).get("drtg", LEAGUE_AVERAGES["drtg"])
    
    # Lower DRtg = better defense = more pace suppression
    # Normalize: league avg ~115, elite defense ~105, poor defense ~120
    home_pace_suppression = max(0, (115 - home_drtg_l5) / 10)  # 0-1 scale
    away_pace_suppression = max(0, (115 - away_drtg_l5) / 10)
    
    return {
        "pace_elasticity": pace_elasticity,
        "pace_diff": pace_diff,
        "home_pace_suppression_proxy": home_pace_suppression,
        "away_pace_suppression_proxy": away_pace_suppression,
    }


def calculate_defensive_suppression_features(
    home_drtg_history: List[Dict],
    away_drtg_history: List[Dict],
    home_opp_efg_history: List[Dict],
    away_opp_efg_history: List[Dict],
) -> Dict[str, float]:
    """
    Calculate defensive suppression metrics.
    
    TODO: Need opponent eFG% allowed data for true defensive metrics.
    For now, using DRtg as primary proxy.
    
    Returns:
        - home_def_suppression_proxy: Home team defensive strength
        - away_def_suppression_proxy: Away team defensive strength
        - combined_def_strength: Combined defensive rating
    """
    home_drtg_l5 = rolling_average(home_drtg_history, ["drtg"], 5).get("drtg", LEAGUE_AVERAGES["drtg"])
    away_drtg_l5 = rolling_average(away_drtg_history, ["drtg"], 5).get("drtg", LEAGUE_AVERAGES["drtg"])
    
    home_drtg_season = rolling_average(home_drtg_history, ["drtg"], 30).get("drtg", LEAGUE_AVERAGES["drtg"])
    away_drtg_season = rolling_average(away_drtg_history, ["drtg"], 30).get("drtg", LEAGUE_AVERAGES["drtg"])
    
    # Defensive suppression: lower DRtg = better defense
    # Normalize to 0-1 scale (105 = elite, 120 = poor)
    home_def_suppression = max(0, (120 - home_drtg_l5) / 15)
    away_def_suppression = max(0, (120 - away_drtg_l5) / 15)
    
    # Combined defensive strength (higher = more UNDER-friendly)
    combined_def_strength = (home_def_suppression + away_def_suppression) / 2
    
    # TODO: Add opponent eFG% allowed when data becomes available
    # Placeholder columns for future enhancement
    home_opp_efg_allowed = np.nan  # Will be calculated from opponent eFG% data
    away_opp_efg_allowed = np.nan
    
    return {
        "home_def_suppression_proxy": home_def_suppression,
        "away_def_suppression_proxy": away_def_suppression,
        "combined_def_strength": combined_def_strength,
        "home_opp_efg_allowed": home_opp_efg_allowed,  # TODO: Implement
        "away_opp_efg_allowed": away_opp_efg_allowed,  # TODO: Implement
    }


def calculate_time_and_scheduling_features(
    game: GameRecord,
    home_rest: int,
    away_rest: int,
    home_schedule_flags: Dict,
    away_schedule_flags: Dict,
) -> Dict[str, float]:
    """
    Calculate time-of-day and scheduling features.
    
    Returns:
        - local_start_hour: Hour of tip-off (UTC, TODO: add timezone conversion)
        - early_game_flag: 1 if game starts before 18:00 local, else 0
        - day_of_week: 0=Monday, 6=Sunday
        - weekend_flag: 1 if Sat/Sun, else 0
        - rest_advantage: Difference in rest days (home - away)
        - both_rested: 1 if both teams >= 2 days rest, else 0
    """
    # Extract hour from game datetime (UTC)
    # TODO: Convert to local timezone when timezone data is available
    utc_hour = game.date.hour
    
    # Assume most NBA games are 19:00-21:00 local (22:00-00:00 UTC for ET)
    # Early games (afternoon) would be 17:00-19:00 UTC
    # This is a rough heuristic - proper implementation needs timezone lookup
    early_game = 1 if utc_hour < 22 else 0
    
    # Day of week
    day_of_week = game.date.weekday()  # 0=Monday, 6=Sunday
    weekend = 1 if day_of_week >= 5 else 0
    
    # Rest advantage
    rest_advantage = home_rest - away_rest
    
    # Both teams well-rested (potentially lower scoring - less urgency)
    both_rested = 1 if (home_rest >= 2 and away_rest >= 2) else 0
    
    return {
        "utc_start_hour": utc_hour,
        "early_game_flag": early_game,
        "day_of_week": day_of_week,
        "weekend_flag": weekend,
        "rest_advantage": rest_advantage,
        "both_teams_rested": both_rested,
    }


def build_under_features(
    game: GameRecord,
    team_histories: Dict[int, TeamGameHistory],
    market_odds: Dict[str, Dict],
) -> Optional[Dict]:
    """
    Build complete feature vector for UNDER model.
    
    Combines:
    - All existing residual model features (ORtg, DRtg, Pace, Four Factors, etc.)
    - New UNDER-specific features (blowout, pace suppression, defense, timing)
    - Classification targets (target_under_win, target_over_win)
    """
    home_history = team_histories.get(game.home_team_id)
    away_history = team_histories.get(game.away_team_id)
    
    if not home_history or not away_history:
        return None
    
    if len(home_history.games) < 5 or len(away_history.games) < 5:
        return None
    
    # Calculate current game advanced stats
    home_adv = calculate_advanced_stats(game.home_stats, game.away_stats)
    away_adv = calculate_advanced_stats(game.away_stats, game.home_stats)
    
    # Get market odds
    date_str = game.date.strftime("%Y-%m-%d")
    home_team_full = normalize_team_name(game.home_team)
    away_team_full = normalize_team_name(game.away_team)
    odds_key = (date_str, home_team_full, away_team_full)
    odds = market_odds.get(odds_key, {})
    
    consensus_line = odds.get("consensus_line")
    fanduel_line = odds.get("fanduel_line")
    draftkings_line = odds.get("draftkings_line")
    betmgm_line = odds.get("betmgm_line")
    
    # Actual total
    actual_total = (game.home_score + game.away_score) if (game.home_score is not None and game.away_score is not None) else None
    actual_margin = (game.home_score - game.away_score) if (game.home_score is not None and game.away_score is not None) else None
    
    # Closing spread (NOW AVAILABLE!)
    closing_spread = odds.get("closing_spread")  # Home perspective: negative = underdog
    
    # Rest days
    home_rest = calculate_rest_days(home_history, game.date)
    away_rest = calculate_rest_days(away_history, game.date)
    
    # Schedule flags
    home_schedule = calculate_schedule_flags(home_history, game.date)
    away_schedule = calculate_schedule_flags(away_history, game.date)
    
    # Convert deques to lists for rolling_average
    home_games = list(home_history.games)
    away_games = list(away_history.games)
    
    # Rolling averages (reuse from residual builder)
    stat_keys = ["ortg", "drtg", "pace", "efg", "tov_pct", "orb_pct", "ft_rate"]
    
    home_l5 = rolling_average(home_games, stat_keys, 5)
    away_l5 = rolling_average(away_games, stat_keys, 5)
    home_l10 = rolling_average(home_games, stat_keys, 10)
    away_l10 = rolling_average(away_games, stat_keys, 10)
    home_season = rolling_average(home_games, stat_keys, 30)
    away_season = rolling_average(away_games, stat_keys, 30)
    
    # NEW: UNDER-specific features
    blowout_feats = calculate_blowout_features(closing_spread, actual_margin)
    pace_supp_feats = calculate_pace_suppression_features(
        home_games, away_games,
        home_games, away_games,
    )
    def_supp_feats = calculate_defensive_suppression_features(
        home_games, away_games,
        home_games, away_games,  # TODO: opponent eFG%
    )
    time_sched_feats = calculate_time_and_scheduling_features(
        game, home_rest, away_rest, home_schedule, away_schedule,
    )
    
    # Build feature dict
    features = {
        # Identifiers
        "game_id": game.game_id,
        "date": game.date.strftime("%Y-%m-%d"),
        "season": game.season_slug,
        "home_team": game.home_team,
        "away_team": game.away_team,
        
        # Actual outcomes
        "actual_total": actual_total,
        "actual_margin": actual_margin,
        
        # Market lines
        "consensus_total_line": consensus_line,
        "fanduel_total_line": fanduel_line,
        "draftkings_total_line": draftkings_line,
        "betmgm_total_line": betmgm_line,
        "closing_spread": closing_spread,  # TODO: Implement
        
        # Classification targets
        "target_under_win": 1 if (actual_total is not None and consensus_line is not None and actual_total < consensus_line) else (0 if (actual_total is not None and consensus_line is not None) else np.nan),
        "target_over_win": 1 if (actual_total is not None and consensus_line is not None and actual_total > consensus_line) else (0 if (actual_total is not None and consensus_line is not None) else np.nan),
        "target_residual": (actual_total - consensus_line) if (actual_total is not None and consensus_line is not None) else np.nan,
        
        # Core team strength (L5)
        "home_l5_ortg": home_l5["ortg"],
        "home_l5_drtg": home_l5["drtg"],
        "home_l5_pace": home_l5["pace"],
        "home_l5_efg": home_l5["efg"],
        "home_l5_tov_pct": home_l5["tov_pct"],
        "home_l5_orb_pct": home_l5["orb_pct"],
        "home_l5_ft_rate": home_l5["ft_rate"],
        
        "away_l5_ortg": away_l5["ortg"],
        "away_l5_drtg": away_l5["drtg"],
        "away_l5_pace": away_l5["pace"],
        "away_l5_efg": away_l5["efg"],
        "away_l5_tov_pct": away_l5["tov_pct"],
        "away_l5_orb_pct": away_l5["orb_pct"],
        "away_l5_ft_rate": away_l5["ft_rate"],
        
        # Core team strength (L10)
        "home_l10_ortg": home_l10["ortg"],
        "home_l10_drtg": home_l10["drtg"],
        "home_l10_pace": home_l10["pace"],
        
        "away_l10_ortg": away_l10["ortg"],
        "away_l10_drtg": away_l10["drtg"],
        "away_l10_pace": away_l10["pace"],
        
        # Season averages
        "home_season_ortg": home_season["ortg"],
        "home_season_drtg": home_season["drtg"],
        "home_season_pace": home_season["pace"],
        "home_season_ft_rate": home_season["ft_rate"],
        "home_season_tov_pct": home_season["tov_pct"],
        "home_season_orb_pct": home_season["orb_pct"],
        
        "away_season_ortg": away_season["ortg"],
        "away_season_drtg": away_season["drtg"],
        "away_season_pace": away_season["pace"],
        "away_season_ft_rate": away_season["ft_rate"],
        "away_season_tov_pct": away_season["tov_pct"],
        "away_season_orb_pct": away_season["orb_pct"],
        
        # Differentials
        "ortg_diff": home_l5["ortg"] - away_l5["ortg"],
        "drtg_diff": home_l5["drtg"] - away_l5["drtg"],
        
        # Matchup interactions
        "home_ortg_vs_away_drtg": home_l5["ortg"] - away_l5["drtg"],
        "away_ortg_vs_home_drtg": away_l5["ortg"] - home_l5["drtg"],
        
        # Rest & scheduling
        "home_rest_days": home_rest,
        "away_rest_days": away_rest,
        "home_b2b": home_schedule["b2b"],
        "away_b2b": away_schedule["b2b"],
        "home_3in4": home_schedule["three_in_four"],
        "away_3in4": away_schedule["three_in_four"],
        "home_4in6": home_schedule["four_in_six"],
        "away_4in6": away_schedule["four_in_six"],
        
        # Home court
        "home_court": 1,
    }
    
    # Add UNDER-specific features
    features.update(blowout_feats)
    features.update(pace_supp_feats)
    features.update(def_supp_feats)
    features.update(time_sched_feats)
    
    return features


def main():
    args = parse_args()
    
    print("=" * 80)
    print("NBA TOTALS UNDER-SPECIFIC DATASET BUILDER")
    print("=" * 80)
    print(f"\n🎯 Building UNDER-focused features with classification targets")
    print(f"   Source: {args.source_dir}")
    print(f"   Output: {args.output_dir}")
    print(f"   Seasons: {', '.join(args.seasons)}")
    
    # Discover and load game files
    game_files = discover_game_files(args.source_dir, args.seasons)
    if not game_files:
        raise ValueError(f"No game files found for seasons: {args.seasons}")
    
    print(f"\n📂 Found {len(game_files)} game files:")
    for gf in game_files:
        print(f"   - {gf.name}")
    
    # Load all games
    all_games: List[GameRecord] = []
    for gf in game_files:
        games = load_games(gf)
        filtered = [g for g in games if should_include_game(g, args.include_playoffs, None)]
        all_games.extend(filtered)
        print(f"   Loaded {len(filtered)} games from {gf.name}")
    
    # Sort chronologically
    all_games.sort(key=lambda g: g.date)
    print(f"\n📊 Total games loaded: {len(all_games):,}")
    print(f"   Date range: {all_games[0].date.date()} → {all_games[-1].date.date()}")
    
    # Load market odds WITH SPREADS (custom loader for UNDER model)
    market_odds = load_market_odds_with_spreads()
    
    # Build dataset
    print(f"\n🔨 Building UNDER features (min {args.min_games} games)...")
    
    team_histories: Dict[int, TeamGameHistory] = {}
    samples: List[Dict] = []
    
    for i, game in enumerate(all_games):
        # Initialize team histories
        for team_id, team_abbrev in [(game.home_team_id, game.home_team), (game.away_team_id, game.away_team)]:
            if team_id not in team_histories:
                team_histories[team_id] = TeamGameHistory(team_id, team_abbrev, max_history=30)
        
        # Build features for this game
        features = build_under_features(game, team_histories, market_odds)
        
        if features is not None:
            samples.append(features)
        
        # Update team histories AFTER feature extraction
        home_adv = calculate_advanced_stats(game.home_stats, game.away_stats)
        away_adv = calculate_advanced_stats(game.away_stats, game.home_stats)
        
        team_histories[game.home_team_id].games.append(home_adv)
        team_histories[game.home_team_id].game_dates.append(game.date)
        
        team_histories[game.away_team_id].games.append(away_adv)
        team_histories[game.away_team_id].game_dates.append(game.date)
        
        if (i + 1) % 500 == 0:
            print(f"   Processed {i + 1:,}/{len(all_games):,} games ({len(samples):,} samples)")
    
    print(f"\n✅ Built {len(samples):,} training samples")
    
    # Convert to DataFrame
    df = pd.DataFrame(samples)
    
    # Stats
    with_odds = df["consensus_total_line"].notna().sum()
    under_wins = df["target_under_win"].sum()
    over_wins = df["target_over_win"].sum()
    
    print(f"\n📈 Dataset Statistics:")
    print(f"   Total samples: {len(df):,}")
    print(f"   With market odds: {with_odds:,} ({100*with_odds/len(df):.1f}%)")
    print(f"   UNDER wins: {int(under_wins):,} ({100*under_wins/with_odds:.1f}%)")
    print(f"   OVER wins: {int(over_wins):,} ({100*over_wins/with_odds:.1f}%)")
    print(f"   Pushes: {with_odds - under_wins - over_wins:.0f}")
    
    # Feature counts
    under_specific = [
        "spread_abs", "spread_squared", "blowout_risk_index",
        "pace_elasticity", "pace_diff", "home_pace_suppression_proxy", "away_pace_suppression_proxy",
        "home_def_suppression_proxy", "away_def_suppression_proxy", "combined_def_strength",
        "utc_start_hour", "early_game_flag", "day_of_week", "weekend_flag", "rest_advantage", "both_teams_rested",
    ]
    
    print(f"\n🆕 UNDER-Specific Features ({len(under_specific)}):")
    for feat in under_specific:
        non_null = df[feat].notna().sum()
        print(f"   - {feat}: {non_null:,}/{len(df):,} non-null")
    
    # Save outputs
    args.output_dir.mkdir(parents=True, exist_ok=True)
    
    csv_path = args.output_dir / DATASET_FILENAME
    df.to_csv(csv_path, index=False)
    print(f"\n💾 Saved CSV: {csv_path}")
    
    if args.parquet:
        parquet_path = args.output_dir / PARQUET_FILENAME
        df.to_parquet(parquet_path, index=False)
        print(f"💾 Saved Parquet: {parquet_path}")
    
    # Metadata
    metadata = {
        "created_at": datetime.now().isoformat(),
        "dataset_type": "under_classification",
        "seasons": args.seasons,
        "total_samples": len(df),
        "samples_with_odds": int(with_odds),
        "under_win_rate": float(under_wins / with_odds) if with_odds > 0 else None,
        "over_win_rate": float(over_wins / with_odds) if with_odds > 0 else None,
        "date_range": {
            "start": df["date"].min(),
            "end": df["date"].max(),
        },
        "feature_groups": {
            "core_team_strength": 40,
            "under_specific": len(under_specific),
            "total": len(df.columns),
        },
        "target_columns": ["target_under_win", "target_over_win", "target_residual"],
        "notes": [
            "UNDER-specific features added for classification model",
            "TODO: closing_spread requires odds API extension",
            "TODO: opponent eFG% allowed requires advanced stats",
            "TODO: local timezone conversion for accurate start times",
            "Blowout/pace/defense features use available proxies",
        ],
    }
    
    meta_path = args.output_dir / METADATA_FILENAME
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"💾 Saved metadata: {meta_path}")
    
    print("\n" + "=" * 80)
    print("✅ UNDER DATASET BUILD COMPLETE")
    print("=" * 80)
    print(f"\n📁 Output files:")
    print(f"   - {csv_path.relative_to(REPO_ROOT)}")
    if args.parquet:
        print(f"   - {parquet_path.relative_to(REPO_ROOT)}")
    print(f"   - {meta_path.relative_to(REPO_ROOT)}")
    print(f"\n🎯 Ready for UNDER classifier training!")


if __name__ == "__main__":
    main()
