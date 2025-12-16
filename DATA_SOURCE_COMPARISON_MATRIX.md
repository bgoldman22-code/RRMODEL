# EPL Data Source Comparison Matrix

**Date:** December 10, 2025  
**Status:** 2/10 sources investigated (API-Football complete)

---

## Quick Reference: Feature Coverage by Source

| Feature Category | API-Football | FBref | Sportmonks | RapidAPI xG | worldfootballR | soccerdata | FPL Repos | StatsBomb |
|------------------|--------------|-------|------------|-------------|----------------|------------|-----------|-----------|
| **xG** | ✅ YES | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **NPxG** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Shots (detailed)** | ✅ 6 types | ✅ | ✅ | ⚠️ | ✅ | ✅ | ❌ | ✅ |
| **Possession** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| **Passes** | ✅ Total/Acc | ✅ Advanced | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| **Progressive Passes** | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| **Pressures** | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| **Field Tilt** | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| **Player Data** | ❌ | ✅ Minutes | ⚠️ | ❌ | ✅ | ✅ | ✅ FPL | ⚠️ |
| **Injuries** | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Referee** | ✅ | ✅ | ⚠️ | ❌ | ✅ | ✅ | ❌ | ⚠️ |
| **Weather** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Legend:**
- ✅ Available and tested / documented
- ⚠️ Unknown / needs testing
- ❌ Not available

---

## Source Evaluation Summary

### 1. API-Football ⭐⭐⭐⭐⭐ HIGH VALUE
**Status:** ✅ TESTED & VERIFIED

**Pros:**
- ✅ Has xG (unexpected!)
- ✅ Ultra plan active (75k requests/day)
- ✅ Excellent coverage (380 matches/season, 2016-2025)
- ✅ 17 stat types
- ✅ Easy integration (REST API)
- ✅ Real-time updates

**Cons:**
- ❌ No NPxG
- ❌ No advanced style metrics (progressive passes, pressures)
- ⚠️ String values need parsing

**Best For:**
- xG baseline
- Shots (6 types: total, on target, inside/outside box, blocked, off target)
- Possession
- Basic passes (total, accurate, %)
- Corners, cards, fouls
- Referee data

**Coverage:** 100% (1,520 fixtures vs 977 baseline)

**Cost:** ✅ Already paid ($0 additional)

**Recommendation:** ⭐ **PRIMARY SOURCE**

---

### 2. FBref / StatsBomb (via soccerdata) ⭐⭐⭐⭐⭐ HIGH VALUE
**Status:** ⏳ NEEDS TESTING

**Expected Pros:**
- ✅ StatsBomb data (gold standard)
- ✅ Progressive passes
- ✅ Pressures (for PPDA)
- ✅ Field tilt
- ✅ xG/NPxG
- ✅ Free (web scraping)

**Expected Cons:**
- ⚠️ Rate limiting (scraping)
- ⚠️ Requires parsing HTML
- ⚠️ May break if site changes

**Best For:**
- Advanced style metrics
- Team profiles (pressing intensity, possession style)
- Progressive actions
- Complementing API-Football

**Cost:** ✅ Free

**Recommendation:** ⭐ **SECONDARY SOURCE** (for advanced metrics)

---

### 3. Sportmonks ⭐⭐ LOW VALUE
**Status:** ⏳ NEEDS TESTING

**Expected Pros:**
- ✅ Professional API
- ✅ Comprehensive coverage
- ✅ Real-time updates

**Expected Cons:**
- ❌ Expensive ($50-200/month)
- ❌ Redundant with API-Football
- ❌ May not have advanced metrics

**Best For:**
- Nothing unique (API-Football + FBref cover it)

**Cost:** ❌ $50-200/month

**Recommendation:** ❌ **SKIP** (redundant + expensive)

---

### 4. RapidAPI xG Statistics ⭐⭐ LOW VALUE
**Status:** ⏳ AWAITING USER KEY

**Expected Pros:**
- ✅ May have NPxG
- ✅ Focused on xG data

**Expected Cons:**
- ❌ Likely redundant with API-Football
- ⚠️ Unknown rate limits
- ⚠️ Unknown cost

**Best For:**
- Possibly NPxG if API-Football doesn't have it

**Cost:** ⚠️ Unknown

