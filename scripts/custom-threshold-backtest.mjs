import fs from 'fs';
import path from 'path';

// Load V3 model
const model = JSON.parse(fs.readFileSync('data/nba/models/totals_model_v3_multiwindow.json', 'utf8'));

// Load game data
const allGames = [];
for (const f of ['games_2022_23.json','games_2023_24.json','games_2024_25.json','games_2025_26_extended.json']) {
  try {
    const data = JSON.parse(fs.readFileSync('data/nba/games/' + f, 'utf8'));
    const valid = data.filter(g => g.homeStats && g.homeStats.fga > 0 && g.awayStats && g.awayStats.fga > 0);
    for (const g of valid) {
      if (g.homeScore === undefined && g.homeStats.points) g.homeScore = g.homeStats.points;
      if (g.awayScore === undefined && g.awayStats.points) g.awayScore = g.awayStats.points;
      if (g.homeScore === undefined) {
        g.homeScore = (g.homeStats.fgm - g.homeStats.fg3m)*2 + g.homeStats.fg3m*3 + g.homeStats.ftm;
      }
      if (g.awayScore === undefined) {
        g.awayScore = (g.awayStats.fgm - g.awayStats.fg3m)*2 + g.awayStats.fg3m*3 + g.awayStats.ftm;
      }
    }
    allGames.push(...valid);
  } catch(e) { console.log('Skip:', f, e.message); }
}
allGames.sort((a,b) => (a.date||'').localeCompare(b.date||''));
console.log('Loaded', allGames.length, 'games');

// Load odds
const TEAM_NAME_MAP = {
  'ATL':'Atlanta Hawks','BOS':'Boston Celtics','BKN':'Brooklyn Nets',
  'CHA':'Charlotte Hornets','CHI':'Chicago Bulls','CLE':'Cleveland Cavaliers',
  'DAL':'Dallas Mavericks','DEN':'Denver Nuggets','DET':'Detroit Pistons',
  'GS':'Golden State Warriors','GSW':'Golden State Warriors',
  'HOU':'Houston Rockets','IND':'Indiana Pacers',
  'LAC':'Los Angeles Clippers','LAL':'Los Angeles Lakers',
  'MEM':'Memphis Grizzlies','MIA':'Miami Heat','MIL':'Milwaukee Bucks',
  'MIN':'Minnesota Timberwolves','NOP':'New Orleans Pelicans','NO':'New Orleans Pelicans',
  'NY':'New York Knicks','NYK':'New York Knicks',
  'OKC':'Oklahoma City Thunder','ORL':'Orlando Magic',
  'PHI':'Philadelphia 76ers','PHX':'Phoenix Suns',
  'POR':'Portland Trail Blazers','SAC':'Sacramento Kings',
  'SA':'San Antonio Spurs','SAS':'San Antonio Spurs',
  'TOR':'Toronto Raptors','UTAH':'Utah Jazz','UTA':'Utah Jazz',
  'WAS':'Washington Wizards','WSH':'Washington Wizards',
};

const allOdds = {};

// From JSON files
const oddsDir = 'data/nba/historical_odds/game_totals';
const oddsFiles = fs.readdirSync(oddsDir).filter(f => f.endsWith('.json'));
for (const file of oddsFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(oddsDir, file), 'utf8'));
    const games = data.games || data.data || [];
    for (const g of games) {
      const homeTeam = g.home_team || g.homeTeam;
      const dateStr = (g.commence_time || g.date || data.date || '').split('T')[0];
      if (!dateStr || !homeTeam) continue;
      let lines = [];
      for (const bk of (g.bookmakers || [])) {
        const tm = (bk.markets||[]).find(m => m.key === 'totals');
        if (!tm) continue;
        const ov = tm.outcomes && tm.outcomes.find(o => o.name === 'Over');
        if (ov && ov.point) lines.push(ov.point);
      }
      if (g.consensus_line) lines.push(g.consensus_line);
      if (lines.length === 0) continue;
      const cl = lines.reduce((a,b) => a+b, 0) / lines.length;
      allOdds[dateStr + '_' + homeTeam] = cl;
    }
  } catch(e) {}
}

