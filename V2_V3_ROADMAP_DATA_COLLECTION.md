# V2/V3 Roadmap & Data Collection Strategy

## 🎯 **TLDR: What to Do NOW**

**Answer: NOTHING from "v2" is ready to ship.**

v1 is complete and production-ready. The "v2 features" GPT suggested either:
1. **Require data we don't have** (snap counts, injury timelines)
2. **Add marginal value** (2-3% accuracy for 5× complexity)
3. **Need production validation first** (backtest to confirm gaps exist)

**BUT:** We should **start collecting data NOW** to enable v2/v3 in 6-12 months.

---

## 📊 **Data We Already Have (Hidden Gold)**

### **1. Injury Duration History** ✅
**Location:** `/data/nfl/injuries/injury-duration-history.json`

**Sample Data:**
```json
{
  "metadata": {
    "last_updated": "2025-10-08T13:26:35.874Z",
    "total_players_tracked": 69
  },
  "players": {
    "Player Name": {
      "injury_timeline": [...],
      "weeks_missed": 4,
      "injury_type": "ankle"
    }
  }
}
```

**What this enables:**
- ✅ Historical injury patterns (who gets hurt repeatedly)
- ✅ Recovery timelines (ankle: 4 weeks, ACL: 52 weeks)
- ✅ "Return from injury" efficiency tracking
- ✅ Injury-prone player flags

**Current status:** Collecting but **NOT USING** in HAD/predictions

**v2 Integration:** Feed injury timeline into HAD confidence scoring
- Players with 3+ injuries this season → confidence downgrade
- Recent return from injury (< 2 weeks) → efficiency penalty

---

### **2. Weekly Depth Charts (18 weeks)** ✅
**Location:** `/public/history/2025/week1/` through `/week18/`

**What we have:**
- ✅ Depth charts for weeks 1-18 (currently only using 7-8)
- ✅ Historical depth changes week-by-week
- ✅ Player name consistency across weeks

**What this enables:**
- ✅ Full-season HAD calculation (not just 2 weeks)
- ✅ Depth trend detection (gradual decline vs sudden drop)
- ✅ Role stability scoring (starter for 12 weeks vs 2 weeks)

**Current status:** **Only using week7-8** (weeks 1-6 failed to parse)

**v1.1 Quick Win:** Fix depth chart parser for weeks 1-6
- Currently failing on `data.forEach is not a function`
- Likely format inconsistency (need to check structure)
- **Impact:** Better HAD confidence for all players

---

### **3. NFLVerse/nflfastR Infrastructure** ✅
**Location:** R pipeline, comprehensive-player-epa.js

**What we have:**
- ✅ Play-by-play data access (via nflfastR)
- ✅ EPA/play calculations (already composite)
- ✅ Historical performance data (2015-2024)

