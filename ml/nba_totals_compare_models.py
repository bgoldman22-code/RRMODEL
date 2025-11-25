#!/usr/bin/env python3
"""Compare legacy NBA totals model vs experimental v2 on the prepared dataset."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = REPO_ROOT / "data" / "nba" / "datasets"
PARQUET_PATH = DATASET_DIR / "nba_totals_training_dataset.parquet"
CSV_PATH = DATASET_DIR / "nba_totals_training_dataset.csv"
METADATA_PATH = DATASET_DIR / "nba_totals_training_metadata.json"
BASELINE_MODEL_PATH = REPO_ROOT / "netlify" / "functions" / "_lib" / "nba" / "models" / "artifacts" / "total_model_simple.json"
EXPERIMENT_MODEL_PATH = REPO_ROOT / "netlify" / "functions" / "_lib" / "nba" / "models" / "artifacts" / "total_model_experiment_v2.json"
SUMMARY_PATH = DATASET_DIR / "nba_totals_compare_models_experiment_v2.json"


def load_dataset() -> pd.DataFrame:
    if PARQUET_PATH.exists():
        df = pd.read_parquet(PARQUET_PATH)
        print(f"Loaded dataset from {PARQUET_PATH} ({len(df)} rows)")
    elif CSV_PATH.exists():
        df = pd.read_csv(CSV_PATH)
        print(f"Loaded dataset from {CSV_PATH} ({len(df)} rows)")
    else:
        raise FileNotFoundError("Could not find dataset parquet or csv file.")

    if "date" not in df.columns:
        raise ValueError("Dataset missing 'date' column")
    df["date"] = pd.to_datetime(df["date"], utc=True, errors="raise")
    return df


def load_metadata_features() -> List[str]:
    if not METADATA_PATH.exists():
        raise FileNotFoundError(f"Metadata file not found: {METADATA_PATH}")
    with open(METADATA_PATH, "r") as f:
        metadata = json.load(f)
    features = metadata.get("features")
    if not features:
        raise ValueError("Metadata missing 'features' list")
    return features


def prepare_features(df: pd.DataFrame, features: List[str]) -> Tuple[pd.DataFrame, pd.Series]:
    missing = [col for col in features if col not in df.columns]
    if missing:
        raise ValueError(f"Dataset missing expected feature columns: {missing}")

    X = df[features].astype(float)
    fill_values = X.mean().fillna(0.0)
    X = X.fillna(fill_values)
    return X, fill_values


def load_model(path: Path) -> Dict:
    if not path.exists():
        raise FileNotFoundError(f"Model artifact not found: {path}")
    with open(path, "r") as f:
        model = json.load(f)
    for key in ["weights", "bias", "means", "stds"]:
        if key not in model:
            raise ValueError(f"Model artifact {path} missing '{key}'")
    return model


def align_features_for_model(X: pd.DataFrame, model: Dict) -> pd.DataFrame:
    weights = model.get("weights", {})
    missing = [feat for feat in weights.keys() if feat not in X.columns]
    if missing:
        print(f"[warning] Adding missing feature columns for model: {missing}")
        for feat in missing:
            X[feat] = 0.0
    return X[weights.keys()]


_missing_feature_warnings: Dict[str, bool] = {}


def predict_with_model(model: Dict, X: pd.DataFrame) -> np.ndarray:
    weights = model["weights"]
    means = model.get("means", {})
    stds = model.get("stds", {})
    bias = float(model.get("bias", 0.0))

    preds = np.full(len(X), bias, dtype=float)
    for feat, weight in weights.items():
        if feat not in X.columns:
            if not _missing_feature_warnings.get(feat):
                print(f"[warning] Feature '{feat}' missing from dataset; assuming zeros for predictions.")
                _missing_feature_warnings[feat] = True
            column = pd.Series(np.zeros(len(X)), index=X.index)
        else:
            column = X[feat].astype(float)
        mean = means.get(feat, 0.0)
        std = stds.get(feat, 1.0)
        if std == 0:
            std = 1.0
        normalized = (column - mean) / std
        preds += normalized.to_numpy() * float(weight)
    return preds


def compute_metrics(actual: np.ndarray, predicted: np.ndarray) -> Dict[str, float]:
    errors = predicted - actual
    mae = float(np.mean(np.abs(errors)))
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    mean_error = float(np.mean(errors))
    corr = float(np.corrcoef(actual, predicted)[0, 1]) if len(actual) > 1 else float("nan")
    actual_median = float(np.median(actual))
    predicted_high = predicted > actual_median
    actual_high = actual > actual_median
    directional_accuracy = float(np.mean(predicted_high == actual_high))
    return {
        "mae": mae,
        "rmse": rmse,
        "mean_error": mean_error,
        "correlation": corr,
        "directional_accuracy": directional_accuracy,
    }


def print_section(title: str) -> None:
    print("\n" + title)
    print("-" * len(title))


def main() -> None:
    df = load_dataset()
    features = load_metadata_features()
    X, _ = prepare_features(df, features)
    actual = df["actual_total"].astype(float).to_numpy()

    baseline_model = load_model(BASELINE_MODEL_PATH)
    experiment_model = load_model(EXPERIMENT_MODEL_PATH)

    baseline_preds = predict_with_model(baseline_model, X.copy())
    experiment_preds = predict_with_model(experiment_model, X.copy())

    baseline_metrics = compute_metrics(actual, baseline_preds)
    experiment_metrics = compute_metrics(actual, experiment_preds)

    date_range = (df["date"].min().date(), df["date"].max().date())
    print_section("NBA TOTALS MODEL COMPARISON")
    print(f"Sample size: {len(df)} games")
    print(f"Date range : {date_range[0]} to {date_range[1]}")

    print_section("Baseline (total_model_simple.json)")
    for key, value in baseline_metrics.items():
        label = key.replace("_", " ").title()
        print(f"{label:22s}: {value:.4f}")

    print_section("Experiment v2 (total_model_experiment_v2.json)")
    for key, value in experiment_metrics.items():
        label = key.replace("_", " ").title()
        print(f"{label:22s}: {value:.4f}")

    delta_corr = experiment_metrics["correlation"] - baseline_metrics["correlation"]
    delta_mae = experiment_metrics["mae"] - baseline_metrics["mae"]
    print_section("Summary")
    print(
        f"Experiment v2 correlation change: {baseline_metrics['correlation']:.4f} -> {experiment_metrics['correlation']:.4f} (Δ {delta_corr:+.4f})"
    )
    print(
        f"MAE change: {baseline_metrics['mae']:.3f} -> {experiment_metrics['mae']:.3f} (Δ {delta_mae:+.3f})"
    )

    summary = {
        "sample_size": int(len(df)),
        "date_range": {
            "start": str(date_range[0]),
            "end": str(date_range[1]),
        },
        "baseline": baseline_metrics,
        "experiment_v2": experiment_metrics,
    }
    SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SUMMARY_PATH, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n✅ Wrote comparison summary to {SUMMARY_PATH}")


if __name__ == "__main__":
    main()
