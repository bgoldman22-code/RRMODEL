#!/usr/bin/env node

/**
 * NBA Totals Model V3 - Multi-Window Architecture
 * 
 * GOAL: Replace the 18-feature L10-only model (std dev 2.2 pts) with a 
 * 55+ feature multi-window model (target std dev ≥6 pts) that mirrors
 * the spread model's architecture.
 * 
 * KEY INSIGHT: The old model always predicts ~227 because:
 *   - Only uses L10 window (too stable, regresses to league mean)
 *   - Only uses box stats (no pace, no efficiency ratings)
 *   - home/away features partially cancel each other
 *   - No cross-team interaction features
 * 
 * NEW ARCHITECTURE:
 *   - L3 (recent form, volatile, catches hot/cold streaks)
 *   - L10 (medium term, balanced)
 *   - L20 (season trend, stable baseline)
 *   - Cross-team: pace interactions, offensive/defensive matchups, expected total
 *   - Box score: shooting, rebounding, turnovers at each window
 * 
 * PIPELINE:
 *   Phase 1: Load all game data (4 seasons)
 *   Phase 2: Build multi-window features for every game
 *   Phase 3: Match with historical odds
 *   Phase 4: Train with elastic net
 *   Phase 5: Walk-forward backtest vs old model
 *   Phase 6: Detailed comparison (prediction spread, ROI, CLV)
 */

