# Design Document: Inventory Container Management

## Overview

This design describes a container-based inventory location tracking system that organizes inventory items by physical storage location. The system derives containers from existing SKU data through a normalization engine, provides confidence-scored matching with a human review queue, and maintains a full audit trail of all container operations.

The architecture introduces four new MongoDB collections (`containers`, `container_aliases`, `container_item_assignments`, `container_audit`) and a new service layer (`server/services/containers/`) following the existing pattern established by `server/services/inventory/validate.js`. The frontend gains a new Containers management view with sub-views for the review queue, bulk operations, and audit history.

Key design decisions:
- **Pure normalization logic** is isolated in a testable module with no database dependencies, mirroring the `validate.js` pattern.
- **Permanent internal IDs** decouple display names from references, enabling renames without cascading updates.
- **Separate collections** for aliases, assignments, and audit entries support future expansion (barcode scanning, warehouse mapping) without schema migration.
- **eBay location sync** is event-driven: container location changes enqueue a sync job that updates the eBay Item Location field within 60 seconds.

## Architecture

```mermaid
graph TB
    subgraph Frontend ["React Frontend (src/)"]
        CV[Container Views]
        RQ[Review Queue UI]
        BO[Bulk Operations UI]
    end

    subgraph API ["Express API (server/routes/)"]
        CR[/api/containers]
        CRR[/api/containers/review-queue]
        CBR[/api/containers/bulk]
        CAR[/api/containers/audit]
    end

    subgraph Services ["Service Layer (server/services/containers/)"]
        NE[Normalization Engine]
        CS[Confidence Scorer]
        LG[Location Generator]
        AM[Audit Manager]
        BM[Bulk Manager]
    end

    subgraph Data ["MongoDB Collections"]
        CC[(containers)]
        CA[(container_aliases)]
        CIA[(container_item_assignments)]
        CAU[(container_audit)]
    end

    subgraph External ["External"]
        EBAY[eBay Inventory API]
    end

    CV --> CR
    RQ --> CRR
    BO --> CBR

    CR --> NE
    CR --> CS
    CR --> LG
    CR --> AM
    CBR --> BM

    NE --> CC
    NE --> CA
    CS --> CRR
    LG --> EBAY
    AM --> CAU
    BM --> CC
    BM --> CIA

    CR --> CC
    CR --> CIA
    CRR --> CA
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| Normalization Engine | Transforms raw SKU strings into canonical container names; pure function, no I/O |
| Confidence Scorer | Compares two normalized values and produces a 0–100 score |
| Location Generator | Builds the eBay-compatible location string from hierarchy fields |
| Audit Manager | Appends immutable audit entries for all container mutations |
| Bulk Manager | Orchestrates multi-item/container operations with partial-failure handling |
| Container Routes | REST API for CRUD, merge, split, move, archive/restore |
| Review Queue Routes | REST API for listing, accepting, rejecting queue entries |

## Components and Interfaces

### 1. Normalization Engine (`server/services/containers/normalize.js`)

Pure functions with no database dependencies.

```javascript
/**
 * Normalizes a raw SKU string into a canonical container name.
 * Steps:
 *   1. Remove all characters except letters, digits, spaces
 *   2. Insert spaces at letter↔digit and camelCase boundaries
 *   3. Strip leading zeros from numeric tokens
 *   4. Collapse whitespace, trim, title-case
 *   5. Truncate to 128 characters
 *
 * @param {string} raw - The raw SKU or container name input
 * @returns {{ canonical: string, valid: boolean, error?: string }}
 */
function normalizeContainerName(raw) { }

/**
 * Computes a confidence score (0–100) for how likely two raw SKU values
 * refer to the same physical container.
 *
 * Scoring rules:
 *   - Identical canonical forms → 100
 *   - Differ only in punctuation/spacing/case → 90–99
 *   - Same alpha prefix, different numeric suffix → 0–30
 *   - Different alpha prefix → 0–20
 *   - Partial token overlap → 50–89 (review range)
 *
 * @param {string} rawA
 * @param {string} rawB
 * @returns {number} confidence score 0–100
 */
