'use strict';

const axios = require('axios');
const { getDb } = require('../../db');
const { getValidAccessToken } = require('../../ebayAuth');
const { generateLocationString } = require('./location');

/**
 * Sync status values for eBay location sync tracking.
 */
const SYNC_STATUS = {
  SYNCED: 'synced',
  PENDING: 'pending',
  FAILED: 'failed',
};

/**
 * Default retry configuration for eBay API calls.
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000, // 1 second base delay
};

/**
 * Sleeps for the specified number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff delay for a given attempt.
 * @param {number} attempt - Zero-based attempt index
 * @param {number} baseDelayMs - Base delay in milliseconds
 * @returns {number} Delay in milliseconds
 */
function getBackoffDelay(attempt, baseDelayMs = RETRY_CONFIG.baseDelayMs) {
  return baseDelayMs * Math.pow(2, attempt);
}

/**
 * Updates the eBay listing's item.location field via the Inventory API.
 * Implements retry with exponential backoff and handles token refresh,
 * rate limits, and listing-not-found errors.
 *
 * @param {string} companyId - The company ID for auth token lookup
 * @param {string} sku - The SKU identifier for the eBay inventory item
 * @param {string} locationString - The new location string to set
 * @returns {Promise<{ success: boolean, error?: string, retryable?: boolean }>}
 */
async function updateEbayListingLocation(companyId, sku, locationString) {
  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const accessToken = await getValidAccessToken(companyId);

      const response = await axios({
        method: 'GET',
        url: `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 15000,
      });

      const inventoryItem = response.data;

      // Update the location field
      if (!inventoryItem.product) {
        inventoryItem.product = {};
      }
      // eBay Inventory API uses item.location at the top level
      inventoryItem.location = inventoryItem.location || {};
      inventoryItem.location.location = locationString;

      // PUT the updated inventory item back
      await axios({
        method: 'PUT',
        url: `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        data: inventoryItem,
        timeout: 15000,
      });

      return { success: true };
    } catch (err) {
      lastError = err;

      // Handle specific error scenarios
      if (err.response) {
        const status = err.response.status;

        // Token expired - refresh handled by getValidAccessToken on next attempt
        if (status === 401) {
          if (attempt < RETRY_CONFIG.maxRetries) {
            await sleep(getBackoffDelay(attempt));
            continue;
          }
          return { success: false, error: 'Authentication failed after retries', retryable: true };
        }

        // Rate limited
        if (status === 429) {
          const retryAfter = err.response.headers['retry-after'];
          const delayMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : getBackoffDelay(attempt);
          if (attempt < RETRY_CONFIG.maxRetries) {
            await sleep(delayMs);
            continue;
          }
          return { success: false, error: 'Rate limited by eBay API', retryable: true };
        }

        // Listing not found - not retryable
        if (status === 404) {
          return { success: false, error: 'Listing not found on eBay', retryable: false };
        }

        // Server errors - retryable
        if (status >= 500) {
          if (attempt < RETRY_CONFIG.maxRetries) {
            await sleep(getBackoffDelay(attempt));
            continue;
          }
          return { success: false, error: `eBay server error: ${status}`, retryable: true };
        }

        // Other client errors - not retryable
        return {
          success: false,
          error: `eBay API error: ${status} - ${err.response.data?.message || err.message}`,
          retryable: false,
        };
      }

      // Network errors (timeout, connection refused, etc.) - retryable
      if (err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || !err.response) {
        if (attempt < RETRY_CONFIG.maxRetries) {
          await sleep(getBackoffDelay(attempt));
          continue;
        }
        return { success: false, error: `Network error: ${err.message}`, retryable: true };
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error after retries',
    retryable: true,
  };
}


/**
 * Updates the sync status for a specific listing in the database.
 *
 * @param {string} companyId
 * @param {string} itemId - The item/listing ID
 * @param {string} status - One of "synced", "pending", "failed"
 * @param {string|null} [error=null] - Error message if status is "failed"
 * @returns {Promise<void>}
 */
