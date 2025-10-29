// Reverted to morning baseline version (fe960db) with canonical availability integration and ODDS-FIRST probability engine.
import fs from 'fs/promises';
import { fetchPlayerPropOdds } from '../../../scripts/fetch-player-prop-odds.js';
import { buildPlayerAvailability } from './td-probability-engine.mjs';
import { buildSimpleTDProbability, findBestOdds, calculateEdge } from './td-odds-first-engine.mjs';

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
      
      // Transform list format to keyed-by-team format
      if (Array.isArray(data)) {
        const byTeam = {};
        for (const teamData of data) {
          const teamAbbr = getTeamAbbreviation(teamData.team);
          byTeam[teamAbbr] = teamData;
        }
        return byTeam;
      }
      
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

// Build player roster from depth charts (FRESH DATA - no stale players!)
// Then enrich with R pipeline stats where available
function buildPlayersFromDepthCharts(depthCharts, games, rPipelineData = null) {
  const players = {};
  let playerCounter = 0;
  
  // Get teams playing this week
  const teamsPlaying = new Set();
  for (const game of games) {
    const homeTeam = getTeamAbbreviation(game.homeTeam || game.home_team) || game.homeTeam || game.home_team;
    const awayTeam = getTeamAbbreviation(game.awayTeam || game.away_team) || game.awayTeam || game.away_team;
    teamsPlaying.add(homeTeam);
    teamsPlaying.add(awayTeam);
  }
  
  // Build from depth charts for teams playing this week
  for (const [teamAbbr, teamDepth] of Object.entries(depthCharts)) {
    if (!teamsPlaying.has(teamAbbr)) continue;
    
    // Iterate through positions
    for (const position of ['QB', 'RB', 'WR', 'TE']) {
      const positionDepth = teamDepth[position] || [];
      for (let depth = 0; depth < positionDepth.length; depth++) {
        const playerName = positionDepth[depth];
        if (!playerName) continue;
        
        const playerId = `${teamAbbr}_${position}_${playerCounter++}`;
        
        // Try to find R pipeline stats for this player (fuzzy match)
        let rStats = null;
        if (rPipelineData?.players) {
          rStats = findPlayerInRData(playerName, teamAbbr, rPipelineData.players);
        }
        
        // Build player with R stats if available, otherwise use defaults
        players[playerId] = {
          player_id: playerId,
          name: playerName,
          position: position,
          team: teamAbbr,
          depth_chart_position: depth + 1,  // 1-indexed
          // Use R pipeline stats if available, otherwise undefined (will use defaults)
          snap_share: rStats?.key_factors?.snap_percentage,
          target_share: rStats?.key_factors?.target_share,
          red_zone_share: rStats?.key_factors?.red_zone_efficiency,
          red_zone_targets: rStats?.key_factors?.red_zone_targets || 0,
          red_zone_carries: rStats?.key_factors?.red_zone_carries || 0,
          consistency_score: rStats?.key_factors?.consistency_score,
          games_played: 8  // Week 9 = 8 games played
        };
      }
    }
  }
  
  console.log(`✅ Built player roster from depth charts: ${Object.keys(players).length} players`);
  return players;
}

