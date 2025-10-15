# NHL Auto-Logging & Evaluation System ✅

**Status:** LIVE - Fully automated tracking of NHL SOG predictions

---

## 🎯 What It Does

**Automatically tracks your NHL picks with ZERO manual work:**

1. ✅ **Logs picks daily** at 12pm ET (before games start)
2. ✅ **Evaluates results** at 2am ET (after games finish)
3. ✅ **Calculates performance** (win rate, ROI, MAE)
4. ✅ **Commits to Git** automatically
5. ✅ **Never double-logs** (idempotent)

---

## 📅 Schedule

| Time | Action | What Happens |
|------|--------|-------------|
| **12pm ET** | Log Picks | Fetches scanner output → Logs to CSV |
| **2am ET** | Update Results | Fetches NHL box scores → Updates CSV with actual SOG → Calculates ROI |

---

## 🔍 How It Evaluates

**Automatic evaluation logic:**

```javascript
// For each pick:
if (direction === 'OVER') {
  hit = actualSOG > line ? 1 : 0;  // Dylan Cozens 3 SOG > 2.5 line = HIT ✅
}
else if (direction === 'UNDER') {
  hit = actualSOG < line ? 1 : 0;  // Rasmus Dahlin 2 SOG < 2.5 line = HIT ✅
}

// ROI calculation:
if (hit === 1) {
  roi = odds > 0 ? (odds / 100) : (100 / Math.abs(odds));
  // +130 odds = 1.30 units won
  // -148 odds = 0.68 units won
} else {
  roi = -1;  // Loss = -1 unit
}
```

**Metrics tracked:**
- **Win Rate:** % of picks that hit
- **ROI:** Average return per pick (units)
- **MAE:** Average error in SOG prediction
- **Over/Under Breakdown:** Win rate by direction

---

## 📊 CSV Format

**File:** `data/nhl/logs/predictions_2024-25.csv`

**Fields logged:**
```csv
date,game_id,player,team,opponent,position,line,direction,predicted_sog,
actual_sog,hit,edge,edge_percent,odds,book,model_prob,implied_prob,roi,
game_start_time,is_home,pp_unit,ice_time_l5,logged_at
```

**Before game:**
```csv
2025-10-15,OTT_BUF_2025-10-15,Dylan Cozens,OTT,BUF,C,2.5,OVER,3.10,
,,,23.90,23.9,130,DraftKings,0.880,0.435,,2025-10-15T23:00:00Z,...
```

**After game (updated):**
```csv
2025-10-15,OTT_BUF_2025-10-15,Dylan Cozens,OTT,BUF,C,2.5,OVER,3.10,
3,,1,,23.90,23.9,130,DraftKings,0.880,0.435,1.30,2025-10-15T23:00:00Z,...
                                    ↑     ↑              ↑
                              actual_sog hit            roi
                              (3 SOG)    (1=win)     (1.30 units)
```

---

## 🚀 How to Use

### **Option 1: Fully Automated (Recommended)**

**Do nothing!** GitHub Action runs automatically:
- Daily at 12pm ET: Logs picks
- Daily at 2am ET: Updates results

### **Option 2: Manual Logging**

**Log today's picks:**
```bash
curl -s https://bgroundrobin.com/.netlify/functions/nhl-sog-scanner-v3-optimized | \
  node scripts/nhl/manual-log-from-scanner.mjs
```

**Update results:**
```bash
node scripts/nhl/update-results.mjs
```

**View dashboard:**
```bash
node scripts/nhl/monitor-dashboard.mjs
```

### **Option 3: Trigger GitHub Action Manually**

1. Go to: https://github.com/bgoldman22-code/RRMODEL/actions
2. Click: "NHL Daily Logger & Results"
3. Click: "Run workflow" → "Run workflow"

---

## 📈 Performance Dashboard

**View anytime:**
```bash
node scripts/nhl/monitor-dashboard.mjs
```

