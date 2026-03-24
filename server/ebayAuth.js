const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TOKENS_FILE = path.join(__dirname, 'ebay_tokens.json');

const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory'
].join(' ');

function getTokens() {
  if (fs.existsSync(TOKENS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    } catch (e) {
      console.error("Failed to parse ebay_tokens.json");
    }
  }
  return null;
}

function saveTokens(tokens) {
  // Add an expiration timestamp
  if (tokens.expires_in) {
    tokens.expires_at = Date.now() + (tokens.expires_in * 1000) - (5 * 60 * 1000); // 5 mins buffer
  }
  if (tokens.refresh_token_expires_in) {
    tokens.refresh_token_expires_at = Date.now() + (tokens.refresh_token_expires_in * 1000);
  }
  
  // If we're just refreshing the access token, we might not get a new refresh token. Keep the old one.
  const existing = getTokens() || {};
  const updatedTokens = {
    ...existing,
    ...tokens
  };
  
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(updatedTokens, null, 2));
}

function getAuthUrl() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const ruName = process.env.EBAY_RU_NAME;
  
  if (!clientId || !ruName) {
    throw new Error('EBAY_CLIENT_ID or EBAY_RU_NAME missing in .env');
  }

  const url = new URL('https://auth.ebay.com/oauth2/authorize');
  url.searchParams.append('client_id', clientId);
  url.searchParams.append('response_type', 'code');
  url.searchParams.append('redirect_uri', ruName);
  url.searchParams.append('scope', SCOPES);
  
  return url.toString();
}

async function exchangeCodeForToken(code) {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const ruName = process.env.EBAY_RU_NAME;

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', ruName);

  const response = await axios.post('https://api.ebay.com/identity/v1/oauth2/token', params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authHeader}`
    }
  });

  saveTokens(response.data);
  return response.data;
}

async function getValidAccessToken() {
  let tokens = getTokens();
  
  if (!tokens || !tokens.refresh_token) {
    // Fallback to manual token if available
    if (process.env.EBAY_OAUTH_TOKEN && process.env.EBAY_OAUTH_TOKEN !== 'YOUR_EBAY_TOKEN_HERE') {
      return process.env.EBAY_OAUTH_TOKEN;
    }
    throw new Error('Not connected to eBay. Please connect your account.');
  }

  // Check if access token is still valid
  if (tokens.access_token && tokens.expires_at > Date.now()) {
    return tokens.access_token;
  }

  // Refresh token
  console.log('Access token expired. Refreshing token...');
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', tokens.refresh_token);
  params.append('scope', SCOPES);

  const response = await axios.post('https://api.ebay.com/identity/v1/oauth2/token', params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authHeader}`
    }
  });

  saveTokens(response.data);
  return response.data.access_token;
}

function hasValidSession() {
  const tokens = getTokens();
  if (tokens && tokens.refresh_token && tokens.refresh_token_expires_at > Date.now()) {
    return true;
  }
  return !!(process.env.EBAY_OAUTH_TOKEN && process.env.EBAY_OAUTH_TOKEN !== 'YOUR_EBAY_TOKEN_HERE');
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  getValidAccessToken,
  hasValidSession
};
