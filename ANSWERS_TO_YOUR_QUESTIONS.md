# 🎯 Direct Answers to Your Questions

**Date:** October 18, 2025

---

## **Q1: NBA - Did you look at game predictions or just props?**

**A:** I looked at **game predictions** (spreads & totals), **NOT props**.

Your NBA system has:
- ✅ Elite ensemble models for spreads (11.606 MAE)
- ✅ Total predictions (14.691 MAE)
- ✅ Win probability calculations
- ❌ **NO player props implemented yet**

You have a planning doc (`NBA_PLAYER_PROPS_CHECKPOINT.md`) but the props models aren't built. The improvements I suggested (dynamic minutes, pace) apply to **both** game predictions AND will be the foundation for when you build props.

---

## **Q2: What are the MOST effective and lowest lift first things to do?**

**Ranked by ROI/Effort ratio:**

### **🥇 #1: Fix NFL Receiving Scanner (15 minutes - DONE)**
**Why:** It's outputting 0 predictions because threshold is too high in synthetic mode.  
**What I did:** Lowered synthetic edge threshold from 5% to 2.5% (line 463 & 568 in nfl-receiving-scanner-elite.mjs)  
**Expected result:** 20-35 predictions should now show on frontend

### **🥈 #2: NBA Dynamic Minutes Model (2-3 hours)**
**Impact:** -0.15 to -0.30 MAE (BIGGEST bang for buck)  
**Why easy:** 
- Data already available (injury reports, schedule, spread model)
- Simple multipliers (B2B = 0.88, Questionable = 0.85, etc.)
- No complex ML needed
- Immediate impact on both spreads AND totals

**Where it helps:**
- Player out/limited = their stats redistributed correctly
- Affects team totals directly (fewer possessions = lower total)
- Affects spreads (star sitting 4th quarter in blowout)

### **🥉 #3: NHL Line Chemistry + PP Units (3-4 hours)**
**Impact:** -0.03 to -0.07 SOG MAE, +0.5-1.5% CLV  
**Why easy:**
- Simple multipliers: New line = 0.85x, PP1 = 1.12x
- Data available from Daily Hockey (free scraper)
- Low complexity, high signal

### **4️⃣ #4: NFL Weather Adjustments (1-2 hours)**
**Impact:** +1-2% on bad weather games  
**Why easy:**
- OpenWeather API (free)
- Wind >15mph = 0.92x, Rain = 0.95x, Snow = 0.88x
- Clear signal, proven edge
- Only affects ~10-15 games per season but those games matter

---

## **Q3: NFL injury/depth chart changes - make sense to keep separate?**

**A:** **YES, 100% agree.** Here's why and how:

### **Why Keep Separate:**
1. **Canonical system = game predictions** (spreads/totals for NFL games)
2. **Receiving props = player-level** (needs different redistribution logic)
3. **Don't want to risk breaking** what's working for game predictions

### **How to Implement Separately:**

**Option A: New module just for props**
```javascript
// netlify/functions/_lib/nfl-receiving-props-injuries.mjs

// This ONLY affects receiving props, not game model
function redistributeTargetsForProps(team, injuredPlayer, week) {
  // Use templates learned from historical data
  const template = PROP_REDISTRIBUTION[team]?.[injuredPlayer.role];
  
  // Example: DAL WR1 (CeeDee) out
  // WR2 (Tolbert) gets +4 targets
  // TE1 (Ferguson) gets +2 targets
  // RB1 (Pollard) gets +1.5 targets
  
  return applyTemplate(template);
}
```

**Option B: Flag in the data pipeline**
```javascript
// When calling receiving props model
const options = {
  useCanonicalInjuries: false,  // Don't use game model injuries
  usePropsInjuries: true,        // Use props-specific redistribution
  redistributionSource: 'learned_templates'
};
```

### **What NOT to touch:**
- ❌ Don't modify `canonical-availability-v5.mjs`
- ❌ Don't change game prediction injury system
- ❌ Don't share redistribution logic between systems

