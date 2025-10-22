/**
 * NHL ELITE SOG PROJECTION ENGINE V4.0 - CommonJS build for Netlify Functions
 * This file mirrors nhl-elite-projection-v4.mjs but uses module.exports
 */

let PLAYER_CACHE = null;
let TEAM_CACHE = null;
let CACHE_TIMESTAMP = null;
const CACHE_TTL = 300000; // 5 minutes

const RINK_EFFECTS = {
  'Ball Arena': 1.08,
  'T-Mobile Arena': 1.06,
  'Climate Pledge Arena': 1.05,
  'Scotiabank Arena': 1.03,
  'Madison Square Garden': 1.02,
  'TD Garden': 1.01,
  'United Center': 1.00,
  'Enterprise Center': 1.00,
  'Prudential Center': 0.97,
  'Wells Fargo Center': 0.96,
  'Mullett Arena': 0.95,
  'Honda Center': 0.94
};

const { getStore } = require('@netlify/blobs');

async function loadPlayerStats() {
  if (PLAYER_CACHE && CACHE_TIMESTAMP && (Date.now() - CACHE_TIMESTAMP < CACHE_TTL)) {
    return PLAYER_CACHE;
  }
  
  let data = null;
  
  // Try Netlify Blobs first (with error handling)
  try {
    const store = getStore('nhl-stats');
    data = await store.get('player_stats_20242025', { type: 'json' });
  } catch (blobError) {
    console.warn('⚠️ Blobs access failed for player stats, will use GitHub fallback:', blobError.message);
  }
  
  // If no valid data from blobs, fetch from GitHub
  if (!data || !data.players || data.players.length === 0) {
    try {
      const ghUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main42/data/nhl/player_stats_20242025.json';
      const resp = await fetch(ghUrl);
      if (resp.ok) {
        const ghData = await resp.json();
        if (ghData && ghData.players && ghData.players.length > 0) {
          console.log(`✅ Loaded ${ghData.players.length} players from GitHub`);
          data = ghData;
          // Try to cache in blobs for next time (non-blocking)
          try {
            const store = getStore('nhl-stats');
            await store.setJSON('player_stats_20242025', ghData);
          } catch (e) {
            console.warn('Could not cache to blobs:', e.message);
          }
        }
      } else {
        console.error(`❌ GitHub fetch failed: ${resp.status}`);
      }
    } catch (ghError) {
      console.error('❌ GitHub fallback failed:', ghError.message);
    }
  }
  
  if (data && data.players) {
    PLAYER_CACHE = data.players;
    CACHE_TIMESTAMP = Date.now();
    return PLAYER_CACHE;
  }
  
  console.error('❌ No player data available from any source');
  return [];
}

async function loadTeamStats() {
  if (TEAM_CACHE && CACHE_TIMESTAMP && (Date.now() - CACHE_TIMESTAMP < CACHE_TTL)) {
    return TEAM_CACHE;
  }
  
  let data = null;
  
  // Try Netlify Blobs first (with error handling)
  try {
    const store = getStore('nhl-stats');
    data = await store.get('team_stats_20242025', { type: 'json' });
  } catch (blobError) {
    console.warn('⚠️ Blobs access failed for team stats, will use GitHub fallback:', blobError.message);
  }
  
  // If no valid data from blobs, fetch from GitHub
  if (!data || !data.teams || Object.keys(data.teams).length === 0) {
    try {
      const ghUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main42/data/nhl/team_stats_20242025.json';
      const resp = await fetch(ghUrl);
      if (resp.ok) {
        const ghData = await resp.json();
        if (ghData && ghData.teams && Object.keys(ghData.teams).length > 0) {
          console.log(`✅ Loaded ${Object.keys(ghData.teams).length} teams from GitHub`);
          data = ghData;
          // Try to cache in blobs for next time (non-blocking)
          try {
            const store = getStore('nhl-stats');
            await store.setJSON('team_stats_20242025', ghData);
          } catch (e) {
            console.warn('Could not cache to blobs:', e.message);
          }
        }
      } else {
        console.error(`❌ GitHub fetch failed: ${resp.status}`);
      }
    } catch (ghError) {
      console.error('❌ GitHub fallback failed:', ghError.message);
    }
  }
  
  if (data && data.teams) {
    TEAM_CACHE = data.teams;
    return TEAM_CACHE;
  }
  
  console.error('❌ No team data available from any source');
  return {};
}

async function preloadCache() {
  const [players, teams] = await Promise.all([loadPlayerStats(), loadTeamStats()]);
  return { playersCount: players.length, teamsCount: Object.keys(teams).length };
}

