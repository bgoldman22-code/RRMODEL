import { getUserLeagues, getCurrentGameKey } from './_lib/ff-yahoo.mjs';
import { ensureAuth } from './_lib/ff-cookies.mjs';

export async function handler(event) {
  console.log('🏈 [ff-get-leagues] Request received');

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    // Extract and validate access token from cookies
    const cookieHeader = event.headers.cookie || '';
    const authResult = await ensureAuth(cookieHeader);
    
    if (!authResult) {
      console.log('❌ No valid authentication found');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          error: 'Not authenticated',
          message: 'Please authenticate with Yahoo first' 
        }),
      };
    }

    const accessToken = authResult.accessToken;
    const updatedCookies = authResult.cookies;
    console.log('✅ Access token validated');

    // Get current game key (NFL season)
    const gameKey = await getCurrentGameKey();
    console.log(`🏈 Current game key: ${gameKey}`);

    // Fetch user's leagues for this season
    const leagues = await getUserLeagues(accessToken, gameKey);
    console.log(`📋 Found ${leagues.length} leagues`);

    if (!leagues || leagues.length === 0) {
      console.log('⚠️ No leagues found for user');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify([]),
      };
    }

    // Format leagues for dropdown
    const formattedLeagues = leagues.map(league => ({
      league_key: league.league_key,
      name: league.name || 'Unnamed League',
      season: league.season || gameKey.split('.')[0],
    }));

    console.log(`✅ Returning ${formattedLeagues.length} leagues`);
    
    // Build response
    const response = {
      statusCode: 200,
      headers,
      body: JSON.stringify(formattedLeagues),
    };
    
    // Add updated cookies if token was refreshed (using multiValueHeaders)
    if (updatedCookies) {
      response.multiValueHeaders = {
        'Set-Cookie': updatedCookies
      };
    }

    return response;

  } catch (error) {
    console.error('❌ Error fetching leagues:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch leagues',
        message: error.message 
      }),
    };
  }
}
