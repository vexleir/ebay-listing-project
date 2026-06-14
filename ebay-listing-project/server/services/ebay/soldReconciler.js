// P1.4 — server-side sold reconciliation across all connected companies.
//
// The client used to be the only thing reconciling sold items (a 30-min
// setInterval that required a browser tab to stay open). This module runs
// the same reconciliation on the server, so sales are captured even when no
// one has the app open.
//
// `reconcileCompanySoldItems` does one company; `runSoldReconciliation`
// walks every company that has a valid eBay session. All external
// dependencies are injected so the orchestration is unit-testable without
// Mongo or eBay.

const DEFAULT_LOOKBACK_DAYS = 90; // widest window so gaps aren't dropped

// Reconcile a single company. Returns a per-company summary.
async function reconcileCompanySoldItems(companyId, { lookbackDays = DEFAULT_LOOKBACK_DAYS } = {}, deps = {}) {
  const {
    fetchAllSoldItems,
    reconcileSoldListings,
    captureOutcomeForEbayItem,
    getExperimentByEbayItemId,
    upsertOutcome,
    tradingApiCall,
    getValidAccessToken,
  } = deps;

  if (typeof fetchAllSoldItems !== 'function') {
    throw new Error('reconcileCompanySoldItems: deps.fetchAllSoldItems is required');
  }
  if (typeof reconcileSoldListings !== 'function') {
    throw new Error('reconcileCompanySoldItems: deps.reconcileSoldListings is required');
  }

  const { items } = await fetchAllSoldItems(
    { companyId, lookbackDays },
    { tradingApiCall, getValidAccessToken },
  );

  const markedSold = await reconcileSoldListings(companyId, items);

  // Best-effort outcome capture for sold milestones (INTEL-002). A failure
  // here must not abort the reconciliation — log and keep counting.
  let capturedOutcomes = 0;
  if (typeof captureOutcomeForEbayItem === 'function') {
    for (const item of items) {
      try {
        const result = await captureOutcomeForEbayItem(
          companyId,
          item.itemId,
          {
            milestone: 'sold',
            stats: {
              finalSalePrice: item.soldPrice,
              soldAt: item.soldDate,
              quantitySold: item.quantitySold,
            },
            status: 'completed',
          },
          { getExperimentByEbayItemId, upsertOutcome },
        );
        if (result && !result.skipped) capturedOutcomes += 1;
      } catch (e) {
        console.warn(`[soldReconciler] outcome capture failed for ${companyId}/${item.itemId}:`, e.message);
      }
    }
  }

  return { companyId, itemsFound: items.length, markedSold, capturedOutcomes };
}

// Walk every company with a valid eBay session and reconcile each. Per-company
// failures are isolated so one tenant's expired token doesn't stop the rest.
async function runSoldReconciliation({ lookbackDays = DEFAULT_LOOKBACK_DAYS } = {}, deps = {}) {
  const { getCompanies, hasValidSession } = deps;
  if (typeof getCompanies !== 'function') {
    throw new Error('runSoldReconciliation: deps.getCompanies is required');
  }

  const companies = await getCompanies();
  const summary = { companiesProcessed: 0, companiesSkipped: 0, markedSold: 0, capturedOutcomes: 0, errors: 0 };

  for (const company of companies) {
    const companyId = company.id;
    if (!companyId) { summary.companiesSkipped += 1; continue; }

    // Skip companies without a usable eBay session to avoid burning calls.
    if (typeof hasValidSession === 'function') {
      let connected = false;
      try {
        connected = await hasValidSession(companyId);
      } catch {
        connected = false;
      }
      if (!connected) { summary.companiesSkipped += 1; continue; }
    }

    try {
      const result = await reconcileCompanySoldItems(companyId, { lookbackDays }, deps);
      summary.companiesProcessed += 1;
      summary.markedSold += result.markedSold;
      summary.capturedOutcomes += result.capturedOutcomes;
    } catch (e) {
      console.error(`[soldReconciler] reconciliation failed for company ${companyId}:`, e.message);
      summary.errors += 1;
    }
  }

  return summary;
}

module.exports = {
  DEFAULT_LOOKBACK_DAYS,
  reconcileCompanySoldItems,
  runSoldReconciliation,
};
