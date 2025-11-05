import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import axios from 'axios';
import open from 'open';
import { logger } from '../util/logger.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRETS_DIR = path.join(__dirname, '../../.secrets');
const TOKENS_FILE = path.join(SECRETS_DIR, 'yahoo.json');

// Ensure secrets directory exists
await fs.mkdir(SECRETS_DIR, { recursive: true }).catch(() => {});

const YAHOO_AUTH_URL = 'https://api.login.yahoo.com/oauth2/request_auth';
const YAHOO_TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';

export async function runOAuthFlow() {
  const clientId = process.env.YAHOO_CLIENT_ID;
  const clientSecret = process.env.YAHOO_CLIENT_SECRET;
  const redirectUri = process.env.YAHOO_REDIRECT_URI;
  
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Yahoo OAuth credentials in .env file');
  }
  
  return new Promise((resolve, reject) => {
    const app = express();
    let server;
    
    // Extract port from redirect URI
    const port = new URL(redirectUri).port || 5173;
    
    // OAuth callback endpoint
    app.get('/oauth/callback', async (req, res) => {
      const { code, error } = req.query;
      
      if (error) {
        res.send(`<h1>❌ Authentication Failed</h1><p>${error}</p>`);
        server.close();
        reject(new Error(`Yahoo OAuth error: ${error}`));
        return;
      }
      
      if (!code) {
        res.send('<h1>❌ No authorization code received</h1>');
        server.close();
        reject(new Error('No authorization code from Yahoo'));
        return;
      }
      
      try {
        // Exchange code for tokens
        const tokenResponse = await axios.post(
          YAHOO_TOKEN_URL,
          new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code: code,
            grant_type: 'authorization_code'
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );
        
        const tokens = {
          access_token: tokenResponse.data.access_token,
          refresh_token: tokenResponse.data.refresh_token,
          expires_at: Date.now() + (tokenResponse.data.expires_in * 1000),
          token_type: tokenResponse.data.token_type
        };
        
        // Save tokens
        await fs.writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2));
        
        res.send(`
          <h1>✅ Authentication Successful!</h1>
          <p>Tokens saved. You can close this window and return to the terminal.</p>
          <script>setTimeout(() => window.close(), 2000)</script>
        `);
        
        server.close();
        resolve(tokens);
      } catch (error) {
        logger.error('Token exchange failed:', error.response?.data || error.message);
        res.send(`<h1>❌ Token Exchange Failed</h1><p>${error.message}</p>`);
        server.close();
        reject(error);
      }
    });
    
    // Start local server
    server = app.listen(port, () => {
      logger.info(`🌐 OAuth callback server running on port ${port}`);
      
      // Build authorization URL
      const authUrl = `${YAHOO_AUTH_URL}?` + new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        language: 'en-us'
      });
      
      logger.info('🔓 Opening browser for Yahoo authentication...');
      logger.info(`If browser doesn't open, visit: ${authUrl}\n`);
      
      // Open browser
      open(authUrl);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      logger.error('Server error:', error.message);
      reject(error);
    });
  });
}

export async function loadTokens() {
  try {
    const data = await fs.readFile(TOKENS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

export async function saveTokens(tokens) {
  await fs.writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

export async function refreshTokens() {
  const tokens = await loadTokens();
  if (!tokens || !tokens.refresh_token) {
    throw new Error('No refresh token available. Run: ff-sitstart auth');
  }
  
  const clientId = process.env.YAHOO_CLIENT_ID;
  const clientSecret = process.env.YAHOO_CLIENT_SECRET;
  const redirectUri = process.env.YAHOO_REDIRECT_URI;
  
  try {
    const response = await axios.post(
      YAHOO_TOKEN_URL,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const newTokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || tokens.refresh_token,
      expires_at: Date.now() + (response.data.expires_in * 1000),
      token_type: response.data.token_type
    };
    
    await saveTokens(newTokens);
    logger.debug('Tokens refreshed successfully');
    
    return newTokens;
  } catch (error) {
    logger.error('Token refresh failed:', error.response?.data || error.message);
    throw new Error('Token refresh failed. Run: ff-sitstart auth');
  }
}

export async function ensureAuth() {
  let tokens = await loadTokens();
  
  if (!tokens) {
    throw new Error('Not authenticated. Run: ff-sitstart auth');
  }
  
  // Check if expired (with 5 minute buffer)
  if (Date.now() >= tokens.expires_at - (5 * 60 * 1000)) {
    logger.debug('Access token expired, refreshing...');
    tokens = await refreshTokens();
  }
  
  return tokens;
}

export async function getAccessToken() {
  const tokens = await ensureAuth();
  return tokens.access_token;
}
