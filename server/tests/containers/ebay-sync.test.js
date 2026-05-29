// Integration tests for eBay location sync service
// Tests: sync triggered on location change, retry on transient failure,
// token refresh flow, rate limit handling, failed sync status tracking.
// Requirements: 7.4, 7.5, 8.5, 8.6

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const Module = require('module');

// ── Fake DB ─────────────────────────────────────────────────────────────────

function makeFakeDb() {
  const collections = {};

  function getCollection(name) {
    if (!collections[name]) {
      collections[name] = [];
    }
    const docs = collections[name];
    return {
      find(filter) {
        const results = docs.filter((d) => matchesFilter(d, filter));
        return {
          sort() { return this; },
          skip() { return this; },
          limit() { return this; },
          toArray() { return Promise.resolve(results.map((d) => ({ ...d }))); },
        };
      },
      findOne(filter) {
        const found = docs.find((d) => matchesFilter(d, filter));
        return Promise.resolve(found ? { ...found } : null);
      },
      insertOne(doc) {
        const copy = { ...doc, _id: doc._id || `_id_${Math.random().toString(36).slice(2)}` };
        docs.push(copy);
        return Promise.resolve({ insertedId: copy._id });
      },
      updateOne(filter, update) {
        const doc = docs.find((d) => matchesFilter(d, filter));
        if (doc && update.$set) {
          Object.assign(doc, update.$set);
        }
        return Promise.resolve({ matchedCount: doc ? 1 : 0 });
      },
    };
  }

  function matchesFilter(doc, filter) {
    for (const [key, val] of Object.entries(filter)) {
      if (doc[key] !== val) return false;
    }
    return true;
  }

  return {
    collection: getCollection,
    __collections: collections,
    __reset() {
      for (const key of Object.keys(collections)) {
        collections[key].length = 0;
      }
    },
  };
}

const fakeDb = makeFakeDb();

// ── Fake eBay Auth ──────────────────────────────────────────────────────────

let tokenCallCount = 0;
let tokenValue = 'test-access-token';
const fakeEbayAuth = {
  getValidAccessToken: async () => {
    tokenCallCount++;
    return tokenValue;
  },
};

// ── Fake Axios ──────────────────────────────────────────────────────────────

let axiosCalls = [];
let axiosResponses = [];

function fakeAxios(config) {
  axiosCalls.push(config);
  const response = axiosResponses.shift();
  if (!response) {
    return Promise.resolve({ data: {}, status: 200 });
  }
  if (response.error) {
    const err = new Error(response.error.message || 'Request failed');
    err.response = response.error.response || undefined;
    err.code = response.error.code || undefined;
    return Promise.reject(err);
  }
  return Promise.resolve(response);
}

// ── Module interception ─────────────────────────────────────────────────────

const originalResolveFilename = Module._resolveFilename;
const dbModulePath = path.resolve(__dirname, '..', '..', 'db.js');
const ebayAuthModulePath = path.resolve(__dirname, '..', '..', 'ebayAuth.js');
const axiosModulePath = require.resolve('axios');

// Clear cached modules that might have loaded real dependencies
for (const key of Object.keys(require.cache)) {
  if (key.includes('containers') || key.includes('ebaySync') || key.includes('ebayAuth')) {
    delete require.cache[key];
  }
}

Module._resolveFilename = function (request, parent, ...rest) {
  const resolved = originalResolveFilename.call(this, request, parent, ...rest);
  if (resolved === dbModulePath) return '__fake_db_ebay_sync__';
  if (resolved === ebayAuthModulePath) return '__fake_ebay_auth_sync__';
  if (resolved === axiosModulePath) return '__fake_axios_sync__';
  return resolved;
};

require.cache['__fake_db_ebay_sync__'] = {
  id: '__fake_db_ebay_sync__',
  filename: '__fake_db_ebay_sync__',
  loaded: true,
  exports: { getDb: async () => fakeDb },
};

