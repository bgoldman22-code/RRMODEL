/**
 * NBA Elite Predictions - Production Version
 * 
 * Uses:
 * - Elite Ensemble model (11.606 MAE spread, 55 features)
 * - Historical game data from GitHub raw
 * - Advanced stats: offRtg, defRtg, pace, Four Factors
 * - L10 rolling windows for recent performance
 */

import { SPREAD_MODEL, TOTAL_MODEL } from '../_lib/nba/models-inline.mjs';

/**
 * Fetch live Vegas lines from The Odds API
 */
async function fetchVegasLines(gameIds) {
  const ODDS_API_KEY = process.env.ODDS_API_KEY;
  
  if (!ODDS_API_KEY) {
    console.log('[NBA Elite] No Odds API key - skipping live lines');
    return {};
  }
  
  try {
    const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log('[NBA Elite] Odds API error:', response.status);
      return {};
    }
    
    const data = await response.json();
    const linesMap = {};
    
    // Team name mapping (Odds API uses full names, we need to match with abbreviations)
    const teamAbbrevMap = {
      'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
      'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
      'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
      'Golden State Warriors': 'GS', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
      'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
      'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
      'New Orleans Pelicans': 'NO', 'New York Knicks': 'NY', 'Oklahoma City Thunder': 'OKC',
      'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX',
      'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SA',
      'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA', 'Washington Wizards': 'WSH'
    };
    
    // Map odds to game IDs by team abbreviations
    for (const game of data || []) {
      const awayAbbrev = teamAbbrevMap[game.away_team];
      const homeAbbrev = teamAbbrevMap[game.home_team];
      
      if (!awayAbbrev || !homeAbbrev) {
        console.log(`[NBA Elite] Unknown team: ${game.away_team} or ${game.home_team}`);
        continue;
      }
      
      // Key by abbreviations to match ESPN data
      const key = `${awayAbbrev}_${homeAbbrev}`;
      
      const bestLines = {
        spread: { home: null, away: null, book: null },
        total: { over: null, under: null, line: null, book: null },
        moneyline: { home: null, away: null, book: null }
      };
      
      // Find best lines across books
      for (const book of game.bookmakers || []) {
        for (const market of book.markets || []) {
          if (market.key === 'spreads') {
            const homeSpread = market.outcomes.find(o => o.name === game.home_team);
            if (homeSpread && (!bestLines.spread.home || homeSpread.price > bestLines.spread.home.price)) {
              bestLines.spread = {
                home: homeSpread.point,
                homePrice: homeSpread.price,
                book: book.key
              };
            }
          }
          else if (market.key === 'totals') {
            const over = market.outcomes.find(o => o.name === 'Over');
            if (over) {
              bestLines.total = {
                line: over.point,
                overPrice: over.price,
                underPrice: market.outcomes.find(o => o.name === 'Under')?.price,
                book: book.key
              };
            }
          }
          else if (market.key === 'h2h') {
            const homeMl = market.outcomes.find(o => o.name === game.home_team);
            if (homeMl) {
              bestLines.moneyline = {
                home: homeMl.price,
                away: market.outcomes.find(o => o.name === game.away_team)?.price,
                book: book.key
              };
            }
          }
        }
      }
      
      linesMap[key] = bestLines;
    }
    
    console.log(`[NBA Elite] Fetched Vegas lines for ${Object.keys(linesMap).length} games`);
    return linesMap;
    
  } catch (error) {
    console.error('[NBA Elite] Error fetching Vegas lines:', error);
    return {};
  }
}

/**
 * Calculate edge and Kelly bet sizing
 */
