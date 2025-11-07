#!/usr/bin/env node
/**
 * Analyze confidence vs win rate for Nov 6 picks
 */

// Our picks with confidence scores
const picks = [
  { player: "Collin Gillespie", prop: "assists", line: 4.5, pick: "Over", predicted: 6.1, confidence: 80, edge: 21.9, actual: 7 },
  { player: "Collin Gillespie", prop: "rebounds", line: 3.5, pick: "Over", predicted: 3.7, confidence: 90, edge: 21.5, actual: 5 },
  { player: "Ryan Dunn", prop: "assists", line: 1.5, pick: "Over", predicted: 1.6, confidence: 95, edge: 18.9, actual: 3 },
  { player: "Grayson Allen", prop: "rebounds", line: 3.5, pick: "Over", predicted: 3.8, confidence: 93, edge: 16.0, actual: 3 },
  { player: "John Collins", prop: "assists", line: 1.5, pick: "Under", predicted: 0.6, confidence: 93, edge: 16.0, actual: 1 },
  { player: "Ivica Zubac", prop: "assists", line: 2.5, pick: "Under", predicted: 2.2, confidence: 90, edge: 15.7, actual: 2 },
  { player: "John Collins", prop: "rebounds", line: 6.5, pick: "Under", predicted: 4.5, confidence: 94, edge: 15.5, actual: 4 },
  { player: "Mark Williams", prop: "rebounds", line: 9.5, pick: "Over", predicted: 10.6, confidence: 89, edge: 15.0, actual: 10 },
  { player: "Mark Williams", prop: "assists", line: 1.5, pick: "Under", predicted: 1.3, confidence: 91, edge: 12.8, actual: 0 },
  { player: "Devin Booker", prop: "rebounds", line: 3.5, pick: "Over", predicted: 4.1, confidence: 95, edge: 9.4, actual: 6 },
  { player: "Ivica Zubac", prop: "rebounds", line: 11.5, pick: "Under", predicted: 10.7, confidence: 72, edge: 8.9, actual: 11 },
  { player: "Royce O'Neale", prop: "rebounds", line: 4.5, pick: "Over", predicted: 6.4, confidence: 85, edge: 8.9, actual: 4 },
  { player: "Royce O'Neale", prop: "assists", line: 2.5, pick: "Over", predicted: 4.0, confidence: 85, edge: 8.5, actual: 2 },
  { player: "Ryan Dunn", prop: "rebounds", line: 4.5, pick: "Over", predicted: 5.3, confidence: 87, edge: 8.1, actual: 5 },
  { player: "Devin Booker", prop: "assists", line: 7.5, pick: "Over", predicted: 7.6, confidence: 85, edge: 7.5, actual: 7 },
  { player: "Grayson Allen", prop: "assists", line: 3.5, pick: "Over", predicted: 4.7, confidence: 93, edge: 4.7, actual: 4 },
  { player: "Bradley Beal", prop: "assists", line: 3.5, pick: "Under", predicted: 1.2, confidence: 95, edge: 4.4, actual: 1 }
];

// Calculate win/loss
const results = picks.map(p => {
  let hit = false;
  if (p.pick === 'Over') {
    hit = p.actual > p.line;
  } else {
    hit = p.actual < p.line;
  }
  return { ...p, hit };
});

console.log('🎯 CONFIDENCE vs WIN RATE ANALYSIS');
console.log('='.repeat(80));
console.log();

// Group by confidence buckets
const buckets = [
  { min: 70, max: 79, name: '70-79%' },
  { min: 80, max: 84, name: '80-84%' },
  { min: 85, max: 89, name: '85-89%' },
  { min: 90, max: 94, name: '90-94%' },
  { min: 95, max: 100, name: '95-100%' }
];

console.log('📊 BY CONFIDENCE BUCKET:\n');

for (const bucket of buckets) {
  const inBucket = results.filter(r => r.confidence >= bucket.min && r.confidence <= bucket.max);
  
  if (inBucket.length === 0) continue;
  
  const wins = inBucket.filter(r => r.hit).length;
  const winRate = ((wins / inBucket.length) * 100).toFixed(1);
  const avgEdge = (inBucket.reduce((sum, r) => sum + r.edge, 0) / inBucket.length).toFixed(1);
  const avgError = (inBucket.reduce((sum, r) => sum + Math.abs(r.actual - r.predicted), 0) / inBucket.length).toFixed(2);
  
  console.log(`${bucket.name}: ${wins}W-${inBucket.length - wins}L (${winRate}%) - ${inBucket.length} picks`);
  console.log(`   Avg Edge: ${avgEdge}% | Avg Error: ${avgError}`);
  
  // Show individual picks in this bucket
  inBucket.forEach(r => {
    console.log(`   ${r.hit ? '✅' : '❌'} ${r.player.padEnd(20)} ${r.prop.padEnd(8)} ${r.pick.padEnd(5)} ${r.line.toString().padStart(4)} (Conf: ${r.confidence}%, Edge: ${r.edge}%)`);
  });
  console.log();
}

