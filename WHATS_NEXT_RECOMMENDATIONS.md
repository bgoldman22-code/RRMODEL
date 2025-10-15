# What's Next? - Project Priority Recommendations

**Date:** October 15, 2025  
**Current Status:** NHL live, NBA preseason, NFL Week 7 ongoing

---

## 🎯 Option 1: NBA Player Props (HIGHEST ROI POTENTIAL) ⭐⭐⭐⭐⭐

**Why This First:**
- 🏀 NBA regular season starts **October 22** (7 days away)
- 📊 Player props = **highest volume market** (Points/Rebounds/Assists/3PT)
- 💰 **Softer lines** than game totals (books struggle with player variance)
- 🔄 **Daily action** (82-game season, multiple games per night)
- 📈 Similar to your NHL SOG success (player-level projections)

**What You'd Build:**
```
NBA Player Props Scanner
├─ Points Over/Under (e.g., LeBron O/U 25.5 pts)
├─ Rebounds Over/Under (e.g., AD O/U 11.5 rebs)
├─ Assists Over/Under (e.g., CP3 O/U 7.5 ast)
├─ 3-Pointers Made (e.g., Curry O/U 4.5 threes)
├─ Points + Rebounds + Assists (PRA combos)
└─ Same Game Parlays (correlated props)
```

**Model Approach:**
- Use existing NBA data pipeline (games_2024_25.json)
- Player-level projections (L10 stats, usage rate, pace, matchup)
- Injury adjustments (already built for game props)
- Minutes projections (key for props)
- Opponent defensive ratings by position

**Timeline:** 5-7 days (before Oct 22 opener)

**Risk:** Moderate (new model training required)

---

## 🎯 Option 2: NHL Logging System (QUICK WIN) ⭐⭐⭐⭐

**Why This First:**
- ✅ **Already built** - just needs activation
- 📊 NHL picks generating daily (8 logged manually today)
- 🤖 GitHub Action ready (auto-logs at 12pm ET)
- 🎲 **Low risk, immediate value** - track real performance
- 📈 7-day gameplan in place (review Oct 22)

**What You'd Do:**
1. Verify GitHub Action running tomorrow (Oct 16 12pm ET)
2. Check CSV populates: `data/nhl/logs/predictions_2024-25.csv`
3. Monitor auto-evaluation (2am ET daily)
4. Wait for Day 7 review (Oct 22)
5. Decide V1 vs V2 upgrade based on performance

**Timeline:** 1 hour setup verification, then automatic

**Risk:** Very Low (infrastructure exists)

---

## 🎯 Option 3: NFL Game Props Logging (MEDIUM PRIORITY) ⭐⭐⭐

**Why This:**
- 🏈 NFL Week 7 happening **now** (15 games)
- 📊 `nfl-predictions-generate` function exists
- ❓ **Unknown if logging/tracking in place**
- 🎯 Game props (spreads, totals) = **bread & butter** market
- 📅 Only 18 weeks of data possible (limited sample)

**What You'd Investigate:**
1. Check if NFL game predictions working: `/.netlify/functions/nfl-predictions-generate`
2. See if logging exists (like NHL V1)
3. Verify performance tracking
4. Add auto-logging if missing
5. Review historical performance

**Timeline:** 2-3 hours investigation, 1 day logging setup

**Risk:** Low (may already exist)

---

## 🎯 Option 4: Improve Existing Models (OPTIMIZATION) ⭐⭐⭐

**What You'd Improve:**

### NHL SOG Scanner
- ❓ Win rate unknown (need Day 7 data)
- Potential: Adjust edge thresholds (currently 5%)
- Potential: Add line movement tracking (CLV)
- Potential: Refine injury impact weights
- **WAIT FOR:** Oct 22 performance review first

### NBA Game Props (Elite Ensemble)
- ✅ Model trained (11.606 MAE spread)
- Potential: Add RCI adjustments for early season
- Potential: Injury impact refinement
- Potential: Back-to-back game adjustments
- **WAIT FOR:** Regular season data (Oct 22+)

### NFL TD Props
- ✅ Already deployed and working
- Potential: Red zone usage weights
- Potential: Game script predictions
- **ISSUE:** Limited sample size (18 weeks/year)

