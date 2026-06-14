// Shared sold-items fetch + parse for GetMyeBaySelling.SoldList.
//
// Extracted from routes/ebay/sync.js (P1.4) so both the on-demand sync
// route AND the server-side scheduled reconciler use one implementation.
// Dependencies (tradingApiCall, getValidAccessToken) are injected so this
// is testable without real eBay credentials.

const SOLD_SYNC_ALLOWED_LOOKBACK = new Set([30, 60, 90]);
const SOLD_SYNC_DEFAULT_LOOKBACK = 30;
const SOLD_SYNC_ENTRIES_PER_PAGE = 50;
// Safety cap so a misconfigured response can't push us into pagination forever.
const SOLD_SYNC_MAX_PAGES = 60;

function resolveLookbackDays(raw) {
  const n = parseInt(raw, 10);
  if (SOLD_SYNC_ALLOWED_LOOKBACK.has(n)) return n;
  return SOLD_SYNC_DEFAULT_LOOKBACK;
}

// Pure: parse a single GetMyeBaySelling response page into items + pagination.
function parseSoldItemsPage(body) {
  const totalMatch = /<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/.exec(body);
  const totalEntries = totalMatch ? parseInt(totalMatch[1], 10) : 0;
  const totalPagesMatch = /<TotalNumberOfPages>(\d+)<\/TotalNumberOfPages>/.exec(body);
  const totalPages = totalPagesMatch ? parseInt(totalPagesMatch[1], 10) : 1;

  const items = [];
  const itemRegex = /<Item>([\s\S]*?)<\/Item>/g;
  let m;
  while ((m = itemRegex.exec(body)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
      const x = r.exec(block);
      return x ? x[1].trim() : '';
    };
    const itemId = get('ItemID');
    if (!itemId) continue;
    items.push({
      itemId,
      title: get('Title'),
      soldPrice: get('CurrentPrice') || get('SalePrice') || '',
      soldDate: get('LastModifiedTime') || '',
      quantitySold: get('QuantitySold') || '1',
    });
  }
  return { items, totalEntries, totalPages };
}

function buildSoldItemsXml(lookbackDays, pageNumber) {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <SoldList>
    <Include>true</Include>
    <DurationInDays>${lookbackDays}</DurationInDays>
    <Pagination><EntriesPerPage>${SOLD_SYNC_ENTRIES_PER_PAGE}</EntriesPerPage><PageNumber>${pageNumber}</PageNumber></Pagination>
  </SoldList>
  <HideVariations>true</HideVariations>
</GetMyeBaySellingRequest>`;
}

// Paginate through every page of the sold list for the chosen window.
// Returns { items, pagesFetched, totalEntries }. De-duplicates by ItemID.
async function fetchAllSoldItems({ companyId, lookbackDays }, { tradingApiCall, getValidAccessToken }) {
  const token = await getValidAccessToken(companyId);
  const items = [];
  const seen = new Set();
  let pagesFetched = 0;
  let totalEntries = 0;

  for (let pageNumber = 1; pageNumber <= SOLD_SYNC_MAX_PAGES; pageNumber++) {
    const resp = await tradingApiCall({
      callName: 'GetMyeBaySelling',
      xmlBody: buildSoldItemsXml(lookbackDays, pageNumber),
      token,
    });
    pagesFetched += 1;
    const page = parseSoldItemsPage(resp.data);
    if (page.totalEntries) totalEntries = page.totalEntries;

    let pageItems = 0;
    for (const item of page.items) {
      if (seen.has(item.itemId)) continue;
      seen.add(item.itemId);
      items.push(item);
      pageItems += 1;
    }

    if (pageNumber >= page.totalPages || pageItems === 0) break;
  }

  return { items, pagesFetched, totalEntries };
}

module.exports = {
  SOLD_SYNC_ALLOWED_LOOKBACK,
  SOLD_SYNC_DEFAULT_LOOKBACK,
  SOLD_SYNC_ENTRIES_PER_PAGE,
  SOLD_SYNC_MAX_PAGES,
  resolveLookbackDays,
  parseSoldItemsPage,
  buildSoldItemsXml,
  fetchAllSoldItems,
};
