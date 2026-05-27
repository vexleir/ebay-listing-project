// AI-001 / AI-002 — tests for the prompt registry and telemetry wrapper.
//
// The prompt tests are characterization-style: they lock the public shape
// of each prompt so accidental edits don't silently change what the model
// is asked to produce. Bump the version constant + update the assertion
// when changing a prompt body deliberately.

const assert = require('node:assert/strict');
const test = require('node:test');

const Module = require('module');
const originalRequire = Module.prototype.require;

// Stub out ../../db so the telemetry module can load + write without Mongo.
const dbInserts = [];
const fakeDb = {
  getDb: async () => ({
    collection: () => ({
      insertOne: async (doc) => { dbInserts.push(doc); return { insertedId: 'fake' }; },
    }),
  }),
};
Module.prototype.require = function patched(name) {
  if (name === '../../db') return fakeDb;
  return originalRequire.apply(this, arguments);
};

const {
  PROMPTS,
  listingAnalysisPrompt,
  listingTitleEnrichPrompt,
  listingFinalPrompt,
  optimizerPrompt,
  LISTING_ANALYSIS_VERSION,
  LISTING_TITLE_ENRICH_VERSION,
  LISTING_FINAL_VERSION,
  OPTIMIZER_VERSION,
} = require('../services/ai/prompts');
const { withAiTelemetry, recordAiCall } = require('../services/ai/telemetry');

Module.prototype.require = originalRequire;

// ─── Registry shape ───────────────────────────────────────────────────────

test('PROMPTS registry exposes all four named prompts with a build fn and a version string', () => {
  for (const name of ['listing.analysis', 'listing.titleEnrich', 'listing.final', 'optimizer.optimize']) {
    assert.ok(PROMPTS[name], `expected PROMPTS to have a "${name}" entry`);
    assert.equal(typeof PROMPTS[name].build, 'function', `${name}.build must be a function`);
    assert.equal(typeof PROMPTS[name].version, 'string', `${name}.version must be a string`);
    assert.match(PROMPTS[name].version, /^\d{4}-\d{2}-\d{2}\.\d+$/, `${name}.version should be YYYY-MM-DD.N`);
  }
});

test('version constants and registry entries stay in sync', () => {
  assert.equal(PROMPTS['listing.analysis'].version, LISTING_ANALYSIS_VERSION);
  assert.equal(PROMPTS['listing.titleEnrich'].version, LISTING_TITLE_ENRICH_VERSION);
  assert.equal(PROMPTS['listing.final'].version, LISTING_FINAL_VERSION);
  assert.equal(PROMPTS['optimizer.optimize'].version, OPTIMIZER_VERSION);
});

// ─── Listing analysis prompt ──────────────────────────────────────────────

test('listingAnalysisPrompt interpolates user instructions and demands JSON output', () => {
  const out = listingAnalysisPrompt({ instructions: 'Box has water damage' });
  assert.match(out, /Box has water damage/);
  assert.match(out, /Cassini SEO optimized eBay title/);
  assert.match(out, /80 characters/);
  assert.match(out, /Respond with ONLY a JSON object/);
  assert.match(out, /"identifiedProductDetails":/);
  assert.match(out, /"title":/);
});

// ─── Title enrich prompt ──────────────────────────────────────────────────

test('listingTitleEnrichPrompt reports the current length and asks for plain text', () => {
  const out = listingTitleEnrichPrompt({ title: 'Foo Bar', identifiedProductDetails: 'a thing' });
  assert.match(out, /Length: 7\/80/);
  assert.match(out, /"a thing"/);
  assert.match(out, /Return ONLY the new title as plain text/);
});

// ─── Listing final prompt ─────────────────────────────────────────────────

test('listingFinalPrompt enumerates all 9 required output fields', () => {
  const out = listingFinalPrompt({
    identifiedProductDetails: 'd',
    title: 't',
    instructions: 'i',
  });
  for (const field of [
    '"condition"', '"description"', '"itemSpecifics"', '"category"',
    '"priceRecommendation"', '"priceJustification"', '"shippingEstimate"',
    '"tags"', '"seoKeywords"',
  ]) {
    assert.match(out, new RegExp(field), `expected output to mention ${field}`);
  }
  // CTA rule (locks in the styled-text-only, no-button constraint).
  assert.match(out, /CTA RULES/);
  assert.match(out, /NEVER render it as a button/i);
  // ItemSpecifics rules — always include Type / Age Group / Gender.
  assert.match(out, /ALWAYS include a "Type" field/);
  assert.match(out, /ALWAYS include "Age Group"/);
  assert.match(out, /ALWAYS include "Gender"/);
});

