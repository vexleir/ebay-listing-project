const axios = require('axios');
const { getDb } = require('./db');

const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory'
].join(' ');

function tokenDocId(companyId) {
  return `${companyId}_tokens`;
}

async function getTokens(companyId) {
  const db = await getDb();
  const doc = await db.collection('tokens').findOne({ _id: tokenDocId(companyId) });
  return doc || null;
}

async function saveTokens(companyId, tokens) {
  if (tokens.expires_in) {
    tokens.expires_at = Date.now() + (tokens.expires_in * 1000) - (5 * 60 * 1000);
  }
  if (tokens.refresh_token_expires_in) {
    tokens.refresh_token_expires_at = Date.now() + (tokens.refresh_token_expires_in * 1000);
  }

  const db = await getDb();
  const { _id, ...existing } = (await getTokens(companyId)) || {};
  const updatedTokens = { ...existing, ...tokens };
  console.log(`[saveTokens] company=${companyId} refresh_token_expires_at:`, updatedTokens.refresh_token_expires_at);
  await db.collection('tokens').updateOne(
    { _id: tokenDocId(companyId) },
    { $set: updatedTokens },
    { upsert: true }
  );
  console.log('[saveTokens] saved successfully');
}

function getAuthUrl(companyId) {
  const clientId = process.env.EBAY_CLIENT_ID;
  const ruName = process.env.EBAY_RU_NAME;

  if (!clientId || !ruName) {
    throw new Error('EBAY_CLIENT_ID or EBAY_RU_NAME missing in .env');
  }

  // Encode companyId in state param so the callback knows which company to store tokens for
  const state = Buffer.from(companyId || 'default').toString('base64');

  const url = new URL('https://auth.ebay.com/oauth2/authorize');
  url.searchParams.append('client_id', clientId);
  url.searchParams.append('response_type', 'code');
  url.searchParams.append('redirect_uri', ruName);
  url.searchParams.append('scope', SCOPES);
  url.searchParams.append('state', state);

  return url.toString();
}

async function exchangeCodeForToken(code, companyId) {
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

  await saveTokens(companyId, response.data);
  return response.data;
}

async function getValidAccessToken(companyId) {
  let tokens = await getTokens(companyId);

  if (!tokens || !tokens.refresh_token) {
    // Fallback to env token (legacy / single-company setups)
    if (process.env.EBAY_OAUTH_TOKEN && process.env.EBAY_OAUTH_TOKEN !== 'YOUR_EBAY_TOKEN_HERE') {
      return process.env.EBAY_OAUTH_TOKEN;
    }
    throw new Error('Not connected to eBay. Please connect your account.');
  }

  if (tokens.access_token && tokens.expires_at > Date.now()) {
    return tokens.access_token;
  }

  console.log(`[ebayAuth] Access token expired for company=${companyId}. Refreshing...`);
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

  await saveTokens(companyId, response.data);
  return response.data.access_token;
}

async function hasValidSession(companyId) {
  const tokens = await getTokens(companyId);
  if (tokens && tokens.refresh_token && tokens.refresh_token_expires_at > Date.now()) {
    return true;
  }
  return !!(process.env.EBAY_OAUTH_TOKEN && process.env.EBAY_OAUTH_TOKEN !== 'YOUR_EBAY_TOKEN_HERE');
}

async function getTokenExpiry(companyId) {
  const tokens = await getTokens(companyId);
  return {
    refresh_token_expires_at: tokens?.refresh_token_expires_at || null
  };
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  getValidAccessToken,
  hasValidSession,
  getTokenExpiry,
};
