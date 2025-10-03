// netlify/functions/nfl-td-comprehensive-predictions/index.mjs
// REALISTIC VERSION: Uses Canonical Availability + Real Data for TD Predictions
// Force redeploy: 2025-10-03

import fs from 'fs/promises';
import { fetchPlayerPropOdds } from '../../../scripts/fetch-player-prop-odds.js';
import { calculateRealisticTDProbabilities, buildPlayerAvailability } from './td-probability-engine.mjs';

// Team name mapping for schedule normalization (matches NFL predictions approach)
function getTeamAbbreviation(fullName) {
  const nameMap = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "Seattle Seahawks": "SEA", "San Francisco 49ers": "SF", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS"
  };
  return nameMap[fullName] || fullName;
}


function getCurrentWeek() {
  const now = new Date();
  const seasonStart = new Date('2025-09-04');
  const diffTime = now.getTime() - seasonStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(18, week));
}

function getTeamQuality(team) {
  // Import from realistic engine
  const ratings = {
    'KC': 1.40, 'BUF': 1.35, 'SF': 1.32, 'MIA': 1.30, 'DAL': 1.28,
    'PHI': 1.24, 'DET': 1.22, 'BAL': 1.20, 'CIN': 1.18, 'LAC': 1.15,
    'MIN': 1.12, 'HOU': 1.10, 'GB': 1.05, 'LAR': 1.02, 'SEA': 1.00,
    'ATL': 0.98, 'TB': 0.96, 'JAX': 0.92, 'NO': 0.90, 'IND': 0.88,
    'NYJ': 0.85, 'PIT': 0.83, 'CLE': 0.80, 'TEN': 0.78, 'LV': 0.75,
    'DEN': 0.73, 'WAS': 0.72, 'CHI': 0.70, 'NE': 0.68, 'NYG': 0.65,
    'CAR': 0.63, 'ARI': 0.60
  };
  return ratings[team] || 1.0;
}
async function loadPlayerData() {
  console.log(`🔍 DEBUG: Current working directory for player data: ${process.cwd()}`);
  
  const possiblePaths = [
    'public/nfl-anytime-td-player-data.json',  // Local development
    '/opt/buildhome/repo/public/nfl-anytime-td-player-data.json',  // Netlify build
    '/var/task/public/nfl-anytime-td-player-data.json',  // Netlify function runtime
    './public/nfl-anytime-td-player-data.json',  // Relative path
    '../../public/nfl-anytime-td-player-data.json',  // Function relative path
    '../../../public/nfl-anytime-td-player-data.json',  // Deep relative path
    '/opt/build/repo/public/nfl-anytime-td-player-data.json',  // New Netlify build path
    process.cwd() + '/public/nfl-anytime-td-player-data.json'  // Dynamic path
  ];
  
  for (const filePath of possiblePaths) {
    try {
      console.log(`🔍 Trying to load player data from: ${filePath}`);
      const raw = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.players) {
        console.log(`✅ Loaded player data from ${filePath}: ${Object.keys(data.players).length} players`);
        return data;
      }
    } catch (error) {
      console.log(`❌ Failed to load from ${filePath}: ${error.message}`);
      continue;
    }
  }
  
  console.warn('⚠️ Player data file not found in any location');
  return null;
}

// Load depth charts from public/history/{season}/week{N}/depth-charts.json
async function loadDepthCharts(season, week) {
  const possiblePaths = [
    `public/history/${season}/week${week}/depth-charts.json`,
    `/opt/buildhome/repo/public/history/${season}/week${week}/depth-charts.json`,
    `/var/task/public/history/${season}/week${week}/depth-charts.json`,
    `./public/history/${season}/week${week}/depth-charts.json`,
    process.cwd() + `/public/history/${season}/week${week}/depth-charts.json`
  ];
  
  for (const filePath of possiblePaths) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      console.log(`✅ Loaded depth charts for Week ${week}`);
      return data;
    } catch (error) {
      continue;
    }
  }
  
  console.warn(`⚠️ No depth chart data found for Week ${week}`);
  return {};
}

