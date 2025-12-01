/**
 * Bundesliga BTTS Live Predictions - Netlify Function
 * 
 * Endpoint: /.netlify/functions/bundesliga-btts-predict
 * 
 * POST Request Body:
 * {
 *   "fixtures": [
 *     {
 *       "home_team": "Bayern München",
 *       "away_team": "Borussia Dortmund",
 *       "odds": {
 *         "btts_yes": 1.65,
 *         "btts_no": 2.20
 *       }
 *     }
 *   ]
 * }
 * 
 * Returns: JSON with predictions and betting recommendations
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import { cwd } from 'process';

export const handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Handle GET with auto-fetch
  if (event.httpMethod === 'GET') {
    // GET requests trigger auto-fetch mode
    event.body = JSON.stringify({ auto_fetch: true });
    event.httpMethod = 'POST'; // Process as POST internally
  }

  // Only POST allowed (or GET converted to POST above)
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request
    const body = JSON.parse(event.body || '{}');
    let { fixtures, auto_fetch } = body;

    // Auto-fetch mode: Get fixtures from The Odds API
    if (auto_fetch && process.env.ODDS_API_KEY) {
      console.log('Auto-fetch mode: Fetching fixtures from The Odds API...');
      fixtures = await fetchFixturesFromOddsAPI(process.env.ODDS_API_KEY);
      
      if (fixtures.length === 0) {
        return {
          statusCode: 503,
          headers,
          body: JSON.stringify({
            error: 'No fixtures available',
            message: 'Unable to fetch upcoming Bundesliga fixtures from The Odds API',
          }),
        };
      }
    }

    if (!fixtures || !Array.isArray(fixtures) || fixtures.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid request',
          message: 'Provide an array of fixtures with home_team and away_team, or set auto_fetch: true',
        }),
      };
    }

    // Validate fixture format
    for (const fixture of fixtures) {
      if (!fixture.home_team || !fixture.away_team) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Invalid fixture',
            message: 'Each fixture must have home_team and away_team',
          }),
        };
      }
    }

    // Call Python prediction script
    // In Netlify, working directory is the repo root
    const scriptPath = resolve(cwd(), 'scripts', 'soccer', 'predict_live_bundesliga.py');
    const predictions = await runPythonScript(scriptPath, body);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(predictions),
    };
  } catch (error) {
    console.error('Bundesliga prediction error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Prediction failed',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }),
    };
  }
};

/**
 * Fetch upcoming Bundesliga fixtures from The Odds API
 * Note: BTTS market requires /events/{eventId}/odds endpoint (not /odds)
 */
async function fetchFixturesFromOddsAPI(apiKey) {
  // Step 1: Get all upcoming Bundesliga games
  const eventsUrl = `https://api.the-odds-api.com/v4/sports/soccer_germany_bundesliga/odds/?` +
    `apiKey=${apiKey}&` +
    `regions=eu&` +
    `markets=h2h&` + // Use h2h to get event list
    `oddsFormat=decimal&` +
    `dateFormat=iso`;

  try {
    const eventsResponse = await fetch(eventsUrl);
    
    if (!eventsResponse.ok) {
      throw new Error(`Odds API returned ${eventsResponse.status}: ${eventsResponse.statusText}`);
    }

    const events = await eventsResponse.json();
    console.log(`Found ${events.length} upcoming Bundesliga games`);
    
    // Step 2: Fetch BTTS odds for each event using /events/{eventId}/odds
    const fixtures = [];
    
    for (const event of events) {
      const eventUrl = `https://api.the-odds-api.com/v4/sports/soccer_germany_bundesliga/events/${event.id}/odds?` +
        `apiKey=${apiKey}&` +
        `regions=eu&` +
        `markets=btts&` +
        `oddsFormat=decimal`;
      
      try {
        const oddsResponse = await fetch(eventUrl);
        
        if (!oddsResponse.ok) {
          console.warn(`Failed to fetch BTTS for ${event.home_team} vs ${event.away_team}: ${oddsResponse.status}`);
          continue;
        }
        
        const oddsData = await oddsResponse.json();
        
        // Extract BTTS odds from first bookmaker
        const bookmaker = oddsData.bookmakers?.[0];
        const bttsMarket = bookmaker?.markets?.find(m => m.key === 'btts');
        
        const bttsYes = bttsMarket?.outcomes?.find(o => o.name === 'Yes')?.price || null;
        const bttsNo = bttsMarket?.outcomes?.find(o => o.name === 'No')?.price || null;

        fixtures.push({
          id: event.id,
          home_team: event.home_team,
          away_team: event.away_team,
          commence_time: event.commence_time,
          odds: bttsYes && bttsNo ? {
            btts_yes: bttsYes,
            btts_no: bttsNo,
            bookmaker: bookmaker?.key || 'unknown'
          } : null
        });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Error fetching BTTS for event ${event.id}:`, error.message);
      }
    }
    
    // Check remaining requests
    const remaining = eventsResponse.headers.get('x-requests-remaining');
    if (remaining) {
      console.log(`Odds API requests remaining: ${remaining}`);
    }

    console.log(`Fetched BTTS odds for ${fixtures.length} fixtures`);
    return fixtures;
  } catch (error) {
    console.error('Error fetching from Odds API:', error);
    throw error;
  }
}

/**
 * Run Python prediction script
 */
function runPythonScript(scriptPath, inputData) {
  return new Promise((resolve, reject) => {
    // Use Python from Netlify build environment
    // Netlify installs Python to /opt/buildhome/python3.11/bin/python3.11
    const pythonCmd = process.env.PYTHON_PATH || 
                      '/opt/buildhome/python3.11/bin/python3.11' ||
                      'python3';

    const python = spawn(pythonCmd, [scriptPath], {
      cwd: cwd(),
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    // Send input data via stdin
    python.stdin.write(JSON.stringify(inputData));
    python.stdin.end();

    // Collect output
    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error('Python stderr:', stderr);
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        console.error('Failed to parse Python output:', stdout);
        reject(new Error(`Invalid JSON output from Python: ${e.message}`));
      }
    });

    python.on('error', (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
  });
}
