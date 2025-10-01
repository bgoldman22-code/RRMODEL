# Kelly Hybrid Staking System - Production Implementation

## Status: ✅ PRODUCTION-READY

Complete implementation of explicit hybrid Kelly criterion with Half-Kelly base, pre-defined multipliers, hard caps, and full audit trails.

---

## THE PROBLEM (Before)

**Decorative Kelly**: System calculated Kelly outputs but then manual overrides placed 2U-3U bets on 0.5U Kelly recommendations.

**Consequences**:
- 🔴 Kelly became window dressing (not actually used)
- 🔴 Variance increased by 16x (4x bet size = 16x variance)
- 🔴 Risk of ruin increased
- 🔴 No consistent methodology

**Example**:
```
Model: 58% confidence, 2% edge → Kelly says 0.5U
Reality: "I like this game" → Bet 3U anyway (6x Kelly!)
```

---

## THE SOLUTION (Now)

**Explicit Hybrid**: Half-Kelly base + pre-defined multipliers + hard caps + audit trail

**Benefits**:
- ✅ Consistent methodology (no arbitrary overrides)
- ✅ Variance reduced by 50% (Half-Kelly vs Full Kelly)
- ✅ Risk managed with caps (3.0U max)
- ✅ Full transparency (every multiplier documented)
- ✅ Trackable performance (Kelly-only vs Hybrid)

---

## SYSTEM ARCHITECTURE

### 1. Half-Kelly Base (Variance Reduction)

**Formula**: `base = 0.5 × full_kelly`

**Why Half-Kelly?**
- Reduces drawdowns by ~50%
- Maintains ~75% of full Kelly growth rate
- Industry standard for professional sports betting
- Still grows bankroll optimally over long term

**Full Kelly Formula**:
```
f = (bp - q) / b

where:
  b = decimal odds - 1
  p = win probability (model edge)
  q = 1 - p (loss probability)
  f = fraction of bankroll to bet
```

**Example**:
```javascript
Edge: 55% win probability at +124 (2.24 decimal)
Full Kelly: ~1.21U
Half-Kelly Base: ~0.61U
```

---

### 2. Multiplier Factors (Pre-Defined Only)

**Additive Factors** (sum these first):

| Factor | Condition | Multiplier |
|--------|-----------|------------|
| **Market Agreement** | CLV ≥ 0.5 pts OR line moved toward you ≥ 0.5 pts | **+0.3** |
| **Smart Money Split** | Tickets < 45% AND Handle ≥ 60% on your side | **+0.3** |
| **Availability Confidence** | Canonical availability conf ≥ 0.85 AND no market shock | **+0.2** |
| **Fresh Injury Edge** | Depth/injury change within 24h AND > 2 pt swing | **+0.3** |
| **Model Edge (High)** | Edge ≥ 8% | **+0.4** |
| **Model Edge (Medium)** | Edge ≥ 6% (and < 8%) | **+0.2** |
| **Cross-Model Consensus** | R/EPA + another model both ≥ 55% win on same side | **+0.2** |
| **Contrarian Tax** | Tickets ≥ 65% against you | **+0.1** |

**Penalty Factors** (multiply after adding):

| Factor | Condition | Multiplier |
|--------|-----------|------------|
| **Uncertainty Penalty** | Rookie/unproven QB OR market shock active | **×0.8** |
| **Correlated Risk** | ≥ 3 bets correlated (same team/game) | **×0.85** |

**Computation**:
```javascript
multiplier = 1.0
  + (sum of applicable additive factors)
  × (product of applicable penalty factors)

// Then clamp to [0.7, 2.5]
```

**Example**:
```
Signals:
- Market agreement (CLV 0.8 pts): +0.3
- Smart money (40% tickets, 68% handle): +0.3  
- High availability confidence (0.88): +0.2
- Fresh injury edge (2.5 pts, 18h ago): +0.3
- Model edge 8.5%: +0.4
- Cross-model consensus: +0.2

Raw multiplier: 1.0 + 1.7 = 2.7x
Clamped: 2.5x (max multiplier)
```

