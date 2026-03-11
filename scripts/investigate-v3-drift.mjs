#!/usr/bin/env node

/**
 * Investigate what changed in NBA Dec 2025+ that broke the V3 model
 * Look at: league-wide scoring, pace, 3pt rates, model prediction distribution
 */

import fs from 'fs';
import path from 'path';

const ROOT = '/Users/brentgoldman/Desktop/REPO33/RRMODEL';

// Load all games
const allGames = [];
for (const gf of ['games_2022_23.json', 'games_2023_24.json', 'games_2024_25.json', 'games_2025_26_extended.json']) {
  try {
    const games = JSON.parse(fs.readFileSync(path.join(ROOT, `data/nba/games/${gf}`)));
    const valid = games.filter(g => g.homeStats?.fga > 0 && g.awayStats?.fga > 0);
    for (const g of valid) {
      if (!g.homeScore && g.homeStats?.points) g.homeScore = g.homeStats.points;
      if (!g.awayScore && g.awayStats?.points) g.awayScore = g.awayStats.points;
      if (!g.homeScore) {
        const s = g.homeStats;
        g.homeScore = (s.fgm - (s.fg3m || 0)) * 2 + (s.fg3m || 0) * 3 + (s.ftm || 0);
      }
      if (!g.awayScore) {
        const s = g.awayStats;
        g.awayScore = (s.fgm - (s.fg3m || 0)) * 2 + (s.fg3m || 0) * 3 + (s.ftm || 0);
      }
    }
    allGames.push(...valid);
  } catch {}
}
allGames.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

console.log(`Total games: ${allGames.length}`);

// ═══ LEAGUE-WIDE STATS BY PERIOD ═══
const periods = [
  { name: '2022-23', start: '2022-10-01', end: '2023-06-30' },
  { name: '2023-24', start: '2023-10-01', end: '2024-06-30' },
  { name: '2024-25 Oct-Nov', start: '2024-10-01', end: '2024-11-30' },
  { name: '2024-25 Dec-Mar', start: '2024-12-01', end: '2025-03-31' },
  { name: '2024-25 Full', start: '2024-10-01', end: '2025-06-30' },
  { name: '2025-26 Oct-Nov', start: '2025-10-01', end: '2025-11-30' },
  { name: '2025-26 Dec', start: '2025-12-01', end: '2025-12-31' },
  { name: '2025-26 Jan', start: '2026-01-01', end: '2026-01-31' },
  { name: '2025-26 Feb', start: '2026-02-01', end: '2026-02-28' },
  { name: '2025-26 Mar', start: '2026-03-01', end: '2026-03-09' },
  { name: '2025-26 Dec-Mar', start: '2025-12-01', end: '2026-03-09' },
];

console.log('\n' + '═'.repeat(120));
console.log('  LEAGUE-WIDE STATS BY PERIOD');
console.log('═'.repeat(120));
console.log(`${'Period'.padEnd(22)} | ${'Games'.padStart(6)} | ${'AvgTotal'.padStart(9)} | ${'AvgPace'.padStart(8)} | ${'FG%'.padStart(6)} | ${'3P%'.padStart(6)} | ${'3PA/g'.padStart(7)} | ${'FTA/g'.padStart(7)} | ${'TO/g'.padStart(6)} | ${'ORB/g'.padStart(7)}`);
console.log('-'.repeat(120));

