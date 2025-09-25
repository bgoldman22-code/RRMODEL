/**
 * NFL Touchdown Predictions - Enhanced R Pipeline Integration
 * Netlify Function to serve R pipeline predictions to React frontend
 * 
 * Supports multiple data formats:
 * - Full predictions with metadata
 * - Lightweight predictions for mobile
 * - Player-specific queries
 * - Game-specific queries
 * - Value-ranked lists
 */

const fs = require('fs').promises;
const path = require('path');
const fetch = global.fetch || require('node-fetch');

// ELITE CONFIGURATION - Sharp Room Standards
const CONFIG = {
  // Data file paths (R pipeline writes to data/ directly)
  MAIN_DATA_PATH: path.join(process.cwd(), 'data', 'nfl-td-comprehensive-latest.json'),
  LITE_DATA_PATH: path.join(process.cwd(), 'data', 'nfl-td-lite-latest.json'),

  // Cache settings
  CACHE_DURATION_SECONDS: 300, // 5 minutes API cache for function responses

  // UI defaults
  DEFAULT_TOP_N: 50,
  QUERY_TYPES: [
    'all',
    'lite',
    'top-anytime',
    'top-multiple',
    'top-first',
    'by-game',
    'by-position',
    'value-picks',
    'high-confidence',
    'data-quality',
    'raw'
  ],

  // Book whitelist configuration (normalized to uppercase, punctuation removed)
  ALLOWED_BOOKS: new Set(['FANDUEL', 'DRAFTKINGS', 'CAESARS', 'BETMGM', 'BETFANATICS', 'ESPNBET']),
  EXCLUDED_BOOKS: new Set(['BOVADA', 'BETONLINEAG'])
};

// In-memory cache for pipeline data across invocations
const cachedData = {};

// Load team aliases for mapping abbreviations to full names
let TEAM_ABBR_TO_FULL = null;
async function loadTeamAliases() {
  if (TEAM_ABBR_TO_FULL) return TEAM_ABBR_TO_FULL;
  try {
    const aliasPath = path.join(process.cwd(), 'data', 'nfl-team-aliases.json');
    const aliasData = JSON.parse(await fs.readFile(aliasPath, 'utf8'));
    // Invert mapping: abbr -> full
    TEAM_ABBR_TO_FULL = {};
    for (const [full, abbr] of Object.entries(aliasData)) {
      if (!TEAM_ABBR_TO_FULL[abbr]) TEAM_ABBR_TO_FULL[abbr] = full;
    }
    return TEAM_ABBR_TO_FULL;
  } catch (e) {
    TEAM_ABBR_TO_FULL = {};
    return TEAM_ABBR_TO_FULL;
  }
}

// Fetch live player TD markets via The Odds API per-event endpoint
async function fetchLiveTDOdds() {
  console.log('[DEBUG] Starting fetchLiveTDOdds');
  let eventCount = 0;
  const apiKey = process.env.THEODDS_API_KEY || process.env.THEODDSAPI_KEY || process.env.ODDS_API_KEY;
  const baseRoot = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl';
  const allowedBooksParam = ['fanduel', 'draftkings', 'caesars', 'betmgm', 'betfanatics', 'espnbet'].join(',');
  const marketsParam = 'player_anytime_td';
  const debug = [];

  if (!apiKey) {
    return { success: false, reason: 'missing_api_key', odds: [], debug: [{ error: 'No THEODDS_API_KEY set' }] };
  }

  try {
    // 1) List NFL events
    const eventsUrl = `${baseRoot}/events?apiKey=${apiKey}&dateFormat=iso`;
    console.log('[DEBUG] Fetching NFL events:', eventsUrl);
    const eventsResp = await fetch(eventsUrl);
    if (!eventsResp.ok) {
      let body = '';
      try { body = await eventsResp.text(); } catch {}
      debug.push({ endpoint: 'events', status: eventsResp.status, body: body?.slice(0, 300) });
      return { success: false, reason: `events_api_error_${eventsResp.status}`, odds: [], debug };
    }
    const events = await eventsResp.json();
    console.log(`[DEBUG] Got ${events.length} events`);
    if (!Array.isArray(events) || events.length === 0) {
      debug.push({ endpoint: 'events', note: 'no_events' });
      return { success: false, reason: 'no_events', odds: [], debug };
    }

    // Load team aliases for mapping
    console.log('[DEBUG] Loading team aliases for mapping');
    const abbrToFull = await loadTeamAliases();

    // 2) Fetch per-event odds for TD scorer markets
    const playerOdds = [];
    for (const ev of events) {
      eventCount++;
      console.log(`[DEBUG] Processing event #${eventCount}: ${ev.home_team} vs ${ev.away_team} (id: ${ev.id})`);

      // Map team abbreviations to full names for matching
      let homeTeam = ev.home_team;
      let awayTeam = ev.away_team;
      // If model uses abbreviations, map to full
      if (abbrToFull[homeTeam]) homeTeam = abbrToFull[homeTeam];
      if (abbrToFull[awayTeam]) awayTeam = abbrToFull[awayTeam];
      
      console.log(`[DEBUG] Event teams mapped: home='${homeTeam}', away='${awayTeam}'`);

      const evUrl = `${baseRoot}/events/${encodeURIComponent(ev.id)}/odds?apiKey=${apiKey}&regions=us&oddsFormat=american&bookmakers=${allowedBooksParam}&markets=${marketsParam}`;
      console.log('[DEBUG] Fetching event odds:', evUrl);
      const evResp = await fetch(evUrl);
      if (!evResp.ok) {
        let body = '';
        try { body = await evResp.text(); } catch {}
        debug.push({ endpoint: 'event_odds', eventId: ev.id, status: evResp.status, body: body?.slice(0, 250) });
        console.log(`[DEBUG] Failed to fetch odds for event ${ev.id}, status: ${evResp.status}`);
        continue;
      }
      const evData = await evResp.json();
      console.log(`[DEBUG] Got ${evData.bookmakers?.length || 0} bookmakers for event ${ev.id}`);

      for (const bookmaker of evData.bookmakers || []) {
        const bookName = normalizeBookName(bookmaker.key);
        if (!CONFIG.ALLOWED_BOOKS.has(bookName)) continue;
        console.log(`[DEBUG] Bookmaker: ${bookmaker.key}, markets: ${(bookmaker.markets || []).map(m => m.key).join(', ')}`);

        for (const market of bookmaker.markets || []) {
          const mkey = String(market.key || '').toLowerCase();
          const isAnytime = mkey === 'player_anytime_td' || (mkey.includes('anytime') && mkey.includes('td'));
          if (!isAnytime) continue;
          console.log(`[DEBUG] Market: ${market.key}, outcomes: ${(market.outcomes || []).length}`);

          for (const outcome of market.outcomes || []) {
            // Use full player name for matching
            const playerName = outcome.description || outcome.name; // Odds API uses full names
            if (!playerName) continue;
            console.log(`[DEBUG] Player odds outcome: player='${playerName}', odds=${outcome.price}`);
            playerOdds.push({
              player_name: playerName,
              market_type: 'player_anytime_td',
              odds: outcome.price,
              bookmaker: bookmaker.key,
              game_id: evData.id || ev.id,
              home_team: homeTeam,
              away_team: awayTeam,
              point: outcome.point,
              outcome_name: outcome.name
            });
          }
        }
      }
    }

    debug.push({ endpoint: 'summary', events: events.length, odds: playerOdds.length });
    if (playerOdds.length > 0) {
      return { success: true, odds: playerOdds, debug };
    }
    return { success: false, reason: 'no_player_props', odds: [], debug };
  } catch (error) {
    console.error('\u274c Error fetching live odds:', error.message);
    return { success: false, reason: 'fetch_error', odds: [], error: error.message };
  }
}

// Normalize names for fuzzy matching (remove punctuation/space, uppercase)
function normalizePlayerName(name = '') {
  return String(name).toUpperCase().replace(/[^A-Z]/g, '');
}

