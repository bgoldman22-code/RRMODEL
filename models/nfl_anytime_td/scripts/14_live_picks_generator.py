#!/usr/bin/env python3
"""
NFL Anytime TD Live Picks Generator
=====================================
Fetches live odds from The Odds API and generates picks based on
our statistically validated profitable strategies.

Usage:
    python3 14_live_picks_generator.py --week 16

Requires:
    ODDS_API_KEY environment variable

Author: NFL TD Model v1.5
Date: December 2025
"""

import os
import sys
import json
import pickle
import argparse
import requests
from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd
import numpy as np

# Paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / 'data'
MODEL_DIR = BASE_DIR / 'v1'
GATE_DIR = BASE_DIR / 'v1.2'
OUTPUT_DIR = DATA_DIR / 'live_picks'
OUTPUT_DIR.mkdir(exist_ok=True)

# Odds API config
ODDS_API_BASE = "https://api.the-odds-api.com/v4"
SPORT = "americanfootball_nfl"

# NFL Team mapping
TEAM_ABBREV = {
    'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
    'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
    'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
    'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
    'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
    'Kansas City Chiefs': 'KC', 'Los Angeles Rams': 'LA', 'Los Angeles Chargers': 'LAC',
    'Las Vegas Raiders': 'LV', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
    'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
    'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
    'Seattle Seahawks': 'SEA', 'San Francisco 49ers': 'SF', 'Tampa Bay Buccaneers': 'TB',
    'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS'
}

TEAM_FULL = {v: k for k, v in TEAM_ABBREV.items()}


def get_api_key():
    """Get Odds API key from environment."""
    key = os.environ.get('ODDS_API_KEY')
    if not key:
        print("❌ ERROR: ODDS_API_KEY environment variable not set")
        print("   Run: export ODDS_API_KEY=your_key_here")
        sys.exit(1)
    return key


def fetch_nfl_events(api_key, date_from, date_to):
    """Fetch NFL events in date range."""
    url = f"{ODDS_API_BASE}/sports/{SPORT}/events"
    params = {
        'apiKey': api_key,
        'dateFormat': 'iso',
        'commenceTimeFrom': date_from.isoformat() + 'Z',
        'commenceTimeTo': date_to.isoformat() + 'Z'
    }
    
    print(f"📡 Fetching NFL events from {date_from.date()} to {date_to.date()}...")
    resp = requests.get(url, params=params)
    
    if resp.status_code != 200:
        print(f"❌ API Error: {resp.status_code} - {resp.text}")
        return []
    
    events = resp.json()
    print(f"   Found {len(events)} games")
    
    return events


def fetch_player_props(api_key, event_id, market='player_anytime_td'):
    """Fetch player prop odds for a specific event."""
    url = f"{ODDS_API_BASE}/sports/{SPORT}/events/{event_id}/odds"
    params = {
        'apiKey': api_key,
        'regions': 'us',
        'markets': market,
        'oddsFormat': 'american'
    }
    
    resp = requests.get(url, params=params)
    
    if resp.status_code != 200:
        return []
    
    data = resp.json()
    
    # Parse bookmaker odds
    odds_records = []
    
    for bookmaker in data.get('bookmakers', []):
        book_name = bookmaker['key']
        
        for market_data in bookmaker.get('markets', []):
            if market_data['key'] != 'player_anytime_td':
                continue
            
            for outcome in market_data.get('outcomes', []):
                # Only YES side
                if outcome.get('name', '').lower() == 'no':
                    continue
                
                player_name = outcome.get('description', '')
                price = outcome.get('price', 0)
                
                if player_name and price:
                    odds_records.append({
                        'player_name': player_name,
                        'bookmaker': book_name,
                        'odds_american': price,
                        'event_id': event_id,
                        'home_team': data.get('home_team'),
                        'away_team': data.get('away_team'),
                        'commence_time': data.get('commence_time')
                    })
    
    return odds_records


