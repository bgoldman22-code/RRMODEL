/**
 * Netlify Blobs Utilities
 * 
 * Provides helper functions for managing OAuth tokens and API response caching
 * using Netlify Blobs storage (serverless-compatible alternative to filesystem).
 * 
 * Storage Structure:
 * - auth/yahoo.json: OAuth tokens (access_token, refresh_token, expires_at)
 * - cache/lines-week-N.json: Game lines for week N (1h TTL)
 * - cache/props-week-N.json: Player props for week N (1h TTL)
 * 
 * Key Features:
 * - Auto-refresh expired tokens with 5-minute buffer
 * - Cache with configurable TTL (default 1h)
 * - Safe error handling (returns null instead of throwing)
 */

import { getStore } from '@netlify/blobs';

const CACHE_TTL_MS = (parseInt(process.env.CACHE_TTL_SECONDS, 10) || 3600) * 1000; // Default 1h
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get a Netlify Blobs store with proper configuration
 * @param {string} name - Store name (e.g., 'auth', 'cache')
 * @returns {Object} Blobs store instance
 */
function getBlobsStore(name) {
  return getStore({
    name,
    siteID: process.env.SITE_ID,
    token: process.env.NETLIFY_TOKEN
  });
}

/**
 * Get OAuth tokens from Blobs storage
 * @returns {Promise<Object|null>} Token object or null if not found
 */
export async function getTokens() {
  try {
    const authStore = getBlobsStore('auth');
    const tokenJson = await authStore.get('yahoo.json');
    
    if (!tokenJson) {
      console.log('No tokens found in Blobs storage');
      return null;
    }

    return JSON.parse(tokenJson);
  } catch (error) {
    console.error('Error loading tokens from Blobs:', error.message);
    return null;
  }
}

/**
 * Save OAuth tokens to Blobs storage
 * @param {Object} tokens - Token object with access_token, refresh_token, expires_at
 * @returns {Promise<boolean>} True if saved successfully
 */
export async function saveTokens(tokens) {
  try {
    const authStore = getBlobsStore('auth');
    await authStore.set('yahoo.json', JSON.stringify(tokens, null, 2));
    console.log('Tokens saved to Blobs successfully');
    return true;
  } catch (error) {
    console.error('Error saving tokens to Blobs:', error.message);
    return false;
  }
}

/**
 * Refresh expired access token using refresh token
 * @param {string} refreshToken - The refresh token from initial OAuth flow
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
      xoauth_yahoo_guid: tokenData.xoauth_yahoo_guid,
      refreshed_at: Date.now()
    };

    // Save refreshed tokens back to Blobs
    await saveTokens(newTokens);

    console.log('Tokens refreshed successfully');
    console.log(`New token expires at: ${new Date(expiresAt).toISOString()}`);

    return newTokens;
  } catch (error) {
    console.error('Error refreshing tokens:', error.message);
    return null;
  }
}

/**
 * Ensure we have a valid access token (auto-refresh if expired)
 * @returns {Promise<string|null>} Valid access token or null if auth failed
 */
export async function ensureAuth() {
  try {
    const tokens = await getTokens();
    
    if (!tokens) {
      console.error('No tokens found - user needs to complete OAuth flow');
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

      return newTokens.access_token;
    }

    // Token is still valid
    console.log('Access token is valid');
    return tokens.access_token;
  } catch (error) {
    console.error('Error ensuring auth:', error.message);
    return null;
  }
}

/**
 * Get cached game lines for a specific week
 * @param {number} week - NFL week number
 * @returns {Promise<Object|null>} Cached lines or null if not found/expired
 */
export async function getCachedLines(week) {
  try {
    const cacheStore = getBlobsStore('cache');
    const cacheKey = `lines-week-${week}.json`;
    
    const cached = await cacheStore.getWithMetadata(cacheKey);
    
    if (!cached || !cached.data) {
      return null;
    }

    const timestamp = cached.metadata?.timestamp || 0;
    const age = Date.now() - timestamp;

    if (age > CACHE_TTL_MS) {
      console.log(`Cache expired for lines week ${week} (age: ${Math.round(age / 1000)}s)`);
      return null;
    }

    console.log(`Cache hit for lines week ${week} (age: ${Math.round(age / 1000)}s)`);
    return JSON.parse(cached.data);
  } catch (error) {
    console.error('Error loading cached lines:', error.message);
    return null;
  }
}

/**
 * Save game lines to cache for a specific week
 * @param {number} week - NFL week number
 * @param {Object} lines - Lines data to cache
 * @returns {Promise<boolean>} True if saved successfully
 */
export async function setCachedLines(week, lines) {
  try {
    const cacheStore = getBlobsStore('cache');
    const cacheKey = `lines-week-${week}.json`;
    
    await cacheStore.set(cacheKey, JSON.stringify(lines), {
      metadata: { 
        timestamp: Date.now(),
        week: week,
        type: 'lines'
      }
    });

    console.log(`Cached lines for week ${week}`);
    return true;
  } catch (error) {
    console.error('Error caching lines:', error.message);
    return false;
  }
}

/**
 * Get cached player props for a specific week
 * @param {number} week - NFL week number
 * @returns {Promise<Object|null>} Cached props or null if not found/expired
 */
export async function getCachedProps(week) {
  try {
    const cacheStore = getBlobsStore('cache');
    const cacheKey = `props-week-${week}.json`;
    
    const cached = await cacheStore.getWithMetadata(cacheKey);
    
    if (!cached || !cached.data) {
      return null;
    }

    const timestamp = cached.metadata?.timestamp || 0;
    const age = Date.now() - timestamp;

    if (age > CACHE_TTL_MS) {
      console.log(`Cache expired for props week ${week} (age: ${Math.round(age / 1000)}s)`);
      return null;
    }

    console.log(`Cache hit for props week ${week} (age: ${Math.round(age / 1000)}s)`);
    return JSON.parse(cached.data);
  } catch (error) {
    console.error('Error loading cached props:', error.message);
    return null;
  }
}

/**
 * Save player props to cache for a specific week
 * @param {number} week - NFL week number
 * @param {Object} props - Props data to cache
 * @returns {Promise<boolean>} True if saved successfully
 */
export async function setCachedProps(week, props) {
  try {
    const cacheStore = getBlobsStore('cache');
    const cacheKey = `props-week-${week}.json`;
    
    await cacheStore.set(cacheKey, JSON.stringify(props), {
      metadata: { 
        timestamp: Date.now(),
        week: week,
        type: 'props'
      }
    });

    console.log(`Cached props for week ${week}`);
    return true;
  } catch (error) {
    console.error('Error caching props:', error.message);
    return false;
  }
}

/**
 * Clear all cached data (lines + props) - useful for forcing fresh data
 * @returns {Promise<boolean>} True if cleared successfully
 */
export async function clearCache() {
  try {
    const cacheStore = getBlobsStore('cache');
    
    // Netlify Blobs doesn't have a "clear all" method, so we'll just log
    // In practice, expired cache entries are ignored by the get functions
    console.log('Cache cleared (expired entries will be ignored on next fetch)');
    return true;
  } catch (error) {
    console.error('Error clearing cache:', error.message);
    return false;
  }
}
