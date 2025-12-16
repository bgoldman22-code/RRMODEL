#!/usr/bin/env python3
"""
Generate EPL BTTS Production Predictions

Fetches upcoming EPL fixtures + BTTS odds from TheOddsAPI, runs production
Poisson model, applies guardrails, and outputs CSV + JSON.

Usage:
    THEODDSAPI_KEY=your_key_here \\
    PYTHONPATH=src:$PYTHONPATH \\
    python3 scripts/generate_epl_btts_production_predictions.py \\
        --start-date 2025-12-12 \\
        --end-date 2025-12-15 \\
        --out-csv results/epl_btts_preds_2025-12-12_2025-12-15.csv \\
        --out-json public/epl_btts_preds_latest.json

Environment Variables:
    THEODDSAPI_KEY: Required - API key for TheOddsAPI
    
Dependencies:
    pip install requests pandas numpy joblib
"""

import sys
import os
import argparse
import json
import requests
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import pandas as pd
import warnings
warnings.filterwarnings('ignore')

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from production import (
    load_production_poisson_model,
    compute_btts_decisions_for_fixtures,
    BttsStrategyConfig,
    decisions_to_dataframe,
    decisions_to_json_payload
)


# TheOddsAPI configuration
THEODDSAPI_BASE_URL = "https://api.the-odds-api.com/v4"
SPORT_KEY = "soccer_epl"  # English Premier League
REGIONS = "uk"  # UK bookmakers
ODDS_FORMAT = "decimal"
DATE_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

# Market keys to try for BTTS (ordered by preference)
BTTS_MARKET_KEYS = [
    "btts",
    "both_teams_to_score",
    "both_teams_score"
]


def check_api_key():
    """
    Check if TheOddsAPI key is available in environment
    
    Raises:
        RuntimeError: If THEODDSAPI_KEY not set
    """
    api_key = os.getenv('THEODDSAPI_KEY')
    
    if not api_key:
        raise RuntimeError(
            "❌ THEODDSAPI_KEY environment variable not set!\n\n"
            "Please set it before running:\n"
            "  export THEODDSAPI_KEY=your_key_here\n"
            "  # or\n"
            "  THEODDSAPI_KEY=your_key_here python3 scripts/generate_epl_btts_production_predictions.py\n"
        )
    
    return api_key


