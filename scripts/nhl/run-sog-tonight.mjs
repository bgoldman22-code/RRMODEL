#!/usr/bin/env node

/**
 * NHL SOG Tonight - Local Diagnostic Pipeline
 * 
 * Run the complete SOG pick pipeline locally for testing/diagnostics.
 * This script matches the behavior of nhl-sog-scanner-elite but runs locally.
 * 
 * Features:
 * - Loads data from local files (no NHL API calls for stats)
 * - Fetches real odds from The Odds API
 * - Generates projections using same logic as production scanner
 * - Computes edges, Kelly, exposure management
 * - Detailed funnel logging at each stage
 * - Writes final picks to JSON file
 * 
 * Usage:
 *   # Run for tonight's games
 *   node scripts/nhl/run-sog-tonight.mjs
 *   
 *   # Specify date
 *   node scripts/nhl/run-sog-tonight.mjs 2025-11-13
 *   
 *   # Set minimum edge threshold
 *   MIN_EDGE=7.5 node scripts/nhl/run-sog-tonight.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { projectSOGElite, calculateZINBProbability } from '../../netlify/functions/_lib/nhl-elite-projection-v3.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const PLAYER_STATS_FILE = path.join(__dirname, '../../data/nhl/player_stats_20252026.json');
const TEAM_STATS_FILE = path.join(__dirname, '../../data/nhl/team_stats_20252026.json');
const OUTPUT_FILE = path.join(__dirname, '../../data/nhl/sog_picks_tonight.json');
const NHL_API_BASE = 'https://api-web.nhle.com/v1';
const MIN_EDGE = parseFloat(process.env.MIN_EDGE) || 5.0;
const MIN_GAMES_PLAYED = 5;

// Funnel tracking
const funnel = {
  totalPlayers: 0,
  playersOnSlate: 0,
  playersWithOdds: 0,
  candidatesGenerated: 0,
  afterMinGames: 0,
  afterL5Filter: 0,
  afterEdgeThreshold: 0,
  afterKellyFilter: 0,
  afterExposureManagement: 0,
  finalPicks: 0
};

/**
 * Main pipeline
 */
