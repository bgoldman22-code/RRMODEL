// netlify/functions/blobs-get/index.cjs
// Simple version using direct Netlify API calls

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

    console.log(`Fetching blob via direct API: ${key}`);

    // Use direct Netlify API call (same as your working NFL predictions)
    const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;
    const NETLIFY_SITE_ID = process.env.NETLIFY_SITE_ID;
    
    if (!NETLIFY_TOKEN || !NETLIFY_SITE_ID) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Missing Netlify credentials',
          message: 'NETLIFY_TOKEN or NETLIFY_SITE_ID not configured'
        })
      };
    }

    // Direct blob API call
    const fetch = (await import('node-fetch')).default;
    const blobUrl = `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/blobs/${key}`;
    
    const response = await fetch(blobUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NETLIFY_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(`Blob not found: ${key} (${response.status})`);
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Blob not found',
          key: key,
          status: response.status,
          message: 'Data may not have been collected yet. Run player data collection first.'
        })
      };
    }

    const data = await response.json();
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
