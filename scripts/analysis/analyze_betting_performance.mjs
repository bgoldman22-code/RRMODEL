import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse both CSVs
function parseCSV(filepath) {
  const raw = readFileSync(filepath, 'utf-8');
  const lines = raw.trim().split('\n');
  const headers = lines[0].split(',');
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    // Handle CSV with commas inside fields
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { values.push(current); current = ''; continue; }
      current += ch;
    }
    values.push(current);
    
    const row = {};
    headers.forEach((h, idx) => row[h.trim()] = (values[idx] || '').trim());
    rows.push(row);
  }
  return rows;
}

const file1 = parseCSV(join(__dirname, 'transactions_latest.csv'));
const file2 = parseCSV(join(__dirname, 'transactions_older.csv'));

// Deduplicate by bet_id
const seen = new Set();
const all = [];
for (const r of [...file1, ...file2]) {
  if (!seen.has(r.bet_id)) {
    seen.add(r.bet_id);
    all.push(r);
  }
}

console.log(`\n=== TOTAL UNIQUE BETS: ${all.length} ===\n`);

// Parse each bet
const bets = all.map(r => {
  const amt = parseFloat(r.amount) || 0;
  const profit = parseFloat(r.profit) || 0;
  const odds = parseFloat(r.odds) || 0;
  const closingLine = parseFloat(r.closing_line) || 0;
  const ev = parseFloat(r.ev) || 0;
  const placed = r.time_placed_iso ? new Date(r.time_placed_iso) : null;
  const settled = r.time_settled_iso ? new Date(r.time_settled_iso) : null;
  
  // Classify bet type from bet_info
  const info = (r.bet_info || '').toLowerCase();
  let betType = 'other';
  if (info.includes('spread')) betType = 'spread';
  else if (info.includes('moneyline') || info.includes('money line')) betType = 'moneyline';
  else if (info.includes('total') || info.includes('over ') || info.includes('under ') || info.includes('o/u')) betType = 'total';
  else if (info.includes('points') || info.includes('rebounds') || info.includes('assists') || info.includes('rebound')) betType = 'props';
  
  // Refine: if it mentions player stats, it's a prop
  if (betType === 'total' && (info.includes('rebounds') || info.includes('points') || info.includes('assists'))) {
    // Check if it's a player prop or game total
    const hasPlayerName = !info.startsWith('over ') && !info.startsWith('under ');
    // Game totals usually say "Total Points" or "Total <Team>"
    if (!info.includes('total points') && !info.includes('total ')) {
      betType = 'props';
    }
  }
  
  // Better classification
  const isGameTotal = info.includes('total points') || 
    (info.match(/^(over|under) \d+\.?\d*\s+total/i)) ||
    (info.match(/total .+@/) && !info.match(/\b[a-z]+ [a-z]+ -? ?(points|rebounds|assists)/i));
  
  if (isGameTotal) betType = 'total';
  
  // League
  const league = (r.leagues || '').trim();
  const sport = (r.sports || '').trim();
  
  return {
    ...r,
    amt, profit, odds, closingLine, ev, placed, settled,
    betType, league, sport,
    isNBA: league === 'NBA',
    isNCAA: league === 'NCAAM' || league === 'NCAAB',
    isParlay: r.type === 'parlay',
    status: r.status,
    won: r.status === 'SETTLED_WIN',
    lost: r.status === 'SETTLED_LOSS',
    voided: r.status === 'SETTLED_VOID',
  };
}).filter(b => b.placed); // Only valid bets

// Sort by date
bets.sort((a, b) => a.placed - b.placed);

const earliest = bets[0]?.placed;
const latest = bets[bets.length - 1]?.placed;
console.log(`Date range: ${earliest?.toISOString().slice(0,10)} → ${latest?.toISOString().slice(0,10)}`);

// ===== ANALYSIS FUNCTIONS =====