// Load injury reports (from game predictions injury data structure)
async function loadInjuryReports(season, week) {
  // Try to load from the same location game predictions uses
  const possiblePaths = [
    `public/history/${season}/week${week}/injuries.json`,
    `/opt/buildhome/repo/public/history/${season}/week${week}/injuries.json`,
    `/var/task/public/history/${season}/week${week}/injuries.json`,
    `./public/history/${season}/week${week}/injuries.json`,
    process.cwd() + `/public/history/${season}/week${week}/injuries.json`
  ];
  
  for (const filePath of possiblePaths) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      console.log(`✅ Loaded injury reports for Week ${week}`);
      return data;
    } catch (error) {
      continue;
    }
  }
  
  console.warn(`⚠️ No injury report data found for Week ${week}`);
  return {};
}

// Generate minimal player roster from game schedule (fallback)
function generateMinimalPlayerRoster(games) {
  const players = {};
  let playerCounter = 0;
  
  // Common positions and typical depth chart
  const positions = [
    { pos: 'QB', count: 1 },
    { pos: 'RB', count: 2 },
    { pos: 'WR', count: 3 },
    { pos: 'TE', count: 2 }
  ];
  
  // Generate basic roster for each team in the games
  const teams = new Set();
  games.forEach(game => {
    teams.add(game.home_team);
    teams.add(game.away_team);
  });
  
  teams.forEach(team => {
    positions.forEach(({ pos, count }) => {
      for (let depth = 1; depth <= count; depth++) {
        playerCounter++;
        const playerId = `${team}_${pos}_${depth}`;
        players[playerId] = {
          id: playerId,
          name: `${team} ${pos}${depth}`,
          team: team,
          position: pos,
          depth_chart_position: depth
        };
      }
    });
  });
  
  console.log(`Generated ${playerCounter} placeholder players for ${teams.size} teams`);
  return players;
}

// Cache management for odds data
const ODDS_CACHE_FILE = 'public/data/nfl-td-odds-cache.json';
const ODDS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

async function loadCachedOdds() {
  const possiblePaths = [
    ODDS_CACHE_FILE,
    '/opt/buildhome/repo/' + ODDS_CACHE_FILE,
    '/var/task/' + ODDS_CACHE_FILE,
    './' + ODDS_CACHE_FILE,
    process.cwd() + '/' + ODDS_CACHE_FILE
  ];
  
  for (const filePath of possiblePaths) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const cache = JSON.parse(raw);
      const age = Date.now() - new Date(cache.timestamp).getTime();
      
      if (age < ODDS_CACHE_TTL) {
        console.log(`✅ Using cached odds (${Math.round(age / 1000 / 60)} minutes old, ${Object.keys(cache.odds).length} players)`);
        return cache.odds;
      } else {
        console.log(`⚠️ Cached odds expired (${Math.round(age / 1000 / 60 / 60)} hours old)`);
      }
    } catch (e) {
      // Cache doesn't exist or can't be read - that's ok
      continue;
    }
  }
  return null;
}

async function saveCachedOdds(odds) {
  try {
    const cache = {
      timestamp: new Date().toISOString(),
      player_count: Object.keys(odds).length,
      odds: odds
    };
    await fs.mkdir('public/data', { recursive: true });
    await fs.writeFile(ODDS_CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`✅ Saved odds cache with ${Object.keys(odds).length} players`);
  } catch (e) {
    console.warn('⚠️ Could not save odds cache:', e.message);
  }
}