**Recommendation:** ⚠️ **LOW PRIORITY** (test only if NPxG needed)

---

### 5. worldfootballR ⭐⭐⭐⭐ MEDIUM-HIGH VALUE
**Status:** ⏳ NEEDS R ENVIRONMENT

**Expected Pros:**
- ✅ StatsBomb data via FBref
- ✅ Well-maintained package
- ✅ Free

**Expected Cons:**
- ❌ Requires R environment
- ❌ Redundant with soccerdata (Python)

**Best For:**
- Same as FBref (if you prefer R)

**Cost:** ✅ Free

**Recommendation:** ⚠️ **SKIP** (use soccerdata instead - Python equivalent)

---

### 6. soccerdata (Python) ⭐⭐⭐⭐⭐ HIGH VALUE
**Status:** ⏳ NEEDS INSTALLATION

**Expected Pros:**
- ✅ Python-native
- ✅ FBref scraper (StatsBomb data)
- ✅ Understat scraper (xG)
- ✅ Multiple sources in one package
- ✅ Free

**Expected Cons:**
- ⚠️ Scraping limits
- ⚠️ May break if sites change

**Best For:**
- Advanced metrics (progressive passes, pressures)
- Team style profiles
- Complementing API-Football

**Cost:** ✅ Free

**Recommendation:** ⭐ **HIGH PRIORITY** (test immediately - Python equivalent of worldfootballR)

---

### 7. FPL-Elo-Insights ⭐⭐⭐ MEDIUM VALUE
**Status:** ⏳ NEEDS CLONE

**Expected Pros:**
- ✅ Elo ratings
- ✅ Historical tracking

**Expected Cons:**
- ❌ No new data sources (derived from FPL)
- ⚠️ Unknown update frequency

**Best For:**
- Team strength ratings
- Form indicators

**Cost:** ✅ Free (GitHub)

**Recommendation:** ⚠️ **MEDIUM PRIORITY** (nice-to-have for form features)

---

### 8. Fantasy-Premier-League (vaastav) ⭐⭐⭐⭐ HIGH VALUE
**Status:** ⏳ NEEDS CLONE

**Expected Pros:**
- ✅ Player availability
- ✅ Minutes played
- ✅ Injury status
- ✅ Historical data back to 2016
- ✅ Updated weekly

**Expected Cons:**
- ⚠️ FPL data only (not match-level)

**Best For:**
- Player availability features
- Squad rotation tracking
- Injury impact

**Cost:** ✅ Free (GitHub)

**Recommendation:** ⭐ **HIGH PRIORITY** (unique player data)

---

### 9. Premier-League-API (tarun7r) ⭐⭐ LOW-MEDIUM VALUE
**Status:** ⏳ NEEDS CLONE

**Expected Pros:**
- ✅ GitHub repo (free)

**Expected Cons:**
- ⚠️ Unknown data quality
- ⚠️ Unknown coverage

**Best For:**
- Unknown until tested

**Cost:** ✅ Free (GitHub)

**Recommendation:** ⚠️ **LOW PRIORITY** (test if time permits)

---

### 10. StatsBomb Open Data ⭐⭐⭐ MEDIUM VALUE
**Status:** ⏳ NEEDS INVESTIGATION

**Expected Pros:**
- ✅ Gold standard data
- ✅ Free sample datasets

**Expected Cons:**
- ❌ Limited to select matches (not full EPL)
- ❌ Not updated regularly

**Best For:**
- Understanding StatsBomb schema
- Sample analysis
- NOT for production model

**Cost:** ✅ Free (limited data)

**Recommendation:** ⚠️ **LOW PRIORITY** (use FBref instead for full coverage)

---

## Recommended Integration Stack

### Tier 1: PRIMARY SOURCES (Implement First)

1. **API-Football** ✅ READY TO IMPLEMENT
   - xG, shots, possession, passes
   - Referee data
   - 100% coverage

2. **soccerdata** ⏳ INSTALL TODAY
   - Progressive passes/pressures
   - Advanced style metrics
   - StatsBomb data

3. **FPL Data (vaastav repo)** ⏳ CLONE TODAY
   - Player availability
   - Injuries
   - Squad rotation

### Tier 2: SUPPLEMENTARY (If Time/Budget Permits)