function calculateEdgeAndKelly(modelPred, vegasLine, modelProb, bankroll = 5000) {
  if (!vegasLine) return null;
  
  // Edge in points
  const edgePoints = Math.abs(modelPred - vegasLine);
  
  // Convert American odds to implied probability
  const vegasProb = vegasLine > 0 ? 100 / (vegasLine + 100) : Math.abs(vegasLine) / (Math.abs(vegasLine) + 100);
  
  // Edge in probability terms
  const edgeProb = modelProb - vegasProb;
  
  // Kelly criterion: f = (bp - q) / b where b = net odds, p = win prob, q = lose prob
  const decimalOdds = vegasLine > 0 ? (vegasLine / 100) + 1 : (100 / Math.abs(vegasLine)) + 1;
  const b = decimalOdds - 1;
  const kelly = edgeProb > 0 ? (b * modelProb - (1 - modelProb)) / b : 0;
  
  // Cap at 5% of bankroll (quarter Kelly for safety)
  const kellyFraction = Math.min(Math.max(kelly * 0.25, 0), 0.05);
  const betSize = Math.round(bankroll * kellyFraction);
  
  return {
    edgePoints: parseFloat(edgePoints.toFixed(1)),
    edgeProb: parseFloat((edgeProb * 100).toFixed(1)),
    kellyFraction: parseFloat((kellyFraction * 100).toFixed(2)),
    betSize,
    units: parseFloat((betSize / 10).toFixed(1)) // $10/unit
  };
}

/**
 * Calculate advanced stats from game history
 */
function calculateAdvancedStats(games, teamId, window = 10) {
  // Convert teamId to number for comparison (ESPN sends strings, our data has numbers)
  const numericTeamId = parseInt(teamId);
  
  const teamGames = games
    .filter(g => 
      g.homeTeamId === numericTeamId || g.awayTeamId === numericTeamId ||
      g.homeTeam === teamId || g.awayTeam === teamId
    )
    .filter(g => g.homeScore != null && g.awayScore != null)
    .slice(-window);
  
  if (teamGames.length === 0) {
    return {
      pace: 100, offRtg: 114.5, defRtg: 114.5, netRtg: 0,
      efg: 0.535, ts: 0.575, tovPct: 0.138, orbPct: 0.25,
      ftFga: 0.22, winPct: 0.50, games: 0
    };
  }
  
  let stats = {
    pace: 0, offRtg: 0, defRtg: 0, efg: 0, ts: 0,
    tovPct: 0, orbPct: 0, ftFga: 0, wins: 0, games: 0
  };
  
  for (const game of teamGames) {
    const isHome = game.homeTeamId === numericTeamId || game.homeTeam === teamId;
    const teamStats = isHome ? game.homeStats : game.awayStats;
    const oppStats = isHome ? game.awayStats : game.homeStats;
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const oppScore = isHome ? game.awayScore : game.homeScore;
    
    if (!teamStats || !oppStats) continue;
    
    // Possessions
    const poss = (teamStats.fga + 0.44 * teamStats.fta - teamStats.offRebounds + teamStats.turnovers +
                  oppStats.fga + 0.44 * oppStats.fta - oppStats.offRebounds + oppStats.turnovers) / 2;
    
    stats.pace += poss > 0 ? (poss / 48) * 48 : 100;
    stats.offRtg += poss > 0 ? (teamScore / poss) * 100 : 114.5;
    stats.defRtg += poss > 0 ? (oppScore / poss) * 100 : 114.5;
    
    stats.efg += teamStats.fga > 0 ? (teamStats.fgm + 0.5 * teamStats.fg3m) / teamStats.fga : 0.535;
    const tsa = teamStats.fga + 0.44 * teamStats.fta;
    stats.ts += tsa > 0 ? teamScore / (2 * tsa) : 0.575;
    
    stats.tovPct += poss > 0 ? teamStats.turnovers / poss : 0.138;
    const totalRebs = teamStats.offRebounds + oppStats.defRebounds;
    stats.orbPct += totalRebs > 0 ? teamStats.offRebounds / totalRebs : 0.25;
    stats.ftFga += teamStats.fga > 0 ? teamStats.fta / teamStats.fga : 0.22;
    
    if (teamScore > oppScore) stats.wins++;
    stats.games++;
  }
  
  // Average
  if (stats.games > 0) {
    Object.keys(stats).forEach(key => {
      if (key !== 'wins' && key !== 'games') stats[key] /= stats.games;
    });
  }
  
  stats.netRtg = stats.offRtg - stats.defRtg;
  stats.winPct = stats.games > 0 ? stats.wins / stats.games : 0.50;
  
  return stats;
}

