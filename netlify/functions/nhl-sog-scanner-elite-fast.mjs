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
 */

import { projectSOGElite, calculateZINBProbability, preloadCache, loadPlayerStats, loadTeamStats } from './_lib/nhl-elite-projection-v4.mjs';

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
 * Process real odds into usable map
 */
function processRealOdds(oddsData) {
  if (!oddsData) return new Map();
  
  const playerOddsMap = new Map();
  const PRIORITY_BOOKS = ['FanDuel', 'DraftKings', 'BetMGM', 'Caesars', 'ESPN BET'];
  
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
        if (market.key !== 'player_shots_on_goal') continue;
        
        for (const outcome of market.outcomes || []) {
          if (!outcome.description) continue;
          
          const playerName = outcome.description.name || outcome.description;
          const line = parseFloat(outcome.point);
          const odds = outcome.price;
          const direction = outcome.name?.toUpperCase() || 'OVER';
          
          if (!playerName || isNaN(line) || !odds) continue;
          
          totalOutcomes++;
          
          const key = `${playerName}_${line}_${direction}`;
          
          if (!playerOddsMap.has(key)) {
            playerOddsMap.set(key, {
              playerName,
              line,
              odds,
              direction,
              bookmaker: bookName,
              teams: [homeAbbrev, awayAbbrev].filter(Boolean)
            });
          }
        }
      }
    }
  }
  
  console.log(`🎯 Processed ${totalOutcomes} total prop outcomes into ${playerOddsMap.size} unique player props`);
  
  return playerOddsMap;
}

/**
 * Generate opportunities using elite projection
 */
async function generateEliteOpportunities(player, team, opponent, isHome, gameTime, venue, realOddsMap, gameId) {
  try {
    const playerId = player.id;
    const playerName = `${player.firstName?.default || ''} ${player.lastName?.default || ''}`.trim();
    const position = player.positionCode;
    
    // Get elite projection
    const projection = await projectSOGElite(playerId, playerName, team, opponent, isHome, venue);
    
    // If elite projection failed, skip this player
    if (!projection) {
      return null;
    }
    
    const { mu, r, pi, breakdown, metadata } = projection;
    
    // Name normalization for robust matching
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
    const first = (player.firstName?.default || '').trim();
    const last = (player.lastName?.default || '').trim();
    const fullName = `${first} ${last}`.trim();
    const nameForms = new Set([
      normalize(fullName),
      normalize(`${first.charAt(0)} ${last}`),
      normalize(`${first.charAt(0)}. ${last}`)
    ]);

    // Check for real odds opportunities
  const opportunities = [];
  let bestAny = null; // track best opportunity regardless of edge threshold
    
    if (realOddsMap && realOddsMap.size > 0) {
      for (const [key, oddsData] of realOddsMap.entries()) {
        // Require team match to reduce false joins
        if (oddsData.teams && oddsData.teams.length > 0 && !oddsData.teams.includes(team)) {
          continue;
        }

        const oddsNameN = normalize(oddsData.playerName);
        const match = nameForms.has(oddsNameN) || oddsNameN.includes(normalize(last));
        if (match) {
          
          const line = oddsData.line;
          const odds = oddsData.odds;
          const direction = oddsData.direction;
          
          // Calculate win probability using ZINB
          const winProb = calculateZINBProbability(mu, r, pi, line, direction);
          
          // Calculate implied probability from odds
          let impliedProb;
          if (odds >= 0) {
            impliedProb = 100 / (odds + 100);
          } else {
            impliedProb = Math.abs(odds) / (Math.abs(odds) + 100);
          }
          
          // Calculate edge
          const edge = winProb - impliedProb;
          const edgePercent = (edge / impliedProb) * 100;

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
            impliedProb: parseFloat(impliedProb.toFixed(3)),
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

          // Only include in strict list if we have 5%–30% edge
          if (edgePercent >= 5.0 && edgePercent <= 30.0) {
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
    console.warn(`⚠️ Error projecting ${player.firstName?.default} ${player.lastName?.default}:`, error.message);
    return null;
  }
}

/**
 * Main handler
 */
export async function handler(event, context) {
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
    await preloadCache();
    const [playersLoaded, teamsLoaded] = await Promise.all([
      loadPlayerStats(),
      loadTeamStats()
    ]);
    console.log(`✅ Cache preloaded • players=${playersLoaded.length} • teams=${Object.keys(teamsLoaded).length}`);
    
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
    
    const realOddsMap = processRealOdds(realOddsData);
    console.log(`✅ Fetched ${Object.keys(rosters).length} rosters, ${realOddsMap.size} odds lines`);
    
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
            gameId
          );

          if (result) {
            diag_projectionsOk++;
            if (result.bestStrict && result.bestStrict.edge >= minEdge) {
              opportunities.push(result.bestStrict);
              diag_matchedOdds++;
            }
            if (result.bestAny) {
              fallbackCandidates.push(result.bestAny);
              diag_matchedOdds++;
            }
          }
        }
        
        // Break outer loop if timeout
        if (Date.now() - startTime > TIMEOUT_MS) break;
      }
      
      // Break game loop if timeout
      if (Date.now() - startTime > TIMEOUT_MS) break;
    }
    
    // Sort by edge
    opportunities.sort((a, b) => b.edge - a.edge);

    // Fallback: if no strict opportunities, return top-N best-any candidates
    let usedFallback = false;
    const FALLBACK_TOP_N = Math.max(1, parseInt((event.queryStringParameters || {}).fallbackTopN || '10', 10));
    if (opportunities.length === 0 && fallbackCandidates.length > 0) {
      // Deduplicate by player+line+direction to avoid duplicates across books
      const keyOf = (o) => `${o.playerId}|${o.line}|${o.direction}`;
      const seen = new Set();
      const unique = [];
      fallbackCandidates.sort((a, b) => b.edge - a.edge);
      for (const c of fallbackCandidates) {
        const k = keyOf(c);
        if (!seen.has(k)) {
          unique.push(c);
          seen.add(k);
        }
        if (unique.length >= FALLBACK_TOP_N) break;
      }
      if (unique.length > 0) {
        usedFallback = true;
        opportunities.push(...unique);
      }
    }
    
  const executionTime = Date.now() - startTime;
    console.log(`✅ Generated ${opportunities.length} opportunities in ${executionTime}ms`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        opportunities,
        metadata: {
          version: '4.0-elite-fast',
          executionTime: `${executionTime}ms`,
          totalGames: games.length,
          realOddsLines: realOddsMap.size,
          usingEliteModel: true,
          fallbackUsed: usedFallback,
          fallbackTopN: usedFallback ? FALLBACK_TOP_N : 0,
          diag: {
            playersScanned: diag_playersScanned,
            projectionsOk: diag_projectionsOk,
            matchedCandidates: diag_matchedOdds,
            playersLoaded: (playersLoaded || []).length,
            teamsLoaded: teamsLoaded ? Object.keys(teamsLoaded).length : 0
          },
          timestamp: new Date().toISOString()
        }
      })
    };
    
  } catch (error) {
    console.error('❌ Scanner error:', error);
    
    return {
      statusCode: error.message.includes('Timeout') ? 504 : 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        version: '4.0-elite-fast',
        timestamp: new Date().toISOString()
      })
    };
  }
}
