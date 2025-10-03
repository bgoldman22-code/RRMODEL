// netlify/functions/nfl-td-comprehensive-predictions/index.mjs
// FIXED VERSION: Uses same blob pattern as working NFL predictions + does actual TD predictions

import fs from 'fs/promises';
import { fetchPlayerPropOdds } from '../../../scripts/fetch-player-prop-odds.js';

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


// TD prediction weights
const QUICK_TD_WEIGHTS = {
  ANYTIME: {
    position_base: 0.40,
    team_quality: 0.25,
    snap_share: 0.20,
    red_zone_role: 0.15
  }
};

// Load player data from committed JSON (correct paths for Netlify deployment)
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

function getCurrentWeek() {
  const now = new Date();
  const seasonStart = new Date('2025-09-04');
  const diffTime = now.getTime() - seasonStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(18, week));
}

// Add metrics to any player data
function addPlayerMetrics(player) {
  return {
    ...player,
    redZoneMetrics: {
      targets: estimateRedZoneTargets(player),
      carries: estimateRedZoneCarries(player),
      touchdowns: estimateSeasonTDs(player),
      efficiency: 0.25
    },
    opportunityFactors: {
      snapShare: estimateSnapShare(player),
      targetShare: estimateTargetShare(player),
      redZoneShare: estimateRedZoneShare(player),
      goalLineShare: estimateGoalLineShare(player)
    },
    // Add individual talent rating
    talentRating: calculatePlayerTalent(player)
  };
}

function calculatePlayerTalent(player) {
  // Individual talent ratings (0.5 = backup, 1.0 = average starter, 1.5+ = elite)
  const playerName = player.name.toLowerCase();
  const position = player.position;
  
  // Elite superstars get major boost
  if (playerName.includes('travis kelce') || playerName.includes('tyreek hill') ||
      playerName.includes('davante adams') || playerName.includes('cooper kupp') ||
      playerName.includes('christian mccaffrey') || playerName.includes('derrick henry') ||
      playerName.includes('josh allen') || playerName.includes('lamar jackson') ||
      playerName.includes('saquon barkley') || playerName.includes('nick chubb')) {
    return 1.8; // Elite tier
  }
  
  // Good starters
  if (playerName.includes('james cook') || playerName.includes('dalton kincaid') ||
      playerName.includes('keon coleman') || playerName.includes('a.j. brown') ||
      playerName.includes('devonta smith') || playerName.includes('brandon aiyuk')) {
    return 1.3; // Good starter
  }
  
  // Position-based defaults with depth chart consideration
  const depthPenalties = {
    1: 1.0,    // Starter
    2: 0.7,    // Backup
    3: 0.4,    // 3rd string
    4: 0.2     // Deep backup
  };
  
  const depthPosition = parseInt(player.id?.split('_').pop()) || 1;
  const depthPenalty = depthPenalties[Math.min(depthPosition, 4)] || 0.2;
  
  const positionBase = {
    'RB': 1.1, 'WR': 1.0, 'TE': 0.9, 'QB': 1.2
  }[position] || 1.0;
  
  return positionBase * depthPenalty;
}

function estimateRedZoneTargets(player) {
  const base = { 'RB': 1.5, 'WR': 2.0, 'TE': 1.8, 'QB': 0 };
  return (base[player.position] || 0) * getTeamQuality(player.team);
}

function estimateRedZoneCarries(player) {
  const base = player.position === 'RB' ? 2.0 : player.position === 'QB' ? 0.3 : 0;
  return base * getTeamQuality(player.team);
}

function estimateSnapShare(player) {
  const base = { 'QB': 0.98, 'RB': 0.60, 'WR': 0.70, 'TE': 0.75 };
  return base[player.position] || 0.5;
}

function estimateTargetShare(player) {
  const base = { 'RB': 0.12, 'WR': 0.22, 'TE': 0.18, 'QB': 0 };
  return base[player.position] || 0;
}

function estimateRedZoneShare(player) {
  const base = { 'RB': 0.18, 'WR': 0.22, 'TE': 0.20, 'QB': 0.02 };
  return base[player.position] || 0.1;
}

function estimateGoalLineShare(player) {
  const base = { 'RB': 0.65, 'WR': 0.18, 'TE': 0.28, 'QB': 0.12 };
  return base[player.position] || 0.1;
}

function estimateSeasonTDs(player) {
  const teamQuality = getTeamQuality(player.team);
  const base = { 'RB': 8, 'WR': 6, 'TE': 4, 'QB': 3 };
  return Math.round((base[player.position] || 2) * teamQuality);
}

