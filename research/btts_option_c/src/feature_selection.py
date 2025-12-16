#!/usr/bin/env python3
"""CLI helper to build a prediction-safe feature allowlist for BTTS research."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Optional

import pandas as pd

from build_features import build_all_features
from feature_config import (
    DEFAULT_FEATURE_CONFIG,
    FEATURE_SELECTION_CSV,
    FEATURE_SELECTION_JSON,
    FeatureConfig,
    save_feature_selection_artifact,
    select_prediction_safe_features,
)
from feature_importance import run_feature_importance_analysis
from load_data import load_unified_data

RESEARCH_DIR = Path(__file__).parent.parent
DATA_DIR = RESEARCH_DIR / "data"
RESULTS_DIR = RESEARCH_DIR / "results"
ENGINEERED_FILE = DATA_DIR / "engineered_features.csv"
RANKINGS_FILE = RESULTS_DIR / "feature_ranking.csv"


def load_engineered_features(force_rebuild: bool = False) -> pd.DataFrame:
    if ENGINEERED_FILE.exists() and not force_rebuild:
        df = pd.read_csv(ENGINEERED_FILE)
        df["date"] = pd.to_datetime(df["date"])
        return df

    df = load_unified_data(force_rebuild=force_rebuild)
    df = build_all_features(df)
    return df


def load_rankings(df: pd.DataFrame, recompute: bool) -> pd.DataFrame:
    if recompute or not RANKINGS_FILE.exists():
        print("\n⚙️  Feature rankings missing or recompute requested — running analysis...")
        rankings_df, *_ = run_feature_importance_analysis(df)
        return rankings_df

    print(f"\n📥 Loading existing feature rankings from {RANKINGS_FILE}")
    return pd.read_csv(RANKINGS_FILE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate prediction-safe BTTS feature allowlist",
    )
    parser.add_argument(
        "--max-features",
        type=int,
        default=DEFAULT_FEATURE_CONFIG.max_features,
        help="Number of features to keep in the allowlist",
    )
    parser.add_argument(
        "--min-coverage",
        type=float,
        default=DEFAULT_FEATURE_CONFIG.min_coverage,
        help="Minimum non-null coverage required for a feature",
    )
    parser.add_argument(
        "--force-data-rebuild",
        action="store_true",
        help="Rebuild engineered feature cache before selection",
    )
    parser.add_argument(
        "--recompute-rankings",
        action="store_true",
        help="Re-run feature importance analysis instead of loading cached rankings",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print selection summary without writing artifacts",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        default=FEATURE_SELECTION_JSON,
        help="Path to save JSON artifact (default: features/selected_features.json)",
    )
    parser.add_argument(
        "--output-csv",
        type=Path,
        default=FEATURE_SELECTION_CSV,
        help="Path to save CSV summary (default: features/selected_features.csv)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = FeatureConfig(
        max_features=args.max_features,
        min_coverage=args.min_coverage,
        safe_patterns=DEFAULT_FEATURE_CONFIG.safe_patterns,
        unsafe_patterns=DEFAULT_FEATURE_CONFIG.unsafe_patterns,
        manual_includes=DEFAULT_FEATURE_CONFIG.manual_includes,
        manual_excludes=DEFAULT_FEATURE_CONFIG.manual_excludes,
    )

    print("\n📊 Loading engineered feature matrix...")
    df = load_engineered_features(force_rebuild=args.force_data_rebuild)
    print(f"   Matches: {len(df)} | Total columns: {len(df.columns)}")

    rankings_df = load_rankings(df, recompute=args.recompute_rankings)

    result = select_prediction_safe_features(df, rankings_df, config=config)

    print("\n✅ Prediction-safe feature selection complete")
    print(f"   Selected features: {len(result.features)}/{config.max_features}")
    print(f"   Coverage threshold: {config.min_coverage:.0%}")
    print(f"   Ranked features evaluated: {result.metadata['ranked_features_available']}")
    if result.dropped_summary:
        print("   Drop reasons:")
        for reason, count in sorted(result.dropped_summary.items()):
            print(f"      - {reason}: {count}")

    print("\n📋 Allowlist preview:")
    for feature in result.features[:10]:
        print(f"   • {feature}")
    if len(result.features) > 10:
        print(f"   ... +{len(result.features) - 10} more")

    if args.dry_run:
        print("\n📝 Dry run requested — artifacts were not updated")
        return

    save_feature_selection_artifact(
        result,
        config=config,
        json_path=args.output_json,
        csv_path=args.output_csv,
    )

    print(f"\n💾 Saved JSON artifact to {args.output_json}")
    print(f"💾 Saved CSV summary to {args.output_csv}")


if __name__ == "__main__":
    main()
