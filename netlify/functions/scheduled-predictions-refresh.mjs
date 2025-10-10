// netlify/functions/scheduled-predictions-refresh.mjs
// Regenerates NFL predictions every 30 minutes during game days
// Runs: Every 30min on Thu 8PM-12AM, Sun 1PM-12AM, Mon 8PM-12AM (ET)

export const handler = async (event, context) => {
  console.log('[SCHEDULED] Starting prediction refresh...');
  
  try {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, 4 = Thursday
    const hourUTC = now.getUTCHours();
    
    // Convert to ET (UTC-4 or UTC-5 depending on DST)
    // Simplified: assume UTC-4 for now
    const hourET = hourUTC - 4;
    
    // Only run during game windows
    const isThursday = dayOfWeek === 4 && hourET >= 20 && hourET <= 23; // 8PM-11:59PM ET
    const isSunday = dayOfWeek === 0 && hourET >= 13 && hourET <= 23;   // 1PM-11:59PM ET  
    const isMonday = dayOfWeek === 1 && hourET >= 20 && hourET <= 23;   // 8PM-11:59PM ET
    
    if (!isThursday && !isSunday && !isMonday) {
      console.log('[SCHEDULED] Outside game windows, skipping refresh');
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          status: 'skipped', 
          reason: 'Outside game windows' 
        })
      };
    }
    
    console.log('[SCHEDULED] Inside game window, triggering prediction refresh');
    
    // Trigger prediction generation
    const genUrl = `${process.env.URL || 'https://bgroundrobin.com'}/.netlify/functions/nfl-predictions-generate`;
    
    const response = await fetch(genUrl, {
      method: 'GET', // GET auto-fetches schedule
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`Prediction generation failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    console.log(`[SCHEDULED] ✅ Refreshed ${result.predictions?.length || 0} predictions`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'success',
        predictions_count: result.predictions?.length || 0,
        timestamp: now.toISOString()
      })
    };
    
  } catch (error) {
    console.error('[SCHEDULED] Prediction refresh failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: 'error',
        message: error.message
      })
    };
  }
};

// Schedule: Every 30 minutes
export const config = {
  schedule: "*/30 * * * *" // Every 30 minutes
};