for (const p of periods) {
  const games = allGames.filter(g => {
    const d = (g.date || '').split('T')[0];
    return d >= p.start && d <= p.end;
  });
  
  if (games.length === 0) continue;
  
  const n = games.length;
  const totals = games.map(g => g.homeScore + g.awayScore);
  const avgTotal = totals.reduce((a, b) => a + b, 0) / n;
  
  // Per-team stats (2 teams per game)
  let totalFGA = 0, totalFGM = 0, total3PA = 0, total3PM = 0;
  let totalFTA = 0, totalFTM = 0, totalTO = 0, totalORB = 0;
  let totalPoss = 0;
  let teamCount = 0;
  
  for (const g of games) {
    for (const side of ['home', 'away']) {
      const s = side === 'home' ? g.homeStats : g.awayStats;
      totalFGA += s.fga || 0;
      totalFGM += s.fgm || 0;
      total3PA += s.fg3a || 0;
      total3PM += s.fg3m || 0;
      totalFTA += s.fta || 0;
      totalFTM += s.ftm || 0;
      totalTO += s.turnovers || 0;
      totalORB += s.offRebounds || 0;
      
      const poss = (s.fga || 0) - (s.offRebounds || 0) + (s.turnovers || 0) + 0.44 * (s.fta || 0);
      totalPoss += poss;
      teamCount++;
    }
  }
  
  const fgPct = totalFGM / totalFGA * 100;
  const threePct = total3PM / total3PA * 100;
  const threePA = total3PA / teamCount;
  const ftaPerTeam = totalFTA / teamCount;
  const toPerTeam = totalTO / teamCount;
  const orbPerTeam = totalORB / teamCount;
  const pacePerTeam = totalPoss / teamCount;
  
  console.log(`${p.name.padEnd(22)} | ${String(n).padStart(6)} | ${avgTotal.toFixed(1).padStart(9)} | ${pacePerTeam.toFixed(1).padStart(8)} | ${fgPct.toFixed(1).padStart(5)}% | ${threePct.toFixed(1).padStart(5)}% | ${threePA.toFixed(1).padStart(7)} | ${ftaPerTeam.toFixed(1).padStart(7)} | ${toPerTeam.toFixed(1).padStart(6)} | ${orbPerTeam.toFixed(1).padStart(7)}`);
}

// ═══ VEGAS LINES SHIFT ═══
console.log('\n' + '═'.repeat(80));
console.log('  VEGAS LINES BY PERIOD');
console.log('═'.repeat(80));

// Load odds
const allOdds = {};
const oddsDir = path.join(ROOT, 'data/nba/historical_odds/game_totals');
for (const f of fs.readdirSync(oddsDir).filter(f => f.endsWith('.json'))) {
  try {
    const od = JSON.parse(fs.readFileSync(path.join(oddsDir, f)));
    for (const g of (od.games || od.data || [])) {
      const ht = g.home_team || '';
      const ct = g.commence_time || g.date || od.date || '';
      const ds = ct.split('T')[0];
      if (!ds || !ht) continue;
      const lines = [];
      for (const bk of (g.bookmakers || [])) {
        const tm = (bk.markets || []).find(m => m.key === 'totals');
        if (tm) {
          const ov = (tm.outcomes || []).find(o => o.name === 'Over');
          if (ov?.point) lines.push(ov.point);
        }
      }
      if (lines.length > 0) {
        allOdds[`${ds}_${ht}`] = lines.reduce((a, b) => a + b, 0) / lines.length;
      }
    }
  } catch {}
}

// CSV
try {
  const csv = fs.readFileSync(path.join(ROOT, 'data/nba/backtests/nba_totals_backtest_dataset.csv'), 'utf8');
  const lines = csv.split('\n');
  const headers = lines[0].split(',');
  const dateIdx = headers.indexOf('date');
  const htIdx = headers.indexOf('home_team');
  const lineIdx = headers.indexOf('market_total_line_consensus');
  const TEAM_MAP = {
    'ATL': 'Atlanta Hawks', 'BOS': 'Boston Celtics', 'BKN': 'Brooklyn Nets',
    'CHA': 'Charlotte Hornets', 'CHI': 'Chicago Bulls', 'CLE': 'Cleveland Cavaliers',
    'DAL': 'Dallas Mavericks', 'DEN': 'Denver Nuggets', 'DET': 'Detroit Pistons',
    'GS': 'Golden State Warriors', 'HOU': 'Houston Rockets', 'IND': 'Indiana Pacers',
    'LAC': 'Los Angeles Clippers', 'LAL': 'Los Angeles Lakers',
    'MEM': 'Memphis Grizzlies', 'MIA': 'Miami Heat', 'MIL': 'Milwaukee Bucks',
    'MIN': 'Minnesota Timberwolves', 'NO': 'New Orleans Pelicans',
    'NY': 'New York Knicks', 'OKC': 'Oklahoma City Thunder', 'ORL': 'Orlando Magic',
    'PHI': 'Philadelphia 76ers', 'PHX': 'Phoenix Suns',
    'POR': 'Portland Trail Blazers', 'SAC': 'Sacramento Kings',
    'SA': 'San Antonio Spurs', 'TOR': 'Toronto Raptors',
    'UTAH': 'Utah Jazz', 'WSH': 'Washington Wizards',
  };
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols[lineIdx]) {
      const htName = TEAM_MAP[cols[htIdx]] || cols[htIdx];
      const key = `${cols[dateIdx]}_${htName}`;
      if (!allOdds[key]) allOdds[key] = parseFloat(cols[lineIdx]);
    }
  }
} catch {}