4. **FPL-Elo-Insights**
   - Elo ratings
   - Form indicators

5. **EPL BallDontLie**
   - Quick test (no auth needed)

### Tier 3: SKIP (Redundant or Low Value)

❌ **Sportmonks** - Expensive + redundant with API-Football
❌ **worldfootballR** - Use soccerdata (Python) instead
❌ **RapidAPI xG** - Redundant with API-Football
❌ **StatsBomb Open** - Limited coverage (use FBref)
❌ **Premier-League-API** - Unknown quality

---

## Feature Coverage Matrix

### Goal Expectation Features

| Feature | API-Football | FBref | soccerdata | FPL |
|---------|--------------|-------|------------|-----|
| xG | ✅ | ✅ | ✅ | ❌ |
| NPxG | ❌ | ✅ | ✅ | ❌ |
| xG per shot | ✅ Derived | ✅ | ✅ | ❌ |
| Big chances | ❌ | ✅ | ✅ | ❌ |
| Shots on target | ✅ | ✅ | ✅ | ❌ |
| Shots inside box | ✅ | ✅ | ✅ | ❌ |

**Best Source:** API-Football (primary) + FBref (NPxG)

---

### Team Style Features

| Feature | API-Football | FBref | soccerdata | FPL |
|---------|--------------|-------|------------|-----|
| Possession % | ✅ | ✅ | ✅ | ❌ |
| Progressive passes | ❌ | ✅ | ✅ | ❌ |
| Pressures | ❌ | ✅ | ✅ | ❌ |
| PPDA | ❌ | ✅ Derived | ✅ | ❌ |
| Field tilt | ❌ | ✅ | ✅ | ❌ |
| Pass accuracy | ✅ | ✅ | ✅ | ❌ |

**Best Source:** FBref/soccerdata (StatsBomb data)

---

### Player Availability Features

| Feature | API-Football | FBref | soccerdata | FPL |
|---------|--------------|-------|------------|-----|
| Injury status | ❌ | ❌ | ❌ | ✅ |
| Minutes played | ❌ | ✅ | ✅ | ✅ |
| Rotation risk | ❌ | ❌ | ❌ | ✅ Derived |
| Squad depth | ❌ | ❌ | ❌ | ✅ Derived |

**Best Source:** FPL data (unique)

---

### Match Context Features

| Feature | API-Football | FBref | soccerdata | FPL |
|---------|--------------|-------|------------|-----|
| Referee | ✅ | ✅ | ✅ | ❌ |
| Venue | ✅ | ✅ | ✅ | ❌ |
| Weather | ❌ | ❌ | ❌ | ❌ |
| Pitch quality | ❌ | ❌ | ❌ | ❌ |

**Best Source:** API-Football
**Missing:** Weather (need external API)

---

## Implementation Timeline

### Week 1: Foundation
- [x] Test API-Football (DONE)
- [ ] Install soccerdata
- [ ] Clone FPL data repo
- [ ] Build fetcher for API-Football
- [ ] Build fetcher for FBref (via soccerdata)
- [ ] Build fetcher for FPL data
- [ ] Merge all sources with baseline 904 matches

### Week 2: Feature Engineering
- [ ] Parse API-Football data → features
- [ ] Parse FBref data → style features
- [ ] Parse FPL data → availability features
- [ ] Build rolling features (last 5/10 matches)
- [ ] Build team style profiles
- [ ] Build team interaction features

### Week 3: Model Development
- [ ] Add features to Option C model
- [ ] Train with xG features
- [ ] Train with style features
- [ ] Train with availability features
- [ ] Compare vs Dixon-Coles baseline

---

## Next Actions

### TODAY:
1. ✅ Complete API-Football investigation (DONE)
2. ⏳ Install soccerdata: `pip install soccerdata`
3. ⏳ Test FBref scraping
4. ⏳ Clone FPL repo: `git clone https://github.com/vaastav/Fantasy-Premier-League`
5. ⏳ Build `fetch_api_football.py`

### THIS WEEK:
6. Parse FPL data structure
7. Build unified feature schema
8. Implement all 3 fetchers
9. Merge with baseline 904 matches
10. Start feature engineering

---

**Status:** 2/10 sources investigated (20% complete)  
**Next Source:** soccerdata (Python package for FBref scraping)
