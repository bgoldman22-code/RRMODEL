/**
 * Remove Feb 5-14 from sample — does ML/Spread improve?
 */

import { readFileSync } from 'fs';

const raw = readFileSync(new URL('./transactions.csv', import.meta.url), 'utf-8');
const lines = raw.trim().split('\n');
const headers = lines[0].split(',');

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; continue; }
    if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += line[i];
  }
  result.push(current.trim());
  return result;
}

const allBets = lines.slice(1).map(line => {
  const cols = parseCSVLine(line);
  const obj = {};
  headers.forEach((h, i) => obj[h] = cols[i] || '');
  return obj;
}).filter(b => {
  if (b.type !== 'straight') return false;
  if (b.status !== 'SETTLED_WIN' && b.status !== 'SETTLED_LOSS') return false;
  if (b.leagues === 'NFL' || b.leagues === 'NCAAFB') return false;
  return true;
}).map(b => {
  b.won = b.status === 'SETTLED_WIN';
  b.odds = parseFloat(b.odds) || 0;
  b.amount = parseFloat(b.amount) || 0;
  b.profit = parseFloat(b.profit) || 0;
  b.americanOdds = b.odds >= 2 ? Math.round((b.odds - 1) * 100) : Math.round(-100 / (b.odds - 1));
  b.datePlaced = new Date(b.time_placed_iso);
  b.dateStr = b.datePlaced.toISOString().slice(0, 10);
  b.info = b.bet_info || '';
  const il = b.info.toLowerCase();
  
  if (/spread/i.test(il)) b.market = 'Spread';
  else if (/moneyline|money line/i.test(il)) b.market = 'Moneyline';
  else {
    const hasPlayerName = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b.*\b(points|rebounds|assists|3.*pointer|steals|blocks)\b/i.test(b.info);
    const has2PlusDigitLine = /\b(over|under)\s+\d{3,}/i.test(il);
    if (hasPlayerName || /\d+\+.*\b(points|rebounds|assists|steals|blocks)\b/i.test(il) || /\b(points|rebounds|assists|steals|blocks)\s*(o\/u|over|under)/i.test(il)) {
      b.market = 'Player Prop';
    } else if (has2PlusDigitLine || /\b(total\s*points|total\s*$)/i.test(il)) {
      b.market = 'Total';
    } else {
      b.market = 'Player Prop';
    }
  }
  
  b.isGamePick = ['Spread', 'Moneyline', 'Total'].includes(b.market);
  return b;
});

const excludeStart = '2026-02-05';
const excludeEnd = '2026-02-14';

const full = allBets;
const excluded = allBets.filter(b => b.dateStr >= excludeStart && b.dateStr <= excludeEnd);
const trimmed = allBets.filter(b => b.dateStr < excludeStart || b.dateStr > excludeEnd);

function analyze(group, label) {
  if (group.length === 0) return { label, n: 0 };
  const wins = group.filter(b => b.won).length;
  const staked = group.reduce((s, b) => s + b.amount, 0);
  const profit = group.reduce((s, b) => s + b.profit, 0);
  const roi = staked > 0 ? (profit / staked * 100) : 0;
  return { label, n: group.length, wins, losses: group.length - wins, winPct: (wins/group.length*100), staked, profit, roi };
}

function fmt(g) {
  if (!g || g.n === 0) return `  ${g?.label || '?'}: no bets`;
  return `  ${g.label.padEnd(35)} ${String(g.n).padStart(4)} bets | ${g.wins}-${g.losses} (${g.winPct.toFixed(1)}%) | ${g.profit >= 0 ? '+' : ''}$${g.profit.toFixed(0).padStart(6)} | ${g.roi >= 0 ? '+' : ''}${g.roi.toFixed(1)}% ROI`;
}

console.log('═'.repeat(90));
console.log('  IMPACT OF REMOVING FEB 5-14, 2026');
console.log('═'.repeat(90));

