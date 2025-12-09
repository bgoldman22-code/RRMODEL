# NFL Hybrid Model System - Complete Guide

## Overview

The NFL Hybrid Model combines the best of V5 (frozen Ridge regression) and V1 (EPA-based) to produce stable, well-calibrated predictions with lightweight injury adjustments.

**Architecture:**
- **Spreads**: V5 as backbone, V1 as contextual overlay (α=0.4, clamped ±4pts)
- **Totals**: V5 p50 as canonical, V1 only for volatility detection
- **Injuries**: YES (from V1 canonical system)
- **Depth Charts**: NO (disabled for speed and stability)

---

## Quick Start

### 1. Generate Hybrid Predictions

```bash
# Run for current week
node scripts/nfl/run-hybrid-local.mjs 2025 14

# Output: output/nfl_hybrid_2025_week14.json
```

### 2. Export PNG Reports

```bash
# Generate two PNG files in ~/Downloads
python3 scripts/nfl/export-hybrid-reports.py 2025 14

# Output:
#   ~/Downloads/nfl_full_slate_week14_2025.png
#   ~/Downloads/nfl_recommended_picks_week14_2025.png
```

### 3. Using npm Scripts

```bash
# Run hybrid model
npm run nfl:hybrid 2025 14

# Export reports
npm run nfl:reports 2025 14
```

---

## System Architecture

### Hybrid Spread Logic

```
v5Margin = V5 spread prediction (home margin)
v1Margin = V1 spread prediction (home margin)

disagreement = v1Margin - v5Margin
disagreementClamped = clamp(disagreement, -4, +4)  // Max ±4pts

hybridMargin = v5Margin + (0.4 × disagreementClamped)
```

**Example:**
- V5: PHI +4.5
- V1: PHI +7.2
- Disagreement: +2.7 (clamped to +2.7)
- Hybrid: 4.5 + (0.4 × 2.7) = **5.6**

### Hybrid Total Logic

```
v5Total = V5 p50 prediction
v1Total = V1 total estimate (for volatility only)

totalDisagreement = abs(v1Total - v5Total)
isHighVariance = totalDisagreement > 7

hybridTotal = v5Total  // Always use V5 for totals
```

**Volatility Haircut:**
- If `isHighVariance`: multiply stake by 0.5

---

## Stake Sizing

### Spread Stakes

| Edge (pts) | Base Units | Disagreement Guardrail |
|------------|------------|------------------------|
| < 1.5      | 0.0        | -                      |
| 1.5 - 3.0  | 1.0        | ×0.5 if > 3pts         |
| 3.0 - 4.5  | 2.0        | ×0.5 if > 3pts         |
| > 4.5      | 3.0        | ×0.5 if > 3pts         |

**Disagreement Guardrails:**
- If `abs(disagreement) > 5`: **No bet** (track only)
- If `abs(disagreement) > 3`: **Cut stakes in half**

### Total Stakes

| Edge (pts) | Base Units | Volatility Haircut |
|------------|------------|-------------------|
| < 2.5      | 0.0        | -                 |
| 2.5 - 3.0  | 0.5        | ×0.5 if volatile  |
| 3.0 - 5.0  | 1.0        | ×0.5 if volatile  |
| > 5.0      | 2.0        | ×0.5 if volatile  |

---

## Category Classification

| Category    | Criteria                              | Color  |
|-------------|---------------------------------------|--------|
| **STRONG**  | Spread: ≥2.5U / Total: ≥1.5U          | Green  |
| **CONSIDER**| Spread: >0U, <2.5U / Total: >0U, <1.5U| Yellow |
| **TRACK**   | 0U (blocked by guardrails)            | Red    |

---

## Output Format

### JSON Output (`output/nfl_hybrid_2025_week14.json`)

