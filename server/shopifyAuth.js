const { getDb } = require('./db');

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP || 'bxjqfz-ku.myshopify.com';
const REDIRECT_URI = `${process.env.APP_BASE_URL || 'https://ebay-listing-project.onrender.com'}/api/shopify/callback`;
const SCOPES = 'write_products,read_products,write_inventory,read_inventory,read_orders';

function configDocId(companyId) {
  return `${companyId}_shopify`;
}

function getAuthUrl(companyId) {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) throw new Error('SHOPIFY_CLIENT_ID missing in environment variables');

  const state = Buffer.from(companyId || 'default').toString('base64');
  const url = new URL(`https://${SHOPIFY_SHOP}/admin/oauth/authorize`);
  url.searchParams.append('client_id', clientId);
  url.searchParams.append('scope', SCOPES);
  url.searchParams.append('redirect_uri', REDIRECT_URI);
  url.searchParams.append('state', state);
  return url.toString();
}

async function exchangeCodeForToken(code, companyId) {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET missing');

  const resp = await fetch(`https://${SHOPIFY_SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Shopify token exchange failed: ${err}`);
  }
  const data = await resp.json();
  if (!data.access_token) throw new Error('No access token in Shopify response');

  await saveShopifyConfig(companyId, { access_token: data.access_token, scope: data.scope, shop: SHOPIFY_SHOP });

  // Fetch and store the default location ID right after connecting
  try {
    const locationId = await fetchDefaultLocationId(companyId, data.access_token);
    await saveShopifyConfig(companyId, { locationId });
  } catch (e) {
    console.warn('[shopifyAuth] Could not fetch location ID:', e.message);
  }

  return data;
}

async function saveShopifyConfig(companyId, fields) {
  const db = await getDb();
  await db.collection('config').updateOne(
    { _id: configDocId(companyId) },
    { $set: { ...fields, updatedAt: Date.now() } },
    { upsert: true }
  );
}

async function getShopifyConfig(companyId) {
  const db = await getDb();
  return db.collection('config').findOne({ _id: configDocId(companyId) });
}

async function clearShopifyConfig(companyId) {
  const db = await getDb();
  await db.collection('config').deleteOne({ _id: configDocId(companyId) });
}

async function hasShopifySession(companyId) {
  const config = await getShopifyConfig(companyId);
  return !!(config && config.access_token);
}

async function fetchDefaultLocationId(companyId, accessToken) {
  const token = accessToken;
  const shop = SHOPIFY_SHOP;
  const resp = await fetch(`https://${shop}/admin/api/2026-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({
      query: `{ locations(first: 1) { edges { node { id name } } } }`,
    }),
  });
  if (!resp.ok) throw new Error(`Shopify locations API error: ${resp.status}`);
  const data = await resp.json();
  const locationId = data?.data?.locations?.edges?.[0]?.node?.id;
  if (!locationId) throw new Error('No locations found in Shopify store');
  return locationId;
}

async function shopifyGraphQL(companyId, query, variables = {}) {
  const config = await getShopifyConfig(companyId);
  if (!config || !config.access_token) throw new Error('Shopify not connected');

  const resp = await fetch(`https://${config.shop}/admin/api/2026-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': config.access_token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`Shopify API error: ${resp.status}`);
  const data = await resp.json();
  if (data.errors && data.errors.length > 0) throw new Error(data.errors[0].message);
  return data.data;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  getShopifyConfig,
  clearShopifyConfig,
  hasShopifySession,
  shopifyGraphQL,
};
