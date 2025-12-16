#!/usr/bin/env python3
"""Utility module for managing prediction-safe feature configurations."""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

RESEARCH_DIR = Path(__file__).parent.parent
FEATURES_DIR = RESEARCH_DIR / "features"
RESULTS_DIR = RESEARCH_DIR / "results"
FEATURE_SELECTION_JSON = FEATURES_DIR / "selected_features.json"
FEATURE_SELECTION_CSV = FEATURES_DIR / "selected_features.csv"

SAFE_PATTERN_DEFAULTS: Tuple[str, ...] = (
    "_l5",
    "_l10",
    "_trend",
    "_momentum",
    "availability",
    "available_count",
    "available_attack_quality",
    "attack_quality",
    "expected_minutes",
    "avg_chance",
    "injured_count",
    "doubtful_count",
    "squad_size",
    "min_attack_quality",
    "missing_attack_quality",
    "attack_strength_diff",
)

UNSAFE_PATTERN_DEFAULTS: Tuple[str, ...] = (
    "goals_fpl",
    "home_goals",
    "away_goals",
    "btts_yes_odds",
    "btts_no_odds",
    "sum_xg",
    "diff_xg",
    "shot_quality",
    "shots",
    "passes",
    "corners",
    "saves",
    "fouls",
    "cards",
    "danger_index",
    "chaos_index",
    "possession",
    "referee",
    "venue",
)


def _lower_tuple(values: Sequence[str]) -> Tuple[str, ...]:
    return tuple(v.lower() for v in values)


@dataclass
class FeatureConfig:
    """Configuration for prediction-safe feature selection."""

    max_features: int = 25
    min_coverage: float = 0.70
    safe_patterns: Tuple[str, ...] = field(default_factory=lambda: SAFE_PATTERN_DEFAULTS)
    unsafe_patterns: Tuple[str, ...] = field(default_factory=lambda: UNSAFE_PATTERN_DEFAULTS)
    manual_includes: Tuple[str, ...] = field(default_factory=tuple)
    manual_excludes: Tuple[str, ...] = field(
        default_factory=lambda: (
            "home_goals_fpl",
            "away_goals_fpl",
            "home_goals",
            "away_goals",
        )
    )

    def __post_init__(self) -> None:
        object.__setattr__(self, "safe_patterns", _lower_tuple(self.safe_patterns))
        object.__setattr__(self, "unsafe_patterns", _lower_tuple(self.unsafe_patterns))
        object.__setattr__(self, "manual_includes", _lower_tuple(self.manual_includes))
        object.__setattr__(self, "manual_excludes", _lower_tuple(self.manual_excludes))


DEFAULT_FEATURE_CONFIG = FeatureConfig()


def is_prediction_safe(feature_name: str, config: FeatureConfig = DEFAULT_FEATURE_CONFIG) -> bool:
    """Return True if the feature matches the prediction-safe rules."""

    if not feature_name:
        return False

    lower_name = feature_name.lower()

    if lower_name in config.manual_includes:
        return True
    if lower_name in config.manual_excludes:
        return False

    safe_match = any(pattern in lower_name for pattern in config.safe_patterns)
    unsafe_match = any(pattern in lower_name for pattern in config.unsafe_patterns)

    if safe_match and not unsafe_match:
        return True
    if safe_match and unsafe_match:
        # Prefer explicit allowlist over denylist when both match
        return True
    if unsafe_match:
        return False
    return False


def derive_safe_feature_list(
    columns: Sequence[str], config: FeatureConfig = DEFAULT_FEATURE_CONFIG
) -> List[str]:
    """Return the first N columns that satisfy the safe patterns."""

    safe_features: List[str] = []
    for col in columns:
        if is_prediction_safe(col, config):
            safe_features.append(col)
        if len(safe_features) >= config.max_features:
            break
    return safe_features


def load_feature_selection_artifact(path: Path = FEATURE_SELECTION_JSON) -> Optional[Dict]:
    """Load the persisted feature selection artifact if it exists."""

    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def load_selected_feature_list(path: Path = FEATURE_SELECTION_JSON) -> Optional[List[str]]:
    """Return the selected feature list from the saved artifact."""

    artifact = load_feature_selection_artifact(path)
    if not artifact:
        return None
    return artifact.get("features")


def resolve_active_feature_list(
    columns: Sequence[str],
    config: FeatureConfig = DEFAULT_FEATURE_CONFIG,
    quiet: bool = False,
) -> List[str]:
    """Load the persisted allowlist if available, else derive from config."""

    persisted = load_selected_feature_list()
    if persisted:
        usable = [col for col in persisted if col in columns]
        missing = [col for col in persisted if col not in columns]
        if missing and not quiet:
            print(
                f"⚠️  Feature allowlist entries missing from dataframe: {missing}"
            )
        if usable:
            return usable
        if not quiet:
            print("⚠️  Persisted allowlist empty after filtering, falling back to patterns")

    derived = derive_safe_feature_list(columns, config=config)
    if not derived and not quiet:
        print("⚠️  No prediction-safe features matched patterns; using numeric columns as fallback")
        derived = [col for col in columns]
    return derived[: config.max_features]