**Timeline:** Ongoing, data-driven

**Risk:** Medium (premature optimization without data)

---

## 🎯 Option 5: Just Hang Tight & Monitor (CONSERVATIVE) ⭐⭐

**Why This:**
- 🏒 NHL auto-logging running (Day 1 of 7)
- 🏀 NBA preseason showing (regular season Oct 22)
- 🏈 NFL TD props deployed
- ⏳ **Let systems collect data** before optimizing
- 📊 Review performance before next steps

**What You'd Do:**
1. Monitor NHL daily logs (GitHub Action)
2. Watch NBA preseason picks (observation only)
3. Check NFL TD performance
4. Wait for Oct 22 (NHL Day 7 + NBA opener)
5. Make data-driven decisions

**Timeline:** 7 days (until Oct 22)

**Risk:** None (conservative)

---

## 📊 My Recommendation: **OPTION 1 + OPTION 2**

### Phase 1 (Today): NHL Logging Verification ✅
**Time:** 1 hour  
**Why:** Quick win, already built, just verify it works

**Steps:**
1. Check GitHub Action scheduled correctly
2. Verify tomorrow (Oct 16) at 12pm ET logs run
3. Confirm CSV updates with new picks
4. Test results auto-update at 2am ET

### Phase 2 (Oct 16-22): Build NBA Player Props 🏀
**Time:** 5-7 days  
**Why:** Huge ROI potential, ready before regular season

**Steps:**
1. **Day 1-2:** Data pipeline (player stats, L10 averages, usage rates)
2. **Day 3-4:** Model training (Points, Rebounds, Assists projections)
3. **Day 5:** Odds integration (The Odds API player props)
4. **Day 6:** Edge detection + Kelly sizing
5. **Day 7:** Frontend display + testing

**Launch:** October 22 (NBA Opening Night) 🎯

### Phase 3 (Oct 22): Dual Review Day 📈
**What Happens:**
- NHL Day 7 Review (analyze 30-50 picks, decide V1 vs V2)
- NBA Regular Season Starts (player props go live)
- NBA Game props switch from preseason → regular season tracking

---

## 🎲 Expected Outcomes by Market

| Market | Volume | Edge Size | Win Rate Target | Sample Size | Status |
|--------|--------|-----------|-----------------|-------------|--------|
| **NHL SOG** | 8-12/day | 5-15% | 55-60% | 30 picks by Oct 22 | ✅ Live |
| **NBA Game** | 4-8/day | 3-8 pts | 55-58% | Starts Oct 22 | ⏳ Preseason |
| **NBA Player** | 20-40/day | 5-12% | 56-62% | Would start Oct 22 | ❌ Not built |
| **NFL TD** | 30-50/week | Varies | 55-60% | Limited (18 weeks) | ✅ Live |
| **NFL Game** | 15/week | 2-5 pts | 53-56% | Unknown tracking | ❓ Needs check |

**Highest Volume + Highest Edge = NBA Player Props** 🎯

---

## 🚨 Time-Sensitive Decision

**October 22 is key date:**
- NHL Day 7 performance review
- NBA regular season starts
- NBA player props market opens

**If you want NBA player props ready for opening night, need to start NOW.**

**If you want to wait and see NHL performance first, hang tight until Oct 22.**

---

## 💡 My Vote: **Start NBA Player Props Today**

**Reasoning:**
1. NHL is automated (no action needed for 7 days)
2. NBA regular season in 7 days (tight deadline)
3. Player props = **highest volume, highest edge** market
4. Builds on existing NBA infrastructure (data, injuries, RCI)
5. Similar to NHL SOG (player-level projections work well)

**Alternative:** If you're risk-averse, **hang tight** until Oct 22, review NHL performance, then decide.

---

## 🗳️ Your Call

**What sounds best to you?**

**A)** 🏀 Build NBA Player Props (launch Oct 22)  
**B)** 🏒 Improve NHL based on data (wait for Oct 22 review)  
**C)** 🏈 Investigate NFL game props logging  
**D)** 😎 Hang tight and monitor (conservative)  
**E)** 🔥 Something else entirely  

Let me know and I'll dive in! 🚀
