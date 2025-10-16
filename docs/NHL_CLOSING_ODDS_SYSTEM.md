# NHL Closing Odds & ROI Tracking System

## Why This Matters

### Problem with Opening Odds Only:
When you log predictions at 12pm ET but games start at 7pm ET, the odds change:

| Time | Player | Line | Opening Odds | Closing Odds | Implied Prob | Movement |
|------|--------|------|--------------|--------------|--------------|----------|
| 12pm | Matthews | O2.5 | +120 | -110 | 45.5% → 52.4% | Sharp money on OVER |
| 12pm | McDavid | U3.5 | -110 | +105 | 52.4% → 48.8% | Public hammered OVER |

**If you calculate ROI using opening odds:**
- Matthews hit: +1.20 units (but you'd only get +0.91 at close)
- **You're overstating profit by 32%!**

**If you calculate ROI using closing odds:**
- Matthews hit: +0.91 units (realistic payout)
- True performance measurement

### Closing Line Value (CLV):
```
CLV = Opening Odds - Closing Odds

Positive CLV = You beat the closing line (good!)
Negative CLV = Closing line was better (late to the party)
```

**Example:**
- You bet OVER 2.5 @ +120 (opening)
- Closing line: OVER 2.5 @ -110
- CLV = +120 - (-110) = +230 **Excellent!**
- This means sharp money agreed with you

## System Architecture

### 1. **Opening Odds** (12pm ET - Prediction Time)
- **Script**: `scripts/nhl/manual-log-from-scanner.mjs`
- **When**: Daily at 12pm ET (before games start)
- **Source**: The Odds API (scanner endpoint)
- **Stored**: `predictions_2024-25.csv` → `odds` column
- **Purpose**: Record what odds were available when prediction was made

### 2. **Closing Odds** (30-60 min before game)
- **Script**: `scripts/nhl/fetch-closing-odds.mjs`  
- **When**: 6:30pm ET and 9:30pm ET (before game times)
- **Source**: The Odds API (direct call)
- **Stored**: `predictions_2024-25.csv` → `closing_odds` column
- **Purpose**: Record final market odds before puck drop

### 3. **ROI Calculation** (2am ET - After Games)
- **Script**: `scripts/nhl/update-results.mjs`
- **When**: 2am ET (after all games finish)
- **Logic**: Uses `closing_odds` if available, fallback to `odds`
- **Stored**: `predictions_2024-25.csv` → `roi` column
- **Purpose**: Calculate true profit/loss per pick

## CSV Columns

```csv
date,game_id,player,team,opponent,position,line,direction,
predicted_sog,actual_sog,hit,edge,edge_percent,
odds,              ← Opening odds (12pm ET)
book,model_prob,implied_prob,
roi,               ← Calculated using closing_odds
game_start_time,is_home,pp_unit,ice_time_l5,logged_at,
closing_odds,      ← NEW: Closing odds (game time)
clv                ← NEW: Closing Line Value
```

## Workflow Timeline

```
12:00 PM ET → Log predictions (opening odds)
         ↓
06:30 PM ET → Fetch closing odds (30min before 7pm games)
         ↓
07:00 PM ET → Games start
         ↓
10:00 PM ET → Most games finish
         ↓
02:00 AM ET → Grade predictions + Calculate ROI (using closing odds)
         ↓
09:00 AM ET → Double-check any missed results
```

## GitHub Actions

### `nhl-daily-logger.yml`
- **12pm ET**: Logs predictions with opening odds
- **2am ET**: Grades predictions + calculates ROI

### `nhl-fetch-closing-odds.yml` (NEW)
- **6:30pm ET**: Fetches closing odds for 7pm games
- **9:30pm ET**: Fetches closing odds for 10pm games
- Stores closing odds + calculates CLV

## ROI Calculation

### With Closing Odds (Correct):
```javascript
const closingOdds = parseInt(pred.closing_odds) || odds;
let roi = 0;
if (hit === 1) {
  // Win: Use closing odds for payout
  roi = closingOdds > 0 
    ? (closingOdds / 100)      // +120 = 1.20 units
    : (100 / Math.abs(closingOdds));  // -110 = 0.91 units
} else {
  // Loss: Always -1 unit
  roi = -1;
}
```

### Example Results:
| Pick | Opening | Closing | Result | Opening ROI | **Closing ROI** | Difference |
|------|---------|---------|--------|-------------|-----------------|------------|
| Matthews O2.5 | +120 | -110 | ✅ Hit | +1.20 | **+0.91** | -0.29 (-24%) |
| Kane O2.5 | -110 | -130 | ❌ Miss | -1.00 | **-1.00** | 0 |
| Dahlin U2.5 | +105 | +115 | ✅ Hit | +1.05 | **+1.15** | +0.10 (+10%) |

**True ROI = +1.06 units** (vs +1.25 if using opening odds)

## CLV Analysis

### What Good CLV Looks Like:
```
Avg CLV: +15  →  Excellent (beating closing by 15 cents avg)
Avg CLV: +5   →  Good (consistently ahead of market)
Avg CLV: 0    →  Neutral (moving with market)
Avg CLV: -10  →  Bad (chasing steam, late to bets)
```

### CLV by Direction:
```
OVERS:  +8  CLV  →  Good over selection
UNDERS: -3  CLV  →  Betting unders too early (market disagrees)
```

**If CLV is consistently negative:**
1. Bet closer to game time
2. Market may disagree with model
3. Consider fade or skip those spots

## Unit Distribution Strategy

Based on **true ROI** (using closing odds) + **CLV**:

### Current Performance (Example):
```
Win Rate: 62.5%
Avg ROI:  +0.64 units/pick  (using closing odds)
Avg CLV:  +12                (good bet timing)
```

### Recommended Unit Sizing:
```javascript
// Base Kelly: (Edge% * WinRate - (1-WinRate)) / Edge%
const winRate = 0.625;
const edge = 0.10;  // 10% edge
const kelly = (edge * winRate - (1 - winRate)) / edge;
// kelly = 0.25 (25% of bankroll)

// Fractional Kelly (25% of Kelly = 6.25% of bankroll)
const fractionalKelly = kelly * 0.25;

// Adjust by CLV quality
const clvMultiplier = avgCLV > 10 ? 1.2 : avgCLV > 0 ? 1.0 : 0.8;
const finalKelly = fractionalKelly * clvMultiplier;

// Units per $1000 bankroll
const unitsPerPick = finalKelly * 1000 / 100;  // ~0.6-0.8 units
```

### Unit Tiers Based on Performance:
| ROI/Pick | CLV | Units | Example ($1000 bank) |
|----------|-----|-------|----------------------|
| +0.80+ | +15 | 1.0 | $10/pick |
| +0.50-0.80 | +5 to +15 | 0.75 | $7.50/pick |
| +0.20-0.50 | 0 to +5 | 0.50 | $5/pick |
| < +0.20 | < 0 | 0.25 | $2.50/pick (reduce exposure) |

## Monitoring

### Daily Checks:
1. **Closing odds coverage**: Are we getting closing odds for all picks?
2. **CLV trending**: Is avg CLV staying positive?
3. **ROI accuracy**: True ROI vs expected (using closing odds)

### Red Flags:
- ⚠️ CLV < -5 for 3+ days → Bet timing is off
- ⚠️ Closing odds unavailable → Missing data, use fallback
- ⚠️ Opening vs Closing ROI gap > 20% → Market strongly disagrees

## Testing

```bash
# Fetch closing odds manually
node scripts/nhl/fetch-closing-odds.mjs 2025-10-16

# Check CLV for today's picks
grep "2025-10-16" data/nhl/logs/predictions_2024-25.csv | \
  awk -F',' '{print $3, $14, $24, $25}' | \
  column -t
# Player, Opening, Closing, CLV

# Calculate true ROI
node scripts/nhl/monitor-dashboard.mjs
```

---

**Status**: ✅ Implemented
**Next**: Deploy and monitor first closing odds fetch
**Impact**: Accurate ROI → Better unit sizing → Higher profits