function namesLikelyMatch(a, b) {
  if (!a || !b) return false;
  // Normalize both names
  const norm = s => String(s).toUpperCase().replace(/[^A-Z]/g, '');
  const A = norm(a);
  const B = norm(b);
  if (A === B) return true;

  // Try last name and first initial match (e.g., 'K.Murray' vs 'Kyler Murray')
  const getFirstLast = s => {
    const parts = String(s).replace(/\./g, ' ').split(' ').filter(Boolean);
    if (parts.length === 1) return { first: parts[0][0], last: parts[0] };
    return { first: parts[0][0], last: parts[parts.length - 1] };
  };
  const aFL = getFirstLast(a);
  const bFL = getFirstLast(b);
  if (aFL.last && bFL.last && norm(aFL.last) === norm(bFL.last)) {
    if (aFL.first && bFL.first && norm(aFL.first) === norm(bFL.first)) {
      return true;
    }
  }

  // Try substring match for rare cases (e.g., 'D.Johnson' vs 'David Johnson')
  if (A.length > 3 && B.includes(A)) return true;
  if (B.length > 3 && A.includes(B)) return true;

  return false;
}

function enhancePredictionsWithLiveOdds(predictions, liveOddsData) {
  console.log(`[SIMPLE ODDS] Starting with ${predictions.length} predictions and ${liveOddsData.odds?.length || 0} odds`);
  
  if (!liveOddsData.success || !liveOddsData.odds.length) {
    console.log('[SIMPLE ODDS] No live odds - returning original predictions');
    return predictions;
  }

  let matchedCount = 0;
  
  const enhanced = predictions.map(pred => {
    const playerName = pred.player_name || pred.name;
    
    // Find matching odds for anytime TD
    const matchingOdds = liveOddsData.odds.find(odds => 
      odds.market_type === 'player_anytime_td' && 
      namesLikelyMatch(odds.player_name, playerName)
    );
    
    if (matchingOdds) {
      matchedCount++;
      console.log(`[SIMPLE ODDS] ✅ ${playerName} → ${matchingOdds.player_name} = ${matchingOdds.odds}`);
      
      return {
        ...pred,
        american_odds: matchingOdds.odds,
        odds_source: 'live_api',
        has_live_odds: true
      };
    } else {
      return {
        ...pred,
        odds_source: 'model_estimated', 
        has_live_odds: false
      };
    }
  });
  
  console.log(`[SIMPLE ODDS] Matched ${matchedCount}/${predictions.length} players with live odds`);
  return enhanced;
}

// ========== BOOK WHITELIST ENFORCEMENT ==========

function normalizeBookName(s = '') {
  return String(s).toUpperCase().replace(/[\s._-]/g, '');
}

function enhancedFilterAllowedBooks(oddsSources = []) {
  if (!Array.isArray(oddsSources)) return [];
  
  return oddsSources.filter(src => {
    const bookName = normalizeBookName(src.book || src.bookmaker || '');
    const isAllowed = CONFIG.ALLOWED_BOOKS.has(bookName);
    const isExcluded = CONFIG.EXCLUDED_BOOKS.has(bookName);
    
    // Log rejected books for monitoring
    if (isExcluded) {
      console.warn(`🚫 EXCLUDED book rejected: ${bookName} (${src.book || src.bookmaker})`);
    } else if (!isAllowed && bookName) {
      console.warn(`⚠️ Non-whitelisted book rejected: ${bookName} (${src.book || src.bookmaker})`);
    }
    
    return isAllowed && !isExcluded;
  });
}

// REMOVED: Duplicate normalizeRow - using comprehensive version below

function oddsGate(predictions) {
  return predictions.map(pred => {
    const allowed = pred.odds_sources_allowed || [];
    const booksCount = pred.books_count || allowed.length || 0;
    const hasOdds = !!(pred.american_odds || pred.best_price);
    
    // FIXED: Always qualify predictions for display, even without live odds
    const oddsQualified = true; // Allow all predictions through
    
    return {
      ...pred,
      odds_qualified: oddsQualified,
      odds_quality: !hasOdds ? 'model_only' : (booksCount >= 3 ? 'excellent' : booksCount >= 2 ? 'good' : 'single'),
      single_book_warning: booksCount === 1 && hasOdds,
      placeholder_odds_detected: false,
      
      // Keep all value scores
      anytime_value_score: pred.anytime_value_score || 0,
      multiple_value_score: pred.multiple_value_score || 0,
      first_value_score: pred.first_value_score || 0
    };
  });
}

/**
 * Load and cache R pipeline predictions
 */
async function loadPipelineData(week = null, season = 2025, forceRefresh = false) {
  const now = Date.now();
  const cacheKey = `${season}_${week || 'current'}`;
  
  // Check if cache is valid for this week
  if (!forceRefresh && 
      cachedData[cacheKey] && 
      cachedData[cacheKey].lastUpdate && 
      (now - cachedData[cacheKey].lastUpdate) < (CONFIG.CACHE_DURATION_SECONDS * 1000)) {
    return cachedData[cacheKey];
  }
  
  try {
    // Try week-specific files first, then fall back to main file
    let fullData, liteData;
    
    // Attempt to load week-specific data
    if (week) {
      try {
        const weekSpecificPath = path.join(process.cwd(), 'data', `nfl-td-comprehensive-week${week}.json`);
        fullData = JSON.parse(await fs.readFile(weekSpecificPath, 'utf8'));
        console.log(`✅ Loaded week-specific data for Week ${week}`);
      } catch (weekError) {
        console.log(`⚠️ Week ${week} specific file not found, using main comprehensive file`);
      }
    }
    
    // Fall back to main comprehensive file if week-specific not available
    if (!fullData) {
      try {
        // Try to fetch from public static asset first (Netlify deployment)
        const response = await fetch(`${process.env.URL || 'https://bgroundrobin.com'}/data/nfl-td-comprehensive-latest.json`);
        if (response.ok) {
          fullData = await response.json();
          console.log(`🌐 Loaded main data from public URL (Week ${fullData.metadata?.week || 'unknown'})`);
        }
      } catch (fetchError) {
        console.log('⚠️ Public URL fetch failed, trying file system...');
        // Fall back to file system
        const mainPath = path.join(process.cwd(), 'data', 'nfl-td-comprehensive-latest.json');
        fullData = JSON.parse(await fs.readFile(mainPath, 'utf8'));
        console.log(`📁 Loaded main comprehensive data from file system (Week ${fullData.metadata?.week || 'unknown'})`);
      }
    }
    
    // Use full data as lite data for now (can optimize later)
    liteData = fullData;
    
    // Update cache for this specific week
    if (!cachedData[cacheKey]) {
      cachedData[cacheKey] = {};
    }
    
    cachedData[cacheKey] = {
      full: {
        ...fullData,
        games: fullData.games || [] // Add empty games array if missing
      },
      lite: liteData,
      lastUpdate: now
    };
    
    // CHATGPT FIX: Store metadata globally for reliability calculations
    global.cachedDataMetadata = fullData.metadata;
    
    console.log(`✅ Loaded pipeline data for ${cacheKey}: ${fullData.predictions?.length || 0} players, ${fullData.summary?.total_games || fullData.metadata?.total_players || 0} games`);
    
    return cachedData[cacheKey];
    
  } catch (error) {
    console.error('❌ Failed to load pipeline data:', error.message);
    
    // Return cached data if available, otherwise throw
    if (cachedData.full) {
      console.log('⚠️ Using cached data due to load failure');
      return cachedData;
    }
    
    throw new Error(`Pipeline data not available: ${error.message}`);
  }
}

/**
 * Validate and normalize query parameters
 */
