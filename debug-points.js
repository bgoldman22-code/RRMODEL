const data = require('./data/nba/backtest-results-baseline.json');
const points = data.windows['Feb 2025'].points.bets;

const winners = points.filter(b => b.won);
const losers = points.filter(b => !b.won);

console.log('🔍 POINTS FAILURE ANALYSIS');
console.log('==========================');
console.log(`Total: ${points.length}, Winners: ${winners.length}, Losers: ${losers.length}`);
console.log(`Win Rate: ${(100*winners.length/points.length).toFixed(1)}%`);

console.log('\n📊 SIDE BIAS:');
const overBets = points.filter(b => b.side === 'OVER');
const underBets = points.filter(b => b.side === 'UNDER');
const overWins = overBets.filter(b => b.won).length;
const underWins = underBets.filter(b => b.won).length;

console.log(`OVER bets: ${overBets.length}, wins: ${overWins} (${(100*overWins/overBets.length).toFixed(1)}%)`);
console.log(`UNDER bets: ${underBets.length}, wins: ${underWins} (${(100*underWins/underBets.length).toFixed(1)}%)`);

console.log('\n🎯 PREDICTION ACCURACY:');
const avgPredError = points.reduce((sum, b) => sum + Math.abs(b.prediction - b.actual), 0) / points.length;
const winnerAvgError = winners.reduce((sum, b) => sum + Math.abs(b.prediction - b.actual), 0) / winners.length;
const loserAvgError = losers.reduce((sum, b) => sum + Math.abs(b.prediction - b.actual), 0) / losers.length;

console.log(`Overall prediction error: ${avgPredError.toFixed(2)} pts`);
console.log(`Winner prediction error: ${winnerAvgError.toFixed(2)} pts`);
console.log(`Loser prediction error: ${loserAvgError.toFixed(2)} pts`);

console.log('\n🔬 EDGE ANALYSIS:');
const avgEdge = points.reduce((sum, b) => sum + b.absEdge, 0) / points.length;
const winnerAvgEdge = winners.reduce((sum, b) => sum + b.absEdge, 0) / winners.length;
const loserAvgEdge = losers.reduce((sum, b) => sum + b.absEdge, 0) / losers.length;

console.log(`Overall edge: ${avgEdge.toFixed(2)} pts`);
console.log(`Winner edge: ${winnerAvgEdge.toFixed(2)} pts`);
console.log(`Loser edge: ${loserAvgEdge.toFixed(2)} pts`);

console.log('\n📈 SAMPLE WINNERS:');
winners.slice(0, 5).forEach(b => {
  console.log(`  ✅ ${b.player}: ${b.side} ${b.vegasLine} → Pred=${b.prediction.toFixed(1)}, Actual=${b.actual}, Edge=${b.absEdge.toFixed(1)}`);
});

console.log('\n📉 SAMPLE LOSERS:');
losers.slice(0, 5).forEach(b => {
  console.log(`  ❌ ${b.player}: ${b.side} ${b.vegasLine} → Pred=${b.prediction.toFixed(1)}, Actual=${b.actual}, Edge=${b.absEdge.toFixed(1)}`);
});

console.log('\n🏀 LINE RANGES:');
const lineRanges = {
  low: points.filter(b => b.vegasLine < 15),
  mid: points.filter(b => b.vegasLine >= 15 && b.vegasLine < 25),
  high: points.filter(b => b.vegasLine >= 25)
};

Object.entries(lineRanges).forEach(([range, bets]) => {
  const wins = bets.filter(b => b.won).length;
  const winRate = bets.length > 0 ? (100 * wins / bets.length).toFixed(1) : 'N/A';
  console.log(`${range.toUpperCase()} lines: ${bets.length} bets, ${wins} wins (${winRate}%)`);
});