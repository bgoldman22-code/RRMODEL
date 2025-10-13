/**
 * NBA Prediction Generator - Elite Production System
 * 
 * Netlify Function that generates NBA predictions for today's games
 * Uses ensemble models, real-time data, and market odds integration
 */

import { getStore } from '@netlify/blobs';
import { fetchTodaysGames, loadTeamInfo } from '../_lib/nba/loaders.mjs';
import { buildTeamFeatures, buildMatchupFeatures } from '../_lib/nba/features.mjs';
import EnsembleModel from '../_lib/nba/models/ensemble.mjs';

/**
 * Load trained models from blob storage
 */
async function loadModels(store) {
  try {
    const spreadModelData = await store.get('models/nba_spread_model');
    const totalModelData = await store.get('models/nba_total_model');
    
    if (!spreadModelData || !totalModelData) {
      console.log('[NBA] ⚠️  Models not trained yet, using baseline');
      return null;
    }
    
    // In production, deserialize models here
    return {
      spreadModel: JSON.parse(spreadModelData),
      totalModel: JSON.parse(totalModelData)
    };
  } catch (error) {
    console.error('[NBA] Error loading models:', error);
    return null;
  }
}

/**
 * Fetch market odds from TheOddsAPI
 */
async function fetchMarketOdds(games) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      console.log('[NBA] ⚠️  No odds API key, skipping market odds');
      return {};
    }
    
    const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${apiKey}&regions=us&markets=spreads,totals&oddsFormat=american`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    // Map odds by game ID
    const oddsMap = {};
    for (const game of data) {
      oddsMap[game.id] = game.bookmakers;
    }
    
    console.log(`[NBA] ✅ Fetched odds for ${Object.keys(oddsMap).length} games`);
    
    return oddsMap;
  } catch (error) {
    console.error('[NBA] Error fetching odds:', error);
    return {};
  }
}

/**
 * Calculate best available odds across all books
 */
function getBestOdds(bookmakers, market) {
  if (!bookmakers || bookmakers.length === 0) return null;
  
  const allOdds = [];
  
  for (const book of bookmakers) {
    const marketData = book.markets.find(m => m.key === market);
    if (marketData) {
      allOdds.push(...marketData.outcomes);
    }
  }
  
  if (allOdds.length === 0) return null;
  
  // Find best odds for each outcome
  const best = {};
  for (const outcome of allOdds) {
    if (!best[outcome.name] || outcome.price > best[outcome.name].price) {
      best[outcome.name] = outcome;
    }
  }
  
  return best;
}

/**
 * Calculate edge (model prediction vs market)
 */
function calculateEdge(modelPrediction, marketLine) {
  if (!marketLine) return null;
  
  const edge = Math.abs(modelPrediction - marketLine);
  const edgePercent = (edge / Math.abs(marketLine)) * 100;
  
  return {
    edge,
    edgePercent,
    modelFavors: modelPrediction > marketLine ? 'OVER' : 'UNDER'
  };
}

/**
 * Calculate Kelly Criterion bet sizing
 */
function calculateKelly(winProb, odds, fraction = 0.25) {
  // Convert American odds to decimal
  const decimalOdds = odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
  
  // Kelly formula: (bp - q) / b
  // b = decimal odds - 1
  // p = win probability
  // q = lose probability (1 - p)
  const b = decimalOdds - 1;
  const p = winProb;
  const q = 1 - p;
  
  const kelly = (b * p - q) / b;
  
  // Apply fractional Kelly for safety
  const fractionalKelly = Math.max(0, kelly * fraction);
  
  return {
    fullKelly: kelly * 100,
    fractionalKelly: fractionalKelly * 100,
    shouldBet: fractionalKelly > 0.01 // Bet if >1% of bankroll
  };
}

/**
 * Generate predictions for all games
 */
async function generatePredictions(games, models) {
  const predictions = [];
  
  for (const game of games) {
    try {
      console.log(`[NBA] Processing: ${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`);
      
      // Build features
      const [homeFeatures, awayFeatures] = await Promise.all([
        buildTeamFeatures(game.homeTeam.id, game),
        buildTeamFeatures(game.awayTeam.id, game)
      ]);
      
      const matchupFeatures = buildMatchupFeatures(homeFeatures, awayFeatures);
      
      const allFeatures = {
        ...homeFeatures,
        ...awayFeatures,
        ...matchupFeatures
      };
      
      // Get predictions
      let spreadPred, totalPred, confidence;
      
      if (models) {
        const spreadResult = models.spreadModel.predict([allFeatures])[0];
        const totalResult = models.totalModel.predict([allFeatures])[0];
        
        spreadPred = spreadResult.prediction;
        totalPred = totalResult.prediction;
        confidence = (spreadResult.confidence + totalResult.confidence) / 2;
      } else {
        // Baseline prediction using simple features
        spreadPred = homeFeatures.L10_netRating - awayFeatures.L10_netRating + 3.5; // Home advantage
        totalPred = 220; // League average
        confidence = 50;
      }
      
      // Calculate win probability
      const winProb = 1 / (1 + Math.exp(-spreadPred / 10));
      
      predictions.push({
        gameId: game.id,
        game: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
        gameTime: game.date,
        
        // Predictions
        predictedSpread: parseFloat(spreadPred.toFixed(1)),
        predictedTotal: parseFloat(totalPred.toFixed(1)),
        homeWinProb: parseFloat((winProb * 100).toFixed(1)),
        awayWinProb: parseFloat(((1 - winProb) * 100).toFixed(1)),
        
        // Confidence
        confidence: Math.round(confidence),
        
        // Features for transparency
        keyFactors: {
          homeL10NetRating: homeFeatures.L10_netRating?.toFixed(1),
          awayL10NetRating: awayFeatures.L10_netRating?.toFixed(1),
          paceMatchup: matchupFeatures.pace_matchup?.toFixed(1),
          reboundBattle: matchupFeatures.reb_battle?.toFixed(3),
          threePtEdge: matchupFeatures.three_pt_edge?.toFixed(3)
        }
      });
      
    } catch (error) {
      console.error(`[NBA] Error processing game ${game.id}:`, error);
    }
  }
  
  return predictions;
}

/**
 * Integrate market odds and calculate edges
 */
function integrateMarketOdds(predictions, oddsMap) {
  return predictions.map(pred => {
    const odds = oddsMap[pred.gameId];
    
    if (!odds) {
      return { ...pred, marketOdds: null, edge: null };
    }
    
    // Get best spreads and totals
    const spreads = getBestOdds(odds, 'spreads');
    const totals = getBestOdds(odds, 'totals');
    
    let marketSpread = null;
    let marketTotal = null;
    let spreadEdge = null;
    let totalEdge = null;
    
    if (spreads) {
      const homeSpread = Object.values(spreads).find(s => s.name === pred.game.split(' @ ')[1]);
      if (homeSpread) {
        marketSpread = homeSpread.point;
        spreadEdge = calculateEdge(pred.predictedSpread, marketSpread);
      }
    }
    
    if (totals) {
      const overLine = Object.values(totals).find(t => t.name === 'Over');
      if (overLine) {
        marketTotal = overLine.point;
        totalEdge = calculateEdge(pred.predictedTotal, marketTotal);
      }
    }
    
    return {
      ...pred,
      marketOdds: {
        spread: marketSpread,
        total: marketTotal
      },
      edge: {
        spread: spreadEdge,
        total: totalEdge
      }
    };
  });
}

/**
 * Add betting recommendations
 */
function addBettingRecommendations(predictions) {
  return predictions.map(pred => {
    const recommendations = [];
    
    // Spread recommendations
    if (pred.edge?.spread && pred.edge.spread.edgePercent > 5 && pred.confidence > 60) {
      recommendations.push({
        market: 'Spread',
        pick: pred.edge.spread.modelFavors === 'OVER' ? 
          pred.game.split(' @ ')[1] : pred.game.split(' @ ')[0],
        line: pred.marketOdds.spread,
        edge: pred.edge.spread.edge,
        edgePercent: pred.edge.spread.edgePercent,
        confidence: pred.confidence,
        rating: pred.edge.spread.edgePercent > 10 ? '⭐⭐⭐' : 
                pred.edge.spread.edgePercent > 7 ? '⭐⭐' : '⭐'
      });
    }
    
    // Total recommendations
    if (pred.edge?.total && pred.edge.total.edgePercent > 3 && pred.confidence > 55) {
      recommendations.push({
        market: 'Total',
        pick: pred.edge.total.modelFavors,
        line: pred.marketOdds.total,
        edge: pred.edge.total.edge,
        edgePercent: pred.edge.total.edgePercent,
        confidence: pred.confidence,
        rating: pred.edge.total.edgePercent > 8 ? '⭐⭐⭐' : 
                pred.edge.total.edgePercent > 5 ? '⭐⭐' : '⭐'
      });
    }
    
    return {
      ...pred,
      recommendations
    };
  });
}

/**
 * Main handler
 */
export default async (request, context) => {
  try {
    console.log('[NBA] Starting prediction generation...');
    
    const store = getStore('nba-predictions');
    
    // 1. Fetch today's games
    const games = await fetchTodaysGames();
    
    if (games.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        games: [],
        message: 'No games scheduled for today'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`[NBA] Found ${games.length} games`);
    
    // 2. Load models
    const models = await loadModels(store);
    
    // 3. Generate predictions
    let predictions = await generatePredictions(games, models);
    
    // 4. Fetch market odds
    const oddsMap = await fetchMarketOdds(games);
    
    // 5. Calculate edges
    predictions = integrateMarketOdds(predictions, oddsMap);
    
    // 6. Add betting recommendations
    predictions = addBettingRecommendations(predictions);
    
    // 7. Sort by confidence (best picks first)
    predictions.sort((a, b) => {
      const aHasRec = a.recommendations.length > 0;
      const bHasRec = b.recommendations.length > 0;
      
      if (aHasRec && !bHasRec) return -1;
      if (!aHasRec && bHasRec) return 1;
      
      return b.confidence - a.confidence;
    });
    
    // 8. Cache result
    const cacheKey = `predictions_${new Date().toISOString().split('T')[0]}`;
    await store.set(cacheKey, JSON.stringify(predictions), {
      metadata: {
        generated: new Date().toISOString(),
        gamesCount: predictions.length
      }
    });
    
    console.log('[NBA] ✅ Predictions generated successfully');
    
    return new Response(JSON.stringify({
      ok: true,
      generated: new Date().toISOString(),
      games: predictions.length,
      predictions,
      modelStatus: models ? 'trained' : 'baseline'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800'
      }
    });
    
  } catch (error) {
    console.error('[NBA] Error generating predictions:', error);
    
    return new Response(JSON.stringify({
      ok: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