function computeConfidence(rawA, rawB) { }
```

### 2. Location Generator (`server/services/containers/location.js`)

```javascript
/**
 * Generates an eBay-compatible location string from hierarchy fields.
 * Format: "Building - Room - Shelf X - Row Y - Container"
 * Omits empty levels. Truncates to 45 characters.
 *
 * @param {{ building?: string, room?: string, shelf?: string, shelfRow?: string, containerName: string }} fields
 * @returns {string} location string, max 45 chars
 */
function generateLocationString(fields) { }
```

### 3. Audit Manager (`server/services/containers/audit.js`)

```javascript
/**
 * Records an immutable audit entry.
 *
 * @param {string} companyId
 * @param {{ actionType: string, entityId: string, entityType: string,
 *           previousValue?: any, newValue?: any, relatedEntities?: string[],
 *           userId: string }} entry
 * @returns {Promise<void>}
 */
async function recordAuditEntry(companyId, entry) { }

/**
 * Retrieves audit history for a container (includes inherited merge history).
 *
 * @param {string} companyId
 * @param {string} containerId
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<AuditEntry[]>}
 */
async function getAuditHistory(companyId, containerId, options) { }
```

### 4. Container Routes (`server/routes/containers.js`)

Mounted at `/api/containers` under the existing auth middleware.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List containers (filterable by status, type, location) |
| GET | `/:id` | Get single container |
| POST | `/` | Create container |
| PUT | `/:id` | Update container fields |
| DELETE | `/:id` | Archive container (soft delete) |
| POST | `/generate` | Generate containers from existing SKU data |
| POST | `/:id/merge` | Merge source container into target |
| POST | `/:id/split` | Split container into new containers |
| POST | `/:id/move-items` | Move items between containers |
| PUT | `/:id/restore` | Restore archived container |
| GET | `/types` | List container types |
| POST | `/types` | Create custom container type |
| DELETE | `/types/:name` | Delete custom container type |

### 5. Review Queue Routes (`server/routes/containers.js` — sub-path)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/review-queue` | List pending review entries |
| POST | `/review-queue/:id/accept` | Accept merge suggestion |
| POST | `/review-queue/:id/reject` | Reject merge suggestion |
| POST | `/review-queue/:id/create-new` | Create new container from entry |
| POST | `/review-queue/:id/ignore` | Ignore recommendation |

### 6. Bulk Operations Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/bulk/move-items` | Move all items from one container to another |
| POST | `/bulk/move-location` | Move containers at a location level |
| POST | `/bulk/rename` | Rename up to 500 containers |
| POST | `/bulk/assign-shelves` | Assign shelf locations to up to 500 containers |
| POST | `/bulk/merge-aliases` | Merge multiple aliases into one container |

### 7. eBay Location Sync

When a container's location fields change, the system:
1. Generates the new location string via `generateLocationString()`
2. Queries `container_item_assignments` for all items in that container
3. For each item with a linked eBay listing, enqueues a location update
4. Updates the eBay listing's `item.location` field via the Inventory API
5. Records success/failure; retries on transient failures

This reuses the existing eBay auth token management in `server/ebayAuth.js`.

## Data Models

### containers Collection

```javascript
{
  id: String,              // Permanent internal ID (UUID)
  companyId: String,       // Tenant isolation
  name: String,            // Canonical display name (max 100 chars, unique per company)
  containerType: String,   // e.g., "Tote", "Shelf Bin", "Other"
  status: String,          // "Active" | "In Use" | "Full" | "Overflow" | "Archived" | "Missing" | "Needs Verification"
  active: Boolean,         // Quick filter for non-archived

  // Location hierarchy
  building: String | null, // max 100 chars
  room: String | null,     // max 100 chars
  shelf: String | null,    // max 50 chars
  shelfRow: String | null, // max 50 chars

  // Capacity tracking
  estimatedCapacity: Number | null,    // 0–999999
  capacityType: String | null,         // "Item Count" | "Card Count" | "Box Count" | "Cubic Space" | "Weight" | "User Defined"
  currentItemCount: Number,            // 0–999999
  fullnessPercentage: Number | null,   // 0–any (can exceed 100)
  maxRecommendedItemCount: Number | null,
  capacityNotes: String | null,        // max 500 chars

  // Future barcode/QR support
  barcodeValue: String | null,         // max 128 chars
  qrCodeValue: String | null,          // max 2048 chars
  printableLabel: String | null,       // max 256 chars

  // Notes
  notes: String | null,    // max 1000 chars

  // Timestamps
  createdAt: String,       // ISO 8601
  updatedAt: String,       // ISO 8601
}
```

