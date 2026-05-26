const assert = require('node:assert/strict');
const test = require('node:test');

const { buildItemSpecificsXml } = require('../services/ebay/xml');

test('buildItemSpecificsXml returns empty XML for empty or reserved-only specifics', () => {
  assert.equal(buildItemSpecificsXml(null), '');
  assert.equal(buildItemSpecificsXml({ ConditionID: '3000', Price: '19.99' }), '');
});

test('buildItemSpecificsXml filters reserved specifics and wraps valid values in CDATA', () => {
  const xml = buildItemSpecificsXml({ Brand: 'Sony', Condition: 'Used', Type: 'Receiver' });

  assert.match(xml, /<ItemSpecifics>/);
  assert.match(xml, /<Name><!\[CDATA\[Brand\]\]><\/Name><Value><!\[CDATA\[Sony\]\]><\/Value>/);
  assert.match(xml, /<Name><!\[CDATA\[Type\]\]><\/Name><Value><!\[CDATA\[Receiver\]\]><\/Value>/);
  assert.doesNotMatch(xml, /Condition/);
});

test('buildItemSpecificsXml splits long semicolon-delimited values into multiple Value elements', () => {
  const xml = buildItemSpecificsXml({
    'Compatible Model': 'Model A with a descriptive suffix; Model B with a descriptive suffix',
  });

  assert.match(xml, /<Value><!\[CDATA\[Model A with a descriptive suffix\]\]><\/Value>/);
  assert.match(xml, /<Value><!\[CDATA\[Model B with a descriptive suffix\]\]><\/Value>/);
});

test('buildItemSpecificsXml splits long comma-delimited values when semicolon splitting does not apply', () => {
  const xml = buildItemSpecificsXml({
    'Compatible Brand': 'Brand A with a descriptive suffix, Brand B with a descriptive suffix',
  });

  assert.match(xml, /<Value><!\[CDATA\[Brand A with a descriptive suffix\]\]><\/Value>/);
  assert.match(xml, /<Value><!\[CDATA\[Brand B with a descriptive suffix\]\]><\/Value>/);
});

test('buildItemSpecificsXml truncates unsplittable values and long names to eBay limits', () => {
  const longName = 'N'.repeat(80);
  const longValue = 'V'.repeat(90);
  const xml = buildItemSpecificsXml({ [longName]: longValue });

  assert.match(xml, new RegExp(`<Name><!\\[CDATA\\[${'N'.repeat(65)}\\]\\]></Name>`));
  assert.match(xml, new RegExp(`<Value><!\\[CDATA\\[${'V'.repeat(65)}\\]\\]></Value>`));
  assert.doesNotMatch(xml, new RegExp('V'.repeat(66)));
});

test('buildItemSpecificsXml caps each aspect at 30 values', () => {
  const values = Array.from({ length: 35 }, (_, i) => `Value ${i + 1}`).join('; ');
  const xml = buildItemSpecificsXml({ Features: values });
  const valueCount = [...xml.matchAll(/<Value>/g)].length;

  assert.equal(valueCount, 30);
});

test('buildItemSpecificsXml supports array-shaped specifics from revise flows', () => {
  const xml = buildItemSpecificsXml([
    { name: 'Brand', value: 'Canon' },
    { name: 'ConditionID', value: '3000' },
  ]);

  assert.match(xml, /Canon/);
  assert.doesNotMatch(xml, /ConditionID/);
});
