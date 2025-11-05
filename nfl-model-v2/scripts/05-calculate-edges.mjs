#!/usr/bin/env node
/**
 * NFL Model V4 - Edge Calculator with CLV Tracking
 * 
 * Compares model predictions against historical closing lines to calculate edge.
 * V4: Tracks Closing Line Value (CLV) - did we beat the closing number?
 * 
 * Edge = (Model Probability - Market Implied Probability)
 * CLV = Line improvement from open to close in our favor
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
 * Calculate CLV (Closing Line Value) for spread
 * Positive CLV = we got better line than closing
 */
function calculateSpreadCLV(bestSide, openLine, closeLine) {
  if (!openLine || !closeLine) return null;
  
  // If betting home
  if (bestSide === 'home') {
    // Home getting +3.5 close vs +3 open = gained 0.5 points = positive CLV
    return closeLine - openLine;
  } else {
    // Away getting +3 close vs +3.5 open = lost 0.5 points = negative CLV
    return openLine - closeLine;
  }
}

/**
 * Calculate CLV for moneyline
 * Positive CLV = we got better odds than closing
 */
function calculateMLCLV(bestSide, openPrice, closePrice) {
  if (!openPrice || !closePrice) return null;
  
  const openProb = americanToImpliedProb(openPrice);
  const closeProb = americanToImpliedProb(closePrice);
  
  // Lower implied prob = better odds for us
  // CLV = open_prob - close_prob (positive = we got better price)
  return openProb - closeProb;
}

/**
 * Calculate CLV for totals
 * Positive CLV = line moved in our favor
 */
function calculateTotalCLV(pick, openLine, closeLine) {
  if (!openLine || !closeLine) return null;
  
  if (pick === 'over') {
    // Over 45.5 close vs Over 47 open = gained 1.5 points = positive CLV
    return openLine - closeLine;
  } else {
    // Under 47 close vs Under 45.5 open = gained 1.5 points = positive CLV
    return closeLine - openLine;
  }
}

/**
 * Extract opening lines from odds data (if available)
 * Many APIs only provide closing lines, so this may return nulls
 */
