# Elite NFL Injury Modeling Architecture

## Current State Analysis

### TD Prediction System ✅
- **Approach**: Pure depth chart based
- **Logic**: If Conner out → Benson becomes RB1 → assign TD probabilities to Benson
- **Result**: Naturally handles injuries through roster position adjustments
- **No Double Counting**: ✅ Clean approach

### EPA Game Prediction System ❌ 
- **Approach**: Team season stats + injury adjustments
- **Problem**: Season stats include Conner's contributions, then subtract injury impact
- **Result**: Mathematical inconsistency - using "with Conner" stats then subtracting "without Conner" impact
- **Double Counting**: ❌ Incorrect baseline

## Elite Pro Model Solution

### Option 1: Baseline Adjustment (Recommended)
```
Current: ARI_Season_EPA(includes_conner) - Conner_Injury_Impact = Wrong
Correct: ARI_Without_Conner_Baseline + Remaining_Player_Performance = Right
```

### Option 2: Player-Weighted Team Metrics
```
Team_EPA = Σ(Player_EPA × Usage_Rate) for all healthy players
When injured: Recalculate with replacement player
```

### Option 3: Hybrid Depth Chart Integration
```
1. Base team metrics from season data
2. Check depth chart changes from injuries  
3. Apply ONLY the differential impact
4. Avoid double-counting healthy→injured transition
```

## Key Insight
**TD System**: "Who's playing?" → Assign probabilities to actual players
**EPA System**: "How good is team?" → Adjust team performance for personnel changes

Both are correct approaches for their respective purposes, but EPA system needs baseline correction.