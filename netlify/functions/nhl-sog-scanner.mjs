// netlify/functions/nhl-sog-scanner.mjs
// Serverless function to scan NHL SOG props and return top opportunities

import { fetchTodaySchedule } from './_lib/nhl-data-fetch.mjs';
import { projectGameSOG } from './_lib/nhl-projection-engine.mjs';
import { scanFullSlate, calculateKellyStake } from './_lib/nhl-line-scanner.mjs';

/**
 * PRODUCTION NETLIFY FUNCTION
 * GET /api/nhl-sog-scanner?minEdge=5&minConfidence=60&bankroll=10000
 */
export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const minEdge = parseFloat(params.minEdge) || 5;
    const minConfidence = parseFloat(params.minConfidence) || 60;
    const bankroll = parseFloat(params.bankroll) || 10000;
    const kellyFraction = parseFloat(params.kellyFraction) || 0.25;
    
    console.log('NHL SOG Scanner started:', { minEdge, minConfidence, bankroll });
    
    // 1. Fetch today's schedule
    const schedule = await fetchTodaySchedule();
    
    if (schedule.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No NHL games scheduled today',
          data: {
            date: new Date().toISOString().split('T')[0],
            gamesScheduled: 0,
            opportunities: []
          }
        })
      };
    }
    
    console.log(`Found ${schedule.length} games scheduled`);
    
    // 2. Scan full slate for opportunities
    const scanResults = await scanFullSlate(schedule, minEdge, minConfidence);
    
    // 3. Add Kelly stakes to each opportunity
    const opportunitiesWithStakes = scanResults.topOpportunities.map(opp => {
      const kelly = calculateKellyStake(opp.edge, opp.odds, bankroll, kellyFraction);
      
      return {
        ...opp,
        staking: {
          kellyPct: kelly.kellyPct,
          fractionalKellyPct: kelly.fractionalKellyPct,
          recommendedStake: Math.min(kelly.recommendedStake, kelly.maxStake),
          maxStake: kelly.maxStake
        }
      };
    });
    
    // 4. Return results
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          ...scanResults,
          topOpportunities: opportunitiesWithStakes,
          parameters: {
            minEdge,
            minConfidence,
            bankroll,
            kellyFraction
          },
          metadata: {
            scannedAt: new Date().toISOString(),
            apiVersion: '1.0.0',
            model: 'NHL SOG Elite v1.0'
          }
        }
      })
    };
    
  } catch (error) {
    console.error('NHL SOG Scanner error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
}

export default { handler };
