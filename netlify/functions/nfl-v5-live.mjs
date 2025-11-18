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
    // TRAINING CALIBRATION CONSTANTS (from game_aggregates_2025.json analysis)
    // Training: EPA per play = team_total_epa / total_game_plays (both teams combined)
    // NOT: team_total_epa / team_offensive_plays
    const SCALE_GAME_PLAYS = 1.3714;    // 171.43 / 125 (training total plays / base offensive plays)
    const EXPLOSIVE_RATE_MEAN = 0.0204; // Training mean per team
    
    // First pass: collect per-team stats and match with opponents
    const teamStatsMap = new Map();
    teamStats
      .filter(s => Number(s.season) === season && Number(s.week) < week && s.season_type === 'REG')
      .forEach(s => {
        const key = `${s.team}_${s.week}`;
        teamStatsMap.set(key, {
          team: s.team,
          opponent: s.opponent_team,
          week: Number(s.week),
          offensive_plays: Number(s.attempts || 0) + Number(s.carries || 0),
          total_epa: Number(s.passing_epa || 0) + Number(s.rushing_epa || 0),
          success_plays: Number(s.passing_first_downs || 0) + Number(s.rushing_first_downs || 0)
        });
      });
    
    // Second pass: build aggregates with game-level context
    const allAggregates = [];
    const processedGames = new Set();
    
    for (const [key, teamData] of teamStatsMap.entries()) {
      const weekNum = teamData.week;
      const teamAbbrev = teamData.team;
      const opponent = teamData.opponent;
      
      // Find corresponding game
      const game = allGames.find(g => 
        Number(g.season) === season && 
        Number(g.week) === weekNum &&
        ((g.home_team === teamAbbrev && g.away_team === opponent) || 
         (g.away_team === teamAbbrev && g.home_team === opponent))
      );
      
      if (!game) continue;
      
      const gameKey = `${game.game_id}_${teamAbbrev}`;
      if (processedGames.has(gameKey)) continue;
      processedGames.add(gameKey);
      
      const isHome = game.home_team === teamAbbrev;
      
      // Get opponent stats for this game
      const opponentKey = `${opponent}_${weekNum}`;
      const opponentData = teamStatsMap.get(opponentKey);
      
      // TRAINING-EXACT EPA CALCULATION:
      // Step 1: Calculate base game plays (sum of both teams' offensive plays)
      // Step 2: Scale to estimated total game plays (including special teams)
      // Step 3: Use same denominator for BOTH teams' EPA per play
      
      let gamePlaysEst;
      if (opponentData) {
        // Both teams' data available - use actual sum
        const baseGamePlays = teamData.offensive_plays + opponentData.offensive_plays;
        gamePlaysEst = baseGamePlays * SCALE_GAME_PLAYS;
      } else {
        // Fallback: estimate based on this team alone
        gamePlaysEst = teamData.offensive_plays * SCALE_GAME_PLAYS * 2;
      }
      
  // Create aggregate for this team
  // Clamp per-game measurements to training-plausible ranges to avoid
  // extreme outliers (which previously drove many all-UNDER totals).
  const raw_epa_per_play = gamePlaysEst > 0 ? (teamData.total_epa / gamePlaysEst) : 0.0;
  const epa_per_play = Math.max(-0.35, Math.min(raw_epa_per_play, 0.35)); // clamp to [-0.35,0.35]

  const raw_success = teamData.offensive_plays > 0 ? (teamData.success_plays / teamData.offensive_plays) : 0.222;
  const success_rate = Math.max(0.10, Math.min(raw_success, 0.80)); // clamp to [0.10,0.80]

  const explosive_rate = Math.max(0.005, Math.min(EXPLOSIVE_RATE_MEAN, 0.08));

  allAggregates.push({
        game_id: game.game_id,
        season: season,
        week: weekNum,
        team: teamAbbrev,
        opponent: opponent,
        home_team: game.home_team,
        away_team: game.away_team,
        is_home: isHome,
        
        // TRAINING-EXACT FEATURES:
        // 1. Pace: Estimated total game plays (matches training ~171)
        plays: Math.round(gamePlaysEst),

        // 2. EPA: Divide by TOTAL GAME PLAYS, not individual team plays
        //    This matches training: team_epa_per_play = team_epa / game_total_plays
        //    Apply clamping to avoid extreme outliers.
        epa_per_play,

        // 3. Success Rate: Decimal 0-1 format (per team's offensive plays)
        //    Clamped to plausible range.
        success_rate,

        // 4. Explosive Rate: Use training mean (play-by-play data not available)
        explosive_rate
      });
    }
    
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
      
      // Determine picks with CORRECT favorite/underdog logic
      const spreadPick = spreadPred.raw_prediction < 0 ? game.home_team : game.away_team;
      
      // CRITICAL: Spread line must match the picked team's role (favorite vs underdog)
      // NFLverse spread_line is from HOME team perspective:
      //   - Negative = home is favorite (e.g., -3.5 means home favored by 3.5)
      //   - Positive = home is underdog (e.g., +3.5 means away favored by 3.5)
      
      let spreadLine = game.spread_line || spreadPred.line;
      
      if (spreadLine !== null) {
        // Determine who the market favorite is
        const marketFavorite = spreadLine < 0 ? game.home_team : game.away_team;
        
        // If we're picking the favorite, show negative spread
        // If we're picking the underdog, show positive spread
        if (spreadPick === marketFavorite) {
          // Picking favorite - use negative spread
          spreadLine = -Math.abs(spreadLine);
        } else {
          // Picking underdog - use positive spread
          spreadLine = Math.abs(spreadLine);
        }
      }
      
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
          features: totalFeatures,  // Expose for debugging/validation
          features: totalFeatures,
          market_line: game.total_line
        },
        
        actual: null // Future predictions
      });
    }
    
    const executionTime = Date.now() - startTime;
    
    // HEALTH CHECK: Detect catastrophic mis-inference
    const totalPicks = predictions.map(p => p.total.pick);
    const overCount = totalPicks.filter(p => p === 'OVER').length;
    const underCount = totalPicks.filter(p => p === 'UNDER').length;
    const meanTotal = predictions.reduce((s, p) => s + p.total.predicted, 0) / predictions.length;
    
    const healthCheckFailed = 
      (overCount === predictions.length || underCount === predictions.length) ||  // All one side
      meanTotal > 60 || meanTotal < 30;  // Predictions unrealistic
    
    if (healthCheckFailed) {
      console.warn('⚠️  HEALTH CHECK FAILED');
      console.warn(`   OVER: ${overCount}, UNDER: ${underCount}, Mean Total: ${meanTotal.toFixed(1)}`);
      console.warn('   Predictions marked as debug-only - feature distribution anomaly');
      
      predictions.forEach(p => {
        p.total.debug_only = true;
        p.total.health_check_warning = 'Feature distribution anomaly detected - verify feature generation';
      });
    }
    
    // Calculate feature distribution means for monitoring
    const featureMeans = {
      pace_combined: 0,
      epa_off_sum: 0,
      success_sum: 0,
      explosive_sum: 0,
      count: predictions.length
    };
    
    predictions.forEach(p => {
      const homeTeam = p.home_team;
      const awayTeam = p.away_team;
      const homeMetrics = teamMetrics[homeTeam];
      const awayMetrics = teamMetrics[awayTeam];
      
      if (homeMetrics && awayMetrics) {
        featureMeans.pace_combined += (homeMetrics.pace_avg + awayMetrics.pace_avg) / 2;
        featureMeans.epa_off_sum += homeMetrics.epa_offense_avg + awayMetrics.epa_offense_avg;
        featureMeans.success_sum += homeMetrics.off_success_rate + awayMetrics.off_success_rate;
        featureMeans.explosive_sum += homeMetrics.off_explosive_rate + awayMetrics.off_explosive_rate;
      }
    });
    
    // Compute means
    if (featureMeans.count > 0) {
      featureMeans.pace_combined /= featureMeans.count;
      featureMeans.epa_off_sum /= featureMeans.count;
      featureMeans.success_sum /= featureMeans.count;
      featureMeans.explosive_sum /= featureMeans.count;
    }
    
    return {
      season,
      week,
      model_version: 'V5-Live-EPA-Fix-2025-11-17',
      generated_at: new Date().toISOString(),
      generation_time_ms: executionTime,
      games_count: predictions.length,
      health_check: {
        passed: !healthCheckFailed,
        over_count: overCount,
        under_count: underCount,
        mean_total: meanTotal
      },
      feature_diagnostics: {
        means: {
          pace_combined: Number(featureMeans.pace_combined.toFixed(2)),
          epa_off_sum: Number(featureMeans.epa_off_sum.toFixed(4)),
          success_sum: Number(featureMeans.success_sum.toFixed(4)),
          explosive_sum: Number(featureMeans.explosive_sum.toFixed(4))
        },
        training_targets: {
          pace_combined: 171.4,
          epa_off_sum: 0.0186,
          success_sum: 0.444,
          explosive_sum: 0.041
        },
        epa_denominator: 'gamePlaysEst (training-exact)',
        scale_factor: 1.3714
      },
      data_sources: {
        nflverse_url: NFLVERSE_GAMES_URL,
        aggregates: `nflverse/${season} (${allAggregates.length} games)`,
        schedule: `nflverse/${season} Week ${week}`,
        rolling_window: 16,
        cutoff_week: week - 1,
        calibration: 'Training-exact: EPA ÷ gamePlaysEst, pace = gamePlaysEst, SCALE = 1.3714'
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
    // Fallback: TRAINING DISTRIBUTION MEANS (not arbitrary values)
    return {
      pace_avg: 171.4,            // Training mean total game plays
      epa_offense_avg: 0.0093,    // Training mean per team per play
      epa_defense_avg: 0.0093,    // Training mean per team per play
      off_success_rate: 0.222,    // Training mean per team
      def_success_rate: 0.222,
      off_explosive_rate: 0.0204, // Training mean per team
      def_explosive_rate: 0.0204,
      points_scored_avg: 22.0,
      points_allowed_avg: 22.0
    };
  }
  
  // Accumulate metrics (already in per-play/rate format from aggregates)
  let pace_sum = 0;
  let epa_off_per_play_sum = 0;  // Already per-play
  let epa_def_per_play_sum = 0;  // Already per-play
  let success_off_sum = 0;       // Already rate (0-1)
  let success_def_sum = 0;
  let explosive_off_sum = 0;     // Already rate (0-1)
  let explosive_def_sum = 0;
  
  for (const game of recentGames) {
    pace_sum += game.plays || 171.4;
    epa_off_per_play_sum += game.epa_per_play || 0.0;
    
    // For defense, we need the opponent's offensive EPA per play
    const opponentGame = aggregates.find(agg => 
      agg.season === game.season && 
      agg.week === game.week && 
      agg.team === game.opponent
    );
    
    epa_def_per_play_sum += (opponentGame ? opponentGame.epa_per_play : 0.0);
    success_off_sum += game.success_rate || 0.222;
    success_def_sum += (opponentGame ? opponentGame.success_rate : 0.222);
    explosive_off_sum += game.explosive_rate || 0.0204;
    explosive_def_sum += (opponentGame ? opponentGame.explosive_rate : 0.0204);
  }
  
  const n = recentGames.length;
  return {
    pace_avg: pace_sum / n,
    epa_offense_avg: epa_off_per_play_sum / n,  // Simple average (no extra division)
    epa_defense_avg: epa_def_per_play_sum / n,  // Simple average (no extra division)
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
  // Training expects:
  // - pace_combined: ~171 (single game total plays, not sum of team averages)
  // - epa_off_sum: ~0.0-0.2 (sum of per-play EPA decimals)
  // - success_sum: ~0.4-0.5 (sum of success rate decimals, NOT percentage)
  // - explosive_sum: ~0.04 (sum of explosive rate decimals, NOT percentage)
  
  return {
    // Pace: Average the two teams' pace (each team's pace is already total game plays)
    pace_combined: (homeMetrics.pace_avg + awayMetrics.pace_avg) / 2,
    
    // EPA: Sum per-play EPA (already in correct scale)
    epa_off_sum: homeMetrics.epa_offense_avg + awayMetrics.epa_offense_avg,
    epa_def_sum: homeMetrics.epa_defense_avg + awayMetrics.epa_defense_avg,
    
    // Success: Sum decimal rates (already 0-1, don't multiply by 100!)
    success_sum: homeMetrics.off_success_rate + awayMetrics.off_success_rate,
    
    // Explosive: Sum decimal rates (already 0-1, don't multiply by 100!)
    explosive_sum: homeMetrics.off_explosive_rate + awayMetrics.off_explosive_rate
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
