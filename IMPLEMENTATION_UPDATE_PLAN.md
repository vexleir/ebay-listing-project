# ListingStager Implementation and Update Plan

**Source review:** [CONSULTANT_REVIEW.md](CONSULTANT_REVIEW.md)  
**Plan date:** 2026-05-25  
**Product:** ListingStager / `ebay-listing-project`  
**Primary goal:** Convert the consultant recommendations into an executable, multi-developer roadmap that hardens the current product, reduces delivery risk, and then ships the defensible seller workflows called out in the review.

## 0. Implementation Tracker

**Last updated:** 2026-05-25  
**Current implementation phase:** Phase 0 - Security and Operational Hygiene

Use this section as the team coordination source while implementation is active. Move completed work here immediately after merge-ready implementation so other developers do not duplicate the same task.

| Ticket | Status | Owner | Completed | Notes |
|---|---|---|---|---|
| SEC-001 | Done | Codex | 2026-05-25 | Removed unauthenticated `/api/ebay/debug-auth-public` route from `server/index.js`. |
| SEC-002 | Done | Codex | 2026-05-25 | Added `ENABLE_DEBUG_ENDPOINTS` gate and `requireSuperAdmin` protection to `/api/ebay/debug-auth` and `/api/listings/debug`; sanitized auth debug output so token/client prefixes are not returned. |
| SEC-003 | Done | Codex | 2026-05-25 | Added token JSON ignore rules, documented `ENABLE_DEBUG_ENDPOINTS=false`, deleted tracked `server/ebay_tokens.json`, and verified no runtime code references that file. |
| SEC-004 | Done | Codex | 2026-05-25 | Added dependency-free in-process rate limiting for global API traffic, authenticated API traffic, AI generation, image processing, eBay read/write calls, and comparable-sales lookups; env defaults documented in `server/.env.example`. |
| SEC-006 | Done | Codex | 2026-05-25 | Moved `DELETE /api/ebay/tokens` behind JWT auth middleware so token deletion is tenant-authenticated. |

## 1. Executive Direction

ListingStager already has a strong product foundation: AI listing generation, listing health scoring, eBay listing lifecycle handling, sold reconciliation, analytics, multi-tenancy, and operational UX patterns. The next phase should avoid a rewrite. The team should make the existing system safer and easier to extend, then use that foundation to ship seller-facing features that deepen daily usage.

The execution order is:

1. **Secure and stabilize first.** Remove exposed debug surfaces, move token storage fully out of files, add rate limits, add quota enforcement, and introduce tests around eBay XML/listing flows.
2. **Split the highest-risk modules.** Break up `server/index.js` and the largest React screens so developers can work in parallel without merge-heavy files.
3. **Improve the current seller loop.** Fix mobile, sold sync depth, error messaging, image editing, SKU truth, exports, keyboard basics, and offer/pricing workflows.
4. **Build the moat.** Add Listing Intelligence: outcome tracking, optimizer impact metrics, listing autopsies, and prompt improvements informed by real results.
5. **Expand only after the core loop is measurable.** Sourcing Scout should come before heavy cross-platform sync. Cross-platform expansion should wait for validated demand and a stable marketplace abstraction.

## 2. Target Team Model

This plan assumes 4-7 contributors can work at once.

| Role | Primary ownership | Secondary support |
|---|---|---|
| Tech lead | Architecture decisions, PR sequencing, merge conflict prevention, cross-workstream review | Complex eBay flows |
| Backend platform developer | Express app split, middleware, rate limiting, test harness, config, repositories | Data migrations |
| eBay integrations developer | Trading/Sell API services, XML builders, sold sync, offers, fulfillment | eBay error translation |
| Frontend workflow developer | Staged/List/Optimizer refactors, seller workflow UI, accessibility | Mobile pass |
| Frontend systems developer | Responsive layout, design tokens/classes, shared components, PWA shell | Image studio |
| Data/analytics developer | Listing Intelligence schema, outcome snapshots, analytics panels, exports | Repricing rules |
| QA/devops developer | Test matrix, CI scripts, smoke data, regression checks, release gates | Observability |

If the team is smaller, combine Backend Platform + eBay Integrations, and combine Frontend Workflow + Frontend Systems. Keep QA ownership explicit even if one developer wears that hat part-time.

## 3. Delivery Principles

- **No behavioral rewrite without a safety net.** Before moving eBay XML/revise/import logic, add characterization tests for current behavior.
- **Small PRs, vertical checkpoints.** Prefer PRs under 500 changed lines unless the change is a mechanical move with no behavior change.
- **Refactor behind stable contracts.** Preserve existing API response shapes until a consuming UI PR is ready.
- **Tenant boundaries are non-negotiable.** Every route and collection operation must be keyed by `companyId` unless explicitly superadmin-only.
- **Design system work is practical, not aesthetic churn.** Convert hot paths to reusable classes/tokens as they are touched.
- **Feature work ships with instrumentation.** New seller workflows should create events or snapshots that later power analytics.

## 4. Phase Plan

### Phase 0 - Security and Operational Hygiene

**Duration:** Week 1  
**Goal:** Remove production blockers and create a basic test/release gate.

#### P0.1 Remove or gate debug endpoints

**Files likely touched:** `server/index.js`, `server/auth.js`, new route/middleware test files

Tasks:

- Remove `/api/ebay/debug-auth-public` entirely.
- Gate `/api/ebay/debug-auth` and `/api/listings/debug` behind `requireSuperAdmin`.
- Add an environment flag such as `ENABLE_DEBUG_ENDPOINTS=false` so debug routes are disabled by default even for superadmins.
- Ensure debug responses never expose token prefixes, token expiry details for other tenants, or client IDs to non-superadmin users.

Acceptance criteria:

- Unauthenticated requests to debug endpoints return `401` or `404`.
- Authenticated non-superadmin users receive `403` or `404`.
- Superadmin access only works when `ENABLE_DEBUG_ENDPOINTS=true`.
- No token-like values appear in regular logs or public responses.

#### P0.2 Remove file-based token storage smell

**Files likely touched:** `.gitignore`, `server/ebay_tokens.json`, token-loading code if any exists

Tasks:

- Add `server/ebay_tokens.json` and `server/*tokens*.json` to `.gitignore`.
- Remove `server/ebay_tokens.json` from version control.
- Verify runtime code only uses the Mongo `tokens` collection.
- If the checked-in file ever contained real credentials, rotate affected eBay OAuth credentials.
- Document token storage in `server/.env.example` or a new ops note.

Acceptance criteria:

- `git status` no longer shows a tracked token JSON file after cleanup.
- App login/eBay auth still works using Mongo-backed tokens.
- A fresh clone cannot accidentally start with tenant token data.

#### P0.3 Add rate limiting and company quotas

**Files likely touched:** `server/package.json`, `server/index.js`, `server/listings.js`, new `server/middleware/rateLimit.js`

**Implementation status:** `SEC-004` is complete as an in-process limiter v1. `SEC-005` remains open for per-company daily AI token quotas. If ListingStager runs multiple server instances, replace or back this limiter with a shared store such as Redis.

Tasks:

- Add rate limiting middleware. Current implementation is a dependency-free in-process limiter; use `express-rate-limit` or a Redis-backed limiter if the app moves to multiple server instances.
- Add a conservative global API limiter.
- Add stricter limiters for high-cost endpoints:
  - AI listing generation
  - Optimizer generation
  - image background removal/upload endpoints
  - sold-comps proxy
  - eBay push/revise/relist/import endpoints
- Add per-company daily AI token quota checks before Gemini calls.
- Store configurable plan limits in company settings or a `plans`/`config` document.
- Return structured `429` responses with a user-safe message and retry/reset metadata.

Acceptance criteria:

- Repeated AI calls from one company are blocked before vendor spend exceeds the quota.
- One abusive tenant cannot block all other tenants.
- Admin can inspect current daily token usage and quota.
- UI toasts show a clear "quota/rate limit reached" message, not raw middleware text.

#### P0.4 Establish automated tests

**Files likely touched:** root `package.json`, `server/package.json`, `server/tests/**`, extracted service files as needed

Tasks:

- Add a server test runner. Recommended: Vitest for speed and ESM/CJS flexibility, plus Supertest for route tests.
- Add scripts:
  - root: `npm run build`, `npm run lint`
  - server: `npm test`
  - optional root orchestration: `npm run test:server`
- Add first tests around:
  - `buildItemSpecificsXml`
  - item-specific value splitting and 65-character limits
  - CDATA escaping behavior
  - condition fallback selection
  - route authorization for debug endpoints

Acceptance criteria:

- A clean checkout can run lint/build/server tests with documented commands.
- Tests do not require real eBay, Gemini, Cloudinary, or remove.bg credentials.
- Vendor calls are mocked at the service boundary.

#### P0.5 Add release gate checklist

Tasks:

- Add a lightweight `RELEASE_CHECKLIST.md` or include a release section in this plan.
- Require:
  - frontend build passes
  - server tests pass
  - no tracked secrets
  - debug endpoints disabled
  - smoke test: login, generate listing, stage, push sandbox listing if credentials are present

Acceptance criteria:

- Every release candidate has a repeatable checklist that a non-original developer can follow.

### Phase 1 - Architecture Refactor for Parallel Work

**Duration:** Weeks 2-4  
**Goal:** Split monoliths without changing behavior.

#### P1.1 Split Express bootstrap from route registration

Current risk: `server/index.js` contains route definitions, XML helpers, eBay API calls, sold sync logic, image endpoints, and server bootstrap.

Target structure:

```text
server/
  index.js                  # process bootstrap only
  app.js                    # express app creation and route mounting
  config.js                 # env parsing and defaults
  middleware/
    auth.js
    requireSuperAdmin.js
    rateLimit.js
    errorHandler.js
    requestContext.js
  routes/
    auth.js
    users.js
    listings.js
    ai.js
    ebay.js
    optimizer.js
    feedback.js
    admin.js
    images.js
  services/
    ebay/
      client.js
      xml.js
      categories.js
      policies.js
      listingLifecycle.js
      importListings.js
      soldItems.js
      offers.js
      fulfillment.js
      errors.js
    ai/
      listingGenerator.js
      optimizerGenerator.js
      promptRegistry.js
    images/
      cloudinaryService.js
      backgroundRemoval.js
      imageHash.js
  repositories/
    listingsRepository.js
    settingsRepository.js
    tokenRepository.js
    usageRepository.js
    outcomeRepository.js
  lib/
    money.js
    dates.js
    logger.js
    safeJson.js
```

Implementation sequence:

1. Create `app.js` and export the Express app.
2. Move middleware setup and route mounting into `app.js`.
3. Keep endpoint paths and response shapes unchanged.
4. Move eBay XML helpers into `services/ebay/xml.js` with tests.
5. Move eBay API request wrapper into `services/ebay/client.js`.
6. Move one route group at a time, starting with low-risk routes (`feedback`, `users`, `listings`) before eBay lifecycle routes.
7. Leave `server/index.js` as `require('./app')` plus `app.listen`.

Acceptance criteria:

- Existing UI still works with no endpoint changes.
- `server/index.js` is under 150 lines.
- eBay XML/listing lifecycle behavior is covered by tests before and after moves.
- Routes can be reviewed by domain instead of scanning a 1,000+ line file.

#### P1.2 Create eBay service contracts

Service boundaries:

- `buildItemSpecificsXml(itemSpecifics)`
- `getCategoryFeatures(categoryId, companyId)`
- `resolveConditionId(categoryId, desiredCondition, companyId)`
- `pushListingToEbay(payload)`
- `reviseListingOnEbay(payload)`
- `relistListingOnEbay(payload)`
- `importSellerListings(options)`
- `syncSoldItems(options)`
- `fetchSoldComps(query)`
- `translateEbayError(errorPayload)`

Acceptance criteria:

- Route handlers are thin: validate request, call service, return response.
- Services accept explicit `companyId`; they do not read request objects directly.
- eBay XML construction is isolated from route files.
- Tests can call services without booting the Express server.

#### P1.3 Extract large React screens

Current large files:

- `src/components/StagedListings.tsx`
- `src/components/ListedProducts.tsx`
- `src/components/ListingOptimizer.tsx`

Target structure:

```text
src/components/staged/
  StagedListingsView.tsx
  StagedListingCard.tsx
  StagedListingListRow.tsx
  StagedFilters.tsx
  StagedBulkToolbar.tsx
  PushToEbayModal.tsx
  CompsPanel.tsx
  HealthBadge.tsx
  useStagedListingsFilters.ts

src/components/listed/
  ListedProductsView.tsx
  ListedListingCard.tsx
  ListedListingListRow.tsx
  ListedFilters.tsx
  ListedBulkToolbar.tsx
  MarkSoldModal.tsx
  DelistRelistModal.tsx
  ListingStatsPanel.tsx
  useListedProductsFilters.ts

src/components/optimizer/
  ListingOptimizerView.tsx
  OptimizerFilters.tsx
  OptimizerQueue.tsx
  OptimizerResultModal.tsx
  OptimizerImpactPanel.tsx
```

Implementation sequence:

1. Move pure helper functions to colocated files or `src/utils`.
2. Extract visual subcomponents with identical props and markup.
3. Extract filter/sort/search state into hooks.
4. Move modal state into modal-specific components where practical.
5. Preserve imports from old paths by temporarily re-exporting from `src/components/StagedListings.tsx`, etc.

Acceptance criteria:

- Top-level screen files trend below 400 lines.
- No seller-facing behavior changes in the refactor PRs.
- Existing search/filter/bulk/action flows still work.
- Future feature PRs can touch subcomponents instead of large shared files.

#### P1.4 Decide styling direction

Recommendation: keep CSS variables and reusable class names, and progressively reduce inline styles in hot components. Tailwind or CSS modules can work, but adding them now would increase refactor scope.

Tasks:

- Create a `src/styles/tokens.css` or expand `src/index.css` with spacing, radius, color, and layout tokens.
- Create reusable classes for buttons, icon buttons, inputs, cards/list rows, modals, tabs, filter bars, empty states, and metric cells.
- Convert newly extracted components to classes where obvious.
- Keep highly dynamic inline styles where they represent stateful values, not static design.

Acceptance criteria:

- New components do not copy-paste large static style objects.
- Mobile and accessibility fixes can be made through shared classes.
- Existing visual identity remains intact.

### Phase 2 - Reliability, Data Quality, and UX Polish

**Duration:** Weeks 5-6  
**Goal:** Fix known product gaps that block scale and reduce seller trust.

#### P2.1 Sold reconciliation upgrade

Current issue: sold sync uses a 30-day duration and does not paginate all pages.

Tasks:

- Add user/company setting for sold sync lookback: 30, 60, or 90 days.
- Support pagination through all returned pages.
- Store `lastSoldSyncAt`, `lastSoldSyncLookbackDays`, and sync summary counts.
- Add a server-side sync endpoint/service that can be called by a scheduler later.
- Keep the current client-triggered sync as a manual action.
- Update UI copy from "last 30 days" to the selected lookback.

Acceptance criteria:

- A seller who reconnects after 60-90 days can reconcile sold items within eBay's max history window.
- Sync reports how many pages/items were examined and how many local listings changed.
- Re-running sync is idempotent.

#### P2.2 eBay error translator

Tasks:

- Add `services/ebay/errors.js` with a mapper for common eBay Trading API errors:
  - missing required item specific
  - invalid condition ID
  - category does not support condition
  - sale-active price revise blocked
  - token expired/revoked
  - listing ended/not active
  - policy missing/invalid
  - image URL rejected
  - title too long
  - shipping package/weight invalid
- Preserve raw error details in logs for developers.
- Return `message`, `fix`, `code`, and `rawCode` fields to the UI.
- Update toasts/modals to show plain-English messages and optional "details".

Acceptance criteria:

- Top eBay failures are actionable to a seller.
- Raw XML text is not displayed as the primary toast.
- Support/debug still has enough detail to diagnose.

#### P2.3 Frontend safety and accessibility pass

Tasks:

- Add a confirmation modal before Disconnect from eBay.
- Add keyboard support for:
  - modal Escape close
  - table/list item selection
  - bulk action toolbar focus
  - lightbox next/previous
  - tag entry and removal
- Add Help page search/filter input.
- Add consistent loading/disabled states for destructive and expensive actions.
- Add ARIA labels to icon-only buttons.

Acceptance criteria:

- Accidental eBay disconnect is prevented.
- Keyboard-only users can complete core review/edit/delete flows.
- Icon-only buttons have accessible labels.

#### P2.4 Analytics and export quick wins

Tasks:

- Add CSV export for sold items with fields:
  - title
  - SKU
  - eBay item ID
  - sold date
  - sold price
  - cost basis
  - shipping label cost
  - estimated fees
  - net profit
  - category
  - tags
- Add P&L by tag to Analytics.
- Add 12-week trend lines for revenue, sold count, average sale price, and net profit.
- Keep the existing JSON export in Settings.

Acceptance criteria:

- Sellers can export bookkeeping-ready sold data.
- Tag-based sourcing analysis is visible without exporting.
- Existing analytics totals remain consistent.

#### P2.5 Prompt and vendor-call governance

Tasks:

- Move long prompts out of inline route/service code into versioned prompt files or a prompt registry module.
- Store prompt version with generated listings and optimizer results.
- Log vendor call metadata:
  - company ID
  - route/use case
  - model
  - prompt version
  - token counts
  - latency
  - success/failure
- Do not log images, full prompts with user-sensitive content, or API keys.

Acceptance criteria:

- Prompt changes can be reviewed in focused PRs.
- Listing Intelligence can later compare prompt versions to outcomes.
- Vendor spend can be analyzed by company and workflow.

### Phase 3 - Seller Workflow Upgrades

**Duration:** Weeks 7-10  
**Goal:** Improve daily usability and reduce seller workflow leakage out of the app.

#### P3.1 Responsive mobile and PWA pass

Tasks:

- Add mobile layout below 768px:
  - hamburger or bottom nav for primary tabs
  - single-column New Listing flow
  - single-column ResultsEditor
  - touch-friendly staged/listed/sold cards
  - sticky action bars inside edit/push modals
- Replace fixed sidebar width assumptions on mobile.
- Fix the New Listing grid that currently uses `minmax(400px, 1fr)` and `minmax(600px, 1.8fr)` on narrow screens.
- Add camera-friendly file inputs where appropriate.
- Add a basic PWA manifest/service worker only after the responsive shell is stable.

Acceptance criteria:

- No horizontal scroll at 360px, 390px, 768px, and 1024px widths.
- A seller can take/upload photos, generate, edit, and stage from a phone.
- Primary buttons meet touch target guidelines.

#### P3.2 Image Studio v1

Tasks:

- Add in-browser crop, rotate, and straighten.
- Add auto-enhance controls for brightness, contrast, white balance, and sharpness.
- Preserve original image unless the seller saves edits.
- Integrate existing background removal into the same image tools surface.
- Add duplicate-photo detection for bulk uploads using a perceptual hash.
- Defer watermark stripping until legal/product guardrails are written.

Suggested libraries:

- `browser-image-compression` or canvas pipeline for transforms.
- `cropperjs` or a lightweight React cropper if it fits the UI.
- A simple average hash/dHash implementation for duplicate detection.

Acceptance criteria:

- Edited images are reflected in staging/push flows.
- Bulk uploads warn about likely duplicates before generating/staging.
- Image processing does not freeze the UI for common phone photo sizes.

#### P3.3 Inventory and SKU truth

Tasks:

- Add a normalized inventory concept:
  - `inventoryItemId`
  - `sku`
  - quantity on hand
  - quantity listed
  - quantity sold
  - source tag/source event
  - cost basis
- Warn before staging or pushing an active duplicate SKU.
- Let users merge duplicate staged/listed records into one inventory item.
- Add status rules:
  - one-off item cannot be pushed twice unless user confirms
  - sold item decrements quantity
  - relist from sold creates a new draft only if quantity remains or user confirms replacement

Acceptance criteria:

- Sellers cannot accidentally double-list a unique SKU without an explicit warning.
- Existing listings without SKUs continue to work.
- Analytics can group by SKU/inventory item later.

#### P3.4 Monitored repricing v1

Tasks:

- Add opt-in monitored repricing per listed item.
- Add rules:
  - minimum price
  - minimum margin
  - max percent drop per day
  - max percent drop per week
  - do not reprice during sale events
  - require manual approval or auto-apply
- Add daily evaluation service using sold comps.
- Store repricing suggestions and decisions.
- Add UI in Listed and Repricing Advisor.

Acceptance criteria:

- Sellers can enroll a listing with guardrails.
- Suggestions explain the reason and reference comps.
- Auto-apply cannot violate min price or margin floor.

#### P3.5 Offer management v1

Tasks:

- Investigate current eBay API support and auth scopes for offers/counter-offers.
- Add UI to configure per-listing auto-accept and minimum offer thresholds during push and after listing.
- Add incoming offers view if API support and scopes permit.
- Add counter-offer draft workflow.
- Store offer decisions and outcomes for analytics.

Acceptance criteria:

- Seller can at minimum configure offer thresholds consistently across stage/push/relist.
- If incoming offer retrieval is feasible, seller can review and respond without leaving the app.
- If API limitations block retrieval, document the limitation and ship threshold management first.

