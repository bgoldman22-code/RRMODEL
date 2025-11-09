# Healthy Depth Chart: The Real Challenge

## The Core Problem

**Question:** How do we know a player's "true" depth when:
- Players start season injured (never see healthy depth)
- Injuries cause depth shuffles (healthy players move up)
- IR/suspensions cause long-term changes
- Backups get hot and take over (performance-based changes)

**This is why HAD is complex** - it's not a trivial problem!

---

## The Challenge Examples

### Case 1: Bucky Irving (TB RB)
**Week 1-7:** Listed as RB1 (healthy, playing)
**Week 8:** Listed as RB3 (injured, out)

**Easy Case:**
- Clear healthy baseline: RB1 (7 weeks of data)
- Obvious injury drop: RB1 → RB3
- **Solution:** Use RB1 depth

---

### Case 2: Player Starts Season Injured
**Example:** Christian McCaffrey (SF RB) - IR to start 2024

**Weeks 1-4:** Not on depth chart (IR)
**Week 5:** Returns as RB1

**Problem:**
- No "healthy baseline" from early season
- First appearance already shows starting role
- **Solution:** Manual baseline or position assumption (RB1 for CMC obvious)

---

### Case 3: Backup Gets Hot, Takes Over
**Example:** Brock Purdy (SF QB) - started as backup

**Weeks 1-12:** QB3 (healthy, on bench)
**Week 13+:** QB1 (performance promotion, not injury)

**Problem:**
- "Healthy depth" was QB3 for 12 weeks
- Now QB1 is his "new normal"
- Not injury-related, but depth changed
- **Solution:** Update healthy baseline when change persists 2+ weeks

---

### Case 4: Injury Creates Temporary Starter
**Example:** Backup QB plays while starter injured

**Weeks 1-8:** QB2 (healthy backup)
**Week 9:** QB1 (starter injured, backup elevated)
**Week 10+:** QB2 again (starter returns)

**Problem:**
- Temporary elevation looks like depth change
- But it's not his "true" depth
- **Solution:** Only update baseline if change persists 2+ weeks after original starter healthy

---

### Case 5: Mid-Season Trade/Signing
**Example:** Player traded to new team

**Team A (Weeks 1-8):** WR2
**Team B (Week 9+):** WR1

**Problem:**
- Different depth on different teams
- Team change vs. injury ambiguity
- **Solution:** Track per-team baselines, reset on team change

---

## Current HAD System Approach

### What It Does Well:
1. **Averages healthy weeks** - Uses weeks when status = 'active'
2. **Manual baseline override** - Human-curated for edge cases
3. **Sample size filter** - Requires 4+ healthy weeks for confidence
4. **Excludes injured weeks** - Weeks with out/doubtful don't count

### What It Struggles With:
1. **Performance-based promotions** - Treats like injury (Brock Purdy case)
2. **First-time appearances** - No baseline if player never healthy (CMC case)
3. **Temporary elevations** - Counts backup starting 1 week as depth change
4. **Mid-season team changes** - Averages across teams incorrectly

---

## Proposed Solution: Stable Depth Tracking

### Concept: "Stable Depth" = Most Common Healthy Depth Over Last 3+ Weeks

**Algorithm:**
```javascript
function getStableDepth(player, weeklyHistory) {
  // 1. Filter to healthy weeks only
  const healthyWeeks = weeklyHistory.filter(w => 
    w.status === 'active' && 
    w.team === player.currentTeam  // Same team only
  );
  
  // 2. Take last 3+ healthy weeks
  const recentHealthy = healthyWeeks.slice(-5); // Last 5 healthy weeks
  
  if (recentHealthy.length < 2) {
    return null; // Not enough data, use manual baseline or current
  }
  
  // 3. Find mode (most common depth)
  const depthCounts = {};
  recentHealthy.forEach(w => {
    depthCounts[w.depth] = (depthCounts[w.depth] || 0) + 1;
  });
  
  // 4. Return most common depth (stable depth)
  const stableDepth = Object.keys(depthCounts)
    .reduce((a, b) => depthCounts[a] > depthCounts[b] ? a : b);
  
  return parseInt(stableDepth);
}
```

**Examples:**
- Bucky Irving: [1, 1, 1, 1, 1] → stable = 1 ✅
- Brock Purdy promoted: [3, 3, 3, 1, 1] → stable = 3 (but would update to 1 after 3 more weeks) ✅
- Backup fills in 1 week: [2, 2, 2, 1, 2] → stable = 2 ✅

