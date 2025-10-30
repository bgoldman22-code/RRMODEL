/**
 * MONEYPUCK DATA INTEGRATION
 * 
 * MoneyPuck provides advanced expected goals (xG) and shot quality metrics
 * Source: https://moneypuck.com/data.htm
 * 
 * KEY METRICS:
 * - xGF/xGA: Expected goals for/against (shot quality, not just quantity)
 * - Fenwick: Unblocked shot attempts (better pace proxy than just shots)
 * - Line matchup data: Which lines drive offense/defense
 * - High danger shot metrics: Quality of scoring chances
 * 
 * USE CASE:
 * Refine opponent adjustments with shot quality, not just shot quantity.
 * Team might allow many shots but low danger (good xGA, bad SA).
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'data', 'nhl');
const MP_CACHE_FILE = path.join(CACHE_DIR, 'moneypuck_teams.json');
const CACHE_DURATION_HOURS = 24; // Update daily

/**
 * Download MoneyPuck team data CSV
 * 
 * CSV Format:
 * team, situation, xGoalsPercentage, xGoalsFor, xGoalsAgainst, 
 * shotsOnGoalFor, shotsOnGoalAgainst, fenwickFor, fenwickAgainst, ...
 */
export async function downloadMoneyPuckTeams(season = '2025') {
  try {
    const url = `https://moneypuck.com/moneypuck/playerData/seasonSummary/${season}/regular/teams.csv`;
    
    console.log('📊 Downloading MoneyPuck team data...');
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`MoneyPuck returned ${response.status}`);
    }
    
    const csv = await response.text();
    const teams = parseMoneyPuckCSV(csv);
    
    console.log(`✅ Downloaded MoneyPuck data for ${Object.keys(teams).length} teams`);
    
    return teams;
    
  } catch (error) {
    console.error('❌ Failed to download MoneyPuck data:', error.message);
    return null;
  }
}

/**
 * Parse MoneyPuck CSV into structured data
 * 
 * Focuses on:
 * - 5v5 xGA (expected goals against at even strength)
 * - PP xGA (expected goals against on penalty kill)
 * - High danger shots against
 */
function parseMoneyPuckCSV(csv) {
  const lines = csv.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const teams = {};
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(',');
    const row = {};
    
    headers.forEach((header, idx) => {
      row[header] = values[idx] ? values[idx].trim() : '';
    });
    
    const team = row.team;
    const situation = row.situation; // "5on5", "all", "4on5", "5on4", etc.
    
    if (!team) continue;
    
    if (!teams[team]) {
      teams[team] = {
        team,
        all: {},
        '5v5': {},
        PP: {},  // 5on4
        PK: {}   // 4on5
      };
    }
    
    const stats = {
      xGF: parseFloat(row.xGoalsFor) || 0,
      xGA: parseFloat(row.xGoalsAgainst) || 0,
      xGPct: parseFloat(row.xGoalsPercentage) || 50.0,
      shotsFor: parseFloat(row.shotsOnGoalFor) || 0,
      shotsAgainst: parseFloat(row.shotsOnGoalAgainst) || 0,
      fenwickFor: parseFloat(row.fenwickFor) || 0,
      fenwickAgainst: parseFloat(row.fenwickAgainst) || 0,
      highDangerShotsFor: parseFloat(row.highDangerShotsFor) || 0,
      highDangerShotsAgainst: parseFloat(row.highDangerShotsAgainst) || 0
    };
    
    // Map situations to our strength states
    if (situation === 'all') {
      teams[team].all = stats;
    } else if (situation === '5on5') {
      teams[team]['5v5'] = stats;
    } else if (situation === '5on4') {
      teams[team].PP = stats;  // Offense on PP
    } else if (situation === '4on5') {
      teams[team].PK = stats;  // Defense on PK
    }
  }
  
  return teams;
}

/**
 * Load cached MoneyPuck data or download fresh
 */
export async function getMoneyPuckTeams(useCache = true) {
  if (useCache) {
    try {
      const cached = await fs.readFile(MP_CACHE_FILE, 'utf-8');
      const data = JSON.parse(cached);
      
      // Check cache age
      const cacheAge = Date.now() - data.timestamp;
      const maxAge = CACHE_DURATION_HOURS * 60 * 60 * 1000;
      
      if (cacheAge < maxAge) {
        console.log('✅ Using cached MoneyPuck data');
        return data.teams;
      }
    } catch (error) {
      // Cache doesn't exist, will download
    }
  }
  
  // Download fresh
  const teams = await downloadMoneyPuckTeams();
  
  if (teams) {
    // Save to cache
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(
        MP_CACHE_FILE,
        JSON.stringify({
          timestamp: Date.now(),
          teams
        }, null, 2)
      );
      console.log('💾 Cached MoneyPuck data');
    } catch (error) {
      console.warn('⚠️ Failed to cache MoneyPuck data:', error.message);
    }
  }
  
  return teams;
}

/**
 * Get shot quality adjustment factor
 * 
 * Combines shot quantity (SA) with shot quality (xGA)
 * - Team with high SA but low xGA = good shot suppression quality
 * - Team with low SA but high xGA = bad (allows high danger chances)
 */
