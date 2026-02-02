# MLB Research V1.1 - Label Definitions

**Version:** 1.1.0  
**Last Updated:** 2026-01-08  
**Purpose:** Explicit truth tables for market label extraction to prevent backtest drift

---

## Critical Principles

1. **Labels are extracted from `outcome` fields ONLY** - never from pregame/features
2. **Each label must have an unambiguous definition** - no edge case interpretation
3. **Opener games require special handling** - flag and optionally exclude
4. **QA checks validate label extraction** - run on known games before full backtest

---

## Batter Markets

### 1. Home Run (HR)

| Field | Definition |
|-------|------------|
| **Binary Label** | `outcome.{home,away}_batters[].hit_hr` |
| **Count Label** | `outcome.{home,away}_batters[].hr` |
| **Positive Condition** | Player hit ≥1 HR in game |
| **Eligibility** | Player appeared in confirmed starting lineup (batting order 1-9) |

**Edge Cases:**
- Pinch hitters: EXCLUDE (not in starting lineup pregame)
- Player ejected before first AB: EXCLUDE (no opportunity)
- Suspended/resumed games: Use final box score stats

**QA Check:**
```sql
-- Sum of individual HRs should equal game total
SUM(home_batters.hr) + SUM(away_batters.hr) = outcome.total_hr
```

---

### 2. Hits + Runs + RBIs (H+R+RBI)

| Field | Definition |
|-------|------------|
| **Count Label** | `outcome.{home,away}_batters[].h_r_rbi` |
| **Binary Label (3+)** | `outcome.{home,away}_batters[].h_r_rbi_3_plus` |
| **Calculation** | `h + runs + rbi` |
| **Eligibility** | Player in confirmed starting lineup |

**Edge Cases:**
- RBI on FC/error: Counted (official RBI)
- Run scored on error: Counted (official run)
- Double-counting: A player can get credit for both run and RBI on same play

**Common Lines:**
- Over/Under 1.5 H+R+RBI
- Over/Under 2.5 H+R+RBI
- Over/Under 3.5 H+R+RBI

---

### 3. Stolen Bases (SB)

| Field | Definition |
|-------|------------|
| **Count Label** | `outcome.{home,away}_batters[].sb` |
| **Binary Label** | `outcome.{home,away}_batters[].sb_1_plus` |
| **Positive Condition** | Player stole ≥1 base |
| **Eligibility** | Player in confirmed starting lineup |

**Edge Cases:**
- Caught stealing: NOT counted (only successful SB)
- Defensive indifference: May or may not be scored as SB (use official scoring)
- Pinch runner SB: EXCLUDE (not in starting lineup)

---

## Pitcher Markets

### 4. Pitcher Strikeouts (Ks)

| Field | Definition |
|-------|------------|
| **Count Label** | `outcome.{home,away}_pitcher.k` |
| **Binary Labels** | `k_5_plus`, `k_6_plus`, `k_7_plus`, `k_8_plus` |
| **Eligibility** | Pitcher was listed as starting pitcher pregame |

**CRITICAL: Opener Handling**

| Scenario | Rule |
|----------|------|
| Traditional starter | Use all Ks recorded |
| Listed SP is opener (1-2 IP) | **FLAG in QA, consider excluding** |
| Bulk pitcher | Do NOT use (not listed as SP pregame) |

**Detection Logic:**
```typescript
// Flag games where listed SP recorded < 9 outs (< 3 IP)
if (outcome.{home,away}_pitcher.outs_recorded < 9) {
  qa.issues.push('LOW_OUTS_POSSIBLE_OPENER');
  qa.{home,away}_starter_is_opener = true;
}
```

**Recommendation:** For Ks market research, create two datasets:
1. **Clean dataset:** Exclude games where SP outs < 9
2. **Full dataset:** Include all, with opener flag for analysis

---

### 5. Pitcher Outs Recorded

| Field | Definition |
|-------|------------|
| **Count Label** | `outcome.{home,away}_pitcher.outs_recorded` |
| **Calculation** | `floor(ip) * 3 + (ip % 1) * 10` (e.g., 6.2 IP = 20 outs) |
| **Binary Labels** | `outs_15_plus` (5+ IP), `outs_18_plus` (6+ IP), `outs_21_plus` (7+ IP) |
| **Eligibility** | Pitcher was listed as starting pitcher pregame |

**CRITICAL: Same opener handling as Ks**

**Common Lines:**
- Over/Under 14.5 outs recorded (4.2 IP)
- Over/Under 16.5 outs recorded (5.1 IP)
- Over/Under 17.5 outs recorded (5.2 IP)
- Over/Under 18.5 outs recorded (6.0+ IP)

**Edge Cases:**
- Rain-shortened games: Use actual outs, but FLAG in QA
- Ejection: Use actual outs, but FLAG in QA
- Injury exit: Use actual outs, but FLAG in QA

---

## Game-Level Markets

### 6. First 5 Innings (F5)

