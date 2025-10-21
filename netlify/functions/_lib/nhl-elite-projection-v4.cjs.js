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
  try {
    const store = getStore('nhl-stats');
    let data = await store.get('player_stats_20242025', { type: 'json' });
    if (!data || !data.players || data.players.length === 0) {
      const ghUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main42/data/nhl/player_stats_20242025.json';
      const resp = await fetch(ghUrl);
      if (resp.ok) {
        const ghData = await resp.json();
        if (ghData && ghData.players && ghData.players.length > 0) {
          try { await store.setJSON('player_stats_20242025', ghData); } catch {}
          data = ghData;
        }
      }
    }
    if (data && data.players) {
      PLAYER_CACHE = data.players;
      CACHE_TIMESTAMP = Date.now();
      return PLAYER_CACHE;
    }
    return [];
  } catch {
    return [];
  }
}

async function loadTeamStats() {
  if (TEAM_CACHE && CACHE_TIMESTAMP && (Date.now() - CACHE_TIMESTAMP < CACHE_TTL)) {
    return TEAM_CACHE;
  }
  try {
    const store = getStore('nhl-stats');
    let data = await store.get('team_stats_20242025', { type: 'json' });
    if (!data || !data.teams || Object.keys(data.teams).length === 0) {
      const ghUrl = 'https://raw.githubusercontent.com/bgoldman22-code/RRMODEL/main42/data/nhl/team_stats_20242025.json';
      const resp = await fetch(ghUrl);
      if (resp.ok) {
        const ghData = await resp.json();
        if (ghData && ghData.teams && Object.keys(ghData.teams).length > 0) {
          try { await store.setJSON('team_stats_20242025', ghData); } catch {}
          data = ghData;
        }
      }
    }
    if (data && data.teams) {
      TEAM_CACHE = data.teams;
      return TEAM_CACHE;
    }
    return {};
  } catch {
    return {};
  }
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
  if (!player) return null;
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
  if (direction === 'UNDER') return calculateZINBCDF(mu, r, pi, line);
  return 1 - calculateZINBCDF(mu, r, pi, line - 0.01);
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
  if (z > 10) return Math.sqrt(2 * Math.PI / z) * Math.pow(z / Math.E, z);
  if (Math.abs(z - 0.5) < 0.01) return Math.sqrt(Math.PI);
  if (z < 1) return gamma(z + 1) / z;
  return (z - 1) * gamma(z - 1);
}

module.exports = {
  loadPlayerStats,
  loadTeamStats,
  preloadCache,
  projectSOGElite,
  calculateZINBProbability
};