function analyzeGroup(label, group) {
  const settled = group.filter(b => !b.voided);
  const wins = settled.filter(b => b.won);
  const losses = settled.filter(b => b.lost);
  const totalWagered = settled.reduce((s, b) => s + b.amt, 0);
  const totalProfit = settled.reduce((s, b) => s + b.profit, 0);
  const roi = totalWagered > 0 ? (totalProfit / totalWagered * 100) : 0;
  const winRate = settled.length > 0 ? (wins.length / settled.length * 100) : 0;
  
  // CLV analysis
  const withCLV = settled.filter(b => b.closingLine > 0 && b.odds > 0);
  const avgCLV = withCLV.length > 0 
    ? withCLV.reduce((s, b) => s + ((b.odds - b.closingLine) / b.closingLine * 100), 0) / withCLV.length 
    : 0;
  
  // +EV analysis
  const withEV = settled.filter(b => b.ev !== 0 && !isNaN(b.ev));
  const posEV = withEV.filter(b => b.ev > 0);
  const avgEV = withEV.length > 0 ? withEV.reduce((s, b) => s + b.ev, 0) / withEV.length : 0;
  
  // Avg bet size
  const avgBet = settled.length > 0 ? totalWagered / settled.length : 0;
  
  console.log(`\n--- ${label} ---`);
  console.log(`  Bets: ${settled.length} (W: ${wins.length} / L: ${losses.length}) | Win%: ${winRate.toFixed(1)}%`);
  console.log(`  Wagered: $${totalWagered.toFixed(0)} | Profit: $${totalProfit.toFixed(2)} | ROI: ${roi.toFixed(2)}%`);
  console.log(`  Avg bet: $${avgBet.toFixed(1)} | Avg odds: ${(settled.reduce((s,b)=>s+b.odds,0)/settled.length).toFixed(3)}`);
  console.log(`  CLV: ${avgCLV.toFixed(3)}% (${withCLV.length} bets) | +EV%: ${posEV.length}/${withEV.length} (${(withEV.length>0?(posEV.length/withEV.length*100):0).toFixed(1)}%) | Avg EV: ${(avgEV*100).toFixed(2)}%`);
  
  return { settled: settled.length, wins: wins.length, losses: losses.length, totalWagered, totalProfit, roi, winRate, avgCLV, avgBet };
}

// =============================
// 1. OVERALL PERFORMANCE
// =============================
console.log('\n' + '='.repeat(70));
console.log('1. OVERALL PERFORMANCE');
console.log('='.repeat(70));
analyzeGroup('ALL BETS', bets);

// =============================
// 2. BY SPORT/LEAGUE
// =============================
console.log('\n' + '='.repeat(70));
console.log('2. BY LEAGUE');
console.log('='.repeat(70));

const leagues = {};
bets.forEach(b => {
  const key = b.league || 'Unknown';
  if (!leagues[key]) leagues[key] = [];
  leagues[key].push(b);
});
Object.entries(leagues).sort((a,b) => b[1].length - a[1].length).forEach(([k, v]) => analyzeGroup(k, v));

// =============================
// 3. NBA BY BET TYPE
// =============================
console.log('\n' + '='.repeat(70));
console.log('3. NBA BY BET TYPE');
console.log('='.repeat(70));

const nbaBets = bets.filter(b => b.isNBA);
const nbaTypes = {};
nbaBets.forEach(b => {
  const key = b.isParlay ? 'parlay' : b.betType;
  if (!nbaTypes[key]) nbaTypes[key] = [];
  nbaTypes[key].push(b);
});
Object.entries(nbaTypes).sort((a,b) => b[1].length - a[1].length).forEach(([k, v]) => analyzeGroup(`NBA ${k.toUpperCase()}`, v));

// =============================
// 4. NBA TOTALS (our model's market) - DEEP DIVE
// =============================
console.log('\n' + '='.repeat(70));
console.log('4. NBA GAME TOTALS (O/U) - DEEP DIVE');
console.log('='.repeat(70));

const nbaTotals = nbaBets.filter(b => !b.isParlay && b.betType === 'total');
analyzeGroup('ALL NBA TOTALS', nbaTotals);

// Pre vs post Dec 15
const dec15 = new Date('2025-12-15');
const preDec15 = nbaTotals.filter(b => b.placed < dec15);
const postDec15 = nbaTotals.filter(b => b.placed >= dec15);
analyzeGroup('NBA Totals PRE Dec 15 (old model, no filter)', preDec15);
analyzeGroup('NBA Totals POST Dec 15 (old model + filtering)', postDec15);