#### P3.6 Pick-pack and shipping discovery

Tasks:

- Research eBay Sell Fulfillment API label purchase requirements, scopes, seller enrollment constraints, and sandbox behavior.
- Add "pending shipment" status to sold listings.
- Design a pick-pack UI:
  - sold item queue
  - buyer/order metadata
  - package dimensions/weight
  - purchase/print label
  - mark shipped
- Ship only after API feasibility is confirmed.

Acceptance criteria:

- A technical discovery note exists before implementation.
- Shipping work does not block other workflow upgrades.

### Phase 4 - Listing Intelligence

**Duration:** Weeks 11-16  
**Goal:** Close the loop between AI-generated listing quality and real seller outcomes.

#### P4.1 Data model for experiments and outcomes

New/updated collections or documents:

```text
listing_experiments
  _id
  companyId
  listingId
  ebayItemId
  createdAt
  publishedAt
  promptVersion
  optimizerVersion
  listingScoreAtPublish
  titleLength
  categoryId
  categoryName
  priceAtPublish
  shippingPolicyId
  bestOfferEnabled
  itemSpecificsCount
  imageCount
  tags

listing_outcomes
  _id
  companyId
  experimentId
  listingId
  ebayItemId
  capturedAt
  ageDays
  viewCount
  watcherCount
  quantitySold
  soldAt
  finalSalePrice
  activePrice
  status

optimizer_actions
  _id
  companyId
  listingId
  ebayItemId
  createdAt
  appliedAt
  actionType
  beforeSnapshot
  afterSnapshot
  reasonCodes
  expectedImpact
```

Tasks:

- Generate an experiment ID when a listing is pushed/relisted.
- Snapshot listing content and listing health score at publish time.
- Capture eBay stats at publish, 7 days, 14 days, 30 days, and sold/end.
- Ensure all outcome docs are keyed by `companyId`.
- Do not use cross-tenant learning unless anonymized aggregation is explicitly designed and approved.

Acceptance criteria:

- Every pushed listing has an experiment record.
- Outcome capture is idempotent.
- Missing eBay stats do not break listing management.

#### P4.2 Optimizer impact panel

Tasks:

- Track when an optimizer recommendation is applied.
- Capture pre-optimization metrics: title, specifics, score, price, view count, watcher count, days listed.
- Capture post-optimization metrics after 14 days.
- Add dashboard panel:
  - optimized listings count
  - average score lift
  - average watcher/view lift
  - sell-through impact
  - examples of strongest wins

Acceptance criteria:

- Optimizer can prove whether actions helped.
- Sellers can see ROI without reading raw metrics.
- Recommendations already applied are not repeatedly suggested without new evidence.

#### P4.3 Listing autopsy

Tasks:

- Detect sold items that underperform:
  - sold price more than 20% below predicted median
  - sell time much longer than category median
  - low views/watchers relative to similar listings
- Run an autopsy against:
  - title structure
  - category
  - item specifics completeness
  - photo count/quality indicators
  - pricing path
  - shipping cost/policy
- Surface lessons in Optimizer and Analytics.

Acceptance criteria:

- Autopsy is presented as practical learning, not blame.
- The system stores reason codes that can improve future recommendations.

#### P4.4 Category insight engine

Tasks:

- Aggregate per-company outcome patterns by category/tag.
- Generate insight summaries such as:
  - "Model number near the end of title correlated with faster sales in this category."
  - "Listings with 6+ photos outperform 3-photo listings for this tag."
  - "Best Offer enabled improved watcher-to-sale conversion in this category."
- Feed only validated, tenant-scoped insights into AI prompt context.
- Add prompt guardrails so insights advise the model but do not override user-provided facts.

Acceptance criteria:

- AI generation references stored category insights when enough data exists.
- Insights include sample size and confidence level.
- The seller can see and understand why recommendations changed.

### Phase 5 - Strategic Growth Features

**Duration:** Quarter 2+  
**Goal:** Expand usage after the core product has a hardened, measurable loop.

#### P5.1 Sourcing Scout

Priority: high. Build before cross-platform.

Tasks:

- Add a mobile-first route/workflow for pre-purchase evaluation.
- Input: 1-3 photos and optional notes/store price.
- Output:
  - likely item identity
  - estimated resale price
  - sold comps summary
  - expected fees
  - recommended max buy price
  - sell-through likelihood
  - recommendation: buy/maybe/skip
- Reuse existing AI image analysis and sold-comps endpoint.
- Save scout results and optionally convert to a staged listing.

Acceptance criteria:

- Response time target is 3-5 seconds for common cases.
- User can capture photo from phone and get a clear buy/no-buy recommendation.
- Result can become a listing draft without re-entering data.

#### P5.2 Cross-platform Mirror

Priority: high impact, high effort. Start with architecture/discovery, not a full build.

Tasks:

- Define a platform abstraction:
  - title limits
  - category mapping
  - condition mapping
  - description transformations
  - shipping/offer/payment constraints
  - publish/update/delete capabilities
  - sold webhook or polling support
- Evaluate platforms in this order:
  - Mercari
  - Poshmark
  - Depop
  - Etsy
  - Facebook Marketplace
- Build one integration deeply before adding the second.
- Add cross-channel source-of-truth fields:
  - inventory item
  - channel listing IDs
  - channel status
  - channel-specific price/title/description
  - delist-on-sale rules

Acceptance criteria for v1:

- One additional marketplace can be published from a staged listing.
- Sale on one channel can trigger a safe delist task for others.
- Platform-specific title/category/description constraints are visible before publish.

#### P5.3 Buyer-question auto-draft

Tasks:

- Research eBay message APIs and required scopes.
- Pull buyer messages where supported.
- Draft replies from listing description, item specifics, seller policies, and seller tone settings.
- Require seller approval before sending.
- Store approved responses for future tone/context.

Acceptance criteria:

- AI never sends buyer messages without explicit seller action in v1.
- Drafts cite the listing fields used.

#### P5.4 Storefront analytics and competitor benchmarking

Tasks:

- Let sellers track competitor storefronts.
- Use compliant public/eBay API data only.
- Compare:
  - listing count
  - category mix
  - pricing distribution
  - feedback velocity
  - sell-through indicators where available
- Add benchmark cards in Analytics.

Acceptance criteria:

- No scraping path violates marketplace terms.
- Benchmarks explain data limits clearly.

#### P5.5 Auto-bundle suggestions

Tasks:

- Find related active/staged inventory by category, tags, buyer behavior proxies, and sold comps.
- Suggest bundle listings with estimated combined price.
- Let seller accept and create a staged bundle while preserving inventory linkage.

Acceptance criteria:

- Bundle creation does not orphan or double-sell component SKUs.
- Seller can see why items were grouped.

## 5. Parallel Workstream Plan

### Sprint 0: Hotfix and guardrails

Can run in parallel:

- Backend Platform: P0.1, P0.3
- eBay Integrations: P0.2 verification, eBay token rotation checklist
- QA/DevOps: P0.4, P0.5
- Frontend Workflow: disconnect confirmation, rate-limit toast handling

Merge order:

1. Test harness
2. Debug endpoint gating/removal
3. Rate limiting/quota middleware
4. Token file cleanup

### Sprints 1-2: Refactor foundation

Can run in parallel:

- Backend Platform: `app.js`, middleware, route mounting
- eBay Integrations: eBay XML/service extraction and tests
- Frontend Workflow: Staged/List component extraction
- Frontend Systems: shared styles/classes
- QA: regression checklist and smoke fixtures

Merge order:

1. Backend app split with no behavior change
2. XML service extraction with tests
3. Low-risk route extraction
4. High-risk eBay route extraction
5. Frontend subcomponent extractions

### Sprint 3: Reliability and UX quick wins

Can run in parallel:

- eBay Integrations: sold sync pagination/lookback
- Frontend Workflow: Help search, error translator UI, keyboard basics
- Data/Analytics: CSV export, tag P&L, trend lines
- Backend Platform: prompt registry and vendor-call telemetry

Merge order:

1. Shared response/error contracts
2. Sold sync service
3. Frontend sold sync UI copy/settings
4. Analytics/export additions

### Sprints 4-5: Mobile and daily workflow depth

Can run in parallel:

- Frontend Systems: responsive shell/PWA shell
- Frontend Workflow: Image Studio v1
- Backend/eBay: Inventory/SKU model and duplicate checks
- Data: monitored repricing schema/rules
- eBay Integrations: offers discovery and threshold support

Merge order:

1. Responsive shell classes
2. Mobile New Listing/ResultsEditor
3. Inventory schema and duplicate warnings
4. Image Studio
5. Monitored repricing
6. Offer threshold management

### Sprints 6-8: Listing Intelligence v1

Can run in parallel:

- Data/Analytics: experiment/outcome schema and aggregation
- eBay Integrations: stats capture service
- Backend Platform: scheduler-compatible outcome capture endpoint
- Frontend Workflow: Optimizer impact panel and listing autopsy surfaces
- QA: outcome fixtures and regression data

Merge order:

1. Experiment ID generation on publish/relist
2. Outcome capture service
3. Optimizer action tracking
4. Impact panel
5. Autopsy
6. Category insight engine

## 6. Backlog Ticket Breakdown

Use these ticket IDs as implementation anchors. Each ticket should be converted into a GitHub issue or project card.

