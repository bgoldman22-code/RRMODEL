/**
 * NBA Elite Predictions V2.1 - Production Share Injury Weighting
 * 
 * NEW IN V2.1:
 * - Uses PRODUCTION SHARE to weight injury impact (star vs bench)
 * - Calculates player contribution % (pts/reb/ast) from boxscores
 * - Stars get 2x+ injury weight vs bench players
 * 
 * IMPROVEMENTS OVER V1:
 * - Uses ESPN team schedule for recent game IDs (reliable!)
 * - Uses NBA CDN boxscores for detailed stats (works great!)
 * - ESPN abbreviation normalization (GS→GSW, SA→SAS, NO→NOP, etc.)
 * - In-memory team data (no fs.readFile failures in serverless)
 * - Always current season data (no stale fallbacks to 2024-25)
 * - Fallback to score-based estimation when boxscore unavailable
 * 
 * KEEPS FROM V1:
 * - Elite Ensemble model (11.606 MAE spread, 85 features)
 * - Advanced stats: offRtg, defRtg, pace, Four Factors
 * - L5/L10/L20 rolling windows for recent performance
 * - RCI adjustments for roster continuity
 * 
 * ARCHITECTURE:
 * - ESPN for schedule (reliable, team names/records, game IDs)
 * - NBA CDN for boxscores (detailed stats when available)
 * - Calculate advanced stats ourselves from boxscore data
 * - No dependency on broken stats.nba.com (500 errors)
 */

import { createHash } from 'crypto';
import { SPREAD_MODEL, TOTAL_MODEL } from '../_lib/nba/models-inline.mjs';
import { applyRCIAdjustment, getRCISummary, getRawRCI } from '../_lib/nba/rci-adjustments.mjs';
import { getTeamInjuries } from '../_lib/nba/injuries.mjs';
// V2.1: Use new injury system with production share weighting
import { applyInjuryAdjustment, getInjurySummary, getInjuryAdvantage } from '../_lib/nba/injury-adjustments-v2.mjs';
import { fetchTeamRollingStats, loadTeamInfo } from '../_lib/nba/loaders.mjs';
import { saveGamePredictions } from '../nba-tracking-save-predictions.mjs';

/**
 * Trade deadline date for 2025-26 season (Feb 6, 2026 at 3pm ET)
 * We'll apply a penalty in the 7-day window leading up to the deadline
 */
const TRADE_DEADLINE_2026 = new Date('2026-02-06T20:00:00Z'); // 3pm ET = 8pm UTC

/**
 * Check if we're in the trade deadline uncertainty window (7 days before deadline)
 */
function isInTradeDeadlineWindow() {
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilDeadline = (TRADE_DEADLINE_2026 - now) / msPerDay;
  return daysUntilDeadline >= 0 && daysUntilDeadline <= 7;
}

/**
 * Calculate roster turbulence multiplier based on RCI values
 * Lower RCI = more roster churn = higher uncertainty = lower multiplier
 * 
 * @param {number} homeRCI - Home team RCI (0-1)
 * @param {number} awayRCI - Away team RCI (0-1)
 * @returns {{ multiplier: number, note: string|null, level: string }}
 */
function getRosterTurbulenceAdjustment(homeRCI, awayRCI) {
  // Use the LOWER of the two team's RCIs (worst case drives uncertainty)
  const minRCI = Math.min(homeRCI, awayRCI);
  
  if (minRCI < 0.55) {
    // High churn (e.g., PHX 0.498, NO 0.533, BKN 0.548)
    return {
      multiplier: 0.70,
      level: 'HIGH',
      note: `ROSTER TURBULENCE: Low continuity (RCI ${minRCI.toFixed(2)}) – 30% units reduction.`
    };
  } else if (minRCI < 0.70) {
    // Moderate churn (e.g., ATL 0.627, DET 0.602, HOU 0.657)
    return {
      multiplier: 0.85,
      level: 'MODERATE',
      note: `ROSTER TURBULENCE: Moderate continuity (RCI ${minRCI.toFixed(2)}) – 15% units reduction.`
    };
  }
  
  // Stable rosters (RCI >= 0.70) - no penalty
  return { multiplier: 1.0, level: 'STABLE', note: null };
}

/**
 * ESPN → NBA abbreviation normalization
 * Comprehensive mapping for all 30 NBA teams
 * ESPN uses different abbreviations for some teams than NBA Stats API
 */
const ESPN_TO_NBA_ABBR = {
  // Teams where ESPN differs from NBA Stats API
  'GS': 'GSW',      // Golden State Warriors
  'SA': 'SAS',      // San Antonio Spurs
  'NO': 'NOP',      // New Orleans Pelicans
  'NY': 'NYK',      // New York Knicks
  'PHO': 'PHX',     // Phoenix Suns
  'UTAH': 'UTA',    // Utah Jazz
  'WSH': 'WAS',     // Washington Wizards
  
  // All other teams match (explicit for validation)
  'ATL': 'ATL', 'BOS': 'BOS', 'BKN': 'BKN', 'CHA': 'CHA', 'CHI': 'CHI',
  'CLE': 'CLE', 'DAL': 'DAL', 'DEN': 'DEN', 'DET': 'DET', 'HOU': 'HOU',
  'IND': 'IND', 'LAC': 'LAC', 'LAL': 'LAL', 'MEM': 'MEM', 'MIA': 'MIA',
  'MIL': 'MIL', 'MIN': 'MIN', 'OKC': 'OKC', 'ORL': 'ORL', 'PHI': 'PHI',
  'POR': 'POR', 'SAC': 'SAC', 'TOR': 'TOR'
};

/**
 * Normalize ESPN abbreviation to NBA abbreviation
 */
function normalizeAbbr(abbr) {
  return ESPN_TO_NBA_ABBR[abbr] || abbr;
}

/**
 * Default stats when API data unavailable (fallback)
 */
function getDefaultStats() {
  return {
    pace: 100, offRtg: 114.5, defRtg: 114.5, netRtg: 0,
    efg: 0.535, ts: 0.575, tovPct: 0.138, orbPct: 0.25,
    ftFga: 0.22, winPct: 0.50, games: 0, wins: 0, losses: 0,
    fgPct: 0.47, fg3Pct: 0.36, ftPct: 0.78,
    rebounds: 43.5, assists: 25.5, turnovers: 13.5,
    steals: 7.5, blocks: 5, fga: 88, fta: 22, fg3a: 35,
    oreb: 10.5, dreb: 33, ppg: 114.5, oppPpg: 114.5
  };
}

/**
 * Fetch live Vegas lines from The Odds API
 */
