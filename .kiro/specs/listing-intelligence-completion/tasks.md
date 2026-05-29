# Implementation Plan: Listing Intelligence Completion

## Overview

This plan implements INTEL-002 slice 2 (scheduled capture + sold-sync auto-fire), INTEL-003 (optimizer action tracking), and INTEL-004 (optimizer impact panel). Tasks are ordered so each builds on the previous: data layer first, then services, then route hooks, then frontend.

## Tasks

- [x] 1. Implement scheduled milestone capture service
  - [x] 1.1 Create `server/services/intelligence/scheduledCapture.js` with `computeDueMilestones` and `runScheduledCapture`
    - `computeDueMilestones(experiment, existingMilestones, now)` — pure function returning array of due milestone strings based on age thresholds (7d=7, 14d=14, 30d=30) minus already-captured milestones
    - `runScheduledCapture({ companyId, dryRun }, deps)` — walks experiments published 7–31 days ago, checks existing outcomes, fetches eBay stats via GetItem for eligible items, fires `captureOutcomeForEbayItem` per milestone, returns `{ processed, captured, skipped, errors }`
    - Dependencies injected: `listExperimentsForCompany`, `listOutcomesForExperiment`, `fetchEbayStats`, `captureOutcomeForEbayItem`, `getExperimentByEbayItemId`, `upsertOutcome`
    - Single GetItem failure logs and continues (non-fatal per item)
    - `dryRun=true` computes eligible without calling eBay or upserting
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7_

  - [x] 1.2 Write property test for `computeDueMilestones`
    - **Property 1: Milestone eligibility is correct and idempotent**
    - Generate random publishedAt dates, random existing milestone subsets, random now dates
    - Assert output contains only milestones where age >= threshold AND milestone not in existing set
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 1.1, 1.4**

  - [x] 1.3 Write unit tests for `runScheduledCapture`
    - Test dry-run mode returns eligible count without calling capture
    - Test single GetItem failure doesn't abort batch (errors counter increments, others still captured)
    - Test summary shape contains processed/captured/skipped/errors
    - Test experiments outside 7–31 day window are excluded
    - _Requirements: 1.2, 1.3, 1.5, 1.7_

