# 🏈 NFL Receiving Props Model - Architecture Audit

**Date:** October 18, 2025  
**Question:** Are we using up-to-date NFLverse data and opponent matchup info? Is it elite?

---

## TL;DR - Current State

**Status:** ⚠️ **PROTOTYPE, NOT ELITE YET**

### What You Have:
- ✅ **Elite simulation engine** (Negative Binomial → Beta-Binomial → Lognormal)
- ✅ **Proper distributions** (not just means)
- ✅ **20,000 Monte Carlo draws** per player
- ✅ **Correct probability calculations**

### What You DON'T Have:
- ❌ **No live data** - Hardcoded Week 7 stats in JavaScript
- ❌ **No NFLverse/nflfastR integration** - Static player database
- ❌ **No opponent adjustments** - Only basic game script (spread)
- ❌ **No injury integration** - Despite having elite injury system
- ❌ **No depth chart updates** - Manual player database
- ❌ **No recent form** - No L5/L10 rolling averages

---

## The Disconnect: R Pipeline vs Production Scanner

### **What Was PLANNED (Elite R Pipeline):**

**Data Source:** nflfastR (NFLverse)
```r
# scripts/nfl-receiving-props/01_collect_receiving_data.R
pbp_data <- nflfastR::load_pbp(2023:2025)  # Real play-by-play

# Calculate rolling stats
player_L10_targets <- pbp_data %>%
  group_by(receiver_id) %>%
  arrange(game_id) %>%
  mutate(
    L10_targets = slider::slide_dbl(targets, mean, .before = 9),
    L10_catch_rate = slider::slide_dbl(complete_pass, mean, .before = 9),
    L10_yards = slider::slide_dbl(yards_gained, mean, .before = 9)
  )
```

**Opponent Adjustments:**
```r
# Opponent pass defense quality
def_stats <- pbp_data %>%
  group_by(defteam) %>%
  summarise(
    epa_allowed = mean(epa, na.rm = TRUE),
    success_rate_allowed = mean(success, na.rm = TRUE)
  )

# Apply to projections
adjusted_targets <- base_targets * (opp_def_rating / league_avg)
```

**Injury Integration:**
```r
# When Nico Collins OUT
injured_targets <- 9.2  # Nico's target share

# Redistribute to backups
tank_dell_adjustment <- injured_targets * 0.70  # 70% absorption
robert_woods_adjustment <- injured_targets * 0.20
```

**Model Features:**
- L10 rolling averages (recent form)
- Opponent defense (EPA allowed)
- Injury redistributions
- Depth chart changes
- Game script (spread/total)
- Weather adjustments

---

### **What's ACTUALLY Running (Current Elite Scanner):**

**Data Source:** Hardcoded JavaScript object
```javascript
// netlify/functions/nfl-receiving-scanner-elite.mjs line 30

const PLAYER_DB = [
  {
    id: 'ceedee-lamb',
    name: 'CeeDee Lamb',
    team: 'DAL',
    avgTargets: 9.2,        // ❌ Static, not live
    targetVariance: 12.5,   // ❌ Hardcoded
    avgCatchRate: 0.68,     // ❌ Not updated
    avgYardsPerCatch: 13.1, // ❌ Season average, not recent form
    aDOT: 11.2,
    avgYAC: 4.8
  },
  // ... 19 more players
];
```

**Opponent Adjustments:** Minimal
```javascript
// elite-pricing-engine.mjs line 345
const { spread, weather, opponent } = gameContext;

// ONLY game script adjustment (no opponent defense)
let adjustedTargets = avgTargets;
if (spread > 7) {
  adjustedTargets *= 1.08;  // Losing team passes more
} else if (spread < -7) {
  adjustedTargets *= 0.92;  // Winning team passes less
}
// ❌ No opponent pass defense rating
// ❌ No CB matchup data
// ❌ No defensive EPA allowed
```

**Injury Integration:** None
```javascript
// ❌ NO injury system connected
// ❌ NO target redistribution
// ❌ NO depth chart updates
// Despite having canonical-availability-v5.mjs built!
```

---

## What Determines the Picks Right Now

### **Input Data (Hardcoded):**
1. **Player season averages** (manually entered for Week 7)
   - avgTargets (e.g., 9.2 for CeeDee)
   - avgCatchRate (e.g., 0.68)
   - avgYardsPerCatch (e.g., 13.1)
   - aDOT (average depth of target)
   - avgYAC (yards after catch)

2. **Game context** (basic)
   - Spread (for game script adjustment only)
   - Weather (dome vs outdoor - not fully implemented)
   - Date (for seeded RNG)

### **Model Process:**

**Stage 1: Targets**
- Uses Negative Binomial distribution
- Mean = avgTargets × game_script_factor (0.92 to 1.08)
- Variance = hardcoded targetVariance
- **NO opponent defense adjustment**

**Stage 2: Catches**
- Uses Beta-Binomial distribution
- Catch rate from player average (not situational)
- **NO pressure rate by opponent**
- **NO coverage matchup**

**Stage 3: Yards**
- Uses Lognormal distribution per catch
- Based on avgYardsPerCatch
- **NO opponent pass defense quality**
- **NO field position adjustments**

**Edge Detection:**
- Model probability vs market odds
- Vig removal (if real odds)
- Kelly sizing
- Edge = model_prob - market_prob (after vig removal)

---

## Is It Elite? Honest Assessment

### **✅ What's Elite:**

1. **Simulation Engine** 
   - Proper distributions (not just means)
   - 20,000 Monte Carlo draws
   - Calibrated probabilities
   - Full tail modeling

