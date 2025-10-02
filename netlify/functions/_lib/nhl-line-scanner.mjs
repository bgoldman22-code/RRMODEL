// netlify/functions/_lib/nhl-line-scanner.mjs
// Elite edge detection - scan DraftKings/FanDuel lines vs projections

/**
 * SPORTSBOOK LINE STRUCTURES
 * In production, these would come from Odds API or direct scraping
 * For now, we'll create a scanner that can accept any odds feed format
 */

/**
 * Calculate true probability from American odds
 */
export function americanOddsToProb(odds) {
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

/**
 * Calculate implied probability with vig removed
 * Books inflate both sides to create juice - we need the fair probability
 */
export function removeVig(overOdds, underOdds) {
  const overProb = americanOddsToProb(overOdds);
  const underProb = americanOddsToProb(underOdds);
  
  const totalProb = overProb + underProb; // Should be > 1.00 (the vig)
  
  // Proportional vig removal
  const fairOverProb = overProb / totalProb;
  const fairUnderProb = underProb / totalProb;
  
  return {
    fairOverProb,
    fairUnderProb,
    vig: totalProb - 1.0,
    vigPct: ((totalProb - 1.0) * 100).toFixed(2)
  };
}

/**
 * Calculate expected value (EV) of a bet
 * EV = (Win Prob × Win Amount) - (Loss Prob × Loss Amount)
 */
export function calculateEV(trueProb, bookOdds) {
  const bookProb = americanOddsToProb(bookOdds);
  
  let winAmount, lossAmount;
  
  if (bookOdds > 0) {
    winAmount = bookOdds / 100; // +150 wins $1.50 per $1
    lossAmount = 1;
  } else {
    winAmount = 100 / Math.abs(bookOdds); // -150 wins $0.67 per $1
    lossAmount = 1;
  }
  
  const ev = (trueProb * winAmount) - ((1 - trueProb) * lossAmount);
  const evPct = ev * 100; // As percentage
  
  return {
    ev,
    evPct: Math.round(evPct * 100) / 100,
    trueProb: Math.round(trueProb * 10000) / 100,
    bookProb: Math.round(bookProb * 10000) / 100,
    edgePct: Math.round((trueProb - bookProb) * 10000) / 100
  };
}

/**
 * ELITE: Scan player prop lines for edge
 * @param {Object} projection - Output from projectPlayerSOG()
 * @param {Array} bookLines - Array of {book, line, overOdds, underOdds}
 * @param {Number} minEdge - Minimum edge % to flag (e.g., 5 = 5% edge required)
 */
export function scanPlayerLines(projection, bookLines, minEdge = 5) {
  const { projectedSOG, playerName, team, opponent } = projection;
  
  const opportunities = [];
  
  for (const bookLine of bookLines) {
    const { book, line, overOdds, underOdds } = bookLine;
    
    // Calculate our true probabilities
    const { calculateLineProbability } = require('./nhl-projection-engine.mjs');
    const trueProbOver = calculateLineProbability(projectedSOG, line, true) / 100;
    const trueProbUnder = calculateLineProbability(projectedSOG, line, false) / 100;
    
    // Remove vig to get book's fair probabilities
    const { fairOverProb, fairUnderProb, vigPct } = removeVig(overOdds, underOdds);
    
    // Calculate EV for both sides
    const overEV = calculateEV(trueProbOver, overOdds);
    const underEV = calculateEV(trueProbUnder, underOdds);
    
    // Flag if edge exceeds threshold
    if (overEV.edgePct >= minEdge) {
      opportunities.push({
        player: playerName,
        team,
        opponent,
        book,
        market: 'Player Shots on Goal',
        bet: `Over ${line}`,
        line,
        odds: overOdds,
        projectedSOG,
        trueProb: overEV.trueProb,
        bookProb: overEV.bookProb,
        edge: overEV.edgePct,
        ev: overEV.evPct,
        vig: vigPct,
        confidence: calculateConfidence(overEV.edgePct, projection.seasonStats.gamesPlayed)
      });
    }
    
    if (underEV.edgePct >= minEdge) {
      opportunities.push({
        player: playerName,
        team,
        opponent,
        book,
        market: 'Player Shots on Goal',
        bet: `Under ${line}`,
        line,
        odds: underOdds,
        projectedSOG,
        trueProb: underEV.trueProb,
        bookProb: underEV.bookProb,
        edge: underEV.edgePct,
        ev: underEV.evPct,
        vig: vigPct,
        confidence: calculateConfidence(underEV.edgePct, projection.seasonStats.gamesPlayed)
      });
    }
  }
  
  return opportunities;
}

/**
 * Confidence scoring (higher edge + more games played = higher confidence)
 */
function calculateConfidence(edge, gamesPlayed) {
  // Edge component (0-10 scale)
  const edgeScore = Math.min(edge / 2, 10); // 20% edge = max 10
  
  // Sample size component (0-10 scale)
  const sampleScore = Math.min(gamesPlayed / 5, 10); // 50 games = max 10
  
  // Combined confidence (0-100)
  const confidence = ((edgeScore + sampleScore) / 20) * 100;
  
  return Math.round(confidence);
}

/**
 * BATCH SCANNING: Scan all players in a game for edges
 */
export async function scanGameLines(gameProjections, oddsData, minEdge = 5) {
  const { game, projections } = gameProjections;
  const allOpportunities = [];
  
  // Scan away team
  for (const proj of projections.away) {
    // Find odds for this player
    const playerOdds = oddsData.find(o => 
      o.playerName.toLowerCase() === proj.playerName.toLowerCase() &&
      o.team === proj.team
    );
    
    if (playerOdds && playerOdds.lines) {
      const opps = scanPlayerLines(proj, playerOdds.lines, minEdge);
      allOpportunities.push(...opps);
    }
  }
  
  // Scan home team
  for (const proj of projections.home) {
    // Find odds for this player
    const playerOdds = oddsData.find(o => 
      o.playerName.toLowerCase() === proj.playerName.toLowerCase() &&
      o.team === proj.team
    );
    
    if (playerOdds && playerOdds.lines) {
      const opps = scanPlayerLines(proj, playerOdds.lines, minEdge);
      allOpportunities.push(...opps);
    }
  }
  
  // Sort by EV descending
  allOpportunities.sort((a, b) => b.ev - a.ev);
  
  return {
    game: `${game.awayTeam} @ ${game.homeTeam}`,
    startTime: game.startTime,
    totalOpportunities: allOpportunities.length,
    opportunities: allOpportunities
  };
}

/**
 * ELITE: Multi-game slate scanner
 * Scan entire day's slate, return ranked opportunities
 */
export async function scanFullSlate(scheduleGames, minEdge = 5, minConfidence = 60) {
  const { projectGameSOG } = await import('./nhl-projection-engine.mjs');
  
  const allOpportunities = [];
  
  for (const game of scheduleGames) {
    // Project all players in game
    const gameProjections = await projectGameSOG(game);
    
    // Fetch odds for this game (placeholder - would be real odds API)
    const oddsData = await fetchGameOdds(game.gameId);
    
    // Scan for edges
    const gameOpps = await scanGameLines(gameProjections, oddsData, minEdge);
    
    allOpportunities.push(...gameOpps.opportunities);
  }
  
  // Filter by minimum confidence
  const filteredOpps = allOpportunities.filter(opp => opp.confidence >= minConfidence);
  
  // Sort by EV
  filteredOpps.sort((a, b) => b.ev - a.ev);
  
  return {
    date: new Date().toISOString().split('T')[0],
    gamesScanned: scheduleGames.length,
    totalOpportunities: filteredOpps.length,
    topOpportunities: filteredOpps.slice(0, 50), // Top 50 bets
    summary: {
      avgEdge: calculateAverage(filteredOpps, 'edge'),
      avgEV: calculateAverage(filteredOpps, 'ev'),
      avgConfidence: calculateAverage(filteredOpps, 'confidence'),
      overCount: filteredOpps.filter(o => o.bet.startsWith('Over')).length,
      underCount: filteredOpps.filter(o => o.bet.startsWith('Under')).length
    }
  };
}

/**
 * Placeholder: Fetch odds from sportsbooks
 * In production, this would call The Odds API or scrape DraftKings/FanDuel
 */
async function fetchGameOdds(gameId) {
  // PRODUCTION: Replace with real odds API
  // Example structure:
  return [
    {
      playerName: 'Connor McDavid',
      team: 'EDM',
      lines: [
        { book: 'DraftKings', line: 4.5, overOdds: -115, underOdds: -105 },
        { book: 'FanDuel', line: 4.5, overOdds: -120, underOdds: +100 }
      ]
    }
    // ... more players
  ];
}

/**
 * Helper: Calculate average of a property
 */
function calculateAverage(array, property) {
  if (array.length === 0) return 0;
  const sum = array.reduce((acc, item) => acc + item[property], 0);
  return Math.round((sum / array.length) * 100) / 100;
}

/**
 * KELLY CRITERION INTEGRATION
 * Calculate optimal bet size based on edge and bankroll
 */
export function calculateKellyStake(edge, odds, bankroll, kellyFraction = 0.25) {
  // Edge as decimal (e.g., 0.05 for 5% edge)
  const edgeDecimal = edge / 100;
  
  // Convert American odds to decimal
  let decimalOdds;
  if (odds > 0) {
    decimalOdds = (odds / 100) + 1;
  } else {
    decimalOdds = (100 / Math.abs(odds)) + 1;
  }
  
  // Kelly formula: f = (bp - q) / b
  // Where: b = decimal odds - 1, p = win probability, q = 1 - p
  const b = decimalOdds - 1;
  const p = edgeDecimal + americanOddsToProb(odds);
  const q = 1 - p;
  
  const kellyPct = (b * p - q) / b;
  
  // Apply fractional Kelly for safety
  const fractionalKelly = kellyPct * kellyFraction;
  
  // Calculate stake
  const stake = bankroll * fractionalKelly;
  
  return {
    kellyPct: Math.round(kellyPct * 10000) / 100,
    fractionalKellyPct: Math.round(fractionalKelly * 10000) / 100,
    recommendedStake: Math.max(0, Math.round(stake * 100) / 100),
    maxStake: Math.round(bankroll * 0.05 * 100) / 100 // Hard cap at 5% bankroll
  };
}

export default {
  americanOddsToProb,
  removeVig,
  calculateEV,
  scanPlayerLines,
  scanGameLines,
  scanFullSlate,
  calculateKellyStake
};