function calculateQuickAnytimeTD(player) {
  const weights = QUICK_TD_WEIGHTS.ANYTIME;
  
  // REALISTIC base probabilities by position AND depth chart position
  // Historical data: RB1s score ~50% of games, WR1s ~35%, TE1s ~25%
  const depthPosition = parseInt(player.id?.split('_').pop()) || 1;
  
  let positionBase;
  if (player.position === 'RB') {
    positionBase = depthPosition === 1 ? 0.48 : depthPosition === 2 ? 0.22 : 0.08;
  } else if (player.position === 'WR') {
    positionBase = depthPosition === 1 ? 0.35 : depthPosition === 2 ? 0.18 : depthPosition === 3 ? 0.10 : 0.05;
  } else if (player.position === 'TE') {
    positionBase = depthPosition === 1 ? 0.28 : depthPosition === 2 ? 0.12 : 0.05;
  } else if (player.position === 'QB') {
    positionBase = 0.15; // QBs score rushing TDs occasionally
  } else {
    positionBase = 0.05;
  }
  
  // Team quality impact (full effect - good offenses score more TDs)
  const teamQuality = getTeamQuality(player.team);
  const teamMultiplier = teamQuality; // Use full team quality rating
  
  const snapShare = player.opportunityFactors?.snapShare || 0.5;
  const redZoneRole = player.opportunityFactors?.redZoneShare || 0.1;
  
  // Use individual talent rating for elite player boost
  const talentModifier = player.talentRating || 1.0;
  
  // Starter vs backup penalty for backup QBs
  let starterPenalty = 1.0;
  if (player.position === 'QB' && 
      (player.name.includes('II') || player.name.includes('Minshew') || 
       player.name.includes('Brissett') || player.name.includes('Mills'))) {
    starterPenalty = 0.5;
  }
  
  // Weighted combination: Base (60%) + Situational factors (40%)
  const baseScore = positionBase * teamMultiplier * talentModifier;
  const situationalBoost = (snapShare * 0.15) + (redZoneRole * 0.25);
  
  const finalScore = (baseScore * 0.6 + situationalBoost * 0.4) * starterPenalty;
  
  // More realistic bounds: 5% minimum, 65% maximum (elite RB1s on great teams)
  return Math.max(0.05, Math.min(0.65, finalScore));
}

function calculateQuickFirstTD(anytimeProb) {
  // First TD is roughly 20% of anytime probability
  // (22 starters on field, but TD scorers get more opportunities)
  return Math.max(0.01, Math.min(0.25, anytimeProb * 0.20));
}

function calculateQuickMultipleTD(anytimeProb) {
  // Multiple TDs = roughly probability of 2+ TDs
  // If anytime is 50%, multiple is ~15-20%
  // Using squared probability with slight boost for high scorers
  const multipleProb = Math.pow(anytimeProb, 1.5) * 0.8;
  return Math.max(0.01, Math.min(0.35, multipleProb));
}

function getTeamQuality(team) {
  // More differentiated team quality ratings for better TD distribution
  const ratings = {
    'KC': 1.35, 'BUF': 1.30, 'SF': 1.25, 'PHI': 1.20, 'DAL': 1.18, 'BAL': 1.18,
    'MIA': 1.15, 'CIN': 1.12, 'DET': 1.12, 'MIN': 1.08, 'LAC': 1.08, 'HOU': 1.05,
    'GB': 1.02, 'LAR': 1.02, 'ATL': 0.98, 'NYJ': 0.95, 'PIT': 0.95, 'SEA': 0.95,
    'IND': 0.90, 'TB': 0.90, 'JAX': 0.85, 'NO': 0.85, 'CLE': 0.82, 'TEN': 0.82,
    'LV': 0.78, 'DEN': 0.78, 'WAS': 0.75, 'CHI': 0.72, 'NE': 0.70, 'NYG': 0.70, 'CAR': 0.65, 'ARI': 0.62
  };
  return ratings[team] || 1.0;
}

function calculateConfidence(anytimeProb) {
  return Math.round(Math.max(50, Math.min(85, 45 + (anytimeProb * 65))));
}