| Field | Definition |
|-------|------------|
| **Home F5 Score** | `outcome.home_f5_score` |
| **Away F5 Score** | `outcome.away_f5_score` |
| **F5 Total** | `outcome.f5_total_runs` |
| **Over/Under** | Compare to `pregame.odds.f5_total` |

**CRITICAL: Bottom of 5th Handling**

| Scenario | Rule |
|----------|------|
| Full 5 innings played | Use both teams' scores through 5 |
| Home team leading, doesn't bat bottom 5 | `home_batted_bottom_5 = false`; use only top 5 for home |
| Game suspended before end of 5 | FLAG in QA, may need to exclude |

**F5 Total Calculation:**
```typescript
// Standard case
f5_total_runs = home_f5_score + away_f5_score;

// QA flag
if (!outcome.home_batted_bottom_5) {
  qa.issues.push('HOME_DID_NOT_BAT_BOTTOM_5');
}
```

**F5 Result Labels:**
```typescript
f5_home_win = home_f5_score > away_f5_score;
f5_away_win = away_f5_score > home_f5_score;
f5_tie = home_f5_score === away_f5_score;
```

---

### 7. Team Totals

| Field | Definition |
|-------|------------|
| **Home Total** | `outcome.home_score` |
| **Away Total** | `outcome.away_score` |
| **Game Total** | `outcome.total_runs` |

**Edge Cases:**
- Extra innings: Include all runs
- Suspended games: Use final completed score

---

## QA Validation Checks

### Check 1: Label Consistency
```typescript
// All batters in lineup should have outcome records
assert(outcome.home_batters.length >= 9);
assert(outcome.away_batters.length >= 9);

// Sum of components should match totals
const homeHR = outcome.home_batters.reduce((s, b) => s + b.hr, 0);
const awayHR = outcome.away_batters.reduce((s, b) => s + b.hr, 0);
assert(homeHR + awayHR === outcome.total_hr);
```

### Check 2: Opener Detection
```typescript
function detectOpener(pitcherOutcome: PitcherGameOutcome): boolean {
  return (
    pitcherOutcome.outs_recorded < 9 &&  // Less than 3 IP
    pitcherOutcome.was_first_pitcher     // Was the first pitcher for team
  );
}
```

### Check 3: F5 Validity
```typescript
function validateF5(outcome: GameOutcome): string[] {
  const issues: string[] = [];
  
  if (outcome.innings < 5) {
    issues.push('GAME_LESS_THAN_5_INNINGS');
  }
  
  if (!outcome.home_batted_bottom_5 && outcome.home_f5_score > 0) {
    // This could be valid (scored in earlier innings) but worth checking
  }
  
  return issues;
}
```

### Check 4: Score Reconciliation
```typescript
// F5 scores should not exceed final scores
assert(outcome.home_f5_score <= outcome.home_score);
assert(outcome.away_f5_score <= outcome.away_score);

// Total should match sum
assert(outcome.home_score + outcome.away_score === outcome.total_runs);
```

---

## Exclusion Criteria

Games should be **excluded from research dataset** if:

| Condition | Reason |
|-----------|--------|
| `pregame.lineup_source === 'incomplete'` | Cannot validate starting lineup |
| `outcome.innings < 5` | F5 market invalid |
| `qa.issues.includes('SUSPENDED_GAME')` | Outcome may be from different conditions |
| `outcome.delay_reason` contains major delay | Weather/context may have changed |

Games should be **flagged but included** with:

| Flag | Meaning |
|------|---------|
| `home_starter_is_opener` | Starter may have limited Ks/outs opportunity |
| `away_starter_is_opener` | Starter may have limited Ks/outs opportunity |
| `!actual_first_pitch_available` | Leakage boundary uses scheduled time |
| `!lineup_confirmed` | Lineup derived from postgame data |

---

## Market-Specific Recommendations

### For HR Market:
- **Minimum sample:** 50+ PA for batter rolling stats
- **Primary features:** Barrel rate, HR/FB, park factor, pitcher HR/9
- **Key split:** LHB vs RHP, RHB vs LHP

### For Pitcher Ks Market:
- **EXCLUDE opener games** for clean research
- **Primary features:** K%, whiff rate, opposing team K%
- **Key context:** Ballpark, day/night, rest days

### For Pitcher Outs Market:
- **EXCLUDE opener games** for clean research
- **Primary features:** Pitches per start (L5), pitch efficiency, team bullpen status
- **Key risk:** Blowouts (pulled early), struggles (short outing)

### For F5 Market:
- **Use F5-specific odds** (`pregame.odds.f5_total`)
- **Primary features:** Starter quality metrics, bullpen NOT relevant
- **Key edge case:** Home team not batting bottom 5

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-01-08 | Added opener handling, F5 bottom-5 rules, PA-based windows |
| 1.0.0 | 2026-01-07 | Initial label definitions |

---

*This document is the source of truth for label extraction. Any deviation from these definitions in code is a bug.*
