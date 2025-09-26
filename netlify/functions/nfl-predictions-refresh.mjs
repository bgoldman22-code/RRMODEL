// netlify/functions/nfl-predictions-refresh.mjs
// Manual trigger to refresh predictions using the advanced R Pipeline model

export default async (request, context) => {
  try {
    // Call the advanced predictions model to refresh data
    const baseUrl = process.env.URL || 'https://bgroundrobin.com';
    const response = await fetch(`${baseUrl}/.netlify/functions/nfl-predictions-generate?season=2025`);
    
    if (!response.ok) {
      throw new Error(`Generate predictions failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    return new Response(JSON.stringify({
      ok: true,
      message: 'Predictions refreshed successfully',
      predictions_count: result.predictions?.length || 0,
      parlay_suggestions: result.parlaySuggestions?.length || 0,
      updated_at: new Date().toISOString(),
      next_steps: 'Check /.netlify/functions/nfl-predictions-get for updated predictions'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Failed to refresh predictions',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};