def american_to_decimal(american):
    """Convert American odds to decimal."""
    if american > 0:
        return (american / 100) + 1
    else:
        return (100 / abs(american)) + 1


def load_model_artifacts():
    """Load trained model and configuration."""
    print("📦 Loading model artifacts...")
    
    # Load model
    model_path = MODEL_DIR / 'lightgbm_v1.pkl'
    with open(model_path, 'rb') as f:
        model = pickle.load(f)
    
    # Load features
    features_path = MODEL_DIR / 'feature_list_v1.json'
    with open(features_path, 'r') as f:
        features_data = json.load(f)
    features = features_data.get('features', features_data)
    
    # Load gate config
    gate_path = GATE_DIR / 'gate_config_v1.2.json'
    with open(gate_path, 'r') as f:
        gate_config = json.load(f)
    
    print(f"   Model: LightGBM v1.5")
    print(f"   Features: {len(features)}")
    
    return model, features, gate_config


def load_player_data(season=2025, max_week=15):
    """Load player historical data for feature computation."""
    df = pd.read_csv(DATA_DIR / 'player_td_core.csv')
    
    # Filter to recent data for lagged features
    df = df[(df['season'] == season) & (df['week'] <= max_week)]
    
    # Get most recent stats per player
    df = df.sort_values(['player_id', 'week'], ascending=[True, False])
    latest = df.groupby('player_id').first().reset_index()
    
    print(f"   Loaded {len(latest)} players with recent stats")
    
    return latest, df


def build_features(player_data, features):
    """Build feature matrix from player data."""
    df = player_data.copy()
    
    # Parse is_home
    if 'is_home' in df.columns and df['is_home'].dtype == object:
        df['is_home_bool'] = df['is_home'].map({'TRUE': 1, 'FALSE': 0, 'True': 1, 'False': 0, True: 1, False: 0}).fillna(0)
    else:
        df['is_home_bool'] = df.get('is_home', 0)
    
    # Feature mapping
    feature_map = {
        'feat_is_rb': lambda d: (d['position'] == 'RB').astype(float),
        'feat_is_wr': lambda d: (d['position'] == 'WR').astype(float),
        'feat_is_te': lambda d: (d['position'] == 'TE').astype(float),
        'feat_is_qb': lambda d: (d['position'] == 'QB').astype(float),
        'feat_is_home': lambda d: d['is_home_bool'].astype(float),
        'feat_carries_L5': lambda d: d['use_carries_L5'].fillna(0),
        'feat_targets_L5': lambda d: d['use_targets_L5'].fillna(0),
        'feat_touches_L5': lambda d: d['use_touches_L5'].fillna(0),
        'feat_rz_touches_L5': lambda d: d['rz_touches_L5'].fillna(0),
        'feat_rz_touches_i10_L5': lambda d: d['rz_touches_inside10_L5'].fillna(0),
        'feat_rz_opp_share_L5': lambda d: d['rz_opportunity_share_L5'].fillna(0),
        'feat_exp_plays_L5': lambda d: d['use_explosive_plays_L5'].fillna(0),
        'feat_snap_pct_L5': lambda d: d['snap_offense_pct_L5'].fillna(0),
        'feat_td_rate_L5': lambda d: d['ply_scored_td_L5'].fillna(0),
        'feat_td_rate_L10': lambda d: d['ply_scored_td_L10'].fillna(0),
    }
    
    X = pd.DataFrame(index=df.index)
    
    for feat in features:
        if feat in feature_map:
            X[feat] = feature_map[feat](df)
        elif feat in df.columns:
            X[feat] = df[feat].fillna(0)
        else:
            X[feat] = 0
    
    return X


def normalize_name(name):
    """Normalize player name for matching."""
    if pd.isna(name):
        return ""
    name = str(name).lower().strip()
    for suffix in [' jr.', ' jr', ' sr.', ' sr', ' iii', ' ii', ' iv']:
        name = name.replace(suffix, '')
    name = name.replace('.', '').replace("'", '').replace('-', ' ')
    return name.strip()


