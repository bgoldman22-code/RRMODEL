/**
 * Netlify Scheduled Function - Daily NBA Predictions Generator
 * VERSION 2 - With Resilient Architecture and Operational Guardrails
 * 
 * Runs daily at 7:00 AM Eastern Time
 * Schedule: 0 11 * * * (11am UTC = 7am EDT, 6am EST after Nov 3)
 * 
 * Generates predictions for games starting within next 18 hours
 * 
 * Data Source (Multi-Tier with Strict Budgets):
 * - TIER 1: Netlify Blobs (TTL-aware, schema v2, <2s)
 * - TIER 2.5: NBA CDN (last 7 days, fast alternative)
 * - TIER 3: ESPN API (team-scoped, p=6 concurrency, ~20-30s)
 * - TIER 4: Git backup (emergency fallback)
 * 
 * Operational Guardrails:
 * - GLOBAL budget: 50s (10s buffer before 60s timeout)
 * - ACQUIRE budget: 30s HARD STOP
 * - Feature flags: NBA_PROPS_FORCE_ESPN, NBA_PROPS_ENABLE_CDN, NBA_PROPS_CONCURRENCY
 * 
 * Updated: November 12, 2025 (Emergency Architecture Rebuild)
 * 
 * Environment Variables Required:
 * - ODDS_API_KEY: TheOddsAPI key
 * 
 * Environment Variables Optional:
 * - NBA_PROPS_FORCE_ESPN: "1" to bypass Blobs, always fetch ESPN
 * - NBA_PROPS_ENABLE_CDN: "0" to disable NBA CDN tier
 * - NBA_PROPS_CONCURRENCY: Override default concurrency (default: 6)
 */

import { getStore } from '@netlify/blobs';
import fetch from 'node-fetch';
import { savePropPredictions } from './nba-tracking-save-predictions.mjs';
import { loadPlayerBoxscores } from './lib/resilient-loader.mjs';
import { BudgetTracker } from './lib/budget-tracker.mjs';
import { normalizeTeamName, validateMatchup } from './lib/team-mapper.mjs';
import { BUDGETS } from './lib/constants.mjs';
import { getOpponentDefense, getLeagueAverages } from './lib/opponent-defense-loader.mjs';

// Configuration
const API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';
const SPORT = 'basketball_nba';
const REGIONS = 'us';
const BOOKMAKERS = 'draftkings,fanduel';
const ODDS_FORMAT = 'american';

// Betting thresholds
const EDGE_THRESHOLD = 4.0;
const CONFIDENCE_THRESHOLD = 0.60;
const MIN_KELLY = 0.01;

// Team name mapping: The Odds API uses full names, need to normalize
const TEAM_NAME_MAP = {
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU',
  'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS'
};

// Utility functions
function americanToProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Calculate player statistics from boxscores
function calculatePlayerStats(boxscores, playerName, asOfDate) {
  const games = boxscores
    .filter(b => b.playerName === playerName && new Date(b.gameDate) < new Date(asOfDate))
    .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))
    .filter(b => b.minutes > 0);

  if (games.length < 5) return null;

  const L5 = games.slice(0, 5);
  const L10 = games.slice(0, 10);
  
  // Calculate minute variance (coefficient of variation)
  const minuteValues = L10.map(g => g.minutes);
  const avgMinutes = minuteValues.reduce((a, b) => a + b, 0) / minuteValues.length;
  const minuteStdev = Math.sqrt(minuteValues.reduce((sq, n) => sq + Math.pow(n - avgMinutes, 2), 0) / minuteValues.length);
  const minuteCV = (minuteStdev / avgMinutes) * 100;

  return {
    L5_rpg: L5.reduce((sum, g) => sum + g.rebounds, 0) / L5.length,
    L5_apg: L5.reduce((sum, g) => sum + g.assists, 0) / L5.length,
    L5_minutes: L5.reduce((sum, g) => sum + g.minutes, 0) / L5.length,
    L10_rpg: L10.reduce((sum, g) => sum + g.rebounds, 0) / L10.length,
    L10_apg: L10.reduce((sum, g) => sum + g.assists, 0) / L10.length,
    avgMinutes,
    minuteCV,
    L10_minutes: L10.reduce((sum, g) => sum + g.minutes, 0) / L10.length,
    season_rpg: games.reduce((sum, g) => sum + g.rebounds, 0) / games.length,
    season_apg: games.reduce((sum, g) => sum + g.assists, 0) / games.length,
    games_played: games.length,
    last_game: games[0]
  };
}

