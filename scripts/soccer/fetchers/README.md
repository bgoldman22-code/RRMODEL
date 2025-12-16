# EPL External Data Fetchers

This directory contains scripts to fetch historical data from free sources to enhance Profile C BTTS modeling.

## Quick Start

```bash
# 1. Set API key (in .env.local)
API_FOOTBALL_KEY=your_key_here

# 2. Fetch API-Football data (xG, shots, possession)
python3 scripts/soccer/fetchers/fetch_api_football.py

# 3. Fetch FPL player availability data
python3 scripts/soccer/fetchers/fetch_fpl_data.py
```

## Data Sources

### 1. API-Football (Primary - Team Statistics)
**File:** `fetch_api_football.py`  
**Cost:** $0 (Ultra plan already active until 2026-03-10)

**Features extracted:**
- ✅ **xG** (expected_goals) - Team attacking threat
- ✅ **6 Shot Types:**
  - Total shots
  - Shots on target
  - Shots off target
  - Shots inside box
  - Shots outside box
  - Blocked shots
- ✅ **Possession** - Ball possession %
- ✅ **Passing:**
  - Total passes
  - Accurate passes
  - Pass accuracy %
- ✅ **Other Context:**
  - Corners
  - Goalkeeper saves
  - Referee name (for BTTS rate calculation)
  - Yellow/red cards

**Coverage:**
- 2023-24: ~380 matches
- 2024-25: ~380 matches
- 2025-26: ~160 matches (in progress)
- **Total: ~920 matches**

**Output:** `data/premier_league/api_football_statistics.csv`

---

### 2. FPL Data (Primary - Player Availability)
**File:** `fetch_fpl_data.py`  
**Cost:** $0 (free GitHub repo)

**Features extracted (UNIQUE!):**
- ✅ **Player Availability:**
  - % of squad available
  - Injury count, doubtful count
  - Average chance of playing
  - Expected minutes available %
- ✅ **Squad Quality Metrics:**
  - Missing attack quality (xG+xA of unavailable players)
  - Available attack quality
  - Attack quality % available
- ✅ **Context:**
  - Squad size
  - Gameweek

**Why This Matters:**
Official FPL data provides **the only free source** with real-time player availability. This enables player-aware BTTS modeling:
- "Team had high xG but key striker was injured" ❌
- "Team had low xG but full squad available" ✅

**Coverage:**
- 2023-24: ~380 matches
- 2024-25: ~380 matches
- 2025-26: Partial (in progress)

**Output:** `data/premier_league/fpl_player_context.csv`

---

## Combined Feature Set

From these 2 sources, we get **~40+ features**:

### Team Statistics (API-Football)
1. xG home/away
2. 6 shot metrics × 2 teams = 12 features
3. Possession % home/away
4. Pass accuracy % home/away
5. Corners, saves, fouls
6. Referee name

### Player Context (FPL Data)
1. Squad availability % home/away
2. Injury/doubtful counts home/away
3. Expected minutes available % home/away
4. Missing attack quality home/away
5. Available attack quality home/away
6. Attack quality % available home/away

### Derived Features (Calculated)
1. **xG dominance** = abs(home_xg - away_xg)
2. **Shot quality** = xG / total_shots
3. **Shot accuracy** = shots_on_target / total_shots
4. **Inside box shot %** = shots_insidebox / total_shots
5. **Possession dominance** = abs(home_poss - away_poss)
6. **Squad quality differential** = home_attack_quality - away_attack_quality
7. **Adjusted xG** = team_xG × (available_quality / full_quality)
8. **Referee historical BTTS rate** (aggregate across matches)

---

## Usage

### Step 1: Fetch Data

```bash
# Run both fetchers (takes ~15-20 minutes total)
python3 scripts/soccer/fetchers/fetch_api_football.py
python3 scripts/soccer/fetchers/fetch_fpl_data.py
```

### Step 2: Merge with Profile C Baseline

The fetchers output data with standardized keys:
- `season` (e.g., "2023-24")
- `date` (YYYY-MM-DD)
- `home_norm` (normalized team name)
- `away_norm` (normalized team name)

Merge with existing Profile C data:

```python
import pandas as pd

# Load baseline
baseline = pd.read_csv('backtest-results/epl_results_with_btts_odds_v2.csv')

# Load external data
api_football = pd.read_csv('data/premier_league/api_football_statistics.csv')
fpl_data = pd.read_csv('data/premier_league/fpl_player_context.csv')

# Merge
merged = baseline.merge(
    api_football,
    on=['season', 'date', 'home_norm', 'away_norm'],
    how='left'
).merge(
    fpl_data,
    on=['season', 'date', 'home_norm', 'away_norm'],
    how='left'
)

print(f"Baseline matches: {len(baseline)}")
print(f"Merged matches: {len(merged)}")
print(f"Coverage: {merged['home_xg'].notna().sum() / len(merged) * 100:.1f}%")
```

### Step 3: Feature Engineering

