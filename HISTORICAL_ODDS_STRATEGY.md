# MLB HR Round Robin - Historical Odds Collection Strategy

**API Key:** [Set in Netlify environment variables as THEODDS_API_KEY]  
**Current Usage:** Check TheOddsAPI dashboard  
**Available Credits:** Check TheOddsAPI dashboard

---

## MLB HR Props Endpoint Analysis

### Market Key for HR Props
✅ **`batter_home_runs`** - Batter Home Runs (Over/Under)
- This is the correct endpoint for "Over 0.5 HRs" which is equivalent to "Will player hit a HR?"
- Format: Each player has Over/Under 0.5, Over 0.5 = Yes, Under 0.5 = No

### Current API Endpoint Structure
```
GET /v4/sports/baseball_mlb/events/{eventId}/odds
  ?markets=batter_home_runs
  &regions=us
  &bookmakers=fanduel
  &apiKey={key}
```

**Example Response:**
```json
{
  "key": "batter_home_runs",
  "outcomes": [
    {
      "name": "Over",
      "description": "Aaron Judge",
      "price": 300,
      "point": 0.5
    },
    {
      "name": "Under", 
      "description": "Aaron Judge",
      "price": -400,
      "point": 0.5
    }
  ]
}
```

---

## Historical Odds Collection Cost Analysis

### Cost Structure
**Historical odds:** 10 credits per market per region
```
Cost = 10 × markets × regions
```

### Scenario Calculations

**Option 1: Full Season, Daily Snapshots**
```
2021-2025 = 5 seasons × 162 games = 810 games per team
~2,430 games per season (30 teams × 81 home games)
~12,150 total games across 5 years

Daily slate = 10-15 games average
Season = ~180 days

Total snapshots needed: 5 seasons × 180 days = 900 snapshots

Cost per snapshot:
  1 market (batter_home_runs) × 1 region (us) = 10 credits
  
Total cost: 900 snapshots × 10 credits = 9,000 credits
```

**Option 2: Game-Time Snapshot (2 hours before first pitch)**
```
~12,150 games × 10 credits = 121,500 credits
```

**Option 3: Selective Sampling**
```
Sample 2-3 days per week instead of every day
5 seasons × 52 weeks × 2.5 days = 650 snapshots × 10 = 6,500 credits
```

---

## RECOMMENDED STRATEGY: Hybrid Approach

### Phase 1: Model Odds as Baseline (FREE)
For most of backtest, use our **model-generated odds** as proxy:
- Already have the probability model
- Convert p_model → american odds
- Zero API cost
- Validates if strategy works conceptually

### Phase 2: Spot-Check with Real Odds (Low Cost)
Fetch real historical odds for **validation sample**:
```
Sample size: 50 days spread across 5 years
  - 10 days from 2021
  - 10 days from 2022
  - 10 days from 2023
  - 10 days from 2024
  - 10 days from 2025 (including Sept 24-26 from real slips!)

Cost: 50 days × 10 credits = 500 credits
```

**Purpose:** Compare model odds vs real odds to calculate calibration error

### Phase 3: Calibration Layer
Build adjustment: `real_odds ≈ model_odds × calibration_factor + bias`
- Use 50-day sample to train calibration
- Apply to all 5 years of data
- Cost: Still just 500 credits

### Phase 4: Full Historical (if Phase 1-3 validates strategy)
Only fetch ALL historical odds if backtest proves strategy is profitable:
```
If ROI > +15% on model odds:
  Then fetch full historical: 900 snapshots × 10 = 9,000 credits
  Refine backtest with real odds
  Final validation
```

---

## Alternative: Focus on 2025 Only (HIGHEST ACCURACY)

Since you have 3 **real slips from Sept 2025**, we can:

### Option A: Deep 2025 Analysis
```
Fetch every day of 2025 season (March-September)
~180 days × 10 credits = 1,800 credits

Benefits:
  - Most recent, most relevant
  - Direct validation against real slips
  - 1 full season of perfect data
  
Drawback:
  - Smaller sample (1 year vs 5 years)
  - May not capture year-to-year variance
```

