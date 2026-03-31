# TICKET: FanGraphs Features — Blocked Endpoints Investigation

**Status:** Open  
**Priority:** Low (not blocking — median imputation in effect for affected features)  
**Created:** 2026-03-31  

---

## Background

`pybaseball.pitching_stats()` and `pybaseball.batting_stats()` both call
`https://www.fangraphs.com/leaders-legacy.aspx`, which returns HTTP 403 on all
GitHub Actions runner IPs (server-side block, not a pybaseball version issue).

**Impact:** Two features sourced from FanGraphs are unavailable in production:
1. `batter_oswing_pct` — dropped from v2 schema entirely (0% coverage, 0% feature gain)
2. `pitcher_zone_pct` — retained in v2 schema at index [10], **imputes to median 0.42**

The imputation is a constant offset and does not crash inference or degrade picks
catastrophically — zone% is a stable between-pitcher discriminator, not a high-variance
feature. However, it should be resolved before the feature is considered fully live.

---

## Item 1: `batter_oswing_pct`

**O-Swing% (batter):** fraction of pitches outside the strike zone that the batter swings at.  
**Status:** Dropped from v2 schema. Not in `feature_schema.json`, `train_medians.json`,
`build_daily_features.py`, `mlb-score-v3.py`, or `mlb-slate-v3.mjs`.  
Do **not** re-add until a working endpoint with ≥85% season-long coverage is confirmed.

### Investigation Options

**Option 1: `batting_stats_bref()` (Baseball Reference)**
```python
from pybaseball import batting_stats_bref
df = batting_stats_bref(2024)
print([c for c in df.columns if 'swing' in c.lower() or 'zone' in c.lower()])
```

**Option 2: `fg_batting_data()` (newer FanGraphs endpoint)**
```python
from pybaseball import fg_batting_data
df = fg_batting_data(2024, 2024, qual=50)
print([c for c in df.columns if 'swing' in c.lower() or 'zone' in c.lower()])
```

**Option 3: Compute from Savant pitch-level spray data**
O-Swing% can be computed from the pitch-by-pitch spray CSV already fetched:
pitches where `zone` > 9 or `zone` < 1 (outside zone) and `description` contains `"swing"`.

### Acceptance Criteria
1. Working endpoint returning O-Swing% for ≥85% of qualifying batters
2. Data available for 2022–2025 (4 seasons)
3. Feature gain ≥1.0% in `feature_importances_` on retrain
4. Coverage confirmed via `feature_sprint_d1.py` Phase A extension

---

## Item 2: `pitcher_zone_pct`

**Zone% (pitcher):** fraction of a pitcher's pitches that land in the strike zone.  
**Model position:** Feature index [10] in v2 schema. Median = 0.42.  
**Status:** Retained in model. Currently imputing to median 0.42 for all pitchers because
`pybaseball.pitching_stats()` is 403-blocked on GitHub Actions runners.

**Current behavior in `build_daily_features.py`:**
- FanGraphs name lookup attempted (`fg_c_by_name`, `fg_p_by_name`) — returns None (empty blob)
- Arsenal-based fallback attempted (`zone_percent` per pitch) — Savant arsenal endpoint
  does not include a zone% column (confirmed 2026-03-31: cols are `run_value_per_100`,
  `pitch_usage`, `whiff_percent`, `k_percent`, `put_away`, `hard_hit_percent`)
- Falls through to `impute_and_infer()` median imputation

**Validation gate:** warn-only (⚠️), not a hard fail.

### Investigation Options

**Option 1: `fg_pitching_data()` (newer pybaseball endpoint)**
```python
from pybaseball import fg_pitching_data
df = fg_pitching_data(2025, 2025, qual=10)
print([c for c in df.columns if 'zone' in c.lower()])
```
May use a different FanGraphs API path that isn't 403-blocked.

**Option 2: FanGraphs JSON API with browser UA**
```python
import requests
url = ("https://www.fangraphs.com/api/leaders/major-league/data"
       "?pos=all&stats=pit&lg=all&qual=10&season=2025&season1=2025"
       "&ind=0&team=0&pageitems=2000&pagenum=1&type=8")
r = requests.get(url, headers={"User-Agent": "Mozilla/5.0 ..."})
# type=8 is the plate discipline leaderboard which includes Zone%
```

**Option 3: Pre-bake 2025 zone% into a static JSON artifact**
Run once locally (where FanGraphs is accessible), serialize zone% per pitcher to
`data/mlb_v3/artifacts/pitcher_zone_pct_2025.json`, commit to repo, load as
fallback in `build_daily_features.py` before median imputation.

### Acceptance Criteria
1. Working endpoint returning Zone% for ≥90% of pitchers with ≥10 IP
2. Data available daily (or acceptable to use prior-season static values)
3. Validation gate flips from ⚠️ warn to ✅

---

## Notes

- The 403 block affects `leaders-legacy.aspx` only — all Baseball Savant endpoints remain fully accessible
- `pitcher_hrfb` (HR/FB rate, also from FanGraphs) is currently showing 89.3% coverage via
  the stored `fangraphs-pitching-2025.json` blob that was written before the 403 started;
  this coverage will degrade to 0% once that blob is overwritten by a failed fetch
- Both features share the same root cause and should be fixed together