```python
# Derived features
merged['xg_dominance'] = abs(merged['home_xg'] - merged['away_xg'])
merged['shot_quality_home'] = merged['home_xg'] / merged['home_shots_total']
merged['shot_quality_away'] = merged['away_xg'] / merged['away_shots_total']
merged['shot_accuracy_home'] = merged['home_shots_on_target'] / merged['home_shots_total']
merged['possession_dominance'] = abs(merged['home_possession_pct'] - merged['away_possession_pct'])
merged['squad_quality_diff'] = merged['home_attack_quality_pct'] - merged['away_attack_quality_pct']

# Adjusted xG (weighted by squad availability)
merged['adjusted_xg_home'] = merged['home_xg'] * (merged['home_attack_quality_pct'] / 100)
merged['adjusted_xg_away'] = merged['away_xg'] * (merged['away_attack_quality_pct'] / 100)
```

### Step 4: Train Enhanced Model

Integrate features into `epl_profile_c_option_c_core.py`:

```python
# Add to feature list
ENHANCED_FEATURES = [
    # xG features
    'home_xg', 'away_xg', 'xg_dominance',
    'adjusted_xg_home', 'adjusted_xg_away',
    
    # Shot features
    'home_shots_total', 'away_shots_total',
    'shot_quality_home', 'shot_quality_away',
    'shot_accuracy_home', 'shot_accuracy_away',
    
    # Possession
    'home_possession_pct', 'away_possession_pct',
    'possession_dominance',
    
    # Squad availability
    'home_availability_pct', 'away_availability_pct',
    'home_injured_count', 'away_injured_count',
    'home_attack_quality_pct', 'away_attack_quality_pct',
    'squad_quality_diff',
    
    # ... combine with existing Dixon-Coles features
]
```

---

## Rate Limits

### API-Football
- **Plan:** Ultra (75,000 requests/day)
- **Usage:** ~2 requests per match (fixture + statistics)
- **For 920 matches:** ~1,840 requests (2.4% of daily limit)
- **Time:** ~15 minutes with 0.5s delay between requests

### FPL Data
- **Source:** Local files (no API calls)
- **No rate limits**
- **Time:** ~5 minutes to process all seasons

---

## Expected Coverage

Based on testing:
- **API-Football:** 95-100% coverage (major league, comprehensive data)
- **FPL Data:** 95-100% coverage (official FPL tracks every match)
- **Combined:** 95%+ of Profile C baseline matches should have external data

Missing data will be handled with:
- Left joins (baseline preserved)
- Null indicators (missingness as feature)
- Fallback to Dixon-Coles for matches without external data

---

## Troubleshooting

### API-Football Issues

**"401 Unauthorized"**
- Check `API_FOOTBALL_KEY` in `.env.local`
- Verify key is active at https://dashboard.api-football.com

**"403 Forbidden" or "429 Too Many Requests"**
- Ultra plan should never hit limits
- Check usage at dashboard
- Increase delay between requests if needed

**"No stats for fixture X"**
- Some matches may not have detailed statistics
- Expected for ~5% of matches
- Script continues, outputs warning

### FPL Data Issues

**"Fixtures file not found"**
- Ensure `temp_fpl_data/` repo is cloned
- Check season folder exists (e.g., `temp_fpl_data/data/2023-24/`)

**"No player data for GW X"**
- Early gameweeks may be missing in partial seasons
- Script continues, skips that gameweek

**Low coverage**
- Check FPL_TEAM_MAPPING in script
- Some promoted/relegated teams may need mapping updates

---

## Next Steps

After fetching data:

1. **Validate coverage:**
   ```bash
   python3 scripts/soccer/validate_external_data_coverage.py
   ```

2. **Merge with baseline:**
   ```bash
   python3 scripts/soccer/merge_external_data.py
   ```

3. **Retrain Profile C:**
   ```bash
   python3 backtest_epl_profile_c_v2.py --enhanced
   ```

4. **Compare performance:**
   - Baseline: Dixon-Coles only
   - Enhanced: Dixon-Coles + xG + player availability
   - Target: +5-10% ROI improvement

---

## File Structure

```
scripts/soccer/fetchers/
├── README.md (this file)
├── fetch_api_football.py (team statistics)
└── fetch_fpl_data.py (player availability)

data/premier_league/
├── api_football_statistics.csv (output)
├── api_football_metadata.json (coverage info)
├── fpl_player_context.csv (output)
└── fpl_player_metadata.json (coverage info)
```

---

## Cost Summary

- **API-Football:** $0 additional (Ultra plan already paid)
- **FPL Data:** $0 (free GitHub repo)
- **Total:** $0

---

## Documentation

- API-Football investigation: `API_FOOTBALL_INVESTIGATION_RESULTS.md`
- FPL Data investigation: `FPL_DATA_INVESTIGATION_RESULTS.md`
- Free sources summary: `FREE_SOURCES_INVESTIGATION_SUMMARY.md`
- Comprehensive analysis: `EPL_EXTERNAL_DATA_COMPREHENSIVE_ANALYSIS.md`
