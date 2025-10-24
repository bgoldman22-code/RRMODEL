// netlify/functions/nfl-predictions-generate-v2.mjs
// V2 Trigger: Starts background function and returns immediately
// The actual generation happens in nfl-predictions-generate-v2-background

export default async (request, context) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // Parse season parameter
    const url = new URL(request.url);
    const season = url.searchParams.get('season') || '2025';

    // Trigger background function
    const baseUrl = process.env.URL || 'https://bgroundrobin.com';
    const backgroundUrl = `${baseUrl}/.netlify/functions/nfl-predictions-generate-v2-background?season=${season}`;
    
    console.log(`🚀 V2: Triggering background generation for season ${season}`);
    
    // Fire and forget - don't wait for response
    fetch(backgroundUrl, {
      method: 'GET',
      headers: { 'X-Background-Trigger': 'true' }
    }).catch(err => {
      console.error('Background trigger error (non-fatal):', err.message);
    });

    // Return immediately
    return new Response(JSON.stringify({
      status: 'triggered',
      message: 'V2 prediction generation started in background',
      season: season,
      estimatedTime: '1-2 minutes',
      checkStatus: `/.netlify/functions/nfl-predictions-get-v2`,
      note: 'Predictions will be available shortly. Refresh the page or click "Load & Compare" in a minute.',
      timestamp: new Date().toISOString()
    }), {
      status: 202, // Accepted
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Prediction-Version': 'v2-had',
        'X-Generation-Status': 'background-triggered'
      }
    });

  } catch (error) {
    console.error('[V2_TRIGGER_ERROR]', error);
    return new Response(JSON.stringify({
      status: 'error',
      message: 'Failed to trigger V2 generation',
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
