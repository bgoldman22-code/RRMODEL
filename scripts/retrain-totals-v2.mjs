#!/usr/bin/env node

/**
 * NBA Totals Model V2 - Retrain with Pace/OffRtg/DefRtg
 * 
 * PIPELINE:
 *   Phase 1: Collect missing game data (ESPN) - Nov 24 2025 → Mar 8 2026
 *   Phase 2: Collect missing historical odds (The Odds API)
 *   Phase 3: Rebuild training dataset with NEW features (pace, offRtg, defRtg)
 *   Phase 4: Train OLD (18 features) vs NEW (28+ features) model
 *   Phase 5: Walk-forward backtest both against historical odds
 *   Phase 6: Head-to-head comparison (MAE, ROI, CLV)
 */

import fs from 'fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const ODDS_API_KEY = process.env.ODDS_API_KEY || 'SET_ODDS_API_KEY_ENV_VAR';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

// ═══════════════════════════════════════════════════════════════
// PHASE 1: COLLECT MISSING GAME DATA
// ═══════════════════════════════════════════════════════════════

function generateDateRange(start, end) {
  const dates = [];
  const d = new Date(start);
  const endDate = new Date(end);
  while (d <= endDate) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

async function fetchGamesForDate(date) {
  const dateStr = date.replace(/-/g, '');
  const url = `${ESPN_BASE}/scoreboard?dates=${dateStr}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    const games = [];
    
    for (const event of data.events || []) {
      const competition = event.competitions[0];
      if (!competition.status.type.completed) continue;
      
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
      const homeStats = homeTeam.statistics || [];
      const awayStats = awayTeam.statistics || [];
      
      games.push({
        gameId: event.id,
        date: event.date.split('T')[0],
        season: '2025-26',
        homeTeamId: parseInt(homeTeam.team.id),
        homeTeam: homeTeam.team.abbreviation,
        homeTeamName: homeTeam.team.displayName,
        awayTeamId: parseInt(awayTeam.team.id),
        awayTeam: awayTeam.team.abbreviation,
        awayTeamName: awayTeam.team.displayName,
        homeScore: parseInt(homeTeam.score),
        awayScore: parseInt(awayTeam.score),
        homeStats: parseTeamStats(homeStats),
        awayStats: parseTeamStats(awayStats),
        venue: competition.venue?.fullName || 'Unknown',
        attendance: competition.attendance || null
      });
    }
    return games;
  } catch (error) {
    console.error(`  Error fetching ${date}:`, error.message);
    return [];
  }
}

function parseTeamStats(statsArray) {
  const stats = {};
  for (const stat of statsArray) {
    const name = stat.name;
    if (name === 'fieldGoalsMade-fieldGoalsAttempted') {
      const [made, attempted] = stat.displayValue.split('-').map(Number);
      stats.fgm = made; stats.fga = attempted;
      stats.fgPct = attempted > 0 ? made / attempted : 0;
    } else if (name === 'threePointFieldGoalsMade-threePointFieldGoalsAttempted') {
      const [made, attempted] = stat.displayValue.split('-').map(Number);
      stats.fg3m = made; stats.fg3a = attempted;
      stats.fg3Pct = attempted > 0 ? made / attempted : 0;
    } else if (name === 'freeThrowsMade-freeThrowsAttempted') {
      const [made, attempted] = stat.displayValue.split('-').map(Number);
      stats.ftm = made; stats.fta = attempted;
      stats.ftPct = attempted > 0 ? made / attempted : 0;
    } else if (name === 'totalRebounds') stats.rebounds = parseFloat(stat.displayValue);
    else if (name === 'offensiveRebounds') stats.offRebounds = parseFloat(stat.displayValue);
    else if (name === 'defensiveRebounds') stats.defRebounds = parseFloat(stat.displayValue);
    else if (name === 'assists') stats.assists = parseFloat(stat.displayValue);
    else if (name === 'steals') stats.steals = parseFloat(stat.displayValue);
    else if (name === 'blocks') stats.blocks = parseFloat(stat.displayValue);
    else if (name === 'turnovers' || name === 'totalTurnovers') stats.turnovers = parseFloat(stat.displayValue);
    else if (name === 'fouls' || name === 'technicalFouls') stats.fouls = parseFloat(stat.displayValue);
  }
  return stats;
}

async function collectMissingGames() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 1: COLLECT MISSING GAME DATA (ESPN)');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Load existing 2025-26 data
  const existingPath = path.join(ROOT, 'data/nba/games/nba_api/games_2025_26_nba_api.json');
  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile(existingPath, 'utf8'));
  } catch {}
  
  const existingDates = new Set(existing.map(g => g.date));
  const lastDate = existing.length > 0 
    ? existing.map(g => g.date).sort().pop() 
    : '2025-11-23';
  
  console.log(`  Existing: ${existing.length} games through ${lastDate}`);
  
  // Collect from day after last existing through Mar 8, 2026
  const startDate = new Date(lastDate);
  startDate.setDate(startDate.getDate() + 1);
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = '2026-03-08';
  
  const dates = generateDateRange(startStr, endStr);
  console.log(`  Collecting: ${startStr} to ${endStr} (${dates.length} days)\n`);
  
  const newGames = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (existingDates.has(date)) continue;
    
    const dayGames = await fetchGamesForDate(date);
    newGames.push(...dayGames);
    
    if ((i + 1) % 10 === 0 || i === dates.length - 1) {
      process.stdout.write(`\r  Progress: ${i + 1}/${dates.length} days — ${newGames.length} new games`);
    }
    
    // Rate limit: 200ms between ESPN requests
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n\n  ✅ Collected ${newGames.length} new games`);
  
  // Merge and save
  const merged = [...existing, ...newGames];
  merged.sort((a, b) => a.date.localeCompare(b.date));
  
  // Deduplicate by gameId
  const seen = new Set();
  const deduped = merged.filter(g => {
    if (seen.has(g.gameId)) return false;
    seen.add(g.gameId);
    return true;
  });
  
  const outputPath = path.join(ROOT, 'data/nba/games/games_2025_26_extended.json');
  await fs.writeFile(outputPath, JSON.stringify(deduped, null, 2));
  console.log(`  💾 Saved ${deduped.length} total games to games_2025_26_extended.json`);
  
  return deduped;
}