// From CSV
try {
  const csv = fs.readFileSync('data/nba/backtests/nba_totals_backtest_dataset.csv', 'utf8').split('\n');
  const hdr = csv[0].split(',');
  for (let i = 1; i < csv.length; i++) {
    if (!csv[i].trim()) continue;
    const v = csv[i].split(',');
    const row = {};
    hdr.forEach((h, j) => { row[h] = v[j]; });
    if (row.market_total_line_consensus) {
      const name = TEAM_NAME_MAP[row.home_team] || row.home_team;
      allOdds[row.date + '_' + name] = parseFloat(row.market_total_line_consensus);
    }
  }
} catch(e) {}

console.log('Loaded', Object.keys(allOdds).length, 'odds records');

// Rolling stats computation
function computeRolling(games, teamId, date, window) {
  const recent = [];
  for (let i = games.length - 1; i >= 0; i--) {
    const g = games[i];
    if (g.date >= date) continue;
    const isHome = g.homeTeamId === teamId;
    const isAway = g.awayTeamId === teamId;
    if (!isHome && !isAway) continue;
    const s = isHome ? g.homeStats : g.awayStats;
    const o = isHome ? g.awayStats : g.homeStats;
    const pts = isHome ? g.homeScore : g.awayScore;
    const opp = isHome ? g.awayScore : g.homeScore;
    const fga = s.fga || 1;
    const fg3m = s.fg3m || 0;
    const ftm = s.ftm || 0;
    const fta = s.fta || 0;
    const oreb = s.offRebounds || 0;
    const tov = s.turnovers || 0;
    const oppFga = o.fga || 1;
    const oppOreb = o.offRebounds || 0;
    const oppTov = o.turnovers || 0;
    const oppFta = o.fta || 0;
    const poss = fga - oreb + tov + 0.44 * fta;
    const oppPoss = oppFga - oppOreb + oppTov + 0.44 * oppFta;
    recent.push({
      pts, opp, poss, oppPoss,
      efg: fga > 0 ? (s.fgm + 0.5 * fg3m) / fga : 0.535,
      ts: (fga + 0.44 * fta) > 0 ? pts / (2 * (fga + 0.44 * fta)) : 0.575,
      tovPct: poss > 0 ? tov / poss : 0.138,
      orbPct: (oreb + (o.defRebounds || 0)) > 0 ? oreb / (oreb + (o.defRebounds || 0)) : 0.25,
      fgPct: s.fgPct || (fga > 0 ? s.fgm / fga : 0.47),
      fg3Pct: (s.fg3a || 0) > 0 ? fg3m / s.fg3a : 0.36,
      ftPct: fta > 0 ? ftm / fta : 0.78,
      rebounds: s.rebounds || (oreb + (s.defRebounds || 0)),
      assists: s.assists || 0,
      turnovers: tov,
      steals: s.steals || 0,
      blocks: s.blocks || 0,
      won: pts > opp ? 1 : 0,
      fga, fta, fg3a: s.fg3a || 0
    });
    if (recent.length >= window) break;
  }
  if (recent.length < Math.min(3, window)) return null;
  const n = recent.length;
  const totalPts = recent.reduce((s, g) => s + g.pts, 0);
  const totalOpp = recent.reduce((s, g) => s + g.opp, 0);
  const totalPoss = recent.reduce((s, g) => s + g.poss, 0);
  const pace = totalPoss / n;
  const offRtg = totalPoss > 0 ? (totalPts / totalPoss) * 100 : 114.5;
  const defRtg = totalPoss > 0 ? (totalOpp / totalPoss) * 100 : 114.5;
  const avg = k => recent.reduce((s, g) => s + g[k], 0) / n;
  return {
    games: n, pace, offRtg, defRtg, netRtg: offRtg - defRtg,
    ppg: totalPts / n, oppPpg: totalOpp / n,
    efg: avg('efg'), ts: avg('ts'), tovPct: avg('tovPct'), orbPct: avg('orbPct'),
    fgPct: avg('fgPct'), fg3Pct: avg('fg3Pct'), ftPct: avg('ftPct'),
    rebounds: avg('rebounds'), assists: avg('assists'), turnovers: avg('turnovers'),
    steals: avg('steals'), blocks: avg('blocks'),
    winPct: recent.filter(g => g.won).length / n,
    fga: avg('fga'), fta: avg('fta'), fg3a: avg('fg3a'),
  };
}

