// Characterization tests for the AddFixedPriceItem XML builders extracted
// from pushListingToEbay (server/app.js). The goal is to lock in current
// behavior so ARCH-004 (moving the full lifecycle orchestration into
// services/ebay/listingLifecycle.js) is a mechanical extraction, not a
// rewrite.
//
// If you change a builder's output, update the assertion AND record why in
// the implementation plan tracker so reviewers can see the rationale.

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  formatValidPrice,
  wrapDescription,
  buildPictureDetailsXml,
  buildShippingPackageDetailsXml,
  buildBestOfferXml,
  buildScheduleTimeXml,
  buildAddFixedPriceItemXml,
} = require('../services/ebay/listingLifecycle');

// ─── formatValidPrice ─────────────────────────────────────────────────────

test('formatValidPrice strips currency symbols and returns two decimals', () => {
  assert.equal(formatValidPrice('$24.99'), '24.99');
  assert.equal(formatValidPrice('24.99 USD'), '24.99');
  assert.equal(formatValidPrice('24'), '24.00');
  assert.equal(formatValidPrice('1234.5'), '1234.50');
});

test('formatValidPrice falls back to "50.00" for empty, null, or non-numeric input', () => {
  assert.equal(formatValidPrice(''), '50.00');
  assert.equal(formatValidPrice(null), '50.00');
  assert.equal(formatValidPrice(undefined), '50.00');
  assert.equal(formatValidPrice('not a price'), '50.00');
  assert.equal(formatValidPrice('$$$'), '50.00');
});

// ─── wrapDescription ──────────────────────────────────────────────────────

test('wrapDescription concatenates header + body + footer with null-safe defaults', () => {
  assert.equal(wrapDescription('H', 'B', 'F'), 'HBF');
  assert.equal(wrapDescription(null, 'B', null), 'B');
  assert.equal(wrapDescription(undefined, 'B', undefined), 'B');
  assert.equal(wrapDescription('', 'B', ''), 'B');
});

// ─── buildPictureDetailsXml ───────────────────────────────────────────────

test('buildPictureDetailsXml returns empty string when no URLs given', () => {
  assert.equal(buildPictureDetailsXml([]), '');
  assert.equal(buildPictureDetailsXml(null), '');
  assert.equal(buildPictureDetailsXml(undefined), '');
});

test('buildPictureDetailsXml wraps each URL in <PictureURL> inside a <PictureDetails>', () => {
  const xml = buildPictureDetailsXml(['https://a.example/1.jpg', 'https://b.example/2.png']);
  assert.match(xml, /^<PictureDetails>/);
  assert.match(xml, /<\/PictureDetails>$/);
  assert.match(xml, /<PictureURL>https:\/\/a\.example\/1\.jpg<\/PictureURL>/);
  assert.match(xml, /<PictureURL>https:\/\/b\.example\/2\.png<\/PictureURL>/);
});

// ─── buildShippingPackageDetailsXml ───────────────────────────────────────

test('buildShippingPackageDetailsXml returns empty when no dimensions or weight are set', () => {
  assert.equal(buildShippingPackageDetailsXml({}), '');
  assert.equal(buildShippingPackageDetailsXml({ packageLength: 0, packageWidth: '' }), '');
  assert.equal(buildShippingPackageDetailsXml({ packageWeightLbs: 'abc' }), '');
});

test('buildShippingPackageDetailsXml emits only the dimension fields that are set', () => {
  const xml = buildShippingPackageDetailsXml({ packageLength: 10 });
  assert.match(xml, /<PackageLength unit="inches">10<\/PackageLength>/);
  assert.doesNotMatch(xml, /PackageWidth/);
  assert.doesNotMatch(xml, /WeightMajor/);
});

test('buildShippingPackageDetailsXml emits both WeightMajor and WeightMinor even when only one is set (so eBay accepts the weight)', () => {
  const onlyLbs = buildShippingPackageDetailsXml({ packageWeightLbs: 2 });
  assert.match(onlyLbs, /<WeightMajor unit="lbs">2<\/WeightMajor>/);
  assert.match(onlyLbs, /<WeightMinor unit="oz">0<\/WeightMinor>/);

  const onlyOz = buildShippingPackageDetailsXml({ packageWeightOz: 5 });
  assert.match(onlyOz, /<WeightMajor unit="lbs">0<\/WeightMajor>/);
  assert.match(onlyOz, /<WeightMinor unit="oz">5<\/WeightMinor>/);
});