// ═══════════════════════════════════════════════════════════════
// PHASE 2: COLLECT MISSING HISTORICAL ODDS
// ═══════════════════════════════════════════════════════════════

async function fetchHistoricalOdds(dateStr) {
  // The Odds API historical endpoint - use noon ET as snapshot time
  const timestamp = `${dateStr}T17:00:00Z`; // noon ET = 17:00 UTC
  const url = `https://api.the-odds-api.com/v4/historical/sports/basketball_nba/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=totals,spreads,h2h&oddsFormat=american&bookmakers=fanduel,draftkings,betmgm&date=${timestamp}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 422) return null; // No data for this date
      console.error(`  API ${response.status} for ${dateStr}: ${text.substring(0, 100)}`);
      return null;
    }
    
    const result = await response.json();
    const remaining = response.headers.get('x-requests-remaining');
    if (remaining && parseInt(remaining) % 50 === 0) {
      console.log(`    [API quota: ${remaining} remaining]`);
    }
    
    return result;
  } catch (error) {
    console.error(`  Error fetching odds for ${dateStr}:`, error.message);
    return null;
  }
}

function processHistoricalOdds(apiResult) {
  if (!apiResult || !apiResult.data) return [];
  
  const games = [];
  for (const event of apiResult.data) {
    const game = {
      event_id: event.id,
      home_team: event.home_team,
      away_team: event.away_team,
      commence_time: event.commence_time,
      bookmakers: { spreads: {}, totals: {}, h2h: {} },
      consensus: {}
    };
    
    for (const book of event.bookmakers || []) {
      for (const market of book.markets || []) {
        if (market.key === 'totals') {
          const over = market.outcomes.find(o => o.name === 'Over');
          const under = market.outcomes.find(o => o.name === 'Under');
          if (over && under) {
            game.bookmakers.totals[book.key] = {
              line: over.point,
              over_price: over.price,
              under_price: under.price
            };
          }
        } else if (market.key === 'spreads') {
          const home = market.outcomes.find(o => o.name === event.home_team);
          const away = market.outcomes.find(o => o.name === event.away_team);
          if (home && away) {
            game.bookmakers.spreads[book.key] = {
              home_line: home.point,
              home_price: home.price,
              away_line: away.point,
              away_price: away.price
            };
          }
        } else if (market.key === 'h2h') {
          const home = market.outcomes.find(o => o.name === event.home_team);
          const away = market.outcomes.find(o => o.name === event.away_team);
          if (home && away) {
            game.bookmakers.h2h[book.key] = {
              home_price: home.price,
              away_price: away.price
            };
          }
        }
      }
    }
    
    // Compute consensus total
    const totalLines = Object.values(game.bookmakers.totals).map(b => b.line).filter(Boolean);
    game.consensus.totals = {
      line: totalLines.length > 0 ? totalLines.reduce((a, b) => a + b, 0) / totalLines.length : null
    };
    
    games.push(game);
  }
  
  return games;
}

async function collectMissingOdds() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 2: COLLECT MISSING HISTORICAL ODDS');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const oddsDir = path.join(ROOT, 'data/nba/historical_odds/game_totals');
  
  // Find last existing odds date
  const existingFiles = (await fs.readdir(oddsDir)).filter(f => f.startsWith('game_totals_'));
  const existingDates = new Set(existingFiles.map(f => {
    const m = f.match(/game_totals_(\d{8})/);
    return m ? `${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6,8)}` : null;
  }).filter(Boolean));
  
  const lastOddsDate = [...existingDates].sort().pop() || '2025-11-22';
  console.log(`  Existing odds through: ${lastOddsDate} (${existingDates.size} files)`);
  
  // Generate dates we need
  const startDate = new Date(lastOddsDate);
  startDate.setDate(startDate.getDate() + 1);
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = '2026-03-08';
  
  const allDates = generateDateRange(startStr, endStr);
  const datesToFetch = allDates.filter(d => !existingDates.has(d));
  
  console.log(`  Need to fetch: ${datesToFetch.length} dates (${startStr} to ${endStr})`);
  console.log(`  ⚠️  This will use ~${datesToFetch.length} API requests\n`);
  
  const allOdds = {};
  let fetched = 0;
  let gamesFound = 0;
  
  for (const date of datesToFetch) {
    const result = await fetchHistoricalOdds(date);
    
    if (result && result.data && result.data.length > 0) {
      const games = processHistoricalOdds(result);
      allOdds[date] = games;
      gamesFound += games.length;
      
      // Save individual file (matching existing format)
      const dateCompact = date.replace(/-/g, '');
      const filePath = path.join(oddsDir, `game_totals_${dateCompact}_v1.json`);
      const fileData = {
        date,
        fetched_at: new Date().toISOString(),
        source: 'the-odds-api-historical',
        bookmakers: ['fanduel', 'draftkings', 'betmgm'],
        markets: ['spreads', 'totals', 'h2h'],
        games
      };
      await fs.writeFile(filePath, JSON.stringify(fileData, null, 2));
    }
    
    fetched++;
    if (fetched % 10 === 0 || fetched === datesToFetch.length) {
      process.stdout.write(`\r  Progress: ${fetched}/${datesToFetch.length} dates — ${gamesFound} games with odds`);
    }
    
    // Rate limit: 500ms between requests (The Odds API is slower)
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n\n  ✅ Collected odds for ${Object.keys(allOdds).length} dates, ${gamesFound} total games`);
  return allOdds;
}


