// netlify/functions/blobs-get/index.cjs
// FINAL FIX: Fetch the actual data from the signed URL

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

    console.log(`Fetching blob data: ${key}`);

    // Get environment variables
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

    // Import fetch dynamically
    const fetch = (await import('node-fetch')).default;
    
    // Step 1: Get signed URL from Netlify Blobs API
    const blobUrl = `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/blobs/${key}`;
    
    const urlResponse = await fetch(blobUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${NETLIFY_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!urlResponse.ok) {
      console.log(`Blob not found: ${key} (${urlResponse.status})`);
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Blob not found',
          key: key,
          status: urlResponse.status,
          message: 'Data may not have been collected yet. Run player data collection first.'
        })
      };
    }

    const urlData = await urlResponse.json();
    console.log(`Got signed URL for: ${key}`);

    // Step 2: Fetch actual data from the signed URL
    if (!urlData.url) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'No signed URL returned',
          key: key
        })
      };
    }

    const dataResponse = await fetch(urlData.url);
    
    if (!dataResponse.ok) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Failed to fetch data from signed URL',
          status: dataResponse.status
        })
      };
    }

    const actualData = await dataResponse.json();
    console.log(`Successfully retrieved data for: ${key}`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify(actualData)
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