import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');


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
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
      const valid = data.filter(g =>
        g.homeStats?.fga > 0 && g.awayStats?.fga > 0 &&
        (g.homeScore > 0 || g.homeStats?.points > 0) &&
        (g.awayScore > 0 || g.awayStats?.points > 0)
      );
      
      // Normalize: ensure homeScore/awayScore exist
      for (const g of valid) {
        if (!g.homeScore && g.homeStats?.points) g.homeScore = g.homeStats.points;
        if (!g.awayScore && g.awayStats?.points) g.awayScore = g.awayStats.points;
        
        // Compute points from box score if missing
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
// PER-GAME STAT COMPUTATION (from box score)
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

  // Possessions (Dean Oliver formula)
  const possessions = fga - oreb + tov + 0.44 * fta;
  const oppPossessions = oppFga - oppOreb + oppTov + 0.44 * oppFta;

  const pace = possessions;
  const offRtg = possessions > 0 ? (pts / possessions) * 100 : 114.5;
  const defRtg = oppPossessions > 0 ? (oppPts / oppPossessions) * 100 : 114.5;
  const netRtg = offRtg - defRtg;

  // Four factors
  const efg = fga > 0 ? (fgm + 0.5 * fg3m) / fga : 0.535;
  const ts = (fga + 0.44 * fta) > 0 ? pts / (2 * (fga + 0.44 * fta)) : 0.575;
  const tovPct = possessions > 0 ? tov / possessions : 0.138;
  const orbPct = (oreb + oppDreb) > 0 ? oreb / (oreb + oppDreb) : 0.25;

  return {
    pts,
    oppPts,
    pace,
    offRtg,
    defRtg,
    netRtg,
    efg,
    ts,
    tovPct,
    orbPct,
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
// ROLLING WINDOW STATS (L3, L10, L20)
// ═══════════════════════════════════════════════════════════════

function computeRollingWindowStats(allGames, teamId, gameDate, windowSize) {
  // Find recent games for this team BEFORE the game date
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

  if (recentGames.length < Math.min(3, windowSize)) return null; // Need minimum games

  const n = recentGames.length;
  
  // Aggregate
  const totalPts = recentGames.reduce((s, g) => s + g.pts, 0);
  const totalOppPts = recentGames.reduce((s, g) => s + g.oppPts, 0);
  const totalPoss = recentGames.reduce((s, g) => s + g.pace, 0); // pace = possessions per game
  
  const pace = totalPoss / n;
  const offRtg = totalPoss > 0 ? (totalPts / totalPoss) * 100 : 114.5;
  const defRtg = totalPoss > 0 ? (totalOppPts / totalPoss) * 100 : 114.5;
  const netRtg = offRtg - defRtg;
  
  const avg = (key) => recentGames.reduce((s, g) => s + g[key], 0) / n;

  return {
    games: n,
    pace,
    offRtg,
    defRtg,
    netRtg,
    ppg: totalPts / n,
    oppPpg: totalOppPts / n,
    efg: avg('efg'),
    ts: avg('ts'),
    tovPct: avg('tovPct'),
    orbPct: avg('orbPct'),
    fgPct: avg('fgPct'),
    fg3Pct: avg('fg3Pct'),
    ftPct: avg('ftPct'),
    rebounds: avg('rebounds'),
    assists: avg('assists'),
    turnovers: avg('turnovers'),
    steals: avg('steals'),
    blocks: avg('blocks'),
    winPct: recentGames.filter(g => g.won).length / n,
    fga: avg('fga'),
    fta: avg('fta'),
    fg3a: avg('fg3a'),
  };
}


// ═══════════════════════════════════════════════════════════════
// PHASE 2: BUILD MULTI-WINDOW FEATURES
// ═══════════════════════════════════════════════════════════════

function buildMultiWindowFeatures(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20) {
  // ─── L3 features (recent form, volatile) ───
  const l3 = {
    h3_pace: homeL3.pace,
    h3_offRtg: homeL3.offRtg,
    h3_defRtg: homeL3.defRtg,
    h3_ppg: homeL3.ppg,
    h3_efg: homeL3.efg,
    h3_fgPct: homeL3.fgPct,
    h3_fg3Pct: homeL3.fg3Pct,
    h3_assists: homeL3.assists,
    h3_turnovers: homeL3.turnovers,
    
    a3_pace: awayL3.pace,
    a3_offRtg: awayL3.offRtg,
    a3_defRtg: awayL3.defRtg,
    a3_ppg: awayL3.ppg,
    a3_efg: awayL3.efg,
    a3_fgPct: awayL3.fgPct,
    a3_fg3Pct: awayL3.fg3Pct,
    a3_assists: awayL3.assists,
    a3_turnovers: awayL3.turnovers,
  };

  // ─── L10 features (medium-term) ───
  const l10 = {
    h10_pace: homeL10.pace,
    h10_offRtg: homeL10.offRtg,
    h10_defRtg: homeL10.defRtg,
    h10_ppg: homeL10.ppg,
    h10_efg: homeL10.efg,
    h10_fgPct: homeL10.fgPct,
    h10_fg3Pct: homeL10.fg3Pct,
    h10_ftPct: homeL10.ftPct,
    h10_rebounds: homeL10.rebounds,
    h10_assists: homeL10.assists,
    h10_turnovers: homeL10.turnovers,
    h10_ts: homeL10.ts,
    
    a10_pace: awayL10.pace,
    a10_offRtg: awayL10.offRtg,
    a10_defRtg: awayL10.defRtg,
    a10_ppg: awayL10.ppg,
    a10_efg: awayL10.efg,
    a10_fgPct: awayL10.fgPct,
    a10_fg3Pct: awayL10.fg3Pct,
    a10_ftPct: awayL10.ftPct,
    a10_rebounds: awayL10.rebounds,
    a10_assists: awayL10.assists,
    a10_turnovers: awayL10.turnovers,
    a10_ts: awayL10.ts,
  };

  // ─── L20 features (stable baseline) ───
  const l20 = {
    h20_pace: homeL20.pace,
    h20_offRtg: homeL20.offRtg,
    h20_defRtg: homeL20.defRtg,
    h20_ppg: homeL20.ppg,
    h20_efg: homeL20.efg,
    
    a20_pace: awayL20.pace,
    a20_offRtg: awayL20.offRtg,
    a20_defRtg: awayL20.defRtg,
    a20_ppg: awayL20.ppg,
    a20_efg: awayL20.efg,
  };

  // ─── Cross-team interactions (the key to wider predictions) ───
  const interactions = {
    // Pace interactions (MOST IMPORTANT for totals)
    pace_avg_l10: (homeL10.pace + awayL10.pace) / 2,
    pace_diff_l10: homeL10.pace - awayL10.pace,
    pace_avg_l3: (homeL3.pace + awayL3.pace) / 2,
    pace_product: (homeL10.pace * awayL10.pace) / 10000,
    
    // PPG interactions
    ppg_sum_l10: homeL10.ppg + awayL10.ppg,
    ppg_sum_l3: homeL3.ppg + awayL3.ppg,
    ppg_sum_l20: homeL20.ppg + awayL20.ppg,
    ppg_diff_l10: homeL10.ppg - awayL10.ppg,
    
    // Expected total from matchup (pace × efficiency)
    expected_total_l10: ((homeL10.pace + awayL10.pace) / 2 / 100) *
      (homeL10.offRtg * (awayL10.defRtg / 114.5) + awayL10.offRtg * (homeL10.defRtg / 114.5)),
    
    expected_total_l3: ((homeL3.pace + awayL3.pace) / 2 / 100) *
      (homeL3.offRtg * (awayL3.defRtg / 114.5) + awayL3.offRtg * (homeL3.defRtg / 114.5)),
    
    // Offensive vs defensive matchups
    home_off_vs_away_def: homeL10.offRtg - awayL10.defRtg,
    away_off_vs_home_def: awayL10.offRtg - homeL10.defRtg,
    matchup_offense_sum: homeL10.offRtg + awayL10.offRtg,
    matchup_defense_sum: homeL10.defRtg + awayL10.defRtg,
    
    // Shooting interactions
    efg_sum: homeL10.efg + awayL10.efg,
    efg_diff: homeL10.efg - awayL10.efg,
    ts_sum: homeL10.ts + awayL10.ts,
    
    // Turnover impact (more turnovers = fewer possessions = lower total)
    tov_sum: homeL10.turnovers + awayL10.turnovers,
    tov_diff: homeL10.turnovers - awayL10.turnovers,
    tovPct_avg: (homeL10.tovPct + awayL10.tovPct) / 2,
    
    // Rebounding (offensive rebounds = second chance pts = higher totals)
    orbPct_avg: (homeL10.orbPct + awayL10.orbPct) / 2,
    rebounds_sum: homeL10.rebounds + awayL10.rebounds,
    
    // Free throw impact
    fta_sum: homeL10.fta + awayL10.fta,
    
    // Form divergence (L3 vs L20 — is team trending up or down?)
    home_form_trend: homeL3.ppg - homeL20.ppg,
    away_form_trend: awayL3.ppg - awayL20.ppg,
    home_pace_trend: homeL3.pace - homeL20.pace,
    away_pace_trend: awayL3.pace - awayL20.pace,
    
    // Win percentage interaction (quality matchup proxy)
    winPct_sum: homeL10.winPct + awayL10.winPct,
    winPct_diff: homeL10.winPct - awayL10.winPct,
    
    // Home court
    home_court: 1,
  };

  return { ...l3, ...l10, ...l20, ...interactions };
}

// Also build OLD 18-feature version for comparison
function buildOldFeatures(homeL10, awayL10) {
  return {
    home_l10_fgPct: homeL10.fgPct,
    home_l10_fg3Pct: homeL10.fg3Pct,
    home_l10_ftPct: homeL10.ftPct,
    home_l10_rebounds: homeL10.rebounds,
    home_l10_assists: homeL10.assists,
    home_l10_turnovers: homeL10.turnovers,
    away_l10_fgPct: awayL10.fgPct,
    away_l10_fg3Pct: awayL10.fg3Pct,
    away_l10_ftPct: awayL10.ftPct,
    away_l10_rebounds: awayL10.rebounds,
    away_l10_assists: awayL10.assists,
    away_l10_turnovers: awayL10.turnovers,
    fgPct_diff: homeL10.fgPct - awayL10.fgPct,
    fg3Pct_diff: homeL10.fg3Pct - awayL10.fg3Pct,
    rebounds_diff: homeL10.rebounds - awayL10.rebounds,
    assists_diff: homeL10.assists - awayL10.assists,
    turnovers_diff: awayL10.turnovers - homeL10.turnovers,
    home_court: 1
  };
}


// ═══════════════════════════════════════════════════════════════
// PHASE 2: BUILD FULL DATASET
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
    if (actualTotal < 150 || actualTotal > 350) { skipped++; continue; } // Filter outliers

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
  
  // Verify feature count
  if (dataset.length > 0) {
    const newCount = Object.keys(dataset[0].newFeatures).length;
    const oldCount = Object.keys(dataset[0].oldFeatures).length;
    console.log(`\n  Old model: ${oldCount} features`);
    console.log(`  New model: ${newCount} features`);
    console.log(`  Feature list:`, Object.keys(dataset[0].newFeatures).join(', '));
  }

  return dataset;
}


// ═══════════════════════════════════════════════════════════════
// PHASE 3: MATCH WITH ODDS
// ═══════════════════════════════════════════════════════════════

// ESPN team abbreviation → The Odds API team name mapping
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
    const files = (await fs.readdir(oddsDir)).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(oddsDir, file), 'utf8'));
        const games = data.games || data.data || [];
        
        for (const game of games) {
          const homeTeam = game.home_team || game.homeTeam;
          const dateStr = (game.commence_time || game.date || data.date || '').split('T')[0];
          if (!dateStr || !homeTeam) continue;
          
          // Extract consensus line from bookmakers
          let lines = [];
          const bookmakers = game.bookmakers || [];
          for (const bk of bookmakers) {
            const totalMarket = (bk.markets || []).find(m => m.key === 'totals');
            if (!totalMarket) continue;
            const overOutcome = totalMarket.outcomes?.find(o => o.name === 'Over');
            if (overOutcome?.point) lines.push(overOutcome.point);
          }
          
          // Also check pre-extracted fields
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
    const csv = await fs.readFile(path.join(ROOT, 'data/nba/backtests/nba_totals_backtest_dataset.csv'), 'utf8');
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
            homeTeam: homeTeamName,
            dateStr: row.date
          };
          csvCount++;
        }
        
        // Also try with abbreviation
        const keyAbbr = `${row.date}_${row.home_team}`;
        if (!allOdds[keyAbbr]) {
          allOdds[keyAbbr] = allOdds[key];
        }
      }
    }
    console.log(`  Loaded ${csvCount} additional odds from backtest CSV`);
  } catch {}

  console.log(`  Loaded ${fileCount} odds files, ${gameCount} game odds`);
  console.log(`  Total odds entries: ${Object.keys(allOdds).length}`);
  
  return allOdds;
}

