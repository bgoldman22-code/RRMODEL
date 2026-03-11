#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * NBA TOTALS MODEL V4 — EXPANDED TRAINING DATA RETRAIN
 * ═══════════════════════════════════════════════════════════════════
 *
 * ROOT CAUSE (from investigate-v3-drift.mjs):
 *   - V3 was trained ONLY on 2022-23 + 2023-24 (avg totals ~227-228)
 *   - 2025-26 scoring jumped to 233.5 in Oct-Nov, then settled back to 225-226 by Jan
 *   - Model couldn't adapt to transient environment changes
 *   - Result: -11.28% ROI in Dec 2025 – Mar 2026 holdout
 *
 * FIX: Train on 2022-23 + 2023-24 + 2024-25 + Oct-Nov 2025-26
 *   - ~4,000+ training games (vs 2,718 before)
 *   - Model sees the scoring jump AND the reversion
 *   - Test on Dec 2025 – Mar 9 2026 (true out-of-sample)
 *
 * Same 82-feature multi-window architecture as V3.
 * ═══════════════════════════════════════════════════════════════════
 */

import { readFile, readdir, writeFile, mkdir } from 'fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');


// ═══════════════════════════════════════════════════════════════
// PHASE 1: LOAD ALL GAME DATA
// ═══════════════════════════════════════════════════════════════

async function loadAllGames() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 1: LOAD ALL GAME DATA');
  console.log('═══════════════════════════════════════════════════════\n');

  const allGames = [];
  const gameFiles = [
    { file: 'data/nba/games/games_2022_23.json', label: '2022-23' },
    { file: 'data/nba/games/games_2023_24.json', label: '2023-24' },
    { file: 'data/nba/games/games_2024_25.json', label: '2024-25' },
    { file: 'data/nba/games/games_2025_26_extended.json', label: '2025-26' },
  ];

  for (const { file, label } of gameFiles) {
    const filePath = path.join(ROOT, file);
    try {
      const data = JSON.parse(await readFile(filePath, 'utf8'));
      const valid = data.filter(g =>
        g.homeStats?.fga > 0 && g.awayStats?.fga > 0 &&
        (g.homeScore > 0 || g.homeStats?.points > 0) &&
        (g.awayScore > 0 || g.awayStats?.points > 0)
      );

      // Normalize: ensure homeScore/awayScore exist
      for (const g of valid) {
        if (!g.homeScore && g.homeStats?.points) g.homeScore = g.homeStats.points;
        if (!g.awayScore && g.awayStats?.points) g.awayScore = g.awayStats.points;

        if (!g.homeScore) {
          g.homeScore = (g.homeStats.fgm - g.homeStats.fg3m) * 2 + g.homeStats.fg3m * 3 + g.homeStats.ftm;
        }
        if (!g.awayScore) {
          g.awayScore = (g.awayStats.fgm - g.awayStats.fg3m) * 2 + g.awayStats.fg3m * 3 + g.awayStats.ftm;
        }
      }

      allGames.push(...valid);
      console.log(`  ${label}: ${valid.length} valid games`);
    } catch (e) {
      console.log(`  ${label}: SKIPPED (${e.message})`);
    }
  }

  allGames.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  console.log(`\n  Total: ${allGames.length} games across all seasons\n`);
  return allGames;
}


// ═══════════════════════════════════════════════════════════════
// PER-GAME STAT COMPUTATION
// ═══════════════════════════════════════════════════════════════

function computePerGameStats(stats, oppStats, pts, oppPts) {
  const fgm = stats.fgm || 0;
  const fga = stats.fga || 1;
  const fg3m = stats.fg3m || 0;
  const fg3a = stats.fg3a || 0;
  const ftm = stats.ftm || 0;
  const fta = stats.fta || 0;
  const oreb = stats.offRebounds || 0;
  const dreb = stats.defRebounds || 0;
  const tov = stats.turnovers || 0;

  const oppFga = oppStats.fga || 1;
  const oppOreb = oppStats.offRebounds || 0;
  const oppDreb = oppStats.defRebounds || 0;
  const oppTov = oppStats.turnovers || 0;
  const oppFta = oppStats.fta || 0;

  const possessions = fga - oreb + tov + 0.44 * fta;
  const oppPossessions = oppFga - oppOreb + oppTov + 0.44 * oppFta;

  const pace = possessions;
  const offRtg = possessions > 0 ? (pts / possessions) * 100 : 114.5;
  const defRtg = oppPossessions > 0 ? (oppPts / oppPossessions) * 100 : 114.5;
  const netRtg = offRtg - defRtg;

  const efg = fga > 0 ? (fgm + 0.5 * fg3m) / fga : 0.535;
  const ts = (fga + 0.44 * fta) > 0 ? pts / (2 * (fga + 0.44 * fta)) : 0.575;
  const tovPct = possessions > 0 ? tov / possessions : 0.138;
  const orbPct = (oreb + oppDreb) > 0 ? oreb / (oreb + oppDreb) : 0.25;

  return {
    pts, oppPts, pace, offRtg, defRtg, netRtg,
    efg, ts, tovPct, orbPct,
    fgPct: fga > 0 ? fgm / fga : 0.47,
    fg3Pct: fg3a > 0 ? fg3m / fg3a : 0.36,
    ftPct: fta > 0 ? ftm / fta : 0.78,
    rebounds: stats.rebounds || (oreb + dreb),
    assists: stats.assists || 0,
    turnovers: tov,
    steals: stats.steals || 0,
    blocks: stats.blocks || 0,
    fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb,
    won: pts > oppPts ? 1 : 0
  };
}


