# MLB Multi-Market Research Framework

**Date:** January 8, 2026  
**Philosophy:** Prediction-first research exercise, NOT a betting problem

---

## Research Philosophy

> *"For each market, treat this as a prediction-first research exercise, not a betting problem. Ignore odds initially."*

### For Each Market, Determine:

1. **Theoretical Predictability Ceiling** - What's the maximum R² or Brier skill possible?
2. **Stable Signal vs Noise** - Which features persist season-to-season?
3. **Model Family Selection** - Linear vs Tree vs Hierarchical vs Count models
4. **Historical Data Utility** - How many seasons before marginal returns decay?

Only AFTER this: Assess whether odds collection and ROI backtesting are justified.

---

## Market-by-Market Analysis

---

## 1. HOME RUNS (Current Focus) ⚾

### Theoretical Predictability Ceiling

**Expected R² Range:** 0.15-0.25 (very low - HRs are rare events)  
**Expected Brier Skill:** 0.02-0.08 vs naive baseline

**Why Hard to Predict:**
- HRs are ~3% of plate appearances
- Single swing outcome - massive variance
- Park effects, weather create noise
- Pitcher fatigue, game state add randomness

**Ceiling Estimate Method:**
```python
# Calculate ceiling by comparing:
# 1. Barrel rate → HR conversion (most stable)
# 2. Exit velocity + Launch angle → HR (pitch-level)
# 3. Batter skill vs pitcher allowed → matchup

# If barrel rate alone explains 12% of variance
# And pitch quality adds 3%
# And park factors add 3%
# And weather adds 1%
# Ceiling ≈ 19% (optimistic)
```

### Stable Signal Features

| Feature | Stability (YoY r) | Sample Size Needed | Notes |
|---------|-------------------|-------------------|-------|
| **Barrel Rate** | 0.75-0.85 | 100+ PA | Most stable power metric |
| **Exit Velocity 95th** | 0.80-0.90 | 100+ PA | Pure power proxy |
| **HR/FB Rate** | 0.45-0.55 | 150+ FB | Moderate stability |
| **ISO** | 0.65-0.75 | 200+ PA | Good power indicator |
| **Park Factor** | 0.90+ | 2-3 year rolling | Very stable |
| **Pitcher HR/9** | 0.40-0.50 | 50+ IP | Moderate |
| **Pitcher Barrel% Allowed** | 0.55-0.65 | 100+ BIP | Better than HR/9 |

**Noisy Features (Use with Caution):**
| Feature | YoY Correlation | Why Noisy |
|---------|-----------------|-----------|
| Hot streak (14-day) | 0.10-0.20 | Small sample |
| BvP history | 0.05-0.15 | Usually <20 AB |
| Weather (pre-game) | N/A | Changes during game |
| Pitcher "feel" | 0.00-0.10 | Unmeasurable |

### Model Family Selection

**Recommended:** **Logistic Regression with Regularization** or **Gradient Boosted Trees**

**Why:**
- Binary outcome (HR or not per PA)
- Features have different scales
- Interactions matter (batter power × pitcher weakness)
- Need probability calibration

**Model Comparison:**
| Family | Pros | Cons | Use Case |
|--------|------|------|----------|
| Logistic | Interpretable, calibrated | No interactions | Baseline |
| GBM/XGBoost | Captures interactions | Black box, overfits | Production |
| Neural | Flexible | Overfits on small data | Avoid |
| Poisson | Count model | HR = 0/1 usually | Poor fit |

### Historical Data Utility

**Optimal Window:** 2-3 seasons  
**Marginal Returns Decay:** After 4 seasons

**Evidence:**
- Player skills change (aging, injuries)
- League-wide HR rates fluctuate (juiced ball era)
- Park factors shift (renovations, humidor)

**Recommendation:** Weight recent data more heavily
```python
# Sample weighting scheme
weights = {
    'current_season': 1.0,
    'prior_season': 0.7,
    'two_seasons_ago': 0.4,
    'three_seasons_ago': 0.2,
    'four_plus': 0.1
}
```

### Data Requirements Summary

| Data Type | Priority | Source | Status |
|-----------|----------|--------|--------|
| Statcast (EV, LA, Barrel) | 🔴 CRITICAL | Baseball Savant | ✅ Exists |
| Pitcher Arsenal | 🔴 CRITICAL | Statcast | ✅ Exists |
| Park Factors | 🔴 CRITICAL | FanGraphs/Statcast | 🔴 Need script |
| Lineup (batting order) | 🟡 HIGH | RotoWire | 🔴 Need script |
| Weather | 🟡 HIGH | Weather API | 🔴 Need script |
| BvP history | 🟢 MEDIUM | MLB Stats API | ✅ Exists |