function buildFeatures(hL3, hL10, hL20, aL3, aL10, aL20) {
  return {
    h3_pace: hL3.pace, h3_offRtg: hL3.offRtg, h3_defRtg: hL3.defRtg, h3_ppg: hL3.ppg,
    h3_efg: hL3.efg, h3_fgPct: hL3.fgPct, h3_fg3Pct: hL3.fg3Pct, h3_assists: hL3.assists, h3_turnovers: hL3.turnovers,
    a3_pace: aL3.pace, a3_offRtg: aL3.offRtg, a3_defRtg: aL3.defRtg, a3_ppg: aL3.ppg,
    a3_efg: aL3.efg, a3_fgPct: aL3.fgPct, a3_fg3Pct: aL3.fg3Pct, a3_assists: aL3.assists, a3_turnovers: aL3.turnovers,
    h10_pace: hL10.pace, h10_offRtg: hL10.offRtg, h10_defRtg: hL10.defRtg, h10_ppg: hL10.ppg,
    h10_efg: hL10.efg, h10_fgPct: hL10.fgPct, h10_fg3Pct: hL10.fg3Pct, h10_ftPct: hL10.ftPct,
    h10_rebounds: hL10.rebounds, h10_assists: hL10.assists, h10_turnovers: hL10.turnovers, h10_ts: hL10.ts,
    a10_pace: aL10.pace, a10_offRtg: aL10.offRtg, a10_defRtg: aL10.defRtg, a10_ppg: aL10.ppg,
    a10_efg: aL10.efg, a10_fgPct: aL10.fgPct, a10_fg3Pct: aL10.fg3Pct, a10_ftPct: aL10.ftPct,
    a10_rebounds: aL10.rebounds, a10_assists: aL10.assists, a10_turnovers: aL10.turnovers, a10_ts: aL10.ts,
    h20_pace: hL20.pace, h20_offRtg: hL20.offRtg, h20_defRtg: hL20.defRtg, h20_ppg: hL20.ppg, h20_efg: hL20.efg,
    a20_pace: aL20.pace, a20_offRtg: aL20.offRtg, a20_defRtg: aL20.defRtg, a20_ppg: aL20.ppg, a20_efg: aL20.efg,
    pace_avg_l10: (hL10.pace + aL10.pace) / 2,
    pace_diff_l10: hL10.pace - aL10.pace,
    pace_avg_l3: (hL3.pace + aL3.pace) / 2,
    pace_product: hL10.pace * aL10.pace / 10000,
    ppg_sum_l10: hL10.ppg + aL10.ppg,
    ppg_sum_l3: hL3.ppg + aL3.ppg,
    ppg_sum_l20: hL20.ppg + aL20.ppg,
    ppg_diff_l10: hL10.ppg - aL10.ppg,
    expected_total_l10: ((hL10.pace + aL10.pace) / 2 / 100) * (hL10.offRtg * (aL10.defRtg / 114.5) + aL10.offRtg * (hL10.defRtg / 114.5)),
    expected_total_l3: ((hL3.pace + aL3.pace) / 2 / 100) * (hL3.offRtg * (aL3.defRtg / 114.5) + aL3.offRtg * (hL3.defRtg / 114.5)),
    home_off_vs_away_def: hL10.offRtg - aL10.defRtg,
    away_off_vs_home_def: aL10.offRtg - hL10.defRtg,
    matchup_offense_sum: hL10.offRtg + aL10.offRtg,
    matchup_defense_sum: hL10.defRtg + aL10.defRtg,
    efg_sum: hL10.efg + aL10.efg,
    efg_diff: hL10.efg - aL10.efg,
    ts_sum: hL10.ts + aL10.ts,
    tov_sum: hL10.turnovers + aL10.turnovers,
    tov_diff: hL10.turnovers - aL10.turnovers,
    tovPct_avg: (hL10.tovPct + aL10.tovPct) / 2,
    orbPct_avg: (hL10.orbPct + aL10.orbPct) / 2,
    rebounds_sum: hL10.rebounds + aL10.rebounds,
    fta_sum: hL10.fta + aL10.fta,
    home_form_trend: hL3.ppg - hL20.ppg,
    away_form_trend: aL3.ppg - aL20.ppg,
    home_pace_trend: hL3.pace - hL20.pace,
    away_pace_trend: aL3.pace - aL20.pace,
    winPct_sum: hL10.winPct + aL10.winPct,
    winPct_diff: hL10.winPct - aL10.winPct,
    home_court: 1,
  };
}

