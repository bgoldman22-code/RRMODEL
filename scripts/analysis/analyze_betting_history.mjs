/**
 * Comprehensive Betting History Analysis
 * STRAIGHT BETS ONLY (excludes parlays)
 * Period: 12/15/2025 → present
 */

import { readFileSync } from 'fs';

// ─── Load & Parse CSV ─────────────────────────────────────────
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
});

// ─── Filter: straight bets only, settled (win/loss), exclude voids ─
const bets = allBets.filter(b => {
  if (b.type !== 'straight') return false;
  if (b.status !== 'SETTLED_WIN' && b.status !== 'SETTLED_LOSS') return false;
  return true;
});

console.log(`\n${'═'.repeat(80)}`);
console.log(`  COMPREHENSIVE BETTING ANALYSIS — STRAIGHT BETS ONLY`);
console.log(`  Total rows: ${allBets.length} | Straight settled: ${bets.length}`);
console.log(`${'═'.repeat(80)}\n`);

// ─── Parse fields ─────────────────────────────────────────────
for (const b of bets) {
  b.won = b.status === 'SETTLED_WIN';
  b.odds = parseFloat(b.odds) || 0;
  b.closing = parseFloat(b.closing_line) || 0;
  b.ev = parseFloat(b.ev) || 0;
  b.amount = parseFloat(b.amount) || 0;
  b.profit = parseFloat(b.profit) || 0;
  b.datePlaced = new Date(b.time_placed_iso);
  b.dateSettled = new Date(b.time_settled_iso);
  b.sport = b.sports || '';
  b.league = b.leagues || '';
  b.info = b.bet_info || '';
  
  // Classify market type
  const infoLower = b.info.toLowerCase();
  if (/spread/i.test(infoLower)) {
    b.market = 'Spread';
  } else if (/moneyline|money line/i.test(infoLower)) {
    b.market = 'Moneyline';
  } else if (/total|over \d|under \d|o\/u/i.test(infoLower)) {
    b.market = 'Total';
  } else if (/points|rebounds|assists|3.*pointers|steals|blocks|receptions|yards|passing|rushing|tackles|sacks|td|touchdown|strikeouts|hits|rbi|homer|goals|shots/i.test(infoLower)) {
    b.market = 'Player Prop';
  } else {
    b.market = 'Other';
  }

  // Refine: over/under on player stats = Player Prop
  if (b.market === 'Total' && /\b(points|rebounds|assists|3.*pointer|steals|blocks|receptions|yards|passing|rushing|tackles|td|touchdown|strikeouts|hits|rbi|homer|goals|shots)\b/i.test(infoLower)) {
    b.market = 'Player Prop';
  }
  
  // Odds tier (American odds approximation from decimal)
  const americanOdds = b.odds >= 2 ? Math.round((b.odds - 1) * 100) : Math.round(-100 / (b.odds - 1));
  b.americanOdds = americanOdds;
  if (americanOdds <= -200) b.oddsTier = 'Heavy Fav (≤-200)';
  else if (americanOdds <= -110) b.oddsTier = 'Small Fav (-199 to -110)';
  else if (americanOdds <= 110) b.oddsTier = 'Pick\'em (-109 to +110)';
  else if (americanOdds <= 200) b.oddsTier = 'Small Dog (+111 to +200)';
  else b.oddsTier = 'Big Dog (+201+)';

  // CLV (closing line value)
  if (b.closing > 0) {
    b.clv = (1 / b.odds) - (1 / b.closing); // positive = got better line than close
  } else {
    b.clv = null;
  }

  // Date string for grouping
  b.dateStr = b.datePlaced.toISOString().slice(0, 10);
  b.weekday = b.datePlaced.toLocaleDateString('en-US', { weekday: 'long' });
  
  // Month
  b.month = b.datePlaced.toISOString().slice(0, 7);
}

// ─── Helper functions ─────────────────────────────────────────
function analyzeGroup(group, label) {
  if (group.length === 0) return null;
  const wins = group.filter(b => b.won).length;
  const losses = group.length - wins;
  const totalStaked = group.reduce((s, b) => s + b.amount, 0);
  const totalProfit = group.reduce((s, b) => s + b.profit, 0);
  const roi = totalStaked > 0 ? (totalProfit / totalStaked * 100) : 0;
  const avgOdds = group.reduce((s, b) => s + b.americanOdds, 0) / group.length;
  const avgStake = totalStaked / group.length;
  
  // CLV
  const clvBets = group.filter(b => b.clv !== null);
  const avgCLV = clvBets.length > 0 ? clvBets.reduce((s, b) => s + b.clv, 0) / clvBets.length : null;
  const clvPositiveRate = clvBets.length > 0 ? clvBets.filter(b => b.clv > 0).length / clvBets.length * 100 : null;
  
  // EV
  const evBets = group.filter(b => b.ev !== 0);
  const avgEV = evBets.length > 0 ? evBets.reduce((s, b) => s + b.ev, 0) / evBets.length : null;

  return {
    label, count: group.length, wins, losses,
    winRate: (wins / group.length * 100),
    totalStaked, totalProfit, roi, avgOdds, avgStake,
    avgCLV, clvPositiveRate, avgEV
  };
}

