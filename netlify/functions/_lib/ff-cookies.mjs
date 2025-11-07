/**
 * Cookie-based Authentication Utilities
 * 
 * Provides helper functions for managing OAuth tokens via HTTP-only cookies.
 * This ensures each browser/user has their own tokens (no cross-user leakage).
 * 
 * Cookie Structure:
 * - ff_access_token: Current access token
 * - ff_refresh_token: Refresh token for getting new access tokens
 * - ff_expires_at: Timestamp when access token expires
 * - ff_token_type: Usually "Bearer"
 * - ff_yahoo_guid: Yahoo user GUID
 * 
 * Key Features:
 * - Auto-refresh expired tokens with 5-minute buffer
 * - Returns updated cookies in response headers
 * - Per-browser security (no shared server storage)
 */

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Extract token data from request cookies
 * @param {string} cookieHeader - Raw cookie header string
 * @returns {Object|null} Token object or null if not found
 */
export function getTokensFromCookies(cookieHeader) {
  if (!cookieHeader) {
    console.log('No cookies found in request');
    return null;
  }

  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const [key, value] = cookie.trim().split('=');
    cookies[key] = value;
  });

  const accessToken = cookies.ff_access_token;
  const refreshToken = cookies.ff_refresh_token;
  const expiresAt = cookies.ff_expires_at ? parseInt(cookies.ff_expires_at, 10) : null;
  const tokenType = cookies.ff_token_type;
  const yahooGuid = cookies.ff_yahoo_guid;

  if (!accessToken || !refreshToken || !expiresAt) {
    console.log('Incomplete token data in cookies');
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    token_type: tokenType,
    xoauth_yahoo_guid: yahooGuid
  };
}

/**
 * Refresh expired access token using refresh token
 * @param {string} refreshToken - The refresh token from cookies
 * @returns {Promise<Object|null>} New token object or null if refresh failed
 */
export async function refreshTokens(refreshToken) {
  try {
    const clientId = process.env.YAHOO_CLIENT_ID;
    const clientSecret = process.env.YAHOO_CLIENT_SECRET;
    const redirectUri = process.env.YAHOO_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Missing required environment variables for token refresh');
    }

    const tokenUrl = 'https://api.login.yahoo.com/oauth2/get_token';
    const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    console.log('Refreshing expired access token...');
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        redirect_uri: redirectUri
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token refresh failed:', response.status, errorText);
      return null;
    }

    const tokenData = await response.json();
    
    // Calculate new expiry with 2-minute buffer
    const expiresAt = Date.now() + (tokenData.expires_in * 1000) - (2 * 60 * 1000);

    const newTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      token_type: tokenData.token_type,
      xoauth_yahoo_guid: tokenData.xoauth_yahoo_guid
    };

    console.log('Tokens refreshed successfully');
    console.log(`New token expires at: ${new Date(expiresAt).toISOString()}`);

    return newTokens;
  } catch (error) {
    console.error('Error refreshing tokens:', error.message);
    return null;
  }
}

/**
 * Generate Set-Cookie headers for updated tokens
 * @param {Object} tokens - Token object with access_token, refresh_token, expires_at
 * @returns {Array<string>} Array of Set-Cookie header strings
 */
export function generateTokenCookies(tokens) {
  const cookieExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const cookieExpiryString = cookieExpiry.toUTCString();
  const cookieOptions = `HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${cookieExpiryString}`;
  
  const cookies = [
    `ff_access_token=${tokens.access_token}; ${cookieOptions}`,
    `ff_refresh_token=${tokens.refresh_token}; ${cookieOptions}`,
    `ff_expires_at=${tokens.expires_at}; ${cookieOptions}`,
    `ff_token_type=${tokens.token_type || 'Bearer'}; ${cookieOptions}`
  ];
  
  if (tokens.xoauth_yahoo_guid) {
    cookies.push(`ff_yahoo_guid=${tokens.xoauth_yahoo_guid}; ${cookieOptions}`);
  }

  return cookies;
}

/**
 * Ensure we have a valid access token (auto-refresh if expired)
 * Returns token and updated cookies to send in response
 * @param {string} cookieHeader - Raw cookie header from request
 * @returns {Promise<{accessToken: string, cookies?: Array<string>}|null>}
 */
export async function ensureAuth(cookieHeader) {
  try {
    const tokens = getTokensFromCookies(cookieHeader);
    
    if (!tokens) {
      console.error('No tokens found in cookies - user needs to complete OAuth flow');
      return null;
    }

    // Check if token is expired or will expire soon (5-min buffer)
    const now = Date.now();
    const expiresAt = tokens.expires_at;

    if (now + TOKEN_REFRESH_BUFFER_MS >= expiresAt) {
      console.log('Access token expired or expiring soon - refreshing...');
      const newTokens = await refreshTokens(tokens.refresh_token);
      
      if (!newTokens) {
        console.error('Token refresh failed - user needs to re-authenticate');
        return null;
      }

      // Return new token + cookies to update in response
      return {
        accessToken: newTokens.access_token,
        cookies: generateTokenCookies(newTokens)
      };
    }

    // Token is still valid, no need to update cookies
    console.log('Access token is valid');
    return {
      accessToken: tokens.access_token
    };
  } catch (error) {
    console.error('Error ensuring auth:', error.message);
    return null;
  }
}