// ═══════════════════════════════════════════════════════════════
// PHASE 3: BUILD ENHANCED TRAINING DATASET
// ═══════════════════════════════════════════════════════════════

function computeAdvancedStats(teamStats, oppStats, teamScore, oppScore) {
  // Possessions estimate (standard four-factors formula)
  const poss = (teamStats.fga + 0.44 * teamStats.fta - (teamStats.offRebounds || 0) + teamStats.turnovers +
                oppStats.fga + 0.44 * oppStats.fta - (oppStats.offRebounds || 0) + oppStats.turnovers) / 2;
  
  const pace = poss > 0 ? (poss / 48) * 48 : 100;  // per 48 min
  const offRtg = poss > 0 ? (teamScore / poss) * 100 : 114.5;
  const defRtg = poss > 0 ? (oppScore / poss) * 100 : 114.5;
  
  return { pace, offRtg, defRtg, netRtg: offRtg - defRtg };
}

function computeRollingStats(allGames, teamId, beforeDate, lookback = 10) {
  // Get this team's games before the given date
  const teamGames = allGames
    .filter(g => g.date < beforeDate && 
            (g.homeTeamId === teamId || g.awayTeamId === teamId) &&
            g.homeScore > 0 && g.awayScore > 0)
    .slice(-lookback);
  
  if (teamGames.length < 3) return null; // Need at least 3 games
  
  const stats = {
    pace: 0, offRtg: 0, defRtg: 0, netRtg: 0,
    fgPct: 0, fg3Pct: 0, ftPct: 0,
    rebounds: 0, assists: 0, turnovers: 0,
    ppg: 0, oppPpg: 0,
    games: teamGames.length
  };
  
  for (const game of teamGames) {
    const isHome = game.homeTeamId === teamId;
    const ts = isHome ? game.homeStats : game.awayStats;
    const os = isHome ? game.awayStats : game.homeStats;
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const oppScore = isHome ? game.awayScore : game.homeScore;
    
    if (!ts || !os || !ts.fga || !os.fga) continue;
    
    const adv = computeAdvancedStats(ts, os, teamScore, oppScore);
    stats.pace += adv.pace;
    stats.offRtg += adv.offRtg;
    stats.defRtg += adv.defRtg;
    
    stats.fgPct += ts.fgPct || (ts.fga > 0 ? ts.fgm / ts.fga : 0.47);
    stats.fg3Pct += ts.fg3a > 0 ? (ts.fg3m / ts.fg3a) : 0.36;
    stats.ftPct += ts.fta > 0 ? (ts.ftm / ts.fta) : 0.78;
    stats.rebounds += ts.rebounds || ((ts.offRebounds || 0) + (ts.defRebounds || 0));
    stats.assists += ts.assists || 0;
    stats.turnovers += ts.turnovers || 0;
    stats.ppg += teamScore;
    stats.oppPpg += oppScore;
  }
  
  const n = stats.games;
  if (n === 0) return null;
  
  // Average everything
  for (const key of Object.keys(stats)) {
    if (key !== 'games') stats[key] /= n;
  }
  stats.netRtg = stats.offRtg - stats.defRtg;
  
  return stats;
}

