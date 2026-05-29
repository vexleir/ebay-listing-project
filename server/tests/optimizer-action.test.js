// Feature: listing-intelligence-completion, Property 2: Listing snapshot extraction is complete and deterministic
// Feature: listing-intelligence-completion, Property 3: Optimizer action builder produces valid documents
// Feature: listing-intelligence-completion, Property 4: Reason codes derivation is consistent with snapshot diffs
// **Validates: Requirements 3.3, 3.4, 3.5**

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');

const {
  extractListingSnapshot,
  buildOptimizerAction,
  deriveReasonCodes,
} = require('../services/intelligence/optimizerAction');

// --- Arbitraries ---

// Arbitrary for generating random listing objects with optional/missing fields
const listingArb = fc.record({
  title: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
  price: fc.oneof(
    fc.float({ min: 0, max: 10000, noNaN: true }),
    fc.string(),
    fc.constant(null),
    fc.constant(undefined),
  ),
  description: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
  descriptionLength: fc.oneof(fc.nat(), fc.constant(undefined)),
  itemSpecifics: fc.oneof(
    fc.array(fc.string(), { minLength: 0, maxLength: 20 }),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.string()),
    fc.constant(null),
    fc.constant(undefined),
  ),
  images: fc.oneof(
    fc.array(fc.string(), { minLength: 0, maxLength: 20 }),
    fc.constant(null),
    fc.constant(undefined),
  ),
}, { requiredKeys: [] });

// Arbitrary for generating a valid snapshot (the output shape of extractListingSnapshot)
const snapshotArb = fc.record({
  title: fc.oneof(fc.string(), fc.constant(null)),
  price: fc.oneof(fc.string(), fc.constant(null)),
  descriptionLength: fc.nat({ max: 50000 }),
  itemSpecificsCount: fc.nat({ max: 100 }),
  imageCount: fc.nat({ max: 50 }),
});

// Arbitrary for generating valid buildOptimizerAction parameters
const actionParamsArb = fc.record({
  id: fc.uuid(),
  companyId: fc.string({ minLength: 1, maxLength: 30 }),
  listingId: fc.string({ minLength: 1, maxLength: 30 }),
  ebayItemId: fc.string({ minLength: 1, maxLength: 30 }),
  actionType: fc.constantFrom('revise', 'relist'),
  before: snapshotArb,
  after: snapshotArb,
  expectedImpact: fc.record({
    scoreChange: fc.oneof(fc.float({ min: -100, max: 100, noNaN: true }), fc.constant(null)),
    priceChange: fc.oneof(fc.float({ min: -1000, max: 1000, noNaN: true }), fc.constant(null)),
  }, { requiredKeys: [] }),
});

// --- Property 2: Listing snapshot extraction is complete and deterministic ---

