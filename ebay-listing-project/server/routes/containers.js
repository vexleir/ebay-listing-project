// Container CRUD routes. Mounted under /api/containers below the global
// authMiddleware so every handler can rely on req.companyId.
//
// Tenant isolation is enforced at the query level — every method filters
// by req.companyId — so even a missing/malformed id can't leak rows from
// another company.

const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { recordAuditEntry, getAuditHistory } = require('../services/containers/audit');
const { calculateFullnessPercentage } = require('../services/containers/capacity');
const { seedDefaultContainerTypes } = require('../services/containers/constants');
const { normalizeContainerName, computeConfidence } = require('../services/containers/normalize');

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Escapes special regex characters in a string for safe use in RegExp.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Translates a known error (with `status`) into the HTTP shape the client
 * expects. Falls back to 500 for anything unrecognized.
 */
function handleError(res, e, context) {
  if (e && typeof e.status === 'number' && e.status >= 400 && e.status < 600) {
    res.status(e.status).json({ error: e.message });
  } else {
    console.error(`[containers] ${context}:`, e?.message || e);
    res.status(500).json({ error: e?.message || 'internal error' });
  }
}

/**
 * Validates that a container type exists in the container_types collection
 * for the given company. Seeds defaults if needed.
 */
async function isValidContainerType(db, companyId, containerType) {
  await seedDefaultContainerTypes(companyId);
  const typeRecord = await db.collection('container_types').findOne({
    companyId,
    name: { $regex: new RegExp(`^${escapeRegex(containerType)}$`, 'i') },
  });
  return !!typeRecord;
}

// ─── Container Type Management ───────────────────────────────────────────

// GET /types — list all container types for the company
router.get('/types', async (req, res) => {
  try {
    const db = await getDb();
    const collection = db.collection('container_types');

    // Ensure defaults are seeded for this company
    await seedDefaultContainerTypes(req.companyId);

    const types = await collection
      .find({ companyId: req.companyId })
      .sort({ isDefault: -1, name: 1 })
      .toArray();

    res.json({ types });
  } catch (e) {
    handleError(res, e, 'listTypes');
  }
});

// POST /types — create a custom container type
router.post('/types', async (req, res) => {
  try {
    const { name } = req.body;

    // Validate name is provided and is a string
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }

    const trimmedName = name.trim();

    // Validate length: 1–50 characters
    if (trimmedName.length < 1 || trimmedName.length > 50) {
      return res.status(400).json({ error: 'Container type name must be between 1 and 50 characters' });
    }

    const db = await getDb();
    const collection = db.collection('container_types');

    // Ensure defaults are seeded so we can check against them
    await seedDefaultContainerTypes(req.companyId);

    // Case-insensitive uniqueness check
    const existing = await collection.findOne({
      companyId: req.companyId,
      name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') },
    });

    if (existing) {
      return res.status(409).json({ error: 'Container type already exists' });
    }

    const now = new Date().toISOString();
    const doc = {
      companyId: req.companyId,
      name: trimmedName,
      isDefault: false,
      createdAt: now,
    };

    await collection.insertOne(doc);
    res.status(201).json(doc);
  } catch (e) {
    handleError(res, e, 'createType');
  }
});

// DELETE /types/:name — delete a custom container type
router.delete('/types/:name', async (req, res) => {
  try {
    const typeName = decodeURIComponent(req.params.name);
    const db = await getDb();
    const typesCollection = db.collection('container_types');

    // Ensure defaults are seeded
    await seedDefaultContainerTypes(req.companyId);

    // Find the type (case-insensitive)
    const typeDoc = await typesCollection.findOne({
      companyId: req.companyId,
      name: { $regex: new RegExp(`^${escapeRegex(typeName)}$`, 'i') },
    });

    if (!typeDoc) {
      return res.status(404).json({ error: 'Container type not found' });
    }

    // Prevent deletion of default types
    if (typeDoc.isDefault) {
      return res.status(400).json({ error: 'Cannot delete default container type' });
    }

    // Check if type is in use by any containers
    const containersCollection = db.collection('containers');
    const inUseCount = await containersCollection.countDocuments({
      companyId: req.companyId,
      containerType: { $regex: new RegExp(`^${escapeRegex(typeDoc.name)}$`, 'i') },
    });

    if (inUseCount > 0) {
      return res.status(409).json({ error: `Container type in use by ${inUseCount} containers` });
    }

    await typesCollection.deleteOne({ _id: typeDoc._id });
    res.json({ success: true });
  } catch (e) {
    handleError(res, e, 'deleteType');
  }
});

// ─── POST /generate — Generate containers from existing SKU data ─────────