async function updateSyncStatus(companyId, itemId, status, error = null) {
  const db = await getDb();
  const update = {
    $set: {
      locationSyncStatus: status,
      locationSyncError: error,
      locationSyncUpdatedAt: new Date().toISOString(),
    },
  };

  // Try updating in listings collection first, then inventory_items
  const listingResult = await db.collection('listings').updateOne(
    { _id: itemId, companyId },
    update
  );

  if (listingResult.matchedCount === 0) {
    await db.collection('inventory_items').updateOne(
      { _id: itemId, companyId },
      update
    );
  }
}

/**
 * Syncs the eBay listing location for a single listing.
 *
 * @param {string} companyId
 * @param {string} listingId - The listing/item ID
 * @param {string} locationString - The new location string to set on eBay
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function syncSingleListing(companyId, listingId, locationString) {
  const db = await getDb();

  // Mark as pending
  await updateSyncStatus(companyId, listingId, SYNC_STATUS.PENDING);

  // Look up the listing to get its eBay SKU
  let listing = await db.collection('listings').findOne({ _id: listingId, companyId });
  if (!listing) {
    listing = await db.collection('inventory_items').findOne({ _id: listingId, companyId });
  }

  if (!listing) {
    await updateSyncStatus(companyId, listingId, SYNC_STATUS.FAILED, 'Listing not found locally');
    return { success: false, error: 'Listing not found locally' };
  }

  // Determine the SKU to use for the eBay API call
  const sku = listing.sku || listing.ebay_sku || listing.itemId;
  if (!sku) {
    await updateSyncStatus(companyId, listingId, SYNC_STATUS.FAILED, 'No SKU available for eBay API');
    return { success: false, error: 'No SKU available for eBay API' };
  }

  // Attempt the eBay API update
  const result = await updateEbayListingLocation(companyId, sku, locationString);

  if (result.success) {
    await updateSyncStatus(companyId, listingId, SYNC_STATUS.SYNCED);
    return { success: true };
  }

  // Determine final status based on retryability
  const finalStatus = result.retryable ? SYNC_STATUS.PENDING : SYNC_STATUS.FAILED;
  await updateSyncStatus(companyId, listingId, finalStatus, result.error);
  return { success: false, error: result.error };
}

/**
 * Syncs the eBay listing location for all items in a container.
 * Called when a container's location fields change.
 *
 * 1. Generates the new location string from the container's fields
 * 2. Queries container_item_assignments for items in that container
 * 3. For each item with a linked eBay listing, syncs the location
 *
 * @param {string} companyId
 * @param {string} containerId
 * @returns {Promise<{ total: number, synced: number, failed: number, failures: Array<{ itemId: string, error: string }> }>}
 */
async function syncContainerLocation(companyId, containerId) {
  const db = await getDb();

  // 1. Fetch the container to get its location fields
  const container = await db.collection('containers').findOne({ id: containerId, companyId });
  if (!container) {
    throw new Error(`Container not found: ${containerId}`);
  }

  // 2. Generate the location string from the container's hierarchy fields
  const locationString = generateLocationString({
    building: container.building,
    room: container.room,
    shelf: container.shelf,
    shelfRow: container.shelfRow,
    containerName: container.name,
  });

  // 3. Query container_item_assignments for all items in this container
  const assignments = await db
    .collection('container_item_assignments')
    .find({ companyId, containerId })
    .toArray();

  if (assignments.length === 0) {
    return { total: 0, synced: 0, failed: 0, failures: [] };
  }

  // 4. For each assigned item, check if it has a linked eBay listing and sync
  const results = { total: assignments.length, synced: 0, failed: 0, failures: [] };

  for (const assignment of assignments) {
    const { itemId, itemType } = assignment;

    // Only sync items that are listings (have eBay presence)
    if (itemType !== 'listing') {
      // Check if the inventory item has a linked eBay listing
      const item = await db.collection('inventory_items').findOne({ _id: itemId, companyId });
      if (!item || !item.ebayListingId) {
        results.total--;
        continue;
      }
    }

    const syncResult = await syncSingleListing(companyId, itemId, locationString);

    if (syncResult.success) {
      results.synced++;
    } else {
      results.failed++;
      results.failures.push({ itemId, error: syncResult.error });
    }
  }

  return results;
}

module.exports = {
  syncContainerLocation,
  syncSingleListing,
  updateEbayListingLocation,
  updateSyncStatus,
  SYNC_STATUS,
  RETRY_CONFIG,
  getBackoffDelay,
  sleep,
};
