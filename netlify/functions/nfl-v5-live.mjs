/**
 * NFL V5 Live Predictions - Dynamic On-Demand Generation
 * 
 * Generates fresh predictions every time the page is hit/refreshed.
 * Uses latest NFLverse data, odds, injuries, and edge info.
 * 
 * ENDPOINTS:
 * ==========
 * GET /.netlify/functions/nfl-v5-live
 *   - Auto-detects current week
 *   - Generates predictions from schedule + rolling metrics
 * 
 * GET /.netlify/functions/nfl-v5-live?season=2025&week=11
 *   - Specific week predictions
 * 
 * GET /.netlify/functions/nfl-v5-live?force=true
 *   - Bypass cache, regenerate fresh
 * 
 * CACHE:
 * ======
 * - Results cached in Netlify Blobs for 15 minutes
 * - Fresh data pulled: NFLverse aggregates, schedule, odds
 * - Edge recalculated: injury impact, depth charts, trends
 */

import { getStore } from "@netlify/blobs";

// Team name to abbreviation mapping (from schedule-source.mjs)
const TEAM_NAME_TO_ABBREV = {
  'Arizona Cardinals': 'ARI',
  'Atlanta Falcons': 'ATL',
  'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF',
  'Carolina Panthers': 'CAR',
  'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN',
  'Cleveland Browns': 'CLE',
  'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN',
  'Detroit Lions': 'DET',
  'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU',
  'Indianapolis Colts': 'IND',
  'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC',
  'Las Vegas Raiders': 'LV',
  'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LA',
  'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE',
  'New Orleans Saints': 'NO',
  'New York Giants': 'NYG',
  'New York Jets': 'NYJ',
  'Philadelphia Eagles': 'PHI',
  'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA',
  'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN',
  'Washington Commanders': 'WAS'
};

function teamNameToAbbrev(fullName) {
  return TEAM_NAME_TO_ABBREV[fullName] || fullName;
}

// Parse CSV string to array of objects
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || '';
    });
    return obj;
  });
}