2. **Mathematical Rigor**
   - Negative Binomial for targets (overdispersion)
   - Beta-Binomial for catches (varying success rates)
   - Lognormal for yards (skewed right)
   - Proper parameter estimation

3. **Edge Calculation**
   - Vig removal (proportional method)
   - Kelly criterion sizing
   - Probability calibration

### **❌ What's NOT Elite:**

1. **Data is Stale**
   - Hardcoded season averages from Week 7
   - No weekly updates
   - No recent form (L5/L10)
   - Manual player database

2. **No Opponent Intelligence**
   - Ignores defense quality
   - No CB vs WR matchups
   - No pressure rate considerations
   - Only basic game script adjustment

3. **No Situational Context**
   - No injury impact (despite having the system!)
   - No depth chart changes
   - No weather (beyond dome flag)
   - No home/away splits
   - No pace/tempo adjustments

4. **Limited Player Universe**
   - Only 20 players hardcoded
   - No automatic discovery of new props
   - No TE coverage
   - No RB receiving props

---

## The Gap: What You Planned vs What's Live

| Feature | Planned (R Pipeline) | Live (Elite Scanner) | Gap |
|---------|---------------------|---------------------|-----|
| **Data Source** | nflfastR (real-time) | Hardcoded JS | 🔴 Critical |
| **Player Stats** | L5/L10 rolling avg | Season averages | 🔴 Critical |
| **Opponent Def** | EPA allowed, success rate | Game script only | 🔴 Critical |
| **Injury Impact** | Target redistribution | None | 🔴 Critical |
| **Depth Charts** | Weekly updates | Static | 🟡 Important |
| **Recent Form** | Weighted L5 games | Full season | 🔴 Critical |
| **Player Universe** | All 100+ WR/TE | 20 hardcoded | 🟡 Important |
| **Update Frequency** | Daily automatic | Manual | 🔴 Critical |
| **Simulation** | Monte Carlo | Monte Carlo | ✅ Same |
| **Distributions** | NegBin/BetaBin/Lognormal | Same | ✅ Same |

---

## Why the Disconnect Happened

Looking at the README and code comments, it's clear:

1. **R Pipeline was built** (`scripts/nfl-receiving-props/`) - sophisticated, uses nflfastR
2. **Elite scanner was built** (`netlify/functions/nfl-receiving-scanner-elite.mjs`) - proper math
3. **Bridge was never completed** - R outputs not connected to JavaScript scanner

**The R pipeline exists but isn't feeding the production scanner!**

---

## What You Need to Make It Actually Elite

### **Priority 1: Connect to Live Data (Critical)**

**Option A: Run R Pipeline Daily**
```bash
# GitHub Action daily at 7am
Rscript scripts/nfl-receiving-props/master_pipeline.R

# Outputs: data/nfl_receiving_props/week7_projections.json
# Scanner reads this instead of PLAYER_DB
```

**Option B: JavaScript Data Fetcher**
```javascript
// Fetch from nflfastR directly via API
// Or use nfl-data-py wrapper
// Build rolling stats in JS
```

### **Priority 2: Opponent Defense (High Impact)**

Add to `estimateParameters()`:
```javascript
const oppDefRating = await getOpponentDefense(opponent);

// Adjust targets by opponent quality
adjustedTargets *= (oppDefRating / leagueAvg);

// Adjust catch rate by pressure rate
adjustedCatchRate *= (1 - oppPressureRate * 0.15);
```

### **Priority 3: Injury Integration (High Impact)**

```javascript
// Check canonical-availability-v5.mjs
const injuryImpact = await getInjuryImpact(player.team, week);

if (injuryImpact.targetRedistribution) {
  adjustedTargets += injuryImpact.additionalTargets;
}
```

### **Priority 4: Recent Form > Season Averages**

```javascript
// Weight recent games heavier
const projection = {
  avgTargets: player.L5_targets * 0.60 + player.season_targets * 0.40,
  avgCatchRate: player.L5_catch_rate * 0.70 + player.season_catch_rate * 0.30
};
```

---

## Recommendation: Bridge the Gap

### **Option 1: Quick Win (This Week)**

1. **Run R pipeline manually** for Week 8
2. **Export JSON** with all player projections
3. **Replace PLAYER_DB** with JSON import
4. **Keep simulation engine** (it's already elite)

**Effort:** 4-6 hours  
**Impact:** Moves from prototype to production-grade

### **Option 2: Full Integration (2 Weeks)**

1. Build JavaScript data fetcher (nflfastR equivalent)
2. Calculate rolling stats (L5/L10)
3. Integrate opponent defense stats
4. Connect injury system
5. Automate daily updates

**Effort:** 20-30 hours  
**Impact:** Truly elite, fully automated

---

## Bottom Line

**Your model architecture is elite** - the math is correct, distributions are proper, simulation is sound.

**Your data pipeline is NOT elite** - it's hardcoded, stale, and missing critical inputs.

**You have all the pieces** - The R pipeline with nflfastR exists! It's just not connected to the production scanner.

**The fix is straightforward** - Bridge the R output to JavaScript input. The simulation engine doesn't need to change.

---

## Next Steps

**This Weekend:**
1. Run `scripts/nfl-receiving-props/master_pipeline.R` for Week 8
2. Check output: `data/nfl_receiving_props/week8_projections.json`
3. Modify scanner to read JSON instead of PLAYER_DB
4. Test with real Week 8 data

**Next Week:**
1. Set up GitHub Action to run R pipeline daily
2. Add opponent defense adjustments
3. Integrate injury system (you already have it!)
4. Expand player universe beyond 20 players

**Result:** Elite model with elite data = true edge over books.

Right now you have an elite engine with rental car fuel. Put premium gas in it (live data + opponent info + injuries) and it'll perform at elite level.
