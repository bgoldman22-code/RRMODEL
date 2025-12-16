# EPL Profile C - Historical Data Fetcher Implementation Complete

**Date:** December 10, 2025  
**Status:** ✅ FETCHERS IMPLEMENTED, READY TO EXECUTE

---

## What We Just Built

Created **2 comprehensive data fetchers** to collect historical data from free sources that match your existing Profile C training/validation periods.

### Target Date Range
Based on your `backtest_epl_profile_c_v2.py`:
- **Training:** 2023-24 season (388 matches)
- **Validation:** 2024-25 + 2025-26 seasons (541 matches)
- **Total:** ~929 matches

---

## Files Created

### 1. API-Football Fetcher
**Location:** `scripts/soccer/fetchers/fetch_api_football.py`

**What it does:**
- Fetches match statistics for EPL seasons 2023-24, 2024-25, 2025-26
- Uses your existing API-Football Ultra plan ($0 additional cost)
- Extracts 17 stat types per match (34 columns total with home/away)

**Features extracted:**
```python
# Goal Expectation (PRIMARY)
- home_xg, away_xg  # Expected goals

# Shot Metrics (6 types)
- shots_total, shots_on_target, shots_off_target
- shots_inside_box, shots_outside_box, shots_blocked

# Possession & Passing
- possession_pct
- passes_total, passes_accurate, pass_accuracy_pct

# Match Context
- corners, gk_saves, fouls, cards
- referee name (for BTTS rate calculation)
- venue
```

**Output:** `data/premier_league/api_football_statistics.csv`

**Expected runtime:** ~15 minutes (0.5s delay between requests)

---

### 2. FPL Player Availability Fetcher
**Location:** `scripts/soccer/fetchers/fetch_fpl_data.py`

**What it does:**
- Processes gameweek-by-gameweek player data from `temp_fpl_data/`
- Aggregates player availability to team-level metrics
- Calculates squad quality impact

**Features extracted (UNIQUE!):**
```python
# Player Availability
- availability_pct  # % of squad available
- injured_count, doubtful_count
- avg_chance_of_playing  # Official FPL injury %
- expected_minutes_pct  # Weighted by availability

# Squad Quality Impact
- missing_attack_quality  # xG+xA of unavailable players
- available_attack_quality  # xG+xA of available players
- attack_quality_pct  # % of attack strength available
```

**Output:** `data/premier_league/fpl_player_context.csv`

**Expected runtime:** ~5 minutes (local file processing, no API calls)

---

### 3. Documentation
**Location:** `scripts/soccer/fetchers/README.md`

Complete guide with:
- Quick start commands
- Feature descriptions
- Merge instructions
- Troubleshooting
- Expected coverage statistics

---

## Combined Feature Set

From these 2 sources, you'll get **~40+ features** per match:

### Direct Features (34 from sources)
1. **API-Football (17):**
   - xG, 6 shot types, possession, 3 passing metrics, corners, saves, fouls, cards, referee
   
2. **FPL Data (10):**
   - Squad availability %, injury count, doubtful count, expected minutes %, missing/available attack quality, attack quality %

3. **Match Context (7):**
   - Venue, referee, team names, goals, date, season, gameweek

### Derived Features (10+)
You can calculate:
```python
# xG Analysis
xg_dominance = abs(home_xg - away_xg)
adjusted_xg_home = home_xg * (home_attack_quality_pct / 100)

# Shot Quality
shot_quality_home = home_xg / home_shots_total
shot_accuracy_home = home_shots_on_target / home_shots_total
inside_box_pct_home = home_shots_inside_box / home_shots_total

# Style Metrics
possession_dominance = abs(home_poss - away_poss)
pass_accuracy_diff = home_pass_accuracy - away_pass_accuracy

# Squad Impact
squad_quality_diff = home_attack_quality_pct - away_attack_quality_pct

# Referee Historical
referee_btts_rate = (aggregate from historical matches)
```

---

## Next Steps to Execute

### Phase 1: Fetch Data (Today - 20 minutes)

```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL

# 1. Run API-Football fetcher (~15 min)
python3 scripts/soccer/fetchers/fetch_api_football.py

# 2. Run FPL fetcher (~5 min)
python3 scripts/soccer/fetchers/fetch_fpl_data.py
```

**Expected output:**
- `data/premier_league/api_football_statistics.csv` (~920 rows × 40 columns)
- `data/premier_league/fpl_player_context.csv` (~920 rows × 25 columns)
- Metadata JSON files with coverage statistics

---

### Phase 2: Merge with Baseline (1-2 hours)

Create `scripts/soccer/merge_external_data.py`:

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

# Calculate derived features
merged['xg_dominance'] = abs(merged['home_xg'] - merged['away_xg'])
merged['adjusted_xg_home'] = merged['home_xg'] * (merged['home_attack_quality_pct'] / 100)
# ... (add all derived features)

# Validate
print(f"Baseline: {len(baseline)} matches")
print(f"Merged: {len(merged)} matches")
print(f"API-Football coverage: {merged['home_xg'].notna().sum() / len(merged) * 100:.1f}%")
print(f"FPL coverage: {merged['home_availability_pct'].notna().sum() / len(merged) * 100:.1f}%")

