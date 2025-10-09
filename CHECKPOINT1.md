
---

## 🆕 UPDATE: Friend's Injury System Comparison (Oct 9, 2025)

### Key Finding: ESPN **DOES** Track IR Players
- Friend's Python scraper confirmed: **1,044 IR references** on ESPN injuries page
- Our system **MISSING** this data (BallDontLie only tracks weekly injury reports)

### Comparison Score: **Our System 81% vs. Friend's 39%**

**What Friend's System Does Better:**
1. ✅ Captures IR-designated players (we don't)
2. ✅ Uses actual 2024 player stats for importance scoring

**What Our System Does Better (Everything Else):**
1. ✅ EPA-based replacement value theory (vs. simple % of stats)
2. ✅ Scheme dependency modeling (SF 95% RB-dependent, KC 50%)
3. ✅ Matchup context (vs elite run D = worse backup performance)
4. ✅ Probabilistic status weights (Q=50%, D=15% vs. binary on/off)
5. ✅ Multi-tier fallback API (vs. brittle HTML scraping)
6. ✅ Production-ready architecture (vs. prototype scripts)

**Critical Flaw in Friend's Model:**
- Assumes backups produce **0%** of starter's output
- Example: CMC out → deducts 100% of his production
- Reality: Jordan Mason replaces ~80% of CMC's volume

### 🎯 RECOMMENDED HYBRID SOLUTION

**Option 1A: Scrape ESPN for IR (Supplement Our System)**
```javascript
// NEW: netlify/functions/_lib/espn-ir-tracker.mjs
export async function fetchESPN_IR_Players() {
  const response = await fetch('https://www.espn.com/nfl/injuries');
  const html = await response.text();
  
  // Parse for status="Injured Reserve"
  // Return: { NYG: ['Malik Nabers'], ARI: ['James Conner'], ... }
}

// INTEGRATE: Wire into applyInjuryAdjustments()
const irPlayers = await fetchESPN_IR_Players();
const isOnIR = irPlayers[teamCode]?.includes(playerName);
const wasInBaseline = checkPlayerBaselineContribution(playerName, position, teamCode);

if (isOnIR && !wasInBaseline) {
  console.log(`⏭️ Skipping ${playerName} - on IR, not in baseline`);
  continue; // Skip injury adjustment (already baked into baseline)
}
```

**Option 1B: ESPN API for IR (Cleaner)**
```javascript
// Use official API instead of scraping:
const espnAPI = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`;
const irPlayers = roster.athletes
  .filter(a => a.status?.type === 'injured_reserve')
  .map(a => ({ name: a.displayName, position: a.position.abbreviation }));
```

### Updated Action Items (Added to CHECKPOINT 1)

**IMMEDIATE (Next 3 Hours):**
1. ✅ GitHub Action branch fix (completed - commit 9c3e618)
2. 🔄 Wire up `checkPlayerBaselineContribution()` at line 900
3. 🔄 Add ESPN IR tracker (adapt friend's scraper OR use ESPN API)
4. 🔄 Populate BASELINE_CONTRIBUTORS for all 32 teams

**Result:** Fix both problems simultaneously:
- IR players correctly identified (from ESPN)
- Baseline accounting prevents double-counting (from our existing function)

### Architecture Decision: Keep Our Core, Steal IR Detection

**What to Keep:**
- ✅ Canonical Availability v5 (probabilistic, multi-source)
- ✅ Replacement value EPA calculations
- ✅ Scheme + matchup context
- ✅ Multi-tier API fallback chain

**What to Add:**
- 🆕 ESPN IR tracker (weekly cron or real-time scrape)
- 🆕 Baseline contributor wiring (already exists, just unused)

**Implementation Time:** ~2-3 hours
**ROI:** Fixes Nabers/Conner/Purdy mystery completely

