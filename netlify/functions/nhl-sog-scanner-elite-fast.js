/**
 * NHL SOG SCANNER V4.0 - ELITE PROJECTIONS WITH SPEED OPTIMIZATION
 * 
 * COMBINES:
 * - Elite projection engine (individual player stats, opponent adjustments, etc.)
 * - Speed optimizations (parallel fetching, caching, pre-loaded data)
 * - Real odds integration
 * - Proper ZINB probability calculations
 * 
 * ANTI-502 PROTECTIONS:
 * - Pre-load all player/team stats from Netlify Blobs (ONE read at start)
 * - Parallel roster fetching
 * - 10-second timeout protection
 * - Graceful degradation if elite stats unavailable
 * - Early returns if taking too long
 * 
 * SOLUTION: CommonJS with wrapper to access ESM lib safely
 */

const elite = require('./_lib/nhl-elite-projection-v4.cjs.js');

/**
 * ELITE VIG REMOVAL HELPERS
 * Removes bookmaker margin to get fair probabilities
 */
function oddsToImpliedProb(americanOdds) {
  if (americanOdds >= 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

function removeVig(overOdds, underOdds) {
  const overImplied = oddsToImpliedProb(overOdds);
  const underImplied = oddsToImpliedProb(underOdds);
  const total = overImplied + underImplied;
  
  // Normalize to remove vig
  const overNoVig = overImplied / total;
  const underNoVig = underImplied / total;
  const vigPct = ((total - 1.0) * 100);
  
  return { overProb: overNoVig, underProb: underNoVig, vigPct };
}

function getFairProbability(playerName, line, direction, oddsPairsMap) {
  // Try to find a same-book pair for this player+line
  // Prefer books in quality order
  const BOOK_PRIORITY = ['FanDuel', 'DraftKings', 'Fanatics', 'Caesars', 'ESPN BET', 'BetMGM'];
  
  for (const book of BOOK_PRIORITY) {
    const key = `${playerName}_${line}_${book}`;
    const pair = oddsPairsMap.get(key);
    
    if (pair && pair.overOdds && pair.underOdds) {
      const { overProb, underProb, vigPct } = removeVig(pair.overOdds, pair.underOdds);
      
      // Guard: Skip if vig > 7% (suspicious market)
      if (vigPct > 7.0) continue;
      
      return {
        fairProb: direction === 'OVER' ? overProb : underProb,
        vigPct,
        book: pair.bookmaker,
        hasPair: true
      };
    }
  }
  
  // Fallback: No pair found, return null (we'll skip edge calc)
  return { fairProb: null, vigPct: null, book: null, hasPair: false };
}

/**
 * Calculate Kelly Criterion stake with proper odds adjustment
 */
function calculateKelly(modelProb, americanOdds, variance = 0) {
  const p = modelProb;
  const q = 1 - p;
  
  let b;
  if (americanOdds >= 0) {
    b = americanOdds / 100;
  } else {
    b = 100 / Math.abs(americanOdds);
  }
  
  let kelly = (b * p - q) / b;
  
  if (variance > 0) {
    kelly *= (1 - Math.min(variance / 5, 0.3));
  }
  
  kelly *= 0.25;
  return Math.max(0, Math.min(kelly, 0.03));
}

/**
 * Fetch real odds from The Odds API
 */
async function fetchNHLOdds() {
  const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ No Odds API key found');
    return null;
  }
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/events?regions=us&dateFormat=iso&apiKey=${apiKey}`;
    
    const eventsResponse = await fetch(eventsUrl);
    if (!eventsResponse.ok) return null;
    
    const events = await eventsResponse.json();
    const todayEvents = events.filter(event => event.commence_time?.startsWith(today));
    
    console.log(`📅 Found ${events.length} total events, ${todayEvents.length} for today (${today})`);
    
    if (todayEvents.length === 0) return null;
    
    // Limit to 5 games max for speed
    const oddsPromises = todayEvents.slice(0, 5).map(async (event) => {
      try {
        const propsUrl = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/events/${event.id}/odds?regions=us&markets=player_shots_on_goal&oddsFormat=american&dateFormat=iso&apiKey=${apiKey}`;
        const propsResponse = await fetch(propsUrl);
        if (!propsResponse.ok) {
          console.log(`⚠️ Props not available for event ${event.id}: ${propsResponse.status}`);
          return null;
        }
        const propsData = await propsResponse.json();
        const bookmakerCount = propsData.bookmakers?.length || 0;
        console.log(`📊 Event ${event.home_team} vs ${event.away_team}: ${bookmakerCount} bookmakers with SOG props`);
        return { event, props: propsData };
      } catch (e) {
        console.log(`❌ Error fetching props for ${event.id}:`, e.message);
        return null;
      }
    });
    
    const oddsResults = await Promise.all(oddsPromises);
    const validResults = oddsResults.filter(Boolean);
    console.log(`✅ Got valid odds data for ${validResults.length}/${todayEvents.length} games`);
    return validResults;
    
  } catch (error) {
    console.warn('⚠️ Odds API error:', error.message);
    return null;
  }
}

