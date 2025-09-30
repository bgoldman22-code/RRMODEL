// scripts/build-injuries-snapshot.js
// BACKGROUND WRITER: Sophisticated injury analysis that runs off-request
// Can be triggered by GitHub Actions cron or Netlify Scheduled Functions

import fetch from 'node-fetch';
import { getStore } from '@netlify/blobs';

// Import all the sophisticated injury modeling from our main system
const SYSTEM_VERSION = 'elite_v4.0_background_cached';

const INJURY_CONFIG = {
  POINTS_PER_EPA: 3.75,
  TAU_QB: 3.5,
  TAU_NONQB: 2.5,
  QB_SHRINK: 0.65,
  QB_SOFT_CAP: 8.5,
  STATUS_WEIGHTS: {
    out: 1.0,
    doubtful: 0.20,
    questionable: 0.45,
    probable: 0.8,
    active: 0.0
  },
  POSITION_TO_IMPACT: {
    QB: { spread: 0.85, total: 0.40 },
    WR: { spread: 0.25, total: 0.35 },
    RB: { spread: 0.30, total: 0.25 },
    TE: { spread: 0.20, total: 0.30 },
    OL: { spread: 0.15, total: 0.20 },
    DB: { spread: 0.25, total: 0.30 }, // Fixed: positive weights
    LB: { spread: 0.20, total: 0.25 }, // Fixed: positive weights  
    DL: { spread: 0.18, total: 0.20 }, // Fixed: positive weights
    K:  { spread: 0.05, total: 0.02 },
    DEFAULT: { spread: 0.10, total: 0.10 }
  }
};

const ESPN_TEAM_MAP = {
  ARI:'22', ATL:'1', BAL:'33', BUF:'2', CAR:'29',
  CHI:'3',  CIN:'4', CLE:'5',  DAL:'6', DEN:'7',
  DET:'8',  GB:'9',  HOU:'34', IND:'11', JAX:'30',
  KC:'12',  LV:'13', LAC:'24', LAR:'14', MIA:'15',
  MIN:'16', NE:'17', NO:'18',  NYG:'19', NYJ:'20',
  PHI:'21', PIT:'23', SF:'25', SEA:'26', TB:'27',
  TEN:'10', WAS:'28'
};

const POSITION_CATEGORIES = {
  QB:'QB', RB:'RB', FB:'RB', WR:'WR', TE:'TE',
  C:'OL', LG:'OL', RG:'OL', LT:'OL', RT:'OL', G:'OL', T:'OL',
  DE:'DL', DT:'DL', NT:'DL',
  OLB:'LB', ILB:'LB', MLB:'LB', LB:'LB',
  CB:'DB', S:'DB', FS:'DB', SS:'DB', SAF:'DB',
  K:'K', PK:'K', P:'DEFAULT', LS:'DEFAULT'
};

function getBlobStore() {
  const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-data';
  const token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID;
  return (token && siteID)
    ? getStore({ name: storeName, siteID, token })
    : getStore(storeName);
}

function getDefaultPlayerPriors() {
  return {
    QB: { starter_epa_per_play: 0.12, backup1_epa_per_play: -0.08, backup2_epa_per_play: -0.15, expected_plays_per_game: 65 },
    WR: { wr1_epa_per_play: 0.08, wr2_epa_per_play: 0.04, wr3_epa_per_play: 0.01, expected_plays_per_game: 45 },
    RB: { rb1_epa_per_play: 0.06, rb2_epa_per_play: 0.02, expected_plays_per_game: 25 },
    TE: { te1_epa_per_play: 0.05, te2_epa_per_play: 0.01, expected_plays_per_game: 35 },
    OL: { starter_epa_impact: 0.03, backup_epa_impact: -0.02, expected_plays_per_game: 65 },
    DEF:{ starter_epa_impact: 0.04, backup_epa_impact: -0.01, expected_plays_per_game: 55 }
  };
}