async function runPipeline() {
  console.log('\n🏒 ========================================');
  console.log('🏒 NHL SOG TONIGHT - LOCAL PIPELINE');
  console.log('🏒 ========================================\n');
  console.log(`Min edge threshold: ${MIN_EDGE}%`);
  console.log(`Min games played: ${MIN_GAMES_PLAYED}`);
  console.log('');
  
  const startTime = Date.now();
  
  try {
    // Step 1: Load data files
    console.log('📂 Step 1: Loading data files...\n');
    const { playerStats, teamStats } = loadDataFiles();
    funnel.totalPlayers = playerStats.totalPlayers;
    console.log(`Loaded: ${playerStats.totalPlayers} players, ${teamStats.totalTeams} teams\n`);
    
    // Step 2: Fetch tonight's schedule
    console.log('📅 Step 2: Fetching tonight\'s schedule...\n');
    const targetDate = getTargetDate();
    const games = await fetchSchedule(targetDate);
    
    if (games.length === 0) {
      console.log('ℹ️  No games tonight. Exiting.\n');
      return;
    }
    
    console.log(`Found ${games.length} games:\n`);
    for (const game of games) {
      console.log(`   ${game.awayTeam?.abbrev} @ ${game.homeTeam?.abbrev}`);
    }
    console.log('');
    
    // Step 3: Get players on slate
    console.log('👥 Step 3: Identifying players on slate...\n');
    const playersOnSlate = getPlayersOnSlate(playerStats, games);
    funnel.playersOnSlate = playersOnSlate.length;
    console.log(`Players on slate: ${playersOnSlate.length}\n`);
    
    // Step 4: Fetch real odds
    console.log('💰 Step 4: Fetching odds from The Odds API...\n');
    const realOddsData = await fetchNHLOdds();
    const realOddsMap = processRealOdds(realOddsData);
    console.log(`Odds lines found: ${realOddsMap.size}\n`);
    
    // Step 5: Match players to odds
    console.log('🔗 Step 5: Matching players to odds...\n');
    const playersWithOdds = matchPlayersToOdds(playersOnSlate, realOddsMap);
    funnel.playersWithOdds = playersWithOdds.length;
    console.log(`Players with odds: ${playersWithOdds.length}\n`);
    
    if (playersWithOdds.length === 0) {
      console.log('⚠️  No players matched to odds. Cannot generate picks.\n');
      printFunnel();
      return;
    }
    
    // Step 6: Generate projections
    console.log('🧠 Step 6: Generating ZINB projections...\n');
    const candidates = await generateProjections(playersWithOdds, games);
    funnel.candidatesGenerated = candidates.length;
    console.log(`Candidates generated: ${candidates.length}\n`);
    
    // Step 7: Apply filters
    console.log('🔍 Step 7: Applying filters...\n');
    const filtered = applyFilters(candidates);
    
    // Step 8: Compute edges and Kelly
    console.log('📊 Step 8: Computing edges and Kelly stakes...\n');
    const withEdges = computeEdgesAndKelly(filtered);
    
    // Step 9: Apply exposure management
    console.log('⚖️  Step 9: Applying exposure management...\n');
    const finalPicks = applyExposureManagement(withEdges);
    funnel.finalPicks = finalPicks.length;
    
    // Step 10: Write output
    console.log('💾 Step 10: Writing picks to file...\n');
    writePicksFile(finalPicks);
    
    // Success report
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n✅ ========================================');
    console.log('✅ PIPELINE COMPLETE');
    console.log('✅ ========================================\n');
    console.log(`Elapsed time: ${elapsedSeconds} seconds`);
    console.log(`Output: ${OUTPUT_FILE}\n`);
    
    printFunnel();
    
    if (finalPicks.length > 0) {
      console.log('\n🎯 Top Picks:\n');
      finalPicks.slice(0, 5).forEach((pick, i) => {
        console.log(`${i + 1}. ${pick.playerName} (${pick.team})`);
        console.log(`   Line: ${pick.direction} ${pick.line}`);
        console.log(`   Edge: ${pick.edge}% | Kelly: ${pick.adjustedUnits.toFixed(2)}U`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('❌ PIPELINE FAILED');
    console.error('❌ ========================================\n');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    
    printFunnel();
    
    process.exit(1);
  }
}

/**
 * Load data files
 */
function loadDataFiles() {
  if (!fs.existsSync(PLAYER_STATS_FILE)) {
    throw new Error(
      `Player stats file not found: ${PLAYER_STATS_FILE}\n` +
      `Run: node scripts/nhl/bootstrap-player-stats.mjs`
    );
  }
  
  if (!fs.existsSync(TEAM_STATS_FILE)) {
    throw new Error(
      `Team stats file not found: ${TEAM_STATS_FILE}\n` +
      `Run: node scripts/nhl/bootstrap-team-stats.mjs`
    );
  }
  
  const playerStats = JSON.parse(fs.readFileSync(PLAYER_STATS_FILE, 'utf8'));
  const teamStats = JSON.parse(fs.readFileSync(TEAM_STATS_FILE, 'utf8'));
  
  // Validate data quality
  if (playerStats.totalPlayers < 300) {
    console.warn(`⚠️  Warning: Only ${playerStats.totalPlayers} players (expected 400+)`);
  }
  
  if (teamStats.totalTeams < 32) {
    throw new Error(`FATAL: Only ${teamStats.totalTeams} teams (need 32)`);
  }
  
  return { playerStats, teamStats };
}

/**
 * Get target date
 */
function getTargetDate() {
  const dateArg = process.argv[2];
  
  if (dateArg) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
      throw new Error(`Invalid date format: ${dateArg}. Use YYYY-MM-DD`);
    }
    return dateArg;
  }
  
  // Default: today
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Fetch schedule
 */
async function fetchSchedule(date) {
  const scheduleUrl = `${NHL_API_BASE}/schedule/${date}`;
  
  try {
    const response = await fetch(scheduleUrl);
    
    if (!response.ok) {
      throw new Error(`Schedule API failed: ${response.status}`);
    }
    
    const schedule = await response.json();
    const games = [];
    
    if (schedule.gameWeek && Array.isArray(schedule.gameWeek)) {
      for (const day of schedule.gameWeek) {
        if (day.games && Array.isArray(day.games)) {
          games.push(...day.games);
        }
      }
    }
    
    return games;
    
  } catch (error) {
    throw new Error(`Failed to fetch schedule: ${error.message}`);
  }
}

/**
 * Get players on tonight's slate
 */
function getPlayersOnSlate(playerStats, games) {
  const teamsPlaying = new Set();
  
  for (const game of games) {
    teamsPlaying.add(game.homeTeam?.abbrev);
    teamsPlaying.add(game.awayTeam?.abbrev);
  }
  
  const playersOnSlate = playerStats.players.filter(p => 
    teamsPlaying.has(p.team)
  );
  
  return playersOnSlate;
}

/**
 * Fetch NHL odds from The Odds API
 */
async function fetchNHLOdds() {
  const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️  No Odds API key found. Set THEODDS_API_KEY or ODDS_API_KEY.');
    console.warn('   Continuing without odds (will generate 0 picks).\n');
    return null;
  }
  
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const tomorrow = new Date(now.getTime() + 24*60*60*1000).toISOString().split('T')[0];
    
    // Fetch events
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/events?regions=us&dateFormat=iso&apiKey=${apiKey}`;
    const eventsResponse = await fetch(eventsUrl);
    
    if (!eventsResponse.ok) {
      console.warn(`Events API failed: ${eventsResponse.status}`);
      return null;
    }
    
    const events = await eventsResponse.json();
    const todayEvents = events.filter(e => {
      const gameDate = e.commence_time?.split('T')[0];
      return gameDate === today || gameDate === tomorrow;
    });
    
    if (todayEvents.length === 0) {
      console.log('No NHL events found in Odds API');
      return null;
    }
    
    console.log(`Found ${todayEvents.length} events in Odds API`);
    
    // Fetch player props for each event
    const oddsPromises = todayEvents.map(async (event) => {
      try {
        const propsUrl = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/events/${event.id}/odds?regions=us&markets=player_shots_on_goal&oddsFormat=american&dateFormat=iso&apiKey=${apiKey}`;
        
        const propsResponse = await fetch(propsUrl);
        if (!propsResponse.ok) return null;
        
        const propsData = await propsResponse.json();
        return { event, props: propsData };
      } catch (e) {
        return null;
      }
    });
    
    const oddsResults = await Promise.all(oddsPromises);
    const validOdds = oddsResults.filter(Boolean);
    
    console.log(`Fetched odds for ${validOdds.length} games`);
    
    return validOdds;
    
  } catch (error) {
    console.warn(`Odds API error: ${error.message}`);
    return null;
  }
}