function buildOldFeatures(homeL10, awayL10) {
  // Exact same 18 features as current TOTAL_MODEL
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

function buildNewFeatures(homeL10, awayL10) {
  // 18 old features + 10 new pace/efficiency features = 28 total
  const old = buildOldFeatures(homeL10, awayL10);
  
  return {
    ...old,
    
    // NEW: Pace features (the biggest missing piece)
    home_l10_pace: homeL10.pace,
    away_l10_pace: awayL10.pace,
    pace_avg: (homeL10.pace + awayL10.pace) / 2,
    pace_diff: homeL10.pace - awayL10.pace,
    
    // NEW: Offensive/Defensive efficiency
    home_l10_offRtg: homeL10.offRtg,
    home_l10_defRtg: homeL10.defRtg,
    away_l10_offRtg: awayL10.offRtg,
    away_l10_defRtg: awayL10.defRtg,
    
    // NEW: Matchup-adjusted expected total (pace × efficiency)
    expected_total: (homeL10.offRtg * (awayL10.defRtg / 114.5) * ((homeL10.pace + awayL10.pace) / 2 / 100)) +
                    (awayL10.offRtg * (homeL10.defRtg / 114.5) * ((homeL10.pace + awayL10.pace) / 2 / 100)),
    
    // NEW: PPG sum (simple but strong signal)
    ppg_sum: homeL10.ppg + awayL10.ppg
  };
}

async function buildDataset() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 3: BUILD ENHANCED TRAINING DATASET');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Load all game data
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
      // Filter to regular season games with scores
      const valid = data.filter(g => 
        g.homeScore > 0 && g.awayScore > 0 && 
        g.homeStats?.fga > 0 && g.awayStats?.fga > 0
      );
      allGames.push(...valid);
      console.log(`  ${label}: ${valid.length} valid games loaded`);
    } catch (e) {
      console.log(`  ${label}: SKIPPED (${e.message})`);
    }
  }
  
  // Sort by date
  allGames.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`\n  Total: ${allGames.length} games across all seasons\n`);
  
  // Build features for each game
  const dataset = [];
  let skipped = 0;
  
  for (let i = 0; i < allGames.length; i++) {
    const game = allGames[i];
    
    const homeL10 = computeRollingStats(allGames, game.homeTeamId, game.date, 10);
    const awayL10 = computeRollingStats(allGames, game.awayTeamId, game.date, 10);
    
    if (!homeL10 || !awayL10) {
      skipped++;
      continue;
    }
    
    const actualTotal = game.homeScore + game.awayScore;
    
    dataset.push({
      // Metadata
      date: game.date,
      gameId: game.gameId,
      homeTeam: game.homeTeam || game.homeTeamName,
      awayTeam: game.awayTeam || game.awayTeamName,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      actualTotal,
      
      // Features
      oldFeatures: buildOldFeatures(homeL10, awayL10),
      newFeatures: buildNewFeatures(homeL10, awayL10),
    });
    
    if ((i + 1) % 500 === 0) {
      process.stdout.write(`\r  Building features: ${i + 1}/${allGames.length} (${dataset.length} valid, ${skipped} skipped)`);
    }
  }
  
  console.log(`\r  ✅ Built ${dataset.length} samples (${skipped} skipped for insufficient history)\n`);
  
  return { dataset, allGames };
}


// ═══════════════════════════════════════════════════════════════
// PHASE 4: TRAIN OLD vs NEW MODEL
// ═══════════════════════════════════════════════════════════════

