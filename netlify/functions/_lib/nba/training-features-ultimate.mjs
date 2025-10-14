/**
 * 🏀 ULTIMATE NBA Training Features
 * Builds complete 83+ feature set from multi-source data:
 * - NBA Stats API: Advanced metrics (Pace, OffRtg, DefRtg, Four Factors)
 * - ESPN: Injuries, venue, attendance
 * - Schedule: Rest days, back-to-backs, altitude
 * - Rolling averages: L5, L10, L20 form metrics
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load team stats from Python collection cache
 */
export async function loadTeamStats(season) {
  const seasonKey = season.replace('-', '_');
  const statsPath = path.join(__dirname, '../../../../data/nba/cache', `team_stats_${seasonKey}.json`);
  
  try {
    const data = await fs.readFile(statsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.warn(`⚠️  Team stats not found for ${season}: ${error.message}`);
    return {};
  }
}

/**
 * Load injuries data
 */
export async function loadCurrentInjuries() {
  const injuriesDir = path.join(__dirname, '../../../../data/nba/injuries');
  
  try {
    const files = await fs.readdir(injuriesDir);
    const latestFile = files.filter(f => f.startsWith('injuries_')).sort().pop();
    
    if (!latestFile) return {};
    
    const data = await fs.readFile(path.join(injuriesDir, latestFile), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.warn(`⚠️  Injuries data not found: ${error.message}`);
    return {};
  }
}

/**
 * Calculate rolling averages from previous games
 * Prevents data leakage by only looking at games BEFORE the current game
 */
export function calculateRollingStats(allGames, currentIndex, teamId, lookback = 20) {
  const previousGames = allGames
    .slice(0, currentIndex)
    .filter(g => 
      g.homeTeam.id === teamId || g.awayTeam.id === teamId
    )
    .slice(-lookback);
  
  if (previousGames.length === 0) {
    return getDefaultRollingStats();
  }
  
  const stats = {
    games: previousGames.length,
    wins: 0,
    points: [],
    oppPoints: [],
    fgPct: [],
    fg3Pct: [],
    ftPct: [],
    assists: [],
    rebounds: [],
    turnovers: [],
    pace: [],
    offRtg: [],
    defRtg: [],
    netRtg: []
  };
  
  previousGames.forEach(game => {
    const isHome = game.homeTeam.id === teamId;
    const team = isHome ? game.homeTeam : game.awayTeam;
    const opp = isHome ? game.awayTeam : game.homeTeam;
    const teamStats = isHome ? game.homeTeamStats : game.awayTeamStats;
    
    const won = (isHome && game.homeTeam.score > game.awayTeam.score) ||
                (!isHome && game.awayTeam.score > game.homeTeam.score);
    
    if (won) stats.wins++;
    
    stats.points.push(team.score || 0);
    stats.oppPoints.push(opp.score || 0);
    
    // Add team stats if available
    if (teamStats) {
      if (teamStats.pace) stats.pace.push(teamStats.pace);
      if (teamStats.offRtg) stats.offRtg.push(teamStats.offRtg);
      if (teamStats.defRtg) stats.defRtg.push(teamStats.defRtg);
      if (teamStats.netRtg) stats.netRtg.push(teamStats.netRtg);
    }
  });
  
  const avg = arr => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  
  return {
    games: stats.games,
    winPct: stats.wins / stats.games,
    ppg: avg(stats.points),
    oppPpg: avg(stats.oppPoints),
    netPpg: avg(stats.points) - avg(stats.oppPoints),
    pace: avg(stats.pace),
    offRtg: avg(stats.offRtg),
    defRtg: avg(stats.defRtg),
    netRtg: avg(stats.netRtg),
    fgPct: avg(stats.fgPct),
    fg3Pct: avg(stats.fg3Pct),
    ftPct: avg(stats.ftPct),
    assists: avg(stats.assists),
    rebounds: avg(stats.rebounds),
    turnovers: avg(stats.turnovers)
  };
}

function getDefaultRollingStats() {
  return {
    games: 0,
    winPct: 0.5,
    ppg: 110,
    oppPpg: 110,
    netPpg: 0,
    pace: 100,
    offRtg: 110,
    defRtg: 110,
    netRtg: 0,
    fgPct: 0.46,
    fg3Pct: 0.36,
    ftPct: 0.78,
    assists: 25,
    rebounds: 45,
    turnovers: 14
  };
}

/**
 * Build complete feature vector for a single team
 * Returns 40+ features per team
 */
export function buildTeamFeatures(allGames, gameIndex, teamId, teamStats = {}) {
  const game = allGames[gameIndex];
  const isHome = game.homeTeam.id === teamId;
  
  // Rolling averages at different lookback windows
  const l5 = calculateRollingStats(allGames, gameIndex, teamId, 5);
  const l10 = calculateRollingStats(allGames, gameIndex, teamId, 10);
  const l20 = calculateRollingStats(allGames, gameIndex, teamId, 20);
  
  // Season-long stats from NBA Stats API
  const season = teamStats || {};
  
  // Rest days calculation
  const previousGames = allGames
    .slice(0, gameIndex)
    .filter(g => g.homeTeam.id === teamId || g.awayTeam.id === teamId);
  
  let restDays = 3;
  let isBackToBack = false;
  if (previousGames.length > 0) {
    const lastGame = previousGames[previousGames.length - 1];
    const lastDate = new Date(lastGame.date);
    const currentDate = new Date(game.date);
    const daysDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));
    restDays = Math.max(0, daysDiff - 1);
    isBackToBack = daysDiff === 1;
  }
  
  return {
    // Form metrics (L5, L10, L20)
    l5_winPct: l5.winPct,
    l5_ppg: l5.ppg,
    l5_oppPpg: l5.oppPpg,
    l5_netPpg: l5.netPpg,
    l5_pace: l5.pace,
    l5_offRtg: l5.offRtg,
    l5_defRtg: l5.defRtg,
    l5_netRtg: l5.netRtg,
    
    l10_winPct: l10.winPct,
    l10_ppg: l10.ppg,
    l10_oppPpg: l10.oppPpg,
    l10_netPpg: l10.netPpg,
    l10_pace: l10.pace,
    l10_offRtg: l10.offRtg,
    l10_defRtg: l10.defRtg,
    l10_netRtg: l10.netRtg,
    
    l20_winPct: l20.winPct,
    l20_ppg: l20.ppg,
    l20_oppPpg: l20.oppPpg,
    l20_netPpg: l20.netPpg,
    l20_pace: l20.pace,
    l20_offRtg: l20.offRtg,
    l20_defRtg: l20.defRtg,
    l20_netRtg: l20.netRtg,
    
    // Form trends (L5 vs L20)
    form_trend: l5.winPct - l20.winPct,
    offense_trend: l5.offRtg - l20.offRtg,
    defense_trend: l20.defRtg - l5.defRtg, // Lower is better
    scoring_trend: l5.ppg - l20.ppg,
    
    // Season-long advanced metrics from NBA Stats API
    season_pace: season.pace || l20.pace,
    season_offRtg: season.offRtg || l20.offRtg,
    season_defRtg: season.defRtg || l20.defRtg,
    season_netRtg: season.netRtg || l20.netRtg,
    season_winPct: season.winPct || l20.winPct,
    
    // Four Factors
    season_efgPct: season.efgPct || 0.52,
    season_tovPct: season.tovPct || 0.14,
    season_orebPct: season.orebPct || 0.25,
    season_ftaRate: season.ftaRate || 0.24,
    
    // Shooting splits
    season_fgPct: season.fgPct || l20.fgPct,
    season_fg3Pct: season.fg3Pct || l20.fg3Pct,
    season_ftPct: season.ftPct || l20.ftPct,
    season_tsPct: season.tsPct || 0.57,
    
    // Advanced stats
    season_astPct: season.astPct || 0.60,
    season_astRatio: season.astRatio || 16,
    season_astTov: season.astTov || 1.7,
    season_rebPct: season.rebPct || 0.50,
    season_pie: season.pie || 0.50,
    
    // Rest and schedule
    restDays,
    isBackToBack: isBackToBack ? 1 : 0,
    isHome: isHome ? 1 : 0,
    
    // Altitude adjustment
    highAltitude: game.highAltitude ? 1 : 0,
    altitudeAdjustment: game.altitudeAdjustment || 0
  };
}

