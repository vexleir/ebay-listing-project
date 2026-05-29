# Design Document: Listing Intelligence Completion

## Overview

This design completes the Listing Intelligence feedback loop by adding three capabilities on top of the existing INTEL-001 (experiment snapshots) and INTEL-002 slice 1 (outcome capture orchestrator + REST):

1. **Scheduled Milestone Capture** — A service that walks active experiments and fires outcome captures at 7d/14d/30d age thresholds, plus a sold-sync hook that auto-fires `milestone='sold'` when a sold item matches an experiment.
2. **Optimizer Action Tracking** — A new `optimizer_actions` collection and capture hooks in the revise/relist routes that record before/after snapshots with action type, reason codes, and expected impact.
3. **Optimizer Impact Panel** — A frontend panel in Analytics that reads from experiments, outcomes, and optimizer_actions to show aggregate optimization effectiveness.

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| Scheduler is a REST endpoint (not a background timer) | Keeps the server stateless; a cron job or admin button triggers it. Avoids timer drift and simplifies horizontal scaling. |
| Sold-sync hook is inline in the existing route | The sold-sync already iterates items; adding a non-fatal capture call per matched item is simpler than a separate post-sync job. |
| Optimizer action capture is non-fatal | Same pattern as INTEL-001 experiment snapshots — a Mongo blip shouldn't break the seller's revise/relist. |
| Impact aggregation is server-side | Avoids shipping all raw actions + outcomes to the client; the panel only needs 5-6 numbers + 3 examples. |
| `beforeSnapshot` is captured from the request body (not a fresh GetItem) | The revise/relist request already carries the listing data; a second GetItem would double eBay API calls and add latency. |

## Architecture

```mermaid
graph TD
    subgraph "Scheduled Capture (INTEL-002 slice 2)"
        CRON[Cron / Admin trigger] -->|POST| SCHED_EP[/api/intelligence/capture-milestones]
        SCHED_EP --> SCHED[scheduledCapture service]
        SCHED -->|query eligible| INTEL_DB[(listing_experiments)]
        SCHED -->|GetItem per item| EBAY[eBay Trading API]
        SCHED -->|upsert| OUT_DB[(listing_outcomes)]
    end

    subgraph "Sold-Sync Hook (INTEL-002 slice 2)"
        SOLD_EP[GET /api/ebay/sold-items] -->|per matched item| CAPTURE[captureOutcomeForEbayItem]
        CAPTURE --> OUT_DB
    end

    subgraph "Optimizer Action Tracking (INTEL-003)"
        REVISE[POST /api/ebay/revise] -->|on success| OPT_HOOK[captureOptimizerAction]
        RELIST[POST /api/ebay/relist] -->|on success| OPT_HOOK
        OPT_HOOK --> OPT_DB[(optimizer_actions)]
    end

    subgraph "Impact Panel (INTEL-004)"
        ANALYTICS[Analytics.tsx] -->|fetch| IMPACT_EP[GET /api/intelligence/optimizer-impact]
        IMPACT_EP --> OPT_DB
        IMPACT_EP --> OUT_DB
        IMPACT_EP --> INTEL_DB
    end
```

## Components and Interfaces

### 1. Scheduled Capture Service

**File:** `server/services/intelligence/scheduledCapture.js`

```javascript
/**
 * Walks experiments and fires milestone captures for those that have
 * crossed a threshold since their last capture.
 *
 * @param {Object} options
 * @param {string} options.companyId - Tenant to process
 * @param {boolean} [options.dryRun=false] - Compute eligible without capturing
 * @param {Object} deps - Injectable dependencies
 * @param {Function} deps.listExperimentsForCompany
 * @param {Function} deps.listOutcomesForExperiment
 * @param {Function} deps.fetchEbayStats - (companyId, ebayItemId) => stats
 * @param {Function} deps.captureOutcomeForEbayItem
 * @returns {Promise<{processed, captured, skipped, errors}>}
 */
async function runScheduledCapture(options, deps) { ... }

/**
 * For a single experiment, determines which milestones are due but not
 * yet captured. Pure function — no side effects.
 *
 * @param {Object} experiment - The experiment document
 * @param {string[]} existingMilestones - Already-captured milestone names
 * @param {Date} now - Current time for age calculation
 * @returns {string[]} - Milestones that should be captured (e.g. ['7d', '14d'])
 */
function computeDueMilestones(experiment, existingMilestones, now) { ... }
```