/**
 * Process real odds into map
 */
function processRealOdds(oddsData) {
  if (!oddsData) {
    return new Map();
  }
  
  const playerOddsMap = new Map();
  const PRIORITY_BOOKS = ['FanDuel', 'DraftKings', 'BetMGM', 'Caesars', 'ESPN BET'];
  
  for (const gameData of oddsData) {
    const { event, props } = gameData;
    
    if (!props.bookmakers) continue;
    
    for (const bookmaker of props.bookmakers) {
      const bookName = bookmaker.title || '';
      
      if (!PRIORITY_BOOKS.some(b => bookName.includes(b))) {
        continue;
      }
      
      if (!bookmaker.markets) continue;
      
      for (const market of bookmaker.markets) {
        if (market.key !== 'player_shots_on_goal') continue;
        
        for (const outcome of market.outcomes || []) {
          const playerName = outcome.description;
          const line = outcome.point;
          const odds = outcome.price;
          const direction = outcome.name; // "Over" or "Under"
          
          if (!playerName || !line || !odds || !direction) continue;
          
          const key = `${playerName}_${line}_${direction}`;
          
          // Only store if not already stored or if better odds
          if (!playerOddsMap.has(key)) {
            playerOddsMap.set(key, {
              playerName,
              line,
              odds,
              direction,
              bookmaker: bookName
            });
          }
        }
      }
    }
  }
  
  return playerOddsMap;
}

/**
 * Match players to odds
 */