/**
 * PROCESS REAL ODDS FROM THE ODDS API
 * Returns TWO Maps:
 * 1. playerOddsMap: Single-side odds for best placement (keyed by PLAYER_LINE_DIRECTION)
 * 2. playerPairsMap: Both-side pairs for vig removal (keyed by PLAYER_LINE_BOOK)
 */
function processRealOdds(oddsData) {
  if (!oddsData) return { singles: new Map(), pairs: new Map() };
  
  const playerOddsMap = new Map(); // Best single-sided odds
  const playerPairsMap = new Map(); // OVER+UNDER pairs for vig removal
  
  // Books to check for NHL SOG props
  const PRIORITY_BOOKS = ['FanDuel', 'DraftKings', 'Fanatics', 'Caesars', 'ESPN BET', 'BetMGM'];
  // Market aliases to catch all SOG prop variations
  const MARKET_ALIASES = new Set(['player_shots_on_goal', 'player_shots', 'shots_on_goal']);
  
  let totalOutcomes = 0;
  
  // Helper: map event team names to NHL abbrevs
  const TEAM_ABBREV = {
    'Anaheim Ducks':'ANA','Boston Bruins':'BOS','Buffalo Sabres':'BUF','Carolina Hurricanes':'CAR','Columbus Blue Jackets':'CBJ',
    'Calgary Flames':'CGY','Chicago Blackhawks':'CHI','Colorado Avalanche':'COL','Dallas Stars':'DAL','Detroit Red Wings':'DET',
    'Edmonton Oilers':'EDM','Florida Panthers':'FLA','Los Angeles Kings':'LAK','Minnesota Wild':'MIN','Montreal Canadiens':'MTL',
    'New Jersey Devils':'NJD','Nashville Predators':'NSH','New York Islanders':'NYI','New York Rangers':'NYR','Ottawa Senators':'OTT',
    'Philadelphia Flyers':'PHI','Pittsburgh Penguins':'PIT','Seattle Kraken':'SEA','San Jose Sharks':'SJS','St. Louis Blues':'STL',
    'Tampa Bay Lightning':'TBL','Toronto Maple Leafs':'TOR','Utah Hockey Club':'UTA','Vancouver Canucks':'VAN','Vegas Golden Knights':'VGK',
    'Winnipeg Jets':'WPG','Washington Capitals':'WSH'
  };

  for (const gameData of oddsData) {
    const { event, props } = gameData;
    const homeAbbrev = TEAM_ABBREV[event?.home_team] || null;
    const awayAbbrev = TEAM_ABBREV[event?.away_team] || null;
    if (!props.bookmakers) continue;
    
    for (const bookmaker of props.bookmakers) {
      if (!bookmaker.markets) continue;
      
      const bookName = bookmaker.title || '';
      if (!PRIORITY_BOOKS.some(b => bookName.includes(b))) continue;
      
      for (const market of bookmaker.markets) {
        // Check if market key matches any alias
        if (!MARKET_ALIASES.has(market.key)) continue;
        
        // Collect outcomes by player+line to build pairs
        const tempPairs = new Map(); // Key: "PLAYER_LINE"
        
        for (const outcome of market.outcomes || []) {
          if (!outcome.description) continue;
          
          const playerName = outcome.description.name || outcome.description;
          const line = parseFloat(outcome.point);
          const odds = outcome.price;
          const direction = outcome.name?.toUpperCase() || 'OVER';
          
          if (!playerName || isNaN(line) || !odds) continue;
          
          totalOutcomes++;
          
          // Store single-sided odds for placement (best available)
          const singleKey = `${playerName}_${line}_${direction}`;
          if (!playerOddsMap.has(singleKey)) {
            playerOddsMap.set(singleKey, {
              playerName,
              line,
              odds,
              direction,
              bookmaker: bookName,
              teams: [homeAbbrev, awayAbbrev].filter(Boolean)
            });
          }
          
          // Build pairs for vig removal
          const pairKey = `${playerName}_${line}`;
          if (!tempPairs.has(pairKey)) {
            tempPairs.set(pairKey, { playerName, line, bookmaker: bookName });
          }
          const pair = tempPairs.get(pairKey);
          if (direction === 'OVER') pair.overOdds = odds;
          if (direction === 'UNDER') pair.underOdds = odds;
        }
        
        // Save complete pairs (both OVER and UNDER available)
        for (const [pairKey, pair] of tempPairs.entries()) {
          if (pair.overOdds && pair.underOdds) {
            const fullKey = `${pair.playerName}_${pair.line}_${pair.bookmaker}`;
            playerPairsMap.set(fullKey, {
              playerName: pair.playerName,
              line: pair.line,
              bookmaker: pair.bookmaker,
              overOdds: pair.overOdds,
              underOdds: pair.underOdds,
              teams: [homeAbbrev, awayAbbrev].filter(Boolean)
            });
          }
        }
      }
    }
  }
  
  console.log(`🎯 Processed ${totalOutcomes} total prop outcomes into ${playerOddsMap.size} unique player props (${playerPairsMap.size} complete pairs)`);
  
  return { singles: playerOddsMap, pairs: playerPairsMap };
}