export async function getShotQualityFactor(opponent, strengthState = '5v5') {
  const teams = await getMoneyPuckTeams(true);
  
  if (!teams || !teams[opponent]) {
    console.warn(`⚠️ No MoneyPuck data for ${opponent}, using 1.0x`);
    return 1.0;
  }
  
  const oppStats = teams[opponent][strengthState];
  
  if (!oppStats || !oppStats.shotsAgainst || !oppStats.xGA) {
    console.warn(`⚠️ No ${strengthState} data for ${opponent}, using 1.0x`);
    return 1.0;
  }
  
  // Calculate xG per shot (shot quality)
  const xGPerShot = oppStats.xGA / oppStats.shotsAgainst;
  
  // League average xG/shot: ~0.08-0.10 (8-10% shooting percentage)
  const leagueAvgXGPerShot = 0.09;
  
  // If opponent allows higher quality shots, easier matchup
  const qualityFactor = xGPerShot / leagueAvgXGPerShot;
  
  // Limit range (0.85x to 1.15x)
  const boundedFactor = Math.min(1.15, Math.max(0.85, qualityFactor));
  
  console.log(
    `📈 ${opponent} ${strengthState} xG/shot: ${xGPerShot.toFixed(3)} ` +
    `(league avg: ${leagueAvgXGPerShot.toFixed(3)}) → ${boundedFactor.toFixed(3)}x`
  );
  
  return boundedFactor;
}

/**
 * Get Fenwick-based pace adjustment
 * 
 * Fenwick = unblocked shot attempts (shots + missed shots, excludes blocks)
 * Better proxy for offensive pressure than just shots on goal
 */
export async function getFenwickPaceFactor(opponent, strengthState = '5v5') {
  const teams = await getMoneyPuckTeams(true);
  
  if (!teams || !teams[opponent]) {
    return 1.0;
  }
  
  const oppStats = teams[opponent][strengthState];
  
  if (!oppStats || !oppStats.fenwickAgainst) {
    return 1.0;
  }
  
  // League average Fenwick against per 60 (varies by season)
  const leagueAvgFA = strengthState === '5v5' ? 50.0 : 80.0;
  const paceFactor = oppStats.fenwickAgainst / leagueAvgFA;
  
  // Limit range (0.90x to 1.10x)
  const boundedFactor = Math.min(1.10, Math.max(0.90, paceFactor));
  
  console.log(
    `⚡ ${opponent} ${strengthState} Fenwick against: ${oppStats.fenwickAgainst.toFixed(1)} ` +
    `(league avg: ${leagueAvgFA.toFixed(1)}) → ${boundedFactor.toFixed(3)}x`
  );
  
  return boundedFactor;
}

/**
 * Get high danger shot adjustment
 * 
 * Some teams allow many perimeter shots but few high danger chances
 * This is a DEFENSIVE STRENGTH even if SA/60 looks high
 */
export async function getHighDangerFactor(opponent, strengthState = '5v5') {
  const teams = await getMoneyPuckTeams(true);
  
  if (!teams || !teams[opponent]) {
    return 1.0;
  }
  
  const oppStats = teams[opponent][strengthState];
  
  if (!oppStats || !oppStats.shotsAgainst || !oppStats.highDangerShotsAgainst) {
    return 1.0;
  }
  
  // Calculate % of shots that are high danger
  const hdPct = oppStats.highDangerShotsAgainst / oppStats.shotsAgainst;
  
  // League average: ~20-25% of shots are high danger
  const leagueAvgHDPct = 0.22;
  
  // Higher HD% = easier matchup (team allows dangerous chances)
  const hdFactor = hdPct / leagueAvgHDPct;
  
  // Limit range (0.90x to 1.10x)
  const boundedFactor = Math.min(1.10, Math.max(0.90, hdFactor));
  
  console.log(
    `🎯 ${opponent} ${strengthState} HD%: ${(hdPct * 100).toFixed(1)}% ` +
    `(league avg: ${(leagueAvgHDPct * 100).toFixed(1)}%) → ${boundedFactor.toFixed(3)}x`
  );
  
  return boundedFactor;
}

/**
 * Combined quality adjustment
 * 
 * Weights xG quality (60%) + Fenwick pace (25%) + HD% (15%)
 * This gives more complete picture than just SA/60
 */
export async function getCombinedQualityFactor(opponent, strengthState = '5v5') {
  try {
    const [quality, pace, hd] = await Promise.all([
      getShotQualityFactor(opponent, strengthState),
      getFenwickPaceFactor(opponent, strengthState),
      getHighDangerFactor(opponent, strengthState)
    ]);
    
    // Weighted combination
    const combined = (quality * 0.60) + (pace * 0.25) + (hd * 0.15);
    
    console.log(
      `🎲 ${opponent} ${strengthState} combined quality: ` +
      `xG ${quality.toFixed(3)} × Fenwick ${pace.toFixed(3)} × HD ${hd.toFixed(3)} ` +
      `= ${combined.toFixed(3)}x`
    );
    
    return combined;
  } catch (error) {
    console.error(`❌ MoneyPuck combined quality failed for ${opponent} ${strengthState}:`, error.message);
    return 1.0; // Fallback to neutral
  }
}

/**
 * Clear cache (force refresh)
 */
export async function clearMoneyPuckCache() {
  try {
    await fs.unlink(MP_CACHE_FILE);
    console.log('🗑️ Cleared MoneyPuck cache');
  } catch (error) {
    console.warn('⚠️ No cache to clear');
  }
}