def generate_predictions(model, features, player_data):
    """Generate model predictions for all players."""
    X = build_features(player_data, features)
    X = X[features]
    
    preds = model.predict_proba(X)[:, 1]
    player_data = player_data.copy()
    player_data['p_model'] = preds
    
    return player_data


def match_odds_to_predictions(odds_df, pred_df):
    """Match live odds to model predictions."""
    # Normalize names
    odds_df = odds_df.copy()
    pred_df = pred_df.copy()
    
    odds_df['player_name_norm'] = odds_df['player_name'].apply(normalize_name)
    pred_df['player_name_norm'] = pred_df['player_name'].apply(normalize_name)
    
    # Create team mappings
    odds_df['home_abbrev'] = odds_df['home_team'].map(TEAM_ABBREV)
    odds_df['away_abbrev'] = odds_df['away_team'].map(TEAM_ABBREV)
    
    matched = []
    unmatched = []
    
    for _, odds_row in odds_df.iterrows():
        player_norm = odds_row['player_name_norm']
        home = odds_row['home_abbrev']
        away = odds_row['away_abbrev']
        
        # Find player in predictions
        matches = pred_df[
            (pred_df['player_name_norm'] == player_norm) &
            ((pred_df['team'] == home) | (pred_df['team'] == away))
        ]
        
        if len(matches) >= 1:
            player = matches.iloc[0]
            
            # Get TD rates safely (handle NaN)
            td_L5 = player['ply_scored_td_L5'] if 'ply_scored_td_L5' in player.index and pd.notna(player['ply_scored_td_L5']) else 0
            td_L10 = player['ply_scored_td_L10'] if 'ply_scored_td_L10' in player.index and pd.notna(player['ply_scored_td_L10']) else 0
            
            matched.append({
                'player_name': odds_row['player_name'],
                'player_id': player['player_id'],
                'team': player['team'],
                'position': player['position'],
                'opponent': away if player['team'] == home else home,
                'is_home': player['team'] == home,
                'p_model': player['p_model'],
                'td_rate_L5': float(td_L5),
                'td_rate_L10': float(td_L10),
                'odds_american': odds_row['odds_american'],
                'odds_decimal': american_to_decimal(odds_row['odds_american']),
                'bookmaker': odds_row['bookmaker'],
                'home_team': odds_row['home_team'],
                'away_team': odds_row['away_team'],
                'commence_time': odds_row['commence_time']
            })
        else:
            unmatched.append(odds_row['player_name'])
    
    return pd.DataFrame(matched), unmatched


def apply_strategies(df):
    """Apply profitable strategies and compute edge/Kelly."""
    df = df.copy()
    
    # Compute edge and Kelly
    df['implied_prob'] = 1 / df['odds_decimal']
    df['edge'] = df['p_model'] - df['implied_prob']
    df['edge_pct'] = df['edge'] * 100
    
    # Kelly
    df['b'] = df['odds_decimal'] - 1
    df['kelly_raw'] = (df['b'] * df['p_model'] - (1 - df['p_model'])) / df['b']
    df['kelly'] = df['kelly_raw'].clip(lower=0, upper=0.05)
    
    # EV per unit
    df['ev_per_unit'] = df['p_model'] * df['b'] - (1 - df['p_model'])
    
    # Filter: Exclude players with ZERO TDs in last 10 games
    # This removes players like Noah Gray who haven't scored all season
    df['has_recent_tds'] = df['td_rate_L10'] > 0
    
    # Strategy flags (only for players with recent TDs)
    df['strat_tier1_longshots'] = (
        df['has_recent_tds'] &
        (df['edge'] >= 0.07) & 
        (df['odds_decimal'] >= 2.75) & 
        (df['odds_decimal'] <= 5.00)
    )
    
    df['strat_tier1_cap_deep'] = (
        df['has_recent_tds'] &
        (df['edge'] >= 0.07) & 
        (df['odds_decimal'] >= 1.50) & 
        (df['odds_decimal'] <= 5.00)
    )
    
    df['strat_tier1_3pct_longshots'] = (
        df['has_recent_tds'] &
        (df['edge'] >= 0.03) & 
        (df['odds_decimal'] >= 2.75) & 
        (df['odds_decimal'] <= 5.00)
    )
    
    df['strat_tier2_10pct'] = (
        df['has_recent_tds'] &
        (df['edge'] >= 0.10) & 
        (df['odds_decimal'] >= 1.50)
    )
    
    df['strat_tier2_5pct_cap'] = (
        df['has_recent_tds'] &
        (df['edge'] >= 0.05) & 
        (df['odds_decimal'] >= 1.50) & 
        (df['odds_decimal'] <= 5.00)
    )
    
    df['strat_any_profitable'] = (
        df['strat_tier1_longshots'] | 
        df['strat_tier1_cap_deep'] | 
        df['strat_tier1_3pct_longshots'] |
        df['strat_tier2_10pct'] |
        df['strat_tier2_5pct_cap']
    )
    
    return df


