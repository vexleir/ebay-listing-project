// Barrel export for the container management service layer.
// Modules are exported as they are implemented.

const {
  DEFAULT_CONTAINER_TYPES,
  CONTAINER_STATUSES,
  CAPACITY_TYPES,
  seedDefaultContainerTypes,
} = require('./constants');

const { normalizeContainerName, computeConfidence } = require('./normalize');
const { calculateFullnessPercentage } = require('./capacity');
const { generateLocationString, MAX_LOCATION_LENGTH } = require('./location');
const { recordAuditEntry, getAuditHistory } = require('./audit');
const { syncContainerLocation, syncSingleListing, SYNC_STATUS } = require('./ebaySync');

// Re-export types module for JSDoc type availability
require('./types');

module.exports = {
  // Constants
  DEFAULT_CONTAINER_TYPES,
  CONTAINER_STATUSES,
  CAPACITY_TYPES,

  // Seeding
  seedDefaultContainerTypes,

  // Capacity
  calculateFullnessPercentage,

  // Location
  generateLocationString,
  MAX_LOCATION_LENGTH,

  // Normalization
  normalizeContainerName,
  computeConfidence,

  // Audit
  recordAuditEntry,
  getAuditHistory,

  // eBay Sync
  syncContainerLocation,
  syncSingleListing,
  SYNC_STATUS,
};
