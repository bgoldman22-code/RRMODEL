# Edge Case Analysis: Backups Playing & Benched Starters

## 🎯 **Your Questions**

1. **"What happens when a backup plays a bunch of weeks but is STILL actually a backup?"**
2. **"What about a starter who gets benched (not injured)?"**
3. **"Will injury reports fix the labeling issue going forward?"**

---

## 📊 **Test Case: NYG QB Situation**

### **Scenario: Russell Wilson Benched for Jaxson Dart**

| Week | Russell Wilson | Jaxson Dart | What Happened |
|------|----------------|-------------|---------------|
| 2 | QB1 | QB2 | Russell started season as QB1 |
| 3 | QB2 | QB1 | **Russell BENCHED**, Jaxson takes over |
| 4-8 | QB2 | QB1 | Jaxson remains starter |

**Context:** Russell Wilson started week 2, then was benched (not injured) for performance. Jaxson Dart took over as starter.

---

## ✅ **What HAD System Does (Current Behavior)**

### **Russell Wilson (Benched Starter)**
```json
{
  "name": "Russell Wilson",
  "healthyAverageDepth": 2,  // ← MANUAL BASELINE says QB2
  "calculatedHAD": 2,         // Weeks 2-8 avg = (1 + 2+2+2+2+2+2) / 7 = 1.86 → 2
  "sampleSize": 7,
  "confidence": "manual",
  "depthSource": "manual_baseline",
  "manualOverride": true,     // ← Manual baseline WINS
  "currentDepth": 2,
  "healthyWeeks": [
    {"week": "week2", "depth": 1},  // Started once
    {"week": "week3", "depth": 2},  // Benched weeks 3-8
    ...
    {"week": "week8", "depth": 2}
  ]
}
```