// ═══════════════════════════════════════════════════════════════
// ROLLING WINDOW STATS
// ═══════════════════════════════════════════════════════════════

function computeRollingWindowStats(allGames, teamId, gameDate, windowSize) {
  const recentGames = [];

  for (let i = allGames.length - 1; i >= 0; i--) {
    const g = allGames[i];
    if (g.date >= gameDate) continue;

    const isHome = g.homeTeamId === teamId;
    const isAway = g.awayTeamId === teamId;
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

  const pace = totalPoss / n;
  const offRtg = totalPoss > 0 ? (totalPts / totalPoss) * 100 : 114.5;
  const defRtg = totalPoss > 0 ? (totalOppPts / totalPoss) * 100 : 114.5;
  const netRtg = offRtg - defRtg;

  const avg = (key) => recentGames.reduce((s, g) => s + g[key], 0) / n;

  return {
    games: n, pace, offRtg, defRtg, netRtg,
    ppg: totalPts / n,
    oppPpg: totalOppPts / n,
    efg: avg('efg'), ts: avg('ts'),
    tovPct: avg('tovPct'), orbPct: avg('orbPct'),
    fgPct: avg('fgPct'), fg3Pct: avg('fg3Pct'), ftPct: avg('ftPct'),
    rebounds: avg('rebounds'), assists: avg('assists'),
    turnovers: avg('turnovers'), steals: avg('steals'), blocks: avg('blocks'),
    winPct: recentGames.filter(g => g.won).length / n,
    fga: avg('fga'), fta: avg('fta'), fg3a: avg('fg3a'),
  };
}


// ═══════════════════════════════════════════════════════════════
// MULTI-WINDOW FEATURES (same as V3 — 82 features)
// ═══════════════════════════════════════════════════════════════

function buildMultiWindowFeatures(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20) {
  const l3 = {
    h3_pace: homeL3.pace, h3_offRtg: homeL3.offRtg, h3_defRtg: homeL3.defRtg,
    h3_ppg: homeL3.ppg, h3_efg: homeL3.efg, h3_fgPct: homeL3.fgPct,
    h3_fg3Pct: homeL3.fg3Pct, h3_assists: homeL3.assists, h3_turnovers: homeL3.turnovers,
    a3_pace: awayL3.pace, a3_offRtg: awayL3.offRtg, a3_defRtg: awayL3.defRtg,
    a3_ppg: awayL3.ppg, a3_efg: awayL3.efg, a3_fgPct: awayL3.fgPct,
    a3_fg3Pct: awayL3.fg3Pct, a3_assists: awayL3.assists, a3_turnovers: awayL3.turnovers,
  };

  const l10 = {
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
  };

  const l20 = {
    h20_pace: homeL20.pace, h20_offRtg: homeL20.offRtg, h20_defRtg: homeL20.defRtg,
    h20_ppg: homeL20.ppg, h20_efg: homeL20.efg,
    a20_pace: awayL20.pace, a20_offRtg: awayL20.offRtg, a20_defRtg: awayL20.defRtg,
    a20_ppg: awayL20.ppg, a20_efg: awayL20.efg,
  };

  const interactions = {
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

  return { ...l3, ...l10, ...l20, ...interactions };
}

// Old 18-feature model for comparison
function buildOldFeatures(homeL10, awayL10) {
  return {
    home_l10_fgPct: homeL10.fgPct, home_l10_fg3Pct: homeL10.fg3Pct,
    home_l10_ftPct: homeL10.ftPct, home_l10_rebounds: homeL10.rebounds,
    home_l10_assists: homeL10.assists, home_l10_turnovers: homeL10.turnovers,
    away_l10_fgPct: awayL10.fgPct, away_l10_fg3Pct: awayL10.fg3Pct,
    away_l10_ftPct: awayL10.ftPct, away_l10_rebounds: awayL10.rebounds,
    away_l10_assists: awayL10.assists, away_l10_turnovers: awayL10.turnovers,
    fgPct_diff: homeL10.fgPct - awayL10.fgPct,
    fg3Pct_diff: homeL10.fg3Pct - awayL10.fg3Pct,
    rebounds_diff: homeL10.rebounds - awayL10.rebounds,
    assists_diff: homeL10.assists - awayL10.assists,
    turnovers_diff: awayL10.turnovers - homeL10.turnovers,
    home_court: 1
  };
}


// ═══════════════════════════════════════════════════════════════
// BUILD FULL DATASET
// ═══════════════════════════════════════════════════════════════

async function buildDataset(allGames) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 2: BUILD MULTI-WINDOW FEATURES');
  console.log('═══════════════════════════════════════════════════════\n');

  const dataset = [];
  let skipped = 0;
  let noL3 = 0, noL10 = 0, noL20 = 0;

  for (let i = 0; i < allGames.length; i++) {
    const game = allGames[i];

    const homeL3 = computeRollingWindowStats(allGames, game.homeTeamId, game.date, 3);
    const homeL10 = computeRollingWindowStats(allGames, game.homeTeamId, game.date, 10);
    const homeL20 = computeRollingWindowStats(allGames, game.homeTeamId, game.date, 20);

    const awayL3 = computeRollingWindowStats(allGames, game.awayTeamId, game.date, 3);
    const awayL10 = computeRollingWindowStats(allGames, game.awayTeamId, game.date, 10);
    const awayL20 = computeRollingWindowStats(allGames, game.awayTeamId, game.date, 20);

    if (!homeL3 || !awayL3) { noL3++; skipped++; continue; }
    if (!homeL10 || !awayL10) { noL10++; skipped++; continue; }
    if (!homeL20 || !awayL20) { noL20++; skipped++; continue; }

    const actualTotal = game.homeScore + game.awayScore;
    if (actualTotal < 150 || actualTotal > 350) { skipped++; continue; }

    dataset.push({
      date: game.date,
      gameId: game.gameId,
      homeTeam: game.homeTeam || game.homeTeamName,
      awayTeam: game.awayTeam || game.awayTeamName,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      actualTotal,
      newFeatures: buildMultiWindowFeatures(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20),
      oldFeatures: buildOldFeatures(homeL10, awayL10),
    });

    if ((i + 1) % 500 === 0) {
      process.stdout.write(`\r  Processing: ${i + 1}/${allGames.length} (${dataset.length} valid)`);
    }
  }

  console.log(`\r  ✅ Built ${dataset.length} samples`);
  console.log(`  Skipped: ${skipped} total (L3: ${noL3}, L10: ${noL10}, L20: ${noL20})`);

  if (dataset.length > 0) {
    const newCount = Object.keys(dataset[0].newFeatures).length;
    const oldCount = Object.keys(dataset[0].oldFeatures).length;
    console.log(`\n  Old model: ${oldCount} features`);
    console.log(`  New model: ${newCount} features`);
  }

  return dataset;
}


// ═══════════════════════════════════════════════════════════════
// LOAD ALL ODDS
// ═══════════════════════════════════════════════════════════════

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

async function loadAllOdds() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 3: MATCH WITH HISTORICAL ODDS');
  console.log('═══════════════════════════════════════════════════════\n');

  const oddsDir = path.join(ROOT, 'data/nba/historical_odds/game_totals');
  const allOdds = {};
  let fileCount = 0;
  let gameCount = 0;

  try {
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
          const key = `${dateStr}_${homeTeam}`;
          allOdds[key] = { consensusLine, lines, homeTeam, dateStr };
          gameCount++;
        }
        fileCount++;
      } catch {}
    }
  } catch {}

  // Also load from backtest CSV
  try {
    const csv = await readFile(path.join(ROOT, 'data/nba/backtests/nba_totals_backtest_dataset.csv'), 'utf8');
    const csvLines = csv.split('\n');
    const headers = csvLines[0].split(',');
    let csvCount = 0;

    for (let i = 1; i < csvLines.length; i++) {
      if (!csvLines[i].trim()) continue;
      const vals = csvLines[i].split(',');
      const row = {};
      headers.forEach((h, idx) => row[h] = vals[idx]);

      if (row.market_total_line_consensus) {
        const homeTeamName = TEAM_NAME_MAP[row.home_team] || row.home_team;
        const key = `${row.date}_${homeTeamName}`;
        if (!allOdds[key]) {
          allOdds[key] = {
            consensusLine: parseFloat(row.market_total_line_consensus),
            lines: [parseFloat(row.market_total_line_consensus)],
            homeTeam: homeTeamName, dateStr: row.date
          };
          csvCount++;
        }
        const keyAbbr = `${row.date}_${row.home_team}`;
        if (!allOdds[keyAbbr]) allOdds[keyAbbr] = allOdds[key];
      }
    }
    console.log(`  Loaded ${csvCount} additional odds from backtest CSV`);
  } catch {}

  console.log(`  Loaded ${fileCount} odds files, ${gameCount} game odds`);
  console.log(`  Total odds entries: ${Object.keys(allOdds).length}`);

  return allOdds;
}

