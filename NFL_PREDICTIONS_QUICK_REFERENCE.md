# 🎯 NFL Predictions System - Quick Reference Card

**Deployment Date:** October 27, 2024  
**Branch:** main42  
**Status:** ✅ PRODUCTION LIVE

---

## 📋 WHAT'S DEPLOYED

### 1. Kelly Hybrid Staking (Commits fceee0d + b1e42d1)

**Caps:**
- Daily: **112.5U** (25% of 450U bankroll)
- Per-game: **15U** total (10U sides + 5U totals)
- Individual: **8U** ML/spread, **7.5U** elite totals

**CLV Gate:**
- Bets **>6U** require line movement + smart money
- Logged with `[CLV_PROXY]` prefix

**Enforcement:**
- Loop at line 3333 checks ALL bets
- Blocks violations BEFORE publishing
- Logged with `[EXPOSURE]` prefix

### 2. Depth Chart Intelligence (Commit 9d1e03c)

**Graded ProbPlay:**
- OUT: 0.0
- DOUBTFUL: 0.1 (QB), 0.2 (RB/WR/TE)
- QUESTIONABLE: 0.6 (QB), 0.7 (RB/WR/TE)
- ACTIVE: 0.95

**Snap Scaling:**
- QUESTIONABLE: 0.7× snaps
- DOUBTFUL: 0.5× snaps

**Role Recomposition:**
- WR1+WR2 OUT → WR3 becomes WR1
- Uses `filteredDepthList()` to exclude injured

**Usage Thresholds:**
- RB: 50%+ snapShare = starter
- WR: 22%+ teamTargetShare = starter
- TE: 15%+ teamTargetShare = starter

---

## 🔍 MONITORING CHECKLIST

### First Predictions Run

✅ **Kelly Enforcement:**
```bash
grep "\[EXPOSURE\]" logs.txt
# Expect: ✅ Daily total ≤112.5U
# Expect: ✅ Per-game total ≤15.0U
# Expect: ✅ Per-game sides ≤10.0U
```

✅ **CLV Proxy:**
```bash
grep "\[CLV_PROXY\]" logs.txt
# Expect: ✅ approval for >6U with line movement
# Expect: ❌ blocks for >6U without indicators
```

✅ **Depth Chart:**
```bash
grep "📊.*availability:" logs.txt
# Expect: probPlay in 0.0-0.95 range (not 0/1)
# Expect: snapScale for QUESTIONABLE players
```

✅ **Replacements:**
```bash
grep "replacement:" logs.txt
# Expect: Healthy players from filtered depth
# Expect: Role recomposition for multi-injuries
```

---

## 🚨 ALERT CONDITIONS

### Immediate Action Required

🔴 **Daily cap breach** (>112.5U)
→ Check logs: `grep "\[EXPOSURE\].*Daily cap exceeded" logs.txt`
→ Rollback: `git revert b1e42d1 && git push`

🔴 **Per-game cap breach** (>15.0U)
→ Check logs: `grep "\[EXPOSURE\].*Game cap exceeded" logs.txt`
→ Rollback: `git revert b1e42d1 && git push`

🔴 **Function errors**
→ Check: `grep "ERROR" logs.txt`
→ Rollback all: `git revert 9d1e03c b1e42d1 fceee0d && git push`

### Investigate (Non-Critical)

⚠️ **>6U bets with no CLV proxy**
→ Should be blocked, check CLV gate logic

⚠️ **Binary probPlay (0 or 1 only)**
→ Should be graded (0.0-0.95), check statusToProbPlay()

⚠️ **No snapScale for QUESTIONABLE**
→ Check expectedSnapScale() application

---

## 📊 LOG PATTERNS

### Success Examples

**Kelly Enforcement:**
```
[EXPOSURE] ✅ Daily total: 87.5U / 112.5U max (19% of bankroll)
[EXPOSURE] ✅ CHI@DET: 12.0U / 15.0U max (6U ML + 6U total)
```

