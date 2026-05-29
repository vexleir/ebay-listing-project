# Implementation Plan: Inventory Container Management

## Overview

This plan implements a container-based inventory location tracking system that derives containers from existing SKU data through a normalization engine, provides confidence-scored matching with a human review queue, and maintains a full audit trail. The implementation follows the existing project patterns (Express routes, MongoDB collections, React frontend) and builds incrementally from pure logic through data layer to API and frontend integration.

## Tasks

- [x] 1. Set up project structure and data models
  - [x] 1.1 Create MongoDB collections and indexes for containers system
    - Create `containers`, `container_aliases`, `container_item_assignments`, `container_audit`, `review_queue`, and `container_types` collections
    - Define all indexes specified in the design (unique constraints, compound indexes for reporting)
    - Add collection creation to the existing bootstrap/migration flow in `server/bootstrap.js`
    - _Requirements: 5.1, 5.2, 5.3, 16.1, 16.2, 16.3, 16.4, 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x] 1.2 Create service directory structure and shared types
    - Create `server/services/containers/` directory
    - Create `server/services/containers/index.js` barrel export
    - Define JSDoc type definitions for Container, ContainerAlias, ContainerItemAssignment, AuditEntry, ReviewQueueEntry
    - Seed default container types (Tote, Shelf Bin, Card Box, Long Box, Drawer, Binder, Display Case, Storage Shelf, Pallet, Cart, Other)
    - _Requirements: 6.1, 6.6, 15.1, 15.2, 15.3, 15.4_

- [x] 2. Implement Normalization Engine
  - [x] 2.1 Implement `normalizeContainerName` function in `server/services/containers/normalize.js`
    - Remove all characters except letters, digits, spaces
    - Insert spaces at letter↔digit and camelCase boundaries
    - Strip leading zeros from numeric tokens
    - Collapse whitespace, trim, title-case
    - Truncate to 128 characters
    - Return `{ canonical, valid, error? }` shape
    - Handle edge cases: empty/null/whitespace-only input, non-string input, punctuation-only input
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8_

  - [x] 2.2 Write property tests for normalization output format invariant
    - **Property 3: Normalization output format invariant**
    - **Validates: Requirements 2.1, 2.5**
    - Create `server/tests/containers/normalize.test.js`
    - Use fast-check to verify output contains only letters, digits, single spaces; no leading/trailing spaces; title case; max 128 chars

  - [x] 2.3 Write property test for normalization case insensitivity
    - **Property 4: Normalization is case-insensitive**
    - **Validates: Requirements 2.2**
    - Verify changing case of any character produces the same normalized output

  - [x] 2.4 Write property test for normalization distinctness
    - **Property 5: Normalization produces distinct outputs for distinct logical containers**
    - **Validates: Requirements 2.7**
    - Verify inputs with different alpha prefix or numeric suffix produce distinct canonical names

  - [x] 2.5 Write property test for normalization rejection of invalid inputs
    - **Property 6: Normalization rejects inputs with no alphanumeric content**
    - **Validates: Requirements 2.8**
    - Verify inputs with no letters or digits return `{ valid: false, error: "..." }`

  - [x] 2.6 Write unit tests for specific normalization examples
    - Test "SBin1", "s bin 1", "S-Bin-1", "S Bin #1" all produce same output
    - Test "Tote 01" and "Tote 1" produce same output
    - Test "Tote 1", "Stock 1", "Shelf 1" produce distinct outputs
    - Test empty string, null, whitespace-only, punctuation-only rejection
    - _Requirements: 2.6, 2.7, 2.8_

