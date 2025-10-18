# 🎯 SURGICAL MODEL IMPROVEMENTS - Action Plan
**Date:** October 18, 2025  
**Status:** De-Risked, High-ROI Rollout

---

## 🚨 **IMMEDIATE (Today - 2 hours)**

### **1. Fix NFL Receiving Props Scanner (0 predictions showing)**

**Root Cause:**
- Elite scanner needs either real odds API or synthetic mode needs lower threshold
- Player database hardcoded to Week 7, needs current week data
- 58%+ prob threshold (5%+ edge vs -110) may be too high for synthetic mode

**Quick Fix Options:**

**Option A: Lower synthetic threshold temporarily (10 min)**
```javascript
// In nfl-receiving-scanner-elite.mjs line ~463
// Change from:
if (modelProb >= 0.58) { // 5%+ edge vs -110

// To:
if (modelProb >= 0.55) { // 2.5%+ edge vs -110 (testing mode)
```

**Option B: Enable real odds API (15 min)**
- Add `THEODDS_API_KEY` to Netlify environment variables
- Test with: `curl /.netlify/functions/nfl-receiving-scanner-elite`

**Option C: Switch to basic mock scanner (5 min)**
- Frontend change: Call `/nfl-receiving-scanner` instead of `/nfl-receiving-scanner-elite`
- Shows working predictions immediately (mock data but proves UI works)

**Acceptance Criteria:**
- At least 20-35 predictions showing on frontend
- Edge calculations displaying correctly
- Kelly sizing showing (even if 0 for mock data)

---

## 📅 **WEEK 1 (Days 1-3): High-Signal, Low-Risk Upgrades**

### **Day 1: NBA Dynamic Minutes Model** ⭐ **HIGHEST ROI**

**Impact:** -0.15 to -0.30 MAE on player props, -0.10 on team spreads/totals

**Implementation:**
```javascript
// netlify/functions/_lib/nba/minutes-model.mjs

function predictMinutes(player, gameContext) {
  const baseline = player.L10_minutes_avg;
  
  // 1. Injury status adjustment
  const injuryMult = {
    'Out': 0,
    'Doubtful': 0.15,
    'Questionable': 0.85,
    'Probable': 0.95,
    'GTD': 0.90,
    'Healthy': 1.0
  }[player.injury_status] || 1.0;
  
  // 2. Back-to-back penalty
  const b2bPenalty = gameContext.is_back_to_back ? 0.88 : 1.0; // -12% mins
  
  // 3. Blowout risk (from spread model)
  const blowoutRisk = Math.abs(gameContext.predicted_spread) > 12 ? 0.90 : 1.0;
  
  // 4. Coach rotation tendency (team-specific)
  const coachFactor = COACH_ROTATION_MAP[player.team] || 1.0;
  
  return baseline * injuryMult * b2bPenalty * blowoutRisk * coachFactor;
}
```

**Data Sources:**
- Injury status: NBA API official injury report
- B2B detection: Schedule parser (already have)
- Predicted spread: Your existing spread model
- Coach tendencies: Manually coded per team (30 teams)

**Guardrails:**
- Cap individual adjustment ≤ 20%
- Combined cap ≤ 35%
- Log delta_minutes for each adjustment
- Kill switch: Disable if MAE increases >0.15 for 3 consecutive days

**Acceptance Criteria:**
- MAE improvement: -0.15 minimum
- CLV improvement: +0.5%
- No degradation on healthy/normal games

---

### **Day 2: NHL Line Combinations + PP Unit Tracking**

**Impact:** -0.03 to -0.07 SOG MAE, +0.5-1.5% CLV

**Implementation:**
```javascript
// netlify/functions/_lib/nhl-line-chemistry.mjs

function applyLineChemistry(baseSOG, player, lineInfo) {
  const gamesWithCurrentLine = lineInfo.games_together || 0;
  
  // Chemistry ramp-up
  if (gamesWithCurrentLine === 0) {
    return baseSOG * 0.85; // -15% new line penalty
  } else if (gamesWithCurrentLine <= 3) {
    return baseSOG * 0.92; // -8% building chemistry
  } else if (gamesWithCurrentLine >= 10 && lineInfo.hot_streak) {
    return baseSOG * 1.08; // +8% chemistry bonus
  }
  
  return baseSOG; // Normal
}

function applyPPUnit(baseSOG, player, ppInfo) {
  if (player.pp_unit === 'PP1') {
    return baseSOG * 1.12; // +12% for PP1 deployment
  } else if (player.pp_unit === 'PP2') {
    return baseSOG * 1.04; // +4% for PP2
  }
  return baseSOG;
}
```