router.post('/generate', async (req, res) => {
  try {
    const db = await getDb();
    const companyId = req.companyId;
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    // 1. Query listings for all items with a SKU value
    const listings = await db.collection('listings')
      .find(
        { companyId, sku: { $exists: true, $ne: null } },
        { projection: { sku: 1, id: 1, _id: 0 } }
      )
      .toArray();

    // Collect unique SKU values
    const skuSet = new Set();
    for (const listing of listings) {
      if (typeof listing.sku === 'string' && listing.sku.trim()) {
        skuSet.add(listing.sku);
      }
    }

    // 2. Check idempotency — skip SKUs that already have alias mappings
    const aliasCollection = db.collection('container_aliases');
    const existingAliases = await aliasCollection
      .find({ companyId, aliasValue: { $in: [...skuSet] } })
      .project({ aliasValue: 1, _id: 0 })
      .toArray();

    const alreadyMapped = new Set(existingAliases.map(a => a.aliasValue));
    const newSkus = [...skuSet].filter(sku => !alreadyMapped.has(sku));

    // 3. Normalize new SKUs and group by canonical name
    const canonicalGroups = new Map(); // canonical -> [originalSku, ...]
    let skipped = 0;

    for (const sku of newSkus) {
      const result = normalizeContainerName(sku);
      if (!result.valid) {
        skipped++;
        continue;
      }
      const { canonical } = result;
      if (!canonicalGroups.has(canonical)) {
        canonicalGroups.set(canonical, []);
      }
      canonicalGroups.get(canonical).push(sku);
    }

    // Also count already-mapped SKUs as skipped
    skipped += alreadyMapped.size;

    // 4. Ensure default container types are seeded
    await seedDefaultContainerTypes(companyId);

    // 5. For each unique canonical name, create a container (if not exists) and aliases
    const containersCollection = db.collection('containers');
    let containersCreated = 0;
    let aliasesMapped = 0;
    const now = new Date().toISOString();

    // Map canonical -> containerId for confidence scoring later
    const canonicalToContainerId = new Map();

    for (const [canonical, originalSkus] of canonicalGroups) {
      // Check if a container with this name already exists (case-insensitive)
      let container = await containersCollection.findOne({
        companyId,
        name: { $regex: new RegExp(`^${escapeRegex(canonical)}$`, 'i') },
      });

      if (!container) {
        // Create new container
        const containerId = crypto.randomUUID();
        container = {
          id: containerId,
          companyId,
          name: canonical,
          containerType: 'Other',
          status: 'Active',
          active: true,
          currentItemCount: 0,
          createdAt: now,
          updatedAt: now,
          building: null,
          room: null,
          shelf: null,
          shelfRow: null,
          estimatedCapacity: null,
          capacityType: null,
          fullnessPercentage: null,
          maxRecommendedItemCount: null,
          capacityNotes: null,
          barcodeValue: null,
          qrCodeValue: null,
          printableLabel: null,
          notes: null,
        };

        await containersCollection.insertOne(container);
        containersCreated++;

        // Record audit entry for creation
        await recordAuditEntry(companyId, {
          actionType: 'create',
          entityId: containerId,
          entityType: 'container',
          previousValue: null,
          newValue: { name: canonical, containerType: 'Other', source: 'auto-generated' },
          userId,
        });
      }

      canonicalToContainerId.set(canonical, container.id);

      // Create alias records for each original SKU
      for (const sku of originalSkus) {
        const aliasId = crypto.randomUUID();
        await aliasCollection.insertOne({
          id: aliasId,
          companyId,
          containerId: container.id,
          aliasValue: sku,
          normalizedValue: canonical,
          confidenceScore: 100,
          source: 'auto-generated',
          mergeHistory: null,
          createdAt: now,
          updatedAt: now,
        });
        aliasesMapped++;
      }
    }

    // 6. Confidence scoring — compare canonical names pairwise
    const canonicals = [...canonicalGroups.keys()];
    let reviewQueueEntries = 0;
    const reviewCollection = db.collection('review_queue');

    for (let i = 0; i < canonicals.length; i++) {
      for (let j = i + 1; j < canonicals.length; j++) {
        // Use one of the original SKUs from each group for comparison
        const skuA = canonicalGroups.get(canonicals[i])[0];
        const skuB = canonicalGroups.get(canonicals[j])[0];
        const score = computeConfidence(skuA, skuB);

        if (score >= 90) {
          // Auto-merge: transfer aliases from container B to container A, archive B
          const containerIdA = canonicalToContainerId.get(canonicals[i]);
          const containerIdB = canonicalToContainerId.get(canonicals[j]);

          // Transfer all aliases from B to A
          await aliasCollection.updateMany(
            { companyId, containerId: containerIdB },
            {
              $set: {
                containerId: containerIdA,
                mergeHistory: {
                  sourceContainerId: containerIdB,
                  targetContainerId: containerIdA,
                  mergedAt: now,
                  mergedBy: userId,
                },
                updatedAt: now,
              },
            }
          );

          // Archive container B
          await containersCollection.updateOne(
            { companyId, id: containerIdB },
            { $set: { status: 'Archived', active: false, updatedAt: now } }
          );

          // Record merge audit entry
          await recordAuditEntry(companyId, {
            actionType: 'merge',
            entityId: containerIdB,
            entityType: 'container',
            previousValue: { name: canonicals[j], status: 'Active' },
            newValue: { status: 'Archived', mergedInto: containerIdA },
            relatedEntities: [containerIdA],
            userId,
          });
        } else if (score >= 50 && score <= 89) {
          // Check if this pair was previously rejected
          const pairKey = [canonicals[i], canonicals[j]].sort().join('|');
          const existingEntry = await reviewCollection.findOne({
            companyId,
            rejectedPairs: pairKey,
          });

          if (!existingEntry) {
            // Create review queue entry
            const containerIdA = canonicalToContainerId.get(canonicals[i]);
            await reviewCollection.insertOne({
              id: crypto.randomUUID(),
              companyId,
              originalSku: canonicalGroups.get(canonicals[j])[0],
              suggestedContainerId: containerIdA,
              suggestedContainerName: canonicals[i],
              confidenceScore: score,
              reason: `"${canonicals[j]}" may refer to the same container as "${canonicals[i]}" (confidence: ${score}%)`,
              status: 'pending',
              rejectedPairs: [],
              createdAt: now,
              resolvedAt: null,
              resolvedBy: null,
            });
            reviewQueueEntries++;
          }
        }
        // Score < 50: discard, do nothing
      }
    }

    res.json({
      containersCreated,
      aliasesMapped,
      reviewQueueEntries,
      skipped,
    });
  } catch (e) {
    handleError(res, e, 'generate');
  }
});

// ─── GET / — List containers ─────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const filter = { companyId: req.companyId };

    // Filter by status (supports comma-separated list for multi-status filtering)
    if (req.query.status) {
      const statuses = req.query.status.split(',').map(s => s.trim());
      if (statuses.length === 1) {
        filter.status = statuses[0];
      } else {
        filter.status = { $in: statuses };
      }
    }

    // Filter by container type
    if (req.query.type) {
      filter.containerType = req.query.type;
    }

    // Filter by location fields
    if (req.query.building) filter.building = req.query.building;
    if (req.query.room) filter.room = req.query.room;
    if (req.query.shelf) filter.shelf = req.query.shelf;
    if (req.query.shelfRow) filter.shelfRow = req.query.shelfRow;

    const containers = await db
      .collection('containers')
      .find(filter)
      .sort({ name: 1 })
      .toArray();

    res.json({ containers, total: containers.length });
  } catch (e) {
    handleError(res, e, 'list');
  }
});