### 2. Sold-Sync Hook

**File:** `server/routes/ebay/sync.js` (modification to existing route)

After the existing sold-items pagination loop completes, iterate the returned items and fire `captureOutcomeForEbayItem` for each item that matches an experiment. The hook is non-fatal and wrapped in try/catch per item.

### 3. Optimizer Action Builder

**File:** `server/services/intelligence/optimizerAction.js`

```javascript
/**
 * Builds an optimizer_actions document from the before/after state.
 * Pure function — no I/O.
 *
 * @param {Object} params
 * @param {string} params.id - UUID for the action
 * @param {string} params.companyId
 * @param {string} params.listingId
 * @param {string} params.ebayItemId
 * @param {string} params.actionType - 'revise' | 'relist'
 * @param {Object} params.before - { title, price, descriptionLength, itemSpecificsCount, imageCount }
 * @param {Object} params.after - { title, price, descriptionLength, itemSpecificsCount, imageCount }
 * @param {string[]} params.reasonCodes - e.g. ['title_improved', 'specifics_added']
 * @param {Object} params.expectedImpact - { scoreChange?, priceChange? }
 * @returns {Object} - The optimizer_actions document
 */
function buildOptimizerAction(params) { ... }

/**
 * Extracts a snapshot from a listing object for the before/after fields.
 * Pure function.
 *
 * @param {Object} listing - The listing payload
 * @returns {{ title, price, descriptionLength, itemSpecificsCount, imageCount }}
 */
function extractListingSnapshot(listing) { ... }

/**
 * Derives reason codes by diffing before and after snapshots.
 * Pure function.
 *
 * @param {Object} before - Before snapshot
 * @param {Object} after - After snapshot
 * @returns {string[]} - e.g. ['title_changed', 'price_changed', 'specifics_added']
 */
function deriveReasonCodes(before, after) { ... }
```

### 4. Optimizer Actions CRUD

**File:** `server/intelligence.js` (additions to existing module)

```javascript
const OPTIMIZER_ACTIONS_COLLECTION = 'optimizer_actions';

async function createOptimizerAction(companyId, doc) { ... }
async function listOptimizerActionsForCompany(companyId, { limit, since }) { ... }
async function listOptimizerActionsForListing(companyId, listingId) { ... }
async function getOptimizerActionStats(companyId, { since }) { ... }
```

### 5. Impact Aggregation Service

**File:** `server/services/intelligence/impactAggregation.js`

```javascript
/**
 * Computes pre-aggregated optimizer impact metrics for a company.
 *
 * @param {string} companyId
 * @param {Object} options - { since? }
 * @param {Object} deps - Injectable data access functions
 * @returns {Promise<{
 *   optimizedListingsCount: number,
 *   averageScoreLift: number | null,
 *   averageWatcherLift: number | null,
 *   averageViewLift: number | null,
 *   sellThroughCount: number,
 *   totalActions: number,
 *   strongestWins: Array<{ listingId, title, scoreLift?, salePriceFormatted? }>
 * }>}
 */
async function computeOptimizerImpact(companyId, options, deps) { ... }
```

### 6. REST Endpoints (additions to `server/routes/intelligence.js`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/intelligence/capture-milestones` | Trigger scheduled capture for the authenticated company |
| GET | `/api/intelligence/optimizer-actions` | List optimizer actions (query: `limit`, `since`) |
| GET | `/api/intelligence/optimizer-actions/by-listing/:listingId` | Actions for a specific listing |
| GET | `/api/intelligence/optimizer-impact` | Pre-aggregated impact metrics |

### 7. Impact Panel Component

**File:** `src/components/OptimizerImpactPanel.tsx`

A self-contained React component that:
- Fetches from `GET /api/intelligence/optimizer-impact` on mount
- Renders 5 metric cards (optimized count, avg score lift, avg watcher/view lift, sell-through, total actions)
- Renders a "Strongest Wins" list (up to 3 items)
- Shows an empty state when no data exists
- Integrates into the existing Analytics page layout

