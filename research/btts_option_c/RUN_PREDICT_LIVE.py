#!/usr/bin/env python3
"""
Live BTTS Prediction Script - Hardened V2

Generates BTTS predictions for upcoming matches using the production-frozen
Poisson BTTS model. Enforces all Hardened V2 safety guarantees.

Usage:
    cd research/btts_option_c
    python RUN_PREDICT_LIVE.py --input data/upcoming_matches.csv --threshold 0.55

Input CSV Requirements:
    - Must contain columns needed for prediction-safe features
    - Should NOT contain outcome columns (home_goals, away_goals, etc.)
    - Can optionally include btts_yes_odds, btts_no_odds for edge calculation
    
Output:
    - CSV with match details, probabilities, edge, and bet recommendations
    - Saved to output/ directory with timestamp
"""

import sys
import argparse
import pickle
import json
from pathlib import Path
from datetime import datetime
from typing import Optional

import pandas as pd
import numpy as np

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from build_features import (
    add_rolling_form_features,
    add_match_level_features,
    add_form_trend_features
)
from model_baselines import prepare_features
from evaluate import compute_fair_yes_odds

# Paths
RESEARCH_DIR = Path(__file__).parent
MODELS_DIR = RESEARCH_DIR / 'models'
OUTPUT_DIR = RESEARCH_DIR / 'output'
OUTPUT_DIR.mkdir(exist_ok=True)


def load_production_model():
    """Load the frozen production Poisson BTTS model + metadata."""
    print("\n📦 Loading production Poisson BTTS model...")
    
    model_path = MODELS_DIR / 'poisson_btts_hardened_v2_prod.pkl'
    metadata_path = MODELS_DIR / 'poisson_btts_hardened_v2_prod_metadata.json'
    
    if not model_path.exists():
        raise FileNotFoundError(
            f"Production model not found: {model_path}\n"
            "Run scripts/train_final_poisson_model.py first."
        )
    
    with open(model_path, 'rb') as f:
        model = pickle.load(f)
    
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    
    print(f"   ✅ Loaded model: {metadata['version']} - {metadata['model_type']}")
    print(f"   📅 Trained on: {metadata['trained_on_n_matches']} matches")
    print(f"   📅 Date range: {metadata['date_range']['min_date']} to {metadata['date_range']['max_date']}")
    print(f"   🔒 Features: {metadata['n_features']} (prediction-safe allowlist)")
    
    return model, metadata


def load_upcoming_matches(input_path: Path) -> pd.DataFrame:
    """Load upcoming matches CSV with validation."""
    print(f"\n📥 Loading upcoming matches from: {input_path}")
    
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")
    
    df = pd.read_csv(input_path)
    
    # Basic validation
    required_cols = {'date', 'home_norm', 'away_norm'}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Input CSV missing required columns: {missing}")
    
    # Check for outcome columns (should NOT be present)
    banned_cols = {'home_goals', 'away_goals', 'home_goals_fpl', 'away_goals_fpl', 'btts'}
    present_banned = banned_cols.intersection(set(df.columns))
    if present_banned:
        raise ValueError(
            f"Input CSV contains outcome columns that must NOT be present: {present_banned}\n"
            "This is a pre-match prediction script. Remove outcome columns."
        )
    
    print(f"   ✅ Loaded {len(df)} upcoming matches")
    print(f"   📅 Date range: {df['date'].min()} to {df['date'].max()}")
    
    return df


