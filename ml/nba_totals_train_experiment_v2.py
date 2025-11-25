#!/usr/bin/env python3
"""Train an experimental NBA totals model (v2) using the prepared dataset."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error

REPO_ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = REPO_ROOT / "data" / "nba" / "datasets"
PARQUET_PATH = DATASET_DIR / "nba_totals_training_dataset.parquet"
CSV_PATH = DATASET_DIR / "nba_totals_training_dataset.csv"
METADATA_PATH = DATASET_DIR / "nba_totals_training_metadata.json"
ARTIFACT_PATH = (
    REPO_ROOT
    / "netlify"
    / "functions"
    / "_lib"
    / "nba"
    / "models"
    / "artifacts"
    / "total_model_experiment_v2.json"
)
METRICS_PATH = DATASET_DIR / "nba_totals_training_results_experiment_v2.json"
DEFAULT_VAL_START_DATE = "2024-10-22"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train an experimental NBA totals model")
    parser.add_argument(
        "--val-start-date",
        type=str,
        default=DEFAULT_VAL_START_DATE,
        help=(
            "ISO date for validation split (games on/after this date become validation)."
            " If omitted and no rows fall in validation, the script falls back to the last portion of the dataset."
        ),
    )
    parser.add_argument(
        "--val-fraction",
        type=float,
        default=0.2,
        help="Fallback fraction (0-1] for validation if the date-based split yields no rows.",
    )
    parser.add_argument(
        "--alpha",
        type=float,
        default=3.0,
        help="Ridge regression alpha (regularization strength).",
    )
    parser.add_argument(
        "--no-metrics-file",
        action="store_true",
        help="Skip writing the optional metrics summary JSON.",
    )
    return parser.parse_args()


def load_metadata_features() -> List[str]:
    if not METADATA_PATH.exists():
        raise FileNotFoundError(f"Metadata file not found: {METADATA_PATH}")
    with open(METADATA_PATH, "r") as f:
        metadata = json.load(f)
    features = metadata.get("features")
    if not features:
        raise ValueError("Metadata file does not include a 'features' list")
    return features


def load_dataset() -> pd.DataFrame:
    if PARQUET_PATH.exists():
        df = pd.read_parquet(PARQUET_PATH)
        print(f"Loaded dataset from {PARQUET_PATH} ({len(df)} rows)")
    elif CSV_PATH.exists():
        df = pd.read_csv(CSV_PATH)
        print(f"Loaded dataset from {CSV_PATH} ({len(df)} rows)")
    else:
        raise FileNotFoundError("Neither parquet nor CSV dataset found.")

    if "date" not in df.columns:
        raise ValueError("Dataset must include a 'date' column")
    df["date"] = pd.to_datetime(df["date"], utc=True, errors="raise")
    return df


def split_dataset(
    df: pd.DataFrame, val_start_date: str | None, val_fraction: float
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, str]]:
    df_sorted = df.sort_values("date").reset_index(drop=True)
    val_df = pd.DataFrame()
    train_df = pd.DataFrame()
    split_info: Dict[str, str] = {}

    if val_start_date:
        ts = pd.Timestamp(val_start_date).tz_localize("UTC")
        train_df = df_sorted[df_sorted["date"] < ts]
        val_df = df_sorted[df_sorted["date"] >= ts]
        split_info["strategy"] = "date"
        split_info["val_start_date"] = str(ts.date())

    if val_df.empty or train_df.empty:
        # fall back to fraction-based split while preserving chronology
        split_idx = max(1, int(len(df_sorted) * (1 - val_fraction)))
        train_df = df_sorted.iloc[:split_idx]
        val_df = df_sorted.iloc[split_idx:]
        split_info["strategy"] = "fraction"
        split_info["val_fraction"] = str(val_fraction)

    if val_df.empty:
        raise ValueError("Validation split ended up empty; adjust --val-fraction or date.")

    split_info["train_rows"] = str(len(train_df))
    split_info["val_rows"] = str(len(val_df))

    return train_df, val_df, split_info


def standardize_features(X: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series, pd.Series]:
    means = X.mean()
    stds = X.std(ddof=0).replace(0, 1.0)
    normalized = (X - means) / stds
    return normalized, means, stds


def apply_standardization(X: pd.DataFrame, means: pd.Series, stds: pd.Series) -> pd.DataFrame:
    safe_stds = stds.replace(0, 1.0)
    return (X - means) / safe_stds


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    mean_error = float(np.mean(y_pred - y_true))
    if len(y_true) > 1:
        corr = np.corrcoef(y_true, y_pred)[0, 1]
    else:
        corr = float("nan")
    return {
        "mae": float(mae),
        "rmse": float(rmse),
        "mean_error": float(mean_error),
        "correlation": float(corr),
    }


def print_metrics(label: str, metrics: Dict[str, float], n_rows: int) -> None:
    print(f"\n{label.upper()} METRICS ({n_rows} games)")
    print("  MAE:         {:.3f}".format(metrics["mae"]))
    print("  RMSE:        {:.3f}".format(metrics["rmse"]))
    print("  Mean error:  {:.3f}".format(metrics["mean_error"]))
    print("  Correlation: {:.4f}".format(metrics["correlation"]))


def export_model(weights: Dict[str, float], bias: float, means: pd.Series, stds: pd.Series) -> None:
    artifact = {
        "weights": {feat: float(weights[feat]) for feat in weights},
        "bias": float(bias),
        "means": {feat: float(means[feat]) for feat in means.index},
        "stds": {feat: float(stds[feat]) for feat in stds.index},
    }
    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(ARTIFACT_PATH, "w") as f:
        json.dump(artifact, f, indent=2)
    print(f"\n✅ Wrote model artifact to {ARTIFACT_PATH}")


def write_metrics_file(
    train_metrics: Dict[str, float],
    val_metrics: Dict[str, float],
    split_info: Dict[str, str],
    alpha: float,
) -> None:
    payload = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "model": "total_model_experiment_v2",
        "alpha": alpha,
        "split": split_info,
        "train": train_metrics,
        "validation": val_metrics,
    }
    with open(METRICS_PATH, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"✅ Wrote metrics summary to {METRICS_PATH}")


def main() -> None:
    args = parse_args()
    features = load_metadata_features()
    df = load_dataset()

    # Ensure required columns exist
    missing_cols = [col for col in ["actual_total"] + features if col not in df.columns]
    if missing_cols:
        raise ValueError(f"Dataset is missing required columns: {missing_cols}")

    train_df, val_df, split_info = split_dataset(df, args.val_start_date, args.val_fraction)
    print(
        f"Split dataset -> train: {len(train_df)} games, validation: {len(val_df)} games (strategy: {split_info['strategy']})"
    )

    X_train = train_df[features].astype(float)
    fill_values = X_train.mean().fillna(0.0)
    X_train = X_train.fillna(fill_values)
    y_train = train_df["actual_total"].astype(float).to_numpy()
    X_train_norm, means, stds = standardize_features(X_train)

    model = Ridge(alpha=args.alpha, fit_intercept=True, random_state=0)
    model.fit(X_train_norm, y_train)

    # Training predictions
    train_preds = model.predict(X_train_norm)
    train_metrics = compute_metrics(y_train, train_preds)
    print_metrics("train", train_metrics, len(train_df))

    # Validation predictions
    X_val = val_df[features].astype(float).fillna(fill_values)
    y_val = val_df["actual_total"].astype(float).to_numpy()
    X_val_norm = apply_standardization(X_val, means, stds)
    val_preds = model.predict(X_val_norm)
    val_metrics = compute_metrics(y_val, val_preds)
    print_metrics("validation", val_metrics, len(val_df))

    weights = {feat: coef for feat, coef in zip(features, model.coef_.tolist())}
    export_model(weights, model.intercept_, means, stds)

    if not args.no_metrics_file:
        write_metrics_file(train_metrics, val_metrics, split_info, args.alpha)


if __name__ == "__main__":
    main()