// Build reverse mapping: full name → abbreviation
const REVERSE_TEAM_MAP = {};
for (const [abbr, name] of Object.entries(TEAM_NAME_MAP)) {
  REVERSE_TEAM_MAP[name] = abbr;
}

function matchOdds(dataset, allOdds) {
  let matched = 0;
  let unmatched = 0;
  let unmatchedSamples = [];

  for (const d of dataset) {
    // Try multiple key formats
    const homeTeamName = TEAM_NAME_MAP[d.homeTeam] || d.homeTeam;
    
    // Also try ±1 day for timezone issues (commence_time in UTC can shift date)
    const prevDay = new Date(new Date(d.date).getTime() - 86400000).toISOString().split('T')[0];
    const nextDay = new Date(new Date(d.date).getTime() + 86400000).toISOString().split('T')[0];
    
    const keys = [
      `${d.date}_${homeTeamName}`,
      `${d.date}_${d.homeTeam}`,
      `${prevDay}_${homeTeamName}`,
      `${nextDay}_${homeTeamName}`,
      `${prevDay}_${d.homeTeam}`,
      `${nextDay}_${d.homeTeam}`,
    ];

    let odds = null;
    for (const key of keys) {
      if (allOdds[key]) { odds = allOdds[key]; break; }
    }

    if (odds) {
      d.vegasLine = odds.consensusLine;
      matched++;
    } else {
      unmatched++;
      if (unmatchedSamples.length < 5) {
        unmatchedSamples.push(`${d.date} ${d.homeTeam} (tried: ${homeTeamName})`);
      }
    }
  }

  console.log(`  Matched: ${matched} games with odds`);
  console.log(`  Unmatched: ${unmatched} games without odds`);
  if (unmatchedSamples.length > 0) {
    console.log(`  Sample unmatched:`, unmatchedSamples.join(', '));
  }
  
  return dataset.filter(d => d.vegasLine);
}