require.cache['__fake_ebay_auth_sync__'] = {
  id: '__fake_ebay_auth_sync__',
  filename: '__fake_ebay_auth_sync__',
  loaded: true,
  exports: fakeEbayAuth,
};

require.cache['__fake_axios_sync__'] = {
  id: '__fake_axios_sync__',
  filename: '__fake_axios_sync__',
  loaded: true,
  exports: fakeAxios,
};

// Now require the module under test
const ebaySync = require('../../services/containers/ebaySync');
const {
  syncContainerLocation,
  syncSingleListing,
  updateEbayListingLocation,
  SYNC_STATUS,
  RETRY_CONFIG,
} = ebaySync;

// Restore original resolution
Module._resolveFilename = originalResolveFilename;

// Override retry delay to 0 for fast tests
RETRY_CONFIG.baseDelayMs = 0;

// ── Test setup/teardown ─────────────────────────────────────────────────────

test.beforeEach(() => {
  fakeDb.__reset();
  axiosCalls = [];
  axiosResponses = [];
  tokenCallCount = 0;
  tokenValue = 'test-access-token';
});

// ── syncContainerLocation tests ─────────────────────────────────────────────

test('syncContainerLocation generates correct location string and syncs items', async () => {
  // Seed a container with location fields
  const containers = fakeDb.collection('containers');
  await containers.insertOne({
    id: 'container-1',
    companyId: 'co1',
    name: 'Tote 5',
    building: 'Home',
    room: 'Garage',
    shelf: 'C',
    shelfRow: '3',
  });

  // Seed an item assignment
  const assignments = fakeDb.collection('container_item_assignments');
  await assignments.insertOne({
    companyId: 'co1',
    containerId: 'container-1',
    itemId: 'listing-1',
    itemType: 'listing',
  });

  // Seed the listing with a SKU
  const listings = fakeDb.collection('listings');
  await listings.insertOne({
    _id: 'listing-1',
    companyId: 'co1',
    sku: 'SKU-001',
  });

  // Mock successful GET and PUT responses from eBay
  axiosResponses.push({ data: { product: {} }, status: 200 }); // GET inventory item
  axiosResponses.push({ data: {}, status: 200 }); // PUT inventory item

  const result = await syncContainerLocation('co1', 'container-1');

  assert.equal(result.total, 1);
  assert.equal(result.synced, 1);
  assert.equal(result.failed, 0);

  // Verify the PUT call included the correct location string
  const putCall = axiosCalls.find((c) => c.method === 'PUT');
  assert.ok(putCall, 'Should have made a PUT call to eBay');
  assert.equal(putCall.data.location.location, 'Home - Garage - Shelf C - Row 3 - Tote 5');
});

test('syncContainerLocation skips non-listing items without ebayListingId', async () => {
  const containers = fakeDb.collection('containers');
  await containers.insertOne({
    id: 'container-2',
    companyId: 'co1',
    name: 'Bin 1',
  });

  const assignments = fakeDb.collection('container_item_assignments');
  await assignments.insertOne({
    companyId: 'co1',
    containerId: 'container-2',
    itemId: 'inv-item-1',
    itemType: 'inventory',
  });

  // Inventory item without ebayListingId
  const inventoryItems = fakeDb.collection('inventory_items');
  await inventoryItems.insertOne({
    _id: 'inv-item-1',
    companyId: 'co1',
    sku: 'INV-SKU',
  });

  const result = await syncContainerLocation('co1', 'container-2');

  // Item should be skipped (total decremented)
  assert.equal(result.total, 0);
  assert.equal(result.synced, 0);
  assert.equal(axiosCalls.length, 0);
});

test('syncContainerLocation throws when container not found', async () => {
  await assert.rejects(
    () => syncContainerLocation('co1', 'nonexistent'),
    (err) => {
      assert.match(err.message, /Container not found/);
      return true;
    }
  );
});