// ─── Review Queue Routes ─────────────────────────────────────────────────

// GET /review-queue — List pending review entries ordered by confidence score descending
router.get('/review-queue', async (req, res) => {
  try {
    const db = await getDb();
    const entries = await db.collection('review_queue')
      .find({ companyId: req.companyId, status: 'pending' })
      .sort({ confidenceScore: -1 })
      .toArray();

    res.json({ entries });
  } catch (e) {
    handleError(res, e, 'review-queue-list');
  }
});

// POST /review-queue/:id/accept — Accept merge suggestion
router.post('/review-queue/:id/accept', async (req, res) => {
  try {
    const db = await getDb();
    const entryId = req.params.id;
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    // Find the review queue entry
    const entry = await db.collection('review_queue').findOne({
      companyId: req.companyId,
      id: entryId,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Review queue entry not found' });
    }

    // Check if already resolved
    if (entry.status !== 'pending') {
      return res.status(409).json({ error: 'Entry already resolved' });
    }

    // Check if the suggested container still exists
    const container = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: entry.suggestedContainerId,
    });

    if (!container) {
      return res.status(400).json({ error: 'Suggested container no longer exists' });
    }

    const now = new Date().toISOString();

    // Create an alias record linking the original SKU to the suggested container
    const aliasId = crypto.randomUUID();
    await db.collection('container_aliases').insertOne({
      id: aliasId,
      companyId: req.companyId,
      containerId: entry.suggestedContainerId,
      aliasValue: entry.originalSku,
      normalizedValue: entry.suggestedContainerName,
      confidenceScore: entry.confidenceScore,
      source: 'review-queue-accept',
      mergeHistory: null,
      createdAt: now,
      updatedAt: now,
    });

    // Mark the entry as accepted
    await db.collection('review_queue').updateOne(
      { companyId: req.companyId, id: entryId },
      { $set: { status: 'accepted', resolvedAt: now, resolvedBy: userId } }
    );

    // Record audit entry
    await recordAuditEntry(req.companyId, {
      actionType: 'review_accept',
      entityId: entry.suggestedContainerId,
      entityType: 'container',
      previousValue: { originalSku: entry.originalSku, confidenceScore: entry.confidenceScore },
      newValue: { merged: true, aliasId },
      relatedEntities: [entryId],
      userId,
    });

    res.json({ success: true, entry: { ...entry, status: 'accepted', resolvedAt: now, resolvedBy: userId } });
  } catch (e) {
    handleError(res, e, 'review-queue-accept');
  }
});