**Indexes:**
- `{ companyId: 1, name: 1 }` — unique
- `{ companyId: 1, status: 1 }`
- `{ companyId: 1, containerType: 1 }`
- `{ companyId: 1, building: 1, room: 1, shelf: 1, shelfRow: 1 }`
- `{ companyId: 1, fullnessPercentage: 1 }`
- `{ companyId: 1, createdAt: 1 }`
- `{ companyId: 1, updatedAt: 1 }`

### container_aliases Collection

```javascript
{
  id: String,              // Alias record ID
  companyId: String,       // Tenant isolation
  containerId: String,     // References containers.id
  aliasValue: String,      // Original SKU or alternate name
  normalizedValue: String, // Canonical form of the alias
  confidenceScore: Number, // 0–100, score when matched
  source: String,          // "auto-generated" | "user-created" | "merge"
  mergeHistory: {          // Present when alias came from a merge
    sourceContainerId: String,
    targetContainerId: String,
    mergedAt: String,      // ISO timestamp
    mergedBy: String,      // User ID
  } | null,
  createdAt: String,
  updatedAt: String,
}
```

**Indexes:**
- `{ companyId: 1, normalizedValue: 1 }` — for alias lookups
- `{ companyId: 1, containerId: 1 }`
- `{ companyId: 1, aliasValue: 1 }`

### container_item_assignments Collection

```javascript
{
  id: String,              // Assignment record ID
  companyId: String,       // Tenant isolation
  containerId: String,     // References containers.id
  itemId: String,          // References inventory_items.id or listings.id
  itemType: String,        // "inventory" | "listing"
  assignedAt: String,      // ISO timestamp
  assignedBy: String,      // User ID or "system"
  updatedAt: String,
}
```

**Indexes:**
- `{ companyId: 1, containerId: 1 }`
- `{ companyId: 1, itemId: 1, itemType: 1 }` — unique per item
- `{ companyId: 1, assignedAt: 1 }`

### container_audit Collection

```javascript
{
  id: String,              // Audit entry ID
  companyId: String,       // Tenant isolation
  actionType: String,      // "create" | "rename" | "merge" | "split" | "location_change" | "item_move" | "archive" | "restore" | "status_change"
  entityId: String,        // Primary entity affected (container ID)
  entityType: String,      // "container" | "item" | "alias"
  previousValue: any,      // Snapshot of changed field(s) before
  newValue: any,           // Snapshot of changed field(s) after
  relatedEntities: [String], // Other entity IDs involved (e.g., merge source + target)
  userId: String,          // Who performed the action
  timestamp: String,       // ISO 8601, second precision
}
```

**Indexes:**
- `{ companyId: 1, entityId: 1, timestamp: -1 }` — for per-container history
- `{ companyId: 1, timestamp: -1 }` — for global audit feed
- `{ companyId: 1, actionType: 1 }`

### container_types Collection (optional — can also be stored in config)

```javascript
{
  companyId: String,
  name: String,            // 1–50 chars, unique per company (case-insensitive)
  isDefault: Boolean,      // true for system-provided types
  createdAt: String,
}
```

### review_queue Collection

```javascript
{
  id: String,
  companyId: String,
  originalSku: String,
  suggestedContainerId: String,
  suggestedContainerName: String,
  confidenceScore: Number, // 50–89
  reason: String,          // Human-readable explanation
  status: String,          // "pending" | "accepted" | "rejected" | "created_new" | "ignored"
  rejectedPairs: [String], // Normalized pair keys that should not reappear
  createdAt: String,
  resolvedAt: String | null,
  resolvedBy: String | null,
}
```