async function findPlayer(playerId, playerName, team) {
  const players = await loadPlayerStats();
  const pidNum = playerId != null ? Number(playerId) : NaN;
  let player = players.find(p => Number(p.playerId) === pidNum);
  
  if (!player && playerName && team) {
    const normalize = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
    const [firstRaw, ...rest] = (playerName || '').split(' ');
    const first = normalize(firstRaw);
    const last = normalize(rest.join(' '));
    const full = normalize(playerName);
    player = players.find(p => {
      if ((p.team || '') !== team) return false;
      const pn = normalize(p.name || '');
      if (pn === full) return true;
      if (last && pn.endsWith(' ' + last)) {
        if (!first) return true;
        const pFirst = pn.split(' ')[0];
        return pFirst && (pFirst === first || pFirst.charAt(0) === first.charAt(0));
      }
      return false;
    });
    
    if (!player) {
      // Player name search failed - log for debugging
      console.log(`🔍 findPlayer failed: ${playerName} (${team}, ID: ${playerId}) - tried ${players.length} players`);
    }
  }
  
  return player;
}

async function getTeamDefense(teamAbbrev) {
  const teams = await loadTeamStats();
  const team = teams[teamAbbrev];
  if (!team) {
    return { defensiveRating: 1.0, shotsAgainstPerGame: 30.0, penaltyKillPct: 0.80, savePct: 0.900 };
  }
  return {
    defensiveRating: team.defensiveRating || 1.0,
    shotsAgainstPerGame: team.shotsAgainstPerGame || 30.0,
    penaltyKillPct: team.penaltyKillPct || 0.80,
    savePct: team.savePct || 0.900
  };
}

function detectStreak(recentGames) {
  if (!recentGames || recentGames.length < 3) return { factor: 1.0, type: 'neutral', strength: 0 };
  const last5 = recentGames.slice(0, 5);
  const avgShots = last5.reduce((sum, g) => sum + (g.shots || 0), 0) / last5.length;
  const trend = last5.map(g => g.shots || 0);
  const isHot = trend.filter(s => s >= 4).length >= 3;
  const isCold = trend.filter(s => s <= 1).length >= 3;
  if (isHot) return { factor: 1.15, type: 'hot', strength: avgShots };
  if (isCold) return { factor: 0.85, type: 'cold', strength: avgShots };
  return { factor: 1.0, type: 'neutral', strength: avgShots };
}

function calculateWeightedSOGAverage(player) {
  if (!player || !player.season) return 2.5;
  const seasonAvg = parseFloat(player.season.shotsPerGame) || 2.5;
  const L5avg = parseFloat(player.L5?.shots) || seasonAvg;
  const L10avg = parseFloat(player.L10?.shots) || seasonAvg;
  return (seasonAvg * 0.60) + (L5avg * 0.30) + (L10avg * 0.10);
}

function determinePPUnit(player) {
  if (!player || !player.season) return 'NONE';
  const ppPoints = player.season.powerPlayPoints || 0;
  const gamesPlayed = player.season.gamesPlayed || 1;
  const ppPointsPerGame = ppPoints / gamesPlayed;
  if (ppPointsPerGame >= 0.25) return 'PP1';
  if (ppPointsPerGame >= 0.10) return 'PP2';
  return 'NONE';
}

function calculateExpectedTOI(player) {
  if (!player || !player.season) return 15.0;
  const seasonTOI = player.season.avgToi || '0:00';
  const [mins, secs] = seasonTOI.split(':');
  const seasonMins = parseInt(mins) + (parseInt(secs) / 60);
  const L5toi = parseFloat(player.L5?.toi) || seasonMins;
  return (L5toi * 0.70) + (seasonMins * 0.30);
}