/**
 * Generate opportunities using elite projection
 */
async function generateEliteOpportunities(player, team, opponent, isHome, gameTime, venue, realOddsMap, realOddsPairs, gameId, projectSOGElite, calculateZINBProbability) {
  try {
    const playerId = player.id;
    const playerName = `${player.firstName?.default || ''} ${player.lastName?.default || ''}`.trim();
    const position = player.positionCode;
    
    // Get elite projection
    const projection = await projectSOGElite(playerId, playerName, team, opponent, isHome, venue);
    
    // If elite projection failed, return null with reason logged upstream
    if (!projection) {
      return null;
    }
    
    const { mu, r, pi, breakdown, metadata } = projection;
    
    // Name normalization for robust matching
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
    const first = (player.firstName?.default || '').trim();
    const last = (player.lastName?.default || '').trim();
    const fullName = `${first} ${last}`.trim();
    
    /**
     * Smart name matching to avoid false positives (e.g., Luke Hughes vs Jack Hughes)
     * Returns true only if:
     * 1. Exact full name match
     * 2. First initial + last name match (but only if odds name is also abbreviated)
     * 3. Both names contain same first initial AND exact last name
     */
    const smartNameMatch = (oddsName) => {
      const oddsNorm = normalize(oddsName);
      const firstNorm = normalize(first);
      const lastNorm = normalize(last);
      const fullNorm = normalize(fullName);
      
      // Exact full name match (best case)
      if (oddsNorm === fullNorm) return true;
      
      // Split odds name into parts
      const oddsParts = oddsNorm.split(' ').filter(p => p.length > 0);
      if (oddsParts.length < 2) return false;
      
      const oddsFirst = oddsParts[0];
      const oddsLast = oddsParts[oddsParts.length - 1];
      
      // Last names must match exactly
      if (oddsLast !== lastNorm) return false;
      
      // First name/initial must match
      // Allow: "luke" matches "l", "l." matches "luke", "luke" matches "luke"
      const firstInitial = firstNorm.charAt(0);
      const oddsFirstInitial = oddsFirst.charAt(0);
      
      if (firstInitial !== oddsFirstInitial) return false;
      
      // If odds uses full first name, our first name must match exactly
      if (oddsFirst.length > 2 && oddsFirst !== firstNorm) return false;
      
      // If odds uses initial, we accept it (already checked last name + first initial match)
      return true;
    };

    // Check for real odds opportunities
  const opportunities = [];
  let bestAny = null; // track best opportunity regardless of edge threshold
    
    if (realOddsMap && realOddsMap.size > 0) {
      for (const [key, oddsData] of realOddsMap.entries()) {
        // Require team match to reduce false joins
        if (oddsData.teams && oddsData.teams.length > 0 && !oddsData.teams.includes(team)) {
          continue;
        }

        const match = smartNameMatch(oddsData.playerName);
        if (match) {
          
          const line = oddsData.line;
          const odds = oddsData.odds;
          const direction = oddsData.direction;
          
          // Calculate win probability using ZINB
          const winProb = calculateZINBProbability(mu, r, pi, line, direction);
          
          // Get FAIR probability (vig removed) for edge calculation
          const fairData = getFairProbability(playerName, line, direction, realOddsPairs);
          
          // Calculate implied prob for reference/fallback
          const impliedProb = oddsToImpliedProb(odds);
          
          // Use fair prob if available, otherwise fall back to implied (with warning flag)
          let fairProb, vigPct, usingFairProb;
          if (fairData.hasPair && fairData.fairProb) {
            fairProb = fairData.fairProb;
            vigPct = fairData.vigPct;
            usingFairProb = true;
          } else {
            // Fallback: Use implied prob (includes vig, less accurate)
            fairProb = impliedProb;
            vigPct = null;
            usingFairProb = false;
          }
          
          // Calculate edge vs fair probability
          const edge = winProb - fairProb;
          const edgePercent = (edge / fairProb) * 100;

          // Build full opportunity object once
          const oppObj = {
            gameId,
            playerId,
            playerName,
            position,
            team,
            opponent,
            gameTime,
            direction,
            line,
            odds,
            projection: parseFloat(mu.toFixed(2)),
            edge: parseFloat(edgePercent.toFixed(1)),
            ev: parseFloat((edgePercent * 0.5).toFixed(1)),
            confidence: Math.min(75 + edgePercent, 90),
            kelly: parseFloat(calculateKelly(winProb, odds, r).toFixed(4)),
            variance: parseFloat(r.toFixed(1)),
            scratchRisk: parseFloat((pi * 100).toFixed(1)),
            mlEnhanced: true,
            dataSource: 'elite-zinb',
            oddsSource: `${oddsData.bookmaker} (real)`,
            bookmaker: oddsData.bookmaker,
            modelProb: parseFloat(winProb.toFixed(3)),
            fairProb: parseFloat(fairProb.toFixed(3)),
            impliedProb: parseFloat(impliedProb.toFixed(3)),
            vigPct: vigPct ? parseFloat(vigPct.toFixed(2)) : null,
            fairBook: fairData.book || null,
            usingFairProb: usingFairProb,
            // Include breakdown for transparency
            breakdown: {
              seasonAvg: breakdown.seasonAvg,
              L5avg: breakdown.L5avg,
              weighted: breakdown.weightedBase,
              finalProjection: breakdown.finalProjection,
              adjustments: breakdown.adjustments
            },
            metadata: {
              streak: metadata.streak,
              ppUnit: metadata.ppUnit,
              expectedTOI: metadata.expectedTOI,
              oppDefense: metadata.oppDefenseRating,
              gamesPlayed: metadata.gamesPlayed
            }
          };

          // Track best-any always for fallback logic
          if (!bestAny || oppObj.edge > bestAny.edge) {
            bestAny = oppObj;
          }

          // Only include in strict list if we have >= 5% edge
          // Removed upper bound - high edges are GOOD, not suspicious!
          if (edgePercent >= 5.0) {
            opportunities.push(oppObj);
          }
        }
      }
    }
    
    // Return best strict and best-any opportunity
    if (opportunities.length === 0) {
      return bestAny ? { bestAny } : null;
    }
    const bestStrict = opportunities.sort((a, b) => b.edge - a.edge)[0];
    return { bestStrict, bestAny: bestAny || bestStrict };
    
  } catch (error) {
    const name = `${player.firstName?.default || ''} ${player.lastName?.default || ''}`.trim();
    console.log(`⚠️ Error in generateEliteOpportunities for ${name}: ${error.message}`);
    console.log(`   Stack: ${error.stack?.split('\n')[0]}`);
    return null;
  }
}