**What this COULD enable (but we haven't tapped):**
- 🔄 Snap counts (nflfastR has this!)
- 🔄 Split EPA (run vs pass, by game)
- 🔄 Target share by game
- 🔄 "Healthy vs injured" performance splits

**Current status:** Using aggregate EPA only, **not** game-by-game

---

## 🚀 **V1.1: Quick Wins (Ship This Week)**

### **1. Fix Depth Chart Parser for Weeks 1-6** 
**Effort:** 30 minutes  
**Impact:** HIGH (better HAD confidence)

**Current error:**
```
✗ Error loading week1: data.forEach is not a function
```

**Fix:** Already implemented format normalizer, just need to verify weeks 1-6 structure

**Action:**
```bash
# Check week1 structure
jq '.[0]' public/history/2025/week1/depth-charts.json

# If different format, update normalizer
```

**Result:** HAD calculation uses all 8 weeks (not just 2)

---

### **2. Integrate Injury Duration History into HAD**
**Effort:** 2 hours  
**Impact:** MEDIUM (confidence boost for injury-prone players)

**Implementation:**
```javascript
// Load injury history
const injuryHistory = JSON.parse(
  fs.readFileSync('data/nfl/injuries/injury-duration-history.json')
);

// When calculating HAD confidence
const playerInjuryCount = injuryHistory.players[playerName]?.injury_count || 0;

if (playerInjuryCount >= 3) {
  confidence = 'medium';  // Downgrade even if 4+ healthy weeks
  note = `Injury-prone: ${playerInjuryCount} injuries this season`;
}
```

**Result:** More conservative HAD for chronically injured players

---

### **3. Add "Weeks Since Injury" Flag to HAD Output**
**Effort:** 1 hour  
**Impact:** LOW (setup for v2, not used yet)

**Implementation:**
```javascript
healthyAverageDepths[playerKey] = {
  ...existing_fields,
  
  // NEW v1.1 fields
  lastInjuryWeek: 'week6',
  weeksSinceInjury: 2,
  injuryType: 'ankle',  // From injury-duration-history.json
  isReturningFromInjury: true  // < 2 weeks since return
};
```

**Result:** Data contract ready for v2 efficiency penalties

---

## 📦 **V2: Features Requiring New Data (6-12 Months)**

### **Priority 1: Snap Counts** 
**Data Source:** nflfastR has this!  
**Effort:** 4 hours (R script to extract)  
**Impact:** HIGH (+10% HAD accuracy)

**What we need:**
```r
# R script to extract snap counts from nflfastR
library(nflfastR)

snap_counts <- load_snap_counts(seasons = 2025) %>%
  filter(week <= 8) %>%
  select(player, position, team, week, offense_snaps, offense_pct)

# Export to JSON
write_json(snap_counts, "public/snap-counts-2025.json")
```

**Integration:**
```javascript
// v2: Snap-based shrinkage
const totalSnaps = snapCounts[playerKey]?.offense_snaps || 0;
const w = Math.min(1, totalSnaps / 400);  // More precise than weeks

// v2: Detect decoys
if (snapPct < 0.20 && status === 'questionable') {
  // Player was decoy, exclude from HAD
  continue;
}
```

**Result:** HAD confidence upgrades from weeks-based to snap-based

---

### **Priority 2: Game-by-Game EPA Splits**
**Data Source:** nflfastR play-by-play  
**Effort:** 8 hours (R aggregation script)  
**Impact:** MEDIUM (+3-5% on "questionable" players)

**What we need:**
```r
# R script to split EPA by injury status
player_epa_by_game <- load_pbp(2025) %>%
  group_by(player_name, week) %>%
  summarize(
    epa = mean(epa, na.rm = TRUE),
    targets = sum(pass_attempt),
    carries = sum(rush_attempt)
  ) %>%
  left_join(injury_reports, by = c("player_name", "week")) %>%
  mutate(
    injury_status = case_when(
      is.na(injury_designation) ~ "healthy",
      injury_designation %in% c("Q", "D") ~ "questionable",
      TRUE ~ "out"
    )
  )
```

**Integration:**
```javascript
// v2: Use injury-status-specific EPA
const playerData = {
  healthyEPA: 0.14,
  questionableEPA: 0.09,  // Lower when playing hurt
  sampleSize: { healthy: 240, questionable: 80 }
};

if (currentStatus === 'questionable' && probPlay > 0.5) {
  useEPA = playerData.questionableEPA;  // Expect degraded performance
}
```

**Result:** More accurate projections for "probable" players

---

### **Priority 3: Target/Carry Share Trends**
**Data Source:** nflfastR play-by-play  
**Effort:** 6 hours (R aggregation)  
**Impact:** MEDIUM (+2-3% on role changes)

**What we need:**
```r
# Weekly usage trends
usage_trends <- load_pbp(2025) %>%
  group_by(player_name, week) %>%
  summarize(
    target_share = targets / sum(targets),
    carry_share = carries / sum(carries),
    snap_share = snaps / 65
  )
```

**Integration:**
```javascript
// v2: Detect role changes
const usageTrend = [0.15, 0.18, 0.22, 0.28, 0.42];  // RB2 → RB1 promotion
const usageDelta = usageTrend[usageTrend.length - 1] - avg(usageTrend.slice(0, -1));

if (usageDelta > 0.20) {
  // Massive role jump → apply efficiency penalty
  effectiveEPA *= 0.92;  // -8% on sudden bellcow promotion
}
```

**Result:** Better handling of mid-season depth chart shifts

---

## 🔬 **V3: Research Projects (12-24 Months)**

### **1. Scheme Fit Analysis**
**Data Source:** Manual tagging + play-by-play patterns  
**Effort:** 20+ hours (research project)  
**Impact:** LOW (+1-2%, highly uncertain)

**What we'd need:**
- Manual classification of offensive schemes (zone vs gap, air coryell vs WCO)
- Player performance splits by scheme type
- Transaction history with scheme change tracking

**Why v3 (not v2):**
- Highly subjective (scheme changes mid-game)
- Small sample (only relevant for trades/FA signings)
- Unclear if signal exists (could be noise)

---

### **2. Stacking/Correlation Models**
**Data Source:** Historical game logs  
**Effort:** 40+ hours (ML research)  
**Impact:** MEDIUM (better multi-injury scenarios)

**What we'd need:**
```python
# Train correlation model
from sklearn.ensemble import GradientBoostingRegressor

# Features: OL1_out, OL2_out, OL3_out, QB_out, ...
# Target: Actual team point differential vs expected

# Learn when 3+ injuries compound vs cancel out
```

**Why v3:**
- Requires 2+ seasons of data
- Complex ML modeling (gradient boosting, neural nets)
- Risk of over-fitting to small samples
- Position caps already prevent worst-case

---

### **3. Return-from-Injury Efficiency Curves**
**Data Source:** Play-by-play + injury timelines  
**Effort:** 30+ hours (research + validation)  
**Impact:** MEDIUM (+3-5% on returns)

**What we'd need:**
```r
# Model efficiency recovery post-injury
recovery_curves <- injury_timelines %>%
  left_join(player_game_epa, by = c("player", "week")) %>%
  mutate(
    weeks_since_return = week - return_week,
    efficiency_pct = epa / career_avg_epa
  ) %>%
  group_by(injury_type, weeks_since_return) %>%
  summarize(avg_efficiency_pct = mean(efficiency_pct))

# Fit exponential recovery curve by injury type
# ACL: 12-18 month ramp
# Ankle: 4-6 week ramp
# Hamstring: 2-3 week ramp
```

**Why v3:**
- Requires injury type tracking (not always public)
- Recovery highly individual (ACL: 6 months for some, 18 for others)
- Need 3+ seasons to get stable curves
- Complex to validate (medical privacy issues)

---

## 📋 **Data Collection Checklist (Start NOW)**

### **Automated Weekly Tasks**

#### **Every Tuesday (Injury Reports Released)**
```bash
# Collect official injury reports
node scripts/scrape-injury-reports.js --week=current

# Output: public/history/2025/week{N}/injury-report.json
```

**Format:**
```json
{
  "week": 9,
  "teams": {
    "Tampa Bay Buccaneers": [
      {
        "name": "Bucky Irving",
        "position": "RB",
        "status": "out",
        "injury": "toe",
        "practice_participation": ["DNP", "DNP", "DNP"]
      }
    ]
  }
}
```

**Why collect:** Enables injury timeline tracking for v2

---

#### **Every Thursday (Depth Charts Updated)**
```bash
# Already doing this!
# Just ensure we're saving weeks 1-18 consistently
```

**Validation:**
```bash
# Ensure all weeks parseable
for week in {1..18}; do
  echo "Testing week$week"
  jq '.[0].team' public/history/2025/week$week/depth-charts.json || echo "FAILED"
done
```

---

#### **Every Sunday Night (Post-Game)**
```bash
# FUTURE: Scrape snap counts from ESPN/PFF
node scripts/scrape-snap-counts.js --week=current

# Output: public/history/2025/week{N}/snap-counts.json
```

**Format:**
```json
{
  "week": 9,
  "games": [
    {
      "team": "Tampa Bay Buccaneers",
      "players": [
        {
          "name": "Bucky Irving",
          "position": "RB",
          "snaps": 42,
          "snap_pct": 0.65,
          "routes_run": 18
        }
      ]
    }
  ]
}
```

**Why collect:** Unlocks snap-based shrinkage for v2

---

### **Manual Quarterly Tasks**

#### **End of Every Month**
```bash
# Update comprehensive-player-epa.js with latest nflfastR data
Rscript scripts/update-player-epa-monthly.R

# Regenerate comprehensive-player-epa.js
```

**Why:** Keep EPA values fresh (accounts for recent games)

---

#### **End of Season**
```bash
# Archive full season data
cp -r public/history/2025 public/history/archive/2025-complete

# Prepare multi-season HAD tracking
node scripts/migrate-had-to-multi-season.js
```

**Why:** Enables v3 multi-season HAD analysis

---

## 🎯 **What to Ship When**

### **v1.0 (THIS WEEK)** ✅
- HAD system with manual baseline
- Week-based shrinkage
- Data quality filters
- Integration with canonical-availability-v5.mjs

### **v1.1 (NEXT WEEK)**
- Fix weeks 1-6 depth chart parser
- Integrate injury-duration-history.json
- Add "weeks since injury" to HAD output
- **No model changes, just better data**

### **v2.0 (January 2026 - After Season)**
**Prerequisites:** 
- Full season of depth charts (18 weeks)
- Snap count data collection active
- Injury timeline tracking complete

**Features:**
1. Snap-based shrinkage (replaces week-based)
2. Healthy vs questionable EPA splits
3. Return-from-injury efficiency flags
4. OL/DB superadditivity (if backtest confirms)

### **v3.0 (August 2026 - Season 2)**
**Prerequisites:**
- 2 full seasons of data
- Scheme tagging complete
- Transaction history integrated

**Features:**
1. Multi-season HAD tracking
2. Scheme fit adjustments
3. Stacking/correlation models
4. Return-from-injury curves by injury type

---

## 💡 **Bottom Line**

**Ship v1 NOW:** Nothing from v2 is ready.

**Start collecting data NOW:**
1. ✅ Weekly injury reports (Tuesdays)
2. ✅ Depth charts (already doing)
3. 🔄 Snap counts (need scraper)
4. 🔄 Game-by-game EPA (need R script)

**Ship v1.1 NEXT WEEK:**
- Fix weeks 1-6 parser (30 min)
- Integrate injury history (2 hours)
- Prep data contract for v2 (1 hour)

**Build v2 in January 2026:**
- After full season of data
- After backtest validation
- After snap count collection active

**The gap between v1 and v2 is DATA, not CODE.**

Start collecting now, ship improvements incrementally, don't over-engineer.