// POST /review-queue/:id/reject — Reject merge suggestion
router.post('/review-queue/:id/reject', async (req, res) => {
  try {
    const db = await getDb();
    const entryId = req.params.id;
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    // Find the review queue entry
    const entry = await db.collection('review_queue').findOne({
      companyId: req.companyId,
      id: entryId,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Review queue entry not found' });
    }

    // Check if already resolved
    if (entry.status !== 'pending') {
      return res.status(409).json({ error: 'Entry already resolved' });
    }

    const now = new Date().toISOString();

    // Build the pair key to prevent reappearance
    const normalizeResult = normalizeContainerName(entry.originalSku);
    const originalCanonical = normalizeResult.valid ? normalizeResult.canonical : entry.originalSku;
    const pairKey = [originalCanonical, entry.suggestedContainerName].sort().join('|');

    // Mark the entry as rejected and add pair key to rejectedPairs
    await db.collection('review_queue').updateOne(
      { companyId: req.companyId, id: entryId },
      {
        $set: { status: 'rejected', resolvedAt: now, resolvedBy: userId },
        $addToSet: { rejectedPairs: pairKey },
      }
    );

    // Record audit entry
    await recordAuditEntry(req.companyId, {
      actionType: 'review_reject',
      entityId: entryId,
      entityType: 'review_queue',
      previousValue: { originalSku: entry.originalSku, suggestedContainerName: entry.suggestedContainerName, confidenceScore: entry.confidenceScore },
      newValue: { rejected: true, pairKey },
      userId,
    });

    res.json({ success: true, entry: { ...entry, status: 'rejected', resolvedAt: now, resolvedBy: userId } });
  } catch (e) {
    handleError(res, e, 'review-queue-reject');
  }
});

// POST /review-queue/:id/create-new — Create new container from SKU
router.post('/review-queue/:id/create-new', async (req, res) => {
  try {
    const db = await getDb();
    const entryId = req.params.id;
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    // Find the review queue entry
    const entry = await db.collection('review_queue').findOne({
      companyId: req.companyId,
      id: entryId,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Review queue entry not found' });
    }

    // Check if already resolved
    if (entry.status !== 'pending') {
      return res.status(409).json({ error: 'Entry already resolved' });
    }

    const now = new Date().toISOString();

    // Normalize the original SKU to get a container name
    const normalizeResult = normalizeContainerName(entry.originalSku);
    const containerName = normalizeResult.valid ? normalizeResult.canonical : entry.originalSku.trim();

    // Check if a container with this name already exists
    const existing = await db.collection('containers').findOne({
      companyId: req.companyId,
      name: { $regex: new RegExp(`^${escapeRegex(containerName)}$`, 'i') },
    });

    let containerId;
    if (existing) {
      containerId = existing.id;
    } else {
      // Create a new container
      containerId = crypto.randomUUID();
      const newContainer = {
        id: containerId,
        companyId: req.companyId,
        name: containerName,
        containerType: 'Other',
        status: 'Active',
        active: true,
        currentItemCount: 0,
        createdAt: now,
        updatedAt: now,
        building: null,
        room: null,
        shelf: null,
        shelfRow: null,
        estimatedCapacity: null,
        capacityType: null,
        fullnessPercentage: null,
        maxRecommendedItemCount: null,
        capacityNotes: null,
        barcodeValue: null,
        qrCodeValue: null,
        printableLabel: null,
        notes: null,
      };

      await db.collection('containers').insertOne(newContainer);

      // Record audit entry for container creation
      await recordAuditEntry(req.companyId, {
        actionType: 'create',
        entityId: containerId,
        entityType: 'container',
        previousValue: null,
        newValue: { name: containerName, containerType: 'Other', source: 'review-queue-create-new' },
        userId,
      });
    }

    // Create an alias record for the original SKU
    const aliasId = crypto.randomUUID();
    await db.collection('container_aliases').insertOne({
      id: aliasId,
      companyId: req.companyId,
      containerId,
      aliasValue: entry.originalSku,
      normalizedValue: containerName,
      confidenceScore: 100,
      source: 'review-queue-create-new',
      mergeHistory: null,
      createdAt: now,
      updatedAt: now,
    });

    // Mark the entry as resolved
    await db.collection('review_queue').updateOne(
      { companyId: req.companyId, id: entryId },
      { $set: { status: 'created_new', resolvedAt: now, resolvedBy: userId } }
    );

    // Record audit entry for the review queue action
    await recordAuditEntry(req.companyId, {
      actionType: 'review_create_new',
      entityId: containerId,
      entityType: 'container',
      previousValue: { originalSku: entry.originalSku, suggestedContainerName: entry.suggestedContainerName },
      newValue: { containerName, containerId },
      relatedEntities: [entryId],
      userId,
    });

    res.json({ success: true, containerId, containerName, entry: { ...entry, status: 'created_new', resolvedAt: now, resolvedBy: userId } });
  } catch (e) {
    handleError(res, e, 'review-queue-create-new');
  }
});

// POST /review-queue/:id/ignore — Remove from queue without audit
router.post('/review-queue/:id/ignore', async (req, res) => {
  try {
    const db = await getDb();
    const entryId = req.params.id;
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    // Find the review queue entry
    const entry = await db.collection('review_queue').findOne({
      companyId: req.companyId,
      id: entryId,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Review queue entry not found' });
    }

    // Check if already resolved
    if (entry.status !== 'pending') {
      return res.status(409).json({ error: 'Entry already resolved' });
    }

    const now = new Date().toISOString();

    // Mark the entry as ignored — no audit trail, same match may reappear
    await db.collection('review_queue').updateOne(
      { companyId: req.companyId, id: entryId },
      { $set: { status: 'ignored', resolvedAt: now, resolvedBy: userId } }
    );

    res.json({ success: true, entry: { ...entry, status: 'ignored', resolvedAt: now, resolvedBy: userId } });
  } catch (e) {
    handleError(res, e, 'review-queue-ignore');
  }
});

// ─── Bulk Operations ─────────────────────────────────────────────────────
// Partial-failure semantics: successes are committed immediately, failures
// are collected and reported. No rollback of successful items.

// POST /bulk/move-items — Move all items from one container to another
router.post('/bulk/move-items', async (req, res) => {
  try {
    const db = await getDb();
    const { sourceContainerId, targetContainerId } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    if (!sourceContainerId) {
      return res.status(400).json({ error: 'sourceContainerId is required' });
    }
    if (!targetContainerId) {
      return res.status(400).json({ error: 'targetContainerId is required' });
    }
    if (sourceContainerId === targetContainerId) {
      return res.status(400).json({ error: 'Source and target containers must be different' });
    }

    // Validate source exists
    const source = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: sourceContainerId,
    });
    if (!source) {
      return res.status(404).json({ error: 'Source container not found' });
    }

    // Validate target exists and is not archived
    const target = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: targetContainerId,
    });
    if (!target) {
      return res.status(404).json({ error: 'Target container not found' });
    }
    if (target.status === 'Archived') {
      return res.status(400).json({ error: 'Target container is archived' });
    }

    const now = new Date().toISOString();

    // Get all items assigned to source
    const items = await db.collection('container_item_assignments')
      .find({ companyId: req.companyId, containerId: sourceContainerId })
      .toArray();

    let processed = 0;
    const failures = [];

    for (const item of items) {
      try {
        await db.collection('container_item_assignments').updateOne(
          { companyId: req.companyId, id: item.id },
          { $set: { containerId: targetContainerId, updatedAt: now } }
        );

        await recordAuditEntry(req.companyId, {
          actionType: 'item_move',
          entityId: item.itemId,
          entityType: 'item',
          previousValue: { containerId: sourceContainerId, containerName: source.name },
          newValue: { containerId: targetContainerId, containerName: target.name },
          relatedEntities: [sourceContainerId, targetContainerId],
          userId,
        });

        processed++;
      } catch (err) {
        failures.push({ itemId: item.itemId, error: err.message || 'Failed to move item' });
      }
    }

    res.json({
      success: true,
      processed,
      failed: failures.length,
      failures,
    });
  } catch (e) {
    handleError(res, e, 'bulk/move-items');
  }
});

// POST /bulk/move-location — Move containers at a location level
router.post('/bulk/move-location', async (req, res) => {
  try {
    const db = await getDb();
    const { level, currentValue, newValue } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    const validLevels = ['building', 'room', 'shelf', 'shelfRow'];
    if (!level || !validLevels.includes(level)) {
      return res.status(400).json({ error: `level must be one of: ${validLevels.join(', ')}` });
    }
    if (currentValue === undefined || currentValue === null) {
      return res.status(400).json({ error: 'currentValue is required' });
    }
    if (newValue === undefined || newValue === null) {
      return res.status(400).json({ error: 'newValue is required' });
    }

    const now = new Date().toISOString();

    // Find all containers at the specified location level with the current value
    const filter = { companyId: req.companyId, [level]: currentValue };
    const containers = await db.collection('containers').find(filter).toArray();

    let processed = 0;
    const failures = [];

    for (const container of containers) {
      try {
        // Skip archived containers
        if (container.status === 'Archived') {
          failures.push({ itemId: container.id, error: 'Container is archived' });
          continue;
        }

        const previousValue = { [level]: container[level] };
        const newLocationValue = { [level]: newValue };

        await db.collection('containers').updateOne(
          { companyId: req.companyId, id: container.id },
          { $set: { [level]: newValue, updatedAt: now } }
        );

        await recordAuditEntry(req.companyId, {
          actionType: 'location_change',
          entityId: container.id,
          entityType: 'container',
          previousValue,
          newValue: newLocationValue,
          relatedEntities: [],
          userId,
        });

        processed++;
      } catch (err) {
        failures.push({ itemId: container.id, error: err.message || 'Failed to move container' });
      }
    }

    res.json({
      success: true,
      processed,
      failed: failures.length,
      failures,
    });
  } catch (e) {
    handleError(res, e, 'bulk/move-location');
  }
});

