# Requirements Document

## Introduction

This feature completes the Listing Intelligence pipeline for ListingStager. It adds scheduled outcome capture (INTEL-002 slice 2), optimizer action tracking (INTEL-003), and an Optimizer Impact panel in Analytics (INTEL-004). Together these close the feedback loop: the system automatically captures listing performance milestones, records what the optimizer changed and why, and surfaces the aggregate impact so sellers can see whether optimization is working.

## Glossary

- **Scheduler**: The server-side service that walks active experiments and fires milestone captures at the appropriate age thresholds (7d, 14d, 30d after publish).
- **Outcome_Capture_Service**: The existing `captureOutcomeForEbayItem` orchestrator that builds and upserts an outcome row for a given eBay item at a specified milestone.
- **Experiment**: A `listing_experiments` document recording the listing's shape at publish time (created by INTEL-001).
- **Outcome**: A `listing_outcomes` document recording performance stats (views, watchers, sold price) at a specific milestone for an experiment.
- **Optimizer_Action**: A `optimizer_actions` document recording the before/after snapshot when an optimizer recommendation is applied to a listing.
- **Sold_Sync_Route**: The existing `GET /api/ebay/sold-items` endpoint that fetches sold listings from eBay's Trading API.
- **Impact_Panel**: A React component in the Analytics page that aggregates and displays optimizer effectiveness metrics.
- **Milestone**: One of the valid capture points: `publish`, `7d`, `14d`, `30d`, `sold`, `end`.

## Requirements

### Requirement 1: Scheduled Milestone Capture

**User Story:** As a seller, I want the system to automatically capture listing performance at 7-day, 14-day, and 30-day milestones, so that I can track how my listings perform over time without manual intervention.

#### Acceptance Criteria

1. WHEN the Scheduler runs, THE Scheduler SHALL query all experiments whose `publishedAt` date makes them eligible for a milestone that has not yet been captured (7d, 14d, or 30d).
2. WHEN an experiment is eligible for a milestone, THE Scheduler SHALL fetch the current listing stats from eBay via GetItem and fire the Outcome_Capture_Service with the appropriate milestone and stats.
3. IF the eBay GetItem call fails for a single experiment, THEN THE Scheduler SHALL log the error and continue processing remaining experiments without aborting the batch.
4. THE Scheduler SHALL be idempotent: re-running the Scheduler for the same date range SHALL NOT create duplicate outcome rows (the existing composite-id upsert guarantees this).
5. WHEN the Scheduler completes a run, THE Scheduler SHALL return a summary containing the count of experiments processed, outcomes captured, errors encountered, and experiments skipped.
6. THE Scheduler SHALL expose a REST endpoint (`POST /api/intelligence/capture-milestones`) so it can be triggered by a cron job or manual admin action.
7. THE Scheduler SHALL accept an optional `dryRun` parameter that computes eligible experiments without performing captures or eBay API calls.

### Requirement 2: Sold-Sync Auto-Fire

**User Story:** As a seller, I want the system to automatically record the final sale outcome when a listing sells, so that I can see the complete lifecycle of optimized listings without extra steps.

#### Acceptance Criteria

1. WHEN the Sold_Sync_Route returns sold items, THE Sold_Sync_Route SHALL check each sold item against the experiments collection to find a matching experiment by eBay item ID.
2. WHEN a sold item matches an experiment, THE Sold_Sync_Route SHALL fire the Outcome_Capture_Service with milestone `sold`, the final sale price as `finalSalePrice`, the sold date as `soldAt`, and the listing status as `completed`.
3. WHEN a sold item does not match any experiment, THE Sold_Sync_Route SHALL skip that item without error.
4. IF the outcome capture fails for a single sold item, THEN THE Sold_Sync_Route SHALL log the error and continue processing remaining items without aborting the sync response.
5. THE Sold_Sync_Route SHALL include a `capturedOutcomes` count in its response indicating how many sold-milestone outcomes were successfully recorded during the sync.

### Requirement 3: Optimizer Action Tracking

**User Story:** As a seller, I want the system to record what the optimizer changed on my listing and why, so that I can understand which optimizations are driving results.

#### Acceptance Criteria

