# BTTS Evaluation Audit - File Index

**Complete verification of BTTS two-sided betting evaluation pipeline**

---

## Quick Start

**Want the bottom line?** → Read `AUDIT_QUICK_REFERENCE.txt` (2-page summary)

**Want full details?** → Read `BTTS_COMPLETE_AUDIT_SUMMARY.md` (comprehensive report)

**Want to run audits yourself?** → See "Reproduction Scripts" section below

---

## Executive Summaries

### 📄 AUDIT_QUICK_REFERENCE.txt
- **Format:** Plain text, visual tables
- **Length:** 2 pages
- **Content:** Verdict, corrected results, key code verified, usage instructions
- **Audience:** Quick reference, decision-making

### 📄 BTTS_COMPLETE_AUDIT_SUMMARY.md
- **Format:** Markdown
- **Length:** ~15 pages
- **Content:** Combined ROI + W/L audit summary, methodology, findings, recommendations
- **Audience:** Technical review, comprehensive understanding

---

## Detailed Audit Reports

### W/L (Wins/Losses) Audit

#### 📄 BTTS_WALKFORWARD_WINRATE_AUDIT.md
- **Format:** Markdown
- **Length:** ~20 pages
- **Content:** 
  - Comprehensive W/L verification
  - Methodology (reconstruction approach)
  - Per-fold validation snapshots
  - Code logic comparison
  - Edge case validation
  - Aggregated comparison tables
- **Verdict:** ✅ PERFECT MATCH (zero discrepancies)

#### 📄 WINRATE_AUDIT_VISUAL_SUMMARY.txt
- **Format:** Plain text, ASCII tables
- **Length:** 5 pages
- **Content:**
  - Visual comparison tables
  - Per-fold sample verification
  - Key insights (selectivity patterns)
  - Code logic side-by-side
  - Performance patterns
- **Purpose:** Easy visual reference for W/L verification

### ROI Audit

#### 📄 BTTS_ROI_AUDIT_RESULTS.md
- **Format:** Markdown
- **Length:** ~25 pages
- **Content:**
  - Comprehensive ROI verification
  - Microscopic test harness (5-match synthetic)
  - Fair odds calculation audit
  - Bug discovery (100x reporting bug)
  - Code inspection (line-by-line)
  - Corrected vs wrong comparisons
- **Verdict:** ✅ Logic correct, ❌ Reporting bug found

#### 📄 ROI_BUG_VISUAL_COMPARISON.txt
- **Format:** Plain text, side-by-side tables
- **Length:** 3 pages
- **Content:**
  - Corrected ROI values vs wrong (reported) values
  - Visual demonstration of 100x overstatement
  - Model comparisons
- **Purpose:** Quick reference for corrected ROI values

---

## Reproduction Scripts

### W/L Audit Script

**File:** `scripts/verify_walkforward_winrates.py`
- **Language:** Python 3
- **Length:** 239 lines
- **Dependencies:** src/load_data, src/build_features, src/walkforward, src/model_baselines
- **What it does:**
  1. Loads same data as production
  2. Creates same walk-forward folds
  3. Trains Poisson model per fold
  4. Reconstructs W/L counts independently
  5. Compares to original CSV row-by-row
- **Output:**
  - Console: Per-fold progress, comparison table, discrepancy analysis
  - CSV: `results/walkforward_poisson_winrate_audit_raw.csv` (per-fold)
  - CSV: `results/walkforward_poisson_winrate_audit_agg.csv` (aggregated)

**Usage:**
```bash
cd research/btts_option_c/
python3 scripts/verify_walkforward_winrates.py
```

**Expected Output:** "PERFECT MATCH" (zero discrepancies)

### ROI Audit Script

**File:** `scripts/sanity_check_btts_roi.py`
- **Language:** Python 3
- **Length:** ~150 lines
- **Dependencies:** src/evaluate (imports run_two_sided_threshold_sweep)
- **What it does:**
  1. Creates synthetic 5-match dataset
  2. Manually calculates expected ROI
  3. Calls run_two_sided_threshold_sweep()
  4. Compares function output to manual calculations
- **Output:** Console assertions (PASS/FAIL)

**Usage:**
```bash
cd research/btts_option_c/
python3 scripts/sanity_check_btts_roi.py
```

**Expected Output:** "SANITY CHECK PASSED" (all assertions succeed)

---

## Output Data Files

### W/L Audit Outputs

#### results/walkforward_poisson_winrate_audit_raw.csv
- **Rows:** 48 (6 folds × 8 threshold combinations)
- **Columns:** model, fold, side, threshold, n_bets, n_wins, win_rate, train_start, train_end, test_start, test_end, train_matches, test_matches
- **Purpose:** Per-fold reconstructed W/L stats for detailed comparison

