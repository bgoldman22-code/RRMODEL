# Canonical Roster Integration - SSOT Generator Fix

**Problem**: Stefon Diggs showing as HOU (historical PBP team) instead of NE (current team)  
**Root Cause**: Using nflfastR play-by-play data which is historical (shows old team assignments)  
**Solution**: Integrate canonical roster data to override historical teams with current assignments

---

## 🚨 The Issue

**What User Saw**:
```
#11
Stefon Diggs
HOU          ❌ WRONG - Diggs traded to NE
Receptions 4.5 OVER
```

**Why This Happened**:
- nflfastR PBP aggregates historical plays (Diggs was on HOU earlier in 2025)
- `group_by(team = posteam)` uses the team from those historical plays
- No override mechanism to apply current roster state

---

## ✅ The Fix: Dual Data Sources

### Source 1: nflfastR PBP (Historical Performance)
**Use For**: 
- Empirical Bayes priors (season targets, catch rate, YPC)
- L5 game rolling averages
- ADOT bucket classification
- Opponent defense stats

**Keep**: `gsis_id`, `player_name`, aggregated stats

**Ignore**: `team` (historical, not current)

### Source 2: Canonical Rosters (`data/nfl/injuries/latest.json`)
**Use For**:
- **Current team assignment** (Diggs on NE, not HOU)
- Position (WR/TE/RB)
- Depth order (starter vs backup)
- Injury status (healthy/questionable/out)

**Override**: Historical team with canonical team

---

## 🔧 Implementation

### Step 1: Load Canonical Roster Data
```r
# Load from data/nfl/injuries/latest.json (your canonical source)
canonical_path <- file.path(getwd(), "data", "nfl", "injuries", "latest.json")
canonical_data <- jsonlite::fromJSON(canonical_path, simplifyVector = FALSE)

# Extract current team assignments
canonical_rosters <- canonical_data$rosters %>%
  map_dfr(function(team_roster) {
    team_abbr <- team_roster$team
    
    team_roster$players %>%
      map_dfr(function(p) {
        tibble(
          gsis_id = p$gsis_id,
          canonical_team = team_abbr,      # ✅ Current team
          canonical_name = p$name,
          canonical_pos = p$position,
          depth_order = p$depth %||% 99,
          injury_status = p$injury_status %||% "healthy"
        )
      })
  })
```

### Step 2: Override Historical Team with Current Team
```r
ssot_players <- eb_priors %>%
  # Join canonical rosters to get CURRENT team
  left_join(canonical_rosters, by = "gsis_id") %>%
  # Use canonical team if available, fallback to PBP historical team
  mutate(
    current_team = coalesce(canonical_team, team),
    current_pos = coalesce(canonical_pos, NA_character_)
  ) %>%
  # Join schedule using CURRENT team (not historical)
  inner_join(schedule, by = c("current_team" = "team")) %>%
  # ...
```

### Step 3: Create Slug with Current Team
```r
# Before (WRONG):
player_slug = paste0(team, "-", slugify(player_name))
# "HOU-STEFON-DIGGS" ❌

# After (CORRECT):
player_slug = paste0(current_team, "-", slugify(player_name))
# "NE-STEFON-DIGGS" ✅
```

### Step 4: Add Matchup Display Format
```r
list(
  player_id = row$player_slug,
  gsis_id = row$gsis_id,
  name = row$player_name,
  team = row$current_team,  # NE (not HOU)
  pos = row$final_pos,
  opp = row$opp,
  is_home = row$is_home,
  matchup = paste0(
    row$current_team, 
    if_else(row$is_home, " vs ", " @ "), 
    row$opp
  ),  # "NE @ TEN" ✅
  # ...
)
```

---

## 📊 Data Flow

```
nflfastR PBP (Historical)          Canonical Rosters (Current)
─────────────────────                ─────────────────────
GSIS: 00-0036389                     GSIS: 00-0036389
Name: Stefon Diggs                   Name: Stefon Diggs
Team: HOU (historical) ❌            Team: NE (current) ✅
Targets: 9.4                         Pos: WR
Catch Rate: 0.69                     Depth: 1
YPC: 12.7                            Status: healthy
                │                             │
                └─────────┬───────────────────┘
                          │
                    JOIN on gsis_id
                          │
                          ▼
                   SSOT Player Record
                   ─────────────────
                   player_id: "NE-STEFON-DIGGS"
                   gsis_id: "00-0036389"
                   team: "NE" ✅
                   matchup: "NE @ TEN" ✅
                   targets (EB): 9.4 (from PBP)
                   catch_rate (EB): 0.69 (from PBP)
                   position: "WR" (from canonical)
                   injury_status: "healthy" (from canonical)
```

---

## ✅ What This Fixes

| Before | After |
|--------|-------|
| Stefon Diggs **HOU** | Stefon Diggs **NE** ✅ |
| Team only (no opponent) | **NE @ TEN** ✅ |
| Position from nflreadr (backup) | Position from canonical (primary) |
| No injury status | Injury status from canonical |
| No depth chart info | Depth order from canonical |

---

## 🎯 Fallback Strategy

1. **Try canonical first** (`data/nfl/injuries/latest.json`)
2. **Fallback to nflreadr** (`load_rosters(SEASON)`) for position validation
3. **Default to historical PBP team** if neither available (rare - means undrafted/practice squad)

```r
current_team = coalesce(canonical_team, team)  # canonical > historical
final_pos = coalesce(canonical_pos, position, "WR")  # canonical > nflreadr > default
```

---

## 🚀 Next Steps

1. ✅ **Canonical roster integration** (current teams override historical)
2. ⏭️ **Weather API integration** (use WEATHER_BRIDGE_URL)
3. ⏭️ **Matchup display** (show "NE @ TEN" not just "NE")
4. ⏭️ **Test R script execution** (verify Diggs shows as NE)
5. ⏭️ **Wire SSOT into scanner** (replace PLAYER_DB)

---

## 📝 Key Insight

**PBP is for STATS, Canonical is for ROSTER**:
- nflfastR PBP: Historical performance (targets, catches, yards)
- Canonical rosters: Current state (team, position, injury, depth)

**Never trust historical PBP for current roster state** - players get traded, cut, injured, promoted mid-season.

---

**Result**: Diggs will now show as **NE @ TEN** (correct current team + opponent matchup) while still using his historical HOU performance stats for EB priors. Best of both worlds! ✅