// Match odds to games and analyze
for (const p of periods) {
  const games = allGames.filter(g => {
    const d = (g.date || '').split('T')[0];
    return d >= p.start && d <= p.end;
  });
  
  const matched = [];
  for (const g of games) {
    const ht = g.homeTeamName || '';
    const key = `${(g.date || '').split('T')[0]}_${ht}`;
    if (allOdds[key]) {
      matched.push({
        actual: g.homeScore + g.awayScore,
        vegas: allOdds[key],
        diff: (g.homeScore + g.awayScore) - allOdds[key],
      });
    }
  }
  
  if (matched.length < 10) continue;
  
  const avgVegas = matched.reduce((s, m) => s + m.vegas, 0) / matched.length;
  const avgActual = matched.reduce((s, m) => s + m.actual, 0) / matched.length;
  const avgDiff = matched.reduce((s, m) => s + m.diff, 0) / matched.length;
  const overPct = matched.filter(m => m.actual > m.vegas).length / matched.length * 100;
  
  console.log(`${p.name.padEnd(22)} | ${String(matched.length).padStart(5)} matched | Avg Vegas: ${avgVegas.toFixed(1)} | Avg Actual: ${avgActual.toFixed(1)} | Avg Diff: ${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(1)} | Over%: ${overPct.toFixed(1)}%`);
}

// ═══ MODEL PREDICTION ANALYSIS ═══
console.log('\n' + '═'.repeat(80));
console.log('  MODEL PREDICTION ANALYSIS BY PERIOD');
console.log('═'.repeat(80));

const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/nba/models/totals_model_v3_multiwindow.json')));

function computePerGame(stats, oppStats, pts, oppPts) {
  const fgm = stats.fgm || 0, fga = stats.fga || 1;
  const fg3m = stats.fg3m || 0, fg3a = stats.fg3a || 0;
  const ftm = stats.ftm || 0, fta = stats.fta || 0;
  const oreb = stats.offRebounds || 0, dreb = stats.defRebounds || 0;
  const tov = stats.turnovers || 0;
  const oppFga = oppStats.fga || 1;
  const oppOreb = oppStats.offRebounds || 0, oppDreb = oppStats.defRebounds || 0;
  const oppTov = oppStats.turnovers || 0, oppFta = oppStats.fta || 0;
  const poss = fga - oreb + tov + 0.44 * fta;
  const oppPoss = oppFga - oppOreb + oppTov + 0.44 * oppFta;
  return {
    pts, oppPts, pace: poss,
    offRtg: poss > 0 ? (pts / poss) * 100 : 114.5,
    defRtg: oppPoss > 0 ? (oppPts / oppPoss) * 100 : 114.5,
    efg: fga > 0 ? (fgm + 0.5 * fg3m) / fga : 0.535,
    ts: (fga + 0.44 * fta) > 0 ? pts / (2 * (fga + 0.44 * fta)) : 0.575,
    tovPct: poss > 0 ? tov / poss : 0.138,
    orbPct: (oreb + oppDreb) > 0 ? oreb / (oreb + oppDreb) : 0.25,
    fgPct: fga > 0 ? fgm / fga : 0.47,
    fg3Pct: fg3a > 0 ? fg3m / fg3a : 0.36,
    ftPct: fta > 0 ? ftm / fta : 0.78,
    rebounds: stats.rebounds || (oreb + dreb),
    assists: stats.assists || 0,
    turnovers: tov,
    won: pts > oppPts ? 1 : 0,
    fga, fta, fg3a
  };
}

