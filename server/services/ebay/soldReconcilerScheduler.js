// P1.4 — wires runSoldReconciliation to a server-side interval so sold
// reconciliation no longer depends on a browser tab staying open.
//
// Disabled by default in tests/CI via the SOLD_RECONCILE_ENABLED env flag.
// Interval is configurable via SOLD_RECONCILE_INTERVAL_MINUTES (default 30).

const { runSoldReconciliation } = require('./soldReconciler');
const { fetchAllSoldItems } = require('./soldItems');
const { reconcileSoldListings } = require('../../listings');
const { tradingApiCall } = require('./client');
const { getValidAccessToken, hasValidSession } = require('../../ebayAuth');
const { getCompanies } = require('../../users');
const { captureOutcomeForEbayItem } = require('../intelligence/captureOutcome');
const { getExperimentByEbayItemId, upsertOutcome } = require('../../intelligence');

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isEnabled() {
  // Default ON in production; opt out by setting SOLD_RECONCILE_ENABLED=false.
  return String(process.env.SOLD_RECONCILE_ENABLED ?? 'true').toLowerCase() !== 'false';
}

// Run one reconciliation pass with the real dependencies wired in.
async function runOnce() {
  return runSoldReconciliation(
    { lookbackDays: parsePositiveInt(process.env.SOLD_RECONCILE_LOOKBACK_DAYS, 90) },
    {
      getCompanies,
      hasValidSession,
      fetchAllSoldItems,
      reconcileSoldListings,
      captureOutcomeForEbayItem,
      getExperimentByEbayItemId,
      upsertOutcome,
      tradingApiCall,
      getValidAccessToken,
    },
  );
}

let timer = null;

// Start the recurring scheduler. Returns the interval handle (or null when
// disabled). Safe to call once at process start.
function startSoldReconcilerScheduler() {
  if (!isEnabled()) {
    console.log('[soldReconciler] scheduler disabled (SOLD_RECONCILE_ENABLED=false)');
    return null;
  }
  if (timer) return timer;

  const minutes = parsePositiveInt(process.env.SOLD_RECONCILE_INTERVAL_MINUTES, 30);
  const intervalMs = minutes * 60 * 1000;

  const tick = async () => {
    try {
      const summary = await runOnce();
      if (summary.markedSold > 0 || summary.errors > 0) {
        console.log('[soldReconciler] pass complete:', JSON.stringify(summary));
      }
    } catch (e) {
      console.error('[soldReconciler] pass failed:', e.message);
    }
  };

  // Kick off the first pass shortly after boot, then on the interval.
  const KICKOFF_DELAY_MS = 60 * 1000;
  setTimeout(tick, KICKOFF_DELAY_MS);
  timer = setInterval(tick, intervalMs);
  // Don't keep the event loop alive solely for this timer.
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`[soldReconciler] scheduler started (every ${minutes}m)`);
  return timer;
}

function stopSoldReconcilerScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startSoldReconcilerScheduler,
  stopSoldReconcilerScheduler,
  runOnce,
  isEnabled,
};