- [x] 3. Implement Confidence Scoring
  - [x] 3.1 Implement `computeConfidence` function in `server/services/containers/normalize.js`
    - Identical canonical forms → 100
    - Differ only in punctuation/spacing/case → 90–99
    - Same alpha prefix, different numeric suffix → 0–30
    - Different alpha prefix → 0–20
    - Partial token overlap → 50–89 (review range)
    - Return integer in range [0, 100]
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Write property test for confidence score range constraint
    - **Property 7: Confidence score range constraint**
    - **Validates: Requirements 3.1**
    - Create `server/tests/containers/confidence.test.js`
    - Verify score is always an integer in [0, 100] for any two input strings

  - [x] 3.3 Write property test for high confidence on trivial differences
    - **Property 8: High confidence for punctuation/spacing/case-only differences**
    - **Validates: Requirements 3.5**
    - Verify score ≥ 90 when inputs differ only in punctuation, spacing, or case

  - [x] 3.4 Write property test for low confidence on different prefix/suffix
    - **Property 9: Low confidence for different prefix or suffix**
    - **Validates: Requirements 3.6**
    - Verify score < 50 when inputs differ in alphabetic prefix or numeric suffix

- [x] 4. Implement Location Generator
  - [x] 4.1 Implement `generateLocationString` function in `server/services/containers/location.js`
    - Concatenate populated fields in order: Building, Room, Shelf, Shelf Row, Container
    - Separate with " - "
    - Prefix Shelf with "Shelf " and Shelf Row with "Row "
    - Omit empty levels without duplicate/leading/trailing separators
    - Truncate to 45 characters
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 4.2 Write property test for location string format correctness
    - **Property 13: Location string format correctness**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
    - Create `server/tests/containers/location.test.js`
    - Verify correct order, prefixes, no duplicate separators, max 45 chars

  - [x] 4.3 Write unit tests for location string examples
    - Test Building="Home", Room="Garage", Shelf="C", Shelf Row="3", Container="Tote 5" → "Home - Garage - Shelf C - Row 3 - Tote 5"
    - Test Room="Office", Container="Bin 2" → "Office - Bin 2"
    - Test truncation at 45 characters
    - _Requirements: 8.7, 8.8_

- [x] 5. Implement Capacity Calculator
  - [x] 5.1 Implement fullness percentage calculation in `server/services/containers/capacity.js`
    - Calculate `round((currentItemCount / estimatedCapacity) * 100)` when both are populated
    - Return null when estimatedCapacity is zero or not set
    - Allow values exceeding 100%
    - _Requirements: 14.3, 14.4, 14.5_

  - [x] 5.2 Write property test for fullness percentage calculation
    - **Property 14: Fullness percentage calculation**
    - **Validates: Requirements 14.3, 14.4**
    - Create `server/tests/containers/capacity.test.js`
    - Verify calculation formula and null when capacity is zero