```json
{
  "meta": {
    "model_version": "NFL_Hybrid_V5+V1",
    "season": "2025-2026",
    "week": 14,
    "generated_at": "2025-12-09T...",
    "games_count": 14,
    "config": {
      "alpha": 0.4,
      "disagreement_clamp": 4,
      "spread_edge_threshold": 1.5,
      "total_edge_threshold": 2.5
    },
    "notes": [...]
  },
  "games": [
    {
      "game_id": "2025_14_PHI_LAC",
      "season": 2025,
      "week": 14,
      "home_team": "LAC",
      "away_team": "PHI",
      "matchup": "PHI @ LAC",
      
      "model": {
        "v5": {
          "spread_home_margin": -4.3,
          "total_p50": 45.5
        },
        "v1": {
          "home_margin": -6.0,
          "total_estimate": 56.0
        },
        "hybrid": {
          "spread_home_margin": -5.0,
          "total_p50": 45.5
        }
      },
      
      "market": {
        "spread_home_margin": -2.5,
        "spread_display": "PHI -2.5",
        "total": 40.5,
        "bookmaker": "DraftKings"
      },
      
      "picks": {
        "spread": {
          "category": "STRONG",
          "side": "PHI",
          "display": "PHI -2.5",
          "edge_pts": 2.5,
          "units": 2.0
        },
        "total": {
          "category": "CONSIDER",
          "side": "over",
          "line": 40.5,
          "predicted": 45.5,
          "edge_pts": 5.0,
          "units": 1.0,
          "high_variance": true
        }
      },
      
      "meta": {
        "spread_disagreement": -1.7,
        "total_disagreement": 10.5,
        "alpha_used": 0.4
      }
    }
  ]
}
```

---

## PNG Reports

### Report #1: Full Slate Analysis

**File**: `~/Downloads/nfl_full_slate_week14_2025.png`

**Columns:**
1. Game (e.g., "PHI @ LAC")
2. Conf. (confidence %, derived from stake)
3. Model Pick (team abbreviation)
4. Model Spread (e.g., "PHI -5.0")
5. Model Total (e.g., "45.5")
6. Win % (spread-to-probability conversion)
7. Vegas Spread (market line)
8. Vegas Total (market total)