function matchPlayersToOdds(players, oddsMap) {
  const playersWithOdds = [];
  
  for (const player of players) {
    // Find odds for this player
    const matchingOdds = [];
    
    for (const [key, oddsData] of oddsMap.entries()) {
      // Fuzzy name matching
      if (key.toLowerCase().includes(player.name.toLowerCase()) ||
          player.name.toLowerCase().includes(oddsData.playerName.toLowerCase())) {
        matchingOdds.push({ key, ...oddsData });
      }
    }
    
    if (matchingOdds.length > 0) {
      playersWithOdds.push({
        ...player,
        odds: matchingOdds
      });
    }
  }
  
  return playersWithOdds;
}

/**
 * Generate projections for all players with odds
 */
async function generateProjections(playersWithOdds, games) {
  const candidates = [];
  
  // Create game lookup
  const gameLookup = {};
  for (const game of games) {
    const homeTeam = game.homeTeam?.abbrev;
    const awayTeam = game.awayTeam?.abbrev;
    
    if (homeTeam) gameLookup[homeTeam] = { ...game, isHome: true, opponent: awayTeam };
    if (awayTeam) gameLookup[awayTeam] = { ...game, isHome: false, opponent: homeTeam };
  }
  
  for (const player of playersWithOdds) {
    const gameInfo = gameLookup[player.team];
    
    if (!gameInfo) continue;
    
    try {
      // Generate ZINB projection
      const projection = await projectSOGElite(
        player.playerId,
        player.name,
        player.team,
        gameInfo.opponent,
        gameInfo.isHome,
        gameInfo.venue?.default || 'Unknown'
      );
      
      if (!projection || !projection.mu) continue;
      
      // Create candidates for each odds line
      for (const oddsData of player.odds) {
        candidates.push({
          ...player,
          ...oddsData,
          projection,
          gameId: gameInfo.id || `${player.team}_${gameInfo.opponent}`
        });
      }
      
    } catch (error) {
      // Skip player on projection error
      continue;
    }
  }
  
  return candidates;
}

/**
 * Apply filters
 */
function applyFilters(candidates) {
  let filtered = candidates;
  
  // Filter: Min games played
  filtered = filtered.filter(c => {
    const hasMinGames = c.season?.gamesPlayed >= MIN_GAMES_PLAYED;
    if (hasMinGames) funnel.afterMinGames++;
    return hasMinGames;
  });
  
  // Filter: Must have L5 data
  filtered = filtered.filter(c => {
    const hasL5 = c.L5 && c.L5.games >= 3;
    if (hasL5) funnel.afterL5Filter++;
    return hasL5;
  });
  
  return filtered;
}

/**
 * Compute edges and Kelly stakes
 */
function computeEdgesAndKelly(candidates) {
  const withEdges = [];
  
  for (const candidate of candidates) {
    const { projection, line, odds, direction } = candidate;
    
    // Calculate model probability using ZINB
    const modelProb = calculateZINBProbability(
      projection.mu,
      projection.r,
      projection.pi,
      line,
      direction.toUpperCase()  // Pass 'OVER' or 'UNDER' as string
    );
    
    // Remove vig from odds to get fair probability
    const impliedProb = oddsToImpliedProb(odds);
    
    // Calculate edge
    const edge = ((modelProb - impliedProb) / impliedProb) * 100;
    
    if (edge < MIN_EDGE) continue;
    
    funnel.afterEdgeThreshold++;
    
    // Calculate Kelly stake
    const kelly = calculateKelly(modelProb, odds);
    
    if (kelly <= 0) continue;
    
    funnel.afterKellyFilter++;
    
    withEdges.push({
      ...candidate,
      modelProb,
      impliedProb,
      edge: edge.toFixed(2),
      kelly: kelly.toFixed(4)
    });
  }
  
  // Sort by edge (highest first)
  withEdges.sort((a, b) => parseFloat(b.edge) - parseFloat(a.edge));
  
  return withEdges;
}

/**
 * Apply exposure management (correlation penalties)
 */
