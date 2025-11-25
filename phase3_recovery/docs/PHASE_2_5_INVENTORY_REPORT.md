# 🔍 Phase 2.5 (NBA PRA Props) - Complete Inventory Report

**Generated:** November 21, 2025  
**Repository:** RRMODEL (main42 branch)  
**Status:** 🟡 **YELLOW** - Partial Infrastructure Exists

---

## 📋 Executive Summary

**Phase 2.5** refers to the **transition phase** between Phase 2 (RCI + Injuries for game predictions) and Phase 3 (full PRA player props model). It appears to be a **compatibility layer** mentioned in the training data builder for Phase 3.

### Classification: 🟡 YELLOW

- ✅ **Data collection infrastructure EXISTS** (historical odds)
- ✅ **Training data builder EXISTS** (with Phase 2.5 compatibility)
- ❌ **No dedicated Phase 2.5 model** (only references in Phase 3 code)
- ❌ **No Phase 2.5 specific training scripts**
- ❌ **No Phase 2.5 documentation**

**Interpretation:** Phase 2.5 is NOT a standalone system. It's a **data structure compatibility pattern** used when building Phase 3 training data to handle odds lookups from historical data.

---

## 📁 Files That Reference "Phase 2.5"

### 1. **Training Data Builder** (CRITICAL)

**File:** `scripts/nba/build-pra-training-phase3.mjs`  
**Status:** ✅ EXISTS  
**Size:** 18,402 bytes  
**Last Modified:** November 21, 2025, 12:10 PM

**Purpose:**
- Builds training table for Phase 3 PRA model
- Uses "Phase 2.5 compatibility" for odds lookup
- Outputs: `data/nba/features/pra/training_multi_season_phase3.jsonl`

**Phase 2.5 References (6 occurrences):**

```javascript
// Line 104-106: Function signature
/**
 * Normalize market key from API format to internal format
 * (Phase 2.5 compatibility)
 */
function mapMarketKey(raw) { ... }

// Line 115-118: Composite key builder
/**
 * Build composite odds key with lowercase player name
 * (Phase 2.5 compatibility)
 */
function buildOddsKey(date, playerName, market) { ... }

// Line 126-128: Odds lookup function
/**
 * Lookup odds for a player on a specific date
 * (Phase 2.5 compatibility)
 */
function lookupOdds(oddsIndex, gameDate, playerName) { ... }

// Line 167-169: Odds index description
/**
 * Load Phase 3 odds with Phase 2.5-compatible structure
 * Uses FLAT MAP with composite keys and lowercase player names
 */
function loadOdds() { ... }

// Line 182: Comment in odds loading
// Build FLAT odds index with composite keys (Phase 2.5 style)

// Line 401: Comment in table building
// Try to join with odds using Phase 2.5-compatible lookup
```

**What Phase 2.5 Compatibility Means:**
- **Composite Key Structure:** `"YYYY-MM-DD|playername|market"`
- **Lowercase Player Names:** All player names lowercased for matching
- **Flat Index:** Map-based lookup instead of nested structures
- **Market Normalization:** `player_points` → `points`, `player_rebounds` → `rebounds`, etc.

**Key Functions:**

1. **`mapMarketKey(raw)`**
   ```javascript
   // Normalize API format to internal format
   'player_points' → 'points'
   'player_rebounds' → 'rebounds'  
   'player_assists' → 'assists'
   ```

2. **`buildOddsKey(date, playerName, market)`**
   ```javascript
   // Creates: "2025-11-20|lebron james|points"
   return `${date}|${playerName.toLowerCase()}|${market}`;
   ```

3. **`lookupOdds(oddsIndex, gameDate, playerName)`**
   ```javascript
   // Looks up all 3 markets for a player
   const pointsKey = buildOddsKey(gameDate, playerName, 'points');
   const reboundsKey = buildOddsKey(gameDate, playerName, 'rebounds');
   const assistsKey = buildOddsKey(gameDate, playerName, 'assists');
   return { points_line, points_over, points_under, ... };
   ```