---

### 3. Hard Rails (Non-Negotiable)

#### Per-Bet Limits
- **Absolute Maximum**: 3.0U (never exceed)
- **Multiplier Cap vs Base**: 2.5x Half-Kelly base (can't bet more than 2.5x base)
- **Minimum Kelly Threshold**: Full Kelly must be ≥ 0.10U to bet (else PASS)
- **Minimum Bet Floor**: 0.25U (only if base ≥ 0.15U)

#### Multiplier Clamps
- **Minimum Multiplier**: 0.7x (can't reduce below 70% of base)
- **Maximum Multiplier**: 2.5x (can't exceed 2.5x base)

#### Exposure Guards
- **Daily Maximum**: 12U total stakes per day
- **Per-Game Maximum**: 5U total across all markets on same game

**Example Application**:
```
Base: 1.2U
Multiplier: 2.8x (from signals)
Raw stake: 1.2 × 2.8 = 3.36U

Caps check:
- 2.5x base: 1.2 × 2.5 = 3.0U
- Absolute max: 3.0U
- Final: min(3.0, 3.0, 3.36) = 3.0U ✅
```

---

## USAGE EXAMPLES

### Example 1: Baseline (No Multipliers)

**Scenario**: 55% win probability, +124 odds, no special signals

```javascript
const signals = {
  clvPts: 0,
  lineMoveToward: 0,
  ticketsPct: 50,
  handlePct: 50,
  availabilityConf: 0.8,
  marketShockActive: false,
  injurySwingPts: 0,
  edgePct: 4,
  crossModelAgree: false,
  rookieOrUnprovenQB: false,
  highCorrelation: false
};

const result = recommendUnits(0.55, 2.24, signals);
// Output: ~0.61U (1.0x multiplier, Half-Kelly base only)
```

---

### Example 2: Strong Signals

**Scenario**: MIN vs CLE, Flacco benched for rookie Gabriel

```javascript
const signals = {
  clvPts: 0.3,              // Line hasn't fully adjusted
  lineMoveToward: 0.2,
  ticketsPct: 58,           // Public on MIN
  handlePct: 48,
  availabilityConf: 0.82,   // Depth chart confirmed
  marketShockActive: false,
  injurySwingPts: 6.5,      // Major QB downgrade
  injuryConfirmedHours: 8,  // Announced this morning
  edgePct: 6.2,             // Solid edge
  crossModelAgree: false,
  rookieOrUnprovenQB: true, // Gabriel is rookie
  highCorrelation: false
};

const result = recommendUnits(0.57, 2.10, signals);

// Factors applied:
// - Fresh injury edge: +0.3 (confirmed QB change > 2 pts)
// - Model edge: +0.2 (6.2% in medium bucket)
// - Rookie penalty: ×0.8 (Gabriel unproven)
// 
// Multiplier: (1.0 + 0.5) × 0.8 = 1.2x
// Recommended: ~0.73U (VALUE bet tier)
```

---

### Example 3: Maximum Multiplier

**Scenario**: Dream setup (all signals firing)

```javascript
const signals = {
  clvPts: 1.5,              // +0.3 (market agreement)
  ticketsPct: 40,           // +0.3 (smart money split)
  handlePct: 72,
  ticketsAgainst: 70,       // +0.1 (contrarian)
  availabilityConf: 0.90,   // +0.2 (high confidence)
  injurySwingPts: 3.5,      // +0.3 (fresh injury)
  injuryConfirmedHours: 12,
  edgePct: 9.5,             // +0.4 (high edge)
  crossModelAgree: true,    // +0.2 (consensus)
  marketShockActive: false,
  rookieOrUnprovenQB: false,
  highCorrelation: false
};

const result = recommendUnits(0.58, 2.5, signals);

// Raw multiplier: 1.0 + 0.3 + 0.3 + 0.1 + 0.2 + 0.3 + 0.4 + 0.2 = 2.8x
// Clamped: 2.5x (max multiplier)
// Final stake: Capped at 3.0U or 2.5x base (whichever lower)
// Recommendation: STRONG_BET (≥ 2.0U tier)
```

---

### Example 4: Edge Too Small (PASS)

**Scenario**: Only 1% edge, tiny Kelly

```javascript
const result = recommendUnits(0.51, 2.0, signals);

// Full Kelly: ~0.02U
// Below 0.10U threshold
// Output: { units: 0, recommendation: 'PASS', reason: 'kelly_too_small' }
```

---

## EXPOSURE GUARDS

### Daily Limit Check

**Rule**: Total daily stakes cannot exceed 12U

```javascript
const existingBets = [
  { units: 2.0, date: '2025-10-01', gameId: 'MIN@CLE' },
  { units: 1.5, date: '2025-10-01', gameId: 'LAR@CHI' },
  { units: 2.5, date: '2025-10-01', gameId: 'SF@ARI' },
  // ... total 8.5U today
];

const check = checkExposureLimits(3.0, existingBets, 'DAL@NYG', '2025-10-01');
// 8.5 + 3.0 = 11.5U < 12U ✅ ALLOWED
```

### Per-Game Limit Check

**Rule**: Total stakes on one game cannot exceed 5U

```javascript
const check = checkExposureLimits(2.0, existingBets, 'MIN@CLE', '2025-10-01');
// MIN@CLE already has 3.5U
// 3.5 + 2.0 = 5.5U > 5U ❌ VIOLATION

// Output:
{
  allowed: false,
  violations: [{
    type: 'GAME_LIMIT',
    current: 3.5,
    proposed: 2.0,
    newTotal: 5.5,
    limit: 5.0,
    excess: 0.5
  }]
}
```

---

## AUDIT TRAIL

Every bet recommendation includes full audit trail:

```javascript
{
  units: 1.47,
  recommendation: 'BET',
  reason: 'Multipliers: MARKET_AGREEMENT, FRESH_INJURY_EDGE | Penalties: UNCERTAINTY_PENALTY',
  audit: {
    kellyRawU: 1.210,
    baseHalfKellyU: 0.605,
    rawMultiplier: 2.430,
    clampedMultiplier: 2.430,
    rawStake: 1.470,
    cap: 1.513,
    finalUnits: 1.47,
    appliedFactors: [
      { factor: 'MARKET_AGREEMENT', value: 0.3, condition: 'CLV >= 0.5 pts...' },
      { factor: 'FRESH_INJURY_EDGE', value: 0.3, condition: 'Depth/injury...' }
    ],
    appliedPenalties: [
      { factor: 'UNCERTAINTY_PENALTY', value: 0.8, condition: 'Rookie/unproven...' }
    ],
    signals: { /* full signal context */ }
  }
}
```

**Benefits**:
- ✅ Full transparency on every bet
- ✅ Reproducible recommendations
- ✅ Can track which factors add value
- ✅ Compliance-ready audit trail

---

## PERFORMANCE TRACKING

### Compare Kelly-Only vs Hybrid

**After each bet resolves**:

```javascript
const bet = {
  units: 1.5,              // Hybrid recommendation
  odds: 2.10,
  audit: {
    baseHalfKellyU: 1.2,  // What Half-Kelly alone would have bet
    clampedMultiplier: 1.25
  }
};

const result = { won: true };
const tracking = trackPerformance(bet, result);

// Output:
{
  kellyOnly: {
    units: 1.2,
    profit: 1.32,          // 1.2 × (2.10 - 1)
    roi: 1.10
  },
  hybrid: {
    units: 1.5,
    profit: 1.65,          // 1.5 × (2.10 - 1)
    roi: 1.10
  },
  delta: {
    profitDiff: 0.33,      // Hybrid made $0.33 more
    multiplierApplied: 1.25,
    wasWorthIt: true       // Profit increased with larger bet
  }
}
```

**Dashboard Metrics** (track over 100+ bets):
- Kelly-only ROI vs Hybrid ROI
- Kelly-only variance vs Hybrid variance
- Which multiplier factors add value
- Which penalties saved you from losses

---

## RECOMMENDATION TIERS

Based on final units:

| Units | Tier | Description |
|-------|------|-------------|
| ≥ 2.0U | **STRONG_BET** | Best opportunities (rare) |
| ≥ 1.0U | **BET** | Solid bets (regular action) |
| ≥ 0.5U | **VALUE** | Smaller edges (be selective) |
| ≥ 0.25U | **LEAN** | Minimal bet (borderline) |
| < 0.25U | **PASS** | Don't bet |

---

## INTEGRATION STEPS

### Step 1: Import the System

```javascript
import {
  recommendUnits,
  buildSignalsFromContext,
  checkExposureLimits
} from './netlify/functions/_lib/kelly-hybrid-staking.mjs';
```

### Step 2: Build Signals from Your Data

```javascript
const signals = buildSignalsFromContext(
  gameContext,
  prediction,
  availabilityData,  // From canonical-availability-v5
  marketData
);
```

### Step 3: Get Recommendation

```javascript
const recommendation = recommendUnits(
  prediction.probability,  // Your model's win probability
  prediction.odds,         // Decimal odds
  signals
);

if (recommendation.recommendation === 'PASS') {
  // Don't bet
} else {
  // Check exposure before finalizing
  const exposure = checkExposureLimits(
    recommendation.units,
    existingBets,
    gameId,
    date
  );
  
  if (exposure.allowed) {
    // Place bet!
    placeBet(recommendation.units);
  } else {
    // Log violation, don't bet
    console.warn('Exposure limit violated:', exposure.violations);
  }
}
```

### Step 4: Log for Audit

```javascript
const betLog = {
  gameId,
  date,
  recommendation,
  exposure,
  timestamp: Date.now()
};

saveToDB(betLog);
```

### Step 5: Track Performance

```javascript
// After bet resolves
const result = { won: true };  // or false
const performance = trackPerformance(bet, result);
updateMetrics(performance);
```

---

## TESTING

Run comprehensive tests:

```bash
node test-kelly-hybrid-staking.js
```

**Test Coverage**:
1. ✅ Basic Kelly calculations
2. ✅ Baseline (no multipliers)
3. ✅ Strong signals (multiple multipliers)
4. ✅ Uncertainty penalties
5. ✅ Edge too small (PASS)
6. ✅ Exposure limits
7. ✅ Multiplier clamping
8. ✅ Real-world example (MIN vs CLE)
9. ✅ Performance tracking

---

## FAQ

### Q: Why Half-Kelly instead of Full Kelly?

**A**: Half-Kelly reduces drawdowns by ~50% while maintaining ~75% of growth. Industry standard for professional sports betting where edges are smaller and bankroll preservation matters.

### Q: Can I override the multipliers?

**A**: No. That defeats the purpose. If you think a factor is wrong, change the factor definition (with backtesting), don't override case-by-case.

### Q: What if multiple factors fire?

**A**: They sum (additively), then penalties multiply, then clamp to [0.7, 2.5]. Maximum possible multiplier is 2.5x.

### Q: What if my edge is tiny?

**A**: System will return `PASS` if full Kelly < 0.10U. Don't bet tiny edges—they're not worth the variance.

### Q: How do I know if multipliers are adding value?

**A**: Use `trackPerformance()` after each bet. Dashboard shows Kelly-only vs Hybrid performance. After 50-100 bets, you'll see which factors help.

### Q: What about parlays?

**A**: This system is for straight bets only. Parlays need separate Kelly calculation (use reduced edge assumption).

---

## BOTTOM LINE

**Before**: "I like this game, let's bet 3U" (decorative Kelly)

**Now**: "Signals fire: +0.3 market, +0.3 injury, ×0.8 rookie penalty → 1.2x multiplier → 0.73U" (explicit hybrid)

**Result**:
- ✅ Consistent methodology
- ✅ Variance managed
- ✅ Risk controlled
- ✅ Fully auditable
- ✅ Trackable performance

**This system is production-ready and eliminates decorative Kelly completely.** 🎯