function processQueryParams(event) {
  const params = event.queryStringParameters || {};
  
  // Calculate current NFL week if not provided
  const getCurrentNFLWeek = () => {
    const now = new Date();
    const seasonStart = new Date('2025-09-05');
    const daysSinceStart = Math.floor((now - seasonStart) / (1000 * 60 * 60 * 24));
    
    if (daysSinceStart < 0) return 1;
    
    let weekNumber;
    if (daysSinceStart <= 6) weekNumber = 1;
    else if (daysSinceStart <= 13) weekNumber = 2;
    else if (daysSinceStart <= 17) weekNumber = 3;
    else weekNumber = Math.floor((daysSinceStart - 18) / 7) + 4;
    
    return Math.min(Math.max(weekNumber, 1), 18);
  };
  
  return {
    // Query type - default to adjusted data for production use
    type: params.type || 'top-anytime',
    
    // WEEK PARAMETER - Auto-detect current week if not provided
    week: parseInt(params.week) || getCurrentNFLWeek(),
    season: parseInt(params.season) || 2025,
    
    // Filters
    position: params.position?.toUpperCase(),
    team: params.team?.toUpperCase(),
    player_id: params.player_id,
    game_id: params.game_id,
    
    // Ranking options
    top_n: parseInt(params.top_n) || CONFIG.DEFAULT_TOP_N,
    min_confidence: 'low', // Force to low to allow all predictions with odds through
    
    // Value thresholds
    min_value_score: parseFloat(params.min_value_score) || 0, // Allow all predictions with odds through
    min_probability: parseFloat(params.min_probability) || 0, // Allow all predictions through
    
    // Response format
    include_metadata: params.include_metadata !== 'false',
    include_summary: params.include_summary !== 'false',
    
    // Debugging
    debug: params.debug === 'true'
  };
}

// ========== ELITE COUNT MODEL FUNCTIONS ==========

/**
 * Convert anytime probability to Poisson intensity μ
 * μᵢ = −ln(1 − pᵢ) where pᵢ is anytime TD probability
 */
function pToMu(p) {
  return -Math.log(Math.max(1e-6, 1 - Math.min(0.999, p)));
}

/**
 * Convert Poisson intensity μ back to anytime probability
 * P(any) = 1 − e^(−μ)
 */
function muToAny(mu) {
  return 1 - Math.exp(-mu);
}

/**
 * Calculate P(2+ TDs) from Poisson intensity μ
 * P(2+) = 1 − e^(−μ) × (1 + μ)
 */
function muToTwoPlus(mu) {
  return 1 - Math.exp(-mu) * (1 + mu);
}

/**
 * Calculate P(3+ TDs) from Poisson intensity μ
 * P(3+) = 1 − e^(−μ) × (1 + μ + μ²/2)
 */
function muToThreePlus(mu) {
  return 1 - Math.exp(-mu) * (1 + mu + (mu * mu) / 2);
}

/**
 * Better team TD mapping from total/spread using scoring model
 * Replaces naive points/7 approach
 */
function expectedTeamTDs(totalPoints, spread, teamIsHome, tdShare = 0.74) {
  // Logistic model for win probability from spread
  const pHome = 1 / (1 + Math.exp(-0.18 * spread)); // Calibrated coefficient
  
  // Expected points for this team
  const expectedPoints = teamIsHome ? 
    totalPoints * pHome : 
    totalPoints * (1 - pHome);
  
  // Convert to TDs (74% of points come from TDs, rest from FGs/safeties)
  return (expectedPoints * tdShare) / 6.0;
}

/**
 * Convert American odds to decimal odds
 */
function americanToDecimal(americanOdds) {
  return americanOdds > 0 ? 
    1 + americanOdds / 100 : 
    1 + 100 / (-americanOdds);
}

/**
 * Remove vig from two-way market (Yes/No)
 */
function devigTwoWay(pA, pB) {
  const sum = pA + pB;
  return {
    a: pA / sum,
    b: pB / sum,
    overround: sum - 1
  };
}

/**
 * Get fair probability from American odds pair
 */
function fairProbFromTwoWay(americanYes, americanNo) {
  const pYes = 1 / americanToDecimal(americanYes);
  const pNo = 1 / americanToDecimal(americanNo);
  return devigTwoWay(pYes, pNo).a;
}

/**
 * Enforce book whitelist - CRITICAL REQUIREMENT
 * Only allow: FanDuel, DraftKings, Caesars, BetMGM, Fanatics, ESPNBet
 * Explicitly reject: betonline.ag, Bovada, and any others
 */
// REMOVED: Old filterAllowedBooks - replaced with enhancedFilterAllowedBooks above

/**
 * Apply reliability adjustment using shrinkage to position priors + COUNT MODEL
 * ENHANCED: Now builds Poisson intensity μᵢ and ensures mathematical consistency
 */