function normalizeFeatures(X) {
  const keys = Object.keys(X[0]);
  const means = {};
  const stds = {};
  
  keys.forEach(key => {
    const vals = X.map(x => x[key]).filter(Number.isFinite);
    means[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((sum, v) => sum + (v - means[key]) ** 2, 0) / vals.length;
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

function trainElasticNet(X, y, alpha = 0.01, l1Ratio = 0.5, lr = 0.001, epochs = 3000) {
  const n = X.length;
  const keys = Object.keys(X[0]);
  const { normalized, means, stds } = normalizeFeatures(X);
  
  const weights = {};
  keys.forEach(k => weights[k] = 0);
  let bias = y.reduce((a, b) => a + b, 0) / n; // Initialize bias to mean
  
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradients = {};
    keys.forEach(k => gradients[k] = 0);
    let biasGrad = 0;
    
    for (let i = 0; i < n; i++) {
      let pred = bias;
      keys.forEach(k => { pred += weights[k] * normalized[i][k]; });
      
      const error = pred - y[i];
      keys.forEach(k => {
        gradients[k] += error * normalized[i][k];
      });
      biasGrad += error;
    }
    
    // Update with elastic net regularization
    keys.forEach(k => {
      const grad = gradients[k] / n;
      const l1 = alpha * l1Ratio * Math.sign(weights[k]);
      const l2 = alpha * (1 - l1Ratio) * weights[k];
      weights[k] -= lr * (grad + l1 + l2);
    });
    bias -= (lr / n) * biasGrad;
  }
  
  return { weights, bias, means, stds, type: 'elastic_net' };
}

function predictWithModel(model, features) {
  let pred = model.bias;
  for (const [key, weight] of Object.entries(model.weights)) {
    if (!(key in features)) continue;
    const val = features[key];
    if (!Number.isFinite(val)) continue;
    const mean = model.means[key] ?? 0;
    const std = model.stds[key] ?? 1;
    pred += weight * ((val - mean) / std);
  }
  return pred;
}

function evaluateModel(model, testData, featureKey) {
  let totalError = 0;
  let totalSqError = 0;
  const preds = [];
  
  for (const d of testData) {
    const pred = predictWithModel(model, d[featureKey]);
    const error = Math.abs(pred - d.actualTotal);
    totalError += error;
    totalSqError += error * error;
    preds.push({ pred, actual: d.actualTotal, error, date: d.date, homeTeam: d.homeTeam, awayTeam: d.awayTeam });
  }
  
  const mae = totalError / testData.length;
  const rmse = Math.sqrt(totalSqError / testData.length);
  
  return { mae, rmse, preds };
}


// ═══════════════════════════════════════════════════════════════
// PHASE 5: WALK-FORWARD BACKTEST AGAINST ODDS
// ═══════════════════════════════════════════════════════════════

async function loadAllOdds() {
  const oddsDir = path.join(ROOT, 'data/nba/historical_odds/game_totals');
  const files = (await fs.readdir(oddsDir)).filter(f => f.startsWith('game_totals_') && f.endsWith('_v1.json'));
  
  const allOdds = {};
  
  for (const file of files) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(oddsDir, file), 'utf8'));
      for (const game of (data.games || [])) {
        // Key by commence_time for matching
        const dateStr = game.commence_time?.split('T')[0] || data.date;
        const key = `${dateStr}_${game.home_team}`;
        allOdds[key] = game;
      }
    } catch {}
  }
  
  // Also load from backtest CSV (has pre-matched odds for 2024-25 + early 2025-26)
  try {
    const csv = await fs.readFile(path.join(ROOT, 'data/nba/backtests/nba_totals_backtest_dataset.csv'), 'utf8');
    const lines = csv.split('\n');
    const headers = lines[0].split(',');
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const vals = lines[i].split(',');
      const row = {};
      headers.forEach((h, idx) => row[h] = vals[idx]);
      
      if (row.market_total_line_consensus) {
        const key = `${row.date}_${row.home_team}`;
        if (!allOdds[key]) {
          allOdds[key] = {
            _fromCSV: true,
            home_team: row.home_team,
            away_team: row.away_team,
            consensus_line: parseFloat(row.market_total_line_consensus),
            fanduel: row.fanduel_total_line ? {
              line: parseFloat(row.fanduel_total_line),
              over_price: parseFloat(row.fanduel_over_price),
              under_price: parseFloat(row.fanduel_under_price)
            } : null,
            draftkings: row.draftkings_total_line ? {
              line: parseFloat(row.draftkings_total_line),
              over_price: parseFloat(row.draftkings_over_price),
              under_price: parseFloat(row.draftkings_under_price)
            } : null,
            betmgm: row.betmgm_total_line ? {
              line: parseFloat(row.betmgm_total_line),
              over_price: parseFloat(row.betmgm_over_price),
              under_price: parseFloat(row.betmgm_under_price)
            } : null
          };
        }
      }
    }
  } catch {}
  
  return allOdds;
}

// Team name mapping (ESPN abbreviation ↔ The Odds API full names)
const TEAM_NAME_MAP = {
  'ATL': 'Atlanta Hawks', 'BOS': 'Boston Celtics', 'BKN': 'Brooklyn Nets',
  'CHA': 'Charlotte Hornets', 'CHI': 'Chicago Bulls', 'CLE': 'Cleveland Cavaliers',
  'DAL': 'Dallas Mavericks', 'DEN': 'Denver Nuggets', 'DET': 'Detroit Pistons',
  'GS': 'Golden State Warriors', 'GSW': 'Golden State Warriors',
  'HOU': 'Houston Rockets', 'IND': 'Indiana Pacers',
  'LAC': 'Los Angeles Clippers', 'LA': 'LA Clippers',
  'LAL': 'Los Angeles Lakers',
  'MEM': 'Memphis Grizzlies', 'MIA': 'Miami Heat', 'MIL': 'Milwaukee Bucks',
  'MIN': 'Minnesota Timberwolves', 'NOP': 'New Orleans Pelicans', 'NO': 'New Orleans Pelicans',
  'NYK': 'New York Knicks', 'NY': 'New York Knicks',
  'OKC': 'Oklahoma City Thunder', 'ORL': 'Orlando Magic',
  'PHI': 'Philadelphia 76ers', 'PHX': 'Phoenix Suns', 'POR': 'Portland Trail Blazers',
  'SAC': 'Sacramento Kings', 'SAS': 'San Antonio Spurs', 'SA': 'San Antonio Spurs',
  'TOR': 'Toronto Raptors', 'UTA': 'Utah Jazz', 'UTAH': 'Utah Jazz',
  'WAS': 'Washington Wizards', 'WSH': 'Washington Wizards'
};