function predict(mdl, feat) {
  let p = mdl.bias;
  for (const [k, w] of Object.entries(mdl.weights)) {
    if (!(k in feat)) continue;
    const v = feat[k];
    if (!Number.isFinite(v)) continue;
    const m = mdl.means[k] || 0;
    const s = mdl.stds[k] || 1;
    if (s > 0) p += w * ((v - m) / s);
  }
  return p;
}

// Run backtest on test period only
const testGames = allGames.filter(g => g.date >= '2024-10-01');
const results = [];
let skipped = 0;

for (const game of testGames) {
  const hL3 = computeRolling(allGames, game.homeTeamId, game.date, 3);
  const hL10 = computeRolling(allGames, game.homeTeamId, game.date, 10);
  const hL20 = computeRolling(allGames, game.homeTeamId, game.date, 20);
  const aL3 = computeRolling(allGames, game.awayTeamId, game.date, 3);
  const aL10 = computeRolling(allGames, game.awayTeamId, game.date, 10);
  const aL20 = computeRolling(allGames, game.awayTeamId, game.date, 20);
  if (!hL3 || !hL10 || !hL20 || !aL3 || !aL10 || !aL20) { skipped++; continue; }

  const feat = buildFeatures(hL3, hL10, hL20, aL3, aL10, aL20);
  const pred = predict(model, feat);
  const actual = game.homeScore + game.awayScore;

  // Find Vegas line
  const homeName = TEAM_NAME_MAP[game.homeTeam || game.homeTeamName] || game.homeTeam || game.homeTeamName;
  const homeAbbr = game.homeTeam || game.homeTeamName;
  const prevDay = new Date(new Date(game.date).getTime() - 86400000).toISOString().split('T')[0];
  const nextDay = new Date(new Date(game.date).getTime() + 86400000).toISOString().split('T')[0];
  let vl = allOdds[game.date + '_' + homeName]
    || allOdds[game.date + '_' + homeAbbr]
    || allOdds[prevDay + '_' + homeName]
    || allOdds[nextDay + '_' + homeName]
    || allOdds[prevDay + '_' + homeAbbr]
    || allOdds[nextDay + '_' + homeAbbr];
  if (!vl) { skipped++; continue; }

  const edge = pred - vl;
  const pickOver = edge > 0;
  const actualOver = actual > vl;
  const push = actual === vl;
  const correct = push ? null : (pickOver === actualOver);

  results.push({ date: game.date, pred, actual, vl, edge, absEdge: Math.abs(edge), pickOver, correct, push });
}

console.log('Test games:', testGames.length, '| With odds:', results.length, '| Skipped:', skipped);

// ============ STRATEGY ANALYSIS ============

function calcROI(bets) {
  const settled = bets.filter(b => b.correct !== null);
  const wins = settled.filter(b => b.correct).length;
  const losses = settled.length - wins;
  const pushes = bets.length - settled.length;
  const profit = wins * 100 - losses * 110;
  const wagered = settled.length * 110;
  return {
    count: bets.length, settled: settled.length,
    wins, losses, pushes,
    wr: settled.length > 0 ? (wins / settled.length * 100) : 0,
    roi: wagered > 0 ? (profit / wagered * 100) : 0,
    profit
  };
}

// Test period dates
const dates = results.map(r => r.date).sort();
const firstDate = dates[0];
const lastDate = dates[dates.length - 1];
const d1 = new Date(firstDate);
const d2 = new Date(lastDate);
const weeks = Math.round((d2 - d1) / (7 * 86400000));

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  YOUR STRATEGY: Unders ≥5 edge + Overs ≥7.5 edge');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Test period: ${firstDate} → ${lastDate} (${weeks} weeks)`);
console.log(`  Total games with odds: ${results.length}`);
console.log();

// The main splits
const unders5 = results.filter(r => r.edge < 0 && r.absEdge >= 5);
const overs75 = results.filter(r => r.edge > 0 && r.absEdge >= 7.5);
const combined = [...unders5, ...overs75];

