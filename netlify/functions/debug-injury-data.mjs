// netlify/functions/debug-injury-data.mjs
// Simple diagnostic to check injury data loading in production

import { loadInjuries } from './_lib/blobs-nfl.js';

export const handler = async (event, context) => {
  try {
    console.log('🔍 Loading injury data for diagnostic...');
    const injuries = await loadInjuries();
    
    const teams = injuries?.teams || {};
    const teamKeys = Object.keys(teams);
    
    // Check specific teams for current games
    const currentGames = ['SF', 'TB', 'LAR', 'SEA', 'GB', 'ARI'];
    const teamData = {};
    
    currentGames.forEach(team => {
      const data = teams[team];
      if (data) {
        teamData[team] = {
          hasInjuries: !!data.injuries,
          count: data.injuries?.length || 0,
          players: data.injuries?.map(i => `${i.playerName} (${i.position}) - ${i.status}`) || []
        };
      } else {
        teamData[team] = { hasInjuries: false, count: 0, players: [] };
      }
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        totalTeams: teamKeys.length,
        teamKeys: teamKeys,
        source: injuries?.source || 'unknown',
        asOf: injuries?.asOf || null,
        currentGames: teamData,
        summary: {
          totalInjuries: injuries?.summary?.totalInjuriesFound || 0,
          significantInjuries: injuries?.summary?.significantInjuries || 0
        }
      })
    };
    
  } catch (error) {
    console.error('❌ Injury diagnostic error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
};