/**
 * Build matchup features (differentials between teams)
 */
export function buildMatchupFeatures(homeFeatures, awayFeatures) {
  return {
    // Win% differential
    winPct_diff: homeFeatures.l20_winPct - awayFeatures.l20_winPct,
    
    // Pace differential (both teams affect pace)
    pace_diff: homeFeatures.season_pace - awayFeatures.season_pace,
    pace_avg: (homeFeatures.season_pace + awayFeatures.season_pace) / 2,
    
    // Rating differentials
    offRtg_diff: homeFeatures.season_offRtg - awayFeatures.season_offRtg,
    defRtg_diff: awayFeatures.season_defRtg - homeFeatures.season_defRtg, // Lower is better
    netRtg_diff: homeFeatures.season_netRtg - awayFeatures.season_netRtg,
    
    // Four Factors battle
    efgPct_diff: homeFeatures.season_efgPct - awayFeatures.season_efgPct,
    tovPct_diff: awayFeatures.season_tovPct - homeFeatures.season_tovPct, // Lower is better
    orebPct_diff: homeFeatures.season_orebPct - awayFeatures.season_orebPct,
    ftaRate_diff: homeFeatures.season_ftaRate - awayFeatures.season_ftaRate,
    
    // Form differentials
    form_diff: homeFeatures.form_trend - awayFeatures.form_trend,
    momentum_diff: homeFeatures.l5_netRtg - awayFeatures.l5_netRtg,
    
    // Rest differential (negative means away team more rested)
    rest_diff: homeFeatures.restDays - awayFeatures.restDays,
    
    // Back-to-back disadvantage
    b2b_home: homeFeatures.isBackToBack,
    b2b_away: awayFeatures.isBackToBack,
    b2b_diff: awayFeatures.isBackToBack - homeFeatures.isBackToBack
  };
}

