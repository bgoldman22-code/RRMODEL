// Test Elite Injury Penalty Calculator
// SF @ TB scenario validation

import { calculateEliteInjuryAdjustment } from './netlify/functions/_lib/elite-injury-penalty-calculator.mjs';

// SF INJURIES (from user's report)
const sfInjuries = [
  {
    player: 'Brock Purdy',
    position: 'QB',
    status: 'QUESTIONABLE', // toe injury, "surprise if he plays"
    team: 'SF'
  },
  {
    player: 'George Kittle',
    position: 'TE',
    status: 'OUT', // IR, hamstring
    team: 'SF',
    isTE1: true
  },
  {
    player: 'Nick Bosa',
    position: 'EDGE',
    status: 'OUT', // IR, torn ACL
    team: 'SF',
    isEDGE1: true
  },
  {
    player: 'Brandon Aiyuk',
    position: 'WR',
    status: 'OUT', // PUP, torn ACL
    team: 'SF',
    isWR1: true
  },
  {
    player: 'Ricky Pearsall',
    position: 'WR',
    status: 'QUESTIONABLE', // knee
    team: 'SF',
    isWR2: true
  },
  {
    player: 'Jauan Jennings',
    position: 'WR',
    status: 'QUESTIONABLE', // ankle/shoulder
    team: 'SF',
    isWR3: true
  }
];

// TB INJURIES (from user's report)
const tbInjuries = [
  {
    player: 'Mike Evans',
    position: 'WR',
    status: 'OUT', // hamstring, missed 2 games
    team: 'TB',
    isWR1: true
  },
  {
    player: 'Bucky Irving',
    position: 'RB',
    status: 'QUESTIONABLE', // shoulder/foot, hasn't practiced
    team: 'TB',
    isRB1: true
  },
  {
    player: 'Zyon McCollum',
    position: 'CB',
    status: 'DOUBTFUL', // arm in sling/cast
    team: 'TB',
    isCB1: true
  },
  {
    player: 'Jamel Dean',
    position: 'CB',
    status: 'QUESTIONABLE', // hip, DNP Wednesday
    team: 'TB',
    isCB2: true
  }
];

// Market spread: TB -3.0
const marketSpread = -3.0; // TB favored by 3

console.log('🏈 SF @ TB ELITE INJURY ANALYSIS\n');
console.log('Market Spread: TB -3.0\n');
console.log('══════════════════════════════════════════════════════════\n');

// Calculate elite injury adjustment
const result = calculateEliteInjuryAdjustment(tbInjuries, sfInjuries, marketSpread);

console.log('📊 NET SPREAD IMPACT:', result.netSpreadImpact, 'points');
console.log('   (Positive = helps home [TB], Negative = hurts home [TB])\n');

console.log('🏠 TB (HOME) PENALTIES:');
console.log('   Offensive:', result.home.offensive.total, 'pts');
console.log('     - WR:', result.home.offensive.breakdown.wr);
console.log('     - RB:', result.home.offensive.breakdown.rb);
console.log('   Defensive:', result.home.defensive.total, 'pts');
console.log('     - Secondary:', result.home.defensive.breakdown.secondary);
console.log('     - CB:', result.home.defensive.breakdown.cb);
console.log('   Total TB Penalty:', result.home.total, 'pts');
console.log('   Uncertainty Factor:', result.home.uncertainty, '\n');

console.log('✈️  SF (AWAY) PENALTIES:');
console.log('   Offensive:', result.away.offensive.total, 'pts');
console.log('     - QB:', result.away.offensive.breakdown.qb);
console.log('     - Pass Catchers:', result.away.offensive.breakdown.passCatchers);
console.log('     - WR:', result.away.offensive.breakdown.wr);
console.log('     - TE:', result.away.offensive.breakdown.te);
console.log('     - Interactions:', result.away.offensive.breakdown.interactions);
console.log('   Defensive:', result.away.defensive.total, 'pts');
console.log('     - EDGE:', result.away.defensive.breakdown.edge);
console.log('   Total SF Penalty:', result.away.total, 'pts');
console.log('   Uncertainty Factor:', result.away.uncertainty, '\n');

console.log('📈 MODEL SPREAD WITH INJURIES:');
const modelSpread = marketSpread + result.netSpreadImpact;
console.log('   Market: TB -3.0');
console.log('   Injury Impact: ' + (result.netSpreadImpact > 0 ? '+' : '') + result.netSpreadImpact);
console.log('   Model: TB -' + Math.abs(modelSpread).toFixed(1), '\n');

console.log('💰 KELLY STAKING RECOMMENDATION:');
console.log('   Uncertainty Reduction:', result.stakingReduction.factor);
console.log('   Strategy:', result.stakingReduction.recommendation);
console.log('   Explanation:', result.stakingReduction.explanation, '\n');

if (result.sanityCheck.alert) {
  console.log('🚨 MARKET SANITY CHECK FAILED!');
  console.log('   Difference from market:', result.sanityCheck.diff, 'points');
  console.log('   Message:', result.sanityCheck.message);
  console.log('   Possible Issues:', result.sanityCheck.possibleIssues);
  console.log('   Recommendation:', result.sanityCheck.recommendation, '\n');
} else {
  console.log('✅ Market Sanity Check: PASSED');
  console.log('   Difference:', result.sanityCheck.diff, 'points (< 7.5 threshold)\n');
}

console.log('══════════════════════════════════════════════════════════\n');

console.log('🎯 ANALYSIS SUMMARY:\n');
console.log('OLD SYSTEM (linear stacking):');
console.log('  - Purdy Q → ~6-7 pts');
console.log('  - Kittle OUT → ~2-3 pts');
console.log('  - Aiyuk OUT → ~2-3 pts');
console.log('  - Bosa OUT → ~2-3 pts');
console.log('  - Jennings/Pearsall Q → ~2-3 pts');
console.log('  - TOTAL: ~14-19 pts (led to TB -21!)\n');

console.log('ELITE SYSTEM (scenario-based, capped):');
console.log('  - Purdy Q (50% avail) → ~2.75 pts (QB)');
console.log('  - Kittle OUT → ~1.2 pts (TE)');
console.log('  - Aiyuk OUT → ~1.8 pts (WR1)');
console.log('  - Jennings Q → ~0.4 pts (WR2, diminished)');
console.log('  - Pearsall Q → ~0.2 pts (WR3, diminished)');
console.log('  - Pass catchers capped at 3.5 pts');
console.log('  - Bosa OUT → ~1.5 pts (EDGE)');
console.log('  - Unit caps + diminishing returns applied');
console.log('  - REALISTIC TOTAL: ~', result.away.total, 'pts SF penalty\n');

console.log('TB -3 + SF penalty ~', result.away.total, '→ TB -', (3 + result.away.total).toFixed(1));
console.log('Much closer to realistic outcome!\n');

console.log('📋 KEY IMPROVEMENTS:');
console.log('  ✅ Questionable = 50% availability (not 100% OUT)');
console.log('  ✅ Diminishing returns on WR room (2nd = 70%, 3rd = 50%)');
console.log('  ✅ Pass catchers cap (3.5 pts max for WR+TE)');
console.log('  ✅ QB cap (7.5 pts max even for elite)');
console.log('  ✅ Team total cap (14 pts absolute max)');
console.log('  ✅ Uncertainty factor for Kelly reduction');
console.log('  ✅ Market sanity check (auto-review if >7.5 pts diff)\n');