// Main TD prediction generation - NOW USES CANONICAL AVAILABILITY
async function generateTDPredictions(games, season = '2025', weekNumber) {
  // STRATEGY: Try cache first, skip odds if problematic (Netlify has 10s timeout)
  let oddsByPlayer = {};
  let usedCache = false;
  
  // Step 1: Try to load from cache (fast, always works)
  try {
    const cachedOdds = await loadCachedOdds();
    if (cachedOdds) {
      oddsByPlayer = cachedOdds;
      usedCache = true;
      console.log(`✅ Using cached odds for ${Object.keys(oddsByPlayer).length} players`);
    }
  } catch (e) {
    console.warn('⚠️ Cache load failed, continuing without odds:', e.message);
  }
  
  // Step 2: ONLY try to fetch fresh odds if we have no cache AND we have time (3s max)
  if (!usedCache) {
    try {
      console.log('🔄 Fetching fresh player prop odds (3s timeout)...');
      const oddsPromise = fetchPlayerPropOdds();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Odds fetch timeout after 3s')), 3000)
      );
      const freshOdds = await Promise.race([oddsPromise, timeoutPromise]);
      oddsByPlayer = freshOdds;
      console.log(`✅ Pulled fresh odds for ${Object.keys(oddsByPlayer).length} players`);
      
      // Save to cache for next time (fire and forget)
      saveCachedOdds(freshOdds).catch(e => console.warn('Cache save failed:', e.message));
    } catch (e) {
      console.warn('⚠️ Fresh odds fetch failed, continuing with model-only predictions:', e.message);
      oddsByPlayer = {}; // Continue without odds - NOT a fatal error
    }
  }
  // Skip background refresh to avoid timeout issues - let the cron job handle it
  
  console.log('=== NFL TD REALISTIC PREDICTIONS (CANONICAL AVAILABILITY) ===');
  
  // Load real data sources with robust error handling
  let playerData = null;
  let depthCharts = {};
  let injuryReports = {};
  
  try {
    [playerData, depthCharts, injuryReports] = await Promise.all([
      loadPlayerData().catch(e => { console.warn('Player data load failed:', e.message); return null; }),
      loadDepthCharts(season, weekNumber).catch(e => { console.warn('Depth charts load failed:', e.message); return {}; }),
      loadInjuryReports(season, weekNumber).catch(e => { console.warn('Injury reports load failed:', e.message); return {}; })
    ]);
  } catch (e) {
    console.error('Error loading data sources:', e.message);
    // Continue with empty data rather than crash
  }
  
  let players = {};
  if (playerData && playerData.players) {
    players = playerData.players;
    console.log(`🎯 Using LIVE player data: ${Object.keys(players).length} players`);
  } else {
    // FALLBACK: Generate minimal roster
    console.warn('⚠️ No player data file found, generating minimal roster from games');
    players = generateMinimalPlayerRoster(games);
    console.log(`🎯 Generated minimal roster: ${Object.keys(players).length} players`);
  }
  
  const dataSource = playerData ? 'live_data_with_canonical_availability' : 'generated_minimal';
  
  const allPredictions = [];
  
  for (const game of games) {
    const gamePlayerPredictions = [];
    
    // Normalize team names from schedule
    const homeTeamAbbr = getTeamAbbreviation(game.homeTeam || game.home_team) || game.homeTeam || game.home_team;
    const awayTeamAbbr = getTeamAbbreviation(game.awayTeam || game.away_team) || game.awayTeam || game.away_team;
    console.log(`🔄 Game: ${game.homeTeam || game.home_team}(${homeTeamAbbr}) vs ${game.awayTeam || game.away_team}(${awayTeamAbbr})`);
    
    // Process all players for this game
    for (const [playerId, basePlayer] of Object.entries(players)) {
      // Match using normalized team abbreviations
      if (basePlayer.team !== homeTeamAbbr && basePlayer.team !== awayTeamAbbr) continue;
      
      // Build canonical availability for this player
      const availability = buildPlayerAvailability(
        basePlayer,
        basePlayer.team,
        weekNumber,
        injuryReports,
        depthCharts
      );
      
      // Determine game context
      const isHome = basePlayer.team === homeTeamAbbr;
      const opponent = isHome ? awayTeamAbbr : homeTeamAbbr;
      const gameContext = {
        opponent,
        isHome,
        weather: null  // TODO: Add weather data
      };
      
      // Calculate REALISTIC probabilities using canonical availability
      const tdProbs = calculateRealisticTDProbabilities(
        basePlayer,
        availability,
        gameContext
      );

      // Join odds by player name (case-insensitive)
      const oddsEntry = oddsByPlayer[basePlayer.name] || 
                       oddsByPlayer[basePlayer.name.toUpperCase()] || 
                       oddsByPlayer[basePlayer.name.toLowerCase()] || null;
      
      // Convert American odds to implied probability
      function impliedProbFromAmerican(american) {
        if (american == null) return null;
        if (american > 0) return 100 / (american + 100);
        return (-american) / ((-american) + 100);
      }

      function marketBlock(prob, oddsObj) {
        const books = oddsObj?.books ?? {};
        const bookKeys = Object.keys(books);
        
        // Get best odds across all approved books
        let bestOdds = null;
        let bestBook = null;
        let impliedProb = null;
        
        if (bookKeys.length > 0) {
          // Find the best (highest) odds across all books
          for (const [bookmaker, odds] of Object.entries(books)) {
            if (bestOdds === null || odds > bestOdds) {
              bestOdds = odds;
              bestBook = bookmaker;
            }
          }
          impliedProb = impliedProbFromAmerican(bestOdds);
        }
        
        // Calculate edge vs market
        const edge = (typeof prob === 'number' && typeof impliedProb === 'number') 
          ? Number((prob - impliedProb).toFixed(4)) 
          : null;
        
        return {
          probability: Number(prob.toFixed(4)),
          best_odds: bestOdds,
          best_book: bestBook,
          books_count: bookKeys.length,
          books: books,
          implied_prob: impliedProb != null ? Number(impliedProb.toFixed(4)) : null,
          edge,
          odds_qualified: bookKeys.length >= 2  // Need at least 2 books
        };
      }

      gamePlayerPredictions.push({
        player_id: playerId,
        name: basePlayer.name,
        position: basePlayer.position,
        team: basePlayer.team,
        depth_chart_position: availability?.depthOrder || basePlayer.depth_chart_position || 1,
        injury_status: availability?.status || 'active',
        prob_play: availability?.probPlay || 1.0,
        anytime_td: marketBlock(tdProbs.anytime, oddsEntry?.player_anytime_td),
        first_td: marketBlock(tdProbs.first, oddsEntry?.player_1st_td),
        multiple_td: marketBlock(tdProbs.multiple, oddsEntry?.player_tds_over),
        key_factors: {
          red_zone_targets: basePlayer.redZoneMetrics?.targets || basePlayer.red_zone_targets || 0,
          red_zone_carries: basePlayer.redZoneMetrics?.carries || basePlayer.red_zone_carries || 0,
          snap_share: basePlayer.snap_share || basePlayer.opportunityFactors?.snapShare || 0.6,
          target_share: basePlayer.target_share || basePlayer.opportunityFactors?.targetShare || 0.15,
          team_quality: getTeamQuality(basePlayer.team),
          availability_confidence: availability?.confidence || 0.75,
          ...tdProbs.factors
        },
        canonical_availability: availability ? {
          status: availability.status,
          prob_play: availability.probPlay,
          depth_order: availability.depthOrder,
          confidence: availability.confidence,
          source: availability.topSource
        } : null
      });
    }
    
    gamePlayerPredictions.sort((a, b) => b.anytime_td.probability - a.anytime_td.probability);
    
    allPredictions.push({
      game_id: game.game_id,
      home_team: homeTeamAbbr,
      away_team: awayTeamAbbr,
      players: gamePlayerPredictions,
      metadata: {
        total_players: gamePlayerPredictions.length,
        high_confidence_count: gamePlayerPredictions.filter(p => p.anytime_td.probability >= 0.40).length,
        data_source: dataSource,
        has_canonical_availability: gamePlayerPredictions.some(p => p.canonical_availability !== null),
        has_injury_data: Object.keys(injuryReports).length > 0,
        has_depth_charts: Object.keys(depthCharts).length > 0
      }
    });
  }
  
  return {
    success: true,
    metadata: {
      model: 'realistic-canonical-availability-v1',
      data_source: dataSource,
      generated_at: new Date().toISOString(),
      games_processed: games.length,
      total_players: allPredictions.reduce((sum, game) => sum + game.players.length, 0),
      uses_canonical_availability: true,
      injury_data_available: Object.keys(injuryReports).length > 0,
      depth_chart_data_available: Object.keys(depthCharts).length > 0
    },
    predictions: allPredictions
  };
}

