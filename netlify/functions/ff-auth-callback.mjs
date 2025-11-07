/**
 * OAuth Callback Function
 * 
 * Exchanges Yahoo OAuth authorization code for access + refresh tokens
 * and saves them to HTTP-only cookies (PER-USER, not shared).
 * 
 * Flow:
 * 1. User clicks ff-auth-start → redirected to Yahoo consent
 * 2. Yahoo redirects back here with ?code=xyz
 * 3. We exchange code for tokens via POST to Yahoo token endpoint
 * 4. Set HTTP-only secure cookies with tokens (browser-specific)
 * 5. Return HTML success page
 * 
 * Environment Variables Required:
 * - YAHOO_CLIENT_ID: Yahoo OAuth client ID
 * - YAHOO_CLIENT_SECRET: Yahoo OAuth client secret
 * - YAHOO_REDIRECT_URI: Must match the registered redirect URI
 * 
 * SECURITY: Tokens are stored in HTTP-only cookies per browser,
 * preventing cross-user token leakage that occurred with Blobs storage.
 */

export const handler = async (event, context) => {
  console.log('ff-auth-callback invoked with code:', event.queryStringParameters?.code ? 'present' : 'missing');
  
  try {
    // Extract authorization code from query string
    const code = event.queryStringParameters?.code;
    
    if (!code) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Missing authorization code',
          message: 'No code parameter found in query string. Did you complete the OAuth flow?'
        })
      };
    }

    // Load environment variables
    const clientId = process.env.YAHOO_CLIENT_ID;
    const clientSecret = process.env.YAHOO_CLIENT_SECRET;
    const redirectUri = process.env.YAHOO_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('Missing required environment variables for token exchange');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Server configuration error',
          message: 'Missing required environment variables'
        })
      };
    }

    // Exchange code for tokens
    console.log('Starting token exchange with Yahoo...');
    const tokenUrl = 'https://api.login.yahoo.com/oauth2/get_token';
    const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    console.log('Sending POST to Yahoo token endpoint...');
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', tokenResponse.status, errorText);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Token exchange failed',
          message: 'Yahoo API returned an error during token exchange',
          status: tokenResponse.status,
          details: errorText
        })
      };
    }

    console.log('Token exchange successful, parsing response...');
    const tokenData = await tokenResponse.json();
    console.log('Token data received:', Object.keys(tokenData));
    
    // Extract tokens and calculate expiry
    const {
      access_token,
      refresh_token,
      expires_in,
      token_type,
      xoauth_yahoo_guid
    } = tokenData;

    if (!access_token || !refresh_token) {
      console.error('Invalid token response:', Object.keys(tokenData));
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Invalid token response',
          message: 'Yahoo API did not return expected tokens'
        })
      };
    }

    // Calculate expiry timestamp with 2-minute buffer for clock skew
    const expiresAt = Date.now() + (expires_in * 1000) - (2 * 60 * 1000);

    console.log('Setting HTTP-only cookies for token storage...');
    
    // Create cookie expiry date (30 days from now)
    const cookieExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const cookieExpiryString = cookieExpiry.toUTCString();
    
    // Set secure HTTP-only cookies (per-browser, not shared across users)
    const isProduction = process.env.CONTEXT === 'production';
    const cookieOptions = `HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${cookieExpiryString}`;
    
    console.log('OAuth tokens saved to HTTP-only cookies (per-user)');
    console.log(`Token expires at: ${new Date(expiresAt).toISOString()}`);
    console.log(`Cookie expires at: ${cookieExpiryString}`);

    // Redirect back to the fantasy sit/start page
    return {
      statusCode: 302,
      headers: { 
        'Location': '/fantasy-sitstart?auth=success',
        'Cache-Control': 'no-cache'
      },
      multiValueHeaders: {
        'Set-Cookie': [
          `ff_access_token=${access_token}; ${cookieOptions}`,
          `ff_refresh_token=${refresh_token}; ${cookieOptions}`,
          `ff_expires_at=${expiresAt}; ${cookieOptions}`,
          `ff_token_type=${token_type}; ${cookieOptions}`,
          ...(xoauth_yahoo_guid ? [`ff_yahoo_guid=${xoauth_yahoo_guid}; ${cookieOptions}`] : [])
        ]
      },
      body: ''
    };

  } catch (error) {
    console.error('OAuth callback error:', error.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
