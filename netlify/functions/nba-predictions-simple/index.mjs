/**
 * NBA Predictions - Working Version
 * Returns mock predictions for now to get frontend working
 * TODO: Integrate real model once bundling issues resolved
 */

/**
 * Fetch market odds from TheOddsAPI
 */
async function fetchMarketOdds() {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      console.log('[NBA] No odds API key, skipping market odds');
      return {};
    }
    
    const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${apiKey}&regions=us&markets=spreads,totals,h2h&oddsFormat=american`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Odds API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Map odds by team names (ESPN uses different IDs)
    const oddsMap = {};
    for (const game of data) {
      const key = `${game.away_team}_${game.home_team}`;
      oddsMap[key] = game.bookmakers;
    }
    
    console.log(`[NBA] ✅ Fetched odds for ${data.length} games`);
    return oddsMap;
  } catch (error) {
    console.error('[NBA] Error fetching odds:', error.message);
    return {};
  }
}

/**
 * Calculate Kelly Criterion stake
 */
function calculateKellySizing(winProb, americanOdds, fractionalKelly = 0.25) {
  // Convert American odds to decimal
  const decimalOdds = americanOdds > 0 
    ? (americanOdds / 100) + 1 
    : (100 / Math.abs(americanOdds)) + 1;
  
  // Kelly formula
  const b = decimalOdds - 1;
  const p = winProb;
  const q = 1 - p;
  
  const kelly = (b * p - q) / b;
  const fractional = Math.max(0, kelly * fractionalKelly);
  
  return {
    fullKelly: parseFloat((kelly * 100).toFixed(2)),
    fractionalKelly: parseFloat((fractional * 100).toFixed(2)),
    units: parseFloat((fractional * 100).toFixed(1)), // 1% = 1 unit
    shouldBet: fractional > 0.01
  };
}

/**
 * Find best odds across all books
 */
function getBestOdds(bookmakers, market, outcome) {
  if (!bookmakers) return null;
  
  let bestOdds = null;
  let bestPrice = -Infinity;
  
  for (const book of bookmakers) {
    const marketData = book.markets.find(m => m.key === market);
    if (!marketData) continue;
    
    const outcomeData = marketData.outcomes.find(o => {
      if (market === 'spreads') {
        return outcome === 'home' ? o.name === book.home_team : o.name === book.away_team;
      } else if (market === 'totals') {
        return o.name === outcome;
      } else if (market === 'h2h') {
        return outcome === 'home' ? o.name === book.home_team : o.name === book.away_team;
      }
      return false;
    });
    
    if (outcomeData && outcomeData.price > bestPrice) {
      bestPrice = outcomeData.price;
      bestOdds = {
        book: book.title,
        price: outcomeData.price,
        point: outcomeData.point || null
      };
    }
  }
  
  return bestOdds;
}

/**
 * Calculate edge and betting opportunities
 */
function analyzeBettingOpportunities(prediction, marketOdds, game) {
  const opportunities = [];
  
  if (!marketOdds) {
    return opportunities;
  }
  
  const oddsKey = `${game.awayTeam}_${game.homeTeam}`;
  const bookmakers = marketOdds[oddsKey];
  
  if (!bookmakers || bookmakers.length === 0) {
    return opportunities;
  }
  
  // Spread opportunity
  const spreadOdds = getBestOdds(bookmakers, 'spreads', 'home');
  if (spreadOdds && spreadOdds.point) {
    const modelSpread = prediction.spread.prediction;
    const marketSpread = spreadOdds.point;
    const edge = modelSpread - marketSpread;
    const edgePercent = Math.abs(edge / marketSpread * 100);
    
    if (edgePercent > 5 && prediction.confidence > 60) {
      const pick = edge > 0 ? game.homeTeam : game.awayTeam;
      const pickProb = edge > 0 ? prediction.winProbability.home / 100 : prediction.winProbability.away / 100;
      const sizing = calculateKellySizing(pickProb, spreadOdds.price);
      
      if (sizing.shouldBet) {
        opportunities.push({
          market: 'Spread',
          pick: `${pick} ${marketSpread > 0 ? '+' : ''}${marketSpread}`,
          odds: spreadOdds.price,
          book: spreadOdds.book,
          edge: parseFloat(edge.toFixed(1)),
          edgePercent: parseFloat(edgePercent.toFixed(1)),
          confidence: prediction.confidence,
          kelly: sizing,
          rating: edgePercent > 10 ? '⭐⭐⭐' : edgePercent > 7 ? '⭐⭐' : '⭐'
        });
      }
    }
  }
  
  // Total opportunity
  const overOdds = getBestOdds(bookmakers, 'totals', 'Over');
  const underOdds = getBestOdds(bookmakers, 'totals', 'Under');
  
  if (overOdds && underOdds && overOdds.point) {
    const modelTotal = prediction.total.prediction;
    const marketTotal = overOdds.point;
    const edge = modelTotal - marketTotal;
    const edgePercent = Math.abs(edge / marketTotal * 100);
    
    if (edgePercent > 3 && prediction.confidence > 55) {
      const pick = edge > 0 ? 'Over' : 'Under';
      const pickOdds = edge > 0 ? overOdds : underOdds;
      const pickProb = 0.52; // Simplified probability for totals
      const sizing = calculateKellySizing(pickProb, pickOdds.price);
      
      if (sizing.shouldBet) {
        opportunities.push({
          market: 'Total',
          pick: `${pick} ${marketTotal}`,
          odds: pickOdds.price,
          book: pickOdds.book,
          edge: parseFloat(Math.abs(edge).toFixed(1)),
          edgePercent: parseFloat(edgePercent.toFixed(1)),
          confidence: prediction.confidence,
          kelly: sizing,
          rating: edgePercent > 8 ? '⭐⭐⭐' : edgePercent > 5 ? '⭐⭐' : '⭐'
        });
      }
    }
  }
  
  return opportunities;
}

/**
 * Main handler
 */
export default async (request, context) => {
  try {
    console.log('[NBA] Starting prediction generation...');
    
    // Fetch today's games from ESPN
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.events || data.events.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        games: [],
        message: 'No games scheduled for today'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const predictions = data.events.map(event => {
      const competition = event.competitions[0];
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
      
      // Mock prediction (will replace with real model)
      const mockSpread = (Math.random() * 10 - 5).toFixed(1);
      const mockTotal = (220 + Math.random() * 20).toFixed(1);
      const confidence = Math.floor(60 + Math.random() * 25);
      
      return {
        gameId: event.id,
        game: `${awayTeam.team.abbreviation} @ ${homeTeam.team.abbreviation}`,
        gameTime: event.date,
        teams: {
          home: {
            name: homeTeam.team.displayName,
            abbreviation: homeTeam.team.abbreviation,
            record: homeTeam.records?.[0]?.summary || ''
          },
          away: {
            name: awayTeam.team.displayName,
            abbreviation: awayTeam.team.abbreviation,
            record: awayTeam.records?.[0]?.summary || ''
          }
        },
        prediction: {
          spread: {
            prediction: parseFloat(mockSpread),
            favorite: mockSpread > 0 ? 'home' : 'away',
            line: Math.abs(parseFloat(mockSpread))
          },
          total: {
            prediction: parseFloat(mockTotal),
            over: parseFloat(mockTotal) > 220,
            under: parseFloat(mockTotal) < 220
          },
          winProbability: {
            home: parseFloat((mockSpread > 0 ? 55 + Math.random() * 20 : 45 - Math.random() * 20).toFixed(1)),
            away: parseFloat((mockSpread < 0 ? 55 + Math.random() * 20 : 45 - Math.random() * 20).toFixed(1))
          },
          confidence
        },
        opportunities: [] // No betting opportunities yet
      };
    });
    
    console.log(`[NBA] Generated ${predictions.length} predictions`);
    
    return new Response(JSON.stringify({
      ok: true,
      generated: new Date().toISOString(),
      games: predictions.length,
      predictions,
      modelInfo: {
        type: 'Elite Ensemble',
        features: 55,
        spreadMAE: 11.606,
        totalMAE: 14.691,
        note: 'Mock data - model integration in progress'
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      }
    });
    
  } catch (error) {
    console.error('[NBA] Error:', error);
    
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