test('buildShippingPackageDetailsXml floors pounds to an integer', () => {
  const xml = buildShippingPackageDetailsXml({ packageWeightLbs: 2.7, packageWeightOz: 3 });
  assert.match(xml, /<WeightMajor unit="lbs">2<\/WeightMajor>/);
  assert.match(xml, /<WeightMinor unit="oz">3<\/WeightMinor>/);
});

test('buildShippingPackageDetailsXml emits all fields together when fully specified', () => {
  const xml = buildShippingPackageDetailsXml({
    packageLength: 12,
    packageWidth: 8,
    packageDepth: 4,
    packageWeightLbs: 1,
    packageWeightOz: 6,
  });
  assert.match(xml, /<ShippingPackageDetails><PackageLength unit="inches">12<\/PackageLength><PackageWidth unit="inches">8<\/PackageWidth><PackageDepth unit="inches">4<\/PackageDepth><WeightMajor unit="lbs">1<\/WeightMajor><WeightMinor unit="oz">6<\/WeightMinor><\/ShippingPackageDetails>/);
});

// ─── buildBestOfferXml ────────────────────────────────────────────────────

test('buildBestOfferXml returns empty pair when bestOffer is missing or disabled', () => {
  assert.deepEqual(buildBestOfferXml(null), { bestOfferDetailsXml: '', listingDetailsXml: '' });
  assert.deepEqual(buildBestOfferXml(undefined), { bestOfferDetailsXml: '', listingDetailsXml: '' });
  assert.deepEqual(buildBestOfferXml({ enabled: false }), { bestOfferDetailsXml: '', listingDetailsXml: '' });
});

test('buildBestOfferXml emits only the BestOfferEnabled flag when no thresholds are set', () => {
  const out = buildBestOfferXml({ enabled: true });
  assert.equal(out.bestOfferDetailsXml, '<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>');
  assert.equal(out.listingDetailsXml, '');
});

test('buildBestOfferXml emits auto-accept and minimum prices when both are valid', () => {
  const out = buildBestOfferXml({ enabled: true, autoAcceptPrice: '20', minOfferPrice: '$15.50' });
  assert.match(out.listingDetailsXml, /<BestOfferAutoAcceptPrice currencyID="USD">20\.00<\/BestOfferAutoAcceptPrice>/);
  assert.match(out.listingDetailsXml, /<MinimumBestOfferPrice currencyID="USD">15\.50<\/MinimumBestOfferPrice>/);
});

test('buildBestOfferXml silently drops zero and non-numeric thresholds', () => {
  // Note: production sanitizeMoney() strips every non-digit/non-dot before
  // parsing, so the leading "-" in "-$5" is removed and the value parses
  // as +5. The function therefore does NOT reject negative-looking strings;
  // it only rejects values that are still zero/NaN after the strip.
  const zeroAndJunk = buildBestOfferXml({ enabled: true, autoAcceptPrice: 0, minOfferPrice: 'junk' });
  assert.equal(zeroAndJunk.listingDetailsXml, '');

  // Document the negative-string quirk explicitly. If product decides this
  // is wrong, the fix lives in sanitizeMoney inside buildBestOfferXml.
  const negativeBecomesPositive = buildBestOfferXml({ enabled: true, minOfferPrice: '-5' });
  assert.match(negativeBecomesPositive.listingDetailsXml, /MinimumBestOfferPrice currencyID="USD">5\.00</);
});

test('buildBestOfferXml emits only the threshold that is valid when one is bad', () => {
  const out = buildBestOfferXml({ enabled: true, autoAcceptPrice: '25', minOfferPrice: 'junk' });
  assert.match(out.listingDetailsXml, /<BestOfferAutoAcceptPrice currencyID="USD">25\.00<\/BestOfferAutoAcceptPrice>/);
  assert.doesNotMatch(out.listingDetailsXml, /MinimumBestOfferPrice/);
});

// ─── buildScheduleTimeXml ─────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-06-01T12:00:00Z').getTime();

test('buildScheduleTimeXml returns empty when no schedule date provided', () => {
  assert.equal(buildScheduleTimeXml(null, { now: FIXED_NOW }), '');
  assert.equal(buildScheduleTimeXml(undefined, { now: FIXED_NOW }), '');
  assert.equal(buildScheduleTimeXml('', { now: FIXED_NOW }), '');
});

test('buildScheduleTimeXml returns empty for an unparseable date', () => {
  assert.equal(buildScheduleTimeXml('not a date', { now: FIXED_NOW }), '');
});

test('buildScheduleTimeXml returns empty for dates less than 5 minutes in the future', () => {
  const tooSoon = new Date(FIXED_NOW + 60 * 1000).toISOString();
  assert.equal(buildScheduleTimeXml(tooSoon, { now: FIXED_NOW }), '');
});