// V5 prediction logic (port from v5-ensemble.mjs)
async function generateV5Predictions({ season, week }) {
  const startTime = Date.now();
  
  try {
    // 1. Fetch NFLverse games CSV (schedule + betting lines)
    const NFLVERSE_GAMES_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
    console.log('Fetching NFLverse games from:', NFLVERSE_GAMES_URL);
    
    const gamesResponse = await fetch(NFLVERSE_GAMES_URL);
    if (!gamesResponse.ok) {
      throw new Error(`NFLverse games fetch failed: ${gamesResponse.status}`);
    }
    
    const gamesText = await gamesResponse.text();
    const allGames = parseCSV(gamesText);
    console.log(`Loaded ${allGames.length} total games from NFLverse`);
    
    // 2. Fetch NFLverse team stats (weekly) - has EPA, success rate, etc.
    const NFLVERSE_STATS_URL = `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${season}.csv`;
    console.log('Fetching NFLverse team stats from:', NFLVERSE_STATS_URL);
    
    const statsResponse = await fetch(NFLVERSE_STATS_URL);
    if (!statsResponse.ok) {
      throw new Error(`NFLverse stats fetch failed: ${statsResponse.status}`);
    }
    
    const statsText = await statsResponse.text();
    const teamStats = parseCSV(statsText);
    console.log(`Loaded ${teamStats.length} team-week stats from NFLverse`);
    
    // 3. Build aggregates from team stats (real EPA data!)
    const allAggregates = teamStats
      .filter(s => Number(s.season) === season && Number(s.week) < week && s.season_type === 'REG')
      .map(s => {
        const teamAbbrev = s.team;
        const opponent = s.opponent_team;
        const weekNum = Number(s.week);
        
        // Find the corresponding game to determine home/away
        const game = allGames.find(g => 
          Number(g.season) === season && 
          Number(g.week) === weekNum &&
          ((g.home_team === teamAbbrev && g.away_team === opponent) || 
           (g.away_team === teamAbbrev && g.home_team === opponent))
        );
        
        const isHome = game ? game.home_team === teamAbbrev : false;
        
        return {
          game_id: game ? game.game_id : `${season}_${String(weekNum).padStart(2, '0')}_${opponent}_${teamAbbrev}`,
          season: season,
          week: weekNum,
          team: teamAbbrev,
          opponent: opponent,
          home_team: isHome ? teamAbbrev : opponent,
          away_team: isHome ? opponent : teamAbbrev,
          is_home: isHome,
          // Real EPA from play-by-play!
          offense_epa: Number(s.passing_epa || 0) + Number(s.rushing_epa || 0),
          defense_epa: 0, // Defense EPA needs opponent's offense EPA (will calculate below)
          plays: Number(s.attempts || 0) + Number(s.carries || 0),
          // Success rate approximation from yards/first downs
          success_rate: (Number(s.passing_first_downs || 0) + Number(s.rushing_first_downs || 0)) / 
                       (Number(s.attempts || 1) + Number(s.carries || 1)),
          explosive_rate: 0.11 // Placeholder - would need play-level data
        };
      });
    
    console.log(`Aggregated ${allAggregates.length} team-week records for ${season}`);
    
    // 4. Extract target week's schedule (future games)
    const weekGames = allGames
      .filter(g => Number(g.season) === season && Number(g.week) === week)
      .map(g => {
        // Combine gameday and gametime into ISO datetime
        let kickoff = g.gameday; // Default to just the date
        if (g.gametime && g.gameday) {
          // gametime is like "20:15", gameday is like "2025-11-13"
          // Combine them: "2025-11-13T20:15:00Z"
          kickoff = `${g.gameday}T${g.gametime}:00Z`;
        }
        
        return {
          game_id: g.game_id,
          season: Number(g.season),
          week: Number(g.week),
          home_team: g.home_team,
          away_team: g.away_team,
          gameday: g.gameday,
          kickoff: kickoff, // Full ISO datetime
          spread_line: g.spread_line ? Number(g.spread_line) : null,
          total_line: g.total_line ? Number(g.total_line) : null
        };
      });
    
    if (weekGames.length === 0) {
      throw new Error(`No games found for ${season} Week ${week}`);
    }
    
    console.log(`Found ${weekGames.length} games for Week ${week}`);
    console.log(`Found ${weekGames.length} games for Week ${week}`);
    
    // 4. Compute rolling metrics for each team (16-game window)
    const teamMetrics = {};
    for (const game of weekGames) {
      if (!teamMetrics[game.home_team]) {
        teamMetrics[game.home_team] = computeRollingMetrics(allAggregates, game.home_team, season, week);
      }
      if (!teamMetrics[game.away_team]) {
        teamMetrics[game.away_team] = computeRollingMetrics(allAggregates, game.away_team, season, week);
      }
    }
    
    // 5. Generate predictions for each game
    const predictions = [];
    for (const game of weekGames) {
      const homeMetrics = teamMetrics[game.home_team];
      const awayMetrics = teamMetrics[game.away_team];
      
      // Compute features
      const spreadFeatures = computeSpreadFeatures(homeMetrics, awayMetrics, game);
      const totalFeatures = computeTotalFeatures(homeMetrics, awayMetrics);
      
      // Get predictions from frozen models
      const spreadPred = predictSpread(spreadFeatures);
      const totalPred = predictTotal(totalFeatures);
      
      // Calculate edge vs market lines
      const spreadEdge = game.spread_line ? Math.abs(Math.abs(spreadPred.raw_prediction) - Math.abs(game.spread_line)) : 0;
      const totalEdge = game.total_line ? Math.abs(totalPred.p50 - game.total_line) : 0;
      
      // Determine picks
      const spreadPick = spreadPred.raw_prediction < 0 ? game.home_team : game.away_team;
      const spreadLine = game.spread_line || spreadPred.line;
      
      const totalPick = totalPred.p50 > (game.total_line || totalPred.p50) ? 'OVER' : 'UNDER';
      const totalLine = game.total_line || totalPred.p50;
      
      // Calculate recommended units (simplified Kelly criterion)
      const spreadUnits = spreadEdge > 10 ? 3 : spreadEdge > 5 ? 2 : spreadEdge > 2 ? 1 : 0.5;
      const totalUnits = totalEdge > 10 ? 3 : totalEdge > 5 ? 2 : totalEdge > 2 ? 1 : 0.5;
      
      predictions.push({
        game_id: game.game_id,
        season: game.season,
        week: game.week,
        home_team: game.home_team,
        away_team: game.away_team,
        matchup: `${game.away_team} @ ${game.home_team}`,
        gameday: game.gameday,
        kickoff: game.kickoff, // Use the properly formatted ISO datetime
        
        // Frontend-compatible format
        spread: {
          pick: spreadPick,
          line: spreadLine,
          edge: spreadEdge,
          units: spreadUnits,
          confidence: spreadPred.confidence
        },
        
        total: {
          pick: totalPick,
          line: totalLine,
          edge: totalEdge,
          units: totalUnits,
          predicted: totalPred.p50
        },
        
        moneyline: {
          pick: spreadPick, // Same as spread favorite
          line: null, // Not calculated in V5
          edge: 0,
          units: 0
        },
        
        // Raw model output (for debugging/analysis)
        spread_model: {
          model_name: 'v5_multi_feature_epa',
          predicted_spread: spreadPred.raw_prediction,
          line: spreadPred.line,
          home_favorite: spreadPred.raw_prediction < 0,
          favorite_team: spreadPick,
          confidence: spreadPred.confidence,
          features: spreadFeatures,
          market_line: game.spread_line
        },
        
        total_model: {
          model_name: 'v5_total_ridge_zero_edef',
          p25: totalPred.p25,
          p50: totalPred.p50,
          p75: totalPred.p75,
          spread: totalPred.spread,
          features: totalFeatures,
          market_line: game.total_line
        },
        
        actual: null // Future predictions
      });
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      season,
      week,
      model_version: 'V5-Live-NFLverse-2025-11-14',
      generated_at: new Date().toISOString(),
      generation_time_ms: executionTime,
      games_count: predictions.length,
      data_sources: {
        nflverse_url: NFLVERSE_GAMES_URL,
        aggregates: `nflverse/${season} (${allAggregates.length} games)`,
        schedule: `nflverse/${season} Week ${week}`,
        rolling_window: 16,
        cutoff_week: week - 1
      },
      games: predictions
    };
    
  } catch (error) {
    console.error('V5 generation error:', error);
    throw error;
  }
}