// ═══════════════════════════════════════════════════════════════
// PHASE 4: TRAIN ELASTIC NET
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
  // Use higher L1 ratio for more aggressive feature selection
  // Lower alpha to allow more flexibility
  // More epochs for convergence with many features
  
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
      keys.forEach(k => {
        gradients[k] += error * normalized[i][k];
      });
      biasGrad += error;
    }

    const avgLoss = totalLoss / n;
    
    // Save best
    if (avgLoss < bestLoss) {
      bestLoss = avgLoss;
      bestWeights = { ...weights };
      bestBias = bias;
      patience = 0;
    } else {
      patience++;
    }

    // Early stopping
    if (patience > 500) {
      console.log(`    Early stopping at epoch ${epoch} (best loss: ${Math.sqrt(bestLoss).toFixed(2)})`);
      break;
    }

    // Update with elastic net regularization
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
      console.log(`    Epoch ${epoch + 1}: RMSE=${rmse.toFixed(2)}, Non-zero weights: ${nonZero}/${keys.length}`);
    }
  }

  // Use best weights
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
// PHASE 5: WALK-FORWARD BACKTEST
// ═══════════════════════════════════════════════════════════════

function backtestModel(model, testData, featureKey) {
  let totalError = 0;
  const results = [];

  for (const d of testData) {
    const pred = predictWithModel(model, d[featureKey]);
    const edge = pred - d.vegasLine;
    const actual = d.actualTotal;
    const vegasRight = Math.abs(d.vegasLine - actual) < Math.abs(pred - actual);

    results.push({
      date: d.date,
      homeTeam: d.homeTeam,
      awayTeam: d.awayTeam,
      actual,
      vegasLine: d.vegasLine,
      pred,
      edge,
      absEdge: Math.abs(edge),
      modelError: Math.abs(pred - actual),
      vegasError: Math.abs(d.vegasLine - actual),
      pickOver: edge > 0,
      actualOver: actual > d.vegasLine,
      correct: (edge > 0) === (actual > d.vegasLine),
    });

    totalError += Math.abs(pred - actual);
  }

  return {
    mae: totalError / testData.length,
    results,
  };
}

