/**
 * NHL PREDICTION CSV EXPORTER
 * 
 * Endpoint: /.netlify/functions/nhl-export-predictions?start=2025-10-01&end=2025-10-31
 * 
 * Exports all predictions to CSV for:
 * - Machine learning training
 * - External analysis in Excel/Python
 * - Backup/archiving
 */

import { exportPredictionsToCSV } from './_lib/nhl-prediction-logger.mjs';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'text/csv',
    'Content-Disposition': 'attachment; filename="nhl_predictions.csv"'
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
    
    console.log(`📊 Exporting predictions from ${startDate} to ${endDate}...`);
    
    const result = await exportPredictionsToCSV(startDate, endDate);
    
    if (result.error) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: result.error,
          timestamp: new Date().toISOString()
        })
      };
    }
    
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Disposition': `attachment; filename="${result.filename}"`
      },
      body: result.csv
    };
    
  } catch (error) {
    console.error('❌ CSV export error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
}
