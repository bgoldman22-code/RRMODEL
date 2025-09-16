
## Data Loading & Helpers (Integrated)
- `scripts/lib/nflverse_data_loading.js` — production-ready loaders for NFLverse PBP (GitHub releases CSV/Parquet, local, DuckDB).
- `scripts/lib/metrics_helpers.js` — complete implementations for previously missing functions (usage, defense, script, env).

`scripts/etl-full.js` now imports these modules and uses `loadNFLversePBP(season)` directly.
