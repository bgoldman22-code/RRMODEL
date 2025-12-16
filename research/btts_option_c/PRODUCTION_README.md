# EPL BTTS Production System - Poisson Model

**Production-ready EPL Both Teams To Score (BTTS) betting strategy using Poisson probability model.**

---

## Overview

This system provides a complete end-to-end production pipeline for EPL BTTS betting:

1. **Frozen Poisson Model** trained on all historical EPL data (2023-2025)
2. **Production Strategy Module** with guardrails and decision logic
3. **TheOddsAPI Integration** to fetch live fixtures and BTTS odds
4. **CSV + JSON Outputs** for analysis and API serving
5. **Netlify Function** to serve predictions via HTTP endpoint

### Key Features

✅ **Max 1 bet per match** - Enforced guardrail (YES / NO / NO_BET)  
✅ **Edge + Probability Thresholds** - Based on walk-forward bucket analysis  
✅ **Confidence Buckets** - LOW / MEDIUM / HIGH based on edge and probability  
✅ **Kelly Fraction Guidance** - For stake sizing  
✅ **No Data Leakage** - Model trained only on historical data  
✅ **API Key Security** - THEODDSAPI_KEY only used locally, never in production  

---

## Quick Start

### 1. Train Production Model (One-Time Setup)

```bash
cd research/btts_option_c
PYTHONPATH=src:$PYTHONPATH \
python3 scripts/train_btts_poisson_production_model.py
```

**Output:**
- `models/btts_poisson_production.joblib` - Frozen model
- `models/btts_poisson_production_meta.json` - Model metadata

**Training Summary:**
- Training data: 910 EPL matches (2023-08-11 to 2025-12-08)
- xG coverage: 100% (910/910 matches)
- Home λ: 1.625, Away λ: 1.337
- Using xG-based Poisson estimation

### 2. Generate Predictions for Upcoming Matches

```bash
cd research/btts_option_c
THEODDSAPI_KEY=your_key_here \
PYTHONPATH=src:$PYTHONPATH \
python3 scripts/generate_epl_btts_production_predictions.py \
    --start-date 2025-12-12 \
    --end-date 2025-12-15 \
    --out-csv results/epl_btts_preds_2025-12-12_2025-12-15.csv \
    --out-json public/epl_btts_preds_latest.json
```

**What it does:**
1. Fetches upcoming EPL fixtures from TheOddsAPI (soccer_epl)
2. Extracts BTTS YES/NO odds from bookmakers (default: FanDuel)
3. Loads frozen Poisson model
4. Computes probabilities, edges, and betting decisions
5. Applies guardrails (max 1 bet per match, thresholds)
6. Outputs CSV + JSON

**Output Files:**
- `results/epl_btts_preds_2025-12-12_2025-12-15.csv` - Full decision data
- `public/epl_btts_preds_latest.json` - API-ready JSON payload

### 3. Deploy to Netlify

The Netlify function is already created at:
- `netlify/functions/epl-btts-poisson.mjs`

**Usage:**
1. Generate predictions locally (step 2)
2. Commit `public/epl_btts_preds_latest.json` to repo
3. Deploy to Netlify
4. Access via: `/.netlify/functions/epl-btts-poisson`

**Endpoint Response:**
```json
{
  "league": "EPL",
  "generated_at": "2025-12-11T18:00:00Z",
  "date_range": {"start": "2025-12-12", "end": "2025-12-15"},
  "model": {
    "name": "poisson_btts",
    "version": "1.0.0",
    "trained_through": "2025-12-08"
  },
  "matches": [
    {
      "match_id": "...",
      "home_team": "Arsenal",
      "away_team": "Chelsea",
      "kickoff_iso": "2025-12-12T20:00:00Z",
      "p_yes": 0.63,
      "p_no": 0.37,
      "edge_yes": 0.03,
      "edge_no": -0.03,
      "chosen_side": "YES",
      "confidence_bucket": "MEDIUM",
      "kelly_fraction": 0.0123
    }
  ]
}
```

---

## Strategy Configuration

### Guardrails (Based on Walk-Forward Validation)

From bucket analysis (`BTTS_POISSON_EDGE_AND_PROB_BUCKETS.md`):

