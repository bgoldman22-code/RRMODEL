# Spread Divergence Investigation: SF @ TB & BUF @ ATL

## Date: October 10, 2025 - Week 6

## Games Under Investigation

### 1. San Francisco 49ers @ Tampa Bay Buccaneers
- **Market**: TB -3.0 (Tampa favored at home)
- **Model**: SF -17.0 (San Francisco favored by 17!)
- **Divergence**: 20 points
- **Win Probabilities**:
  - TB (home): 30.4%
  - SF (away): 69.6%
- **Status**: Model hit the ±17 clamp (would be even more extreme without it)

### 2. Buffalo Bills @ Atlanta Falcons  
- **Market**: BUF -4.5 (Buffalo favored on road)
- **Model**: ATL -14.4 (Atlanta favored at home)
- **Divergence**: 18.9 points
- **Win Probabilities**:
  - ATL (home): 70.1%
  - BUF (away): 29.9%

## Red Flags

### 1. Massive Market Disagreement
Both games show the model disagreeing with Vegas by **18-20 points**. This is unprecedented and suggests either:
1. Critical data issue (injury data not loading, EPA calculations broken)
2. Formula error (multiplier/HFA stacking incorrectly)
3. Model discovering massive inefficiency (extremely unlikely for two games simultaneously)

### 2. Similar Win Probability Patterns
- **SF @ TB**: 69.6% / 30.4%
- **BUF @ ATL**: 70.1% / 29.9%

Nearly identical win probability splits (~70/30) despite different team matchups. This suggests:
- Possible convergence in the probability calculation
- Same underlying data issue affecting both predictions
- Formula producing similar outputs for different inputs

### 3. One Game Hit the Clamp
SF @ TB shows exactly -17.0 (the maximum negative spread), meaning the raw calculation was **even more extreme** before clamping.

## Investigation Checklist

### A. Data Integrity
- [ ] Verify EPA data for SF, TB, ATL, BUF is loading correctly
- [ ] Check if injury data is being applied (both games show 🏥 emoji)
- [ ] Confirm team mappings are correct (SF = San Francisco, not something else)
- [ ] Validate score calculations aren't using stale data

### B. Injury Impact Analysis
Both games show injury indicators. Need to verify:
- [ ] What injuries are being factored for each team?
- [ ] Are injury impacts being SUBTRACTED instead of ADDED?
- [ ] Is there a sign error in injury EPA adjustments?
- [ ] Are backup QB downgrades being triple-counted?

### C. Formula Verification
Check the spread calculation pipeline:
```javascript
const scoreDifference = homeScoreData.score - awayScoreData.score;
const spreadFromScores = scoreDifference * 3.0;
const predictedHomeMargin = adjustedHFA + spreadFromScores + stSpreadAdjustment;
return clamp(predictedHomeMargin, -17, 17);
```

Need to trace:
- [ ] What are the actual `homeScoreData.score` values?
- [ ] What is `adjustedHFA` (should be 1.5-2.5 points typically)?
- [ ] What is `stSpreadAdjustment` (should be small, ±1-2 points)?
- [ ] Is there a sign flip somewhere (home - away vs away - home)?

### D. Specific Hypotheses

#### Hypothesis 1: Injury data sign error
**Test**: If injury data is being applied with the wrong sign, it would:
- Make good teams look terrible (SF, BUF both elite)
- Make average teams look great (TB, ATL)
- Explain 18-20 point swings

**Evidence needed**: 
- Raw EPA values before injury adjustments
- Injury deltas being applied
- Final adjusted scores

#### Hypothesis 2: Score multiplier compounding
**Test**: If multiplier is being applied twice or score diff is calculated wrong:
- `scoreDifference` should be small (< 0.5 typically)
- But if it's showing 5-6, that × 3.0 = 15-18 points
- Would explain hitting the ±17 clamp

**Evidence needed**:
- Log output showing actual scoreDifference values
- Breakdown of home vs away scores

#### Hypothesis 3: HFA stacking error
**Test**: If HFA adjustments are multiplying instead of adding:
```javascript
const adjustedHFA = dynamicHFA * divisionalAdjustment * weakTeamAdjustment;
```
This should give ~1.5-2.5 points, but if there's an error it could be much larger.

**Evidence needed**:
- dynamicHFA value
- divisionalAdjustment value  
- weakTeamAdjustment value
- Final adjustedHFA

## Action Items

### Immediate (Debug Now)
1. Add detailed logging to spread calculation for these specific games
2. Force regenerate with debug output to console
3. Compare raw EPA vs adjusted EPA vs final scores
4. Verify injury data is loading and being applied correctly

### Code Changes Needed
```javascript
// In calculateSpreadPrediction, add for BUF/ATL and SF/TB:
if (homeCode === 'ATL' || homeCode === 'TB') {
  console.log(`\n=== DEBUG ${awayCode} @ ${homeCode} ===`);
  console.log(`Raw scores: Home=${homeScoreData.score}, Away=${awayScoreData.score}`);
  console.log(`Score difference: ${scoreDifference}`);
  console.log(`Spread from scores: ${spreadFromScores}`);
  console.log(`Adjusted HFA: ${adjustedHFA} (dynamic=${dynamicHFA}, div=${divisionalAdjustment}, weak=${weakTeamAdjustment})`);
  console.log(`ST adjustment: ${stSpreadAdjustment}`);
  console.log(`Predicted margin BEFORE clamp: ${adjustedHFA + spreadFromScores + stSpreadAdjustment}`);
  console.log(`Predicted margin AFTER clamp: ${clamp(predictedHomeMargin, -17, 17)}`);
}
```

### Medium Priority
1. Add validation: if |model - market| > 10, log full component breakdown
2. Add sanity check: if score difference > 1.0, flag for review
3. Compare Week 6 EPA values to Week 5 for these teams (did they change drastically?)

## Expected vs Actual

### What SHOULD happen (realistic model):
- **SF @ TB**: Market TB -3, Model maybe TB -6 to SF -2 (±3-5 point range)
- **BUF @ ATL**: Market BUF -4.5, Model maybe BUF -7 to ATL +2 (±6 point range)

### What IS happening:
- **SF @ TB**: Model says SF -17 (20 point swing from market!)
- **BUF @ ATL**: Model says ATL -14.4 (19 point swing from market!)

This level of divergence is only justifiable if:
- Josh Allen out, replaced by 3rd string QB (not the case)
- Multiple Pro Bowl players injured (would need 5+ starters out)
- Team completely giving up / tanking (not applicable in October)

## Next Steps
1. Run debug generation for Week 6 with detailed logging
2. Extract raw EPA, injury deltas, and final scores for all 4 teams
3. Manually calculate expected spread using formula
4. Compare to model output to find where divergence occurs
5. Fix root cause (likely injury sign error or score calculation bug)
