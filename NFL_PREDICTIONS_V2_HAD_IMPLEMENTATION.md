# NFL Predictions V2: HAD (Healthy Average Depth) Integration

## Overview
Created a parallel V2 prediction system that uses HAD (Healthy Average Depth) to fix injury impact calculations, without affecting the existing V1 system. This allows safe A/B testing and 2-week monitoring before full rollout.

## Problem Statement
**Critical Bug in V1:**
- Injured starters appear lower on depth charts (game-day reality)
- Impact calculations use current depth position
- Example: Bucky Irving (RB1) injured → shows as RB3 → calculates -0.9 pts impact instead of true -2.8 pts
- Systematic underestimation of injury impacts

## Solution Architecture

### V2 System Components

1. **canonical-availability-v5-had.mjs** (NEW)
   - Separate module from V1's `canonical-availability-v5.mjs`
   - Adds HAD depth override logic
   - V1 completely unchanged and unaffected

2. **nfl-predictions-generate-v2/** (NEW)
   - Copy of V1 generator with HAD integration
   - Imports `canonical-availability-v5-had.mjs` instead of V1 version
   - Loads `public/healthy-average-depth.json` at startup
   - Passes HAD data to all `buildCanonicalAvailability()` calls
   - Saves to separate blob: `predictions-v2/current.json`

3. **nfl-predictions-get-v2/** (NEW)
   - Reads from `predictions-v2/current.json`
   - Identical to V1 except blob path
   - Returns HAD-enhanced predictions

### HAD Override Logic

**When player is OUT or DOUBTFUL:**
```javascript
// V2 Enhancement in canonical-availability-v5-had.mjs
if (this._hadData && this._hadPlayerKey && (this.status === 'out' || this.status === 'doubtful')) {
  const hadEntry = this._hadData[this._hadPlayerKey];
  if (hadEntry && hadEntry.healthyAverageDepth) {
    trustedDepth = hadEntry.healthyAverageDepth; // Use HAD instead of current depth
    
    console.log(`🎯 HAD OVERRIDE: ${this.playerName} depth ${this.depthOrder} → ${trustedDepth}`);
  }
}

const depthMultiplier = depthMultipliers[trustedDepth] || 0.1; // Use trusted depth for impact calculation
```

**Depth Multipliers:**
- Depth 1 (Starter): 1.0 × base impact
- Depth 2 (Key backup): 0.4 × base impact  
- Depth 3 (Third string): 0.15 × base impact

**Example Fix:**
```
Bucky Irving injured:
V1: current depth = 3 → multiplier = 0.15 → impact = -0.9 pts ❌
V2: HAD = 1 → multiplier = 1.0 → impact = -2.8 pts ✅
```

### Graceful Fallback
```javascript
// If HAD file missing or player not found
try {
  hadData = JSON.parse(await readFile('public/healthy-average-depth.json'));
  console.log(`📊 HAD loaded: ${Object.keys(hadData).length} players`);
} catch {
  console.warn('⚠️  HAD unavailable, V2 uses same depth logic as V1');
  hadData = null; // Falls back to current depth (same as V1)
}
```

## Files Created

### Core Logic
- `/netlify/functions/_lib/canonical-availability-v5-had.mjs` (1049 lines)
  - HAD-enabled availability calculator
  - Depth override in `_calculateSkillPositionImpact()`

### Prediction Generator
- `/netlify/functions/nfl-predictions-generate-v2/index.mjs` (3387 lines)
  - V2 generator with HAD loading
  - Separate blob storage key: `predictions-v2/current.json`
  - Cache key: `nfl-predictions-v2-{season}-week{week}`

### API Endpoint
- `/netlify/functions/nfl-predictions-get-v2/index.mjs` (97 lines)
  - Read-only endpoint for V2 predictions
  - Reads from `predictions-v2/current.json`
  - Returns `X-Prediction-Version: v2-had` header

## V1 vs V2 Isolation

**V1 System (UNCHANGED):**
- `/netlify/functions/_lib/canonical-availability-v5.mjs` ✅
- `/netlify/functions/nfl-predictions-generate/index.mjs` ✅
- `/netlify/functions/nfl-predictions-get/index.mjs` ✅
- Blob storage: `predictions/current.json` ✅
- Frontend: `/nfl-predictions` ✅

**V2 System (NEW):**
- `/netlify/functions/_lib/canonical-availability-v5-had.mjs` 🆕
- `/netlify/functions/nfl-predictions-generate-v2/index.mjs` 🆕
- `/netlify/functions/nfl-predictions-get-v2/index.mjs` 🆕
- Blob storage: `predictions-v2/current.json` 🆕
- Frontend: `/nfl-predictions-v2` 🆕 (TODO)

**Zero Cross-Contamination:**
- Separate imports (V1 uses `canonical-availability-v5.mjs`, V2 uses `canonical-availability-v5-had.mjs`)
- Separate blob storage paths
- Separate cache keys
- Separate API endpoints

## Testing Strategy

### Expected Results
| Player | V1 Impact | V2 Impact (HAD) | Reason |
|--------|-----------|-----------------|--------|
| Bucky Irving (TB RB) | -0.9 pts | **-2.8 pts** | HAD=1 (true starter), current=3 (injured) |
| Jayden Daniels (WAS QB) | -1.5 pts | **-6.5 pts** | HAD=1 (starter), current=2 (injured) |
| Healthy starters | Same | Same | No override when active |

### Validation Steps
1. Generate V2 predictions: `GET /.netlify/functions/nfl-predictions-generate-v2`
2. Compare injury impacts in response JSON
3. Verify HAD loading logs: `📊 HAD loaded: 546 players`
4. Verify override logs: `🎯 HAD OVERRIDE: Bucky Irving depth 3 → 1`

## Next Steps

### Phase 1: Frontend (TODO)
- Create `/nfl-predictions-v2` page
- Side-by-side comparison with V1
- Highlight differences in injury impacts

### Phase 2: Monitoring (2 weeks)
- Track V2 accuracy vs V1
- Compare to actual game outcomes
- Document edge cases

### Phase 3: Rollout Decision
- If V2 performs better → migrate V1 to use HAD
- If issues found → keep V1, iterate V2
- Rollback plan: just keep V1 endpoint

## Dependencies
- HAD Calculator: `/scripts/calculate-healthy-average-depth.js` ✅
- HAD Data: `/public/healthy-average-depth.json` (546 players) ✅
- Manual Baseline: `/public/manual-depth-baseline.json` (32 teams) ✅
- Injury Reports: `/public/history/2025/week8/injury-reports.json` ✅

## Deployment Status
- [x] HAD calculator v1.1 complete
- [x] HAD data generated and committed
- [x] V2 generator created
- [x] V2 GET endpoint created  
- [x] V2 canonical availability created
- [ ] V2 frontend page
- [ ] V2 predictions generated (first test)
- [ ] 2-week monitoring period

## Safety Features
1. **Graceful degradation**: V2 falls back to V1 logic if HAD unavailable
2. **Separate blob storage**: No risk of corrupting V1 predictions
3. **Detailed logging**: HAD overrides clearly visible in logs
4. **Version headers**: `X-Prediction-Version: v2-had` identifies V2 responses
5. **Rollback ready**: Keep V1 unchanged, can disable V2 anytime

## Debug Commands
```bash
# Generate V2 predictions
curl https://bgroundrobin.com/.netlify/functions/nfl-predictions-generate-v2

# Get V2 predictions
curl https://bgroundrobin.com/.netlify/functions/nfl-predictions-get-v2

# Compare V1 vs V2
curl https://bgroundrobin.com/.netlify/functions/nfl-predictions-get > v1.json
curl https://bgroundrobin.com/.netlify/functions/nfl-predictions-get-v2 > v2.json
diff v1.json v2.json

# Check HAD data
jq '.["Tampa Bay Buccaneers_RB_Bucky Irving"]' public/healthy-average-depth.json
```

## Success Criteria
- V2 generates without errors
- HAD overrides apply to injured starters
- Bucky Irving impact increases from -0.9 to ~-2.8 pts
- Healthy starters show identical impacts (V1 = V2)
- No performance degradation (HAD loads < 100ms)

---
**Status**: Implementation complete, ready for frontend and testing
**Date**: October 24, 2025
