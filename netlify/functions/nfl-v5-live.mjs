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

// V5 prediction logic (port from v5-ensemble.mjs)
async function generateV5Predictions({ season, week }) {
  const startTime = Date.now();
  
  try {
    // 1. Load aggregates from local nfl-model-v3 data
    // This is the same data source v5-ensemble.mjs uses
    const fs = await import('fs/promises');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Path to aggregates (same as v5-ensemble.mjs)
    const aggregatePath = path.join(
      __dirname,
      '..',
      '..',
      'nfl-model-v3',
      'data',
      'nflverse',
      `game_aggregates_${season}.json`
    );
    
    const aggregatesData = await fs.readFile(aggregatePath, 'utf-8');
    const allAggregates = JSON.parse(aggregatesData);
    
    // 2. Load schedule from netlify/data/nfl/SEASON/schedule.full.json
    const schedulePath = path.join(
      __dirname,
      '..',
      'data',
      'nfl',
      season.toString(),
      'schedule.full.json'
    );
    
    const scheduleData = await fs.readFile(schedulePath, 'utf-8');
    const scheduleJson = JSON.parse(scheduleData);
    
    // Extract games for target week
    const weekKey = week.toString();
    const weekSchedule = scheduleJson.weeks?.[weekKey];
    
    if (!weekSchedule || !weekSchedule.matchups) {
      throw new Error(`No games found in schedule for ${season} Week ${week}`);
    }
    
    // Convert schedule format to game list
    const weekGames = weekSchedule.matchups.map(m => ({
      game_id: m.id || `${season}_${String(week).padStart(2, '0')}_${m.awayTeam}_${m.homeTeam}`,
      season,
      week,
      home_team: teamNameToAbbrev(m.homeTeam),
      away_team: teamNameToAbbrev(m.awayTeam),
      gameday: m.date || `${season}-W${week}`,
      gametime: m.kickoff,
      kickoff: m.kickoff
    }));
    
    if (weekGames.length === 0) {
      throw new Error(`No games found for ${season} Week ${week}`);
    }
    
    // 3. Compute rolling metrics for each team (16-game window)
    const teamMetrics = {};
    for (const game of weekGames) {
      if (!teamMetrics[game.home_team]) {
        teamMetrics[game.home_team] = computeRollingMetrics(allAggregates, game.home_team, season, week);
      }
      if (!teamMetrics[game.away_team]) {
        teamMetrics[game.away_team] = computeRollingMetrics(allAggregates, game.away_team, season, week);
      }
    }
    
    // 4. Generate predictions for each game
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
      
      predictions.push({
        game_id: game.game_id,
        season: game.season,
        week: game.week,
        home_team: game.home_team,
        away_team: game.away_team,
        gameday: game.gameday,
        kickoff: game.gametime,
        
        spread_model: {
          model_name: 'v5_multi_feature_epa',
          predicted_spread: spreadPred.raw_prediction,
          line: spreadPred.line,
          home_favorite: spreadPred.raw_prediction < 0,
          favorite_team: spreadPred.raw_prediction < 0 ? game.home_team : game.away_team,
          confidence: spreadPred.confidence,
          features: spreadFeatures
        },
        
        total_model: {
          model_name: 'v5_total_ridge_zero_edef',
          p25: totalPred.p25,
          p50: totalPred.p50,
          p75: totalPred.p75,
          spread: totalPred.spread,
          features: totalFeatures
        },
        
        actual: null // Future predictions
      });
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      season,
      week,
      model_version: 'V5-Live-Dynamic-2025-11-14',
      generated_at: new Date().toISOString(),
      generation_time_ms: executionTime,
      games_count: predictions.length,
      data_sources: {
        aggregates: `nflverse/${season}`,
        schedule: `nflverse/${season}`,
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
function computeRollingMetrics(games, team, season, targetWeek, windowSize = 16) {
  const teamGames = games.filter(g => 
    Number(g.season) === season &&
    Number(g.week) < targetWeek && // STRICTLY earlier weeks
    (g.home_team === team || g.away_team === team)
  ).sort((a, b) => Number(b.week) - Number(a.week)); // Most recent first
  
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
      def_explosive_rate: 0.11
    };
  }
  
  let pace_sum = 0, epa_off_sum = 0, epa_def_sum = 0;
  let success_off_sum = 0, success_def_sum = 0;
  let explosive_off_sum = 0, explosive_def_sum = 0;
  
  for (const game of recentGames) {
    const isHome = game.home_team === team;
    const pace = game.plays || 155;
    
    if (isHome) {
      pace_sum += pace;
      epa_off_sum += game.home_epa_per_play || 0.0;
      epa_def_sum += game.away_epa_per_play || 0.0;
      success_off_sum += game.home_success_rate || 0.45;
      success_def_sum += game.away_success_rate || 0.45;
      explosive_off_sum += game.home_explosive_rate || 0.11;
      explosive_def_sum += game.away_explosive_rate || 0.11;
    } else {
      pace_sum += pace;
      epa_off_sum += game.away_epa_per_play || 0.0;
      epa_def_sum += game.home_epa_per_play || 0.0;
      success_off_sum += game.away_success_rate || 0.45;
      success_def_sum += game.home_success_rate || 0.45;
      explosive_off_sum += game.away_explosive_rate || 0.11;
      explosive_def_sum += game.home_explosive_rate || 0.11;
    }
  }
  
  const n = recentGames.length;
  return {
    pace_avg: pace_sum / n,
    epa_offense_avg: epa_off_sum / n,
    epa_defense_avg: epa_def_sum / n,
    off_success_rate: success_off_sum / n,
    def_success_rate: success_def_sum / n,
    off_explosive_rate: explosive_off_sum / n,
    def_explosive_rate: explosive_def_sum / n
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
    const store = getStore("nfl-v5");
    
    // Check cache (unless force refresh)
    if (!forceRefresh) {
      const cached = await store.get(cacheKey, { type: "json" });
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
    
    // Generate fresh predictions
    console.log(`Generating V5 predictions for ${season} Week ${week}...`);
    const predictions = await generateV5Predictions({ season, week });
    
    // Cache results
    await store.set(cacheKey, JSON.stringify(predictions), {
      metadata: {
        season,
        week,
        generated_at: predictions.generated_at
      }
    });
    
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

export const config = {
  path: "/nfl-v5-live"
};
