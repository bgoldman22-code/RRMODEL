# NHL SOG Pick Count Analysis - Why Only 2 Picks Shown?

**Date**: October 28, 2025  
**Scanner**: nhl-sog-scanner-elite-fast  
**Time**: 6:15 PM ET

---

## Summary

**Question**: Why are we only showing 2 picks (Frost, Backlund) when the model made many more projections?

**Answer**: The UI is likely filtering to show only **top picks** or picks above a certain threshold. The API actually returns **9 opportunities** that meet the 5% edge threshold.

---

## What the Model Actually Generated

### Scanner Diagnostics

```json
"diag": {
  "playersScanned": 112,
  "projectionsOk": 14,
  "matchedCandidates": 9,
  "playersLoaded": 712,
  "teamsLoaded": 32
}
```

**Breakdown**:
- **712 players loaded** across 32 teams (rosters)
- **112 players scanned** (top 9 forwards + top 5 D per team)
- **14 projections succeeded** (players with odds available)
- **9 met the 5% edge threshold** (final opportunities)

---

## All 9 Opportunities (≥5% Edge)

### Returned by API (sorted by edge)

| # | Player | Line | Direction | Projection | Edge | Odds | Bookmaker |
|---|--------|------|-----------|------------|------|------|-----------|
| 1 | **Erik Karlsson** | 1.5 | UNDER | 0.96 | **+33.8%** | +115 | DraftKings |
| 2 | **Sam Bennett** | 2.5 | UNDER | 1.94 | **+30.5%** | +115 | DraftKings |
| 3 | **Gustav Forsling** | 1.5 | UNDER | 1.1 | **+25.3%** | +110 | Caesars |
| 4 | **Seth Jones** | 1.5 | UNDER | 1.6 | **+17.7%** | +120 | DraftKings |
| 5 | **Aaron Ekblad** | 1.5 | UNDER | 1.5 | **+17.0%** | +105 | DraftKings |
| 6 | **Sidney Crosby** | 2.5 | UNDER | 2.1 | **+12.9%** | -154 | DraftKings |
| 7 | **Morgan Frost** | 1.5 | UNDER | 1.55 | **+12.8%** | +100 | DraftKings |
| 8 | **Mikael Backlund** | 1.5 | UNDER | 1.82 | **+11.2%** | +110 | DraftKings |
| 9 | **Anton Lundell** | 2.5 | UNDER | 2.46 | **+10.1%** | -130 | DraftKings |

---

## What the UI is Showing

**User sees**: Only **2 picks** (Frost, Backlund)

**Likely reasons**:
1. UI filters to show only **top 3-5 picks** by default
2. UI might have a **higher edge threshold** (e.g., 12%+) than the API (5%)
3. UI might be sorting differently (e.g., by units, not edge)
4. UI might be filtering out certain players/markets

---

## Missing High-Value Picks

### Top Picks NOT Shown to User

**Erik Karlsson UNDER 1.5** (+33.8% edge):
- Projection: 0.96 SOG
- Odds: +115 (DraftKings)
- Model Prob: 77.2% vs Fair: 43.4%
- **This should be the #1 pick!**

**Sam Bennett UNDER 2.5** (+30.5% edge):
- Projection: 1.94 SOG
- Odds: +115 (DraftKings)
- Model Prob: 72.1% vs Fair: 41.5%
- **This should be the #2 pick!**

**Gustav Forsling UNDER 1.5** (+25.3% edge):
- Projection: 1.1 SOG
- Odds: +110 (Caesars)
- Model Prob: 72.9% vs Fair: 47.6%
- **This should be the #3 pick!**

---

## Additional Candidates (Below 5% Threshold)

The API also returns **"top15Candidates"** showing the best opportunities regardless of threshold:

### Candidates 10-15 (Did NOT meet 5% edge threshold):

| Player | Line | Direction | Projection | Edge | Threshold Met? |
|--------|------|-----------|------------|------|----------------|
| Nazem Kadri | 3.5 | UNDER | 3.44 | +4.0% | ❌ No |
| Eetu Luostarinen | 1.5 | OVER | 2.45 | +3.5% | ❌ No |
| Joel Farabee | 1.5 | UNDER | 2.26 | +3.1% | ❌ No |
| Rasmus Andersson | 1.5 | OVER | 2.74 | +2.7% | ❌ No |
| Blake Coleman | 2.5 | OVER | 2.68 | +1.5% | ❌ No |