- [x] 6. Checkpoint - Core logic tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Audit Manager
  - [x] 7.1 Implement `recordAuditEntry` and `getAuditHistory` in `server/services/containers/audit.js`
    - `recordAuditEntry(companyId, entry)` inserts immutable audit record with timestamp
    - `getAuditHistory(companyId, containerId, options)` retrieves entries in reverse chronological order
    - Include inherited merge history when querying a merge target
    - Support pagination with limit/offset
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 7.2 Write unit tests for audit manager
    - Test entry creation with all required fields
    - Test reverse chronological ordering
    - Test merge history inheritance
    - Test append-only behavior (no update/delete)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 8. Implement Container CRUD Routes
  - [x] 8.1 Create `server/routes/containers.js` with CRUD endpoints
    - GET `/` — list containers with filtering by status, type, location
    - GET `/:id` — get single container
    - POST `/` — create container (validate unique name, set defaults)
    - PUT `/:id` — update container fields (update Modified Date)
    - DELETE `/:id` — archive container (soft delete)
    - PUT `/:id/restore` — restore archived container
    - Wire into existing Express app and auth middleware
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 9.1, 9.2, 9.3, 9.6, 9.7, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 8.2 Implement container type management endpoints
    - GET `/types` — list container types
    - POST `/types` — create custom type (validate 1–50 chars, case-insensitive uniqueness)
    - DELETE `/types/:name` — delete custom type (prevent default deletion, prevent in-use deletion)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 8.3 Implement merge, split, and move-items endpoints
    - POST `/:id/merge` — merge source into target, transfer assignments/aliases/audit, archive source
    - POST `/:id/split` — create new containers, reassign items
    - POST `/:id/move-items` — move items between containers, trigger eBay location update
    - Validate: source exists, target not archived, no self-merge
    - Record audit entries for all operations
    - _Requirements: 9.3, 9.4, 9.5, 9.8_

  - [x] 8.4 Write integration tests for container CRUD
    - Test create, read, update, archive, restore lifecycle
    - Test unique name constraint (409 on duplicate)
    - Test merge with audit trail verification
    - Test split with item reassignment
    - Create `server/tests/containers/container-crud.test.js`
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [x] 9. Implement Container Generation from SKUs
  - [x] 9.1 Implement POST `/api/containers/generate` endpoint
    - Query existing inventory items for SKU values
    - Run each SKU through normalization engine
    - Group by canonical name, create one container per unique canonical
    - Create Container_Alias records for each original SKU
    - Apply confidence scoring for similar canonical names
    - Route high-confidence matches (≥90) to auto-merge
    - Route medium-confidence matches (50–89) to review queue
    - Discard low-confidence matches (<50)
    - Ensure idempotency: skip SKUs that already have alias mappings
    - Preserve existing item data byte-for-byte
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 9.2 Write integration tests for container generation
    - Test one container per unique canonical name (Property 1 as integration test)
    - Test idempotency — running twice produces no duplicates (Property 2 as integration test)
    - Test existing data preservation (Property 10 as integration test)
    - Test container name uniqueness (Property 11 as integration test)
    - Test ID stability across renames (Property 12 as integration test)
    - Test SKU values preserved byte-for-byte
    - Test empty/invalid SKUs are skipped
    - Create `server/tests/containers/generation.test.js`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 4.3, 4.4_

- [x] 10. Checkpoint - Container CRUD and generation working
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement Review Queue
  - [x] 11.1 Implement review queue routes in `server/routes/containers.js`
    - GET `/review-queue` — list pending entries ordered by confidence score descending
    - POST `/review-queue/:id/accept` — merge SKU into suggested container, record audit
    - POST `/review-queue/:id/reject` — mark rejected, prevent reappearance, record audit
    - POST `/review-queue/:id/create-new` — create new container from SKU, record audit
    - POST `/review-queue/:id/ignore` — remove from queue without audit, allow reappearance
    - Handle edge cases: container deleted, entry already resolved
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 11.2 Write integration tests for review queue
    - Test full workflow: create entry → accept/reject/create-new/ignore
    - Test rejected pair does not reappear
    - Test accept when container deleted returns error
    - Test already-resolved entry returns 409
    - Create `server/tests/containers/review-queue.test.js`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 12. Implement Bulk Operations
  - [x] 12.1 Implement bulk operation routes
    - POST `/bulk/move-items` — move all items from one container to another
    - POST `/bulk/move-location` — move containers at a location level
    - POST `/bulk/rename` — rename up to 500 containers
    - POST `/bulk/assign-shelves` — assign shelf locations to up to 500 containers
    - POST `/bulk/merge-aliases` — merge multiple aliases into one container
    - Implement partial-failure semantics (commit successes, report failures, no rollback)
    - Record individual audit entries for each action within bulk operation
    - Validate: target not archived, items exist, within size limits
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9_

  - [x] 12.2 Write integration tests for bulk operations
    - Test bulk move with partial failure
    - Test bulk rename within 500 limit
    - Test rejection when target is archived
    - Test audit entries created per individual action
    - Create `server/tests/containers/bulk-operations.test.js`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9_