function matchOdds(dataset, allOdds) {
  let matched = 0;
  let unmatched = 0;

  for (const d of dataset) {
    const homeTeamName = TEAM_NAME_MAP[d.homeTeam] || d.homeTeam;
    const prevDay = new Date(new Date(d.date).getTime() - 86400000).toISOString().split('T')[0];
    const nextDay = new Date(new Date(d.date).getTime() + 86400000).toISOString().split('T')[0];

    const keys = [
      `${d.date}_${homeTeamName}`, `${d.date}_${d.homeTeam}`,
      `${prevDay}_${homeTeamName}`, `${nextDay}_${homeTeamName}`,
      `${prevDay}_${d.homeTeam}`, `${nextDay}_${d.homeTeam}`,
    ];

    let odds = null;
    for (const key of keys) {
      if (allOdds[key]) { odds = allOdds[key]; break; }
    }

    if (odds) { d.vegasLine = odds.consensusLine; matched++; }
    else { unmatched++; }
  }

  console.log(`  Matched: ${matched} games with odds`);
  console.log(`  Unmatched: ${unmatched} games without odds`);

  return dataset.filter(d => d.vegasLine);
}


// ═══════════════════════════════════════════════════════════════
// NORMALIZE + TRAIN ELASTIC NET
// ═══════════════════════════════════════════════════════════════