**Style:**
- Dark background (#1a1a2e)
- Zebra-striped rows
- Accent color (#00D9FF)
- Matches NBA screenshot layout

### Report #2: Recommended Picks with Stakes

**File**: `~/Downloads/nfl_recommended_picks_week14_2025.png`

**Columns:**
1. Category (STRONG/CONSIDER/TRACK)
2. Game
3. Bet Type (Spread / Total)
4. Pick (e.g., "PHI -2.5", "Over 40.5")
5. Edge (pts)
6. Odds (e.g., "-110")
7. Book (e.g., "DraftKings")
8. Stake (e.g., "2.0U")

**Color Coding:**
- 🟢 **GREEN** = STRONG (high confidence)
- 🟡 **YELLOW** = CONSIDER (moderate)
- 🔴 **RED** = TRACK (no bet, blocked by guardrails)

**Footer Summary:**
```
• Total Strong Bets: 4 picks | Total Units: 8.0U
• Total Consider Bets: 6 picks | Total Units: 5.5U
• Total Track Only: 2 picks | Total Units: 0.0U
• Total Action: 10 active picks | 13.5 Units
```

---

## Configuration Tuning

### Adjustable Parameters

Edit `scripts/nfl/run-hybrid-local.mjs`:

```javascript
// How much V1 can bend V5
const ALPHA = 0.4;  // 0.0 = V5 only, 1.0 = 50/50 blend

// Max disagreement influence
const DISAGREEMENT_CLAMP = 4;  // ±4 pts

// Minimum edge for bets
const SPREAD_EDGE_THRESHOLD = 1.5;  // pts
const TOTAL_EDGE_THRESHOLD = 2.5;   // pts

// Volatility threshold
const HIGH_VARIANCE_TOTAL_DELTA = 7;  // pts
```

---

## Requirements

### Node.js Dependencies
- `node-fetch@2.7.0` (already installed)
- Node 20+ (for native fetch support)

### Python Dependencies
```bash
pip3 install matplotlib numpy
```

### Environment Variables
```bash
# Optional: For live odds fetching
export ODDS_API_KEY="your_key_here"

# If not set, hybrid runner uses placeholder odds
```

---

## Troubleshooting

### "V5 predictions not found"

**Issue**: Missing V5 bundle file  
**Solution**: Run V5 first:
```bash
node nfl-model-v4.1/scripts/v5-ensemble.mjs 2025 14
```

### "V1 API call failed"

**Issue**: Netlify dev server not running  
**Solution**: 
```bash
# Option 1: Run without V1 (V5-only mode)
# Hybrid runner will continue with V5 predictions only

# Option 2: Start Netlify dev
netlify dev
```

### "No odds available"

**Issue**: Missing ODDS_API_KEY  
**Solution**: Script uses placeholder odds if API key not set. For live odds:
```bash
export ODDS_API_KEY="your_key_here"
```

### "matplotlib not found"

**Issue**: Missing Python dependencies  
**Solution**:
```bash
pip3 install matplotlib numpy
```

---

## Comparison: V1 vs V5 vs Hybrid

| Feature                  | V1             | V5             | Hybrid         |
|--------------------------|----------------|----------------|----------------|
| Spread Backbone          | EPA features   | Ridge reg      | V5 + V1 blend  |
| Total Backbone           | Calculated     | Ridge reg      | V5 p50         |
| Injuries                 | ✅ Yes         | ❌ No          | ✅ Yes         |
| Depth Charts             | ✅ Yes (heavy) | ❌ No          | ❌ No          |
| Speed                    | Slow (~30s)    | Fast (~5s)     | Medium (~10s)  |
| Disagreement Guardrails  | ❌ No          | ❌ No          | ✅ Yes         |
| Stake Sizing             | ✅ Yes         | ❌ No          | ✅ Yes         |
| PNG Reports              | ❌ No          | ❌ No          | ✅ Yes         |

---

## Best Practices

1. **Always run V5 first** to ensure fresh predictions
2. **Use hybrid mode locally** (Netlify function is V1-only)
3. **Review disagreement values** in the JSON output
4. **Trust the guardrails** - track-only picks indicate model uncertainty
5. **Update odds regularly** if using ODDS_API_KEY
6. **Review PNG reports** before placing bets (visual sanity check)

---

## File Structure

```
RRMODEL/
├── scripts/nfl/
│   ├── run-hybrid-local.mjs      # Main hybrid runner
│   ├── export-hybrid-reports.py  # PNG report generator
│   ├── run-v1-local.mjs          # V1 local runner (existing)
│   └── run-v1-fresh-odds.mjs     # V1 with fresh odds (existing)
│
├── nfl-model-v4.1/
│   ├── scripts/v5-ensemble.mjs   # V5 prediction generator
│   └── output/
│       └── bundle_v5_2025_week14.json  # V5 output (input to hybrid)
│
├── netlify/functions/nfl-predictions-generate/
│   └── index.mjs                 # V1 model (modified for hybrid mode)
│
├── output/
│   └── nfl_hybrid_2025_week14.json  # Hybrid output
│
└── ~/Downloads/                  # PNG reports
    ├── nfl_full_slate_week14_2025.png
    └── nfl_recommended_picks_week14_2025.png
```

---

## Future Enhancements

### Planned Features
- [ ] Live odds auto-refresh during game week
- [ ] Historical backtest across multiple weeks
- [ ] Interactive HTML reports (instead of static PNGs)
- [ ] Telegram/Discord bot integration for auto-posting
- [ ] Real-time profit/loss tracking with actual results
- [ ] Model confidence calibration metrics

### Potential Tuning
- [ ] Optimize alpha (currently 0.4) via backtesting
- [ ] Adjust disagreement clamp (currently ±4pts)
- [ ] Test alternate stake sizing formulas
- [ ] Add moneyline picks (currently spread/total only)

---

## Credits

**Models:**
- V5: Ridge regression (λ=500), frozen 2020-2024 training
- V1: EPA-based, injury-adjusted, depth charts disabled

**Reporting:**
- Inspired by NBA PNG reports (create_picks_png.py)
- matplotlib + FancyBboxPatch for clean table layouts

**Created**: December 9, 2024  
**Version**: 1.0.0
