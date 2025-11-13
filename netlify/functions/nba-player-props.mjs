/**
 * Backward-compatible endpoint for old nba-player-props page
 * Serves the old JSON format from static file
 */

export default async (req, context) => {
  try {
    // Read the static JSON file (old format)
    const baseUrl = process.env.URL || 'https://bgroundrobin.com';
    const jsonUrl = `${baseUrl}/data/nba/nba-player-props-live.json`;
    
    const response = await fetch(jsonUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch predictions: ${response.status}`);
    }
    
    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      }
    });
    
  } catch (error) {
    console.error('Error serving old format:', error);
    
    return new Response(JSON.stringify({
      error: 'Failed to load predictions',
      message: error.message,
      predictions: []
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

export const config = {
  path: "/api/nba-player-props"
};
