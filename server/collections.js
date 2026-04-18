const { getDb } = require('./db');

const DEFAULT_COLLECTIONS = [
  { code: 'OT999', name: 'Other (Catch-All)' },
  { code: 'TY100', name: 'Toys' },
  { code: 'TY200', name: 'Vintage Toys' },
  { code: 'TY300', name: 'Retro Toys' },
  { code: 'TY400', name: 'Modern Toys' },
  { code: 'TY500', name: 'Collectible Toys' },
  { code: 'TC100', name: 'Trading Cards (General)' },
  { code: 'TC200', name: 'TCG (Non-Sports Cards)' },
  { code: 'PK200', name: 'Pokémon Cards' },
  { code: 'YG200', name: 'Yu-Gi-Oh Cards' },
  { code: 'MT200', name: 'Magic: The Gathering' },
  { code: 'OP200', name: 'One Piece Cards' },
  { code: 'DB200', name: 'Dragon Ball Cards' },
  { code: 'DG200', name: 'Digimon Cards' },
  { code: 'SC100', name: 'Sports Cards (General)' },
  { code: 'BB200', name: 'Baseball Cards' },
  { code: 'BK200', name: 'Basketball Cards' },
  { code: 'FB200', name: 'Football Cards' },
  { code: 'HK200', name: 'Hockey Cards' },
  { code: 'SC300', name: 'Soccer Cards' },
  { code: 'BX100', name: 'Sealed Products' },
  { code: 'BX200', name: 'Booster Boxes / Packs' },
  { code: 'SL100', name: 'Slabbed / Graded Items' },
  { code: 'FX100', name: 'Funko Pops' },
  { code: 'AC100', name: 'Action Figures' },
  { code: 'ST100', name: 'Statues & Figures' },
  { code: 'PL100', name: 'Plush' },
  { code: 'BD100', name: 'Board Games' },
  { code: 'VG100', name: 'Video Games' },
  { code: 'VG200', name: 'Retro Video Games' },
  { code: 'VG300', name: 'Modern Video Games' },
  { code: 'VC100', name: 'Video Game Consoles' },
  { code: 'CM100', name: 'Comics' },
  { code: 'BK100', name: 'Books' },
  { code: 'GN100', name: 'Graphic Novels' },
  { code: 'MG100', name: 'Magazines' },
  { code: 'AN100', name: 'Anime Merchandise' },
  { code: 'MN100', name: 'Manga' },
  { code: 'MV100', name: 'Movies (DVD/Blu-ray)' },
  { code: 'MS100', name: 'Music (Physical Media)' },
  { code: 'RC100', name: 'Vinyl Records' },
  { code: 'CS100', name: 'Cassettes' },
  { code: 'EL100', name: 'Electronics' },
  { code: 'CL100', name: 'Clothing' },
  { code: 'HT100', name: 'Hats & Headwear' },
  { code: 'SH100', name: 'Shoes' },
  { code: 'JW100', name: 'Jewelry' },
  { code: 'WD100', name: 'Watches' },
  { code: 'HG100', name: 'Home Goods' },
  { code: 'DC100', name: 'Home Decor' },
  { code: 'AR100', name: 'Art' },
  { code: 'PT100', name: 'Posters & Prints' },
  { code: 'SG100', name: 'Signed / Autographed Items' },
  { code: 'PR100', name: 'Promotional Items' },
  { code: 'EV100', name: 'Event Exclusives' },
  { code: 'LM100', name: 'Limited Editions' },
  { code: 'CH100', name: 'Chase / Variant Items' },
  { code: 'RC200', name: 'Rare Items' },
  { code: 'UL100', name: 'High-End / Premium Items' },
  { code: 'BU100', name: 'Bundles / Lots' },
  { code: 'CL200', name: 'Clearance' },
  { code: 'NW100', name: 'New Arrivals' },
  { code: 'FT100', name: 'Featured Items' },
  { code: 'TR100', name: 'Trending Items' },
  { code: 'DS100', name: 'Discounted Items' },
  { code: 'VI100', name: 'Vintage Items (General)' },
  { code: 'RT100', name: 'Retro Items (General)' },
];

const CODE_RE = /^[A-Z]{2}\d{3}$/;

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function validCode(code) {
  return CODE_RE.test(normalizeCode(code));
}

async function listCollections(companyId) {
  const db = await getDb();
  const existing = await db.collection('catalog_codes')
    .find({ companyId })
    .sort({ code: 1 })
    .toArray();

  if (existing.length === 0) {
    const seed = DEFAULT_COLLECTIONS.map(c => ({ companyId, code: c.code, name: c.name }));
    if (seed.length > 0) {
      try { await db.collection('catalog_codes').insertMany(seed, { ordered: false }); } catch (e) { /* ignore dupes */ }
    }
    return DEFAULT_COLLECTIONS.map(c => ({ code: c.code, name: c.name }));
  }

  return existing.map(d => ({ code: d.code, name: d.name }));
}

async function addCollection(companyId, code, name) {
  const norm = normalizeCode(code);
  const trimmedName = String(name || '').trim();
  if (!validCode(norm)) throw new Error('Invalid code format (expected XX###)');
  if (!trimmedName) throw new Error('Name is required');

  const db = await getDb();
  const existing = await db.collection('catalog_codes').findOne({ companyId, code: norm });
  if (existing) throw new Error(`Code ${norm} already exists`);

  await db.collection('catalog_codes').insertOne({ companyId, code: norm, name: trimmedName });
  return { code: norm, name: trimmedName };
}

async function updateCollection(companyId, oldCode, code, name) {
  const oldNorm = normalizeCode(oldCode);
  const newNorm = normalizeCode(code);
  const trimmedName = String(name || '').trim();
  if (!validCode(newNorm)) throw new Error('Invalid code format (expected XX###)');
  if (!trimmedName) throw new Error('Name is required');

  const db = await getDb();
  if (oldNorm !== newNorm) {
    const conflict = await db.collection('catalog_codes').findOne({ companyId, code: newNorm });
    if (conflict) throw new Error(`Code ${newNorm} already exists`);
  }

  const result = await db.collection('catalog_codes').updateOne(
    { companyId, code: oldNorm },
    { $set: { code: newNorm, name: trimmedName } }
  );
  if (result.matchedCount === 0) {
    await db.collection('catalog_codes').insertOne({ companyId, code: newNorm, name: trimmedName });
  }
  return { code: newNorm, name: trimmedName };
}

async function deleteCollection(companyId, code) {
  const norm = normalizeCode(code);
  const db = await getDb();
  await db.collection('catalog_codes').deleteOne({ companyId, code: norm });
}

async function getCollectionsForAI(companyId) {
  const list = await listCollections(companyId);
  return list.map(c => `${c.code}: ${c.name}`).join(', ');
}

module.exports = {
  DEFAULT_COLLECTIONS,
  listCollections,
  addCollection,
  updateCollection,
  deleteCollection,
  getCollectionsForAI,
};
