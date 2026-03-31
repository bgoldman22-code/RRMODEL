# TICKET: batter_oswing_pct — Investigate Alternative Endpoints

**Status:** Open  
**Priority:** Low (not blocking — dropped from v2 schema)  
**Created:** 2025-01-01  

---

## Summary

`batter_oswing_pct` (batter O-Swing%: fraction of pitches outside the zone that the batter swings at) 
was evaluated in the D1 Feature Sprint. The intent was to capture batter discipline as a proxy for HR probability — high O-Swing% batters chase, tend to make weaker contact, and are lower HR threats.

**Result:** 0.0% coverage across all 4 seasons (2022–2025). Zero data. Zero feature gain.  
**Root cause:** `pybaseball.batting_stats()` calls `leaders-legacy.aspx` on FanGraphs, which returned HTTP 403 for every season tested.

---

## Decision

`batter_oswing_pct` is **dropped entirely** from the v2 schema. It is not in:
- `feature_schema.json` (v2)
- `train_medians.json`
- `feature_matrix_v2.parquet` (well, the column exists but contains 0 rows with data)
- `build_daily_features.py`
- `mlb-score-v3.py`
- `mlb-slate-v3.mjs`

Do **not** re-add until a working endpoint with ≥85% coverage is confirmed.

---

## Investigation Tasks

### Option 1: pybaseball `batting_stats_bref()` (Baseball Reference)
```python
from pybaseball import batting_stats_bref
df = batting_stats_bref(2024)
print(df.columns.tolist())  # Check if O-Swing% or similar is present
# Baseball Reference uses different stat names — look for "O-Swing%" or "SwStr%"
```
Note: Baseball Reference typically includes swing%, contact%, Z-swing%, O-Swing% in their 
Advanced tables. The `batting_stats_bref()` function may or may not include these.

### Option 2: pybaseball `fg_batting_data()` (newer FanGraphs endpoint)
```python
# Newer pybaseball versions have fg_batting_data() which hits a different FG endpoint
from pybaseball import fg_batting_data
df = fg_batting_data(2024, 2024, qual=50)
print([c for c in df.columns if 'swing' in c.lower() or 'zone' in c.lower()])
```

### Option 3: FanGraphs direct URL (no pybaseball)
FanGraphs exports plate discipline data at:
`https://www.fangraphs.com/leaders/major-league?pos=all&stats=bat&lg=all&qual=50&type=5&season=2024&month=0&season1=2024`
Type 5 is the plate discipline leaderboard. This may work via `requests.get()` with a browser UA.

### Option 4: Baseball Savant pitch-level data
O-Swing% can be computed from the pitch-by-pitch spray data already being fetched:
- `description` = "swinging_strike" or "foul" etc. with `zone` < 1 or `zone` > 9 (outside zone)
- But this requires pitch-level data per batter, which is very large

---

## Acceptance Criteria

Before re-adding `batter_oswing_pct` to the schema:
1. ✅ Working endpoint that returns O-Swing% (or equivalent) for ≥85% of qualifying batters
2. ✅ Data available for all 4 seasons (2022, 2023, 2024, 2025)
3. ✅ Feature gain ≥1.0% in `feature_importances_` on retrain
4. ✅ Coverage confirmed via `feature_sprint_d1.py` Phase A extension

---

## Notes

- FanGraphs `batting_stats()` 403 is a known pybaseball issue (legacy endpoint blocked)
- The `pitching_stats()` function uses a different endpoint and works fine — hence `pitcher_zone_pct` (Zone% for pitchers) already in v2 schema at 98.7% coverage
- If O-Swing% cannot be sourced, consider alternative discipline metrics: SwStr% (swinging strike rate), Z-Contact%, or CSW% (called strike + whiff rate)