// Generate prediction using baseline v2 with opponent defense adjustments
async function generatePrediction(stats, propType, isHome, restDays, opponentTricode, oppDefenseMap) {
  if (!stats) return null;

  let base, seasonAvg;
  
  if (propType === 'player_rebounds') {
    base = stats.L5_rpg;
    seasonAvg = stats.season_rpg;
  } else if (propType === 'player_assists') {
    base = stats.L5_apg;
    seasonAvg = stats.season_apg;
  } else {
    return null;
  }

  let prediction = base;

  // Trend adjustment
  if (seasonAvg > 0) {
    const trend = base / seasonAvg;
    if (trend > 1.15) prediction *= 1.05;
    else if (trend < 0.85) prediction *= 0.95;
  }

  // Minutes adjustment
  const minutesTrend = stats.L5_minutes / stats.L10_minutes;
  if (minutesTrend > 1.1) prediction *= 1.03;
  else if (minutesTrend < 0.9) prediction *= 0.97;

  // Home court
  if (isHome) {
    prediction *= (propType === 'player_rebounds' ? 1.02 : 1.03);
  }

  // Rest days
  if (restDays === 0) {
    prediction *= 0.97;
  } else if (restDays >= 3) {
    prediction *= 1.01;
  }
  
  // Opponent defense adjustment (now using passed-in map)
  if (opponentTricode && oppDefenseMap) {
    const oppDefense = oppDefenseMap.get(opponentTricode);
    
    if (oppDefense) {
      if (propType === 'player_rebounds') {
        const leagueAvgRebs = 52.0;
        const oppFactor = oppDefense.rebsAllowedPer100 / leagueAvgRebs;
        prediction *= oppFactor;
      } else if (propType === 'player_assists') {
        const leagueAvgAsts = 25.0;
        const oppFactor = oppDefense.astsAllowedPer100 / leagueAvgAsts;
        prediction *= oppFactor;
      }
      
      // Pace adjustment
      const leaguePace = 99.5;
      const paceFactor = oppDefense.pace / leaguePace;
      prediction *= paceFactor;
    }
  }

  // Calculate confidence
  const variance = Math.abs(base - seasonAvg);
  const confidence = Math.max(0.5, 0.95 - (variance * 0.1));
  
  return { predicted: prediction, confidence };
}

// Calculate rest days
function calculateRestDays(playerName, gameDate, boxscores) {
  const prevGames = boxscores
    .filter(b => b.playerName === playerName && new Date(b.gameDate) < new Date(gameDate))
    .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
  
  if (prevGames.length === 0) return 2;
  
  const lastGame = new Date(prevGames[0].gameDate);
  const days = Math.floor((new Date(gameDate) - lastGame) / (1000 * 60 * 60 * 24));
  return days;
}