**Indexes:**
- `{ companyId: 1, status: 1, confidenceScore: -1 }`
- `{ companyId: 1, originalSku: 1 }`

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Container generation produces one container per unique canonical name

*For any* set of SKU strings, running container generation SHALL produce exactly one container record for each unique normalized canonical name, and every original SKU value SHALL appear as a Container_Alias linked to the correct container.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Container generation is idempotent

*For any* set of SKU strings that has already been processed, running container generation a second time SHALL produce no new container records and no duplicate alias records.

**Validates: Requirements 1.6**

### Property 3: Normalization output format invariant

*For any* non-empty input string containing at least one letter or digit, the normalization engine SHALL produce output that: contains only letters, digits, and single spaces; has no leading or trailing spaces; is in title case; and has a length of at most 128 characters.

**Validates: Requirements 2.1, 2.5**

### Property 4: Normalization is case-insensitive

*For any* valid input string, changing the case of any character in the input SHALL produce the same normalized output.

**Validates: Requirements 2.2**

### Property 5: Normalization produces distinct outputs for distinct logical containers

*For any* two input strings that differ in their alphabetic prefix or numeric suffix (after stripping punctuation and normalizing spacing), the normalization engine SHALL produce distinct canonical names.

**Validates: Requirements 2.7**

### Property 6: Normalization rejects inputs with no alphanumeric content

*For any* input string that contains no letters (a-z, A-Z) and no digits (0-9), the normalization engine SHALL reject the input and return an error.

**Validates: Requirements 2.8**

### Property 7: Confidence score range constraint

*For any* two input strings, the confidence score SHALL be an integer in the range [0, 100].

**Validates: Requirements 3.1**

### Property 8: High confidence for punctuation/spacing/case-only differences

*For any* two input strings that differ only in punctuation characters, spacing, or letter case, the confidence score SHALL be 90 or above.

**Validates: Requirements 3.5**

### Property 9: Low confidence for different prefix or suffix

*For any* two input strings that differ in their alphabetic prefix or numeric suffix, the confidence score SHALL be below 50.

**Validates: Requirements 3.6**

### Property 10: Container generation preserves existing data

*For any* inventory item or listing, after container generation is performed, all fields on that item or listing (including the SKU value) SHALL be byte-for-byte identical to their values before generation.

**Validates: Requirements 4.3, 4.4**

### Property 11: Container name uniqueness

*For any* two containers within the same company, their names SHALL be distinct (case-insensitive comparison).

**Validates: Requirements 5.3**

### Property 12: ID stability across renames

*For any* container, renaming the container SHALL not change its permanent internal ID, and all item assignments and alias records SHALL continue to reference the same container ID.

**Validates: Requirements 1.4, 5.4**

### Property 13: Location string format correctness

*For any* combination of location hierarchy fields (building, room, shelf, shelfRow, containerName), the generated location string SHALL: concatenate only populated fields in the correct order with " - " separators; prefix shelf values with "Shelf " and shelfRow values with "Row "; contain no duplicate separators, leading separators, or trailing separators; and have a length of at most 45 characters.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

### Property 14: Fullness percentage calculation

*For any* container with a positive estimated capacity and a non-negative current item count, the fullness percentage SHALL equal round((currentItemCount / estimatedCapacity) × 100). When estimated capacity is zero, the fullness percentage SHALL be null.

**Validates: Requirements 14.3, 14.4**

## Error Handling

### Normalization Errors

| Scenario | Behavior |
|----------|----------|
| Empty/null/whitespace-only SKU | Return `{ valid: false, error: "SKU must contain at least one letter or digit" }` |
| SKU exceeds 128 chars after normalization | Truncate to 128 characters (no error) |
| Non-string input | Return `{ valid: false, error: "SKU must be a string" }` |

### Container CRUD Errors

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Duplicate container name | 409 | `{ error: "Container name already exists" }` |
| Container not found | 404 | `{ error: "Container not found" }` |
| Invalid container type | 400 | `{ error: "Invalid container type" }` |
| Missing required fields | 400 | `{ error: "name is required" }` |
| Attempt to delete default type | 400 | `{ error: "Cannot delete default container type" }` |
| Delete type in use | 409 | `{ error: "Container type in use by N containers" }` |

