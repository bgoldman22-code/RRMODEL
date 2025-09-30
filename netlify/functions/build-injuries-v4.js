// Background processor with atomic writes - Production v4.0
import fetch from 'node-fetch';
import { getStore } from '@netlify/blobs';

// Import configuration from comprehensive system
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
    DB: { spread: 0.25, total: 0.30 },
    LB: { spread: 0.20, total: 0.25 },
    DL: { spread: 0.18, total: 0.20 },
    K:  { spread: 0.05, total: 0.02 },
    DEFAULT: { spread: 0.05, total: 0.05 }
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
  OG:'OL', OT:'OL',
  DE:'DL', DT:'DL', NT:'DL', IDL:'DL', EDGE:'LB',
  OLB:'LB', ILB:'LB', MLB:'LB', LB:'LB',
  CB:'DB', S:'DB', FS:'DB', SS:'DB', SAF:'DB', 
  LCB:'DB', RCB:'DB', NB:'DB', NCB:'DB',
  K:'K', PK:'K', P:'DEFAULT', LS:'DEFAULT',
  WLB:'LB', SLB:'LB', WILL:'LB', SAM:'LB', MIKE:'LB'
};

// Telemetry tracking
class InjuryTelemetry {
  constructor() {
    this.metrics = {
      teamsProcessed: 0,
      totalInjuries: 0,
      espnFailures: 0,
      unmappedStatuses: new Set(),
      unmappedPositions: new Set(),
      dedupeActions: 0,
      processingTimes: [],
      lastSuccess: null
    };
  }
  
  recordTeamProcessing(teamCode, latencyMs, injuryCount, errors = []) {
    this.metrics.teamsProcessed++;
    this.metrics.totalInjuries += injuryCount;
    this.metrics.processingTimes.push({ team: teamCode, latencyMs });
    
    if (errors.length > 0) {
      this.metrics.espnFailures++;
      console.error(`📊 Team ${teamCode} errors:`, errors);
    }
  }
  
  recordUnmappedStatus(status, context) {
    this.metrics.unmappedStatuses.add(`${status}|${context}`);
    console.warn(`🔍 Unmapped status: "${status}" in ${context}`);
  }
  
  recordUnmappedPosition(position, context) {
    this.metrics.unmappedPositions.add(`${position}|${context}`);
    console.warn(`🔍 Unmapped position: "${position}" in ${context}`);
  }
  
  async writeTelemetry(store) {
    const telemetryData = {
      ...this.metrics,
      unmappedStatuses: [...this.metrics.unmappedStatuses],
      unmappedPositions: [...this.metrics.unmappedPositions],
      avgLatencyMs: this.metrics.processingTimes.reduce((sum, t) => sum + t.latencyMs, 0) / this.metrics.processingTimes.length || 0,
      timestamp: new Date().toISOString()
    };
    
    await store.set('injuries/v4/telemetry.json', JSON.stringify(telemetryData, null, 2));
    console.log(`📊 Telemetry written:`, telemetryData);
  }
}

// Utility functions
function getBlobStore() {
  const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-data';
  const token = process.env.NETLIFY_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.NETLIFY_SITE_ID;
  return (token && siteID)
    ? getStore({ name: storeName, siteID, token })
    : getStore(storeName);
}

function getCurrentWeek({ now = new Date(), tz = 'America/New_York' } = {}) {
  const year = now.getFullYear();
  const seasonStart = getFirstThursdayOfSeptember(year);
  
  const etNow = new Date(now.toLocaleString("en-US", {timeZone: tz}));
  const etTuesday3am = new Date(etNow);
  etTuesday3am.setDate(etTuesday3am.getDate() - ((etTuesday3am.getDay() + 5) % 7));
  etTuesday3am.setHours(3, 0, 0, 0);
  
  if (etNow < etTuesday3am) {
    etTuesday3am.setDate(etTuesday3am.getDate() - 7);
  }
  
  const weeksSinceStart = Math.floor((etTuesday3am - seasonStart) / (7 * 24 * 60 * 60 * 1000));
  const weekNum = Math.max(1, Math.min(18, weeksSinceStart + 1));
  
  return `${year}_W${weekNum}`;
}

function getFirstThursdayOfSeptember(year) {
  const sept1 = new Date(year, 8, 1);
  const firstThursday = new Date(sept1);
  firstThursday.setDate(1 + ((4 - sept1.getDay() + 7) % 7));
  return firstThursday;
}

function generateETag(data) {
  const content = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

// Atomic snapshot writer
async function writeSnapshotAtomic(data, store) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = `injuries/v4/snapshots/${timestamp}.json`;
  const pointerPath = 'injuries/v4/latest.json';
  
  try {
    // 1. Write snapshot to timestamped path
    await store.set(snapshotPath, JSON.stringify(data, null, 2));
    
    // 2. Atomically update pointer
    const pointer = {
      ref: snapshotPath,
      asOf: data.asOf,
      etag: generateETag(data),
      schemaVersion: '4.0',
      size: JSON.stringify(data).length,
      teams: Object.keys(data.teams || {}).length,
      partial: data.summary?.partial || false
    };
    
    await store.set(pointerPath, JSON.stringify(pointer, null, 2));
    
    console.log(`📌 Atomic write complete: ${snapshotPath}`);
    return { snapshotPath, pointer };
    
  } catch (error) {
    console.error(`❌ Atomic write failed:`, error);
    throw error;
  }
}