### **What TO build (later, not now):**
```
Phase 1 (NOW): Get receiving scanner working with basic data
Phase 2 (Week 3-4): Add simple templates for obvious cases
  - WR1 out → WR2 +40%, TE +20%, everyone else +40%
Phase 3 (Month 2): Build learned templates from historical injuries
  - Scrape 2023-2024 injury games
  - Build per-team, per-role redistribution matrices
  - Account for coach tendencies
```

---

## **Q4: Do you agree/disagree with the GPT feedback?**

**I agree with 90% of it. Here's where I stand:**

### **✅ AGREE:**
1. **NBA minutes = highest ROI** - Absolutely, do this first
2. **Thin slices + kill switches** - Critical for not blowing things up
3. **Prove with CLV before trusting edge** - This is THE metric
4. **Cap adjustments** - Prevents overfitting and blowups
5. **Defer CB1/WR1 matchups** - Too expensive, too noisy without PFF data
6. **Defer quarterly game flow** - Too complex, too risky for v1

### **✅ ALSO AGREE:**
- Public % is laggy/noisy - skip for now
- NHL game-state needs live data - defer
- Portfolio Kelly is good but start with 0.25x or 0.5x fractional

### **⚠️ PARTIAL AGREEMENT:**
1. **"2-4% ROI easy"** - Possible but not guaranteed. Need to prove with CLV first.
2. **NFL injury cascade complexity** - I think simple templates (Option A) are lower risk than GPT suggests, but agree to start simple.

### **❌ MINOR DISAGREEMENT:**
- **NHL goalie adjustment** - GPT says defer complex, I say do simple version (±3-5% adjustment based on save%). Very low risk, medium signal.

---

## **Q5: Knowing everything, what's next to work on?**

### **TODAY (next 2 hours):**

**1. Test the NFL receiving fix I just made (5 min)**
```bash
# Redeploy to Netlify or test locally
netlify dev

# Visit frontend
open http://localhost:8888/nfl-receiving-props

# Should see 20-35 predictions now instead of 0
```

**2. If still 0 predictions, check logs (10 min)**
```bash
# Check Netlify function logs
netlify functions:log nfl-receiving-scanner-elite

# Look for errors or empty player DB warnings
```

**3. Alternative: Enable basic mock scanner (5 min)**
If elite scanner still broken, quick fix:
```javascript
// In src/pages/NFLReceivingProps.jsx line 21
// Change from:
const response = await fetch('/.netlify/functions/nfl-receiving-scanner-elite');

// To:
const response = await fetch('/.netlify/functions/nfl-receiving-scanner');
```

This will show mock predictions immediately and prove UI works.

---

### **MONDAY (Day 1 of Week 1):**

**Build NBA Dynamic Minutes Model (3-4 hours)**

File: `netlify/functions/_lib/nba/minutes-predictor.mjs`

```javascript
// Simple but powerful
export function predictMinutes(player, gameContext) {
  const baseline = player.L10_minutes_avg || 28; // Fallback
  
  let adjustment = 1.0;
  
  // 1. Injury status (BIGGEST impact)
  const injuryMultiplier = {
    'Out': 0,
    'Doubtful': 0.15,
    'Questionable': 0.85,
    'Probable': 0.95,
    'GTD': 0.90
  }[player.injury_status] || 1.0;
  
  // 2. Back-to-back
  if (gameContext.is_back_to_back) {
    adjustment *= 0.88; // Stars lose 3-4 minutes on B2B
  }
  
  // 3. Blowout risk
  if (Math.abs(gameContext.predicted_spread) > 12) {
    adjustment *= 0.90; // Starters sit 4th quarter
  }
  
  // 4. 3-in-4 or 4-in-6 fatigue
  if (gameContext.games_in_last_4_days >= 3) {
    adjustment *= 0.94;
  }
  
  return baseline * injuryMultiplier * adjustment;
}
```