### Merge/Split Errors

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Source container not found | 404 | `{ error: "Source container not found" }` |
| Target container archived | 400 | `{ error: "Target container is archived" }` |
| Merge into self | 400 | `{ error: "Cannot merge container into itself" }` |

### Bulk Operation Errors

Bulk operations use partial-failure semantics:
- Successfully processed items are committed immediately
- Failed items are collected and reported in the response
- No rollback of successful items on partial failure

```javascript
// Bulk response shape
{
  success: true,
  processed: 450,
  failed: 3,
  failures: [
    { itemId: "...", error: "Container not found" },
    { itemId: "...", error: "Target container is archived" },
    { itemId: "...", error: "Item not found" }
  ]
}
```

### eBay Sync Errors

| Scenario | Behavior |
|----------|----------|
| eBay API timeout | Retry up to 3 times with exponential backoff |
| eBay auth token expired | Refresh token and retry |
| eBay API rate limit | Queue for retry after rate limit window |
| Listing not found on eBay | Mark sync as failed, notify user |
| Network error | Retry with backoff, mark as pending sync |

Failed syncs are tracked per-listing with a `locationSyncStatus` field:
- `"synced"` — eBay location matches local
- `"pending"` — Local change not yet pushed
- `"failed"` — Push attempted and failed; user can retry

### Review Queue Errors

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Accept merge but container deleted | 400 | `{ error: "Suggested container no longer exists" }` |
| Queue entry not found | 404 | `{ error: "Review queue entry not found" }` |
| Queue entry already resolved | 409 | `{ error: "Entry already resolved" }` |

## Testing Strategy

### Property-Based Tests (fast-check)

The server already has `fast-check` as a dev dependency. Property tests will be written in `server/tests/containers/` using Node's built-in test runner (`node --test`).

Each property test runs a minimum of **100 iterations** and is tagged with a comment referencing the design property:

```javascript
// Feature: inventory-container-management, Property 1: Container generation produces one container per unique canonical name
test('container generation produces one container per unique canonical name', () => {
  fc.assert(fc.property(
    fc.array(fc.string(), { minLength: 1, maxLength: 50 }),
    (skus) => {
      // ... property assertion
    }
  ), { numRuns: 100 });
});
```

**Properties to implement as PBT:**
1. Normalization output format invariant (Property 3)
2. Normalization case insensitivity (Property 4)
3. Normalization distinctness (Property 5)
4. Normalization rejection of invalid inputs (Property 6)
5. Confidence score range (Property 7)
6. High confidence for trivial differences (Property 8)
7. Low confidence for different prefix/suffix (Property 9)
8. Location string format correctness (Property 13)
9. Fullness percentage calculation (Property 14)

Properties 1, 2, 10, 11, 12 involve database state and are better tested as integration tests with a few representative examples, or with in-memory mocks for the pure logic portions.

### Unit Tests (Example-Based)

- Specific normalization examples (Requirement 2.6: "SBin1" variants)
- Location string examples (Requirements 8.7, 8.8)
- Container type CRUD validation
- Review queue action workflows
- Audit entry field completeness
- Capacity calculation edge cases (zero capacity, overflow >100%)

### Integration Tests

- Container generation end-to-end with MongoDB
- Merge/split operations with audit trail verification
- Bulk operations with partial failure
- eBay location sync with mocked eBay API
- Review queue workflow (create → accept/reject → verify state)
- Idempotent generation (run twice, verify no duplicates)
- Backward compatibility (existing inventory/listing CRUD unaffected)

### Test File Organization

```
server/tests/containers/
├── normalize.test.js          # Property + unit tests for normalization
├── confidence.test.js         # Property + unit tests for confidence scoring
├── location.test.js           # Property + unit tests for location string generation
├── capacity.test.js           # Property + unit tests for fullness calculation
├── container-crud.test.js     # Integration tests for container CRUD
├── review-queue.test.js       # Integration tests for review queue
├── bulk-operations.test.js    # Integration tests for bulk ops
├── audit.test.js              # Integration tests for audit trail
└── ebay-sync.test.js          # Integration tests for eBay location sync
```