async function projectSOGElite(playerId, playerName, team, opponent, isHome, venue) {
  const player = await findPlayer(playerId, playerName, team);
  if (!player) {
    console.log(`🔍 Elite projection: Player not found in stats - ${playerName} (${team}, ID: ${playerId})`);
    return null;
  }
  let earlySeason = false;
  if (!player.season || (player.season.gamesPlayed ?? 0) < 3) earlySeason = true;
  const oppDefense = await getTeamDefense(opponent);
  let baseSOG = calculateWeightedSOGAverage(player);
  if (earlySeason && (!isFinite(baseSOG) || baseSOG <= 0)) baseSOG = 2.5;
  const streak = detectStreak(player.recentGames);
  baseSOG *= streak.factor;
  baseSOG *= isHome ? 1.08 : 0.94;
  const rinkEffect = RINK_EFFECTS[venue] || 1.0;
  baseSOG *= rinkEffect;
  const oppAdjustment = 2 - (oppDefense.defensiveRating || 1.0);
  baseSOG *= oppAdjustment;
  const expectedTOI = calculateExpectedTOI(player);
  const leagueavgTOI = player.position === 'D' ? 20.0 : 16.0;
  const toiFactor = expectedTOI / leagueavgTOI;
  baseSOG *= toiFactor;
  const ppUnit = determinePPUnit(player);
  let ppBoost = 0;
  if (ppUnit === 'PP1') ppBoost = player.position === 'D' ? 0.4 : 0.6;
  else if (ppUnit === 'PP2') ppBoost = player.position === 'D' ? 0.2 : 0.3;
  ppBoost *= (1.05 - (oppDefense.penaltyKillPct || 0.8) * 0.5);
  baseSOG += ppBoost;
  const pointsPerGame = parseFloat(player.season.pointsPerGame) || 0;
  let qualityMultiplier = 1.0;
  if (pointsPerGame >= 0.9) qualityMultiplier = 1.08;
  else if (pointsPerGame >= 0.6) qualityMultiplier = 1.04;
  else if (pointsPerGame >= 0.3) qualityMultiplier = 1.00;
  else qualityMultiplier = 0.92;
  baseSOG *= qualityMultiplier;
  let dispersion = player.position === 'D' ? 3.5 : 2.4;
  if (earlySeason) dispersion *= 1.2;
  let scratchRisk = 0.02;
  if (player.season.gamesPlayed < (player.L10?.games || 10) * 1.5) scratchRisk = 0.08;
  if (pointsPerGame < 0.2) scratchRisk = 0.05;
  return {
    playerId: player.playerId,
    playerName: player.name,
    team: player.team,
    position: player.position,
    opponent,
    mu: Math.max(0.5, baseSOG),
    r: dispersion,
    pi: scratchRisk,
    breakdown: {
      seasonAvg: parseFloat(player.season.shotsPerGame) || 0,
      L5avg: parseFloat(player.L5?.shots) || 0,
      L10avg: parseFloat(player.L10?.shots) || 0,
      weightedBase: calculateWeightedSOGAverage(player),
      adjustments: {
        streak: streak.factor,
        homeAway: isHome ? 1.08 : 0.94,
        venue: rinkEffect,
        oppDefense: oppAdjustment,
        toi: toiFactor,
        ppBoost: ppBoost,
        quality: qualityMultiplier
      },
      finalProjection: baseSOG
    },
    metadata: {
      streak: streak.type,
      ppUnit,
      expectedTOI: expectedTOI.toFixed(1),
      oppDefenseRating: (oppDefense.defensiveRating || 1.0).toFixed(2),
      gamesPlayed: player.season.gamesPlayed,
      scratchRisk: (scratchRisk * 100).toFixed(1) + '%',
      earlySeason
    }
  };
}

function calculateZINBProbability(mu, r, pi, line, direction) {
  // For UNDER X.5: We want P(X <= X) where X is floor(line)
  // Example: UNDER 1.5 means we win if actual is 0, 1 (X <= 1)
  // So we need CDF(floor(line)) = CDF(1)
  //
  // For OVER X.5: We want P(X > X) = P(X >= X+1) = 1 - P(X <= X)
  // Example: OVER 1.5 means we win if actual is 2, 3, 4... (X >= 2)
  // So we need 1 - CDF(floor(line)) = 1 - CDF(1)
  
  const threshold = Math.floor(line);
  
  if (direction === 'UNDER') {
    return calculateZINBCDF(mu, r, pi, threshold);
  } else {
    return 1 - calculateZINBCDF(mu, r, pi, threshold);
  }
}

function calculateZINBCDF(mu, r, pi, k) {
  let cumProb = 0;
  const maxK = Math.min(Math.ceil(k), 15);
  for (let i = 0; i <= maxK; i++) {
    cumProb += zinbPMF(i, pi, mu, r);
  }
  return Math.min(1.0, Math.max(0.0, cumProb));
}

function zinbPMF(k, pi, mu, r) {
  if (k === 0) {
    const nbZero = Math.pow(r / (r + mu), r);
    return pi + (1 - pi) * nbZero;
  } else {
    const p = r / (r + mu);
    const nbProb = (gamma(k + r) / (gamma(k + 1) * gamma(r))) * Math.pow(p, r) * Math.pow(1 - p, k);
    return (1 - pi) * nbProb;
  }
}

const GAMMA_LOOKUP = { 1:1,2:1,3:2,4:6,5:24,6:120,7:720,8:5040,9:40320,10:362880,11:3628800,12:39916800 };

function gamma(z) {
  if (Number.isInteger(z) && GAMMA_LOOKUP[z]) return GAMMA_LOOKUP[z];
  
  // Handle negative or zero
  if (z <= 0) return Infinity;
  
  // Stirling's approximation for large values
  if (z > 10) return Math.sqrt(2 * Math.PI / z) * Math.pow(z / Math.E, z);
  
  // Special case: gamma(0.5) = sqrt(π)
  if (Math.abs(z - 0.5) < 0.01) return Math.sqrt(Math.PI);
  
  // Lanczos approximation for better accuracy (iterative, no recursion)
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  }
  
  z -= 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) {
    x += coef[i] / (z + i);
  }
  
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

module.exports = {
  loadPlayerStats,
  loadTeamStats,
  preloadCache,
  projectSOGElite,
  calculateZINBProbability
};