**Data Sources:**
- Daily Hockey (free scraper for line combos)
- NHL API (roster changes)
- Manual PP unit tracking (update weekly)

**Guardrails:**
- Max chemistry adjustment: ±15%
- Log line_id, games_together, pp_unit
- Track hit rate by chemistry tier

**Acceptance Criteria:**
- SOG MAE: -0.05 minimum
- New line games: Avoid false confidence
- PP1 players: Higher hit rate on OVER

---

### **Day 3: NHL Goalie Matchup Model (Simple)**

**Impact:** -0.02 to -0.04 SOG adjustment, +0.3-0.5% CLV

**Implementation:**
```javascript
function adjustForGoalie(oppTeamSOG, goalieInfo) {
  const saveRate = goalieInfo.L10_save_pct;
  const reboundRate = goalieInfo.L10_rebound_pct;
  
  // Bad goalie = more shots (team presses)
  if (saveRate < 0.900) {
    return oppTeamSOG * 1.05; // +5% more shots against weak goalie
  }
  
  // Hot goalie = fewer shots (team frustrated)
  if (saveRate > 0.925 && goalieInfo.L3_wins >= 2) {
    return oppTeamSOG * 0.97; // -3% fewer shots
  }
  
  return oppTeamSOG;
}
```

**Guardrails:**
- Cap at ±5% (don't double-count team defense)
- Log goalie_id, save_pct, adjustment
- Kill switch if degrades overall MAE

---

## 📅 **WEEK 2 (Days 4-7): Infrastructure + Logging**

### **Day 4-5: Real-Time Odds Logging**

**Why:** Prove CLV before trusting edge calculations

**Implementation:**
```javascript
// Log structure per bet opportunity
{
  timestamp: '2025-10-18T19:30:00Z',
  sport: 'NBA',
  market: 'spread',
  team: 'LAL',
  line_open: -5.5,
  odds_open: -110,
  line_current: -6.0,
  odds_current: -108,
  line_close: -6.5,  // Fill post-game
  odds_close: -112,  // Fill post-game
  model_edge_open: 0.042,
  model_edge_close: 0.028,
  clv: -0.014,  // Negative CLV = bad
  result: 'W',
  roi: 0.909
}
```

**Acceptance Criteria:**
- CLV ≥ +0.5% overall after 7-10 days
- If CLV negative, DO NOT increase bet sizing

---

### **Day 6-7: Module Toggles + A/B Framework**

**Implementation:**
```javascript
// Feature flags per module
const FEATURE_FLAGS = {
  NBA_MINUTES_V1: true,
  NBA_PACE_ADJUST: false,
  NHL_LINE_CHEMISTRY: true,
  NHL_GOALIE_ADJUST: true,
  NFL_INJURY_CASCADE: false,
  NFL_WEATHER_ADJUST: false
};

// Per-module metrics
function trackModulePerformance(module, predictions) {
  return {
    module,
    mae: calculateMAE(predictions),
    hit_rate: predictions.filter(p => p.hit).length / predictions.length,
    clv: calculateCLV(predictions),
    roi: calculateROI(predictions),
    sample_size: predictions.length
  };
}
```

---

## 📅 **WEEK 3 (Days 8-14): Expand Winners, Kill Losers**

### **Day 8-10: NBA Pace Model (Lite Version)**

**Only if Minutes model proves successful (MAE -0.15+, CLV +0.5%+)**

```javascript
function predictGamePace(homeTeam, awayTeam, gameContext) {
  // Simple weighted average
  const basePace = (homeTeam.L10_pace * 0.55 + awayTeam.L10_pace * 0.45);
  
  // B2B fatigue penalty
  const fatigueAdj = (homeTeam.is_b2b || awayTeam.is_b2b) ? 0.97 : 1.0;
  
  // Blowout potential increases pace
  const blowoutAdj = Math.abs(gameContext.predicted_spread) > 10 ? 1.02 : 1.0;
  
  return basePace * fatigueAdj * blowoutAdj;
}
```

**Guardrails:**
- Cap pace adjustment at ±3 possessions
- Track pace prediction error separately
- Kill if doesn't improve total predictions

---

### **Day 11-12: NFL Weather Adjustments (Low-Hanging Fruit)**

**Impact:** +1-2% on passing props in bad weather games

```javascript
function adjustForWeather(baseYards, weather) {
  // Wind threshold
  if (weather.wind_mph > 15) {
    return baseYards * 0.92; // -8% passing yards in high wind
  }
  
  // Heavy precipitation
  if (weather.precip_probability > 70 && weather.precip_type === 'rain') {
    return baseYards * 0.95; // -5% in heavy rain
  }
  
  // Snow
  if (weather.precip_type === 'snow') {
    return baseYards * 0.88; // -12% in snow
  }
  
  return baseYards; // Dome or good conditions
}
```

**Data Source:** OpenWeather API (free tier sufficient)

---

### **Day 13-14: NFL Injury Target Redistribution (Templates)**

**⚠️ SEPARATE from canonical injury system (per your requirement)**

**Implementation:**
```javascript
// Build team-specific redistribution templates
const REDISTRIBUTION_TEMPLATES = {
  'DAL': {
    'WR1_out': { 'WR2': 0.55, 'TE1': 0.25, 'RB1': 0.20 },
    'TE1_out': { 'WR1': 0.40, 'WR2': 0.35, 'TE2': 0.25 }
  },
  // ... per team
};

function redistributeTargets(team, injuredPlayer, availableTargets) {
  const template = REDISTRIBUTION_TEMPLATES[team]?.[injuredPlayer.role];
  
  if (!template) {
    // Fallback: naive even split
    return distributeEvenly(availableTargets);
  }
  
  // Apply learned template with shrinkage
  return applyTemplateWithShrinkage(template, availableTargets, 0.7);
}
```

**Data Source:** Historical snap/route/target data from 2023-2024 injuries

**Guardrails:**
- Only activate on confirmed OUT players
- Cap redistribution at +30% per player
- Track "injury game" performance separately
- Must not degrade healthy game predictions

---

## 🚫 **DEFER (Too Risky / Not Worth It Yet)**

### ❌ **NFL: Quarterly Game Flow Model**
**Why:** Needs play-by-play simulator, high leakage risk, complex
**Alternative:** Simple pass-rate by spread bucket (trailing team passes more)

### ❌ **NFL: CB1 vs WR1 Coverage Matchups**
**Why:** Requires premium data (PFF $$$), alignment tracking unreliable
**Alternative:** Crude slot vs perimeter target share (free data)

### ❌ **NBA: Rest Probability / Load Management Predictor**
**Why:** Binary prediction too risky; use to widen uncertainty instead
**Alternative:** Haircut confidence on B2B + end-of-road-trip

### ❌ **NHL: Game-State SOG Model (trailing/OT)**
**Why:** Needs live data feed, pre-game guessing adds variance
**Alternative:** Post-game analysis only

### ❌ **Public Betting % Integration**
**Why:** Data often stale/laggy, collinear with line movement
**Alternative:** Use for post-hoc analysis, not decisioning

---

## 📊 **SUCCESS METRICS (Weekly Reviews)**

### **Module Performance Thresholds**

| Module | Min MAE Δ | Min CLV | Min Hit % | Min ROI | Kill If |
|--------|-----------|---------|-----------|---------|---------|
| NBA Minutes | -0.15 | +0.5% | 52% | +2% | Degrades 3 days |
| NHL Line/PP | -0.05 | +0.5% | 54% | +3% | MAE +0.10 |
| NHL Goalie | -0.02 | +0.3% | 53% | +1.5% | ROI negative |
| NFL Weather | N/A | +0.3% | 53% | +2% | Sample <20 |
| NFL Injury Cascade | -3.0 yards | +1.0% | 54% | +4% | Healthy games worse |

### **Portfolio Metrics**

- **Overall CLV:** Must be ≥ +0.5% 
- **If CLV negative:** DO NOT increase unit sizes
- **Max drawdown:** -15 units triggers review
- **Daily MAE:** Track vs baseline (no modules)

---

## 🔥 **YOUR IMMEDIATE NEXT STEPS**

1. **Right now (15 min):** Lower threshold in nfl-receiving-scanner-elite.mjs OR enable basic mock scanner
2. **Today (2 hours):** Get predictions showing on frontend, validate UI works
3. **Monday:** Start NBA minutes model (highest ROI)
4. **Tuesday-Wednesday:** NHL line chemistry + goalie model
5. **Thursday-Friday:** Odds logging infrastructure + module toggles
6. **Week 2 review:** Kill losers, scale winners

---

## 💡 **Key Principles**

1. ✅ **Ship thin slices** - Each module isolated, toggleable, measurable
2. ✅ **Prove with CLV first** - Edge claims mean nothing without closing line value
3. ✅ **Cap everything** - No single adjustment >20%, combined <35%
4. ✅ **Kill switches** - Auto-disable if degrades performance for 3 days
5. ✅ **Avoid leakage** - Every feature provably available at prediction time
6. ✅ **Log everything** - Can't improve what you don't measure

**Most important:** Don't optimize for "cool features." Optimize for **ROI and CLV**. If it doesn't beat closing lines, it doesn't matter how sophisticated it is.