function getRollingStats(teamId, gameDate, window) {
  const recent = [];
  for (let i = allGames.length - 1; i >= 0; i--) {
    const g = allGames[i];
    if ((g.date || '') >= gameDate) continue;
    const isHome = g.homeTeamId === teamId;
    const isAway = g.awayTeamId === teamId;
    if (!isHome && !isAway) continue;
    const stats = isHome ? g.homeStats : g.awayStats;
    const opp = isHome ? g.awayStats : g.homeStats;
    const pts = isHome ? g.homeScore : g.awayScore;
    const oppPts = isHome ? g.awayScore : g.homeScore;
    recent.push(computePerGame(stats, opp, pts, oppPts));
    if (recent.length >= window) break;
  }
  if (recent.length < Math.min(3, window)) return null;
  const n = recent.length;
  const totalPts = recent.reduce((s, g) => s + g.pts, 0);
  const totalOpp = recent.reduce((s, g) => s + g.oppPts, 0);
  const totalPoss = recent.reduce((s, g) => s + g.pace, 0);
  const avg = k => recent.reduce((s, g) => s + g[k], 0) / n;
  return {
    games: n, pace: totalPoss / n,
    offRtg: totalPoss > 0 ? (totalPts / totalPoss) * 100 : 114.5,
    defRtg: totalPoss > 0 ? (totalOpp / totalPoss) * 100 : 114.5,
    ppg: totalPts / n, oppPpg: totalOpp / n, efg: avg('efg'), ts: avg('ts'),
    tovPct: avg('tovPct'), orbPct: avg('orbPct'), fgPct: avg('fgPct'),
    fg3Pct: avg('fg3Pct'), ftPct: avg('ftPct'), rebounds: avg('rebounds'),
    assists: avg('assists'), turnovers: avg('turnovers'),
    winPct: recent.reduce((s, g) => s + g.won, 0) / n,
    fga: avg('fga'), fta: avg('fta'), fg3a: avg('fg3a')
  };
}

