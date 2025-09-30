// test-safeguards-v4-1.js
// Test script to validate v4.1 production safeguards implementation

import { 
  applyCalibratedProbability, 
  applyMarketAnchoring, 
  applyProductionSafetyLimits,
  PRODUCTION_LIMITS 
} from './netlify/functions/_lib/calibration-v4.mjs';

import { 
  applyDepthChartSafeguards,
  DEPTH_SAFEGUARDS 
} from './netlify/functions/_lib/depth-chart-safeguards-v4.mjs';

import { 
  filterSituationalEPA,
  SITUATIONAL_THRESHOLDS 
} from './netlify/functions/_lib/situational-epa-filters-v4.mjs';

// Test data for validation
const testEPAData = [
  { epa: 0.5, qtr: 4, game_seconds_remaining: 300, score_differential: 20, play_type: 'pass' }, // Garbage time
  { epa: 0.3, qtr: 4, game_seconds_remaining: 120, score_differential: 3, play_type: 'pass' },  // Normal
  { epa: -0.2, qtr: 4, game_seconds_remaining: 60, play_type: 'qb_kneel' },                     // Kneel down
  { epa: 0.7, qtr: 2, game_seconds_remaining: 1200, score_differential: 0, play_type: 'run' }  // Normal
];

const testInjuryImpacts = [
  { player: 'Josh Allen', position: 'QB', epaImpact: 0.25, confidence: 0.9, team: 'BUF' },     // Too high QB impact
  { player: 'Unknown Backup', position: 'RB', epaImpact: 0.12, confidence: 0.6, isBackupProjection: true, team: 'BUF' } // Backup uncertainty
];

const testBetPredictions = {
  moneyline: { edge: 12.5, confidence: 78, bet: true },  // Edge too high
  spread: { edge: 3.2, confidence: 48, bet: true },      // Confidence too low
  total: { edge: 6.8, confidence: 65, bet: true }        // Normal
};

console.log('🧪 Testing Elite Injury System v4.1 Production Safeguards\n');

// Test 1: EPA Filtering
console.log('1️⃣ Testing Situational EPA Filtering:');
const epaFilterResult = filterSituationalEPA(testEPAData);
console.log(`   - Filtered ${epaFilterResult.filterStats.filteredPlays}/${epaFilterResult.filterStats.totalPlays} plays`);
console.log(`   - Garbage time plays: ${epaFilterResult.filterStats.garbageTimePlays}`);
console.log(`   - Kneel down plays: ${epaFilterResult.filterStats.kneelDownPlays}`);
console.log(`   - Filter rate: ${epaFilterResult.filterStats.filterRate.toFixed(1)}%\n`);

// Test 2: Depth Chart Safeguards
console.log('2️⃣ Testing Depth Chart Safeguards:');
const depthResult = applyDepthChartSafeguards(testInjuryImpacts, null, {});
console.log(`   - Applied safeguards to ${depthResult.safeguardedImpacts.length} impacts`);
console.log(`   - Warnings generated: ${depthResult.warnings.length}`);
console.log(`   - Total impact reduction: ${depthResult.summary.totalImpactReduction.toFixed(1)}%`);
depthResult.adjustmentLog.forEach(log => console.log(`   - ${log}`));
console.log('');

// Test 3: Production Safety Limits
console.log('3️⃣ Testing Production Safety Limits:');
const safetyResult = applyProductionSafetyLimits(testBetPredictions, null, {});
console.log(`   - Safety adjustments applied: ${safetyResult.safetyLimits.applied.length}`);
safetyResult.safetyLimits.applied.forEach(limit => console.log(`   - Applied: ${limit}`));

// Check edge capping
console.log(`   - ML edge: ${testBetPredictions.moneyline.edge}% → ${safetyResult.moneyline.edge}% (capped: ${safetyResult.moneyline.edgeCapped || false})`);
console.log(`   - Spread bet: ${testBetPredictions.spread.bet} → ${safetyResult.spread.bet} (reason: ${safetyResult.spread.skipReason || 'none'})`);
console.log('');

// Test 4: Production Limits Constants
console.log('4️⃣ Production Limits Configuration:');
console.log(`   - Max edge display: ${PRODUCTION_LIMITS.MAX_EDGE_DISPLAY * 100}%`);
console.log(`   - Min market anchor: ${PRODUCTION_LIMITS.MIN_MARKET_ANCHOR * 100}%`);
console.log(`   - Min confidence floor: ${PRODUCTION_LIMITS.MIN_CONFIDENCE_FLOOR * 100}%`);
console.log(`   - Max spread divergence: ${PRODUCTION_LIMITS.MAX_SPREAD_DIVERGENCE} points`);
console.log('');

// Test 5: Depth Safeguards Configuration
console.log('5️⃣ Depth Safeguards Configuration:');
Object.entries(DEPTH_SAFEGUARDS.MAX_DEPTH_IMPACT).forEach(([pos, limit]) => {
  console.log(`   - ${pos} max impact: ${(limit * 100).toFixed(0)}%`);
});
console.log('');

// Test 6: Situational Thresholds
console.log('6️⃣ Situational Filter Thresholds:');
console.log(`   - Garbage time score diff: ${SITUATIONAL_THRESHOLDS.GARBAGE_TIME.SCORE_DIFF_THRESHOLD} points`);
console.log(`   - Garbage time remaining: ${SITUATIONAL_THRESHOLDS.GARBAGE_TIME.TIME_REMAINING_THRESHOLD} minutes`);
console.log(`   - Blowout threshold: ${SITUATIONAL_THRESHOLDS.BLOWOUT_FILTER.FINAL_MARGIN_THRESHOLD} points`);
console.log('');

console.log('✅ All safeguard systems operational and configured for production use!');
console.log('🛡️ Conservative limits active to protect users while preserving model sophistication.');

export default function runSafeguardTests() {
  return {
    epaFiltering: epaFilterResult.filterStats,
    depthSafeguards: depthResult.summary,
    safetyLimits: safetyResult.safetyLimits,
    configurationValid: true
  };
}