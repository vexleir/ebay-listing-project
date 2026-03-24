const axios = require('axios');
const { MongoClient } = require('mongodb');

let client;
let db;
let tokenCollection;

async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return; // Fallback to memory or env if absolutely necessary, but expected to fail without DB
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('ebay_lister');
    tokenCollection = db.collection('tokens');
  }
}

const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory'
].join(' ');

async function getTokens() {
  await connectDb();
  if (tokenCollection) {
    const doc = await tokenCollection.findOne({ _id: 'admin_tokens' });
    return doc || null;
  }
  return null;
}

async function saveTokens(tokens) {
  // Add an expiration timestamp
  if (tokens.expires_in) {
    tokens.expires_at = Date.now() + (tokens.expires_in * 1000) - (5 * 60 * 1000); // 5 mins buffer
  }
  if (tokens.refresh_token_expires_in) {
    tokens.refresh_token_expires_at = Date.now() + (tokens.refresh_token_expires_in * 1000);
  }
  
  await connectDb();
  if (tokenCollection) {
    const existing = (await getTokens()) || {};
    const updatedTokens = {
      ...existing,
      ...tokens
    };
    await tokenCollection.updateOne(
      { _id: 'admin_tokens' },
      { $set: updatedTokens },
      { upsert: true }
    );
  }
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

  await saveTokens(response.data);
  return response.data;
}

async function getValidAccessToken() {
  let tokens = await getTokens();
  
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

  await saveTokens(response.data);
  return response.data.access_token;
}

async function hasValidSession() {
  const tokens = await getTokens();
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
