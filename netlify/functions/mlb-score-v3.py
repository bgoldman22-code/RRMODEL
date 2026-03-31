#!/usr/bin/env python3
"""
mlb-score-v3.py — Netlify Python function for XGBoost inference
================================================================
Accepts a JSON body:
  { "features": [[f0,f1,...,f8], ...] }   (2D array, one row per player)

Returns:
  { "probs": [0.123, 0.201, ...] }        (calibrated model probability per row)

The JS function (mlb-slate-v3.mjs) calls this internally by reading the
feature vectors from the pre-built blob and passing them here in one batch.

Feature order (strict — must match feature_schema.json):
  [0] hr_rate_bayes
  [1] barrel_pct
  [2] hard_hit_pct
  [3] pitcher_barrel
  [4] pitcher_rv100
  [5] pitcher_hrfb
  [6] park_hr_factor
  [7] temp_adj
  [8] wind_adj
  [9] pull_park_score
  [10] pitcher_zone_pct

Deployment: Netlify Python functions require runtime.txt = "python3.9"
and the function to export a `handler(event, context)` function.
"""

import json, pathlib, sys
import numpy as np
import joblib

ROOT      = pathlib.Path(__file__).parent.parent.parent
ARTS_DIR  = ROOT / "data/mlb_v3/artifacts"

# Load once at module level (cold start only)
try:
    _xgb_cal = joblib.load(ARTS_DIR / "xgb_calibrator.joblib")
    _medians  = json.loads((ARTS_DIR / "train_medians.json").read_text())
    _COLS     = [
        "hr_rate_bayes", "barrel_pct", "hard_hit_pct", "pitcher_barrel",
        "pitcher_rv100", "pitcher_hrfb", "park_hr_factor", "temp_adj", "wind_adj",
        "pull_park_score", "pitcher_zone_pct",
    ]
    _MED_VEC = [_medians[c] for c in _COLS]
    _LOADED  = True
except Exception as e:
    _LOADED  = False
    _LOAD_ERR = str(e)


def handler(event, context):
    if not _LOADED:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": f"Model load failed: {_LOAD_ERR}"}),
        }

    try:
        body = json.loads(event.get("body") or "{}")
        raw  = body.get("features", [])
        if not raw:
            return {"statusCode": 400, "body": json.dumps({"error": "features array required"})}

        # Build numpy array — impute None/NaN with training medians
        X = np.array([
            [row[i] if (row[i] is not None and row[i] == row[i]) else _MED_VEC[i]
             for i in range(len(_COLS))]
            for row in raw
        ], dtype=float)

        probs = _xgb_cal.predict_proba(X)[:, 1].tolist()
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"probs": probs}),
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }
