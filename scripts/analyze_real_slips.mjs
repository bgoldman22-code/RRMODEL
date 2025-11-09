/**
 * MLB HR RR Slip Analysis
 * Reverse-engineer actual slips to determine format mix and stake allocation
 */

const slips = [
  {
    date: '2025-09-25',
    legs: 17,
    wins: 5,
    losses: 11,
    voids: 1,
    payout: 72.69,
    winners: [
      'Carson Williams', 'Noeyli Marte', 'Shohei Ohtani', 
      'Michael Helman', 'Shea Langeliers'
    ],
    sameGamePairs: [
      ['Aaron Judge', 'Giancarlo Stanton'], // NYY
      ['Michael Helman', 'Rowdy Tellez'], // MIN
      ['Juan Soto', 'Pete Alonso'] // NYM
    ]
  },
  {
    date: '2025-09-24',
    legs: 17,
    wins: 7,
    losses: 10,
    voids: 0,
    payout: 442.36,
    winners: [
      'Kyle Schwarber', 'Juan Soto', 'Byron Buxton',
      'Daulton Varsho', 'Taylor Ward', 'Eugenio Suarez',
      'Cal Raleigh'
    ],
    sameGamePairs: [
      ['Colson Montgomery', 'Giancarlo Stanton'], // CWS
      ['Kyle Schwarber', 'Byron Buxton'] // PHI/MIN mixed
    ]
  },
  {
    date: '2025-09-26',
    legs: 22,
    wins: 5,
    losses: 14,
    voids: 1,
    payout: 7.26,
    winners: [
      'Michael Busch', 'Colson Montgomery', 'Aaron Judge',
      'Junior Caminero', 'Michael Helman'
    ],
    sameGamePairs: [
      ['Kyle Schwarber', 'Byron Buxton'], // MIN/PHI
      ['Aaron Judge', 'Giancarlo Stanton'] // BAL/NYY
    ]
  }
];

/**
 * Calculate possible combo counts and reverse-engineer format
 */
