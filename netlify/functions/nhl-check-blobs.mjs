/**
 * Diagnostic endpoint to check what's actually in Netlify Blobs
 */

export default async function handler(req, context) {
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'nhl-stats', siteID: context.site.id, token: context.token });
    
    const seasons = ['20222023', '20232024', '20242025', '20252026'];
    const results = {};
    
    for (const season of seasons) {
      const key = `player_stats_${season}`;
      try {
        const data = await store.get(key, { type: 'json' });
        results[season] = {
          exists: !!data,
          playerCount: data?.players?.length || 0,
          size: JSON.stringify(data || {}).length,
          samplePlayer: data?.players?.[0]?.playerName || 'none'
        };
      } catch (err) {
        results[season] = {
          exists: false,
          error: err.message
        };
      }
    }
    
    // Also check team stats
    try {
      const teamData = await store.get('team_stats_20252026', { type: 'json' });
      results.teams = {
        exists: !!teamData,
        teamCount: teamData?.teams?.length || 0
      };
    } catch (err) {
      results.teams = { exists: false, error: err.message };
    }
    
    return new Response(JSON.stringify({
      message: 'Netlify Blobs diagnostic',
      store: 'nhl-stats',
      seasons: results,
      timestamp: new Date().toISOString()
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to check Blobs',
      message: error.message,
      stack: error.stack
    }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/nhl-check-blobs'
};