// POST /bulk/rename — Rename up to 500 containers
router.post('/bulk/rename', async (req, res) => {
  try {
    const db = await getDb();
    const { renames } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    if (!Array.isArray(renames) || renames.length === 0) {
      return res.status(400).json({ error: 'renames must be a non-empty array' });
    }
    if (renames.length > 500) {
      return res.status(400).json({ error: 'Cannot rename more than 500 containers in a single operation' });
    }

    const now = new Date().toISOString();
    let processed = 0;
    const failures = [];

    for (const entry of renames) {
      const { containerId, newName } = entry || {};

      if (!containerId || !newName || typeof newName !== 'string' || !newName.trim()) {
        failures.push({ itemId: containerId || 'unknown', error: 'containerId and newName are required' });
        continue;
      }

      const trimmedName = newName.trim();
      if (trimmedName.length > 100) {
        failures.push({ itemId: containerId, error: 'Container name must be 100 characters or less' });
        continue;
      }

      try {
        // Find the container
        const container = await db.collection('containers').findOne({
          companyId: req.companyId,
          id: containerId,
        });

        if (!container) {
          failures.push({ itemId: containerId, error: 'Container not found' });
          continue;
        }

        if (container.status === 'Archived') {
          failures.push({ itemId: containerId, error: 'Target container is archived' });
          continue;
        }

        // Check name uniqueness (case-insensitive), excluding self
        if (trimmedName.toLowerCase() !== container.name.toLowerCase()) {
          const existing = await db.collection('containers').findOne({
            companyId: req.companyId,
            name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') },
            id: { $ne: containerId },
          });
          if (existing) {
            failures.push({ itemId: containerId, error: 'Container name already exists' });
            continue;
          }
        }

        const previousName = container.name;

        await db.collection('containers').updateOne(
          { companyId: req.companyId, id: containerId },
          { $set: { name: trimmedName, updatedAt: now } }
        );

        await recordAuditEntry(req.companyId, {
          actionType: 'rename',
          entityId: containerId,
          entityType: 'container',
          previousValue: { name: previousName },
          newValue: { name: trimmedName },
          relatedEntities: [],
          userId,
        });

        processed++;
      } catch (err) {
        failures.push({ itemId: containerId, error: err.message || 'Failed to rename container' });
      }
    }

    res.json({
      success: true,
      processed,
      failed: failures.length,
      failures,
    });
  } catch (e) {
    handleError(res, e, 'bulk/rename');
  }
});

// POST /bulk/assign-shelves — Assign shelf locations to up to 500 containers
router.post('/bulk/assign-shelves', async (req, res) => {
  try {
    const db = await getDb();
    const { assignments } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'assignments must be a non-empty array' });
    }
    if (assignments.length > 500) {
      return res.status(400).json({ error: 'Cannot assign shelves to more than 500 containers in a single operation' });
    }

    const now = new Date().toISOString();
    let processed = 0;
    const failures = [];

    for (const entry of assignments) {
      const { containerId, shelf, shelfRow } = entry || {};

      if (!containerId) {
        failures.push({ itemId: containerId || 'unknown', error: 'containerId is required' });
        continue;
      }

      if (!shelf && !shelfRow) {
        failures.push({ itemId: containerId, error: 'At least one of shelf or shelfRow is required' });
        continue;
      }

      try {
        const container = await db.collection('containers').findOne({
          companyId: req.companyId,
          id: containerId,
        });

        if (!container) {
          failures.push({ itemId: containerId, error: 'Container not found' });
          continue;
        }

        if (container.status === 'Archived') {
          failures.push({ itemId: containerId, error: 'Target container is archived' });
          continue;
        }

        const updateFields = { updatedAt: now };
        const previousValue = {};
        const newValue = {};

        if (shelf !== undefined) {
          previousValue.shelf = container.shelf;
          newValue.shelf = shelf;
          updateFields.shelf = shelf;
        }
        if (shelfRow !== undefined) {
          previousValue.shelfRow = container.shelfRow;
          newValue.shelfRow = shelfRow;
          updateFields.shelfRow = shelfRow;
        }

        await db.collection('containers').updateOne(
          { companyId: req.companyId, id: containerId },
          { $set: updateFields }
        );

        await recordAuditEntry(req.companyId, {
          actionType: 'location_change',
          entityId: containerId,
          entityType: 'container',
          previousValue,
          newValue,
          relatedEntities: [],
          userId,
        });

        processed++;
      } catch (err) {
        failures.push({ itemId: containerId, error: err.message || 'Failed to assign shelf' });
      }
    }

    res.json({
      success: true,
      processed,
      failed: failures.length,
      failures,
    });
  } catch (e) {
    handleError(res, e, 'bulk/assign-shelves');
  }
});

