// Default container types and constants for the container management system.

const { getDb } = require('../../db');

/**
 * Default container type values provided by the system.
 * These cannot be deleted by users (Requirement 6.6).
 */
const DEFAULT_CONTAINER_TYPES = [
  'Tote',
  'Shelf Bin',
  'Card Box',
  'Long Box',
  'Drawer',
  'Binder',
  'Display Case',
  'Storage Shelf',
  'Pallet',
  'Cart',
  'Other',
];

/**
 * Valid container status values.
 */
const CONTAINER_STATUSES = [
  'Active',
  'In Use',
  'Full',
  'Overflow',
  'Archived',
  'Missing',
  'Needs Verification',
];

/**
 * Valid capacity type values.
 */
const CAPACITY_TYPES = [
  'Item Count',
  'Card Count',
  'Box Count',
  'Cubic Space',
  'Weight',
  'User Defined',
];

/**
 * Seeds the default container types into the container_types collection.
 * Idempotent — safe to run on every process start. Only inserts types
 * that do not already exist (case-insensitive match).
 *
 * @param {string} companyId - The company to seed types for
 * @returns {Promise<{ inserted: number, existing: number }>}
 */
async function seedDefaultContainerTypes(companyId) {
  const db = await getDb();
  const collection = db.collection('container_types');
  const now = new Date().toISOString();

  let inserted = 0;
  let existing = 0;

  for (const name of DEFAULT_CONTAINER_TYPES) {
    const exists = await collection.findOne({
      companyId,
      name: { $regex: new RegExp(`^${name}$`, 'i') },
    });

    if (!exists) {
      await collection.insertOne({
        companyId,
        name,
        isDefault: true,
        createdAt: now,
      });
      inserted++;
    } else {
      existing++;
    }
  }

  return { inserted, existing };
}

module.exports = {
  DEFAULT_CONTAINER_TYPES,
  CONTAINER_STATUSES,
  CAPACITY_TYPES,
  seedDefaultContainerTypes,
};