async function loadPlayerPriors() {
  try {
    const store = getBlobStore();
    const text = await store.get('nfl/priors/player_epa_v4.json');
    return text ? JSON.parse(text) : getDefaultPlayerPriors();
  } catch {
    console.log('📊 Using default player priors (fallback)');
    return getDefaultPlayerPriors();
  }
}

async function loadPlayerCache() {
  try {
    const store = getBlobStore();
    const text = await store.get('nfl/injuries/v4/player-cache.json');
    return text ? JSON.parse(text) : {};
  } catch {
    console.log('📊 No player cache found, starting fresh');
    return {};
  }
}

async function savePlayerCache(cache) {
  try {
    const store = getBlobStore();
    await store.set('nfl/injuries/v4/player-cache.json', JSON.stringify(cache, null, 2));
    console.log('💾 Updated player cache');
  } catch (error) {
    console.warn('⚠️ Failed to save player cache:', error.message);
  }
}

async function loadInjuryHistory() {
  try {
    const store = getBlobStore();
    const text = await store.get('nfl/injuries/injury-duration-history.json');
    if (text) {
      console.log('📊 Loaded injury history from blobs');
      return JSON.parse(text);
    }
  } catch {}
  
  try {
    const response = await fetch('https://bgroundrobin.com/data/nfl/injuries/injury-duration-history.json');
    if (response.ok) {
      console.log('📊 Loaded injury history from web');
      return await response.json();
    }
  } catch {}
  
  console.log('📊 No injury history available (using ESPN only)');
  return null;
}

function normalizeInjuryStatus(espnStatus) {
  if (!espnStatus) return 'active';
  const s = espnStatus.toLowerCase().trim();
  const map = {
    out:'out', o:'out', inactive:'out', ir:'out', 'injured reserve':'out', suspended:'out',
    doubtful:'doubtful', d:'doubtful',
    questionable:'questionable', q:'questionable', 'day-to-day':'questionable', gtd:'questionable',
    probable:'active', p:'active', active:'active', healthy:'active'
  };
  return map[s] || 'questionable';
}

function categorizePosition(position) {
  return POSITION_CATEGORIES[position?.toUpperCase()] || 'DEFAULT';
}

function getPlayerDepthPosition(position) {
  const pos = categorizePosition(position);
  const defaults = { QB:1, RB:1, WR:2, TE:1, OL:1, DB:1, LB:1, DL:1, K:1, DEFAULT:2 };
  return defaults[pos] ?? 2;
}

function deriveWeeksOutFromHistory(history, team, name) {
  try {
    if (!history) return 0;
    const rec = history.index?.[team]?.[name];
    if (!rec?.lastActiveWeekIdx || !rec?.currentWeekIdx) return 0;
    return Math.max(0, rec.currentWeekIdx - rec.lastActiveWeekIdx);
  } catch {
    return 0;
  }
}

