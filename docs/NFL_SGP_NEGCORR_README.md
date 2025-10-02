# NFL Same-Game Parlay Negative Correlation System

## Overview

Identifies **Explosive Playmaker** and **Steady Playmaker** archetypes with high-likelihood negative-correlation prop combos for same-game parlays (SGPs).

### What it does

- Analyzes every game and every skill position player (RB/WR/TE)
- Identifies players with high likelihood of hitting OVER one prop but UNDER on a related prop
- Two categories:
  - **Explosive Playmaker**: High Yards, Low Receptions (deep threats, screen RBs)
  - **Steady Playmaker**: Low Yards, High Receptions (slot WRs, possession TEs)
- Factors in game script, defensive coverage, historical data, injury status, and more

## Archetypes

### Explosive Playmaker
**Profile**: Under receptions + Over yards

**Characteristics**:
- High aDOT (≥8.0) OR high YAC per reception (≥7.0)
- Lower target volume (≤6 per game)
- High explosive play rate (≥20%)

**Examples**:
- Deep-threat WRs (Xavier Worthy, DK Metcalf)
- Screen-heavy RBs (De'Von Achane, Alvin Kamara)

**Typical Combos**:
- Under 3.5 receptions + Over 49.5 yards
- Under 4.5 receptions + Over 59.5 yards

### Steady Playmaker
**Profile**: Over receptions + Under yards

**Characteristics**:
- Low aDOT (≤7.5)
- High target volume (≥6 per game)
- Low explosive play rate (≤12%)

**Examples**:
- Slot WRs (Khalil Shakir, Hunter Renfrow)
- Possession TEs (Travis Kelce, Dallas Goedert)

**Typical Combos**:
- Over 5.5 receptions + Under 49.5 yards
- Over 6.5 receptions + Under 44.5 yards

## Data Sources

### Player Stats
- NFLverse play-by-play data (2024-2025 seasons)
- Rolling 3-game averages for recent form
- Season-to-date aggregates

**Key Metrics**:
- Targets per game
- Catch rate
- Average depth of target (aDOT)
- Yards after catch per reception (YAC/rec)
- Explosive play rate (15+ yard catches)

### Defensive Metrics
- Opponent aDOT allowed by position
- Explosive pass rate allowed
- YAC allowed per reception
- Catch rate allowed

### Game Context
- Team pass attempts forecast (script-adjusted)
- Spread and total (game flow implications)
- Player injury/availability status (canonical availability system)
- Weather conditions

## Model Details

### Projection Process

1. **Base Projections**
   - Historical targets per game
   - Catch rate (adjusted for opponent defense)
   - aDOT and YAC profiles
   - Explosive play tendencies

2. **Game Script Adjustment**
   - Teams trailing pass more → higher target projections
   - Teams leading run more → lower target projections
   - Based on spread and total

3. **Opponent Defense Adjustment**
   - Catch rate multiplier (vs league average)
   - Explosive rate multiplier (vs league average)

4. **Availability Confidence**
   - Integration with canonical availability system
   - Injury status and role changes
   - Confidence penalty for uncertainty

### Simulation Engine

**Targets**: Negative binomial (overdispersed Poisson)
- Accounts for week-to-week variance
- Overdispersion parameter: 1.5

**Receptions**: Binomial(targets, catch_rate)
- Conditional on targets

**Yards per Catch**: Two-component mixture
- **Short component**: Normal distribution centered around aDOT + YAC
- **Explosive component**: Lognormal tail for big plays
- Mixing weight based on explosive play rate

**Total Yards**: Sum of yards per catch over all receptions

**Simulations**: 50,000 iterations per player-combo
- Compute P(Rec ≤ r AND Yards ≥ y) for Explosive
- Compute P(Rec ≥ r AND Yards ≤ y) for Steady

### Output Probabilities

Model outputs **true probability** of combo hitting.

**Probability Ranges**:
- 15-25%: Longshot value (if SGP odds are attractive)
- 25-35%: Standard recommendation range
- 35-45%: High-confidence plays
- 45%+: Rare (combos this likely are usually priced efficiently)

## Usage

### API Endpoint

```bash
GET /.netlify/functions/nfl-sgp-negcorr?week=5
```

**Response**:
```json
{
  "slate": "2025-week-5",
  "candidates": [
    {
      "player": "De'Von Achane",
      "team": "MIA",
      "position": "RB",
      "archetype": "Explosive Playmaker",
      "combo": {
        "rec": { "line": 3.5, "side": "under" },
        "yards": { "line": 49.5, "side": "over" }
      },
      "trueProbability": 0.38,
      "reasoning": "Elite YAC (9.8 per catch), High explosive rate (30%), Game script favors quick passing",
      "inputs": { ... },
      "kellyUnits": 0.75,
      "kellyTier": "BET"
    }
  ],
  "summary": {
    "totalCandidates": 12,
    "explosivePlaymakers": 7,
    "steadyPlaymakers": 5
  }
}
```

### Data Extraction

Run R scripts to update player and defensive stats:

```bash
# Extract player receiving stats
Rscript scripts/extract-player-receiving-stats.R

# Extract defensive metrics
Rscript scripts/extract-defense-receiving-allow.R
```

Output files:
- `data/player_receiving_stats_2025.json`
- `data/defense_receiving_allow_2025.json`

### Testing

```bash
# Run test harness with mock data
node scripts/test-sgp-scanner.js
```

Generates sample predictions for DraftKings validation.

## Calibration Process

1. **Generate test predictions** (script above)
2. **Get DraftKings SGP odds** for each combo
3. **Record results**:
   - Model true prob vs DK implied prob
   - Identify systematic over/under pricing
4. **Calibrate**:
   - Isotonic regression on true probs
   - Adjust archetype thresholds if needed
5. **Track CLV**:
   - Monitor line movement after model recommendation
   - Track ROI on recommended combos

## Integration with Existing Systems

### Canonical Availability v5
- Player injury/role confidence scores
- QB status and impact on pass attempts
- Route participation adjustments

### Hybrid Kelly Staking
- Edge calculation: `true_prob - sgp_implied_prob`
- Signals: availability confidence, game script, model calibration
- Units recommendation with audit trail

### NFL Predictions Pipeline
- Reuses schedule, odds, injury data infrastructure
- Can be triggered alongside main predictions endpoint

## Limitations & Guardrails

### Current Limitations
1. **SGP Odds Not Automated**
   - Manual DK pricing required for now
   - Future: Scraper or API integration

2. **Defensive Metrics Simplified**
   - Position-level only (no coverage scheme)
   - Can refine with alignment/personnel data

3. **Correlation Pricing Uncertainty**
   - Books may already price correlation
   - Need actual SGP data to validate edge

### Guardrails
- Minimum probability: 15%
- Maximum probability: 50%
- Minimum availability confidence: 70%
- Minimum projected targets: 2
- Position filters: RB/WR/TE only

## Roadmap

### Week 1 (Current)
- ✅ Core simulation engine
- ✅ Archetype classification
- ✅ API endpoint with Kelly integration
- ✅ Test harness for DK validation

### Week 2-3
- [ ] Automate SGP odds scraping (DK/FD)
- [ ] Calibrate true probs vs actual SGP prices
- [ ] Add defensive coverage scheme data
- [ ] CLV and ROI tracking

### Week 4+
- [ ] Expand to prop ladders (half PPR, 1st half props)
- [ ] Multi-game parlay scanner (correlated players)
- [ ] Live-betting adjustments (in-game script changes)

## Files

### Core Logic
- `netlify/functions/_lib/nfl-sgp-negcorr.mjs` - Sim engine and scanner
- `netlify/functions/nfl-sgp-negcorr/index.mjs` - API endpoint

### Data Extraction
- `scripts/extract-player-receiving-stats.R` - Player stats from pbp
- `scripts/extract-defense-receiving-allow.R` - Defensive metrics

### Testing
- `scripts/test-sgp-scanner.js` - Test harness with mock data

### Data Files
- `data/player_receiving_stats_2025.json` - Player projections
- `data/defense_receiving_allow_2025.json` - Opponent metrics

## Example Workflow

1. **Monday**: Extract latest player/defense stats from pbp data
2. **Wednesday**: Generate Week N predictions via API
3. **Thursday**: Input DK SGP odds for top 10 combos
4. **Friday**: Calculate edge, apply Kelly, publish picks
5. **Sunday**: Track results, update calibration

## Questions?

See test output in `test-sgp-output.json` for sample predictions to validate on DraftKings.
