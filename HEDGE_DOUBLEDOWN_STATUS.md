# NBA Elite V2 — Hedge + Double Down Upgrade (Status)

**Date:** 2026-02-06

This doc is a quick snapshot of *exactly where we are*, *what we’re building*, and *what we’re trying to prove* with the new Spread/ML-only hedging + double-down system.

---

## 1) What we’re doing (one-liner)

We’re upgrading NBA Elite V2 to output **three additive bet line-items per game** (Primary / Hedge / DoubleDown) for **Spread + Moneyline only**, then running a **historical comparison** to quantify ROI vs drawdown/variance tradeoffs.

---

## 2) Why we’re doing it (the goal)

We want a system that:

- **Hedges rarely**, and only when they’re **EV-aware** or provide **cheap tail-risk reduction** (not “hedge everything”).
- **Double downs only when we’re truly confident**, and only when the secondary bet adds **convex upside** (not redundant expensive juice).
- Produces a **backtest report** that answers:
  - Does hedging reduce drawdowns enough to justify any EV drag?
  - Does double-down improve ROI, or just increase variance?
  - Which regimes benefit most (dogs/favs, spreads/ML, win prob/edge buckets, juice buckets)?

---

## 3) Current scope and constraints

### Supported markets
- ✅ Spread
- ✅ Moneyline
- ❌ Team totals (explicitly not supported yet)

### Outputs must be additive
- Primary always remains visible.
- Hedge and DoubleDown are *optional* extra line items.

---

## 4) Where the implementation lives (files)

### Core logic (implemented)
- `netlify/functions/_lib/nba/hedge-doubledown-v2.mjs`
  - New **V2** hedge + double-down generator.
  - EV-aware hedge gates, mapping rules, juice constraints, stake caps.

### Legacy wrapper / integration layer (exists)
- `netlify/functions/_lib/nba/bet-hedging.mjs`
  - Existing hedge/double-down helper used by the API.
  - (We still need to confirm final wiring: whether `index.mjs` calls V2 directly, or via this module re-export.)

### API endpoint
- `netlify/functions/nba-predictions-elite-v2/index.mjs`
  - Elite V2 predictions endpoint.
  - This is where we must ensure per-game output includes:
    - `primaryBet`
    - `hedgeBet` (nullable)
    - `doubleDownBet` (nullable)
    - `notes`
    - `stakeGuidance`

### Unit tests (implemented)
- `scripts/nba/test-hedge-doubledown.mjs`
  - Node-based unit tests covering the critical gating + mapping requirements.

### Backtest harness (placeholder / not implemented yet)
- `scripts/nba/backtest-elite-v2.mjs`
  - **Currently empty** (0 lines).
  - This is the missing piece for the historical comparison report.

### Additional script (present)
- `scripts/nba/backtest-hedge-doubledown.mjs`
  - Exists in repo; not yet reviewed in this status snapshot.

---

## 5) The bet “contract” we’re trying to enforce

For each game, we conceptually have:

1. **PRIMARY BET** — the main recommendation (Spread or ML)
2. **HEDGE** — only when uncertain; opposite-outcome insurance
3. **DOUBLE DOWN** — only when very confident; same-outcome kicker

We also need to cap stacking:
- Cap total per-game exposure at **~1.6× primary** (implemented as `MAX_TOTAL_EXPOSURE_MULTIPLIER`).

---

## 6) What’s implemented right now (logic highlights)

### Hedge is EV-aware and rare
In `hedge-doubledown-v2.mjs` we have hedge gates:

- Only **LOW/MED** confidence.
- Primary edge must be in **[3%, 7%]**.
- Never hedge if hedge ML is worse than **-240**.
- Hedge stake is capped at **≤ 25%** of primary.
- Hedge must be either:
  - **+EV**, or
  - only slightly -EV on a *per-unit* basis (a “cheap variance tax”).

### Double down mapping focuses on convex upside
Key constraints:

- Only **HIGH confidence** and edge **≥ 8%**.
- If we’d double down into **favorite ML**, we enforce a hard juice gate (default **-220**, stricter in some paths).
- Sprinkle size scales roughly **15%–30%** based on odds.

Mapping intent (Spread/ML only):

- **Underdog spread primary (+pts)** → DD = **underdog ML sprinkle**
- **Favorite spread primary (-pts)** → DD = **favorite alt spread** if available; else **favorite ML only if not too juiced**
- **Favorite ML primary** → DD = **favorite spread**
- **Underdog ML primary** → DD = **underdog spread** *or nothing* (depending on availability)

---

## 7) What’s missing / what we still need to finish

### A) Confirm API wiring + output schema fields
We still need to **verify in `nba-predictions-elite-v2/index.mjs`** that we’re:

- Computing `primaryBet` as before (no suppression)
- Adding `hedgeBet` and `doubleDownBet` as separate nested objects
- Populating `notes` and `stakeGuidance` strings

(Implementation partially exists via the new module, but we must confirm the endpoint output is exactly as requested.)

### B) Front-end + PNG rendering
We need to ensure UI clearly shows:

- PRIMARY
- HEDGE (if present)
- DOUBLE DOWN (if present)

And that PNG export contains the same line-items.

### C) Historical backtest (the big deliverable)
We still need to implement the comparison backtest and report generation:

- Baseline: Primary only
- Primary + Hedge
- Primary + DoubleDown
- Full system

**Required metrics:**
- Total ROI, net units
- Primary win rate
- Avg odds / avg stake
- Max drawdown
- Std dev of daily returns
- Sharpe-like ratio
- Tail risk: % days down more than X units

**Required slices:**
- Favorite vs underdog primary
- Spread vs ML primary
- WinProb buckets: <60%, 60–68%, ≥68%
- Edge buckets: 3–5%, 5–8%, 8–12%, 12%+
- ML juice buckets: -110 to -180, -180 to -240, worse than -240, plus-money

**Output artifacts:**
- A single **summary JSON**
- A readable **markdown report** with tables + a data-driven conclusions section

Right now, `scripts/nba/backtest-elite-v2.mjs` is empty, so the historical evaluation has not been executed yet.

---

## 8) Tests: what exists and what “run tests” means

We currently have a runnable Node test file:

- `scripts/nba/test-hedge-doubledown.mjs`

It covers the required sanity checks (edge gate, juice gate, mapping rules, and exposure cap behavior).

Next step for “Run the tests” is to execute that script (and/or integrate into a repo-wide test runner if one exists).

---

## 9) What we’re hoping to achieve (success criteria)

1. **Correctness:**
   - No hedges on low-edge primaries.
   - No expensive redundant double-down ML.
   - Mapping rules match the outcome narrative.
   - Stake exposure is capped.

2. **Backtest evidence:**
   - Hedge improves drawdown/tail risk enough to justify any EV drag.
   - Double-down improves ROI in the right regimes and doesn’t just add noise.

3. **Usability:**
   - Output is clean: primary remains the main call, with hedge/DD as explicit add-ons and short “why” notes.

---

## 10) Immediate next actions

1. Run `scripts/nba/test-hedge-doubledown.mjs` and fix any failures.
2. Verify Elite V2 endpoint output contains the new additive fields.
3. Implement `scripts/nba/backtest-elite-v2.mjs` (currently empty): generate JSON + markdown report across the standard validation date range.
4. Wire front-end + PNG export to render the new line items cleanly.