function buildFeatures(hL3, hL10, hL20, aL3, aL10, aL20) {
  return {
    h3_pace: hL3.pace, h3_offRtg: hL3.offRtg, h3_defRtg: hL3.defRtg,
    h3_ppg: hL3.ppg, h3_efg: hL3.efg, h3_fgPct: hL3.fgPct,
    h3_fg3Pct: hL3.fg3Pct, h3_assists: hL3.assists, h3_turnovers: hL3.turnovers,
    a3_pace: aL3.pace, a3_offRtg: aL3.offRtg, a3_defRtg: aL3.defRtg,
    a3_ppg: aL3.ppg, a3_efg: aL3.efg, a3_fgPct: aL3.fgPct,
    a3_fg3Pct: aL3.fg3Pct, a3_assists: aL3.assists, a3_turnovers: aL3.turnovers,
    h10_pace: hL10.pace, h10_offRtg: hL10.offRtg, h10_defRtg: hL10.defRtg,
    h10_ppg: hL10.ppg, h10_efg: hL10.efg, h10_fgPct: hL10.fgPct,
    h10_fg3Pct: hL10.fg3Pct, h10_ftPct: hL10.ftPct, h10_rebounds: hL10.rebounds,
    h10_assists: hL10.assists, h10_turnovers: hL10.turnovers, h10_ts: hL10.ts,
    a10_pace: aL10.pace, a10_offRtg: aL10.offRtg, a10_defRtg: aL10.defRtg,
    a10_ppg: aL10.ppg, a10_efg: aL10.efg, a10_fgPct: aL10.fgPct,
    a10_fg3Pct: aL10.fg3Pct, a10_ftPct: aL10.ftPct, a10_rebounds: aL10.rebounds,
    a10_assists: aL10.assists, a10_turnovers: aL10.turnovers, a10_ts: aL10.ts,
    h20_pace: hL20.pace, h20_offRtg: hL20.offRtg, h20_defRtg: hL20.defRtg,
    h20_ppg: hL20.ppg, h20_efg: hL20.efg,
    a20_pace: aL20.pace, a20_offRtg: aL20.offRtg, a20_defRtg: aL20.defRtg,
    a20_ppg: aL20.ppg, a20_efg: aL20.efg,
    pace_avg_l10: (hL10.pace + aL10.pace) / 2,
    pace_diff_l10: hL10.pace - aL10.pace,
    pace_avg_l3: (hL3.pace + aL3.pace) / 2,
    pace_product: (hL10.pace * aL10.pace) / 10000,
    ppg_sum_l10: hL10.ppg + aL10.ppg,
    ppg_sum_l3: hL3.ppg + aL3.ppg,
    ppg_sum_l20: hL20.ppg + aL20.ppg,
    ppg_diff_l10: hL10.ppg - aL10.ppg,
    expected_total_l10: ((hL10.pace+aL10.pace)/2/100) * (hL10.offRtg*(aL10.defRtg/114.5) + aL10.offRtg*(hL10.defRtg/114.5)),
    expected_total_l3: ((hL3.pace+aL3.pace)/2/100) * (hL3.offRtg*(aL3.defRtg/114.5) + aL3.offRtg*(hL3.defRtg/114.5)),
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

function predict(mdl, features) {
  let pred = mdl.bias;
  for (const [key, weight] of Object.entries(mdl.weights)) {
    if (!(key in features)) continue;
    const val = features[key];
    const mean = mdl.means[key] || 0;
    const std = mdl.stds[key] || 1;
    if (std > 0) pred += weight * ((val - mean) / std);
  }
  return pred;
}

// Run predictions on test periods
const testPeriods = [
  { name: '2024-25 Oct-Nov (backtest)', start: '2024-10-01', end: '2024-11-30' },
  { name: '2024-25 Dec-Mar (backtest)', start: '2024-12-01', end: '2025-03-31' },
  { name: '2025-26 Oct-Nov (backtest)', start: '2025-10-01', end: '2025-11-30' },
  { name: '2025-26 Dec (OOS)', start: '2025-12-01', end: '2025-12-31' },
  { name: '2025-26 Jan (OOS)', start: '2026-01-01', end: '2026-01-31' },
  { name: '2025-26 Feb-Mar (OOS)', start: '2026-02-01', end: '2026-03-09' },
];

console.log(`\n${'Period'.padEnd(32)} | ${'N'.padStart(4)} | ${'AvgPred'.padStart(8)} | ${'AvgVegas'.padStart(9)} | ${'AvgActual'.padStart(10)} | ${'MAE'.padStart(5)} | ${'Bias'.padStart(7)} | ${'Pred>Veg'.padStart(9)} | ${'UnderBias'.padStart(10)}`);
console.log('-'.repeat(120));

for (const p of testPeriods) {
  const games = allGames.filter(g => {
    const d = (g.date || '').split('T')[0];
    return d >= p.start && d <= p.end;
  });
  
  const results = [];
  for (const game of games) {
    const hL3 = getRollingStats(game.homeTeamId, game.date, 3);
    const hL10 = getRollingStats(game.homeTeamId, game.date, 10);
    const hL20 = getRollingStats(game.homeTeamId, game.date, 20);
    const aL3 = getRollingStats(game.awayTeamId, game.date, 3);
    const aL10 = getRollingStats(game.awayTeamId, game.date, 10);
    const aL20 = getRollingStats(game.awayTeamId, game.date, 20);
    
    if (!hL3 || !hL10 || !hL20 || !aL3 || !aL10 || !aL20) continue;
    
    const actual = game.homeScore + game.awayScore;
    if (actual < 150 || actual > 350) continue;
    
    const ht = game.homeTeamName || '';
    const key = `${(game.date || '').split('T')[0]}_${ht}`;
    const vegas = allOdds[key];
    if (!vegas) continue;
    
    const features = buildFeatures(hL3, hL10, hL20, aL3, aL10, aL20);
    const pred = predict(model, features);
    
    results.push({ pred, vegas, actual, edge: pred - vegas });
  }
  
  if (results.length < 5) continue;
  
  const n = results.length;
  const avgPred = results.reduce((s, r) => s + r.pred, 0) / n;
  const avgVegas = results.reduce((s, r) => s + r.vegas, 0) / n;
  const avgActual = results.reduce((s, r) => s + r.actual, 0) / n;
  const mae = results.reduce((s, r) => s + Math.abs(r.pred - r.actual), 0) / n;
  const bias = results.reduce((s, r) => s + (r.pred - r.actual), 0) / n;
  const predAboveVegas = results.filter(r => r.pred > r.vegas).length / n * 100;
  const underBias = results.filter(r => r.pred < r.vegas).length / n * 100;
  
  console.log(`${p.name.padEnd(32)} | ${String(n).padStart(4)} | ${avgPred.toFixed(1).padStart(8)} | ${avgVegas.toFixed(1).padStart(9)} | ${avgActual.toFixed(1).padStart(10)} | ${mae.toFixed(1).padStart(5)} | ${(bias >= 0 ? '+' : '') + bias.toFixed(1)} | ${predAboveVegas.toFixed(0).padStart(8)}% | ${underBias.toFixed(0).padStart(9)}%`);
}

// ═══ FEATURE DISTRIBUTION SHIFT ═══
console.log('\n' + '═'.repeat(80));
console.log('  TOP FEATURE VALUE SHIFT: TRAINING vs OOS');
console.log('═'.repeat(80));

// Check if the top weighted features have shifted
const topFeatures = Object.entries(model.weights)
  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  .slice(0, 15);

console.log(`\n${'Feature'.padEnd(25)} | ${'Weight'.padStart(8)} | ${'Train Mean'.padStart(11)} | ${'Train Std'.padStart(10)} | Comparing feature input values...`);
console.log('-'.repeat(90));

// Sample features from training period and OOS period
function sampleFeatures(startDate, endDate) {
  const games = allGames.filter(g => {
    const d = (g.date || '').split('T')[0];
    return d >= startDate && d <= endDate;
  });
  
  const featureValues = {};
  for (const game of games.slice(0, 200)) {
    const hL3 = getRollingStats(game.homeTeamId, game.date, 3);
    const hL10 = getRollingStats(game.homeTeamId, game.date, 10);
    const hL20 = getRollingStats(game.homeTeamId, game.date, 20);
    const aL3 = getRollingStats(game.awayTeamId, game.date, 3);
    const aL10 = getRollingStats(game.awayTeamId, game.date, 10);
    const aL20 = getRollingStats(game.awayTeamId, game.date, 20);
    if (!hL3 || !hL10 || !hL20 || !aL3 || !aL10 || !aL20) continue;
    
    const features = buildFeatures(hL3, hL10, hL20, aL3, aL10, aL20);
    for (const [k, v] of Object.entries(features)) {
      if (!featureValues[k]) featureValues[k] = [];
      featureValues[k].push(v);
    }
  }
  
  const stats = {};
  for (const [k, vals] of Object.entries(featureValues)) {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    stats[k] = { mean, std, n: vals.length };
  }
  return stats;
}

const trainStats = sampleFeatures('2022-10-01', '2024-09-30');
const oosStats = sampleFeatures('2025-12-01', '2026-03-09');

for (const [feature, weight] of topFeatures) {
  const trainMean = model.means[feature] || 0;
  const trainStd = model.stds[feature] || 1;
  const oos = oosStats[feature];
  
  if (!oos) continue;
  
  const shift = (oos.mean - trainMean) / trainStd;
  const shiftStr = `OOS mean: ${oos.mean.toFixed(2)}, shift: ${shift >= 0 ? '+' : ''}${shift.toFixed(2)} σ`;
  const impact = shift * weight;
  const impactStr = `pred impact: ${impact >= 0 ? '+' : ''}${impact.toFixed(2)} pts`;
  
  console.log(`${feature.padEnd(25)} | ${weight.toFixed(3).padStart(8)} | ${trainMean.toFixed(2).padStart(11)} | ${trainStd.toFixed(2).padStart(10)} | ${shiftStr} | ${impactStr}`);
}

// ═══ CUMULATIVE FEATURE IMPACT ═══
console.log('\n' + '═'.repeat(80));
console.log('  TOTAL PREDICTION SHIFT FROM FEATURE DRIFT');
console.log('═'.repeat(80));

let totalShift = 0;
for (const [feature, weight] of Object.entries(model.weights)) {
  const trainMean = model.means[feature] || 0;
  const trainStd = model.stds[feature] || 1;
  const oos = oosStats[feature];
  if (!oos) continue;
  const shift = (oos.mean - trainMean) / trainStd;
  totalShift += shift * weight;
}

console.log(`  Model bias: ${model.bias.toFixed(2)}`);
console.log(`  Cumulative feature drift impact: ${totalShift >= 0 ? '+' : ''}${totalShift.toFixed(2)} points`);
console.log(`  This means: on average, predictions are shifted by ${totalShift.toFixed(1)} points vs what the model expects`);
console.log(`  If negative: model under-predicts → too many under picks`);
console.log(`  If positive: model over-predicts → too many over picks`);