// ── updateEbayListingLocation retry tests ───────────────────────────────────

test('updateEbayListingLocation retries on 500 errors up to 3 times', async () => {
  // First 3 attempts fail with 500, 4th succeeds
  axiosResponses.push({ error: { message: 'Server Error', response: { status: 500 } } });
  axiosResponses.push({ error: { message: 'Server Error', response: { status: 500 } } });
  axiosResponses.push({ error: { message: 'Server Error', response: { status: 500 } } });
  // After 3 retries (attempt 0,1,2 fail), attempt 3 is the last
  axiosResponses.push({ data: { product: {} }, status: 200 }); // GET succeeds on attempt 3
  axiosResponses.push({ data: {}, status: 200 }); // PUT succeeds on attempt 3

  const result = await updateEbayListingLocation('co1', 'SKU-TEST', 'Home - Garage');

  assert.equal(result.success, true);
  // Should have made calls: 3 failed GETs + 1 successful GET + 1 PUT = 5
  assert.equal(axiosCalls.length, 5);
});

test('updateEbayListingLocation returns failure after exhausting retries on 500', async () => {
  // All 4 attempts (0,1,2,3) fail with 500
  for (let i = 0; i <= 3; i++) {
    axiosResponses.push({ error: { message: 'Server Error', response: { status: 500 } } });
  }

  const result = await updateEbayListingLocation('co1', 'SKU-TEST', 'Home - Garage');

  assert.equal(result.success, false);
  assert.match(result.error, /server error/i);
  assert.equal(result.retryable, true);
});

test('updateEbayListingLocation handles 401 (token refresh) and retries', async () => {
  // First attempt: 401 (token expired)
  axiosResponses.push({ error: { message: 'Unauthorized', response: { status: 401 } } });
  // Second attempt: success (token refreshed by getValidAccessToken)
  axiosResponses.push({ data: { product: {} }, status: 200 }); // GET
  axiosResponses.push({ data: {}, status: 200 }); // PUT

  const result = await updateEbayListingLocation('co1', 'SKU-TEST', 'Office - Bin 2');

  assert.equal(result.success, true);
  // getValidAccessToken called twice (once per attempt)
  assert.equal(tokenCallCount, 2);
});

test('updateEbayListingLocation handles 429 (rate limit) with backoff', async () => {
  // First attempt: 429 with retry-after header (0 seconds for fast test)
  axiosResponses.push({
    error: {
      message: 'Rate Limited',
      response: { status: 429, headers: { 'retry-after': '0' } },
    },
  });
  // Second attempt: success
  axiosResponses.push({ data: { product: {} }, status: 200 }); // GET
  axiosResponses.push({ data: {}, status: 200 }); // PUT

  const result = await updateEbayListingLocation('co1', 'SKU-TEST', 'Shelf A');

  assert.equal(result.success, true);
  // Should have made 3 calls: 1 failed GET + 1 successful GET + 1 PUT
  assert.equal(axiosCalls.length, 3);
});

test('updateEbayListingLocation returns failure on 429 after exhausting retries', async () => {
  for (let i = 0; i <= 3; i++) {
    axiosResponses.push({
      error: {
        message: 'Rate Limited',
        response: { status: 429, headers: { 'retry-after': '0' } },
      },
    });
  }

  const result = await updateEbayListingLocation('co1', 'SKU-TEST', 'Shelf A');

  assert.equal(result.success, false);
  assert.match(result.error, /rate limited/i);
  assert.equal(result.retryable, true);
});

test('updateEbayListingLocation marks as failed on 404 (not retryable)', async () => {
  axiosResponses.push({
    error: {
      message: 'Not Found',
      response: { status: 404 },
    },
  });

  const result = await updateEbayListingLocation('co1', 'SKU-MISSING', 'Home');

  assert.equal(result.success, false);
  assert.match(result.error, /not found/i);
  assert.equal(result.retryable, false);
  // Should NOT retry — only 1 call made
  assert.equal(axiosCalls.length, 1);
});

