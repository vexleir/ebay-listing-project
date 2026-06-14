// eBay condition helpers extracted from server/index.js so they can be unit-tested.
// These mirror the production logic exactly — do not loosen behavior without updating tests.

// Map a free-text condition string (e.g. "Like New", "Used - Good") to the
// numeric eBay ConditionID expected by AddFixedPriceItem. The order of checks
// matters: more specific phrases must be tested before generic ones (e.g.
// "very good" before plain "good", "like new" before plain "new").
function getConditionId(conditionStr) {
  const s = (conditionStr || '').toLowerCase();
  if (s.includes('for parts') || s.includes('not working') || s.includes('parts only')) return '7000';
  if (s.includes('acceptable') || s.includes('heavily worn') || s.includes('heavy wear')) return '6000';
  if (s.includes('good') && !s.includes('very good') && !s.includes('like new')) return '5000';
  if (s.includes('very good')) return '4000';
  if (s.includes('like new') || s.includes('mint') || s.includes('open box') || s.includes('open-box')) return '2500';
  if (s.includes('seller refurbished') || s.includes('refurbished') || s.includes('refurb')) return '2500';
  if (s.includes('certified refurbished') || s.includes('manufacturer refurbished')) return '2000';
  if (s.includes('new other')) return '1500';
  if (s.includes('new') && !s.includes('like')) return '1000';
  return '3000';
}

// Given the category's valid condition IDs and the one we tried, pick the
// closest valid replacement. eBay condition IDs are ordered new→worn, so the
// numerically-nearest valid ID best preserves the seller's intended grade.
// Returns null when the category returned no valid IDs.
function pickFallbackConditionId(validIds, attemptedId) {
  if (!validIds || validIds.length === 0) return null;
  const target = parseInt(attemptedId, 10);
  if (validIds.includes(String(attemptedId))) return String(attemptedId);
  return validIds
    .map((id) => ({ id, dist: Math.abs(parseInt(id, 10) - target) }))
    .sort((a, b) => a.dist - b.dist)[0].id;
}

module.exports = { getConditionId, pickFallbackConditionId };
