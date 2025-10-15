# NHL Model Evolution Gameplan 🏒

**Created:** October 15, 2025  
**Review Date:** October 22, 2025 (7 days)  
**Status:** Day 1 - Baseline Collection Phase

---

## 📊 Current State (Day 1)

### **What's Running:**
- ✅ NHL Scanner (v3.2) - Finding games, generating picks
- ✅ V1 Logger - Tracking predictions to CSV
- ✅ Auto-logging GitHub Action (12pm ET daily)
- ✅ Auto-results updater (2am ET daily)
- ✅ Performance dashboard

### **Today's Picks (Oct 15):**
- **8 picks logged** from 4 games
- Edge range: 5.0% to 23.9%
- Mix: 6 OVERS, 2 UNDERS
- All from DraftKings

### **Files Active:**
```
data/nhl/logs/predictions_2024-25.csv          ← Your live tracking log
scripts/nhl/log-prediction.mjs                 ← V1 logger (active)
scripts/nhl/log-prediction-v2.mjs             ← V2 logger (ready, not active)
scripts/nhl/update-results.mjs                 ← Auto-evaluator
scripts/nhl/monitor-dashboard.mjs              ← Performance viewer
.github/workflows/nhl-daily-logger.yml         ← Automation
```

---

## 🎯 7-Day Gameplan

### **Days 1-7: Baseline Collection (NO CHANGES)**

**Goal:** Collect 30-50 picks to establish baseline performance

**What happens automatically:**
1. Daily at 12pm ET: Log picks
2. Daily at 2am ET: Update results
3. CSV grows with real performance data

**What to do:**
- ❌ **DO NOT** adjust model
- ❌ **DO NOT** change edge thresholds
- ✅ **Just watch** - let it collect data

**Expected by Day 7:**
- 30-50 total picks logged
- Win rate calculated
- ROI measured
- Over/Under breakdown
- MAE (prediction error) tracked

---

## 📅 Day 7 Review Checklist (Oct 22, 2025)

### **Step 1: Run Performance Dashboard**

```bash
node scripts/nhl/monitor-dashboard.mjs
```

**Look for:**
- **Overall win rate:** Target ≥55% (break-even ~52%)
- **ROI:** Target >0 units (positive = profitable)
- **MAE:** Target <1.0 SOG (prediction accuracy)
- **Over/Under split:** Should be roughly balanced

---

### **Step 2: Analyze Calibration (Upgrade to V2)**

**IF you have 30+ picks, upgrade to V2 for better diagnostics:**

```bash
# Backup V1 data
cp data/nhl/logs/predictions_2024-25.csv data/nhl/logs/predictions_2024-25_v1_backup.csv

# Create V2 migration script (we'll build this on Day 7)
node scripts/nhl/migrate-v1-to-v2.mjs
```

**V2 adds:**
- ✅ Calibration buckets (see if high-edge picks actually hit more)
- ✅ Per-player stats (which players model is good/bad at)
- ✅ CLV tracking (opening vs closing line value)
- ✅ Void/push handling (DNP, scratches)
- ✅ Player ID joins (more robust than name matching)

---

### **Step 3: Decision Tree**

#### **Scenario A: Model is Working (55%+ win rate, positive ROI)**

**Action:** Keep running, NO changes needed

**Optional enhancements:**
- [ ] Add CLV tracking to see if getting good prices
- [ ] Analyze per-player performance (some players easier to predict?)
- [ ] Check calibration buckets (high-edge picks hitting more?)

#### **Scenario B: Model Needs Calibration (50-54% win rate, neutral ROI)**

**Possible issues:**
1. **Overconfident:** High-edge picks hitting <50%
2. **Underconfident:** Low-edge picks hitting >60%
3. **Directional bias:** Overs hitting 60% but Unders hitting 40%

**Safe fixes:**
1. **Adjust edge threshold** (not model weights)
   - If 10%+ edge picks hitting <50% → raise threshold to 12%
   - If 5-7% edge picks hitting >60% → lower threshold to 4%

2. **Add Platt scaling calibration layer** (if >50 picks)
   ```javascript
   // Adjusts probabilities, not features
   // Only touches confidence, not predictions
   ```

3. **Separate Over/Under thresholds**
   - If Overs consistently better → favor Overs (lower threshold)
   - If Unders consistently better → favor Unders (lower threshold)