1. WHEN an optimizer recommendation is applied via the revise endpoint (`POST /api/ebay/revise`), THE system SHALL capture a before/after snapshot as an Optimizer_Action document.
2. WHEN an optimizer recommendation is applied via the relist flow (`POST /api/ebay/relist`), THE system SHALL capture a before/after snapshot as an Optimizer_Action document.
3. THE Optimizer_Action document SHALL contain: `id`, `companyId`, `listingId`, `ebayItemId`, `createdAt`, `appliedAt`, `actionType` (one of `revise`, `relist`), `beforeSnapshot`, `afterSnapshot`, `reasonCodes` (array of strings), and `expectedImpact` (object with optional `scoreChange`, `priceChange` fields).
4. THE `beforeSnapshot` SHALL contain the listing's title, price, description length, item specifics count, and image count before the optimization was applied.
5. THE `afterSnapshot` SHALL contain the listing's title, price, description length, item specifics count, and image count after the optimization was applied.
6. IF the optimizer action capture fails, THEN THE system SHALL log the error and still return the successful revise/relist response to the caller.
7. THE system SHALL expose a REST endpoint (`GET /api/intelligence/optimizer-actions`) that returns optimizer actions for the authenticated company, sorted by `appliedAt` descending, with optional `limit` and `since` query parameters.

### Requirement 4: Optimizer Action Data Layer

**User Story:** As a developer, I want a clean data layer for optimizer actions, so that the impact panel and future analytics can query action history efficiently.

#### Acceptance Criteria

1. THE system SHALL store Optimizer_Action documents in a `optimizer_actions` MongoDB collection.
2. THE system SHALL provide `createOptimizerAction(companyId, doc)` that validates required fields and persists the document.
3. THE system SHALL provide `listOptimizerActionsForCompany(companyId, { limit, since })` that returns actions sorted by `appliedAt` descending.
4. THE system SHALL provide `listOptimizerActionsForListing(companyId, listingId)` that returns all actions for a specific listing sorted by `appliedAt` descending.
5. THE system SHALL provide `getOptimizerActionStats(companyId, { since })` that returns aggregate counts: total actions, actions by type, and unique listings optimized.

### Requirement 5: Optimizer Impact Panel

**User Story:** As a seller, I want to see a summary of how the optimizer has impacted my listings, so that I can decide whether to continue using optimization recommendations.

#### Acceptance Criteria

1. WHEN the Analytics page loads, THE Impact_Panel SHALL display the total count of listings that have been optimized (unique `listingId` values in optimizer_actions).
2. WHEN the Analytics page loads, THE Impact_Panel SHALL display the average score lift (mean of `expectedImpact.scoreChange` across all optimizer actions where the field is present).
3. WHEN the Analytics page loads, THE Impact_Panel SHALL display the average watcher/view lift by comparing the `7d` or `14d` outcome of optimized experiments against their `publish` outcome.
4. WHEN the Analytics page loads, THE Impact_Panel SHALL display the sell-through count (number of optimized listings that have a `sold` milestone outcome).
5. WHEN the Analytics page loads, THE Impact_Panel SHALL display up to 3 examples of the strongest wins (highest score lift or highest sale price among optimized listings).
6. WHEN no optimizer actions exist for the company, THE Impact_Panel SHALL display an empty state explaining that optimization data will appear after the seller applies optimizer recommendations.
7. THE Impact_Panel SHALL fetch data from `GET /api/intelligence/optimizer-actions` and `GET /api/intelligence/outcomes` endpoints.

### Requirement 6: Impact Aggregation Endpoint

**User Story:** As a frontend developer, I want a single endpoint that returns pre-computed optimizer impact metrics, so that the Impact Panel does not need to perform complex client-side aggregation.

#### Acceptance Criteria

1. THE system SHALL expose `GET /api/intelligence/optimizer-impact` that returns pre-aggregated metrics for the authenticated company.
2. THE response SHALL include: `optimizedListingsCount`, `averageScoreLift`, `averageWatcherLift`, `averageViewLift`, `sellThroughCount`, `totalActions`, and `strongestWins` (array of up to 3 action summaries).
3. WHEN computing watcher/view lift, THE endpoint SHALL compare the earliest outcome (publish or 7d) against the latest outcome (14d or 30d) for each optimized experiment.
4. WHEN no optimizer actions exist, THE endpoint SHALL return zeroed metrics and an empty `strongestWins` array.
5. THE endpoint SHALL accept an optional `since` query parameter to scope metrics to a date range.
