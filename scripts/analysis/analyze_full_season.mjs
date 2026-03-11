/**
 * FULL SEASON ANALYSIS
 * - ML/Spread/Totals from start of season (all data)
 * - Soccer BTTS
 * - Props from ~12/10 onward (when filtering started)
 * - NCAAM
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
  b.league = b.leagues || '';
  b.sport = b.sports || '';
  b.info = b.bet_info || '';
  b.book = b.sportsbook || '';
  const il = b.info.toLowerCase();

  // Market classification
  if (/spread/i.test(il) && !/btts|both teams/i.test(il)) b.market = 'Spread';
  else if (/moneyline|money line/i.test(il)) b.market = 'Moneyline';
  else if (/btts|both teams to score/i.test(il)) b.market = 'BTTS';
  else if (/draw no bet/i.test(il)) b.market = 'Draw No Bet';
  else {
    const hasPlayerName = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b.*\b(points|rebounds|assists|3.*pointer|steals|blocks|pts|reb|ast|goals|shots|saves|passes|tackles)/i.test(b.info);
    const has2PlusDigitLine = /\b(over|under)\s+\d{3,}/i.test(il);
    if (hasPlayerName || /\d+\+.*\b(points|rebounds|assists|steals|blocks|goals|shots)\b/i.test(il) || /\b(points|rebounds|assists|steals|blocks)\s*(o\/u|over|under)/i.test(il)) {
      b.market = 'Player Prop';
    } else if (has2PlusDigitLine || /\b(total\s*points|total\s*goals|total\s*$)/i.test(il) || /\b(over|under)\s+\d+\.?\d*\s*(total|$)/i.test(il)) {
      b.market = 'Total';
    } else {
      b.market = 'Other';
    }
  }

  // Prop sub-type
  b.propType = null;
  if (b.market === 'Player Prop') {
    if (/points/i.test(il)) b.propType = 'Points';
    else if (/rebounds?/i.test(il)) b.propType = 'Rebounds';
    else if (/assists?/i.test(il)) b.propType = 'Assists';
    else if (/3.*pointer|three/i.test(il)) b.propType = '3-Pointers';
    else if (/steals?/i.test(il)) b.propType = 'Steals';
    else if (/blocks?/i.test(il)) b.propType = 'Blocks';
    else if (/goals?/i.test(il)) b.propType = 'Goals';
    else if (/shots/i.test(il)) b.propType = 'Shots';
    else b.propType = 'Other';
  }

  b.direction = null;
  if (/under/i.test(il)) b.direction = 'Under';
  else if (/over|\d+\+/i.test(il)) b.direction = 'Over';
  else if (/\byes\b/i.test(il)) b.direction = 'Yes';
  else if (/\bno\b/i.test(il)) b.direction = 'No';

  b.isNFL = b.league === 'NFL' || b.league === 'NCAAFB';
  b.isSoccer = b.sport === 'Soccer' || /EPL|La Liga|Bundesliga|Serie A|Ligue 1|Champions|MLS|UEFA/i.test(b.league);
  b.isNBA = b.league === 'NBA';
  b.isNCAAM = b.league === 'NCAAM' || b.league === 'NCAAMBB' || /NCAA/i.test(b.league);
  
  return b;
});

allBets.sort((a, b) => a.datePlaced - b.datePlaced);

function analyze(group, label) {
  if (group.length === 0) return { label, n: 0, wins: 0, losses: 0, winPct: 0, staked: 0, profit: 0, roi: 0, avgOdds: 0 };
  const wins = group.filter(b => b.won).length;
  const staked = group.reduce((s, b) => s + b.amount, 0);
  const profit = group.reduce((s, b) => s + b.profit, 0);
  const roi = staked > 0 ? (profit / staked * 100) : 0;
  const avgOdds = group.reduce((s, b) => s + b.americanOdds, 0) / group.length;
  return { label, n: group.length, wins, losses: group.length - wins, winPct: (wins/group.length*100), staked, profit, roi, avgOdds };
}

function fmt(g) {
  if (!g || g.n === 0) return `  ${g?.label || '?'.padEnd(40)}: no bets`;
  return `  ${g.label.padEnd(42)} ${String(g.n).padStart(5)} | ${g.wins}-${g.losses} (${g.winPct.toFixed(1)}%) | ${g.profit >= 0 ? '+' : ''}$${g.profit.toFixed(0).padStart(7)} | ${g.roi >= 0 ? '+' : ''}${g.roi.toFixed(1)}% ROI | avg ${g.avgOdds >= 0 ? '+' : ''}${g.avgOdds.toFixed(0)}`;
}

function printSection(title) {
  console.log(`\n${'━'.repeat(95)}`);
  console.log(`  ${title}`);
  console.log('━'.repeat(95));
}

// Date range
const firstDate = allBets[0].dateStr;
const lastDate = allBets[allBets.length - 1].dateStr;
const noNFL = allBets.filter(b => !b.isNFL);

console.log('═'.repeat(95));
console.log(`  FULL SEASON ANALYSIS — ${allBets.length} settled straight bets (${firstDate} → ${lastDate})`);
console.log('═'.repeat(95));
console.log(fmt(analyze(allBets, 'ALL BETS (incl NFL)')));
console.log(fmt(analyze(noNFL, 'ALL BETS (no NFL)')));

// ═══════════════════════════════════════════════════════════════
// PART 1: NBA SPREADS / ML / TOTALS — FULL SEASON
// ═══════════════════════════════════════════════════════════════
printSection('1. NBA GAME PICKS — FULL SEASON');

const nba = allBets.filter(b => b.isNBA);
console.log('\n' + fmt(analyze(nba, 'ALL NBA')));
console.log(fmt(analyze(nba.filter(b => b.market === 'Spread'), 'NBA Spreads')));
console.log(fmt(analyze(nba.filter(b => b.market === 'Moneyline'), 'NBA Moneylines')));
console.log(fmt(analyze(nba.filter(b => b.market === 'Total'), 'NBA Totals')));
console.log(fmt(analyze(nba.filter(b => b.market === 'Player Prop'), 'NBA Player Props')));

// NBA game picks by month
console.log('\n  NBA SPREADS — monthly:');
const months = [...new Set(nba.map(b => b.month))].sort();
for (const m of months) {
  const g = analyze(nba.filter(b => b.month === m && b.market === 'Spread'), m);
  if (g.n > 0) console.log(fmt(g));
}

console.log('\n  NBA MONEYLINES — monthly:');
for (const m of months) {
  const g = analyze(nba.filter(b => b.month === m && b.market === 'Moneyline'), m);
  if (g.n > 0) console.log(fmt(g));
}

console.log('\n  NBA TOTALS — monthly:');
for (const m of months) {
  const g = analyze(nba.filter(b => b.month === m && b.market === 'Total'), m);
  if (g.n > 0) console.log(fmt(g));
}

// NBA game picks combined monthly
console.log('\n  NBA ALL GAME PICKS (Spread+ML+Total) — monthly:');
let cumProfit = 0;
for (const m of months) {
  const g = analyze(nba.filter(b => b.month === m && ['Spread', 'Moneyline', 'Total'].includes(b.market)), m);
  if (g.n > 0) {
    cumProfit += g.profit;
    console.log(`${fmt(g)}  | cum: ${cumProfit >= 0 ? '+' : ''}$${cumProfit.toFixed(0)}`);
  }
}

// Dogs vs Favs in game picks
console.log('\n  NBA GAME PICKS — Dogs vs Favorites:');
const nbaGP = nba.filter(b => ['Spread', 'Moneyline'].includes(b.market));
console.log(fmt(analyze(nbaGP.filter(b => b.isPlusOdds), 'Dogs (+ odds)')));
console.log(fmt(analyze(nbaGP.filter(b => !b.isPlusOdds), 'Favorites (- odds)')));

// ═══════════════════════════════════════════════════════════════
// PART 2: NCAAM — FULL SEASON
// ═══════════════════════════════════════════════════════════════
printSection('2. NCAAM — FULL SEASON');

const ncaam = allBets.filter(b => b.isNCAAM);
console.log('\n' + fmt(analyze(ncaam, 'ALL NCAAM')));
console.log(fmt(analyze(ncaam.filter(b => b.market === 'Spread'), 'NCAAM Spreads')));
console.log(fmt(analyze(ncaam.filter(b => b.market === 'Moneyline'), 'NCAAM Moneylines')));
console.log(fmt(analyze(ncaam.filter(b => b.market === 'Total'), 'NCAAM Totals')));

console.log('\n  NCAAM — Dogs vs Favorites:');
console.log(fmt(analyze(ncaam.filter(b => b.isPlusOdds), 'Dogs (+ odds)')));
console.log(fmt(analyze(ncaam.filter(b => !b.isPlusOdds), 'Favorites (- odds)')));

console.log('\n  NCAAM — monthly:');
cumProfit = 0;
const ncaamMonths = [...new Set(ncaam.map(b => b.month))].sort();
for (const m of ncaamMonths) {
  const g = analyze(ncaam.filter(b => b.month === m), m);
  if (g.n > 0) {
    cumProfit += g.profit;
    console.log(`${fmt(g)}  | cum: ${cumProfit >= 0 ? '+' : ''}$${cumProfit.toFixed(0)}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// PART 3: SOCCER — BTTS + OTHER
// ═══════════════════════════════════════════════════════════════
printSection('3. SOCCER — FULL SEASON');

const soccer = allBets.filter(b => b.isSoccer);
console.log('\n' + fmt(analyze(soccer, 'ALL SOCCER')));
console.log(fmt(analyze(soccer.filter(b => b.market === 'BTTS'), 'BTTS')));
console.log(fmt(analyze(soccer.filter(b => b.market === 'Moneyline'), 'Soccer ML')));
console.log(fmt(analyze(soccer.filter(b => b.market === 'Spread'), 'Soccer Spread')));
console.log(fmt(analyze(soccer.filter(b => b.market === 'Total'), 'Soccer Totals')));
console.log(fmt(analyze(soccer.filter(b => b.market === 'Draw No Bet'), 'Draw No Bet')));
console.log(fmt(analyze(soccer.filter(b => b.market === 'Other'), 'Soccer Other')));

// BTTS Yes vs No
const btts = soccer.filter(b => b.market === 'BTTS');
console.log('\n  BTTS breakdown:');
console.log(fmt(analyze(btts.filter(b => b.direction === 'Yes' || /yes/i.test(b.info)), 'BTTS Yes')));
console.log(fmt(analyze(btts.filter(b => b.direction === 'No' || /\bno\b/i.test(b.info)), 'BTTS No')));

// Soccer by league
console.log('\n  Soccer by league:');
const soccerLeagues = {};
for (const b of soccer) {
  const l = b.league || 'Unknown';
  if (!soccerLeagues[l]) soccerLeagues[l] = [];
  soccerLeagues[l].push(b);
}
for (const [league, bets] of Object.entries(soccerLeagues).sort((a, b) => b[1].length - a[1].length)) {
  if (bets.length >= 5) console.log(fmt(analyze(bets, league)));
}

// Soccer monthly
console.log('\n  Soccer — monthly:');
cumProfit = 0;
const soccerMonths = [...new Set(soccer.map(b => b.month))].sort();
for (const m of soccerMonths) {
  const g = analyze(soccer.filter(b => b.month === m), m);
  if (g.n > 0) {
    cumProfit += g.profit;
    console.log(`${fmt(g)}  | cum: ${cumProfit >= 0 ? '+' : ''}$${cumProfit.toFixed(0)}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// PART 4: NBA PROPS — FROM 12/10 ONWARD (filtered era)
// ═══════════════════════════════════════════════════════════════
printSection('4. NBA PLAYER PROPS — FROM 12/10 ONWARD (filtered era)');

const propsFiltered = nba.filter(b => b.market === 'Player Prop' && b.dateStr >= '2025-12-10');
console.log('\n' + fmt(analyze(propsFiltered, 'ALL NBA Props (12/10+)')));

// By prop type
const propTypes = ['Rebounds', 'Points', 'Assists', '3-Pointers', 'Steals', 'Blocks'];
console.log('\n  By prop type:');
for (const pt of propTypes) {
  const g = analyze(propsFiltered.filter(b => b.propType === pt), pt);
  if (g.n > 0) console.log(fmt(g));
}

console.log('\n  By prop type — PLUS ODDS ONLY:');
for (const pt of propTypes) {
  const g = analyze(propsFiltered.filter(b => b.propType === pt && b.isPlusOdds), `${pt} @ + odds`);
  if (g.n > 0) console.log(fmt(g));
}

console.log('\n  R+A combined (12/10+):');
const ra = propsFiltered.filter(b => b.propType === 'Rebounds' || b.propType === 'Assists');
console.log(fmt(analyze(ra, 'R+A (all)')));
console.log(fmt(analyze(ra.filter(b => b.isPlusOdds), 'R+A @ + odds')));
console.log(fmt(analyze(ra.filter(b => !b.isPlusOdds), 'R+A @ - odds')));
console.log(fmt(analyze(ra.filter(b => b.direction === 'Under'), 'R+A Unders')));
console.log(fmt(analyze(ra.filter(b => b.direction === 'Over'), 'R+A Overs')));

// Props monthly
console.log('\n  Props (12/10+) — monthly:');
cumProfit = 0;
const propMonths = [...new Set(propsFiltered.map(b => b.month))].sort();
for (const m of propMonths) {
  const g = analyze(propsFiltered.filter(b => b.month === m), m);
  if (g.n > 0) {
    cumProfit += g.profit;
    console.log(`${fmt(g)}  | cum: ${cumProfit >= 0 ? '+' : ''}$${cumProfit.toFixed(0)}`);
  }
}

// Pre-filter props (before 12/10) vs post
printSection('4b. PROPS: PRE-FILTER vs POST-FILTER');
const propsPre = nba.filter(b => b.market === 'Player Prop' && b.dateStr < '2025-12-10');
console.log(fmt(analyze(propsPre, 'NBA Props BEFORE 12/10 (unfiltered)')));
console.log(fmt(analyze(propsFiltered, 'NBA Props AFTER 12/10 (filtered)')));

// ═══════════════════════════════════════════════════════════════
// PART 5: OVERALL P/L BY CATEGORY — FULL SEASON
// ═══════════════════════════════════════════════════════════════
printSection('5. FULL SEASON P/L BY CATEGORY');

const categories = [
  ['NBA Spreads', b => b.isNBA && b.market === 'Spread'],
  ['NBA Moneylines', b => b.isNBA && b.market === 'Moneyline'],
  ['NBA Totals', b => b.isNBA && b.market === 'Total'],
  ['NBA Props (12/10+)', b => b.isNBA && b.market === 'Player Prop' && b.dateStr >= '2025-12-10'],
  ['NBA Props (pre-12/10)', b => b.isNBA && b.market === 'Player Prop' && b.dateStr < '2025-12-10'],
  ['NCAAM All', b => b.isNCAAM],
  ['Soccer All', b => b.isSoccer],
  ['NFL All', b => b.isNFL],
];

console.log(`\n  ${'Category'.padEnd(42)} ${'Bets'.padStart(5)} | ${'Record'.padStart(12)} | ${'P/L'.padStart(9)} | ${'ROI'.padStart(8)}`);
console.log(`  ${'-'.repeat(85)}`);
let totalProfit = 0;
for (const [label, filterFn] of categories) {
  const g = analyze(allBets.filter(filterFn), label);
  if (g.n > 0) {
    totalProfit += g.profit;
    console.log(`  ${label.padEnd(42)} ${String(g.n).padStart(5)} | ${(g.wins + '-' + g.losses).padStart(12)} | ${(g.profit >= 0 ? '+$' : '-$') + Math.abs(g.profit).toFixed(0)}${' '.repeat(Math.max(0, 8 - ((g.profit >= 0 ? '+$' : '-$') + Math.abs(g.profit).toFixed(0)).length))} | ${(g.roi >= 0 ? '+' : '') + g.roi.toFixed(1)}%`);
  }
}
console.log(`  ${'-'.repeat(85)}`);
console.log(`  ${'TOTAL'.padEnd(42)} ${String(allBets.length).padStart(5)} |              | ${totalProfit >= 0 ? '+$' : '-$'}${Math.abs(totalProfit).toFixed(0)}`);

// ═══════════════════════════════════════════════════════════════
// PART 6: CUMULATIVE P/L CHART — FULL SEASON
// ═══════════════════════════════════════════════════════════════
printSection('6. CUMULATIVE P/L — FULL SEASON BY MONTH');

const allMonths = [...new Set(allBets.map(b => b.month))].sort();
let cumAll = 0, cumGP = 0, cumProps = 0, cumSoccer = 0, cumNCAAM = 0;

console.log(`\n  ${'Month'.padEnd(10)} | ${'ALL'.padStart(8)} | ${'NBA GP'.padStart(8)} | ${'Props'.padStart(8)} | ${'Soccer'.padStart(8)} | ${'NCAAM'.padStart(8)}`);
console.log(`  ${'-'.repeat(60)}`);

for (const m of allMonths) {
  const mBets = allBets.filter(b => b.month === m);
  const mGP = mBets.filter(b => b.isNBA && ['Spread', 'Moneyline', 'Total'].includes(b.market));
  const mProps = mBets.filter(b => b.isNBA && b.market === 'Player Prop');
  const mSoccer = mBets.filter(b => b.isSoccer);
  const mNCAAM = mBets.filter(b => b.isNCAAM);
  
  cumAll += mBets.reduce((s, b) => s + b.profit, 0);
  cumGP += mGP.reduce((s, b) => s + b.profit, 0);
  cumProps += mProps.reduce((s, b) => s + b.profit, 0);
  cumSoccer += mSoccer.reduce((s, b) => s + b.profit, 0);
  cumNCAAM += mNCAAM.reduce((s, b) => s + b.profit, 0);
  
  const f = v => `${v >= 0 ? '+' : ''}$${v.toFixed(0)}`;
  console.log(`  ${m.padEnd(10)} | ${f(cumAll).padStart(8)} | ${f(cumGP).padStart(8)} | ${f(cumProps).padStart(8)} | ${f(cumSoccer).padStart(8)} | ${f(cumNCAAM).padStart(8)}`);
}

console.log('\n' + '═'.repeat(95));