// Helper to load schedule from committed JSON (correct paths for Netlify deployment)  
async function getScheduleFromFile(season, week) {
  console.log(`🔍 DEBUG: Current working directory: ${process.cwd()}`);
  console.log(`🔍 DEBUG: Function __dirname equivalent: ${new URL('.', import.meta.url).pathname}`);
  
  const possiblePaths = [
    'public/data/nfl-schedule-2025.json',  // Local development
    '/opt/buildhome/repo/public/data/nfl-schedule-2025.json',  // Netlify build
    '/var/task/public/data/nfl-schedule-2025.json',  // Netlify function runtime
    './public/data/nfl-schedule-2025.json',  // Relative path
    '../../public/data/nfl-schedule-2025.json',  // Function relative path
    '../../../public/data/nfl-schedule-2025.json',  // Deep relative path
    '/opt/build/repo/public/data/nfl-schedule-2025.json',  // New Netlify build path
    process.cwd() + '/public/data/nfl-schedule-2025.json'  // Dynamic path
  ];
  
  for (const filePath of possiblePaths) {
    try {
      console.log(`🔍 Trying to load schedule from: ${filePath}`);
      const raw = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      
      // Schedule file is an array, not an object with weeks
      if (Array.isArray(data)) {
        const weekNumber = parseInt(week);
        const weekGames = data.filter(game => game.week === weekNumber);
        console.log(`✅ Loaded schedule from ${filePath}: Week ${week} has ${weekGames.length} games`);
        return weekGames;
      } else if (data && data.weeks && data.weeks[week]) {
        // Legacy format with weeks object
        console.log(`✅ Loaded schedule from ${filePath}: Week ${week} has ${data.weeks[week].matchups?.length || 0} games`);
        return data.weeks[week].matchups || [];
      }
    } catch (error) {
      console.log(`❌ Failed to load from ${filePath}: ${error.message}`);
      continue;
    }
  }
  
  console.error('❌ Schedule file not found in any location');
  return [];
}