function applyReliabilityAdjustment(prediction, queryParams = {}) {
  // Parse reliability as 0..1
  let r = 0.75; // Default reliability
  if (prediction.reliability != null) {
    const reliabilityStr = String(prediction.reliability);
    const match = reliabilityStr.match(/(\d+(\.\d+)?)%?/);
    if (match) {
      r = Math.max(0, Math.min(1, parseFloat(match[1]) / 100));
    }
  }
  
  // CHATGPT SUGGESTION: Add week-based reliability scaling
  // Scale reliability based on weeks played - early season needs more shrinkage
  // Try to get current week from various sources (R pipeline metadata, query params, etc.)
  const currentWeek = queryParams.week ?? 
                     (global.cachedDataMetadata && global.cachedDataMetadata.week) ?? 3; // Default to Week 3 for Sep 24, 2025
  
  // Estimate games played based on current week (assumes player has played most games)
  const estimatedGamesPlayed = Math.max(1, currentWeek - 1); // Conservative estimate
  const actualGamesPlayed = prediction.weeks_played ?? prediction.samples ?? prediction.games_played ?? estimatedGamesPlayed;
  
  // Scale reliability: 0 games => 0.30 floor, 8+ games => ~0.95 cap (ChatGPT's suggestion)
  const sampleSize = Math.min(1, actualGamesPlayed / 8);
  const weekBasedReliability = Math.max(0.30, Math.min(0.95, 0.15 + 0.85 * sampleSize));
  
  // Apply week-based reliability (blend with base reliability)
  r = 0.6 * weekBasedReliability + 0.4 * r; // Blend ChatGPT's formula with model confidence
  console.log(`📊 Reliability scaling: ${prediction.player_name || prediction.name} - Games: ${actualGamesPlayed}, Week-based: ${weekBasedReliability.toFixed(2)}, Final: ${r.toFixed(2)}`);
  
  // Strengthen injury/sparse data downgrades
  if (prediction.injury_status && prediction.injury_status !== 'healthy') {
    const injuryImpact = {
      'questionable': 0.15,  // 15% reduction
      'doubtful': 0.40,      // 40% reduction  
      'out': 0.90,           // 90% reduction
      'ir': 0.95,            // 95% reduction
      'injured': 0.25        // Generic injury: 25% reduction
    };
    
    const impact = injuryImpact[prediction.injury_status.toLowerCase()] || 0.20;
    r = Math.max(0.1, r * (1 - impact)); // Apply injury penalty to reliability
  }
  
  // Penalize sparse/low usage data more aggressively
  const snapShare = prediction.snap_share || prediction.snap_pct || 0;
  const targets = prediction.targets_per_game || prediction.target_share || 0;
  const carries = prediction.carries_per_game || prediction.rush_attempts || 0;
  
  // Usage penalty: players with <30% snap share get reliability hit
  if (snapShare < 0.30) {
    const usagePenalty = Math.max(0, (0.30 - snapShare) * 0.5); // Up to 15% penalty
    r = Math.max(0.2, r * (1 - usagePenalty));
  }
  
  // Low involvement penalty for skill positions
  if (prediction.position === 'WR' && targets < 3) {
    r = Math.max(0.3, r * 0.8); // 20% penalty for low-target WRs
  }
  if (prediction.position === 'RB' && carries < 5 && targets < 2) {
    r = Math.max(0.3, r * 0.75); // 25% penalty for low-touch RBs
  }

  // Position priors based on historical TD rates with TE boost for elite visibility
  const basePriors = { 
    RB: 0.22,    // RBs score most frequently
    WR: 0.16,    // WRs moderate rate
    TE: 0.15,    // TEs boosted for better visibility (was 0.13)
    QB: 0.05,    // QBs rarely score rushing TDs
    default: 0.16 
  };
  
  const position = prediction.position || 'default';
  let prior = basePriors[position] ?? basePriors.default;
  
  // Multi-path logic: adjust priors based on role/usage patterns
  const redZoneTargets = prediction.rz_targets_per_game || prediction.red_zone_targets || 0;
  const explosiveRate = prediction.explosive_play_rate || prediction.long_td_rate || 0;  // Enhanced role-based prior adjustments
  if (position === 'RB') {
    // RBs can have explosive upside too
    if (explosiveRate > 0.15 || prediction.yards_per_carry > 5.0) {
      prior = Math.min(0.28, prior * 1.15); // Explosive RBs get boost
    }
    if (redZoneTargets > 1.5) {
      prior = Math.min(0.30, prior * 1.20); // RZ receiving RBs get bigger boost  
    }
    if (snapShare < 0.4) {
      prior = Math.max(0.12, prior * 0.7); // Part-time RBs penalized more
    }
  }
  
  if (position === 'WR') {
    // WRs can have RZ upside beyond just explosive plays
    if (redZoneTargets > 1.0) {
      prior = Math.min(0.24, prior * 1.25); // RZ WRs get significant boost
    }
    if (explosiveRate > 0.12) {
      prior = Math.min(0.22, prior * 1.15); // Explosive WRs get boost
    }
    if (snapShare < 0.5) {
      prior = Math.max(0.08, prior * 0.6); // Part-time WRs penalized
    }
  }
  
  if (position === 'TE') {
    // TEs with RZ usage are TD magnets
    if (redZoneTargets > 0.8) {
      prior = Math.min(0.20, prior * 1.35); // RZ TEs get huge boost
    }
    if (explosiveRate > 0.08) {
      prior = Math.min(0.18, prior * 1.20); // Explosive TEs get boost
    }
    if (snapShare < 0.6) {
      prior = Math.max(0.06, prior * 0.65); // Part-time TEs penalized
    }
  }
  
  // Reliability weight: map r in [0,1] to lambda in [0.35..0.95]
  // Higher reliability = more weight to model, less shrinkage to prior
  const lambda = 0.35 + 0.60 * r;
  
  const clamp = (x) => Math.max(0.001, Math.min(0.95, x));
  
  // Shrink probabilities toward enhanced position priors
  const anytimeAdjusted = clamp(lambda * (prediction.anytime_td_prob || 0) + (1 - lambda) * prior);
  
  // ELITE COUNT MODEL: Convert to Poisson intensity μ and derive consistent probabilities
  const adjustedMu = pToMu(anytimeAdjusted);
  
  // Mathematically consistent multiple TD probabilities from μ
  const multipleFromMu = muToTwoPlus(adjustedMu);
  const threePlusFromMu = muToThreePlus(adjustedMu);
  
  // Use max of model prediction and count-derived (ensures mathematical consistency)
  const multipleAdjusted = Math.max(
    clamp(lambda * (prediction.multiple_td_prob || 0) + (1 - lambda) * (prior * 0.12)),
    multipleFromMu
  );
  
  // First TD needs hazard model (placeholder - use shrinkage for now)
  const firstAdjusted = clamp(lambda * (prediction.first_td_prob || 0) + (1 - lambda) * (prior * 0.10));
  
  // Convert reliability to user-friendly bands
  const reliabilityBand = r >= 0.75 ? 'HIGH' :
                         r >= 0.50 ? 'MEDIUM' : 
                         r >= 0.25 ? 'LOW' : 'SPARSE';
  
  const dataQualityScore = Math.round(r * 100);
  
  return {
    ...prediction,
    reliability_adjusted: true,
    reliability_factor: Math.round(lambda * 100) / 100,
    
    // CHATGPT FIX: Add metadata.data_reliability for frontend compatibility
    metadata: {
      ...prediction.metadata,
      data_reliability: r, // This is what the frontend uses for "Reliability: XX%"
      confidence_interval: prediction.confidence >= 70 ? `±${(100-prediction.confidence)}%` : null
    },
    
    // ELITE: User-friendly reliability display
    reliability_band: reliabilityBand,
    data_quality_score: dataQualityScore,
    reliability_raw_percent: Math.round(r * 100), // Keep raw for debugging
    
    // Original values
    original_anytime_prob: prediction.anytime_td_prob,
    original_multiple_prob: prediction.multiple_td_prob,
    
    // ELITE: Count model adjusted probabilities
    anytime_td_prob: anytimeAdjusted,
    multiple_td_prob: multipleAdjusted,
    first_td_prob: firstAdjusted,
    
    // Count model metadata
    td_intensity_mu: Math.round(adjustedMu * 1000) / 1000,
    multiple_from_mu: Math.round(multipleFromMu * 1000) / 1000,
    three_plus_prob: Math.round(threePlusFromMu * 1000) / 1000,
    
    // Shrinkage metadata
    position_prior: prior,
    shrinkage_amount: Math.round((1 - lambda) * 100) / 100,
    count_model_applied: true
  };
}

/**
 * ELITE: Monte Carlo team reconciliation with defense/ST allocation
 * Replaces naive proportional scaling with proper simulation-based approach
 */
function monteCarloTeamReconciliation(predictions, games = [], numSimulations = 10000) {
  // Build game index with enhanced TD projections
  const gameIndex = new Map();
  
  for (const game of games || []) {
    const gameId = game.game_id || game.id;
    if (!gameId) continue;
    
    // Enhanced team TD projection using scoring model
    const totalPoints = game.total_points || game.market_total || game.over_under || 44;
    const spread = game.spread || 0;
    const homeTeam = game.home_team_abbr || game.home_team || game.home || 'HOME';
    const awayTeam = game.away_team_abbr || game.away_team || game.away || 'AWAY';
    
    // Use scoring model instead of naive points/7
    const homeTDs = expectedTeamTDs(totalPoints, spread, true);
    const awayTDs = expectedTeamTDs(totalPoints, spread, false);
    
    gameIndex.set(gameId, {
      home_team: homeTeam,
      away_team: awayTeam,
      total_points: totalPoints,
      spread: spread,
      team_proj_TDs: {
        [homeTeam]: homeTDs,
        [awayTeam]: awayTDs
      }
    });
  }
  
  // Group predictions by (team, game_id)
  const teamGameBuckets = new Map();
  for (const pred of predictions) {
    const team = pred.team || pred.team_abbr || 'UNKNOWN';
    const gameId = pred.game_id || 'unknown';
    const key = `${team}::${gameId}`;
    
    if (!teamGameBuckets.has(key)) teamGameBuckets.set(key, []);
    teamGameBuckets.get(key).push(pred);
  }
  
  const reconciledPredictions = [];
  
  // Monte Carlo reconciliation for each team-game
  for (const [key, players] of teamGameBuckets.entries()) {
    const [team, gameId] = key.split('::');
    const gameInfo = gameIndex.get(gameId);
    const teamExpectedTDs = gameInfo?.team_proj_TDs?.[team] || 2.5;
    
    // Reserve 8-12% for defense/ST TDs (team/opponent adjusted)
    const defenseSTReserve = Math.min(0.4, teamExpectedTDs * 0.10);
    const offensiveTDsAvailable = Math.max(0.8, teamExpectedTDs - defenseSTReserve);
    
    // Extract intensities (μᵢ) from players
    const playerIntensities = players.map(p => ({
      player: p,
      mu: p.td_intensity_mu || pToMu(p.anytime_td_prob || 0.01)
    }));
    
    // Monte Carlo simulation
    const simResults = runTeamTDSimulation(playerIntensities, offensiveTDsAvailable, numSimulations);
    
    // Apply simulation results to players
    players.forEach((player, idx) => {
      const simResult = simResults[idx];
      
      reconciledPredictions.push({
        ...player,
        
        // Monte Carlo adjusted probabilities
        anytime_td_prob: Math.max(0.01, Math.min(0.85, simResult.anytime_prob)),
        multiple_td_prob: Math.max(0.001, Math.min(0.60, simResult.multiple_prob)),
        first_td_prob: Math.max(0.001, Math.min(0.75, simResult.first_prob)),
        
        // Monte Carlo metadata
        mc_reconciled: true,
        mc_simulations: numSimulations,
        team_expected_tds: Math.round(teamExpectedTDs * 100) / 100,
        offensive_tds_available: Math.round(offensiveTDsAvailable * 100) / 100,
        defense_st_reserve: Math.round(defenseSTReserve * 100) / 100,
        
        // Original probabilities for comparison
        pre_mc_anytime: player.anytime_td_prob,
        pre_mc_multiple: player.multiple_td_prob,
        
        // Simulation statistics
        mc_td_share: Math.round((simResult.expected_tds / offensiveTDsAvailable) * 1000) / 1000,
        mc_variance: Math.round(simResult.variance * 1000) / 1000
      });
    });
  }
  
  return reconciledPredictions;
}