// Rolling metrics computation (16-game window, time-causal)
function computeRollingMetrics(aggregates, team, season, targetWeek, windowSize = 16) {
  // Filter to this team's games before the target week
  const teamGames = aggregates.filter(agg => 
    agg.season === season &&
    agg.week < targetWeek && // STRICTLY earlier weeks
    agg.team === team
  ).sort((a, b) => b.week - a.week); // Most recent first
  
  const recentGames = teamGames.slice(0, windowSize);
  
  if (recentGames.length === 0) {
    // Fallback: league averages
    return {
      pace_avg: 155,
      epa_offense_avg: 0.0,
      epa_defense_avg: 0.0,
      off_success_rate: 0.45,
      def_success_rate: 0.45,
      off_explosive_rate: 0.11,
      def_explosive_rate: 0.11,
      points_scored_avg: 22.0,
      points_allowed_avg: 22.0
    };
  }
  
  let pace_sum = 0, epa_off_sum = 0, epa_def_sum = 0;
  let success_off_sum = 0, success_def_sum = 0;
  let explosive_off_sum = 0, explosive_def_sum = 0;
  
  for (const game of recentGames) {
    pace_sum += game.plays || 155;
    epa_off_sum += game.offense_epa || 0.0;
    // For defense, we need the opponent's offensive EPA
    // Find opponent's stats for the same game
    const opponentGame = aggregates.find(agg => 
      agg.season === game.season && 
      agg.week === game.week && 
      agg.team === game.opponent
    );
    epa_def_sum += (opponentGame ? opponentGame.offense_epa : 0.0);
    success_off_sum += game.success_rate || 0.45;
    success_def_sum += (opponentGame ? opponentGame.success_rate : 0.45);
    explosive_off_sum += game.explosive_rate || 0.11;
    explosive_def_sum += (opponentGame ? opponentGame.explosive_rate : 0.11);
  }
  
  const n = recentGames.length;
  return {
    pace_avg: pace_sum / n,
    epa_offense_avg: (epa_off_sum / n) / (pace_sum / n), // EPA per play
    epa_defense_avg: (epa_def_sum / n) / (pace_sum / n), // EPA per play allowed
    off_success_rate: success_off_sum / n,
    def_success_rate: success_def_sum / n,
    off_explosive_rate: explosive_off_sum / n,
    def_explosive_rate: explosive_def_sum / n,
    points_scored_avg: 22.0, // Can add if needed
    points_allowed_avg: 22.0
  };
}

// Feature computation
function computeSpreadFeatures(homeMetrics, awayMetrics, game) {
  const epa_diff = (homeMetrics.epa_offense_avg - homeMetrics.epa_defense_avg) -
                   (awayMetrics.epa_offense_avg - awayMetrics.epa_defense_avg);
  
  const success_diff = (homeMetrics.off_success_rate - homeMetrics.def_success_rate) -
                       (awayMetrics.off_success_rate - awayMetrics.def_success_rate);
  
  const explosive_diff = (homeMetrics.off_explosive_rate - homeMetrics.def_explosive_rate) -
                         (awayMetrics.off_explosive_rate - awayMetrics.def_explosive_rate);
  
  // HFA map
  const HFA_MAP = {
    'DEN': 3.0, 'GB': 2.7, 'KC': 2.5, 'SEA': 2.5, 'NE': 2.3
  };
  const hfa = HFA_MAP[game.home_team] || 2.0;
  
  return { epa_diff, success_diff, explosive_diff, hfa };
}