function getConsensusLine(oddsEntry) {
  if (!oddsEntry) return null;
  
  // From CSV format
  if (oddsEntry._fromCSV) return oddsEntry.consensus_line;
  
  // From JSON format
  if (oddsEntry.consensus?.totals?.line) return oddsEntry.consensus.totals.line;
  
  // Compute from bookmakers
  const lines = [];
  for (const book of ['fanduel', 'draftkings', 'betmgm']) {
    const bm = oddsEntry.bookmakers?.totals?.[book];
    if (bm?.line) lines.push(bm.line);
  }
  
  return lines.length > 0 ? lines.reduce((a, b) => a + b, 0) / lines.length : null;
}

function simulateBet(modelPred, vegasLine, actualTotal, edgeThreshold = 4) {
  const edge = Math.abs(modelPred - vegasLine);
  if (edge < edgeThreshold) return null; // No bet
  
  const pickOver = modelPred > vegasLine;
  const won = pickOver ? actualTotal > vegasLine : actualTotal < vegasLine;
  const push = actualTotal === vegasLine;
  
  if (push) return { bet: true, won: false, push: true, pnl: 0, pickOver, edge, vegasLine, modelPred };
  
  // Assume -110 juice
  const pnl = won ? 100 : -110;
  
  return { bet: true, won, push: false, pnl, pickOver, edge, vegasLine, modelPred };
}

async function backtestModels(oldModel, newModel, dataset) {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 5: WALK-FORWARD BACKTEST AGAINST ODDS');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Load all odds
  const allOdds = await loadAllOdds();
  console.log(`  Loaded ${Object.keys(allOdds).length} games with odds\n`);
  
  const results = { old: [], new: [] };
  let matched = 0, unmatched = 0;
  
  for (const d of dataset) {
    // Try to find odds for this game
    const homeFullName = TEAM_NAME_MAP[d.homeTeam] || d.homeTeam;
    const key = `${d.date}_${homeFullName}`;
    
    // Also try alternate keys
    let oddsEntry = allOdds[key];
    if (!oddsEntry) {
      // Try all keys for this date
      const dateKeys = Object.keys(allOdds).filter(k => k.startsWith(d.date));
      for (const dk of dateKeys) {
        const entry = allOdds[dk];
        const entryHome = entry.home_team || '';
        if (entryHome === homeFullName || entryHome.includes(d.homeTeam)) {
          oddsEntry = entry;
          break;
        }
      }
    }
    
    const vegasLine = getConsensusLine(oddsEntry);
    if (!vegasLine) {
      unmatched++;
      continue;
    }
    
    matched++;
    
    const oldPred = predictWithModel(oldModel, d.oldFeatures);
    const newPred = predictWithModel(newModel, d.newFeatures);
    
    // Test multiple edge thresholds
    for (const threshold of [4, 5, 5.5, 6, 6.5]) {
      const oldBet = simulateBet(oldPred, vegasLine, d.actualTotal, threshold);
      const newBet = simulateBet(newPred, vegasLine, d.actualTotal, threshold);
      
      if (oldBet) {
        if (!results.old[threshold]) results.old[threshold] = [];
        results.old[threshold].push({ ...oldBet, date: d.date, homeTeam: d.homeTeam, awayTeam: d.awayTeam, actual: d.actualTotal });
      }
      if (newBet) {
        if (!results.new[threshold]) results.new[threshold] = [];
        results.new[threshold].push({ ...newBet, date: d.date, homeTeam: d.homeTeam, awayTeam: d.awayTeam, actual: d.actualTotal });
      }
    }
  }
  
  console.log(`  Matched ${matched} games with odds, ${unmatched} unmatched\n`);
  
  return results;
}


// ═══════════════════════════════════════════════════════════════
// PHASE 6: HEAD-TO-HEAD COMPARISON
// ═══════════════════════════════════════════════════════════════

