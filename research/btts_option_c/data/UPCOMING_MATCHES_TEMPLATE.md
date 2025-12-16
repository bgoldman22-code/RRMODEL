# Upcoming Matches Example - Input Template for RUN_PREDICT_LIVE.py

This file serves as a template for the input CSV format required by the live prediction script.

## Required Columns

### Minimal Requirements:
- `date` - Match date (YYYY-MM-DD format)
- `home_norm` - Home team name (normalized)
- `away_norm` - Away team name (normalized)

### Optional but Recommended:
- `fixture_id` - Unique match identifier
- `btts_yes_odds` - Decimal odds for BTTS Yes (enables edge calculation)
- `btts_no_odds` - Decimal odds for BTTS No (enables fair edge calculation)

### Historical Context (for rolling features):
For best predictions, include recent match history for both teams:
- `home_xg` - Home team expected goals (historical matches)
- `away_xg` - Away team expected goals (historical matches)
- `home_xga` - Home team expected goals against (historical matches)
- `away_xga` - Away team expected goals against (historical matches)
- `home_availability_pct` - FPL-style squad availability
- `away_availability_pct` - FPL-style squad availability

**Note:** Rolling features (L5, L10, trends, momentum) are computed automatically from historical data.
If your CSV only contains upcoming matches without history, rolling features will be imputed with training medians.

## Example CSV Structure

```csv
fixture_id,date,home_norm,away_norm,btts_yes_odds,btts_no_odds,home_xg,away_xg,home_availability_pct,away_availability_pct
12345,2025-12-15,Arsenal,Chelsea,1.80,2.10,1.85,1.45,0.92,0.89
12346,2025-12-15,Liverpool,Manchester City,1.75,2.20,2.10,1.90,0.95,0.91
12347,2025-12-15,Tottenham,Manchester United,1.85,2.05,1.75,1.60,0.88,0.87
```

## Important Notes

1. **NO outcome columns** - Do NOT include:
   - `home_goals`, `away_goals`
   - `home_goals_fpl`, `away_goals_fpl`
   - `btts` (target variable)
   
   These are post-match outcomes. This is a PRE-MATCH prediction script.

2. **Team names** - Use the same normalization as training data (e.g., "Arsenal", "Liverpool", etc.)

3. **Dates** - Format as YYYY-MM-DD

4. **Odds format** - Decimal odds (e.g., 1.80, not fractional 4/5)

5. **Historical data** - If you have access to recent match xG and squad data, include it for better predictions.
   If not available, the model will still work but rolling features will be less accurate.

## Quick Test

To test the prediction pipeline with example data:

```bash
cd research/btts_option_c

# Create a simple test file
echo "fixture_id,date,home_norm,away_norm,btts_yes_odds,btts_no_odds" > data/upcoming_matches_example.csv
echo "1,2025-12-15,Arsenal,Chelsea,1.80,2.10" >> data/upcoming_matches_example.csv
echo "2,2025-12-15,Liverpool,Manchester City,1.75,2.20" >> data/upcoming_matches_example.csv

# Run predictions
python RUN_PREDICT_LIVE.py --input data/upcoming_matches_example.csv --threshold 0.55
```

## Integration with Live Data

When integrating with a live odds/fixture feed:

1. **Extract upcoming fixtures** from your data source
2. **Add historical xG data** if available (from your database or API)
3. **Add FPL squad data** if available (availability, attack quality)
4. **Ensure correct schema** (match column names above)
5. **Run prediction script** with appropriate threshold
6. **Parse output CSV** for website display or betting automation

The script enforces all Hardened V2 safety guarantees:
- 25-feature prediction-safe allowlist
- Runtime banned feature assertions
- No target leakage
- Vig-aware edge calculation
