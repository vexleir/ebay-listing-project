const crypto = require('crypto');
const { getDb } = require('../../db');

/**
 * Records an immutable audit entry.
 *
 * @param {string} companyId
 * @param {{ actionType: string, entityId: string, entityType: string,
 *           previousValue?: any, newValue?: any, relatedEntities?: string[],
 *           userId: string }} entry
 * @returns {Promise<void>}
 */
async function recordAuditEntry(companyId, entry) {
  const db = await getDb();
  const now = new Date();
  // Truncate to second precision
  now.setMilliseconds(0);

  const auditRecord = {
    id: crypto.randomUUID(),
    companyId,
    actionType: entry.actionType,
    entityId: entry.entityId,
    entityType: entry.entityType,
    previousValue: entry.previousValue ?? null,
    newValue: entry.newValue ?? null,
    relatedEntities: entry.relatedEntities ?? [],
    userId: entry.userId,
    timestamp: now.toISOString(),
  };

  await db.collection('container_audit').insertOne(auditRecord);
}

/**
 * Retrieves audit history for a container (includes inherited merge history).
 *
 * When a container has been the target of a merge, audit entries from the
 * merged source container(s) are included in the results.
 *
 * @param {string} companyId
 * @param {string} containerId
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<import('./types').AuditEntry[]>}
 */
async function getAuditHistory(companyId, containerId, options = {}) {
  const { limit = 50, offset = 0 } = options;
  const db = await getDb();
  const auditCollection = db.collection('container_audit');

  // Find all containers that were merged into this container.
  // A merge audit entry has actionType "merge" and relatedEntities includes
  // both source and target. The entityId on a merge entry from the source
  // perspective is the source container ID, and the target appears in relatedEntities.
  // We look for merge entries where this container is referenced as a target
  // (i.e., it appears in relatedEntities or as entityId).
  const mergeEntries = await auditCollection
    .find({
      companyId,
      actionType: 'merge',
      relatedEntities: containerId,
    })
    .toArray();

  // Collect source container IDs from merge entries.
  // The source is the entityId of the merge entry when the target is in relatedEntities,
  // or it could be another entity in relatedEntities that isn't the current container.
  const sourceContainerIds = new Set();
  for (const entry of mergeEntries) {
    // The entityId is the source container that was merged
    if (entry.entityId !== containerId) {
      sourceContainerIds.add(entry.entityId);
    }
    // Also check relatedEntities for other source IDs
    for (const relId of entry.relatedEntities || []) {
      if (relId !== containerId) {
        sourceContainerIds.add(relId);
      }
    }
  }

  // Build the query: entries for this container OR any merged source containers
  const entityIds = [containerId, ...sourceContainerIds];

  const entries = await auditCollection
    .find({
      companyId,
      entityId: { $in: entityIds },
    })
    .sort({ timestamp: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  return entries;
}

module.exports = { recordAuditEntry, getAuditHistory };
