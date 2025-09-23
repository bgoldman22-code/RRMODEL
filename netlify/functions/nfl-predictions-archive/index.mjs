// netlify/functions/nfl-predictions-archive/index.mjs
// Archive predictions and closing lines at kickoff for historical analysis

export default async (req, context) => {
  try {
    const { season, week, games } = JSON.parse(req.body || '{}');
    
    if (!season || !week) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters: season, week' 
      }), { status: 400 });
    }

    const now = new Date();
    
    // Get current predictions for archiving
    const predictionsResponse = await fetch(`${process.env.URL}/.netlify/functions/nfl-predictions-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season: season.toString(), games })
    });

    const currentPredictions = await predictionsResponse.json();

    // Create archive entry
    const archiveEntry = {
      archived_at: now.toISOString(),
      season: parseInt(season),
      week: parseInt(week),
      predictions: currentPredictions.predictions || currentPredictions,
      parlay_suggestions: currentPredictions.parlaySuggestions || [],
      metadata: {
        total_games: games ? games.length : 0,
        archive_trigger: 'manual', // Could be 'scheduled' for auto-archive
        model_version: 'v13_enhanced_epa'
      }
    };

    // In a real implementation, you'd save this to a database or blob storage
    // For now, we'll return the archive structure
    
    return new Response(JSON.stringify({
      success: true,
      message: `Predictions archived for Week ${week}, ${season}`,
      archive: archiveEntry,
      // This would be the storage key in a real system
      storage_key: `predictions/archive/${season}/week${week}_${now.getTime()}.json`
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Archive error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to archive predictions',
      details: error.message 
    }), { status: 500 });
  }
};