// By month
console.log('\n  --- NBA Totals by Month ---');
const totalsByMonth = {};
nbaTotals.forEach(b => {
  const key = b.placed.toISOString().slice(0, 7);
  if (!totalsByMonth[key]) totalsByMonth[key] = [];
  totalsByMonth[key].push(b);
});
Object.keys(totalsByMonth).sort().forEach(k => analyzeGroup(`  ${k}`, totalsByMonth[k]));

// =============================
// 5. NBA SPREADS - DEEP DIVE
// =============================
console.log('\n' + '='.repeat(70));
console.log('5. NBA SPREADS - DEEP DIVE');
console.log('='.repeat(70));

const nbaSpreads = nbaBets.filter(b => !b.isParlay && b.betType === 'spread');
analyzeGroup('ALL NBA SPREADS', nbaSpreads);

const preDec15Sp = nbaSpreads.filter(b => b.placed < dec15);
const postDec15Sp = nbaSpreads.filter(b => b.placed >= dec15);
analyzeGroup('NBA Spreads PRE Dec 15', preDec15Sp);
analyzeGroup('NBA Spreads POST Dec 15', postDec15Sp);

// =============================
// 6. NBA PROPS - DEEP DIVE  
// =============================
console.log('\n' + '='.repeat(70));
console.log('6. NBA PLAYER PROPS - DEEP DIVE');
console.log('='.repeat(70));

const nbaProps = nbaBets.filter(b => !b.isParlay && b.betType === 'props');
analyzeGroup('ALL NBA PROPS', nbaProps);

const preDec15Pr = nbaProps.filter(b => b.placed < dec15);
const postDec15Pr = nbaProps.filter(b => b.placed >= dec15);
analyzeGroup('NBA Props PRE Dec 15', preDec15Pr);
analyzeGroup('NBA Props POST Dec 15 (with filtering)', postDec15Pr);

// Props by subtype
console.log('\n  --- Props by Stat Type ---');
const propSubtypes = {};
nbaProps.forEach(b => {
  const info = b.bet_info.toLowerCase();
  let sub = 'other';
  if (info.includes('points') || info.includes('score')) sub = 'Points';
  else if (info.includes('rebound')) sub = 'Rebounds';
  else if (info.includes('assist')) sub = 'Assists';
  if (!propSubtypes[sub]) propSubtypes[sub] = [];
  propSubtypes[sub].push(b);
});
Object.entries(propSubtypes).sort((a,b) => b[1].length - a[1].length).forEach(([k, v]) => analyzeGroup(`  Props: ${k}`, v));

// =============================
// 7. BY SPORTSBOOK
// =============================
console.log('\n' + '='.repeat(70));
console.log('7. BY SPORTSBOOK (NBA only)');
console.log('='.repeat(70));

const byBook = {};
nbaBets.filter(b => !b.isParlay).forEach(b => {
  const key = b.sportsbook || 'Unknown';
  if (!byBook[key]) byBook[key] = [];
  byBook[key].push(b);
});
Object.entries(byBook).sort((a,b) => b[1].length - a[1].length).forEach(([k, v]) => analyzeGroup(k, v));

// =============================
// 8. BY BET SIZE TIER
// =============================
console.log('\n' + '='.repeat(70));
console.log('8. NBA BY BET SIZE TIER');
console.log('='.repeat(70));

const tiers = {
  '$5-15 (small)': nbaBets.filter(b => b.amt >= 5 && b.amt <= 15 && !b.isParlay),
  '$16-30 (medium)': nbaBets.filter(b => b.amt > 15 && b.amt <= 30 && !b.isParlay),
  '$31-50 (large)': nbaBets.filter(b => b.amt > 30 && b.amt <= 50 && !b.isParlay),
  '$51+ (XL)': nbaBets.filter(b => b.amt > 50 && !b.isParlay),
};
Object.entries(tiers).forEach(([k, v]) => analyzeGroup(k, v));

