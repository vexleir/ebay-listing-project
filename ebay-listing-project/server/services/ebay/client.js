// Thin wrapper around the eBay Trading API HTTP endpoint extracted from
// server/app.js. Centralizes the URL, default headers, and compatibility level
// so route handlers and service functions stop repeating the same boilerplate.
//
// Why a transport param? Tests inject a fake transport (mocked axios-like
// object) so service-level tests don't need to monkey-patch the real axios
// module. Production callers pass the real axios instance.

const axios = require('axios');

const TRADING_API_URL = 'https://api.ebay.com/ws/api.dll';
const OAUTH_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const BROWSE_API_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';

const DEFAULT_COMPATIBILITY_LEVEL = '1331';
const DEFAULT_SITE_ID = '0';

// Make a Trading API call. Returns the raw axios response so callers can
// inspect `.data` (XML body) the same way they do today.
//
// Required: callName (e.g. 'GetCategoryFeatures'), xmlBody, token.
// Optional: siteId (defaults to '0' / US), compatibilityLevel (defaults to
// '1331'), transport (defaults to the shared axios import).
async function tradingApiCall({
  callName,
  xmlBody,
  token,
  siteId = DEFAULT_SITE_ID,
  compatibilityLevel = DEFAULT_COMPATIBILITY_LEVEL,
  transport = axios,
}) {
  if (!callName) throw new Error('tradingApiCall: callName is required');
  if (!xmlBody) throw new Error('tradingApiCall: xmlBody is required');
  if (!token) throw new Error('tradingApiCall: token is required');

  return transport.post(TRADING_API_URL, xmlBody, {
    headers: {
      'X-EBAY-API-COMPATIBILITY-LEVEL': compatibilityLevel,
      'X-EBAY-API-CALL-NAME': callName,
      'X-EBAY-API-SITEID': siteId,
      'X-EBAY-API-IAF-TOKEN': token,
      'Content-Type': 'text/xml',
    },
  });
}

module.exports = {
  TRADING_API_URL,
  OAUTH_TOKEN_URL,
  BROWSE_API_URL,
  DEFAULT_COMPATIBILITY_LEVEL,
  DEFAULT_SITE_ID,
  tradingApiCall,
};