function normalizeFeatures(X) {
  const keys = Object.keys(X[0]);
  const means = {};
  const stds = {};

  keys.forEach(key => {
    const vals = X.map(x => x[key]).filter(Number.isFinite);
    means[key] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const variance = vals.length > 0 ? vals.reduce((sum, v) => sum + (v - means[key]) ** 2, 0) / vals.length : 1;
    stds[key] = Math.sqrt(variance) || 1;
  });

  const normalized = X.map(x => {
    const norm = {};
    keys.forEach(key => {
      const v = Number.isFinite(x[key]) ? x[key] : means[key];
      norm[key] = (v - means[key]) / stds[key];
    });
    return norm;
  });

  return { normalized, means, stds };
}

function trainElasticNet(X, y, alpha = 0.005, l1Ratio = 0.7, lr = 0.0005, epochs = 5000) {
  const n = X.length;
  const keys = Object.keys(X[0]);
  const { normalized, means, stds } = normalizeFeatures(X);

  const weights = {};
  keys.forEach(k => weights[k] = 0);
  let bias = y.reduce((a, b) => a + b, 0) / n;

  let bestLoss = Infinity;
  let bestWeights = { ...weights };
  let bestBias = bias;
  let patience = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradients = {};
    keys.forEach(k => gradients[k] = 0);
    let biasGrad = 0;
    let totalLoss = 0;

    for (let i = 0; i < n; i++) {
      let pred = bias;
      keys.forEach(k => { pred += weights[k] * normalized[i][k]; });

      const error = pred - y[i];
      totalLoss += error * error;
      keys.forEach(k => { gradients[k] += error * normalized[i][k]; });
      biasGrad += error;
    }

    const avgLoss = totalLoss / n;

    if (avgLoss < bestLoss) {
      bestLoss = avgLoss;
      bestWeights = { ...weights };
      bestBias = bias;
      patience = 0;
    } else {
      patience++;
    }

    if (patience > 500) {
      console.log(`    Early stopping at epoch ${epoch} (best RMSE: ${Math.sqrt(bestLoss).toFixed(2)})`);
      break;
    }

    keys.forEach(k => {
      const grad = gradients[k] / n;
      const l1 = alpha * l1Ratio * Math.sign(weights[k]);
      const l2 = alpha * (1 - l1Ratio) * weights[k];
      weights[k] -= lr * (grad + l1 + l2);
    });
    bias -= (lr / n) * biasGrad;

    if ((epoch + 1) % 1000 === 0) {
      const rmse = Math.sqrt(avgLoss);
      const nonZero = Object.values(weights).filter(w => Math.abs(w) > 0.001).length;
      console.log(`    Epoch ${epoch + 1}: RMSE=${rmse.toFixed(2)}, Non-zero: ${nonZero}/${keys.length}`);
    }
  }

  return { weights: bestWeights, bias: bestBias, means, stds, type: 'elastic_net' };
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
// BACKTEST + ROI ANALYSIS
// ═══════════════════════════════════════════════════════════════

function backtestModel(model, testData, featureKey) {
  let totalError = 0;
  const results = [];

  for (const d of testData) {
    const pred = predictWithModel(model, d[featureKey]);
    const edge = pred - d.vegasLine;
    const actual = d.actualTotal;

    results.push({
      date: d.date,
      homeTeam: d.homeTeam, awayTeam: d.awayTeam,
      actual, vegasLine: d.vegasLine, pred, edge,
      absEdge: Math.abs(edge),
      modelError: Math.abs(pred - actual),
      vegasError: Math.abs(d.vegasLine - actual),
      pickOver: edge > 0,
      actualOver: actual > d.vegasLine,
      correct: (edge > 0) === (actual > d.vegasLine),
    });

    totalError += Math.abs(pred - actual);
  }

  return { mae: totalError / testData.length, results };
}

function analyzeROI(results, thresholds = [3, 4, 5, 6, 7, 8]) {
  const analysis = {};

  for (const thresh of thresholds) {
    const qualifying = results.filter(r => r.absEdge >= thresh);
    if (qualifying.length === 0) {
      analysis[`edge_${thresh}`] = { count: 0, roi: 0, winRate: 0 };
      continue;
    }

    const wins = qualifying.filter(r => r.correct).length;
    const losses = qualifying.length - wins;
    const profit = wins * 100 - losses * 110;
    const wagered = qualifying.length * 110;
    const roi = wagered > 0 ? (profit / wagered) * 100 : 0;
    const winRate = wins / qualifying.length * 100;

    analysis[`edge_${thresh}`] = {
      count: qualifying.length, wins, losses,
      profit: profit.toFixed(0), wagered: wagered.toFixed(0),
      roi: roi.toFixed(2), winRate: winRate.toFixed(1),
    };

    const overs = qualifying.filter(r => r.pickOver);
    const unders = qualifying.filter(r => !r.pickOver);

    const overWins = overs.filter(r => r.correct).length;
    const overProfit = overWins * 100 - (overs.length - overWins) * 110;

    const underWins = unders.filter(r => r.correct).length;
    const underProfit = underWins * 100 - (unders.length - underWins) * 110;

    analysis[`edge_${thresh}`].overs = {
      count: overs.length, wins: overWins,
      roi: overs.length > 0 ? ((overProfit / (overs.length * 110)) * 100).toFixed(2) : '0',
      winRate: overs.length > 0 ? (overWins / overs.length * 100).toFixed(1) : '0',
    };
    analysis[`edge_${thresh}`].unders = {
      count: unders.length, wins: underWins,
      roi: unders.length > 0 ? ((underProfit / (unders.length * 110)) * 100).toFixed(2) : '0',
      winRate: unders.length > 0 ? (underWins / unders.length * 100).toFixed(1) : '0',
    };
  }

  return analysis;
}


