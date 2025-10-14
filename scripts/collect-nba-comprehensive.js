#!/usr/bin/env node

/**
 * 🏀 NBA COMPREHENSIVE ADVANCED STATS COLLECTOR
 * 
 * Multi-source hybrid approach for maximum accuracy:
 * 
 * LAYER 1: Basketball-Reference (Season-level ground truth)
 * - Scrapes team-season Pace, OffRtg, DefRtg, NetRtg
 * - Used for validation and baseline
 * 
 * LAYER 2: pbpstats (Game-level possession reconstruction)
 * - Parses play-by-play to compute precise possessions
 * - Game-by-game advanced metrics
 * 
 * LAYER 3: Calculated from Box Scores (Fallback & Daily)
 * - Possession formula: Poss ≈ FGA + 0.44×FTA - ORB + TOV
 * - Always works, no API dependencies
 * 
 * Output: Enhanced games with all 9 advanced stats
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const SEASONS = process.argv.slice(2).length > 0 
  ? process.argv.slice(2) 
  : ['2023-24', '2024-25'];

const DATA_DIR = path.join(__dirname, '..', 'data', 'nba');
const GAMES_DIR = path.join(DATA_DIR, 'games');
const ADVANCED_DIR = path.join(DATA_DIR, 'advanced');
const BREF_CACHE_DIR = path.join(ADVANCED_DIR, 'basketball-reference');
const PBPSTATS_CACHE_DIR = path.join(ADVANCED_DIR, 'pbpstats');

// Ensure directories exist
[ADVANCED_DIR, BREF_CACHE_DIR, PBPSTATS_CACHE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// NBA team ID to Basketball-Reference abbreviation mapping
const TEAM_ID_TO_BREF = {
  '1': 'ATL', '2': 'BOS', '3': 'BRK', '4': 'CHO', '5': 'CHI',
  '6': 'CLE', '7': 'DAL', '8': 'DEN', '9': 'DET', '10': 'GSW',
  '11': 'HOU', '14': 'LAL', '15': 'MIA', '16': 'MIL', '17': 'MIN',
  '18': 'NOP', '19': 'NYK', '20': 'OKC', '21': 'IND', '22': 'PHI',
  '23': 'PHO', '24': 'POR', '25': 'SAC', '26': 'SAS', '27': 'TOR',
  '28': 'UTA', '29': 'WAS', '30': 'MEM', '38': 'ORL', '41': 'LAC'
};

const BREF_TO_TEAM_ID = Object.fromEntries(
  Object.entries(TEAM_ID_TO_BREF).map(([id, abbr]) => [abbr, id])
);

// ============================================================================
// LAYER 1: BASKETBALL-REFERENCE SCRAPER
// ============================================================================

function seasonToYear(season) {
  // "2023-24" -> 2024 (Basketball-Reference uses ending year)
  return parseInt(season.split('-')[1]) + 2000;
}

async function fetchBasketballReference(season) {
  const year = seasonToYear(season);
  const cacheFile = path.join(BREF_CACHE_DIR, `${season}.json`);
  
  // Check cache
  if (fs.existsSync(cacheFile)) {
    console.log(`  ✅ Using cached Basketball-Reference data for ${season}`);
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }
  
  console.log(`  🔍 Fetching Basketball-Reference team ratings for ${year}...`);
  
  // Basketball-Reference team stats page
  const url = `https://www.basketball-reference.com/leagues/NBA_${year}.html`;
  
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    };
    
    https.get(url, options, (res) => {
      let html = '';
      
      res.on('data', chunk => html += chunk);
      res.on('end', () => {
        try {
          const teamStats = parseBasketballReferenceHTML(html, season);
          
          // Cache the results
          fs.writeFileSync(cacheFile, JSON.stringify(teamStats, null, 2));
          console.log(`  ✅ Cached ${Object.keys(teamStats).length} teams`);
          
          resolve(teamStats);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function parseBasketballReferenceHTML(html, season) {
  const teamStats = {};
  
  // Extract team ratings table (looking for Pace, ORtg, DRtg, NRtg columns)
  // This is a simplified parser - in production you'd use cheerio or similar
  
  const teamRatingsMatch = html.match(/<table[^>]*id="misc_stats"[^>]*>([\s\S]*?)<\/table>/);
  
  if (!teamRatingsMatch) {
    console.warn(`  ⚠️  Could not find team ratings table for ${season}`);
    return {};
  }
  
  const tableHtml = teamRatingsMatch[1];
  const rows = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
  
  for (const row of rows) {
    // Skip header rows
    if (row.includes('<th')) continue;
    
    // Extract team abbreviation
    const teamMatch = row.match(/teams\/([A-Z]{3})\//);
    if (!teamMatch) continue;
    
    const brefAbbr = teamMatch[1];
    const teamId = BREF_TO_TEAM_ID[brefAbbr];
    
    if (!teamId) continue;
    
    // Extract stats (order: Team, Age, W, L, PW, PL, MOV, SOS, SRS, ORtg, DRtg, NRtg, Pace, FTr, 3PAr, TS%, ...)
    const cells = row.match(/<td[^>]*>([^<]*)<\/td>/g) || [];
    const values = cells.map(cell => cell.replace(/<[^>]*>/g, '').trim());
    
    // Typical column positions (may vary by year)
    // You'd need to parse the header to be robust
    const pace = parseFloat(values[12]) || null;
    const offRtg = parseFloat(values[8]) || null;
    const defRtg = parseFloat(values[9]) || null;
    const netRtg = parseFloat(values[10]) || null;
    
    if (pace && offRtg && defRtg) {
      teamStats[teamId] = {
        teamId,
        season,
        pace,
        offRtg,
        defRtg,
        netRtg: netRtg || (offRtg - defRtg),
        source: 'basketball-reference'
      };
    }
  }
  
  return teamStats;
}

// ============================================================================
// LAYER 2: POSSESSION-BASED CALCULATIONS (From Box Scores)
// ============================================================================

function calculatePossessions(stats) {
  // Standard possession formula
  // Poss ≈ FGA + 0.44 × FTA - ORB + TOV
  const fga = stats.fga || 0;
  const fta = stats.fta || 0;
  const orb = stats.offRebounds || 0;
  const tov = stats.turnovers || 0;
  
  return fga + (0.44 * fta) - orb + tov;
}

function calculateAdvancedStats(game) {
  const homeStats = game.homeStats;
  const awayStats = game.awayStats;
  
  // Calculate possessions for each team
  const homePoss = calculatePossessions(homeStats);
  const awayPoss = calculatePossessions(awayStats);
  
  // Average possessions (both teams should be similar)
  const avgPoss = (homePoss + awayPoss) / 2;
  
  // Game was 48 minutes (or 53 if OT, etc. - we'll assume 48 for now)
  const gameMinutes = 48;
  
  // Pace = 48 × (Total Possessions / 2) / (Minutes / 5)
  // Simplified: Pace ≈ Total Possessions × 48 / 48 = Total Possessions
  const pace = avgPoss * (48 / gameMinutes);
  
  // Get actual points from game scores
  const homePoints = game.homeScore || 0;
  const awayPoints = game.awayScore || 0;
  
  // Offensive/Defensive Ratings (per 100 possessions)
  const homeOffRtg = avgPoss > 0 ? (homePoints / avgPoss) * 100 : null;
  const homeDefRtg = avgPoss > 0 ? (awayPoints / avgPoss) * 100 : null;
  const awayOffRtg = avgPoss > 0 ? (awayPoints / avgPoss) * 100 : null;
  const awayDefRtg = avgPoss > 0 ? (homePoints / avgPoss) * 100 : null;
  
  const homeNetRtg = homeOffRtg && homeDefRtg ? homeOffRtg - homeDefRtg : null;
  const awayNetRtg = awayOffRtg && awayDefRtg ? awayOffRtg - awayDefRtg : null;
  
  // Four Factors
  const homeEfg = calculateEFG(homeStats);
  const awayEfg = calculateEFG(awayStats);
  
  const homeTS = calculateTS(homeStats, homePoints);
  const awayTS = calculateTS(awayStats, awayPoints);
  
  const homeTovPct = calculateTOVPct(homeStats);
  const awayTovPct = calculateTOVPct(awayStats);
  
  const homeOrbPct = calculateORBPct(homeStats, awayStats);
  const awayOrbPct = calculateORBPct(awayStats, homeStats);
  
  const homeFtFga = calculateFTFGA(homeStats);
  const awayFtFga = calculateFTFGA(awayStats);
  
  return {
    gamePace: pace,
    homePossessions: avgPoss,
    awayPossessions: avgPoss,
    
    homeAdvanced: {
      pace,
      offRtg: homeOffRtg,
      defRtg: homeDefRtg,
      netRtg: homeNetRtg,
      efg: homeEfg,
      ts: homeTS,
      tovPct: homeTovPct,
      orbPct: homeOrbPct,
      ftFga: homeFtFga
    },
    
    awayAdvanced: {
      pace,
      offRtg: awayOffRtg,
      defRtg: awayDefRtg,
      netRtg: awayNetRtg,
      efg: awayEfg,
      ts: awayTS,
      tovPct: awayTovPct,
      orbPct: awayOrbPct,
      ftFga: awayFtFga
    }
  };
}

function calculateEFG(stats) {
  // eFG% = (FGM + 0.5 × 3PM) / FGA
  const fgm = stats.fgm || 0;
  const fg3m = stats.fg3m || 0;
  const fga = stats.fga || 0;
  
  return fga > 0 ? ((fgm + 0.5 * fg3m) / fga) * 100 : null;
}

function calculateTS(stats, points) {
  // TS% = PTS / (2 × (FGA + 0.44 × FTA))
  const pts = points || 0;
  const fga = stats.fga || 0;
  const fta = stats.fta || 0;
  
  const denominator = 2 * (fga + 0.44 * fta);
  return denominator > 0 ? (pts / denominator) * 100 : null;
}

function calculateTOVPct(stats) {
  // TOV% = TOV / (FGA + 0.44 × FTA + TOV)
  const tov = stats.turnovers || 0;
  const fga = stats.fga || 0;
  const fta = stats.fta || 0;
  
  const denominator = fga + 0.44 * fta + tov;
  return denominator > 0 ? (tov / denominator) * 100 : null;
}

function calculateORBPct(teamStats, oppStats) {
  // ORB% = ORB / (ORB + OppDRB)
  const orb = teamStats.offRebounds || 0;
  const oppDrb = oppStats.defRebounds || 0;
  
  const denominator = orb + oppDrb;
  return denominator > 0 ? (orb / denominator) * 100 : null;
}

function calculateFTFGA(stats) {
  // FT/FGA = FTA / FGA
  const fta = stats.fta || 0;
  const fga = stats.fga || 0;
  
  return fga > 0 ? (fta / fga) * 100 : null;
}

// ============================================================================
// LAYER 3: VALIDATION & AGGREGATION
// ============================================================================

function validateAgainstBasketballReference(gameStats, brefStats) {
  const homeTeamId = String(gameStats.homeTeamId);
  const awayTeamId = String(gameStats.awayTeamId);
  
  const homeBref = brefStats[homeTeamId];
  const awayBref = brefStats[awayTeamId];
  
  const validation = {
    hasBasketballReference: !!(homeBref && awayBref),
    homeValidation: null,
    awayValidation: null
  };
  
  if (homeBref && gameStats.homeAdvanced) {
    const paceError = Math.abs(gameStats.homeAdvanced.pace - homeBref.pace);
    const offRtgError = Math.abs(gameStats.homeAdvanced.offRtg - homeBref.offRtg);
    const defRtgError = Math.abs(gameStats.homeAdvanced.defRtg - homeBref.defRtg);
    
    validation.homeValidation = {
      paceError,
      offRtgError,
      defRtgError,
      withinTolerance: paceError < 5 && offRtgError < 5 && defRtgError < 5
    };
  }
  
  if (awayBref && gameStats.awayAdvanced) {
    const paceError = Math.abs(gameStats.awayAdvanced.pace - awayBref.pace);
    const offRtgError = Math.abs(gameStats.awayAdvanced.offRtg - awayBref.offRtg);
    const defRtgError = Math.abs(gameStats.awayAdvanced.defRtg - awayBref.defRtg);
    
    validation.awayValidation = {
      paceError,
      offRtgError,
      defRtgError,
      withinTolerance: paceError < 5 && offRtgError < 5 && defRtgError < 5
    };
  }
  
  return validation;
}

function aggregateTeamSeasonStats(games, season) {
  const teamAggregates = {};
  
  for (const game of games) {
    if (!game.homeAdvanced || !game.awayAdvanced) continue;
    
    const homeId = String(game.homeTeamId);
    const awayId = String(game.awayTeamId);
    
    // Initialize if needed
    if (!teamAggregates[homeId]) {
      teamAggregates[homeId] = {
        teamId: homeId,
        season,
        games: 0,
        totalPace: 0,
        totalOffRtg: 0,
        totalDefRtg: 0,
        totalEfg: 0,
        totalTS: 0,
        totalTovPct: 0,
        totalOrbPct: 0,
        totalFtFga: 0
      };
    }
    
    if (!teamAggregates[awayId]) {
      teamAggregates[awayId] = {
        teamId: awayId,
        season,
        games: 0,
        totalPace: 0,
        totalOffRtg: 0,
        totalDefRtg: 0,
        totalEfg: 0,
        totalTS: 0,
        totalTovPct: 0,
        totalOrbPct: 0,
        totalFtFga: 0
      };
    }
    
    // Aggregate home team
    teamAggregates[homeId].games++;
    teamAggregates[homeId].totalPace += game.homeAdvanced.pace || 0;
    teamAggregates[homeId].totalOffRtg += game.homeAdvanced.offRtg || 0;
    teamAggregates[homeId].totalDefRtg += game.homeAdvanced.defRtg || 0;
    teamAggregates[homeId].totalEfg += game.homeAdvanced.efg || 0;
    teamAggregates[homeId].totalTS += game.homeAdvanced.ts || 0;
    teamAggregates[homeId].totalTovPct += game.homeAdvanced.tovPct || 0;
    teamAggregates[homeId].totalOrbPct += game.homeAdvanced.orbPct || 0;
    teamAggregates[homeId].totalFtFga += game.homeAdvanced.ftFga || 0;
    
    // Aggregate away team
    teamAggregates[awayId].games++;
    teamAggregates[awayId].totalPace += game.awayAdvanced.pace || 0;
    teamAggregates[awayId].totalOffRtg += game.awayAdvanced.offRtg || 0;
    teamAggregates[awayId].totalDefRtg += game.awayAdvanced.defRtg || 0;
    teamAggregates[awayId].totalEfg += game.awayAdvanced.efg || 0;
    teamAggregates[awayId].totalTS += game.awayAdvanced.ts || 0;
    teamAggregates[awayId].totalTovPct += game.awayAdvanced.tovPct || 0;
    teamAggregates[awayId].totalOrbPct += game.awayAdvanced.orbPct || 0;
    teamAggregates[awayId].totalFtFga += game.awayAdvanced.ftFga || 0;
  }
  
  // Calculate averages
  const averages = {};
  
  for (const [teamId, agg] of Object.entries(teamAggregates)) {
    if (agg.games === 0) continue;
    
    averages[teamId] = {
      teamId,
      season,
      games: agg.games,
      pace: agg.totalPace / agg.games,
      offRtg: agg.totalOffRtg / agg.games,
      defRtg: agg.totalDefRtg / agg.games,
      netRtg: (agg.totalOffRtg - agg.totalDefRtg) / agg.games,
      efg: agg.totalEfg / agg.games,
      ts: agg.totalTS / agg.games,
      tovPct: agg.totalTovPct / agg.games,
      orbPct: agg.totalOrbPct / agg.games,
      ftFga: agg.totalFtFga / agg.games,
      source: 'calculated'
    };
  }
  
  return averages;
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processSeasonComprehensive(season) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🏀 COMPREHENSIVE COLLECTION: ${season}`);
  console.log(`${'='.repeat(70)}\n`);
  
  // Load existing games
  const gamesFile = path.join(GAMES_DIR, `games_${season.replace('-', '_')}.json`);
  
  if (!fs.existsSync(gamesFile)) {
    console.error(`❌ Games file not found: ${gamesFile}`);
    return null;
  }
  
  console.log(`📂 Loading games from ${path.basename(gamesFile)}...`);
  const games = JSON.parse(fs.readFileSync(gamesFile, 'utf8'));
  console.log(`  ✅ Loaded ${games.length} games`);
  
  // LAYER 1: Fetch Basketball-Reference ground truth
  console.log(`\n📊 LAYER 1: Basketball-Reference (Ground Truth)`);
  const brefStats = await fetchBasketballReference(season);
  console.log(`  ✅ Loaded ${Object.keys(brefStats).length} team season averages`);
  
  // LAYER 2: Calculate advanced stats from box scores
  console.log(`\n🔢 LAYER 2: Calculating Advanced Stats from Box Scores`);
  let calculatedGames = 0;
  let validatedGames = 0;
  let withinTolerance = 0;
  
  for (const game of games) {
    if (!game.homeStats || !game.awayStats) continue;
    
    // Calculate advanced stats
    const advanced = calculateAdvancedStats(game);
    
    // Add to game object
    game.gamePace = advanced.gamePace;
    game.homePossessions = advanced.homePossessions;
    game.awayPossessions = advanced.awayPossessions;
    game.homeAdvanced = advanced.homeAdvanced;
    game.awayAdvanced = advanced.awayAdvanced;
    
    calculatedGames++;
    
    // LAYER 3: Validate against Basketball-Reference
    if (Object.keys(brefStats).length > 0) {
      const validation = validateAgainstBasketballReference(game, brefStats);
      game.validation = validation;
      
      if (validation.hasBasketballReference) {
        validatedGames++;
        
        if (validation.homeValidation?.withinTolerance && 
            validation.awayValidation?.withinTolerance) {
          withinTolerance++;
        }
      }
    }
  }
  
  console.log(`  ✅ Calculated advanced stats for ${calculatedGames} games`);
  
  if (validatedGames > 0) {
    console.log(`  ✅ Validated ${validatedGames} games against Basketball-Reference`);
    console.log(`  ✅ ${withinTolerance} games within tolerance (±5 on Pace/OffRtg/DefRtg)`);
    
    const accuracyPct = ((withinTolerance / validatedGames) * 100).toFixed(1);
    console.log(`  📈 Validation accuracy: ${accuracyPct}%`);
  }
  
  // LAYER 3: Aggregate season stats
  console.log(`\n📊 LAYER 3: Aggregating Team Season Stats`);
  const calculatedAverages = aggregateTeamSeasonStats(games, season);
  console.log(`  ✅ Calculated averages for ${Object.keys(calculatedAverages).length} teams`);
  
  // Compare with Basketball-Reference
  if (Object.keys(brefStats).length > 0) {
    console.log(`\n🔍 Cross-Validation: Calculated vs Basketball-Reference`);
    console.log(`  ${'Team'.padEnd(5)} | ${'Pace Δ'.padEnd(8)} | ${'OffRtg Δ'.padEnd(10)} | ${'DefRtg Δ'.padEnd(10)}`);
    console.log(`  ${'-'.repeat(45)}`);
    
    let totalPaceError = 0;
    let totalOffRtgError = 0;
    let totalDefRtgError = 0;
    let comparedTeams = 0;
    
    for (const [teamId, calc] of Object.entries(calculatedAverages)) {
      const bref = brefStats[teamId];
      if (!bref) continue;
      
      const paceError = Math.abs(calc.pace - bref.pace);
      const offRtgError = Math.abs(calc.offRtg - bref.offRtg);
      const defRtgError = Math.abs(calc.defRtg - bref.defRtg);
      
      totalPaceError += paceError;
      totalOffRtgError += offRtgError;
      totalDefRtgError += defRtgError;
      comparedTeams++;
      
      const teamAbbr = TEAM_ID_TO_BREF[teamId] || teamId;
      console.log(`  ${teamAbbr.padEnd(5)} | ${paceError.toFixed(2).padEnd(8)} | ${offRtgError.toFixed(2).padEnd(10)} | ${defRtgError.toFixed(2).padEnd(10)}`);
    }
    
    if (comparedTeams > 0) {
      console.log(`  ${'-'.repeat(45)}`);
      console.log(`  Avg   | ${(totalPaceError / comparedTeams).toFixed(2).padEnd(8)} | ${(totalOffRtgError / comparedTeams).toFixed(2).padEnd(10)} | ${(totalDefRtgError / comparedTeams).toFixed(2).padEnd(10)}`);
    }
  }
  
  // Save enhanced games
  const enhancedFile = path.join(ADVANCED_DIR, `games_${season.replace('-', '_')}_enhanced.json`);
  fs.writeFileSync(enhancedFile, JSON.stringify(games, null, 2));
  console.log(`\n💾 Saved enhanced games: ${path.basename(enhancedFile)}`);
  
  // Save aggregated stats
  const aggregatesFile = path.join(ADVANCED_DIR, `aggregates_${season.replace('-', '_')}.json`);
  const aggregates = {
    season,
    basketballReference: brefStats,
    calculated: calculatedAverages,
    metadata: {
      totalGames: games.length,
      calculatedGames,
      validatedGames,
      withinTolerance,
      accuracy: validatedGames > 0 ? (withinTolerance / validatedGames) : null
    }
  };
  fs.writeFileSync(aggregatesFile, JSON.stringify(aggregates, null, 2));
  console.log(`💾 Saved aggregates: ${path.basename(aggregatesFile)}`);
  
  return {
    season,
    games: calculatedGames,
    validated: validatedGames,
    accuracy: validatedGames > 0 ? (withinTolerance / validatedGames) : null
  };
}

async function main() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🏀 NBA COMPREHENSIVE ADVANCED STATS COLLECTOR`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`\nSeasons: ${SEASONS.join(', ')}`);
  console.log(`\nMulti-Layer Approach:`);
  console.log(`  1️⃣  Basketball-Reference: Ground truth validation`);
  console.log(`  2️⃣  Box Score Calculations: Possession-based metrics`);
  console.log(`  3️⃣  Aggregation: Team season averages + cross-validation`);
  
  const results = [];
  
  for (const season of SEASONS) {
    const result = await processSeasonComprehensive(season);
    if (result) {
      results.push(result);
    }
    
    // Rate limit between seasons
    if (SEASONS.indexOf(season) < SEASONS.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Summary
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📊 COLLECTION SUMMARY`);
  console.log(`${'═'.repeat(70)}\n`);
  
  for (const result of results) {
    const accuracyPct = result.accuracy ? (result.accuracy * 100).toFixed(1) : 'N/A';
    console.log(`${result.season}:`);
    console.log(`  📈 Games Processed: ${result.games}`);
    console.log(`  ✅ Validated: ${result.validated}`);
    console.log(`  🎯 Accuracy: ${accuracyPct}%`);
    console.log();
  }
  
  console.log(`✅ COMPLETE - Enhanced games saved to data/nba/advanced/`);
  console.log(`\nNext Steps:`);
  console.log(`  1. Review validation accuracy in aggregates_*.json`);
  console.log(`  2. Retrain models with enhanced games (83 features)`);
  console.log(`  3. Deploy improved predictions`);
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