function calcReplacementAdjusted(injury, playerPriors, weeksOut = 0) {
  const cat = categorizePosition(injury.position);
  const priors = playerPriors[cat] || playerPriors.DEF;

  let starterEPA, replacementEPA, plays;

  if (cat === 'QB') {
    starterEPA     = priors.starter_epa_per_play;
    replacementEPA = priors.backup1_epa_per_play;
    plays          = priors.expected_plays_per_game;
  } else if (['WR','RB','TE'].includes(cat)) {
    const tier = Math.min(injury.depthOrder || 1, 3);
    const nextTier = Math.min(tier + 1, 3);
    starterEPA     = priors[`${cat.toLowerCase()}${tier}_epa_per_play`] ?? priors[`${cat.toLowerCase()}1_epa_per_play`];
    replacementEPA = priors[`${cat.toLowerCase()}${nextTier}_epa_per_play`] ?? 0;
    plays          = priors.expected_plays_per_game;
  } else {
    starterEPA     = priors.starter_epa_impact;
    replacementEPA = priors.backup_epa_impact;
    plays          = priors.expected_plays_per_game;
  }

  const epaDiff   = (starterEPA ?? 0) - (replacementEPA ?? 0);
  const rawPoints = epaDiff * (plays ?? 0) * INJURY_CONFIG.POINTS_PER_EPA;
  const statusW   = INJURY_CONFIG.STATUS_WEIGHTS[injury.status] ?? 0.5;
  const statusAdj = rawPoints * statusW;
  const tau       = (cat === 'QB') ? INJURY_CONFIG.TAU_QB : INJURY_CONFIG.TAU_NONQB;
  const decay     = Math.exp(-Math.max(0, weeksOut) / tau);
  const decayAdj  = statusAdj * decay;

  let finalPts = decayAdj;
  let qbCapApplied = false;
  if (cat === 'QB') {
    const shrunk = INJURY_CONFIG.QB_SHRINK * decayAdj;
    finalPts     = Math.min(INJURY_CONFIG.QB_SOFT_CAP, shrunk);
    qbCapApplied = shrunk > INJURY_CONFIG.QB_SOFT_CAP;
  }

  const weights = INJURY_CONFIG.POSITION_TO_IMPACT[cat] ?? INJURY_CONFIG.POSITION_TO_IMPACT.DEFAULT;

  return {
    positionCategory: cat,
    rawPoints,
    statusAdjustedPoints: statusAdj,
    decayAdjustedPoints: decayAdj,
    finalPoints,
    spreadImpact: finalPts * weights.spread,
    totalImpact:  finalPts * weights.total,
    isSignificant: Math.abs(finalPts) > 1.0,
    components: {
      epaDiff,
      expectedPlays: plays ?? 0,
      statusWeight: statusW,
      decay,
      qbShrinkApplied: (cat === 'QB'),
      qbCapApplied
    }
  };
}

function dedupeByPlayer(items) {
  const rank = { out: 3, doubtful: 2, questionable: 1, active: 0 };
  const map = new Map();
  for (const it of items) {
    const k = it.playerName + '|' + categorizePosition(it.position);
    const best = map.get(k);
    if (!best || rank[it.status] > rank[best.status]) map.set(k, it);
  }
  return [...map.values()];
}