function analyzeResults(bets) {
  if (!bets || bets.length === 0) return null;
  
  const nonPush = bets.filter(b => !b.push);
  const wins = nonPush.filter(b => b.won).length;
  const losses = nonPush.length - wins;
  const totalPnl = nonPush.reduce((sum, b) => sum + b.pnl, 0);
  const totalRisked = nonPush.length * 110;
  
  const overs = nonPush.filter(b => b.pickOver);
  const unders = nonPush.filter(b => !b.pickOver);
  
  const overWins = overs.filter(b => b.won).length;
  const underWins = unders.filter(b => b.won).length;
  const overPnl = overs.reduce((sum, b) => sum + b.pnl, 0);
  const underPnl = unders.reduce((sum, b) => sum + b.pnl, 0);
  
  return {
    bets: nonPush.length,
    wins, losses,
    winRate: (wins / nonPush.length * 100).toFixed(1),
    pnl: totalPnl,
    roi: (totalPnl / totalRisked * 100).toFixed(2),
    overs: { bets: overs.length, wins: overWins, pnl: overPnl, roi: overs.length > 0 ? (overPnl / (overs.length * 110) * 100).toFixed(2) : 'N/A' },
    unders: { bets: unders.length, wins: underWins, pnl: underPnl, roi: unders.length > 0 ? (underPnl / (unders.length * 110) * 100).toFixed(2) : 'N/A' }
  };
}

function printComparison(oldResults, newResults, oldEval, newEval) {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   🏀  NBA TOTALS MODEL: OLD vs NEW COMPARISON               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  
  // MAE/RMSE
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│  MODEL ACCURACY (Out-of-Sample)             │');
  console.log('├───────────────────┬────────────┬────────────┤');
  console.log('│  Metric           │  OLD (18f) │  NEW (28f) │');
  console.log('├───────────────────┼────────────┼────────────┤');
  console.log(`│  MAE              │  ${oldEval.mae.toFixed(2).padStart(8)}  │  ${newEval.mae.toFixed(2).padStart(8)}  │`);
  console.log(`│  RMSE             │  ${oldEval.rmse.toFixed(2).padStart(8)}  │  ${newEval.rmse.toFixed(2).padStart(8)}  │`);
  console.log(`│  Improvement      │     ---     │  ${((1 - newEval.mae/oldEval.mae) * 100).toFixed(1).padStart(6)}%  │`);
  console.log('└───────────────────┴────────────┴────────────┘\n');
  
  // Backtest ROI at various thresholds
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  BACKTEST ROI BY EDGE THRESHOLD                                │');
  console.log('├───────────┬──────────────────────────┬──────────────────────────┤');
  console.log('│  Threshold│  OLD (18 feat)            │  NEW (28 feat)            │');
  console.log('├───────────┼──────────────────────────┼──────────────────────────┤');
  
  for (const threshold of [4, 5, 5.5, 6, 6.5]) {
    const oldR = analyzeResults(oldResults[threshold]);
    const newR = analyzeResults(newResults[threshold]);
    
    const oldStr = oldR ? `${oldR.bets} bets, ${oldR.roi}% ROI ($${oldR.pnl > 0 ? '+' : ''}${oldR.pnl})` : 'N/A';
    const newStr = newR ? `${newR.bets} bets, ${newR.roi}% ROI ($${newR.pnl > 0 ? '+' : ''}${newR.pnl})` : 'N/A';
    
    console.log(`│  ≥${String(threshold).padEnd(5)}  │  ${oldStr.padEnd(24)}│  ${newStr.padEnd(24)}│`);
  }
  console.log('└───────────┴──────────────────────────┴──────────────────────────┘\n');
  
  // Best threshold detail
  for (const label of ['old', 'new']) {
    const results = label === 'old' ? oldResults : newResults;
    const featCount = label === 'old' ? 18 : 28;
    
    console.log(`\n  📊 ${label.toUpperCase()} MODEL (${featCount} features) — DETAIL BY THRESHOLD:`);
    
    for (const threshold of [4, 5, 5.5, 6, 6.5]) {
      const r = analyzeResults(results[threshold]);
      if (!r) continue;
      
      console.log(`    Edge ≥${threshold}: ${r.bets} bets | W-L: ${r.wins}-${r.losses} (${r.winRate}%) | P/L: $${r.pnl > 0 ? '+' : ''}${r.pnl} | ROI: ${r.roi}%`);
      console.log(`      Overs:  ${r.overs.bets} bets, ${r.overs.roi}% ROI ($${r.overs.pnl > 0 ? '+' : ''}${r.overs.pnl})`);
      console.log(`      Unders: ${r.unders.bets} bets, ${r.unders.roi}% ROI ($${r.unders.pnl > 0 ? '+' : ''}${r.unders.pnl})`);
    }
  }
  
  // Feature importance for new model
  console.log('\n\n  🔬 NEW MODEL — FEATURE WEIGHTS (top 10):');
}


// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🏀  NBA TOTALS MODEL V2 RETRAIN                            ║
║   OLD (18 features) vs NEW (28 features with pace/ratings)   ║
║                                                               ║
║   Training: 2022-23, 2023-24, early 2024-25                  ║
║   Backtest: 2024-25 + 2025-26 (with historical odds)         ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  // Phase 1: Collect missing games
  const newGames2526 = await collectMissingGames();
  
  // Phase 2: Collect missing odds
  await collectMissingOdds();
  
  // Phase 3: Build dataset
  const { dataset } = await buildDataset();
  
  // Phase 4: Train models
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PHASE 4: TRAIN OLD vs NEW MODEL');
  console.log('═══════════════════════════════════════════════════════\n');
  
  // Walk-forward split: Train on everything before 2024-10-22, test on 2024-25 + 2025-26
  const trainCutoff = '2024-10-22';
  const trainData = dataset.filter(d => d.date < trainCutoff);
  const testData = dataset.filter(d => d.date >= trainCutoff);
  
  console.log(`  Train set: ${trainData.length} games (before ${trainCutoff})`);
  console.log(`  Test set:  ${testData.length} games (${trainCutoff} onward)\n`);
  
  // Train OLD model (18 features)
  console.log('  🏋️  Training OLD model (18 features)...');
  const X_old_train = trainData.map(d => d.oldFeatures);
  const y_train = trainData.map(d => d.actualTotal);
  const oldModel = trainElasticNet(X_old_train, y_train, 0.01, 0.5, 0.001, 3000);
  
  // Train NEW model (28 features)
  console.log('  🏋️  Training NEW model (28 features with pace/ratings)...');
  const X_new_train = trainData.map(d => d.newFeatures);
  const newModel = trainElasticNet(X_new_train, y_train, 0.01, 0.5, 0.001, 3000);
  
  // Evaluate on test set
  const oldEval = evaluateModel(oldModel, testData, 'oldFeatures');
  const newEval = evaluateModel(newModel, testData, 'newFeatures');
  
  console.log(`\n  OLD Model — Test MAE: ${oldEval.mae.toFixed(2)}, RMSE: ${oldEval.rmse.toFixed(2)}`);
  console.log(`  NEW Model — Test MAE: ${newEval.mae.toFixed(2)}, RMSE: ${newEval.rmse.toFixed(2)}`);
  console.log(`  Improvement: ${((1 - newEval.mae/oldEval.mae) * 100).toFixed(2)}% MAE reduction`);
  
  // Phase 5: Backtest
  const backtestData = testData; // Test set = backtest set
  const backtestResults = await backtestModels(oldModel, newModel, backtestData);
  
  // Phase 6: Print comparison
  printComparison(backtestResults.old, backtestResults.new, oldEval, newEval);
  
  // Print new model feature weights
  const weightEntries = Object.entries(newModel.weights)
    .map(([k, v]) => ({ feature: k, weight: v, absWeight: Math.abs(v) }))
    .sort((a, b) => b.absWeight - a.absWeight);
  
  for (let i = 0; i < Math.min(15, weightEntries.length); i++) {
    const w = weightEntries[i];
    const bar = '█'.repeat(Math.min(20, Math.round(w.absWeight * 5)));
    const sign = w.weight > 0 ? '+' : '';
    console.log(`    ${(i + 1).toString().padStart(2)}. ${w.feature.padEnd(25)} ${sign}${w.weight.toFixed(4).padStart(8)} ${bar}`);
  }
  
  // Save models for potential deployment
  const outputDir = path.join(ROOT, 'data/nba/models');
  mkdirSync(outputDir, { recursive: true });
  
  writeFileSync(path.join(outputDir, 'totals_model_old_18feat.json'), JSON.stringify(oldModel, null, 2));
  writeFileSync(path.join(outputDir, 'totals_model_new_28feat.json'), JSON.stringify(newModel, null, 2));
  
  console.log(`\n\n  💾 Models saved to data/nba/models/`);
  console.log(`     totals_model_old_18feat.json`);
  console.log(`     totals_model_new_28feat.json`);
  
  // Save backtest results
  const summaryPath = path.join(outputDir, 'totals_v2_comparison_results.json');
  const summary = {
    timestamp: new Date().toISOString(),
    trainSize: trainData.length,
    testSize: testData.length,
    oldModel: {
      features: 18,
      mae: oldEval.mae,
      rmse: oldEval.rmse,
      backtestByThreshold: {}
    },
    newModel: {
      features: Object.keys(newModel.weights).length,
      mae: newEval.mae,
      rmse: newEval.rmse,
      backtestByThreshold: {},
      topWeights: weightEntries.slice(0, 15).map(w => ({ feature: w.feature, weight: w.weight }))
    }
  };
  
  for (const threshold of [4, 5, 5.5, 6, 6.5]) {
    summary.oldModel.backtestByThreshold[threshold] = analyzeResults(backtestResults.old[threshold]);
    summary.newModel.backtestByThreshold[threshold] = analyzeResults(backtestResults.new[threshold]);
  }
  
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`     totals_v2_comparison_results.json\n`);
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DONE. Review the comparison above before deploying.');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(console.error);
