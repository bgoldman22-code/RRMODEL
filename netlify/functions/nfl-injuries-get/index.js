// netlify/functions/nfl-injuries-get/index.js
// Simple endpoint to expose injury data for debugging

import { loadInjuries } from '../_lib/blobs-nfl.js';

export default async (request, context) => {
  try {
    console.log('🔍 Debug: Loading injury data...');
    const injuryData = await loadInjuries();
    
    console.log('🔍 Debug: Injury data loaded:', {
      hasData: !!injuryData,
      hasTeams: !!(injuryData && injuryData.teams),
      teamCount: injuryData && injuryData.teams ? Object.keys(injuryData.teams).length : 0
    });
    
    return new Response(JSON.stringify(injuryData), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    console.error('❌ Injury data endpoint error:', error);
    
    return new Response(JSON.stringify({
      error: 'Failed to load injury data',
      message: error.message,
      teams: {},
      asOf: null
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};