// ── syncSingleListing status tracking tests ─────────────────────────────────

test('syncSingleListing updates sync status to "synced" on success', async () => {
  const listings = fakeDb.collection('listings');
  await listings.insertOne({
    _id: 'listing-sync-1',
    companyId: 'co1',
    sku: 'SKU-SYNC-1',
  });

  // Mock successful eBay API calls
  axiosResponses.push({ data: { product: {} }, status: 200 }); // GET
  axiosResponses.push({ data: {}, status: 200 }); // PUT

  const result = await syncSingleListing('co1', 'listing-sync-1', 'Home - Office');

  assert.equal(result.success, true);

  // Verify the listing's sync status was updated to "synced"
  const updatedListing = fakeDb.__collections['listings'].find(
    (d) => d._id === 'listing-sync-1'
  );
  assert.equal(updatedListing.locationSyncStatus, SYNC_STATUS.SYNCED);
  assert.equal(updatedListing.locationSyncError, null);
});

test('syncSingleListing updates sync status to "failed" on non-retryable error', async () => {
  const listings = fakeDb.collection('listings');
  await listings.insertOne({
    _id: 'listing-sync-2',
    companyId: 'co1',
    sku: 'SKU-SYNC-2',
  });

  // Mock 404 response (non-retryable)
  axiosResponses.push({
    error: { message: 'Not Found', response: { status: 404 } },
  });

  const result = await syncSingleListing('co1', 'listing-sync-2', 'Home - Office');

  assert.equal(result.success, false);

  // Verify the listing's sync status was updated to "failed"
  const updatedListing = fakeDb.__collections['listings'].find(
    (d) => d._id === 'listing-sync-2'
  );
  assert.equal(updatedListing.locationSyncStatus, SYNC_STATUS.FAILED);
  assert.match(updatedListing.locationSyncError, /not found/i);
});

test('syncSingleListing updates sync status to "pending" on retryable error', async () => {
  const listings = fakeDb.collection('listings');
  await listings.insertOne({
    _id: 'listing-sync-3',
    companyId: 'co1',
    sku: 'SKU-SYNC-3',
  });

  // Mock all attempts failing with 500 (retryable)
  for (let i = 0; i <= 3; i++) {
    axiosResponses.push({
      error: { message: 'Server Error', response: { status: 500 } },
    });
  }

  const result = await syncSingleListing('co1', 'listing-sync-3', 'Home - Office');

  assert.equal(result.success, false);

  // Verify the listing's sync status was updated to "pending" (retryable)
  const updatedListing = fakeDb.__collections['listings'].find(
    (d) => d._id === 'listing-sync-3'
  );
  assert.equal(updatedListing.locationSyncStatus, SYNC_STATUS.PENDING);
  assert.match(updatedListing.locationSyncError, /server error/i);
});

test('syncSingleListing fails with "Listing not found locally" when listing does not exist', async () => {
  const result = await syncSingleListing('co1', 'nonexistent-listing', 'Home');

  assert.equal(result.success, false);
  assert.match(result.error, /not found locally/i);
});

test('syncSingleListing fails with "No SKU available" when listing has no SKU', async () => {
  const listings = fakeDb.collection('listings');
  await listings.insertOne({
    _id: 'listing-no-sku',
    companyId: 'co1',
    // No sku, ebay_sku, or itemId
  });

  const result = await syncSingleListing('co1', 'listing-no-sku', 'Home');

  assert.equal(result.success, false);
  assert.match(result.error, /no sku/i);

  // Verify status is "failed"
  const updatedListing = fakeDb.__collections['listings'].find(
    (d) => d._id === 'listing-no-sku'
  );
  assert.equal(updatedListing.locationSyncStatus, SYNC_STATUS.FAILED);
});