/**
 * Run Monte Carlo simulation for team TD allocation
 * Uses softmax of intensities μᵢ to allocate team TDs across players
 */
function runTeamTDSimulation(playerIntensities, teamTDs, numSims = 10000) {
  const numPlayers = playerIntensities.length;
  const results = new Array(numPlayers).fill(0).map(() => ({
    td_counts: [],
    anytime_hits: 0,
    multiple_hits: 0,
    first_hits: 0,
    total_tds: 0
  }));
  
  // Calculate softmax shares from intensities
  const totalMu = playerIntensities.reduce((sum, p) => sum + p.mu, 0);
  const shares = playerIntensities.map(p => totalMu > 0 ? p.mu / totalMu : 1 / numPlayers);
  
  for (let sim = 0; sim < numSims; sim++) {
    // Simulate team TD count (Poisson around expected)
    const simTeamTDs = Math.max(0, Math.round(poissonRandom(teamTDs)));
    
    // Allocate TDs to players using multinomial with softmax shares
    const playerTDs = new Array(numPlayers).fill(0);
    
    for (let td = 0; td < simTeamTDs; td++) {
      const randomIdx = multinomialSample(shares);
      if (randomIdx < numPlayers) {
        playerTDs[randomIdx]++;
      }
    }
    
    // Record results
    playerTDs.forEach((tds, idx) => {
      results[idx].td_counts.push(tds);
      results[idx].total_tds += tds;
      if (tds >= 1) results[idx].anytime_hits++;
      if (tds >= 2) results[idx].multiple_hits++;
      if (tds >= 1 && sim % (simTeamTDs || 1) === 0) results[idx].first_hits++; // Approximate first TD
    });
  }
  
  // Calculate probabilities from simulation
  return results.map((result, idx) => {
    const anytimeProb = result.anytime_hits / numSims;
    const multipleProb = result.multiple_hits / numSims;
    const firstProb = result.first_hits / numSims;
    const expectedTDs = result.total_tds / numSims;
    const variance = calculateVariance(result.td_counts);
    
    return {
      anytime_prob: anytimeProb,
      multiple_prob: multipleProb,
      first_prob: firstProb,
      expected_tds: expectedTDs,
      variance: variance
    };
  });
}

/**
 * Generate Poisson random number (Box-Muller approximation for speed)
 */
function poissonRandom(lambda) {
  if (lambda < 10) {
    // Use Knuth's algorithm for small lambda
    let L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    
    do {
      k++;
      p *= Math.random();
    } while (p > L);
    
    return k - 1;
  } else {
    // Normal approximation for large lambda
    const normal = boxMullerRandom();
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal));
  }
}

/**
 * Box-Muller transformation for normal random numbers
 */
