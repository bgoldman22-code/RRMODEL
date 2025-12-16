# EPL Profile C Pipeline Audit - STEP 6.1 Setup

**Date:** December 10, 2025  
**Task:** Create dedicated audit script that reuses production code  
**Status:** ✅ **COMPLETE**

---

## Overview

Created a new audit script that performs comprehensive verification of the EPL Profile C pipeline after the 3-key merge fix (Steps 1-5).

**Script Location:**
```
/Users/brentgoldman/Desktop/REPO33/RRMODEL/scripts/soccer/audit_epl_profile_c_pipeline.py
```

---

## Design Philosophy

### ✅ Reuse Production Code (NO Duplication)

The audit script **does not** reimplement merge logic or backtest functions. Instead, it **imports and calls** the production code:

```python
# Import production modules
from epl_profile_c_core import load_epl_data
from team_name_utils import standardize_team_name
from backtest_epl_profile_c_walkforward import (
    prepare_walkforward_data,
    run_full_walkforward,
    WALKFORWARD_CONFIG
)
```

This ensures:
- ✅ Audit uses **same code path** as production
- ✅ No drift between audit and production logic
- ✅ Changes to production code automatically reflected in audit
- ✅ Single source of truth for all operations

### ✅ Read-Only / Diagnostic Mode

The script:
- **Does NOT** change betting logic, thresholds, or Profile C behavior
- **Does NOT** modify hyperparameters or band definitions
- **Only** reads data, runs analyses, and collects metrics
- **Only** produces console output and markdown reports

---

## Audit Script Responsibilities

### STEP 6.2 - Merged Data Consistency Audit

**Function:** `audit_merged_data()`

**What it does:**
1. Loads raw data files using production `load_epl_data()` function
2. Applies 3-key merge using production `prepare_walkforward_data()` function
3. Computes and prints:
   - Total rows (results, odds, merged)
   - Coverage by season (table format)
   - Overall merge coverage percentage
   - BTTS rate in merged dataset vs EPL baseline (0.556)
   - Data quality checks (missing odds, date range, trusted flag)

**What it returns:**
- Dictionary with all metrics (coverage, BTTS rate, date range, etc.)
- Used for generating Step 6.2 markdown report

---

### STEP 6.3 - Walk-Forward Backtest Audit

**Function:** `audit_walkforward_backtest()`

**What it does:**
1. Calls production `run_full_walkforward()` function (same as production script)
2. Collects backtest metrics:
   - Total bets placed
   - Total profit (unit stakes and Kelly stakes)
   - ROI (return on investment)
   - Win rate
   - Bet distribution (YES vs NO)
   - Max drawdown
   - Performance by walk-forward step
3. Prints comprehensive summary

**What it returns:**
- Dictionary with all backtest metrics
- Used for generating Step 6.3 markdown report and regression checks

---

### STEP 6.4 - Edge Explorer Audit (Placeholder)

**To be implemented:**
- Function: `audit_edge_explorer()`
- Will verify that edge explorer uses same merged dataset
- Will collect edge metrics (bet-every-edge portfolios)
- Will confirm no compatibility issues

---

## Code Structure

### Main Function

```python
def main():
    """Main audit execution"""
    # Print header
    # STEP 6.2 - Merged data audit
    merged_metrics = audit_merged_data()
    
    # STEP 6.3 - Walk-forward backtest audit
    backtest_metrics = audit_walkforward_backtest()
    
    # STEP 6.4 - Edge explorer audit (TBD)
    # edge_metrics = audit_edge_explorer()
    
    # Print final summary
```

### Utility Functions

```python
def print_section_header(title):
    """Print formatted section header"""
    # Creates consistent section separators
```

---

## Imports and Dependencies

### Production Code Imports

```python
from epl_profile_c_core import load_epl_data
from team_name_utils import standardize_team_name
from backtest_epl_profile_c_walkforward import (
    prepare_walkforward_data,
    run_full_walkforward,
    WALKFORWARD_CONFIG
)
```

