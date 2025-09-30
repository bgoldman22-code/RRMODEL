// netlify/functions/nfl-injuries-comprehensive.js
// ELITE INJURY SYSTEM v4.0 - Production-grade with replacement-adjusted impacts

import fetch from 'node-fetch';
import { getStore } from '@netlify/blobs';

// ───────────────────────────────────────────────────────────────────────────────
// Version / Config
// ───────────────────────────────────────────────────────────────────────────────
const SYSTEM_VERSION = 'elite_v4.0_replacement_adjusted';

const INJURY_CONFIG = {
  // Math constants
  POINTS_PER_EPA: 3.75,
  TAU_QB: 3.5,        // Residual decay (weeks)
  TAU_NONQB: 2.5,
  QB_SHRINK: 0.65,
  QB_SOFT_CAP: 8.5,   // Max QB impact (points)

  // Status → play probability
  STATUS_WEIGHTS: {
    out: 1.0,
    doubtful: 0.20,
    questionable: 0.45,
    probable: 0.8,
    active: 0.0
  },

  // Position mapping to spread/total (signed: DEF negatives help opponent)
  POSITION_TO_IMPACT: {
    QB: { spread: 0.85, total: 0.40 },
    WR: { spread: 0.25, total: 0.35 },
    RB: { spread: 0.30, total: 0.25 },
    TE: { spread: 0.20, total: 0.30 },
    OL: { spread: 0.15, total: 0.20 },
    DB: { spread: -0.25, total: 0.30 },
    LB: { spread: -0.20, total: 0.25 },
    DL: { spread: -0.18, total: 0.20 },
    K:  { spread: 0.05, total: 0.02 },
    DEFAULT: { spread: 0.10, total: 0.10 }
  },

  // Market anchoring (plumbed; external odds fetch not included here)
  MARKET_ANCHOR: {
    MINUTES_FULL_MODEL: 1440, // 24h out → mostly model
    MINUTES_FULL_MARKET: 60,  // 1h out → mostly market
    MODEL_WEIGHT_FAR: 0.85,
    MODEL_WEIGHT_NEAR: 0.25
  }
};

// ───────────────────────────────────────────────────────────────────────────────
// Data sources / utilities
// ───────────────────────────────────────────────────────────────────────────────
function getBlobStore() {
  const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-data';
  const token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID;
  return (token && siteID)
    ? getStore({ name: storeName, siteID, token })
    : getStore(storeName);
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
  DE:'DEF', DT:'DEF', NT:'DEF', OLB:'DEF', ILB:'DEF', MLB:'DEF', LB:'DEF',
  CB:'DEF', S:'DEF', FS:'DEF', SS:'DEF', SAF:'DEF',
  K:'K', PK:'K', P:'DEFAULT', LS:'DEFAULT'
};

// Manual overrides for specific players (Joe Burrow, etc.)
function getManualInjuryOverrides(teamCode) {
  const overrides = {
    CIN: [
      {
        playerName: 'Joe Burrow',
        position: 'QB',
        status: 'out',
        statusDetails: 'Manual override - confirmed OUT',
        injuryNote: 'Wrist injury',
        depthOrder: 1,
        teamCode: 'CIN',
        source: 'MANUAL_OVERRIDE'
      }
    ]
  };
  
  return overrides[teamCode] || [];
}

// ───────────────────────────────────────────────────────────────────────────────
// Normalization / Math
// ───────────────────────────────────────────────────────────────────────────────
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

// Depth placeholder (replace with real depth charts/snap shares)
function getPlayerDepthPosition(/* playerName, */ position /*, teamCode */) {
  const pos = categorizePosition(position);
  // Reasonable defaults until depth charts are wired
  const defaults = { QB:1, RB:1, WR:2, TE:1, OL:1, DB:1, LB:1, DL:1, K:1, DEFAULT:2 };
  return defaults[pos] ?? 2;
}