describe('extractListingSnapshot — Property 2: Listing snapshot extraction is complete and deterministic', () => {
  it('always returns exactly 5 fields with correct types (100+ iterations)', () => {
    fc.assert(
      fc.property(listingArb, (listing) => {
        const snapshot = extractListingSnapshot(listing);

        // Exactly 5 keys
        const keys = Object.keys(snapshot);
        assert.equal(keys.length, 5, `Expected 5 fields, got ${keys.length}: ${JSON.stringify(keys)}`);

        // Required keys present
        assert.ok('title' in snapshot, 'Missing title field');
        assert.ok('price' in snapshot, 'Missing price field');
        assert.ok('descriptionLength' in snapshot, 'Missing descriptionLength field');
        assert.ok('itemSpecificsCount' in snapshot, 'Missing itemSpecificsCount field');
        assert.ok('imageCount' in snapshot, 'Missing imageCount field');

        // Type checks
        assert.ok(
          snapshot.title === null || typeof snapshot.title === 'string',
          `title should be string or null, got ${typeof snapshot.title}`,
        );
        assert.ok(
          snapshot.price === null || typeof snapshot.price === 'string',
          `price should be string or null, got ${typeof snapshot.price}`,
        );

        // Non-negative integer checks
        assert.equal(typeof snapshot.descriptionLength, 'number', 'descriptionLength should be a number');
        assert.ok(snapshot.descriptionLength >= 0, `descriptionLength should be >= 0, got ${snapshot.descriptionLength}`);
        assert.ok(Number.isInteger(snapshot.descriptionLength), 'descriptionLength should be an integer');

        assert.equal(typeof snapshot.itemSpecificsCount, 'number', 'itemSpecificsCount should be a number');
        assert.ok(snapshot.itemSpecificsCount >= 0, `itemSpecificsCount should be >= 0, got ${snapshot.itemSpecificsCount}`);
        assert.ok(Number.isInteger(snapshot.itemSpecificsCount), 'itemSpecificsCount should be an integer');

        assert.equal(typeof snapshot.imageCount, 'number', 'imageCount should be a number');
        assert.ok(snapshot.imageCount >= 0, `imageCount should be >= 0, got ${snapshot.imageCount}`);
        assert.ok(Number.isInteger(snapshot.imageCount), 'imageCount should be an integer');
      }),
      { numRuns: 200 },
    );
  });

  it('is deterministic — same input always produces same output', () => {
    fc.assert(
      fc.property(listingArb, (listing) => {
        const snapshot1 = extractListingSnapshot(listing);
        const snapshot2 = extractListingSnapshot(listing);
        assert.deepEqual(snapshot1, snapshot2, 'extractListingSnapshot should be deterministic');
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 3: Optimizer action builder produces valid documents ---

describe('buildOptimizerAction — Property 3: Optimizer action builder produces valid documents', () => {
  it('produces a document with all required fields and correct types (100+ iterations)', () => {
    fc.assert(
      fc.property(actionParamsArb, (params) => {
        const doc = buildOptimizerAction({
          ...params,
          now: () => '2024-01-15T12:00:00.000Z',
        });

        // All required fields present
        assert.ok('id' in doc, 'Missing id field');
        assert.ok('companyId' in doc, 'Missing companyId field');
        assert.ok('listingId' in doc, 'Missing listingId field');
        assert.ok('ebayItemId' in doc, 'Missing ebayItemId field');
        assert.ok('createdAt' in doc, 'Missing createdAt field');
        assert.ok('appliedAt' in doc, 'Missing appliedAt field');
        assert.ok('actionType' in doc, 'Missing actionType field');
        assert.ok('beforeSnapshot' in doc, 'Missing beforeSnapshot field');
        assert.ok('afterSnapshot' in doc, 'Missing afterSnapshot field');
        assert.ok('reasonCodes' in doc, 'Missing reasonCodes field');
        assert.ok('expectedImpact' in doc, 'Missing expectedImpact field');

        // actionType is one of 'revise' or 'relist'
        assert.ok(
          doc.actionType === 'revise' || doc.actionType === 'relist',
          `actionType should be 'revise' or 'relist', got '${doc.actionType}'`,
        );

        // reasonCodes is an array
        assert.ok(Array.isArray(doc.reasonCodes), 'reasonCodes should be an array');

        // expectedImpact is an object
        assert.equal(typeof doc.expectedImpact, 'object', 'expectedImpact should be an object');
        assert.ok(doc.expectedImpact !== null, 'expectedImpact should not be null');

        // Timestamps are strings (ISO format)
        assert.equal(typeof doc.createdAt, 'string', 'createdAt should be a string');
        assert.equal(typeof doc.appliedAt, 'string', 'appliedAt should be a string');

        // companyId, listingId, ebayItemId are strings
        assert.equal(typeof doc.companyId, 'string', 'companyId should be a string');
        assert.equal(typeof doc.listingId, 'string', 'listingId should be a string');
        assert.equal(typeof doc.ebayItemId, 'string', 'ebayItemId should be a string');
      }),
      { numRuns: 200 },
    );
  });

  it('preserves actionType value from input', () => {
    fc.assert(
      fc.property(actionParamsArb, (params) => {
        const doc = buildOptimizerAction({
          ...params,
          now: () => '2024-01-15T12:00:00.000Z',
        });

        assert.equal(doc.actionType, params.actionType, 'actionType should match input');
      }),
      { numRuns: 100 },
    );
  });
});

// --- Property 4: Reason codes derivation is consistent with snapshot diffs ---

describe('deriveReasonCodes — Property 4: Reason codes derivation is consistent with snapshot diffs', () => {
  it('returns title_changed iff before.title !== after.title (100+ iterations)', () => {
    fc.assert(
      fc.property(snapshotArb, snapshotArb, (before, after) => {
        const codes = deriveReasonCodes(before, after);
        const hasTitleChanged = codes.includes('title_changed');
        const titlesDiffer = before.title !== after.title;

        assert.equal(
          hasTitleChanged,
          titlesDiffer,
          `title_changed=${hasTitleChanged} but titles differ=${titlesDiffer} ` +
          `(before="${before.title}", after="${after.title}")`,
        );
      }),
      { numRuns: 200 },
    );
  });

  it('returns price_changed iff before.price !== after.price (100+ iterations)', () => {
    fc.assert(
      fc.property(snapshotArb, snapshotArb, (before, after) => {
        const codes = deriveReasonCodes(before, after);
        const hasPriceChanged = codes.includes('price_changed');
        const pricesDiffer = before.price !== after.price;

        assert.equal(
          hasPriceChanged,
          pricesDiffer,
          `price_changed=${hasPriceChanged} but prices differ=${pricesDiffer} ` +
          `(before="${before.price}", after="${after.price}")`,
        );
      }),
      { numRuns: 200 },
    );
  });

  it('returns specifics_added iff after.itemSpecificsCount > before.itemSpecificsCount (100+ iterations)', () => {
    fc.assert(
      fc.property(snapshotArb, snapshotArb, (before, after) => {
        const codes = deriveReasonCodes(before, after);
        const hasSpecificsAdded = codes.includes('specifics_added');
        const specificsIncreased = after.itemSpecificsCount > before.itemSpecificsCount;

        assert.equal(
          hasSpecificsAdded,
          specificsIncreased,
          `specifics_added=${hasSpecificsAdded} but specificsIncreased=${specificsIncreased} ` +
          `(before=${before.itemSpecificsCount}, after=${after.itemSpecificsCount})`,
        );
      }),
      { numRuns: 200 },
    );
  });

  it('returns images_added iff after.imageCount > before.imageCount (100+ iterations)', () => {
    fc.assert(
      fc.property(snapshotArb, snapshotArb, (before, after) => {
        const codes = deriveReasonCodes(before, after);
        const hasImagesAdded = codes.includes('images_added');
        const imagesIncreased = after.imageCount > before.imageCount;

        assert.equal(
          hasImagesAdded,
          imagesIncreased,
          `images_added=${hasImagesAdded} but imagesIncreased=${imagesIncreased} ` +
          `(before=${before.imageCount}, after=${after.imageCount})`,
        );
      }),
      { numRuns: 200 },
    );
  });

  it('returns description_expanded iff after.descriptionLength > before.descriptionLength', () => {
    fc.assert(
      fc.property(snapshotArb, snapshotArb, (before, after) => {
        const codes = deriveReasonCodes(before, after);
        const hasDescExpanded = codes.includes('description_expanded');
        const descIncreased = after.descriptionLength > before.descriptionLength;

        assert.equal(
          hasDescExpanded,
          descIncreased,
          `description_expanded=${hasDescExpanded} but descIncreased=${descIncreased} ` +
          `(before=${before.descriptionLength}, after=${after.descriptionLength})`,
        );
      }),
      { numRuns: 200 },
    );
  });

  it('returns images_removed iff after.imageCount < before.imageCount', () => {
    fc.assert(
      fc.property(snapshotArb, snapshotArb, (before, after) => {
        const codes = deriveReasonCodes(before, after);
        const hasImagesRemoved = codes.includes('images_removed');
        const imagesDecreased = after.imageCount < before.imageCount;

        assert.equal(
          hasImagesRemoved,
          imagesDecreased,
          `images_removed=${hasImagesRemoved} but imagesDecreased=${imagesDecreased} ` +
          `(before=${before.imageCount}, after=${after.imageCount})`,
        );
      }),
      { numRuns: 200 },
    );
  });
});
