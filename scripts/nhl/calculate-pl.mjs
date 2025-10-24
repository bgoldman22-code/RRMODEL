#!/usr/bin/env node

/**
 * Calculate P/L from last night's picks
 */

const PICKS = [
  { player: 'Marco Kasper', line: 1.5, market: 'UNDER', odds: -105, units: 7.5, actual: 4, result: 'MISS' },
  { player: 'Erik Karlsson', line: 1.5, market: 'UNDER', odds: +100, units: 7.5, actual: 'DNP', result: 'VOID' },
  { player: 'Gustav Forsling', line: 1.5, market: 'UNDER', odds: +105, units: 7.5, actual: 2, result: 'MISS' },
  { player: 'Morgan Geekie', line: 1.5, market: 'UNDER', odds: +135, units: 7.5, actual: 4, result: 'MISS' },
  { player: 'Oliver Bjorkstrand', line: 1.5, market: 'UNDER', odds: +105, units: 7.5, actual: 0, result: 'HIT' },
  { player: 'Macklin Celebrini', line: 2.5, market: 'UNDER', odds: +115, units: 7.5, actual: 5, result: 'MISS' },
  { player: 'Eetu Luostarinen', line: 1.5, market: 'UNDER', odds: -130, units: 7.5, actual: 4, result: 'MISS' },
  { player: 'Sam Bennett', line: 2.5, market: 'UNDER', odds: -105, units: 7.5, actual: 3, result: 'MISS' },
  { player: 'Emmitt Finnie', line: 1.5, market: 'UNDER', odds: +105, units: 7.5, actual: 2, result: 'MISS' },
  { player: 'Viktor Arvidsson', line: 2.5, market: 'UNDER', odds: -162, units: 7.5, actual: 2, result: 'HIT' },
  { player: 'Bo Horvat', line: 3.5, market: 'OVER', odds: +132, units: 7.5, actual: 0, result: 'MISS' },
  { player: 'Aaron Ekblad', line: 1.5, market: 'UNDER', odds: +105, units: 7.5, actual: 1, result: 'HIT' },
  { player: 'Sidney Crosby', line: 2.5, market: 'UNDER', odds: -175, units: 7.5, actual: 2, result: 'HIT' },
  { player: 'Victor Hedman', line: 2.5, market: 'UNDER', odds: -154, units: 7.5, actual: 3, result: 'MISS' },
  { player: 'Jackson LaCombe', line: 1.5, market: 'UNDER', odds: -120, units: 7.5, actual: 2, result: 'MISS' },
  { player: 'Mathew Barzal', line: 2.5, market: 'UNDER', odds: -125, units: 7.5, actual: 2, result: 'HIT' },
  { player: 'Alex DeBrincat', line: 3.5, market: 'UNDER', odds: -154, units: 7.5, actual: 5, result: 'MISS' },
  { player: 'Mason McTavish', line: 2.5, market: 'UNDER', odds: -154, units: 7.5, actual: 0, result: 'HIT' },
  { player: 'Cutter Gauthier', line: 3.5, market: 'OVER', odds: +135, units: 2.8, actual: 3, result: 'MISS' },
  { player: 'Anders Lee', line: 2.5, market: 'UNDER', odds: -168, units: 5.4, actual: 6, result: 'MISS' },
  { player: 'Jake Guentzel', line: 2.5, market: 'OVER', odds: -142, units: 7.5, actual: 2, result: 'MISS' },
  { player: 'Justin Brazeau', line: 1.5, market: 'UNDER', odds: -154, units: 4.8, actual: 1, result: 'HIT' },
  { player: 'Elias Lindholm', line: 2.5, market: 'UNDER', odds: -168, units: 7.0, actual: 2, result: 'HIT' },
  { player: 'J.T. Miller', line: 2.5, market: 'OVER', odds: +100, units: 0.0, actual: 1, result: 'MISS' },
  { player: 'Alexis Lafrenière', line: 2.5, market: 'UNDER', odds: -148, units: 4.5, actual: 2, result: 'HIT' },
  { player: 'Will Cuvile', line: 2.5, market: 'UNDER', odds: -168, units: 5.2, actual: 'DNP', result: 'VOID' },
  { player: 'Anton Lundell', line: 2.5, market: 'UNDER', odds: -188, units: 0.0, actual: 3, result: 'MISS' },
  { player: 'Adam Fox', line: 2.5, market: 'OVER', odds: +120, units: 0.0, actual: 0, result: 'MISS' },
  { player: 'Artemi Panarin', line: 3.5, market: 'UNDER', odds: -148, units: 3.5, actual: 2, result: 'HIT' }
];