**Note**: These would appear if the edge threshold was lowered to 3%.

---

## Games Covered

**3 games** today (October 28, 2025):

1. **PIT @ PHI** (10:00 PM ET)
   - 2 picks: Karlsson, Crosby

2. **CGY @ TOR** (10:00 PM ET)
   - 2 picks: Frost, Backlund
   - 5 candidates total (Kadri, Farabee, Andersson, Coleman didn't meet threshold)

3. **ANA @ FLA** (11:00 PM ET)
   - 5 picks: Bennett, Lundell, Ekblad, Forsling, Jones
   - 1 additional candidate: Luostarinen (3.5% edge, didn't meet threshold)

---

## Why Only 2 Picks Shown on Website?

### Hypothesis 1: UI Filtering by Edge Threshold

**Likely Scenario**: UI only shows picks with **edge ≥ 12%**

**Evidence**:
- Frost: 12.8% edge ✅ (shown)
- Backlund: 11.2% edge ✅ (shown)
- Lundell: 10.1% edge ❌ (not shown)
- Crosby: 12.9% edge ❌ (not shown - but should be!)

**Problem**: This would exclude Crosby (12.9%), so this hypothesis is incomplete.

### Hypothesis 2: UI Shows Only One Game

**Likely Scenario**: UI only shows **CGY @ TOR game** picks

**Evidence**:
- Frost: CGY @ TOR ✅ (shown)
- Backlund: CGY @ TOR ✅ (shown)
- Karlsson: PIT @ PHI ❌ (not shown)
- Bennett: ANA @ FLA ❌ (not shown)

**Problem**: This would be a very strange filter (why only one game?).

### Hypothesis 3: UI Pagination/Limit

**Most Likely Scenario**: UI displays in pages or has a "top N" limit

**Evidence**:
- User sees exactly 2 picks
- API returns 9 total opportunities
- UI might default to showing first 2-3 picks

**Solution**: Check if there's a "Show More" button or pagination controls.

### Hypothesis 4: UI Sorting Issue

**Possible Scenario**: UI sorts by a different metric than edge

**If sorted by Stake (Units)**:
```
All 9 picks have 3.0U stake (tied), so would need secondary sort
```

**If sorted by Confidence**:
```
1. Karlsson: 90
2. Bennett: 90
3. Forsling: 90
4. Ekblad: 90
5. Jones: 90
6. Crosby: 87.9
7. Frost: 87.8 ✅ (shown)
8. Backlund: 86.2 ✅ (shown)
9. Lundell: 85.1
```

**Problem**: This would show the wrong picks (high confidence ones, not Frost/Backlund).

---

## Recommended UI Fixes

### Option 1: Show All 9 Picks (Best)

**Change**: Display all opportunities that meet the 5% edge threshold

**Benefits**:
- Users see all value plays
- Total daily action: 9 picks × 3U = **27 units**
- Maximizes +EV opportunities

**Implementation**:
```javascript
// In NHLSOG.jsx or similar
const displayedPicks = opportunities; // Show all, not just slice(0, 2)
```

### Option 2: Add "Show More" Button

**Change**: Display top 3 by default, allow user to expand

**Benefits**:
- Cleaner UI (less overwhelming)
- User control over detail level
- Still accessible to see all picks

**Implementation**:
```javascript
const [showAll, setShowAll] = useState(false);
const displayedPicks = showAll ? opportunities : opportunities.slice(0, 3);
```

### Option 3: Filter by Game with Tabs

**Change**: Allow users to filter by game

**Benefits**:
- Organized by matchup
- Easy to track game-specific picks
- Reduces visual clutter

**Implementation**:
```javascript
<Tab label="All (9)" />
<Tab label="PIT @ PHI (2)" />
<Tab label="CGY @ TOR (2)" />
<Tab label="ANA @ FLA (5)" />
```

### Option 4: Raise Edge Threshold to 15%

**Change**: Only show ultra-high-edge picks

**Benefits**:
- Focuses on best value
- Reduces pick count (conservative approach)
- Fewer bets = easier to manage

**Drawbacks**:
- Leaves money on table (misses 10-15% edge picks)
- Reduces total ROI (fewer +EV bets)

**Recommended**: ❌ NO - 10-12% edge is still excellent value

---

## Current UI Code Check Needed

### Files to Inspect

1. **`src/NHL.jsx`** or **`src/NHLV2.jsx`**:
   ```javascript
   // Check for filtering logic
   const displayedOpportunities = opportunities.slice(0, 2); // ← PROBLEM?
   
   // Or check for edge threshold
   const filteredOpps = opportunities.filter(o => o.edge >= 15); // ← PROBLEM?
   ```

2. **Check sorting logic**:
   ```javascript
   // Are picks sorted by edge (correct) or something else?
   opportunities.sort((a, b) => b.edge - a.edge); // ✅ Good
   opportunities.sort((a, b) => b.confidence - a.confidence); // ❌ Wrong
   ```

3. **Check state management**:
   ```javascript
   // Is there pagination state limiting display?
   const [page, setPage] = useState(0);
   const [perPage] = useState(2); // ← PROBLEM?
   ```

---

## Expected User Experience

### What User SHOULD See

**Today's NHL SOG Picks (9 Total)**

**🔥 Elite Value (30%+ Edge)**:
1. Erik Karlsson UNDER 1.5 (+33.8% edge, 3U)
2. Sam Bennett UNDER 2.5 (+30.5% edge, 3U)
3. Gustav Forsling UNDER 1.5 (+25.3% edge, 3U)

**⭐ High Value (15-25% Edge)**:
4. Seth Jones UNDER 1.5 (+17.7% edge, 3U)
5. Aaron Ekblad UNDER 1.5 (+17.0% edge, 3U)

**✅ Good Value (10-15% Edge)**:
6. Sidney Crosby UNDER 2.5 (+12.9% edge, 3U)
7. Morgan Frost UNDER 1.5 (+12.8% edge, 3U)
8. Mikael Backlund UNDER 1.5 (+11.2% edge, 3U)
9. Anton Lundell UNDER 2.5 (+10.1% edge, 3U)

**Total Stake**: 27 units ($540 @ $20/unit)  
**Expected ROI**: ~20% across all picks  
**Expected Profit**: ~$108

---

## Action Items

### Immediate (Fix UI Display)

1. **Check `src/NHL.jsx` for display limiting**:
   ```bash
   grep -n "slice\|filter" src/NHL.jsx
   ```

2. **Verify opportunities array is fully rendered**:
   ```javascript
   console.log('Total opportunities:', opportunities.length);
   console.log('Displayed opportunities:', displayedOpportunities.length);
   ```

3. **Remove any artificial limits**:
   ```javascript
   // BEFORE (wrong)
   const displayedOpportunities = opportunities.slice(0, 2);
   
   // AFTER (correct)
   const displayedOpportunities = opportunities;
   ```

### Short-Term (Enhance UI)

1. Add "Show All / Top 3" toggle
2. Add game filtering tabs
3. Add edge tier visual indicators (🔥 >25%, ⭐ 15-25%, ✅ 10-15%)
4. Display total daily stake and expected ROI

### Long-Term (Monitoring)

1. Track pick count per day (should be ~5-15 depending on slate)
2. Validate edge distribution (most should be 10-20% range)
3. Monitor actual results vs projections
4. Adjust edge threshold if needed (currently 5% is good)

---

## Conclusion

**The Model is Working Correctly** ✅

- Generated **9 opportunities** with ≥5% edge
- Scanned **112 players** across **3 games**
- Edge range: 10.1% to 33.8% (excellent value)

**The UI is Limiting Display** ❌

- Only showing **2 of 9 picks** (Frost, Backlund)
- Missing **7 high-value picks** including:
  - Karlsson (+33.8% edge) - **BEST PICK**
  - Bennett (+30.5% edge)
  - Forsling (+25.3% edge)
  - Jones (+17.7% edge)
  - Ekblad (+17.0% edge)
  - Crosby (+12.9% edge)
  - Lundell (+10.1% edge)

**Fix Required**: Update UI to display all 9 opportunities, not just 2.

---

**Document Generated**: October 28, 2025  
**Data Source**: Production API response from nhl-sog-scanner-elite-fast  
**Next Action**: Inspect NHL.jsx to find and remove display limit