**✅ CORRECT:** HAD = QB2 (manual baseline correctly says he's the backup)

### **Jaxson Dart (Backup Who Became Starter)**
```json
{
  "name": "Jaxson Dart",
  "healthyAverageDepth": 1,   // ← MANUAL BASELINE says QB1
  "calculatedHAD": 1,          // Weeks 2-8 avg = (2 + 1+1+1+1+1+1) / 7 = 1.14 → 1
  "sampleSize": 7,
  "confidence": "manual",
  "depthSource": "manual_baseline",
  "manualOverride": true,      // ← Manual baseline WINS
  "currentDepth": 1,
  "healthyWeeks": [
    {"week": "week2", "depth": 2},  // Backup once
    {"week": "week3", "depth": 1},  // Starter weeks 3-8
    ...
    {"week": "week8", "depth": 1}
  ]
}
```

**✅ CORRECT:** HAD = QB1 (manual baseline correctly says he's the true starter)

---

## 🧠 **How Manual Baseline Solves This**

### **The Problem:**
- **Calculated HAD alone would fail:**
  - Russell Wilson: (1 week at QB1 + 6 weeks at QB2) / 7 = 1.86 → rounds to QB2 ✅
  - Jaxson Dart: (1 week at QB2 + 6 weeks at QB1) / 7 = 1.14 → rounds to QB1 ✅

Actually, in this case calculated HAD would work! But let's look at a trickier case...

### **Trickier Example: Cooper Rush (DAL backup who played 5 games)**

**Hypothetical scenario:**
- Dak Prescott injured weeks 3-7 (5 weeks)
- Cooper Rush starts weeks 3-7 at QB1
- Dak returns week 8 at QB1

**Calculated HAD would say:**
- Cooper Rush: (5 weeks QB1 + 3 weeks QB2) / 8 = 1.375 → rounds to QB1 ❌ **WRONG**
- Cooper is STILL the backup, just filled in temporarily

**Manual Baseline fixes this:**
```json
"Dallas Cowboys": {
  "QB": ["Dak Prescott", "Cooper Rush"]
}
```

**Result:**
- Cooper Rush HAD = **QB2** (manual baseline overrides calculated 1.375)
- If Cooper Rush gets injured while starting → use QB2 replacement impact (not QB1)

---

## 🚨 **The Key Insight**

### **Manual Baseline Prevents Two Errors:**

#### **Error 1: Backup who plays a lot → incorrectly promoted to "true starter"**
```
❌ Cooper Rush plays 5 weeks at QB1 → HAD says "he's the starter now"
✅ Manual baseline says "he's QB2, just filling in"
```

#### **Error 2: Starter who gets benched → incorrectly demoted to "backup"**
```
❌ Russell Wilson benched after 1 week → HAD says "he was never the starter"
✅ Manual baseline says "he's QB2 now, Jaxson is QB1"
```

---

## 🔧 **Will Injury Reports Fix the Labeling?**

### **Short Answer: YES, for injury status. NO, for depth.**

### **What Injury Reports WILL Fix:**
```javascript
// Current: Everything defaults to "active"
{
  "week": "week6",
  "depth": 3,
  "status": "active"  // ❌ WRONG if Bucky is injured
}

// With injury reports integrated:
{
  "week": "week6",
  "depth": 3,
  "status": "out"  // ✅ CORRECT - explicitly injured
}
```

**Benefit:** We don't have to INFER injury from depth drops - we KNOW the status.

### **What Injury Reports WON'T Fix:**
```javascript
// Cooper Rush playing while Dak injured
{
  "name": "Cooper Rush",
  "week": "week5",
  "depth": 1,        // ← Depth chart shows QB1 (he's starting)
  "status": "active" // ← Injury report says "active" (he's healthy)
}

// Problem: He's at QB1 on depth chart, active on injury report
// BUT: He's not the "true starter" - just filling in
```

**Injury reports tell us:** "Who's hurt?"  
**They DON'T tell us:** "Who's the true starter when healthy?"

---

## ✅ **The Solution: Manual Baseline + Injury Reports**

### **Combined System:**

1. **Manual Baseline** → Source of truth for "true depth when everyone healthy"
2. **Injury Reports** → Accurate status (out/doubtful/questionable/active)
3. **Depth Charts** → Current game-day reality
4. **HAD Calculator** → Combines all three

### **Example: Cooper Rush Scenario with Full Integration**

```javascript
// Week 5 (Dak injured, Cooper starting)
{
  // From manual baseline
  trueDepth: 2,  // Cooper is QB2 when everyone healthy
  
  // From injury report
  status: "active",  // Cooper is healthy
  
  // From depth chart
  currentDepth: 1,  // Cooper is starting this week
  
  // HAD calculation
  healthyAverageDepth: 2,  // Manual baseline wins
  
  // Impact calculation
  // If Cooper gets injured → use QB2 replacement (not QB1)
  // Because his TRUE depth is 2, even though he's currently starting
}
```

---

## 📋 **Updated HAD Calculator Integration Plan**

### **Phase 1: Current (v1)** ✅
- Manual baseline (source of truth)
- Depth chart tracking
- Depth-drop injury inference
- **Status:** All defaulted to "active"

### **Phase 2: Add Injury Reports (v1.1)** 🔄
```javascript
// Load weekly injury reports
const injuryReports = loadInjuryReports(week);

// Pass to HAD calculator
function getPlayerStatus(team, playerName, position, week, weeklyInjuries) {
  // PRIORITY 1: Explicit injury report
  if (weeklyInjuries[week]?.[team]) {
    const injury = weeklyInjuries[week][team].find(p => p.name === playerName);
    if (injury) {
      return injury.status;  // 'out', 'doubtful', 'questionable', 'active'
    }
  }
  
  // PRIORITY 2: Infer from depth drop (fallback)
  // ... existing depth-drop inference logic
  
  // PRIORITY 3: Default
  return 'active';
}
```

**Benefit:**
- ✅ Accurate injury status (not inferred)
- ✅ Catch cases where depth chart lags injury report
- ✅ Still works if injury report unavailable (depth-drop fallback)

### **Phase 3: Validation (v1.2)**
```javascript
// Validate: Does depth drop match injury status?
if (status === 'out' && currentDepth === previousDepth) {
  console.warn(`⚠️ ${playerName} is OUT but depth unchanged - possible stale depth chart`);
}

if (status === 'active' && currentDepth > previousDepth + 2) {
  console.warn(`⚠️ ${playerName} is ACTIVE but depth dropped 2+ spots - possible injury not reported`);
}
```

**Benefit:** Cross-validation catches data quality issues

---

## 🎯 **Answers to Your Questions**

### **Q1: "What happens when a backup plays a bunch of weeks but is STILL actually a backup?"**

**A:** Manual baseline prevents over-correction.

**Example:** Cooper Rush plays 5 weeks filling in for Dak
- Calculated HAD: 1.375 (would say QB1)
- **Manual baseline: QB2** ← WINS
- Result: HAD = QB2 (correct)

**Why it matters:**
- If Cooper gets injured while starting → use QB2 replacement impact
- Don't over-value his injury just because he played a lot

---

### **Q2: "What about a starter who gets benched (not injured)?"**

**A:** Manual baseline defines current reality, not historical.

**Example:** Russell Wilson benched after week 2
- Manual baseline: **["Jaxson Dart", "Russell Wilson"]** ← Jaxson is QB1 NOW
- Calculated HAD: Russell 1.86 → 2, Jaxson 1.14 → 1
- Result: Both correctly classified

**Why it matters:**
- If Russell gets injured now → use QB2 replacement impact
- Don't over-value his injury - he's not the starter anymore

---

### **Q3: "Will injury reports fix the labeling issue?"**

**A:** Partially. They fix STATUS (out/active), but not TRUE DEPTH.

| Data Source | What It Tells Us | What It Doesn't |
|-------------|------------------|-----------------|
| **Injury Report** | Who's hurt right now | Who's the true starter |
| **Depth Chart** | Who's starting this week | Who would start when everyone healthy |
| **Manual Baseline** | True depth when healthy | Current injury status |
| **HAD (all 3)** | Everything ✅ | - |

**With injury reports integrated:**
```javascript
{
  status: "out",              // ← From injury report (NEW)
  currentDepth: 3,            // ← From depth chart
  healthyAverageDepth: 1,     // ← From manual baseline + calculation
  
  // HAD says: "True starter (HAD=1), currently injured (status=out), 
  //            depth chart adjusted to RB3"
}
```

**Perfect combination:** All three data sources working together.

---

## 🚀 **Implementation Plan**

### **v1 (Shipping Now)** ✅
- Manual baseline (32 teams, all positions)
- Depth chart tracking (weeks 1-8)
- Depth-drop injury inference
- No injury report integration yet

### **v1.1 (Next Week)** 🔄
- Integrate injury report data
- Priority: Injury report > depth-drop > default
- Cross-validation (depth drop should match injury status)

### **v1.2 (Week After)**
- Add anomaly detection
- Flag mismatches (injured but depth unchanged, etc.)
- Log for manual review

---

## ✅ **Bottom Line**

**Your edge cases are EXACTLY why we built manual baseline:**

1. **Backup plays a lot** → Manual baseline keeps them as backup
2. **Starter gets benched** → Manual baseline updated to reflect new reality
3. **Injury reports** → Add accurate status, but don't replace manual baseline

**The system handles both cases correctly** because manual baseline is the source of truth for "true depth", not calculated average.

**Next step:** Integrate injury reports to replace depth-drop inference with explicit status. But v1 already works without them!