test('buildScheduleTimeXml returns empty for dates beyond eBay\'s 21-day window', () => {
  const tooFar = new Date(FIXED_NOW + 22 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(buildScheduleTimeXml(tooFar, { now: FIXED_NOW }), '');
});

test('buildScheduleTimeXml emits a ScheduleTime element for dates inside the window', () => {
  const ok = new Date(FIXED_NOW + 2 * 24 * 60 * 60 * 1000).toISOString();
  const xml = buildScheduleTimeXml(ok, { now: FIXED_NOW });
  assert.equal(xml, `<ScheduleTime>${ok}</ScheduleTime>`);
});

// ─── buildAddFixedPriceItemXml (golden cases) ─────────────────────────────

function baseInputs(overrides = {}) {
  return {
    listing: {
      title: 'Vintage Star Wars Action Figure',
      description: 'A classic figure in great shape.',
      quantity: 1,
      ...overrides.listing,
    },
    config: {
      categoryId: '261068',
      sellerZip: '10001',
      sellerLocation: 'United States',
      paymentPolicy: 'pay-1',
      returnPolicy: 'ret-1',
      fulfillmentPolicy: 'ship-1',
      ...overrides.config,
    },
    conditionId: '3000',
    validPrice: '24.99',
    pictureDetailsXml: '',
    itemSpecificsXml: '',
    shippingPackageDetailsXml: '',
    bestOfferDetailsXml: '',
    listingDetailsXml: '',
    scheduleTimeXml: '',
    wrappedDescription: 'A classic figure in great shape.',
    ...overrides,
  };
}

test('buildAddFixedPriceItemXml minimal listing — locks in the canonical envelope', () => {
  const xml = buildAddFixedPriceItemXml(baseInputs());
  assert.match(xml, /^<\?xml version="1\.0" encoding="utf-8"\?>/);
  assert.match(xml, /<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">/);
  assert.match(xml, /<ErrorLanguage>en_US<\/ErrorLanguage>/);
  assert.match(xml, /<WarningLevel>High<\/WarningLevel>/);
  assert.match(xml, /<Title><!\[CDATA\[Vintage Star Wars Action Figure\]\]><\/Title>/);
  assert.match(xml, /<Description><!\[CDATA\[A classic figure in great shape\.\]\]><\/Description>/);
  assert.match(xml, /<PrimaryCategory><CategoryID>261068<\/CategoryID><\/PrimaryCategory>/);
  assert.match(xml, /<StartPrice currencyID="USD">24\.99<\/StartPrice>/);
  assert.match(xml, /<Quantity>1<\/Quantity>/);
  assert.match(xml, /<ConditionID>3000<\/ConditionID>/);
  assert.match(xml, /<Country>US<\/Country>/);
  assert.match(xml, /<Currency>USD<\/Currency>/);
  assert.match(xml, /<DispatchTimeMax>3<\/DispatchTimeMax>/);
  assert.match(xml, /<ListingDuration>GTC<\/ListingDuration>/);
  assert.match(xml, /<ListingType>FixedPriceItem<\/ListingType>/);
  assert.match(xml, /<PostalCode>10001<\/PostalCode>/);
  assert.match(xml, /<Location><!\[CDATA\[United States\]\]><\/Location>/);
  assert.match(xml, /<SellerPaymentProfile><PaymentProfileID>pay-1<\/PaymentProfileID><\/SellerPaymentProfile>/);
  assert.match(xml, /<SellerReturnProfile><ReturnProfileID>ret-1<\/ReturnProfileID><\/SellerReturnProfile>/);
  assert.match(xml, /<SellerShippingProfile><ShippingProfileID>ship-1<\/ShippingProfileID><\/SellerShippingProfile>/);
  // Optional blocks should be absent (or just whitespace) — no SKU element when sku missing
  assert.doesNotMatch(xml, /<SKU>/);
  assert.doesNotMatch(xml, /<PictureDetails>/);
  assert.doesNotMatch(xml, /<ShippingPackageDetails>/);
  assert.doesNotMatch(xml, /<BestOfferDetails>/);
  assert.doesNotMatch(xml, /<ScheduleTime>/);
});

test('buildAddFixedPriceItemXml truncates titles longer than 80 characters', () => {
  const longTitle = 'A'.repeat(120);
  const xml = buildAddFixedPriceItemXml(baseInputs({ listing: { title: longTitle, description: '.', quantity: 1 } }));
  const match = xml.match(/<Title><!\[CDATA\[(.+?)\]\]><\/Title>/);
  assert.ok(match, 'title element should be present');
  assert.equal(match[1].length, 80);
});

test('buildAddFixedPriceItemXml includes SKU element only when listing.sku is set', () => {
  const withSku = buildAddFixedPriceItemXml(baseInputs({ listing: { title: 'T', description: '.', quantity: 1, sku: 'SKU-001' } }));
  assert.match(withSku, /<SKU><!\[CDATA\[SKU-001\]\]><\/SKU>/);

  const withoutSku = buildAddFixedPriceItemXml(baseInputs({ listing: { title: 'T', description: '.', quantity: 1 } }));
  assert.doesNotMatch(withoutSku, /<SKU>/);
});

test('buildAddFixedPriceItemXml coerces invalid quantity to at least 1', () => {
  const cases = [{ q: 0 }, { q: -3 }, { q: 'banana' }, { q: null }, { q: undefined }];
  for (const { q } of cases) {
    const xml = buildAddFixedPriceItemXml(baseInputs({ listing: { title: 'T', description: '.', quantity: q } }));
    assert.match(xml, /<Quantity>1<\/Quantity>/, `quantity ${q} should fall back to 1`);
  }
});

test('buildAddFixedPriceItemXml preserves positive integer quantity', () => {
  const xml = buildAddFixedPriceItemXml(baseInputs({ listing: { title: 'T', description: '.', quantity: 5 } }));
  assert.match(xml, /<Quantity>5<\/Quantity>/);
});

test('buildAddFixedPriceItemXml composes all optional XML blocks in the canonical order', () => {
  const xml = buildAddFixedPriceItemXml(baseInputs({
    pictureDetailsXml: '<PictureDetails><PictureURL>x</PictureURL></PictureDetails>',
    itemSpecificsXml: '<ItemSpecifics><NameValueList><Name>Color</Name><Value>Red</Value></NameValueList></ItemSpecifics>',
    shippingPackageDetailsXml: '<ShippingPackageDetails><PackageLength unit="inches">10</PackageLength></ShippingPackageDetails>',
    bestOfferDetailsXml: '<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>',
    listingDetailsXml: '<ListingDetails><BestOfferAutoAcceptPrice currencyID="USD">20.00</BestOfferAutoAcceptPrice></ListingDetails>',
    scheduleTimeXml: '<ScheduleTime>2026-06-15T00:00:00.000Z</ScheduleTime>',
  }));
  const order = [
    'PictureDetails',
    'ItemSpecifics',
    'ShippingPackageDetails',
    'BestOfferDetails',
    'ListingDetails',
    'PostalCode',
    'Location',
    'SellerProfiles',
    'ScheduleTime',
  ];
  let lastIdx = -1;
  for (const tag of order) {
    const idx = xml.indexOf(`<${tag}`);
    assert.ok(idx > lastIdx, `expected <${tag}> to appear after the previous tag (lastIdx=${lastIdx}, idx=${idx})`);
    lastIdx = idx;
  }
});

test('buildAddFixedPriceItemXml integrates wrapDescription output as the description body', () => {
  const wrapped = wrapDescription('<p>Header</p>', 'Body text.', '<p>Footer</p>');
  const xml = buildAddFixedPriceItemXml(baseInputs({ wrappedDescription: wrapped }));
  assert.match(xml, /<Description><!\[CDATA\[<p>Header<\/p>Body text\.<p>Footer<\/p>\]\]><\/Description>/);
});

// ─── End-to-end golden — minimal listing exact contents ───────────────────

test('end-to-end: minimal listing → all required eBay elements are present and well-formed', () => {
  const inputs = baseInputs();
  const xml = buildAddFixedPriceItemXml(inputs);

  // Required by eBay's AddFixedPriceItem schema — if any of these drops out
  // unexpectedly the listing will be rejected, so we lock the set explicitly.
  const required = [
    '<Title>', '<Description>', '<PrimaryCategory>', '<StartPrice',
    '<Quantity>', '<ConditionID>', '<Country>', '<Currency>',
    '<DispatchTimeMax>', '<ListingDuration>', '<ListingType>',
    '<PostalCode>', '<Location>', '<SellerProfiles>',
  ];
  for (const tag of required) {
    assert.ok(xml.includes(tag), `expected required element ${tag} in XML`);
  }

  // Closing tags too — accidentally producing malformed XML is the
  // characterization test's whole point.
  assert.match(xml, /<\/Item>\s*<\/AddFixedPriceItemRequest>\s*$/);
});