#### results/walkforward_poisson_winrate_audit_agg.csv
- **Rows:** 8 (YES/NO × 4 thresholds)
- **Columns:** model, side, threshold, n_bets, n_wins, win_rate
- **Purpose:** Aggregated across folds for direct comparison to original CSV

**Sample:**
```csv
model,side,threshold,n_bets,n_wins,win_rate
poisson,YES,0.5,154,117,0.7597402597402597
poisson,YES,0.55,119,94,0.7899159663865546
poisson,YES,0.6,88,71,0.8068181818181818
poisson,YES,0.65,65,53,0.8153846153846154
```

---

## Related Documentation

### Other Audit Files (Not Part of W/L Audit)

- `BTTS_ODDS_AUDIT_COMPLETE.md` - Odds data quality audit (separate scope)
- `BTTS_ODDS_AND_LABEL_AUDIT.md` - Label alignment audit (separate scope)
- `FEATURE_SAFETY_AUDIT.md` - Feature leakage audit (separate scope)

These are **not part** of the ROI/W/L evaluation audit but may be relevant for other aspects of the pipeline.

---

## File Organization

```
research/btts_option_c/
├── AUDIT_QUICK_REFERENCE.txt           ← Start here (2-page summary)
├── BTTS_COMPLETE_AUDIT_SUMMARY.md      ← Comprehensive combined audit
│
├── BTTS_WALKFORWARD_WINRATE_AUDIT.md   ← W/L audit (detailed)
├── WINRATE_AUDIT_VISUAL_SUMMARY.txt    ← W/L audit (visual)
│
├── BTTS_ROI_AUDIT_RESULTS.md           ← ROI audit (detailed)
├── ROI_BUG_VISUAL_COMPARISON.txt       ← ROI audit (visual)
│
├── scripts/
│   ├── verify_walkforward_winrates.py  ← W/L audit script
│   └── sanity_check_btts_roi.py        ← ROI audit script
│
└── results/
    ├── walkforward_poisson_winrate_audit_raw.csv  ← Per-fold W/L
    └── walkforward_poisson_winrate_audit_agg.csv  ← Aggregated W/L
```

---

## Reading Guide

### For Decision-Makers

1. Read: `AUDIT_QUICK_REFERENCE.txt` (verdict + corrected results)
2. Optional: `BTTS_COMPLETE_AUDIT_SUMMARY.md` (methodology + recommendations)

### For Technical Review

1. Read: `BTTS_COMPLETE_AUDIT_SUMMARY.md` (overall approach)
2. Deep dive: `BTTS_WALKFORWARD_WINRATE_AUDIT.md` (W/L verification)
3. Deep dive: `BTTS_ROI_AUDIT_RESULTS.md` (ROI verification)
4. Visual check: `WINRATE_AUDIT_VISUAL_SUMMARY.txt` and `ROI_BUG_VISUAL_COMPARISON.txt`

### For Reproduction

1. Read: "Reproduction Scripts" section (this document)
2. Run: `python3 scripts/verify_walkforward_winrates.py`
3. Run: `python3 scripts/sanity_check_btts_roi.py`
4. Compare: Audit CSVs to original `walkforward_two_sided_roi.csv`

---

## Key Findings Summary

### ✅ What's Correct

- W/L counting logic (PERFECT MATCH across 48 audit points)
- ROI calculation logic (validated with microscopic test)
- Fair odds calculation (two-way vig removal)
- Threshold masks (prob >= threshold AND odds available)
- Label mapping (YES → y_true=1, NO → y_true=0)
- Fold aggregation (simple sum)
- Walk-forward infrastructure (no data leakage)

### ❌ What's Wrong

- ROI reporting bug: Display uses `.2%` format on percentage values → 100x overstatement
  - Example: 31.98% displayed as "3198.26%"
  - Fix: Change `f"{roi_fair:.2%}"` to `f"{roi_fair:.2f}%"`
  - Impact: Cosmetic only (underlying CSV is correct)

---

## Questions?

**How do I know if W/L stats are correct?**  
→ Read `BTTS_WALKFORWARD_WINRATE_AUDIT.md`, check comparison table (should show zero discrepancies)

**How do I know if ROI stats are correct?**  
→ Read `BTTS_ROI_AUDIT_RESULTS.md`, run `scripts/sanity_check_btts_roi.py` (should PASS)

**Can I trust the CSV file?**  
→ Yes for W/L and underlying ROI values, but display formatting overstates ROI by 100x

**How do I reproduce the audits?**  
→ See "Reproduction Scripts" section above

**What's the bottom-line recommendation?**  
→ Read `AUDIT_QUICK_REFERENCE.txt`, section "BOTTOM LINE"

---

**Last Updated:** 2025-01-14  
**Status:** ✅ Audit complete, pipeline verified correct