function probabilityToAmericanOdds(probability) {
  if (probability >= 0.5) {
    return Math.round(-100 / (probability / (1 - probability)));
  } else {
    return Math.round(100 * ((1 - probability) / probability));
  }
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

// Main TD prediction generation
async function generateTDPredictions(games, season = '2025') {
  // STRATEGY: Try cache first, fetch in background if needed
  let oddsByPlayer = {};
  let usedCache = false;
  
  // Step 1: Try to load from cache (fast, always works)
  const cachedOdds = await loadCachedOdds();
  if (cachedOdds) {
    oddsByPlayer = cachedOdds;
    usedCache = true;
    console.log(`✅ Using cached odds for ${Object.keys(oddsByPlayer).length} players`);
  }
  
  // Step 2: Try to fetch fresh odds (but don't block on it)
  if (!usedCache) {
    try {
      console.log('🔄 Fetching fresh player prop odds from TheOddsAPI...');
      const oddsPromise = fetchPlayerPropOdds();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Odds fetch timeout after 8s')), 8000)
      );
      const freshOdds = await Promise.race([oddsPromise, timeoutPromise]);
      oddsByPlayer = freshOdds;
      console.log(`✅ Pulled fresh odds for ${Object.keys(oddsByPlayer).length} players`);
      
      // Save to cache for next time (async, don't wait)
      saveCachedOdds(freshOdds).catch(e => console.warn('Cache save failed:', e.message));
    } catch (e) {
      console.warn('⚠️ Fresh odds fetch failed, continuing with model-only predictions:', e.message);
      oddsByPlayer = {}; // Continue without odds
    }
  } else {
    // We used cache, but try to refresh it in the background (fire and forget)
    console.log('🔄 Refreshing odds cache in background...');
    fetchPlayerPropOdds()
      .then(freshOdds => {
        console.log(`✅ Background refresh: ${Object.keys(freshOdds).length} players`);
        return saveCachedOdds(freshOdds);
      })
      .catch(e => console.warn('⚠️ Background odds refresh failed:', e.message));
  }
  
  console.log('=== NFL TD COMPREHENSIVE PREDICTIONS (FIXED VERSION) ===');
  
  // Try to load live data from blobs first
  const blobData = await loadPlayerData(season);
  if (!blobData || !blobData.players) {
    throw new Error('No valid player data found in public/nfl-anytime-td-player-data.json. Run the ETL to generate full player data.');
  }
  const playerData = blobData.players;
  const dataSource = 'live_blobs';
  console.log(`🎯 Using LIVE data: ${Object.keys(playerData).length} players`);
  
  const allPredictions = [];
  
  for (const game of games) {
    const gamePlayerPredictions = [];
    
    // Normalize team names from schedule (convert full names to abbreviations)
    const homeTeamAbbr = getTeamAbbreviation(game.homeTeam || game.home_team) || game.homeTeam || game.home_team;
    const awayTeamAbbr = getTeamAbbreviation(game.awayTeam || game.away_team) || game.awayTeam || game.away_team;
    console.log(`🔄 Game: ${game.homeTeam || game.home_team}(${homeTeamAbbr}) vs ${game.awayTeam || game.away_team}(${awayTeamAbbr})`);
    
    // Process all players for this game
    for (const [playerId, basePlayer] of Object.entries(playerData)) {
      // Match using normalized team abbreviations
      if (basePlayer.team !== homeTeamAbbr && basePlayer.team !== awayTeamAbbr) continue;
      
      const player = addPlayerMetrics(basePlayer);
      
      const anytimeProb = calculateQuickAnytimeTD(player);
      const firstProb = calculateQuickFirstTD(anytimeProb);
      const multipleProb = calculateQuickMultipleTD(anytimeProb);
      const confidence = calculateConfidence(anytimeProb);

      // Join odds by player name (case-insensitive)
      const oddsEntry = oddsByPlayer[player.name] || oddsByPlayer[player.name.toUpperCase()] || oddsByPlayer[player.name.toLowerCase()] || null;
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
        name: player.name,
        position: player.position,
        team: player.team,
        anytime_td: marketBlock(anytimeProb, oddsEntry?.player_anytime_td),
  first_td: marketBlock(firstProb, oddsEntry?.player_1st_td),
        multiple_td: marketBlock(multipleProb, oddsEntry?.player_tds_over),
        key_factors: {
          red_zone_targets: player.redZoneMetrics?.targets,
          red_zone_carries: player.redZoneMetrics?.carries,
          snap_share: player.opportunityFactors?.snapShare,
          target_share: player.opportunityFactors?.targetShare,
          team_quality: getTeamQuality(player.team)
        }
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
        high_confidence_count: gamePlayerPredictions.filter(p => p.anytime_td.confidence >= 70).length,
        data_source: dataSource
      }
    });
  }
  
  return {
    success: true,
    metadata: {
      model: 'comprehensive-fixed-v1',
      data_source: dataSource,
      generated_at: new Date().toISOString(),
      games_processed: games.length,
      total_players: allPredictions.reduce((sum, game) => sum + game.players.length, 0),
      blob_attempt: blobData ? 'successful' : 'failed'
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

    console.log(`🏈 Generating TD predictions for ${games.length} games`);
    const result = await generateTDPredictions(games, season);
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