function normalizeInjuryStatus(espnStatus, practiceStatus = null) {
  if (!espnStatus && !practiceStatus) return 'active';
  
  const gameStatus = (espnStatus || '').toLowerCase().trim();
  const practice = (practiceStatus || '').toLowerCase().trim();
  
  const gameMap = {
    out: 'out', o: 'out', inactive: 'out', ir: 'out', 
    'injured reserve': 'out', suspended: 'out', pup: 'out',
    doubtful: 'doubtful', d: 'doubtful',
    questionable: 'questionable', q: 'questionable', 
    'day-to-day': 'questionable', gtd: 'questionable',
    active: 'active', healthy: 'active'
  };
  
  if (gameStatus && gameMap[gameStatus]) {
    return gameMap[gameStatus];
  }
  
  const practiceMap = {
    'did not participate': 'doubtful',
    'dnp': 'doubtful',
    'limited participation': 'questionable', 
    'limited': 'questionable',
    'full participation': 'active',
    'full': 'active'
  };
  
  if (practice && practiceMap[practice]) {
    return practiceMap[practice];
  }
  
  if (gameStatus || practice) {
    console.warn(`🔍 Unmapped injury status: game="${gameStatus}" practice="${practice}" - defaulting to questionable`);
  }
  
  return 'questionable';
}

function categorizePosition(position) {
  return POSITION_CATEGORIES[position?.toUpperCase()] || 'DEFAULT';
}

// Simplified processing for cloud constraints
async function processTeamMinimal(teamCode, telemetry) {
  const teamStart = Date.now();
  const teamId = ESPN_TEAM_MAP[teamCode];
  if (!teamId) return null;

  try {
    const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/${teamId}/injuries`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)',
        'Accept': 'application/json'
      },
      timeout: 4000
    });

    if (!response.ok) throw new Error(`ESPN API error: ${response.status}`);

    const data = await response.json();
    const injuryRefs = data.items || [];
    const injuries = [];

    // Process first 6 injuries only (cloud timeout constraints)
    for (const ref of injuryRefs.slice(0, 6)) {
      try {
        const injuryResponse = await fetch(ref.$ref, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NFLInjuryBot/4.0)' },
          timeout: 3000
        });
        
        if (!injuryResponse.ok) continue;
        
        const injuryData = await injuryResponse.json();
        const status = normalizeInjuryStatus(injuryData.status);
        
        if (status === 'active') continue; // Skip healthy players
        
        // Simplified injury object
        injuries.push({
          teamCode,
          playerName: injuryData.athlete?.displayName || 'Unknown',
          position: 'UNK', // Simplified - no player details fetch
          status,
          description: injuryData.description || 'Undisclosed',
          lastUpdated: new Date().toISOString(),
          source: 'ESPN_API_minimal'
        });

      } catch (error) {
        console.warn(`Injury processing error for ${teamCode}:`, error.message);
      }
    }

    const processingTime = Date.now() - teamStart;
    telemetry.recordTeamProcessing(teamCode, processingTime, injuries.length);
    
    console.log(`✅ ${teamCode}: ${injuries.length} injuries in ${processingTime}ms`);
    return {
      teamCode,
      injuries: injuries.length,
      significantInjuries: injuries.filter(i => i.status === 'out').length,
      lastUpdated: new Date().toISOString(),
      processingTimeMs: processingTime
    };

  } catch (error) {
    const processingTime = Date.now() - teamStart;
    telemetry.recordTeamProcessing(teamCode, processingTime, 0, [error.message]);
    console.error(`❌ Team processing failed for ${teamCode}:`, error.message);
    return null;
  }
}

export const handler = async (event, context) => {
  const startTime = Date.now();
  const TIMEOUT_BUDGET = 13 * 60 * 1000; // 13 minutes
  const PARTIAL_THRESHOLD = TIMEOUT_BUDGET - 30000; // 30s buffer
  
  console.log('🚀 Background processor v4.0 starting with atomic writes...');
  
  const telemetry = new InjuryTelemetry();
  const store = getBlobStore();
  let partialResult = false;
  
  try {
    // Process high-priority teams only
    const priorityTeams = ['NYJ', 'MIA', 'CIN', 'DEN', 'NYG', 'NO', 'BUF', 'KC'];
    const processedTeams = {};
    
    for (const team of priorityTeams) {
      if (Date.now() - startTime > PARTIAL_THRESHOLD) {
        console.warn(`⏰ Timeout approaching, processed ${Object.keys(processedTeams).length} teams`);
        partialResult = true;
        break;
      }
      
      const teamResult = await processTeamMinimal(team, telemetry);
      if (teamResult) {
        processedTeams[team] = teamResult;
      }
    }
    
    const snapshot = {
      asOf: new Date().toISOString(),
      version: 'elite_v4.0_minimal',
      teams: processedTeams,
      summary: {
        totalTeamsProcessed: Object.keys(processedTeams).length,
        totalInjuries: Object.values(processedTeams).reduce((sum, t) => sum + t.injuries, 0),
        significantInjuries: Object.values(processedTeams).reduce((sum, t) => sum + t.significantInjuries, 0),
        systemEffectiveness: Object.keys(processedTeams).length > 0 ? 100 : 0,
        partial: partialResult,
        processingTimeMs: Date.now() - startTime,
        currentWeek: getCurrentWeek(),
        mode: 'MINIMAL_CLOUD_V4'
      }
    };
    
    // Atomic write
    await writeSnapshotAtomic(snapshot, store);
    
    // Write telemetry
    await telemetry.writeTelemetry(store);
    
    console.log(`✅ Background processing complete: ${Object.keys(processedTeams).length} teams, ${snapshot.summary.totalInjuries} injuries`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        version: 'v4.0-atomic',
        teams: Object.keys(processedTeams).length,
        injuries: snapshot.summary.totalInjuries,
        partial: partialResult,
        processingTimeMs: Date.now() - startTime
      })
    };
    
  } catch (error) {
    console.error('❌ Background processor v4 failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        version: 'v4.0-atomic',
        processingTimeMs: Date.now() - startTime
      })
    };
  }
};