```python
config = BttsStrategyConfig(
    yes_prob_threshold=0.55,   # Model p(BTTS=YES) must be ≥ 0.55
    no_prob_threshold=0.65,    # Model p(BTTS=NO) must be ≥ 0.65
    min_edge=0.02,             # Edge ≥ 0.02 (from bucket analysis)
    max_vig=0.08,              # Reject markets with vig > 8%
    prefer_higher_edge=True,   # When both sides qualify, choose higher edge
    stake=10.0                 # Flat stake per bet
)
```

### Decision Logic

For each match:

1. **Check odds availability** - Skip if BTTS YES/NO odds missing
2. **Compute fair odds** - Remove vig using proportional scaling
3. **Check vig** - Reject if vig > 8%
4. **Get model probabilities** - Run Poisson model on xG
5. **Compute edges**:
   - `edge_yes = p_yes - implied_p_yes`
   - `edge_no = p_no - implied_p_no`
6. **Apply thresholds**:
   - YES candidate: `p_yes ≥ 0.55 AND edge_yes ≥ 0.02`
   - NO candidate: `p_no ≥ 0.65 AND edge_no ≥ 0.02`
7. **Max 1 bet per match**:
   - If neither qualifies → **NO_BET**
   - If only YES qualifies → **Bet YES**
   - If only NO qualifies → **Bet NO**
   - If both qualify → **Bet side with higher edge**
8. **Assign confidence**:
   - HIGH: edge ≥ 0.08 OR prob ≥ 0.75
   - MEDIUM: edge ≥ 0.04 OR prob ≥ 0.65
   - LOW: otherwise

---

## Historical Performance (Walk-Forward Validation)

From combined strategy backtest (`BTTS_POISSON_COMBINED_STRATEGY_REPORT.md`):

**6-Fold Walk-Forward (490 test matches, 2024-2025)**

| Metric | Value |
|--------|-------|
| Total bets | 184 (37.6% of matches) |
| Overall win rate | 73.4% |
| YES win rate | 82.2% (90 bets) |
| NO win rate | 64.9% (94 bets) |
| ROI (fair odds) | **+41.88%** |
| YES ROI (fair) | +40.84% |
| NO ROI (fair) | +42.88% |

**Comparison to Separate Strategies:**

- **Combined** (this system): 184 bets, 73% win, +42% ROI (realistic)
- **YES-only**: 119 bets, 79% win, +36% ROI (can double-bet)
- **NO-only**: 94 bets, 65% win, +29% ROI (can double-bet)

✅ Combined strategy achieves **higher ROI** with realistic max-1-bet-per-match constraint.

---

## File Structure

```
research/btts_option_c/
├── src/
│   ├── production/
│   │   ├── __init__.py
│   │   └── btts_poisson_strategy.py       # Core strategy module
│   ├── load_data.py
│   ├── build_features.py
│   ├── model_baselines.py
│   └── evaluate.py
├── scripts/
│   ├── train_btts_poisson_production_model.py     # Step 1: Train model
│   └── generate_epl_btts_production_predictions.py # Step 2: Generate preds
├── models/
│   ├── btts_poisson_production.joblib             # Frozen model
│   └── btts_poisson_production_meta.json          # Model metadata
├── results/
│   └── epl_btts_preds_2025-12-12_2025-12-15.csv  # Prediction CSV
├── public/
│   └── epl_btts_preds_latest.json                 # API JSON (deployed to Netlify)
└── PRODUCTION_README.md                           # This file

../../netlify/functions/
└── epl-btts-poisson.mjs                           # Netlify function
```

---

## API Reference

### Python Module: `src/production/btts_poisson_strategy.py`

**Key Classes:**

```python
@dataclass
class BttsStrategyConfig:
    yes_prob_threshold: float = 0.55
    no_prob_threshold: float = 0.65
    min_edge: float = 0.02
    max_vig: float = 0.08
    prefer_higher_edge: bool = True
    stake: float = 10.0

@dataclass
class BttsDecision:
    match_id: str
    league: str
    kickoff_iso: str
    home_team: str
    away_team: str
    p_yes: float
    p_no: float
    market_yes_odds: Optional[float]
    market_no_odds: Optional[float]
    fair_yes_odds: Optional[float]
    fair_no_odds: Optional[float]
    edge_yes: Optional[float]
    edge_no: Optional[float]
    chosen_side: Literal["YES", "NO", "NO_BET"]
    chosen_edge: float
    confidence_bucket: str  # "LOW" / "MEDIUM" / "HIGH"
    kelly_fraction: float
    # ... more fields
```

