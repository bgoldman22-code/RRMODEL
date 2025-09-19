// netlify/functions/blobs-get/index.cjs
// FIXED: Proper error handling and fetch logic

exports.handler = async (event, context) => {
  try {
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
          error: 'Missing Netlify credentials'
        })
      };
    }

    // Import fetch with better error handling
    let fetch;
    try {
      fetch = (await import('node-fetch')).default;
    } catch (importError) {
      console.error('Failed to import node-fetch:', importError);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Server configuration error',
          message: 'Failed to load fetch module'
        })
      };
    }
    
    // Step 1: Get signed URL
    const blobUrl = `https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/blobs/${key}`;
    
    let urlResponse;
    try {
      urlResponse = await fetch(blobUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${NETLIFY_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (fetchError) {
      console.error('Failed to fetch signed URL:', fetchError);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Failed to connect to Netlify Blobs API',
          message: fetchError.message
        })
      };
    }

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
          message: 'Data collection may not have run yet. Try running the GitHub Action first.'
        })
      };
    }

    let urlData;
    try {
      urlData = await urlResponse.json();
    } catch (jsonError) {
      console.error('Failed to parse URL response:', jsonError);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Invalid response from Netlify Blobs API'
        })
      };
    }

    if (!urlData.url) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'No signed URL returned from Netlify Blobs API'
        })
      };
    }

    console.log(`Got signed URL for: ${key}`);

    // Step 2: Fetch actual data with better error handling
    let dataResponse;
    try {
      dataResponse = await fetch(urlData.url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
    } catch (dataFetchError) {
      console.error('Failed to fetch from signed URL:', dataFetchError);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Failed to fetch data from storage',
          message: dataFetchError.message
        })
      };
    }
    
    if (!dataResponse.ok) {
      console.error(`Data fetch failed: ${dataResponse.status} ${dataResponse.statusText}`);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Failed to fetch data from signed URL',
          status: dataResponse.status,
          statusText: dataResponse.statusText
        })
      };
    }

    let actualData;
    try {
      actualData = await dataResponse.json();
    } catch (dataJsonError) {
      console.error('Failed to parse data as JSON:', dataJsonError);
      // Try to get the raw text to see what we actually received
      try {
        const rawText = await dataResponse.text();
        console.error('Raw response:', rawText.substring(0, 200));
        return {
          statusCode: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            error: 'Data is not valid JSON',
            preview: rawText.substring(0, 100)
          })
        };
      } catch (textError) {
        return {
          statusCode: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            error: 'Failed to parse data'
          })
        };
      }
    }

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
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
