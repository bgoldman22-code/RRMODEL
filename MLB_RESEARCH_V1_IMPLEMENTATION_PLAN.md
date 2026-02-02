# MLB Research V1.1 - Implementation Plan

**Date:** January 8, 2026  
**Principal Engineer Scope:** 2021-2025 Regular Season Research Dataset  
**Philosophy:** Prediction-first, ZERO data leakage, walk-forward methodology  
**Schema Version:** 1.1.0

---

## Executive Summary

This document defines the implementation plan for building a rigorous MLB research dataset that supports predictability analysis across multiple markets (HR, pitcher Ks, pitcher outs, F5, etc.) with strict temporal isolation.

### Critical Rule (Leakage Prevention)

> **For any game we are "predicting" in the historical backtest, we may ONLY use information that would have been known BEFORE ACTUAL FIRST PITCH of that game.**

This means:
- ❌ No using full-game stats or events from that game in features
- ❌ No using season totals that include that game
- ❌ No using opponent results from later that day/time
- ❌ No deriving batting order from PA sequence (that's post-hoc!)
- ✅ All rolling windows computed using ONLY games prior to target game (timestamp-aware sorting)
- ✅ Use ACTUAL first pitch time, not scheduled time, as the boundary

### V1.1 Changes (Based on Review Feedback)

| Change | Rationale |
|--------|-----------|
| Use `actual_first_pitch_utc` as leakage boundary | Scheduled time can leak in edge cases (delays, doubleheaders) |
| Added `lineup_confirmed` and explicit `lineup_source` | Distinguish official vs derived lineups |
| Added PA-based windows (PA20, PA40, PA80, PA160) | Game-based windows misleading for pinch-hitters |
| Added `bf` (batters faced) to pitcher stats | Required for proper K% calculation |
| Added pitcher `role` (starter/opener/bulk) | Handle opener strategy explicitly |
| Added `computed_from_internal_logs` flag | Prevent leakage from season summary endpoints |
| Created `labels_definition.md` | Explicit truth tables prevent backtest drift |
| Added "lite mode" schema | Full features in Parquet, thin JSON for iteration |

---

## Task Breakdown

| Task | Description | Status |
|------|-------------|--------|
| **1** | V1.1 Research Schema Definition | ✅ COMPLETE |
| **1.5** | Collect Full Game Feeds (2021-2025) | ✅ COMPLETE |
| **2** | Transform to V1.1 Schema (Game Records) | ✅ COMPLETE |
| **3** | Collect Statcast Profiles (2021-2025) | ✅ COMPLETE |
| **4** | Rolling Window Feature Engine | ✅ COMPLETE |
| **5** | Lineup Aggregation Engine | ✅ COMPLETE |
| **6** | Pitcher × Lineup Interaction Features | ✅ COMPLETE |
| **7** | Feature Contract Lock (FREEZE POINT 1) | ✅ COMPLETE |
| **8** | Enhanced Feature Build + Validation | 🔵 IN PROGRESS |
| **9** | Feature Snapshot Persistence (FREEZE POINT 2) | ⏳ Pending |
| **10** | Walk-Forward Backtesting | ⏳ Pending |

---

## Freeze Points (Mandatory)

### FREEZE POINT 1 — Feature Contract Lock ✅

**Artifacts Created:**
- `docs/feature_contract_v1.md` - Human-readable feature definitions
- `schemas/features_v1.json` - JSON Schema for validation
- `lib/mlb_research/__version__ = "1.0.0"`

**Rules:**
- A feature is illegal unless explicitly defined in the Feature Contract.
- If a feature definition changes, a NEW feature version is required (v2).
- Silent edits to v1 are forbidden.

### FREEZE POINT 2 — Feature Snapshot Persistence (Pending)

**Artifacts Required:**
- `data/features/features_v1.parquet` - Immutable feature table
- Keyed by (game_pk, entity_id)
- Models train ONLY on persisted features

### FREEZE POINT 3 — Model Definition Lock (Future)

**Artifacts Required (per market):**
- `models/<market>_v1/model_card.md`
- `models/<market>_v1/train.py`
- `models/<market>_v1/config.yaml`

### FREEZE POINT 4 — Production Interface Lock (Future)

**Artifacts Required:**
- `schemas/inference_input_v1.json`
- `schemas/inference_output_v1.json`

---

## Task 5: Lineup Aggregation Engine ✅ COMPLETE

**Purpose:** Compute lineup-level aggregate features from confirmed batting orders.

**Script:** `lib/mlb_research/lineup_aggregation.py`

**Features Computed:**
- PA-weighted lineup aggregates (full lineup, top5, bottom4)
- Lineup composition (L/R/S splits)
- vs Pitch Type tendencies (whiff/EV vs fastball/breaking/offspeed)
- vs Velocity Band tendencies (whiff vs elite/plus/avg/soft)
- vs Opposing SP Handedness (whiff/EV/barrel vs L or R)
- Positional context for H+R+RBI (ahead/behind slices)

**PA Weights by Batting Order:**
| Position | Weight |
|----------|--------|
| 1 | 0.120 |
| 2 | 0.117 |
| 3 | 0.115 |
| 4 | 0.112 |
| 5 | 0.109 |
| 6 | 0.107 |
| 7 | 0.104 |
| 8 | 0.102 |
| 9 | 0.099 |

---

## Task 6: Pitcher × Lineup Interaction Features ✅ COMPLETE

**Purpose:** Compute STRUCTURAL interaction features (NO raw PvB history).

**Script:** `lib/mlb_research/pitcher_lineup_interaction.py`

**Features Computed:**

### Pitch-Type Whiff Potential
- `fastball_whiff_potential` = SP fastball% × lineup whiff_vs_fastball%
- `breaking_whiff_potential` = SP breaking% × lineup whiff_vs_breaking%
- `offspeed_whiff_potential` = SP offspeed% × lineup whiff_vs_offspeed%
- `total_whiff_potential` = Sum of above

### Velocity Band Whiff Potential
- `velo_elite_whiff_potential` = SP elite_velo% × lineup whiff_vs_elite%
- `velo_weighted_whiff_potential` = Sum of velocity band potentials

### Chase/Discipline Matchup
- `chase_matchup` = SP chase_induced% × lineup chase%
- `csw_vs_contact` = SP csw% × (1 - lineup contact%)

### Contact Quality Matchup
- `barrel_matchup` = SP barrel_allowed% × lineup barrel%
- `ev_diff` = Lineup EV - SP EV_allowed

### Composite Features
- `k_potential_composite` = Weighted sum for K prediction
- `hr_risk` = Weighted sum for HR prediction
- `offense_potential` = Weighted sum for team total prediction

---

## Task 1.5: Collect Full Game Feeds ✅ COMPLETE

**Purpose:** Download complete GUMBO game feeds from MLB Stats API for all 2021-2025 regular season games.

**Script:** `scripts/collect_full_game_feeds.mjs`

**What it collects:**
- ✅ Lineups with batting order (from boxscore `battingOrder` field - NOT PA sequence)
- ✅ Actual first pitch time (from first pitch event in play-by-play)
- ✅ Full boxscore stats (H, HR, K, BB, IP, BF, pitches, etc.)
- ✅ Player metadata (handedness - bats/throws, positions)
- ✅ Weather (if available from feed)
- ✅ Venue info with dimensions
- ✅ Linescore (runs per inning for F5 calculations)

**Usage:**
```bash
# Collect all years (2021-2025)
node scripts/collect_full_game_feeds.mjs

# Collect specific year
node scripts/collect_full_game_feeds.mjs --year 2024

# Resume from where you left off (skip existing files)
node scripts/collect_full_game_feeds.mjs --resume

# Test with small batch
node scripts/collect_full_game_feeds.mjs --year 2024 --batch 10 --dry-run
```

**Output:**
```
data/mlb_research/raw/statsapi_games/
├── 2021/
│   ├── 634021.json
│   ├── 634022.json
│   └── ...
├── 2022/
├── 2023/
├── 2024/
└── 2025/
```

**Expected runtime:** ~2-4 hours for all 5 seasons (~12,000 games)

---

## Task 1 Deliverables (COMPLETED)

| File | Purpose |
|------|---------|
| `lib/mlb_research/types.v1.1.ts` | TypeScript schema with PA-based windows, opener handling |
| `lib/mlb_research/leakage_guard.v1.1.ts` | Validation using actual first pitch time |
| `data/mlb_research/docs/labels_definition.md` | Explicit truth tables for all markets |
| `lib/mlb_research/schema.json` | JSON Schema for validation |
| `lib/mlb_research/leakage_guard.test.ts` | Unit tests for leakage detection |

---

## Key Decisions Made

### 1. Lineup Data Source Strategy

**Primary:** MLB Stats API game feeds (official, reliable, TOS-safe)
**Fallback:** Only if MLB feed lacks data (rare edge cases)
**Rejected:** RotoWire scraping as primary (TOS risk, breaks often)

### 2. MCP Server Usage

The `mlb-api-mcp` server is a **convenience layer only**, not production-critical infrastructure. We build our own collectors that directly call MLB Stats API.

### 3. Abandoned Repos

Repos like `dailymlblineups` are **reference only** for understanding data structure, not dependencies.

---

## Directory Structure

```
data/mlb_research/
├── raw/                           # Unprocessed API responses
│   ├── statsapi_games/
│   │   ├── 2021/
│   │   │   ├── {game_pk}.json     # Full GUMBO feed per game
│   │   ├── 2022/
│   │   ├── 2023/
│   │   ├── 2024/
│   │   └── 2025/
│   └── statcast/                  # Raw Statcast pulls (if used)
│       ├── batted_balls/
│       └── pitch_level/
├── derived/                       # Processed per-game records
│   └── game_json_v1/
│       ├── 2021/
│       │   ├── {game_pk}.json     # V1 schema per game
│       ├── 2022/
│       ├── 2023/
│       ├── 2024/
│       └── 2025/
├── features/                      # Computed rolling features
│   ├── batter_windows.parquet
│   ├── pitcher_windows.parquet
│   └── team_windows.parquet
├── labels/                        # Outcome labels by market
│   └── labels_by_market.parquet
├── docs/                          # Schema documentation
│   ├── schema_v1.md
│   └── schema_v1.json
└── qa/                            # Quality assurance reports
    ├── lineup_anomalies.json
    └── leakage_test_results.json
```

---

## V1 Schema Components

### A. Game Metadata
```typescript
interface GameMetadata {
  game_pk: number;                    // MLB game primary key
  date_time_utc: string;              // ISO 8601 scheduled first pitch
  date_local: string;                 // YYYY-MM-DD local date
  season: number;                     // 2021-2025
  game_type: 'R';                     // Regular season only (filter out S, P, etc.)
  home_team_id: number;               // MLB team ID
  away_team_id: number;
  home_team_abbrev: string;           // e.g., "NYY"
  away_team_abbrev: string;
  venue_id: number;
  venue_name: string;
  day_night: 'day' | 'night';
  double_header: number;              // 0 = no, 1 = first, 2 = second
}
```

### B. Pregame Context (Known Before First Pitch)
```typescript
interface PregameContext {
  // Starting Pitchers
  home_sp: StartingPitcher;
  away_sp: StartingPitcher;
  
  // Confirmed Lineups
  home_lineup: LineupPlayer[];        // Array of 9 in batting order
  away_lineup: LineupPlayer[];
  
  // Park Factors (historical, per season)
  park_factors: ParkFactors;
  
  // Weather (optional v1, if available)
  weather?: WeatherSnapshot;
}

interface StartingPitcher {
  player_id: number;
  full_name: string;
  throws: 'L' | 'R';                  // Handedness
}

interface LineupPlayer {
  batting_order: number;              // 1-9
  player_id: number;
  full_name: string;
  bats: 'L' | 'R' | 'S';              // L=Left, R=Right, S=Switch
  primary_position: string;           // e.g., "CF", "1B", "DH"
}

interface ParkFactors {
  season: number;
  overall: number;                    // 1.00 = neutral
  vs_lhh: number;                     // Left-handed hitters
  vs_rhh: number;                     // Right-handed hitters
  hr_factor?: number;                 // HR-specific if available
}

interface WeatherSnapshot {
  temp_f: number;
  wind_speed_mph: number;
  wind_direction: string;             // "Out to CF", "In from RF", etc.
  humidity_pct?: number;
  pressure_mb?: number;
  source: 'mlb_api' | 'weather_api' | 'estimated';
}
```

### C. Pregame Feature Packs (Computed from Prior Games Only)
```typescript
interface PregameFeatures {
  // Batter features keyed by player_id
  batter_features: Record<number, BatterFeaturePack>;
  
  // Pitcher features
  home_sp_features: PitcherFeaturePack;
  away_sp_features: PitcherFeaturePack;
  
  // Team-level features
  home_team_features: TeamFeaturePack;
  away_team_features: TeamFeaturePack;
}

interface BatterFeaturePack {
  player_id: number;
  
  // Rolling windows: L3, L5, L10, L20, L40, STD
  windows: {
    L3: BatterWindowStats;
    L5: BatterWindowStats;
    L10: BatterWindowStats;
    L20: BatterWindowStats;
    L40: BatterWindowStats;
    STD: BatterWindowStats;           // Season-to-date (excludes target game)
  };
  
  // Statcast-derived (if available)
  statcast?: BatterStatcastStats;
}

interface BatterWindowStats {
  games: number;                      // Games in window
  pa: number;
  ab: number;
  h: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  k: number;
  
  // Computed rates
  avg: number;                        // H / AB
  obp: number;
  slg: number;
  iso: number;                        // SLG - AVG
  hr_per_pa: number;
  k_pct: number;
  bb_pct: number;
}

interface BatterStatcastStats {
  avg_ev: number;                     // Average exit velocity
  ev_90th: number;                    // 90th percentile EV
  barrel_pct: number;
  hard_hit_pct: number;               // 95+ mph
  la_mean: number;                    // Launch angle mean
  la_std: number;                     // Launch angle std dev
  gb_pct: number;
  fb_pct: number;
  pull_pct: number;                   // Spray chart
}

interface PitcherFeaturePack {
  player_id: number;
  
  // Rolling windows: L2, L3, L5, L10, L20
  windows: {
    L2: PitcherWindowStats;
    L3: PitcherWindowStats;
    L5: PitcherWindowStats;
    L10: PitcherWindowStats;
    L20: PitcherWindowStats;
  };
  
  // Season aggregates (STD, excludes target game)
  std: PitcherWindowStats;
}

interface PitcherWindowStats {
  games: number;                      // Starts in window
  ip: number;                         // Innings pitched
  outs: number;                       // Outs recorded
  k: number;
  bb: number;
  h: number;
  hr_allowed: number;
  
  // Computed rates
  k_pct: number;                      // K / BF
  bb_pct: number;
  k_bb_pct: number;                   // K% - BB%
  hr_per_9: number;
  whip: number;
  
  // Pitch efficiency
  pitches: number;
  pitches_per_ip: number;
  pitches_per_out: number;
  
  // Statcast-derived (if available)
  whiff_pct?: number;
  csw_pct?: number;                   // Called strikes + whiffs
  barrel_pct_allowed?: number;
}

interface TeamFeaturePack {
  team_id: number;
  
  // Rolling windows
  L5: TeamWindowStats;
  L10: TeamWindowStats;
  L20: TeamWindowStats;
  STD: TeamWindowStats;
}

interface TeamWindowStats {
  games: number;
  wins: number;
  losses: number;
  runs_scored: number;
  runs_allowed: number;
  
  // Offense
  team_avg: number;
  team_obp: number;
  team_slg: number;
  team_k_pct: number;
  team_bb_pct: number;
  team_hr: number;
  
  // Pitching (as a team)
  team_era: number;
  team_whip: number;
}
```

### D. Outcomes (Labels - Postgame Data, for Evaluation Only)
```typescript
interface GameOutcomes {
  // Game-level
  game_final_status: 'Final' | 'Postponed' | 'Suspended';
  home_score: number;
  away_score: number;
  innings: number;
  
  // First 5 innings
  f5_home_score: number;
  f5_away_score: number;
  
  // Player-level HR outcomes
  hr_outcomes: HROutcome[];
  
  // Starting pitcher outcomes
  home_sp_outcome: SPOutcome;
  away_sp_outcome: SPOutcome;
}

interface HROutcome {
  player_id: number;
  team_id: number;
  is_home_team: boolean;
  batting_order: number;
  hr_count: number;                   // 0, 1, 2, 3...
  hit_hr: boolean;                    // Binary for modeling
}

interface SPOutcome {
  player_id: number;
  ip: number;
  outs_recorded: number;
  k: number;
  bb: number;
  h: number;
  er: number;
  hr_allowed: number;
  pitches: number;
  decision: 'W' | 'L' | 'ND' | null;
}
```

### E. Full V1 Game Record
```typescript
interface GameRecordV1 {
  schema_version: 'v1';
  generated_at: string;               // ISO 8601
  
  metadata: GameMetadata;
  pregame: PregameContext;
  features: PregameFeatures;
  outcomes: GameOutcomes;
  
  // QA fields
  qa: {
    lineup_source: 'mlb_api_boxscore' | 'mlb_api_live' | 'reconstructed';
    lineup_complete: boolean;
    weather_available: boolean;
    statcast_available: boolean;
    anomalies: string[];
  };
}
```

---

## Walk-Forward Split Strategy

```
Training:     2021-01-01 to 2023-12-31
Validation:   2024-01-01 to 2024-12-31
Test:         2025-01-01 to 2025-12-31

Alternative (rolling yearly):
- Train 2021-2022, Test 2023
- Train 2021-2023, Test 2024
- Train 2021-2024, Test 2025
```

---

## Leakage Prevention Rules (Implemented in Code)

### Rule 1: Temporal Boundary Enforcement
```typescript
function assertNoLeakage(
  targetGame: GameRecordV1,
  featureInputs: FeatureInput[]
): void {
  const targetTime = new Date(targetGame.metadata.date_time_utc);
  
  for (const input of featureInputs) {
    if (new Date(input.game_datetime) >= targetTime) {
      throw new Error(
        `LEAKAGE DETECTED: Feature from game ${input.game_pk} ` +
        `(${input.game_datetime}) used for target game ` +
        `${targetGame.metadata.game_pk} (${targetGame.metadata.date_time_utc})`
      );
    }
  }
}
```

### Rule 2: Rolling Window Computation
```typescript
function computeRollingWindow(
  playerId: number,
  targetGameDatetime: Date,
  windowSize: number,
  allGames: PlayerGameLog[]
): WindowStats {
  // Filter to ONLY games before target
  const priorGames = allGames
    .filter(g => new Date(g.game_datetime) < targetGameDatetime)
    .sort((a, b) => 
      new Date(b.game_datetime).getTime() - new Date(a.game_datetime).getTime()
    )
    .slice(0, windowSize);
  
  return aggregateStats(priorGames);
}
```

### Rule 3: Season-To-Date Exclusion
```typescript
function computeSeasonToDate(
  playerId: number,
  targetGameDatetime: Date,
  season: number,
  allGames: PlayerGameLog[]
): WindowStats {
  const seasonStart = new Date(`${season}-01-01T00:00:00Z`);
  
  // Only games in this season AND before target game
  const stdGames = allGames.filter(g => {
    const gameDate = new Date(g.game_datetime);
    return gameDate >= seasonStart && 
           gameDate < targetGameDatetime &&
           g.season === season;
  });
  
  return aggregateStats(stdGames);
}
```

---

## Next Tasks Preview

### Task 2: Historical Lineup Reconstructor
- Build script to extract lineups from MLB Stats API boxscores
- Extract batting order 1-9 + handedness for all 2021-2025 games
- Store in V1 schema format
- Generate QA anomaly reports

### Task 3: Rolling Window Feature Engine
- Implement batter windows: L3, L5, L10, L20, L40, STD
- Implement pitcher windows: L2, L3, L5, L10, L20
- Add Statcast-derived features where available
- Ensure strict temporal ordering

### Task 4: Leakage Guardrail Module
- Implement assertion functions
- Unit tests with known games
- Integration tests for full pipeline

### Task 5: Integration + Sample Generation
- Generate sample V1 JSON for 2-3 games per season
- Validate schema compliance
- Run full pipeline on subset

---

## Files to Create (Task 1)

1. `lib/mlb_research/schema_v1.ts` - TypeScript interfaces
2. `data/mlb_research/docs/schema_v1.json` - JSON Schema
3. `data/mlb_research/docs/schema_v1.md` - Human-readable documentation
4. `lib/mlb_research/leakage_guard.ts` - Leakage prevention utilities

---

*Document generated: January 8, 2026*
*MLB Research V1 Implementation Plan*