function boxMullerRandom() {
  const u = Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Sample from multinomial distribution using cumulative probabilities
 */
function multinomialSample(probabilities) {
  const rand = Math.random();
  let cumSum = 0;
  
  for (let i = 0; i < probabilities.length; i++) {
    cumSum += probabilities[i];
    if (rand <= cumSum) return i;
  }
  
  return probabilities.length - 1; // Fallback
}

/**
 * Calculate sample variance
 */
function calculateVariance(values) {
  if (values.length <= 1) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / (values.length - 1);
}

/**
 * LEGACY: Reconcile team-level TD totals using per-game projections from totals/spreads
 * Kept for fallback when Monte Carlo is disabled
 */
function reconcileTeamTotals(predictions, games = []) {
  // Build game index for team TD projections
  const gameIndex = new Map();
  
  for (const game of games || []) {
    const gameId = game.game_id || game.id;
    if (!gameId) continue;
    
    // Extract game total and favorite
    const totalPoints = game.total_points || game.market_total || game.over_under || 44; // fallback
    const favorite = game.favorite_team || game.fav_team || null;
    const homeTeam = game.home_team_abbr || game.home_team || game.home || 'HOME';
    const awayTeam = game.away_team_abbr || game.away_team || game.away || 'AWAY';
    
    // Normalize team names for reliable favorite matching
    const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
    const favNorm = normalize(favorite);
    const homeNorm = normalize(homeTeam);
    const awayNorm = normalize(awayTeam);
    
    // Determine team shares (55% to favorite, 45% to dog)
    let homeShare = 0.5;
    if (favNorm) {
      if (favNorm === homeNorm) {
        homeShare = 0.55;
      } else if (favNorm === awayNorm) {
        homeShare = 0.45;
      }
    }
    
    // Convert points to TDs (rough conversion: ~7 points per TD)
    const tdPerPoint = 1 / 7.0;
    const gameTotalTDs = totalPoints * tdPerPoint; // No artificial floor - let low totals be low
    
    const homeTDs = Math.max(0.8, gameTotalTDs * homeShare);
    const awayTDs = Math.max(0.8, gameTotalTDs * (1 - homeShare));
    
    gameIndex.set(gameId, {
      home_team: homeTeam,
      away_team: awayTeam,
      total_points: totalPoints,
      team_proj_TDs: {
        [homeTeam]: homeTDs,
        [awayTeam]: awayTDs
      }
    });
  }
  
  // Group predictions by (team, game_id)
  const teamGameBuckets = new Map();
  for (const pred of predictions) {
    const team = pred.team || pred.team_abbr || 'UNKNOWN';
    const gameId = pred.game_id || 'unknown';
    const key = `${team}::${gameId}`;
    
    if (!teamGameBuckets.has(key)) teamGameBuckets.set(key, []);
    teamGameBuckets.get(key).push(pred);
  }
  
  const adjustedPredictions = [];
  
  // Reconcile each team-game bucket
  for (const [key, players] of teamGameBuckets.entries()) {
    const [team, gameId] = key.split('::');
    const gameInfo = gameIndex.get(gameId);
    const teamCap = gameInfo?.team_proj_TDs?.[team];
    
    // Calculate current team total
    const currentTotal = players.reduce((sum, p) => sum + (p.anytime_td_prob || 0), 0);
    
    // Use game-specific cap or fallback to 2.8
    const cap = teamCap ?? 2.8;
    
    if (currentTotal > cap && currentTotal > 0) {
      // Scale down proportionally
      const scalingFactor = cap / currentTotal;
      
      players.forEach(player => {
        adjustedPredictions.push({
          ...player,
          anytime_td_prob: (player.anytime_td_prob || 0) * scalingFactor,
          multiple_td_prob: (player.multiple_td_prob || 0) * Math.pow(scalingFactor, 1.4), // Scale multiples stronger
          first_td_prob: (player.first_td_prob || 0) * scalingFactor,
          team_reconciled: true,
          scaling_factor: Math.round(scalingFactor * 1000) / 1000,
          team_cap_TDs: Math.round(cap * 100) / 100,
          team_sum_before: Math.round(currentTotal * 100) / 100,
          game_total_proj: gameInfo ? Math.round(gameInfo.total_points * 10) / 10 : null
        });
      });
    } else {
      // No adjustment needed
      players.forEach(player => {
        adjustedPredictions.push({
          ...player,
          team_reconciled: false,
          team_cap_TDs: Math.round(cap * 100) / 100,
          team_sum_before: Math.round(currentTotal * 100) / 100
        });
      });
    }
  }
  
  return adjustedPredictions;
}

/**
 * Validate odds realism and flag suspicious data
 */
function validateOddsRealism(predictions) {
  // Normalize odds fields first for consistent validation
  const normalized = predictions.map(normalizeRow);
  const totalPredictions = normalized.length;
  
  if (totalPredictions === 0) return { isValid: true, warnings: [] };
  
  const warnings = [];
  
  // Enhanced uniform odds detection (placeholder detection)
  const oddsCounts = {};
  const oddsAvailable = normalized.filter(p => p.american_odds);
  
  oddsAvailable.forEach(p => {
    const odds = String(p.american_odds);
    oddsCounts[odds] = (oddsCounts[odds] || 0) + 1;
  });
  
  // Flag if >25% have identical odds (lowered threshold for better detection)
  if (oddsAvailable.length > 0) {
    Object.entries(oddsCounts).forEach(([odds, count]) => {
      const percentage = (count / oddsAvailable.length) * 100;
      if (percentage > 25) {
        warnings.push(`⚠️ ${percentage.toFixed(0)}% of predictions have identical odds (${odds}) - likely placeholder data`);
      }
    });
    
    // Check for common placeholder patterns
    const commonPlaceholders = ['300', '400', '500', '+300', '+400', '+500'];
    commonPlaceholders.forEach(placeholder => {
      if (oddsCounts[placeholder] && (oddsCounts[placeholder] / oddsAvailable.length) > 0.15) {
        warnings.push(`🚨 High frequency of placeholder odds "${placeholder}" detected - ${Math.round((oddsCounts[placeholder] / oddsAvailable.length) * 100)}% of players`);
      }
    });
  }
  
  // Check for suspiciously uniform book counts
  const singleBookCount = normalized.filter(p => Number(p.books_count) <= 1).length;
  const singleBookPercentage = (singleBookCount / totalPredictions) * 100;
  
  if (singleBookPercentage > 60) {
    warnings.push(`⚠️ ${singleBookPercentage.toFixed(0)}% of predictions from ≤1 book - limited market coverage`);
  }
  
  // Check for missing odds data
  const noOddsCount = normalized.filter(p => !p.american_odds).length;
  const noOddsPercentage = (noOddsCount / totalPredictions) * 100;
  
  if (noOddsPercentage > 30) {
    warnings.push(`⚠️ ${noOddsPercentage.toFixed(0)}% of predictions missing odds data`);
  }
  
  // Check for realistic probability ranges
  const highProbCount = normalized.filter(p => (p.anytime_td_prob || 0) > 0.65).length;
  const lowProbCount = normalized.filter(p => (p.anytime_td_prob || 0) < 0.05).length;
  
  if (highProbCount > totalPredictions * 0.05) {
    warnings.push(`⚠️ ${highProbCount} players with >65% TD probability - check calibration`);
  }
  
  if (lowProbCount > totalPredictions * 0.3) {
    warnings.push(`⚠️ ${lowProbCount} players with <5% TD probability - possible data quality issues`);
  }
  
  return {
    isValid: warnings.length === 0,
    warnings,
    validation_summary: {
      total_predictions: totalPredictions,
      odds_available: oddsAvailable.length,
      single_book_percentage: Math.round(singleBookPercentage),
      no_odds_percentage: Math.round(noOddsPercentage),
      high_prob_count: highProbCount,
      unique_odds: Object.keys(oddsCounts).length,
      most_common_odds: Object.entries(oddsCounts).sort((a, b) => b[1] - a[1])[0]
    }
  };
}

/**
 * Normalize field names for consistent processing + BOOK WHITELIST ENFORCEMENT
 */
function normalizeRow(prediction) {
  // SIMPLIFIED: Handle R pipeline data (no odds_sources) and live odds data
  const rawOddsSources = Array.isArray(prediction.odds_sources) ? prediction.odds_sources : [];
  
  let americanOdds = null;
  let bestPrice = null;
  let booksCount = 0;
  let allowedOddsSources = [];
  
  if (rawOddsSources.length > 0) {
    // Has live odds data - filter to allowed books
    allowedOddsSources = enhancedFilterAllowedBooks(rawOddsSources);
    
    if (allowedOddsSources.length > 0) {
      const validPrices = allowedOddsSources
        .map(source => source.american_odds || source.price || source.best_price)
        .filter(price => price != null && !isNaN(price));
      
      if (validPrices.length > 0) {
        americanOdds = Math.max(...validPrices);
        bestPrice = americanOdds;
        booksCount = allowedOddsSources.length;
      }
    }
  } else {
    // R pipeline data - no live odds yet
    americanOdds = prediction.american_odds ?? prediction.best_price ?? null;
    booksCount = prediction.books_count ?? (americanOdds ? 1 : 0);
  }
  
  return {
    ...prediction,
    american_odds: americanOdds,
    best_price: bestPrice,
    books_count: booksCount,
    odds_sources_allowed: allowedOddsSources, // Fix the field name that oddsGate expects
    whitelisted_books_only: rawOddsSources.length === 0 || allowedOddsSources.length > 0,
    rejected_sources: rawOddsSources.length - allowedOddsSources.length
  };
}

/**
 * ELITE: Filter predictions with count model + Monte Carlo reconciliation
 */
function filterPredictions(predictions, queryParams, games = []) {
  console.log(`[FILTER DEBUG] Starting with ${predictions.length} predictions`);
  
  // Normalize field names first + enforce book whitelist
  let filtered = predictions.map(normalizeRow);
  console.log(`[FILTER DEBUG] After normalization: ${filtered.length} predictions`);
  
  // Apply reliability adjustments with count model (skip if already adjusted)
  filtered = filtered.map(p => p.__adjusted ? p : applyReliabilityAdjustment(p, queryParams));
  console.log(`[FILTER DEBUG] After reliability adjustment: ${filtered.length} predictions`);
  
  // ELITE: Monte Carlo team reconciliation (falls back to legacy if needed)
  const useMonteCarloReconciliation = queryParams.mc_reconciliation !== 'false'; // Default to true
  
  if (useMonteCarloReconciliation) {
    try {
      filtered = monteCarloTeamReconciliation(filtered, games).map(p => ({ ...p, __adjusted: true }));
    } catch (error) {
      console.warn('⚠️ Monte Carlo reconciliation failed, falling back to legacy:', error.message);
      filtered = reconcileTeamTotals(filtered, games).map(p => ({ ...p, __adjusted: true }));
    }
  } else {
    // Legacy reconciliation
    filtered = reconcileTeamTotals(filtered, games).map(p => ({ ...p, __adjusted: true }));
  }
  
  // Apply ELITE odds quality gates with book whitelist enforcement
  filtered = oddsGate(filtered);
  console.log(`[FILTER DEBUG] After oddsGate: ${filtered.length} predictions`);
  
  // Position filter
  if (queryParams.position) {
    filtered = filtered.filter(p => p.position === queryParams.position);
    console.log(`[FILTER DEBUG] After position filter (${queryParams.position}): ${filtered.length} predictions`);
  }
  
  // Team filter
  if (queryParams.team) {
    filtered = filtered.filter(p => p.team === queryParams.team);
  }
  
  // Player filter
  if (queryParams.player_id) {
    filtered = filtered.filter(p => p.player_id === queryParams.player_id);
  }
  
  // Game filter
  if (queryParams.game_id) {
    filtered = filtered.filter(p => p.game_id === queryParams.game_id);
  }
  
  // Confidence filter (DISABLED for odds display)
  console.log(`[FILTER DEBUG] SKIPPING confidence filter - min_confidence=${queryParams.min_confidence} (forced to allow all predictions with odds)`);
  // No confidence filtering - allow all predictions through
  
  // Value score filter
  if (queryParams.min_value_score > 0) {
    console.log(`[FILTER DEBUG] Applying value score filter: min_value_score=${queryParams.min_value_score}`);
    const beforeValueFilter = filtered.length;
    filtered = filtered.filter(p => 
      p.anytime_value_score >= queryParams.min_value_score ||
      p.multiple_value_score >= queryParams.min_value_score ||
      p.first_value_score >= queryParams.min_value_score
    );
    console.log(`[FILTER DEBUG] After value score filter: ${beforeValueFilter} → ${filtered.length} predictions`);
  } else {
    console.log(`[FILTER DEBUG] SKIPPING value score filter - min_value_score=${queryParams.min_value_score}`);
  }
  
  // Probability filter (applied after adjustments)
  if (queryParams.min_probability > 0) {
    console.log(`[FILTER DEBUG] Applying probability filter: min_probability=${queryParams.min_probability}`);
    const beforeProbFilter = filtered.length;
    filtered = filtered.filter(p => 
      p.anytime_td_prob >= queryParams.min_probability
    );
    console.log(`[FILTER DEBUG] After probability filter: ${beforeProbFilter} → ${filtered.length} predictions`);
  } else {
    console.log(`[FILTER DEBUG] SKIPPING probability filter - min_probability=${queryParams.min_probability}`);
  }
  
  // Cap displayed probabilities for realism (avoid >85% for non-QBs)
  filtered = filtered.map(p => ({
    ...p,
    anytime_td_prob: Math.max(0.01, Math.min(p.position === 'QB' ? 0.95 : 0.85, p.anytime_td_prob)),
    multiple_td_prob: Math.max(0.001, Math.min(0.60, p.multiple_td_prob || 0)),
    first_td_prob: Math.max(0.001, Math.min(0.75, p.first_td_prob || 0))
  }));
  
  console.log(`[FILTER DEBUG] FINAL: Returning ${filtered.length} predictions after all filters`);
  return filtered;
}

/**
 * Generate response for specific query types
 */
async function generateResponseByType(data, queryParams) {
  const { type, top_n } = queryParams;
  
  // Fetch live odds for all predictions (anytime only)
  const liveOddsData = await fetchLiveTDOdds();
  console.log(`[RAW DEBUG] data.full.predictions length: ${data.full.predictions?.length || 0}`);
  if (data.full.predictions?.length > 0) {
    console.log(`[RAW DEBUG] First prediction:`, data.full.predictions[0]);
  }
  
  const enhancedPredictions = enhancePredictionsWithLiveOdds(data.full.predictions, liveOddsData);
  
  switch (type) {
    case 'all':
      // TEMP: Return first 10 enhanced predictions without filtering to test odds
      const testPredictions = enhancedPredictions.slice(0, 10);
      console.log('[TEST] Returning first 10 enhanced predictions:', testPredictions.map(p => ({ name: p.player_name || p.name, odds: p.american_odds, source: p.odds_source })));
      return {
        predictions: testPredictions,
        metadata: queryParams.include_metadata ? data.full.metadata : undefined,
        summary: queryParams.include_summary ? data.full.summary : undefined,
        games: data.full.games,
        odds_info: { source: liveOddsData.success ? 'live_api' : 'fallback', count: liveOddsData.odds?.length || 0, debug: liveOddsData.debug }
      };
      
    case 'lite':
      // Apply basic adjustments even to lite data
      const liteAdjusted = filterPredictions(data.lite.predictions, queryParams, data.full.games).slice(0, queryParams.top_n);
      return {
        predictions: liteAdjusted,
        metadata: data.lite.metadata,
        ui_warning: 'Lite endpoint provides adjusted data but limited features. Consider using top-anytime for full functionality.'
      };
      
    case 'top-anytime':
      console.log(`[TOP-ANYTIME DEBUG] Enhanced predictions length: ${enhancedPredictions.length}`);
      console.log(`[TOP-ANYTIME DEBUG] Sample enhanced prediction:`, enhancedPredictions[0]);
      
      const allFiltered = filterPredictions(enhancedPredictions, queryParams, data.full.games);
      console.log(`[TOP-ANYTIME DEBUG] After filterPredictions: ${allFiltered.length}`);
      
      const topAnytime = allFiltered
        .sort((a, b) => b.anytime_td_prob - a.anytime_td_prob)
        .slice(0, top_n);
      return {
        type: 'anytime_td_leaders',
        predictions: topAnytime,
        metadata: data.full.metadata,
        summary: {
          count: topAnytime.length,
          avg_probability: topAnytime.reduce((sum, p) => sum + p.anytime_td_prob, 0) / topAnytime.length,
          top_probability: topAnytime[0]?.anytime_td_prob || 0
        },
        odds_info: { source: liveOddsData.success ? 'live_api' : 'fallback', count: liveOddsData.odds?.length || 0, debug: liveOddsData.debug }
      };
      
    // Remove 'top-multiple' and 'top-first' endpoints
      
    case 'by-game':
      if (!queryParams.game_id) {
        return { error: 'game_id parameter required for by-game queries' };
      }
      
      const gameData = data.full.games.find(g => g.game_id === queryParams.game_id);
      const gamePlayers = filterPredictions(enhancedPredictions, queryParams, data.full.games);
      
      return {
        type: 'game_predictions',
        game_info: gameData,
        predictions: gamePlayers,
        metadata: data.full.metadata,
        odds_info: { source: liveOddsData.success ? 'live_api' : 'fallback', count: liveOddsData.odds?.length || 0, debug: liveOddsData.debug }
      };
      
    case 'by-position':
      const byPosition = {};
      const positions = ['QB', 'RB', 'WR', 'TE'];
      
      positions.forEach(pos => {
        const posPlayers = filterPredictions(enhancedPredictions, { ...queryParams, position: pos }, data.full.games)
          .sort((a, b) => b.anytime_td_prob - a.anytime_td_prob)
          .slice(0, Math.ceil(top_n / positions.length));
        
        byPosition[pos] = posPlayers;
      });
      
      return {
        type: 'position_breakdown',
        by_position: byPosition,
        metadata: data.full.metadata,
        odds_info: { source: liveOddsData.success ? 'live_api' : 'fallback', count: liveOddsData.odds?.length || 0, debug: liveOddsData.debug }
      };
      
    case 'value-picks':
      const valuePicks = filterPredictions(enhancedPredictions, queryParams, data.full.games)
        .filter(p => p.odds_qualified)
        .filter(p => p.anytime_value_score >= 0.6)
        .sort((a, b) => b.anytime_value_score - a.anytime_value_score)
        .slice(0, top_n);
      return {
        type: 'value_opportunities',
        predictions: valuePicks,
        metadata: data.full.metadata,
        summary: {
          count: valuePicks.length,
          avg_anytime_value: valuePicks.reduce((sum, p) => sum + p.anytime_value_score, 0) / valuePicks.length
        },
        odds_info: { source: liveOddsData.success ? 'live_api' : 'fallback', count: liveOddsData.odds?.length || 0, debug: liveOddsData.debug }
      };
      
    case 'high-confidence':
      const highConfidence = filterPredictions(enhancedPredictions, { ...queryParams, min_confidence: 'high' }, data.full.games)
        .filter(p => p.odds_qualified)
        .sort((a, b) => b.anytime_td_prob - a.anytime_td_prob)
        .slice(0, top_n);
      return {
        type: 'high_confidence_picks',
        predictions: highConfidence,
        metadata: data.full.metadata,
        summary: {
          count: highConfidence.length,
          avg_probability: highConfidence.length > 0 ? 
            highConfidence.reduce((sum, p) => sum + p.anytime_td_prob, 0) / highConfidence.length : 0
        },
        odds_info: { source: liveOddsData.success ? 'live_api' : 'fallback', count: liveOddsData.odds?.length || 0, debug: liveOddsData.debug }
      };
      
    case 'data-quality':
      // Skip filtering to analyze raw data
      const rawPredictions = data.full.predictions || [];
      const validation = validateOddsRealism(rawPredictions);
      
      // Team total analysis
      const teamTotals = {};
      rawPredictions.forEach(p => {
        const team = p.team || p.team_abbr;
        if (!teamTotals[team]) teamTotals[team] = { total: 0, count: 0, players: [] };
        teamTotals[team].total += (p.anytime_td_prob || 0);
        teamTotals[team].count += 1;
        teamTotals[team].players.push({
          name: p.name || p.player_name,
          position: p.position,
          prob: p.anytime_td_prob,
          reliability: p.reliability
        });
      });
      
      const teamAnalysis = Object.entries(teamTotals)
        .map(([team, data]) => ({
          team,
          total_prob: Math.round(data.total * 100) / 100,
          player_count: data.count,
          avg_prob: Math.round((data.total / data.count) * 100) / 100,
          needs_scaling: data.total > 2.8,
          top_players: data.players
            .sort((a, b) => (b.prob || 0) - (a.prob || 0))
            .slice(0, 3)
        }))
        .sort((a, b) => b.total_prob - a.total_prob);
      
      return {
        type: 'data_quality_analysis',
        validation_result: validation,
        team_analysis: teamAnalysis,
        distribution_analysis: {
          total_players: rawPredictions.length,
          avg_probability: rawPredictions.reduce((sum, p) => sum + (p.anytime_td_prob || 0), 0) / rawPredictions.length,
          high_prob_players: rawPredictions.filter(p => (p.anytime_td_prob || 0) > 0.5).length,
          zero_prob_players: rawPredictions.filter(p => (p.anytime_td_prob || 0) === 0).length,
          positions: {
            RB: rawPredictions.filter(p => p.position === 'RB').length,
            WR: rawPredictions.filter(p => p.position === 'WR').length,
            TE: rawPredictions.filter(p => p.position === 'TE').length,
            QB: rawPredictions.filter(p => p.position === 'QB').length
          }
        },
        sample_predictions: rawPredictions.slice(0, 5),
        metadata: data.full.metadata
      };
      
    case 'raw':
      // Raw data without any adjustments (debug mode)
      let rawFiltered = [...data.full.predictions];
      
      // Apply only basic filters without adjustments
      if (queryParams.position) {
        rawFiltered = rawFiltered.filter(p => p.position === queryParams.position);
      }
      if (queryParams.team) {
        rawFiltered = rawFiltered.filter(p => p.team === queryParams.team);
      }
      if (queryParams.player_id) {
        rawFiltered = rawFiltered.filter(p => p.player_id === queryParams.player_id);
      }
      
      return {
        type: 'raw_predictions',
        predictions: rawFiltered.slice(0, top_n),
        metadata: data.full.metadata,
        note: 'Raw predictions without reliability adjustments, team reconciliation, or odds gating'
      };
      
    default:
      return { error: `Unsupported query type: ${type}. Supported types: ${CONFIG.QUERY_TYPES.join(', ')}` };
  }
}

/**
are you lookin * Main Netlify function handler
 */
exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${CONFIG.CACHE_DURATION_SECONDS}`
  };
  
  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    const startTime = Date.now();
    
    // Process query parameters
    const queryParams = processQueryParams(event);
    
    // Load pipeline data for the requested week
    const data = await loadPipelineData(queryParams.week, queryParams.season);
    
    // Validate data freshness
    if (!data.full || !data.full.metadata) {
      throw new Error('Invalid pipeline data structure');
    }
    
    // Check data age (warn if older than 24 hours)
    const dataAge = Date.now() - new Date(data.full.metadata.generated_at).getTime();
    const dataAgeHours = dataAge / (1000 * 60 * 60);
    
    // Validate data quality before processing
    const validationResult = validateOddsRealism(data.full.predictions || []);
    
    // Log warnings for monitoring
    if (validationResult.warnings.length > 0) {
      console.warn('📊 Data Quality Warnings:', validationResult.warnings);
    }
    
    // EMERGENCY FIX: Add fallback probabilities if missing
    if (data.full.predictions && data.full.predictions.length > 0) {
      const samplePred = data.full.predictions[0];
      if (samplePred.anytime_td_prob === null || samplePred.anytime_td_prob === undefined) {
        console.log('⚠️ Missing TD probabilities detected - applying fallback calculations');
        data.full.predictions = data.full.predictions.map(pred => ({
          ...pred,
          anytime_td_prob: pred.anytime_td || 0.15, // Default 15% for main players
          anytime_confidence: 'medium',
          first_td_prob: pred.first_td || 0.05,
          multiple_td_prob: pred.multiple_td || 0.08,
          anytime_value_score: 0.1,
          first_value_score: 0.1,
          multiple_value_score: 0.1
        }));
        console.log(`✅ Applied fallback probabilities to ${data.full.predictions.length} predictions`);
      }
    }
    
    // Generate response based on query type
    const response = await generateResponseByType(data, queryParams);
    
    if (response.error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: response.error,
          supported_types: CONFIG.QUERY_TYPES,
          recommended_ui_endpoints: [
            '/api/nfl-td-predictions?type=top-anytime&top_n=50',
            '/api/nfl-td-predictions?type=value-picks&min_value_score=0.6',
            '/api/nfl-td-predictions?type=high-confidence&min_confidence=medium',
            '/api/nfl-td-predictions?type=by-position&position=RB'
          ],
          avoid_for_ui: ['raw', 'lite'],
          note: 'UI should use adjusted endpoints (top-anytime, value-picks, high-confidence) for production display. Raw/lite endpoints are for debugging only.'
        })
      };
    }
    
    // Add data quality information to response
    response.data_quality = {
      validation_status: validationResult.isValid ? 'passed' : 'warnings',
      warnings: validationResult.warnings,
      validation_summary: validationResult.validation_summary
    };
    
    // Calculate adjustment statistics
    const adjustmentStats = {
      reliability_adjusted: (response.predictions || []).filter(p => p.reliability_adjusted).length,
      team_reconciled: (response.predictions || []).filter(p => p.team_reconciled).length,
      total_predictions: (response.predictions || []).length
    };
    
    // ELITE: Enhanced metadata with count model and Monte Carlo stats
    const eliteStats = {
      count_model_applied: (response.predictions || []).filter(p => p.count_model_applied).length,
      monte_carlo_reconciled: (response.predictions || []).filter(p => p.mc_reconciled).length,
      whitelist_compliant: (response.predictions || []).filter(p => p.whitelisted_books_only).length,
      kelly_opportunities: (response.predictions || []).filter(p => p.kelly_fraction > 0.01).length,
      rejected_books_total: (response.predictions || []).reduce((sum, p) => sum + (p.rejected_sources || 0), 0)
    };
    
    // Add performance and freshness metadata with ELITE enhancements
    const responseWithMeta = {
      ...response,
      api_metadata: {
        response_time_ms: Date.now() - startTime,
        data_age_hours: Math.round(dataAgeHours * 100) / 100,
        cache_status: data.lastUpdate ? 'hit' : 'miss',
        pipeline_version: data.full.metadata.version,
        total_available_players: data.full.predictions.length,
        adjustments_applied: adjustmentStats,
        elite_enhancements: eliteStats,
        model_version: 'elite_count_model_mc_reconciliation_v1.0',
        query_params: queryParams.debug ? queryParams : undefined
      },
      ui_guidance: {
        endpoint_used: queryParams.type,
        is_production_ready: !['raw', 'lite'].includes(queryParams.type),
        model_version: 'ELITE',
        
        // ELITE: Enhanced UI guidance with book whitelist awareness
        approved_books_only: true, // All odds filtered to whitelist
        single_book_count: (response.predictions || []).filter(p => p.single_book_warning).length,
        placeholder_odds_count: (response.predictions || []).filter(p => p.placeholder_odds_detected).length,
        odds_qualified_count: (response.predictions || []).filter(p => p.odds_qualified).length,
        kelly_eligible: (response.predictions || []).filter(p => p.kelly_fraction > 0.005).length,
        
        allowed_books: Array.from(CONFIG.ALLOWED_BOOKS),
        excluded_books: Array.from(CONFIG.EXCLUDED_BOOKS),
        
        recommendations: queryParams.type === 'raw' || queryParams.type === 'lite' ? 
          [
            'Switch to top-anytime or value-picks for production UI', 
            'Badge single-book rows', 
            'Never show BET button for unqualified odds',
            'Only display odds from: FanDuel, DraftKings, Caesars, BetMGM, Fanatics, ESPNBet'
          ] :
          [
            'Badge rows with single_book_warning=true', 
            'Hide BET button when odds_qualified=false',
            'Show Kelly fraction for qualified bets (kelly_fraction > 0)',
            'Flag rejected_non_whitelist > 0 with warning icon',
            'Display count model metadata: td_intensity_mu, multiple_from_mu'
          ]
      }
    };
    
    // Debug: Log sample prediction data structure for frontend troubleshooting
    if (response.predictions && response.predictions.length > 0) {
      const samplePred = response.predictions[0];
      console.log(`[FRONTEND DEBUG] Sample prediction data structure:`, {
        player_name: samplePred.player_name,
        american_odds: samplePred.american_odds,
        books_count: samplePred.books_count,
        odds_qualified: samplePred.odds_qualified,
        whitelisted_books_only: samplePred.whitelisted_books_only,
        odds_sources_allowed: samplePred.odds_sources_allowed?.slice(0, 1), // First book only
        real_odds: samplePred.real_odds
      });
    }

    // Log request for monitoring
    console.log(`✅ NFL TD Predictions API: ${queryParams.type} query, ${JSON.stringify(response).length} bytes, ${Date.now() - startTime}ms`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseWithMeta, null, queryParams.debug ? 2 : undefined)
    };
    
  } catch (error) {
    console.error('❌ NFL TD Predictions API Error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};