---

## Alternative Solutions

### Option A: Manual Baseline + Automatic Updates

**Idea:**
1. Start with **manual baseline** for all expected starters (QB1, RB1, WR1/2)
2. Auto-update baseline if player at new depth for 3+ **consecutive healthy weeks**
3. Ignore 1-2 week blips

**Pros:**
- Handles edge cases (CMC, Purdy)
- Prevents temporary elevation bugs
- Only ~30 manual entries per team (starters only)

**Cons:**
- Requires initial manual work (but one-time)
- Needs update logic

**Implementation:**
```javascript
// manual-depth-baseline.json (one-time creation)
{
  "San Francisco 49ers_RB_Christian McCaffrey": {
    "baselineDepth": 1,
    "reason": "All-Pro RB1",
    "lastUpdated": "2024-09-01"
  }
}

// Auto-update logic
function updateBaseline(player, history) {
  const lastThreeHealthy = history
    .filter(w => w.status === 'active')
    .slice(-3);
  
  // If depth consistent for 3 weeks AND different from baseline
  if (lastThreeHealthy.length === 3 &&
      lastThreeHealthy.every(w => w.depth === lastThreeHealthy[0].depth) &&
      lastThreeHealthy[0].depth !== player.baseline) {
    
    console.log(`📊 Baseline update: ${player.name} ${player.baseline} → ${lastThreeHealthy[0].depth}`);
    player.baseline = lastThreeHealthy[0].depth;
  }
}
```

**Cost:** ~960 manual entries (32 teams × 30 starters) - **one afternoon of work**

---

### Option B: Position-Based Heuristics

**Idea:** Use position expectations + recent history

**Rules:**
1. **QB:** If played as QB1 for 2+ weeks → assume QB1
2. **RB:** Top 2 RBs are "starters" (RBBC common)
3. **WR:** Top 3 WRs are "starters"
4. **TE:** Top 1-2 TEs are "starters"

**Then:**
- If player currently at "starter depth" when healthy → that's baseline
- If player was starter but now depth 3+ → use last starter depth

**Pros:**
- No manual baseline needed
- Handles most cases
- Simple logic

**Cons:**
- Misses edge cases (3rd string QB promoted)
- RBBC creates ambiguity

---

### Option C: Depth Chart Metadata (Recommended)

**Idea:** Add metadata fields directly to depth chart scraper

**New depth chart format:**
```json
{
  "Tampa Bay Buccaneers": {
    "RB": [
      {
        "name": "Bucky Irving",
        "currentDepth": 3,
        "stableDepth": 1,        // ← NEW: Auto-calculated or manual
        "status": "out",
        "weeksAtCurrentDepth": 1, // ← NEW: Helps detect temp changes
        "weeksAtStableDepth": 7,  // ← NEW: Confidence metric
        "lastDepthChange": "2024-10-20",
        "teamTenure": 8          // ← NEW: Weeks on team
      }
    ]
  }
}
```

**Calculation Logic (in depth scraper):**
```javascript
// When scraping depth charts
for (const player of depthChart) {
  const history = getPlayerHistory(player.name, player.team);
  
  // 1. Get recent healthy depth
  const healthyWeeks = history
    .filter(w => w.status === 'active')
    .slice(-5);
  
  // 2. Calculate stable depth (mode of last 5 healthy weeks)
  player.stableDepth = calculateMode(healthyWeeks.map(w => w.depth));
  
  // 3. Track persistence
  player.weeksAtCurrentDepth = history
    .reverse()
    .findIndex(w => w.depth !== player.currentDepth);
  
  // 4. Override with manual baseline if exists
  if (manualBaselines[player.key]) {
    player.stableDepth = manualBaselines[player.key];
  }
}
```

**Pros:**
- All data in one place (depth chart)
- Visual in UI
- Easy to debug/validate
- Scraper handles calculation (not separate script)

**Cons:**
- Adds ~5 fields to depth chart
- Scraper becomes slightly more complex

---

## Recommendation: Hybrid Approach

**Combine best of all options:**

### 1. Manual Baseline (One-Time Setup)
Create `manual-starter-baseline.json`:
```json
{
  "teams": {
    "Tampa Bay Buccaneers": {
      "QB": ["Baker Mayfield"],
      "RB": ["Bucky Irving", "Rachaad White"],
      "WR": ["Mike Evans", "Chris Godwin", "Jalen McMillan"],
      "TE": ["Cade Otton"]
    }
  }
}
```