**Example output:**
```
🏒 NHL SOG PREDICTION DASHBOARD
═══════════════════════════════════════

📊 SEASON SUMMARY (2024-25)
Total Picks: 24
Win Rate: 58.3%
Average ROI: +0.15 units/pick
Total ROI: +3.6 units
MAE: 0.82 SOG

📈 ROLLING 10-GAME WINDOW
Win Rate: 60.0%
ROI: +0.22 units/pick

🎯 OVER/UNDER BREAKDOWN
OVERS: 55.6% (10/18 picks)
UNDERS: 66.7% (4/6 picks)

🏅 LAST 5 PICKS
✅ Dylan Cozens OVER 2.5 (+130): 3 SOG = +1.30u
✅ Rasmus Dahlin UNDER 2.5 (-110): 2 SOG = +0.91u
❌ Patrick Kane OVER 2.5 (+145): 2 SOG = -1.00u
✅ Drake Batherson OVER 2.5 (+120): 3 SOG = +1.20u
❌ Sam Bennett OVER 2.5 (-148): 2 SOG = -1.00u
```

---

## 🔄 Workflow Visualization

```
┌─────────────────────────────────────────────────┐
│  12:00 PM ET - LOG PICKS                        │
├─────────────────────────────────────────────────┤
│  1. GitHub Action triggers                      │
│  2. Fetches scanner endpoint                    │
│  3. Transforms JSON → CSV format                │
│  4. Appends to predictions_2024-25.csv          │
│  5. Commits to Git: "🏒 Log NHL picks"         │
└─────────────────────────────────────────────────┘
                      ↓
              [ Games happen ]
                      ↓
┌─────────────────────────────────────────────────┐
│  2:00 AM ET - UPDATE RESULTS                    │
├─────────────────────────────────────────────────┤
│  1. GitHub Action triggers                      │
│  2. Fetches NHL API box scores                  │
│  3. Matches players to predictions              │
│  4. Updates: actual_sog, hit, roi               │
│  5. Calculates: win rate, MAE, total ROI        │
│  6. Commits to Git: "📊 Update NHL results"    │
│  7. Shows dashboard summary                     │
└─────────────────────────────────────────────────┘
```

---

## 📁 Files

| File | Purpose |
|------|---------|
| `.github/workflows/nhl-daily-logger.yml` | GitHub Action automation |
| `scripts/nhl/log-prediction.mjs` | Logger class (V1) |
| `scripts/nhl/manual-log-from-scanner.mjs` | Scanner → CSV transformer |
| `scripts/nhl/update-results.mjs` | Auto-evaluator (fetches box scores) |
| `scripts/nhl/monitor-dashboard.mjs` | Performance viewer |
| `data/nhl/logs/predictions_2024-25.csv` | **Your tracked picks!** |

---

## ✅ Today's Status (Oct 15, 2025)

**8 picks logged:**
1. Dylan Cozens OVER 2.5 (+130) - Edge: 23.9%
2. Patrick Kane OVER 2.5 (+145) - Edge: 19.4%
3. Sam Bennett OVER 2.5 (-148) - Edge: 17.6%
4. Thomas Chabot OVER 1.5 (-154) - Edge: 16.6%
5. Rasmus Dahlin UNDER 2.5 (-110) - Edge: 14.8%
6. Drake Batherson OVER 2.5 (+120) - Edge: 9.9%
7. Alex DeBrincat OVER 2.5 (-148) - Edge: 8.7%
8. Gustav Forsling UNDER 1.5 (+105) - Edge: 5.0%

**Results will auto-update tomorrow at 2am ET! ✨**

---

## 🎯 Next Steps

1. **Wait** - System runs automatically
2. **Check tomorrow** - View updated CSV or run dashboard
3. **After 7 days** - Consider upgrading to V2 logger (GPT improvements)

**No manual work required!** 🚀