def fetch_epl_fixtures_and_odds(
    start_date: str,
    end_date: str,
    api_key: str,
    bookmaker: str = "fanduel"
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Fetch EPL fixtures and BTTS odds from TheOddsAPI
    
    Args:
        start_date: ISO date string (YYYY-MM-DD)
        end_date: ISO date string (YYYY-MM-DD)
        api_key: TheOddsAPI key
        bookmaker: Preferred bookmaker (default: fanduel)
        
    Returns:
        tuple: (fixtures_df, odds_df)
        
    Fixtures DataFrame columns:
        - match_id
        - kickoff_iso
        - home_team
        - away_team
        - home_xg (placeholder, will be set to default)
        - away_xg (placeholder, will be set to default)
        
    Odds DataFrame columns:
        - match_id
        - btts_yes_odds
        - btts_no_odds
    """
    print(f"\n🌐 Fetching EPL fixtures from TheOddsAPI...")
    print(f"   Date range: {start_date} to {end_date}")
    print(f"   Bookmaker: {bookmaker}")
    
    # Convert dates to ISO timestamps
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)  # Include end date
    
    commence_from = start_dt.strftime(DATE_FORMAT)
    commence_to = end_dt.strftime(DATE_FORMAT)
    
    # Step 1: Fetch events with h2h market to get list of matches
    print(f"   📋 Step 1: Fetching match list...")
    url = f"{THEODDSAPI_BASE_URL}/sports/{SPORT_KEY}/odds"
    params = {
        "apiKey": api_key,
        "regions": REGIONS,
        "oddsFormat": ODDS_FORMAT,
        "markets": "h2h",
        "commenceTimeFrom": commence_from,
        "commenceTimeTo": commence_to
    }
    
    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        events_data = response.json()
        
        if not events_data or len(events_data) == 0:
            print("   ⚠️  No EPL matches found in date range")
            return pd.DataFrame(), pd.DataFrame()
        
        print(f"   ✅ Found {len(events_data)} upcoming matches")
        
    except requests.RequestException as e:
        print(f"   ❌ Error fetching matches: {e}")
        return pd.DataFrame(), pd.DataFrame()
    
    # Step 2: Fetch BTTS odds for each event individually
    print(f"   📊 Step 2: Fetching BTTS odds for each match...")
    fixtures = []
    odds = []
    
    for i, event in enumerate(events_data, 1):
        match_id = event['id']
        kickoff_iso = event['commence_time']
        home_team = event['home_team']
        away_team = event['away_team']
        
        print(f"   [{i}/{len(events_data)}] {home_team} vs {away_team}...", end=" ")
        
        # Add to fixtures
        fixtures.append({
            'match_id': match_id,
            'kickoff_iso': kickoff_iso,
            'home_team': home_team,
            'away_team': away_team,
            'home_xg': 1.7,  # Default EPL average
            'away_xg': 1.4   # Default EPL average
        })
        
        # Fetch BTTS odds for this specific event
        btts_url = f"{THEODDSAPI_BASE_URL}/sports/{SPORT_KEY}/events/{match_id}/odds"
        btts_params = {
            "apiKey": api_key,
            "regions": REGIONS,
            "oddsFormat": ODDS_FORMAT,
            "markets": "btts"
        }
        
        btts_yes_odds = None
        btts_no_odds = None
        
        try:
            btts_response = requests.get(btts_url, params=btts_params, timeout=10)
            btts_response.raise_for_status()
            btts_data = btts_response.json()
            
            # Extract BTTS odds
            bookmakers = btts_data.get('bookmakers', [])
            target_bookmaker = None
            
            # Look for preferred bookmaker
            for bm in bookmakers:
                if bm['key'].lower() == bookmaker.lower():
                    target_bookmaker = bm
                    break
            
            # If preferred not found, use first available
            if not target_bookmaker and bookmakers:
                target_bookmaker = bookmakers[0]
            
            if target_bookmaker:
                markets = target_bookmaker.get('markets', [])
                
                for market in markets:
                    if market['key'] == 'btts':
                        outcomes = market.get('outcomes', [])
                        
                        for outcome in outcomes:
                            name = outcome['name'].lower()
                            price = outcome['price']
                            
                            if 'yes' in name:
                                btts_yes_odds = price
                            elif 'no' in name:
                                btts_no_odds = price
                
                if btts_yes_odds and btts_no_odds:
                    print(f"✅ YES={btts_yes_odds:.2f}, NO={btts_no_odds:.2f}")
                else:
                    print(f"⚠️  Incomplete odds")
            else:
                print(f"⚠️  No bookmaker data")
                
        except requests.RequestException as e:
            print(f"❌ Error: {e}")
        
        # Add to odds (even if None)
        odds.append({
            'match_id': match_id,
            'btts_yes_odds': btts_yes_odds,
            'btts_no_odds': btts_no_odds
        })
    
    fixtures_df = pd.DataFrame(fixtures)
    odds_df = pd.DataFrame(odds)
    
    # Log summary
    n_with_odds = odds_df[['btts_yes_odds', 'btts_no_odds']].notna().all(axis=1).sum()
    
    print(f"\n📊 Fetch summary:")
    print(f"   Total matches: {len(fixtures_df)}")
    print(f"   Matches with BTTS odds: {n_with_odds}")
    print(f"   Missing odds: {len(fixtures_df) - n_with_odds}")
    
    return fixtures_df, odds_df


def generate_predictions(
    start_date: str = "2025-12-12",
    end_date: str = "2025-12-15",
    out_csv: str = "results/epl_btts_preds_2025-12-12_2025-12-15.csv",
    out_json: str = "public/epl_btts_preds_latest.json",
    bookmaker: str = "fanduel",
    model_path: str = "models/btts_poisson_production.joblib",
    meta_path: str = "models/btts_poisson_production_meta.json"
):
    """
    Main prediction generation workflow
    
    Args:
        start_date: Start date for fixtures (YYYY-MM-DD)
        end_date: End date for fixtures (YYYY-MM-DD)
        out_csv: Output CSV path
        out_json: Output JSON path
        bookmaker: Preferred bookmaker
        model_path: Path to production model
        meta_path: Path to model metadata
    """
    print("=" * 80)
    print("EPL BTTS PRODUCTION PREDICTIONS")
    print("=" * 80)
    
    # Check API key
    api_key = check_api_key()
    
    # Load model
    print(f"\n📦 Loading production model from {model_path}...")
    model = load_production_poisson_model(model_path)
    
    # Load metadata
    metadata = {}
    meta_file = Path(meta_path)
    if meta_file.exists():
        with open(meta_file, 'r') as f:
            metadata = json.load(f)
        print(f"✅ Loaded model metadata")
        print(f"   Version: {metadata.get('model_version', 'unknown')}")
        print(f"   Trained through: {metadata.get('training_window', {}).get('end_date', 'unknown')}")
    else:
        print(f"⚠️  Metadata file not found at {meta_file}")
    
    # Fetch fixtures and odds
    fixtures_df, odds_df = fetch_epl_fixtures_and_odds(
        start_date=start_date,
        end_date=end_date,
        api_key=api_key,
        bookmaker=bookmaker
    )
    
    if fixtures_df.empty:
        print("\n❌ No fixtures found. Exiting.")
        return
    
    # Configure strategy
    config = BttsStrategyConfig(
        yes_prob_threshold=0.55,
        no_prob_threshold=0.65,
        min_edge=0.02,  # From bucket analysis
        max_vig=0.08,
        prefer_higher_edge=True,
        stake=10.0
    )
    
    print(f"\n⚙️  Strategy configuration:")
    print(f"   YES threshold: {config.yes_prob_threshold}")
    print(f"   NO threshold: {config.no_prob_threshold}")
    print(f"   Min edge: {config.min_edge}")
    print(f"   Max vig: {config.max_vig}")
    
    # Generate decisions
    print(f"\n🎯 Computing betting decisions...")
    decisions = compute_btts_decisions_for_fixtures(
        model=model,
        fixtures_df=fixtures_df,
        odds_df=odds_df,
        config=config
    )
    
    # Create simplified CSV with requested columns
    csv_data = []
    bankroll = 3500.0
    unit_size = 20.0
    
    for d in decisions:
        # Get the chosen side's odds and probability
        if d.chosen_side == "YES":
            chosen_odds = d.market_yes_odds
            model_prob = d.p_yes
            implied_prob = d.implied_p_yes
        elif d.chosen_side == "NO":
            chosen_odds = d.market_no_odds
            model_prob = d.p_no
            implied_prob = d.implied_p_no
        else:
            chosen_odds = None
            model_prob = None
            implied_prob = None
        
        # Calculate Kelly units
        # Kelly = (odds * prob - 1) / (odds - 1)
        # Units = Kelly * (bankroll / unit_size)
        if d.chosen_side != "NO_BET" and chosen_odds and model_prob:
            kelly_pct = d.kelly_fraction  # Already calculated in strategy module
            units_to_stake = (kelly_pct * bankroll) / unit_size
        else:
            kelly_pct = 0.0
            units_to_stake = 0.0
        
        csv_data.append({
            'Home Team': d.home_team,
            'Away Team': d.away_team,
            'Chosen Side': d.chosen_side,
            'Confidence Bucket': d.confidence_bucket if d.chosen_side != "NO_BET" else "NONE",
            'Model Probability': f"{model_prob:.3f}" if model_prob else "N/A",
            'Vegas Odds Implied Probability': f"{implied_prob:.3f}" if implied_prob else "N/A",
            'Edge': f"{d.chosen_edge:.3f}" if d.chosen_side != "NO_BET" else "0.000",
            'Kelly': f"{kelly_pct:.4f}" if d.chosen_side != "NO_BET" else "0.0000",
            'Units To Stake': f"{units_to_stake:.2f}" if d.chosen_side != "NO_BET" else "0.00"
        })
    
    csv_df = pd.DataFrame(csv_data)
    
    # Save CSV
    csv_path = Path(out_csv)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"\n💾 Saving CSV to {csv_path}...")
    csv_df.to_csv(csv_path, index=False)
    print(f"✅ CSV saved ({len(csv_df)} rows)")
    print(f"   Bankroll: ${bankroll:.0f}, Unit size: ${unit_size:.0f}")
    
    # Create JSON payload
    json_metadata = {
        "league": "EPL",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "date_range": {
            "start": start_date,
            "end": end_date
        },
        "model": {
            "name": metadata.get("model_name", "poisson_btts"),
            "version": metadata.get("model_version", "1.0.0"),
            "trained_through": metadata.get("training_window", {}).get("end_date", "unknown")
        },
        "strategy": {
            "yes_prob_threshold": config.yes_prob_threshold,
            "no_prob_threshold": config.no_prob_threshold,
            "min_edge": config.min_edge,
            "max_vig": config.max_vig
        },
        "summary": {
            "total_matches": len(decisions),
            "total_bets": sum(1 for d in decisions if d.chosen_side != "NO_BET"),
            "yes_bets": sum(1 for d in decisions if d.chosen_side == "YES"),
            "no_bets": sum(1 for d in decisions if d.chosen_side == "NO"),
            "no_bet": sum(1 for d in decisions if d.chosen_side == "NO_BET")
        }
    }
    
    json_payload = decisions_to_json_payload(decisions, json_metadata)
    
    # Save JSON
    json_path = Path(out_json)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"\n💾 Saving JSON to {json_path}...")
    with open(json_path, 'w') as f:
        json.dump(json_payload, f, indent=2)
    print(f"✅ JSON saved")
    
    # Summary
    print("\n" + "=" * 80)
    print("GENERATION COMPLETE")
    print("=" * 80)
    print(f"\n📁 Output files:")
    print(f"   CSV: {csv_path}")
    print(f"   JSON: {json_path}")
    print(f"\n📊 Summary:")
    print(f"   Matches analyzed: {len(decisions)}")
    print(f"   Bets placed: {json_metadata['summary']['total_bets']}")
    print(f"   YES bets: {json_metadata['summary']['yes_bets']}")
    print(f"   NO bets: {json_metadata['summary']['no_bets']}")
    print(f"   NO BET: {json_metadata['summary']['no_bet']}")
    
    # Show bets
    bets = [d for d in decisions if d.chosen_side != "NO_BET"]
    if bets:
        print(f"\n🎲 Recommended bets:")
        for bet in bets:
            print(f"   {bet.home_team} vs {bet.away_team}")
            print(f"     → Bet {bet.chosen_side} @ "
                  f"{bet.market_yes_odds if bet.chosen_side == 'YES' else bet.market_no_odds:.2f} "
                  f"(edge={bet.chosen_edge:.3f}, conf={bet.confidence_bucket})")
    
    print("\n✅ Ready for Netlify deployment!")


def main():
    """CLI entrypoint"""
    parser = argparse.ArgumentParser(
        description="Generate EPL BTTS production predictions",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate predictions with defaults (Dec 12-15)
  THEODDSAPI_KEY=xxx python3 scripts/generate_epl_btts_production_predictions.py
  
  # Custom date range and output paths
  THEODDSAPI_KEY=xxx python3 scripts/generate_epl_btts_production_predictions.py \\
      --start-date 2025-12-20 \\
      --end-date 2025-12-22 \\
      --out-csv results/btts_dec20-22.csv \\
      --out-json public/btts_latest.json
  
  # Use different bookmaker
  THEODDSAPI_KEY=xxx python3 scripts/generate_epl_btts_production_predictions.py \\
      --bookmaker bet365
        """
    )
    
    parser.add_argument(
        '--start-date',
        type=str,
        default='2025-12-12',
        help='Start date for fixtures (YYYY-MM-DD)'
    )
    
    parser.add_argument(
        '--end-date',
        type=str,
        default='2025-12-15',
        help='End date for fixtures (YYYY-MM-DD)'
    )
    
    parser.add_argument(
        '--out-csv',
        type=str,
        default='results/epl_btts_preds_2025-12-12_2025-12-15.csv',
        help='Output CSV path'
    )
    
    parser.add_argument(
        '--out-json',
        type=str,
        default='public/epl_btts_preds_latest.json',
        help='Output JSON path'
    )
    
    parser.add_argument(
        '--bookmaker',
        type=str,
        default='fanduel',
        help='Preferred bookmaker (default: fanduel)'
    )
    
    parser.add_argument(
        '--model-path',
        type=str,
        default='models/btts_poisson_production.joblib',
        help='Path to production model'
    )
    
    parser.add_argument(
        '--meta-path',
        type=str,
        default='models/btts_poisson_production_meta.json',
        help='Path to model metadata'
    )
    
    args = parser.parse_args()
    
    try:
        generate_predictions(
            start_date=args.start_date,
            end_date=args.end_date,
            out_csv=args.out_csv,
            out_json=args.out_json,
            bookmaker=args.bookmaker,
            model_path=args.model_path,
            meta_path=args.meta_path
        )
    except Exception as e:
        print(f"\n❌ Error generating predictions: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