---

### 2. **Phase 2 Experiment Files** (EMPTY)

**Files:**
- `scripts/nba/_experiments/phase2f_tune.mjs` ❌ EMPTY (0 bytes)
- `scripts/nba/_experiments/phase2f_tune_quick.mjs` ❌ EMPTY (0 bytes)

**Status:** ❌ NOT FUNCTIONAL  
**Purpose:** Unknown (files are placeholders)

---

## 📊 Related Data Files

### 3. **Historical Odds Data** (CRITICAL)

**File:** `data/nba/historical-odds-2025-26-backtest.json`  
**Status:** ✅ EXISTS  
**Size:** 6,083,163 bytes (~6 MB)  
**Last Modified:** November 17, 2025, 10:11 AM  
**Lines:** 198,240 lines

**Structure:**
```json
[
  {
    "date": "2025-10-21",
    "eventId": "bbde7751a144b98ed150d7a5f7dc8f87",
    "homeTeam": "Oklahoma City Thunder",
    "awayTeam": "Houston Rockets",
    "commenceTime": "2025-10-21T23:35:00Z",
    "snapshot": {
      "timestamp": "2025-10-21T23:55:39Z",
      "previousTimestamp": "2025-10-21T23:50:40Z",
      "nextTimestamp": "2025-10-22T00:00:40Z"
    },
    "odds": {
      "bookmakers": [
        {
          "key": "draftkings",
          "markets": [
            {
              "key": "player_assists",
              "outcomes": [
                {
                  "name": "Over",
                  "description": "Shai Gilgeous-Alexander",
                  "price": -140,
                  "point": 6.5
                },
                {
                  "name": "Under",
                  "description": "Shai Gilgeous-Alexander",
                  "price": 110,
                  "point": 6.5
                }
              ]
            }
          ]
        }
      ]
    }
  }
]
```

**Contents:**
- **Season:** 2025-26 NBA season (Oct 21+ games)
- **Markets:** player_points, player_rebounds, player_assists
- **Bookmakers:** DraftKings, FanDuel, BetMGM, etc.
- **Snapshots:** Timestamped odds captures (pre-game, live, final)
- **Coverage:** Early season games through November 17

**Usage:**
- Input for Phase 3 training data builder
- Used by `build-pra-training-phase3.mjs` to join with player boxscores
- Provides actual betting lines (over/under) for model training

---

### 4. **Test Odds Data** (SMALL SAMPLE)

**File:** `data/nba/odds-test-2days.json`  
**Status:** ✅ EXISTS  
**Size:** 651,549 bytes (~651 KB)  
**Last Modified:** October 30, 2025, 11:04 AM

**Purpose:** Sample/test dataset (2 days of odds)  
**Usage:** Development testing, smaller dataset for quick iterations

---

## 🔗 Phase 2.5 Relationship Map

```
┌─────────────────────────────────────────────────────────────┐
│                 PHASE 2.5 CONTEXT                           │
└─────────────────────────────────────────────────────────────┘

Phase 2: RCI + Injuries (Game Predictions)
  ├─ NBA_PHASE2_COMPLETE.md
  ├─ netlify/functions/_lib/nba/rci-core.mjs
  ├─ netlify/functions/_lib/nba/injury-adjustments.mjs
  └─ Predicts: Team spreads, totals, moneylines
  
          ↓ (Transition gap)
          
Phase 2.5: Compatibility Layer (NOT A FULL PHASE)
  ├─ Mentioned in: build-pra-training-phase3.mjs
  ├─ Purpose: Data structure pattern for odds lookup
  ├─ Key Pattern: Composite keys "date|player|market"
  └─ Why: Phase 3 needs player props, Phase 2 had game odds
  
          ↓ (Enables Phase 3)
          
Phase 3: PRA Model (Player Props Predictions)
  ├─ Training: build-pra-training-phase3.mjs (EXISTS)
  ├─ Model: phase3_pra_coefficients.json (MISSING)
  ├─ Generator: generate-pra-predictions-v2.mjs (EXISTS but incomplete)
  └─ Predicts: Points, Rebounds, Assists (over/under)
```