| ID | Priority | Workstream | Title | Dependencies |
|---|---:|---|---|---|
| SEC-001 | P0 | Backend | Remove public eBay debug endpoint | none |
| SEC-002 | P0 | Backend | Gate all debug routes to superadmin and env flag | SEC-001 |
| SEC-003 | P0 | Backend/Ops | Remove and ignore token JSON files | none |
| SEC-004 | P0 | Backend | Add global and costly-endpoint rate limiting | none |
| SEC-005 | P0 | Backend/Data | Add per-company AI token quota enforcement | SEC-004 |
| SEC-006 | P0 | Backend | Require JWT auth for eBay token deletion endpoint | none |
| QA-001 | P0 | QA/Backend | Add server test runner and scripts | none |
| QA-002 | P0 | QA/Backend | Add debug endpoint authorization tests | QA-001, SEC-002 |
| QA-003 | P0 | QA/Backend | Add XML builder tests | QA-001 |
| ARCH-001 | P1 | Backend | Create `server/app.js` and slim `index.js` | QA-001 |
| ARCH-002 | P1 | Backend | Extract middleware modules | ARCH-001 |
| ARCH-003 | P1 | eBay | Extract eBay XML service | QA-003 |
| ARCH-004 | P1 | eBay | Extract eBay client and lifecycle services | ARCH-003 |
| ARCH-005 | P1 | Backend | Extract route groups from `server/index.js` | ARCH-001 |
| FE-001 | P1 | Frontend | Extract StagedListings subcomponents | none |
| FE-002 | P1 | Frontend | Extract ListedProducts subcomponents | none |
| FE-003 | P1 | Frontend | Extract ListingOptimizer subcomponents | none |
| FE-004 | P1 | Frontend | Add shared filter/sort hooks | FE-001, FE-002 |
| UI-001 | P1 | Frontend | Add shared CSS tokens/classes for extracted components | none |
| REL-001 | P2 | eBay | Add sold sync pagination | ARCH-004 |
| REL-002 | P2 | eBay/Frontend | Add 30/60/90-day sold sync setting | REL-001 |
| REL-003 | P2 | Backend | Add eBay error translator | ARCH-004 |
| UX-001 | P2 | Frontend | Add eBay Disconnect confirmation | none |
| UX-002 | P2 | Frontend | Add keyboard support to modals and list selection | FE-001, FE-002 |
| UX-003 | P2 | Frontend | Add Help page search | none |
| DATA-001 | P2 | Data | Add sold CSV export | none |
| DATA-002 | P2 | Data | Add P&L by tag | DATA-001 |
| DATA-003 | P2 | Data | Add 12-week trend lines | DATA-001 |
| AI-001 | P2 | Backend/AI | Externalize prompt registry | ARCH-005 |
| AI-002 | P2 | Backend/AI | Store prompt version and vendor-call metadata | AI-001 |
| MOB-001 | P3 | Frontend | Add responsive shell/navigation | UI-001 |
| MOB-002 | P3 | Frontend | Make New Listing and ResultsEditor mobile-safe | MOB-001 |
| MOB-003 | P3 | Frontend | Make Staged/List/Sold mobile-safe | MOB-001, FE-001, FE-002 |
| IMG-001 | P3 | Frontend | Add crop/rotate/straighten image tools | MOB-002 |
| IMG-002 | P3 | Frontend/Backend | Add duplicate photo detection | IMG-001 |
| INV-001 | P3 | Backend/Data | Add inventory item model | ARCH-005 |
| INV-002 | P3 | Frontend | Add duplicate SKU warnings | INV-001 |
| PRICE-001 | P3 | Backend/Data | Add monitored repricing rules model | DATA-001 |
| PRICE-002 | P3 | eBay | Add repricing evaluation service | PRICE-001 |
| PRICE-003 | P3 | Frontend | Add monitored repricing UI | PRICE-002 |
| OFFER-001 | P3 | eBay | Research offers API and scopes | none |
| OFFER-002 | P3 | Frontend/eBay | Add offer threshold management | OFFER-001 |
| FULFILL-001 | P3 | eBay | Research fulfillment label API feasibility | none |
| INTEL-001 | P4 | Data | Add listing experiment schema | AI-002 |
| INTEL-002 | P4 | eBay/Data | Add outcome capture service | INTEL-001 |
| INTEL-003 | P4 | Data | Add optimizer action tracking | INTEL-001 |
| INTEL-004 | P4 | Frontend/Data | Add Optimizer impact panel | INTEL-002, INTEL-003 |
| INTEL-005 | P4 | AI/Data | Add listing autopsy reason codes | INTEL-002 |
| INTEL-006 | P4 | AI/Data | Add category insight engine | INTEL-005 |
| SCOUT-001 | P5 | Product/Frontend | Design Sourcing Scout mobile workflow | INTEL-001 |
| SCOUT-002 | P5 | Backend/AI | Add scout analysis endpoint | SCOUT-001 |
| SCOUT-003 | P5 | Frontend | Convert scout result to staged listing | SCOUT-002 |
| XPLAT-001 | P5 | Product/eBay | Define marketplace abstraction | INV-001 |
| XPLAT-002 | P5 | Backend | Build first marketplace adapter spike | XPLAT-001 |
| XPLAT-003 | P5 | Frontend | Add channel publish UI | XPLAT-002 |

## 7. Data and Migration Plan

### Current data to preserve

- Listings and staged/listed/sold status
- Settings and eBay policy selections
- Token usage documents
- Company/user records
- eBay OAuth tokens
- Feedback posts/replies

### Migration conventions

- Additive migrations first. Avoid destructive schema changes until all code paths use the new fields.
- Include `schemaVersion` where records become workflow-critical.
- Every new collection must include `companyId` and useful indexes.
- Migration scripts should be idempotent.
- Store dates as ISO strings or timestamps consistently per existing collection conventions; document the chosen convention before adding new analytics collections.

### Suggested indexes

```text
listings:            { companyId: 1, status: 1, updatedAt: -1 }
listings:            { companyId: 1, ebayDraftId: 1 }
listings:            { companyId: 1, sku: 1 }
listing_experiments: { companyId: 1, listingId: 1 }
listing_experiments: { companyId: 1, ebayItemId: 1 }
listing_outcomes:    { companyId: 1, experimentId: 1, capturedAt: -1 }
optimizer_actions:   { companyId: 1, listingId: 1, createdAt: -1 }
usage:               { companyId: 1, day: 1 }
```

## 8. API Contract Standards

All new endpoints should follow these patterns.

Success:

```json
{
  "ok": true,
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "EBAY_MISSING_REQUIRED_SPECIFIC",
    "message": "This category requires a Size item specific.",
    "fix": "Add Size in Item Specifics, then try again.",
    "details": {}
  }
}
```

Rate limit:

```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many AI requests. Try again shortly.",
    "retryAfterSeconds": 60
  }
}
```