// POST /bulk/merge-aliases — Merge multiple aliases into one container
router.post('/bulk/merge-aliases', async (req, res) => {
  try {
    const db = await getDb();
    const { aliasIds, targetContainerId } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    if (!targetContainerId) {
      return res.status(400).json({ error: 'targetContainerId is required' });
    }
    if (!Array.isArray(aliasIds) || aliasIds.length === 0) {
      return res.status(400).json({ error: 'aliasIds must be a non-empty array' });
    }

    // Validate target exists and is not archived
    const target = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: targetContainerId,
    });
    if (!target) {
      return res.status(404).json({ error: 'Target container not found' });
    }
    if (target.status === 'Archived') {
      return res.status(400).json({ error: 'Target container is archived' });
    }

    const now = new Date().toISOString();
    let processed = 0;
    const failures = [];

    for (const aliasId of aliasIds) {
      try {
        const alias = await db.collection('container_aliases').findOne({
          companyId: req.companyId,
          id: aliasId,
        });

        if (!alias) {
          failures.push({ itemId: aliasId, error: 'Alias not found' });
          continue;
        }

        // Skip if already assigned to target
        if (alias.containerId === targetContainerId) {
          processed++;
          continue;
        }

        const previousContainerId = alias.containerId;

        await db.collection('container_aliases').updateOne(
          { companyId: req.companyId, id: aliasId },
          {
            $set: {
              containerId: targetContainerId,
              updatedAt: now,
              mergeHistory: {
                sourceContainerId: previousContainerId,
                targetContainerId,
                mergedAt: now,
                mergedBy: userId,
              },
            },
          }
        );

        await recordAuditEntry(req.companyId, {
          actionType: 'merge',
          entityId: aliasId,
          entityType: 'alias',
          previousValue: { containerId: previousContainerId },
          newValue: { containerId: targetContainerId },
          relatedEntities: [previousContainerId, targetContainerId],
          userId,
        });

        processed++;
      } catch (err) {
        failures.push({ itemId: aliasId, error: err.message || 'Failed to merge alias' });
      }
    }

    res.json({
      success: true,
      processed,
      failed: failures.length,
      failures,
    });
  } catch (e) {
    handleError(res, e, 'bulk/merge-aliases');
  }
});

// ─── GET /:id/audit — Get audit history for a container ──────────────────

router.get('/:id/audit', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const entries = await getAuditHistory(req.companyId, req.params.id, { limit, offset });
    res.json({ entries, limit, offset });
  } catch (e) {
    handleError(res, e, 'audit-history');
  }
});

// ─── GET /:id — Get single container ─────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const container = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: req.params.id,
    });

    if (!container) return res.status(404).json({ error: 'Container not found' });
    res.json(container);
  } catch (e) {
    handleError(res, e, 'get');
  }
});

// ─── POST / — Create container ───────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const db = await getDb();
    const body = req.body;

    // Validate required: name
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const name = body.name.trim();
    if (name.length > 100) {
      return res.status(400).json({ error: 'Container name must be 100 characters or less' });
    }

    // Validate required: containerType
    if (!body.containerType || typeof body.containerType !== 'string' || !body.containerType.trim()) {
      return res.status(400).json({ error: 'containerType is required' });
    }

    const containerType = body.containerType.trim();

    // Validate container type exists
    const validType = await isValidContainerType(db, req.companyId, containerType);
    if (!validType) {
      return res.status(400).json({ error: 'Invalid container type' });
    }

    // Check unique name (case-insensitive)
    const existing = await db.collection('containers').findOne({
      companyId: req.companyId,
      name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
    });
    if (existing) {
      return res.status(409).json({ error: 'Container name already exists' });
    }

    const now = new Date().toISOString();
    const container = {
      id: crypto.randomUUID(),
      companyId: req.companyId,
      name,
      containerType,
      status: 'Active',
      active: true,
      currentItemCount: 0,
      createdAt: now,
      updatedAt: now,

      // Optional location fields
      building: body.building || null,
      room: body.room || null,
      shelf: body.shelf || null,
      shelfRow: body.shelfRow || null,

      // Optional capacity fields
      estimatedCapacity: body.estimatedCapacity ?? null,
      capacityType: body.capacityType || null,
      fullnessPercentage: null,
      maxRecommendedItemCount: body.maxRecommendedItemCount ?? null,
      capacityNotes: body.capacityNotes || null,

      // Future barcode/QR fields
      barcodeValue: body.barcodeValue || null,
      qrCodeValue: body.qrCodeValue || null,
      printableLabel: body.printableLabel || null,

      // Notes
      notes: body.notes || null,
    };

    // Calculate fullness if capacity is provided
    if (container.estimatedCapacity != null && container.estimatedCapacity > 0) {
      container.fullnessPercentage = calculateFullnessPercentage(
        container.currentItemCount,
        container.estimatedCapacity
      );
    }

    await db.collection('containers').insertOne(container);

    // Record audit entry for creation
    await recordAuditEntry(req.companyId, {
      actionType: 'create',
      entityId: container.id,
      entityType: 'container',
      previousValue: null,
      newValue: { name: container.name, containerType: container.containerType },
      userId: req.user?.id || req.user?.userId || req.user?.sub || 'system',
    });

    res.status(201).json(container);
  } catch (e) {
    handleError(res, e, 'create');
  }
});

