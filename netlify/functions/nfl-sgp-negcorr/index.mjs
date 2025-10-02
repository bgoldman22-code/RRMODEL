// netlify/functions/nfl-sgp-negcorr/index.mjs
// NFL SGP Negative Correlation Endpoint
// Generates Explosive & Steady Playmaker picks for same-game parlays

import { scanSlate } from '../_lib/nfl-sgp-negcorr.mjs';
import { recommendUnits } from '../_lib/kelly-hybrid-staking.mjs';
import fs from 'fs';
import path from 'path';

/**
 * Load player receiving stats
 */
async function loadPlayerStats() {
  const dataPath = path.join(process.cwd(), 'data', 'player_receiving_stats_2025.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  return data;
}

/**
 * Load defensive receiving metrics
 */
async function loadDefenseStats() {
  const dataPath = path.join(process.cwd(), 'data', 'defense_receiving_allow_2025.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  return data;
}

/**
 * Build game contexts from schedule and injury data
 */
async function buildGameContexts(week = 5) {
  // TODO: Wire to actual schedule fetch
  // For now, mock contexts for testing
  const mockContexts = [
    {
      team: 'MIA',
      opponent: 'NE',
      projPassAttempts: 38,
      script: 'positive',
      availabilityConf: 0.85
    },
    {
      team: 'NE',
      opponent: 'MIA',
      projPassAttempts: 32,
      script: 'negative',
      availabilityConf: 0.80
    },
    {
      team: 'BUF',
      opponent: 'BAL',
      projPassAttempts: 36,
      script: 'neutral',
      availabilityConf: 0.88
    },
    {
      team: 'BAL',
      opponent: 'BUF',
      projPassAttempts: 33,
      script: 'neutral',
      availabilityConf: 0.90
    },
    {
      team: 'KC',
      opponent: 'NO',
      projPassAttempts: 34,
      script: 'positive',
      availabilityConf: 0.92
    },
    {
      team: 'NO',
      opponent: 'KC',
      projPassAttempts: 40,
      script: 'negative',
      availabilityConf: 0.75
    }
  ];
  
  return mockContexts;
}

/**
 * Apply Kelly staking to candidates
 */
function applyKellyStaking(candidates) {
  return candidates.map(candidate => {
    // Build signals for Kelly
    const signals = {
      edgePct: 0, // Will be calculated once we have SGP odds
      clvPts: 0,
      lineMoveToward: 0,
      ticketsPct: 50,
      handlePct: 50,
      availabilityConf: candidate.inputs.availabilityConf,
      marketShockActive: false,
      injurySwingPts: 0,
      injuryConfirmedHours: 999,
      modelCalibration: 0.75, // Conservative for new model
      backtestRoi: 0,
      primetimeGame: false,
      crossModelAgree: false,
      rookieOrUnprovenQB: false,
      highCorrelation: false
    };
    
    // Assume standard -110 SGP pricing for Kelly calc
    // User will provide actual odds for calibration
    const kellyResult = recommendUnits(
      candidate.trueProbability,
      1.909, // -110 decimal
      signals,
      10 // 10U bankroll
    );
    
    return {
      ...candidate,
      kellyUnits: kellyResult.units,
      kellyTier: kellyResult.recommendation,
      kellyReason: kellyResult.reason
    };
  });
}

/**
 * Filter and rank candidates
 */
function filterCandidates(candidates) {
  return candidates
    .filter(c => {
      // Minimum probability threshold
      if (c.trueProbability < 0.20) return false;
      
      // Minimum availability confidence
      if (c.inputs.availabilityConf < 0.70) return false;
      
      // Reasonable target projections
      if (c.inputs.projTargets < 2) return false;
      
      return true;
    })
    .slice(0, 20); // Top 20 candidates
}

export default async (request, context) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    
    console.log('🎯 NFL SGP Negative Correlation Scanner');
    
    // Parse request
    const url = new URL(request.url);
    const week = parseInt(url.searchParams.get('week') || '5');
    
    // Load data
    console.log('📊 Loading player stats...');
    const playerStats = await loadPlayerStats();
    
    console.log('🛡️ Loading defensive metrics...');
    const defenseStats = await loadDefenseStats();
    
    console.log('📅 Building game contexts...');
    const gameContexts = await buildGameContexts(week);
    
    // Scan slate
    console.log('🔍 Scanning for negative correlation opportunities...');
    const rawCandidates = scanSlate(playerStats, gameContexts, defenseStats);
    
    // Filter and rank
    const filteredCandidates = filterCandidates(rawCandidates);
    
    // Apply Kelly staking
    const stakedCandidates = applyKellyStaking(filteredCandidates);
    
    // Separate by archetype
    const explosiveCandidates = stakedCandidates.filter(c => c.archetype === 'Explosive Playmaker');
    const steadyCandidates = stakedCandidates.filter(c => c.archetype === 'Steady Playmaker');
    
    // Build response
    const response = {
      slate: `2025-week-${week}`,
      generated: new Date().toISOString(),
      candidates: stakedCandidates,
      summary: {
        totalCandidates: stakedCandidates.length,
        explosivePlaymakers: explosiveCandidates.length,
        steadyPlaymakers: steadyCandidates.length,
        avgTrueProbability: (stakedCandidates.reduce((sum, c) => sum + c.trueProbability, 0) / stakedCandidates.length).toFixed(3),
        avgKellyUnits: (stakedCandidates.reduce((sum, c) => sum + c.kellyUnits, 0) / stakedCandidates.length).toFixed(2)
      },
      note: 'SGP odds not yet integrated - provide DK pricing for calibration',
      disclaimer: 'Model probabilities are directional. Validate with actual SGP odds before betting.'
    };
    
    console.log(`✅ Generated ${response.summary.totalCandidates} candidates (${explosiveCandidates.length} Explosive, ${steadyCandidates.length} Steady)`);
    
    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('❌ SGP scanner error:', error);
    
    return new Response(JSON.stringify({
      error: 'SGP scanner failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
