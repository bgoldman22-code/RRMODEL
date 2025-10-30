/**
 * NHL PREDICTION STATS VIEWER
 * 
 * Endpoint: /.netlify/functions/nhl-prediction-stats?start=2025-10-01&end=2025-10-31
 * 
 * View performance statistics:
 * - Overall hit rate
 * - Hit rate by edge bucket
 * - Profit/loss
 * - Edge calibration
 */

import { getPerformanceStats } from './_lib/nhl-prediction-logger.mjs';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    const params = event.queryStringParameters || {};
    
    // Default to last 30 days
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const defaultStart = thirtyDaysAgo.toISOString().split('T')[0];
    
    const startDate = params.start || defaultStart;
    const endDate = params.end || today;
    
    console.log(`📊 Getting stats from ${startDate} to ${endDate}...`);
    
    const stats = await getPerformanceStats(startDate, endDate);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...stats,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('❌ Stats viewer error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
}
