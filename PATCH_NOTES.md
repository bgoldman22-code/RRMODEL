# Patch: EV floor + Platoon/Env scalers
Date: 2025-08-20 (ET)

Updated files:
- src/MLB.jsx

What's new:
- Added conservative **platoon (handedness)** multiplier: +6% LvsR / +4% RvsL, with symmetric penalties; switch hitters auto face opposite. Clamped to ±8%.
- Applied **environment** scaler using `parkHR` and `weatherHR` when present. Accepts either multiplicative factors (e.g., 1.25 for Coors) or +/- deltas (e.g., +0.25). Clamped to ±20%.
- Kept existing **pitch-type edge** scaler.
- Added **Pure EV** table (top 13) with a floor on model HR% (default 22%). Control via `VITE_PURE_EV_FLOOR`.
- The “Why” line now shows `platoon ±X%` when applied.

No config changes required.
