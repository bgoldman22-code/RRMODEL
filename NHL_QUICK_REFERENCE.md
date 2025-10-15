# NHL Model - Quick Reference Card 🏒

**Status:** LIVE - Auto-tracking enabled  
**Review Date:** October 22, 2025 (7 days)

---

## 🎯 What's Running (Automatic)

✅ **Daily at 12pm ET:** Log new picks  
✅ **Daily at 2am ET:** Update results  
✅ **GitHub commits:** Automatic CSV updates  
✅ **Model adjustments:** NONE (collecting baseline)

---

## 📊 Current Performance (Day 1)

| Metric | Value |
|--------|-------|
| Picks logged | 8 |
| Games tracked | 4 (OTT@BUF, FLA@DET, CHI@STL, CGY@UTA) |
| Edge range | 5.0% - 23.9% |
| Direction split | 6 OVERS, 2 UNDERS |
| Results | Pending (auto-update tomorrow 2am) |

---

## 🔍 Day 7 Review (Oct 22)

### **Commands to Run:**

```bash
# 1. Performance dashboard
node scripts/nhl/monitor-dashboard.mjs

# 2. View CSV
cat data/nhl/logs/predictions_2024-25.csv | column -t -s, | head -20

# 3. Quick stats
node -e "
const fs = require('fs');
const csv = fs.readFileSync('data/nhl/logs/predictions_2024-25.csv', 'utf-8');
const lines = csv.split('\n').filter(l => l.includes(',1,') || l.includes(',0,'));
const wins = lines.filter(l => l.includes(',1,')).length;
console.log('Win Rate:', (wins/lines.length*100).toFixed(1) + '%');
console.log('Total picks:', lines.length);
"
```

### **Decision Matrix:**

| Win Rate | ROI | Action |
|----------|-----|--------|
| 58%+ | Positive | ✅ Keep running, no changes |
| 53-57% | Neutral/Positive | ✅ Keep running, monitor |
| 50-52% | Neutral/Negative | ⚠️ Consider calibration |
| <50% | Negative | 🔴 Investigate issues, wait for more data |

---

## 📁 Key Files

```
📊 DATA:
data/nhl/logs/predictions_2024-25.csv          ← Your tracking log

🔧 SCRIPTS:
scripts/nhl/log-prediction.mjs                 ← V1 logger (active)
scripts/nhl/update-results.mjs                 ← Auto-evaluator
scripts/nhl/monitor-dashboard.mjs              ← Performance viewer

🤖 AUTOMATION:
.github/workflows/nhl-daily-logger.yml         ← Daily automation

📚 DOCS:
NHL_7_DAY_GAMEPLAN.md                          ← Full strategy
NHL_AUTO_LOGGING_COMPLETE.md                   ← System guide
NHL_SETUP_GUIDE.md                             ← Setup instructions
```

---

## 🚨 If Something Breaks

### **Picks not logging?**
```bash
# Manual log
curl -s https://bgroundrobin.com/.netlify/functions/nhl-sog-scanner-v3-optimized | \
  node scripts/nhl/manual-log-from-scanner.mjs
```

### **Results not updating?**
```bash
# Manual update
node scripts/nhl/update-results.mjs
```

### **GitHub Action not running?**
```bash
# Check status
gh workflow view "NHL Daily Logger & Results"

# Manual trigger
gh workflow run "NHL Daily Logger & Results"
```

---

## ✅ Next 7 Days

**Your job:**
- ❌ Do nothing

**System's job:**
- ✅ Log picks daily (12pm ET)
- ✅ Update results daily (2am ET)
- ✅ Commit to Git automatically
- ✅ Collect 30-50 picks

**On Oct 22:**
- Run diagnostics
- Review `NHL_7_DAY_GAMEPLAN.md`
- Decide on V2 upgrade
- Consider adjustments (if needed)

---

## 📞 Quick Links

- **Repo:** https://github.com/bgoldman22-code/RRMODEL
- **Branch:** main41
- **Scanner:** https://bgroundrobin.com/.netlify/functions/nhl-sog-scanner-v3-optimized
- **Gameplan:** NHL_7_DAY_GAMEPLAN.md

---

**See you in 7 days!** 🏒✨