// Fuzzy match player from depth chart to R pipeline data
function findPlayerInRData(playerName, team, rPlayers) {
  if (!rPlayers || !playerName) return null;
  
  // Normalize name for matching (remove suffixes, lowercase)
  const normalize = (name) => {
    return name
      .replace(/\s+(III|Jr\.|Sr\.|II|IV)$/i, '')  // Remove suffixes
      .replace(/[^a-zA-Z\s]/g, '')  // Remove special chars
      .toLowerCase()
      .trim();
  };
  
  const normalizedSearch = normalize(playerName);
  
  // Try exact match first
  for (const [playerId, player] of Object.entries(rPlayers)) {
    if (!player.name || player.team !== team) continue;
    
    const normalizedPlayer = normalize(player.name);
    if (normalizedPlayer === normalizedSearch) {
      return player;
    }
  }
  
  // Try partial match (last name match)
  const searchLastName = normalizedSearch.split(' ').pop();
  for (const [playerId, player] of Object.entries(rPlayers)) {
    if (!player.name || player.team !== team) continue;
    
    const playerLastName = normalize(player.name).split(' ').pop();
    if (searchLastName === playerLastName && searchLastName.length > 3) {
      // Last name match + same team (but verify first initial matches)
      const searchFirst = normalizedSearch.charAt(0);
      const playerFirst = normalize(player.name).charAt(0);
      if (searchFirst === playerFirst) {
        return player;
      }
    }
  }
  
  return null;
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

// Cache management for odds data (original file-based version)
const ODDS_CACHE_FILE = 'public/data/nfl-td-odds-cache.json';
const ODDS_CACHE_TTL = 24 * 60 * 60 * 1000;
async function loadCachedOdds() {
  const paths = [ODDS_CACHE_FILE,'/opt/buildhome/repo/'+ODDS_CACHE_FILE,'/var/task/'+ODDS_CACHE_FILE,'./'+ODDS_CACHE_FILE,process.cwd()+'/'+ODDS_CACHE_FILE];
  for (const p of paths) {
    try {
      const raw = await fs.readFile(p,'utf8');
      const cache = JSON.parse(raw);
      const age = Date.now() - new Date(cache.timestamp).getTime();
      if (age < ODDS_CACHE_TTL) {
        console.log(`✅ Using cached odds (${Math.round(age/60000)}m old)`);
        return cache.odds;
      }
    } catch {}
  }
  return null;
}
async function saveCachedOdds(odds) {
  try {
    await fs.mkdir('public/data',{recursive:true});
    await fs.writeFile(ODDS_CACHE_FILE, JSON.stringify({ timestamp:new Date().toISOString(), player_count:Object.keys(odds).length, odds }, null,2));
  } catch(e){ console.warn('Cache save failed:', e.message); }
}

// Main TD prediction generation - NOW USES CANONICAL AVAILABILITY
async function generateTDPredictions(games, season='2025', weekNumber){
  let oddsByPlayer = {};
  let usedCache = false;
  const cached = await loadCachedOdds();
  if (cached) { 
    oddsByPlayer = cached; 
    usedCache = true; 
    console.log(`✅ Using cached odds: ${Object.keys(cached).length} players`);
  }
  if (!usedCache) {
    try {
      console.log('🔄 Fetching fresh player prop odds from TheOddsAPI...');
      console.log(`🔑 ODDS_API_KEY present: ${!!process.env.ODDS_API_KEY}`);
      const fresh = await Promise.race([
        fetchPlayerPropOdds(),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error('Odds fetch timeout after 8s')),8000))
      ]);
      oddsByPlayer = fresh; 
      saveCachedOdds(fresh).catch(()=>{});
      console.log(`✅ Fetched fresh odds: ${Object.keys(fresh).length} players`);
    } catch(e){ 
      console.error('❌ Fresh odds fetch failed, continuing without odds:', e.message);
      console.error('   Stack:', e.stack);
    }
  } else {
    fetchPlayerPropOdds().then(o=>saveCachedOdds(o).catch(()=>{})).catch(()=>{});
  }
  
  console.log(`📊 Total players with odds data: ${Object.keys(oddsByPlayer).length}`);
  console.log('=== NFL TD REALISTIC PREDICTIONS (CANONICAL AVAILABILITY) ===');
  const [playerData, depthCharts, injuryReports] = await Promise.all([
    loadPlayerData(),
    loadDepthCharts(season, weekNumber),
    loadInjuryReports(season, weekNumber)
  ]);
  
  // CRITICAL FIX: Build player roster from DEPTH CHARTS, not stale player data
  // This ensures we only analyze CURRENT roster players who are actually active
  // Then enrich with R pipeline stats for real player insights
  let players = {};
  if (Object.keys(depthCharts).length > 0) {
    console.log('✅ Building player roster from depth charts (FRESH DATA)');
    console.log('📊 Enriching with R pipeline stats for player insights...');
    players = buildPlayersFromDepthCharts(depthCharts, games, playerData);
    
    // Count how many players got R stats
    const playersWithRStats = Object.values(players).filter(p => p.snap_share !== undefined).length;
    console.log(`   ${playersWithRStats}/${Object.keys(players).length} players matched to R pipeline stats`);
  } else if (playerData?.players) {
    console.warn('⚠️ Using stale player data file (depth charts unavailable)');
    players = playerData.players;
  } else {
    console.warn('⚠️ Using generated minimal roster (no depth charts or player data)');
    players = generateMinimalPlayerRoster(games);
  }
  const dataSource = Object.keys(depthCharts).length > 0 ? 'depth_chart_fresh' : 
                     playerData ? 'player_data_stale' : 'generated_minimal';
  const allPredictions = [];
  
  for (const game of games) {
    const gamePlayerPredictions = [];
    
    // Normalize team names from schedule
    const homeTeamAbbr = getTeamAbbreviation(game.homeTeam || game.home_team) || game.homeTeam || game.home_team;
    const awayTeamAbbr = getTeamAbbreviation(game.awayTeam || game.away_team) || game.awayTeam || game.away_team;
    console.log(`🔄 Game: ${game.homeTeam || game.home_team}(${homeTeamAbbr}) vs ${game.awayTeam || game.away_team}(${awayTeamAbbr})`);
    
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
      
      // USE ODDS-FIRST APPROACH: Build probability from depth + team + matchup
      // This avoids the stale/corrupted R pipeline data
      const depthPosition = availability?.depthOrder || basePlayer.depth_chart_position || 1;
      const tdProbs = buildSimpleTDProbability(basePlayer, depthPosition, availability);
      
      // Find best odds for this player with fuzzy matching for suffixes
      function findPlayerOdds(playerName, oddsDict) {
        // Try exact match first
        if (oddsDict[playerName]) return oddsDict[playerName];
        if (oddsDict[playerName.toUpperCase()]) return oddsDict[playerName.toUpperCase()];
        if (oddsDict[playerName.toLowerCase()]) return oddsDict[playerName.toLowerCase()];
        
        // Try without suffix (III, Jr., Sr., II, IV)
        const nameWithoutSuffix = playerName.replace(/\s+(III|Jr\.|Sr\.|II|IV)$/i, '').trim();
        if (nameWithoutSuffix !== playerName) {
          if (oddsDict[nameWithoutSuffix]) return oddsDict[nameWithoutSuffix];
          if (oddsDict[nameWithoutSuffix.toUpperCase()]) return oddsDict[nameWithoutSuffix.toUpperCase()];
          if (oddsDict[nameWithoutSuffix.toLowerCase()]) return oddsDict[nameWithoutSuffix.toLowerCase()];
        }
        
        return null;
      }
      
      const oddsEntry = findPlayerOdds(basePlayer.name, oddsByPlayer);
      
      // Log odds match for first few players to debug
      if (Object.keys(gamePlayerPredictions).length < 3) {
        console.log(`🔍 Player: ${basePlayer.name}, Odds found: ${!!oddsEntry}, Books: ${oddsEntry ? Object.keys(oddsEntry.player_anytime_td?.books || {}).length : 0}`);
      }
      
      const anytimeOdds = findBestOdds(oddsEntry, 'player_anytime_td');
      const firstOdds = findBestOdds(oddsEntry, 'player_1st_td');
      const multipleOdds = findBestOdds(oddsEntry, 'player_tds_over');
      
      // Calculate edges
      const anytimeEdge = anytimeOdds ? calculateEdge(tdProbs.anytime, anytimeOdds.bestOdds) : { edge: null, ev: null, impliedProb: null };
      const firstEdge = firstOdds ? calculateEdge(tdProbs.first, firstOdds.bestOdds) : { edge: null, ev: null, impliedProb: null };
      const multipleEdge = multipleOdds ? calculateEdge(tdProbs.multiple, multipleOdds.bestOdds) : { edge: null, ev: null, impliedProb: null };
      
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
          odds_qualified: bookKeys.length >= 2
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
        anytime_td: {
          probability: Number(tdProbs.anytime.toFixed(4)),
          best_odds: anytimeOdds?.bestOdds || null,
          best_book: anytimeOdds?.bestBook || null,
          books_count: anytimeOdds?.booksCount || 0,
          books: oddsEntry?.player_anytime_td?.books || {},
          implied_prob: anytimeEdge.impliedProb ? Number(anytimeEdge.impliedProb.toFixed(4)) : null,
          edge: anytimeEdge.edge ? Number(anytimeEdge.edge.toFixed(4)) : null,
          ev: anytimeEdge.ev ? Number(anytimeEdge.ev.toFixed(4)) : null,
          odds_qualified: (anytimeOdds?.booksCount || 0) >= 2
        },
        first_td: {
          probability: Number(tdProbs.first.toFixed(4)),
          best_odds: firstOdds?.bestOdds || null,
          best_book: firstOdds?.bestBook || null,
          books_count: firstOdds?.booksCount || 0,
          books: oddsEntry?.player_1st_td?.books || {},
          implied_prob: firstEdge.impliedProb ? Number(firstEdge.impliedProb.toFixed(4)) : null,
          edge: firstEdge.edge ? Number(firstEdge.edge.toFixed(4)) : null,
          ev: firstEdge.ev ? Number(firstEdge.ev.toFixed(4)) : null,
          odds_qualified: (firstOdds?.booksCount || 0) >= 2
        },
        multiple_td: {
          probability: Number(tdProbs.multiple.toFixed(4)),
          best_odds: multipleOdds?.bestOdds || null,
          best_book: multipleOdds?.bestBook || null,
          books_count: multipleOdds?.booksCount || 0,
          books: oddsEntry?.player_tds_over?.books || {},
          implied_prob: multipleEdge.impliedProb ? Number(multipleEdge.impliedProb.toFixed(4)) : null,
          edge: multipleEdge.edge ? Number(multipleEdge.edge.toFixed(4)) : null,
          ev: multipleEdge.ev ? Number(multipleEdge.ev.toFixed(4)) : null,
          odds_qualified: (multipleOdds?.booksCount || 0) >= 2
        },
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
