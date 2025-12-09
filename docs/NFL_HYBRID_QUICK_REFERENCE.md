# NFL Hybrid Model - Quick Reference Card

## 🚀 Quick Start (3 Commands)

```bash
# 1. Generate V5 predictions (if not already done)
node nfl-model-v4.1/scripts/v5-ensemble.mjs 2025 14

# 2. Run hybrid model + generate PNG reports
bash test-hybrid-system.sh 2025 14

# 3. Open PNG reports
open ~/Downloads/nfl_full_slate_week14_2025.png
open ~/Downloads/nfl_recommended_picks_week14_2025.png
```

---

## 📊 System Architecture

```
V5 (Ridge)  →  ━━━━━━━━━━┓
                         ┣━━→  HYBRID  ━━→  PNG Reports
V1 (EPA)    →  ━━━━━━━━━━┛      ↓
                              JSON
Market Odds →  ━━━━━━━━━━━━━━━━┛
```

---

## 🎯 Spreads Formula

```
hybridMargin = V5 + (0.4 × clamp(V1 - V5, -4, +4))
```

**Example**: V5=+4.5, V1=+7.2 → Hybrid = 4.5 + (0.4 × 2.7) = **5.6**

---

## 📈 Totals Formula

```
hybridTotal = V5.p50  (always)
isVolatile = |V1 - V5| > 7pts
if (isVolatile) stakes *= 0.5
```

**Example**: V5=45.5, V1=56.0 → Hybrid = **45.5** (volatile, 50% stakes)

---

## 💰 Stake Sizing

### Spreads
| Edge | Base | Disagreement Penalty |
|------|------|---------------------|
| <1.5 | 0.0U | -                   |
| 1.5-3| 1.0U | ×0.5 if >3pts       |
| 3-4.5| 2.0U | ×0.5 if >3pts       |
| >4.5 | 3.0U | ×0.5 if >3pts       |

**Blocking**: If disagreement >5pts → 0.0U (track only)

### Totals
| Edge | Base | Volatility Penalty |
|------|------|--------------------|
| <2.5 | 0.0U | -                  |
| 2.5-3| 0.5U | ×0.5 if volatile   |
| 3-5  | 1.0U | ×0.5 if volatile   |
| >5   | 2.0U | ×0.5 if volatile   |

---

## 🏷️ Categories

| Category | Spread Units | Total Units | Color  |
|----------|--------------|-------------|--------|
| STRONG   | ≥2.5U        | ≥1.5U       | 🟢 Green |
| CONSIDER | >0U, <2.5U   | >0U, <1.5U  | 🟡 Yellow |
| TRACK    | 0U           | 0U          | 🔴 Red   |

---

## 📁 Output Files

1. **JSON**: `output/nfl_hybrid_2025_week14.json`
   - Full model data, picks, disagreements

2. **PNG #1**: `~/Downloads/nfl_full_slate_week14_2025.png`
   - All games, 8 columns, model vs market

3. **PNG #2**: `~/Downloads/nfl_recommended_picks_week14_2025.png`
   - Filtered picks, color-coded, stake sizes

---

## 🛠️ Configuration

**File**: `scripts/nfl/run-hybrid-local.mjs`

```javascript
const ALPHA = 0.4;                    // V1 influence
const DISAGREEMENT_CLAMP = 4;         // Max ±4pts
const SPREAD_EDGE_THRESHOLD = 1.5;    // Min edge (pts)
const TOTAL_EDGE_THRESHOLD = 2.5;     // Min edge (pts)
const HIGH_VARIANCE_TOTAL_DELTA = 7;  // Volatility flag
```

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| "V5 predictions not found" | Run `node nfl-model-v4.1/scripts/v5-ensemble.mjs 2025 14` |
| "V1 API call failed" | System continues in V5-only mode (OK) |
| "matplotlib not found" | `pip3 install matplotlib numpy` |
| "No odds available" | Set `export ODDS_API_KEY="..."` or use placeholders |

---

## 📚 Documentation

- **Full Guide**: `docs/NFL_HYBRID_MODEL_GUIDE.md`
- **Implementation**: `docs/NFL_HYBRID_IMPLEMENTATION_SUMMARY.md`
- **V5 Bug Report**: `docs/BUG_REPORT_V5_ALL_UNDERS.md`

---

## 🎮 npm Scripts

```bash
npm run nfl:hybrid 2025 14   # Run hybrid model
npm run nfl:reports 2025 14  # Generate PNG reports
```

---

## ✅ Pre-Flight Checklist

- [ ] V5 bundle exists for target week
- [ ] Python dependencies installed (`matplotlib`, `numpy`)
- [ ] ODDS_API_KEY set (optional, for live odds)
- [ ] Node 20+ installed
- [ ] Netlify dev running (optional, for V1 integration)

---

## 🚨 Important Notes

1. **V5 First**: Always run V5 ensemble before hybrid
2. **Depth Charts**: Disabled for speed (injuries still active)
3. **Disagreement**: Models diverging >5pts = no bet (track only)
4. **Volatility**: Totals with >7pt V1-V5 delta = 50% stakes
5. **Local Only**: Hybrid system is not deployed to Netlify

---

## 📞 Quick Help

**Can't find output?**
```bash
# Check V5 exists
ls -lh nfl-model-v4.1/output/bundle_v5_2025_week14.json

# Check hybrid output
ls -lh output/nfl_hybrid_2025_week14.json

# Check PNG reports
ls -lh ~/Downloads/nfl_*_week14_2025.png
```

**Want to see JSON summary?**
```bash
jq '.meta' output/nfl_hybrid_2025_week14.json
jq '.games | length' output/nfl_hybrid_2025_week14.json
jq '[.games[].picks.spread | select(.units > 0)] | length' output/nfl_hybrid_2025_week14.json
```

---

## 🎯 Example Output

```json
{
  "game_id": "2025_14_PHI_LAC",
  "matchup": "PHI @ LAC",
  "model": {
    "hybrid": {
      "spread_home_margin": -5.0,
      "total_p50": 45.5
    }
  },
  "market": {
    "spread_display": "PHI -2.5",
    "total": 40.5
  },
  "picks": {
    "spread": {
      "category": "STRONG",
      "units": 2.0
    },
    "total": {
      "category": "CONSIDER",
      "side": "over",
      "units": 1.0
    }
  }
}
```

---

**Created**: December 9, 2024  
**Version**: 1.0.0  
**Status**: Production Ready
