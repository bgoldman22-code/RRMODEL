# Phase 3.6 Model Artifacts

Run `python scripts/nba/train-phase3.6/train_phase36_models.py` to populate:

```
models/phase3.6/
  points/
    projection_booster.txt
    projection_metadata.json
    distribution_booster.txt
    distribution_metadata.json
    probability_booster.txt
    probability_metadata.json
    calibration.json
  rebounds/
    ...
  assists/
    ...
```

Each metadata file already includes the `model_path` relative to repo root, so the Phase 3.6 inference engine can discover artifacts automatically.
