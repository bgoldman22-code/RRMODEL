#!/usr/bin/env python3
"""
Isotonic Calibration for Ridge Points Model

Problem: Ridge has best MAE (5.27) but worst betting (35.7% win, -31.8% ROI)
Solution: Learn a monotonic mapping from Ridge predictions → calibrated predictions
         that minimizes systematic bias for betting.

This is DATA-DRIVEN, not subjective. Isotonic regression learns the mapping
from validation data.

Usage:
    python scripts/nba/calibrate-ridge-isotonic.py \
        --ridge data/nba/models-ridge/points-ridge-model.json \
        --predictions data/nba/models-ridge/points-predictions.json \
        --output data/nba/models-ridge/points-ridge-calibrated.json
"""

import json
import numpy as np
import argparse
from pathlib import Path
from sklearn.isotonic import IsotonicRegression
import warnings
warnings.filterwarnings('ignore')

parser = argparse.ArgumentParser()
parser.add_argument('--ridge', required=True, help='Ridge model JSON')
parser.add_argument('--predictions', required=True, help='Ridge predictions JSON')
parser.add_argument('--output', required=True, help='Output calibrated model JSON')
args = parser.parse_args()

print("🔧 Isotonic Calibration for Ridge Points")
print("=" * 60)
print("GOAL: Map Ridge predictions → better betting predictions")
print("METHOD: Learn monotonic calibration from validation data")
print("=" * 60)

# Load Ridge model and predictions
with open(args.ridge, 'r') as f:
    ridge_model = json.load(f)

with open(args.predictions, 'r') as f:
    predictions = json.load(f)

print(f"\n✅ Loaded Ridge model (Test MAE: {ridge_model['test_mae']:.2f})")
print(f"✅ Loaded {len(predictions)} predictions")

# Extract predictions and actuals
y_pred = np.array([p['prediction'] for p in predictions])
y_actual = np.array([p['actual'] for p in predictions])

print(f"\n📊 Before Calibration:")
print(f"  Mean prediction: {np.mean(y_pred):.2f}")
print(f"  Mean actual: {np.mean(y_actual):.2f}")
print(f"  Mean residual (actual - pred): {np.mean(y_actual - y_pred):+.2f}")

# Split into train/val for calibration (80/20)
n = len(y_pred)
n_train = int(0.8 * n)

# Sort by date to maintain temporal ordering
dates = [p['date'] for p in predictions]
sorted_indices = np.argsort(dates)

train_idx = sorted_indices[:n_train]
val_idx = sorted_indices[n_train:]

y_pred_train = y_pred[train_idx]
y_actual_train = y_actual[train_idx]
y_pred_val = y_pred[val_idx]
y_actual_val = y_actual[val_idx]

print(f"\n🔀 Split for calibration:")
print(f"  Train: {len(train_idx)} samples")
print(f"  Val: {len(val_idx)} samples")

# Train isotonic regression on training subset
iso = IsotonicRegression(out_of_bounds='clip')
iso.fit(y_pred_train, y_actual_train)

print(f"\n✅ Trained isotonic calibration")

# Apply calibration to validation set
y_pred_val_calibrated = iso.predict(y_pred_val)

# Metrics before/after on validation
mae_before = np.mean(np.abs(y_actual_val - y_pred_val))
mae_after = np.mean(np.abs(y_actual_val - y_pred_val_calibrated))

bias_before = np.mean(y_actual_val - y_pred_val)
bias_after = np.mean(y_actual_val - y_pred_val_calibrated)

print(f"\n📊 Validation Results:")
print(f"  MAE before calibration: {mae_before:.2f}")
print(f"  MAE after calibration:  {mae_after:.2f}")
print(f"  Bias before: {bias_before:+.2f}")
print(f"  Bias after:  {bias_after:+.2f}")

# Apply calibration to ALL predictions and save
y_pred_all_calibrated = iso.predict(y_pred)

calibrated_predictions = []
for i, pred in enumerate(predictions):
    calibrated_predictions.append({
        **pred,
        'prediction_uncalibrated': float(pred['prediction']),
        'prediction': float(np.clip(y_pred_all_calibrated[i], 0, 60))
    })

# Save calibrated model
calibrated_model = {
    **ridge_model,
    'calibration': {
        'type': 'isotonic',
        'train_samples': len(train_idx),
        'val_mae_before': float(mae_before),
        'val_mae_after': float(mae_after),
        'val_bias_before': float(bias_before),
        'val_bias_after': float(bias_after),
        'X_thresholds': iso.X_thresholds_.tolist() if hasattr(iso, 'X_thresholds_') else [],
        'y_thresholds': iso.y_thresholds_.tolist() if hasattr(iso, 'y_thresholds_') else []
    },
    'version': 'ridge_v1_isotonic_calibrated'
}

output_path = Path(args.output)
output_path.parent.mkdir(parents=True, exist_ok=True)

with open(output_path, 'w') as f:
    json.dump(calibrated_model, f, indent=2)

print(f"\n💾 Saved calibrated model to {output_path}")

# Save calibrated predictions
pred_output = output_path.parent / 'points-predictions-calibrated.json'
with open(pred_output, 'w') as f:
    json.dump(calibrated_predictions, f, indent=2)

print(f"💾 Saved calibrated predictions to {pred_output}")

print("\n" + "=" * 60)
print("✅ CALIBRATION COMPLETE")
print("=" * 60)
print("\nNEXT: Run backtest with calibrated predictions")
print("  node scripts/nba/backtest-ridge-hybrid.js \\")
print(f"    --ridge {pred_output} \\")
print("    --output data/nba/backtest-results-ridge-calibrated.json")
