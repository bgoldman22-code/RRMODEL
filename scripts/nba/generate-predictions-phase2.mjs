#!/usr/bin/env node

/**
 * Phase 2.5 Prediction Generator
 * 
 * PURPOSE:
 * Generates daily NBA player prop predictions using Phase 2.5 correlation-weighted
 * regression models (points, rebounds, assists).
 * 
 * INPUTS:
 * - data/nba/player-boxscores-2025-26.json (current season player-game data)
 * - data/nba/models/*_Window_3_-_Test_Apr_2025.json (Phase 2.5 models)
 * - TheOddsAPI (live odds via ODDS_API_KEY env var)
 * 
 * OUTPUTS:
 * - public/data/nba/nba-props-v2-live.json (atomic write via .tmp)
 * 
 * DATA SAFETY:
 * - READ-ONLY on all input data files
 * - Atomic writes: always write to .tmp first, then rename
 * - No destructive edits to existing data
 * 
 * USAGE:
 *   export ODDS_API_KEY=your_key_here
 *   node scripts/nba/generate-predictions-phase2.mjs
 * 
 * REQUIREMENTS:
 * - Strict walkforward: only use games BEFORE target date for features
 * - No data leakage in L5/L10/season calculations
 */

import fs from 'fs';
import { readFileSync, writeFileSync, renameSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import Phase 2.5 inference engine
import { predictStat, predictPRA } from '../../netlify/functions/_lib/phase2-inference.mjs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_SPORT = 'basketball_nba';
const ODDS_API_REGIONS = 'us';
const ODDS_API_MARKETS = 'player_points,player_rebounds,player_assists';
const ODDS_API_ODDS_FORMAT = 'american';

// Filtering thresholds
const MIN_EDGE = 1.0; // Minimum edge (prediction - line) to include pick
const MIN_CONFIDENCE = 0.65; // Minimum model confidence (0-1) to include pick

// Output path (with atomic write)
const OUTPUT_DIR = path.join(__dirname, '../../public/data/nba');
const OUTPUT_FILE = 'nba-props-v2-live.json';
const OUTPUT_TMP = 'nba-props-v2-live.json.tmp';

// ============================================================================
// DATA LOADING
// ============================================================================

console.log('\n=== Phase 2.5 Prediction Generator ===');
console.log('Started:', new Date().toISOString());
console.log();

// Load current season boxscores
console.log('[1/5] Loading boxscore data...');
const boxscoresPath = path.join(__dirname, '../../data/nba/player-boxscores-2025-26.json');

if (!fs.existsSync(boxscoresPath)) {
  console.error('❌ ERROR: Boxscores file not found:', boxscoresPath);
  console.error('Please ensure data/nba/player-boxscores-2025-26.json exists.');
  process.exit(1);
}

const allBoxscores = JSON.parse(readFileSync(boxscoresPath, 'utf-8'));
console.log(`✅ Loaded ${allBoxscores.length} player-game records`);

// ============================================================================
// FEATURE CALCULATION (STRICT WALKFORWARD)
// ============================================================================

/**
 * Calculate player features for a specific date
 * Uses ONLY games before the target date (strict walkforward)
 * 
 * @param {string} playerName - Player name
 * @param {string} targetDate - Target date (YYYY-MM-DD)
 * @returns {Object} - Feature object for Phase 2.5 models
 */
function calculateFeatures(playerName, targetDate) {
  // Get all games for this player BEFORE target date
  const priorGames = allBoxscores
    .filter(g => g.playerName === playerName && g.date < targetDate)
    .sort((a, b) => a.date.localeCompare(b.date)); // Chronological order

  if (priorGames.length === 0) {
    return null; // No historical data
  }

  const features = {};

  // Season averages (all prior games)
  const totalGames = priorGames.length;
  features.season_ppg = priorGames.reduce((sum, g) => sum + g.points, 0) / totalGames;
  features.season_rpg = priorGames.reduce((sum, g) => sum + g.rebounds, 0) / totalGames;
  features.season_apg = priorGames.reduce((sum, g) => sum + g.assists, 0) / totalGames;

  // Last 10 games
  const L10 = priorGames.slice(-10);
  if (L10.length >= 5) { // Need at least 5 games for L10 stats
    features.L10_ppg = L10.reduce((sum, g) => sum + g.points, 0) / L10.length;
    features.L10_rpg = L10.reduce((sum, g) => sum + g.rebounds, 0) / L10.length;
    features.L10_apg = L10.reduce((sum, g) => sum + g.assists, 0) / L10.length;
    features.L10_fga = L10.reduce((sum, g) => sum + g.fga, 0) / L10.length;
    features.L10_fta = L10.reduce((sum, g) => sum + g.fta, 0) / L10.length;
    features.L10_minutes = L10.reduce((sum, g) => sum + g.minutes, 0) / L10.length;
  }

  // Last 5 games
  const L5 = priorGames.slice(-5);
  if (L5.length >= 3) { // Need at least 3 games for L5 stats
    features.L5_ppg = L5.reduce((sum, g) => sum + g.points, 0) / L5.length;
    features.L5_rpg = L5.reduce((sum, g) => sum + g.rebounds, 0) / L5.length;
    features.L5_apg = L5.reduce((sum, g) => sum + g.assists, 0) / L5.length;
    features.L5_fga = L5.reduce((sum, g) => sum + g.fga, 0) / L5.length;
    features.L5_fta = L5.reduce((sum, g) => sum + g.fta, 0) / L5.length;
    features.L5_minutes = L5.reduce((sum, g) => sum + g.minutes, 0) / L5.length;
  }

  return features;
}

// ============================================================================
// ODDS API INTEGRATION
// ============================================================================

/**
 * Fetch live odds from TheOddsAPI
 * @returns {Promise<Array>} - Array of odds objects
 */
async function fetchOdds() {
  if (!ODDS_API_KEY) {
    console.error('❌ ERROR: ODDS_API_KEY environment variable not set');
    console.error('Please set it: export ODDS_API_KEY=your_key_here');
    process.exit(1);
  }

  console.log('[2/5] Fetching live odds from TheOddsAPI...');

  const url = `https://api.the-odds-api.com/v4/sports/${ODDS_API_SPORT}/odds/?` +
    `apiKey=${ODDS_API_KEY}&` +
    `regions=${ODDS_API_REGIONS}&` +
    `markets=${ODDS_API_MARKETS}&` +
    `oddsFormat=${ODDS_API_ODDS_FORMAT}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const games = JSON.parse(data);
          console.log(`✅ Fetched odds for ${games.length} games`);
          resolve(games);
        } catch (e) {
          reject(new Error(`Failed to parse odds API response: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Parse TheOddsAPI response into normalized prop odds
 * @param {Array} games - Raw API response
 * @returns {Array} - Normalized odds objects
 */
function parseOdds(games) {
  const props = [];

  for (const game of games) {
    const homeTeam = game.home_team;
    const awayTeam = game.away_team;
    const gameTime = game.commence_time;

    for (const bookmaker of game.bookmakers || []) {
      const bookName = bookmaker.key;

      for (const market of bookmaker.markets || []) {
        const marketType = market.key; // 'player_points', 'player_rebounds', 'player_assists'

        for (const outcome of market.outcomes || []) {
          if (!outcome.description) continue; // Skip team totals

          const playerName = outcome.description;
          const line = outcome.point;
          const oddsOver = outcome.price; // American odds for OVER

          // Determine which team this player is on (approximate)
          // Note: TheOddsAPI doesn't always provide team info in player props
          // We'll match against boxscore data later

          props.push({
            player: playerName,
            market: marketType.replace('player_', ''), // 'points', 'rebounds', 'assists'
            line: line,
            odds: oddsOver,
            book: bookName,
            game_time: gameTime,
            home_team: homeTeam,
            away_team: awayTeam,
          });
        }
      }
    }
  }

  console.log(`✅ Parsed ${props.length} player prop odds`);
  return props;
}

// ============================================================================
// PREDICTION GENERATION
// ============================================================================

/**
 * Generate predictions for all props
 * @param {Array} props - Normalized odds objects
 * @returns {Array} - Prediction objects
 */
function generatePredictions(props) {
  console.log('[3/5] Generating Phase 2.5 predictions...');

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const predictions = [];
  const skipped = { noFeatures: 0, lowConfidence: 0, lowEdge: 0 };

  for (const prop of props) {
    const { player, market, line, odds, book, game_time, home_team, away_team } = prop;

    // Calculate features (strict walkforward)
    const features = calculateFeatures(player, today);

    if (!features) {
      skipped.noFeatures++;
      continue;
    }

    // Run Phase 2.5 model
    let result;
    try {
      result = predictStat(market, features);
    } catch (error) {
      console.warn(`⚠️  Failed to predict ${market} for ${player}:`, error.message);
      continue;
    }

    const { prediction, confidence } = result;

    // Calculate edge
    const edge = prediction - line;
    const absEdge = Math.abs(edge);

    // Determine recommended side
    let recommendedSide = null;
    if (edge > MIN_EDGE) {
      recommendedSide = 'OVER';
    } else if (edge < -MIN_EDGE) {
      recommendedSide = 'UNDER';
    }

    // Apply filters
    if (confidence < MIN_CONFIDENCE) {
      skipped.lowConfidence++;
      continue;
    }

    if (!recommendedSide) {
      skipped.lowEdge++;
      continue;
    }

    // Find team from boxscore data
    const recentGames = allBoxscores.filter(g => g.playerName === player).slice(-5);
    const team = recentGames.length > 0 ? recentGames[0].team : null;
    const opponent = team === home_team ? away_team : home_team;

    predictions.push({
      player,
      team,
      opponent,
      game_time,
      market,
      line,
      prediction,
      edge: parseFloat(edge.toFixed(2)),
      confidence,
      recommended_side: recommendedSide,
      book,
      odds,
    });
  }

  console.log(`✅ Generated ${predictions.length} predictions`);
  console.log(`   Skipped: ${skipped.noFeatures} (no features), ${skipped.lowConfidence} (low confidence), ${skipped.lowEdge} (low edge)`);

  return predictions;
}

// ============================================================================
// OUTPUT (ATOMIC WRITE)
// ============================================================================

/**
 * Write predictions to JSON file (atomic write)
 * @param {Array} picks - Prediction objects
 */
function writeOutput(picks) {
  console.log('[4/5] Writing output file...');

  // Calculate summary stats
  const stats = {
    total_games: new Set(picks.map(p => p.game_time)).size,
    total_picks: picks.length,
    avg_edge: picks.length > 0
      ? parseFloat((picks.reduce((sum, p) => sum + Math.abs(p.edge), 0) / picks.length).toFixed(2))
      : 0,
    avg_confidence: picks.length > 0
      ? parseFloat((picks.reduce((sum, p) => sum + p.confidence, 0) / picks.length).toFixed(3))
      : 0,
  };

  const output = {
    generated_at: new Date().toISOString(),
    model_version: 'nba_phase2.5_regression_window3_apr2025',
    source: 'Phase 2.5 correlation-weighted regression models',
    filters: {
      min_edge: MIN_EDGE,
      min_confidence: MIN_CONFIDENCE,
    },
    picks,
    stats,
  };

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Atomic write: .tmp → final
  const tmpPath = path.join(OUTPUT_DIR, OUTPUT_TMP);
  const finalPath = path.join(OUTPUT_DIR, OUTPUT_FILE);

  writeFileSync(tmpPath, JSON.stringify(output, null, 2), 'utf-8');
  renameSync(tmpPath, finalPath);

  console.log(`✅ Wrote ${picks.length} picks to: ${finalPath}`);
  console.log(`   Summary: ${stats.total_games} games, avg edge: ${stats.avg_edge}, avg confidence: ${stats.avg_confidence}`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  try {
    // Step 1: Already loaded boxscores above

    // Step 2: Fetch odds
    const games = await fetchOdds();

    // Step 3: Parse odds into props
    const props = parseOdds(games);

    if (props.length === 0) {
      console.log('⚠️  No props found. Exiting.');
      process.exit(0);
    }

    // Step 4: Generate predictions
    const picks = generatePredictions(props);

    // Step 5: Write output
    writeOutput(picks);

    console.log('\n[5/5] ✅ Complete!');
    console.log('Finished:', new Date().toISOString());
    console.log();

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { calculateFeatures, generatePredictions };