/**
 * Main handler
 */
exports.handler = async (event, context) => {
  const startTime = Date.now();
  const TIMEOUT_MS = 9000; // 9 second safety margin (Netlify has 10s limit)
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300'
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    console.log('🚀 NHL Elite Scanner V4.0 starting...');
    
    const queryParams = event.queryStringParameters || {};
    const minEdge = parseFloat(queryParams.minEdge) || 0.05;
    const useRealOdds = queryParams.useRealOdds !== 'false';
    
    // Step 0: Preload player/team stats cache (critical for speed)
    console.log('[NHL] Step 0: Preloading cache...');
    await elite.preloadCache();
    
    console.log('[NHL] Loading player stats...');
    const playersLoaded = await elite.loadPlayerStats();
    console.log(`[NHL] Players loaded: ${playersLoaded ? playersLoaded.length : 0}`);
    
    console.log('[NHL] Loading team stats...');
    const teamsLoaded = await elite.loadTeamStats();
    console.log(`[NHL] Teams loaded: ${teamsLoaded ? Object.keys(teamsLoaded).length : 0}`);
    
    if (!playersLoaded || playersLoaded.length === 0) {
      console.error('[NHL] ❌ No player stats loaded! Check Netlify Blobs and GitHub fallback.');
    }
    if (!teamsLoaded || Object.keys(teamsLoaded).length === 0) {
      console.error('[NHL] ❌ No team stats loaded! Check Netlify Blobs and GitHub fallback.');
    }
    
    console.log(`✅ Cache preloaded • players=${playersLoaded ? playersLoaded.length : 0} • teams=${teamsLoaded ? Object.keys(teamsLoaded).length : 0}`);
    
    // Step 1: Fetch real odds (parallel with schedule)
    const oddsPromise = useRealOdds ? fetchNHLOdds() : Promise.resolve(null);
    
    // Step 2: Get today's schedule
    const todayET = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York', 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
    const [month, day, year] = todayET.split(/[\/,\s]/);
    const today = `${year}-${month}-${day}`;
    
    const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${today}`;
    const scheduleResponse = await fetch(scheduleUrl);
    
    if (!scheduleResponse.ok) {
      throw new Error(`NHL API returned ${scheduleResponse.status}`);
    }
    
    const schedule = await scheduleResponse.json();
    
    // Get all games for today
    const allGames = [];
    if (schedule.gameWeek) {
      for (const day of schedule.gameWeek) {
        if (day.games) allGames.push(...day.games);
      }
    }
    
    const games = allGames.filter(g => {
      if (!g.startTimeUTC) return false;
      const gameTimeET = new Date(g.startTimeUTC).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const [gMonth, gDay, gYear] = gameTimeET.split(/[\/,\s]/);
      return `${gYear}-${gMonth}-${gDay}` === today;
    });
    
    if (games.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          opportunities: [],
          metadata: {
            version: '4.0-elite-fast',
            message: 'No NHL games scheduled today',
            timestamp: new Date().toISOString()
          }
        })
      };
    }
    
    console.log(`📅 Found ${games.length} games`);
    
    // Timeout check
    if (Date.now() - startTime > TIMEOUT_MS) {
      throw new Error('Timeout: schedule fetch took too long');
    }
    
    // Step 3: Get all team rosters in parallel
    const teams = new Set();
    for (const game of games) {
      teams.add(game.homeTeam?.abbrev);
      teams.add(game.awayTeam?.abbrev);
    }
    
    const rosterPromises = Array.from(teams).filter(Boolean).map(async (teamAbbrev) => {
      try {
        const rosterUrl = `https://api-web.nhle.com/v1/roster/${teamAbbrev}/current`;
        const response = await fetch(rosterUrl);
        if (!response.ok) return null;
        const data = await response.json();
        return { team: teamAbbrev, roster: data };
      } catch (e) {
        return null;
      }
    });
    
    const [rosterResults, realOddsData] = await Promise.all([
      Promise.all(rosterPromises),
      oddsPromise
    ]);
    
    const rosters = {};
    for (const result of rosterResults) {
      if (result) rosters[result.team] = result.roster;
    }
    
    const { singles: realOddsMap, pairs: realOddsPairs } = processRealOdds(realOddsData);
    console.log(`✅ Fetched ${Object.keys(rosters).length} rosters, ${realOddsMap.size} odds lines, ${realOddsPairs.size} pairs`);
    
    // Timeout check
    if (Date.now() - startTime > TIMEOUT_MS) {
      throw new Error('Timeout: roster fetch took too long');
    }
    
  // Step 4: Generate opportunities
  const opportunities = [];
  const fallbackCandidates = [];
  // Diagnostics
  let diag_playersScanned = 0;
  let diag_projectionsOk = 0;
  let diag_matchedOdds = 0;
    
    for (const game of games) {
      const homeTeam = game.homeTeam?.abbrev;
      const awayTeam = game.awayTeam?.abbrev;
      const venue = game.venue?.default || '';
      
      if (!homeTeam || !awayTeam) continue;
      
      const gameDate = game.gameDate || new Date().toISOString().split('T')[0];
      const gameId = `${awayTeam}_${homeTeam}_${gameDate}`;
      
      for (const teamAbbrev of [homeTeam, awayTeam]) {
        const roster = rosters[teamAbbrev];
        if (!roster) continue;
        
        const isHome = teamAbbrev === homeTeam;
        const opponent = isHome ? awayTeam : homeTeam;
        
        // Process top forwards and defensemen
        const playersToProcess = [
          ...(roster.forwards || []).slice(0, 9),
          ...(roster.defensemen || []).slice(0, 5)
        ];
        
        for (const player of playersToProcess) {
          diag_playersScanned++;
          // Timeout check every 5 players
          if (opportunities.length % 5 === 0 && Date.now() - startTime > TIMEOUT_MS) {
            console.warn('⏱️ Timeout approaching, returning partial results');
            break;
          }
          
          const result = await generateEliteOpportunities(
            player,
            teamAbbrev,
            opponent,
            isHome,
            game.startTimeUTC,
            venue,
            realOddsMap,
            realOddsPairs,
            gameId,
            elite.projectSOGElite,
            elite.calculateZINBProbability
          );

          if (result) {
            diag_projectionsOk++;
            if (result.bestStrict && result.bestStrict.edge >= minEdge) {
              opportunities.push(result.bestStrict);
              diag_matchedOdds++;
            }
            if (result.bestAny) {
              fallbackCandidates.push(result.bestAny);
            }
          } else {
            // Log projection failures to diagnose why elite engine fails
            const playerName = `${player.firstName?.default || ''} ${player.lastName?.default || ''}`.trim();
            console.log(`❌ Elite projection failed: ${playerName} (${teamAbbrev}) - ID: ${player.id}`);
          }
        }
      }
    }

    // Deduplicate and fallback logic if no strict opps
    const keyOf = (o) => `${o.playerId}|${o.team}|${o.line}|${o.direction}`;
    const uniqMap = new Map();
    for (const o of opportunities) {
      if (!uniqMap.has(keyOf(o))) uniqMap.set(keyOf(o), o);
    }
    let uniqueOpps = Array.from(uniqMap.values());

    let fallbackUsed = false;
    if (uniqueOpps.length === 0 && fallbackCandidates.length > 0) {
      const fbMap = new Map();
      for (const o of fallbackCandidates) {
        const k = keyOf(o);
        if (!fbMap.has(k) || fbMap.get(k).edge < o.edge) fbMap.set(k, o);
      }
      const sorted = Array.from(fbMap.values()).sort((a, b) => b.edge - a.edge);
      uniqueOpps = sorted.slice(0, 10); // default top 10
      fallbackUsed = true;
    }
    
    // ALWAYS provide top 15 candidates for debugging/verification
    // This helps verify the model is working correctly
    const allCandidatesMap = new Map();
    for (const o of fallbackCandidates) {
      const k = keyOf(o);
      if (!allCandidatesMap.has(k) || allCandidatesMap.get(k).edge < o.edge) {
        allCandidatesMap.set(k, o);
      }
    }
    const top15Candidates = Array.from(allCandidatesMap.values())
      .sort((a, b) => b.edge - a.edge)
      .slice(0, 15)
      .map(o => ({
        ...o,
        meetsThreshold: o.edge >= minEdge * 100 // Mark which ones would be recommended
      }));

    const resp = {
      opportunities: uniqueOpps,
      debug: {
        top15Candidates,
        note: "Top 15 opportunities by edge, regardless of threshold. Use 'meetsThreshold' to see which would be recommended bets."
      },
      metadata: {
        version: '4.0-elite-fast',
        fallbackUsed,
        diag: {
          playersScanned: diag_playersScanned,
          projectionsOk: diag_projectionsOk,
          matchedCandidates: diag_matchedOdds,
          playersLoaded: playersLoaded ? playersLoaded.length : 0,
          teamsLoaded: teamsLoaded ? Object.keys(teamsLoaded).length : 0
        },
        timestamp: new Date().toISOString()
      }
    };

    return { statusCode: 200, headers, body: JSON.stringify(resp) };
  } catch (error) {
    console.error('❌ Elite scanner error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