**Cost:** ~30 min per team × 32 teams = **16 hours one-time work**

---

### 2. Automatic Stable Depth (Weekly)
In depth chart scraper, calculate `stableDepth`:

```javascript
function calculateStableDepth(player, history, manualStarters) {
  // PRIORITY 1: Manual baseline
  if (manualStarters[player.team]?.[player.position]?.includes(player.name)) {
    const positionIndex = manualStarters[player.team][player.position].indexOf(player.name);
    return positionIndex + 1; // 1-indexed
  }
  
  // PRIORITY 2: Mode of last 5 healthy weeks
  const recentHealthy = history
    .filter(w => w.status === 'active' && w.team === player.team)
    .slice(-5);
  
  if (recentHealthy.length >= 3) {
    return calculateMode(recentHealthy.map(w => w.depth));
  }
  
  // PRIORITY 3: Current depth (fallback)
  return player.currentDepth;
}
```

---

### 3. Smart Overrides (Edge Case Handling)

**Rule 1: Ignore 1-week blips**
```javascript
if (player.weeksAtCurrentDepth === 1 && player.stableDepth !== player.currentDepth) {
  // Likely temporary fill-in, use stableDepth
  return player.stableDepth;
}
```

**Rule 2: Update baseline after 3+ weeks**
```javascript
if (player.weeksAtCurrentDepth >= 3 && player.currentDepth < player.stableDepth) {
  // Promotion that stuck, update baseline
  player.stableDepth = player.currentDepth;
}
```

**Rule 3: Reset on team change**
```javascript
if (player.teamTenure < 3) {
  // New to team, use current depth until established
  player.stableDepth = player.currentDepth;
}
```

---

## Implementation Plan

### Phase 1: Manual Baseline (Week 1)
1. Create `manual-starter-baseline.json`
2. List expected starters for each team (QB1, RB1/2, WR1/2/3, TE1)
3. ~16 hours work, one-time

### Phase 2: Scraper Enhancement (Week 1)
1. Add `stableDepth` calculation to depth chart scraper
2. Add metadata fields (weeksAtCurrentDepth, teamTenure)
3. Implement priority logic (manual → mode → current)
4. ~2-3 hours development

### Phase 3: Canonical Availability Update (Week 1)
1. Read `stableDepth` from depth chart (not separate HAD file)
2. Use `stableDepth` for injury impact calculation
3. Remove separate HAD pipeline
4. ~1 hour development

### Phase 4: Validation (Week 2)
1. Compare old HAD output vs. new stableDepth
2. Flag discrepancies for manual review
3. Refine manual baseline as needed

---

## Comparison: Current HAD vs. Proposed

| Aspect | Current HAD | Proposed Hybrid |
|--------|-------------|-----------------|
| **Manual Work** | 32 teams × 30 players = 960 entries | 32 teams × 8 starters = 256 entries |
| **Weekly Work** | Collect injuries + run HAD calc | Just scrape depths (already doing) |
| **Data Files** | 4 (baseline, injuries, depths, HAD output) | 2 (baseline, depths with metadata) |
| **Code Complexity** | 685 lines HAD calc + 1065 lines canonical | 50 lines in scraper + 10 lines in canonical |
| **Failure Points** | 4 (injury collect, HAD calc, load, override) | 1 (depth scraper) |
| **Edge Case Handling** | Complex (shrinkage, confidence, anomaly) | Simple (3-week rule, manual override) |
| **Visual Debugging** | Separate file | In depth chart UI |

---

## Bottom Line

**The "healthy depth chart" problem is real and non-trivial.**

**But the solution doesn't need to be complex:**

1. **Manual baseline** for obvious starters (~256 entries, one-time)
2. **Automatic mode calculation** from last 5 healthy weeks
3. **3-week persistence rule** to ignore temporary fill-ins
4. **Embed in depth chart** instead of separate pipeline

**Result:**
- Solves same problem as HAD
- 90% less code
- No separate data pipeline
- Easier to maintain and debug
- Visual in existing UI

**Time Investment:**
- Initial: 16 hours (manual baseline) + 3 hours (dev) = **19 hours**
- Weekly: 0 hours (automatic)

vs. Current HAD:
- Initial: Unknown hours (build system)
- Weekly: 1-2 hours (collect injuries, run calc, validate)

