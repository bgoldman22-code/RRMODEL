/**
 * OAuth Callback Function
 * 
 * Exchanges Yahoo OAuth authorization code for access + refresh tokens
 * and saves them to Netlify Blobs for persistent storage.
 * 
 * Flow:
 * 1. User clicks ff-auth-start → redirected to Yahoo consent
 * 2. Yahoo redirects back here with ?code=xyz
 * 3. We exchange code for tokens via POST to Yahoo token endpoint
 * 4. Save tokens to Blobs (auth/yahoo.json) with expiry timestamp
 * 5. Return HTML success page
 * 
 * Environment Variables Required:
 * - YAHOO_CLIENT_ID: Yahoo OAuth client ID
 * - YAHOO_CLIENT_SECRET: Yahoo OAuth client secret
 * - YAHOO_REDIRECT_URI: Must match the registered redirect URI
 */

import { getStore } from '@netlify/blobs';

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

    console.log('Saving tokens to Netlify Blobs...');
    // Save tokens to Netlify Blobs
    const authStore = getStore('auth');
    const tokenPayload = {
      access_token,
      refresh_token,
      expires_at: expiresAt,
      token_type,
      xoauth_yahoo_guid,
      created_at: Date.now()
    };

    await authStore.set('yahoo.json', JSON.stringify(tokenPayload, null, 2));

    console.log('OAuth tokens saved successfully to Blobs');
    console.log(`Token expires at: ${new Date(expiresAt).toISOString()}`);

    // Return HTML success page
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache'
      },
      body: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Yahoo Fantasy OAuth - Success</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 40px;
      max-width: 500px;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    h1 { margin: 0 0 20px 0; font-size: 2em; }
    p { font-size: 1.1em; margin: 15px 0; line-height: 1.6; }
    .checkmark {
      font-size: 4em;
      animation: pop 0.3s ease-out;
    }
    @keyframes pop {
      0% { transform: scale(0); }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); }
    }
    .info {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 15px;
      margin-top: 20px;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="checkmark">✅</div>
    <h1>Authentication Successful!</h1>
    <p>Your Yahoo Fantasy account has been linked.</p>
    <p>You can now close this tab and start using the fantasy sit/start tool.</p>
    <div class="info">
      <strong>Next Steps:</strong><br>
      Call the <code>/ff-run</code> endpoint with your league and team info to get sit/start recommendations.
    </div>
  </div>
</body>
</html>
      `.trim()
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