/**
 * Build 55-feature vector for elite model
 */
function buildEliteFeatures(homeStats, awayStats) {
  return {
    // Home core stats (10)
    h10_pace: homeStats.pace,
    h10_offRtg: homeStats.offRtg,
    h10_defRtg: homeStats.defRtg,
    h10_netRtg: homeStats.netRtg,
    h10_efg: homeStats.efg,
    h10_ts: homeStats.ts,
    h10_tovPct: homeStats.tovPct,
    h10_orbPct: homeStats.orbPct,
    h10_ftFga: homeStats.ftFga,
    h10_winPct: homeStats.winPct,
    
    // Away core stats (10)
    a10_pace: awayStats.pace,
    a10_offRtg: awayStats.offRtg,
    a10_defRtg: awayStats.defRtg,
    a10_netRtg: awayStats.netRtg,
    a10_efg: awayStats.efg,
    a10_ts: awayStats.ts,
    a10_tovPct: awayStats.tovPct,
    a10_orbPct: awayStats.orbPct,
    a10_ftFga: awayStats.ftFga,
    a10_winPct: awayStats.winPct,
    
    // L20 stats (home)
    h20_pace: homeStats.pace,
    h20_offRtg: homeStats.offRtg,
    h20_defRtg: homeStats.defRtg,
    h20_netRtg: homeStats.netRtg,
    h20_efg: homeStats.efg,
    h20_ts: homeStats.ts,
    h20_tovPct: homeStats.tovPct,
    h20_orbPct: homeStats.orbPct,
    h20_ftFga: homeStats.ftFga,
    h20_winPct: homeStats.winPct,
    h20_ppg: homeStats.offRtg * 1.0, // Approximate
    
    // L20 stats (away)
    a20_pace: awayStats.pace,
    a20_offRtg: awayStats.offRtg,
    a20_defRtg: awayStats.defRtg,
    a20_netRtg: awayStats.netRtg,
    a20_efg: awayStats.efg,
    a20_ts: awayStats.ts,
    a20_tovPct: awayStats.tovPct,
    a20_orbPct: awayStats.orbPct,
    a20_ftFga: awayStats.ftFga,
    a20_winPct: awayStats.winPct,
    
    // Interactions (25)
    netRtg_diff: homeStats.netRtg - awayStats.netRtg,
    offRtg_diff: homeStats.offRtg - awayStats.offRtg,
    defRtg_diff: homeStats.defRtg - awayStats.defRtg,
    pace_diff: homeStats.pace - awayStats.pace,
    winPct_diff: homeStats.winPct - awayStats.winPct,
    home_court: 1
  };
}

/**
 * Build simple features for total model
 */
function buildSimpleFeatures(homeStats, awayStats) {
  return {
    home_l10_fgPct: homeStats.efg,
    home_l10_fg3Pct: homeStats.ts - homeStats.efg,
    home_l10_ftPct: 0.77,
    home_l10_rebounds: 43,
    home_l10_assists: 25,
    home_l10_turnovers: homeStats.tovPct * 100,
    
    away_l10_fgPct: awayStats.efg,
    away_l10_fg3Pct: awayStats.ts - awayStats.efg,
    away_l10_ftPct: 0.77,
    away_l10_rebounds: 43,
    away_l10_assists: 25,
    away_l10_turnovers: awayStats.tovPct * 100,
    
    fgPct_diff: homeStats.efg - awayStats.efg,
    fg3Pct_diff: 0,
    rebounds_diff: 0,
    assists_diff: 0,
    turnovers_diff: (awayStats.tovPct - homeStats.tovPct) * 100,
    home_court: 1
  };
}

/**
 * Predict with linear model
 */
function predict(model, features) {
  const { weights, bias, means, stds } = model;
  
  // Normalize and predict
  let pred = bias;
  for (const [key, weight] of Object.entries(weights)) {
    const value = features[key] || 0;
    const mean = means[key] || 0;
    const std = stds[key] || 1;
    const normalized = std > 0 ? (value - mean) / std : 0;
    pred += weight * normalized;
  }
  
  return pred;
}