**Integration points:**
- Call before building feature vectors in `predict-elite.mjs`
- Adjust team pace calculations (fewer minutes = different rotation)
- Log `delta_minutes` for tracking

**Acceptance test:**
- Manually check 10 recent B2B games
- Did stars play ~3-4 fewer minutes? (Should match)
- Check injured player games (should be 0 or limited)

---

### **TUESDAY (Day 2 of Week 1):**

**Build NHL Line Chemistry Model (2-3 hours)**

File: `netlify/functions/_lib/nhl-line-chemistry.mjs`

```javascript
export function applyLineChemistry(baseSOG, player, lineInfo) {
  // Track games with current linemates
  const gamesWithLine = lineInfo.games_together || 0;
  
  if (gamesWithLine === 0) {
    return baseSOG * 0.85; // -15% new line penalty
  } else if (gamesWithLine <= 3) {
    return baseSOG * 0.92; // -8% building chemistry
  } else if (gamesWithLine >= 10 && lineInfo.hot_streak) {
    return baseSOG * 1.08; // +8% hot line bonus
  }
  
  return baseSOG;
}

export function applyPPUnit(baseSOG, player) {
  if (player.pp_unit === 'PP1') {
    return baseSOG * 1.12; // PP1 boost
  } else if (player.pp_unit === 'PP2') {
    return baseSOG * 1.04; // PP2 modest boost
  }
  return baseSOG;
}
```

**Data source:** Daily Hockey scraper or manual updates

---

### **WEDNESDAY (Day 3 of Week 1):**

**Build NHL Goalie Adjustment (1-2 hours)**

```javascript
export function adjustForGoalie(baseSOG, goalieInfo) {
  const save_pct = goalieInfo.L10_save_pct;
  
  // Bad goalie = team presses more
  if (save_pct < 0.900) {
    return baseSOG * 1.05;
  }
  
  // Hot goalie = team frustrated
  if (save_pct > 0.925) {
    return baseSOG * 0.97;
  }
  
  return baseSOG;
}
```

---

### **THURSDAY-FRIDAY (Days 4-5):**

**Build Odds Logging Infrastructure**

This is CRITICAL - you need to prove CLV before trusting any edges.

```javascript
// Track every bet opportunity
{
  timestamp: now,
  sport: 'NBA',
  model_edge: 0.042,
  line_open: -5.5,
  line_close: -6.5,  // Fill after game
  clv: -0.014,       // Closing line value
  result: 'W',
  roi: 0.909
}
```

**After 7-10 days:**
- If CLV positive (+0.5% or more): Trust the model
- If CLV negative: Model is wrong, don't increase units
- If CLV near zero: Need more data

---

## **🎯 TL;DR - DO THIS IN ORDER:**

1. ✅ **TODAY:** Test NFL receiving fix (should see predictions now)
2. **MONDAY:** NBA minutes model (highest ROI, 3-4 hours)
3. **TUESDAY:** NHL line chemistry (medium ROI, 2-3 hours)
4. **WEDNESDAY:** NHL goalie adjustment (quick win, 1-2 hours)
5. **THURSDAY-FRIDAY:** Odds logging (prove CLV)
6. **NEXT WEEK:** Review metrics, kill what doesn't work, scale what does

**Most important:** Don't build cool features. Build features that **beat closing lines**. If it doesn't show +CLV, it doesn't matter how sophisticated it is.

---

## **Final Note:**

Your models are already solid. The GPT feedback is right that many "obvious" improvements are actually traps (quarterly game flow, CB matchups, public %, etc.). 

The **real edge** comes from:
1. Dynamic factors Vegas is slow to adjust (minutes, line combos, weather)
2. Proving everything with CLV before trusting it
3. Small, capped, killable modules
4. Discipline to turn things OFF when they don't work

**You're not trying to build the smartest model. You're trying to build the model that beats closing lines.**
