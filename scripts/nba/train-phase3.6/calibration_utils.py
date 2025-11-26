"""Calibration helpers for NBA Phase 3.6 models."""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, List

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

EPS = 1e-9


@dataclass
class CalibrationArtifacts:
    platt_weight: float
    platt_bias: float
    isotonic_x: List[float]
    isotonic_y: List[float]
    reliability_bins: List[Dict[str, float]]

    def to_json(self) -> Dict:
        return asdict(self)


def fit_platt_scaler(probabilities: np.ndarray, targets: np.ndarray) -> LogisticRegression:
    logits = np.log((probabilities + EPS) / (1 - probabilities + EPS)).reshape(-1, 1)
    model = LogisticRegression(solver='lbfgs')
    model.fit(logits, targets)
    return model


def apply_platt(probabilities: np.ndarray, model: LogisticRegression) -> np.ndarray:
    logits = np.log((probabilities + EPS) / (1 - probabilities + EPS)).reshape(-1, 1)
    calibrated = model.predict_proba(logits)[:, 1]
    return calibrated


def fit_isotonic(probabilities: np.ndarray, targets: np.ndarray) -> IsotonicRegression:
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds='clip')
    iso.fit(probabilities, targets)
    return iso


def apply_isotonic(probabilities: np.ndarray, iso: IsotonicRegression) -> np.ndarray:
    return iso.predict(probabilities)


def build_reliability_bins(probabilities: np.ndarray, targets: np.ndarray, bin_size: float = 0.05) -> List[Dict[str, float]]:
    bins = []
    edges = np.arange(0, 1 + bin_size, bin_size)
    for i in range(len(edges) - 1):
        low, high = edges[i], edges[i + 1]
        mask = (probabilities >= low) & (probabilities < high)
        if mask.sum() == 0:
            continue
        bins.append({
            'bin': f'{low:.2f}-{high:.2f}',
            'count': int(mask.sum()),
            'predicted': float(probabilities[mask].mean()),
            'actual': float(targets[mask].mean())
        })
    return bins


def calibrate(probabilities: np.ndarray, targets: np.ndarray) -> CalibrationArtifacts:
    platt = fit_platt_scaler(probabilities, targets)
    platt_probs = apply_platt(probabilities, platt)
    iso = fit_isotonic(platt_probs, targets)
    calibrated = apply_isotonic(platt_probs, iso)
    bins = build_reliability_bins(calibrated, targets)
    return CalibrationArtifacts(
        platt_weight=float(platt.coef_[0][0]),
        platt_bias=float(platt.intercept_[0]),
        isotonic_x=iso.X_.tolist(),
        isotonic_y=iso.y_.tolist(),
        reliability_bins=bins
    )
