// One-time startup tasks: create Mongo indexes, ensure the default company
// exists, migrate legacy single-tenant documents to company-scoped IDs, purge
// imported eBay listings, and seed the superadmin user. Idempotent — safe to
// run on every process start.
//
// Extracted from server/app.js as the final step of ARCH-005h-8 so app.js
// can stay focused on HTTP wiring.

const { getDb } = require('./db');
const { createCompany, createUser, getUserByEmail } = require('./users');

async function bootstrap() {
  try {
    const db = await getDb();

    // Ensure MongoDB indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('companies').createIndex({ id: 1 }, { unique: true });
    await db.collection('listings').createIndex({ companyId: 1, status: 1 });

    // --- Container Management Collections & Indexes ---

    // containers collection
    await db.collection('containers').createIndex({ companyId: 1, name: 1 }, { unique: true });
    await db.collection('containers').createIndex({ companyId: 1, status: 1 });
    await db.collection('containers').createIndex({ companyId: 1, containerType: 1 });
    await db.collection('containers').createIndex({ companyId: 1, building: 1, room: 1, shelf: 1, shelfRow: 1 });
    await db.collection('containers').createIndex({ companyId: 1, fullnessPercentage: 1 });
    await db.collection('containers').createIndex({ companyId: 1, createdAt: 1 });
    await db.collection('containers').createIndex({ companyId: 1, updatedAt: 1 });

    // container_aliases collection
    await db.collection('container_aliases').createIndex({ companyId: 1, normalizedValue: 1 });
    await db.collection('container_aliases').createIndex({ companyId: 1, containerId: 1 });
    await db.collection('container_aliases').createIndex({ companyId: 1, aliasValue: 1 });

    // container_item_assignments collection
    await db.collection('container_item_assignments').createIndex({ companyId: 1, containerId: 1 });
    await db.collection('container_item_assignments').createIndex({ companyId: 1, itemId: 1, itemType: 1 }, { unique: true });
    await db.collection('container_item_assignments').createIndex({ companyId: 1, assignedAt: 1 });

    // container_audit collection
    await db.collection('container_audit').createIndex({ companyId: 1, entityId: 1, timestamp: -1 });
    await db.collection('container_audit').createIndex({ companyId: 1, timestamp: -1 });
    await db.collection('container_audit').createIndex({ companyId: 1, actionType: 1 });

    // review_queue collection
    await db.collection('review_queue').createIndex({ companyId: 1, status: 1, confidenceScore: -1 });
    await db.collection('review_queue').createIndex({ companyId: 1, originalSku: 1 });

    // container_types collection (simple collection for type definitions)
    await db.collection('container_types').createIndex({ companyId: 1, name: 1 }, { unique: true });

    // Find or create the default FlipSide Collectibles company
    let company = (await db.collection('companies').find({}).toArray()).find((c) => c.name === 'FlipSide Collectibles');
    if (!company) {
      company = await createCompany('FlipSide Collectibles');
      console.log('[bootstrap] Created FlipSide Collectibles company, id:', company.id);
    } else {
      console.log('[bootstrap] FlipSide Collectibles exists, id:', company.id);
    }

    // Migrate pre-multitenant records to the default company.
    const migrateListingsResult = await db.collection('listings').updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId: company.id } },
    );
    if (migrateListingsResult.modifiedCount > 0) {
      console.log(`[bootstrap] Migrated ${migrateListingsResult.modifiedCount} listings → companyId=${company.id}`);
    }

    const legacySettings = await db.collection('config').findOne({ _id: 'user_settings' });
    if (legacySettings) {
      const { _id, ...settingsData } = legacySettings;
      await db.collection('config').updateOne({ _id: `${company.id}_settings` }, { $set: settingsData }, { upsert: true });
      await db.collection('config').deleteOne({ _id: 'user_settings' });
      console.log('[bootstrap] Migrated user_settings →', `${company.id}_settings`);
    }
    const legacyTokenUsage = await db.collection('config').findOne({ _id: 'token_usage' });
    if (legacyTokenUsage) {
      const { _id, ...usageData } = legacyTokenUsage;
      await db.collection('config').updateOne({ _id: `${company.id}_token_usage` }, { $set: usageData }, { upsert: true });
      await db.collection('config').deleteOne({ _id: 'token_usage' });
      console.log('[bootstrap] Migrated token_usage →', `${company.id}_token_usage`);
    }
    const legacyTokens = await db.collection('tokens').findOne({ _id: 'admin_tokens' });
    if (legacyTokens) {
      const { _id, ...tokenData } = legacyTokens;
      await db.collection('tokens').updateOne({ _id: `${company.id}_tokens` }, { $set: tokenData }, { upsert: true });
      await db.collection('tokens').deleteOne({ _id: 'admin_tokens' });
      console.log('[bootstrap] Migrated admin_tokens →', `${company.id}_tokens`);
    }

    // Remove imported eBay listings — the app only keeps natively-created records.
    const purgeResult = await db.collection('listings').deleteMany({ importedFromEbay: true });
    if (purgeResult.deletedCount > 0) {
      console.log(`[bootstrap] Purged ${purgeResult.deletedCount} imported eBay listings`);
    }

    // Seed the superadmin user from env vars (idempotent).
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const existing = await getUserByEmail(adminEmail);
      if (!existing) {
        await createUser({ companyId: company.id, email: adminEmail, password: adminPassword, name: 'Admin', role: 'superadmin' });
        console.log('[bootstrap] Created superadmin user:', adminEmail);
      } else {
        console.log('[bootstrap] Superadmin already exists:', adminEmail);
      }
    } else {
      console.warn('[bootstrap] ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin user creation');
    }

    console.log('[bootstrap] Done.');
  } catch (e) {
    console.error('[bootstrap] Error:', e.message);
  }
}

module.exports = { bootstrap };
