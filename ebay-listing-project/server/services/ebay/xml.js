// eBay aspects that must be sent via dedicated XML elements, not ItemSpecifics.
const RESERVED_SPECIFICS = new Set([
  'condition', 'conditionid', 'condition id', 'price', 'start price',
  'buy it now price', 'currency', 'listing type', 'listing duration',
]);

// eBay caps individual ItemSpecifics values at 65 chars. Long aspects like
// "Compatible Model" are typically multi-value lists, so split them into
// multiple <Value> elements within a single <NameValueList> when possible.
function buildItemSpecificsXml(itemSpecifics) {
  if (!itemSpecifics) return '';
  const entries = Array.isArray(itemSpecifics)
    ? itemSpecifics.map(s => [s && s.name, s && s.value])
    : Object.entries(itemSpecifics);
  const filtered = entries.filter(([name, val]) =>
    name && val != null && val !== '' &&
    !RESERVED_SPECIFICS.has(String(name).toLowerCase().trim()));
  if (filtered.length === 0) return '';

  const splitValues = (raw) => {
    const s = String(raw).trim();
    if (!s) return [];
    if (s.length <= 65) return [s];
    for (const sep of [/\s*;\s*/, /\s*,\s*/]) {
      const parts = s.split(sep).map(p => p.trim()).filter(Boolean);
      if (parts.length > 1 && parts.every(p => p.length <= 65)) return parts;
    }
    return [s.substring(0, 65)];
  };

  const blocks = filtered.map(([name, val]) => {
    const safeName = String(name).substring(0, 65);
    const values = splitValues(val).slice(0, 30);
    if (values.length === 0) return '';
    const valueXml = values.map(v => `<Value><![CDATA[${v}]]></Value>`).join('');
    return `<NameValueList><Name><![CDATA[${safeName}]]></Name>${valueXml}</NameValueList>`;
  }).filter(Boolean);

  if (blocks.length === 0) return '';
  return '<ItemSpecifics>\n' + blocks.join('\n') + '\n</ItemSpecifics>';
}

module.exports = { RESERVED_SPECIFICS, buildItemSpecificsXml };
