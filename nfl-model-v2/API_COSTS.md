# NFL Model V2 - API Cost Breakdown

## TheOddsAPI Historical Data Pricing

### Cost Structure
- **Historical Snapshot**: 10 credits per region per market
- **Regions**: `us` (1 region)
- **Markets**: `spreads`, `totals`, `h2h` (3 markets)
- **Cost per request**: 10 × 1 × 3 = **30 credits**

### Full Backtest Calculation

**Seasons**: 2020, 2021, 2022, 2023, 2024 (5 seasons)  
**Weeks per season**: 18 (regular season only, skip preseason)  
**Total requests**: 5 × 18 = **90 requests**  
**Total credits**: 90 × 30 = **2,700 credits**

### Pricing Tiers (as of Nov 2025)

| Plan | Credits | Cost | Enough for V2? |
|------|---------|------|----------------|
| Free | 500 | $0 | ❌ No (only ~16 weeks) |
| Starter | 5,000 | $50/mo | ✅ Yes (1.85 backtests) |
| Pro | 25,000 | $200/mo | ✅ Yes (9 backtests) |
| Enterprise | Custom | Custom | ✅ Yes |

**Recommended**: Starter plan ($50) - Enough for full backtest + experimentation

### Cost Optimization Strategies

#### 1. Partial Backtest (Reduced Cost)
Test with fewer seasons first:
```json
// config.json
"seasons": [2023, 2024]  // Only 2 seasons
```
- **Cost**: 2 × 18 × 30 = **1,080 credits**
- **Savings**: 60% reduction
- **Use case**: Initial validation before full backtest

#### 2. Single Market Test (Lowest Cost)
Test one market (e.g., spreads only):
```json
// config.json
"markets": ["spreads"]  // Just spreads
```
- **Cost per request**: 10 × 1 × 1 = **10 credits**
- **Full backtest**: 90 × 10 = **900 credits**
- **Savings**: 67% reduction
- **Use case**: Spread model validation only

#### 3. Sample Weeks (Minimal Cost)
Test specific weeks only:
```bash
# Manually run for select weeks
node 01-fetch-historical-odds.mjs --season 2024 --weeks 1,5,10,15
```
- **Cost**: 4 × 30 = **120 credits**
- **Use case**: Quick proof-of-concept

### Phased Approach (Recommended)

#### Phase 1: Proof of Concept ($0 - Free Tier)
```json
{
  "seasons": [2024],
  "weeks": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
}
```
- **Credits**: 10 × 30 = 300 credits
- **Cost**: Free tier (500 credits)
- **Validates**: Pipeline works, data quality good

#### Phase 2: Single Season Full ($0 - Free Tier)
```json
{
  "seasons": [2024],
  "weeks_regular_season": 18
}
```
- **Credits**: 18 × 30 = 540 credits
- **Cost**: Need Starter plan (500 free + 50 paid)
- **Validates**: Full season performance

#### Phase 3: Multi-Season Validation ($50 - Starter Plan)
```json
{
  "seasons": [2022, 2023, 2024]
}
```
- **Credits**: 3 × 18 × 30 = 1,620 credits
- **Cost**: Starter plan ($50)
- **Validates**: Multi-season consistency

#### Phase 4: Complete Backtest ($50 - Starter Plan)
```json
{
  "seasons": [2020, 2021, 2022, 2023, 2024]
}
```
- **Credits**: 5 × 18 × 30 = 2,700 credits
- **Cost**: Starter plan ($50)
- **Validates**: Full historical performance

### NFLVerse Data (FREE)
- **Cost**: $0
- **Credits**: Unlimited
- **Data**: Complete play-by-play 2020-2024
- **Download size**: ~500MB total

### Total Project Cost

| Scenario | API Credits | API Cost | Total Cost |
|----------|-------------|----------|------------|
| **Proof of Concept** | 300 | $0 (free) | $0 |
| **Single Season** | 540 | $50 | $50 |
| **3 Seasons** | 1,620 | $50 | $50 |
| **Full 5 Seasons** | 2,700 | $50 | $50 |
| **With iterations** | 5,000 | $50 | $50 |

**Bottom Line**: $50 gets you full backtest + room for experimentation

### Usage Tracking

Monitor your credit usage:
```bash
# Response headers show remaining credits
x-requests-remaining: 4700
x-requests-used: 300
```

Or check dashboard:
https://the-odds-api.com/account

### Alternative: Manual Data Collection

If budget is very tight:
1. Use free tier for recent season (2024)
2. Manually collect closing lines from public sources
3. Format as JSON matching our schema
4. Skip historical API entirely

**Trade-off**: More time, less accuracy, but $0 cost

### Credit Rollover

- Credits **do not** roll over month-to-month
- Use them or lose them
- Plan backtest timing accordingly

### Refund Policy

- Check TheOddsAPI terms
- Test with free tier first
- Validate data quality before full purchase

---

## Summary

**Recommended Path**:
1. ✅ Start with free tier (Phase 1) - $0
2. ✅ Validate pipeline works
3. ✅ Purchase Starter if results promising - $50
4. ✅ Run full backtest
5. ✅ Iterate if needed (credits remaining)

**Total Expected Cost**: $50 one-time

**Historical data is cached locally** - only need to fetch once!