// What happened during Feb 5-14?
console.log('\n━━━ WHAT HAPPENED FEB 5-14? ━━━');
console.log(fmt(analyze(excluded, 'ALL bets Feb 5-14')));
console.log(fmt(analyze(excluded.filter(b => b.market === 'Spread'), 'Spreads Feb 5-14')));
console.log(fmt(analyze(excluded.filter(b => b.market === 'Moneyline'), 'Moneylines Feb 5-14')));
console.log(fmt(analyze(excluded.filter(b => b.market === 'Total'), 'Totals Feb 5-14')));
console.log(fmt(analyze(excluded.filter(b => b.market === 'Player Prop'), 'Props Feb 5-14')));
console.log(fmt(analyze(excluded.filter(b => b.isGamePick), 'All Game Picks Feb 5-14')));

// Daily breakdown of Feb 5-14
console.log('\n  Daily breakdown:');
const dates = [...new Set(excluded.map(b => b.dateStr))].sort();
for (const d of dates) {
  const day = excluded.filter(b => b.dateStr === d);
  const wins = day.filter(b => b.won).length;
  const profit = day.reduce((s, b) => s + b.profit, 0);
  console.log(`    ${d}: ${day.length} bets, ${wins}-${day.length - wins}, ${profit >= 0 ? '+' : ''}$${profit.toFixed(0)}`);
}

console.log('\n━━━ FULL SAMPLE vs TRIMMED (no Feb 5-14) ━━━\n');

const categories = [
  ['ALL BETS', () => true],
  ['Spreads', b => b.market === 'Spread'],
  ['Moneylines', b => b.market === 'Moneyline'],
  ['Game Totals', b => b.market === 'Total'],
  ['All Game Picks', b => b.isGamePick],
  ['Player Props', b => b.market === 'Player Prop'],
];

console.log(`  ${'Category'.padEnd(35)} | ${'FULL'.padStart(20)} | ${'NO FEB 5-14'.padStart(20)} | ${'Δ ROI'.padStart(8)}`);
console.log(`  ${'-'.repeat(90)}`);

for (const [label, filterFn] of categories) {
  const gFull = analyze(full.filter(filterFn), label);
  const gTrim = analyze(trimmed.filter(filterFn), label);
  const delta = gTrim.roi - gFull.roi;
  const fullStr = `${gFull.n}b ${gFull.roi >= 0 ? '+' : ''}${gFull.roi.toFixed(1)}% ${gFull.profit >= 0 ? '+' : ''}$${gFull.profit.toFixed(0)}`;
  const trimStr = `${gTrim.n}b ${gTrim.roi >= 0 ? '+' : ''}${gTrim.roi.toFixed(1)}% ${gTrim.profit >= 0 ? '+' : ''}$${gTrim.profit.toFixed(0)}`;
  console.log(`  ${label.padEnd(35)} | ${fullStr.padStart(20)} | ${trimStr.padStart(20)} | ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp`);
}

// What % of total losses came from that 10-day stretch?
const totalLoss = full.reduce((s, b) => s + (b.profit < 0 ? b.profit : 0), 0);
const periodLoss = excluded.reduce((s, b) => s + (b.profit < 0 ? b.profit : 0), 0);
const periodProfit = excluded.reduce((s, b) => s + b.profit, 0);

console.log(`\n  Feb 5-14 P/L: ${periodProfit >= 0 ? '+' : ''}$${periodProfit.toFixed(0)}`);
console.log(`  That's ${excluded.length} of ${full.length} bets (${(excluded.length/full.length*100).toFixed(1)}% of volume)`);
console.log(`  But ${(Math.abs(periodProfit) / Math.abs(full.reduce((s,b) => s + (b.profit < 0 ? b.profit : 0), 0)) * 100).toFixed(1)}% of total losses`);

// Also check: without Feb 5-14, is the "game picks are bad" narrative still true?
console.log('\n━━━ WITHOUT FEB 5-14: ARE GAME PICKS STILL BAD? ━━━');
const gpTrimmed = trimmed.filter(b => b.isGamePick);
const ppTrimmed = trimmed.filter(b => b.market === 'Player Prop');
console.log(fmt(analyze(gpTrimmed, 'Game Picks (trimmed)')));
console.log(fmt(analyze(ppTrimmed, 'Player Props (trimmed)')));

console.log('\n' + '═'.repeat(90));