## Data Models

### optimizer_actions Collection

```javascript
{
  id: String,              // UUID — primary key
  companyId: String,       // tenant key
  listingId: String,       // FK to listings.id
  ebayItemId: String,      // eBay item ID at time of action
  createdAt: String,       // ISO timestamp — when the action doc was created
  appliedAt: String,       // ISO timestamp — when the revise/relist succeeded
  actionType: String,      // 'revise' | 'relist'
  beforeSnapshot: {
    title: String,
    price: String,         // normalized numeric string (no $)
    descriptionLength: Number,
    itemSpecificsCount: Number,
    imageCount: Number,
  },
  afterSnapshot: {
    title: String,
    price: String,
    descriptionLength: Number,
    itemSpecificsCount: Number,
    imageCount: Number,
  },
  reasonCodes: [String],   // e.g. ['title_changed', 'price_changed', 'specifics_added', 'images_added']
  expectedImpact: {
    scoreChange: Number | null,   // e.g. +15 (points)
    priceChange: Number | null,   // e.g. +5.00 (dollars)
  },
}
```

### Indexes

```javascript
// optimizer_actions
{ companyId: 1, appliedAt: -1 }       // list-for-company sorted by recency
{ companyId: 1, listingId: 1 }        // list-for-listing

// listing_experiments (existing, verify)
{ companyId: 1, ebayItemId: 1 }       // lookup by eBay item ID (used by sold-sync hook)
{ companyId: 1, publishedAt: -1 }     // scheduler walks by publish date

// listing_outcomes (existing, verify)
{ companyId: 1, experimentId: 1 }     // outcomes-for-experiment
```

### Scheduled Capture — Milestone Eligibility Logic

An experiment is eligible for milestone `M` when:
- `daysSince(experiment.publishedAt, now) >= threshold(M)` where thresholds are `{ '7d': 7, '14d': 14, '30d': 30 }`
- No outcome with `id = "<experimentId>:<M>"` exists yet

