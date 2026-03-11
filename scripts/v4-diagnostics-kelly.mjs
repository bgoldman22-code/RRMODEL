#!/usr/bin/env node
/**
 * V4 DIAGNOSTICS:
 * 1. Per-game prediction distribution — are predictions spread out or still clustered?
 * 2. True no-vig Kelly staking — does fractional Kelly improve ROI vs flat betting?
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

// ═══════════════════════════════════════════════════════════════
// LOAD V4 MODEL + ALL GAME/ODDS DATA (reuse V4 pipeline)
// ═══════════════════════════════════════════════════════════════

// Team name mapping
const TEAM_NAME_MAP = {
  'ATL': 'Atlanta Hawks', 'BOS': 'Boston Celtics', 'BKN': 'Brooklyn Nets',
  'CHA': 'Charlotte Hornets', 'CHI': 'Chicago Bulls', 'CLE': 'Cleveland Cavaliers',
  'DAL': 'Dallas Mavericks', 'DEN': 'Denver Nuggets', 'DET': 'Detroit Pistons',
  'GS': 'Golden State Warriors', 'GSW': 'Golden State Warriors',
  'HOU': 'Houston Rockets', 'IND': 'Indiana Pacers',
  'LAC': 'Los Angeles Clippers', 'LAL': 'Los Angeles Lakers',
  'MEM': 'Memphis Grizzlies', 'MIA': 'Miami Heat', 'MIL': 'Milwaukee Bucks',
  'MIN': 'Minnesota Timberwolves', 'NOP': 'New Orleans Pelicans', 'NO': 'New Orleans Pelicans',
  'NY': 'New York Knicks', 'NYK': 'New York Knicks',
  'OKC': 'Oklahoma City Thunder', 'ORL': 'Orlando Magic',
  'PHI': 'Philadelphia 76ers', 'PHX': 'Phoenix Suns',
  'POR': 'Portland Trail Blazers', 'SAC': 'Sacramento Kings',
  'SA': 'San Antonio Spurs', 'SAS': 'San Antonio Spurs',
  'TOR': 'Toronto Raptors',
  'UTAH': 'Utah Jazz', 'UTA': 'Utah Jazz',
  'WAS': 'Washington Wizards', 'WSH': 'Washington Wizards',
};

function computePerGameStats(stats, oppStats, pts, oppPts) {
  const fgm = stats.fgm || 0, fga = stats.fga || 1;
  const fg3m = stats.fg3m || 0, fg3a = stats.fg3a || 0;
  const ftm = stats.ftm || 0, fta = stats.fta || 0;
  const oreb = stats.offRebounds || 0, dreb = stats.defRebounds || 0;
  const tov = stats.turnovers || 0;
  const oppFga = oppStats.fga || 1, oppOreb = oppStats.offRebounds || 0;
  const oppDreb = oppStats.defRebounds || 0, oppTov = oppStats.turnovers || 0;
  const oppFta = oppStats.fta || 0;

  const possessions = fga - oreb + tov + 0.44 * fta;
  const oppPossessions = oppFga - oppOreb + oppTov + 0.44 * oppFta;
  const pace = possessions;
  const offRtg = possessions > 0 ? (pts / possessions) * 100 : 114.5;
  const defRtg = oppPossessions > 0 ? (oppPts / oppPossessions) * 100 : 114.5;

  return {
    pts, oppPts, pace, offRtg, defRtg, netRtg: offRtg - defRtg,
    efg: fga > 0 ? (fgm + 0.5 * fg3m) / fga : 0.535,
    ts: (fga + 0.44 * fta) > 0 ? pts / (2 * (fga + 0.44 * fta)) : 0.575,
    tovPct: possessions > 0 ? tov / possessions : 0.138,
    orbPct: (oreb + oppDreb) > 0 ? oreb / (oreb + oppDreb) : 0.25,
    fgPct: fga > 0 ? fgm / fga : 0.47,
    fg3Pct: fg3a > 0 ? fg3m / fg3a : 0.36,
    ftPct: fta > 0 ? ftm / fta : 0.78,
    rebounds: stats.rebounds || (oreb + dreb),
    assists: stats.assists || 0, turnovers: tov,
    steals: stats.steals || 0, blocks: stats.blocks || 0,
    fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb,
    won: pts > oppPts ? 1 : 0
  };
}

function computeRollingWindowStats(allGames, teamId, gameDate, windowSize) {
  const recentGames = [];
  for (let i = allGames.length - 1; i >= 0; i--) {
    const g = allGames[i];
    if (g.date >= gameDate) continue;
    const isHome = g.homeTeamId === teamId, isAway = g.awayTeamId === teamId;
    if (!isHome && !isAway) continue;
    const stats = isHome ? g.homeStats : g.awayStats;
    const oppStats = isHome ? g.awayStats : g.homeStats;
    const pts = isHome ? g.homeScore : g.awayScore;
    const oppPts = isHome ? g.awayScore : g.homeScore;
    recentGames.push(computePerGameStats(stats, oppStats, pts, oppPts));
    if (recentGames.length >= windowSize) break;
  }
  if (recentGames.length < Math.min(3, windowSize)) return null;
  const n = recentGames.length;
  const totalPts = recentGames.reduce((s, g) => s + g.pts, 0);
  const totalOppPts = recentGames.reduce((s, g) => s + g.oppPts, 0);
  const totalPoss = recentGames.reduce((s, g) => s + g.pace, 0);
  const avg = (key) => recentGames.reduce((s, g) => s + g[key], 0) / n;
  return {
    games: n, pace: totalPoss / n,
    offRtg: totalPoss > 0 ? (totalPts / totalPoss) * 100 : 114.5,
    defRtg: totalPoss > 0 ? (totalOppPts / totalPoss) * 100 : 114.5,
    netRtg: (totalPoss > 0 ? (totalPts / totalPoss) * 100 : 114.5) - (totalPoss > 0 ? (totalOppPts / totalPoss) * 100 : 114.5),
    ppg: totalPts / n, oppPpg: totalOppPts / n,
    efg: avg('efg'), ts: avg('ts'), tovPct: avg('tovPct'), orbPct: avg('orbPct'),
    fgPct: avg('fgPct'), fg3Pct: avg('fg3Pct'), ftPct: avg('ftPct'),
    rebounds: avg('rebounds'), assists: avg('assists'), turnovers: avg('turnovers'),
    steals: avg('steals'), blocks: avg('blocks'),
    winPct: recentGames.filter(g => g.won).length / n,
    fga: avg('fga'), fta: avg('fta'), fg3a: avg('fg3a'),
  };
}

function buildMultiWindowFeatures(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20) {
  return {
    h3_pace: homeL3.pace, h3_offRtg: homeL3.offRtg, h3_defRtg: homeL3.defRtg,
    h3_ppg: homeL3.ppg, h3_efg: homeL3.efg, h3_fgPct: homeL3.fgPct,
    h3_fg3Pct: homeL3.fg3Pct, h3_assists: homeL3.assists, h3_turnovers: homeL3.turnovers,
    a3_pace: awayL3.pace, a3_offRtg: awayL3.offRtg, a3_defRtg: awayL3.defRtg,
    a3_ppg: awayL3.ppg, a3_efg: awayL3.efg, a3_fgPct: awayL3.fgPct,
    a3_fg3Pct: awayL3.fg3Pct, a3_assists: awayL3.assists, a3_turnovers: awayL3.turnovers,
    h10_pace: homeL10.pace, h10_offRtg: homeL10.offRtg, h10_defRtg: homeL10.defRtg,
    h10_ppg: homeL10.ppg, h10_efg: homeL10.efg, h10_fgPct: homeL10.fgPct,
    h10_fg3Pct: homeL10.fg3Pct, h10_ftPct: homeL10.ftPct,
    h10_rebounds: homeL10.rebounds, h10_assists: homeL10.assists,
    h10_turnovers: homeL10.turnovers, h10_ts: homeL10.ts,
    a10_pace: awayL10.pace, a10_offRtg: awayL10.offRtg, a10_defRtg: awayL10.defRtg,
    a10_ppg: awayL10.ppg, a10_efg: awayL10.efg, a10_fgPct: awayL10.fgPct,
    a10_fg3Pct: awayL10.fg3Pct, a10_ftPct: awayL10.ftPct,
    a10_rebounds: awayL10.rebounds, a10_assists: awayL10.assists,
    a10_turnovers: awayL10.turnovers, a10_ts: awayL10.ts,
    h20_pace: homeL20.pace, h20_offRtg: homeL20.offRtg, h20_defRtg: homeL20.defRtg,
    h20_ppg: homeL20.ppg, h20_efg: homeL20.efg,
    a20_pace: awayL20.pace, a20_offRtg: awayL20.offRtg, a20_defRtg: awayL20.defRtg,
    a20_ppg: awayL20.ppg, a20_efg: awayL20.efg,
    pace_avg_l10: (homeL10.pace + awayL10.pace) / 2,
    pace_diff_l10: homeL10.pace - awayL10.pace,
    pace_avg_l3: (homeL3.pace + awayL3.pace) / 2,
    pace_product: (homeL10.pace * awayL10.pace) / 10000,
    ppg_sum_l10: homeL10.ppg + awayL10.ppg,
    ppg_sum_l3: homeL3.ppg + awayL3.ppg,
    ppg_sum_l20: homeL20.ppg + awayL20.ppg,
    ppg_diff_l10: homeL10.ppg - awayL10.ppg,
    expected_total_l10: ((homeL10.pace + awayL10.pace) / 2 / 100) *
      (homeL10.offRtg * (awayL10.defRtg / 114.5) + awayL10.offRtg * (homeL10.defRtg / 114.5)),
    expected_total_l3: ((homeL3.pace + awayL3.pace) / 2 / 100) *
      (homeL3.offRtg * (awayL3.defRtg / 114.5) + awayL3.offRtg * (homeL3.defRtg / 114.5)),
    home_off_vs_away_def: homeL10.offRtg - awayL10.defRtg,
    away_off_vs_home_def: awayL10.offRtg - homeL10.defRtg,
    matchup_offense_sum: homeL10.offRtg + awayL10.offRtg,
    matchup_defense_sum: homeL10.defRtg + awayL10.defRtg,
    efg_sum: homeL10.efg + awayL10.efg,
    efg_diff: homeL10.efg - awayL10.efg,
    ts_sum: homeL10.ts + awayL10.ts,
    tov_sum: homeL10.turnovers + awayL10.turnovers,
    tov_diff: homeL10.turnovers - awayL10.turnovers,
    tovPct_avg: (homeL10.tovPct + awayL10.tovPct) / 2,
    orbPct_avg: (homeL10.orbPct + awayL10.orbPct) / 2,
    rebounds_sum: homeL10.rebounds + awayL10.rebounds,
    fta_sum: homeL10.fta + awayL10.fta,
    home_form_trend: homeL3.ppg - homeL20.ppg,
    away_form_trend: awayL3.ppg - awayL20.ppg,
    home_pace_trend: homeL3.pace - homeL20.pace,
    away_pace_trend: awayL3.pace - awayL20.pace,
    winPct_sum: homeL10.winPct + awayL10.winPct,
    winPct_diff: homeL10.winPct - awayL10.winPct,
    home_court: 1,
  };
}

function predictWithModel(model, features) {
  let pred = model.bias;
  for (const [key, weight] of Object.entries(model.weights)) {
    if (!(key in features)) continue;
    const val = features[key];
    if (!Number.isFinite(val)) continue;
    const mean = model.means[key] ?? 0;
    const std = model.stds[key] ?? 1;
    if (std > 0) pred += weight * ((val - mean) / std);
  }
  return pred;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   V4 DIAGNOSTICS: PREDICTION DISTRIBUTION + KELLY STAKING  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Load V4 model
  const v4Model = JSON.parse(await readFile(path.join(ROOT, 'data/nba/models/totals_model_v4_expanded.json'), 'utf8'));
  console.log(`\n  Loaded V4 model: ${Object.keys(v4Model.weights).length} features, bias=${v4Model.bias.toFixed(2)}`);

  // Load all games
  const allGames = [];
  const gameFiles = [
    { file: 'data/nba/games/games_2022_23.json', label: '2022-23' },
    { file: 'data/nba/games/games_2023_24.json', label: '2023-24' },
    { file: 'data/nba/games/games_2024_25.json', label: '2024-25' },
    { file: 'data/nba/games/games_2025_26_extended.json', label: '2025-26' },
  ];
  for (const { file, label } of gameFiles) {
    try {
      const data = JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
      const valid = data.filter(g => g.homeStats?.fga > 0 && g.awayStats?.fga > 0 &&
        (g.homeScore > 0 || g.homeStats?.points > 0) && (g.awayScore > 0 || g.awayStats?.points > 0));
      for (const g of valid) {
        if (!g.homeScore && g.homeStats?.points) g.homeScore = g.homeStats.points;
        if (!g.awayScore && g.awayStats?.points) g.awayScore = g.awayStats.points;
        if (!g.homeScore) g.homeScore = (g.homeStats.fgm - g.homeStats.fg3m) * 2 + g.homeStats.fg3m * 3 + g.homeStats.ftm;
        if (!g.awayScore) g.awayScore = (g.awayStats.fgm - g.awayStats.fg3m) * 2 + g.awayStats.fg3m * 3 + g.awayStats.ftm;
      }
      allGames.push(...valid);
      console.log(`  ${label}: ${valid.length} games`);
    } catch {}
  }
  allGames.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Load odds
  const allOdds = {};
  const oddsDir = path.join(ROOT, 'data/nba/historical_odds/game_totals');
  try {
    const { readdir } = await import('fs/promises');
    const files = (await readdir(oddsDir)).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(await readFile(path.join(oddsDir, file), 'utf8'));
        const games = data.games || data.data || [];
        for (const game of games) {
          const homeTeam = game.home_team || game.homeTeam;
          const dateStr = (game.commence_time || game.date || data.date || '').split('T')[0];
          if (!dateStr || !homeTeam) continue;
          let lines = [];
          const bookmakers = game.bookmakers || [];
          for (const bk of bookmakers) {
            const totalMarket = (bk.markets || []).find(m => m.key === 'totals');
            if (!totalMarket) continue;
            const overOutcome = totalMarket.outcomes?.find(o => o.name === 'Over');
            if (overOutcome?.point) lines.push(overOutcome.point);
          }
          if (game.consensus_line) lines.push(game.consensus_line);
          if (game.fanduel?.line) lines.push(game.fanduel.line);
          if (game.draftkings?.line) lines.push(game.draftkings.line);
          if (game.betmgm?.line) lines.push(game.betmgm.line);
          if (lines.length === 0) continue;
          const consensusLine = lines.reduce((a, b) => a + b, 0) / lines.length;
          allOdds[`${dateStr}_${homeTeam}`] = { consensusLine, lines, homeTeam, dateStr };
        }
      } catch {}
    }
  } catch {}

  // CSV odds
  try {
    const csv = await readFile(path.join(ROOT, 'data/nba/backtests/nba_totals_backtest_dataset.csv'), 'utf8');
    const csvLines = csv.split('\n');
    const headers = csvLines[0].split(',');
    for (let i = 1; i < csvLines.length; i++) {
      if (!csvLines[i].trim()) continue;
      const vals = csvLines[i].split(',');
      const row = {};
      headers.forEach((h, idx) => row[h] = vals[idx]);
      if (row.market_total_line_consensus) {
        const homeTeamName = TEAM_NAME_MAP[row.home_team] || row.home_team;
        const key = `${row.date}_${homeTeamName}`;
        if (!allOdds[key]) {
          allOdds[key] = { consensusLine: parseFloat(row.market_total_line_consensus), lines: [parseFloat(row.market_total_line_consensus)], homeTeam: homeTeamName, dateStr: row.date };
        }
        const keyAbbr = `${row.date}_${row.home_team}`;
        if (!allOdds[keyAbbr]) allOdds[keyAbbr] = allOdds[key];
      }
    }
  } catch {}

  console.log(`  Odds loaded: ${Object.keys(allOdds).length} entries`);

  // Build per-game predictions for test period
  const testCutoff = '2025-12-01';
  const testGames = allGames.filter(g => g.date >= testCutoff);
  console.log(`\n  Test games (>= ${testCutoff}): ${testGames.length}`);

  const results = [];
  let noFeatures = 0;

  for (const game of testGames) {
    const homeL3 = computeRollingWindowStats(allGames, game.homeTeamId, game.date, 3);
    const homeL10 = computeRollingWindowStats(allGames, game.homeTeamId, game.date, 10);
    const homeL20 = computeRollingWindowStats(allGames, game.homeTeamId, game.date, 20);
    const awayL3 = computeRollingWindowStats(allGames, game.awayTeamId, game.date, 3);
    const awayL10 = computeRollingWindowStats(allGames, game.awayTeamId, game.date, 10);
    const awayL20 = computeRollingWindowStats(allGames, game.awayTeamId, game.date, 20);

    if (!homeL3 || !homeL10 || !homeL20 || !awayL3 || !awayL10 || !awayL20) { noFeatures++; continue; }

    const actual = game.homeScore + game.awayScore;
    if (actual < 150 || actual > 350) continue;

    const features = buildMultiWindowFeatures(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20);
    const pred = predictWithModel(v4Model, features);

    // Match odds
    const homeTeamName = TEAM_NAME_MAP[game.homeTeam || game.homeTeamName] || game.homeTeam || game.homeTeamName;
    const prevDay = new Date(new Date(game.date).getTime() - 86400000).toISOString().split('T')[0];
    const nextDay = new Date(new Date(game.date).getTime() + 86400000).toISOString().split('T')[0];
    const keys = [
      `${game.date}_${homeTeamName}`, `${game.date}_${game.homeTeam || game.homeTeamName}`,
      `${prevDay}_${homeTeamName}`, `${nextDay}_${homeTeamName}`,
    ];
    let vegasLine = null;
    for (const key of keys) {
      if (allOdds[key]) { vegasLine = allOdds[key].consensusLine; break; }
    }
    if (!vegasLine) continue;

    // Also extract individual book odds for no-vig calculation
    let overOdds = -110, underOdds = -110; // default
    for (const key of keys) {
      if (allOdds[key] && allOdds[key].lines) {
        // We only have lines (point values), not juice. Use -110/-110 as baseline
        break;
      }
    }

    const edge = pred - vegasLine;
    const pickOver = edge > 0;
    const actualOver = actual > vegasLine;
    const correct = pickOver === actualOver;

    results.push({
      date: game.date,
      homeTeam: game.homeTeam || game.homeTeamName,
      awayTeam: game.awayTeam || game.awayTeamName,
      actual, vegasLine, pred, edge,
      absEdge: Math.abs(edge),
      pickOver, actualOver, correct,
      overOdds, underOdds,
    });
  }

  console.log(`  Built ${results.length} predictions for test period`);
  console.log(`  Skipped (no features): ${noFeatures}`);

  // ═══════════════════════════════════════════════════════════════
  // PART 1: PREDICTION DISTRIBUTION ANALYSIS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   PART 1: PER-GAME PREDICTION DISTRIBUTION                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const preds = results.map(r => r.pred);
  const vegas = results.map(r => r.vegasLine);
  const actuals = results.map(r => r.actual);
  const edges = results.map(r => r.edge);

  const stats = (arr, label) => {
    const n = arr.length;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      label, n, mean: mean.toFixed(1), std: std.toFixed(1),
      min: sorted[0].toFixed(1), max: sorted[n - 1].toFixed(1),
      p5: sorted[Math.floor(n * 0.05)].toFixed(1),
      p25: sorted[Math.floor(n * 0.25)].toFixed(1),
      p50: sorted[Math.floor(n * 0.50)].toFixed(1),
      p75: sorted[Math.floor(n * 0.75)].toFixed(1),
      p95: sorted[Math.floor(n * 0.95)].toFixed(1),
      range: (sorted[n - 1] - sorted[0]).toFixed(1),
      iqr: (sorted[Math.floor(n * 0.75)] - sorted[Math.floor(n * 0.25)]).toFixed(1),
    };
  };

  const predStats = stats(preds, 'V4 Predictions');
  const vegasStats = stats(vegas, 'Vegas Lines');
  const actualStats = stats(actuals, 'Actuals');
  const edgeStats = stats(edges, 'Edges (pred-vegas)');

  console.log('\n  ┌────────────────────────────────────────────────────────────────────────────────┐');
  console.log('  │  DISTRIBUTION COMPARISON                                                       │');
  console.log('  ├──────────────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┤');
  console.log('  │  Metric          │  Mean  │  Std   │  Min   │  P25   │  P50   │  P75   │  Max   │');
  console.log('  ├──────────────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┤');
  for (const s of [actualStats, vegasStats, predStats, edgeStats]) {
    console.log(`  │  ${s.label.padEnd(16)} │ ${s.mean.padStart(6)} │ ${s.std.padStart(6)} │ ${s.min.padStart(6)} │ ${s.p25.padStart(6)} │ ${s.p50.padStart(6)} │ ${s.p75.padStart(6)} │ ${s.max.padStart(6)} │`);
  }
  console.log('  └──────────────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┘');

  // Edge distribution histogram
  console.log('\n  EDGE DISTRIBUTION (pred - vegas):');
  const edgeBuckets = {};
  for (const e of edges) {
    const bucket = Math.floor(e / 2) * 2;
    edgeBuckets[bucket] = (edgeBuckets[bucket] || 0) + 1;
  }
  const maxCount = Math.max(...Object.values(edgeBuckets));
  for (const bucket of Object.keys(edgeBuckets).map(Number).sort((a, b) => a - b)) {
    const count = edgeBuckets[bucket];
    const bar = '█'.repeat(Math.round(count / maxCount * 40));
    const pct = (count / edges.length * 100).toFixed(1);
    console.log(`    ${String(bucket).padStart(4)} to ${String(bucket + 2).padStart(4)} │ ${bar} ${count} (${pct}%)`);
  }

  // How many predictions within ±2, ±3, ±5 of each other?
  console.log('\n  PREDICTION CLUSTERING CHECK:');
  const within2 = preds.filter((p, i) => Math.abs(p - vegas[i]) < 2).length;
  const within3 = preds.filter((p, i) => Math.abs(p - vegas[i]) < 3).length;
  const within5 = preds.filter((p, i) => Math.abs(p - vegas[i]) < 5).length;
  const beyond5 = preds.filter((p, i) => Math.abs(p - vegas[i]) >= 5).length;
  const beyond7 = preds.filter((p, i) => Math.abs(p - vegas[i]) >= 7).length;
  const beyond10 = preds.filter((p, i) => Math.abs(p - vegas[i]) >= 10).length;

  console.log(`    Within ±2 of Vegas:  ${within2} / ${preds.length} (${(within2/preds.length*100).toFixed(1)}%)  ${within2/preds.length > 0.5 ? '⚠️ STILL CLUSTERED' : '✅ OK'}`);
  console.log(`    Within ±3 of Vegas:  ${within3} / ${preds.length} (${(within3/preds.length*100).toFixed(1)}%)`);
  console.log(`    Within ±5 of Vegas:  ${within5} / ${preds.length} (${(within5/preds.length*100).toFixed(1)}%)`);
  console.log(`    Beyond ±5 of Vegas:  ${beyond5} / ${preds.length} (${(beyond5/preds.length*100).toFixed(1)}%)  ← actionable bets`);
  console.log(`    Beyond ±7 of Vegas:  ${beyond7} / ${preds.length} (${(beyond7/preds.length*100).toFixed(1)}%)`);
  console.log(`    Beyond ±10 of Vegas: ${beyond10} / ${preds.length} (${(beyond10/preds.length*100).toFixed(1)}%)`);

  // Unique predictions — count distinct rounded predictions
  const roundedPreds = preds.map(p => Math.round(p * 2) / 2); // round to 0.5
  const uniquePreds = new Set(roundedPreds).size;
  const roundedVegas = vegas.map(v => Math.round(v * 2) / 2);
  const uniqueVegas = new Set(roundedVegas).size;
  console.log(`\n    Unique predictions (rounded 0.5): ${uniquePreds} (Vegas: ${uniqueVegas})`);

  // Show 10 sample per-game predictions
  console.log('\n  SAMPLE PREDICTIONS (10 random games):');
  console.log('  ┌──────────────┬───────────────────────┬────────┬────────┬────────┬──────┐');
  console.log('  │  Date        │  Matchup              │  Pred  │  Vegas │ Actual │ Edge │');
  console.log('  ├──────────────┼───────────────────────┼────────┼────────┼────────┼──────┤');
  const shuffled = [...results].sort(() => Math.random() - 0.5).slice(0, 10).sort((a, b) => a.date.localeCompare(b.date));
  for (const r of shuffled) {
    const matchup = `${(r.awayTeam || '').slice(0, 3)}@${(r.homeTeam || '').slice(0, 3)}`;
    console.log(`  │  ${r.date}    │  ${matchup.padEnd(21)} │ ${r.pred.toFixed(1).padStart(6)} │ ${r.vegasLine.toFixed(1).padStart(6)} │ ${String(r.actual).padStart(6)} │ ${r.edge.toFixed(1).padStart(5)} │`);
  }
  console.log('  └──────────────┴───────────────────────┴────────┴────────┴────────┴──────┘');

  // ═══════════════════════════════════════════════════════════════
  // PART 2: TRUE NO-VIG KELLY STAKING
  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   PART 2: NO-VIG KELLY STAKING vs FLAT BETTING              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  /**
   * No-vig totals pricing:
   * At -110/-110, the no-vig implied probability for each side is 50%
   * Our model gives a predicted total. We need to convert our "edge" into
   * an estimated probability of winning the bet.
   *
   * Method: Use historical calibration — for a given edge size, what % actually won?
   * Then apply Kelly: f* = (bp - q) / b
   *   where b = decimal odds - 1, p = our probability, q = 1 - p
   *
   * For -110 odds: b = 100/110 = 0.909
   * Breakeven p = 1/(1+b) = 110/210 = 52.38%
   */

  // Step 1: Calibrate edge → win probability using ALL data (Oct 2024 – Mar 2026)
  // First build full results for calibration
  const fullTestGames = allGames.filter(g => g.date >= '2024-10-01');
  const fullResults = [];

  for (const game of fullTestGames) {
    const homeL3 = computeRollingWindowStats(allGames, game.homeTeamId, game.date, 3);
    const homeL10 = computeRollingWindowStats(allGames, game.homeTeamId, game.date, 10);
    const homeL20 = computeRollingWindowStats(allGames, game.homeTeamId, game.date, 20);
    const awayL3 = computeRollingWindowStats(allGames, game.awayTeamId, game.date, 3);
    const awayL10 = computeRollingWindowStats(allGames, game.awayTeamId, game.date, 10);
    const awayL20 = computeRollingWindowStats(allGames, game.awayTeamId, game.date, 20);
    if (!homeL3 || !homeL10 || !homeL20 || !awayL3 || !awayL10 || !awayL20) continue;

    const actual = game.homeScore + game.awayScore;
    if (actual < 150 || actual > 350) continue;

    const features = buildMultiWindowFeatures(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20);
    const pred = predictWithModel(v4Model, features);

    const homeTeamName = TEAM_NAME_MAP[game.homeTeam || game.homeTeamName] || game.homeTeam || game.homeTeamName;
    const prevDay = new Date(new Date(game.date).getTime() - 86400000).toISOString().split('T')[0];
    const nextDay = new Date(new Date(game.date).getTime() + 86400000).toISOString().split('T')[0];
    const keys = [
      `${game.date}_${homeTeamName}`, `${game.date}_${game.homeTeam || game.homeTeamName}`,
      `${prevDay}_${homeTeamName}`, `${nextDay}_${homeTeamName}`,
    ];
    let vegasLine = null;
    for (const key of keys) { if (allOdds[key]) { vegasLine = allOdds[key].consensusLine; break; } }
    if (!vegasLine) continue;

    const edge = pred - vegasLine;
    const pickOver = edge > 0;
    const actualOver = actual > vegasLine;
    const correct = pickOver === actualOver;

    fullResults.push({ date: game.date, actual, vegasLine, pred, edge, absEdge: Math.abs(edge), pickOver, correct });
  }

  console.log(`\n  Full calibration dataset: ${fullResults.length} games (Oct 2024 – Mar 2026)`);

  // Step 2: Build calibration curve — edge bucket → win rate
  console.log('\n  CALIBRATION CURVE (edge size → actual win rate):');
  console.log('  ┌────────────┬────────┬───────┬──────────┬──────────────────────────────────┐');
  console.log('  │  Edge      │  Bets  │ Wins  │ Win Rate │ Bar                              │');
  console.log('  ├────────────┼────────┼───────┼──────────┼──────────────────────────────────┤');

  const calibration = {};
  const edgeBucketsForCal = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15];
  
  for (let b = 0; b < edgeBucketsForCal.length; b++) {
    const lo = edgeBucketsForCal[b];
    const hi = b < edgeBucketsForCal.length - 1 ? edgeBucketsForCal[b + 1] : 99;
    const inBucket = fullResults.filter(r => r.absEdge >= lo && r.absEdge < hi);
    if (inBucket.length < 5) continue;
    const wins = inBucket.filter(r => r.correct).length;
    const wr = wins / inBucket.length;
    calibration[lo] = wr;
    const bar = '█'.repeat(Math.round(wr * 40));
    const beStr = `${wr >= 0.5238 ? '✅' : '❌'}`;
    console.log(`  │  ${String(lo).padStart(2)}-${String(hi).padStart(2)} pts  │  ${String(inBucket.length).padStart(4)}  │ ${String(wins).padStart(5)} │  ${(wr * 100).toFixed(1).padStart(5)}%  │ ${bar} ${beStr} │`);
  }
  console.log('  └────────────┴────────┴───────┴──────────┴──────────────────────────────────┘');
  console.log('  (52.38% = breakeven at -110)');

  // Step 3: Estimate win probability for a given edge
  // Use logistic regression on the calibration data
  function estimateWinProb(absEdge) {
    // Simple: use the nearest calibration bucket
    // Or better: linear interpolation from calibration curve
    // For totals, empirical relationship is roughly:
    // P(win) ≈ 0.50 + slope * edge
    // Let's compute the slope from the data
    
    // Actually, let's compute it properly from all results
    // Group by edge in 1-pt buckets
    const bucketWR = {};
    for (let e = 0; e <= 20; e++) {
      const inBucket = fullResults.filter(r => r.absEdge >= e && r.absEdge < e + 1);
      if (inBucket.length >= 10) {
        bucketWR[e + 0.5] = inBucket.filter(r => r.correct).length / inBucket.length;
      }
    }
    
    // Find the closest bucket
    const buckKeys = Object.keys(bucketWR).map(Number).sort((a, b) => a - b);
    if (buckKeys.length === 0) return 0.50;
    
    // Linear interpolation
    if (absEdge <= buckKeys[0]) return bucketWR[buckKeys[0]];
    if (absEdge >= buckKeys[buckKeys.length - 1]) return bucketWR[buckKeys[buckKeys.length - 1]];
    
    for (let i = 0; i < buckKeys.length - 1; i++) {
      if (absEdge >= buckKeys[i] && absEdge < buckKeys[i + 1]) {
        const t = (absEdge - buckKeys[i]) / (buckKeys[i + 1] - buckKeys[i]);
        return bucketWR[buckKeys[i]] * (1 - t) + bucketWR[buckKeys[i + 1]] * t;
      }
    }
    return 0.50;
  }

  // Step 4: Apply Kelly staking on holdout period (Dec 2025 - Mar 2026)
  const holdout = results; // already Dec 2025+
  
  const decimalOdds = 1 + 100 / 110; // -110 → 1.909
  const b = decimalOdds - 1; // 0.909
  
  // Test multiple Kelly fractions
  const kellyFractions = [0.25, 0.5, 0.75, 1.0];
  const baseUnit = 110; // $110 flat bet
  const startingBankroll = 10000;

  // Also run different threshold combos with Kelly
  const strategies = [
    { name: 'Flat: All ≥5', underThresh: 5, overThresh: 5, kelly: false },
    { name: 'Flat: Dual U≥5/O≥7.5', underThresh: 5, overThresh: 7.5, kelly: false },
    { name: 'Flat: All ≥6', underThresh: 6, overThresh: 6, kelly: false },
    { name: 'Flat: All ≥7', underThresh: 7, overThresh: 7, kelly: false },
    { name: 'Flat: All ≥8', underThresh: 8, overThresh: 8, kelly: false },
    { name: 'Kelly 25%: All ≥5', underThresh: 5, overThresh: 5, kelly: true, fraction: 0.25 },
    { name: 'Kelly 25%: Dual U≥5/O≥7.5', underThresh: 5, overThresh: 7.5, kelly: true, fraction: 0.25 },
    { name: 'Kelly 25%: All ≥6', underThresh: 6, overThresh: 6, kelly: true, fraction: 0.25 },
    { name: 'Kelly 25%: All ≥7', underThresh: 7, overThresh: 7, kelly: true, fraction: 0.25 },
    { name: 'Kelly 25%: All ≥8', underThresh: 8, overThresh: 8, kelly: true, fraction: 0.25 },
    { name: 'Kelly 50%: All ≥5', underThresh: 5, overThresh: 5, kelly: true, fraction: 0.50 },
    { name: 'Kelly 50%: Dual U≥5/O≥7.5', underThresh: 5, overThresh: 7.5, kelly: true, fraction: 0.50 },
    { name: 'Kelly 50%: All ≥6', underThresh: 6, overThresh: 6, kelly: true, fraction: 0.50 },
    { name: 'Kelly 50%: All ≥7', underThresh: 7, overThresh: 7, kelly: true, fraction: 0.50 },
    { name: 'Kelly 50%: All ≥8', underThresh: 8, overThresh: 8, kelly: true, fraction: 0.50 },
  ];

  console.log('\n  ┌──────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('  │  STAKING COMPARISON ON HOLDOUT (Dec 2025 – Mar 2026)                                 │');
  console.log('  │  Starting bankroll: $10,000                                                          │');
  console.log('  ├──────────────────────────────┬──────┬───────┬──────────┬──────────┬──────────┬────────┤');
  console.log('  │  Strategy                    │ Bets │  WR   │  Profit  │  ROI     │  Final $ │ MaxDD  │');
  console.log('  ├──────────────────────────────┼──────┼───────┼──────────┼──────────┼──────────┼────────┤');

  for (const strat of strategies) {
    // Filter qualifying bets
    const qualifying = holdout.filter(r => {
      if (r.pickOver) return r.absEdge >= strat.overThresh;
      return r.absEdge >= strat.underThresh;
    });

    if (qualifying.length === 0) continue;

    let bankroll = startingBankroll;
    let peak = bankroll;
    let maxDrawdown = 0;
    let totalWagered = 0;
    let totalProfit = 0;
    let wins = 0;

    for (const bet of qualifying) {
      let wager;
      
      if (strat.kelly) {
        // Estimate win probability from calibration
        const p = estimateWinProb(bet.absEdge);
        const q = 1 - p;
        
        // Kelly criterion: f* = (bp - q) / b
        const fullKelly = (b * p - q) / b;
        
        // Cap at fraction, floor at 0 (don't bet if negative edge)
        const kellyFrac = Math.max(0, Math.min(fullKelly * strat.fraction, 0.15)); // cap at 15% of bankroll
        
        if (kellyFrac <= 0) continue; // Skip negative-edge bets
        
        wager = Math.round(bankroll * kellyFrac);
        if (wager < 10) wager = 10; // minimum bet
      } else {
        wager = baseUnit; // flat $110
      }

      totalWagered += wager;

      if (bet.correct) {
        const payout = Math.round(wager * b); // win at -110 → payout = wager * 0.909
        bankroll += payout;
        totalProfit += payout;
        wins++;
      } else {
        bankroll -= wager;
        totalProfit -= wager;
      }

      if (bankroll > peak) peak = bankroll;
      const dd = peak > 0 ? (peak - bankroll) / peak * 100 : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const wr = (wins / qualifying.length * 100).toFixed(1);
    const roi = totalWagered > 0 ? (totalProfit / totalWagered * 100).toFixed(1) : '0';
    
    const profitStr = totalProfit >= 0 ? `+$${totalProfit.toFixed(0)}` : `-$${Math.abs(totalProfit).toFixed(0)}`;
    
    console.log(`  │  ${strat.name.padEnd(28)} │ ${String(qualifying.length).padStart(4)} │ ${wr.padStart(5)}%│ ${profitStr.padStart(8)} │ ${roi.padStart(7)}% │ $${String(bankroll.toFixed(0)).padStart(6)} │ ${maxDrawdown.toFixed(1).padStart(5)}% │`);
  }
  console.log('  └──────────────────────────────┴──────┴───────┴──────────┴──────────┴──────────┴────────┘');

  // ═══════════════════════════════════════════════════════════════
  // ALSO RUN ON FULL PERIOD (Oct 2024+) for comparison
  // ═══════════════════════════════════════════════════════════════
  console.log('\n  ┌──────────────────────────────────────────────────────────────────────────────────────┐');
  console.log('  │  STAKING COMPARISON ON FULL PERIOD (Oct 2024 – Mar 2026, IN-SAMPLE for Oct-Nov)      │');
  console.log('  │  Starting bankroll: $10,000                                                          │');
  console.log('  ├──────────────────────────────┬──────┬───────┬──────────┬──────────┬──────────┬────────┤');
  console.log('  │  Strategy                    │ Bets │  WR   │  Profit  │  ROI     │  Final $ │ MaxDD  │');
  console.log('  ├──────────────────────────────┼──────┼───────┼──────────┼──────────┼──────────┼────────┤');

  for (const strat of strategies) {
    const qualifying = fullResults.filter(r => {
      if (r.pickOver) return r.absEdge >= strat.overThresh;
      return r.absEdge >= strat.underThresh;
    });

    if (qualifying.length === 0) continue;

    let bankroll = startingBankroll;
    let peak = bankroll;
    let maxDrawdown = 0;
    let totalWagered = 0;
    let totalProfit = 0;
    let wins = 0;

    for (const bet of qualifying) {
      let wager;
      
      if (strat.kelly) {
        const p = estimateWinProb(bet.absEdge);
        const q = 1 - p;
        const fullKelly = (b * p - q) / b;
        const kellyFrac = Math.max(0, Math.min(fullKelly * strat.fraction, 0.15));
        if (kellyFrac <= 0) continue;
        wager = Math.round(bankroll * kellyFrac);
        if (wager < 10) wager = 10;
      } else {
        wager = baseUnit;
      }

      totalWagered += wager;

      if (bet.correct) {
        const payout = Math.round(wager * b);
        bankroll += payout;
        totalProfit += payout;
        wins++;
      } else {
        bankroll -= wager;
        totalProfit -= wager;
      }

      if (bankroll > peak) peak = bankroll;
      const dd = peak > 0 ? (peak - bankroll) / peak * 100 : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    const wr = (wins / qualifying.length * 100).toFixed(1);
    const roi = totalWagered > 0 ? (totalProfit / totalWagered * 100).toFixed(1) : '0';
    const profitStr = totalProfit >= 0 ? `+$${totalProfit.toFixed(0)}` : `-$${Math.abs(totalProfit).toFixed(0)}`;
    
    console.log(`  │  ${strat.name.padEnd(28)} │ ${String(qualifying.length).padStart(4)} │ ${wr.padStart(5)}%│ ${profitStr.padStart(8)} │ ${roi.padStart(7)}% │ $${String(bankroll.toFixed(0)).padStart(6)} │ ${maxDrawdown.toFixed(1).padStart(5)}% │`);
  }
  console.log('  └──────────────────────────────┴──────┴───────┴──────────┴──────────┴──────────┴────────┘');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