- [x] 2. Add scheduled capture REST endpoint and sold-sync hook
  - [x] 2.1 Add `POST /api/intelligence/capture-milestones` endpoint to `server/routes/intelligence.js`
    - Accepts optional `dryRun` boolean in request body
    - Calls `runScheduledCapture` with the authenticated company's `companyId`
    - Injects real dependencies (listExperimentsForCompany, listOutcomesForExperiment, a fetchEbayStats helper that calls GetItem via tradingApiCall, captureOutcomeForEbayItem with real getExperimentByEbayItemId + upsertOutcome)
    - Returns 200 with the summary object
    - _Requirements: 1.6_

  - [x] 2.2 Add sold-sync auto-fire hook in `server/routes/ebay/sync.js`
    - After the existing sold-items pagination loop (after `items` array is populated), iterate items and for each: call `captureOutcomeForEbayItem(companyId, item.itemId, { milestone: 'sold', stats: { finalSalePrice: item.soldPrice, soldAt: item.soldDate, quantitySold: item.quantitySold }, status: 'completed' }, deps)`
    - Wrap each call in try/catch — log warning on failure, continue
    - Track `capturedOutcomes` counter (increment on non-skipped results)
    - Add `capturedOutcomes` field to the response JSON
    - Import `captureOutcomeForEbayItem` from `../../services/intelligence/captureOutcome` and `getExperimentByEbayItemId`, `upsertOutcome` from `../../intelligence`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.3 Write unit tests for sold-sync hook
    - Test matching items fire capture with milestone='sold' and correct stats
    - Test non-matching items are skipped (captureOutcomeForEbayItem returns { skipped: true })
    - Test single capture failure doesn't abort sync
    - Test response includes capturedOutcomes count
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement optimizer action builder and data layer
  - [x] 4.1 Create `server/services/intelligence/optimizerAction.js` with pure builder functions
    - `extractListingSnapshot(listing)` — returns `{ title, price, descriptionLength, itemSpecificsCount, imageCount }` from a listing object; handles missing/null fields gracefully
    - `deriveReasonCodes(before, after)` — compares snapshots and returns array of reason code strings per the derivation table
    - `buildOptimizerAction({ id, companyId, listingId, ebayItemId, actionType, before, after, reasonCodes, expectedImpact, now })` — assembles the full document; validates required fields (throws on missing companyId/listingId/ebayItemId/actionType); normalizes actionType to 'revise'|'relist'
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 4.2 Write property tests for optimizer action builder
    - **Property 2: Listing snapshot extraction is complete and deterministic**
    - Generate random listing objects, verify extractListingSnapshot returns 5 fields with correct types
    - **Property 3: Optimizer action builder produces valid documents**
    - Generate random valid parameters, verify buildOptimizerAction output has all required fields
    - **Property 4: Reason codes derivation is consistent with snapshot diffs**
    - Generate random before/after pairs, verify each reason code appears iff its condition holds
    - Use fast-check with minimum 100 iterations per property
    - **Validates: Requirements 3.3, 3.4, 3.5**

  - [x] 4.3 Add optimizer actions CRUD to `server/intelligence.js`
    - Add `OPTIMIZER_ACTIONS_COLLECTION = 'optimizer_actions'`
    - `createOptimizerAction(companyId, doc)` — validates companyId + doc.id + companyId match, inserts, returns doc without `_id`
    - `listOptimizerActionsForCompany(companyId, { limit = 100, since })` — sorted by appliedAt desc, capped at 500
    - `listOptimizerActionsForListing(companyId, listingId)` — sorted by appliedAt desc
    - `getOptimizerActionStats(companyId, { since })` — returns `{ totalActions, actionsByType: { revise, relist }, uniqueListings }`
    - Export all new functions
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.4 Write unit tests for optimizer actions CRUD
    - Test createOptimizerAction throws on missing companyId, missing doc.id, companyId mismatch
    - Test listOptimizerActionsForCompany respects limit and since
    - Test getOptimizerActionStats returns correct aggregate shape
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [x] 5. Wire optimizer action capture into revise and relist routes
  - [x] 5.1 Add optimizer action hook to `POST /api/ebay/revise` in `server/routes/ebay/lifecycle.js`
    - After the successful revise response is determined (before `res.json`), check if the request body contains optimizer context (e.g. `req.body.optimizerApplied === true` or presence of `req.body.optimizerResult`)
    - If optimizer context present: build before snapshot from `req.body.originalListing` (the listing state before optimization), build after snapshot from the revised fields in `req.body`, derive reason codes, call `createOptimizerAction`
    - Wrap in try/catch — log warning on failure, still return success
    - Import `buildOptimizerAction`, `extractListingSnapshot`, `deriveReasonCodes` from services and `createOptimizerAction` from intelligence module
    - _Requirements: 3.1, 3.6_

  - [x] 5.2 Add optimizer action hook to `POST /api/ebay/relist` in `server/routes/ebay/lifecycle.js`
    - Same pattern as 5.1 but with `actionType: 'relist'`
    - Before snapshot from the original listing (pre-optimization state), after snapshot from the relisted listing
    - _Requirements: 3.2, 3.6_

  - [x] 5.3 Write unit tests for optimizer action hooks
    - Test revise with optimizer context creates an action document
    - Test revise without optimizer context does NOT create an action
    - Test relist with optimizer context creates an action with actionType='relist'
    - Test capture failure doesn't break the revise/relist response
    - _Requirements: 3.1, 3.2, 3.6_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement impact aggregation and REST endpoints
  - [x] 7.1 Create `server/services/intelligence/impactAggregation.js` with `computeOptimizerImpact`
    - Accepts `companyId`, `{ since }`, and injectable deps (`listOptimizerActionsForCompany`, `listOutcomesForCompany`, `getOptimizerActionStats`)
    - Computes: `optimizedListingsCount` (unique listingIds), `averageScoreLift` (mean of non-null scoreChange values), `averageWatcherLift` and `averageViewLift` (compare publish/7d outcomes vs 14d/30d outcomes for optimized experiments), `sellThroughCount` (optimized listings with a 'sold' outcome), `totalActions`, `strongestWins` (top 3 by scoreChange or sale price)
    - Returns zeroed metrics + empty strongestWins when no actions exist
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x]* 7.2 Write property test for impact aggregation
    - **Property 5: Impact aggregation produces consistent metrics**
    - Generate random arrays of optimizer actions with random expectedImpact values
    - Assert averageScoreLift = sum(non-null scoreChanges) / count(non-null scoreChanges)
    - Assert optimizedListingsCount = unique listingId count
    - Assert sellThroughCount <= optimizedListingsCount
    - Assert totalActions = actions.length
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x] 7.3 Add REST endpoints to `server/routes/intelligence.js`
    - `GET /api/intelligence/optimizer-actions` — calls `listOptimizerActionsForCompany`, query params: `limit`, `since`
    - `GET /api/intelligence/optimizer-actions/by-listing/:listingId` — calls `listOptimizerActionsForListing`
    - `GET /api/intelligence/optimizer-impact` — calls `computeOptimizerImpact`, query param: `since`
    - All behind existing authMiddleware (router is already mounted under it)
    - _Requirements: 3.7, 6.1_

  - [x]* 7.4 Write integration tests for new intelligence endpoints
    - Test POST /api/intelligence/capture-milestones returns summary shape
    - Test GET /api/intelligence/optimizer-actions returns array with correct shape
    - Test GET /api/intelligence/optimizer-impact returns all required metric fields
    - Test endpoints require authentication (401 without JWT)
    - _Requirements: 1.6, 3.7, 6.1_