// ═══════════════════════════════════════════════════════════════
// DUAL STRATEGY ANALYSIS (Unders ≥5, Overs ≥7.5)
// ═══════════════════════════════════════════════════════════════

function analyzeDualStrategy(results, underThresh = 5, overThresh = 7.5) {
  const qualifying = results.filter(r =>
    (!r.pickOver && r.absEdge >= underThresh) ||
    (r.pickOver && r.absEdge >= overThresh)
  );

  if (qualifying.length === 0) return { count: 0 };

  const wins = qualifying.filter(r => r.correct).length;
  const losses = qualifying.length - wins;
  const profit = wins * 100 - losses * 110;
  const wagered = qualifying.length * 110;
  const roi = wagered > 0 ? (profit / wagered) * 100 : 0;

  // Monthly breakdown
  const byMonth = {};
  for (const r of qualifying) {
    const month = r.date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { bets: 0, wins: 0, profit: 0 };
    byMonth[month].bets++;
    if (r.correct) {
      byMonth[month].wins++;
      byMonth[month].profit += 100;
    } else {
      byMonth[month].profit -= 110;
    }
  }

  const overs = qualifying.filter(r => r.pickOver);
  const unders = qualifying.filter(r => !r.pickOver);
  const overWins = overs.filter(r => r.correct).length;
  const underWins = unders.filter(r => r.correct).length;

  return {
    count: qualifying.length,
    wins, losses, profit, wagered,
    roi: roi.toFixed(2),
    winRate: (wins / qualifying.length * 100).toFixed(1),
    overs: {
      count: overs.length, wins: overWins,
      roi: overs.length > 0 ? ((overWins * 100 - (overs.length - overWins) * 110) / (overs.length * 110) * 100).toFixed(2) : '0',
    },
    unders: {
      count: unders.length, wins: underWins,
      roi: unders.length > 0 ? ((underWins * 100 - (unders.length - underWins) * 110) / (unders.length * 110) * 100).toFixed(2) : '0',
    },
    byMonth,
  };
}