// Replacement-adjusted impact (points), then mapped to spread/total
function calcReplacementAdjusted(injury, playerPriors, weeksOut = 0) {
  const cat = categorizePosition(injury.position);
  const priors = playerPriors[cat] || playerPriors.DEF;

  let starterEPA, replacementEPA, plays;

  if (cat === 'QB') {
    starterEPA     = priors.starter_epa_per_play;
    replacementEPA = priors.backup1_epa_per_play;
    plays          = priors.expected_plays_per_game;
  } else if (['WR','RB','TE'].includes(cat)) {
    const tierKey =
      injury.depthOrder === 1 ? `${cat.toLowerCase()}1_epa_per_play` :
      injury.depthOrder === 2 ? `${cat.toLowerCase()}2_epa_per_play` :
                                `${cat.toLowerCase()}3_epa_per_play`;
    starterEPA     = priors[tierKey] ?? priors[`${cat.toLowerCase()}1_epa_per_play`];
    replacementEPA = priors[`${cat.toLowerCase()}2_epa_per_play`] ?? 0;
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

  const weights   = INJURY_CONFIG.POSITION_TO_IMPACT[cat] ?? INJURY_CONFIG.POSITION_TO_IMPACT.DEFAULT;

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

// ───────────────────────────────────────────────────────────────────────────────
// ESPN fetch
// ───────────────────────────────────────────────────────────────────────────────
async function fetchTeamInjuriesESPN(teamCode, playerPriors) {
  const teamId = ESPN_TEAM_MAP[teamCode];
  if (!teamId) {
    console.log(`⚠️ No ESPN ID for team: ${teamCode}`);
    return [];
  }

  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;

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
    if (refs.length === 0) {
      console.log(`📊 ${teamCode}: No ESPN injuries, checking manual overrides...`);
    }

    const items = [];
    for (let i = 0; i < Math.min(refs.length, 25); i++) {
      const ref = refs[i];
      try {
        const ir = await fetch(ref.$ref, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)' }
        });
        if (!ir.ok) continue;

        const injuryData = await ir.json();
        const status = normalizeInjuryStatus(injuryData.status);

        // Player details
        let playerName = 'Unknown';
        let position   = 'UNK';
        if (injuryData.athlete?.$ref) {
          try {
            const pr = await fetch(injuryData.athlete.$ref, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)' }
            });
            if (pr.ok) {
              const pd = await pr.json();
              playerName = pd.displayName || pd.name || 'Unknown';
              position   = pd.position?.abbreviation || 'UNK';
            }
          } catch { /* noop */ }
        }

        const depthOrder = getPlayerDepthPosition(playerName, position, teamCode);

        // TODO: derive weeksOut from your injury history store
        const weeksOut = 0;

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
          source: 'ESPN_API_comprehensive'
        });

        if (impact.isSignificant) {
          console.log(`🚨 ${teamCode}: ${playerName} (${position}) ${status.toUpperCase()} → spread ${impact.spreadImpact.toFixed(2)} / total ${impact.totalImpact.toFixed(2)}`);
        }
      } catch (e) {
        console.log(`⚠️ ${teamCode} injury item error: ${e.message}`);
      }
      // polite rate limit
      await new Promise(r => setTimeout(r, 100));
    }

    // Apply manual overrides (Joe Burrow etc)
    const manualOverrides = getManualInjuryOverrides(teamCode);
    for (const override of manualOverrides) {
      console.log(`🔧 Applying manual override for ${teamCode}: ${override.playerName} (${override.status})`);
      
      const existingIndex = items.findIndex(inj => 
        inj.playerName.toLowerCase().includes(override.playerName.toLowerCase())
      );
      
      if (existingIndex >= 0) {
        // Update existing
        items[existingIndex] = { 
          ...items[existingIndex], 
          ...override,
          impact: calcReplacementAdjusted(override, playerPriors, 0)
        };
      } else {
        // Add new
        const impact = calcReplacementAdjusted(override, playerPriors, 0);
        items.push({
          ...override,
          impact,
          lastUpdated: new Date().toISOString(),
          description: override.injuryNote || 'Manual override'
        });
      }
    }

    console.log(`📊 ${teamCode}: Found ${items.length} total injuries (${manualOverrides.length} manual)`);
    return items;
  } catch (e) {
    console.error(`❌ ESPN fetch failed for ${teamCode}: ${e.message}`);
    return [];
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Aggregation
// ───────────────────────────────────────────────────────────────────────────────
function summarizeTeam(injuries, teamCode) {
  const byCat = (cat) => injuries.filter(x => categorizePosition(x.position) === cat);
  const qbs   = injuries.filter(x => x.position === 'QB');
  const rbs   = byCat('RB');
  const wrs   = byCat('WR');
  const tes   = byCat('TE');
  const ols   = byCat('OL');
  const defs  = byCat('DEF');

  // QB headline
  let qb_status = 'active';
  let qb_name   = 'Starting QB';
  let qb_impact = { finalPoints: 0, spreadImpact: 0, totalImpact: 0, components: {} };

  if (qbs.length > 0) {
    const primary = qbs.reduce((a, b) => (a.depthOrder || 99) < (b.depthOrder || 99) ? a : b);
    qb_status = primary.status;
    qb_name   = primary.playerName;
    qb_impact = primary.impact;
  }

  // Aggregate team spread/total impact (sum of per-player)
  let team_spread_impact = 0;
  let team_total_impact  = 0;
  let significant_injuries = 0;
  let replacement_adjusted_count = 0;

  for (const inj of injuries) {
    team_spread_impact += inj.impact.spreadImpact;
    team_total_impact  += inj.impact.totalImpact;
    if (inj.impact.isSignificant) significant_injuries++;
    if (Math.abs(inj.impact.finalPoints) > 0.5) replacement_adjusted_count++;
  }

  // Counts for OL/DB starters out (depth ≤2)
  const ol_starters_out = ols.filter(x => x.status === 'out' && x.depthOrder <= 2).length;
  const db_starters_out = defs.filter(x => x.status === 'out' && x.depthOrder <= 2 && ['CB','S','FS','SS'].includes(x.position)).length;

  return {
    qb_status,
    qb_name,
    qb_injury_impact: qb_impact,
    rb_injuries: rbs.map(mapInjuryForOutput),
    wr_injuries: wrs.map(mapInjuryForOutput),
    te_injuries: tes.map(mapInjuryForOutput),
    ol_injuries: ols.map(mapInjuryForOutput),
    def_injuries: defs.map(mapInjuryForOutput),
    ol_starters_out,
    db_starters_out,
    team_spread_impact: Number(team_spread_impact.toFixed(2)),
    team_total_impact:  Number(team_total_impact.toFixed(2)),
    team_injury_impact: Math.min(Math.abs(team_spread_impact), 1.0), // legacy scalar if needed
    significant_injuries,
    replacement_adjusted_count,
    total_injuries: injuries.length,
    updated_at: new Date().toISOString(),
    system_version: SYSTEM_VERSION,
    automatic_detection: true
  };
}

function mapInjuryForOutput(inj) {
  return {
    name: inj.playerName,
    player: inj.playerName,
    status: inj.status,
    depth: inj.depthOrder,
    injury: inj.description,
    position: inj.position,
    spread_impact: Number(inj.impact.spreadImpact.toFixed(2)),
    total_impact:  Number(inj.impact.totalImpact.toFixed(2)),
    is_significant: inj.impact.isSignificant
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Report generation (teams; games placeholder for future)
// ───────────────────────────────────────────────────────────────────────────────
async function generateEliteInjuryReport() {
  console.log('🏥 Generating elite replacement-adjusted injury report…');

  const playerPriors = await loadPlayerPriors();
  const allTeams = Object.keys(ESPN_TEAM_MAP);

  const report = {
    asOf: new Date().toISOString(),
    version: SYSTEM_VERSION,
    source: 'ESPN_API_comprehensive',
    teams: {},
    games: {}, // ← wire schedule & market anchor here if desired
    summary: {
      totalTeamsProcessed: 0,
      totalInjuriesFound: 0,
      significantInjuries: 0,
      replacementAdjustedCount: 0,
      criticalAlerts: [],
      systemEffectiveness: 0
    }
  };

  let totalInjuries = 0;
  let significant = 0;
  let replacementAdjusted = 0;
  const criticalAlerts = [];

  for (const team of allTeams) {
    const injuries = await fetchTeamInjuriesESPN(team, playerPriors);
    const teamSummary = summarizeTeam(injuries, team);
    report.teams[team] = teamSummary;

    totalInjuries += injuries.length;
    significant   += teamSummary.significant_injuries;
    replacementAdjusted += teamSummary.replacement_adjusted_count;

    for (const inj of injuries) {
      if (Math.abs(inj.impact.finalPoints) > 3.0) {
        criticalAlerts.push(`${team}: ${inj.playerName} (${inj.position}, ${inj.status}) ~${inj.impact.finalPoints.toFixed(1)} pts`);
      }
    }

    report.summary.totalTeamsProcessed += 1;
    await new Promise(r => setTimeout(r, 200)); // gentle rate limit
  }

  report.summary.totalInjuriesFound = totalInjuries;
  report.summary.significantInjuries = significant;
  report.summary.replacementAdjustedCount = replacementAdjusted;
  report.summary.criticalAlerts = criticalAlerts;
  report.summary.systemEffectiveness = totalInjuries > 0 ? 100 : 0;

  await writeToBlobStorage('nfl/injuries/comprehensive.json', report);

  console.log('✅ Elite injury report complete:',
    `Teams=${report.summary.totalTeamsProcessed}`,
    `Injuries=${totalInjuries}`,
    `Significant=${significant}`,
    `Alerts=${criticalAlerts.length}`
  );

  return report;
}

// ───────────────────────────────────────────────────────────────────────────────
// Persistence / Lambda handler
// ───────────────────────────────────────────────────────────────────────────────
async function writeToBlobStorage(path, data) {
  try {
    const store = getBlobStore();
    await store.set(path, JSON.stringify(data, null, 2));
    console.log(`💾 Wrote injury data → ${path}`);
  } catch (error) {
    console.warn(`⚠️ Failed to write to blob storage (${path}):`, error.message);
    // Don't throw in local testing - just warn
  }
}

export const handler = async () => {
  console.log('🚀 ELITE NFL injury system v4.0 starting…');
  try {
    const injuryData = await generateEliteInjuryReport();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Elite injury system executed successfully',
        version: SYSTEM_VERSION,
        config: {
          pointsPerEPA: INJURY_CONFIG.POINTS_PER_EPA,
          qbShrink: INJURY_CONFIG.QB_SHRINK,
          qbSoftCap: INJURY_CONFIG.QB_SOFT_CAP,
          tauQB: INJURY_CONFIG.TAU_QB,
          tauNonQB: INJURY_CONFIG.TAU_NONQB
        },
        teams: Object.keys(injuryData.teams).length,
        games: Object.keys(injuryData.games || {}).length,
        totalInjuries: injuryData.summary.totalInjuriesFound,
        significantInjuries: injuryData.summary.significantInjuries,
        replacementAdjustedInjuries: injuryData.summary.replacementAdjustedCount,
        systemEffectiveness: injuryData.summary.systemEffectiveness,
        criticalAlerts: injuryData.summary.criticalAlerts.slice(0, 10),
        asOf: injuryData.asOf,
        sampleTeam: injuryData.teams?.CIN || null
      })
    };
  } catch (error) {
    console.error('❌ Elite injury system failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Elite injury system encountered an error',
        version: SYSTEM_VERSION
      })
    };
  }
};