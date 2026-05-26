// eBay category metadata helpers extracted from server/app.js.
// Currently wraps GetCategoryFeatures with the DetailLevel=ReturnAll request
// shape that's required to get the <ConditionValues> block in the response —
// see the inline comment in getValidConditionIdsForCategory for the gotcha.

const { tradingApiCall } = require('./client');

function buildGetCategoryFeaturesXml(categoryId) {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetCategoryFeaturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <CategoryID>${categoryId}</CategoryID>
  <DetailLevel>ReturnAll</DetailLevel>
  <FeatureID>ConditionValues</FeatureID>
  <ViewAllNodes>true</ViewAllNodes>
</GetCategoryFeaturesRequest>`;
}

// Parse the <Condition><ID>NNNN</ID> entries out of a GetCategoryFeatures
// response body. Exported so the parser is independently testable without
// having to mock a full HTTP round-trip.
function parseConditionIds(xml) {
  if (!xml || typeof xml !== 'string') return [];
  return [...xml.matchAll(/<Condition>\s*<ID>(\d+)<\/ID>/g)].map((m) => m[1]);
}

// Fetch the ConditionIDs eBay accepts for a given category. Returns an array
// of numeric ID strings (e.g. ['1000','2750','4000']), or [] when the category
// allows any/none or the network call fails. Used to pick a valid fallback
// when our derived condition is rejected (e.g. Comics doesn't accept 3000).
async function getValidConditionIdsForCategory(categoryId, token, options = {}) {
  try {
    const resp = await tradingApiCall({
      callName: 'GetCategoryFeatures',
      xmlBody: buildGetCategoryFeaturesXml(categoryId),
      token,
      transport: options.transport,
    });
    return parseConditionIds(resp.data);
  } catch (e) {
    console.warn(`[draft] GetCategoryFeatures(${categoryId}) failed: ${e.message}`);
    return [];
  }
}

module.exports = {
  buildGetCategoryFeaturesXml,
  parseConditionIds,
  getValidConditionIdsForCategory,
};
