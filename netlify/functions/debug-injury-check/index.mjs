// netlify/functions/debug-injury-check/index.mjs
import { loadInjuries } from '../_lib/blobs-nfl.js';

export const handler = async (event, context) => {
  try {
    console.log('🔥 Starting injury debug check...');
    
    const injuries = await loadInjuries();
    
    const debug = {
      injuriesIsNull: injuries === null,
      injuriesType: typeof injuries,
      hasTeams: !!(injuries && injuries.teams),
      teamCount: injuries && injuries.teams ? Object.keys(injuries.teams).length : 0,
      wasTeam: injuries && injuries.teams && injuries.teams.WAS ? 'has WAS data' : 'no WAS data',
      wasQbStatus: injuries && injuries.teams && injuries.teams.WAS ? injuries.teams.WAS.qb_status : 'no data'
    };
    
    if (injuries && injuries.teams && injuries.teams.WAS) {
      debug.wasInjuryData = injuries.teams.WAS;
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(debug, null, 2)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error.message,
        stack: error.stack
      }, null, 2)
    };
  }
};