**CLV Proxy:**
```
[CLV_PROXY] ✅ 7.5U bet approved - line moved SF -3 → -2.5, smart money 65%
```

**Depth Chart:**
```
QB replacement: Jayden Daniels (out, depth 1) → Marcus Mariota
📊 QB availability: probPlay=0.00, snapScale=1.00

WR replacement: Justin Jefferson (out, depth 1) → Malik Nabers
📊 WR availability: probPlay=0.00, snapScale=1.00

RB replacement: Bucky Irving (questionable, depth 1) → Rachaad White
📊 RB availability: probPlay=0.70, snapScale=0.70
```

### Violation Examples

**Kelly Violations:**
```
[EXPOSURE] ❌ Daily cap exceeded: 125.0U / 112.5U max
[EXPOSURE] ❌ NYG@PHI: 18.0U exceeds 15.0U cap - blocking 3.0U
[EXPOSURE] ❌ Sides cap exceeded: CHI@DET 12.0U / 10.0U max (ML + spread)
```

**CLV Violations:**
```
[CLV_PROXY] ❌ 7.0U bet blocked - no line movement, no smart money support
```

---

## 🔄 ROLLBACK COMMANDS

### Full Rollback (All Changes)
```bash
cd /Users/brentgoldman/Desktop/REPO33/RRMODEL
git revert 9d1e03c  # Depth chart
git revert b1e42d1  # Exposure enforcement
git revert fceee0d  # Kelly backend
git push
```

### Partial Rollback (Depth Chart Only)
```bash
git revert 9d1e03c
git push
```

### Partial Rollback (Exposure Enforcement Only)
```bash
git revert b1e42d1
git push
```

**Auto-deploy:** Netlify rebuilds in ~2 minutes

---

## 📈 SUCCESS CRITERIA

### Day 1 (First Slate)

✅ No cap breaches (daily ≤112.5U, per-game ≤15U)  
✅ CLV proxy enforced (>6U bets approved only with indicators)  
✅ Graded probPlay used (not binary)  
✅ Role recomposition working (multi-injury scenarios)  
✅ No function errors or crashes

### Week 1 (Multiple Slates)

✅ Consistent cap enforcement across all slates  
✅ Injury penalties applied for all starter injuries  
✅ Limited returns handled correctly (QUESTIONABLE players)  
✅ High-usage backups identified as starters  
✅ Clean logs (easy to debug/validate)

### Season (Long-term)

✅ Improved bankroll control (no over-exposure)  
✅ More accurate predictions (better injury modeling)  
✅ Scalable system (bankroll-relative caps)  
✅ Production stability (no rollbacks needed)

---

## 📞 QUICK CONTACTS

**For Issues:**
1. Check this quick reference card
2. Review `DEPLOYMENT_OCT27_COMPLETE.md` for detailed info
3. Review `BEFORE_AFTER_COMPARISON.md` for transformation details
4. Check logs with patterns above
5. If critical issue → rollback immediately

**For Enhancements:**
- Priority 2 backlog in `DEPLOYMENT_OCT27_COMPLETE.md`
- QB synergy, stale depth fallback, backtesting
- Estimated 4-6 hours, low risk

---

## 🎯 KEY FILES

**Modified:**
- `netlify/functions/_lib/kelly-hybrid-staking.mjs` (Kelly backend)
- `netlify/functions/nfl-predictions-generate/index.mjs` (Enforcement + depth chart)

**Documentation:**
- `DEPLOYMENT_OCT27_COMPLETE.md` (Detailed deployment guide)
- `BEFORE_AFTER_COMPARISON.md` (Transformation details)
- `NFL_PREDICTIONS_QUICK_REFERENCE.md` (This file)

**Commits:**
- `fceee0d`: Kelly backend refinements
- `b1e42d1`: 🔴 CRITICAL exposure enforcement loop
- `9d1e03c`: 🎯 Depth chart Priority 1 fixes

---

**All systems deployed. Monitor first slate. Good luck! 🍀**

---

*Quick Reference v1.0 - Oct 27, 2024*  
*Status: ✅ PRODUCTION LIVE*