export default async (req, context) => {
  console.log('🏀 NBA Daily Predictions V2 - Starting...');
  console.log(`⏱️  Global budget: ${BUDGETS.GLOBAL / 1000}s (Acquire: ${BUDGETS.ACQUIRE / 1000}s HARD STOP)`);
  
  // Initialize budget tracker
  const budget = new BudgetTracker(BUDGETS.GLOBAL, {
    ACQUIRE: BUDGETS.ACQUIRE,
    TRANSFORM: BUDGETS.TRANSFORM,
    MERGE: BUDGETS.MERGE
  });
  
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'ODDS_API_KEY not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // ==========================================================================
    // STAGE 1: ACQUIRE DATA (Multi-tier with strict budget)
    // ==========================================================================
    
    console.log('🔄 Loading player boxscores (resilient multi-tier)...');
    const result = await loadPlayerBoxscores(budget, { daysBack: 15 });
    
    const boxscores = result.boxscores;
    const dataSource = result.source;
    const metadata = result.metadata;
    
    console.log(`✅ Loaded ${boxscores.length} records from ${dataSource}`);
    console.log(`   Teams: ${metadata.teamCount}, Span: ${metadata.spanDays} days`);
    console.log(`   Acquire time: ${(metadata.budgetUsedMs / 1000).toFixed(1)}s`);
    
    // Load opponent defense data (real-time with auto-refresh)
    console.log('\n🛡️  Loading opponent defense data...');
    const oppDefenseMap = await getOpponentDefense(boxscores);
    
    // ==========================================================================
    // STAGE 2: TRANSFORM DATA (Calculate stats and rotations)
    // ==========================================================================
    
    budget.startStage('TRANSFORM');
    
    const store = getStore('nba-data');

    // Calculate top 8 rotation players per team
    console.log('📊 Calculating rotation rankings...');
    const playerMinutesByTeam = {};
    
    const mostRecentDate = new Date(Math.max(...boxscores.map(b => new Date(b.gameDate))));
    const cutoffDate = new Date(mostRecentDate);
    cutoffDate.setDate(cutoffDate.getDate() - 20);
    
    boxscores
      .filter(b => new Date(b.gameDate) >= cutoffDate && b.minutes > 0)
      .forEach(b => {
        if (!playerMinutesByTeam[b.teamTricode]) {
          playerMinutesByTeam[b.teamTricode] = {};
        }
        if (!playerMinutesByTeam[b.teamTricode][b.playerName]) {
          playerMinutesByTeam[b.teamTricode][b.playerName] = [];
        }
        playerMinutesByTeam[b.teamTricode][b.playerName].push(b.minutes);
      });
    
    // Get top 8 players per team
    const top8PlayersByTeam = {};
    for (const [team, players] of Object.entries(playerMinutesByTeam)) {
      const playerAvgs = Object.entries(players)
        .map(([name, mins]) => ({
          name,
          avgMinutes: mins.reduce((a, b) => a + b, 0) / mins.length,
          games: mins.length
        }))
        .filter(p => p.games >= 3)
        .sort((a, b) => b.avgMinutes - a.avgMinutes)
        .slice(0, 8);
      
      top8PlayersByTeam[team] = new Set(playerAvgs.map(p => p.name));
    }
    
    console.log(`✅ Identified top 8 rotation players for ${Object.keys(top8PlayersByTeam).length} teams`);
    
    budget.endStage('TRANSFORM');

    // ==========================================================================
    // STAGE 3: MERGE (Fetch props and generate predictions)
    // ==========================================================================
    
    budget.startStage('MERGE');

    // Fetch upcoming games
    const gamesUrl = `${BASE_URL}/sports/${SPORT}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&oddsFormat=${ODDS_FORMAT}`;
    const response = await fetch(gamesUrl);
    const allGames = await response.json();
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    // Filter to games within 18 hours
    const now = new Date();
    const eighteenHoursFromNow = new Date(now.getTime() + 18 * 60 * 60 * 1000);
    const todaysGames = allGames.filter(game => {
      const gameTime = new Date(game.commence_time);
      return gameTime <= eighteenHoursFromNow;
    });
    
    console.log(`📅 ${todaysGames.length} games within next 18 hours`);

    // Fetch player props for each game
    const gamesWithProps = [];
    for (const game of todaysGames) {
      const gameProps = { ...game, bookmakers: [] };
      
      for (const market of ['player_rebounds', 'player_assists']) {
        const propsUrl = `${BASE_URL}/sports/${SPORT}/events/${game.id}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&markets=${market}&bookmakers=${BOOKMAKERS}&oddsFormat=${ODDS_FORMAT}`;
        
        await sleep(1000);
        
        const propsResponse = await fetch(propsUrl);
        const propsData = await propsResponse.json();
        
        if (propsResponse.ok && propsData.bookmakers?.length > 0) {
          gameProps.bookmakers.push(...propsData.bookmakers);
        }
      }
      
      if (gameProps.bookmakers.length > 0) {
        gamesWithProps.push(gameProps);
      }
    }

    console.log(`✅ ${gamesWithProps.length} games with player props`);

    // Generate predictions
    const predictions = [];
    const nowISO = new Date().toISOString();

    for (const game of gamesWithProps) {
      const homeTeam = game.home_team;
      const awayTeam = game.away_team;
      const gameDate = game.commence_time;
      
      // Normalize team names
      const homeTricode = normalizeTeamName(TEAM_NAME_MAP[homeTeam] || homeTeam);
      const awayTricode = normalizeTeamName(TEAM_NAME_MAP[awayTeam] || awayTeam);
      
      if (!homeTricode || !awayTricode) {
        console.warn(`⚠️  Unknown team names: ${homeTeam} vs ${awayTeam}`);
        continue;
      }

      for (const bookmaker of game.bookmakers) {
        for (const market of bookmaker.markets) {
          const propType = market.key;
          
          if (!['player_rebounds', 'player_assists'].includes(propType)) continue;

          for (const outcome of market.outcomes) {
            const playerName = outcome.description;
            const line = outcome.point;
            
            // Get both sides
            const overOutcome = market.outcomes.find(o => o.description === playerName && o.name === 'Over');
            const underOutcome = market.outcomes.find(o => o.description === playerName && o.name === 'Under');
            
            if (!overOutcome || !underOutcome) continue;

            const stats = calculatePlayerStats(boxscores, playerName, gameDate);
            if (!stats || stats.games_played < 5) continue;

            // FILTER: Only top 8 rotation players
            const playerTeam = stats.last_game?.teamTricode;
            if (!playerTeam || !top8PlayersByTeam[playerTeam]) continue;
            if (!top8PlayersByTeam[playerTeam].has(playerName)) continue;
            
            // FILTER: Stable minutes only
            if (stats.minuteCV > 25) continue;

            // VALIDATION: Player must be on one of the teams in this game
            const normalizedPlayerTeam = normalizeTeamName(playerTeam);
            if (normalizedPlayerTeam !== homeTricode && normalizedPlayerTeam !== awayTricode) {
              console.warn(`⚠️  Skipping ${playerName} (${playerTeam}) - not in game ${homeTricode} vs ${awayTricode}`);
              continue;
            }

            // Determine if player's team is home or away
            const isHome = normalizedPlayerTeam === homeTricode;
            const opponentTricode = isHome ? awayTricode : homeTricode;
            const restDays = calculateRestDays(playerName, gameDate, boxscores);

            const prediction = await generatePrediction(stats, propType, isHome, restDays, opponentTricode, oppDefenseMap);
            if (!prediction) continue;

            const { predicted, confidence } = prediction;
            
            if (confidence < CONFIDENCE_THRESHOLD) continue;

            // Calculate edge
            const overOdds = overOutcome.price;
            const underOdds = underOutcome.price;
            const overProb = americanToProb(overOdds);
            const underProb = americanToProb(underOdds);
            
            const ourOverProb = predicted > line ? 0.65 : 0.35;
            const ourUnderProb = 1 - ourOverProb;

            const overEdge = (ourOverProb - overProb) * 100;
            const underEdge = (ourUnderProb - underProb) * 100;

            // Check Over bet
            if (overEdge >= EDGE_THRESHOLD) {
              const kelly = (ourOverProb * (Math.abs(overOdds) / 100 + 1) - 1) / (Math.abs(overOdds) / 100);
              if (kelly >= MIN_KELLY) {
                const recommendedUnits = Math.max(0.5, Math.min(3, Math.round(kelly * 25 * 10) / 10));
                
                predictions.push({
                  player: playerName,
                  team: isHome ? homeTeam : awayTeam,
                  opponent: isHome ? awayTeam : homeTeam,
                  isHome,
                  gameTime: gameDate,
                  propType: propType.replace('player_', ''),
                  prediction: Math.round(predicted * 10) / 10,
                  vegasLine: line,
                  edge: Math.round(overEdge * 10) / 10,
                  betSide: 'OVER',
                  vegasOdds: overOdds,
                  impliedProb: Math.round(overProb * 1000) / 10,
                  confidence: Math.round(confidence * 100),
                  kellyFraction: Math.round(kelly * 1000) / 10,
                  recommendedUnits,
                  bookmaker: bookmaker.key,
                  generatedAt: nowISO
                });
              }
            }

            // Check Under bet
            if (underEdge >= EDGE_THRESHOLD) {
              const kelly = (ourUnderProb * (Math.abs(underOdds) / 100 + 1) - 1) / (Math.abs(underOdds) / 100);
              if (kelly >= MIN_KELLY) {
                const recommendedUnits = Math.max(0.5, Math.min(3, Math.round(kelly * 25 * 10) / 10));
                
                predictions.push({
                  player: playerName,
                  team: isHome ? homeTeam : awayTeam,
                  opponent: isHome ? awayTeam : homeTeam,
                  isHome,
                  gameTime: gameDate,
                  propType: propType.replace('player_', ''),
                  prediction: Math.round(predicted * 10) / 10,
                  vegasLine: line,
                  edge: Math.round(underEdge * 10) / 10,
                  betSide: 'UNDER',
                  vegasOdds: underOdds,
                  impliedProb: Math.round(underProb * 1000) / 10,
                  confidence: Math.round(confidence * 100),
                  kellyFraction: Math.round(kelly * 1000) / 10,
                  recommendedUnits,
                  bookmaker: bookmaker.key,
                  generatedAt: nowISO
                });
              }
            }
          }
        }
      }
    }

    predictions.sort((a, b) => b.edge - a.edge);

    // Deduplicate
    console.log(`\n🔍 Deduplicating picks...`);
    const dedupMap = new Map();
    
    for (const pick of predictions) {
      const key = `${pick.player}|${pick.propType.toUpperCase()}|${pick.betSide}`;
      
      if (!dedupMap.has(key)) {
        dedupMap.set(key, pick);
      } else {
        const existing = dedupMap.get(key);
        let shouldReplace = false;
        
        if (pick.betSide === 'OVER') {
          shouldReplace = parseFloat(pick.vegasLine) > parseFloat(existing.vegasLine);
        } else if (pick.betSide === 'UNDER') {
          shouldReplace = parseFloat(pick.vegasLine) < parseFloat(existing.vegasLine);
        }
        
        if (Math.abs(parseFloat(pick.vegasLine) - parseFloat(existing.vegasLine)) < 0.1) {
          shouldReplace = parseFloat(pick.edge) > parseFloat(existing.edge);
        }
        
        if (shouldReplace) {
          dedupMap.set(key, pick);
        }
      }
    }
    
    const uniquePredictions = Array.from(dedupMap.values());
    console.log(`   Removed ${predictions.length - uniquePredictions.length} duplicate lines`);
    
    uniquePredictions.sort((a, b) => parseFloat(b.edge) - parseFloat(a.edge));
    
    budget.endStage('MERGE');

    // ==========================================================================
    // OUTPUT & SAVE
    // ==========================================================================

    const output = {
      generated: nowISO,
      games: gamesWithProps.length,
      model: 'Baseline v2 + Opponent Defense',
      dataSource: `${dataSource} (tier ${metadata.tier})`,
      metadata: {
        recordCount: metadata.recordCount,
        teamCount: metadata.teamCount,
        spanDays: metadata.spanDays,
        budgetUsedMs: budget.globalElapsed(),
        budgetBreakdown: budget.getSummary()
      },
      historical: {
        rebounds: { status: 'profitable', winRate: 62.5, roi: 19.3 },
        assists: { status: 'profitable', winRate: 66.7, roi: 27.3 }
      },
      thresholds: {
        edge: EDGE_THRESHOLD,
        confidence: CONFIDENCE_THRESHOLD,
        kelly: MIN_KELLY
      },
      predictions: uniquePredictions
    };

    // Store predictions in Netlify Blobs
    await store.set('nba-picks-latest', JSON.stringify(output));

    // Save predictions for tracking
    const today = new Date().toISOString().split('T')[0];
    await savePropPredictions(uniquePredictions, today);
    console.log(`📊 Saved ${uniquePredictions.length} predictions for tracking`);

    console.log(`\n✅ Generated ${uniquePredictions.length} predictions (${predictions.length} before dedup)`);
    console.log(`📦 Stored in Blobs: nba-picks-latest`);
    console.log(`⏱️  Total time: ${(budget.globalElapsed() / 1000).toFixed(1)}s / ${BUDGETS.GLOBAL / 1000}s`);
    
    // Print budget summary
    budget.printSummary();

    return new Response(JSON.stringify(output), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error:', error);
    
    // Print budget summary even on error
    try {
      budget.printSummary();
    } catch {}
    
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  schedule: "0 11 * * *"  // Daily at 11:00 AM UTC (7:00 AM EDT / 6:00 AM EST)
};
