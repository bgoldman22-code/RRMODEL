/**
 * Quick R + A (Rebounds + Assists) prop performance since 12/15
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

const bets = lines.slice(1).map(line => {
  const cols = parseCSVLine(line);
  const obj = {};
  headers.forEach((h, i) => obj[h] = cols[i] || '');
  return obj;
}).filter(b => {
  if (b.type !== 'straight') return false;
  if (b.status !== 'SETTLED_WIN' && b.status !== 'SETTLED_LOSS') return false;
  return true;
}).map(b => {
  b.won = b.status === 'SETTLED_WIN';
  b.odds = parseFloat(b.odds) || 0;
  b.amount = parseFloat(b.amount) || 0;
  b.profit = parseFloat(b.profit) || 0;
  b.americanOdds = b.odds >= 2 ? Math.round((b.odds - 1) * 100) : Math.round(-100 / (b.odds - 1));
  b.isPlusOdds = b.americanOdds > 0;
  b.datePlaced = new Date(b.time_placed_iso);
  b.dateStr = b.datePlaced.toISOString().slice(0, 10);
  b.month = b.datePlaced.toISOString().slice(0, 7);
  b.book = b.sportsbook || '';
  b.info = b.bet_info || '';
  const il = b.info.toLowerCase();
  
  b.propType = null;
  if (/rebounds?/i.test(il)) b.propType = 'Rebounds';
  else if (/assists?/i.test(il)) b.propType = 'Assists';
  else if (/points/i.test(il)) b.propType = 'Points';
  else if (/3.*pointer|three/i.test(il)) b.propType = '3-Pointers';
  else if (/steals?/i.test(il)) b.propType = 'Steals';
  else if (/blocks?/i.test(il)) b.propType = 'Blocks';
  
  b.direction = null;
  if (/under/i.test(il)) b.direction = 'Under';
  else if (/over|\d+\+/i.test(il)) b.direction = 'Over';
  
  return b;
});

const ra = bets.filter(b => b.propType === 'Rebounds' || b.propType === 'Assists');

function analyze(group, label) {
  if (group.length === 0) return null;
  const wins = group.filter(b => b.won).length;
  const staked = group.reduce((s, b) => s + b.amount, 0);
  const profit = group.reduce((s, b) => s + b.profit, 0);
  const roi = staked > 0 ? (profit / staked * 100) : 0;
  const avgOdds = group.reduce((s, b) => s + b.americanOdds, 0) / group.length;
  return { label, n: group.length, wins, losses: group.length - wins, winPct: (wins/group.length*100), staked, profit, roi, avgOdds };
}

function fmt(g) {
  if (!g || g.n === 0) return `  ${g?.label || '?'}: no bets`;
  return `  ${g.label.padEnd(40)} ${String(g.n).padStart(4)} bets | ${g.wins}-${g.losses} (${g.winPct.toFixed(1)}%) | ${g.profit >= 0 ? '+' : ''}$${g.profit.toFixed(0).padStart(6)} | ${g.roi >= 0 ? '+' : ''}${g.roi.toFixed(1)}% ROI | avg ${g.avgOdds >= 0 ? '+' : ''}${g.avgOdds.toFixed(0)}`;
}

console.log('═'.repeat(90));
console.log('  REBOUNDS + ASSISTS PROP PERFORMANCE');
console.log('═'.repeat(90));

console.log('\n' + fmt(analyze(ra, 'R + A Combined')));
console.log(fmt(analyze(ra.filter(b => b.propType === 'Rebounds'), 'Rebounds')));
console.log(fmt(analyze(ra.filter(b => b.propType === 'Assists'), 'Assists')));

console.log('\n  BY ODDS TIER:');
console.log(fmt(analyze(ra.filter(b => b.isPlusOdds), 'R+A @ Plus odds')));
console.log(fmt(analyze(ra.filter(b => !b.isPlusOdds), 'R+A @ Minus odds')));

console.log('\n  BY DIRECTION:');
console.log(fmt(analyze(ra.filter(b => b.direction === 'Over'), 'R+A Overs')));
console.log(fmt(analyze(ra.filter(b => b.direction === 'Under'), 'R+A Unders')));

console.log('\n  BEST COMBOS:');
console.log(fmt(analyze(ra.filter(b => b.isPlusOdds && b.direction === 'Over'), 'R+A Over @ + odds')));
console.log(fmt(analyze(ra.filter(b => b.isPlusOdds && b.direction === 'Under'), 'R+A Under @ + odds')));
console.log(fmt(analyze(ra.filter(b => !b.isPlusOdds && b.direction === 'Over'), 'R+A Over @ - odds')));
console.log(fmt(analyze(ra.filter(b => !b.isPlusOdds && b.direction === 'Under'), 'R+A Under @ - odds')));

// Monthly breakdown
console.log('\n  MONTHLY TREND:');
const months = [...new Set(ra.map(b => b.month))].sort();
let cumProfit = 0;
for (const m of months) {
  const g = analyze(ra.filter(b => b.month === m), m);
  cumProfit += g.profit;
  console.log(`${fmt(g)}  | cum: ${cumProfit >= 0 ? '+' : ''}$${cumProfit.toFixed(0)}`);
}

// Weekly breakdown
console.log('\n  WEEKLY TREND (last 8 weeks):');
const weeks = [];
const sorted = [...ra].sort((a, b) => a.datePlaced - b.datePlaced);
// Group by ISO week
for (const b of sorted) {
  const d = b.datePlaced;
  const dayOfWeek = d.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const weekKey = monday.toISOString().slice(0, 10);
  if (!weeks.length || weeks[weeks.length - 1].key !== weekKey) {
    weeks.push({ key: weekKey, bets: [] });
  }
  weeks[weeks.length - 1].bets.push(b);
}

cumProfit = ra.reduce((s, b) => s + b.profit, 0); // start from end
const allWeeks = weeks.slice(-8);
let runningProfit = ra.filter(b => b.datePlaced < allWeeks[0].bets[0].datePlaced).reduce((s, b) => s + b.profit, 0);

for (const w of allWeeks) {
  const g = analyze(w.bets, `Week of ${w.key}`);
  runningProfit += g.profit;
  const bar = g.roi >= 0 
    ? '🟢' + '█'.repeat(Math.min(20, Math.round(g.roi))) 
    : '🔴' + '▓'.repeat(Math.min(20, Math.round(Math.abs(g.roi))));
  console.log(`${fmt(g)}  ${bar}`);
}

// vs everything else
console.log('\n  R+A vs EVERYTHING ELSE:');
const notRA = bets.filter(b => b.propType !== 'Rebounds' && b.propType !== 'Assists');
console.log(fmt(analyze(ra, 'R + A props')));
console.log(fmt(analyze(notRA, 'Everything else')));

const raProfit = ra.reduce((s, b) => s + b.profit, 0);
const notRAProfit = notRA.reduce((s, b) => s + b.profit, 0);
console.log(`\n  → R+A is carrying ${raProfit >= 0 ? '+' : ''}$${raProfit.toFixed(0)} vs everything else at ${notRAProfit >= 0 ? '+' : ''}$${notRAProfit.toFixed(0)}`);
console.log(`  → If you ONLY bet R+A props, you'd have ${(ra.reduce((s,b)=>s+b.profit,0) / ra.reduce((s,b)=>s+b.amount,0) * 100).toFixed(1)}% ROI`);

console.log('\n' + '═'.repeat(90));