function printGroup(g) {
  if (!g) return;
  const profitSign = g.totalProfit >= 0 ? '+' : '';
  const roiSign = g.roi >= 0 ? '+' : '';
  console.log(`  ${g.label.padEnd(35)} ${String(g.count).padStart(5)} bets | ${g.wins}-${g.losses} (${g.winRate.toFixed(1)}%) | ${profitSign}$${g.totalProfit.toFixed(2).padStart(9)} | ${roiSign}${g.roi.toFixed(1)}% ROI | Avg stake $${g.avgStake.toFixed(0)} | Avg odds ${g.avgOdds >= 0 ? '+' : ''}${g.avgOdds.toFixed(0)}`);
}

// ─── 1. OVERALL ───────────────────────────────────────────────
console.log('━'.repeat(80));
console.log('  1. OVERALL PERFORMANCE');
console.log('━'.repeat(80));
const overall = analyzeGroup(bets, 'ALL STRAIGHT BETS');
printGroup(overall);
console.log(`\n     Total staked: $${overall.totalStaked.toFixed(2)}`);
console.log(`     Net P/L: ${overall.totalProfit >= 0 ? '+' : ''}$${overall.totalProfit.toFixed(2)}`);
if (overall.avgCLV !== null) {
  console.log(`     Avg CLV: ${(overall.avgCLV * 100).toFixed(2)}% | CLV+ rate: ${overall.clvPositiveRate.toFixed(1)}%`);
}
if (overall.avgEV !== null) {
  console.log(`     Avg expected EV: ${(overall.avgEV * 100).toFixed(2)}%`);
}

// ─── 2. BY SPORT / LEAGUE ─────────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  2. BY SPORT / LEAGUE');
console.log('━'.repeat(80));

const leagues = [...new Set(bets.map(b => b.league))].sort();
for (const lg of leagues) {
  const group = bets.filter(b => b.league === lg);
  printGroup(analyzeGroup(group, lg || '(unknown)'));
}

// ─── 3. BY MARKET TYPE ────────────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  3. BY MARKET TYPE');
console.log('━'.repeat(80));

const markets = [...new Set(bets.map(b => b.market))].sort();
for (const m of markets) {
  const group = bets.filter(b => b.market === m);
  printGroup(analyzeGroup(group, m));
}

// ─── 4. BY ODDS TIER ──────────────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  4. BY ODDS TIER');
console.log('━'.repeat(80));

const tiers = ['Heavy Fav (≤-200)', 'Small Fav (-199 to -110)', 'Pick\'em (-109 to +110)', 'Small Dog (+111 to +200)', 'Big Dog (+201+)'];
for (const t of tiers) {
  const group = bets.filter(b => b.oddsTier === t);
  if (group.length > 0) printGroup(analyzeGroup(group, t));
}

// ─── 5. BY SPORTSBOOK ────────────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  5. BY SPORTSBOOK');
console.log('━'.repeat(80));

const books = [...new Set(bets.map(b => b.sportsbook))].sort();
for (const book of books) {
  const group = bets.filter(b => b.sportsbook === book);
  printGroup(analyzeGroup(group, book));
}

// ─── 6. BY MONTH ──────────────────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  6. BY MONTH');
console.log('━'.repeat(80));

const months = [...new Set(bets.map(b => b.month))].sort();
for (const m of months) {
  const group = bets.filter(b => b.month === m);
  printGroup(analyzeGroup(group, m));
}

// ─── 7. BY DAY OF WEEK ───────────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  7. BY DAY OF WEEK');
console.log('━'.repeat(80));

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
for (const d of days) {
  const group = bets.filter(b => b.weekday === d);
  if (group.length > 0) printGroup(analyzeGroup(group, d));
}

// ─── 8. SPORT × MARKET CROSS-TAB ─────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  8. SPORT × MARKET CROSS-TAB');
console.log('━'.repeat(80));