# Save
merged.to_csv('backtest-results/epl_results_with_btts_odds_enhanced.csv', index=False)
```

---

### Phase 3: Feature Engineering (1 day)

Add features to `epl_profile_c_option_c_core.py`:

```python
# Update feature list
ENHANCED_FEATURES = [
    # Existing Dixon-Coles features
    'home_dc_prob', 'away_dc_prob', 'dc_btts_prob',
    
    # xG features (NEW)
    'home_xg', 'away_xg', 'xg_dominance',
    'adjusted_xg_home', 'adjusted_xg_away',
    
    # Shot quality (NEW)
    'shot_quality_home', 'shot_quality_away',
    'shot_accuracy_home', 'shot_accuracy_away',
    
    # Possession (NEW)
    'home_possession_pct', 'away_possession_pct',
    'possession_dominance',
    
    # Squad availability (NEW - UNIQUE!)
    'home_availability_pct', 'away_availability_pct',
    'home_injured_count', 'away_injured_count',
    'home_attack_quality_pct', 'away_attack_quality_pct',
    'squad_quality_diff',
    
    # Referee (NEW)
    'referee_btts_rate',
    
    # Odds features (existing)
    'market_btts_yes_prob', 'market_btts_no_prob',
    # ... etc
]
```

---

### Phase 4: Model Training (2-3 days)

```bash
# Retrain Profile C with enhanced features
python3 backtest_epl_profile_c_v2.py --enhanced

# Walk-forward validation
python3 scripts/soccer/backtest_epl_profile_c_walkforward.py --enhanced
```

**Expected improvements:**
- Baseline (Dixon-Coles only): +19.64% ROI
- Enhanced (Dixon-Coles + xG + availability): **+25-30% ROI** (target)

---

## Key Advantages

### 1. Perfect Date Alignment
Fetchers target **exact same seasons** as your existing baseline:
- 2023-24 (training)
- 2024-25, 2025-26 (validation)

### 2. Zero Additional Cost
- API-Football: Already paid (Ultra plan active until 2026-03-10)
- FPL Data: Free GitHub repo
- **Total: $0**

### 3. Unique Value from FPL Data
FPL provides the **ONLY free source** with official player availability data:
- Injury status (available/doubtful/injured/unavailable)
- Chance of playing % (0-100)
- Squad quality impact (xG+xA of missing players)

This enables **player-aware BTTS modeling**:
- ❌ "Team had high xG but key striker was injured"
- ✅ "Team had moderate xG but full squad available"

### 4. Complementary Features
- **API-Football:** What happened? (team xG, shots, possession)
- **FPL Data:** Who was available? (injuries, squad rotation)
- **Combined:** Why did BTTS happen? (team attack + player context)

---

## Expected Coverage

Based on API-Football investigation:
- **API-Football:** 95-100% (major league, comprehensive)
- **FPL Data:** 95-100% (official FPL tracks every match)
- **Combined:** **95%+ coverage** of your 929 baseline matches

Missing data handled with:
- Left joins (baseline preserved)
- Null indicators (missingness as feature)
- Fallback to Dixon-Coles for incomplete matches

---

## Validation Checklist

After running fetchers:

```bash
# Check coverage
python3 -c "
import pandas as pd
api = pd.read_csv('data/premier_league/api_football_statistics.csv')
fpl = pd.read_csv('data/premier_league/fpl_player_context.csv')

print(f'API-Football: {len(api)} matches')
print(f'  2023-24: {len(api[api[\"season\"] == \"2023-24\"])}')
print(f'  2024-25: {len(api[api[\"season\"] == \"2024-25\"])}')
print(f'  2025-26: {len(api[api[\"season\"] == \"2025-26\"])}')

print(f'\nFPL Data: {len(fpl)} matches')
print(f'  2023-24: {len(fpl[fpl[\"season\"] == \"2023-24\"])}')
print(f'  2024-25: {len(fpl[fpl[\"season\"] == \"2024-25\"])}')
print(f'  2025-26: {len(fpl[fpl[\"season\"] == \"2025-26\"])}')

print(f'\nAPI-Football xG completeness: {api[\"home_xg\"].notna().sum() / len(api) * 100:.1f}%')
print(f'FPL availability completeness: {fpl[\"home_availability_pct\"].notna().sum() / len(fpl) * 100:.1f}%')
"
```

---

## Timeline Estimate

| Phase | Task | Time |
|-------|------|------|
| **Today** | Run fetchers | 20 min |
| **Tomorrow** | Merge + validate | 2-3 hours |
| **Day 3** | Feature engineering | 4-6 hours |
| **Day 4-5** | Model training | 2-3 days |
| **Day 6** | Evaluation | 1 day |
| **Total** | **6 days to enhanced model** | |

---

## Ready to Execute?

Everything is set up. Just run:

```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL

# Fetch API-Football data
python3 scripts/soccer/fetchers/fetch_api_football.py

# Fetch FPL player data
python3 scripts/soccer/fetchers/fetch_fpl_data.py
```

Both scripts have:
- ✅ Error handling
- ✅ Progress tracking
- ✅ Coverage validation
- ✅ Metadata generation
- ✅ Rate limiting (API-Football only)

Let me know when you're ready to run these, and I can help monitor the output or debug any issues!

---

## Summary

You now have:
1. ✅ **API-Football fetcher** - xG, shots, possession (17 features)
2. ✅ **FPL fetcher** - player availability, squad quality (10 features)
3. ✅ **README guide** - complete usage instructions
4. ✅ **Date alignment** - matches your Profile C training periods
5. ✅ **Zero cost** - using existing resources

Next action: **Execute fetchers** to collect historical data for ~929 matches.