def select_best_odds(df):
    """Select best odds per player (highest decimal odds)."""
    df = df.sort_values('odds_decimal', ascending=False)
    best = df.groupby('player_name').first().reset_index()
    return best


def format_picks_output(df, strategy_name, strategy_col):
    """Format picks for a specific strategy."""
    picks = df[df[strategy_col]].copy()
    
    if len(picks) == 0:
        return None
    
    picks = picks.sort_values('edge', ascending=False)
    
    # Format for display
    output = picks[[
        'player_name', 'team', 'position', 'opponent',
        'p_model', 'odds_american', 'odds_decimal', 'implied_prob',
        'edge_pct', 'kelly', 'bookmaker'
    ]].copy()
    
    output['p_model'] = (output['p_model'] * 100).round(1)
    output['implied_prob'] = (output['implied_prob'] * 100).round(1)
    output['edge_pct'] = output['edge_pct'].round(1)
    output['kelly'] = (output['kelly'] * 100).round(2)
    
    output.columns = [
        'Player', 'Team', 'Pos', 'Opp',
        'Model%', 'Odds', 'Dec', 'Implied%',
        'Edge%', 'Kelly%', 'Book'
    ]
    
    return output


def main():
    parser = argparse.ArgumentParser(description='Generate NFL Anytime TD picks')
    parser.add_argument('--week', type=int, default=16, help='NFL week number')
    # Default to a recent window in the *current* season so `--week` runs don't
    # accidentally query last year's events when dates aren't provided.
    today = datetime.now().date()
    default_from = today - timedelta(days=2)
    default_to = today + timedelta(days=2)
    parser.add_argument('--date-from', type=str, default=str(default_from), help='Start date (YYYY-MM-DD)')
    parser.add_argument('--date-to', type=str, default=str(default_to), help='End date (YYYY-MM-DD)')
    args = parser.parse_args()
    
    print("="*70)
    print(f"🏈 NFL ANYTIME TD LIVE PICKS - WEEK {args.week}")
    print("="*70)
    
    # Get API key
    api_key = get_api_key()
    
    # Parse dates
    date_from = datetime.fromisoformat(args.date_from)
    date_to = datetime.fromisoformat(args.date_to)
    
    # Step 1: Fetch events
    events = fetch_nfl_events(api_key, date_from, date_to)
    
    if not events:
        print("❌ No games found in date range")
        return
    
    # Display games
    print("\n📅 Games found:")
    for event in events:
        game_time = datetime.fromisoformat(event['commence_time'].replace('Z', '+00:00'))
        print(f"   {event['away_team']} @ {event['home_team']} - {game_time.strftime('%a %m/%d %I:%M%p')}")
    
    # Step 2: Fetch player props for each game
    print("\n📡 Fetching player prop odds...")
    all_odds = []
    
    for event in events:
        odds = fetch_player_props(api_key, event['id'])
        all_odds.extend(odds)
        print(f"   {event['away_team']} @ {event['home_team']}: {len(odds)} player odds")
    
    if not all_odds:
        print("❌ No player prop odds available")
        return
    
    odds_df = pd.DataFrame(all_odds)
    print(f"\n   Total: {len(odds_df)} odds records from {odds_df['bookmaker'].nunique()} books")
    
    # Step 3: Load model and generate predictions
    model, features, gate_config = load_model_artifacts()
    player_latest, player_history = load_player_data(season=2025, max_week=15)
    
    print("\n🔮 Generating model predictions...")
    pred_df = generate_predictions(model, features, player_latest)
    
    # Step 4: Match odds to predictions
    print("\n🔗 Matching odds to players...")
    matched_df, unmatched = match_odds_to_predictions(odds_df, pred_df)
    print(f"   Matched: {len(matched_df)} | Unmatched: {len(unmatched)}")
    
    if len(matched_df) == 0:
        print("❌ No players matched")
        return
    
    # Step 5: Select best odds per player
    best_odds_df = select_best_odds(matched_df)
    print(f"   Best odds selected: {len(best_odds_df)} players")
    
    # Step 6: Apply strategies
    print("\n📊 Applying profitable strategies...")
    picks_df = apply_strategies(best_odds_df)
    
    # Step 7: Output picks by strategy
    print("\n" + "="*70)
    print("🎯 PICKS BY STRATEGY")
    print("="*70)
    
    strategies = [
        ("🥇 TIER 1: 7%+ Edge + Longshots (+175 to +400)", 'strat_tier1_longshots', 0.03),
        ("🥈 TIER 1: 7%+ Edge + Cap Deep LS", 'strat_tier1_cap_deep', 0.03),
        ("🥉 TIER 1: 3%+ Edge + Longshots Only", 'strat_tier1_3pct_longshots', 0.02),
        ("⭐ TIER 2: 10%+ Edge (Any Odds)", 'strat_tier2_10pct', 0.02),
        ("⭐ TIER 2: 5%+ Edge + Cap Deep LS", 'strat_tier2_5pct_cap', 0.02),
    ]
    
    all_picks = []
    
    for name, col, stake in strategies:
        output = format_picks_output(picks_df, name, col)
        if output is not None and len(output) > 0:
            print(f"\n{name}")
            print(f"Recommended stake: {stake*100:.0f}% bankroll per bet")
            print("-"*70)
            print(output.to_string(index=False))
            
            # Add to all picks
            for _, row in output.iterrows():
                all_picks.append({
                    'strategy': name,
                    'stake_pct': stake,
                    **row.to_dict()
                })
        else:
            print(f"\n{name}")
            print("   No qualifying bets")
    
    # Summary
    total_profitable = picks_df['strat_any_profitable'].sum()
    print("\n" + "="*70)
    print(f"📈 SUMMARY: {total_profitable} total profitable picks found")
    print("="*70)
    
    # Unique picks (avoid duplicates across strategies)
    if all_picks:
        all_picks_df = pd.DataFrame(all_picks)
        unique_players = all_picks_df.drop_duplicates(subset='Player')
        
        print(f"\n🎯 Unique players with profitable bets: {len(unique_players)}")
        print("\nTop 10 by Edge:")
        top10 = unique_players.nlargest(10, 'Edge%')
        print(top10[['Player', 'Team', 'Pos', 'Odds', 'Model%', 'Edge%', 'strategy']].to_string(index=False))
    
    # Save picks
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    picks_path = OUTPUT_DIR / f'week{args.week}_picks_{timestamp}.csv'
    
    if all_picks:
        all_picks_df.to_csv(picks_path, index=False)
        print(f"\n💾 Saved picks to: {picks_path}")
    
    # Save full analysis
    full_path = OUTPUT_DIR / f'week{args.week}_full_analysis_{timestamp}.csv'
    picks_df.to_csv(full_path, index=False)
    print(f"💾 Saved full analysis to: {full_path}")
    
    print("\n✅ Done!")


if __name__ == '__main__':
    main()