// Netlify Function Handler (FIXED - proper pattern, now loads schedule from correct path)
export default async (request, context) => {
  console.log('🏈 TD Predictions Function Started');
  console.log('Method:', request.method);
  console.log('URL:', request.url);
  
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    let games = [];
    let season = '2025';
    let week = null;

    if (request.method === 'POST') {
      try {
        const body = await request.json();
        console.log('POST body received:', JSON.stringify(body).substring(0, 200));
        season = body.season || '2025';
        week = body.week || null;
        if (Array.isArray(body.games) && body.games.length > 0) {
          games = body.games;
          console.log(`✅ Received ${games.length} games from POST body`);
        }
      } catch (parseError) {
        console.error('❌ Error parsing POST body:', parseError);
        throw new Error(`Invalid JSON in POST body: ${parseError.message}`);
      }
    } else if (request.method === 'GET') {
      const url = new URL(request.url);
      season = url.searchParams.get('season') || '2025';
      week = url.searchParams.get('week');
      console.log(`GET request for season ${season}, week ${week}`);
    }

    if ((!games || games.length === 0) && week) {
      // Load games for the week from the correct schedule file
      console.log(`📅 Loading schedule for week ${week}...`);
      games = await getScheduleFromFile(season, week);
      console.log(`✅ Loaded ${games.length} games from schedule file`);
    }

    if (!games || games.length === 0) {
      console.error('❌ No games available after all loading attempts');
      throw new Error('No games provided for TD predictions - check schedule file and request format');
    }

    console.log(`🏈 Generating TD predictions for ${games.length} games, Week ${week}`);
    const result = await generateTDPredictions(games, season, week);
    console.log(`✅ Generated predictions successfully`);

    // Write latest predictions to public/data/nfl-td-comprehensive-latest.json for frontend
    try {
      const outDir = 'public/data';
      await fs.mkdir(outDir, { recursive: true });
      const outFile = `${outDir}/nfl-td-comprehensive-latest.json`;
      await fs.writeFile(outFile, JSON.stringify(result, null, 2));
      console.log(`✅ Wrote latest comprehensive TD predictions to ${outFile}`);
    } catch (e) {
      console.warn('⚠️ Could not write latest comprehensive TD predictions:', e.message);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('❌ TD prediction generation failed:', error);
    console.error('Error stack:', error.stack);

    return new Response(JSON.stringify({
      success: false,
      error: 'TD prediction generation failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
