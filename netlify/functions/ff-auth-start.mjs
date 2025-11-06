/**
 * Yahoo OAuth Start - Redirects user to Yahoo consent page
 * 
 * GET /.netlify/functions/ff-auth-start
 * 
 * Requires env vars:
 * - YAHOO_CLIENT_ID
 * - YAHOO_REDIRECT_URI (e.g., https://bgroundrobin.com/.netlify/functions/ff-auth-callback)
 */

export const handler = async (event, context) => {
  try {
    const clientId = process.env.YAHOO_CLIENT_ID;
    const redirectUri = process.env.YAHOO_REDIRECT_URI;
    
    if (!clientId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Missing YAHOO_CLIENT_ID environment variable' 
        })
      };
    }
    
    if (!redirectUri) {
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Missing YAHOO_REDIRECT_URI environment variable' 
        })
      };
    }
    
    // Build Yahoo authorize URL
    const authUrl = new URL('https://api.login.yahoo.com/oauth2/request_auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('language', 'en-us');
    
    // Return redirect
    return {
      statusCode: 302,
      headers: {
        'Location': authUrl.toString(),
        'Cache-Control': 'no-cache'
      },
      body: ''
    };
    
  } catch (error) {
    console.error('OAuth start error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to initiate OAuth flow',
        details: error.message 
      })
    };
  }
};