function analyzeROI(results, thresholds = [3, 4, 5, 6, 7, 8]) {
  const analysis = {};

  for (const thresh of thresholds) {
    const qualifying = results.filter(r => r.absEdge >= thresh);
    if (qualifying.length === 0) {
      analysis[`edge_${thresh}`] = { count: 0, roi: 0, winRate: 0 };
      continue;
    }

    // Standard -110 odds
    const wins = qualifying.filter(r => r.correct).length;
    const losses = qualifying.length - wins;
    const profit = wins * 100 - losses * 110;
    const wagered = qualifying.length * 110;
    const roi = wagered > 0 ? (profit / wagered) * 100 : 0;
    const winRate = wins / qualifying.length * 100;

    analysis[`edge_${thresh}`] = {
      count: qualifying.length,
      wins,
      losses,
      profit: profit.toFixed(0),
      wagered: wagered.toFixed(0),
      roi: roi.toFixed(2),
      winRate: winRate.toFixed(1),
    };

    // Over/under split
    const overs = qualifying.filter(r => r.pickOver);
    const unders = qualifying.filter(r => !r.pickOver);
    
    const overWins = overs.filter(r => r.correct).length;
    const overProfit = overWins * 100 - (overs.length - overWins) * 110;
    
    const underWins = unders.filter(r => r.correct).length;
    const underProfit = underWins * 100 - (unders.length - underWins) * 110;

    analysis[`edge_${thresh}`].overs = {
      count: overs.length,
      wins: overWins,
      roi: overs.length > 0 ? ((overProfit / (overs.length * 110)) * 100).toFixed(2) : '0',
      winRate: overs.length > 0 ? (overWins / overs.length * 100).toFixed(1) : '0',
    };
    
    analysis[`edge_${thresh}`].unders = {
      count: unders.length,
      wins: underWins,
      roi: unders.length > 0 ? ((underProfit / (unders.length * 110)) * 100).toFixed(2) : '0',
      winRate: unders.length > 0 ? (underWins / unders.length * 100).toFixed(1) : '0',
    };
  }

  return analysis;
}


// ═══════════════════════════════════════════════════════════════
// PHASE 6: HEAD-TO-HEAD COMPARISON
// ═══════════════════════════════════════════════════════════════