### Option B: Weekly Sampling 2021-2025
```
Fetch 1 day per week across 5 years
5 years × 26 weeks × 10 credits = 1,300 credits

Benefits:
  - Captures seasonal patterns
  - Tests consistency across years
  - Manageable cost
```

---

## RECOMMENDED EXECUTION PLAN

### Step 1: Setup (NOW)
```javascript
// Create historical odds fetcher
const fetchHistoricalHRodds = async (date, eventIds) => {
  // date format: '2025-09-25T18:00:00Z'
  const requests = eventIds.map(id => 
    fetch(`https://api.the-odds-api.com/v4/historical/sports/baseball_mlb/events/${id}/odds
      ?apiKey=${API_KEY}
      &date=${date}
      &regions=us
      &markets=batter_home_runs
      &bookmakers=fanduel
      &oddsFormat=american`)
  );
  
  // Cost: 10 credits per event
  const responses = await Promise.all(requests);
  return responses;
};
```

### Step 2: Validation Sample (500 credits)
Fetch 50 carefully chosen days:
```
Priority days:
  1. Sept 24-26, 2025 (real slips) - 3 days
  2. Random sample from each month 2021-2025 - 47 days
  
Total: 50 days × 10 credits = 500 credits
```

### Step 3: Build Calibration Model
```python
# Compare model odds vs real odds
calibration_error = real_odds - model_odds
mean_error = np.mean(calibration_error)
std_error = np.std(calibration_error)

# Build correction function
def calibrated_odds(model_odds):
    return model_odds * (1 + correction_factor) + bias
```

### Step 4: Run 5-Year Backtest with Calibrated Model (FREE)
Use model odds + calibration for all 5 years:
- Zero additional API cost
- Full 5-year sample size
- Calibrated to match real odds

### Step 5: Conditional Full Fetch
```
IF backtest shows +15% ROI or better:
  THEN fetch all historical odds (9,000 credits)
  Re-run backtest with perfect data
  Final validation

ELSE:
  Strategy needs work before spending more credits
```

---

## Credit Budget Allocation

### Conservative Budget: 2,000 credits
```
500 - Validation sample (50 days)
1,500 - Targeted 2025 season (150 days)
-------
2,000 total (0.04% of quota)
```

### Aggressive Budget: 10,000 credits  
```
500 - Validation sample
1,800 - Full 2025 season
7,700 - Strategic sampling 2021-2024
-------
10,000 total (0.2% of quota)
```

### Maximum Budget: 50,000 credits
```
500 - Validation sample
9,500 - Complete historical (900 days, 2021-2025)
40,000 - Reserve for additional markets if needed
-------
50,000 total (1% of quota)
```

**You have 5 MILLION credits available - even max budget is only 1%!**

---

## Implementation Code

```javascript
// Cost tracker
let creditsUsed = 0;
const trackCost = (cost) => {
  creditsUsed += cost;
  console.log(`Credits used: ${creditsUsed} / Budget: ${BUDGET}`);
};

// Fetch with cost tracking
const fetchHistoricalHRoddsWithTracking = async (date, eventIds) => {
  const cost = eventIds.length * 10; // 10 per event
  
  if (creditsUsed + cost > BUDGET) {
    throw new Error(`Budget exceeded! Would use ${cost}, have ${BUDGET - creditsUsed} left`);
  }
  
  const results = await fetchHistoricalHRodds(date, eventIds);
  trackCost(cost);
  
  return results;
};
```

---

## FINAL RECOMMENDATION

**Start with Conservative (2,000 credits):**
1. Fetch 50-day validation sample (500 credits)
2. Fetch full 2025 season for real slip validation (1,500 credits)
3. Build calibration model
4. Run full 5-year backtest with calibrated model odds (free)
5. If results are promising, fetch remaining historical data

**This approach:**
- ✅ Uses only 0.04% of quota
- ✅ Validates model accuracy
- ✅ Tests full 5 years
- ✅ Can validate against real Sept 2025 slips
- ✅ Leaves 4,971,000 credits for future needs
- ✅ Can always go back and get more data if strategy proves profitable

---

**Next Step:** Build the historical odds fetcher with this strategy?