for (const lg of leagues) {
  for (const m of markets) {
    const group = bets.filter(b => b.league === lg && b.market === m);
    if (group.length >= 5) {
      printGroup(analyzeGroup(group, `${lg} | ${m}`));
    }
  }
}

// ─── 9. CLV ANALYSIS ──────────────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  9. CLV (CLOSING LINE VALUE) ANALYSIS');
console.log('━'.repeat(80));

const clvBets = bets.filter(b => b.clv !== null);
const clvPos = clvBets.filter(b => b.clv > 0);
const clvNeg = clvBets.filter(b => b.clv <= 0);

console.log(`  Bets with CLV data: ${clvBets.length}`);
console.log(`  CLV+ (beat the close): ${clvPos.length} (${(clvPos.length/clvBets.length*100).toFixed(1)}%)`);
console.log(`  CLV- (worse than close): ${clvNeg.length} (${(clvNeg.length/clvBets.length*100).toFixed(1)}%)`);
console.log(`  Avg CLV: ${(clvBets.reduce((s, b) => s + b.clv, 0) / clvBets.length * 100).toFixed(3)}%`);

console.log(`\n  CLV+ bets performance:`);
printGroup(analyzeGroup(clvPos, 'CLV Positive (beat close)'));
console.log(`  CLV- bets performance:`);
printGroup(analyzeGroup(clvNeg, 'CLV Negative (worse close)'));

// ─── 10. STREAKS & DRAWDOWNS ──────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  10. STREAKS & DRAWDOWNS');
console.log('━'.repeat(80));

// Sort by date placed
const sorted = [...bets].sort((a, b) => a.datePlaced - b.datePlaced);

let maxWinStreak = 0, maxLossStreak = 0;
let curWinStreak = 0, curLossStreak = 0;
let cumPL = 0, peakPL = 0, maxDrawdown = 0, maxDrawdownEnd = '';
let cumPLs = [];

for (const bet of sorted) {
  cumPL += bet.profit;
  cumPLs.push({ date: bet.dateStr, cumPL, profit: bet.profit });
  
  if (bet.won) {
    curWinStreak++;
    curLossStreak = 0;
    maxWinStreak = Math.max(maxWinStreak, curWinStreak);
  } else {
    curLossStreak++;
    curWinStreak = 0;
    maxLossStreak = Math.max(maxLossStreak, curLossStreak);
  }
  
  if (cumPL > peakPL) peakPL = cumPL;
  const dd = peakPL - cumPL;
  if (dd > maxDrawdown) {
    maxDrawdown = dd;
    maxDrawdownEnd = bet.dateStr;
  }
}

console.log(`  Max win streak: ${maxWinStreak}`);
console.log(`  Max loss streak: ${maxLossStreak}`);
console.log(`  Peak P/L: +$${peakPL.toFixed(2)}`);
console.log(`  Max drawdown: -$${maxDrawdown.toFixed(2)} (ending ${maxDrawdownEnd})`);
console.log(`  Current P/L: ${cumPL >= 0 ? '+' : ''}$${cumPL.toFixed(2)}`);

// ─── 11. DAILY P/L CURVE ─────────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  11. DAILY P/L SUMMARY (last 30 days)');
console.log('━'.repeat(80));

const dailyPL = {};
for (const bet of sorted) {
  if (!dailyPL[bet.dateStr]) dailyPL[bet.dateStr] = { bets: 0, wins: 0, profit: 0, staked: 0 };
  dailyPL[bet.dateStr].bets++;
  if (bet.won) dailyPL[bet.dateStr].wins++;
  dailyPL[bet.dateStr].profit += bet.profit;
  dailyPL[bet.dateStr].staked += bet.amount;
}

const dailyDates = Object.keys(dailyPL).sort().slice(-30);
let runningTotal = 0;
// Get running total up to 30 days ago
for (const d of Object.keys(dailyPL).sort()) {
  if (d < dailyDates[0]) runningTotal += dailyPL[d].profit;
}

for (const d of dailyDates) {
  const day = dailyPL[d];
  runningTotal += day.profit;
  const profitSign = day.profit >= 0 ? '+' : '';
  const runSign = runningTotal >= 0 ? '+' : '';
  const bar = day.profit >= 0 ? '█'.repeat(Math.min(30, Math.round(day.profit / 10))) : '▓'.repeat(Math.min(30, Math.round(Math.abs(day.profit) / 10)));
  const color = day.profit >= 0 ? '🟢' : '🔴';
  console.log(`  ${d} | ${String(day.bets).padStart(3)} bets ${day.wins}W | ${profitSign}$${day.profit.toFixed(0).padStart(7)} | Cum: ${runSign}$${runningTotal.toFixed(0).padStart(8)} ${color} ${bar}`);
}

