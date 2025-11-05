#!/usr/bin/env node
/**
 * NFL Model V2 - Edge Calculator
 * 
 * Compares model predictions against historical closing lines to calculate edge.
 * Edge = (Model Probability - Market Implied Probability)
 * 
 * Run: node nfl-model-v2/scripts/05-calculate-edges.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = JSON.parse(
  await fs.readFile(path.join(__dirname, '../config.json'), 'utf-8')
);

const PREDICTIONS_DIR = path.join(__dirname, '../data/processed-features');
const ODDS_DIR = path.join(__dirname, '../data/historical-odds');
const NFLVERSE_DIR = path.join(__dirname, '../data/nflverse');
const OUTPUT_DIR = path.join(__dirname, '../output');

// Team name mapping: NFLVerse abbreviation -> TheOddsAPI full name
const TEAM_NAME_MAP = {
  'ARI': 'Arizona Cardinals',
  'ATL': 'Atlanta Falcons',
  'BAL': 'Baltimore Ravens',
  'BUF': 'Buffalo Bills',
  'CAR': 'Carolina Panthers',
  'CHI': 'Chicago Bears',
  'CIN': 'Cincinnati Bengals',
  'CLE': 'Cleveland Browns',
  'DAL': 'Dallas Cowboys',
  'DEN': 'Denver Broncos',
  'DET': 'Detroit Lions',
  'GB': 'Green Bay Packers',
  'HOU': 'Houston Texans',
  'IND': 'Indianapolis Colts',
  'JAX': 'Jacksonville Jaguars',
  'JAC': 'Jacksonville Jaguars',
  'KC': 'Kansas City Chiefs',
  'LA': 'Los Angeles Rams',
  'LAR': 'Los Angeles Rams',
  'LAC': 'Los Angeles Chargers',
  'LV': 'Las Vegas Raiders',
  'OAK': 'Oakland Raiders',
  'MIA': 'Miami Dolphins',
  'MIN': 'Minnesota Vikings',
  'NE': 'New England Patriots',
  'NO': 'New Orleans Saints',
  'NYG': 'New York Giants',
  'NYJ': 'New York Jets',
  'PHI': 'Philadelphia Eagles',
  'PIT': 'Pittsburgh Steelers',
  'SF': 'San Francisco 49ers',
  'SEA': 'Seattle Seahawks',
  'TB': 'Tampa Bay Buccaneers',
  'TEN': 'Tennessee Titans',
  'WAS': 'Washington Commanders',
  'WSH': 'Washington Commanders'
};

/**
 * Convert American odds to implied probability
 */