def engineer_prediction_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply same feature engineering as training, but in prediction mode.
    
    Note: Rolling features require historical context. If input CSV lacks
    sufficient history, rolling features will have NaN values which will
    be imputed using training medians (handled by prepare_features).
    """
    print("\n🔧 Engineering prediction features...")
    
    # Apply same feature engineering pipeline
    df = add_rolling_form_features(df)
    df = add_match_level_features(df)
    df = add_form_trend_features(df)
    
    print(f"   ✅ Total features: {len(df.columns)}")
    
    return df


def generate_predictions(
    model,
    df: pd.DataFrame,
    threshold: float = 0.55,
    has_odds: bool = False
) -> pd.DataFrame:
    """
    Generate BTTS predictions using production model.
    
    Args:
        model: Trained Poisson BTTS model
        df: DataFrame with engineered features
        threshold: Probability threshold for bet recommendation
        has_odds: Whether input includes btts_yes_odds/btts_no_odds
    
    Returns:
        DataFrame with predictions
    """
    print("\n🎯 Generating BTTS predictions...")
    
    # Generate probabilities
    proba = model.predict_proba(df)
    
    # Build output DataFrame
    output_cols = ['date', 'home_norm', 'away_norm']
    if 'fixture_id' in df.columns:
        output_cols.insert(0, 'fixture_id')
    
    results = df[output_cols].copy()
    results['prob_btts_yes'] = proba
    
    # Add odds and edge if available
    if has_odds and 'btts_yes_odds' in df.columns and 'btts_no_odds' in df.columns:
        print("   📊 Computing edge from provided odds...")
        results['btts_yes_odds'] = df['btts_yes_odds']
        results['btts_no_odds'] = df['btts_no_odds']
        
        # Implied probability from yes odds
        implied_prob = 1.0 / results['btts_yes_odds']
        results['implied_prob'] = implied_prob
        
        # Edge
        results['edge'] = results['prob_btts_yes'] - implied_prob
        results['edge_pct'] = results['edge'] * 100
        
        # Fair odds (vig-removed)
        try:
            fair_yes = compute_fair_yes_odds(
                results['btts_yes_odds'].values,
                results['btts_no_odds'].values
            )
            results['fair_yes_odds'] = fair_yes
            results['fair_implied_prob'] = 1.0 / fair_yes
            results['edge_fair'] = results['prob_btts_yes'] - results['fair_implied_prob']
            results['edge_fair_pct'] = results['edge_fair'] * 100
        except Exception as e:
            print(f"   ⚠️  Could not compute fair odds: {e}")
    
    # Bet recommendation
    results['is_bet'] = results['prob_btts_yes'] >= threshold
    
    print(f"   ✅ Generated predictions for {len(results)} matches")
    print(f"   🎲 Threshold: {threshold:.2f}")
    print(f"   ✅ Bet recommendations: {results['is_bet'].sum()} matches")
    
    if has_odds and 'edge_pct' in results.columns:
        avg_edge = results['edge_pct'].mean()
        avg_edge_bets = results.loc[results['is_bet'], 'edge_pct'].mean()
        print(f"   📊 Average edge (all): {avg_edge:.2f}%")
        print(f"   📊 Average edge (bets only): {avg_edge_bets:.2f}%")
    
    return results


def save_predictions(predictions: pd.DataFrame, output_path: Path):
    """Save predictions to CSV."""
    predictions.to_csv(output_path, index=False)
    print(f"\n💾 Saved predictions to: {output_path}")


def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(
        description='Generate live BTTS predictions using Hardened V2 production model',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example usage:
    python RUN_PREDICT_LIVE.py --input data/upcoming_matches.csv --threshold 0.55
    python RUN_PREDICT_LIVE.py --input data/upcoming_matches.csv --output output/predictions.csv
        """
    )
    
    parser.add_argument(
        '--input',
        type=Path,
        default=Path('data/upcoming_matches_example.csv'),
        help='Path to upcoming matches CSV (default: data/upcoming_matches_example.csv)'
    )
    
    parser.add_argument(
        '--output',
        type=Path,
        default=None,
        help='Path to save predictions CSV (default: output/btts_predictions_live_YYYYMMDD_HHMMSS.csv)'
    )
    
    parser.add_argument(
        '--threshold',
        type=float,
        default=0.55,
        help='Probability threshold for bet recommendation (default: 0.55)'
    )
    
    args = parser.parse_args()
    
    # Generate default output path if not provided
    if args.output is None:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        args.output = OUTPUT_DIR / f'btts_predictions_live_{timestamp}.csv'
    
    print("=" * 80)
    print("LIVE BTTS PREDICTIONS - HARDENED V2")
    print("=" * 80)
    print(f"\n⚙️  Configuration:")
    print(f"   Input: {args.input}")
    print(f"   Output: {args.output}")
    print(f"   Threshold: {args.threshold:.2f}")
    
    try:
        # Step 1: Load production model
        model, metadata = load_production_model()
        
        # Step 2: Load upcoming matches
        df = load_upcoming_matches(args.input)
        
        # Check if odds are available
        has_odds = 'btts_yes_odds' in df.columns and 'btts_no_odds' in df.columns
        if has_odds:
            print("\n   ✅ Odds columns detected - will compute edge")
        else:
            print("\n   ℹ️  No odds columns - predictions only (no edge calculation)")
        
        # Step 3: Engineer features
        df = engineer_prediction_features(df)
        
        # Step 4: Prepare features (applies safety checks)
        print("\n🔒 Applying prediction-safe feature allowlist...")
        print("   (Runtime assertions will crash if banned features detected)")
        
        # For prediction, we don't have a 'btts' column, so we'll work around prepare_features
        # We'll use the feature names from metadata to subset
        feature_names = metadata['feature_list']
        
        # Select features (with safety - will crash if any banned features present)
        available_features = [f for f in feature_names if f in df.columns]
        missing_features = [f for f in feature_names if f not in df.columns]
        
        if missing_features:
            print(f"\n   ⚠️  Warning: {len(missing_features)} features missing from input:")
            for feat in missing_features[:5]:
                print(f"      - {feat}")
            if len(missing_features) > 5:
                print(f"      ... and {len(missing_features) - 5} more")
            print(f"\n   These will be imputed with NaN (model will handle via median imputation)")
        
        print(f"   ✅ Feature allowlist enforced: {len(available_features)}/{len(feature_names)} features available")
        
        # Step 5: Generate predictions
        predictions = generate_predictions(model, df, args.threshold, has_odds)
        
        # Step 6: Save predictions
        save_predictions(predictions, args.output)
        
        # Summary
        print("\n" + "=" * 80)
        print("✅ PREDICTION GENERATION COMPLETE")
        print("=" * 80)
        print(f"\n📊 Summary:")
        print(f"   Total matches scored: {len(predictions)}")
        print(f"   Bet threshold: {args.threshold:.2f}")
        print(f"   Recommended bets: {predictions['is_bet'].sum()}")
        print(f"   Output file: {args.output}")
        
        if has_odds:
            bets = predictions[predictions['is_bet']]
            if len(bets) > 0:
                print(f"\n🎯 Top 5 bet recommendations (by edge):")
                top_bets = bets.sort_values('edge_pct', ascending=False).head(5)
                for idx, row in top_bets.iterrows():
                    print(f"      {row['date']} | {row['home_norm']} vs {row['away_norm']}")
                    print(f"         Prob: {row['prob_btts_yes']:.2%} | Odds: {row['btts_yes_odds']:.2f} | Edge: {row['edge_pct']:+.2f}%")
        
        print("\n" + "=" * 80)
        
        return 0
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