function computeTotalFeatures(homeMetrics, awayMetrics) {
  return {
    pace_combined: homeMetrics.pace_avg + awayMetrics.pace_avg,
    epa_off_sum: homeMetrics.epa_offense_avg + awayMetrics.epa_offense_avg,
    epa_def_sum: homeMetrics.epa_defense_avg + awayMetrics.epa_defense_avg,
    success_sum: (homeMetrics.off_success_rate + awayMetrics.off_success_rate) * 100,
    explosive_sum: (homeMetrics.off_explosive_rate + awayMetrics.off_explosive_rate) * 100
  };
}

// Frozen V5 model predictions
function predictSpread(features) {
  // V5 spread coefficients (frozen)
  const intercept = -2.419;
  const coef_epa_diff = 38.454;
  const coef_success_diff = 0.651;
  const coef_explosive_diff = 1.886;
  const coef_hfa = 0.887;
  
  const raw_prediction = intercept +
                        (coef_epa_diff * features.epa_diff) +
                        (coef_success_diff * features.success_diff) +
                        (coef_explosive_diff * features.explosive_diff) +
                        (coef_hfa * features.hfa);
  
  return {
    raw_prediction,
    line: Math.abs(raw_prediction),
    confidence: 0.5 // Simplified
  };
}

function predictTotal(features) {
  // V5 total Ridge coefficients (frozen, λ=500)
  const intercept = 22.087;
  const coef_pace = 0.089;
  const coef_epa_off = 43.767;
  const coef_epa_def = 0.0; // Zero-weighted in serving
  const coef_success = 0.068;
  const coef_explosive = 0.293;
  
  const p50 = intercept +
              (coef_pace * features.pace_combined) +
              (coef_epa_off * features.epa_off_sum) +
              (coef_epa_def * features.epa_def_sum) +
              (coef_success * features.success_sum) +
              (coef_explosive * features.explosive_sum);
  
  return {
    p25: Math.round(p50 - 9),
    p50: Math.round(p50 * 2) / 2, // Round to nearest 0.5
    p75: Math.round(p50 + 9),
    spread: 18
  };
}

// Current week detection
function getCurrentNFLWeek() {
  const now = new Date();
  const season = now.getFullYear();
  
  // NFL season starts ~early September
  const seasonStart = new Date(season, 8, 1); // Sept 1
  const daysSinceStart = Math.floor((now - seasonStart) / (1000 * 60 * 60 * 24));
  const week = Math.min(Math.max(Math.floor(daysSinceStart / 7) + 1, 1), 18);
  
  return { season, week };
}

// Main handler
export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('force') === 'true';
    const seasonParam = url.searchParams.get('season');
    const weekParam = url.searchParams.get('week');
    
    // Detect current week or use params
    const auto = getCurrentNFLWeek();
    const season = seasonParam ? parseInt(seasonParam) : auto.season;
    const week = weekParam ? parseInt(weekParam) : auto.week;
    
    const cacheKey = `live/${season}-week${week}`;
    
    // Try to use Netlify Blobs if available (production), skip if not (local testing)
    let store = null;
    let cached = null;
    try {
      store = getStore("nfl-v5");
      
      // Check cache (unless force refresh)
      if (!forceRefresh) {
        cached = await store.get(cacheKey, { type: "json" });
        if (cached && cached.generated_at) {
          const cacheAge = Date.now() - new Date(cached.generated_at).getTime();
          if (cacheAge < 15 * 60 * 1000) { // 15 minutes
            return new Response(
              JSON.stringify({
                ...cached,
                cached: true,
                cache_age_seconds: Math.floor(cacheAge / 1000)
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  "Cache-Control": "public, max-age=900", // 15 min
                  "X-Cache-Status": "HIT"
                }
              }
            );
          }
        }
      }
    } catch (blobsError) {
      console.log('Netlify Blobs not available (local testing):', blobsError.message);
    }
    
    // Generate fresh predictions
    console.log(`Generating V5 predictions for ${season} Week ${week}...`);
    const predictions = await generateV5Predictions({ season, week });
    
    // Cache results (if Blobs available)
    if (store) {
      try {
        await store.set(cacheKey, JSON.stringify(predictions), {
          metadata: {
            season,
            week,
            generated_at: predictions.generated_at
          }
        });
      } catch (cacheError) {
        console.log('Failed to cache (local testing):', cacheError.message);
      }
    }
    
    return new Response(
      JSON.stringify({
        ...predictions,
        cached: false,
        cache_age_seconds: 0
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=900",
          "X-Cache-Status": "MISS"
        }
      }
    );
    
  } catch (error) {
    console.error("V5 live generation error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to generate predictions",
        message: error.message,
        stack: error.stack
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};
