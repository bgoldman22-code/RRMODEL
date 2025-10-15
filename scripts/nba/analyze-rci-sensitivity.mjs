#!/usr/bin/env node

/**
 * Phase 2 Analysis - RCI Parameter Sensitivity
 * 
 * Tests different ALPHA values to see impact on predictions
 */

console.log('🔬 RCI Parameter Sensitivity Analysis\n');
console.log('='.repeat(70));

// Celtics data
const BOS_RCI = 0.670;
const RCI_CENTER = 0.75;
const LOSS_MULTIPLIER = 1.2;

// Current (conservative) parameters
const CURRENT = {
  ALPHA_OFF: 4.0,
  ALPHA_DEF: 3.5,
};

// Potential Phase 2 parameters
const SCENARIOS = [
  { name: 'Current (Conservative)', ALPHA_OFF: 4.0, ALPHA_DEF: 3.5 },
  { name: 'Moderate', ALPHA_OFF: 6.0, ALPHA_DEF: 5.0 },
  { name: 'Aggressive', ALPHA_OFF: 8.0, ALPHA_DEF: 7.0 },
  { name: 'Very Aggressive', ALPHA_OFF: 10.0, ALPHA_DEF: 8.5 },
];

console.log('\n📊 Celtics Impact Under Different ALPHA Values\n');
console.log('-'.repeat(70));
console.log('RCI: 0.670 (lost Jrue, Horford, KP)');
console.log('RCI Delta: -0.08 (8% below league average)');
console.log('Asymmetry: 1.2x (losses hurt more)\n');

SCENARIOS.forEach(scenario => {
  const deltaOff = scenario.ALPHA_OFF * (BOS_RCI - RCI_CENTER) * LOSS_MULTIPLIER;
  const deltaDef = scenario.ALPHA_DEF * (BOS_RCI - RCI_CENTER) * LOSS_MULTIPLIER;
  const netImpact = Math.abs(deltaOff) + Math.abs(deltaDef);
  
  // Estimate spread impact (rough conversion)
  const spreadImpact = netImpact * 0.7; // pts/100 to spread conversion
  
  console.log(`${scenario.name}:`);
  console.log(`  ALPHA_OFF: ${scenario.ALPHA_OFF}, ALPHA_DEF: ${scenario.ALPHA_DEF}`);
  console.log(`  ΔOff: ${deltaOff.toFixed(2)} pts/100`);
  console.log(`  ΔDef: ${deltaDef.toFixed(2)} pts/100`);
  console.log(`  Combined Impact: ${netImpact.toFixed(2)} pts/100`);
  console.log(`  Estimated Spread Impact: ${spreadImpact.toFixed(1)} points`);
  console.log();
});

console.log('='.repeat(70));
console.log('\n📋 Thunder (Best Continuity) Comparison\n');
console.log('-'.repeat(70));

const OKC_RCI = 0.961;
const GAIN_MULTIPLIER = 0.8;

console.log('RCI: 0.961 (kept everyone)');
console.log('RCI Delta: +0.211 (21% above league average)');
console.log('Asymmetry: 0.8x (gains help less)\n');

SCENARIOS.forEach(scenario => {
  const deltaOff = scenario.ALPHA_OFF * (OKC_RCI - RCI_CENTER) * GAIN_MULTIPLIER;
  const deltaDef = scenario.ALPHA_DEF * (OKC_RCI - RCI_CENTER) * GAIN_MULTIPLIER;
  const netImpact = deltaOff + deltaDef;
  const spreadImpact = netImpact * 0.7;
  
  console.log(`${scenario.name}:`);
  console.log(`  ΔOff: +${deltaOff.toFixed(2)} pts/100`);
  console.log(`  ΔDef: +${deltaDef.toFixed(2)} pts/100`);
  console.log(`  Combined Impact: +${netImpact.toFixed(2)} pts/100`);
  console.log(`  Estimated Spread Impact: +${spreadImpact.toFixed(1)} points`);
  console.log();
});

console.log('='.repeat(70));
console.log('\n💡 Phase 2 Recommendation\n');
console.log('-'.repeat(70));
console.log('APPROACH: Start conservative, optimize with empirical data');
console.log();
console.log('OPTIONS:');
console.log('1. Keep current (4.0, 3.5) → Wait for 10-15 games → Backtest');
console.log('2. Increase to moderate (6.0, 5.0) → More aggressive early');
console.log('3. Make it tunable → A/B test different values');
console.log();
console.log('RECOMMENDATION: Option 1 (stay conservative)');
console.log('WHY: Need real data to validate. Overcorrection could hurt MAE.');
console.log();
console.log('TATUM INJURY: Separate issue - needs injury impact system');
console.log('RCI handles: Offseason roster changes only');
console.log('Need separate: In-season injury adjustments');
console.log();
console.log('='.repeat(70));