- [x] 8. Implement Optimizer Impact Panel frontend component
  - [x] 8.1 Create `src/components/OptimizerImpactPanel.tsx`
    - Fetches from `GET /api/intelligence/optimizer-impact` on mount using the app's existing fetch pattern (with auth header)
    - Renders 5 metric cards: Optimized Listings (count), Avg Score Lift (points), Avg Watcher/View Lift (count), Sell-Through (count), Total Actions (count)
    - Renders "Strongest Wins" section with up to 3 items showing listing title + score lift or sale price
    - Shows loading spinner during fetch
    - Shows empty state ("Apply optimizer recommendations to see impact data here") when `totalActions === 0`
    - Uses existing CSS utility classes (`.glass-card`, `.metric-cell`, `.badge`, `.empty-state`)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 8.2 Integrate OptimizerImpactPanel into Analytics page
    - Import and render `<OptimizerImpactPanel />` in `src/components/Analytics.tsx`
    - Position after the existing panels (12-Week Trend, P&L by Tag)
    - Only render when the user has an eBay connection (same guard as other eBay-dependent panels)
    - _Requirements: 5.1_

  - [x]* 8.3 Write frontend tests for OptimizerImpactPanel
    - Test renders metric cards with mocked API data
    - Test renders empty state when totalActions is 0
    - Test renders strongest wins list (up to 3 items)
    - Test loading state shows spinner
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (fast-check, 100+ iterations)
- Unit tests validate specific examples and edge cases (node:test for server, Vitest for frontend)
- The sold-sync hook (2.2) modifies an existing route — take care to preserve the existing response contract (add `capturedOutcomes` field without removing existing fields)
- The optimizer action hooks (5.1, 5.2) are triggered only when the request includes optimizer context — normal manual revises/relists do NOT create action documents
- Install `fast-check` as a dev dependency in `server/` before running property tests: `npm install --save-dev fast-check`
