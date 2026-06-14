// IMG-003 — unit tests for the revise-images helpers.

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  EPS_HOST_FRAGMENTS,
  isAlreadyOnEps,
  resolveReviseImageUrls,
} = require('../services/ebay/reviseImages');

test('EPS_HOST_FRAGMENTS lists the documented host fragments', () => {
  assert.ok(EPS_HOST_FRAGMENTS.includes('i.ebayimg.com'));
  assert.ok(EPS_HOST_FRAGMENTS.includes('thumbs.ebaystatic.com'));
});

test('isAlreadyOnEps recognizes EPS URLs', () => {
  assert.equal(isAlreadyOnEps('https://i.ebayimg.com/images/g/X/s-l1600.jpg'), true);
  assert.equal(isAlreadyOnEps('https://thumbs.ebaystatic.com/thumb.jpg'), true);
});

test('isAlreadyOnEps rejects non-EPS sources', () => {
  assert.equal(isAlreadyOnEps('https://res.cloudinary.com/x/image.jpg'), false);
  assert.equal(isAlreadyOnEps('https://cdn.example.com/photo.jpg'), false);
  assert.equal(isAlreadyOnEps('data:image/png;base64,iVBORw0KGgo='), false);
});

test('isAlreadyOnEps handles non-string input safely', () => {
  assert.equal(isAlreadyOnEps(null), false);
  assert.equal(isAlreadyOnEps(undefined), false);
  assert.equal(isAlreadyOnEps(42), false);
  assert.equal(isAlreadyOnEps({}), false);
});

test('resolveReviseImageUrls returns empty for empty / non-array input', async () => {
  const upload = async () => { throw new Error('should not be called'); };
  assert.deepEqual(await resolveReviseImageUrls([], 'tok', { uploadImagesToEps: upload }), []);
  assert.deepEqual(await resolveReviseImageUrls(null, 'tok', { uploadImagesToEps: upload }), []);
  assert.deepEqual(await resolveReviseImageUrls(undefined, 'tok', { uploadImagesToEps: upload }), []);
});

test('resolveReviseImageUrls skips upload entirely when every URL is already on EPS', async () => {
  let uploadCalls = 0;
  const upload = async () => { uploadCalls++; return []; };
  const out = await resolveReviseImageUrls(
    ['https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg'],
    'tok',
    { uploadImagesToEps: upload },
  );
  assert.deepEqual(out, ['https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg']);
  assert.equal(uploadCalls, 0);
});

test('resolveReviseImageUrls uploads only the non-EPS entries', async () => {
  const uploadSeen = [];
  const upload = async (urls, token) => {
    uploadSeen.push({ urls, token });
    // Pretend EPS returned new URLs in the same order it received them.
    return urls.map((_, i) => `https://i.ebayimg.com/uploaded-${i}.jpg`);
  };
  const out = await resolveReviseImageUrls(
    [
      'https://i.ebayimg.com/a.jpg',          // EPS already — passes through
      'https://res.cloudinary.com/x/b.jpg',   // needs upload
      'data:image/png;base64,iVBORw0KGgo=',   // needs upload
      'https://i.ebayimg.com/d.jpg',          // EPS already
    ],
    'my-token',
    { uploadImagesToEps: upload },
  );

  // Upload received only the non-EPS entries, in order.
  assert.equal(uploadSeen.length, 1);
  assert.equal(uploadSeen[0].token, 'my-token');
  assert.deepEqual(uploadSeen[0].urls, [
    'https://res.cloudinary.com/x/b.jpg',
    'data:image/png;base64,iVBORw0KGgo=',
  ]);

  // Output preserves the original order, with uploaded URLs slotted in.
  assert.deepEqual(out, [
    'https://i.ebayimg.com/a.jpg',
    'https://i.ebayimg.com/uploaded-0.jpg',
    'https://i.ebayimg.com/uploaded-1.jpg',
    'https://i.ebayimg.com/d.jpg',
  ]);
});

test('resolveReviseImageUrls propagates upload errors', async () => {
  const upload = async () => { throw new Error('eBay EPS Image Upload Failed: bad image'); };
  await assert.rejects(
    () => resolveReviseImageUrls(
      ['https://res.cloudinary.com/x/b.jpg'],
      'tok',
      { uploadImagesToEps: upload },
    ),
    /eBay EPS Image Upload Failed: bad image/,
  );
});