function americanToImpliedProb(odds) {
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

/**
 * Remove vig from two-way market (true probability)
 */
function removeVig(prob1, prob2) {
  const sum = prob1 + prob2;
  return {
    prob1: prob1 / sum,
    prob2: prob2 / sum
  };
}

/**
 * Find matching game in odds data
 */
function findGameOdds(prediction, oddsData) {
  if (!oddsData || !oddsData.games) return null;
  
  // Convert NFLVerse abbreviations to full names
  const homeTeamFull = TEAM_NAME_MAP[prediction.home_team] || prediction.home_team;
  const awayTeamFull = TEAM_NAME_MAP[prediction.away_team] || prediction.away_team;
  
  // Try to match by teams
  const game = oddsData.games.find(g => 
    g.home_team === homeTeamFull && g.away_team === awayTeamFull
  );
  
  return game;
}

/**
 * Get best closing line from available bookmakers
 */
function getClosingLines(gameOdds) {
  const preferred = config.odds_api.preferred_bookmaker;
  const fallbacks = config.odds_api.fallback_bookmakers;
  const bookmakers = [preferred, ...fallbacks];
  
  let bestSpread = null;
  let bestTotal = null;
  let bestMoneyline = null;
  
  for (const book of bookmakers) {
    const bookData = gameOdds.bookmakers[book];
    if (!bookData) continue;
    
    if (!bestSpread && bookData.spread) {
      bestSpread = bookData.spread;
    }
    if (!bestTotal && bookData.total) {
      bestTotal = bookData.total;
    }
    if (!bestMoneyline && bookData.moneyline) {
      bestMoneyline = bookData.moneyline;
    }
    
    // If we have all three, we're done
    if (bestSpread && bestTotal && bestMoneyline) break;
  }
  
  return { spread: bestSpread, total: bestTotal, moneyline: bestMoneyline };
}

/**
 * Calculate spread edge
 */
function calculateSpreadEdge(prediction, closingSpread) {
  if (!closingSpread || closingSpread.home_line === undefined) {
    return null;
  }
  
  const modelLine = prediction.predictions.spread.line;
  const marketLine = closingSpread.home_line;
  
  // Edge = how much better our line is than market
  // Positive edge means our model is more bullish on home team
  const lineEdge = modelLine - marketLine;
  
  // Convert to probability edge
  // Rule of thumb: 1 point of spread ≈ 2.5% probability
  const probEdge = Math.abs(lineEdge) * 0.025;
  
  return {
    model_line: modelLine,
    market_line: marketLine,
    line_difference: lineEdge,
    probability_edge: probEdge,
    has_edge: probEdge >= config.edge_calculation.min_bet_threshold
  };
}

/**
 * Calculate total edge
 */
function calculateTotalEdge(prediction, closingTotal) {
  if (!closingTotal || closingTotal.line === undefined) {
    return null;
  }
  
  const modelTotal = prediction.predictions.total.line;
  const marketTotal = closingTotal.line;
  
  // Edge = how far our total is from market
  const difference = modelTotal - marketTotal;
  
  // Determine if we like Over or Under
  const side = difference > 0 ? 'Over' : 'Under';
  const probEdge = Math.abs(difference) * 0.02; // 1 point ≈ 2% probability
  
  return {
    model_total: modelTotal,
    market_total: marketTotal,
    difference: difference,
    side: side,
    probability_edge: probEdge,
    has_edge: probEdge >= config.edge_calculation.min_bet_threshold
  };
}

/**
 * Calculate moneyline edge
 */
function calculateMoneylineEdge(prediction, closingML) {
  if (!closingML || !closingML.home_price || !closingML.away_price) {
    return null;
  }
  
  const modelHomeProb = prediction.predictions.moneyline.home_win_prob;
  const modelAwayProb = prediction.predictions.moneyline.away_win_prob;
  
  // Get market implied probabilities
  const rawHomeProb = americanToImpliedProb(closingML.home_price);
  const rawAwayProb = americanToImpliedProb(closingML.away_price);
  
  // Remove vig to get true market probabilities
  const { prob1: marketHomeProb, prob2: marketAwayProb } = removeVig(rawHomeProb, rawAwayProb);
  
  // Edge = model prob - market prob
  const homeEdge = modelHomeProb - marketHomeProb;
  const awayEdge = modelAwayProb - marketAwayProb;
  
  // Pick the side with positive edge
  const bestSide = homeEdge > awayEdge ? 'home' : 'away';
  const edge = Math.max(homeEdge, awayEdge);
  
  return {
    model_home_prob: modelHomeProb,
    model_away_prob: modelAwayProb,
    market_home_prob: marketHomeProb,
    market_away_prob: marketAwayProb,
    home_edge: homeEdge,
    away_edge: awayEdge,
    best_side: bestSide,
    probability_edge: Math.abs(edge),
    has_edge: Math.abs(edge) >= config.edge_calculation.min_bet_threshold
  };
}

/**
 * Load actual results from NFLVerse
 */
async function loadActualResults(season) {
  const filename = path.join(NFLVERSE_DIR, `game_aggregates_${season}.json`);
  const data = await fs.readFile(filename, 'utf-8');
  return JSON.parse(data);
}

/**
 * Find actual result for a game
 */
function findActualResult(prediction, actualResults) {
  return actualResults.find(r => r.game_id === prediction.game_id);
}

/**
 * Main execution
 */
async function main() {
  console.log('🏈 NFL Model V2 - Edge Calculator');
  console.log('='.repeat(60));
  console.log(`Seasons: ${config.seasons.join(', ')}`);
  console.log(`Min Edge Threshold: ${(config.edge_calculation.min_bet_threshold * 100).toFixed(1)}%`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  const allEdges = [];
  let totalGames = 0;
  let gamesWithOdds = 0;
  let gamesWithEdge = 0;
  
  for (const season of config.seasons) {
    console.log(`\n📅 Processing ${season}...`);
    
    // Load predictions
    const predictionsFile = path.join(PREDICTIONS_DIR, `predictions_${season}.json`);
    const predictions = JSON.parse(await fs.readFile(predictionsFile, 'utf-8'));
    
    // Load actual results
    const actualResults = await loadActualResults(season);
    
    console.log(`   Loaded ${predictions.length} predictions`);
    
    // Process each week
    for (let week = 1; week <= config.weeks_regular_season; week++) {
      const weekPredictions = predictions.filter(p => p.week === week);
      if (weekPredictions.length === 0) continue;
      
      // Load odds for this week
      let oddsData = null;
      try {
        const oddsFile = path.join(ODDS_DIR, String(season), `week${week}.json`);
        oddsData = JSON.parse(await fs.readFile(oddsFile, 'utf-8'));
      } catch (error) {
        console.log(`   ⚠️  No odds data for Week ${week}`);
        continue;
      }
      
      // Calculate edges for each game
      for (const prediction of weekPredictions) {
        totalGames++;
        
        const gameOdds = findGameOdds(prediction, oddsData);
        if (!gameOdds) continue;
        
        const closingLines = getClosingLines(gameOdds);
        gamesWithOdds++;
        
        const actualResult = findActualResult(prediction, actualResults);
        
        const spreadEdge = calculateSpreadEdge(prediction, closingLines.spread);
        const totalEdge = calculateTotalEdge(prediction, closingLines.total);
        const mlEdge = calculateMoneylineEdge(prediction, closingLines.moneyline);
        
        const hasAnyEdge = 
          spreadEdge?.has_edge || 
          totalEdge?.has_edge || 
          mlEdge?.has_edge;
        
        if (hasAnyEdge) gamesWithEdge++;
        
        allEdges.push({
          game_id: prediction.game_id,
          season: season,
          week: week,
          home_team: prediction.home_team,
          away_team: prediction.away_team,
          spread_edge: spreadEdge,
          total_edge: totalEdge,
          moneyline_edge: mlEdge,
          actual_result: actualResult ? {
            home_score: actualResult.home_score,
            away_score: actualResult.away_score,
            home_won: actualResult.home_score > actualResult.away_score,
            total_points: actualResult.home_score + actualResult.away_score,
            margin: actualResult.home_score - actualResult.away_score
          } : null
        });
      }
    }
    
    console.log(`   ✅ Processed ${predictions.length} games`);
  }
  
  // Save all edges
  const edgesFile = path.join(OUTPUT_DIR, 'all_edges.json');
  await fs.writeFile(edgesFile, JSON.stringify(allEdges, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Edge Calculation Complete!');
  console.log(`   Total Games: ${totalGames}`);
  console.log(`   Games with Odds: ${gamesWithOdds}`);
  console.log(`   Games with Edge: ${gamesWithEdge}`);
  console.log(`   Coverage: ${((gamesWithOdds / totalGames) * 100).toFixed(1)}%`);
  console.log(`   Edge Rate: ${((gamesWithEdge / gamesWithOdds) * 100).toFixed(1)}%`);
  console.log(`   Saved to: ${edgesFile}`);
  console.log('='.repeat(60));
  
  console.log('\n📝 Next Step: node nfl-model-v2/scripts/06-generate-reports.mjs\n');
}

// Run main function
main().catch(error => {
  console.error('\n❌ Fatal Error:', error);
  process.exit(1);
});