---

## 2. PITCHER STRIKEOUTS 🎯

### Theoretical Predictability Ceiling

**Expected R² Range:** 0.35-0.50 (HIGHEST of all markets)  
**Expected RMSE:** 1.5-2.0 strikeouts per game

**Why More Predictable:**
- K% is most stable pitcher skill
- Repeatable mechanics and stuff
- Lineup K% is stable
- Less randomness than ball-in-play outcomes

**Ceiling Estimate:**
```python
# Pitcher K/9 explains ~25%
# Opponent lineup K% adds ~15%
# Pitch count projection adds ~5%
# Game script (blowout = pulled early) subtracts ~5%
# Ceiling ≈ 40-50% R²
```

### Stable Signal Features

| Feature | Stability (YoY r) | Sample Size | Notes |
|---------|-------------------|-------------|-------|
| **K%** | 0.85-0.92 | 50+ IP | MOST STABLE SKILL |
| **SwStr%** | 0.80-0.88 | 500+ pitches | Strikeout proxy |
| **K-BB%** | 0.82-0.90 | 50+ IP | Command + stuff |
| **Chase Rate** | 0.75-0.85 | 200+ pitches | Deception |
| **Opponent K%** | 0.70-0.80 | Team level | Lineup quality |
| **Fastball Velo** | 0.95+ | Physical | Stuff indicator |
| **Breaking Ball %** | 0.85+ | Arsenal | Pitch mix |

### Model Family Selection

**Recommended:** **Poisson Regression** or **Negative Binomial**

**Why Poisson:**
- Strikeouts are counts (0, 1, 2, 3...)
- Rate-based (K per inning)
- Accounts for exposure (expected innings)

**Alternative: Truncated Normal** if treating as continuous

**Key Modeling Decisions:**
```python
# Model: E[K] = exp(α + β₁*pitcher_k_rate + β₂*opp_k_rate + β₃*expected_IP + ...)

# Critical: Must model EXPECTED INNINGS
# Pitcher pulled early = fewer K opportunity
# Use pitch count model as co-predictor
```

### Lineup Dependency

**THIS IS CRITICAL** - Must model lineup, not just team average

```python
# Correct approach:
lineup_k_rate = sum([
    player_k_rate[batter] * expected_pa_share[position]
    for batter, position in confirmed_lineup
])

# Wrong approach:
team_k_rate = season_team_k_percentage  # Ignores who's actually playing
```

### Historical Data Utility

**Optimal Window:** 1-2 seasons (current + prior)  
**Marginal Returns Decay:** After 2 seasons

**Why Shorter:**
- Pitcher velocity changes year-to-year
- Arsenal evolves (new pitches)
- Opponent lineup changes daily
- Book lines adjust quickly

---

## 3. PITCHER OUTS RECORDED 📊

### Theoretical Predictability Ceiling

**Expected R² Range:** 0.30-0.45  
**Why:** Manager behavior is predictable, but early hooks happen

**Key Insight:** *"Books price this lazily using implied innings"*

**Edge Sources:**
1. Bullpen fatigue (3-day usage patterns)
2. Pitch efficiency (P/IP) not priced correctly
3. Ace vs weak opponent = deep game
4. High-scoring environment = early pull

### Stable Signal Features

| Feature | Stability | Notes |
|---------|-----------|-------|
| **Historical IP/GS** | 0.70-0.80 | Baseline expectation |
| **Pitches/IP** | 0.75-0.85 | Efficiency |
| **Bullpen Usage (L3D)** | DYNAMIC | Taxed = SP goes longer |
| **Manager Tendencies** | 0.60-0.70 | Some predictable |
| **Team Favorite Status** | DYNAMIC | Favorites go deeper |
| **Expected Total** | DYNAMIC | High total = shorter outing |

### Model Family Selection

**Recommended:** **Ordinal Regression** or **Custom Quantile Model**

**Why Ordinal:**
- Outs recorded = discrete (9, 12, 15, 18, 21...)
- Natural ordering
- Can model "at least X outs" probability

**Alternative Approach:**
```python
# Two-stage model:
# Stage 1: Expected innings (continuous)
# Stage 2: P(pulled before reaching expected)

expected_ip = baseline_ip * efficiency_factor * bullpen_factor * matchup_factor
p_early_hook = logistic(deficit, pitch_count, manager_tendency)
```

### Key Edge: Bullpen State