#### **Scenario C: Model Not Working (<50% win rate, negative ROI)**

**RED FLAGS to investigate:**
1. **Odds integration broken?** Check if real odds are being used
2. **SOG prediction accuracy?** Check MAE (should be <1.5)
3. **Sample size too small?** Need 50+ picks to judge

**Actions:**
1. Wait until 50+ picks before making changes
2. Analyze which types of picks are failing:
   - High vs low lines?
   - Overs vs Unders?
   - Certain teams/positions?
3. Consider adding **position-specific adjustments**

---

## 🔧 Safe Model Adjustment Principles

### **What TO Adjust (Safe):**
✅ **Edge thresholds** - Filter picks more/less aggressively  
✅ **Probability calibration** - Platt scaling or isotonic regression  
✅ **Direction-specific thresholds** - Separate Over/Under filters  
✅ **Minimum sample sizes** - Require more games played  

### **What NOT to Adjust (Risky):**
❌ **Model features** - Don't change what goes into predictions  
❌ **Base rates** - Don't touch position/situation baselines  
❌ **Weights** - Don't retrain on small samples  
❌ **Variance calculations** - Keep uncertainty estimates stable  

### **Rules for ANY Adjustment:**

1. **Minimum sample:** 50+ picks before adjusting anything
2. **Move slowly:** ±0.5% per week maximum
3. **One at a time:** Change one thing, wait 7 days, evaluate
4. **Reversible:** Track config versions, can roll back
5. **Document:** Write down what you changed and why

---

## 📈 V2 Upgrade Path (Optional, Day 7+)

### **When to upgrade:**
- ✅ After 30+ picks collected
- ✅ Want better diagnostics
- ✅ Ready for production-level tracking

### **What V2 adds:**

#### **1. Calibration Buckets**
Shows if model is well-calibrated:
```
OVERS:
  0-2% edge: 48% hit rate (6 picks)  ← Close to 50%, good!
  2-4% edge: 52% hit rate (8 picks)  ← Slightly better, expected
  4-6% edge: 58% hit rate (7 picks)  ← Good calibration
  6-8% edge: 43% hit rate (4 picks)  ← RED FLAG: High edge, low hit%
  8%+ edge:  67% hit rate (5 picks)  ← Working well

UNDERS:
  0-2% edge: 51% hit rate (5 picks)
  ...
```

**What to look for:**
- Hit% should increase as edge increases
- If 8%+ edge hitting <50% → model overconfident
- If 0-2% edge hitting >55% → model underconfident

#### **2. Per-Player Tracking**
```
Dylan Cozens (8478402):
  Total picks: 12
  Win rate: 58.3%
  Over win rate: 60.0%
  Under win rate: 50.0%
  Average edge: 8.2%
  → Good candidate for future picks

Patrick Kane (8474141):
  Total picks: 15
  Win rate: 40.0%
  Over win rate: 38.5%
  → AVOID: Model struggles with this player
```

#### **3. CLV Tracking (Closing Line Value)**
```
Average CLV: +0.8% (beating closing line!)
Positive CLV rate: 58% (good execution)
```

**What it means:**
- Positive CLV = Getting better price than closing line
- Even if pick loses, positive CLV = +EV long-term

---

## 🚀 Migration Script (Create on Day 7)

**File:** `scripts/nhl/migrate-v1-to-v2.mjs`

```javascript
// We'll build this on Day 7 to convert V1 CSV to V2 format
// Adds: player_id, status, clv fields
// Preserves: all V1 data
```

---

## 📊 Day 7 Diagnostic Commands

```bash
# 1. View performance dashboard
node scripts/nhl/monitor-dashboard.mjs

# 2. Check raw CSV
cat data/nhl/logs/predictions_2024-25.csv | column -t -s, | head -20

# 3. Count total picks
wc -l data/nhl/logs/predictions_2024-25.csv

# 4. Count wins/losses
grep ",1," data/nhl/logs/predictions_2024-25.csv | wc -l  # Wins
grep ",0," data/nhl/logs/predictions_2024-25.csv | wc -l  # Losses

# 5. Calculate win rate
node -e "
const fs = require('fs');
const csv = fs.readFileSync('data/nhl/logs/predictions_2024-25.csv', 'utf-8');
const lines = csv.split('\n').filter(l => l.includes(',1,') || l.includes(',0,'));
const wins = lines.filter(l => l.includes(',1,')).length;
console.log(\`Win Rate: \${(wins/lines.length*100).toFixed(1)}%\`);
"
```

