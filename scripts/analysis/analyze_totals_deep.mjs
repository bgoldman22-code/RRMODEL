/**
 * NBA TOTALS DEEP DIVE
 * -$577 and -5.1% ROI — WHERE is it breaking and what can fix it?
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
  if (b.leagues !== 'NBA') return false;
  return true;
}).map(b => {
  b.won = b.status === 'SETTLED_WIN';
  b.odds = parseFloat(b.odds) || 0;
  b.closing = parseFloat(b.closing_line) || 0;
  b.ev = parseFloat(b.ev) || 0;
  b.amount = parseFloat(b.amount) || 0;
  b.profit = parseFloat(b.profit) || 0;
  b.americanOdds = b.odds >= 2 ? Math.round((b.odds - 1) * 100) : Math.round(-100 / (b.odds - 1));
  b.isPlusOdds = b.americanOdds > 0;
  b.datePlaced = new Date(b.time_placed_iso);
  b.dateStr = b.datePlaced.toISOString().slice(0, 10);
  b.month = b.datePlaced.toISOString().slice(0, 7);
  b.info = b.bet_info || '';
  b.book = b.sportsbook || '';
  const il = b.info.toLowerCase();
  
  if (b.closing > 0) {
    b.clv = (1 / b.odds) - (1 / b.closing);
  } else {
    b.clv = null;
  }

  // Is this a game total?
  b.isTotal = /\b(over|under)\s+\d{3}/i.test(il) || /total\s*(points|$)/i.test(il) || (/\b(over|under)\b/i.test(il) && /\d{3}/i.test(il));
  
  // Spread
  b.isSpread = /spread/i.test(il);
  
  // ML
  b.isML = /moneyline|money line/i.test(il);
  
  // Direction
  b.direction = null;
  if (/under/i.test(il)) b.direction = 'Under';
  else if (/over/i.test(il)) b.direction = 'Over';
  
  // Extract the total line number
  const lineMatch = il.match(/(?:over|under)\s+(\d+\.?\d*)/);
  b.totalLine = lineMatch ? parseFloat(lineMatch[1]) : null;
  
  // Edge/category from model
  const edgeMatch = b.info.match(/edge[:\s]*([\d.]+)/i);
  b.modelEdge = edgeMatch ? parseFloat(edgeMatch[1]) : null;
  
  // Category/confidence
  b.category = null;
  if (/strong/i.test(b.info)) b.category = 'STRONG';
  else if (/consider/i.test(b.info)) b.category = 'CONSIDER';
  else if (/track/i.test(b.info)) b.category = 'TRACK';
  
  return b;
});

const totals = allBets.filter(b => b.isTotal);

function analyze(group, label) {
  if (group.length === 0) return { label, n: 0, wins: 0, losses: 0, winPct: 0, staked: 0, profit: 0, roi: 0, avgOdds: 0 };
  const wins = group.filter(b => b.won).length;
  const staked = group.reduce((s, b) => s + b.amount, 0);
  const profit = group.reduce((s, b) => s + b.profit, 0);
  const roi = staked > 0 ? (profit / staked * 100) : 0;
  const avgOdds = group.reduce((s, b) => s + b.americanOdds, 0) / group.length;
  const clvBets = group.filter(b => b.clv !== null);
  const avgCLV = clvBets.length > 0 ? clvBets.reduce((s, b) => s + b.clv, 0) / clvBets.length * 100 : null;
  return { label, n: group.length, wins, losses: group.length - wins, winPct: (wins/group.length*100), staked, profit, roi, avgOdds, avgCLV };
}

function fmt(g) {
  if (!g || g.n === 0) return `  ${g?.label || '?'}: no bets`;
  let line = `  ${g.label.padEnd(40)} ${String(g.n).padStart(4)} | ${g.wins}-${g.losses} (${g.winPct.toFixed(1)}%) | ${g.profit >= 0 ? '+' : ''}$${g.profit.toFixed(0).padStart(6)} | ${g.roi >= 0 ? '+' : ''}${g.roi.toFixed(1)}% ROI`;
  if (g.avgCLV !== null) line += ` | CLV ${g.avgCLV >= 0 ? '+' : ''}${g.avgCLV.toFixed(2)}%`;
  return line;
}

console.log('═'.repeat(95));
console.log(`  NBA TOTALS DEEP DIVE — ${totals.length} bets, -$${Math.abs(totals.reduce((s,b)=>s+b.profit,0)).toFixed(0)}`);
console.log('═'.repeat(95));

// ─── 1. OVERALL ───
console.log('\n━━━ 1. OVERALL ━━━');
console.log(fmt(analyze(totals, 'All NBA Totals')));

// ─── 2. OVERS vs UNDERS ───
console.log('\n━━━ 2. OVERS vs UNDERS ━━━');
console.log(fmt(analyze(totals.filter(b => b.direction === 'Over'), 'Overs')));
console.log(fmt(analyze(totals.filter(b => b.direction === 'Under'), 'Unders')));

// ─── 3. BY LINE RANGE ───
console.log('\n━━━ 3. BY TOTAL LINE RANGE ━━━');
const lineRanges = [
  { label: 'Low (< 210)', filter: b => b.totalLine && b.totalLine < 210 },
  { label: 'Mid-Low (210-219.5)', filter: b => b.totalLine && b.totalLine >= 210 && b.totalLine < 220 },
  { label: 'Mid (220-229.5)', filter: b => b.totalLine && b.totalLine >= 220 && b.totalLine < 230 },
  { label: 'Mid-High (230-239.5)', filter: b => b.totalLine && b.totalLine >= 230 && b.totalLine < 240 },
  { label: 'High (240+)', filter: b => b.totalLine && b.totalLine >= 240 },
];

for (const lr of lineRanges) {
  const g = analyze(totals.filter(lr.filter), lr.label);
  if (g.n >= 5) console.log(fmt(g));
}

// ─── 4. LINE RANGE × DIRECTION ───
console.log('\n━━━ 4. LINE RANGE × DIRECTION ━━━');
for (const lr of lineRanges) {
  for (const dir of ['Over', 'Under']) {
    const g = analyze(totals.filter(b => lr.filter(b) && b.direction === dir), `${lr.label} ${dir}`);
    if (g.n >= 5) console.log(fmt(g));
  }
}

// ─── 5. BY SPORTSBOOK ───
console.log('\n━━━ 5. BY SPORTSBOOK ━━━');
const books = {};
for (const b of totals) {
  if (!books[b.book]) books[b.book] = [];
  books[b.book].push(b);
}
for (const [book, bets] of Object.entries(books).sort((a, b) => b[1].length - a[1].length)) {
  if (bets.length >= 5) {
    const shortName = book.replace(' Sportsbook', '').replace('Draftkings', 'DK');
    console.log(fmt(analyze(bets, shortName)));
  }
}

// ─── 6. MONTHLY BREAKDOWN ───
console.log('\n━━━ 6. MONTHLY BREAKDOWN ━━━');
const months = [...new Set(totals.map(b => b.month))].sort();
let cumProfit = 0;
for (const m of months) {
  const g = analyze(totals.filter(b => b.month === m), m);
  if (g.n > 0) {
    cumProfit += g.profit;
    const overs = totals.filter(b => b.month === m && b.direction === 'Over');
    const unders = totals.filter(b => b.month === m && b.direction === 'Under');
    const overPL = overs.reduce((s, b) => s + b.profit, 0);
    const underPL = unders.reduce((s, b) => s + b.profit, 0);
    console.log(`${fmt(g)}  | O:${overPL >= 0 ? '+' : ''}$${overPL.toFixed(0)} U:${underPL >= 0 ? '+' : ''}$${underPL.toFixed(0)} | cum: ${cumProfit >= 0 ? '+' : ''}$${cumProfit.toFixed(0)}`);
  }
}

// ─── 7. ODDS TIER ───
console.log('\n━━━ 7. BY ODDS TIER ━━━');
const oddsTiers = [
  { label: 'Heavy juice (≤ -115)', filter: b => b.americanOdds <= -115 },
  { label: 'Standard (-114 to -105)', filter: b => b.americanOdds > -115 && b.americanOdds <= -105 },
  { label: 'Low juice (-104 to -101)', filter: b => b.americanOdds > -105 && b.americanOdds <= -101 },
  { label: 'Even to plus (≥ -100)', filter: b => b.americanOdds > -101 },
];

for (const ot of oddsTiers) {
  const g = analyze(totals.filter(ot.filter), ot.label);
  if (g.n >= 5) console.log(fmt(g));
}

// ─── 8. CLV ANALYSIS ───
console.log('\n━━━ 8. CLV — ARE YOU BEATING THE CLOSING LINE? ━━━');
const totalsCLV = totals.filter(b => b.clv !== null);
const avgCLV = totalsCLV.reduce((s, b) => s + b.clv, 0) / totalsCLV.length * 100;
const beatClose = totalsCLV.filter(b => b.clv < 0);
const lostClose = totalsCLV.filter(b => b.clv > 0);

console.log(`  Totals with CLV data: ${totalsCLV.length}`);
console.log(`  Average CLV:          ${avgCLV >= 0 ? '+' : ''}${avgCLV.toFixed(3)}%`);
console.log(`  Beat closing line:    ${beatClose.length} (${(beatClose.length/totalsCLV.length*100).toFixed(1)}%)`);
console.log(`  Lost to closing:      ${lostClose.length} (${(lostClose.length/totalsCLV.length*100).toFixed(1)}%)`);

// Compare CLV to spreads and MLs
const spreads = allBets.filter(b => b.isSpread);
const mls = allBets.filter(b => b.isML);
const spreadsCLV = spreads.filter(b => b.clv !== null);
const mlsCLV = mls.filter(b => b.clv !== null);

console.log(`\n  Comparison:`);
console.log(`    Spreads CLV:  ${spreadsCLV.length > 0 ? (spreadsCLV.reduce((s,b) => s+b.clv,0)/spreadsCLV.length*100).toFixed(3) : 'N/A'}% → ROI: +${(spreads.reduce((s,b) => s+b.profit,0) / spreads.reduce((s,b) => s+b.amount,0) * 100).toFixed(1)}%`);
console.log(`    MLs CLV:      ${mlsCLV.length > 0 ? (mlsCLV.reduce((s,b) => s+b.clv,0)/mlsCLV.length*100).toFixed(3) : 'N/A'}% → ROI: +${(mls.reduce((s,b) => s+b.profit,0) / mls.reduce((s,b) => s+b.amount,0) * 100).toFixed(1)}%`);
console.log(`    Totals CLV:   ${avgCLV.toFixed(3)}% → ROI: ${(totals.reduce((s,b) => s+b.profit,0) / totals.reduce((s,b) => s+b.amount,0) * 100).toFixed(1)}%`);

// ─── 9. STAKE SIZE ───
console.log('\n━━━ 9. STAKE SIZE ━━━');
const stakeRanges = [
  { label: '$1-10', filter: b => b.amount <= 10 },
  { label: '$11-25', filter: b => b.amount > 10 && b.amount <= 25 },
  { label: '$26-50', filter: b => b.amount > 25 && b.amount <= 50 },
  { label: '$51+', filter: b => b.amount > 50 },
];

for (const sr of stakeRanges) {
  const g = analyze(totals.filter(sr.filter), sr.label);
  if (g.n >= 5) console.log(fmt(g));
}

// ─── 10. WHAT DOES A PROFITABLE TOTALS FILTER LOOK LIKE? ───
console.log('\n━━━ 10. CAN WE FIND A PROFITABLE FILTER? ━━━');

// Try various filters
const filters = [
  ['Unders only', b => b.direction === 'Under'],
  ['Overs only', b => b.direction === 'Over'],
  ['Unders + non-Novig', b => b.direction === 'Under' && b.book !== 'Novig'],
  ['Unders + plus odds', b => b.direction === 'Under' && b.isPlusOdds],
  ['Overs + low line (<220)', b => b.direction === 'Over' && b.totalLine && b.totalLine < 220],
  ['Overs + high line (230+)', b => b.direction === 'Over' && b.totalLine && b.totalLine >= 230],
  ['Unders + high line (230+)', b => b.direction === 'Under' && b.totalLine && b.totalLine >= 230],
  ['Unders + mid line (220-229)', b => b.direction === 'Under' && b.totalLine && b.totalLine >= 220 && b.totalLine < 230],
  ['Non-Novig totals', b => b.book !== 'Novig'],
  ['Non-Novig unders', b => b.book !== 'Novig' && b.direction === 'Under'],
  ['ProphetX totals', b => b.book === 'ProphetX'],
  ['Low juice (> -108)', b => b.americanOdds > -108],
  ['Unders + low juice (> -108)', b => b.direction === 'Under' && b.americanOdds > -108],
  ['Strong edge only (EV 3%+)', b => b.ev >= 0.03],
  ['Beat closing line bets', b => b.clv !== null && b.clv < 0],
  ['FanDuel/DK totals', b => b.book === 'Fanduel Sportsbook' || b.book === 'Draftkings Sportsbook'],
  ['Exclude Dec (worst month)', b => b.month !== '2025-12'],
  ['Exclude Dec+Mar', b => b.month !== '2025-12' && b.month !== '2026-03'],
  ['Feb+ only (recent)', b => b.dateStr >= '2026-02-01'],
];

console.log(`\n  ${'Filter'.padEnd(40)} ${'N'.padStart(4)} | ${'Record'.padStart(8)} | ${'P/L'.padStart(8)} | ${'ROI'.padStart(8)} | Verdict`);
console.log(`  ${'-'.repeat(85)}`);

for (const [label, filterFn] of filters) {
  const group = totals.filter(filterFn);
  if (group.length < 10) continue;
  const g = analyze(group, label);
  const verdict = g.roi > 3 ? '✅ GOOD' : g.roi > 0 ? '👍 OK' : g.roi > -3 ? '⚠️ MEH' : '❌ BAD';
  console.log(`  ${label.padEnd(40)} ${String(g.n).padStart(4)} | ${(g.wins+'-'+g.losses).padStart(8)} | ${(g.profit >= 0 ? '+$' : '-$') + Math.abs(g.profit).toFixed(0)}${' '.repeat(Math.max(0, 7 - ((g.profit >= 0 ? '+$' : '-$') + Math.abs(g.profit).toFixed(0)).length))} | ${(g.roi >= 0 ? '+' : '') + g.roi.toFixed(1)}%${' '.repeat(Math.max(0, 7 - ((g.roi >= 0 ? '+' : '') + g.roi.toFixed(1) + '%').length))} | ${verdict}`);
}

// ─── 11. WHAT'S THE MODEL ACTUALLY DOING? ───
console.log('\n━━━ 11. SAMPLE BETS — WHAT DOES THE MODEL PICK? ━━━');
console.log('\n  Recent losing total bets:');
const recentLosses = totals.filter(b => !b.won).slice(-10);
for (const b of recentLosses) {
  console.log(`    ${b.dateStr} | ${b.info.substring(0, 70).padEnd(70)} | ${b.americanOdds >= 0 ? '+' : ''}${b.americanOdds} | $${b.amount} | ${b.book.replace(' Sportsbook', '')}`);
}

console.log('\n  Recent winning total bets:');
const recentWins = totals.filter(b => b.won).slice(-10);
for (const b of recentWins) {
  console.log(`    ${b.dateStr} | ${b.info.substring(0, 70).padEnd(70)} | ${b.americanOdds >= 0 ? '+' : ''}${b.americanOdds} | $${b.amount} | ${b.book.replace(' Sportsbook', '')}`);
}

// ─── 12. HEAD TO HEAD: Your Totals Model vs Just Betting Unders on FD/DK ───
console.log('\n━━━ 12. WHAT IF YOU JUST BET UNDERS ON FD/DK? ━━━');
const fdDkUnders = totals.filter(b => (b.book === 'Fanduel Sportsbook' || b.book === 'Draftkings Sportsbook') && b.direction === 'Under');
console.log(fmt(analyze(fdDkUnders, 'FD/DK Unders')));

const prophetxTotals = totals.filter(b => b.book === 'ProphetX');
console.log(fmt(analyze(prophetxTotals, 'ProphetX (all totals)')));
console.log(fmt(analyze(prophetxTotals.filter(b => b.direction === 'Under'), 'ProphetX Unders')));
console.log(fmt(analyze(prophetxTotals.filter(b => b.direction === 'Over'), 'ProphetX Overs')));

console.log('\n' + '═'.repeat(95));
console.log('  DIAGNOSIS & RECOMMENDATIONS');
console.log('═'.repeat(95));
console.log(`
  WHAT'S GOING WRONG:
  [To be interpreted from the data above]
  
  KEY QUESTIONS FOR THE MODEL:
  1. Is the totals model using the same features as spreads/ML? (spreads work, totals don't)
  2. Is it properly weighting pace, rest, travel, altitude?
  3. Is it accounting for referee tendencies? (massive impact on totals)
  4. Does it adjust for line movement? (stale lines = death for totals)
  5. Is the edge threshold too low? (betting marginal totals = -EV with juice)
  6. Is it overweighting season averages vs recent form?
`);