The scheduler queries experiments with `publishedAt` in the window `[now - 31 days, now - 7 days]` (anything older than 31 days has already passed all milestones; anything younger than 7 days isn't eligible yet). This bounds the query to a ~24-day window regardless of total experiment count.

### Reason Codes Derivation

| Condition | Code |
|-----------|------|
| `before.title !== after.title` | `title_changed` |
| `before.price !== after.price` | `price_changed` |
| `after.descriptionLength > before.descriptionLength` | `description_expanded` |
| `after.itemSpecificsCount > before.itemSpecificsCount` | `specifics_added` |
| `after.imageCount > before.imageCount` | `images_added` |
| `after.imageCount < before.imageCount` | `images_removed` |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Milestone eligibility is correct and idempotent

*For any* experiment with a valid `publishedAt` date, *for any* set of already-captured milestones, and *for any* current time, `computeDueMilestones` SHALL return exactly those milestones where `daysSince(publishedAt, now) >= threshold` AND the milestone is NOT in the already-captured set. It SHALL never return a milestone that is already captured (idempotency) and never return a milestone whose age threshold has not been reached.

**Validates: Requirements 1.1, 1.4**

### Property 2: Listing snapshot extraction is complete and deterministic

*For any* listing object (with arbitrary title, price, description, itemSpecifics, and images fields), `extractListingSnapshot` SHALL return an object containing exactly 5 fields (`title`, `price`, `descriptionLength`, `itemSpecificsCount`, `imageCount`) where `descriptionLength` is a non-negative integer, `itemSpecificsCount` is a non-negative integer, and `imageCount` is a non-negative integer.

**Validates: Requirements 3.4, 3.5**

### Property 3: Optimizer action builder produces valid documents

*For any* valid combination of companyId, listingId, ebayItemId, actionType, before snapshot, and after snapshot, `buildOptimizerAction` SHALL produce a document containing all required fields (`id`, `companyId`, `listingId`, `ebayItemId`, `createdAt`, `appliedAt`, `actionType`, `beforeSnapshot`, `afterSnapshot`, `reasonCodes`, `expectedImpact`) with `actionType` being one of `'revise'` or `'relist'`, `reasonCodes` being an array, and `expectedImpact` being an object.

**Validates: Requirements 3.3**

### Property 4: Reason codes derivation is consistent with snapshot diffs

*For any* before snapshot and after snapshot, `deriveReasonCodes` SHALL return `'title_changed'` if and only if `before.title !== after.title`, SHALL return `'price_changed'` if and only if `before.price !== after.price`, SHALL return `'specifics_added'` if and only if `after.itemSpecificsCount > before.itemSpecificsCount`, and SHALL return `'images_added'` if and only if `after.imageCount > before.imageCount`.

**Validates: Requirements 3.3, 3.4, 3.5**

### Property 5: Impact aggregation produces consistent metrics

*For any* set of optimizer actions with `expectedImpact.scoreChange` values, the computed `averageScoreLift` SHALL equal the arithmetic mean of all non-null `scoreChange` values. *For any* set of optimizer actions, `optimizedListingsCount` SHALL equal the count of unique `listingId` values. `totalActions` SHALL equal the total count of actions. `sellThroughCount` SHALL be less than or equal to `optimizedListingsCount`.

**Validates: Requirements 6.1, 6.2, 6.3**

## Error Handling

| Scenario | Behavior |
|----------|----------|
| eBay GetItem fails during scheduled capture | Log error, increment `errors` counter, continue to next experiment |
| eBay GetItem fails during sold-sync hook | Log warning, skip that item, continue sync |
| Outcome upsert fails (Mongo error) | Log error, increment `errors` counter, continue batch |
| Optimizer action capture fails | Log warning, return successful revise/relist response unchanged |
| Impact aggregation has no data | Return zeroed metrics + empty `strongestWins` array |
| Invalid milestone in scheduler | Skip (normalizeMilestone returns null) |
| Experiment has no `publishedAt` | Skip — `daysSince` returns null, no milestones are eligible |
| `captureOutcomeForEbayItem` returns `{ skipped: true }` | Normal — item was pushed before INTEL-001; count as skipped |

## Testing Strategy

### Property-Based Tests (fast-check)

The project uses `node:test` for server tests. Property-based tests will use [fast-check](https://github.com/dubzzz/fast-check) (already compatible with `node:test`'s `assert` module). Each property test runs a minimum of 100 iterations.

- **Property 1**: Generate random `publishedAt` dates (within last 60 days), random subsets of `['7d','14d','30d']` as existing milestones, and random `now` dates. Assert `computeDueMilestones` output matches the threshold + exclusion rules.
- **Property 2**: Generate random listing objects with optional/missing fields. Assert `extractListingSnapshot` always returns the 5-field shape with correct types.
- **Property 3**: Generate random action parameters. Assert `buildOptimizerAction` output has all required fields with correct types.
- **Property 4**: Generate random before/after snapshot pairs. Assert each reason code appears iff its condition holds.
- **Property 5**: Generate random arrays of optimizer actions with random `expectedImpact` values. Assert `computeOptimizerImpact` returns mathematically consistent aggregates.

Tag format: `Feature: listing-intelligence-completion, Property N: <title>`

### Unit Tests (node:test)

- Scheduled capture: dry-run mode, single-item failure isolation, summary shape
- Sold-sync hook: matching/non-matching items, capture failure isolation, response shape with `capturedOutcomes`
- Optimizer action CRUD: createOptimizerAction validation (missing fields throw), list/stats queries
- Impact endpoint: zeroed metrics when no data, `since` parameter filtering

### Integration Tests

- `POST /api/intelligence/capture-milestones` — end-to-end with mocked eBay + in-memory Mongo
- `GET /api/ebay/sold-items` — verify `capturedOutcomes` field appears in response
- `GET /api/intelligence/optimizer-impact` — verify response shape and field types
- Revise/relist routes — verify optimizer action is persisted after successful revision

### Frontend Tests (Vitest)

- OptimizerImpactPanel: renders metrics from mocked API, empty state, loading state
- Integration with Analytics page: panel appears in the correct position