// ─── Optimizer prompt ─────────────────────────────────────────────────────

test('optimizerPrompt embeds current listing data and required/recommended specifics', () => {
  const out = optimizerPrompt({
    title: 'Used Vintage Camera',
    categoryName: 'Cameras',
    price: '49.99',
    conditionName: 'Used',
    descPlain: 'a camera',
    currentSpecifics: '{"Brand":"Canon"}',
    required: ['Brand', 'Model'],
    recommended: ['MPN'],
  });
  assert.match(out, /Title \(19\/80 chars\): "Used Vintage Camera"/);
  assert.match(out, /Category: "Cameras"/);
  assert.match(out, /Price: \$49\.99/);
  assert.match(out, /Condition: Used/);
  assert.match(out, /Required Category Specifics \(MUST include all\): Brand, Model/);
  assert.match(out, /Recommended Category Specifics: MPN/);
  // Locks the JSON output schema fields.
  for (const k of ['"title"', '"description"', '"itemSpecifics"', '"priceRecommendation"', '"seoKeywords"', '"seoIssues"', '"overallTips"']) {
    assert.match(out, new RegExp(k));
  }
});

test('optimizerPrompt omits the required/recommended lines when both are empty', () => {
  const out = optimizerPrompt({
    title: 't', categoryName: 'c', price: '1', conditionName: 'New',
    descPlain: '', currentSpecifics: '{}',
  });
  assert.doesNotMatch(out, /Required Category Specifics/);
  assert.doesNotMatch(out, /Recommended Category Specifics/);
});

// ─── Telemetry wrapper ────────────────────────────────────────────────────

test('withAiTelemetry returns the inner result and records a success row', async () => {
  dbInserts.length = 0;
  const result = await withAiTelemetry(
    { companyId: 'c1', useCase: 'listing.generate', promptName: 'listing.final', promptVersion: '2026-05-25.1' },
    async () => ({
      title: 'hi',
      tokenUsage: { promptTokens: 12, completionTokens: 34, totalTokens: 46, model: 'gemini-2.5-flash' },
    }),
  );
  assert.equal(result.title, 'hi');
  assert.equal(dbInserts.length, 1);
  const row = dbInserts[0];
  assert.equal(row.companyId, 'c1');
  assert.equal(row.useCase, 'listing.generate');
  assert.equal(row.promptName, 'listing.final');
  assert.equal(row.promptVersion, '2026-05-25.1');
  assert.equal(row.model, 'gemini-2.5-flash');
  assert.equal(row.promptTokens, 12);
  assert.equal(row.completionTokens, 34);
  assert.equal(row.totalTokens, 46);
  assert.equal(row.success, true);
  assert.equal(row.errorMessage, null);
  assert.ok(row.latencyMs >= 0);
  assert.ok(row.recordedAt instanceof Date);
});

test('withAiTelemetry records a failure row and re-throws the original error', async () => {
  dbInserts.length = 0;
  await assert.rejects(
    () => withAiTelemetry(
      { companyId: 'c1', useCase: 'optimizer.optimize', promptName: 'optimizer.optimize', promptVersion: 'v1' },
      async () => { throw new Error('upstream blew up'); },
    ),
    /upstream blew up/,
  );
  assert.equal(dbInserts.length, 1);
  const row = dbInserts[0];
  assert.equal(row.success, false);
  assert.equal(row.errorMessage, 'upstream blew up');
  assert.equal(row.totalTokens, 0); // no usage reported on failure
});

test('withAiTelemetry does not log API keys, prompt bodies, or image data', async () => {
  dbInserts.length = 0;
  await withAiTelemetry(
    { companyId: 'c1', useCase: 'listing.generate', promptName: 'listing.final', promptVersion: 'v1' },
    async () => ({ tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, model: 'gemini' } }),
  );
  const row = dbInserts[0];
  for (const forbidden of ['apiKey', 'prompt', 'instructions', 'imageParts', 'imageBase64', 'images']) {
    assert.equal(row[forbidden], undefined, `telemetry row must not include ${forbidden}`);
  }
});

test('recordAiCall fills sensible defaults when fields are omitted', async () => {
  dbInserts.length = 0;
  await recordAiCall({ useCase: 'test' });
  const row = dbInserts[0];
  assert.equal(row.useCase, 'test');
  assert.equal(row.companyId, null);
  assert.equal(row.success, true);
  assert.equal(row.totalTokens, 0);
});