function compareModels(oldResults, newResults) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 6: HEAD-TO-HEAD COMPARISON');
  console.log('═══════════════════════════════════════════════════════\n');

  // Prediction spread comparison (THE KEY METRIC)
  const oldPreds = oldResults.results.map(r => r.pred);
  const newPreds = newResults.results.map(r => r.pred);
  const vegasLines = oldResults.results.map(r => r.vegasLine);
  const actuals = oldResults.results.map(r => r.actual);

  const stats = (arr) => {
    const n = arr.length;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    return { min: Math.min(...arr), max: Math.max(...arr), mean, std, range: Math.max(...arr) - Math.min(...arr) };
  };

  const oldStats = stats(oldPreds);
  const newStats = stats(newPreds);
  const vegasStats = stats(vegasLines);
  const actualStats = stats(actuals);

  console.log('  ┌─────────────────────────────────────────────────────────┐');
  console.log('  │  PREDICTION SPREAD COMPARISON (THE CLUSTERING FIX)     │');
  console.log('  ├─────────────────────────────────────────────────────────┤');
  console.log(`  │  Actuals:     ${actualStats.min.toFixed(0)} → ${actualStats.max.toFixed(0)}  (std: ${actualStats.std.toFixed(1)}, range: ${actualStats.range.toFixed(0)})      │`);
  console.log(`  │  Vegas:       ${vegasStats.min.toFixed(1)} → ${vegasStats.max.toFixed(1)}  (std: ${vegasStats.std.toFixed(1)}, range: ${vegasStats.range.toFixed(1)})     │`);
  console.log(`  │  OLD model:   ${oldStats.min.toFixed(1)} → ${oldStats.max.toFixed(1)}  (std: ${oldStats.std.toFixed(1)}, range: ${oldStats.range.toFixed(1)})     │`);
  console.log(`  │  NEW model:   ${newStats.min.toFixed(1)} → ${newStats.max.toFixed(1)}  (std: ${newStats.std.toFixed(1)}, range: ${newStats.range.toFixed(1)})     │`);
  console.log('  ├─────────────────────────────────────────────────────────┤');
  console.log(`  │  Improvement: ${((newStats.std / oldStats.std - 1) * 100).toFixed(0)}% wider prediction spread            │`);
  console.log(`  │  Vegas coverage: ${(newStats.range / vegasStats.range * 100).toFixed(0)}% (was ${(oldStats.range / vegasStats.range * 100).toFixed(0)}%)                      │`);
  console.log('  └─────────────────────────────────────────────────────────┘');

  // MAE comparison
  console.log('\n  ┌─────────────────────────────────────────────────────────┐');
  console.log('  │  ACCURACY COMPARISON                                    │');
  console.log('  ├─────────────────────────────────────────────────────────┤');
  console.log(`  │  OLD model MAE: ${oldResults.mae.toFixed(2)}                                 │`);
  console.log(`  │  NEW model MAE: ${newResults.mae.toFixed(2)}                                 │`);
  console.log(`  │  Vegas MAE:     ${(oldResults.results.reduce((s, r) => s + r.vegasError, 0) / oldResults.results.length).toFixed(2)}                                 │`);
  const maeChange = newResults.mae - oldResults.mae;
  console.log(`  │  Change:        ${maeChange > 0 ? '+' : ''}${maeChange.toFixed(2)} (${maeChange < 0 ? 'BETTER' : 'WORSE'})                        │`);
  console.log('  └─────────────────────────────────────────────────────────┘');

  // ROI comparison
  const oldROI = analyzeROI(oldResults.results);
  const newROI = analyzeROI(newResults.results);

  console.log('\n  ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('  │  ROI COMPARISON (at various edge thresholds)                          │');
  console.log('  ├─────────────┬──────────┬──────────┬──────────┬──────────┬─────────────┤');
  console.log('  │  Edge       │ OLD bets │ OLD ROI  │ NEW bets │ NEW ROI  │ Winner      │');
  console.log('  ├─────────────┼──────────┼──────────┼──────────┼──────────┼─────────────┤');

  for (const thresh of [3, 4, 5, 6, 7, 8]) {
    const o = oldROI[`edge_${thresh}`];
    const n = newROI[`edge_${thresh}`];
    const winner = parseFloat(n.roi || 0) > parseFloat(o.roi || 0) ? '✅ NEW' : '❌ OLD';
    console.log(`  │  ≥${thresh} pts     │  ${String(o.count).padStart(5)}   │  ${String(o.roi).padStart(6)}% │  ${String(n.count).padStart(5)}   │  ${String(n.roi).padStart(6)}% │ ${winner}       │`);
  }
  console.log('  └─────────────┴──────────┴──────────┴──────────┴──────────┴─────────────┘');

  // Over/under split
  console.log('\n  ┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('  │  OVER/UNDER SPLIT (at edge ≥5)                                               │');
  console.log('  ├──────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬─────────┤');
  console.log('  │  Direction   │ OLD bets │ OLD ROI  │ OLD WR   │ NEW bets │ NEW ROI  │ NEW WR  │');
  console.log('  ├──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼─────────┤');
  
  for (const dir of ['overs', 'unders']) {
    const o = oldROI['edge_5']?.[dir] || { count: 0, roi: '0', winRate: '0' };
    const n = newROI['edge_5']?.[dir] || { count: 0, roi: '0', winRate: '0' };
    console.log(`  │  ${dir.padEnd(12)} │  ${String(o.count).padStart(5)}   │  ${String(o.roi).padStart(6)}% │  ${String(o.winRate).padStart(5)}% │  ${String(n.count).padStart(5)}   │  ${String(n.roi).padStart(6)}% │ ${String(n.winRate).padStart(5)}% │`);
  }
  console.log('  └──────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴─────────┘');

  // Edge ≥6 detail (our best strategy from backtest)
  console.log('\n  ┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('  │  OVER/UNDER SPLIT (at edge ≥6) — BEST STRATEGY ZONE                         │');
  console.log('  ├──────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬─────────┤');
  console.log('  │  Direction   │ OLD bets │ OLD ROI  │ OLD WR   │ NEW bets │ NEW ROI  │ NEW WR  │');
  console.log('  ├──────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼─────────┤');
  
  for (const dir of ['overs', 'unders']) {
    const o = oldROI['edge_6']?.[dir] || { count: 0, roi: '0', winRate: '0' };
    const n = newROI['edge_6']?.[dir] || { count: 0, roi: '0', winRate: '0' };
    console.log(`  │  ${dir.padEnd(12)} │  ${String(o.count).padStart(5)}   │  ${String(o.roi).padStart(6)}% │  ${String(o.winRate).padStart(5)}% │  ${String(n.count).padStart(5)}   │  ${String(n.roi).padStart(6)}% │ ${String(n.winRate).padStart(5)}% │`);
  }
  console.log('  └──────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴─────────┘');

  // Correlation with Vegas by bucket  
  console.log('\n  ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('  │  PREDICTION vs VEGAS LINE TRACKING (does model follow the game?)    │');
  console.log('  ├───────────┬────────┬───────────────┬───────────────┬─────────────────┤');
  console.log('  │  Vegas    │ Games  │ OLD avg pred  │ NEW avg pred  │ Improvement     │');
  console.log('  ├───────────┼────────┼───────────────┼───────────────┼─────────────────┤');

  const buckets = {};
  for (let i = 0; i < oldResults.results.length; i++) {
    const vl = oldResults.results[i].vegasLine;
    const bucket = Math.floor(vl / 5) * 5;
    if (!buckets[bucket]) buckets[bucket] = { old: [], new: [], vegas: [], count: 0 };
    buckets[bucket].old.push(oldResults.results[i].pred);
    buckets[bucket].new.push(newResults.results[i].pred);
    buckets[bucket].vegas.push(vl);
    buckets[bucket].count++;
  }

  for (const bucket of Object.keys(buckets).map(Number).sort((a, b) => a - b)) {
    const b = buckets[bucket];
    if (b.count < 5) continue;
    const avgOld = b.old.reduce((a, c) => a + c, 0) / b.count;
    const avgNew = b.new.reduce((a, c) => a + c, 0) / b.count;
    const avgVegas = b.vegas.reduce((a, c) => a + c, 0) / b.count;
    const oldDist = Math.abs(avgOld - avgVegas);
    const newDist = Math.abs(avgNew - avgVegas);
    const improved = newDist < oldDist ? '✅ closer' : '❌ further';
    console.log(`  │  ${bucket}-${bucket + 5}   │  ${String(b.count).padStart(4)}  │    ${avgOld.toFixed(1).padStart(6)}     │    ${avgNew.toFixed(1).padStart(6)}     │ ${improved.padEnd(15)} │`);
  }
  console.log('  └───────────┴────────┴───────────────┴───────────────┴─────────────────┘');

  return { oldROI, newROI, oldStats, newStats, vegasStats, actualStats };
}


// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   NBA TOTALS MODEL V3 - MULTI-WINDOW ARCHITECTURE          ║');
  console.log('║   Fix the clustering problem: 2.2 std → target 6+ std      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Phase 1: Load games
  const allGames = await loadAllGames();

  // Phase 2: Build features
  const dataset = await buildDataset(allGames);

  // Phase 3: Match with odds
  const allOdds = await loadAllOdds();
  const withOdds = matchOdds(dataset, allOdds);

  // TRAINING: Use ALL games (no odds needed for training — target = actual_total)
  // TESTING: Use odds-matched games for ROI calculation
  // Split: train before 2024-10-01 (2022-23 + 2023-24), test from 2024-10-01+ (2024-25 + 2025-26)
  // This gives ~2,700 training games and ~1,500+ test games with odds
  const trainCutoff = '2024-10-01';
  const trainData = dataset.filter(d => d.date < trainCutoff);
  const testData = withOdds.filter(d => d.date >= trainCutoff);
  
  // Also get odds-matched training data for a secondary comparison
  const trainWithOdds = withOdds.filter(d => d.date < trainCutoff);

  console.log(`\n  Train/test split at ${trainCutoff}:`);
  console.log(`    Train: ${trainData.length} games (ALL data, no odds required)`);
  if (trainData.length > 0) {
    console.log(`    Train range: ${trainData[0]?.date} → ${trainData[trainData.length - 1]?.date}`);
    console.log(`    (of which ${trainWithOdds.length} have odds for validation)`);
  }
  console.log(`    Test:  ${testData.length} games (odds-matched for ROI testing)`);
  if (testData.length > 0) {
    console.log(`    Test range: ${testData[0]?.date} → ${testData[testData.length - 1]?.date}`);
  }

  if (trainData.length < 500 || testData.length < 100) {
    console.error('\n  ❌ Not enough data for train/test split!');
    process.exit(1);
  }

  // Phase 4: Train both models
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 4: TRAIN MODELS');
  console.log('═══════════════════════════════════════════════════════\n');

  // Train OLD model (18 features)
  console.log('  Training OLD model (18 features, L10 only)...');
  const oldTrainX = trainData.map(d => d.oldFeatures);
  const oldTrainY = trainData.map(d => d.actualTotal);
  const oldModel = trainElasticNet(oldTrainX, oldTrainY, 0.01, 0.5, 0.001, 3000);
  
  // Train NEW model (multi-window)
  console.log('\n  Training NEW model (multi-window, ~70 features)...');
  const newTrainX = trainData.map(d => d.newFeatures);
  const newTrainY = trainData.map(d => d.actualTotal);
  const newModel = trainElasticNet(newTrainX, newTrainY, 0.005, 0.7, 0.0003, 8000);

  // Show feature importance
  const newWeights = Object.entries(newModel.weights)
    .map(([k, w]) => ({ feature: k, weight: w, absWeight: Math.abs(w) }))
    .sort((a, b) => b.absWeight - a.absWeight);
  
  console.log('\n  TOP 20 FEATURES (new model):');
  console.log('  ' + '─'.repeat(50));
  for (const f of newWeights.slice(0, 20)) {
    const dir = f.weight > 0 ? '↑' : '↓';
    console.log(`    ${dir} ${f.feature.padEnd(30)} ${f.weight > 0 ? '+' : ''}${f.weight.toFixed(4)}`);
  }
  
  const deadFeatures = newWeights.filter(f => f.absWeight < 0.01).length;
  console.log(`\n  Active features: ${newWeights.length - deadFeatures}/${newWeights.length} (${deadFeatures} pruned by L1)`);

  // Phase 5: Backtest both
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 5: WALK-FORWARD BACKTEST');
  console.log('═══════════════════════════════════════════════════════\n');

  const oldBacktest = backtestModel(oldModel, testData, 'oldFeatures');
  const newBacktest = backtestModel(newModel, testData, 'newFeatures');

  console.log(`  OLD model: MAE = ${oldBacktest.mae.toFixed(2)} on ${testData.length} test games`);
  console.log(`  NEW model: MAE = ${newBacktest.mae.toFixed(2)} on ${testData.length} test games`);

  // Phase 6: Compare
  const comparison = compareModels(oldBacktest, newBacktest);

  // Save the new model if it's better
  const modelsDir = path.join(ROOT, 'data/nba/models');
  if (!existsSync(modelsDir)) mkdirSync(modelsDir, { recursive: true });
  
  writeFileSync(
    path.join(modelsDir, 'totals_model_v3_multiwindow.json'),
    JSON.stringify(newModel, null, 2)
  );
  console.log('\n  ✅ New model saved to data/nba/models/totals_model_v3_multiwindow.json');
  
  // Save comparison results
  writeFileSync(
    path.join(modelsDir, 'totals_v3_comparison_results.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      trainSize: trainData.length,
      testSize: testData.length,
      trainCutoff,
      oldModel: {
        features: Object.keys(oldModel.weights).length,
        mae: oldBacktest.mae,
        predictionSpread: comparison.oldStats,
      },
      newModel: {
        features: Object.keys(newModel.weights).length,
        mae: newBacktest.mae,
        predictionSpread: comparison.newStats,
        topFeatures: newWeights.slice(0, 20).map(f => ({ feature: f.feature, weight: f.weight })),
      },
      roiComparison: {
        old: comparison.oldROI,
        new: comparison.newROI,
      },
    }, null, 2)
  );
  console.log('  ✅ Comparison results saved to data/nba/models/totals_v3_comparison_results.json');

  // Final verdict
  const spreadImproved = comparison.newStats.std > comparison.oldStats.std;
  const maeImproved = newBacktest.mae < oldBacktest.mae;
  const roiAt5 = parseFloat(comparison.newROI['edge_5']?.roi || 0);
  const oldRoiAt5 = parseFloat(comparison.oldROI['edge_5']?.roi || 0);
  const roiImproved = roiAt5 > oldRoiAt5;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL VERDICT                             ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Prediction spread: ${spreadImproved ? '✅ WIDER' : '❌ SAME/NARROWER'} (${comparison.oldStats.std.toFixed(1)} → ${comparison.newStats.std.toFixed(1)} std)          ║`);
  console.log(`║  Accuracy (MAE):    ${maeImproved ? '✅ BETTER' : '❌ WORSE'} (${oldBacktest.mae.toFixed(2)} → ${newBacktest.mae.toFixed(2)})                ║`);
  console.log(`║  ROI @ ≥5 edge:     ${roiImproved ? '✅ BETTER' : '❌ WORSE'} (${oldRoiAt5.toFixed(1)}% → ${roiAt5.toFixed(1)}%)                     ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  if (spreadImproved && (roiImproved || maeImproved)) {
    console.log('║  🎯 RECOMMENDATION: DEPLOY NEW MODEL                        ║');
  } else if (spreadImproved) {
    console.log('║  ⚠️  SPREAD IMPROVED but ROI didn\'t — needs tuning          ║');
  } else {
    console.log('║  ❌ NO IMPROVEMENT — back to drawing board                  ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
