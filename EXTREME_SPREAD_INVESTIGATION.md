# Extreme Spread Predictions - Investigation

## Issue Summary
Two games in Week 6 are producing model spreads of exactly 21 points (the maximum clamp):

1. **Green Bay Packers vs Cincinnati Bengals**
   - Market: GB -14.5
   - Model: GB -21.0 (clamped)
   - Edge: 6.5 points
   - Home Win Prob: 72.9%

2. **Las Vegas Raiders vs Tennessee Titans**
   - Market: LV -4.5
   - Model: LV -21.0 (clamped)
   - Edge: 8.0 points (16.5 actual difference!)
   - Home Win Prob: 72.9%

## Red Flags

### 1. Identical Win Probabilities
Both games show **exactly 72.9% home win probability** and **27.1% away win probability**. This is statistically suspicious and suggests:
- Possible data duplication
- Formula producing identical outputs for different teams
- Rounding artifacts creating convergence

### 2. Unrealistic Spread Predictions
- **LV vs TEN**: Market thinks LV wins by 4.5, model thinks 21+
  - This is a 16.5+ point disagreement
  - Market is not pricing in a blowout, but model is
  - Tennessee is not historically a 21-point underdog team

- **GB vs CIN**: Market thinks GB wins by 14.5, model thinks 21+
  - 6.5 point disagreement
  - Cincinnati has quality QB (Joe Burrow when healthy)
  - Not typically a 3-TD margin team

### 3. Divergence from Market
The model is disagreeing with sharp money by massive margins. When the model is 16+ points off from Vegas:
- Either the model has discovered massive inefficiency (unlikely)
- Or there's a systematic bias/error in the inputs

## Potential Causes

### A. Data Quality Issues
1. **Injury data not being factored correctly**
   - Key players out for CIN/TEN not reflected in EPA
   - Model treating healthy rosters when starters are missing

2. **EPA data staleness**
   - Using outdated team performance metrics
   - Not accounting for recent form/regression

3. **Opponent strength weighting**
   - Model may be over-weighting bad opponent performance
   - TEN and CIN may have faced weak schedules

### B. Formula Issues

1. **Score multiplier too aggressive**
   ```javascript
   const spreadFromScores = scoreDifference * 3.5;
   ```
   - A score difference of 6 points = 21 point spread
   - This multiplier may be too high for NFL variance

2. **Home field advantage compounding**
   ```javascript
   const adjustedHFA = dynamicHFA * divisionalAdjustment * weakTeamAdjustment;
   const predictedHomeMargin = adjustedHFA + spreadFromScores + stSpreadAdjustment;
   ```
   - Multiple adjustments may be stacking incorrectly
   - HFA + spread + ST could be double-counting factors

3. **Clamp at ±21 too permissive**
   - NFL spreads rarely exceed 17 points in modern era
   - Maximum observed: 18.5 (Patriots in 2007)
   - Clamp should probably be ±17 or ±18

### C. Team-Specific Issues

**For Las Vegas Raiders:**
- Recent performance may be inflated vs weak opponents
- Home field advantage being over-applied
- Tennessee may have injury data missing

**For Green Bay Packers:**
- Strong historical EPA vs weak recent schedule
- Cincinnati injuries (Burrow status?) not factored
- Divisional/conference weighting issues

## Recommended Fixes

### Immediate (High Priority)
1. **Lower clamp from ±21 to ±17**
   - Prevents unrealistic predictions
   - More aligned with historical NFL spreads
   
2. **Add divergence warning**
   - If |model - market| > 10 points, flag for review
   - Log the contributing factors for inspection

3. **Reduce score multiplier from 3.5 to 3.0**
   - Current formula: 6 point EPA gap = 21 point spread
   - Proposed: 6 point EPA gap = 18 point spread
   - More conservative, less prone to extremes

### Medium Priority
4. **Audit injury data integration**
   - Verify CIN and TEN injury impacts are reflected
   - Check if QB/key player absences are weighted properly

5. **Add recency weighting**
   - Weight last 3 games higher than season average
   - Prevents stale data from driving predictions

6. **Implement strength-of-schedule adjustment**
   - Discount EPA from games vs bottom-5 defenses
   - Boost EPA from games vs top-5 defenses

### Low Priority (Nice to Have)
7. **Historical validation**
   - Backtest: How often has a 72.9% win prob team covered 21 points?
   - Expected answer: Almost never
   - Use this to calibrate confidence limits

8. **Market anchoring**
   - When model diverges >10 points, blend with market
   - 70% model + 30% market for extreme cases
   - Prevents embarrassing misses

## Action Plan

1. ✅ Add `model_home_margin` to output (DONE)
2. ⏳ Lower clamp to ±17
3. ⏳ Reduce score multiplier to 3.0
4. ⏳ Add validation for >10 point market divergence
5. ⏳ Log component breakdown for extreme spreads
6. ⏳ Audit injury data for CIN and TEN

## Expected Outcome

After fixes:
- **GB vs CIN**: Model ~17-18, Market 14.5 → Edge ~3-4 points (reasonable)
- **LV vs TEN**: Model ~12-14, Market 4.5 → Edge ~8-10 points (still high but not absurd)

This maintains model's edge-finding ability while preventing ridiculous predictions that damage credibility.