function applyExposureManagement(opportunities) {
  // Group by gameId
  const gameGroups = {};
  opportunities.forEach(opp => {
    if (!gameGroups[opp.gameId]) gameGroups[opp.gameId] = [];
    gameGroups[opp.gameId].push(opp);
  });
  
  // Apply correlation penalties
  Object.keys(gameGroups).forEach(gameId => {
    const gamePicks = gameGroups[gameId];
    
    // Sort by edge within game
    gamePicks.sort((a, b) => parseFloat(b.edge) - parseFloat(a.edge));
    
    gamePicks.forEach((pick, index) => {
      const baseKelly = parseFloat(pick.kelly);
      let adjustedUnits = Math.min(3.0, baseKelly * 100);
      
      // Apply progressive correlation penalty
      if (index === 0) {
        pick.correlationPenalty = 0;
        pick.adjustedUnits = adjustedUnits;
      } else if (index === 1) {
        pick.correlationPenalty = 0.17;
        pick.adjustedUnits = adjustedUnits * 0.83;
      } else if (index === 2) {
        pick.correlationPenalty = 0.33;
        pick.adjustedUnits = adjustedUnits * 0.67;
      } else if (index === 3) {
        pick.correlationPenalty = 0.50;
        pick.adjustedUnits = adjustedUnits * 0.50;
      } else {
        pick.correlationPenalty = 0.67;
        pick.adjustedUnits = adjustedUnits * 0.33;
      }
      
      pick.adjustedUnits = Math.max(0.5, Math.min(3.0, pick.adjustedUnits));
    });
  });
  
  funnel.afterExposureManagement = opportunities.length;
  
  // Sort final picks by adjusted units (highest first)
  opportunities.sort((a, b) => b.adjustedUnits - a.adjustedUnits);
  
  return opportunities;
}

/**
 * Write picks to file
 */
function writePicksFile(picks) {
  const output = {
    generatedAt: new Date().toISOString(),
    minEdge: MIN_EDGE,
    totalPicks: picks.length,
    picks: picks.map(p => ({
      playerName: p.name,
      team: p.team,
      position: p.position,
      opponent: p.opponent,
      line: p.line,
      direction: p.direction,
      odds: p.odds,
      bookmaker: p.bookmaker,
      projectedSOG: p.projection?.mu ? p.projection.mu.toFixed(2) : 'N/A',
      modelProb: (p.modelProb * 100).toFixed(2) + '%',
      impliedProb: (p.impliedProb * 100).toFixed(2) + '%',
      edge: p.edge + '%',
      kelly: p.kelly,
      adjustedUnits: p.adjustedUnits.toFixed(2),
      correlationPenalty: (p.correlationPenalty * 100).toFixed(0) + '%'
    }))
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  console.log(`Wrote ${picks.length} picks to: ${OUTPUT_FILE}`);
}

/**
 * Print funnel metrics
 */
function printFunnel() {
  console.log('\n📊 FUNNEL METRICS:');
  console.log('━'.repeat(50));
  console.log(`Total players in dataset:        ${funnel.totalPlayers}`);
  console.log(`Players on tonight's slate:      ${funnel.playersOnSlate}`);
  console.log(`Players with odds:               ${funnel.playersWithOdds}`);
  console.log(`Candidates generated:            ${funnel.candidatesGenerated}`);
  console.log(`After min games filter:          ${funnel.afterMinGames}`);
  console.log(`After L5 filter:                 ${funnel.afterL5Filter}`);
  console.log(`After edge threshold (${MIN_EDGE}%):     ${funnel.afterEdgeThreshold}`);
  console.log(`After Kelly filter:              ${funnel.afterKellyFilter}`);
  console.log(`After exposure management:       ${funnel.afterExposureManagement}`);
  console.log(`━`.repeat(50));
  console.log(`FINAL PICKS:                     ${funnel.finalPicks}`);
  console.log('');
}

/**
 * Kelly Criterion calculation
 */
function calculateKelly(modelProb, americanOdds) {
  const p = modelProb;
  const q = 1 - p;
  
  let b;
  if (americanOdds < 0) {
    b = 100 / Math.abs(americanOdds);
  } else {
    b = americanOdds / 100;
  }
  
  const kelly = (b * p - q) / b;
  const cappedKelly = Math.max(0, Math.min(kelly * 0.25, 0.03));
  
  return cappedKelly;
}

/**
 * Convert American odds to implied probability
 */
function oddsToImpliedProb(americanOdds) {
  if (americanOdds < 0) {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  } else {
    return 100 / (americanOdds + 100);
  }
}

// Run pipeline
runPipeline();