function extractOpeningLines(gameOdds) {
  // For now, return null - most historical APIs only have closing lines
  // TODO: If API provides multiple timestamps, extract earliest snapshot
  return {
    spread_open: null,
    total_open: null,
    ml_home_open: null,
    ml_away_open: null
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
  console.log('🏈 NFL Model V4 - Edge Calculator with CLV Tracking');
  console.log('='.repeat(60));
  console.log(`Seasons: ${config.seasons.join(', ')}`);
  console.log(`EV Thresholds: Spread ${(config.thresholds?.spread_ev || 0.03) * 100}%, Total ${(config.thresholds?.total_ev || 0.03) * 100}%, ML ${(config.thresholds?.ml_ev || 0.03) * 100}%`);
  console.log(`CLV Tracking: ${config.market_context?.track_line_movement ? 'Enabled' : 'Disabled'}`);
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
        const openingLines = extractOpeningLines(gameOdds);
        gamesWithOdds++;
        
        const actualResult = findActualResult(prediction, actualResults);
        
        const spreadEdge = calculateSpreadEdge(prediction, closingLines.spread);
        const totalEdge = calculateTotalEdge(prediction, closingLines.total);
        const mlEdge = calculateMoneylineEdge(prediction, closingLines.moneyline);
        
        // V4: Calculate CLV for each market
        const spreadCLV = spreadEdge && openingLines.spread_open ? 
          calculateSpreadCLV(spreadEdge.best_side, openingLines.spread_open, closingLines.spread.line) : null;
        const totalCLV = totalEdge && openingLines.total_open ?
          calculateTotalCLV(totalEdge.best_side, openingLines.total_open, closingLines.total.line) : null;
        const mlCLV = mlEdge && openingLines.ml_home_open && openingLines.ml_away_open ?
          (mlEdge.best_side === 'home' ? 
            calculateMLCLV('home', openingLines.ml_home_open, closingLines.moneyline.home_price) :
            calculateMLCLV('away', openingLines.ml_away_open, closingLines.moneyline.away_price)
          ) : null;
        
        // V4: Apply market-specific EV thresholds
        const spreadEvGate = config.thresholds?.spread_ev || 0.03;
        const totalEvGate = config.thresholds?.total_ev || 0.03;
        const mlEvGate = config.thresholds?.ml_ev || 0.03;
        
        const spreadPasses = spreadEdge && spreadEdge.probability_edge >= spreadEvGate;
        const totalPasses = totalEdge && totalEdge.probability_edge >= totalEvGate;
        const mlPasses = mlEdge && mlEdge.probability_edge >= mlEvGate;
        
        const hasAnyEdge = spreadPasses || totalPasses || mlPasses;
        
        if (hasAnyEdge) gamesWithEdge++;
        
        allEdges.push({
          game_id: prediction.game_id,
          season: season,
          week: week,
          home_team: prediction.home_team,
          away_team: prediction.away_team,
          spread_edge: spreadEdge ? {
            ...spreadEdge,
            clv: spreadCLV,
            passes_threshold: spreadPasses,
            skip_reason: !spreadPasses ? 'low_ev' : null
          } : null,
          total_edge: totalEdge ? {
            ...totalEdge,
            clv: totalCLV,
            passes_threshold: totalPasses,
            skip_reason: !totalPasses ? 'low_ev' : null
          } : null,
          moneyline_edge: mlEdge ? {
            ...mlEdge,
            clv: mlCLV,
            passes_threshold: mlPasses,
            skip_reason: !mlPasses ? 'low_ev' : null
          } : null,
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
  
  // V4: Calculate CLV summary
  if (config.market_context?.track_line_movement) {
    console.log('\n📊 Calculating CLV summary...');
    const clvData = {
      spread: [],
      total: [],
      moneyline: []
    };
    
    for (const edge of allEdges) {
      if (edge.spread_edge?.clv !== null && edge.spread_edge?.passes_threshold) {
        clvData.spread.push(edge.spread_edge.clv);
      }
      if (edge.total_edge?.clv !== null && edge.total_edge?.passes_threshold) {
        clvData.total.push(edge.total_edge.clv);
      }
      if (edge.moneyline_edge?.clv !== null && edge.moneyline_edge?.passes_threshold) {
        clvData.moneyline.push(edge.moneyline_edge.clv);
      }
    }
    
    const clvSummary = {
      created_at: new Date().toISOString(),
      spread: calculateCLVStats(clvData.spread),
      total: calculateCLVStats(clvData.total),
      moneyline: calculateCLVStats(clvData.moneyline)
    };
    
    const clvFile = path.join(OUTPUT_DIR, 'clv_summary.json');
    await fs.writeFile(clvFile, JSON.stringify(clvSummary, null, 2));
    console.log(`   ✅ CLV summary saved to ${clvFile}`);
  }
  
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

/**
 * Calculate CLV statistics
 */
function calculateCLVStats(clvArray) {
  if (clvArray.length === 0) {
    return { count: 0, positive_pct: 0, mean: 0, median: 0 };
  }
  
  const sorted = [...clvArray].sort((a, b) => a - b);
  const positive = clvArray.filter(v => v > 0).length;
  const mean = clvArray.reduce((sum, v) => sum + v, 0) / clvArray.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  
  return {
    count: clvArray.length,
    positive_count: positive,
    positive_pct: (positive / clvArray.length * 100).toFixed(1),
    mean: mean.toFixed(4),
    median: median.toFixed(4),
    min: sorted[0].toFixed(4),
    max: sorted[sorted.length - 1].toFixed(4)
  };
}

// Run main function
main().catch(error => {
  console.error('\n❌ Fatal Error:', error);
  process.exit(1);
});