// ─── PUT /:id — Update container fields ──────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const body = req.body;

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body required' });
    }

    const container = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: req.params.id,
    });

    if (!container) return res.status(404).json({ error: 'Container not found' });

    // Build update set — strip immutable fields
    const updates = { ...body };
    delete updates.id;
    delete updates.companyId;
    delete updates.createdAt;

    // Validate name if being changed
    if (updates.name !== undefined) {
      if (!updates.name || typeof updates.name !== 'string' || !updates.name.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }
      const trimmedName = updates.name.trim();
      if (trimmedName.length > 100) {
        return res.status(400).json({ error: 'Container name must be 100 characters or less' });
      }
      // Check uniqueness only if name actually changed
      if (trimmedName.toLowerCase() !== container.name.toLowerCase()) {
        const existing = await db.collection('containers').findOne({
          companyId: req.companyId,
          name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') },
          id: { $ne: req.params.id },
        });
        if (existing) {
          return res.status(409).json({ error: 'Container name already exists' });
        }
      }
      updates.name = trimmedName;
    }

    // Validate container type if being changed
    if (updates.containerType !== undefined) {
      if (!updates.containerType || typeof updates.containerType !== 'string' || !updates.containerType.trim()) {
        return res.status(400).json({ error: 'Invalid container type' });
      }
      const validType = await isValidContainerType(db, req.companyId, updates.containerType.trim());
      if (!validType) {
        return res.status(400).json({ error: 'Invalid container type' });
      }
      updates.containerType = updates.containerType.trim();
    }

    // Always update the modified date
    updates.updatedAt = new Date().toISOString();

    // Recalculate fullness percentage if capacity-related fields changed
    if (updates.currentItemCount !== undefined || updates.estimatedCapacity !== undefined) {
      const newItemCount = updates.currentItemCount ?? container.currentItemCount;
      const newCapacity = updates.estimatedCapacity ?? container.estimatedCapacity;
      updates.fullnessPercentage = calculateFullnessPercentage(newItemCount, newCapacity);
    }

    await db.collection('containers').updateOne(
      { companyId: req.companyId, id: req.params.id },
      { $set: updates }
    );

    // Record audit entries for significant changes
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    // Status change audit
    if (updates.status && updates.status !== container.status) {
      await recordAuditEntry(req.companyId, {
        actionType: 'status_change',
        entityId: container.id,
        entityType: 'container',
        previousValue: { status: container.status },
        newValue: { status: updates.status },
        userId,
      });
    }

    // Rename audit
    if (updates.name && updates.name !== container.name) {
      await recordAuditEntry(req.companyId, {
        actionType: 'rename',
        entityId: container.id,
        entityType: 'container',
        previousValue: { name: container.name },
        newValue: { name: updates.name },
        userId,
      });
    }

    // Location change audit
    const locationFields = ['building', 'room', 'shelf', 'shelfRow'];
    const locationChanged = locationFields.some(
      f => updates[f] !== undefined && updates[f] !== container[f]
    );
    if (locationChanged) {
      const prevLocation = {};
      const newLocation = {};
      for (const f of locationFields) {
        prevLocation[f] = container[f];
        newLocation[f] = updates[f] !== undefined ? updates[f] : container[f];
      }
      await recordAuditEntry(req.companyId, {
        actionType: 'location_change',
        entityId: container.id,
        entityType: 'container',
        previousValue: prevLocation,
        newValue: newLocation,
        userId,
      });
    }

    // Return the updated container
    const updated = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: req.params.id,
    });

    res.json(updated);
  } catch (e) {
    handleError(res, e, 'update');
  }
});

// ─── DELETE /:id — Archive container (soft delete) ───────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const container = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: req.params.id,
    });

    if (!container) return res.status(404).json({ error: 'Container not found' });

    const now = new Date().toISOString();

    await db.collection('containers').updateOne(
      { companyId: req.companyId, id: req.params.id },
      { $set: { status: 'Archived', active: false, updatedAt: now } }
    );

    // Record audit entry for archival
    await recordAuditEntry(req.companyId, {
      actionType: 'archive',
      entityId: container.id,
      entityType: 'container',
      previousValue: { status: container.status, active: container.active },
      newValue: { status: 'Archived', active: false },
      userId: req.user?.id || req.user?.userId || req.user?.sub || 'system',
    });

    res.json({ success: true });
  } catch (e) {
    handleError(res, e, 'archive');
  }
});

// ─── PUT /:id/restore — Restore archived container ───────────────────────

router.put('/:id/restore', async (req, res) => {
  try {
    const db = await getDb();
    const container = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: req.params.id,
    });

    if (!container) return res.status(404).json({ error: 'Container not found' });

    const now = new Date().toISOString();

    await db.collection('containers').updateOne(
      { companyId: req.companyId, id: req.params.id },
      { $set: { status: 'Active', active: true, updatedAt: now } }
    );

    // Record audit entry for restoration
    await recordAuditEntry(req.companyId, {
      actionType: 'restore',
      entityId: container.id,
      entityType: 'container',
      previousValue: { status: container.status, active: container.active },
      newValue: { status: 'Active', active: true },
      userId: req.user?.id || req.user?.userId || req.user?.sub || 'system',
    });

    // Return the restored container
    const restored = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: req.params.id,
    });

    res.json(restored);
  } catch (e) {
    handleError(res, e, 'restore');
  }
});

// ─── POST /:id/merge — Merge source container into target ────────────────

router.post('/:id/merge', async (req, res) => {
  try {
    const db = await getDb();
    const targetId = req.params.id;
    const { sourceId } = req.body;

    if (!sourceId) {
      return res.status(400).json({ error: 'sourceId is required' });
    }

    // Validate: no self-merge
    if (sourceId === targetId) {
      return res.status(400).json({ error: 'Cannot merge container into itself' });
    }

    // Validate: source exists
    const source = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: sourceId,
    });
    if (!source) {
      return res.status(404).json({ error: 'Source container not found' });
    }

    // Validate: target exists
    const target = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: targetId,
    });
    if (!target) {
      return res.status(404).json({ error: 'Container not found' });
    }

    // Validate: target not archived
    if (target.status === 'Archived') {
      return res.status(400).json({ error: 'Target container is archived' });
    }

    const now = new Date().toISOString();
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    // Transfer all inventory assignments from source to target
    await db.collection('container_item_assignments').updateMany(
      { companyId: req.companyId, containerId: sourceId },
      { $set: { containerId: targetId, updatedAt: now } }
    );

    // Transfer all Container_Alias records from source to target
    await db.collection('container_aliases').updateMany(
      { companyId: req.companyId, containerId: sourceId },
      {
        $set: {
          containerId: targetId,
          updatedAt: now,
          mergeHistory: {
            sourceContainerId: sourceId,
            targetContainerId: targetId,
            mergedAt: now,
            mergedBy: userId,
          },
        },
      }
    );

    // Archive the source container
    await db.collection('containers').updateOne(
      { companyId: req.companyId, id: sourceId },
      { $set: { status: 'Archived', active: false, updatedAt: now } }
    );

    // Update target's updatedAt
    await db.collection('containers').updateOne(
      { companyId: req.companyId, id: targetId },
      { $set: { updatedAt: now } }
    );

    // Record audit entry for the merge
    await recordAuditEntry(req.companyId, {
      actionType: 'merge',
      entityId: sourceId,
      entityType: 'container',
      previousValue: { name: source.name, status: source.status },
      newValue: { name: target.name, status: 'Archived' },
      relatedEntities: [targetId],
      userId,
    });

    // Return the updated target container
    const updatedTarget = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: targetId,
    });

    res.json({ success: true, target: updatedTarget });
  } catch (e) {
    handleError(res, e, 'merge');
  }
});