// ─── 12. WEEKLY ROLLING ROI ───────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  12. WEEKLY PERFORMANCE');
console.log('━'.repeat(80));

// Group by ISO week
function getWeekKey(date) {
  const d = new Date(date);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

const weeklyData = {};
for (const bet of sorted) {
  const wk = getWeekKey(bet.datePlaced);
  if (!weeklyData[wk]) weeklyData[wk] = [];
  weeklyData[wk].push(bet);
}

const weekKeys = Object.keys(weeklyData).sort();
let weekCumPL = 0;
for (const wk of weekKeys) {
  const g = analyzeGroup(weeklyData[wk], wk);
  weekCumPL += g.totalProfit;
  const sign = g.totalProfit >= 0 ? '+' : '';
  const cumSign = weekCumPL >= 0 ? '+' : '';
  console.log(`  ${wk} | ${String(g.count).padStart(4)} bets | ${g.wins}-${g.losses} (${g.winRate.toFixed(0)}%) | ${sign}$${g.totalProfit.toFixed(0).padStart(7)} | Cum: ${cumSign}$${weekCumPL.toFixed(0).padStart(8)} | ROI: ${sign}${g.roi.toFixed(1)}%`);
}

// ─── 13. TOP 10 BIGGEST WINS & LOSSES ─────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  13. TOP 10 BIGGEST WINS');
console.log('━'.repeat(80));

const sortedByProfit = [...bets].sort((a, b) => b.profit - a.profit);
for (let i = 0; i < Math.min(10, sortedByProfit.length); i++) {
  const b = sortedByProfit[i];
  console.log(`  ${i+1}. +$${b.profit.toFixed(2).padStart(8)} | $${b.amount} @ ${b.americanOdds >= 0 ? '+' : ''}${b.americanOdds} | ${b.info.slice(0, 80)} | ${b.dateStr}`);
}

console.log(`\n${'━'.repeat(80)}`);
console.log('  14. TOP 10 BIGGEST LOSSES');
console.log('━'.repeat(80));

const sortedByLoss = [...bets].sort((a, b) => a.profit - b.profit);
for (let i = 0; i < Math.min(10, sortedByLoss.length); i++) {
  const b = sortedByLoss[i];
  console.log(`  ${i+1}. -$${Math.abs(b.profit).toFixed(2).padStart(8)} | $${b.amount} @ ${b.americanOdds >= 0 ? '+' : ''}${b.americanOdds} | ${b.info.slice(0, 80)} | ${b.dateStr}`);
}

// ─── 15. PROP TYPE DEEP DIVE ──────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  15. PLAYER PROP DEEP DIVE');
console.log('━'.repeat(80));

const props = bets.filter(b => b.market === 'Player Prop');
const propTypes = {};
for (const b of props) {
  const infoLower = b.info.toLowerCase();
  let propType;
  if (/points/i.test(infoLower)) propType = 'Points';
  else if (/rebounds?/i.test(infoLower)) propType = 'Rebounds';
  else if (/assists?/i.test(infoLower)) propType = 'Assists';
  else if (/3.*pointer|three/i.test(infoLower)) propType = '3-Pointers';
  else if (/steals?/i.test(infoLower)) propType = 'Steals';
  else if (/blocks?/i.test(infoLower)) propType = 'Blocks';
  else if (/strikeout|k.*out/i.test(infoLower)) propType = 'Strikeouts';
  else if (/yards/i.test(infoLower)) propType = 'Yards';
  else if (/receptions?/i.test(infoLower)) propType = 'Receptions';
  else if (/touchdown|td/i.test(infoLower)) propType = 'Touchdowns';
  else if (/goals?/i.test(infoLower)) propType = 'Goals';
  else if (/shots/i.test(infoLower)) propType = 'Shots';
  else propType = 'Other Prop';
  
  if (!propTypes[propType]) propTypes[propType] = [];
  propTypes[propType].push(b);
}

for (const [pt, group] of Object.entries(propTypes).sort((a, b) => b[1].length - a[1].length)) {
  printGroup(analyzeGroup(group, pt));
}

// Over vs Under
const overs = props.filter(b => /over|\+|o\/u.*over/i.test(b.info.toLowerCase()) && !/under/i.test(b.info.toLowerCase()));
const unders = props.filter(b => /under/i.test(b.info.toLowerCase()));
// Also check for "X+" pattern (e.g. "10+ Points") which means over
const plusPattern = props.filter(b => /\d+\+/.test(b.info));

console.log(`\n  Over vs Under:`);
printGroup(analyzeGroup([...new Set([...overs, ...plusPattern])], 'Overs / X+'));
printGroup(analyzeGroup(unders, 'Unders'));

// ─── 16. STAKE SIZE ANALYSIS ──────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  16. BY STAKE SIZE');
console.log('━'.repeat(80));

const stakeBuckets = [
  { label: '$1-10', min: 0, max: 10 },
  { label: '$11-20', min: 11, max: 20 },
  { label: '$21-35', min: 21, max: 35 },
  { label: '$36-50', min: 36, max: 50 },
  { label: '$51-75', min: 51, max: 75 },
  { label: '$76-100', min: 76, max: 100 },
  { label: '$101+', min: 101, max: 999999 },
];

for (const bucket of stakeBuckets) {
  const group = bets.filter(b => b.amount >= bucket.min && b.amount <= bucket.max);
  if (group.length > 0) printGroup(analyzeGroup(group, bucket.label));
}

// ─── 17. EV ANALYSIS ──────────────────────────────────────────
console.log(`\n${'━'.repeat(80)}`);
console.log('  17. EXPECTED VALUE (EV) ANALYSIS');
console.log('━'.repeat(80));

const evBets = bets.filter(b => b.ev !== 0);
console.log(`  Bets with EV data: ${evBets.length}`);

const evPos = evBets.filter(b => b.ev > 0);
const evNeg = evBets.filter(b => b.ev < 0);

console.log(`  EV+ bets: ${evPos.length} (${(evPos.length/evBets.length*100).toFixed(1)}%)`);
console.log(`  EV- bets: ${evNeg.length} (${(evNeg.length/evBets.length*100).toFixed(1)}%)`);
console.log(`  Avg EV: ${(evBets.reduce((s, b) => s + b.ev, 0) / evBets.length * 100).toFixed(3)}%`);

console.log(`\n  EV+ bets performance:`);
printGroup(analyzeGroup(evPos, 'EV Positive'));
console.log(`  EV- bets performance:`);
printGroup(analyzeGroup(evNeg, 'EV Negative'));

// EV tiers
const evTiers = [
  { label: 'EV < -5%', filter: b => b.ev < -0.05 },
  { label: 'EV -5% to -2%', filter: b => b.ev >= -0.05 && b.ev < -0.02 },
  { label: 'EV -2% to 0%', filter: b => b.ev >= -0.02 && b.ev < 0 },
  { label: 'EV 0% to +2%', filter: b => b.ev >= 0 && b.ev < 0.02 },
  { label: 'EV +2% to +5%', filter: b => b.ev >= 0.02 && b.ev < 0.05 },
  { label: 'EV +5% to +10%', filter: b => b.ev >= 0.05 && b.ev < 0.10 },
  { label: 'EV +10%+', filter: b => b.ev >= 0.10 },
];
console.log(`\n  By EV tier:`);
for (const tier of evTiers) {
  const group = evBets.filter(tier.filter);
  if (group.length > 0) printGroup(analyzeGroup(group, tier.label));
}

// ─── 18. SUMMARY & KEY FINDINGS ───────────────────────────────
console.log(`\n${'═'.repeat(80)}`);
console.log('  KEY FINDINGS SUMMARY');
console.log(`${'═'.repeat(80)}`);

// Find best and worst segments
const segments = [];
for (const lg of leagues) {
  for (const m of markets) {
    const group = bets.filter(b => b.league === lg && b.market === m);
    if (group.length >= 10) {
      const g = analyzeGroup(group, `${lg} | ${m}`);
      segments.push(g);
    }
  }
}

segments.sort((a, b) => b.roi - a.roi);

console.log(`\n  🏆 TOP 3 PROFITABLE SEGMENTS (≥10 bets):`);
for (let i = 0; i < Math.min(3, segments.length); i++) {
  printGroup(segments[i]);
}

console.log(`\n  💀 BOTTOM 3 SEGMENTS (≥10 bets):`);
for (let i = Math.max(0, segments.length - 3); i < segments.length; i++) {
  printGroup(segments[i]);
}

// Winning/losing months
const monthResults = months.map(m => analyzeGroup(bets.filter(b => b.month === m), m));
const winMonths = monthResults.filter(m => m.totalProfit > 0);
const loseMonths = monthResults.filter(m => m.totalProfit < 0);
console.log(`\n  Winning months: ${winMonths.length} | Losing months: ${loseMonths.length}`);

console.log(`\n${'═'.repeat(80)}\n`);