@dataclass
class FeatureSelectionResult:
    features: List[str]
    details: List[Dict[str, object]]
    dropped_summary: Dict[str, int]
    metadata: Dict[str, object]

    def to_payload(self, config: FeatureConfig) -> Dict:
        payload = {
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "feature_count": len(self.features),
            "features": self.features,
            "details": self.details,
            "dropped_summary": self.dropped_summary,
            "config": asdict(config),
        }
        payload.update(self.metadata)
        return payload


def _numeric_coverage(series: pd.Series) -> float:
    if series.empty:
        return 0.0
    return float(series.notna().mean())


def select_prediction_safe_features(
    df: pd.DataFrame,
    rankings_df: Optional[pd.DataFrame],
    config: FeatureConfig = DEFAULT_FEATURE_CONFIG,
) -> FeatureSelectionResult:
    """Select the top-N prediction-safe features using ranking + guardrails."""

    if rankings_df is not None:
        rankings_df = rankings_df.copy()
    else:
        rankings_df = pd.DataFrame({"feature": df.columns})

    if "composite_score" not in rankings_df.columns:
        score_cols = [
            col
            for col in ["mi_score", "rf_importance", "lgbm_gain", "shap_importance"]
            if col in rankings_df.columns
        ]
        if score_cols:
            rankings_df["composite_score"] = rankings_df[score_cols].fillna(0).mean(axis=1)
        else:
            rankings_df["composite_score"] = 0.0

    rankings_df = rankings_df.sort_values("composite_score", ascending=False)

    dropped = Counter()
    selected: List[str] = []
    details: List[Dict[str, object]] = []

    def _consider_feature(feature: str, score: float, source: str) -> bool:
        if feature in selected:
            return False
        if feature not in df.columns:
            dropped["missing_in_dataframe"] += 1
            return False
        if not is_prediction_safe(feature, config):
            dropped["not_prediction_safe"] += 1
            return False
        series = df[feature]
        if not np.issubdtype(series.dtype, np.number):
            dropped["non_numeric"] += 1
            return False
        coverage = _numeric_coverage(series)
        if coverage < config.min_coverage:
            dropped["low_coverage"] += 1
            return False
        selected.append(feature)
        details.append(
            {
                "feature": feature,
                "score": float(score),
                "coverage": coverage,
                "source": source,
            }
        )
        return len(selected) >= config.max_features

    for _, row in rankings_df.iterrows():
        if len(selected) >= config.max_features:
            break
        feature = row.get("feature")
        score = float(row.get("composite_score", 0.0))
        if not feature:
            continue
        done = _consider_feature(feature, score, source="ranking")
        if done:
            break

    if len(selected) < config.max_features:
        fallback_candidates: List[Tuple[str, float]] = []
        for col in df.columns:
            if col in selected:
                continue
            if not is_prediction_safe(col, config):
                continue
            series = df[col]
            if not np.issubdtype(series.dtype, np.number):
                continue
            coverage = _numeric_coverage(series)
            if coverage < config.min_coverage:
                continue
            fallback_candidates.append((col, coverage))

        fallback_candidates.sort(key=lambda item: (-item[1], item[0]))

        for feature, coverage in fallback_candidates:
            if len(selected) >= config.max_features:
                break
            selected.append(feature)
            details.append(
                {
                    "feature": feature,
                    "score": float("nan"),
                    "coverage": coverage,
                    "source": "fallback",
                }
            )

    metadata = {
        "total_rows": len(df),
        "candidate_columns": int(df.select_dtypes(include=[np.number]).shape[1]),
        "ranked_features_available": int(rankings_df.shape[0]),
    }

    return FeatureSelectionResult(
        features=selected,
        details=details,
        dropped_summary=dict(dropped),
        metadata=metadata,
    )


def save_feature_selection_artifact(
    result: FeatureSelectionResult,
    config: FeatureConfig = DEFAULT_FEATURE_CONFIG,
    json_path: Path = FEATURE_SELECTION_JSON,
    csv_path: Path = FEATURE_SELECTION_CSV,
) -> None:
    """Persist the feature selection result to disk (JSON + CSV)."""

    FEATURES_DIR.mkdir(parents=True, exist_ok=True)

    payload = result.to_payload(config)
    with json_path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)

    details_df = pd.DataFrame(result.details)
    details_df.to_csv(csv_path, index=False)


__all__ = [
    "FeatureConfig",
    "DEFAULT_FEATURE_CONFIG",
    "FEATURE_SELECTION_JSON",
    "FEATURE_SELECTION_CSV",
    "is_prediction_safe",
    "derive_safe_feature_list",
    "load_selected_feature_list",
    "load_feature_selection_artifact",
    "resolve_active_feature_list",
    "select_prediction_safe_features",
    "save_feature_selection_artifact",
]