async function fetchVegasLines(gameIds, isPreseason = false) {
  const ODDS_API_KEY = process.env.ODDS_API_KEY;
  
  if (!ODDS_API_KEY) {
    console.log('[NBA Elite] No Odds API key - skipping live lines');
    return {};
  }
  
  try {
    // Use correct sport key based on season type
    const sportKey = isPreseason ? 'basketball_nba_preseason' : 'basketball_nba';
    const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    
    console.log('[NBA Elite] Fetching odds from:', sportKey, '- Preseason:', isPreseason);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log('[NBA Elite] Odds API error:', response.status, response.statusText);
      return {};
    }
    
    const data = await response.json();
    console.log('[NBA Elite] Odds API returned:', data?.length || 0, 'games');
    console.log('[NBA Elite] Remaining requests:', response.headers.get('x-requests-remaining'));
    
    const linesMap = {};
    
    // Team name mapping (Odds API uses full names, map to ESPN abbreviations for consistency)
    const teamAbbrevMap = {
      'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
      'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
      'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
      'Golden State Warriors': 'GS', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
      'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
      'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
      'New Orleans Pelicans': 'NO', 'New York Knicks': 'NY', 'Oklahoma City Thunder': 'OKC',
      'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX', // Fixed: PHO → PHX to match ESPN
      'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SA',
      'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTAH', 'Washington Wizards': 'WSH'
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
      
      // CRITICAL: Use same-book pairs for fair pricing to avoid phantom midpoint bias
      // We'll collect all books' pairs, find the tightest (lowest vig), and use that for edge calc
      // Then separately track the best single-sided odds for placement
      
      const spreadPairs = [];
      const totalPairs = [];
      const mlPairs = [];
      
      // Collect same-book pairs from each bookmaker
      for (const book of game.bookmakers || []) {
        let spreadPair = null;
        let totalPair = null;
        let mlPair = null;
        
        for (const market of book.markets || []) {
          if (market.key === 'spreads') {
            const homeSpread = market.outcomes.find(o => o.name === game.home_team);
            const awaySpread = market.outcomes.find(o => o.name === game.away_team);
            if (homeSpread && awaySpread) {
              spreadPair = {
                book: book.key,
                homeLine: homeSpread.point,
                homePrice: homeSpread.price,
                awayLine: awaySpread.point,
                awayPrice: awaySpread.price,
                vig: Math.abs(homeSpread.price) + Math.abs(awaySpread.price) - 200
              };
            }
          }
          else if (market.key === 'totals') {
            const over = market.outcomes.find(o => o.name === 'Over');
            const under = market.outcomes.find(o => o.name === 'Under');
            if (over && under) {
              totalPair = {
                book: book.key,
                line: over.point,
                overPrice: over.price,
                underPrice: under.price,
                vig: Math.abs(over.price) + Math.abs(under.price) - 200
              };
            }
          }
          else if (market.key === 'h2h') {
            const homeMl = market.outcomes.find(o => o.name === game.home_team);
            const awayMl = market.outcomes.find(o => o.name === game.away_team);
            if (homeMl && awayMl) {
              mlPair = {
                book: book.key,
                homePrice: homeMl.price,
                awayPrice: awayMl.price,
                // Vig calc for moneyline is more complex, approximate
                vig: 0 // Will use implied prob method
              };
              // Calculate implied probabilities
              const homeImplied = homeMl.price < 0 
                ? Math.abs(homeMl.price) / (Math.abs(homeMl.price) + 100)
                : 100 / (homeMl.price + 100);
              const awayImplied = awayMl.price < 0
                ? Math.abs(awayMl.price) / (Math.abs(awayMl.price) + 100)
                : 100 / (awayMl.price + 100);
              mlPair.vig = (homeImplied + awayImplied - 1) * 100;
            }
          }
        }
        
        if (spreadPair) spreadPairs.push(spreadPair);
        if (totalPair) totalPairs.push(totalPair);
        if (mlPair) mlPairs.push(mlPair);
      }
      
      // Find tightest pairs (lowest vig) for FAIR PRICING (edge calculation)
      const fairSpread = spreadPairs.length > 0 
        ? spreadPairs.reduce((best, curr) => curr.vig < best.vig ? curr : best)
        : null;
      
      const fairTotal = totalPairs.length > 0
        ? totalPairs.reduce((best, curr) => curr.vig < best.vig ? curr : best)
        : null;
      
      const fairML = mlPairs.length > 0
        ? mlPairs.reduce((best, curr) => curr.vig < best.vig ? curr : best)
        : null;
      
      // Find best single-sided odds for PLACEMENT (where to actually bet)
      let bestSpreadPrice = null;
      let bestTotalPrice = null;
      let bestMLPrice = null;
      
      for (const pair of spreadPairs) {
        if (!bestSpreadPrice || pair.homePrice > bestSpreadPrice.homePrice) {
          bestSpreadPrice = { ...pair };
        }
      }
      
      for (const pair of totalPairs) {
        if (!bestTotalPrice || pair.overPrice > bestTotalPrice.overPrice) {
          bestTotalPrice = { ...pair };
        }
      }
      
      for (const pair of mlPairs) {
        if (!bestMLPrice || pair.homePrice > bestMLPrice.homePrice) {
          bestMLPrice = { ...pair };
        }
      }
      
      // Store both fair (for edge calc) and best (for placement)
      linesMap[key] = {
        spread: {
          // Fair pair (same book, tightest vig) - use for EDGE calculation
          fair: fairSpread ? {
            homeLine: fairSpread.homeLine,
            awayLine: fairSpread.awayLine,
            homePrice: fairSpread.homePrice,
            awayPrice: fairSpread.awayPrice,
            book: fairSpread.book,
            vig: fairSpread.vig
          } : null,
          // Best placement odds (may be different book)
          placement: bestSpreadPrice ? {
            homeLine: bestSpreadPrice.homeLine,
            homePrice: bestSpreadPrice.homePrice,
            book: bestSpreadPrice.book
          } : null
        },
        total: {
          // Fair pair (same book, tightest vig)
          fair: fairTotal ? {
            line: fairTotal.line,
            overPrice: fairTotal.overPrice,
            underPrice: fairTotal.underPrice,
            book: fairTotal.book,
            vig: fairTotal.vig
          } : null,
          // Best placement odds
          placement: bestTotalPrice ? {
            line: bestTotalPrice.line,
            overPrice: bestTotalPrice.overPrice,
            underPrice: bestTotalPrice.underPrice,
            book: bestTotalPrice.book
          } : null
        },
        moneyline: {
          // Fair pair (same book, lowest vig)
          fair: fairML ? {
            homePrice: fairML.homePrice,
            awayPrice: fairML.awayPrice,
            book: fairML.book,
            vig: fairML.vig
          } : null,
          // Best placement odds
          placement: bestMLPrice ? {
            homePrice: bestMLPrice.homePrice,
            awayPrice: bestMLPrice.awayPrice,
            book: bestMLPrice.book
          } : null
        }
      };
    }
    
    // STEP 2: Fetch team totals for each game (requires separate API call per event)
    // Team totals are in "Additional Markets" and require /events/{eventId}/odds endpoint
    console.log('[NBA Elite] Fetching team totals for', data?.length || 0, 'games...');
    
    for (const game of data || []) {
      const awayAbbrev = teamAbbrevMap[game.away_team];
      const homeAbbrev = teamAbbrevMap[game.home_team];
      const key = `${awayAbbrev}_${homeAbbrev}`;
      
      if (!linesMap[key]) continue;
      
      try {
        // Fetch team totals from event-specific endpoint
        const eventUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${game.id}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=team_totals&oddsFormat=american`;
        const eventResponse = await fetch(eventUrl);
        
        if (eventResponse.ok) {
          const eventData = await eventResponse.json();
          
          // Collect same-book pairs for team totals (same logic as above)
          const homeTeamTotalPairs = [];
          const awayTeamTotalPairs = [];
          
          for (const book of eventData.bookmakers || []) {
            for (const market of book.markets || []) {
              if (market.key === 'team_totals') {
                const homeTeamTotalOver = market.outcomes.find(o => 
                  o.name === game.home_team && o.description === 'Over'
                );
                const homeTeamTotalUnder = market.outcomes.find(o => 
                  o.name === game.home_team && o.description === 'Under'
                );
                const awayTeamTotalOver = market.outcomes.find(o => 
                  o.name === game.away_team && o.description === 'Over'
                );
                const awayTeamTotalUnder = market.outcomes.find(o => 
                  o.name === game.away_team && o.description === 'Under'
                );
                
                if (homeTeamTotalOver && homeTeamTotalUnder) {
                  homeTeamTotalPairs.push({
                    book: book.key,
                    line: homeTeamTotalOver.point,
                    overPrice: homeTeamTotalOver.price,
                    underPrice: homeTeamTotalUnder.price,
                    vig: Math.abs(homeTeamTotalOver.price) + Math.abs(homeTeamTotalUnder.price) - 200
                  });
                }
                
                if (awayTeamTotalOver && awayTeamTotalUnder) {
                  awayTeamTotalPairs.push({
                    book: book.key,
                    line: awayTeamTotalOver.point,
                    overPrice: awayTeamTotalOver.price,
                    underPrice: awayTeamTotalUnder.price,
                    vig: Math.abs(awayTeamTotalOver.price) + Math.abs(awayTeamTotalUnder.price) - 200
                  });
                }
              }
            }
          }
          
          // Find tightest pairs and best placement odds
          if (homeTeamTotalPairs.length > 0) {
            const fairHomeTT = homeTeamTotalPairs.reduce((best, curr) => curr.vig < best.vig ? curr : best);
            const bestHomeTT = homeTeamTotalPairs.reduce((best, curr) => curr.overPrice > best.overPrice ? curr : best);
            
            linesMap[key].teamTotals = linesMap[key].teamTotals || {};
            linesMap[key].teamTotals.home = {
              fair: {
                line: fairHomeTT.line,
                overPrice: fairHomeTT.overPrice,
                underPrice: fairHomeTT.underPrice,
                book: fairHomeTT.book,
                vig: fairHomeTT.vig
              },
              placement: {
                line: bestHomeTT.line,
                overPrice: bestHomeTT.overPrice,
                underPrice: bestHomeTT.underPrice,
                book: bestHomeTT.book
              }
            };
          }
          
          if (awayTeamTotalPairs.length > 0) {
            const fairAwayTT = awayTeamTotalPairs.reduce((best, curr) => curr.vig < best.vig ? curr : best);
            const bestAwayTT = awayTeamTotalPairs.reduce((best, curr) => curr.overPrice > best.overPrice ? curr : best);
            
            linesMap[key].teamTotals = linesMap[key].teamTotals || {};
            linesMap[key].teamTotals.away = {
              fair: {
                line: fairAwayTT.line,
                overPrice: fairAwayTT.overPrice,
                underPrice: fairAwayTT.underPrice,
                book: fairAwayTT.book,
                vig: fairAwayTT.vig
              },
              placement: {
                line: bestAwayTT.line,
                overPrice: bestAwayTT.overPrice,
                underPrice: bestAwayTT.underPrice,
                book: bestAwayTT.book
              }
            };
          }
        }
      } catch (err) {
        console.log(`[NBA Elite] Failed to fetch team totals for ${key}:`, err.message);
      }
    }
    
    const gamesWithTeamTotals = Object.values(linesMap).filter(g => g.teamTotals).length;
    console.log(`[NBA Elite] Found team totals for ${gamesWithTeamTotals} games`);
    
    console.log(`[NBA Elite] Fetched Vegas lines for ${Object.keys(linesMap).length} games`);
    return linesMap;
    
  } catch (error) {
    console.error('[NBA Elite] Error fetching Vegas lines:', error);
    return {};
  }
}

/**
 * Devig two-sided market odds to get fair probability
 * Uses multiplicative method (scales probabilities proportionally)
 */
function devigOdds(odds1, odds2) {
  // Convert American odds to implied probabilities
  const implied1 = odds1 < 0 
    ? Math.abs(odds1) / (Math.abs(odds1) + 100)
    : 100 / (odds1 + 100);
  const implied2 = odds2 < 0
    ? Math.abs(odds2) / (Math.abs(odds2) + 100)
    : 100 / (odds2 + 100);
  
  // Total implied probability (should be > 1.0 due to vig)
  const totalImplied = implied1 + implied2;
  
  // Remove vig by scaling proportionally
  const fair1 = implied1 / totalImplied;
  const fair2 = implied2 / totalImplied;
  
  return { fair1, fair2, vig: (totalImplied - 1) * 100 };
}

/**
 * Calculate edge and Kelly bet sizing with DEVIGGED odds
 * NOTE: vegasLine is the POINT SPREAD, americanOdds is the PRICE (e.g., -110)
 * opponentOdds is the other side of the market for devigging
 */
function calculateEdgeAndKelly(modelPred, vegasLine, americanOdds, modelProb, bankroll = 5000, seasonAdj = 1.0, opponentOdds = null) {
  if (!vegasLine || !americanOdds) return null;
  
  // Edge in points (both are from home team perspective)
  // Example: Model OKC -15.3, Vegas OKC -6.5 → Edge = |(-15.3) - (-6.5)| = 8.8 points
  const edgePoints = Math.abs(modelPred - vegasLine);
  
  // Devig the odds if we have both sides, otherwise use raw implied probability
  let vegasImpliedProb;
  if (opponentOdds !== null) {
    const devigged = devigOdds(americanOdds, opponentOdds);
    vegasImpliedProb = devigged.fair1; // Fair probability after removing vig
  } else {
    // Fallback to raw implied probability (includes vig)
    vegasImpliedProb = americanOdds > 0 
      ? 100 / (americanOdds + 100) 
      : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
  
  // Edge in probability terms (model prob vs devigged market prob)
  const edgeProb = modelProb - vegasImpliedProb;
  const edgePercent = edgeProb * 100;
  
  // Convert American odds to decimal for Kelly calculation
  const decimalOdds = americanOdds > 0 ? (americanOdds / 100) + 1 : (100 / Math.abs(americanOdds)) + 1;
  
  // Kelly criterion: f = (bp - q) / b where b = net odds (decimal - 1), p = win prob, q = lose prob
  const b = decimalOdds - 1;
  const q = 1 - modelProb;
  const kelly = b > 0 ? (b * modelProb - q) / b : 0;
  
  // OPTION 3: Exempt high-edge bets (8+ points) from season adjustment
  // These are clear value opportunities that shouldn't be reduced
  const isHighEdge = Math.abs(edgePoints) >= 8.0;
  const effectiveSeasonAdj = isHighEdge ? 1.0 : seasonAdj;
  
  // Apply season adjustment to Kelly (reduce betting early season, except high-edge bets)
  const adjustedKelly = kelly * effectiveSeasonAdj;
  
  // Cap at 5% of bankroll (quarter Kelly for safety), then apply season adjustment
  const kellyFraction = Math.min(Math.max(adjustedKelly * 0.25, 0), 0.05);
  const betSize = Math.round(bankroll * kellyFraction);
  
  return {
    edgePoints: parseFloat(edgePoints.toFixed(1)),
    edgePercent: parseFloat(edgePercent.toFixed(1)),
    kellyFraction: parseFloat((kellyFraction * 100).toFixed(2)),
    betSize,
    units: parseFloat((betSize / 10).toFixed(1)), // $10/unit
    seasonAdjusted: effectiveSeasonAdj < 1.0, // Flag if early season reduced sizing
    highEdgeExempt: isHighEdge // Flag if high-edge exemption applied
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
    .sort((a, b) => new Date(a.date) - new Date(b.date)) // ELITE: Sort by date ascending
    .slice(-window); // Take most recent N games
  
  if (teamGames.length === 0) {
    return {
      pace: 100, offRtg: 114.5, defRtg: 114.5, netRtg: 0,
      efg: 0.535, ts: 0.575, tovPct: 0.138, orbPct: 0.25,
      ftFga: 0.22, winPct: 0.50, games: 0,
      ppg: 114.5, oppPpg: 114.5
    };
  }
  
  let stats = {
    pace: 0, offRtg: 0, defRtg: 0, efg: 0, ts: 0,
    tovPct: 0, orbPct: 0, ftFga: 0, wins: 0, games: 0,
    // NEW: Stats needed for TOTAL_MODEL
    fgPct: 0, fg3Pct: 0, ftPct: 0, rebounds: 0, assists: 0, turnovers: 0,
    totalPoints: 0, totalOppPoints: 0  // For ppg/oppPpg calculation
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
    
    // NEW: Additional stats for total model
    stats.fgPct += teamStats.fga > 0 ? teamStats.fgm / teamStats.fga : 0.47;
    stats.fg3Pct += teamStats.fg3a > 0 ? teamStats.fg3m / teamStats.fg3a : 0.36;
    stats.ftPct += teamStats.fta > 0 ? teamStats.ftm / teamStats.fta : 0.78;
    stats.rebounds += (teamStats.offRebounds || 0) + (teamStats.defRebounds || 0);
    stats.assists += teamStats.assists || 0;
    stats.turnovers += teamStats.turnovers || 0;
    stats.totalPoints += teamScore || 0;
    stats.totalOppPoints += oppScore || 0;
    
    if (teamScore > oppScore) stats.wins++;
    stats.games++;
  }
  
  // Average
  if (stats.games > 0) {
    // Save totals before averaging (ppg = totalPoints / games, NOT averaged per-game)
    const totalPts = stats.totalPoints;
    const totalOppPts = stats.totalOppPoints;
    
    Object.keys(stats).forEach(key => {
      if (key !== 'wins' && key !== 'games' && key !== 'totalPoints' && key !== 'totalOppPoints') stats[key] /= stats.games;
    });
    
    // Compute ppg and oppPpg from raw totals (matches training: ppg = total_pts / n)
    stats.ppg = totalPts / stats.games;
    stats.oppPpg = totalOppPts / stats.games;
  }
  
  stats.netRtg = stats.offRtg - stats.defRtg;
  stats.winPct = stats.games > 0 ? stats.wins / stats.games : 0.50;
  
  // Clean up intermediate fields
  delete stats.totalPoints;
  delete stats.totalOppPoints;
  
  return stats;
}

/**
 * Generate feature fingerprint to detect identical feature vectors
 */
function getFeatureFingerprint(features) {
  const keys = Object.keys(features).sort();
  const parts = keys.map(k => {
    const val = features[k];
    if (val == null) return `${k}:NULL`;
    if (!Number.isFinite(val)) return `${k}:NaN`;
    return `${k}:${val.toFixed(6)}`;
  });
  const signature = parts.join('|');
  const hash = createHash('md5').update(signature).digest('hex').substring(0, 8);
  
  // Return sample for logging (first 5 features)
  const sample = parts.slice(0, 5).join(', ') + '...';
  return { hash, signature: sample };
}

/**
 * Build 55-feature vector for elite model
 */
function buildEliteFeatures(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20) {
  // Helper to create uniform stat blocks
  const calcPPG = (stats) => stats.offRtg; // OffRtg is already points/100 poss
  
  return {
    // L3 (L5) stats
    h3_netRtg: homeL3.netRtg,
    h3_ppg: calcPPG(homeL3),
    h3_pace: homeL3.pace,
    h3_winPct: homeL3.winPct,
    h3_efg: homeL3.efg * 100,
    a3_netRtg: awayL3.netRtg,
    a3_ppg: calcPPG(awayL3),
    a3_pace: awayL3.pace,
    a3_winPct: awayL3.winPct,
    a3_efg: awayL3.efg * 100,
    
    // Home L10 stats (model only has: pace, ppg, netRtg, winPct, ts - NO efg!)
    h10_pace: homeL10.pace,
    h10_ppg: calcPPG(homeL10),
    h10_netRtg: homeL10.netRtg,
    h10_winPct: homeL10.winPct,
    h10_ts: homeL10.ts * 100,  // Model expects 0-100 scale (mean=57.9)
    
    // Away L10 stats (model only has: pace, ppg, netRtg, winPct, ts - NO efg!)
    a10_pace: awayL10.pace,
    a10_ppg: calcPPG(awayL10),
    a10_netRtg: awayL10.netRtg,
    a10_winPct: awayL10.winPct,
    a10_ts: awayL10.ts * 100,  // Model expects 0-100 scale (mean=58.0)
    
    // L20 stats - home (model only has: pace, ppg, netRtg, offRtg, defRtg - NO efg, NO ts!)
    h20_pace: homeL20.pace,
    h20_ppg: calcPPG(homeL20),
    h20_netRtg: homeL20.netRtg,
    h20_offRtg: homeL20.offRtg,
    h20_defRtg: homeL20.defRtg,
    
    // L20 stats - away (model only has: pace, ppg, netRtg, offRtg, defRtg - NO efg, NO ts!)
    a20_pace: awayL20.pace,
    a20_ppg: calcPPG(awayL20),
    a20_netRtg: awayL20.netRtg,
    a20_offRtg: awayL20.offRtg,
    a20_defRtg: awayL20.defRtg,
    
    // Interactions (use L10 as primary for interactions)
    netRtg_diff: homeL10.netRtg - awayL10.netRtg,
    netRtg_product: homeL10.netRtg * awayL10.netRtg,
    offense_vs_defense: homeL10.offRtg * awayL10.defRtg / 10000, // Normalize
    defensive_matchup: awayL10.offRtg * homeL10.defRtg / 10000, // Away off vs home def
    pace_avg: (homeL10.pace + awayL10.pace) / 2,
    pace_diff: homeL10.pace - awayL10.pace,
    pace_product: homeL10.pace * awayL10.pace / 10000,
    h_momentum: homeL10.netRtg * homeL10.winPct,
    a_momentum: awayL10.netRtg * awayL10.winPct,
    h_streak: homeL10.winPct > 0.6 ? 1 : (homeL10.winPct < 0.4 ? -1 : 0),
    a_streak: awayL10.winPct > 0.6 ? 1 : (awayL10.winPct < 0.4 ? -1 : 0),
    momentum_diff: (homeL10.netRtg * homeL10.winPct) - (awayL10.netRtg * awayL10.winPct),
    ppg_sum: homeL10.offRtg + awayL10.offRtg,
    ppg_diff: homeL10.offRtg - awayL10.offRtg,
    expected_total: (homeL10.offRtg + awayL10.offRtg) * (homeL10.pace + awayL10.pace) / 200,
    shooting_advantage: (homeL10.efg - awayL10.efg) * 100,
    h_efficiency: homeL10.offRtg / homeL10.pace,
    a_efficiency: awayL10.offRtg / awayL10.pace,
    offRtg_diff: homeL10.offRtg - awayL10.offRtg,
    defRtg_diff: homeL10.defRtg - awayL10.defRtg,
    winPct_diff: homeL10.winPct - awayL10.winPct,
    quality_matchup: (homeL10.netRtg + awayL10.netRtg) / 2,
    upset_factor: Math.abs(homeL10.winPct - awayL10.winPct) * (homeL10.winPct < awayL10.winPct ? 1 : -1),
    rating_pace_interaction: (homeL10.netRtg - awayL10.netRtg) * (homeL10.pace - awayL10.pace),
    form_rating_interaction: homeL10.winPct * homeL10.netRtg - awayL10.winPct * awayL10.netRtg,
    consistency: Math.abs(homeL10.netRtg / (homeL10.games + 1)) + Math.abs(awayL10.netRtg / (awayL10.games + 1)),
    home_advantage: 1
  };
}

/**
 * Generate human-readable key factors explaining the pick
 */
function generateKeyFactors(home, away, homeL10, awayL10, spreadPred, totalPred, homeExpectedPts, awayExpectedPts, homeInjuries, awayInjuries, opportunities) {
  const factors = [];
  
  // 1. MATCHUP ADVANTAGE (most important for spread/ML)
  const offensiveMatchup = {
    home: { off: homeL10.offRtg, vsDefense: awayL10.defRtg },
    away: { off: awayL10.offRtg, vsDefense: homeL10.defRtg }
  };
  
  // Find the biggest mismatch
  const homeOffVsAwayDef = homeL10.offRtg - awayL10.defRtg;
  const awayOffVsHomeDef = awayL10.offRtg - homeL10.defRtg;
  
  if (Math.abs(homeOffVsAwayDef) > 10 || Math.abs(awayOffVsHomeDef) > 10) {
    if (homeOffVsAwayDef > 10) {
      factors.push({
        label: '🔥 Offensive Mismatch',
        value: `${home.team.abbreviation} elite offense (${homeL10.offRtg.toFixed(1)}) vs ${away.team.abbreviation} weak defense (${awayL10.defRtg.toFixed(1)})`,
        impact: 'FAVOR_HOME'
      });
    } else if (homeOffVsAwayDef < -10) {
      factors.push({
        label: '🛡️ Defensive Edge',
        value: `${away.team.abbreviation} defense (${awayL10.defRtg.toFixed(1)}) locks down ${home.team.abbreviation} offense (${homeL10.offRtg.toFixed(1)})`,
        impact: 'FAVOR_AWAY'
      });
    }
    
    if (awayOffVsHomeDef > 10) {
      factors.push({
        label: '🔥 Road Offense Advantage',
        value: `${away.team.abbreviation} offense (${awayL10.offRtg.toFixed(1)}) vs ${home.team.abbreviation} poor defense (${homeL10.defRtg.toFixed(1)})`,
        impact: 'FAVOR_AWAY'
      });
    } else if (awayOffVsHomeDef < -10) {
      factors.push({
        label: '🛡️ Home Defense Dominance',
        value: `${home.team.abbreviation} defense (${homeL10.defRtg.toFixed(1)}) shuts down ${away.team.abbreviation} (${awayL10.offRtg.toFixed(1)})`,
        impact: 'FAVOR_HOME'
      });
    }
  }
  
  // 2. PACE & TEMPO (important for totals)
  const totalOpp = opportunities.find(o => o.market === 'Total');
  if (totalOpp) {
    const avgPace = (homeL10.pace + awayL10.pace) / 2;
    const leaguePace = 100;
    
    if (avgPace > 103) {
      factors.push({
        label: '⚡ Fast Pace Game',
        value: `Combined pace ${avgPace.toFixed(1)} (League avg: 100) = More possessions`,
        impact: totalOpp.pick.includes('Over') ? 'SUPPORTS_PICK' : 'OPPOSES_PICK'
      });
    } else if (avgPace < 97) {
      factors.push({
        label: '🐌 Slow Pace Game',
        value: `Combined pace ${avgPace.toFixed(1)} (League avg: 100) = Fewer possessions`,
        impact: totalOpp.pick.includes('Under') ? 'SUPPORTS_PICK' : 'OPPOSES_PICK'
      });
    }
  }
  
  // 3. RECENT FORM
  const homeForm = homeL10.winPct;
  const awayForm = awayL10.winPct;
  
  if (homeForm > 0.7 || awayForm > 0.7 || homeForm < 0.3 || awayForm < 0.3) {
    if (homeForm > 0.7) {
      factors.push({
        label: '📈 Home Team Hot',
        value: `${home.team.abbreviation} ${Math.round(homeForm * homeL10.games)}-${Math.round((1-homeForm) * homeL10.games)} last ${homeL10.games} (${(homeForm * 100).toFixed(0)}%)`,
        impact: 'FAVOR_HOME'
      });
    } else if (homeForm < 0.3) {
      factors.push({
        label: '📉 Home Team Cold',
        value: `${home.team.abbreviation} ${Math.round(homeForm * homeL10.games)}-${Math.round((1-homeForm) * homeL10.games)} last ${homeL10.games} (${(homeForm * 100).toFixed(0)}%)`,
        impact: 'FAVOR_AWAY'
      });
    }
    
    if (awayForm > 0.7) {
      factors.push({
        label: '📈 Road Team Hot',
        value: `${away.team.abbreviation} ${Math.round(awayForm * awayL10.games)}-${Math.round((1-awayForm) * awayL10.games)} last ${awayL10.games} (${(awayForm * 100).toFixed(0)}%)`,
        impact: 'FAVOR_AWAY'
      });
    } else if (awayForm < 0.3) {
      factors.push({
        label: '📉 Road Team Cold',
        value: `${away.team.abbreviation} ${Math.round(awayForm * awayL10.games)}-${Math.round((1-awayForm) * awayL10.games)} last ${awayL10.games} (${(awayForm * 100).toFixed(0)}%)`,
        impact: 'FAVOR_HOME'
      });
    }
  }
  
  // 4. INJURY IMPACT
  if (homeInjuries && homeInjuries.count > 0 && homeInjuries.severity !== 'NONE') {
    factors.push({
      label: '🏥 Home Injuries',
      value: `${home.team.abbreviation}: ${homeInjuries.players} (${homeInjuries.impact})`,
      impact: 'FAVOR_AWAY',
      detail: `Offense -${Math.abs(homeInjuries.deltaOff).toFixed(1)}, Defense -${Math.abs(homeInjuries.deltaDef).toFixed(1)}`
    });
  }
  
  if (awayInjuries && awayInjuries.count > 0 && awayInjuries.severity !== 'NONE') {
    factors.push({
      label: '🏥 Away Injuries',
      value: `${away.team.abbreviation}: ${awayInjuries.players} (${awayInjuries.impact})`,
      impact: 'FAVOR_HOME',
      detail: `Offense -${Math.abs(awayInjuries.deltaOff).toFixed(1)}, Defense -${Math.abs(awayInjuries.deltaDef).toFixed(1)}`
    });
  }
  
  // 5. PROJECTED SCORING (for totals)
  if (totalOpp) {
    factors.push({
      label: '🎯 Expected Scoring',
      value: `${home.team.abbreviation} ${homeExpectedPts.toFixed(0)} - ${away.team.abbreviation} ${awayExpectedPts.toFixed(0)} = ${(homeExpectedPts + awayExpectedPts).toFixed(0)} total`,
      impact: 'INFO',
      detail: `Vegas: ${totalOpp.vegasLine} (${totalOpp.edge} pt diff)`
    });
  }
  
  // Sort by impact/importance and return top 3-4
  const priorityOrder = ['🔥', '🛡️', '🏥', '📈', '📉', '⚡', '🐌', '🎯'];
  factors.sort((a, b) => {
    const aIcon = a.label.substring(0, 2);
    const bIcon = b.label.substring(0, 2);
    return priorityOrder.indexOf(aIcon) - priorityOrder.indexOf(bIcon);
  });
  
  return factors.slice(0, 4); // Top 4 most important factors
}

/**
 * Build 82-feature vector for V4 totals model (multi-window: L3/L10/L20)
 * Replaces old 18-feature buildSimpleFeatures
 */
function buildTotalFeaturesV4(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20) {
  // Safe accessor — falls back to league average if stat missing
  const s = (obj, key, fallback) => {
    const v = obj?.[key];
    return (v != null && Number.isFinite(v)) ? v : fallback;
  };

  // L3 raw stats
  const l3 = {
    h3_pace: s(homeL3, 'pace', 101), h3_offRtg: s(homeL3, 'offRtg', 114.5),
    h3_defRtg: s(homeL3, 'defRtg', 114.5), h3_ppg: s(homeL3, 'ppg', s(homeL3, 'offRtg', 114.5)),
    h3_efg: s(homeL3, 'efg', 0.535), h3_fgPct: s(homeL3, 'fgPct', 0.47),
    h3_fg3Pct: s(homeL3, 'fg3Pct', 0.36), h3_assists: s(homeL3, 'assists', 25.5),
    h3_turnovers: s(homeL3, 'turnovers', 13.5),
    a3_pace: s(awayL3, 'pace', 101), a3_offRtg: s(awayL3, 'offRtg', 114.5),
    a3_defRtg: s(awayL3, 'defRtg', 114.5), a3_ppg: s(awayL3, 'ppg', s(awayL3, 'offRtg', 114.5)),
    a3_efg: s(awayL3, 'efg', 0.535), a3_fgPct: s(awayL3, 'fgPct', 0.47),
    a3_fg3Pct: s(awayL3, 'fg3Pct', 0.36), a3_assists: s(awayL3, 'assists', 25.5),
    a3_turnovers: s(awayL3, 'turnovers', 13.5),
  };

  // L10 raw stats
  const l10 = {
    h10_pace: s(homeL10, 'pace', 101), h10_offRtg: s(homeL10, 'offRtg', 114.5),
    h10_defRtg: s(homeL10, 'defRtg', 114.5), h10_ppg: s(homeL10, 'ppg', s(homeL10, 'offRtg', 114.5)),
    h10_efg: s(homeL10, 'efg', 0.535), h10_fgPct: s(homeL10, 'fgPct', 0.47),
    h10_fg3Pct: s(homeL10, 'fg3Pct', 0.36), h10_ftPct: s(homeL10, 'ftPct', 0.78),
    h10_rebounds: s(homeL10, 'rebounds', 43.5), h10_assists: s(homeL10, 'assists', 25.5),
    h10_turnovers: s(homeL10, 'turnovers', 13.5), h10_ts: s(homeL10, 'ts', 0.575),
    a10_pace: s(awayL10, 'pace', 101), a10_offRtg: s(awayL10, 'offRtg', 114.5),
    a10_defRtg: s(awayL10, 'defRtg', 114.5), a10_ppg: s(awayL10, 'ppg', s(awayL10, 'offRtg', 114.5)),
    a10_efg: s(awayL10, 'efg', 0.535), a10_fgPct: s(awayL10, 'fgPct', 0.47),
    a10_fg3Pct: s(awayL10, 'fg3Pct', 0.36), a10_ftPct: s(awayL10, 'ftPct', 0.78),
    a10_rebounds: s(awayL10, 'rebounds', 43.5), a10_assists: s(awayL10, 'assists', 25.5),
    a10_turnovers: s(awayL10, 'turnovers', 13.5), a10_ts: s(awayL10, 'ts', 0.575),
  };

  // L20 raw stats
  const l20 = {
    h20_pace: s(homeL20, 'pace', 101), h20_offRtg: s(homeL20, 'offRtg', 114.5),
    h20_defRtg: s(homeL20, 'defRtg', 114.5), h20_ppg: s(homeL20, 'ppg', s(homeL20, 'offRtg', 114.5)),
    h20_efg: s(homeL20, 'efg', 0.535),
    a20_pace: s(awayL20, 'pace', 101), a20_offRtg: s(awayL20, 'offRtg', 114.5),
    a20_defRtg: s(awayL20, 'defRtg', 114.5), a20_ppg: s(awayL20, 'ppg', s(awayL20, 'offRtg', 114.5)),
    a20_efg: s(awayL20, 'efg', 0.535),
  };

  // Derived PPG values for interactions
  const hPpg10 = l10.h10_ppg, aPpg10 = l10.a10_ppg;
  const hPpg3 = l3.h3_ppg, aPpg3 = l3.a3_ppg;
  const hPpg20 = l20.h20_ppg, aPpg20 = l20.a20_ppg;
  
  // Interactions
  const interactions = {
    pace_avg_l10: (l10.h10_pace + l10.a10_pace) / 2,
    pace_diff_l10: l10.h10_pace - l10.a10_pace,
    pace_avg_l3: (l3.h3_pace + l3.a3_pace) / 2,
    pace_product: (l10.h10_pace * l10.a10_pace) / 10000,
    ppg_sum_l10: hPpg10 + aPpg10,
    ppg_sum_l3: hPpg3 + aPpg3,
    ppg_sum_l20: hPpg20 + aPpg20,
    ppg_diff_l10: hPpg10 - aPpg10,
    expected_total_l10: ((l10.h10_pace + l10.a10_pace) / 2 / 100) *
      (l10.h10_offRtg * (l10.a10_defRtg / 114.5) + l10.a10_offRtg * (l10.h10_defRtg / 114.5)),
    expected_total_l3: ((l3.h3_pace + l3.a3_pace) / 2 / 100) *
      (l3.h3_offRtg * (l3.a3_defRtg / 114.5) + l3.a3_offRtg * (l3.h3_defRtg / 114.5)),
    home_off_vs_away_def: l10.h10_offRtg - l10.a10_defRtg,
    away_off_vs_home_def: l10.a10_offRtg - l10.h10_defRtg,
    matchup_offense_sum: l10.h10_offRtg + l10.a10_offRtg,
    matchup_defense_sum: l10.h10_defRtg + l10.a10_defRtg,
    efg_sum: l10.h10_efg + l10.a10_efg,
    efg_diff: l10.h10_efg - l10.a10_efg,
    ts_sum: l10.h10_ts + l10.a10_ts,
    tov_sum: l10.h10_turnovers + l10.a10_turnovers,
    tov_diff: l10.h10_turnovers - l10.a10_turnovers,
    tovPct_avg: (s(homeL10, 'tovPct', 0.138) + s(awayL10, 'tovPct', 0.138)) / 2,
    orbPct_avg: (s(homeL10, 'orbPct', 0.25) + s(awayL10, 'orbPct', 0.25)) / 2,
    rebounds_sum: l10.h10_rebounds + l10.a10_rebounds,
    fta_sum: s(homeL10, 'fta', 22) + s(awayL10, 'fta', 22),
    home_form_trend: hPpg3 - hPpg20,
    away_form_trend: aPpg3 - aPpg20,
    home_pace_trend: l3.h3_pace - l20.h20_pace,
    away_pace_trend: l3.a3_pace - l20.a20_pace,
    winPct_sum: s(homeL10, 'winPct', 0.5) + s(awayL10, 'winPct', 0.5),
    winPct_diff: s(homeL10, 'winPct', 0.5) - s(awayL10, 'winPct', 0.5),
    home_court: 1,
  };

  return { ...l3, ...l10, ...l20, ...interactions };
}

/**
 * Predict with linear model
 */
function predict(model, features) {
  const { weights, bias, means, stds } = model;
  
  // Track missing features
  let pred = bias;
  let missing = 0;
  
  for (const [key, weight] of Object.entries(weights)) {
    if (!(key in features)) { 
      missing++; 
      continue; 
    }
    const value = features[key];
    if (!Number.isFinite(value)) { 
      missing++; 
      continue; 
    }
    const mean = means[key] ?? 0;
    const std = stds[key] ?? 1;
    const normalized = std > 0 ? (value - mean) / std : 0;
    pred += weight * normalized;
  }
  
  // Guard against low-information feature vectors
  if (missing > 20) { // ~25% of features (supports both 55-feature spread and 82-feature total models)
    throw new Error(`[NBA V2] Feature vector low information (missing=${missing}/${Object.keys(weights).length} features)`);
  }
  
  return pred;
}

/**
 * Main handler
 */
export default async (request, context) => {
  try {
    console.log('[NBA Elite V2] Starting predictions with ESPN + NBA CDN hybrid...');
    
    // 1. Fetch today's games from ESPN
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`;
    console.log('[NBA Elite V2] Fetching from:', espnUrl);
    
    const espnResponse = await fetch(espnUrl);
    const espnData = await espnResponse.json();
    
    console.log('[NBA Elite] ESPN returned', espnData.events?.length || 0, 'events');
    
    if (!espnData.events || espnData.events.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        games: 0,
        predictions: [],
        message: 'No games scheduled today'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 2. Detect season type (preseason vs regular season)
    const isPreseason = espnData.events[0]?.season?.type === 1; // Type 1 = preseason, 2 = regular season, 3 = playoffs
    
    if (isPreseason) {
      console.log('[NBA Elite V2] ⚠️  PRESEASON MODE - Predictions will be flagged as preseason (DO NOT track in regular season stats)');
    } else {
      console.log('[NBA Elite V2] Regular season detected - running full predictions');
    }
    
    // 3. Load team info (in-memory, no fs.readFile)
    const teamInfo = loadTeamInfo();
    console.log('[NBA Elite V2] Loaded team info:', Object.keys(teamInfo.byAbbr).length, 'teams');
    
    // 3.5. VERIFY MODEL SCALE EXPECTATIONS (run once per deployment)
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('[NBA V2] 🔍 MODEL SCALE VERIFICATION');
    const sampleFeatures = ['h10_efg', 'h10_ts', 'a10_efg', 'a10_ts', 'h10_tovPct', 'h20_efg'];
    const meanSample = {};
    sampleFeatures.forEach(k => {
      if (SPREAD_MODEL.means[k] != null) {
        meanSample[k] = SPREAD_MODEL.means[k].toFixed(6);
      }
    });
    console.log('[NBA V2] Training means sample:', meanSample);
    
    const efgMean = SPREAD_MODEL.means['h10_efg'];
    if (efgMean != null) {
      if (efgMean > 10) {
        console.log('[NBA V2] ✅ Model trained on 0-100 SCALE (h10_efg mean =', efgMean.toFixed(2), ')');
        console.log('[NBA V2] 📋 Feature construction MUST multiply efg/ts by 100');
      } else if (efgMean > 1) {
        console.log('[NBA V2] ⚠️  AMBIGUOUS SCALE (h10_efg mean =', efgMean.toFixed(3), ')');
        console.warn('[NBA V2] Cannot determine if model expects 0-1 or 0-100 scale');
      } else {
        console.log('[NBA V2] ✅ Model trained on 0-1 SCALE (h10_efg mean =', efgMean.toFixed(4), ')');
        console.log('[NBA V2] 📋 Feature construction should NOT multiply efg/ts by 100');
      }
    } else {
      console.warn('[NBA V2] ⚠️  h10_efg mean not found in model - cannot verify scale');
    }
    console.log('═══════════════════════════════════════════════════════════════');
    
    // 4. Fetch live Vegas lines (use correct endpoint for season type)
    const vegasLines = await fetchVegasLines(espnData.events.map(e => e.id), isPreseason);
    
    // 4.5. Pre-fetch all team rolling stats and injuries ONCE (avoid 80+ API calls)
    console.log('[NBA Elite V2] Pre-fetching team stats and injuries for all games...');
    const allTeams = new Set();
    for (const event of espnData.events) {
      const comp = event.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');
      // Normalize ESPN abbreviations to NBA abbreviations
      allTeams.add(normalizeAbbr(home.team.abbreviation));
      allTeams.add(normalizeAbbr(away.team.abbreviation));
    }
    
    // Fetch ALL team stats in parallel (20 teams max, 3 requests each = 60 total, but all parallel)
    const statsCache = {};
    const injuryCache = {};
    
    await Promise.all(
      Array.from(allTeams).map(async (nbaAbbr) => {
        try {
          const teamData = teamInfo.byAbbr[nbaAbbr];
          if (teamData) {
            statsCache[nbaAbbr] = await fetchTeamRollingStats(teamData.id, '2025-26');
          } else {
            console.warn(`[NBA Elite V2] ⚠️  No team data found for: ${nbaAbbr}`);
          }
          injuryCache[nbaAbbr] = await getTeamInjuries(nbaAbbr);
        } catch (err) {
          console.error(`[NBA Elite V2] Error pre-fetching ${nbaAbbr}:`, err.message);
        }
      })
    );
    
    console.log('[NBA Elite V2] Pre-fetch complete. Cached stats for:', Object.keys(statsCache).length, 'teams');
    console.log('[NBA V2] Teams in cache:', Object.keys(statsCache).sort().join(', '));
    
    // PROOF 1: Source audit - track where stats came from
    console.log('\n[AUDIT] === SOURCE TRACKING ===');
    for (const team of Object.keys(statsCache).sort()) {
      const l10Src = statsCache[team]?.l10?.source || 'unknown';
      const l20Src = statsCache[team]?.l20?.source || 'unknown';
      console.log(`[AUDIT] ${team}: L10=${l10Src}, L20=${l20Src}`);
    }
    
    // PROOF 2: Identity check - detect shared object references
    console.log('\n[AUDIT] === OBJECT IDENTITY CHECKS ===');
    const teams = Object.keys(statsCache).sort();
    if (teams.includes('HOU') && teams.includes('TOR')) {
      console.log(`[AUDIT] HOU===TOR: ${statsCache.HOU === statsCache.TOR}`);
      console.log(`[AUDIT] HOU.l10===TOR.l10: ${statsCache.HOU?.l10 === statsCache.TOR?.l10}`);
    }
    if (teams.includes('CLE') && teams.includes('BOS')) {
      console.log(`[AUDIT] CLE===BOS: ${statsCache.CLE === statsCache.BOS}`);
      console.log(`[AUDIT] CLE.l10===BOS.l10: ${statsCache.CLE?.l10 === statsCache.BOS?.l10}`);
    }
    if (teams.includes('ATL') && teams.includes('BKN')) {
      console.log(`[AUDIT] ATL===BKN: ${statsCache.ATL === statsCache.BKN}`);
      console.log(`[AUDIT] ATL.l10===BKN.l10: ${statsCache.ATL?.l10 === statsCache.BKN?.l10}`);
    }
    
    // PROOF 3: Value fingerprint - show actual numbers for clustered teams
    console.log('\n[AUDIT] === L10 VALUES (Clustered Teams) ===');
    const clusteredTeams = ['HOU', 'TOR', 'CLE', 'BOS', 'ORL', 'DET', 'ATL', 'BKN', 'SAC', 'CHI', 'IND', 'DAL'];
    for (const team of clusteredTeams) {
      if (statsCache[team]?.l10) {
        const l10 = statsCache[team].l10;
        console.log(`[AUDIT] ${team}: offRtg=${l10.offRtg?.toFixed(1)}, defRtg=${l10.defRtg?.toFixed(1)}, netRtg=${l10.netRtg?.toFixed(1)}, ts=${l10.ts?.toFixed(3)}, efg=${l10.efg?.toFixed(3)}`);
      }
    }
    console.log('');
    
    // GUARD: Fail fast if cache didn't populate correctly
    const cachedCount = Object.keys(statsCache).length;
    if (cachedCount < allTeams.size) {
      const missing = [...allTeams].filter(t => !statsCache[t]);
      console.error('[NBA V2] Missing from cache:', missing.join(', '));
      throw new Error(`[NBA V2] Stats cache incomplete: ${cachedCount}/${allTeams.size} teams. Missing: ${missing.join(', ')}`);
    }
    
    // 5. Generate predictions
    const predictions = [];
    
    for (const event of espnData.events) {
      try {
        const comp = event.competitions[0];
        const home = comp.competitors.find(c => c.homeAway === 'home');
        const away = comp.competitors.find(c => c.homeAway === 'away');
        
        console.log(`[NBA Elite V2] Processing: ${away.team.abbreviation} @ ${home.team.abbreviation}`);
        
        // Normalize abbreviations for consistent lookups
        const homeAbbr = normalizeAbbr(home.team.abbreviation);
        const awayAbbr = normalizeAbbr(away.team.abbreviation);
        
        // Get team IDs for NBA Stats API (using normalized abbreviations)
        const homeTeamData = teamInfo.byAbbr[homeAbbr];
        const awayTeamData = teamInfo.byAbbr[awayAbbr];
        
        if (!homeTeamData || !awayTeamData) {
          console.error(`[NBA Elite V2] ❌ Missing team data for ${homeAbbr} or ${awayAbbr} (ESPN: ${home.team.abbreviation} / ${away.team.abbreviation})`);
          console.error(`[NBA Elite V2] Available abbreviations:`, Object.keys(teamInfo.byAbbr).join(', '));
          continue;
        }
        
        console.log(`[NBA Elite V2] ✅ Matched: ${awayAbbr} (ID ${awayTeamData.id}) @ ${homeAbbr} (ID ${homeTeamData.id})`);
        
        // V2: Use cached stats instead of fetching per game
        const homeStats = statsCache[homeAbbr] || { l3: getDefaultStats(), l5: getDefaultStats(), l10: getDefaultStats(), l20: getDefaultStats() };
        const awayStats = statsCache[awayAbbr] || { l3: getDefaultStats(), l5: getDefaultStats(), l10: getDefaultStats(), l20: getDefaultStats() };
      
      // DEBUG: Check if we're using cached data or defaults
      if (!statsCache[homeAbbr]) {
        console.warn(`[NBA V2] ⚠️  ${homeAbbr} NOT IN CACHE - using defaults (will cause clustering)`);
      }
      if (!statsCache[awayAbbr]) {
        console.warn(`[NBA V2] ⚠️  ${awayAbbr} NOT IN CACHE - using defaults (will cause clustering)`);
      }
      console.log(`[DEBUG CACHE] ${homeAbbr}: cached=${!!statsCache[homeAbbr]}, ${awayAbbr}: cached=${!!statsCache[awayAbbr]}`);
      
      // Use L3 for V4 totals model, with L5 and L20 for specific features
      const homeL3Raw = homeStats.l3 || homeStats.l5 || getDefaultStats();  // V4: Use real L3
      const homeL10Raw = homeStats.l10 || getDefaultStats();
      const homeL20Raw = homeStats.l20 || getDefaultStats();
      
      const awayL3Raw = awayStats.l3 || awayStats.l5 || getDefaultStats();  // V4: Use real L3
      const awayL10Raw = awayStats.l10 || getDefaultStats();
      const awayL20Raw = awayStats.l20 || getDefaultStats();
      
      console.log(`[NBA Elite V2] ${home.team.abbreviation} games: L5=${homeL3Raw.games}, L10=${homeL10Raw.games}, L20=${homeL20Raw.games}`);
      console.log(`[NBA Elite V2] ${away.team.abbreviation} games: L5=${awayL3Raw.games}, L10=${awayL10Raw.games}, L20=${awayL20Raw.games}`);
      
      // ELITE: Count CURRENT SEASON games only for confidence adjustment
      const avgCurrentSeasonGames = (homeL10Raw.games + awayL10Raw.games) / 2;
      
      // Early season warning - but DON'T skip predictions
      if (avgCurrentSeasonGames < 5) {
        console.log(`[NBA Elite] ⚠️  Early season (avg ${avgCurrentSeasonGames.toFixed(1)} games) - using last season data for baseline`);
      }
      
      // Apply RCI adjustments based on games played this season
      // Each team uses their own games played for RCI adjustment
      const homeGamesPlayed = homeL10Raw.games; // Home team's current season games
      const awayGamesPlayed = awayL10Raw.games; // Away team's current season games
      
      const homeL3 = applyRCIAdjustment(homeL3Raw, homeAbbr, homeGamesPlayed);
      const homeL10 = applyRCIAdjustment(homeL10Raw, homeAbbr, homeGamesPlayed);
      const homeL20 = applyRCIAdjustment(homeL20Raw, homeAbbr, homeGamesPlayed);
      
      const awayL3 = applyRCIAdjustment(awayL3Raw, awayAbbr, awayGamesPlayed);
      const awayL10 = applyRCIAdjustment(awayL10Raw, awayAbbr, awayGamesPlayed);
      const awayL20 = applyRCIAdjustment(awayL20Raw, awayAbbr, awayGamesPlayed);
      
      // DEBUG: Log raw feature values to diagnose clustering
      console.log(`[DEBUG ${homeAbbr}@${awayAbbr}] Raw L10 before RCI:`, {
        home: { netRtg: homeL10Raw?.netRtg, efg: homeL10Raw?.efg, ts: homeL10Raw?.ts, games: homeL10Raw?.games },
        away: { netRtg: awayL10Raw?.netRtg, efg: awayL10Raw?.efg, ts: awayL10Raw?.ts, games: awayL10Raw?.games }
      });
      console.log(`[DEBUG ${homeAbbr}@${awayAbbr}] Post-RCI L10:`, {
        home: { netRtg: homeL10?.netRtg, efg: homeL10?.efg, ts: homeL10?.ts },
        away: { netRtg: awayL10?.netRtg, efg: awayL10?.efg, ts: awayL10?.ts }
      });
      
      // Log RCI adjustments for transparency
      const homeRCI = getRCISummary(homeAbbr, homeGamesPlayed);
      const awayRCI = getRCISummary(awayAbbr, awayGamesPlayed);
      console.log(`[RCI] ${homeAbbr}:`, homeRCI);
      console.log(`[RCI] ${awayAbbr}:`, awayRCI);
      
      // Fetch and apply injury adjustments (separate from RCI)
      let homeInjuries = [];
      let awayInjuries = [];
      let homeInjuryAdj = null;
      let awayInjuryAdj = null;
      let injuryAdvantage = null;
      
      try {
        // Use cached injuries instead of fetching per game
        homeInjuries = injuryCache[homeAbbr] || [];
        awayInjuries = injuryCache[awayAbbr] || [];
        
        // V2.1: Apply injury adjustments with production share weighting (pass team abbr)
        const homeL3WithInjuries = applyInjuryAdjustment(homeL3, homeInjuries, homeAbbr);
        const homeL10WithInjuries = applyInjuryAdjustment(homeL10, homeInjuries, homeAbbr);
        const homeL20WithInjuries = applyInjuryAdjustment(homeL20, homeInjuries, homeAbbr);
        const awayL3WithInjuries = applyInjuryAdjustment(awayL3, awayInjuries, awayAbbr);
        const awayL10WithInjuries = applyInjuryAdjustment(awayL10, awayInjuries, awayAbbr);
        const awayL20WithInjuries = applyInjuryAdjustment(awayL20, awayInjuries, awayAbbr);
        
        // V2.1: Get injury summaries with team abbr
        homeInjuryAdj = getInjurySummary(homeInjuries, homeAbbr);
        awayInjuryAdj = getInjurySummary(awayInjuries, awayAbbr);
        injuryAdvantage = getInjuryAdvantage(homeInjuries, awayInjuries, homeAbbr, awayAbbr);
        
        console.log(`[INJURY] ${home.team.abbreviation}:`, homeInjuryAdj);
        console.log(`[INJURY] ${away.team.abbreviation}:`, awayInjuryAdj);
        console.log(`[INJURY] Advantage:`, injuryAdvantage.advantage);
        
        // Use injury-adjusted stats for features
        var spreadFeatures = buildEliteFeatures(
          homeL3WithInjuries, homeL10WithInjuries, homeL20WithInjuries,
          awayL3WithInjuries, awayL10WithInjuries, awayL20WithInjuries
        );
        var totalFeatures = buildTotalFeaturesV4(
          homeL3WithInjuries, homeL10WithInjuries, homeL20WithInjuries,
          awayL3WithInjuries, awayL10WithInjuries, awayL20WithInjuries
        );
      } catch (injuryError) {
        console.log(`[INJURY] Error fetching injuries, using RCI-only adjustments:`, injuryError.message);
        
        // Fallback to RCI-only stats
        var spreadFeatures = buildEliteFeatures(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20);
        var totalFeatures = buildTotalFeaturesV4(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20);
      }
      
      // Ensure features are defined (from either injury-adjusted or fallback)
      if (typeof spreadFeatures === 'undefined') {
        var spreadFeatures = buildEliteFeatures(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20);
        var totalFeatures = buildTotalFeaturesV4(homeL3, homeL10, homeL20, awayL3, awayL10, awayL20);
      }
      
      // DIAGNOSTIC: Feature fingerprint to detect identical vectors
      const fingerprint = getFeatureFingerprint(spreadFeatures);
      console.log(`[NBA V2] ${awayAbbr}@${homeAbbr} feature hash: ${fingerprint.hash}`);
      
      // DEBUG: Log raw stats for clustering games
      if (predictions.length < 3) {
        console.log(`[DEBUG RAW] ${awayAbbr}@${homeAbbr}:`, {
          homeL10: { netRtg: homeL10.netRtg, efg: homeL10.efg, ts: homeL10.ts, games: homeL10.games },
          awayL10: { netRtg: awayL10.netRtg, efg: awayL10.efg, ts: awayL10.ts, games: awayL10.games }
        });
        console.log(`[DEBUG FEATURES] Sample:`, fingerprint.signature);
      }
      
      // Predict spread
      const spreadPred = predict(SPREAD_MODEL, spreadFeatures);
      
      // DEBUG: Log prediction
      if (predictions.length < 3) {
        console.log('  RAW PREDICTION:', spreadPred);
        console.log('  ROUNDED:', parseFloat(spreadPred.toFixed(1)));
      }
      
      // ELITE Total: Opponent-adjusted offensive projections
      // Account for defensive matchup quality
      const leagueAvgDefRtg = 114.5; // NBA league average
      const avgPace = (homeL10.pace + awayL10.pace) / 2;
      
      // Home team scoring: Adjust for away team's defense
      // If facing weak defense (115), score more. If facing elite (106), score less.
      const homeDefAdj = awayL10.defRtg / leagueAvgDefRtg;
      const homeExpectedPts = homeL10.offRtg * homeDefAdj * (avgPace / 100);
      
      // Away team scoring: Adjust for home team's defense
      const awayDefAdj = homeL10.defRtg / leagueAvgDefRtg;
      const awayExpectedPts = awayL10.offRtg * awayDefAdj * (avgPace / 100);
      
      // Total from matchup-adjusted projections
      const totalFromMatchup = homeExpectedPts + awayExpectedPts;
      
      // Also run the model prediction for comparison
      const totalPredModel = predict(TOTAL_MODEL, totalFeatures);
      
      // DEBUG: Log top feature contributions to diagnose under-prediction
      if (predictions.length < 2) {
        const { weights, means, stds } = TOTAL_MODEL;
        const contributions = [];
        for (const [key, weight] of Object.entries(weights)) {
          const value = totalFeatures[key];
          if (value == null || !Number.isFinite(value)) continue;
          const mean = means[key] ?? 0;
          const std = stds[key] ?? 1;
          const normalized = std > 0 ? (value - mean) / std : 0;
          const contribution = weight * normalized;
          contributions.push({ key, value: +value.toFixed(3), mean: +mean.toFixed(3), std: +std.toFixed(3), normalized: +normalized.toFixed(3), weight: +weight.toFixed(4), contribution: +contribution.toFixed(3) });
        }
        contributions.sort((a, b) => a.contribution - b.contribution); // Most negative first
        console.log(`[TOTAL DEBUG] ${awayAbbr}@${homeAbbr} prediction=${totalPredModel.toFixed(1)} (bias=${TOTAL_MODEL.bias.toFixed(1)})`);
        console.log(`[TOTAL DEBUG] TOP 10 NEGATIVE contributors:`, contributions.slice(0, 10));
        console.log(`[TOTAL DEBUG] TOP 10 POSITIVE contributors:`, contributions.slice(-10).reverse());
        console.log(`[TOTAL DEBUG] Sum of all contributions: ${contributions.reduce((s, c) => s + c.contribution, 0).toFixed(2)}`);
        console.log(`[TOTAL DEBUG] ppg_sum features: ppg_sum_l10=${totalFeatures.ppg_sum_l10?.toFixed(1)}, ppg_sum_l3=${totalFeatures.ppg_sum_l3?.toFixed(1)}, ppg_sum_l20=${totalFeatures.ppg_sum_l20?.toFixed(1)}`);
        console.log(`[TOTAL DEBUG] pace features: pace_avg_l10=${totalFeatures.pace_avg_l10?.toFixed(1)}, pace_product=${totalFeatures.pace_product?.toFixed(4)}`);
        console.log(`[TOTAL DEBUG] raw ppg: home=${homeL10?.ppg?.toFixed(1) ?? 'N/A'}, away=${awayL10?.ppg?.toFixed(1) ?? 'N/A'}`);
      }
      
      // PRODUCTION: Use 100% model prediction (backtest proven +8.12% ROI)
      // Model intentionally predicts below Vegas (finds UNDER value).
      // Strategy: Take ALL overs (strong signal when model agrees) +
      //           high-edge UNDERS only (6.5+ pts, 57% win rate, +9% ROI).
      // Previous 70/30 blend predicted ABOVE Vegas → false OVER edge → -4.23% ROI.
      // DO NOT BLEND - the systematic under-prediction IS the edge.
      const totalPred = totalPredModel;
      
      // Calculate base confidence
      const netRtgDiff = Math.abs(homeL10.netRtg - awayL10.netRtg);
      let confidence = 60;
      if (netRtgDiff > 8) confidence += 15;
      else if (netRtgDiff > 5) confidence += 10;
      else if (netRtgDiff > 3) confidence += 5;
      
      // EARLY SEASON ADJUSTMENT: Reduce confidence based on sample size
      // ELITE: Early season confidence adjustment based on CURRENT SEASON games only
      // First 5-10 games are learning period, model needs data to stabilize
      // Using avgCurrentSeasonGames (calculated above) instead of L10 games
      let seasonAdjustment = 1.0; // Full confidence multiplier
      let seasonNote = null;
      
      if (avgCurrentSeasonGames < 5) {
        seasonAdjustment = 0.5; // 50% confidence - very early season
        seasonNote = `EARLY SEASON: ${avgCurrentSeasonGames.toFixed(0)} games. Using last season baseline. HALF units.`;
      } else if (avgCurrentSeasonGames < 10) {
        seasonAdjustment = 0.75; // 75% confidence - still early
        seasonNote = `EARLY SEASON: ${avgCurrentSeasonGames.toFixed(0)} games. Model stabilizing. 3/4 units.`;
      }
      // REMOVED: < 15 game threshold - by game 10, sample size is adequate (12% of season)
      // Full confidence after 10 games to avoid missing high-edge opportunities
      
      confidence = Math.floor(confidence * seasonAdjustment);
      
      // =========================================================================
      // ROSTER TURBULENCE ADJUSTMENT (RCI-based)
      // Teams with low roster continuity have higher variance → reduce units
      // =========================================================================
      const homeRCIValue = getRawRCI(homeAbbr);
      const awayRCIValue = getRawRCI(awayAbbr);
      const turbulence = getRosterTurbulenceAdjustment(homeRCIValue, awayRCIValue);
      
      let turbulenceNote = turbulence.note;
      let unitsMultiplier = seasonAdjustment * turbulence.multiplier;
      
      if (turbulence.level !== 'STABLE') {
        console.log(`[TURBULENCE] ${homeAbbr} vs ${awayAbbr}: ${turbulence.level} (home RCI ${homeRCIValue.toFixed(2)}, away RCI ${awayRCIValue.toFixed(2)}) → ${(turbulence.multiplier * 100).toFixed(0)}% units`);
      }
      
      // =========================================================================
      // TRADE DEADLINE WINDOW PENALTY
      // 7 days before deadline = extra uncertainty across league
      // =========================================================================
      let tradeDeadlineNote = null;
      if (isInTradeDeadlineWindow()) {
        const deadlinePenalty = 0.85; // 15% reduction
        unitsMultiplier *= deadlinePenalty;
        confidence = Math.floor(confidence * deadlinePenalty);
        tradeDeadlineNote = 'TRADE DEADLINE: League-wide uncertainty – 15% units reduction.';
        console.log(`[TRADE DEADLINE] Applying 15% penalty (within 7-day window)`);
      }
      
      // Combine all adjustment notes
      const allAdjustmentNotes = [seasonNote, turbulenceNote, tradeDeadlineNote].filter(Boolean);

      // Win probability from spread
      // CRITICAL: Spread-to-probability conversion
      // NBA historical data shows: Each point of spread ≈ 2.5-3% win probability
      // Standard formula: winProb = 1 / (1 + exp(-spread / sigma))
      // where sigma calibrates the conversion (typical range: 8-12 for NBA)
      //
      // ISSUE: Current sigma=10 may be too high (makes underdogs look better)
      // Example: -11.6 spread with sigma=10 → 76% favorite (seems low)
      // Example: -11.6 spread with sigma=12 → 72% favorite (even lower!)
      // Example: -11.6 spread with sigma=8 → 80% favorite (better)
      //
      // Testing different sigmas:
      // sigma=8:  -11.6 → 80.4% favorite (BKN 19.6%)
      // sigma=10: -11.6 → 76.1% favorite (BKN 23.9%)  ← CURRENT
      // sigma=12: -11.6 → 72.6% favorite (BKN 27.4%)
      //
      // RECOMMENDATION: Use sigma=8 for more accurate probability estimation
      // This makes large spreads convert to higher win probabilities (more realistic)
      const SPREAD_TO_PROB_SIGMA = 8; // Calibrated for NBA (was 10, too generous to underdogs)
      const winProb = 1 / (1 + Math.exp(-spreadPred / SPREAD_TO_PROB_SIGMA));
      
      console.log(`[WIN PROB] ${home.team.abbreviation} vs ${away.team.abbreviation}: Spread ${spreadPred.toFixed(1)} → ${home.team.abbreviation} ${(winProb * 100).toFixed(1)}% / ${away.team.abbreviation} ${((1-winProb) * 100).toFixed(1)}%`);
      
      // Get Vegas lines for this game (match by abbreviations)
      const vegasKey = `${away.team.abbreviation}_${home.team.abbreviation}`;
      const gameVegasLines = vegasLines[vegasKey] || {};
      
      // Calculate edges and Kelly sizing
      const opportunities = [];
      
      // ELITE BETTING STRATEGY: Evaluate all market types and recommend the best EV play
      
      // 1. SPREAD OPPORTUNITY
      let spreadOpp = null;
      if (gameVegasLines.spread?.fair?.homeLine != null) {
        const modelSpreadVegasConvention = -spreadPred;
        
        // CRITICAL: Use FAIR pair (same book, tightest vig) for edge calculation
        const fairLine = gameVegasLines.spread.fair.homeLine;
        const fairHomePrice = gameVegasLines.spread.fair.homePrice;
        const fairAwayPrice = gameVegasLines.spread.fair.awayPrice;
        
        const spreadEdge = calculateEdgeAndKelly(
          modelSpreadVegasConvention,
          fairLine,
          fairHomePrice, // Use fair price for edge calc
          winProb,
          5000,
          seasonAdjustment, // Apply early season sizing reduction
          fairAwayPrice // Pass opponent odds for devigging
        );
        
        if (spreadEdge && spreadEdge.edgePoints >= 3) {
          // CRITICAL: Determine which side to bet
          // Both modelSpreadVegasConvention and fairLine are from HOME team's perspective
          // Negative = home favored, Positive = away favored
          // 
          // Example 1: Model has LAL -0.6 (home favored), Vegas has LAL +2.5 (away favored)
          //   → Model is more bullish on home than Vegas → Bet home (LAL)
          //   → -0.6 < +2.5 → betHome = TRUE ✅
          //
          // Example 2: Model has OKC -15.8, Vegas has OKC -6.5
          //   → Model is more bullish on home than Vegas → Bet home (OKC)
          //   → -15.8 < -6.5 → betHome = TRUE ✅
          //
          // Example 3: Model has Team +3.0 (away favored), Vegas has Team -2.0 (home favored)
          //   → Model is less bullish on home than Vegas → Bet away
          //   → +3.0 > -2.0 → betHome = FALSE ✅
          
          const betHome = modelSpreadVegasConvention < fairLine;
          const pickTeam = betHome ? home.team.abbreviation : away.team.abbreviation;
          
          // Get the line and price for the side we're betting
          // homeLine is from home's perspective, so if betting home use it directly
          // If betting away, we need the away line which is the opposite sign
          const placementHomeLine = gameVegasLines.spread.placement?.homeLine || fairLine;
          const placementHomePrice = gameVegasLines.spread.placement?.homePrice || fairHomePrice;
          const placementAwayPrice = gameVegasLines.spread.placement?.awayPrice || fairAwayPrice;
          const placementBook = gameVegasLines.spread.placement?.book || gameVegasLines.spread.fair.book;
          
          // Format the pick: if betting home use homeLine, if betting away use opposite of homeLine
          const displayLine = betHome ? placementHomeLine : -placementHomeLine;
          const displayPrice = betHome ? placementHomePrice : placementAwayPrice;
          const pickSign = displayLine >= 0 ? '+' : '';
          
          // Display string for model line: home team perspective with label
          const modelLineSign = modelSpreadVegasConvention >= 0 ? '+' : '';
          const modelLineDisplay = `${home.team.abbreviation} ${modelLineSign}${modelSpreadVegasConvention.toFixed(1)}`;
          
          spreadOpp = {
            market: 'Spread',
            pick: `${pickTeam} ${pickSign}${displayLine}`,
            modelLine: modelSpreadVegasConvention.toFixed(1), // Home-line convention (same as vegasLine)
            modelLineDisplay, // Team-labeled string for UI (e.g. "GS +11.1")
            vegasLine: fairLine, // Show fair line for transparency
            odds: displayPrice, // Use the correct side's price
            edge: spreadEdge.edgePoints,
            edgePercent: spreadEdge.edgePercent,
            kelly: spreadEdge.kellyFraction,
            betSize: spreadEdge.betSize,
            units: spreadEdge.units,
            confidence, // Add confidence level
            book: placementBook,
            fairBook: gameVegasLines.spread.fair.book, // Track which book was used for fair calc
            fairVig: gameVegasLines.spread.fair.vig.toFixed(1), // Log vig for audit
            expectedValue: spreadEdge.edgePercent * spreadEdge.betSize // EV in dollars
          };
        }
      }
      
      // 2. MONEYLINE OPPORTUNITY (for close games or high confidence)
      let moneylineOpp = null;
      if (gameVegasLines.moneyline?.fair?.homePrice != null) {
        // Use FAIR pair (same book, lowest vig) for edge calculation
        const fairHomeML = gameVegasLines.moneyline.fair.homePrice;
        const fairAwayML = gameVegasLines.moneyline.fair.awayPrice;
        
        // Convert moneyline to implied probability
        const homeImpliedProb = fairHomeML > 0 
          ? 100 / (fairHomeML + 100) 
          : Math.abs(fairHomeML) / (Math.abs(fairHomeML) + 100);
        const awayImpliedProb = fairAwayML > 0
          ? 100 / (fairAwayML + 100)
          : Math.abs(fairAwayML) / (Math.abs(fairAwayML) + 100);
        
        // Model win probability (already calculated)
        const homeWinProb = winProb;
        const awayWinProb = 1 - winProb;
        
        // Edge in probability terms (using fair odds)
        const homeMLEdge = homeWinProb - homeImpliedProb;
        const awayMLEdge = awayWinProb - awayImpliedProb;
        
        // Debug logging for moneyline edge calculation
        console.log(`[ML DEBUG] ${home.team.abbreviation} vs ${away.team.abbreviation}:`);
        console.log(`  Model Win Prob: ${home.team.abbreviation} ${(homeWinProb * 100).toFixed(1)}% / ${away.team.abbreviation} ${(awayWinProb * 100).toFixed(1)}%`);
        console.log(`  Vegas Implied: ${home.team.abbreviation} ${(homeImpliedProb * 100).toFixed(1)}% / ${away.team.abbreviation} ${(awayImpliedProb * 100).toFixed(1)}%`);
        console.log(`  Edge: ${home.team.abbreviation} ${(homeMLEdge * 100).toFixed(1)}% / ${away.team.abbreviation} ${(awayMLEdge * 100).toFixed(1)}%`);
        
        // Pick the side with positive edge (if any)
        // TIERED EDGE REQUIREMENTS based on win probability (with +0.1% hysteresis buffer):
        // FAVORITES (model predicts them to win):
        //   53-63%: Need 1.1% edge (must overcome efficiency + variance)
        //   63-70%: Need 2.3% edge (true market mispricing begins)
        //   70%+:   Need 3.6% edge (gold zone favorites)
        // UNDERDOGS (model predicts them to lose):
        //   40-53%: Need 3.1% edge (coin flip zone)
        //   30-40%: Need 6.1% edge AND odds ≥+200 (underdog sweet spot)
        //   <30%:   Need 10.1% edge (longshot protection)
        
        const meetsThreshold = (prob, edge, odds) => {
          // Favorites (prob >= 53%) - with hysteresis buffer
          if (prob >= 0.70) return edge > 0.036;  // Gold zone: 3.6% edge
          if (prob >= 0.63) return edge > 0.023;  // True mispricing: 2.3% edge
          if (prob >= 0.53) return edge > 0.011;  // Overcome efficiency: 1.1% edge
          // Underdogs/Coin flips (prob < 53%)
          if (prob >= 0.40) return edge > 0.031;  // Coin flip: 3.1% edge
          if (prob >= 0.30) return edge > 0.061 && odds >= 200; // Sweet spot: 6.1% edge + ≥+200 odds
          return edge > 0.101; // Longshot: 10.1% edge
        };
        
        const getTierLabel = (prob) => {
          if (prob >= 0.70) return 'Gold Zone Fav';
          if (prob >= 0.63) return 'Strong Fav';
          if (prob >= 0.53) return 'Mild Fav';
          if (prob >= 0.40) return 'Coin Flip';
          if (prob >= 0.30) return 'Dog Sweet Spot';
          return 'Longshot';
        };
        
        const hasHomeEdge = meetsThreshold(homeWinProb, homeMLEdge, fairHomeML > 0 ? fairHomeML : 0);
        const hasAwayEdge = meetsThreshold(awayWinProb, awayMLEdge, fairAwayML > 0 ? fairAwayML : 0);
        
        if (hasHomeEdge || hasAwayEdge) {
          // Pick the side with the larger POSITIVE edge (not just larger number)
          const pickHome = hasHomeEdge && (!hasAwayEdge || homeMLEdge > awayMLEdge);
          const pickedProb = pickHome ? homeWinProb : awayWinProb;
          const pickedEdge = pickHome ? homeMLEdge : awayMLEdge;
          const pickedOdds = pickHome ? fairHomeML : fairAwayML;
          const betTier = getTierLabel(pickedProb);
          
          // Use PLACEMENT odds (best available) for actual bet
          const placementHomeML = gameVegasLines.moneyline.placement?.homePrice || fairHomeML;
          const placementAwayML = gameVegasLines.moneyline.placement?.awayPrice || fairAwayML;
          const placementBook = gameVegasLines.moneyline.placement?.book || gameVegasLines.moneyline.fair.book;
          
          const pickOdds = pickHome ? placementHomeML : placementAwayML;
          const pickProb = pickHome ? homeWinProb : awayWinProb;
          const pickEdge = pickHome ? homeMLEdge : awayMLEdge;
          const pickImpliedProb = pickHome ? homeImpliedProb : awayImpliedProb;
          
          const mlKelly = calculateEdgeAndKelly(
            pickProb * 100, // Convert to 0-100 scale
            pickProb > 0.5 ? -100 : 100, // Dummy value, we use pickProb directly
            pickOdds,
            pickProb,
            5000,
            seasonAdjustment, // Apply early season sizing reduction
            pickHome ? placementAwayML : placementHomeML // Pass opponent odds for devigging
          );
          
          if (mlKelly) {
            // Don't cap units yet - will be done in centralized unit sizing section
            const rawUnits = mlKelly.units;
            
            // Track Only filter: Dogs <45% with raw units <0.2U become track-only
            const isTrackOnly = pickProb < 0.45 && rawUnits < 0.2;
            
            moneylineOpp = {
              market: 'Moneyline',
              pick: pickHome ? home.team.abbreviation : away.team.abbreviation,
              modelWinProb: (pickProb * 100).toFixed(1) + '%',
              impliedProb: (pickImpliedProb * 100).toFixed(1) + '%',
              p_model: pickProb,
              p_market_devig: pickImpliedProb,
              odds: pickOdds, // Placement odds
              edge: (pickEdge * 100).toFixed(1) + '%',
              edgePercent: pickEdge * 100,
              tier_label: betTier,
              kelly: mlKelly.kellyFraction,
              betSize: mlKelly.betSize,
              units: isTrackOnly ? 0 : rawUnits, // Will be capped later
              isTrackOnly,
              trackOnlyReason: isTrackOnly ? 'Low kelly (<0.2U) dog bet' : null,
              confidence, // Add confidence level
              book: placementBook,
              fairBook: gameVegasLines.moneyline.fair.book,
              fairVig: gameVegasLines.moneyline.fair.vig.toFixed(1),
              expectedValue: pickEdge * 100 * mlKelly.betSize
            };
            
            console.log(`[BETFILTER] game=${away.team.abbreviation}@${home.team.abbreviation} type=ML side=${moneylineOpp.pick} p_model=${pickProb.toFixed(3)} p_mkt=${pickImpliedProb.toFixed(3)} edge=${(pickEdge*100).toFixed(1)}% price=${pickOdds > 0 ? '+' : ''}${pickOdds} kellyQ=${mlKelly.kellyFraction.toFixed(2)} preCap=${rawUnits.toFixed(1)}U tier='${betTier}' kept=${!isTrackOnly} reason='${isTrackOnly ? 'low_kelly' : 'pass'}'`);
          }
        }
      }
      
      // 3. TEAM TOTALS (if we have the lines)
      const teamTotalOpps = [];
      
      // Home team total
      const homeTeamTotal = homeExpectedPts;
      const awayTeamTotal = awayExpectedPts;
      
      if (gameVegasLines.teamTotals?.home?.fair) {
        const fairLine = gameVegasLines.teamTotals.home.fair.line;
        const homeTeamEdge = Math.abs(homeTeamTotal - fairLine);
        
        if (homeTeamEdge >= 3) {
          const pickOver = homeTeamTotal > fairLine;
          
          // Use fair odds for edge, placement odds for bet
          const fairOdds = pickOver ? gameVegasLines.teamTotals.home.fair.overPrice : gameVegasLines.teamTotals.home.fair.underPrice;
          const placementOdds = pickOver 
            ? (gameVegasLines.teamTotals.home.placement?.overPrice || fairOdds)
            : (gameVegasLines.teamTotals.home.placement?.underPrice || fairOdds);
          const placementBook = gameVegasLines.teamTotals.home.placement?.book || gameVegasLines.teamTotals.home.fair.book;
          
          const homeTeamImpliedProb = Math.abs(fairOdds) / (Math.abs(fairOdds) + 100);
          const homeTeamEdgePercent = (homeTeamEdge / fairLine) * 100;
          
          teamTotalOpps.push({
            market: 'Team Total',
            team: home.team.displayName,
            pick: pickOver ? `Over ${fairLine}` : `Under ${fairLine}`,
            modelLine: homeTeamTotal.toFixed(1),
            vegasLine: fairLine,
            odds: placementOdds, // Placement odds
            edge: homeTeamEdge.toFixed(1),
            edgePercent: homeTeamEdgePercent,
            kelly: null,
            betSize: null,
            units: null,
            book: placementBook,
            fairBook: gameVegasLines.teamTotals.home.fair.book,
            fairVig: gameVegasLines.teamTotals.home.fair.vig.toFixed(1),
            expectedValue: homeTeamEdgePercent * 40 // Slightly less than game total
          });
        }
      }
      
      if (gameVegasLines.teamTotals?.away?.fair) {
        const fairLine = gameVegasLines.teamTotals.away.fair.line;
        const awayTeamEdge = Math.abs(awayTeamTotal - fairLine);
        
        if (awayTeamEdge >= 3) {
          const pickOver = awayTeamTotal > fairLine;
          
          // Use fair odds for edge, placement odds for bet
          const fairOdds = pickOver ? gameVegasLines.teamTotals.away.fair.overPrice : gameVegasLines.teamTotals.away.fair.underPrice;
          const placementOdds = pickOver 
            ? (gameVegasLines.teamTotals.away.placement?.overPrice || fairOdds)
            : (gameVegasLines.teamTotals.away.placement?.underPrice || fairOdds);
          const placementBook = gameVegasLines.teamTotals.away.placement?.book || gameVegasLines.teamTotals.away.fair.book;
          
          const awayTeamImpliedProb = Math.abs(fairOdds) / (Math.abs(fairOdds) + 100);
          const awayTeamEdgePercent = (awayTeamEdge / fairLine) * 100;
          
          teamTotalOpps.push({
            market: 'Team Total',
            team: away.team.displayName,
            pick: pickOver ? `Over ${fairLine}` : `Under ${fairLine}`,
            modelLine: awayTeamTotal.toFixed(1),
            vegasLine: fairLine,
            odds: placementOdds, // Placement odds
            edge: awayTeamEdge.toFixed(1),
            edgePercent: awayTeamEdgePercent,
            kelly: null,
            betSize: null,
            units: null,
            book: placementBook,
            fairBook: gameVegasLines.teamTotals.away.fair.book,
            fairVig: gameVegasLines.teamTotals.away.fair.vig.toFixed(1),
            expectedValue: awayTeamEdgePercent * 40
          });
        }
      }
      
      // 4. TOTAL OPPORTUNITY (V4 — calibration-curve Kelly staking)
      let totalOpp = null;
      if (gameVegasLines.total?.fair?.line != null) {
        const fairLine = gameVegasLines.total.fair.line;
        const totalEdge = Math.abs(totalPred - fairLine);
        const pickOver = totalPred > fairLine;
        
        // V4 CALIBRATION CURVE: edge bucket → empirical win rate
        // Built from 2,041 games (Oct 2024 – Mar 2026), V4 model predictions
        // Only bet when calibrated WR > 52.38% (breakeven at -110)
        const TOTALS_CALIBRATION = [
          { lo: 0,  hi: 1,  wr: 0.454 },  // NO BET — below breakeven
          { lo: 1,  hi: 2,  wr: 0.542 },  // small edge
          { lo: 2,  hi: 3,  wr: 0.549 },  // small edge
          { lo: 3,  hi: 4,  wr: 0.494 },  // NO BET — dead zone
          { lo: 4,  hi: 5,  wr: 0.569 },  // solid
          { lo: 5,  hi: 6,  wr: 0.480 },  // NO BET — dead zone
          { lo: 6,  hi: 7,  wr: 0.513 },  // NO BET — below breakeven
          { lo: 7,  hi: 8,  wr: 0.529 },  // marginal (above breakeven)
          { lo: 8,  hi: 9,  wr: 0.585 },  // good edge
          { lo: 9,  hi: 10, wr: 0.511 },  // NO BET — below breakeven
          { lo: 10, hi: 12, wr: 0.571 },  // solid
          { lo: 12, hi: 15, wr: 0.529 },  // marginal (backtest: 34 bets, 18 wins)
          { lo: 15, hi: 99, wr: 0.833 },  // very strong
        ];
        
        // Look up calibrated win probability for this edge size
        function getCalibratedWinProb(absEdge) {
          for (const bucket of TOTALS_CALIBRATION) {
            if (absEdge >= bucket.lo && absEdge < bucket.hi) return bucket.wr;
          }
          return 0.50; // fallback
        }
        
        const calibratedProb = getCalibratedWinProb(totalEdge);
        const BREAKEVEN = 1 / 1.909; // 52.38% at -110
        
        // Only create opportunity if calibrated probability exceeds breakeven
        if (calibratedProb > BREAKEVEN) {
          // Use fair odds for edge, placement odds for bet
          const fairOdds = pickOver ? gameVegasLines.total.fair.overPrice : gameVegasLines.total.fair.underPrice;
          const placementOdds = pickOver 
            ? (gameVegasLines.total.placement?.overPrice || fairOdds)
            : (gameVegasLines.total.placement?.underPrice || fairOdds);
          const placementBook = gameVegasLines.total.placement?.book || gameVegasLines.total.fair.book;
          
          const totalEdgePercent = (totalEdge / fairLine) * 100;
          
          // Quarter Kelly from calibration curve
          // Kelly: f* = (bp - q) / b where b = decimal odds - 1
          const decOdds = placementOdds > 0 
            ? 1 + placementOdds / 100 
            : 1 + 100 / Math.abs(placementOdds);
          const b = decOdds - 1;
          const q = 1 - calibratedProb;
          const fullKelly = (b * calibratedProb - q) / b;
          const quarterKelly = Math.max(0, Math.min(fullKelly * 0.25, 0.15)); // Cap at 15% bankroll
          
          // Convert to units (1 unit = 1% of bankroll, capped at 5 units)
          const kellyUnits = Math.min(Math.round(quarterKelly * 100 * 10) / 10, 5);
          const betSize = Math.round(quarterKelly * 5000); // $5000 assumed bankroll
          
          console.log(`[TOTAL V4] ${pickOver ? 'OVER' : 'UNDER'} ${fairLine} | Edge: ${totalEdge.toFixed(1)} | CalProb: ${(calibratedProb * 100).toFixed(1)}% | QKelly: ${(quarterKelly * 100).toFixed(2)}% | Units: ${kellyUnits}`);
          
          totalOpp = {
            market: 'Total',
            pick: pickOver ? `Over ${fairLine}` : `Under ${fairLine}`,
            modelLine: totalPred.toFixed(1),
            vegasLine: fairLine,
            odds: placementOdds,
            edge: totalEdge.toFixed(1),
            edgePercent: totalEdgePercent,
            kelly: quarterKelly,
            betSize: betSize,
            units: kellyUnits,
            confidence,
            book: placementBook,
            fairBook: gameVegasLines.total.fair.book,
            fairVig: gameVegasLines.total.fair.vig.toFixed(1),
            expectedValue: totalEdgePercent * 50,
            calibratedProb: (calibratedProb * 100).toFixed(1),
            modelVersion: 'V4'
          };
        } else {
          console.log(`[TOTAL V4] SKIP ${pickOver ? 'OVER' : 'UNDER'} ${fairLine} | Edge: ${totalEdge.toFixed(1)} | CalProb: ${(calibratedProb * 100).toFixed(1)}% < breakeven ${(BREAKEVEN * 100).toFixed(1)}%`);
        }
      }
      
      // ELITE DECISION: Recommend the best EV play(s)
      // Priority: 1) Best EV/Kelly 2) Spread if close game 3) ML if blowout 4) Total/Team Total if both
      
      let allOpps = [spreadOpp, moneylineOpp, totalOpp, ...teamTotalOpps].filter(Boolean);
      
      // DEDUPLICATION: If same side passes both ML and Spread, keep only highest EV
      if (spreadOpp && moneylineOpp) {
        const spreadSide = spreadOpp.pick.split(' ')[0]; // Extract team from "LAL +2.5"
        const mlSide = moneylineOpp.pick;
        
        if (spreadSide === mlSide) {
          // Improved selection hierarchy (Rule A/B/C)
          const winProb = moneylineOpp.p_model;
          const mlOdds = Number(moneylineOpp.odds);

          // spreadEdgePts definition: abs(modelSpread - vegasSpread) (same POV)
          const spreadModelLine = Number(spreadOpp.modelLine);
          const spreadVegasLine = Number(spreadOpp.vegasLine);
          const spreadEdgePts = (Number.isFinite(spreadModelLine) && Number.isFinite(spreadVegasLine))
            ? Math.abs(spreadModelLine - spreadVegasLine)
            : Math.abs(Number(spreadOpp.edge) || 0);

          const mlEdgePct = Number(moneylineOpp.edgePercent) || 0;
          const mlTooJuiced = Number.isFinite(mlOdds) ? (mlOdds <= -240) : false;
          const bigSpreadMispricing = spreadEdgePts >= 4.5;

          // Default choice
          let keepSpread = false;
          let reason = '';

          // Rule A — Big spread mispricing override
          if (bigSpreadMispricing) {
            keepSpread = true;
            reason = `big_spread_mispricing_${spreadEdgePts.toFixed(1)}pts`;
            const vegasSign = Number(spreadOpp.vegasLine) >= 0 ? '+' : '';
            spreadOpp.note = `Large spread mispricing: model ${spreadOpp.modelLineDisplay} vs Vegas ${home.team.abbreviation} ${vegasSign}${spreadOpp.vegasLine} (Δ ${spreadEdgePts.toFixed(1)} pts)`;
          }

          // Rule B — ML juice threshold
          if (!bigSpreadMispricing && mlTooJuiced) {
            keepSpread = true;
            reason = 'ml_too_juiced_prefer_spread';
          }

          // Rule C — Normal cases (refined)
          if (!bigSpreadMispricing && !mlTooJuiced) {
            if (winProb < 0.60) {
              keepSpread = true;
              reason = 'spread_better_variance_profile';
            } else if (winProb < 0.68) {
              keepSpread = (spreadOpp.expectedValue || 0) > (moneylineOpp.expectedValue || 0);
              reason = keepSpread ? 'spread_higher_ev' : 'ml_higher_ev';
            } else {
              // 68%+: ML primary only if spread mispricing is small (<= 2.5)
              if (spreadEdgePts <= 2.5) {
                keepSpread = false;
                reason = 'ml_cleaner_heavy_fav_small_spread_gap';
              } else {
                keepSpread = true;
                reason = `prefer_spread_nontrivial_spread_gap_${spreadEdgePts.toFixed(1)}pts`;
              }
            }
          }

          if (keepSpread) {
            moneylineOpp.suppressed_by = 'Spread';
            moneylineOpp.suppression_reason = reason;
            allOpps = allOpps.filter(o => o !== moneylineOpp);
            console.log(`[DEDUP] ${spreadSide}: Suppressed ML (kept Spread) - ${reason}`);
          } else {
            spreadOpp.suppressed_by = 'Moneyline';
            spreadOpp.suppression_reason = reason;
            allOpps = allOpps.filter(o => o !== spreadOpp);
            console.log(`[DEDUP] ${mlSide}: Suppressed Spread (kept ML) - ${reason}`);
          }
        }
      }
      
      // Sort by expected value (EV)
      allOpps.sort((a, b) => (b.expectedValue || 0) - (a.expectedValue || 0));
      
      // =========================================================================
      // APPLY ROSTER/DEADLINE MULTIPLIER TO ALL UNITS
      // This applies the RCI turbulence + trade deadline adjustments
      // =========================================================================
      if (unitsMultiplier < 1.0) {
        console.log(`[UNITS MULTIPLIER] Applying ${(unitsMultiplier * 100).toFixed(0)}% multiplier to all bets`);
        allOpps.forEach(opp => {
          if (opp.units && opp.units > 0 && !opp.isTrackOnly) {
            const oldUnits = opp.units;
            opp.units = Math.round(opp.units * unitsMultiplier * 10) / 10;
            console.log(`  ${opp.market} ${opp.pick}: ${oldUnits.toFixed(1)}U → ${opp.units.toFixed(1)}U`);
          }
        });
      }
      
      // UNIT SIZING AND EXPOSURE MANAGEMENT
      console.log(`[UNIT SIZING START] Processing ${allOpps.length} opportunities for ${away.team.abbreviation} @ ${home.team.abbreviation}`);
      allOpps.forEach((opp, idx) => {
        console.log(`  [BEFORE ${idx}] ${opp.market} ${opp.pick}: ${opp.units}U (trackOnly: ${!!opp.isTrackOnly})`);
      });
      
      // Step 1: Apply individual bet cap (max 8 units per bet)
      // Raised from 5U to 8U to allow SUPER HIGH EDGE bets (Nov 2025)
      let cappedCount = 0;
      allOpps.forEach((opp, idx) => {
        // Skip track-only bets (already 0)
        if (opp.isTrackOnly) {
          console.log(`  [SKIP ${idx}] ${opp.market} ${opp.pick}: Track-only, leaving at 0U`);
          return;
        }
        
        const originalUnits = opp.units;
        if (opp.units > 8) {
          console.log(`  [CAP ${idx}] ${opp.market} ${opp.pick}: ${opp.units.toFixed(1)}U → 8.0U`);
          opp.units = 8.0;
          cappedCount++;
        }
        // Round to 1 decimal place
        opp.units = Math.round(opp.units * 10) / 10;
        console.log(`  [AFTER ${idx}] ${opp.market} ${opp.pick}: ${originalUnits.toFixed(1)}U → ${opp.units.toFixed(1)}U`);
      });
      console.log(`[UNIT CAP COMPLETE] Capped ${cappedCount} bets`);
      
      // Step 2: Apply per-game exposure cap (max 18 units total)
      // Raised from 12.5U to 18U to allow multiple high-edge bets per game (Nov 2025)
      const totalExposure = allOpps.reduce((sum, opp) => sum + (opp.units || 0), 0);
      if (totalExposure > 18) {
        const scale = 18 / totalExposure;
        console.log(`[EXPOSURE CAP] Game total ${totalExposure.toFixed(1)}U > 18U, scaling by ${scale.toFixed(3)}x`);
        allOpps.forEach(opp => {
          if (opp.isTrackOnly) return;
          const oldUnits = opp.units;
          opp.units = Math.round((opp.units * scale) * 10) / 10;
          console.log(`  ${opp.market} ${opp.pick}: ${oldUnits.toFixed(1)}U → ${opp.units.toFixed(1)}U`);
        });
      }
      
      // Log final game exposure
      const finalExposure = allOpps.reduce((sum, opp) => sum + (opp.units || 0), 0);
      console.log(`[FINAL EXPOSURE] Game total: ${finalExposure.toFixed(1)}U (${allOpps.filter(o => !o.isTrackOnly).length} active bets)`);
      
      // Apply hedging system to add hedge/double-down bets (EV-aware V2)
      const { applyHedgingSystem } = await import('../_lib/nba/bet-hedging.mjs');
      const enhancedOpps = applyHedgingSystem(allOpps, { home: home.team, away: away.team }, gameVegasLines);
      
      // Add top 3 opportunities (or all if fewer)
      opportunities.push(...enhancedOpps.slice(0, 3));
      
      // Store team totals for advanced users
      const teamTotals = {
        home: {
          team: home.team.abbreviation,
          projection: homeExpectedPts.toFixed(1),
          factors: {
            offRtg: homeL10.offRtg.toFixed(1),
            vsDefense: awayL10.defRtg.toFixed(1),
            adjustment: homeDefAdj.toFixed(3),
            pace: avgPace.toFixed(1)
          }
        },
        away: {
          team: away.team.abbreviation,
          projection: awayExpectedPts.toFixed(1),
          factors: {
            offRtg: awayL10.offRtg.toFixed(1),
            vsDefense: homeL10.defRtg.toFixed(1),
            adjustment: awayDefAdj.toFixed(3),
            pace: avgPace.toFixed(1)
          }
        }
      };
      
      predictions.push({
        gameId: event.id,
        game: `${away.team.abbreviation} @ ${home.team.abbreviation}`,
        gameTime: event.date,
        isPreseason,  // ⚠️ FLAG: Do not include preseason games in regular season performance tracking
        teams: {
          home: {
            name: home.team.displayName,
            abbreviation: home.team.abbreviation,
            record: home.records?.[0]?.summary || '',
            rci: homeRCI,
            injuries: homeInjuryAdj
          },
          away: {
            name: away.team.displayName,
            abbreviation: away.team.abbreviation,
            record: away.records?.[0]?.summary || '',
            rci: awayRCI,
            injuries: awayInjuryAdj
          }
        },
        injuryReport: injuryAdvantage,
        prediction: {
          spread: {
            prediction: parseFloat(spreadPred.toFixed(1)),
            favorite: spreadPred > 0 ? 'home' : 'away',
            line: parseFloat(Math.abs(spreadPred).toFixed(1)),
            display: spreadPred > 0 
              ? `${home.team.abbreviation} -${Math.abs(spreadPred).toFixed(1)}`
              : spreadPred < 0
                ? `${away.team.abbreviation} -${Math.abs(spreadPred).toFixed(1)}`
                : `${home.team.abbreviation} ${spreadPred.toFixed(1)}`
          },
          total: {
            prediction: parseFloat(totalPred.toFixed(1)),
            over: totalPred > 220,
            under: totalPred < 220
          },
          winProbability: {
            home: parseFloat((winProb * 100).toFixed(1)),
            away: parseFloat(((1 - winProb) * 100).toFixed(1)),
            favoriteTeam: winProb > 0.5 ? home.team.abbreviation : away.team.abbreviation,
            favoritePercent: parseFloat((Math.max(winProb, 1 - winProb) * 100).toFixed(1))
          },
          confidence,
          adjustmentNotes: allAdjustmentNotes.length > 0 ? allAdjustmentNotes : null, // All adjustment notes (season, turbulence, deadline)
          seasonNote // Legacy: Early season warning if applicable
        },
        keyFactors: generateKeyFactors(
          home, away, homeL10, awayL10, 
          spreadPred, totalPred, 
          homeExpectedPts, awayExpectedPts,
          homeInjuryAdj, awayInjuryAdj,
          opportunities
        ),
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
        featureHash: fingerprint.hash,  // Add feature fingerprint for debugging
        vegasLines: {
          spread: gameVegasLines.spread?.fair?.homeLine != null ? {
            line: gameVegasLines.spread.fair.homeLine,
            price: gameVegasLines.spread.fair.homePrice,
            fairBook: gameVegasLines.spread.fair.book,
            placementBook: gameVegasLines.spread.placement?.book,
            vig: gameVegasLines.spread.fair.vig,
            display: gameVegasLines.spread.fair.homeLine > 0
              ? `${home.team.abbreviation} +${gameVegasLines.spread.fair.homeLine}`
              : gameVegasLines.spread.fair.homeLine < 0
                ? `${home.team.abbreviation} ${gameVegasLines.spread.fair.homeLine}`
                : `${home.team.abbreviation} ${gameVegasLines.spread.fair.homeLine}`
          } : null,
          total: gameVegasLines.total?.fair?.line != null ? {
            line: gameVegasLines.total.fair.line,
            overPrice: gameVegasLines.total.fair.overPrice,
            underPrice: gameVegasLines.total.fair.underPrice,
            fairBook: gameVegasLines.total.fair.book,
            placementBook: gameVegasLines.total.placement?.book,
            vig: gameVegasLines.total.fair.vig
          } : null,
          moneyline: gameVegasLines.moneyline?.fair?.homePrice != null ? {
            home: gameVegasLines.moneyline.fair.homePrice,
            away: gameVegasLines.moneyline.fair.awayPrice,
            homeDisplay: gameVegasLines.moneyline.fair.homePrice > 0 
              ? `${home.team.abbreviation} +${gameVegasLines.moneyline.fair.homePrice}`
              : `${home.team.abbreviation} ${gameVegasLines.moneyline.fair.homePrice}`,
            awayDisplay: gameVegasLines.moneyline.fair.awayPrice > 0 
              ? `${away.team.abbreviation} +${gameVegasLines.moneyline.fair.awayPrice}`
              : `${away.team.abbreviation} ${gameVegasLines.moneyline.fair.awayPrice}`,
            fairBook: gameVegasLines.moneyline.fair.book,
            placementBook: gameVegasLines.moneyline.placement?.book,
            vig: gameVegasLines.moneyline.fair.vig
          } : null
        },
        opportunities,
        teamTotals // NEW: Individual team scoring projections
      });
      } catch (gameError) {
        const comp = event.competitions?.[0];
        const homeTeam = comp?.competitors?.find?.(c => c.homeAway === 'home')?.team?.abbreviation || '?';
        const awayTeam = comp?.competitors?.find?.(c => c.homeAway === 'away')?.team?.abbreviation || '?';
        console.error(`[NBA Elite V2] Error processing ${awayTeam} @ ${homeTeam}:`, gameError.message);
        console.error(`[NBA Elite V2] Stack:`, gameError.stack);
        // Continue to next game instead of failing entire function
      }
    }
    
    console.log(`[NBA Elite V2.1] Generated ${predictions.length} predictions`);
    
    // Calculate response size before sending
    const responseData = {
      ok: true,
      generated: new Date().toISOString(),
      games: predictions.length,
      predictions,
      isPreseason,
      preseasonWarning: isPreseason ? 'Preseason predictions are for observation only. Model is trained on regular season data. DO NOT track these results in regular season performance metrics.' : null,
      modelInfo: {
        type: 'Elite Ensemble',
        version: 'V2.1',
        versionNotes: 'Production share injury weighting - stars weighted 2x+ vs bench players',
        features: 55,
        spreadMAE: 11.606,
        totalMAE: 15.89,
        dataSource: 'Netlify Blobs + ESPN',
        injurySystem: 'V2.1 Production Share',
        status: isPreseason ? '⚠️ Preseason - Observation Only' : 'Regular Season - Full Tracking'
      }
    };
    
    // GUARD: Detect spread variance collapse (size-aware threshold)
    // Motivation: low variance in spreads is common on small slates (2-6 games) and is not
    // necessarily a model failure. We only hard-fail when inputs appear duplicated (a real
    // pipeline bug signal) AND the slate truly collapses (tiny range + tiny stdev).
    // Skip variance check for single-game slates (stdev is always 0 with n=1)
    if (predictions.length > 1) {
      const spreads = predictions.map(p => Math.abs(p.prediction.spread.prediction));
      const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
      const variance = spreads.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / spreads.length;
      const stdev = Math.sqrt(variance);
      const min = Math.min(...spreads);
      const max = Math.max(...spreads);
      const range = max - min;
      
      // Size-aware threshold: larger slates should have more variance.
      // IMPORTANT: at n=4 (your case), stdev~1.0 is not abnormal if the board is tight.
      const targetStdev = predictions.length <= 3
        ? 0.5
        : predictions.length <= 6
          ? 1.2
          : Math.max(1.3, 0.4 * Math.sqrt(predictions.length + 4));
      
      console.log(`[NBA V2] Spread variance: stdev=${stdev.toFixed(2)} (target=${targetStdev.toFixed(2)}), range=${range.toFixed(1)} (${min.toFixed(1)} to ${max.toFixed(1)}), mean=${mean.toFixed(1)}`);
      
      // Check for duplicate feature hashes (indicates identical inputs)
      const hashes = predictions.map(p => p.featureHash).filter(h => h);
      const uniqueHashes = new Set(hashes);
      if (uniqueHashes.size < hashes.length) {
        const dupeCount = hashes.length - uniqueHashes.size;
        console.warn(`[NBA V2] ⚠️  ${dupeCount} games have duplicate feature vectors (identical inputs)`);
      }

      const dupeFeatureVectors = uniqueHashes.size < hashes.length;
      
      // Behavior:
      // - n<=3: always skip (too few samples)
      // - good range => pass
      // - if variance is low, warn; only hard-fail when it's *extremely* low AND range is poor
      //   AND we see duplicated feature vectors (strong sign of a pipeline/input bug).
      if (predictions.length <= 3) {
        console.log(`[NBA V2] Small slate (${predictions.length} games) - skipping strict variance check`);
      } else if (range >= 4.0) {
        console.log(`[NBA V2] Good spread range (${range.toFixed(1)}pts) - variance check passed`);
      } else {
        const clustered = spreads.filter(s => Math.abs(s - mean) < 1.0).length;

        // "Hard fail" only when we have a real collapse signal.
        const hardFail = dupeFeatureVectors && range < 3.0 && stdev < 0.75;

        if (hardFail) {
          throw new Error(`[NBA V2] Spread variance collapsed: stdev=${stdev.toFixed(2)} (target=${targetStdev.toFixed(2)}), range=${range.toFixed(1)} (${clustered}/${spreads.length} near ${mean.toFixed(1)}). Duplicate feature vectors detected - likely input pipeline issue.`);
        }

        // Otherwise: warn-only. This prevents production outages when the slate is just tight.
        if (stdev < targetStdev) {
          console.warn(`[NBA V2] ⚠️  Low spread variance (stdev=${stdev.toFixed(2)} < target=${targetStdev.toFixed(2)}), range=${range.toFixed(1)}; continuing (non-fatal).`);
        }
      }
    } else if (predictions.length === 1) {
      console.log(`[NBA V2] Single game slate - skipping variance check`);
    }
    
    // TIER SUMMARY LOGGING
    const tierStats = {};
    predictions.forEach(pred => {
      pred.opportunities?.forEach(opp => {
        if (opp.tier_label) {
          if (!tierStats[opp.tier_label]) {
            tierStats[opp.tier_label] = { count: 0, totalEdge: 0, totalUnits: 0 };
          }
          tierStats[opp.tier_label].count++;
          tierStats[opp.tier_label].totalEdge += opp.edgePercent || 0;
          tierStats[opp.tier_label].totalUnits += opp.units || 0;
        }
      });
    });
    
    Object.keys(tierStats).forEach(tier => {
      const stats = tierStats[tier];
      const avgEdge = stats.count > 0 ? (stats.totalEdge / stats.count).toFixed(1) : '0.0';
      const avgUnits = stats.count > 0 ? (stats.totalUnits / stats.count).toFixed(1) : '0.0';
      console.log(`[TIER_SUMMARY] ${tier}: kept ${stats.count} (avg edge ${avgEdge}%, avg units ${avgUnits}U)`);
    });
    
    const jsonString = JSON.stringify(responseData);
    const sizeInKB = (jsonString.length / 1024).toFixed(2);
    console.log(`[NBA Elite V2] Response size: ${sizeInKB} KB`);
    
    // 🆕 SAVE GAME PREDICTIONS FOR TRACKING (skip preseason)
    if (!isPreseason && predictions.length > 0) {
      try {
        const gamePredictions = predictions.map(p => ({
          gameId: p.gameId || null,
          gameTime: p.gameTime,
          homeTeam: p.home,
          awayTeam: p.away,
          predictedWinner: p.prediction?.spread?.prediction > 0 ? p.home : p.away,
          predictedMargin: Math.abs(p.prediction?.spread?.prediction || 0),
          confidence: p.prediction?.confidence || null,
          homeOdds: p.odds?.moneyline?.home,
          awayOdds: p.odds?.moneyline?.away,
          spread: p.odds?.spread?.line,
          total: p.odds?.total?.line,
          model: 'Elite Ensemble V2',
          recommendationTier: p.opportunities?.[0]?.tier_label || null
        }));
        
        const today = new Date().toISOString().split('T')[0];
        await saveGamePredictions(gamePredictions, today);
        console.log(`[NBA Elite V2] 📊 Saved ${gamePredictions.length} game predictions for tracking`);
      } catch (trackingError) {
        console.error('[NBA Elite V2] ⚠️ Failed to save tracking data:', trackingError.message);
        // Don't fail the request if tracking fails
      }
    }
    
    return new Response(jsonString, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300',
        'Content-Length': String(jsonString.length)
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