**Key Functions:**

```python
# Load frozen model
model = load_production_poisson_model(
    model_path="models/btts_poisson_production.joblib"
)

# Generate decisions
decisions = compute_btts_decisions_for_fixtures(
    model=model,
    fixtures_df=fixtures,  # DataFrame with match_id, teams, xG
    odds_df=odds,          # DataFrame with match_id, btts_yes_odds, btts_no_odds
    config=BttsStrategyConfig()
)

# Convert to DataFrame for CSV
df = decisions_to_dataframe(decisions)

# Convert to JSON for API
json_payload = decisions_to_json_payload(decisions, metadata)
```

---

## Environment Variables

| Variable | Required | Usage | Example |
|----------|----------|-------|---------|
| `THEODDSAPI_KEY` | Yes (local) | Fetch fixtures/odds from TheOddsAPI | `your_key_here` |
| `PYTHONPATH` | Yes | Python module imports | `src:$PYTHONPATH` |

**⚠️ IMPORTANT:** TheOddsAPI key is **NEVER** used in production. It's only for local prediction generation. Netlify functions serve pre-generated JSON.

---

## CLI Reference

### Train Model

```bash
python3 scripts/train_btts_poisson_production_model.py \
    [--output-model PATH] \
    [--output-meta PATH]
```

**Options:**
- `--output-model`: Model save path (default: `models/btts_poisson_production.joblib`)
- `--output-meta`: Metadata save path (default: `models/btts_poisson_production_meta.json`)

### Generate Predictions

```bash
python3 scripts/generate_epl_btts_production_predictions.py \
    [--start-date YYYY-MM-DD] \
    [--end-date YYYY-MM-DD] \
    [--out-csv PATH] \
    [--out-json PATH] \
    [--bookmaker NAME] \
    [--model-path PATH] \
    [--meta-path PATH]
```

**Options:**
- `--start-date`: Fixture start date (default: `2025-12-12`)
- `--end-date`: Fixture end date (default: `2025-12-15`)
- `--out-csv`: CSV output path (default: `results/epl_btts_preds_2025-12-12_2025-12-15.csv`)
- `--out-json`: JSON output path (default: `public/epl_btts_preds_latest.json`)
- `--bookmaker`: Preferred bookmaker (default: `fanduel`)
- `--model-path`: Model file path (default: `models/btts_poisson_production.joblib`)
- `--meta-path`: Metadata file path (default: `models/btts_poisson_production_meta.json`)

**Environment:**
- Requires: `THEODDSAPI_KEY` environment variable

---

## Model Details

### Poisson BTTS Estimator

**Formula:**
```
P(BTTS) = P(Home scores) × P(Away scores)
        = (1 - P(Home = 0)) × (1 - P(Away = 0))
        = (1 - e^(-λ_home)) × (1 - e^(-λ_away))
```

Where:
- λ_home = Expected goals (xG) for home team
- λ_away = Expected goals (xG) for away team

**Training:**
- Data: 910 EPL matches (2023-08-11 to 2025-12-08)
- Features: home_xG, away_xG (from API-Football)
- λ_home (fitted): 1.625
- λ_away (fitted): 1.337

**Assumptions:**
- Goals follow Poisson distribution
- Home and away scoring are independent events
- xG is a good proxy for goal-scoring rate (λ)

---

## Validation & Testing

### Walk-Forward Backtest Results

See comprehensive validation in:
- `BTTS_WALKFORWARD_WINRATE_AUDIT.md` - W/L verification ✅
- `BTTS_ROI_AUDIT_RESULTS.md` - ROI calculation verification ✅
- `BTTS_POISSON_EDGE_AND_PROB_BUCKETS.md` - Edge/prob bucket analysis
- `BTTS_POISSON_COMBINED_STRATEGY_REPORT.md` - Combined strategy performance
- `TEMPORAL_VALIDITY_VERIFICATION.txt` - No data leakage verification ✅