// ═══════════════════════════════════════════════════════════════
// MAIN — RETRAIN WITH EXPANDED DATA
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   NBA TOTALS MODEL V4 — EXPANDED TRAINING RETRAIN          ║');
  console.log('║   Train: 2022-23 + 2023-24 + 2024-25 + Oct-Nov 2025-26    ║');
  console.log('║   Test:  Dec 2025 – Mar 9 2026 (true out-of-sample)        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Phase 1: Load games
  const allGames = await loadAllGames();

  // Phase 2: Build features
  const dataset = await buildDataset(allGames);

  // Phase 3: Match with odds
  const allOdds = await loadAllOdds();
  const withOdds = matchOdds(dataset, allOdds);

  // ═══════════════════════════════════════════════════════════════
  // KEY CHANGE: Train on everything through Nov 2025
  // Test on Dec 2025 – Mar 2026 (the period V3 collapsed)
  // ═══════════════════════════════════════════════════════════════
  const trainCutoff = '2025-12-01';
  const trainData = dataset.filter(d => d.date < trainCutoff);
  const testDataAll = dataset.filter(d => d.date >= trainCutoff);
  const testData = withOdds.filter(d => d.date >= trainCutoff);

  // Also compute V3 cutoff data for comparison
  const v3TrainCutoff = '2024-10-01';
  const v3TrainData = dataset.filter(d => d.date < v3TrainCutoff);
  const v3TestData = withOdds.filter(d => d.date >= v3TrainCutoff);

  console.log(`\n  ┌──────────────────────────────────────────────────┐`);
  console.log(`  │  TRAINING DATA COMPARISON                         │`);
  console.log(`  ├──────────────────────────────────────────────────┤`);
  console.log(`  │  V3 (old cutoff ${v3TrainCutoff}):                │`);
  console.log(`  │    Train: ${v3TrainData.length} games                          │`);
  console.log(`  │    Test:  ${v3TestData.length} games (odds-matched)            │`);
  console.log(`  │                                                    │`);
  console.log(`  │  V4 (new cutoff ${trainCutoff}):                │`);
  console.log(`  │    Train: ${trainData.length} games (+${trainData.length - v3TrainData.length} more!)             │`);
  console.log(`  │    Test:  ${testData.length} games (Dec 25 - Mar 26)         │`);
  console.log(`  └──────────────────────────────────────────────────┘`);

  if (trainData.length > 0) {
    console.log(`    Train range: ${trainData[0]?.date} → ${trainData[trainData.length - 1]?.date}`);
  }
  if (testData.length > 0) {
    console.log(`    Test range:  ${testData[0]?.date} → ${testData[testData.length - 1]?.date}`);
  }

  if (trainData.length < 1000 || testData.length < 50) {
    console.error('\n  ❌ Not enough data for train/test split!');
    console.error(`     Train: ${trainData.length}, Test: ${testData.length}`);
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: TRAIN BOTH MODELS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 4: TRAIN MODELS');
  console.log('═══════════════════════════════════════════════════════\n');

  // Train V3-equivalent with OLD cutoff (for apples-to-apples comparison)
  console.log('  Training V3-equivalent (old cutoff, 82 features)...');
  const v3TrainX = v3TrainData.map(d => d.newFeatures);
  const v3TrainY = v3TrainData.map(d => d.actualTotal);
  const v3Model = trainElasticNet(v3TrainX, v3TrainY, 0.005, 0.7, 0.0003, 8000);

  // Train V4 with expanded data
  console.log('\n  Training V4 (expanded cutoff, 82 features)...');
  const v4TrainX = trainData.map(d => d.newFeatures);
  const v4TrainY = trainData.map(d => d.actualTotal);
  const v4Model = trainElasticNet(v4TrainX, v4TrainY, 0.005, 0.7, 0.0003, 8000);

  // Show top features for V4
  const v4Weights = Object.entries(v4Model.weights)
    .map(([k, w]) => ({ feature: k, weight: w, absWeight: Math.abs(w) }))
    .sort((a, b) => b.absWeight - a.absWeight);

  console.log('\n  TOP 20 FEATURES (V4 model):');
  console.log('  ' + '─'.repeat(50));
  for (const f of v4Weights.slice(0, 20)) {
    const dir = f.weight > 0 ? '↑' : '↓';
    console.log(`    ${dir} ${f.feature.padEnd(30)} ${f.weight > 0 ? '+' : ''}${f.weight.toFixed(4)}`);
  }

  const deadFeatures = v4Weights.filter(f => f.absWeight < 0.01).length;
  console.log(`\n  Active features: ${v4Weights.length - deadFeatures}/${v4Weights.length} (${deadFeatures} pruned by L1)`);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 5: BACKTEST ON DEC 2025 – MAR 2026 HOLDOUT
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 5: HOLDOUT BACKTEST (Dec 2025 – Mar 2026)');
  console.log('═══════════════════════════════════════════════════════\n');

  const v3Backtest = backtestModel(v3Model, testData, 'newFeatures');
  const v4Backtest = backtestModel(v4Model, testData, 'newFeatures');

  console.log(`  V3 model (train≤2024-10): MAE = ${v3Backtest.mae.toFixed(2)} on ${testData.length} test games`);
  console.log(`  V4 model (train≤2025-12): MAE = ${v4Backtest.mae.toFixed(2)} on ${testData.length} test games`);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 6: DETAILED COMPARISON (V3 vs V4 on holdout period)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 6: V3 vs V4 COMPARISON ON HOLDOUT');
  console.log('═══════════════════════════════════════════════════════');

  // Prediction spread
  const stats = (arr) => {
    const n = arr.length;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    return { min: Math.min(...arr), max: Math.max(...arr), mean: mean.toFixed(1), std: std.toFixed(1), range: (Math.max(...arr) - Math.min(...arr)).toFixed(1) };
  };

  const v3Preds = v3Backtest.results.map(r => r.pred);
  const v4Preds = v4Backtest.results.map(r => r.pred);
  const vegasLines = v3Backtest.results.map(r => r.vegasLine);
  const actuals = v3Backtest.results.map(r => r.actual);

  console.log('\n  ┌──────────────────────────────────────────────────────────────┐');
  console.log('  │  PREDICTION SPREAD COMPARISON                                │');
  console.log('  ├──────────────────────────────────────────────────────────────┤');
  console.log(`  │  Actuals:  std=${stats(actuals).std}, mean=${stats(actuals).mean}                           │`);
  console.log(`  │  Vegas:    std=${stats(vegasLines).std}, mean=${stats(vegasLines).mean}                           │`);
  console.log(`  │  V3 model: std=${stats(v3Preds).std}, mean=${stats(v3Preds).mean}                           │`);
  console.log(`  │  V4 model: std=${stats(v4Preds).std}, mean=${stats(v4Preds).mean}                           │`);
  console.log('  └──────────────────────────────────────────────────────────────┘');

  // ROI comparison at all thresholds
  const v3ROI = analyzeROI(v3Backtest.results);
  const v4ROI = analyzeROI(v4Backtest.results);

  console.log('\n  ┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('  │  ROI COMPARISON ON HOLDOUT (Dec 2025 – Mar 2026)                         │');
  console.log('  ├─────────────┬──────────┬──────────┬───────┬──────────┬──────────┬─────────┤');
  console.log('  │  Edge       │ V3 bets  │ V3 ROI   │ V3 WR │ V4 bets  │ V4 ROI   │ V4 WR   │');
  console.log('  ├─────────────┼──────────┼──────────┼───────┼──────────┼──────────┼─────────┤');

  for (const thresh of [3, 4, 5, 6, 7, 8]) {
    const v3 = v3ROI[`edge_${thresh}`];
    const v4 = v4ROI[`edge_${thresh}`];
    console.log(`  │  ≥${thresh} pts     │  ${String(v3.count).padStart(5)}   │ ${String(v3.roi).padStart(7)}% │${String(v3.winRate).padStart(5)}% │  ${String(v4.count).padStart(5)}   │ ${String(v4.roi).padStart(7)}% │${String(v4.winRate).padStart(5)}% │`);
  }
  console.log('  └─────────────┴──────────┴──────────┴───────┴──────────┴──────────┴─────────┘');

  // Over/Under split at key thresholds
  for (const thresh of [5, 6, 7]) {
    const v3e = v3ROI[`edge_${thresh}`];
    const v4e = v4ROI[`edge_${thresh}`];
    if (v3e && v4e) {
      console.log(`\n  Edge ≥${thresh} — Over/Under Split:`);
      console.log(`    V3 Overs:  ${v3e.overs?.count || 0} bets, ROI ${v3e.overs?.roi || 0}%, WR ${v3e.overs?.winRate || 0}%`);
      console.log(`    V3 Unders: ${v3e.unders?.count || 0} bets, ROI ${v3e.unders?.roi || 0}%, WR ${v3e.unders?.winRate || 0}%`);
      console.log(`    V4 Overs:  ${v4e.overs?.count || 0} bets, ROI ${v4e.overs?.roi || 0}%, WR ${v4e.overs?.winRate || 0}%`);
      console.log(`    V4 Unders: ${v4e.unders?.count || 0} bets, ROI ${v4e.unders?.roi || 0}%, WR ${v4e.unders?.winRate || 0}%`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DUAL STRATEGY COMPARISON (Unders ≥5 + Overs ≥7.5)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  DUAL STRATEGY: Unders ≥5 + Overs ≥7.5');
  console.log('═══════════════════════════════════════════════════════\n');

  const v3Dual = analyzeDualStrategy(v3Backtest.results, 5, 7.5);
  const v4Dual = analyzeDualStrategy(v4Backtest.results, 5, 7.5);

  console.log('  V3 (old training data):');
  console.log(`    Total: ${v3Dual.count} bets, WR ${v3Dual.winRate}%, ROI ${v3Dual.roi}%, profit $${v3Dual.profit}`);
  if (v3Dual.overs) console.log(`    Overs: ${v3Dual.overs.count} bets, ROI ${v3Dual.overs.roi}%`);
  if (v3Dual.unders) console.log(`    Unders: ${v3Dual.unders.count} bets, ROI ${v3Dual.unders.roi}%`);

  console.log('\n  V4 (expanded training data):');
  console.log(`    Total: ${v4Dual.count} bets, WR ${v4Dual.winRate}%, ROI ${v4Dual.roi}%, profit $${v4Dual.profit}`);
  if (v4Dual.overs) console.log(`    Overs: ${v4Dual.overs.count} bets, ROI ${v4Dual.overs.roi}%`);
  if (v4Dual.unders) console.log(`    Unders: ${v4Dual.unders.count} bets, ROI ${v4Dual.unders.roi}%`);

  // Monthly breakdown
  if (v4Dual.byMonth) {
    console.log('\n  V4 Monthly Breakdown:');
    console.log('  ┌──────────┬──────┬──────┬─────────┬──────────┐');
    console.log('  │  Month   │ Bets │ Wins │ Profit  │ ROI      │');
    console.log('  ├──────────┼──────┼──────┼─────────┼──────────┤');
    for (const [month, data] of Object.entries(v4Dual.byMonth).sort()) {
      const roi = data.bets > 0 ? (data.profit / (data.bets * 110) * 100).toFixed(1) : '0';
      console.log(`  │  ${month}  │  ${String(data.bets).padStart(3)} │  ${String(data.wins).padStart(3)} │ ${String('$' + data.profit).padStart(7)} │ ${String(roi).padStart(6)}%  │`);
    }
    console.log('  └──────────┴──────┴──────┴─────────┴──────────┘');
  }

  // ═══════════════════════════════════════════════════════════════
  // ALSO TEST V4 ON THE FULL OCT 2024+ PERIOD (V3's original test range)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  BONUS: V4 ON FULL OCT 2024+ (V3 original test range)');
  console.log('═══════════════════════════════════════════════════════\n');

  // NOTE: This is in-sample for V4 (it trained on Oct2024-Nov2025)
  // but useful to see if the model still works on the period V3 was good at
  const fullTestData = withOdds.filter(d => d.date >= v3TrainCutoff);
  const v4FullBacktest = backtestModel(v4Model, fullTestData, 'newFeatures');
  const v4FullROI = analyzeROI(v4FullBacktest.results);
  const v4FullDual = analyzeDualStrategy(v4FullBacktest.results, 5, 7.5);

  console.log(`  V4 on full Oct 2024+ (${fullTestData.length} games, IN-SAMPLE for Oct24-Nov25):`);
  console.log(`    MAE: ${v4FullBacktest.mae.toFixed(2)}`);
  console.log(`    Dual strategy: ${v4FullDual.count} bets, WR ${v4FullDual.winRate}%, ROI ${v4FullDual.roi}%, profit $${v4FullDual.profit}`);

  for (const thresh of [5, 6, 7]) {
    const e = v4FullROI[`edge_${thresh}`];
    if (e) console.log(`    Edge ≥${thresh}: ${e.count} bets, ROI ${e.roi}%, WR ${e.winRate}%`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PREDICTION BIAS CHECK BY MONTH
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PREDICTION BIAS BY MONTH (V4 on holdout)');
  console.log('═══════════════════════════════════════════════════════\n');

  const byMonth = {};
  for (const r of v4Backtest.results) {
    const month = r.date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { preds: [], vegas: [], actuals: [], overPicks: 0, total: 0 };
    byMonth[month].preds.push(r.pred);
    byMonth[month].vegas.push(r.vegasLine);
    byMonth[month].actuals.push(r.actual);
    if (r.pickOver) byMonth[month].overPicks++;
    byMonth[month].total++;
  }

  console.log('  ┌──────────┬────────┬────────────┬────────────┬────────────┬───────────┐');
  console.log('  │  Month   │ Games  │ Avg Pred   │ Avg Vegas  │ Avg Actual │ Over %    │');
  console.log('  ├──────────┼────────┼────────────┼────────────┼────────────┼───────────┤');
  for (const [month, data] of Object.entries(byMonth).sort()) {
    const avgPred = (data.preds.reduce((a, b) => a + b, 0) / data.total).toFixed(1);
    const avgVegas = (data.vegas.reduce((a, b) => a + b, 0) / data.total).toFixed(1);
    const avgActual = (data.actuals.reduce((a, b) => a + b, 0) / data.total).toFixed(1);
    const overPct = (data.overPicks / data.total * 100).toFixed(0);
    console.log(`  │  ${month}  │  ${String(data.total).padStart(4)}  │  ${String(avgPred).padStart(8)}  │  ${String(avgVegas).padStart(8)}  │  ${String(avgActual).padStart(8)}  │  ${String(overPct).padStart(4)}%    │`);
  }
  console.log('  └──────────┴────────┴────────────┴────────────┴────────────┴───────────┘');

  // ═══════════════════════════════════════════════════════════════
  // SAVE MODEL + RESULTS
  // ═══════════════════════════════════════════════════════════════
  const modelsDir = path.join(ROOT, 'data/nba/models');
  if (!existsSync(modelsDir)) mkdirSync(modelsDir, { recursive: true });

  writeFileSync(
    path.join(modelsDir, 'totals_model_v4_expanded.json'),
    JSON.stringify(v4Model, null, 2)
  );
  console.log('\n  ✅ V4 model saved to data/nba/models/totals_model_v4_expanded.json');

  // Save full comparison
  writeFileSync(
    path.join(modelsDir, 'totals_v4_comparison_results.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      v3: {
        trainCutoff: v3TrainCutoff,
        trainSize: v3TrainData.length,
        holdout_mae: v3Backtest.mae,
        holdout_roi: v3ROI,
        holdout_dual: v3Dual,
      },
      v4: {
        trainCutoff,
        trainSize: trainData.length,
        holdout_mae: v4Backtest.mae,
        holdout_roi: v4ROI,
        holdout_dual: v4Dual,
        topFeatures: v4Weights.slice(0, 20).map(f => ({ feature: f.feature, weight: f.weight })),
      },
    }, null, 2)
  );
  console.log('  ✅ Comparison saved to data/nba/models/totals_v4_comparison_results.json');

  // ═══════════════════════════════════════════════════════════════
  // FINAL VERDICT
  // ═══════════════════════════════════════════════════════════════
  const v3HoldoutROI = parseFloat(v3Dual.roi || 0);
  const v4HoldoutROI = parseFloat(v4Dual.roi || 0);
  const roiImproved = v4HoldoutROI > v3HoldoutROI;
  const maeImproved = v4Backtest.mae < v3Backtest.mae;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                 FINAL VERDICT: V3 vs V4                      ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  V3 holdout (Dec-Mar): ${v3Dual.count} bets, ROI ${v3Dual.roi}%, profit $${v3Dual.profit}`.padEnd(63) + '║');
  console.log(`║  V4 holdout (Dec-Mar): ${v4Dual.count} bets, ROI ${v4Dual.roi}%, profit $${v4Dual.profit}`.padEnd(63) + '║');
  console.log('║                                                              ║');
  console.log(`║  MAE improvement: ${maeImproved ? '✅ YES' : '❌ NO'} (${v3Backtest.mae.toFixed(2)} → ${v4Backtest.mae.toFixed(2)})`.padEnd(63) + '║');
  console.log(`║  ROI improvement: ${roiImproved ? '✅ YES' : '❌ NO'} (${v3HoldoutROI.toFixed(1)}% → ${v4HoldoutROI.toFixed(1)}%)`.padEnd(63) + '║');
  console.log('╠══════════════════════════════════════════════════════════════╣');

  if (v4HoldoutROI > 0 && roiImproved) {
    console.log('║  🎯 RECOMMENDATION: DEPLOY V4                                ║');
  } else if (roiImproved) {
    console.log('║  ⚠️  V4 BETTER than V3 but still negative — needs more work  ║');
  } else {
    console.log('║  ❌ V4 NOT BETTER — expanded data didn\'t help enough         ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