// OPTIMIZED: Team processor with player cache to reduce ESPN API calls
async function processTeamWithCache(teamCode, playerPriors, injuryHistory, playerCache) {
  const teamId = ESPN_TEAM_MAP[teamCode];
  if (!teamId) {
    console.log(`⚠️ No ESPN ID for team: ${teamCode}`);
    return { injuries: [], teamSummary: null };
  }

  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
  console.log(`🏥 Processing ${teamCode}...`);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)',
        'Accept': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`ESPN API error: ${res.status}`);

    const data = await res.json();
    const refs = data.items || [];
    console.log(`📊 ${teamCode}: Found ${refs.length} injury entries`);

    const items = [];
    for (let i = 0; i < Math.min(refs.length, 20); i++) { // Process more since we're not time-constrained
      const ref = refs[i];
      try {
        // Get injury details
        const ir = await fetch(ref.$ref, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)' }
        });
        if (!ir.ok) continue;

        const injuryData = await ir.json();
        const status = normalizeInjuryStatus(injuryData.status);

        // Use player cache to avoid redundant athlete API calls
        let playerName = 'Unknown';
        let position = 'UNK';
        const athleteRef = injuryData.athlete?.$ref;
        
        if (athleteRef) {
          if (playerCache[athleteRef]) {
            // Use cached player data
            const cached = playerCache[athleteRef];
            playerName = cached.name;
            position = cached.position;
            console.log(`💾 Used cached player: ${playerName}`);
          } else {
            // Fetch and cache new player data
            try {
              const pr = await fetch(athleteRef, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)' }
              });
              if (pr.ok) {
                const pd = await pr.json();
                playerName = pd.displayName || pd.name || 'Unknown';
                position = pd.position?.abbreviation || 'UNK';
                
                // Cache this player for future use
                playerCache[athleteRef] = {
                  name: playerName,
                  position: position,
                  lastUpdated: new Date().toISOString()
                };
                console.log(`💾 Cached new player: ${playerName}`);
              }
            } catch { /* Skip if player fetch fails */ }
          }
        }

        const depthOrder = getPlayerDepthPosition(position);
        const weeksOut = deriveWeeksOutFromHistory(injuryHistory, teamCode, playerName) ?? 0;

        const impact = calcReplacementAdjusted(
          { position, status, depthOrder },
          playerPriors,
          weeksOut
        );

        items.push({
          teamCode,
          playerName,
          position,
          status,
          depthOrder,
          description: injuryData.description || 'Undisclosed',
          impact,
          lastUpdated: new Date().toISOString(),
          source: 'ESPN_API_BACKGROUND'
        });

        if (impact.isSignificant) {
          console.log(`🚨 ${teamCode}: ${playerName} (${position}) ${status.toUpperCase()} → spread ${impact.spreadImpact.toFixed(2)} / total ${impact.totalImpact.toFixed(2)}`);
        }
      } catch (e) {
        console.log(`⚠️ ${teamCode} injury item error: ${e.message}`);
      }
      
      // Polite rate limiting for background job
      await new Promise(r => setTimeout(r, 150));
    }

    // Apply deduplication
    const deduped = dedupeByPlayer(items);
    if (deduped.length !== items.length) {
      console.log(`🔄 ${teamCode}: Deduped ${items.length} → ${deduped.length} injuries`);
    }

    // Generate team summary
    const teamSummary = summarizeTeam(deduped, teamCode);
    
    console.log(`✅ ${teamCode}: ${deduped.length} injuries, ${teamSummary.significant_injuries} significant`);
    
    return { injuries: deduped, teamSummary };
    
  } catch (e) {
    console.error(`❌ Team processing failed for ${teamCode}: ${e.message}`);
    return { injuries: [], teamSummary: null };
  }
}

function summarizeTeam(injuries, teamCode) {
  const byCat = (cat) => injuries.filter(x => categorizePosition(x.position) === cat);
  
  let team_spread_impact = 0;
  let team_total_impact = 0;
  let significant_injuries = 0;
  let replacement_adjusted_count = 0;

  for (const inj of injuries) {
    team_spread_impact += inj.impact.spreadImpact;
    team_total_impact += inj.impact.totalImpact;
    if (inj.impact.isSignificant) significant_injuries++;
    if (Math.abs(inj.impact.finalPoints) > 0.5) replacement_adjusted_count++;
  }

  // Counts for starters out
  const isStarter = (x) => x.status === 'out' && x.depthOrder <= 2;
  const ol_starters_out = injuries.filter(x => isStarter(x) && categorizePosition(x.position) === 'OL').length;
  const db_starters_out = injuries.filter(x => isStarter(x) && categorizePosition(x.position) === 'DB').length;
  const lb_starters_out = injuries.filter(x => isStarter(x) && categorizePosition(x.position) === 'LB').length;
  const dl_starters_out = injuries.filter(x => isStarter(x) && categorizePosition(x.position) === 'DL').length;

  return {
    team_spread_shift_points: Number(team_spread_impact.toFixed(2)), // +ve = team worse
    team_total_shift_points: Number(team_total_impact.toFixed(2)),   // +ve = higher total
    significant_injuries,
    replacement_adjusted_count,
    total_injuries: injuries.length,
    ol_starters_out,
    db_starters_out,
    lb_starters_out,
    dl_starters_out,
    updated_at: new Date().toISOString(),
    system_version: SYSTEM_VERSION
  };
}