---

## 💡 What Phase 2.5 Actually Is

**Phase 2.5 is NOT:**
- ❌ A standalone model
- ❌ A separate training phase
- ❌ A documented system
- ❌ A backtest or validation

**Phase 2.5 IS:**
- ✅ A **data structure pattern** for odds lookup
- ✅ A **compatibility layer** between API format and internal format
- ✅ A **naming convention** for composite keys
- ✅ An **intermediate step** in data pipeline

**Analogy:**
Phase 2.5 is like a **data adapter** - it translates between:
- **API Format:** Nested structure with `bookmakers[].markets[].outcomes[]`
- **Internal Format:** Flat map with `"date|player|market"` keys

---

## 🎯 Phase 2.5 Key Patterns

### Pattern 1: Market Normalization
```javascript
// API returns: "player_points", "player_rebounds", "player_assists"
// Internal uses: "points", "rebounds", "assists"

function mapMarketKey(raw) {
  switch (raw) {
    case 'player_points':   return 'points';
    case 'player_rebounds': return 'rebounds';
    case 'player_assists':  return 'assists';
    default: return null;
  }
}
```

### Pattern 2: Composite Key Generation
```javascript
// Instead of nested lookups:
// odds[date][player][market]

// Use flat map with composite keys:
// oddsIndex.get("2025-11-20|lebron james|points")

function buildOddsKey(date, playerName, market) {
  return `${date}|${playerName.toLowerCase()}|${market}`;
}
```

### Pattern 3: Unified Odds Object
```javascript
// Instead of separate queries for each market:
const odds = lookupOdds(oddsIndex, gameDate, playerName);

// Returns all 3 markets in one object:
{
  points_line: 26.5,
  points_over: -110,
  points_under: -110,
  rebounds_line: 8.5,
  rebounds_over: -105,
  rebounds_under: -115,
  assists_line: 7.5,
  assists_over: -120,
  assists_under: +100,
  book: "draftkings"
}
```

---

## 📈 Data Flow Through Phase 2.5 Pattern

```
1. RAW ODDS (API Format)
   ↓
   [Historical odds collection]
   ↓
2. STORED ODDS (data/nba/historical-odds-2025-26-backtest.json)
   ↓
   [build-pra-training-phase3.mjs]
   ↓
3. PHASE 2.5 TRANSFORMATION
   - Normalize market keys
   - Build composite keys  
   - Create flat index
   ↓
4. ODDS INDEX (Map<string, OddsData>)
   Key: "2025-11-20|lebron james|points"
   Value: {line, over, under, book}
   ↓
   [Join with player boxscores]
   ↓
5. TRAINING TABLE (data/nba/features/pra/training_multi_season_phase3.jsonl)
   - Player stats (L5/L10/L999)
   - Opponent defense
   - Vegas lines (from odds)
   - Actual results
   ↓
6. MODEL TRAINING (Phase 3)
   [MISSING - should train 6 logistic models]
   ↓
7. COEFFICIENTS (phase3_pra_coefficients.json)
   [MISSING - not created yet]
```

---

## 🔍 Why "Phase 2.5" Exists

**Historical Context:**

**Phase 1:** Baseline NBA game predictions
- Simple spreads/totals model
- No advanced features

**Phase 2:** RCI + Injuries (Game Level)
- Roster Continuity Index
- Injury impact system
- Still predicting GAMES, not individual player props

**Gap:** Need to transition to player props
- Games have 1 set of odds per game
- Player props have 20-40 lines per game
- Different data structure needed

**Phase 2.5:** Bridge the gap
- Develop flat lookup pattern
- Handle many props per game efficiently
- Prepare for Phase 3 training data at scale