- [x] 13. Implement eBay Location Sync
  - [x] 13.1 Implement eBay location sync service in `server/services/containers/ebaySync.js`
    - On container location change, generate new location string
    - Query `container_item_assignments` for items in that container
    - For each item with a linked eBay listing, enqueue location update
    - Update eBay listing's `item.location` field via Inventory API
    - Reuse existing eBay auth token management from `server/ebayAuth.js`
    - Implement retry with exponential backoff (up to 3 retries)
    - Handle token refresh, rate limits, listing not found
    - Track sync status per listing: "synced", "pending", "failed"
    - _Requirements: 7.4, 7.5, 7.6, 8.5, 8.6_

  - [x] 13.2 Write integration tests for eBay location sync
    - Test sync triggered on location change
    - Test retry on transient failure
    - Test token refresh flow
    - Test failed sync status tracking
    - Mock eBay API responses
    - Create `server/tests/containers/ebay-sync.test.js`
    - _Requirements: 7.4, 7.5, 8.5, 8.6_

- [x] 14. Checkpoint - All backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement Frontend Container Views
  - [x] 15.1 Create Container Management main view
    - Create React component for container list with filtering by status, type, location
    - Implement container detail view with all fields
    - Implement create/edit container form with validation
    - Implement archive/restore actions
    - Implement merge, split, and move-items UI flows
    - Wire to `/api/containers` endpoints
    - _Requirements: 5.1, 5.2, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 13.1, 13.4_

  - [x] 15.2 Create Review Queue UI
    - Create React component displaying pending entries ordered by confidence score
    - Show Original SKU, Suggested Container, Confidence Score, Reason
    - Implement Accept Merge, Reject Merge, Create New Container, Ignore buttons
    - Handle error states (container deleted, already resolved)
    - Wire to `/api/containers/review-queue` endpoints
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 15.3 Create Bulk Operations UI
    - Create React component for bulk move, rename, assign shelves, merge aliases
    - Show progress and partial-failure results
    - Display count of successes and list of failures
    - Wire to `/api/containers/bulk` endpoints
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.8_

  - [x] 15.4 Create Audit History view
    - Create React component showing audit trail for a container
    - Display entries in reverse chronological order
    - Show action type, user, timestamp, previous/new values
    - Include inherited merge history
    - Wire to `/api/containers/audit` endpoint
    - _Requirements: 11.1, 11.2, 11.4, 11.5_

- [x] 16. Integration wiring and final verification
  - [x] 16.1 Wire container routes into Express app
    - Mount container routes at `/api/containers` in `server/app.js`
    - Ensure auth middleware is applied
    - Verify all routes are accessible and return correct responses
    - Test backward compatibility: existing inventory/listing CRUD unaffected
    - _Requirements: 4.7, 7.4_

  - [x] 16.2 Implement container generation trigger from frontend
    - Add "Generate Containers from SKUs" button in Container Management view
    - Show progress indicator during generation
    - Display results: containers created, aliases mapped, review queue entries
    - _Requirements: 1.1_

  - [x] 16.3 Write end-to-end integration tests
    - Test full workflow: generate → review → merge → location update → eBay sync
    - Test backward compatibility with existing inventory/listing operations
    - Test reporting queries across multiple dimensions within 2 seconds
    - Create `server/tests/containers/integration.test.js`
    - _Requirements: 4.7, 17.6, 17.7_

- [x] 17. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Integration tests verify database interactions and multi-component workflows
- The existing `fast-check` dev dependency is used for property-based tests
- All tests use Node's built-in test runner (`node --test`)
- eBay sync tests mock the eBay API to avoid external dependencies

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "4.1", "5.1", "7.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.1", "4.2", "4.3", "5.2", "7.2"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "8.1", "8.2"] },
    { "id": 4, "tasks": ["8.3", "8.4", "9.1"] },
    { "id": 5, "tasks": ["9.2", "11.1", "12.1", "13.1"] },
    { "id": 6, "tasks": ["11.2", "12.2", "13.2"] },
    { "id": 7, "tasks": ["15.1", "15.2", "15.3", "15.4"] },
    { "id": 8, "tasks": ["16.1", "16.2"] },
    { "id": 9, "tasks": ["16.3"] }
  ]
}
```