console.log('='.repeat(80));
console.log('\n📈 CORRELATION ANALYSIS:\n');

// Calculate Pearson correlation coefficient
const n = results.length;
const meanConf = results.reduce((sum, r) => sum + r.confidence, 0) / n;
const meanWin = results.filter(r => r.hit).length / n;

const confidences = results.map(r => r.confidence);
const wins = results.map(r => r.hit ? 1 : 0);

const covConfWin = results.reduce((sum, r, i) => 
  sum + (confidences[i] - meanConf) * (wins[i] - meanWin), 0) / n;

const stdConf = Math.sqrt(results.reduce((sum, r) => 
  sum + Math.pow(r.confidence - meanConf, 2), 0) / n);
  
const stdWin = Math.sqrt(wins.reduce((sum, w) => 
  sum + Math.pow(w - meanWin, 2), 0) / n);

const correlation = covConfWin / (stdConf * stdWin);

console.log(`Pearson Correlation: ${correlation.toFixed(3)}`);

if (Math.abs(correlation) < 0.1) {
  console.log('Interpretation: NEGLIGIBLE correlation');
} else if (Math.abs(correlation) < 0.3) {
  console.log('Interpretation: WEAK correlation');
} else if (Math.abs(correlation) < 0.5) {
  console.log('Interpretation: MODERATE correlation');
} else if (Math.abs(correlation) < 0.7) {
  console.log('Interpretation: STRONG correlation');
} else {
  console.log('Interpretation: VERY STRONG correlation');
}

if (correlation > 0) {
  console.log('Direction: POSITIVE (higher confidence → higher win rate)');
} else {
  console.log('Direction: NEGATIVE (higher confidence → lower win rate)');
}

console.log();

// High vs Low confidence comparison
const highConf = results.filter(r => r.confidence >= 90);
const lowConf = results.filter(r => r.confidence < 90);

const highConfWins = highConf.filter(r => r.hit).length;
const lowConfWins = lowConf.filter(r => r.hit).length;

console.log('🔍 HIGH vs LOW CONFIDENCE:\n');
console.log(`High Confidence (≥90%): ${highConfWins}W-${highConf.length - highConfWins}L (${((highConfWins/highConf.length)*100).toFixed(1)}%) - ${highConf.length} picks`);
console.log(`Low Confidence (<90%):  ${lowConfWins}W-${lowConf.length - lowConfWins}L (${((lowConfWins/lowConf.length)*100).toFixed(1)}%) - ${lowConf.length} picks`);
console.log();

// Best and worst by confidence
console.log('⭐ HIGHEST CONFIDENCE PICKS:\n');
const sortedByConf = [...results].sort((a, b) => b.confidence - a.confidence);
sortedByConf.slice(0, 5).forEach((r, i) => {
  console.log(`${i+1}. ${r.hit ? '✅' : '❌'} ${r.confidence}% - ${r.player} ${r.prop} ${r.pick} ${r.line} (Pred: ${r.predicted}, Actual: ${r.actual})`);
});

console.log();
console.log('⚠️  LOWEST CONFIDENCE PICKS:\n');
sortedByConf.slice(-5).reverse().forEach((r, i) => {
  console.log(`${i+1}. ${r.hit ? '✅' : '❌'} ${r.confidence}% - ${r.player} ${r.prop} ${r.pick} ${r.line} (Pred: ${r.predicted}, Actual: ${r.actual})`);
});

console.log();
console.log('='.repeat(80));
console.log('\n💡 KEY FINDINGS:\n');

// Calculate win rates for each unique confidence level
const confLevels = [...new Set(confidences)].sort((a, b) => b - a);
console.log('Win Rate by Exact Confidence Level:');
confLevels.forEach(conf => {
  const atLevel = results.filter(r => r.confidence === conf);
  const winsAtLevel = atLevel.filter(r => r.hit).length;
  console.log(`  ${conf}%: ${winsAtLevel}/${atLevel.length} (${((winsAtLevel/atLevel.length)*100).toFixed(0)}%)`);
});

console.log();

// Check if confidence threshold matters
const thresholds = [80, 85, 90, 95];
console.log('Win Rate Above Each Threshold:');
thresholds.forEach(thresh => {
  const above = results.filter(r => r.confidence >= thresh);
  const winsAbove = above.filter(r => r.hit).length;
  console.log(`  ≥${thresh}%: ${winsAbove}/${above.length} (${((winsAbove/above.length)*100).toFixed(1)}%)`);
});