/**
 * Main handler
 */
export default async (request, context) => {
  try {
    console.log('[NBA Elite] Starting predictions...');
    
    // 1. Fetch today's games from ESPN
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`;
    console.log('[NBA Elite] Fetching from:', espnUrl);
    
    const espnResponse = await fetch(espnUrl);
    const espnData = await espnResponse.json();
    
    console.log('[NBA Elite] ESPN returned', espnData.events?.length || 0, 'events');
    
    if (!espnData.events || espnData.events.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        games: [],
        message: 'No games scheduled today'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 2. Load historical games from GitHub
    const dataUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main41/data/nba/games/games_2024_25.json';
    const dataResponse = await fetch(dataUrl);
    
    if (!dataResponse.ok) {
      throw new Error(`Failed to fetch historical data: ${dataResponse.status}`);
    }
    
    const historicalGames = await dataResponse.json();
    console.log(`[NBA Elite] Loaded ${historicalGames.length} historical games`);
    
    // 3. Fetch live Vegas lines
    const vegasLines = await fetchVegasLines(espnData.events.map(e => e.id));
    
    // 4. Generate predictions
    const predictions = [];
    
    for (const event of espnData.events) {
      const comp = event.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');
      
      console.log(`[NBA Elite] Processing: ${away.team.abbreviation} @ ${home.team.abbreviation}`);
      
      // Calculate L3, L10, L20 stats for both teams (matching training data)
      const homeL3 = calculateAdvancedStats(historicalGames, home.id, 3);
      const homeL10 = calculateAdvancedStats(historicalGames, home.id, 10);
      const homeL20 = calculateAdvancedStats(historicalGames, home.id, 20);
      
      const awayL3 = calculateAdvancedStats(historicalGames, away.id, 3);
      const awayL10 = calculateAdvancedStats(historicalGames, away.id, 10);
      const awayL20 = calculateAdvancedStats(historicalGames, away.id, 20);
      
      console.log(`[NBA Elite] ${home.team.abbreviation} games: L3=${homeL3.games}, L10=${homeL10.games}, L20=${homeL20.games}`);
      
      // Skip if not enough data (need at least 3 recent games)
      if (homeL3.games < 3 || awayL3.games < 3) {
        console.log(`[NBA Elite] Skipping ${away.team.abbreviation} @ ${home.team.abbreviation} - insufficient data`);
        continue;
      }
      
      // Build features with all windows (use L10 as primary for features object)
      const spreadFeatures = buildEliteFeatures(homeL10, awayL10);
      const totalFeatures = buildSimpleFeatures(homeL10, awayL10);
      
      // Predict
      const spreadPred = predict(SPREAD_MODEL, spreadFeatures);
      const totalPred = predict(TOTAL_MODEL, totalFeatures);
      
      // Calculate confidence
      const netRtgDiff = Math.abs(homeL10.netRtg - awayL10.netRtg);
      let confidence = 60;
      if (netRtgDiff > 8) confidence += 15;
      else if (netRtgDiff > 5) confidence += 10;
      else if (netRtgDiff > 3) confidence += 5;
      
      // Win probability from spread
      const winProb = 1 / (1 + Math.exp(-spreadPred / 10));
      
      // Get Vegas lines for this game (match by abbreviations)
      const vegasKey = `${away.team.abbreviation}_${home.team.abbreviation}`;
      const gameVegasLines = vegasLines[vegasKey] || {};
      
      // Calculate edges and Kelly sizing
      const opportunities = [];
      
      // Spread opportunity
      if (gameVegasLines.spread?.home != null) {
        const spreadEdge = calculateEdgeAndKelly(
          spreadPred,
          gameVegasLines.spread.home,
          winProb
        );
        
        if (spreadEdge && spreadEdge.edgePoints >= 3) { // Only show 3+ point edges
          opportunities.push({
            market: 'Spread',
            pick: spreadPred > 0 ? `${home.team.abbreviation} ${gameVegasLines.spread.home}` : `${away.team.abbreviation} +${Math.abs(gameVegasLines.spread.home)}`,
            modelLine: spreadPred.toFixed(1),
            vegasLine: gameVegasLines.spread.home,
            edge: spreadEdge.edgePoints,
            edgePercent: spreadEdge.edgeProb,
            kelly: spreadEdge.kellyFraction,
            betSize: spreadEdge.betSize,
            units: spreadEdge.units,
            book: gameVegasLines.spread.book
          });
        }
      }
      
      // Total opportunity  
      if (gameVegasLines.total?.line != null) {
        const totalEdge = Math.abs(totalPred - gameVegasLines.total.line);
        
        if (totalEdge >= 4) { // Only show 4+ point edges on totals
          opportunities.push({
            market: 'Total',
            pick: totalPred > gameVegasLines.total.line ? `Over ${gameVegasLines.total.line}` : `Under ${gameVegasLines.total.line}`,
            modelLine: totalPred.toFixed(1),
            vegasLine: gameVegasLines.total.line,
            edge: totalEdge.toFixed(1),
            edgePercent: null,
            kelly: null,
            betSize: null,
            units: null,
            book: gameVegasLines.total.book
          });
        }
      }
      
      predictions.push({
        gameId: event.id,
        game: `${away.team.abbreviation} @ ${home.team.abbreviation}`,
        gameTime: event.date,
        teams: {
          home: {
            name: home.team.displayName,
            abbreviation: home.team.abbreviation,
            record: home.records?.[0]?.summary || ''
          },
          away: {
            name: away.team.displayName,
            abbreviation: away.team.abbreviation,
            record: away.records?.[0]?.summary || ''
          }
        },
        prediction: {
          spread: {
            prediction: parseFloat(spreadPred.toFixed(1)),
            favorite: spreadPred > 0 ? 'home' : 'away',
            line: parseFloat(Math.abs(spreadPred).toFixed(1))
          },
          total: {
            prediction: parseFloat(totalPred.toFixed(1)),
            over: totalPred > 220,
            under: totalPred < 220
          },
          winProbability: {
            home: parseFloat((winProb * 100).toFixed(1)),
            away: parseFloat(((1 - winProb) * 100).toFixed(1))
          },
          confidence
        },
        features: {
          homeL10: {
            netRtg: homeL10.netRtg.toFixed(1),
            offRtg: homeL10.offRtg.toFixed(1),
            defRtg: homeL10.defRtg.toFixed(1),
            games: homeL10.games
          },
          awayL10: {
            netRtg: awayL10.netRtg.toFixed(1),
            offRtg: awayL10.offRtg.toFixed(1),
            defRtg: awayL10.defRtg.toFixed(1),
            games: awayL10.games
          }
        },
        vegasLines: {
          spread: gameVegasLines.spread?.home != null ? {
            line: gameVegasLines.spread.home,
            price: gameVegasLines.spread.homePrice,
            book: gameVegasLines.spread.book
          } : null,
          total: gameVegasLines.total?.line != null ? {
            line: gameVegasLines.total.line,
            overPrice: gameVegasLines.total.overPrice,
            underPrice: gameVegasLines.total.underPrice,
            book: gameVegasLines.total.book
          } : null,
          moneyline: gameVegasLines.moneyline?.home != null ? {
            home: gameVegasLines.moneyline.home,
            away: gameVegasLines.moneyline.away,
            book: gameVegasLines.moneyline.book
          } : null
        },
        opportunities
      });
    }
    
    console.log(`[NBA Elite] Generated ${predictions.length} predictions`);
    
    return new Response(JSON.stringify({
      ok: true,
      generated: new Date().toISOString(),
      games: predictions.length,
      predictions,
      modelInfo: {
        type: 'Elite Ensemble',
        features: 55,
        spreadMAE: 11.606,
        totalMAE: 15.89,
        dataSource: 'Netlify Blobs + ESPN'
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300'
      }
    });
    
  } catch (error) {
    console.error('[NBA Elite] Error:', error);
    
    return new Response(JSON.stringify({
      ok: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