Quota:

```json
{
  "ok": false,
  "error": {
    "code": "AI_QUOTA_EXCEEDED",
    "message": "Your AI quota for today has been reached.",
    "resetAt": "2026-05-26T00:00:00.000Z"
  }
}
```

## 9. Testing Strategy

### Unit tests

Required areas:

- eBay XML building and escaping
- item specifics splitting
- condition ID resolution
- price/money parsing
- fee/net profit calculations
- listing health score
- prompt registry selection
- SKU duplicate detection
- repricing guardrail calculations

### Service tests

Required areas:

- push listing flow with mocked eBay success
- push listing condition fallback
- revise listing merges live item specifics
- revise listing skips price when active sale blocks price changes
- sold sync pagination and idempotency
- rate limit and quota enforcement
- optimizer action tracking

### Route tests

Required areas:

- auth required on all tenant routes
- company isolation for listing CRUD
- superadmin-only admin/debug routes
- 429 behavior for costly endpoints
- translated eBay error responses

### Frontend tests

Start lightweight:

- component tests for extracted filters/toolbars/modals
- utility tests for CSV export, tag P&L, trend calculations
- keyboard behavior tests for core modals if the test stack supports it

### Manual smoke tests

Before each release:

1. Login.
2. Connect or verify eBay status.
3. Generate listing from image and instructions.
4. Edit generated fields and item specifics.
5. Stage listing.
6. Push to eBay sandbox or mocked environment.
7. Import active eBay listing.
8. Sync sold listings.
9. Export sold CSV.
10. Run optimizer on one listing.

## 10. Release Gates

No production release should ship unless:

- Public debug endpoints are absent or disabled.
- No token JSON files are tracked.
- Frontend build passes.
- Server tests pass.
- Lint passes or known lint debt is explicitly waived by tech lead.
- Rate limiting is enabled in production.
- AI quota enforcement is enabled in production.
- eBay credentials and callback URLs are verified for the target environment.
- Manual smoke test is complete.
- Rollback plan is documented.

## 11. Risk Register and Mitigation

| Risk | Severity | Mitigation |
|---|---:|---|
| Public debug endpoint exposes tenant/token metadata | High | Remove public endpoint; superadmin + env gate remaining diagnostics |
| Token JSON file leaks credentials | High | Remove from git, ignore future files, rotate if needed |
| API spend spike from AI/eBay/remove.bg | High | Rate limits, company quotas, admin usage views |
| Refactor breaks eBay XML behavior | High | Characterization tests before extraction |
| Large frontend files cause merge conflicts | Medium | Extract subcomponents before feature work |
| Mobile pass becomes visual churn | Medium | Scope to core listing workflows and measurable no-scroll/touch targets |
| Listing Intelligence data is sparse early | Medium | Show sample sizes and avoid overconfident insights |
| Cross-platform sync creates double-sell risk | High | Inventory source-of-truth first, delist safeguards, one platform at a time |
| Shipping label APIs are harder than expected | Medium | Do discovery before implementation |
| Prompt changes regress listing quality | Medium | Version prompts and compare outcomes |

## 12. Open Questions

These should be resolved during Sprint 0/Sprint 1 planning.

1. Which deployment environment is the release target: local-only, private seller beta, or public SaaS?
2. Are current eBay credentials production or sandbox, and have any secrets ever been committed?
3. What billing/plan tiers should drive AI quota defaults?
4. Is MongoDB the long-term datastore, or should migrations prepare for a hosted production Mongo cluster?
5. Does the team want CI in GitHub Actions, another provider, or local-only checks for now?
6. What is the first mobile target: phone-first listing creation, Sourcing Scout, or general responsive parity?
7. Should Listing Intelligence remain strictly per-company, or is anonymized aggregate learning on the roadmap?
8. Which marketplace has the highest user demand after eBay?

## 13. Recommended Immediate Next Steps

1. Create GitHub issues from the backlog ticket table.
2. Assign Sprint 0 owners for `SEC-*`, `QA-*`, and `ARCH-001`.
3. Add test harness before moving eBay code.
4. Remove/gate debug endpoints before any other feature work.
5. Decide the styling direction before extracting the large React screens.
6. Schedule a 60-minute eBay API discovery session for offers, fulfillment labels, and stats availability.
7. Schedule a 45-minute data modeling session for Listing Intelligence collections and indexes.

## 14. Definition of Done

A ticket is done when:

- Code is merged behind the agreed API/UI contract.
- Tests exist for risky logic or a clear reason is documented.
- Tenant isolation is preserved.
- Error states are user-readable.
- Loading/disabled states are handled for user-triggered network actions.
- The feature is represented in documentation if it changes setup, release, or user workflow.
- Manual smoke steps relevant to the change have been run.
- No unrelated refactors are bundled into the PR.

## 15. Final Recommendation

The strongest path is not to chase every feature in the consultant review at once. The team should first remove production blockers and make the codebase safe for parallel work. Then ship improvements that make the existing eBay loop more complete: mobile listing, better sold sync, image tools, inventory truth, monitored repricing, and offers. After that, Listing Intelligence should become the product's core differentiator because it turns ordinary listing automation into a learning system grounded in each seller's real outcomes.

Cross-platform work is valuable, but it should follow inventory truth and Listing Intelligence. Without those, multi-channel sync risks becoming an expensive integration project with double-sell risk. With them, it becomes a credible expansion of a product that already understands listing quality and seller outcomes.