const u = calcROI(unders5);
const o = calcROI(overs75);
const c = calcROI(combined);

console.log('  ┌──────────────┬───────┬──────┬──────┬──────────┬──────────┐');
console.log('  │  Strategy    │ Bets  │ Wins │  WR  │   ROI    │  Profit  │');
console.log('  ├──────────────┼───────┼──────┼──────┼──────────┼──────────┤');
console.log(`  │  Unders ≥5   │${String(u.count).padStart(5)}  │${String(u.wins).padStart(5)} │${u.wr.toFixed(1).padStart(5)}% │${(u.roi>=0?'+':'')+u.roi.toFixed(2).padStart(7)}% │ ${(u.profit>=0?'+$':'-$')+String(Math.abs(u.profit)).padStart(5)}  │`);
console.log(`  │  Overs ≥7.5  │${String(o.count).padStart(5)}  │${String(o.wins).padStart(5)} │${o.wr.toFixed(1).padStart(5)}% │${(o.roi>=0?'+':'')+o.roi.toFixed(2).padStart(7)}% │ ${(o.profit>=0?'+$':'-$')+String(Math.abs(o.profit)).padStart(5)}  │`);
console.log('  ├──────────────┼───────┼──────┼──────┼──────────┼──────────┤');
console.log(`  │  COMBINED    │${String(c.count).padStart(5)}  │${String(c.wins).padStart(5)} │${c.wr.toFixed(1).padStart(5)}% │${(c.roi>=0?'+':'')+c.roi.toFixed(2).padStart(7)}% │ ${(c.profit>=0?'+$':'-$')+String(Math.abs(c.profit)).padStart(5)}  │`);
console.log('  └──────────────┴───────┴──────┴──────┴──────────┴──────────┘');
console.log();

console.log('  📊 VOLUME:');
console.log(`    Total bets over ${weeks} weeks = ${c.count} bets`);
console.log(`    = ${(c.count / weeks).toFixed(1)} bets/week`);
console.log(`    = ${(c.count / weeks / 7).toFixed(1)} bets/day`);
console.log();
console.log(`    Unders: ${(u.count / weeks).toFixed(1)}/week (${u.count} total)`);
console.log(`    Overs:  ${(o.count / weeks).toFixed(1)}/week (${o.count} total)`);
console.log();

// Tier breakdown
const underT1 = unders5.filter(r => r.absEdge >= 7);
const underT2 = unders5.filter(r => r.absEdge >= 6 && r.absEdge < 7);
const underT3 = unders5.filter(r => r.absEdge >= 5 && r.absEdge < 6);
const ut1 = calcROI(underT1);
const ut2 = calcROI(underT2);
const ut3 = calcROI(underT3);

console.log('  📈 TIER BREAKDOWN:');
console.log(`    Unders 5-6 edge:   ${ut3.count} bets, ${ut3.wr.toFixed(1)}% WR, ${(ut3.roi>=0?'+':'')}${ut3.roi.toFixed(1)}% ROI, ${(ut3.profit>=0?'+$':'-$')}${Math.abs(ut3.profit)}`);
console.log(`    Unders 6-7 edge:   ${ut2.count} bets, ${ut2.wr.toFixed(1)}% WR, ${(ut2.roi>=0?'+':'')}${ut2.roi.toFixed(1)}% ROI, ${(ut2.profit>=0?'+$':'-$')}${Math.abs(ut2.profit)}`);
console.log(`    Unders ≥7 edge:    ${ut1.count} bets, ${ut1.wr.toFixed(1)}% WR, ${(ut1.roi>=0?'+':'')}${ut1.roi.toFixed(1)}% ROI, ${(ut1.profit>=0?'+$':'-$')}${Math.abs(ut1.profit)}`);
console.log(`    Overs ≥7.5 edge:   ${o.count} bets, ${o.wr.toFixed(1)}% WR, ${(o.roi>=0?'+':'')}${o.roi.toFixed(1)}% ROI, ${(o.profit>=0?'+$':'-$')}${Math.abs(o.profit)}`);
console.log();