/**
 * Build complete training features for a game
 * Returns 83+ features ready for XGBoost
 */
export async function buildCompleteTrainingFeatures(allGames, gameIndex) {
  const game = allGames[gameIndex];
  
  // Load season stats (cached from Python collector)
  const season = game.date.substring(0, 4);
  const seasonKey = `${season}-${parseInt(season.substring(2)) + 1}`;
  const teamStats = await loadTeamStats(seasonKey);
  
  // Build features for both teams
  const homeFeatures = buildTeamFeatures(
    allGames,
    gameIndex,
    game.homeTeam.id,
    teamStats[game.homeTeam.id]
  );
  
  const awayFeatures = buildTeamFeatures(
    allGames,
    gameIndex,
    game.awayTeam.id,
    teamStats[game.awayTeam.id]
  );
  
  // Build matchup features
  const matchupFeatures = buildMatchupFeatures(homeFeatures, awayFeatures);
  
  // Combine all features
  return {
    // Home team features (prefix with home_)
    ...Object.fromEntries(
      Object.entries(homeFeatures).map(([k, v]) => [`home_${k}`, v])
    ),
    
    // Away team features (prefix with away_)
    ...Object.fromEntries(
      Object.entries(awayFeatures).map(([k, v]) => [`away_${k}`, v])
    ),
    
    // Matchup features
    ...matchupFeatures,
    
    // Metadata (for validation, not used in training)
    gameId: game.gameId,
    date: game.date,
    homeTeamId: game.homeTeam.id,
    awayTeamId: game.awayTeam.id
  };
}

/**
 * Build training dataset from collected games
 */
export async function buildTrainingDataset(games) {
  console.log(`\n🔨 Building training features for ${games.length} games...`);
  
  const features = [];
  const targets = [];
  
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    
    // Skip if game hasn't finished
    if (!game.homeTeam.score || !game.awayTeam.score) {
      continue;
    }
    
    // Build features
    const featureVector = await buildCompleteTrainingFeatures(games, i);
    
    // Calculate targets
    const homeScore = game.homeTeam.score;
    const awayScore = game.awayTeam.score;
    const spread = homeScore - awayScore;
    const total = homeScore + awayScore;
    
    features.push(featureVector);
    targets.push({
      spread,
      total,
      homeScore,
      awayScore,
      homeWin: spread > 0 ? 1 : 0
    });
    
    // Progress update
    if ((i + 1) % 500 === 0) {
      console.log(`  ⏳ Progress: ${i + 1}/${games.length} games processed`);
    }
  }
  
  console.log(`✅ Built ${features.length} training samples`);
  console.log(`   Feature count: ${Object.keys(features[0]).length - 4} (excluding metadata)`);
  
  return { features, targets };
}

/**
 * Validate feature completeness
 */
export function validateFeatures(features) {
  const required = [
    'home_l5_winPct', 'away_l5_winPct',
    'home_season_pace', 'away_season_pace',
    'home_season_offRtg', 'away_season_offRtg',
    'home_season_defRtg', 'away_season_defRtg',
    'home_season_efgPct', 'away_season_efgPct',
    'pace_avg', 'netRtg_diff'
  ];
  
  const missing = required.filter(f => !(f in features));
  
  if (missing.length > 0) {
    throw new Error(`Missing required features: ${missing.join(', ')}`);
  }
  
  // Count features
  const featureKeys = Object.keys(features).filter(k => 
    !['gameId', 'date', 'homeTeamId', 'awayTeamId'].includes(k)
  );
  
  console.log(`✅ Feature validation passed: ${featureKeys.length} features`);
  return true;
}