// MAIN BACKGROUND PROCESSOR
async function buildInjurySnapshot() {
  console.log('🚀 Background injury snapshot builder starting...');
  
  const playerPriors = await loadPlayerPriors();
  const injuryHistory = await loadInjuryHistory();
  const playerCache = await loadPlayerCache();
  
  const allTeams = Object.keys(ESPN_TEAM_MAP);
  const startTime = Date.now();
  
  const report = {
    asOf: new Date().toISOString(),
    version: SYSTEM_VERSION,
    source: 'ESPN_API_BACKGROUND_CACHED',
    teams: {},
    summary: {
      totalTeamsProcessed: 0,
      totalInjuriesFound: 0,
      significantInjuries: 0,
      replacementAdjustedCount: 0,
      criticalAlerts: [],
      systemEffectiveness: 0,
      buildTimeSeconds: 0,
      playerCacheSize: Object.keys(playerCache).length
    }
  };

  let totalInjuries = 0;
  let significant = 0;
  let replacementAdjusted = 0;
  const criticalAlerts = [];

  // Process teams in batches of 8 with concurrency control
  const batchSize = 8;
  for (let i = 0; i < allTeams.length; i += batchSize) {
    const batch = allTeams.slice(i, i + batchSize);
    console.log(`📊 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allTeams.length/batchSize)}: [${batch.join(', ')}]`);
    
    const batchPromises = batch.map(team => 
      processTeamWithCache(team, playerPriors, injuryHistory, playerCache)
    );
    
    const results = await Promise.all(batchPromises);
    
    for (let j = 0; j < results.length; j++) {
      const team = batch[j];
      const { injuries, teamSummary } = results[j];
      
      if (teamSummary) {
        report.teams[team] = teamSummary;
        totalInjuries += injuries.length;
        significant += teamSummary.significant_injuries;
        replacementAdjusted += teamSummary.replacement_adjusted_count;

        // Collect critical alerts
        for (const inj of injuries) {
          if (Math.abs(inj.impact.finalPoints) > 3.0) {
            criticalAlerts.push(`${team}: ${inj.playerName} (${inj.position}, ${inj.status}) ~${inj.impact.finalPoints.toFixed(1)} pts`);
          }
        }
      }
      
      report.summary.totalTeamsProcessed += 1;
    }
    
    // Brief pause between batches
    await new Promise(r => setTimeout(r, 1000));
  }

  // Finalize summary
  report.summary.totalInjuriesFound = totalInjuries;
  report.summary.significantInjuries = significant;
  report.summary.replacementAdjustedCount = replacementAdjusted;
  report.summary.criticalAlerts = criticalAlerts.slice(0, 20); // Top 20 alerts
  report.summary.systemEffectiveness = totalInjuries > 0 ? 100 : 0;
  report.summary.buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);

  // Save to blob storage
  try {
    const store = getBlobStore();
    
    // Save timestamped version
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // YYYY-MM-DDTHH-MM-SS
    await store.set(`nfl/injuries/v4/${timestamp}.json`, JSON.stringify(report, null, 2));
    
    // Save as latest
    await store.set('nfl/injuries/v4/latest.json', JSON.stringify(report, null, 2));
    
    // Update player cache
    await savePlayerCache(playerCache);
    
    console.log('💾 Injury snapshot saved to blob storage');
    
  } catch (error) {
    console.error('❌ Failed to save injury snapshot:', error);
    throw error;
  }

  console.log('✅ Background injury snapshot complete:');
  console.log(`   Teams: ${report.summary.totalTeamsProcessed}`);
  console.log(`   Injuries: ${totalInjuries}`);
  console.log(`   Significant: ${significant}`);
  console.log(`   Critical Alerts: ${criticalAlerts.length}`);
  console.log(`   Build Time: ${report.summary.buildTimeSeconds}s`);
  console.log(`   Player Cache: ${Object.keys(playerCache).length} entries`);

  return report;
}

// Export for GitHub Actions or direct execution
export { buildInjurySnapshot };

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  buildInjurySnapshot().catch(console.error);
}