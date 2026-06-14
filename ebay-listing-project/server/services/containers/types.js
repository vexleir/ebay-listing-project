// Container system JSDoc type definitions.
// These types mirror the MongoDB document shapes defined in the design document.

/**
 * @typedef {Object} Container
 * @property {string} id - Permanent internal ID (UUID)
 * @property {string} companyId - Tenant isolation key
 * @property {string} name - Canonical display name (max 100 chars, unique per company)
 * @property {string} containerType - e.g., "Tote", "Shelf Bin", "Other"
 * @property {string} status - "Active" | "In Use" | "Full" | "Overflow" | "Archived" | "Missing" | "Needs Verification"
 * @property {boolean} active - Quick filter for non-archived
 * @property {string|null} building - Location hierarchy: building (max 100 chars)
 * @property {string|null} room - Location hierarchy: room (max 100 chars)
 * @property {string|null} shelf - Location hierarchy: shelf (max 50 chars)
 * @property {string|null} shelfRow - Location hierarchy: shelf row (max 50 chars)
 * @property {number|null} estimatedCapacity - 0–999999
 * @property {string|null} capacityType - "Item Count" | "Card Count" | "Box Count" | "Cubic Space" | "Weight" | "User Defined"
 * @property {number} currentItemCount - 0–999999
 * @property {number|null} fullnessPercentage - 0–any (can exceed 100)
 * @property {number|null} maxRecommendedItemCount - 1–999999
 * @property {string|null} capacityNotes - max 500 chars
 * @property {string|null} barcodeValue - max 128 chars (future barcode support)
 * @property {string|null} qrCodeValue - max 2048 chars (future QR code support)
 * @property {string|null} printableLabel - max 256 chars (future label printing)
 * @property {string|null} notes - max 1000 chars
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} updatedAt - ISO 8601 timestamp
 */

/**
 * @typedef {Object} ContainerAlias
 * @property {string} id - Alias record ID
 * @property {string} companyId - Tenant isolation key
 * @property {string} containerId - References containers.id
 * @property {string} aliasValue - Original SKU or alternate name
 * @property {string} normalizedValue - Canonical form of the alias
 * @property {number} confidenceScore - 0–100, score when matched
 * @property {string} source - "auto-generated" | "user-created" | "merge"
 * @property {MergeHistory|null} mergeHistory - Present when alias came from a merge
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} updatedAt - ISO 8601 timestamp
 */

/**
 * @typedef {Object} MergeHistory
 * @property {string} sourceContainerId - Container the alias was merged from
 * @property {string} targetContainerId - Container the alias was merged into
 * @property {string} mergedAt - ISO 8601 timestamp
 * @property {string} mergedBy - User ID who initiated the merge
 */

/**
 * @typedef {Object} ContainerItemAssignment
 * @property {string} id - Assignment record ID
 * @property {string} companyId - Tenant isolation key
 * @property {string} containerId - References containers.id
 * @property {string} itemId - References inventory_items.id or listings.id
 * @property {string} itemType - "inventory" | "listing"
 * @property {string} assignedAt - ISO 8601 timestamp
 * @property {string} assignedBy - User ID or "system"
 * @property {string} updatedAt - ISO 8601 timestamp
 */

/**
 * @typedef {Object} AuditEntry
 * @property {string} id - Audit entry ID
 * @property {string} companyId - Tenant isolation key
 * @property {string} actionType - "create" | "rename" | "merge" | "split" | "location_change" | "item_move" | "archive" | "restore" | "status_change"
 * @property {string} entityId - Primary entity affected (container ID)
 * @property {string} entityType - "container" | "item" | "alias"
 * @property {*} previousValue - Snapshot of changed field(s) before
 * @property {*} newValue - Snapshot of changed field(s) after
 * @property {string[]} relatedEntities - Other entity IDs involved (e.g., merge source + target)
 * @property {string} userId - Who performed the action
 * @property {string} timestamp - ISO 8601, second precision
 */

/**
 * @typedef {Object} ReviewQueueEntry
 * @property {string} id - Review queue entry ID
 * @property {string} companyId - Tenant isolation key
 * @property {string} originalSku - The original SKU value being evaluated
 * @property {string} suggestedContainerId - References containers.id
 * @property {string} suggestedContainerName - Display name of the suggested container
 * @property {number} confidenceScore - 50–89 (review range)
 * @property {string} reason - Human-readable explanation of the match
 * @property {string} status - "pending" | "accepted" | "rejected" | "created_new" | "ignored"
 * @property {string[]} rejectedPairs - Normalized pair keys that should not reappear
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string|null} resolvedAt - ISO 8601 timestamp when resolved
 * @property {string|null} resolvedBy - User ID who resolved the entry
 */

module.exports = {};