function calculatePayout(odds, units) {
  if (odds > 0) {
    // Positive odds: units * (odds/100)
    return units * (odds / 100);
  } else {
    // Negative odds: units * (100/|odds|)
    return units * (100 / Math.abs(odds));
  }
}

console.log('\n💰 P/L CALCULATION - October 23, 2025\n');
console.log('='.repeat(100));
console.log('Player'.padEnd(25), 'Market'.padEnd(10), 'Odds'.padEnd(8), 'Units'.padEnd(8), 'Result'.padEnd(10), 'P/L');
console.log('='.repeat(100));

let totalUnitsWagered = 0;
let totalUnitsWon = 0;
let totalUnitsLost = 0;
let netPL = 0;

let wins = 0;
let losses = 0;
let voids = 0;

for (const pick of PICKS) {
  if (pick.result === 'VOID' || pick.units === 0) {
    console.log(
      pick.player.padEnd(25),
      `${pick.market} ${pick.line}`.padEnd(10),
      `${pick.odds > 0 ? '+' : ''}${pick.odds}`.padEnd(8),
      pick.units.toFixed(1).padEnd(8),
      'VOID'.padEnd(10),
      '0.0U'
    );
    voids++;
    continue;
  }

  totalUnitsWagered += pick.units;

  if (pick.result === 'HIT') {
    const payout = calculatePayout(pick.odds, pick.units);
    totalUnitsWon += payout;
    netPL += payout;
    wins++;
    
    console.log(
      pick.player.padEnd(25),
      `${pick.market} ${pick.line}`.padEnd(10),
      `${pick.odds > 0 ? '+' : ''}${pick.odds}`.padEnd(8),
      pick.units.toFixed(1).padEnd(8),
      'WIN ✅'.padEnd(10),
      `+${payout.toFixed(2)}U`
    );
  } else {
    totalUnitsLost += pick.units;
    netPL -= pick.units;
    losses++;
    
    console.log(
      pick.player.padEnd(25),
      `${pick.market} ${pick.line}`.padEnd(10),
      `${pick.odds > 0 ? '+' : ''}${pick.odds}`.padEnd(8),
      pick.units.toFixed(1).padEnd(8),
      'LOSS ❌'.padEnd(10),
      `-${pick.units.toFixed(2)}U`
    );
  }
}

console.log('='.repeat(100));
console.log('\n📊 SUMMARY\n');
console.log(`Total Picks: ${wins + losses} (${voids} voids)`);
console.log(`Wins: ${wins} ✅`);
console.log(`Losses: ${losses} ❌`);
console.log(`Win Rate: ${((wins / (wins + losses)) * 100).toFixed(1)}%\n`);

console.log(`Total Units Wagered: ${totalUnitsWagered.toFixed(1)}U`);
console.log(`Total Units Won: ${totalUnitsWon.toFixed(2)}U`);
console.log(`Total Units Lost: ${totalUnitsLost.toFixed(1)}U\n`);

const plColor = netPL >= 0 ? '🟢' : '🔴';
const plSign = netPL >= 0 ? '+' : '';
console.log(`${plColor} NET P/L: ${plSign}${netPL.toFixed(2)}U`);

const roi = totalUnitsWagered > 0 ? ((netPL / totalUnitsWagered) * 100).toFixed(1) : '0.0';
const roiColor = parseFloat(roi) >= 0 ? '🟢' : '🔴';
console.log(`${roiColor} ROI: ${roi}%\n`);

// Calculate if these were $10/unit
console.log('💵 IF USING $10/UNIT:');
console.log(`Total Risked: $${(totalUnitsWagered * 10).toFixed(2)}`);
console.log(`Net P/L: ${plSign}$${(netPL * 10).toFixed(2)}\n`);

console.log('='.repeat(100));