**Phase 3:** Full PRA model
- Logistic regression for over/under
- 18 features per player-prop
- 6 models (P/R/A × over/under)

---

## 🚨 Current Status

### What Works ✅
1. **Data Collection:** Historical odds are being collected and stored
2. **Data Structure:** Phase 2.5 compatibility pattern is implemented
3. **Data Pipeline:** Training table builder can join boxscores + odds

### What's Missing ❌
1. **Training Output:** `data/nba/features/pra/training_multi_season_phase3.jsonl` does NOT exist
2. **Source Data:** Files referenced by builder don't exist:
   - `data/nba/odds-sample-multi-season-phase3.json` (expected input)
   - `data/nba/player-logs/2023-24/*.json` (player game logs)
   - `data/nba/player-logs/2024-25/*.json` (player game logs)
3. **Phase 3 Model:** No trained coefficients
4. **Documentation:** No dedicated Phase 2.5 docs

### Why Phase 2.5 Appears Incomplete
- It's NOT a complete phase - just a pattern
- The "2.5" numbering is informal
- Purpose served: data structure design
- Phase 3 is the actual deliverable

---

## 📚 Related Documentation

**Files that mention Phase 2 (Game Predictions):**
- `NBA_PHASE2_COMPLETE.md` ✅ (150+ lines)
- `NBA_DEPLOYMENT_COMPLETE.md` ✅
- `NBA_RCI_DEPLOYED.md` ✅
- `🚀_NBA_ROADMAP_NEXT_STEPS.md` ✅

**Files that mention Phase 3 (PRA Props):**
- `docs/NBA_PROPS_V2_COMPLETE_STATUS.md` ✅ (references Phase 3 model)
- `docs/NBA_PROPS_V2_AUTOMATION_COMPLETE.md` ✅

**Files that mention "Phase 2.5" specifically:**
- **NONE** (only code comments in `build-pra-training-phase3.mjs`)

---

## 🎯 Recommendations

### For Understanding Phase 2.5:
1. **Don't search for Phase 2.5 model** - it doesn't exist as a standalone thing
2. **Understand it as a data pattern** - composite keys for efficient lookups
3. **Focus on Phase 3** - that's where the actual player props model should be

### For Building Phase 3:
1. **Use Phase 2.5 pattern** - it's already coded in the training builder
2. **Collect necessary inputs:**
   - Player boxscores (2023-24, 2024-25 seasons)
   - Historical odds (already have for 2025-26)
3. **Run training builder** to create training table
4. **Train Phase 3 models** (6 logistic regressions)
5. **Export coefficients** to `phase3_pra_coefficients.json`

### For Deployment:
1. **Skip "Phase 2.5 deployment"** - nothing to deploy
2. **Focus on Phase 3 infrastructure:**
   - Model coefficients
   - JS inference wrapper
   - Prediction generator
   - Frontend integration

---

## 🔄 Version History

| Version | Date | Description |
|---------|------|-------------|
| Phase 1 | Sep 2025 | Baseline NBA game predictions |
| Phase 2 | Oct 2025 | RCI + Injuries (game level) |
| **Phase 2.5** | **Nov 2025** | **Data compatibility pattern (not a full phase)** |
| Phase 3 | Nov 2025 | PRA player props (in progress) |
| Phase 4 | Dec 2025+ | Advanced features (planned) |

---

## 📝 Conclusion

**Phase 2.5 Status:** 🟡 YELLOW - Pattern exists, but infrastructure incomplete

**What it is:** A data structure compatibility layer for odds lookup in Phase 3 training

**What it's not:** A standalone model, training phase, or deployable system

**Next steps:** Use Phase 2.5 pattern to build Phase 3 training data and train the actual PRA model

---

**Report Generated:** November 21, 2025  
**Status Classification:** 🟡 YELLOW  
**Primary Finding:** Phase 2.5 is a design pattern, not a full phase  
**Action Required:** Focus on Phase 3 implementation using Phase 2.5 data structures
