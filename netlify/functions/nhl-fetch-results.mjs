/**
 * NHL PREDICTION RESULTS FETCHER
 * 
 * Endpoint: /.netlify/functions/nhl-fetch-results?date=2025-10-30
 * 
 * Fetches actual game results and updates predictions with outcomes
 * Run this the day after games to update predictions with actual SOG
 */

import { fetchPredictionResults } from './_lib/nhl-prediction-logger.mjs';

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
    // Get date from query params (default to yesterday)
    const params = event.queryStringParameters || {};
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const defaultDate = yesterday.toISOString().split('T')[0];
    
    const date = params.date || defaultDate;
    
    console.log(`📊 Fetching results for ${date}...`);
    
    const results = await fetchPredictionResults(date);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        date,
        ...results,
        message: results.error 
          ? 'Failed to fetch results' 
          : `Updated ${results.updated}/${results.total} predictions`,
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('❌ Results fetcher error:', error);
    
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