**Why these imports:**
- `load_epl_data()`: Loads results, team_stats, odds consistently
- `standardize_team_name()`: Canonical team name normalization (130+ mappings)
- `prepare_walkforward_data()`: 3-key merge logic (season, home_norm, away_norm)
- `run_full_walkforward()`: Complete backtest execution
- `WALKFORWARD_CONFIG`: Production config (90-day blocks, 365-day tuning, etc.)

### Standard Library Imports

```python
import pandas as pd
import numpy as np
import sys
from pathlib import Path
from datetime import datetime
```

---

## Configuration

```python
DATA_DIR = '/Users/brentgoldman/Desktop/REPO33/data/premier_league/'
OUTPUT_DIR = '/Users/brentgoldman/Desktop/REPO33/RRMODEL/'
```

**Data files used:**
- `historical_results.csv` (match results)
- `historical_completed_with_odds.csv` (BTTS odds)
- `team_stats_by_season.csv` (team performance stats)

All loaded via production `load_epl_data()` function.

---

## Execution Flow

### Phase 1: Setup
1. Import all production modules
2. Verify imports work (fail early if missing dependencies)
3. Print audit header with timestamp

### Phase 2: Data Audit (Step 6.2)
1. Load raw data using production loader
2. Apply 3-key merge using production function
3. Calculate coverage by season
4. Check BTTS rate vs baseline
5. Run data quality checks
6. Collect all metrics

### Phase 3: Backtest Audit (Step 6.3)
1. Run full walk-forward backtest using production function
2. Collect bet-level results
3. Calculate aggregate metrics (ROI, win rate, drawdown)
4. Analyze performance by step
5. Collect all metrics

### Phase 4: Edge Explorer Audit (Step 6.4 - TBD)
1. Verify edge explorer uses same merged data
2. Run edge analysis
3. Collect edge metrics
4. Confirm compatibility

### Phase 5: Summary
1. Print final summary with key metrics
2. Confirm all steps passed
3. Declare pipeline status (operational / issues)

---

## Next Steps

### STEP 6.2 (Ready to Execute)
- Run `audit_merged_data()` function
- Capture console output
- Generate markdown report: `EPL_PROFILE_C_PIPELINE_AUDIT_STEP6_2_MERGE_AND_BTTS.md`

### STEP 6.3 (Ready to Execute)
- Run `audit_walkforward_backtest()` function
- Capture console output
- Compare metrics to Step 5 results
- Generate markdown report: `EPL_PROFILE_C_PIPELINE_AUDIT_STEP6_3_WALKFORWARD.md`

### STEP 6.4 (Pending Implementation)
- Locate edge explorer script (`analyze_epl_profile_c_edges.py`)
- Update it to use 3-key merge (if not already)
- Add `audit_edge_explorer()` function to audit script
- Generate markdown report: `EPL_PROFILE_C_PIPELINE_AUDIT_STEP6_4_EDGE_EXPLORER.md`

### STEP 6.5 (Final Report)
- Consolidate all metrics from Steps 6.2-6.4
- Write master report: `EPL_PROFILE_C_FINAL_PIPELINE_AUDIT.md`
- Include verdict on production readiness

---

## Key Design Decisions

### ✅ Single Source of Truth
- Audit script has **zero duplicate logic**
- All operations call production functions
- Changes to production automatically apply to audit

### ✅ Read-Only Operations
- No model logic changes
- No threshold adjustments
- No config modifications
- Only diagnostic and reporting

### ✅ Comprehensive Coverage
- Tests data integrity (merge, BTTS rates)
- Tests backtest execution (bets, ROI, win rate)
- Tests edge explorer compatibility
- End-to-end pipeline verification

### ✅ Structured Reporting
- Each sub-step gets its own markdown report
- Final consolidated report ties everything together
- Tables, metrics, and verdicts for CTO review

---

## Conclusion

✅ **STEP 6.1 COMPLETE**

The audit script is now ready to execute Steps 6.2-6.4:
- **Script location:** `scripts/soccer/audit_epl_profile_c_pipeline.py`
- **Imports:** All production code paths (epl_profile_c_core, team_name_utils, backtest script)
- **Responsibilities:** Merge verification, backtest audit, edge explorer compatibility
- **Mode:** Read-only diagnostic (no logic changes)

Next: Execute Step 6.2 to verify merged data consistency.