function analyzeSlip(slip) {
  const { legs, wins, payout } = slip;
  
  // Calculate total possible combos per format
  const combo = (n, r) => {
    if (r > n) return 0;
    let result = 1;
    for (let i = 0; i < r; i++) {
      result *= (n - i);
      result /= (i + 1);
    }
    return Math.floor(result);
  };
  
  const total2s = combo(legs, 2);
  const total3s = combo(legs, 3);
  const total4s = combo(legs, 4);
  
  // Estimate valid combos (assuming ~65% valid for mixed game distribution)
  const valid2s = Math.floor(total2s * 0.68);
  const valid3s = Math.floor(total3s * 0.64);
  const valid4s = Math.floor(total4s * 0.59);
  
  // Calculate hitting combos per format
  const hit2s = combo(wins, 2);
  const hit3s = combo(wins, 3);
  const hit4s = combo(wins, 4);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SLIP: ${slip.date}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Pool: ${legs} legs | Winners: ${wins} | Payout: $${payout}`);
  console.log();
  
  console.log(`COMBO COUNTS:`);
  console.log(`  2-leg: ${total2s} possible → ~${valid2s} valid`);
  console.log(`  3-leg: ${total3s} possible → ~${valid3s} valid`);
  console.log(`  4-leg: ${total4s} possible → ~${valid4s} valid`);
  console.log();
  
  console.log(`HITTING COMBOS (if format was 100% this type):`);
  console.log(`  2-leg: ${hit2s} combos hit`);
  console.log(`  3-leg: ${hit3s} combos hit`);
  console.log(`  4-leg: ${hit4s} combos hit`);
  console.log();
  
  // Estimate stake per combo assuming typical $450 total bankroll
  const totalBankroll = 450;
  const stake2 = totalBankroll * 0.50 / valid2s;
  const stake3 = totalBankroll * 0.35 / valid3s;
  const stake4 = totalBankroll * 0.15 / valid4s;
  
  console.log(`ESTIMATED STAKE (on $${totalBankroll} bankroll w/ 50/35/15 split):`);
  console.log(`  2-leg: $${stake2.toFixed(2)} per combo × ${hit2s} hits = $${(stake2 * hit2s * avgOdds2).toFixed(2)} if avg +400 odds`);
  console.log(`  3-leg: $${stake3.toFixed(2)} per combo × ${hit3s} hits = $${(stake3 * hit3s * avgOdds3).toFixed(2)} if avg +4000 odds`);
  console.log(`  4-leg: $${stake4.toFixed(2)} per combo × ${hit4s} hits = $${(stake4 * hit4s * avgOdds4).toFixed(2)} if avg +40000 odds`);
  console.log();
  
  // Typical parlay odds (rough estimates)
  const avgOdds2 = 5;  // +400 = 5x
  const avgOdds3 = 41; // +4000 = 41x
  const avgOdds4 = 401; // +40000 = 401x
  
  // Reverse-engineer which format likely paid
  const expectedPayout2 = stake2 * hit2s * avgOdds2;
  const expectedPayout3 = stake3 * hit3s * avgOdds3;
  const expectedPayout4 = stake4 * hit4s * avgOdds4;
  
  console.log(`REVERSE-ENGINEERING:`);
  console.log(`  Actual payout: $${payout}`);
  console.log(`  If 100% 2-leg: $${expectedPayout2.toFixed(2)} (difference: ${Math.abs(payout - expectedPayout2).toFixed(2)})`);
  console.log(`  If 100% 3-leg: $${expectedPayout3.toFixed(2)} (difference: ${Math.abs(payout - expectedPayout3).toFixed(2)})`);
  console.log(`  If 100% 4-leg: $${expectedPayout4.toFixed(2)} (difference: ${Math.abs(payout - expectedPayout4).toFixed(2)})`);
  
  const closest = [
    { format: '2-leg', diff: Math.abs(payout - expectedPayout2) },
    { format: '3-leg', diff: Math.abs(payout - expectedPayout3) },
    { format: '4-leg', diff: Math.abs(payout - expectedPayout4) }
  ].sort((a, b) => a.diff - b.diff)[0];
  
  console.log(`  → LIKELY FORMAT: ${closest.format} (closest match)`);
  console.log();
  
  console.log(`SAME-GAME CONFLICTS:`);
  slip.sameGamePairs.forEach(pair => {
    console.log(`  ⚠️  ${pair[0]} + ${pair[1]} (same game)`);
  });
  console.log(`  → ${slip.sameGamePairs.length} same-game pairs detected`);
  console.log(`  → Estimated invalid combos: ~${Math.floor((total2s + total3s + total4s) * 0.35)}`);
}

/**
 * Aggregate analysis across all slips
 */
function aggregateAnalysis() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`AGGREGATE ANALYSIS`);
  console.log(`${'='.repeat(60)}`);
  
  const avgLegs = slips.reduce((sum, s) => sum + s.legs, 0) / slips.length;
  const avgWins = slips.reduce((sum, s) => sum + s.wins, 0) / slips.length;
  const avgPayout = slips.reduce((sum, s) => sum + s.payout, 0) / slips.length;
  const totalPayout = slips.reduce((sum, s) => sum + s.payout, 0);
  
  console.log(`Average pool size: ${avgLegs.toFixed(1)} legs`);
  console.log(`Average wins: ${avgWins.toFixed(1)} legs (${(avgWins / avgLegs * 100).toFixed(1)}% hit rate)`);
  console.log(`Average payout: $${avgPayout.toFixed(2)}`);
  console.log(`Total payout: $${totalPayout.toFixed(2)}`);
  console.log();
  
  console.log(`KEY INSIGHTS:`);
  console.log(`  1. Pool size varies (17-22 legs) - not fixed at 12`);
  console.log(`  2. Same-game stacking is common (Judge+Stanton frequent)`);
  console.log(`  3. Hit rate ranges 23-41% (avg 31%) - above typical HR rates`);
  console.log(`  4. Payouts highly variable ($7 to $442) - format dependency`);
  console.log(`  5. Best slip: 9/24 with 41% hit rate → $442 payout`);
  console.log();
  
  console.log(`BACKTEST REQUIREMENTS:`);
  console.log(`  - Test pool sizes: 12, 15, 17, 20, 22 legs`);
  console.log(`  - Allow same-game stacking (user preference)`);
  console.log(`  - Calculate valid combos dynamically`);
  console.log(`  - Use actual 50/35/15 stake split`);
  console.log(`  - Validate against these 3 real outcomes`);
}

// Run analysis
slips.forEach(analyzeSlip);
aggregateAnalysis();

console.log(`\n${'='.repeat(60)}`);
console.log(`NEXT STEPS:`);
console.log(`${'='.repeat(60)}`);
console.log(`1. Build 5-year data pipeline (Statcast + MLB APIs)`);
console.log(`2. Create RR simulator matching this exact approach`);
console.log(`3. Backtest 2020-2024 with multiple strategies`);
console.log(`4. Generate ROI report and recommendations`);
console.log(`5. Enhance model with Statcast features`);
console.log(`${'='.repeat(60)}\n`);