```python
# Build bullpen fatigue index
def bullpen_fatigue(team, date):
    recent_usage = get_bullpen_innings(team, last_3_days)
    return {
        'total_innings': sum(recent_usage),
        'high_leverage_innings': sum(high_leverage),
        'rest_days': calculate_rest_days(relievers),
        'fatigue_score': calculate_composite(...)
    }

# When fatigue_score > threshold:
# SP likely goes 1+ extra inning
# This is often NOT priced by books
```

---

## 4. STOLEN BASES 🏃

### Theoretical Predictability Ceiling

**Expected R² Range:** 0.20-0.35 for ATTEMPTS  
**Success Rate:** More stable (~70-80% league average)

**Critical Insight:** *Model ATTEMPT probability, not success*

### Two-Stage Model

```python
# Stage 1: Will player attempt SB today?
p_attempt = f(
    player_sb_tendency,
    catcher_cs_rate,
    pitcher_hold_quality,
    game_script_expectation,  # Close game = more attempts
    manager_aggression
)

# Stage 2: Given attempt, will it succeed?
p_success = f(
    player_sprint_speed,
    catcher_pop_time,
    lead_distance,
    pitch_type  # Breaking ball = slower delivery
)

# Final probability
p_sb = p_attempt * p_success
```

### Stable Signal Features

| Feature | Stability | Source |
|---------|-----------|--------|
| **Sprint Speed** | 0.90+ | Statcast |
| **SB Attempt Rate** | 0.70-0.80 | FanGraphs |
| **Catcher Pop Time** | 0.85+ | Statcast |
| **Catcher CS%** | 0.60-0.70 | FanGraphs |
| **Pitcher to Plate Time** | 0.80+ | Statcast |

### Volatile Features (Cause Noise)

| Feature | Volatility | Issue |
|---------|------------|-------|
| Game Script | HIGH | Can't predict score |
| Inning | HIGH | Context-dependent |
| Pitcher Attention | MEDIUM | Changes pitch-to-pitch |
| Manager Mood | HIGH | Unobservable |

### Key Insight: Elite Stealers Only

```python
# Restrict model to high-attempt players
ELITE_THRESHOLD = 15  # SB attempts per season

# Only model players where:
# 1. Sprint speed > 28 ft/sec (elite)
# 2. Historical attempt rate > 10%
# 3. Team gives green light

# For others, use league base rate
```

---

## 5. HITS + RUNS + RBIs (Composite) 📈

### Theoretical Predictability Ceiling

**Expected R² Range:** 0.25-0.35 (moderate)

**Why Composite Smooths Variance:**
- H + R + RBI captures multiple outcome types
- Less dependent on single event (like HR)
- More plate appearances = more signal

**But Books Know This:**
- Juice is higher on composites
- Need larger edge to be profitable

### Critical Requirement: PA Modeling

```python
# WITHOUT PA MODELING = GARBAGE
# A player batting 2nd gets ~4.5 PA
# A player batting 9th gets ~3.5 PA
# That's 30% difference in opportunity!

def expected_pa(batting_order_position, team_pace, opponent_pace):
    """
    Calculate expected plate appearances
    """
    base_pa = {1: 4.7, 2: 4.5, 3: 4.4, 4: 4.3, 5: 4.1, 
               6: 4.0, 7: 3.9, 8: 3.7, 9: 3.6}
    
    pace_adjustment = (team_pace + opponent_pace) / 2 / league_avg_pace
    
    return base_pa[batting_order_position] * pace_adjustment
```

### Avoid Double Counting

**Problem:** H+R+RBI correlates with team total
**Solution:** Condition on expected team environment

```python
# Wrong: raw H+R+RBI projection
# Right: H+R+RBI | expected_team_total

# Use team total as conditioning variable, not predictor
```

### Model Family Selection

**Recommended:** **Hierarchical Bayesian** with PA as offset

```python
# Model structure:
# H+R+RBI ~ Poisson(λ) where log(λ) = offset(PA) + α + β*X

# Hierarchical for:
# - Player-level effects
# - Team-level effects  
# - Pitcher-level effects
```

---

## 6. FIRST 5 INNINGS (F5 ML/Spread) 🔔

### Theoretical Predictability Ceiling

**Expected Accuracy:** 55-60% (similar to full game)  
**Key Advantage:** Removes bullpen noise

### Why F5 is Promising

```python
# Variance decomposition:
# Full game variance = SP variance + bullpen variance + late-game randomness
# F5 variance = SP variance only (mostly)

# If SP matchup is clear:
# Full game: Bullpen strength matters
# F5: Bullpen irrelevant

# Edge when:
if sp_quality_diff > threshold and bullpen_quality_diff < -threshold:
    # SP strongly favors Team A
    # But Team A has weak bullpen
    # Full game line is influenced by bullpen weakness
    # F5 line may not fully adjust
    f5_edge = True
```