---

## 🎯 Success Criteria (Day 7)

### **Minimum Viable:**
- ✅ 30+ picks logged
- ✅ Results auto-updated
- ✅ Win rate calculated
- ✅ No system errors

### **Good Performance:**
- ✅ Win rate 53-57% (break-even to profitable)
- ✅ ROI ≥ 0 units
- ✅ MAE < 1.2 SOG
- ✅ Both Overs and Unders working

### **Excellent Performance:**
- ✅ Win rate 58%+ (clearly profitable)
- ✅ ROI > +0.15 units/pick
- ✅ MAE < 0.9 SOG
- ✅ Positive CLV (if tracking)

### **Red Flags:**
- ❌ Win rate < 50%
- ❌ ROI < -0.20 units/pick
- ❌ MAE > 1.5 SOG
- ❌ One direction hitting <40%

---

## 🔮 Long-Term Roadmap (Day 14+)

### **Week 3-4: Model Refinement**
- [ ] Position-specific edge thresholds
- [ ] Team strength adjustments
- [ ] Rest/fatigue factors
- [ ] Goalie quality integration

### **Week 5-8: Advanced Features**
- [ ] Steam detection (line movement)
- [ ] Sharp vs square money tracking
- [ ] Injury impact modeling
- [ ] Situational filters (B2B games, travel)

### **Season-long:**
- [ ] Automated calibration (after 100+ picks)
- [ ] Walk-forward validation
- [ ] Bankroll management integration
- [ ] Multi-book line shopping

---

## 📝 Notes for Day 7 Review

**Questions to answer:**
1. What's the overall win rate?
2. Is ROI positive or negative?
3. Are Overs and Unders both working?
4. Which edge ranges are most profitable?
5. Are any players consistently failing?
6. Is prediction accuracy (MAE) acceptable?

**Decisions to make:**
1. Keep V1 or upgrade to V2?
2. Adjust edge thresholds or keep same?
3. Add calibration layer or not yet?
4. Any obvious model bugs to fix?

**DO NOT:**
- Panic after one bad day
- Overreact to small samples
- Change multiple things at once
- Adjust based on <50 picks

---

## ✅ Day 1 Action Items (Today)

- [x] NHL scanner working (8 picks generated)
- [x] Picks logged to CSV
- [x] GitHub Action scheduled
- [x] Documentation created
- [x] Gameplan committed to repo
- [ ] Wait and collect data (automatic)

---

## 📅 Calendar Reminders

- **Oct 15, 2025:** Day 1 - Baseline started
- **Oct 22, 2025:** Day 7 - Review performance, decide on V2 upgrade
- **Oct 29, 2025:** Day 14 - Second review, consider adjustments
- **Nov 15, 2025:** Day 30 - Full month review, model refinement

---

## 🆘 Troubleshooting (If Issues Arise)

### **If GitHub Action stops running:**
```bash
# Check workflow status
gh workflow view "NHL Daily Logger & Results"

# Manually trigger
gh workflow run "NHL Daily Logger & Results"

# Or run locally
curl -s https://bgroundrobin.com/.netlify/functions/nhl-sog-scanner-v3-optimized | \
  node scripts/nhl/manual-log-from-scanner.mjs
```

### **If results not updating:**
```bash
# Run manually
node scripts/nhl/update-results.mjs

# Check NHL API
curl https://api-web.nhle.com/v1/score/2025-10-15 | jq
```

### **If scanner stops finding games:**
```bash
# Test scanner
curl -s https://bgroundrobin.com/.netlify/functions/nhl-sog-scanner-v3-optimized | jq '.opportunities | length'

# Should return: number of picks (or 0 if no games today)
```

---

## 🎯 Bottom Line

**For the next 7 days:**
1. ✅ System runs automatically
2. ✅ Data collects
3. ❌ NO manual intervention needed
4. ❌ NO model adjustments

**On Day 7 (Oct 22):**
1. Run diagnostics
2. Analyze performance
3. Decide on V2 upgrade
4. Consider calibration adjustments
5. Update this gameplan

**See you in 7 days!** 🏒📊✨