**Key Findings:**
- Win/loss counts: 100% match (zero discrepancies)
- ROI calculations: Correct (fixed 100x reporting bug)
- Temporal validity: Confirmed (train ends before test starts)
- Edge buckets: Higher edge → higher ROI (with noise at low samples)
- Combined strategy: +42% ROI fair odds, 73% win rate

### Self-Test

```bash
cd research/btts_option_c
PYTHONPATH=src:$PYTHONPATH \
python3 src/production/btts_poisson_strategy.py
```

Runs self-test with dummy fixtures and validates:
- Model loading
- Decision generation
- Guardrail enforcement
- Output formatting

---

## Deployment Workflow

### Local Development

1. **Train model** (one-time or when new data available):
   ```bash
   PYTHONPATH=src:$PYTHONPATH python3 scripts/train_btts_poisson_production_model.py
   ```

2. **Generate predictions** (before each deployment):
   ```bash
   THEODDSAPI_KEY=xxx PYTHONPATH=src:$PYTHONPATH \
   python3 scripts/generate_epl_btts_production_predictions.py \
       --start-date 2025-12-12 --end-date 2025-12-15
   ```

3. **Commit files**:
   ```bash
   git add public/epl_btts_preds_latest.json
   git commit -m "Update EPL BTTS predictions for Dec 12-15"
   git push
   ```

### Netlify Deployment

- Netlify automatically deploys when you push to main branch
- Function endpoint: `/.netlify/functions/epl-btts-poisson`
- No build step needed for function (reads static JSON)

### CI/CD (Optional)

Future enhancement: GitHub Actions workflow to:
1. Run prediction generation on schedule (e.g., daily)
2. Commit updated JSON to repo
3. Trigger Netlify redeploy

---

## Troubleshooting

### Model Not Found

**Error:** `Production model not found at models/btts_poisson_production.joblib`

**Solution:** Train the model first:
```bash
PYTHONPATH=src:$PYTHONPATH python3 scripts/train_btts_poisson_production_model.py
```

### API Key Not Set

**Error:** `THEODDSAPI_KEY environment variable not set!`

**Solution:** Set the environment variable:
```bash
export THEODDSAPI_KEY=your_key_here
# or
THEODDSAPI_KEY=your_key_here python3 scripts/generate_epl_btts_production_predictions.py
```

### No Fixtures Found

**Error:** `No EPL matches found in date range with BTTS markets`

**Solutions:**
1. Check date range - EPL may not have matches that day
2. Try different date range
3. Verify TheOddsAPI key is valid and has quota remaining
4. Check TheOddsAPI status page

### Cache Not Found (Netlify)

**Error:** `Cache file not found` from Netlify function

**Solution:** Generate predictions locally and commit JSON:
```bash
THEODDSAPI_KEY=xxx PYTHONPATH=src:$PYTHONPATH \
python3 scripts/generate_epl_btts_production_predictions.py

git add public/epl_btts_preds_latest.json
git commit -m "Add EPL BTTS predictions"
git push
```

---

## Future Enhancements

### Near-Term
- [ ] Add xG prediction layer (don't rely on default averages)
- [ ] Support multiple bookmakers and compute consensus odds
- [ ] Add fractional Kelly stake sizing
- [ ] Add automated tests for strategy module

### Medium-Term
- [ ] GitHub Actions workflow for automatic prediction updates
- [ ] Historical tracking of prediction accuracy
- [ ] CLV (Closing Line Value) analysis
- [ ] Telegram/Discord bot integration

### Long-Term
- [ ] Upgrade from Poisson to more sophisticated model (XGBoost, Neural Network)
- [ ] Add player-level features (injuries, lineups, form)
- [ ] Multi-league support (Bundesliga, La Liga, Serie A)
- [ ] Live in-game model updates

---

## Credits

**Model:** Poisson BTTS baseline (xG-based)  
**Validation:** Walk-forward 6-fold (2024-2025 EPL)  
**Strategy:** Max 1 bet per match, edge + probability thresholds  
**Data:** API-Football (xG), TheOddsAPI (odds)  
**Framework:** Scikit-learn, pandas, numpy  

**Research Phase:** BTTS Option C (Profile C)  
**Production Ready:** December 2025  

---

## License

Internal research project. Not for public distribution.

---

## Contact

For questions or issues, contact the research team.

**Status:** ✅ Production Ready  
**Last Updated:** 2025-12-11  
**Version:** 1.0.0