### Key Features

| Feature | Importance | Notes |
|---------|------------|-------|
| **SP xFIP** | CRITICAL | Expected performance |
| **SP vs Lineup** | CRITICAL | Handedness matchup |
| **Historical F5 Results** | HIGH | Track record |
| **Pace of Play** | MEDIUM | Faster = more F5 runs |
| **Weather (wind)** | MEDIUM | Affects run scoring |

### Model Selection

**Recommended:** **Ordinal Regression** for run differential

```python
# Predict P(home_runs - away_runs = k) for k in {-5, -4, ..., 0, ..., 4, 5}
# Then convert to ML/spread probabilities

# Alternative: Bivariate Poisson for (home_runs, away_runs) in F5
```

---

## 7. TEAM TOTALS 🎯

### Theoretical Predictability Ceiling

**Expected RMSE:** 1.5-2.0 runs  
**R² Range:** 0.15-0.25 (single game), 0.40+ (season)

### Key Insight: Avoid Traps

```python
TRAP_DETECTION = {
    'coors': {
        'condition': park == 'Coors Field',
        'adjustment': 'Already priced in - look for overreaction'
    },
    'public_favorite': {
        'condition': public_betting_pct > 70%,
        'adjustment': 'Line may be shaded - less value'
    },
    'weather_overreaction': {
        'condition': wind_speed > 15 and books_over_move > 1.0,
        'adjustment': 'Books already adjust - may be overcorrection'
    }
}
```

### Model Selection

**Recommended:** **Ensemble** (Linear + XGBoost average)

**Why Ensemble:**
- Linear captures fundamental (SP quality, park, lineup)
- XGBoost captures interactions (wind × park × handedness)
- Averaging improves calibration

---

## Research Execution Plan

### Phase 1: Predictability Analysis (Weeks 1-4)

**For Each Market:**

1. **Collect 4-5 seasons of outcomes** (2021-2025)
2. **Build feature set** from Statcast + FanGraphs
3. **Calculate feature stability** (year-over-year correlations)
4. **Run baseline models** (Logistic/Poisson/Linear)
5. **Calculate ceiling R²/Brier** using cross-validation
6. **Document which features are signal vs noise**

### Phase 2: Model Development (Weeks 5-8)

**Only for markets passing Phase 1:**

1. **Select model family** based on outcome type
2. **Engineer final feature set** (stable signals only)
3. **Tune hyperparameters** with walk-forward validation
4. **Measure calibration** (predicted prob vs actual)
5. **Document expected edge** before considering odds

### Phase 3: Odds Assessment (Weeks 9-10)

**Only after model is validated:**

1. **Collect historical odds** (TheOddsAPI)
2. **Calculate implied probabilities**
3. **Measure model edge vs market**
4. **Assess if edge justifies betting**
5. **Design bankroll/stake approach** if proceeding

---

## Summary: Market Viability Ranking

| Market | Predictability | Data Availability | Model Complexity | Recommended Priority |
|--------|---------------|-------------------|------------------|---------------------|
| **Pitcher K** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 🔴 #1 |
| **Pitcher Outs** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 🔴 #2 |
| **Home Runs** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 🟡 #3 (current) |
| **F5 ML/Spread** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 🟡 #4 |
| **Team Totals** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 🟢 #5 |
| **Stolen Bases** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 🟢 #6 |
| **H+R+RBI** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⚠️ Conditional |

---

## Appendix: Data Requirements Matrix

| Feature | HR | K | Outs | SB | H+R+RBI | F5 | Team |
|---------|---|---|------|----|---------|----|------|
| Statcast Batted Ball | ✅ | - | - | - | ✅ | - | - |
| Statcast Pitch | ✅ | ✅ | ✅ | - | - | ✅ | - |
| Statcast Sprint Speed | - | - | - | ✅ | - | - | - |
| Catcher Pop Time | - | - | - | ✅ | - | - | - |
| FanGraphs Player | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| FanGraphs Team | - | ✅ | ✅ | - | ✅ | ✅ | ✅ |
| Confirmed Lineup | ✅ | ✅ | - | ✅ | ✅ | ✅ | ✅ |
| Batting Order | 🟡 | ✅ | - | - | ✅ | - | - |
| Park Factors | ✅ | - | - | - | ✅ | ✅ | ✅ |
| Weather | ✅ | - | - | - | ✅ | ✅ | ✅ |
| Bullpen State | - | - | ✅ | - | - | - | - |
| Game Script History | - | - | ✅ | ✅ | - | - | - |

---

*Document generated: January 8, 2026*  
*Research Framework for MLB Multi-Market Modeling*