// =============================
// 9. WEEKLY TREND (last 8 weeks)
// =============================
console.log('\n' + '='.repeat(70));
console.log('9. WEEKLY P&L TREND (NBA, last 12 weeks)');
console.log('='.repeat(70));

const now = new Date('2026-03-11');
for (let w = 11; w >= 0; w--) {
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - (w + 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  
  const weekBets = nbaBets.filter(b => !b.isParlay && b.placed >= weekStart && b.placed < weekEnd && !b.voided);
  if (weekBets.length === 0) continue;
  
  const profit = weekBets.reduce((s, b) => s + b.profit, 0);
  const wagered = weekBets.reduce((s, b) => s + b.amt, 0);
  const wins = weekBets.filter(b => b.won).length;
  const bar = profit >= 0 ? '█'.repeat(Math.min(Math.round(profit / 10), 30)) : '▓'.repeat(Math.min(Math.round(-profit / 10), 30));
  
  console.log(`  ${weekStart.toISOString().slice(5,10)}→${weekEnd.toISOString().slice(5,10)}: ${weekBets.length} bets | W:${wins} L:${weekBets.length-wins} | $${wagered.toFixed(0)} wagered | ${profit >= 0 ? '+' : ''}$${profit.toFixed(0)} ${profit >= 0 ? '🟢' : '🔴'} ${bar}`);
}

// =============================
// 10. KEY STAKING INSIGHTS
// =============================
console.log('\n' + '='.repeat(70));
console.log('10. KEY STAKING INSIGHTS');
console.log('='.repeat(70));

// Analyze if bigger bets on higher CLV = better returns
const highCLV = nbaBets.filter(b => !b.isParlay && !b.voided && b.ev > 0.05);
const lowCLV = nbaBets.filter(b => !b.isParlay && !b.voided && b.ev > 0 && b.ev <= 0.05);
const negCLV = nbaBets.filter(b => !b.isParlay && !b.voided && b.ev < 0);
analyzeGroup('High +EV (>5%)', highCLV);
analyzeGroup('Low +EV (0-5%)', lowCLV);
analyzeGroup('Negative EV', negCLV);

// How are parlays doing?
console.log('\n' + '='.repeat(70));
console.log('11. PARLAYS');
console.log('='.repeat(70));
const parlays = bets.filter(b => b.isParlay);
analyzeGroup('ALL PARLAYS', parlays);

// =============================
// 12. CUMULATIVE BANKROLL
// =============================
console.log('\n' + '='.repeat(70));
console.log('12. CUMULATIVE BANKROLL CURVE (NBA straights only, monthly)');
console.log('='.repeat(70));

let cumProfit = 0;
let cumWagered = 0;
const monthlyNBA = {};
nbaBets.filter(b => !b.isParlay && !b.voided).sort((a,b) => a.placed - b.placed).forEach(b => {
  const m = b.placed.toISOString().slice(0, 7);
  if (!monthlyNBA[m]) monthlyNBA[m] = { profit: 0, wagered: 0, count: 0 };
  monthlyNBA[m].profit += b.profit;
  monthlyNBA[m].wagered += b.amt;
  monthlyNBA[m].count++;
});

Object.keys(monthlyNBA).sort().forEach(m => {
  const d = monthlyNBA[m];
  cumProfit += d.profit;
  cumWagered += d.wagered;
  const bar = cumProfit >= 0 ? '█'.repeat(Math.min(Math.round(cumProfit / 20), 40)) : '▓'.repeat(Math.min(Math.round(-cumProfit / 20), 40));
  console.log(`  ${m}: ${d.count} bets | month: ${d.profit >= 0 ? '+' : ''}$${d.profit.toFixed(0)} (${(d.profit/d.wagered*100).toFixed(1)}% ROI) | cum: ${cumProfit >= 0 ? '+' : ''}$${cumProfit.toFixed(0)} ${bar}`);
});

console.log(`\n  TOTAL: ${cumWagered.toFixed(0)} wagered | ${cumProfit >= 0 ? '+' : ''}$${cumProfit.toFixed(0)} profit | ${(cumProfit/cumWagered*100).toFixed(2)}% ROI`);
