// Application-level (Client Credentials) OAuth token for the eBay Browse
// API. Cached in-memory across requests so we don't burn a token call on
// every sold-comps / reprice lookup; the cache TTL is the eBay-issued
// expires_in minus 60s of safety margin.
//
// Extracted from server/app.js so multiple route modules (sold-comps,
// reprice/suggestions, future ones) share the same cache. Without sharing,
// each extracted module would have its own cache and we'd silently issue
// multiple token calls per page render.

const axios = require('axios');
const { OAUTH_TOKEN_URL } = require('./client');

let cachedToken = null;
let cachedExpiry = 0;

async function getApplicationToken({ transport = axios } = {}) {
  if (cachedToken && Date.now() < cachedExpiry) return cachedToken;

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not set');

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'https://api.ebay.com/oauth/api_scope');

  const resp = await transport.post(OAUTH_TOKEN_URL, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${authHeader}`,
    },
  });

  cachedToken = resp.data.access_token;
  cachedExpiry = Date.now() + (resp.data.expires_in * 1000) - 60_000;
  return cachedToken;
}

// Test helper — never call from production code.
function __resetApplicationTokenCache() {
  cachedToken = null;
  cachedExpiry = 0;
}

module.exports = { getApplicationToken, __resetApplicationTokenCache };
