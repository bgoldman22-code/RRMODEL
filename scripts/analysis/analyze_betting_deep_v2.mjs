/**
 * Deep Dive Betting Analysis V2
 * NO NFL — NBA/NCAAM/Soccer only
 * Answers:
 *   1. NBA prop sub-types at plus odds (assists, rebounds, points, etc.)
 *   2. Trends over time — what was bad but getting better?
 *   3. Props vs game picks allocation
 *   4. Pre-CLV EV signals — what YOU can control before the line moves
 *   5. Persistence of trends across timeframes
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
});

// Filter: straight bets, settled W/L, NO NFL
const bets = allBets.filter(b => {
  if (b.type !== 'straight') return false;
  if (b.status !== 'SETTLED_WIN' && b.status !== 'SETTLED_LOSS') return false;
  if (b.leagues === 'NFL' || b.leagues === 'NCAAFB') return false;
  return true;
});

// Parse
for (const b of bets) {
  b.won = b.status === 'SETTLED_WIN';
  b.odds = parseFloat(b.odds) || 0;
  b.closing = parseFloat(b.closing_line) || 0;
  b.ev = parseFloat(b.ev) || 0;
  b.amount = parseFloat(b.amount) || 0;
  b.profit = parseFloat(b.profit) || 0;
  b.datePlaced = new Date(b.time_placed_iso);
  b.dateStr = b.datePlaced.toISOString().slice(0, 10);
  b.league = b.leagues || '';
  b.info = b.bet_info || '';
  b.book = b.sportsbook || '';
  
  const americanOdds = b.odds >= 2 ? Math.round((b.odds - 1) * 100) : Math.round(-100 / (b.odds - 1));
  b.americanOdds = americanOdds;
  b.isPlusOdds = americanOdds > 0;
  b.isMinusOdds = americanOdds <= 0;
  
  if (b.closing > 0) {
    b.clv = (1 / b.odds) - (1 / b.closing);
  } else {
    b.clv = null;
  }
  
  b.month = b.datePlaced.toISOString().slice(0, 7);
  
  // Market type
  const il = b.info.toLowerCase();
  if (/spread/i.test(il)) b.market = 'Spread';
  else if (/moneyline|money line/i.test(il)) b.market = 'Moneyline';
  else if (/total\s*(points|$)|over \d+\.?\d*\s*total|under \d+\.?\d*\s*total|total\s*(over|under|o\/u)/i.test(il) && !/rebounds|assists|points.*o\/u|rebounds.*o\/u/i.test(il)) b.market = 'Total';
  else b.market = 'Player Prop';
  
  // More specific: game total vs player prop
  // If it mentions team vs team total (e.g. "Over 219.5 Total Golden State @ OKC")
  if (b.market !== 'Spread' && b.market !== 'Moneyline') {
    const hasPlayerName = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b.*\b(points|rebounds|assists|3.*pointer|steals|blocks|pts|reb|ast)\b/i.test(b.info);
    const hasGameTotal = /\b(total\s*points|total\s*$|over\s+\d{3}|under\s+\d{3})/i.test(il);
    const has2PlusDigitLine = /\b(over|under)\s+\d{3,}/i.test(il);
    
    if (hasPlayerName || /\d+\+.*\b(points|rebounds|assists|steals|blocks)\b/i.test(il) || /\b(points|rebounds|assists|steals|blocks)\s*(o\/u|over|under)/i.test(il)) {
      b.market = 'Player Prop';
    } else if (has2PlusDigitLine || hasGameTotal) {
      b.market = 'Total';
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
  
  // Over vs Under
  b.direction = null;
  if (b.market === 'Player Prop' || b.market === 'Total') {
    if (/under/i.test(il)) b.direction = 'Under';
    else if (/over|\d+\+/i.test(il)) b.direction = 'Over';
  }
  
  // Game pick = Spread, Moneyline, or Total
  b.isGamePick = ['Spread', 'Moneyline', 'Total'].includes(b.market);
  b.isProp = b.market === 'Player Prop';
}

// ─── Helpers ──────────────────────────────────────────────────
function analyze(group, label) {
  if (group.length === 0) return null;
  const wins = group.filter(b => b.won).length;
  const totalStaked = group.reduce((s, b) => s + b.amount, 0);
  const totalProfit = group.reduce((s, b) => s + b.profit, 0);
  const roi = totalStaked > 0 ? (totalProfit / totalStaked * 100) : 0;
  const avgOdds = group.reduce((s, b) => s + b.americanOdds, 0) / group.length;
  const clvBets = group.filter(b => b.clv !== null);
  const avgCLV = clvBets.length > 0 ? clvBets.reduce((s, b) => s + b.clv, 0) / clvBets.length * 100 : null;
  const evBets = group.filter(b => b.ev !== 0);
  const avgEV = evBets.length > 0 ? evBets.reduce((s, b) => s + b.ev, 0) / evBets.length * 100 : null;
  return { label, n: group.length, wins, losses: group.length - wins, 
           winPct: wins/group.length*100, totalStaked, totalProfit, roi, avgOdds,
           avgStake: totalStaked/group.length, avgCLV, avgEV };
}

function fmt(g) {
  if (!g || g.n === 0) return '';
  const ps = g.totalProfit >= 0 ? '+' : '';
  const rs = g.roi >= 0 ? '+' : '';
  const os = g.avgOdds >= 0 ? '+' : '';
  let line = `  ${g.label.padEnd(42)} ${String(g.n).padStart(4)} | ${g.wins}-${g.losses} (${g.winPct.toFixed(1)}%) | ${ps}$${g.totalProfit.toFixed(0).padStart(7)} | ${rs}${g.roi.toFixed(1)}% ROI | avg ${os}${g.avgOdds.toFixed(0)}`;
  if (g.avgCLV !== null) line += ` | CLV ${g.avgCLV >= 0 ? '+' : ''}${g.avgCLV.toFixed(2)}%`;
  if (g.avgEV !== null) line += ` | EV ${g.avgEV >= 0 ? '+' : ''}${g.avgEV.toFixed(1)}%`;
  return line;
}

function printSection(title) {
  console.log(`\n${'━'.repeat(90)}`);
  console.log(`  ${title}`);
  console.log('━'.repeat(90));
}

// Sort chronologically
bets.sort((a, b) => a.datePlaced - b.datePlaced);

console.log(`\n${'═'.repeat(90)}`);
console.log(`  DEEP DIVE V2 — NO NFL — ${bets.length} STRAIGHT BETS`);
console.log(`${'═'.repeat(90)}`);

const overall = analyze(bets, 'ALL (no NFL)');
console.log(fmt(overall));

// ═══════════════════════════════════════════════════════════════
// PART 1: NBA PROP SUB-TYPES AT PLUS ODDS
// ═══════════════════════════════════════════════════════════════
printSection('1. NBA PLAYER PROPS — PLUS ODDS vs MINUS ODDS (every sub-type)');

const nbaProps = bets.filter(b => b.league === 'NBA' && b.isProp);
console.log(`\n  ALL NBA Props: ${fmt(analyze(nbaProps, 'All NBA Props'))}`);
console.log(`  Plus odds:     ${fmt(analyze(nbaProps.filter(b => b.isPlusOdds), 'NBA Props @ + odds'))}`);
console.log(`  Minus odds:    ${fmt(analyze(nbaProps.filter(b => b.isMinusOdds), 'NBA Props @ - odds'))}`);

const propTypes = ['Points', 'Rebounds', 'Assists', '3-Pointers', 'Steals', 'Blocks'];

console.log(`\n  BY PROP TYPE — PLUS ODDS ONLY:`);
for (const pt of propTypes) {
  const group = nbaProps.filter(b => b.propType === pt && b.isPlusOdds);
  if (group.length >= 3) console.log(fmt(analyze(group, `${pt} @ + odds`)));
}

console.log(`\n  BY PROP TYPE — MINUS ODDS:`);
for (const pt of propTypes) {
  const group = nbaProps.filter(b => b.propType === pt && b.isMinusOdds);
  if (group.length >= 3) console.log(fmt(analyze(group, `${pt} @ - odds`)));
}

console.log(`\n  BY PROP TYPE — ALL ODDS:`);
for (const pt of propTypes) {
  const group = nbaProps.filter(b => b.propType === pt);
  if (group.length >= 3) console.log(fmt(analyze(group, pt)));
}

// Over vs Under by prop type
console.log(`\n  OVER vs UNDER by prop type:`);
for (const pt of propTypes) {
  const overs = nbaProps.filter(b => b.propType === pt && b.direction === 'Over');
  const unders = nbaProps.filter(b => b.propType === pt && b.direction === 'Under');
  if (overs.length >= 5) console.log(fmt(analyze(overs, `${pt} OVER`)));
  if (unders.length >= 5) console.log(fmt(analyze(unders, `${pt} UNDER`)));
}

// ═══════════════════════════════════════════════════════════════
// PART 2: ASSISTS DEEP DIVE (you asked specifically)
// ═══════════════════════════════════════════════════════════════
printSection('2. ASSISTS DEEP DIVE');

const assists = nbaProps.filter(b => b.propType === 'Assists');
console.log(fmt(analyze(assists, 'All Assists')));
console.log(fmt(analyze(assists.filter(b => b.isPlusOdds), 'Assists @ + odds')));
console.log(fmt(analyze(assists.filter(b => b.isMinusOdds), 'Assists @ - odds')));
console.log(fmt(analyze(assists.filter(b => b.direction === 'Over'), 'Assists OVER')));
console.log(fmt(analyze(assists.filter(b => b.direction === 'Under'), 'Assists UNDER')));

// ═══════════════════════════════════════════════════════════════
// PART 3: PROPS vs GAME PICKS — HEAD TO HEAD
// ═══════════════════════════════════════════════════════════════
printSection('3. PROPS vs GAME PICKS — WHERE SHOULD YOUR MONEY GO?');

const gamePicksAll = bets.filter(b => b.isGamePick);
const propsAll = bets.filter(b => b.isProp);

console.log(`\n  OVERALL:`);
console.log(fmt(analyze(gamePicksAll, 'Game Picks (Spread/ML/Total)')));
console.log(fmt(analyze(propsAll, 'Player Props')));

console.log(`\n  GAME PICKS BY TYPE:`);
console.log(fmt(analyze(bets.filter(b => b.market === 'Spread'), 'Spreads')));
console.log(fmt(analyze(bets.filter(b => b.market === 'Moneyline'), 'Moneylines')));
console.log(fmt(analyze(bets.filter(b => b.market === 'Total'), 'Game Totals')));

console.log(`\n  NBA ONLY:`);
const nbaBets = bets.filter(b => b.league === 'NBA');
console.log(fmt(analyze(nbaBets.filter(b => b.isGamePick), 'NBA Game Picks')));
console.log(fmt(analyze(nbaBets.filter(b => b.isProp), 'NBA Player Props')));

console.log(`\n  DOLLAR-WEIGHTED COMPARISON:`);
const gpStake = gamePicksAll.reduce((s, b) => s + b.amount, 0);
const ppStake = propsAll.reduce((s, b) => s + b.amount, 0);
const gpProfit = gamePicksAll.reduce((s, b) => s + b.profit, 0);
const ppProfit = propsAll.reduce((s, b) => s + b.profit, 0);
console.log(`  Game picks: $${gpStake.toFixed(0)} staked → ${gpProfit >= 0 ? '+' : ''}$${gpProfit.toFixed(0)} (${(gpProfit/gpStake*100).toFixed(1)}% ROI)`);
console.log(`  Props:      $${ppStake.toFixed(0)} staked → ${ppProfit >= 0 ? '+' : ''}$${ppProfit.toFixed(0)} (${(ppProfit/ppStake*100).toFixed(1)}% ROI)`);
console.log(`  → Props earn $${((ppProfit/ppStake - gpProfit/gpStake) * ppStake).toFixed(0)} MORE per same dollars staked on props vs game picks`);

// ═══════════════════════════════════════════════════════════════
// PART 4: TIME EVOLUTION — WHAT WAS BAD BUT GETTING BETTER?
// ═══════════════════════════════════════════════════════════════
printSection('4. TIME EVOLUTION — TREND ANALYSIS');

// Split into 3 time periods
const allDates = [...new Set(bets.map(b => b.dateStr))].sort();
const totalDays = allDates.length;
const third = Math.floor(totalDays / 3);
const period1End = allDates[third - 1];
const period2End = allDates[2 * third - 1];

const p1 = bets.filter(b => b.dateStr <= period1End);
const p2 = bets.filter(b => b.dateStr > period1End && b.dateStr <= period2End);
const p3 = bets.filter(b => b.dateStr > period2End);

console.log(`\n  TIME PERIODS: P1(${allDates[0]}→${period1End}) | P2(→${period2End}) | P3(→${allDates[allDates.length-1]})`);
console.log(`  Bets:         P1=${p1.length} | P2=${p2.length} | P3=${p3.length}`);

function trendLine(label, filterFn) {
  const g1 = analyze(p1.filter(filterFn), 'P1');
  const g2 = analyze(p2.filter(filterFn), 'P2');
  const g3 = analyze(p3.filter(filterFn), 'P3');
  if (!g1 || !g2 || !g3 || g1.n < 3 || g2.n < 3 || g3.n < 3) return null;
  
  const trend = g3.roi - g1.roi;
  const arrow = trend > 5 ? '📈 IMPROVING' : trend < -5 ? '📉 DECLINING' : '➡️ FLAT';
  
  return { label, g1, g2, g3, trend, arrow };
}

const categories = [
  ['ALL BETS', () => true],
  ['NBA Spreads', b => b.league === 'NBA' && b.market === 'Spread'],
  ['NBA Moneylines', b => b.league === 'NBA' && b.market === 'Moneyline'],
  ['NBA Totals', b => b.league === 'NBA' && b.market === 'Total'],
  ['NBA Player Props', b => b.league === 'NBA' && b.isProp],
  ['NBA Props: Points', b => b.league === 'NBA' && b.propType === 'Points'],
  ['NBA Props: Rebounds', b => b.league === 'NBA' && b.propType === 'Rebounds'],
  ['NBA Props: Assists', b => b.league === 'NBA' && b.propType === 'Assists'],
  ['NCAAM Moneylines', b => b.league === 'NCAAM' && b.market === 'Moneyline'],
  ['Props @ + odds', b => b.isProp && b.isPlusOdds],
  ['Props @ - odds', b => b.isProp && b.isMinusOdds],
  ['Overs', b => b.direction === 'Over'],
  ['Unders', b => b.direction === 'Under'],
  ['FanDuel', b => b.book === 'Fanduel Sportsbook'],
  ['Novig', b => b.book === 'Novig'],
  ['DraftKings', b => b.book === 'Draftkings Sportsbook'],
  ['BetMGM', b => b.book === 'BetMGM'],
  ['Fanatics', b => b.book === 'Fanatics'],
  ['ProphetX', b => b.book === 'ProphetX'],
  ['Dog bets (+111 to +200)', b => b.americanOdds > 110 && b.americanOdds <= 200],
  ['Fav bets (-110 to -199)', b => b.americanOdds >= -199 && b.americanOdds <= -110],
];

console.log(`\n  ${'Category'.padEnd(35)} | ${'P1 ROI'.padStart(8)} | ${'P2 ROI'.padStart(8)} | ${'P3 ROI'.padStart(8)} | Trend`);
console.log(`  ${'-'.repeat(35)}-+-${'-'.repeat(8)}-+-${'-'.repeat(8)}-+-${'-'.repeat(8)}-+--------`);

const trends = [];
for (const [label, filterFn] of categories) {
  const t = trendLine(label, filterFn);
  if (t) {
    trends.push(t);
    const r1 = `${t.g1.roi >= 0 ? '+' : ''}${t.g1.roi.toFixed(1)}%`;
    const r2 = `${t.g2.roi >= 0 ? '+' : ''}${t.g2.roi.toFixed(1)}%`;
    const r3 = `${t.g3.roi >= 0 ? '+' : ''}${t.g3.roi.toFixed(1)}%`;
    console.log(`  ${label.padEnd(35)} | ${r1.padStart(8)} | ${r2.padStart(8)} | ${r3.padStart(8)} | ${t.arrow}`);
  }
}

console.log(`\n  🔥 BIGGEST IMPROVERS (was bad → getting better):`);
const improvers = trends.filter(t => t.trend > 5 && t.g1.roi < 0).sort((a, b) => b.trend - a.trend);
for (const t of improvers.slice(0, 8)) {
  console.log(`     ${t.label}: P1 ${t.g1.roi >= 0 ? '+' : ''}${t.g1.roi.toFixed(1)}% → P3 ${t.g3.roi >= 0 ? '+' : ''}${t.g3.roi.toFixed(1)}% (Δ ${t.trend >= 0 ? '+' : ''}${t.trend.toFixed(1)}pp)`);
}

console.log(`\n  ⚠️ BIGGEST DECLINERS (was good → getting worse):`);
const decliners = trends.filter(t => t.trend < -5 && t.g1.roi > 0).sort((a, b) => a.trend - b.trend);
for (const t of decliners.slice(0, 8)) {
  console.log(`     ${t.label}: P1 ${t.g1.roi >= 0 ? '+' : ''}${t.g1.roi.toFixed(1)}% → P3 ${t.g3.roi >= 0 ? '+' : ''}${t.g3.roi.toFixed(1)}% (Δ ${t.trend >= 0 ? '+' : ''}${t.trend.toFixed(1)}pp)`);
}

console.log(`\n  💀 PERSISTENTLY BAD (negative all 3 periods):`);
const persistBad = trends.filter(t => t.g1.roi < -2 && t.g2.roi < -2 && t.g3.roi < -2 && t.g1.n >= 5);
for (const t of persistBad) {
  console.log(`     ${t.label}: P1 ${t.g1.roi.toFixed(1)}% → P2 ${t.g2.roi.toFixed(1)}% → P3 ${t.g3.roi.toFixed(1)}%  [CUT THIS]`);
}

console.log(`\n  ✅ PERSISTENTLY GOOD (positive all 3 periods):`);
const persistGood = trends.filter(t => t.g1.roi > 0 && t.g2.roi > 0 && t.g3.roi > 0 && t.g1.n >= 5);
for (const t of persistGood) {
  console.log(`     ${t.label}: P1 +${t.g1.roi.toFixed(1)}% → P2 +${t.g2.roi.toFixed(1)}% → P3 +${t.g3.roi.toFixed(1)}%  [LEAN IN]`);
}

// ═══════════════════════════════════════════════════════════════
// PART 5: PRE-CLV SIGNALS — WHAT CAN YOU CONTROL?
// ═══════════════════════════════════════════════════════════════
printSection('5. PRE-CLV SIGNALS — WHAT CAN YOU ACTUALLY CONTROL?');

console.log(`
  The EV number in your tracker is based on CLOSING LINE comparison.
  You don't know it at bet time. But here's what you DO control:
  
  ✅ THINGS YOU KNOW BEFORE PLACING THE BET:
     - Which sportsbook you're on
     - Which prop type (rebounds, points, etc.)
     - The odds tier (plus vs minus)
     - Over vs under direction
     - The sport/league
     - Your stake size
     - Time of day / how early before game
  
  Let's see which of these are PREDICTIVE of actual profit:
`);

// Book × Market cross
console.log(`  SPORTSBOOK × MARKET (min 15 bets):`);
const booksToCheck = ['Fanduel Sportsbook', 'Draftkings Sportsbook', 'BetMGM', 'Novig', 'Fanatics', 'ProphetX', 'Caesars Sportsbook', 'theScore Bet'];
const marketsToCheck = ['Spread', 'Moneyline', 'Player Prop', 'Total'];
for (const book of booksToCheck) {
  for (const mkt of marketsToCheck) {
    const group = bets.filter(b => b.book === book && b.market === mkt);
    if (group.length >= 15) {
      console.log(fmt(analyze(group, `${book.replace(' Sportsbook', '').replace('Draftkings', 'DK')} × ${mkt}`)));
    }
  }
}

// Book × PropType
console.log(`\n  SPORTSBOOK × PROP TYPE (min 10 bets):`);
for (const book of booksToCheck) {
  for (const pt of propTypes) {
    const group = bets.filter(b => b.book === book && b.propType === pt);
    if (group.length >= 10) {
      console.log(fmt(analyze(group, `${book.replace(' Sportsbook', '').replace('Draftkings', 'DK')} × ${pt}`)));
    }
  }
}

// PropType × Odds tier × Direction
console.log(`\n  PROP TYPE × ODDS × DIRECTION (min 10 bets):`);
for (const pt of propTypes) {
  for (const plusMinus of ['plus', 'minus']) {
    for (const dir of ['Over', 'Under']) {
      const group = nbaProps.filter(b => b.propType === pt && 
        (plusMinus === 'plus' ? b.isPlusOdds : b.isMinusOdds) && 
        b.direction === dir);
      if (group.length >= 10) {
        console.log(fmt(analyze(group, `${pt} ${dir} @ ${plusMinus === 'plus' ? '+' : '-'} odds`)));
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// PART 6: TIME-OF-DAY / EARLY LINE ANALYSIS
// ═══════════════════════════════════════════════════════════════
printSection('6. BET TIMING — DOES WHEN YOU BET MATTER?');

// Hours before game start
for (const b of bets) {
  const placed = b.datePlaced;
  const settled = b.dateSettled;
  // Rough approximation: time between placed and settled
  b.hoursBeforeSettlement = (new Date(b.time_settled_iso) - placed) / (1000 * 60 * 60);
}

const earlyBets = bets.filter(b => b.hoursBeforeSettlement > 8);
const lateBets = bets.filter(b => b.hoursBeforeSettlement <= 8 && b.hoursBeforeSettlement > 3);
const lastMinBets = bets.filter(b => b.hoursBeforeSettlement <= 3);

console.log(fmt(analyze(earlyBets, 'Early bets (>8h before settle)')));
console.log(fmt(analyze(lateBets, 'Mid-day bets (3-8h before)')));
console.log(fmt(analyze(lastMinBets, 'Late bets (<3h before settle)')));

// ═══════════════════════════════════════════════════════════════
// PART 7: ROLLING 50-BET WINDOWS
// ═══════════════════════════════════════════════════════════════
printSection('7. ROLLING 50-BET P/L (trend visualization)');

const windowSize = 50;
const rollingResults = [];
for (let i = 0; i <= bets.length - windowSize; i += Math.floor(windowSize / 2)) {
  const window = bets.slice(i, i + windowSize);
  const g = analyze(window, `Bets ${i+1}-${i+windowSize}`);
  rollingResults.push({ start: window[0].dateStr, end: window[window.length-1].dateStr, ...g });
}

for (const r of rollingResults) {
  const bar = r.roi >= 0 
    ? '█'.repeat(Math.min(40, Math.round(r.roi * 2))) 
    : '▓'.repeat(Math.min(40, Math.round(Math.abs(r.roi) * 2)));
  const icon = r.roi >= 0 ? '🟢' : '🔴';
  console.log(`  ${r.start}→${r.end} | ${r.wins}-${r.losses} (${r.winPct.toFixed(0)}%) | ${r.roi >= 0 ? '+' : ''}${r.roi.toFixed(1)}% ${icon} ${bar}`);
}

// ═══════════════════════════════════════════════════════════════
// PART 8: LEAGUE × ODDS TIER PERSISTENCE
// ═══════════════════════════════════════════════════════════════
printSection('8. LEAGUE × ODDS TIER — PERSISTENCE CHECK');

const oddsTiers = [
  { label: 'Heavy Fav (≤-200)', filter: b => b.americanOdds <= -200 },
  { label: 'Small Fav (-199 to -110)', filter: b => b.americanOdds > -200 && b.americanOdds <= -110 },
  { label: 'Pickem (-109 to +110)', filter: b => b.americanOdds > -110 && b.americanOdds <= 110 },
  { label: 'Small Dog (+111 to +200)', filter: b => b.americanOdds > 110 && b.americanOdds <= 200 },
  { label: 'Big Dog (+201+)', filter: b => b.americanOdds > 200 },
];

for (const league of ['NBA', 'NCAAM']) {
  console.log(`\n  ${league}:`);
  for (const tier of oddsTiers) {
    const group = bets.filter(b => b.league === league && tier.filter(b));
    if (group.length >= 5) {
      // Check persistence
      const gp1 = analyze(p1.filter(b => b.league === league && tier.filter(b)), 'P1');
      const gp3 = analyze(p3.filter(b => b.league === league && tier.filter(b)), 'P3');
      const trend = (gp1 && gp3 && gp1.n >= 3 && gp3.n >= 3) 
        ? `  P1:${gp1.roi >= 0 ? '+' : ''}${gp1.roi.toFixed(0)}% → P3:${gp3.roi >= 0 ? '+' : ''}${gp3.roi.toFixed(0)}%`
        : '';
      const g = analyze(group, `${tier.label}`);
      console.log(`${fmt(g)}${trend}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// PART 9: WHAT SHOULD YOUR BET CARD LOOK LIKE?
// ═══════════════════════════════════════════════════════════════
printSection('9. OPTIMAL BET CARD — WHAT TO DO MORE OF, WHAT TO CUT');

// Score each segment
const scoreboard = [];
function score(label, filterFn) {
  const all = bets.filter(filterFn);
  if (all.length < 15) return;
  const g = analyze(all, label);
  
  // Persistence: check all 3 periods
  const gp1 = analyze(p1.filter(filterFn), 'P1');
  const gp2 = analyze(p2.filter(filterFn), 'P2');
  const gp3 = analyze(p3.filter(filterFn), 'P3');
  
  let persistScore = 0;
  if (gp1 && gp1.n >= 3) persistScore += gp1.roi > 0 ? 1 : -1;
  if (gp2 && gp2.n >= 3) persistScore += gp2.roi > 0 ? 1 : -1;
  if (gp3 && gp3.n >= 3) persistScore += gp3.roi > 0 ? 1 : -1;
  
  const recentTrend = (gp3 && gp1 && gp3.n >= 3 && gp1.n >= 3) ? gp3.roi - gp1.roi : 0;
  
  scoreboard.push({ label, roi: g.roi, profit: g.totalProfit, n: g.n, persistScore, recentTrend, winPct: g.winPct });
}

score('NBA Spreads', b => b.league === 'NBA' && b.market === 'Spread');
score('NBA Moneylines', b => b.league === 'NBA' && b.market === 'Moneyline');
score('NBA Totals', b => b.league === 'NBA' && b.market === 'Total');
score('NBA Props: Rebounds', b => b.league === 'NBA' && b.propType === 'Rebounds');
score('NBA Props: Points', b => b.league === 'NBA' && b.propType === 'Points');
score('NBA Props: Assists', b => b.league === 'NBA' && b.propType === 'Assists');
score('NCAAM Moneylines', b => b.league === 'NCAAM');
score('Props: Unders', b => b.isProp && b.direction === 'Under');
score('Props: Overs', b => b.isProp && b.direction === 'Over');
score('Dog bets (+111-200)', b => b.americanOdds > 110 && b.americanOdds <= 200);
score('Fav bets (-110-199)', b => b.americanOdds >= -199 && b.americanOdds <= -110);
score('FanDuel', b => b.book === 'Fanduel Sportsbook');
score('DraftKings', b => b.book === 'Draftkings Sportsbook');
score('Novig', b => b.book === 'Novig');
score('BetMGM', b => b.book === 'BetMGM');
score('Rebounds @ + odds', b => b.propType === 'Rebounds' && b.isPlusOdds);
score('Rebounds UNDER', b => b.propType === 'Rebounds' && b.direction === 'Under');
score('Points OVER', b => b.propType === 'Points' && b.direction === 'Over');

// Sort by composite score (ROI + persistence + trend)
scoreboard.sort((a, b) => {
  const scoreA = a.roi + a.persistScore * 3 + a.recentTrend * 0.3;
  const scoreB = b.roi + b.persistScore * 3 + b.recentTrend * 0.3;
  return scoreB - scoreA;
});

console.log(`\n  ${'Segment'.padEnd(35)} | ${'ROI'.padStart(7)} | ${'P/L'.padStart(8)} | ${'Persist'.padStart(7)} | ${'Trend'.padStart(7)} | Verdict`);
console.log(`  ${'-'.repeat(90)}`);
for (const s of scoreboard) {
  const verdict = s.roi > 3 && s.persistScore >= 2 ? '✅ INCREASE' :
                  s.roi > 0 && s.persistScore >= 1 ? '👍 KEEP' :
                  s.roi < -3 && s.persistScore <= -2 ? '❌ CUT' :
                  s.roi < 0 ? '⚠️ REDUCE' : '🤷 MIXED';
  const persistLabel = s.persistScore === 3 ? '3/3 ✅' : s.persistScore === 2 ? '2/3' : s.persistScore === 1 ? '1/3' : 
                       s.persistScore === 0 ? '0/3' : s.persistScore === -1 ? '1/3 ❌' : s.persistScore <= -2 ? `${3+s.persistScore}/3 ❌` : '';
  const trendLabel = s.recentTrend > 5 ? `📈+${s.recentTrend.toFixed(0)}` : s.recentTrend < -5 ? `📉${s.recentTrend.toFixed(0)}` : '➡️';
  console.log(`  ${s.label.padEnd(35)} | ${(s.roi >= 0 ? '+' : '') + s.roi.toFixed(1) + '%'}${' '.repeat(Math.max(0, 6 - ((s.roi >= 0 ? '+' : '') + s.roi.toFixed(1) + '%').length))} | ${(s.profit >= 0 ? '+$' : '-$') + Math.abs(s.profit).toFixed(0)}${' '.repeat(Math.max(0, 7 - ((s.profit >= 0 ? '+$' : '-$') + Math.abs(s.profit).toFixed(0)).length))} | ${persistLabel.padStart(7)} | ${trendLabel.padStart(7)} | ${verdict}`);
}

console.log(`\n${'═'.repeat(90)}\n`);
