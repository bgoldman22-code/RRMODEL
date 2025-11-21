/**
 * NBA Player Props V2 - Phase 3 PRA Model
 * Serves Phase 3 PRA predictions from static JSON file
 */

export default async (req, context) => {
  try {
    // Read the V2 static JSON file
    const baseUrl = process.env.URL || 'https://bgroundrobin.com';
    const jsonUrl = `${baseUrl}/data/nba/nba-props-v2-live.json`;
    
    const response = await fetch(jsonUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch V2 predictions: ${response.status}`);
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
    console.error('Error serving V2 predictions:', error);
    
    return new Response(JSON.stringify({
      error: 'Failed to load V2 predictions',
      message: error.message,
      predictions: [],
      season: '2025-26',
      model: 'Phase 3 PRA',
      version: 'phase3_pra_v1_real'
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
  path: "/api/nba-props-v2"
};