// ─── POST /:id/split — Split container into new containers ───────────────

router.post('/:id/split', async (req, res) => {
  try {
    const db = await getDb();
    const originalId = req.params.id;
    const { newContainers, itemAssignments } = req.body;

    // Validate: original container exists
    const original = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: originalId,
    });
    if (!original) {
      return res.status(404).json({ error: 'Container not found' });
    }

    // Validate: newContainers is a non-empty array of names
    if (!Array.isArray(newContainers) || newContainers.length === 0) {
      return res.status(400).json({ error: 'newContainers must be a non-empty array of container names' });
    }

    const now = new Date().toISOString();
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    // Create new container records
    const createdContainers = [];
    for (const name of newContainers) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Each container name must be a non-empty string' });
      }

      const trimmedName = name.trim();

      // Check unique name
      const existing = await db.collection('containers').findOne({
        companyId: req.companyId,
        name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') },
      });
      if (existing) {
        return res.status(409).json({ error: `Container name already exists: ${trimmedName}` });
      }

      const newContainer = {
        id: crypto.randomUUID(),
        companyId: req.companyId,
        name: trimmedName,
        containerType: original.containerType,
        status: 'Active',
        active: true,
        currentItemCount: 0,
        createdAt: now,
        updatedAt: now,
        building: original.building || null,
        room: original.room || null,
        shelf: original.shelf || null,
        shelfRow: original.shelfRow || null,
        estimatedCapacity: null,
        capacityType: original.capacityType || null,
        fullnessPercentage: null,
        maxRecommendedItemCount: null,
        capacityNotes: null,
        barcodeValue: null,
        qrCodeValue: null,
        printableLabel: null,
        notes: null,
      };

      await db.collection('containers').insertOne(newContainer);
      createdContainers.push(newContainer);

      // Record audit entry for each new container creation
      await recordAuditEntry(req.companyId, {
        actionType: 'create',
        entityId: newContainer.id,
        entityType: 'container',
        previousValue: null,
        newValue: { name: newContainer.name, containerType: newContainer.containerType },
        userId,
      });
    }

    // Reassign items if itemAssignments provided
    // itemAssignments is an array of { itemId, targetContainerId }
    if (Array.isArray(itemAssignments)) {
      for (const assignment of itemAssignments) {
        const { itemId, targetContainerId } = assignment;
        if (!itemId || !targetContainerId) continue;

        // Verify target is one of the new containers or the original
        const validTarget =
          targetContainerId === originalId ||
          createdContainers.some(c => c.id === targetContainerId);

        if (!validTarget) continue;

        await db.collection('container_item_assignments').updateMany(
          { companyId: req.companyId, containerId: originalId, itemId },
          { $set: { containerId: targetContainerId, updatedAt: now } }
        );
      }
    }

    // Record audit entry for the split operation
    await recordAuditEntry(req.companyId, {
      actionType: 'split',
      entityId: originalId,
      entityType: 'container',
      previousValue: { name: original.name },
      newValue: { newContainers: createdContainers.map(c => ({ id: c.id, name: c.name })) },
      relatedEntities: createdContainers.map(c => c.id),
      userId,
    });

    res.json({
      success: true,
      original: { id: originalId, name: original.name },
      newContainers: createdContainers,
    });
  } catch (e) {
    handleError(res, e, 'split');
  }
});

// ─── POST /:id/move-items — Move items between containers ────────────────

router.post('/:id/move-items', async (req, res) => {
  try {
    const db = await getDb();
    const sourceId = req.params.id;
    const { targetContainerId, itemIds } = req.body;

    if (!targetContainerId) {
      return res.status(400).json({ error: 'targetContainerId is required' });
    }

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds must be a non-empty array' });
    }

    // Validate: source exists
    const source = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: sourceId,
    });
    if (!source) {
      return res.status(404).json({ error: 'Source container not found' });
    }

    // Validate: target exists
    const target = await db.collection('containers').findOne({
      companyId: req.companyId,
      id: targetContainerId,
    });
    if (!target) {
      return res.status(404).json({ error: 'Target container not found' });
    }

    // Validate: target not archived
    if (target.status === 'Archived') {
      return res.status(400).json({ error: 'Target container is archived' });
    }

    // Validate: no self-move
    if (sourceId === targetContainerId) {
      return res.status(400).json({ error: 'Source and target containers must be different' });
    }

    const now = new Date().toISOString();
    const userId = req.user?.id || req.user?.userId || req.user?.sub || 'system';

    // Move specified items from source to target
    const result = await db.collection('container_item_assignments').updateMany(
      {
        companyId: req.companyId,
        containerId: sourceId,
        itemId: { $in: itemIds },
      },
      { $set: { containerId: targetContainerId, updatedAt: now } }
    );

    // Record audit entry for each moved item
    for (const itemId of itemIds) {
      await recordAuditEntry(req.companyId, {
        actionType: 'item_move',
        entityId: itemId,
        entityType: 'item',
        previousValue: { containerId: sourceId, containerName: source.name },
        newValue: { containerId: targetContainerId, containerName: target.name },
        relatedEntities: [sourceId, targetContainerId],
        userId,
      });
    }

    // Trigger eBay location update for items with linked listings
    // (Placeholder — actual eBay sync is implemented in task 13.1)
    // In the future, this will query for items with linked eBay listings
    // and enqueue location updates via the eBay sync service.

    res.json({
      success: true,
      movedCount: result.modifiedCount,
      source: { id: sourceId, name: source.name },
      target: { id: targetContainerId, name: target.name },
    });
  } catch (e) {
    handleError(res, e, 'move-items');
  }
});

module.exports = router;