// Monthly breakdown
const months = {};
for (const r of combined) {
  const month = r.date.substring(0, 7);
  if (!months[month]) months[month] = [];
  months[month].push(r);
}
console.log('  📅 MONTH BY MONTH:');
console.log('  ┌──────────┬──────┬──────┬──────┬──────────┬──────────┐');
console.log('  │  Month   │ Bets │ Wins │  WR  │   ROI    │  Profit  │');
console.log('  ├──────────┼──────┼──────┼──────┼──────────┼──────────┤');
for (const [month, bets] of Object.entries(months).sort()) {
  const m = calcROI(bets);
  console.log(`  │  ${month}  │${String(m.count).padStart(4)}  │${String(m.wins).padStart(4)}  │${m.wr.toFixed(1).padStart(5)}% │${(m.roi>=0?'+':'')+m.roi.toFixed(1).padStart(7)}% │ ${(m.profit>=0?'+$':'-$')+String(Math.abs(m.profit)).padStart(5)}  │`);
}
console.log('  └──────────┴──────┴──────┴──────┴──────────┴──────────┘');
console.log();

// P/L projection
console.log('  💰 PROJECTED P/L (at $110/bet):');
console.log(`    Per week:   ${c.profit / weeks >= 0 ? '+$' : '-$'}${Math.abs(c.profit / weeks).toFixed(0)}`);
console.log(`    Per month:  ${c.profit / weeks * 4.33 >= 0 ? '+$' : '-$'}${Math.abs(c.profit / weeks * 4.33).toFixed(0)}`);
console.log(`    Per season: ${c.profit >= 0 ? '+$' : '-$'}${Math.abs(c.profit)} (over ${weeks} weeks)`);
console.log();

// Compare to some alternatives
console.log('  🔄 COMPARISON WITH ALTERNATIVE THRESHOLDS:');
const alternatives = [
  { name: 'Unders≥5 + Overs≥7', uT: 5, oT: 7 },
  { name: 'Unders≥5 + Overs≥7.5', uT: 5, oT: 7.5 },
  { name: 'Unders≥5 + Overs≥8', uT: 5, oT: 8 },
  { name: 'Unders≥6 + Overs≥7', uT: 6, oT: 7 },
  { name: 'Unders≥6 + Overs≥7.5', uT: 6, oT: 7.5 },
  { name: 'Unders≥6 + Overs≥8', uT: 6, oT: 8 },
  { name: 'Unders≥4 + Overs≥7.5', uT: 4, oT: 7.5 },
];

console.log('  ┌─────────────────────────┬──────┬──────┬──────────┬──────────┬──────────┐');
console.log('  │  Strategy               │ Bets │  WR  │   ROI    │  Profit  │ Bets/Wk  │');
console.log('  ├─────────────────────────┼──────┼──────┼──────────┼──────────┼──────────┤');
for (const alt of alternatives) {
  const uB = results.filter(r => r.edge < 0 && r.absEdge >= alt.uT);
  const oB = results.filter(r => r.edge > 0 && r.absEdge >= alt.oT);
  const cB = [...uB, ...oB];
  const s = calcROI(cB);
  const isOurs = alt.uT === 5 && alt.oT === 7.5;
  const marker = isOurs ? '◀' : ' ';
  console.log(`  │  ${alt.name.padEnd(23)} │${String(s.count).padStart(4)}  │${s.wr.toFixed(1).padStart(5)}% │${(s.roi>=0?'+':'')+s.roi.toFixed(1).padStart(7)}% │ ${(s.profit>=0?'+$':'-$')+String(Math.abs(s.profit)).padStart(5)}  │${(s.count/weeks).toFixed(1).padStart(7)}   │${marker}`);
}
console.log('  └─────────────────────────┴──────┴──────┴──────────┴──────────┴──────────┘');

// What the old model+strategy would have done
console.log('\n  📊 VS OLD MODEL REFERENCE:');
console.log('    Old totals model was -$577 / -5.1% ROI on 398 bets');
console.log(`    This strategy: ${c.profit >= 0 ? '+$' : '-$'}${Math.abs(c.profit)} / ${(c.roi>=0?'+':'')}${c.roi.toFixed(1)}% ROI on ${c.count} bets`);
console.log(`    Improvement:   ${c.profit + 577 >= 0 ? '+$' : '-$'}${Math.abs(c.profit + 577)} swing`);
