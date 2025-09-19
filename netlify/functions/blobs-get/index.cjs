// netlify/functions/blobs-get/index.cjs
// CRITICAL: This function enables TD systems to access player data

const { getStore } = require('@netlify/blobs');

exports.handler = async (event, context) => {
  try {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: ''
      };
    }

    // Get blob key from query parameters
    const key = event.queryStringParameters?.key;
    
    if (!key) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Missing key parameter',
          usage: 'GET /.netlify/functions/blobs-get?key=nfl/comprehensive/latest.json'
        })
      };
    }

    console.log(`Fetching blob: ${key}`);

    // Initialize blob store (SAME as NFL predictions system)
    const store = getStore('nfl-data');
    
    // Try to get the blob
    const data = await store.get(key, { type: 'json' });
    
    if (!data) {
      console.log(`Blob not found: ${key}`);
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Blob not found',
          key: key,
          message: 'Data may not have been collected yet. Run player data collection first.'
        })
      };
    }

    console.log(`Successfully retrieved blob: ${key}`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error('Blob access error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Blob access failed',
        message: error.message,
        key: event.queryStringParameters?.key || 'undefined'
      })
    };
  }
};
