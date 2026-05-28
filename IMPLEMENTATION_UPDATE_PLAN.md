# ListingStager Implementation and Update Plan

**Source review:** [CONSULTANT_REVIEW.md](CONSULTANT_REVIEW.md)  
**Plan date:** 2026-05-25  
**Product:** ListingStager / `ebay-listing-project`  
**Primary goal:** Convert the consultant recommendations into an executable, multi-developer roadmap that hardens the current product, reduces delivery risk, and then ships the defensible seller workflows called out in the review.

## 0. Implementation Tracker

**Last updated:** 2026-05-28  
**Current implementation phase:** MOB-001 (a–e) ✓, FE-004 follow-through ✓, INV-002 lite ✓, UX-002 focus-trap ✓, UX-002 lightbox a11y ✓, IMG-001 lite ✓, IMG-002 lite ✓, FE-003 test backfill ✓, IMG-001 crop ✓, IMG-001 aspect-ratio presets ✓, Quota middleware test backfill ✓, IMG-001 straighten ✓, **IMG-003 slice 1 ✓** (edit/add/remove/reorder images on listed items + push to eBay via `<PictureDetails>` in `ReviseFixedPriceItem`). Only the PWA shell remains under MOB-001. Frontend tests: **288 passing across 33 files**. Server tests: **204 passing**. Remaining IMG-001 scope: auto-enhance, unified Image Studio modal. Remaining IMG-003 scope: per-thumbnail Crop / Rotate / Straighten / Scissors buttons inside the sub-modal, frontend component tests. Other high-leverage tickets: full INV-001/INV-002, OFFER-001/FULFILL-001 discovery, INTEL-001 (experiment schema).

Use this section as the team coordination source while implementation is active. Move completed work here immediately after merge-ready implementation so other developers do not duplicate the same task.

| Ticket | Status | Owner | Completed | Notes |
|---|---|---|---|---|
| SEC-001 | Done | Codex | 2026-05-25 | Removed unauthenticated `/api/ebay/debug-auth-public` route from `server/index.js`. |
| SEC-002 | Done | Codex | 2026-05-25 | Added `ENABLE_DEBUG_ENDPOINTS` gate and `requireSuperAdmin` protection to `/api/ebay/debug-auth` and `/api/listings/debug`; sanitized auth debug output so token/client prefixes are not returned. |
| SEC-003 | Done | Codex | 2026-05-25 | Added token JSON ignore rules, documented `ENABLE_DEBUG_ENDPOINTS=false`, deleted tracked `server/ebay_tokens.json`, and verified no runtime code references that file. |
| SEC-004 | Done | Codex | 2026-05-25 | Added dependency-free in-process rate limiting for global API traffic, authenticated API traffic, AI generation, image processing, eBay read/write calls, and comparable-sales lookups; env defaults documented in `server/.env.example`. |
| SEC-005 | Done | Codex | 2026-05-25 | Added per-company daily AI token usage documents, quota checks before Gemini calls, configurable daily/reserve limits, and Analytics visibility for daily quota status. |
| SEC-006 | Done | Codex | 2026-05-25 | Moved `DELETE /api/ebay/tokens` behind JWT auth middleware so token deletion is tenant-authenticated. |
| QA-001 | Done | Codex | 2026-05-25 | Added `node:test` server test harness, root `test:server` script, and initial security hygiene tests for token-file removal, token ignore rules, and debug endpoint default config. |
| QA-002 | Done | Claude | 2026-05-25 | Extracted debug endpoint gate to `server/middleware/requireDebugEndpoints.js`; added `server/tests/debug-endpoint-auth.test.js` covering env parsing, `requireSuperAdmin` unit cases, gate middleware, and full HTTP integration (401/403/404/200) against a real Express app for both debug routes. |
| QA-003 | Done | Codex | 2026-05-25 | Extracted `buildItemSpecificsXml` to `server/services/ebay/xml.js` and added unit coverage for reserved fields, CDATA wrapping, value splitting, truncation, value caps, and array-shaped specifics. |
| QA-004 | Done | Claude | 2026-05-25 | Extracted `getConditionId` and `pickFallbackConditionId` to `server/services/ebay/conditions.js`; added `server/tests/condition-fallback.test.js` with 21 cases covering condition string mapping, fallback selection, and end-to-end Comics/Electronics category scenarios. (Closes the condition fallback gap noted in P0.4.) |
| P0.5 | Done | Claude | 2026-05-25 | Added top-level `RELEASE_CHECKLIST.md` covering pre-flight state, env config, build/lint/test gates, security gates, manual smoke steps, release notes, and rollback plan. |
| ARCH-001 | Done | Claude | 2026-05-25 | Created `server/app.js` exporting `{ app, bootstrap }`; slimmed `server/index.js` to a 12-line process bootstrap (dotenv → require app → app.listen → bootstrap). No behavior change; all 52 server tests pass. Route handlers, middleware, helpers, and bootstrap remain in `app.js` and will be split further by ARCH-002/ARCH-003/ARCH-005. |
| ARCH-002 | Done | Claude | 2026-05-25 | Extracted rate-limit infrastructure to `server/middleware/rateLimit.js` (`parsePositiveIntEnv`, `rateLimitKey`, `createRateLimiter`, `createDefaultRateLimiters`) and AI quota helpers to `server/middleware/quota.js` (`enforceAiDailyQuota`, `recordTokenUsage`, reserve constants). `app.js` now imports both modules — limiter wiring shrunk from ~100 lines to ~10. Added `server/tests/rate-limit.test.js` with 9 cases: env parsing, key fallback chain, allow/reject behavior, header emission, per-key isolation, per-name isolation, and window reset. |
| ARCH-003a | Done | Claude | 2026-05-25 | Created `server/services/ebay/client.js` (`tradingApiCall` wrapper + Trading/OAuth/Browse URL constants + default compat-level/site-id) with a `transport` injection seam so service tests don't need to monkey-patch axios. Migrated `getValidConditionIdsForCategory` to `server/services/ebay/categories.js` and removed the inline copy from `app.js`. Added `server/tests/ebay-categories.test.js` with 10 cases covering header wiring, override behavior, missing-field validation, XML shape, parser edge cases, and the categories service end-to-end. Remaining ~30 `axios.post('https://api.ebay.com/...')` callsites in `app.js` will migrate to `tradingApiCall` incrementally as route groups are extracted under ARCH-005. |
| ARCH-005a | Done | Claude | 2026-05-25 | Extracted feedback routes to `server/routes/feedback.js` (6 endpoints, ~125 lines). `app.js` now mounts via `app.use('/api/feedback', feedbackRoutes)`. Removed unused `feedbackStore` import from `app.js`. |
| ARCH-005b | Done | Claude | 2026-05-25 | Extracted superadmin routes to `server/routes/admin.js` (8 endpoints, `router.use(requireSuperAdmin)` applied once at the router level). `app.js` now mounts via `app.use('/api/admin', adminRoutes)`. Trimmed unused `getCompanies`/`updateCompany`/`deleteCompany`/`getUsers`/`updateUser`/`deleteUser`/`getCompanyById`/`getUserById` imports from `app.js`. |
| ARCH-005c | Done | Claude | 2026-05-25 | Extracted settings + token-usage routes to `server/routes/settings.js` (3 endpoints). `app.js` now mounts via `app.use('/api', settingsRoutes)`. Trimmed unused `saveSettings`/`getTokenUsage` imports. |
| ARCH-005-tests | Done | Claude | 2026-05-25 | Added `server/tests/routes.test.js` with 11 integration tests covering feedback authorship/admin/status rules, admin superadmin gate across 4 routes, admin user-creation validation/duplicate handling, and settings/token-usage happy-path. Uses `Module.prototype.require` patching to inject in-memory fakes for `feedback`, `users`, and `listings` modules — no Mongo required. |
| ARCH-005d | Done | Claude | 2026-05-25 | Extracted listings CRUD (`GET`/`POST` `/api/listings`, `PUT`/`DELETE` `/api/listings/:id`, `PATCH` `/api/listings/by-ebay-id/:itemId`, `GET /api/listings/debug`) to `server/routes/listings.js`. Debug route remains behind `requireSuperAdmin` + the env-gated `requireDebugEndpointsEnabled` from `server/middleware/requireDebugEndpoints.js`. Updated `server/tests/debug-endpoint-auth.test.js` static-source check so it walks the server tree instead of grepping `app.js`, so the test does not break every time a route migrates. |
| ARCH-005e | Done | Claude | 2026-05-25 | Extracted `POST /api/images/upload` + `POST /api/images/remove-bg` to `server/routes/images.js`. Router pulls its `imageRateLimit` from the shared `createDefaultRateLimiters()` singleton (see ARCH-shared-limiters below). |
| ARCH-005f | Done | Claude | 2026-05-25 | Extracted `POST /api/generate` + `POST /api/generate-from-urls` to `server/routes/ai.js`. Uses the shared `aiRateLimit` and the extracted `enforceAiDailyQuota` / `recordTokenUsage` / `AI_GENERATE_QUOTA_RESERVE_TOKENS` from `server/middleware/quota.js`. |
| ARCH-005g | Done | Claude | 2026-05-25 | Extracted `/api/optimizer/{fetch,comps,ai-optimize}` to `server/routes/optimizer.js`. Uses shared `aiRateLimit` + `compsRateLimit`. |
| ARCH-shared-limiters | Done | Claude | 2026-05-25 | Memoized the default limiters in `createDefaultRateLimiters()` so every route module that imports it gets the same bucket maps — otherwise splitting `/api/generate` and `/api/optimizer/ai-optimize` across two files would silently double a tenant's effective AI quota. Added `resetSharedRateLimiters()` for test isolation. |
| ARCH-005-extra-tests | Done | Claude | 2026-05-25 | Added `server/tests/routes-extra.test.js` (16 cases) covering listings CRUD happy-path + PATCH validation/notFound, images upload/remove-bg validation + missing-env paths, AI generate validation (missing/placeholder `GEMINI_API_KEY`), and optimizer fetch/comps/ai-optimize validation. |
| ARCH-005h-1 | Done | Claude | 2026-05-25 | Extracted eBay connection routes (`GET auth-url`, `GET auth-status`, `GET token-info`, `DELETE tokens`, `GET debug-auth`) to `server/routes/ebay/auth.js`. Debug route remains behind `requireSuperAdmin` + `requireDebugEndpointsEnabled`. |
| ARCH-005h-2 | Done | Claude | 2026-05-25 | Extracted read-only eBay helpers (`GET policies`, `GET category-conditions`, `GET categories`, `GET settings`) to `server/routes/ebay/readonly.js`. **ARCH-003b progress**: migrated the `GetCategoryFeatures` and `GetSuggestedCategories` callsites from raw `axios.post` to `tradingApiCall` from `services/ebay/client.js` + the existing `buildGetCategoryFeaturesXml` helper. |
| ARCH-005h-3 | Done | Claude | 2026-05-25 | Extracted `GET /api/ebay/sold-comps` and `GET /api/reprice/suggestions` to `server/routes/ebay/comps.js`. The Client-Credentials application token + its in-memory cache moved to `server/services/ebay/applicationToken.js` so future routes share the same cache (otherwise we'd burn token calls on every router-local invocation). Provides a `__resetApplicationTokenCache()` helper for tests. |
| ARCH-005h-4 | Done | Claude | 2026-05-25 | Extracted `GET /api/barcode` to `server/routes/barcode.js` and `GET /api/auth/me` to `server/routes/me.js`. |
| ARCH-005h-5 | Done | Claude | 2026-05-25 | Extracted `POST /api/auth/login` and `GET /api/ebay/callback` to `server/routes/publicAuth.js`, mounted in `app.js` BEFORE the global `authMiddleware` to preserve their public/no-JWT behavior. `app.js` no longer imports `signToken`, `verifyPassword`, `exchangeCodeForToken`, `hasValidSession`, `getTokenExpiry`, `getAuthUrl`, `requireSuperAdmin`, `createRequireDebugEndpointsEnabled`, or `requireDebugEndpointsEnabled`. |
| ARCH-005h-tests | Done | Claude | 2026-05-25 | Added `server/tests/routes-ebay.test.js` (17 cases) covering: public login (400/401/200 + JWT issuance without prior auth), `GET /api/ebay/callback` (200 with HTML + 400 missing code), `/api/auth/me` (401 + happy path), `auth-url`/`auth-status`/`token-info`/`DELETE tokens`/`debug-auth` authorization, `/api/barcode` validation + auth requirement. Patches `Module.prototype.require` for both `../foo` and `../../foo` to handle the `routes/ebay/` depth. |
| ARCH-004-prep | Done | Claude | 2026-05-25 | **Characterization-test layer for ARCH-004.** Extracted the AddFixedPriceItem XML builder and its sub-helpers from `pushListingToEbay` (in `server/app.js`) into `server/services/ebay/listingLifecycle.js` as pure functions: `formatValidPrice`, `wrapDescription`, `buildPictureDetailsXml`, `buildShippingPackageDetailsXml`, `buildBestOfferXml`, `buildScheduleTimeXml`, `buildAddFixedPriceItemXml`. Added `server/tests/listing-xml.test.js` with **28 characterization cases** locking in: price defaulting to `50.00`, title truncation at 80 chars, SKU conditional emission, quantity coercion to ≥1, picture/shipping/best-offer/schedule block presence rules, sub-element ordering, WeightMajor/WeightMinor co-emission, and the negative-string sanitize-money quirk (documented). Wired `pushListingToEbay` in `app.js` to use the extracted builders — all 142 server tests still pass, locking the move as a no-behavior-change refactor. `app.js` 1199 → 1131 lines. **The orchestration (image uploads, retry-on-condition-error, response parsing) intentionally stays in `app.js` for ARCH-004 to move next, on top of this now-frozen XML contract.** |
| ARCH-004 | Done | Claude | 2026-05-25 | Lifted the full `pushListingToEbay` orchestration into `server/services/ebay/listingLifecycle.js`: `parseEbayErrors` (error/warning splitter), `detectImageFormat`, `uploadImagesToEps` (multipart EPS image uploader with injectable transport), `resolveListingConfig` (env/setting/override precedence + missing-policy check), and the full `pushListingToEbay` (pre-flight condition validation, AddFixedPriceItem POST via `tradingApiCall`, retry-on-condition-error with fallback ID selection, success/failure shaping). Also moved `sendEbayPushError`. Dependencies (axios, `getValidAccessToken`, `getSettings`) are injected so the orchestration can be tested without real HTTP. Added `server/tests/listing-lifecycle.test.js` with **16 cases** covering parseEbayErrors severity routing, detectImageFormat URL/data-URI parsing, resolveListingConfig precedence and 400-on-missing-policy, uploadImagesToEps multipart wiring + error surfacing, and pushListingToEbay happy-path + non-condition-failure + condition-retry-with-fallback. |
| ARCH-005h-6 | Done | Claude | 2026-05-25 | Extracted the eBay write/lifecycle routes (`POST /api/ebay/revise`, `POST /api/ebay/end-listing`, `POST /api/ebay/draft`, `POST /api/ebay/relist`) to `server/routes/ebay/lifecycle.js`. Migrated every `axios.post('https://api.ebay.com/ws/api.dll', ...)` callsite in those routes to `tradingApiCall` from `services/ebay/client.js` (closes ARCH-003b for these endpoints). The router preserves the relist Step-0 GetItem-and-merge logic (SKU/policies/category/condition/package/specifics) and the revise sale-active + condition-invalid retry branches. |
| ARCH-005h-7 | Done | Claude | 2026-05-25 | Extracted the eBay sync/read routes (`GET /api/ebay/listing-stats`, `GET /api/ebay/sold-items`, `GET /api/ebay/active-listings`, `POST /api/ebay/refresh-listings`, `POST /api/ebay/import-listings`, `POST /api/ebay/refresh-images/:id`) to `server/routes/ebay/sync.js`. Migrated all 7 inline `axios.post(...api.ebay.com/ws/api.dll...)` callsites to `tradingApiCall`. ARCH-003b is now closed — `server/app.js` contains zero direct eBay HTTP calls. |
| ARCH-005h-8 | Done | Claude | 2026-05-25 | Moved the `bootstrap()` function from `server/app.js` to `server/bootstrap.js`. Rewrote `server/app.js` from scratch as a thin **82-line wiring file**: imports, app + middleware + router mounts + SPA catch-all + the `{ app, bootstrap }` export. **96% reduction from the original 2049-line monolith.** Removed every now-orphan import; `app.js` no longer references axios, ebayAuth functions, listings functions, user functions (other than for re-export), or any inline route definitions. |
| UI-001 (partial) | Done | Claude | 2026-05-25 | Extended `src/index.css` with the missing tokens + utility classes flagged by P1.4: spacing scale (`--space-1..--space-12`), semantic color tokens (`--danger`, `--warning`, `--info` + light variants), a z-index scale (dropdown / sticky / modal / lightbox / toast), and reusable classes for **list-row, modal-backdrop, modal-card, tabs-strip, tab, filter-bar, empty-state, metric-cell, badge (+ variants), btn-danger**. The foundational classes (`.glass-panel`, `.glass-card`, `.btn-primary`, `.btn-secondary`, `.btn-icon`, `.input-base`) were already in place. **Frontend work to consume these classes (FE-001/2/3) is still pending.** |
| REL-003 | Done | Claude | 2026-05-25 | Added `server/services/ebay/errors.js` with a 9-rule translator covering: missing required item specific, invalid condition for category, price blocked by sale, expired token, listing ended, missing/invalid policy, image rejected, title too long, invalid shipping package. Each rule returns `{ code, message, fix, rawMessage }`. `translateEbayErrorBatch` and `buildErrorBody` are also exported for callers that want batch translation or the Section-8 structured response shape. Wired into `sendEbayPushError` in `services/ebay/listingLifecycle.js` and into the revise/end-listing 400-Failure paths in `routes/ebay/lifecycle.js` — both surface a new `errorDetails` field alongside the legacy `error` string so existing frontend keeps working while new UI can opt into the friendlier copy. Added 17 tests in `server/tests/ebay-errors.test.js`. |
| REL-001/002 | Done | Claude | 2026-05-25 | Rewrote `GET /api/ebay/sold-items` in `routes/ebay/sync.js` to paginate through every page of `GetMyeBaySelling.SoldList` (up to a 60-page safety cap) and respect a `?lookbackDays=30\|60\|90` query parameter (default 30). Returns `{ items, lookbackDays, pagesFetched, totalEntries, syncedAt }` and persists `lastSoldSyncAt` + `lastSoldSyncLookbackDays` + summary counts to company settings via `saveSettings`. Pages are de-duplicated by ItemID. Added 3 tests in `server/tests/sold-sync.test.js` covering the lookback resolver. |
| AI-001 | Done | Claude | 2026-05-25 | Extracted all four AI prompts to `server/services/ai/prompts.js` with stable `name`+`version` strings (`listing.analysis`, `listing.titleEnrich`, `listing.final`, `optimizer.optimize`). `ai.js` and `optimizer.js` now build prompts via the registry instead of inlining them; `tokenUsage` returned from each AI call is tagged with the prompt version so future Phase 4 outcome tracking can attribute results to a specific prompt. |
| AI-002 | Done | Claude | 2026-05-25 | Added `server/services/ai/telemetry.js` with `withAiTelemetry({...}, run)` wrapper + `recordAiCall` sink. Every AI generation now emits a structured JSON log line AND best-effort inserts into a new `ai_calls` Mongo collection with `{ companyId, useCase, model, promptName, promptVersion, promptTokens, completionTokens, totalTokens, latencyMs, success, errorMessage, recordedAt }`. Wired into `POST /api/generate`, `POST /api/generate-from-urls`, and `POST /api/optimizer/ai-optimize`. **No prompt text, no API keys, no image bytes are logged** — locked by a test that asserts the row schema. Added 11 tests in `server/tests/ai-prompts.test.js` covering registry shape, each prompt's required output fields, telemetry success/failure rows, default-fill behavior, and the no-secret-leakage rule. |
| UX-001 | Done | Claude | 2026-05-25 | Added `src/components/ConfirmDialog.tsx` (reusable confirm modal — closes on Escape, fires on Enter, supports destructive styling via the new `.btn-danger` class). Wired into App.tsx so clicking Disconnect now opens a confirm dialog explaining what gets deleted (OAuth tokens, not listings) instead of firing immediately. Updated the Disconnect button to also carry an `aria-label`. Frontend builds clean. |
| DATA-001 | Done | Claude | 2026-05-25 | Added `src/utils/csv.ts` (RFC-4180-ish escaping + `downloadCsv` with UTF-8 BOM so Excel opens cleanly) and `src/utils/soldExport.ts` (15-column row builder: title, SKU, eBay item ID, sold date, sold price, cost basis, shipping label cost, eBay fee, transaction fee, promoted fee, gross profit, net profit, net margin %, category, tags). Wired an "Export CSV" button into the SoldListings toolbar — exports the visible (filtered + sorted) rows. Frontend builds clean. |
| DATA-002 | Done | Claude | 2026-05-25 | Added a "P&L by Tag (top 10)" panel to Analytics. Aggregates sold items by tag — revenue, count, avg sale price, avg net profit (with cost basis when present, shown as `n/N`). Sorted by revenue. Includes a footer explaining that avg net is only computed for sales with a recorded cost basis. |
| DATA-003 | Done | Claude | 2026-05-25 | Added a "12-Week Trend" panel to Analytics. Buckets sold items into weeks ending Sunday for 12 weeks, then renders revenue bars + week labels + an avg-sale-price sparkline + a sold-count heat strip. Each cell carries a hover tooltip with full numbers. |
| UX-002 | Done | Claude | 2026-05-25 | The existing Lightbox already had full keyboard support (Escape/ArrowLeft/ArrowRight). Added a reusable `useEscapeKey(handler, enabled)` hook in `src/hooks/useEscapeKey.ts` and wired it into `EditListingModal` (disabled while save/push in flight to match the Cancel button's gating) and `ImportModal` (disabled during step 3, matching the existing no-backdrop-close behavior). The ConfirmDialog from UX-001 already handles Escape/Enter. Future modals can adopt this hook with one line. |
| UX-003 | Done | Claude | 2026-05-25 | Refactored HelpPage to a data-driven section list with a search input at the top. Each section carries a `keywords` array (e.g. "token", "fees", "optimizer", "p&l by tag"); the filter matches title + keywords case-insensitively. Shows the visible count and a no-results message with the query echoed back. Search input has `aria-label`; X-clear button is keyboard accessible. |
| Vitest harness | Done | Claude | 2026-05-25 | Added Vitest + happy-dom + @testing-library/react + jest-dom matchers as devDependencies, plus `vitest.config.ts`, `vitest.setup.ts` (jest-dom matchers + cleanup), and new scripts (`test`, `test:watch`, `test:server`, `test:all`). Added `vitest/globals` + `@testing-library/jest-dom` to the tsconfig types so `expect(...).toBeInTheDocument()` etc. type-check. First 34 frontend tests passing alongside the existing 188 server tests. |
| FE-004 | Done | Claude | 2026-05-25 | Added `src/hooks/useListFilterSort.ts` — generic search + sort + paginate hook that returns `{ query, setQuery, perPage, setPerPage, currentPage, setCurrentPage, visible, paginated, totalPages, totalCount, filteredCount }`. Setters use `Dispatch<SetStateAction<T>>` so existing functional-update call sites (`setCurrentPage(p => p - 1)`) keep working. `setQuery` always resets `currentPage` to 1 in the same render to avoid effect-ordering races. 6 tests in `src/hooks/useListFilterSort.test.ts` cover defaults, filter, sort, pagination, clamp-on-shrink, and the query reset. |
| FE-004 follow-through (Sold) | Done | Claude | 2026-05-27 | Migrated `src/components/SoldListings.tsx` to the shared `useListFilterSort` hook. Dropped 8 lines of duplicated `useState`/manual-filter/manual-sort/manual-paginate code. The local `sort` state is preserved (the hook's `filter` and `sort` are functions, not state — so the SoldListings `<select>` keeps owning the sort key) and `useMemo` derives the comparator from it. Added a manual `setCurrentPage(1)` effect on `sort` change because the hook only auto-resets on `setQuery`. Frontend tests **175 passing**; build clean. **Optimizer is intentionally NOT migrated** — it's single-listing today and has no list to filter/sort/paginate; the existing FE-004 entry already documents this. |
| UX-002 focus-trap | Done | Claude | 2026-05-27 | **Modal focus trap (UX-002 continuation).** The existing modals already closed on Escape but Tab still leaked focus to the underlying page — a real keyboard-accessibility gap. Added `src/hooks/useFocusTrap.ts` — moves focus to the first focusable element on mount, wraps Tab from the last element back to the first (and Shift+Tab from the first back to the last), restores the previously-focused element on unmount, and degrades gracefully when there are no focusable children (falls back to focusing the container itself with `tabindex="-1"`). Applied to five modals: `PushToEbayModal`, `OptimizerPushDiffModal`, `EditListingModal`, `OptimizeListingModal`, `ConfirmDialog`. `EditListingModal` also got `role="dialog"` + `aria-modal` + `aria-label` (was previously missing). Did NOT touch `MarkSoldModal` (3 fields, no real trap needed) or `ImportModal` (covered by FE-001's confirm flow). **6 tests** in `useFocusTrap.test.tsx` cover initial focus, Tab wrap from last → first, Shift+Tab wrap from first → last, non-Tab keys (Enter/Escape) pass through untouched, the disabled-mode no-op, and focus restoration after unmount. Frontend tests **198 passing across 25 files** (was 192 + 6 new); build clean. |
| UX-002 lightbox a11y | Done | Claude | 2026-05-27 | **Lightbox a11y pass.** The image lightbox already handled Escape + ArrowLeft/ArrowRight via a `window` keydown listener but it was missing dialog semantics, focus management, and accessible labels. The Prev/Next "buttons" were also wrapped `<div>`s with the click handler on the div — focusing the inner `<button>` and pressing Enter did nothing. Refactored `src/components/Lightbox.tsx`: added `role="dialog"` + `aria-modal="true"` + dynamic `aria-label` ("Image N of M"); applied `useFocusTrap` to the dialog root; rebuilt the Close/Prev/Next controls as real `<button>` elements with `aria-label`s ("Close image viewer", "Previous image", "Next image") and the navigation handlers wired directly to the button (so keyboard Enter on a focused button now actually navigates). Added 10 Vitest cases in `Lightbox.test.tsx` covering: dialog semantics, the button aria-labels, the single-image case hiding Prev/Next, Close button click, backdrop click vs image-area click, Next/Previous click navigation with wrap-around, and the existing Arrow/Escape keyboard behavior. Frontend tests **208 passing across 26 files** (was 198 + 10 new); build clean. |
| IMG-001 (lite) | Done | Claude | 2026-05-28 | **In-browser image rotate — first slice of Image Studio v1.** Added `src/utils/imageRotate.ts` with `rotateImageFile(file, degrees = 90)` — loads the File via an object URL (revoked after decode so no blob: leak), paints it into an HTML5 Canvas rotated by any multiple of 90°, and returns a new PNG File. Exported pure helpers `rotatedDimensions(w, h, deg)` (swap on 90°/270°, normalize negatives + >360°) and `rotatedFileName(name)` (replaces the last extension with .png) so the canvas math is testable without a canvas mock. **8 unit tests** in `imageRotate.test.ts` cover the dimension swaps at 0/90/180/270°, negative + >360° normalization, the .png extension swap, dotless-name fallback, multi-dot-name handling, and the empty/undefined "rotated.png" fallback. The canvas path itself is not unit-tested (happy-dom's canvas mock doesn't support `toBlob` reliably) — it's exercised manually via the Uploader. Wired into `src/components/Uploader.tsx`: a `RotateCw` button sits next to the existing `Scissors` (remove-background) button on every thumbnail, with `aria-label`s on both. The rotation swaps the File in `images` and also updates `selectedFiles` so the analyze-after-select pipeline doesn't lose its selection state. **Deliberately NOT shipped this slice**: crop, straighten, auto-enhance (brightness/contrast/white-balance/sharpness), duplicate-photo detection (perceptual hash, IMG-002), and the unified Image Studio modal that would consolidate Scissors + Rotate + Crop into one surface. Those remain on IMG-001's full scope. Frontend tests **216 passing across 27 files** (was 208 + 8 new); build clean. |
| IMG-003 | Done (slice 1) | Claude | 2026-05-28 | **Edit/add/remove/reorder images on listed items + push the new photo set to eBay.** Pulled the existing inline `ImageEditModal` out of `src/components/StagedListings.tsx` into a shared `src/components/ImageEditModal.tsx` so the listed-item flow can reuse the same drag-reorder + drop-zone surface. Backend: added `server/services/ebay/reviseImages.js` (`isAlreadyOnEps`, `resolveReviseImageUrls`, `EPS_HOST_FRAGMENTS`) — splits the caller's image list into pass-through EPS URLs (`i.ebayimg.com`, `thumbs.ebaystatic.com`) and the rest that must round-trip through `uploadImagesToEps`, then re-merges in the original order so slot 0 stays the main image. `POST /api/ebay/revise` now accepts `images` and `listingId`; when `images` is present and non-empty, the resolved EPS URLs are emitted as `<PictureDetails>` inside the `ReviseFixedPriceItemRequest` XML body, and after a successful revise the local DB record is best-effort updated via `updateListing(req.companyId, listingId, { images: resolvedImageUrls })` so the next modal-open doesn't need a `refresh-images` round-trip. The response includes `imageUrls` so the frontend can mirror the resolved EPS URLs into its local state. Skips the picture block entirely when `images` is omitted, so unrelated revise calls (price/title/condition edits) leave the live photo set untouched. **8 server tests** in `server/tests/revise-images.test.js` cover the EPS host detection (positive / negative / non-string safety), the EPS-only no-upload path, the mixed-source path (only non-EPS uploaded, output preserves original order with uploaded URLs slotted in correctly), and the upload-error-propagates path. Frontend: extended `src/components/EditListingModal.tsx` with an Images row above Title — a 64×64 thumbnail strip (first 8 + "+N more" overflow), an "Edit images…" button that opens the shared `ImageEditModal`, and an `imagesDirty` flag that drives a "Modified" badge and gates whether `images` + `listingId` are sent on `Save & Push to eBay`. `buildUpdates()` also includes the new images list so Save-to-app-only persists the change locally. The save success path mirrors the server's `imageUrls` back into the local listing record. Added a one-line warning under the strip explaining that eBay treats `PictureDetails` as a full replacement so the seller doesn't accidentally wipe the live set. **Slice 1 deliberately reuses `ImageEditModal` as-is** — per-thumbnail Crop / Rotate / Straighten / Scissors buttons inside the sub-modal are deferred to a follow-up slice. Frontend tests **288 passing across 33 files** (unchanged — UI tests for the new modal section are a follow-up); server tests **204 passing** (was 196 + 8 new); build clean. |
| IMG-001 straighten | Done | Claude | 2026-05-28 | **Free-angle rotation (±15°) with inscribed-rectangle crop.** Added `src/utils/imageStraighten.ts` with the pure helpers `inscribedRectAfterRotation(W, H, deg)` (largest aspect-preserving AABB inside a rotated W×H image; solves both bound1 = W²/(W·c + H·s) and bound2 = WH/(W·s + H·c) constraints and takes the tighter one), `clampStraightenAngle(deg)` (±15° clamp, returns 0 on non-finite input), and the async `straightenImageFile(file, deg)` which short-circuits at 0° (returns the original File untouched) and otherwise canvas-rotates + crops to the inscribed rect — so sellers never see transparent corners. **10 unit tests** in `imageStraighten.test.ts` cover the 0°/non-finite no-ops, symmetric shrink for small angles, sign symmetry (+5° = −5°), the cap-at-original-dims case, the canonical 45°-on-a-square (≈1000/√2 = 707), integer rounding ≥1, the clamp window and the non-finite-returns-0 path. Added `src/components/ImageStraightenModal.tsx` (~135 lines) — portal-rendered, focus-trapped, Escape-dismissable modal with a fixed-aspect preview wrapper that clips to a 4:3 box and an `<img>` rendered at 110% inside it; the slider applies CSS `transform: rotate(N deg)` for live preview (no canvas churn) and the canvas only runs once on Save. The slider has an `aria-label` that announces the current value and a Reset button that goes back to 0°. Wired into `src/components/Uploader.tsx`: rebuilt the thumbnail-action row as a `flex` row of four 20×20 buttons (Crop / Straighten / Rotate / Scissors) so all four fit in the 120px-wide thumbnail without crowding, moved the `GripVertical` drag handle to the top so it doesn't overlap. Extracted a shared `replaceFile(index, next)` helper since the crop and straighten saves both swap an image at an index and update `selectedFiles` for the analyze-after-select pipeline. **Remaining IMG-001 scope**: auto-enhance (brightness/contrast/sharpness), the unified Image Studio modal that consolidates the four buttons behind a single "Edit" entry. Frontend tests **288 passing across 33 files** (was 278 + 10 new); build clean. |
| Quota middleware test backfill | Done | Claude | 2026-05-28 | **Server-side unit tests for `server/middleware/quota.js`** (previously untested). The module was extracted under ARCH-002 but never got its own focused tests — it was only exercised indirectly via the AI route integration tests. Added `server/tests/quota.test.js` with **8 cases**: `enforceAiDailyQuota` allows when reserve fits (strict-less and exact-equals branches), rejects with the documented 429 shape (status code, `code: 'AI_QUOTA_EXCEEDED'`, `error` copy, `resetAt` echo, and the `quota` echo block with `reserveTokens`), passes the `companyId` through to `getAiDailyQuotaStatus`; `recordTokenUsage` is a no-op for null/undefined input, forwards `promptTokens`+`completionTokens` to `incrementTokenUsage`, and swallows persistence errors with a single console.error log line rather than throwing; the `AI_GENERATE_QUOTA_RESERVE_TOKENS` and `AI_OPTIMIZE_QUOTA_RESERVE_TOKENS` constants are positive integers. Test uses `Module.prototype.require` patching to inject a fake `../listings` and a `__quotaSpy` hook on the fake (stable function identity so the destructured reference quota.js captures at require-time still points at the spy). Server tests **196 passing** (was 188 + 8 new); frontend tests unchanged at 278; build clean. |
| IMG-001 aspect-ratio presets | Done | Claude | 2026-05-28 | **Snap-to-aspect-ratio buttons in the crop modal.** Added `aspectRatioCropRect(imageW, imageH, ratio, coverage = 0.9)` to `src/utils/imageCrop.ts` — height-driven sizing first, falls back to width-driven when the height-driven rect would overflow the width budget, enforces `MIN_CROP_SIZE`, and falls back to `defaultCropRect` on a non-positive/NaN ratio. Added an Aspect row above the modal footer in `src/components/ImageCropModal.tsx` with four buttons: **Free** (resets to the 80%-centered freeform rect), **1:1**, **4:3**, **16:9**. Snap is one-shot — once the user grabs a resize handle the ratio is no longer enforced, by design (lets sellers fine-tune after picking a starting frame). Each button has an `aria-label` that reads as "Snap crop to 1:1 aspect ratio" or "Reset to freeform crop". **7 new tests** in `imageCrop.test.ts` cover the 1:1-in-square / 1:1-in-wide / 16:9-in-square / 4:3-in-4:3 paths, the custom-coverage knob, the tiny-image min-size enforcement, and the bad-ratio fallback (0 / negative / NaN). Frontend tests **278 passing across 32 files** (was 271 + 7 new); build clean. |
| IMG-001 crop | Done | Claude | 2026-05-28 | **In-browser crop — Image Studio v1 next slice.** Added `src/utils/imageCrop.ts` with the pure geometry helpers `defaultCropRect` (80%-of-image centered seed), `clampCropRect` (keeps a rect inside the image, enforces `MIN_CROP_SIZE = 16`), `moveCropRect` (translate by dx/dy with bounds), and `resizeCropRect(rect, corner, dx, dy, ...)` — corner-anchored math so dragging SE past the right edge bumps the SE corner against the bound instead of shifting NW. Also exports `cropImageFile(file, rect): Promise<File>` using the canvas drawImage source-rect overload + PNG export. **16 unit tests** in `imageCrop.test.ts` cover the 80% seed, the no-op-when-fits / shrink-to-fit / shift-to-fit-when-overflow / no-negatives / min-size clamping paths, the move-within / move-against-bottom-right / move-against-top-left behaviors, and all four corner-resize directions plus the past-image-edge clamp. Added `src/components/ImageCropModal.tsx` (~190 lines) — portal-rendered, focus-trapped (`useFocusTrap`), Escape-dismissable (`useEscapeKey`) modal with `role="dialog"` + `aria-modal` + `aria-label`. Stores the crop rect in IMAGE-pixel coordinates and converts pointer deltas via a live `scale = renderedWidth / naturalWidth` so the math stays correct regardless of how the image is sized in the viewport. The crop rectangle has 4 corner resize handles (Pointer Events API — `setPointerCapture` so the user can drag past the modal bounds and still keep grabbing) and the rectangle itself is draggable. The Save button calls the async `cropImageFile` and surfaces any error inline. Wired into `src/components/Uploader.tsx`: a `Crop` icon button sits next to the existing Rotate and Scissors buttons on every thumbnail (`right: 68px`), clicking it opens the modal with the source File. The Save handler replaces the File in `images` and updates `selectedFiles` to keep the analyze-after-select pipeline working. **Deliberately NOT shipped this slice**: straighten (free-rotate by small angles), auto-enhance (brightness/contrast/white-balance/sharpness), aspect-ratio presets (1:1 / 4:3 / 16:9), and the unified Image Studio modal that consolidates Scissors + Rotate + Crop into one surface — those remain on IMG-001's full scope. Frontend tests **271 passing across 32 files** (was 255 + 16 new); build clean. |
| FE-003 test backfill | Done | Claude | 2026-05-28 | **Test coverage for the three optimizer subcomponents that shipped untested.** Added `OptimizerListingHeader.test.tsx` (7 cases — title/category/price/condition/SKU rendering, stats strip, "Not your listing" notice, View-on-eBay link href + target, New Analysis button callback, the no-SKU and no-condition skip-fragment paths), `ScoreGrid.test.tsx` (4 cases — all six categories render with the right pct, onToggle fires with the category key when an interactive ScoreCard is clicked, aria-expanded reflects the expandedKey prop), and `OptimizerEditForm.test.tsx` (15 cases — owner vs non-owner header copy, title length counter math, the 80-char input truncation, + Add specifics callback, description tab toggle, the AI-suggested price chip rendering + apply + "applied" state, Review & Push wiring + non-owner gating, AI loading copy, pushSuccess banner, error banner, ✕ remove-specific row callback wiring). FE-003 now covers all 10 extracted optimizer files. Frontend tests **255 passing across 31 files** (was 229 + 26 new); build clean. |
| IMG-002 (lite) | Done | Claude | 2026-05-28 | **Duplicate-photo detection via perceptual hash (aHash).** Added `src/utils/imageHash.ts` with `computeAverageHash(file): Promise<string>` — draws the image into an 8×8 canvas, computes Rec.601 luma per pixel, then a 64-bit average hash encoded as 16 hex chars. Also exports the pure helpers `hammingDistance(a, b)` (XOR bit-count between two equal-length hex hashes, throws on length / non-hex mismatch), `isLikelyDuplicate(a, b, threshold = 5)`, and `findDuplicateGroups(entries, threshold = 5)` (a union-find clusterer that returns groups of size ≥ 2, transitive via shared near-duplicates). **13 unit tests** in `imageHash.test.ts` cover the identical-hash zero, the 4-bit/64-bit/2-bit/4-bit nibble cases, the length-mismatch + non-hex error paths, threshold honoring (default 5 + custom), single-entry no-op, obvious pairs, transitive clustering, separate clusters, and the ≥2 filter. Canvas path is exercised at runtime in the BulkUploader (happy-dom's canvas mock would need additional plumbing for `getImageData` to test end-to-end). Wired into `src/components/BulkUploader.tsx`: a hashes ref (`Map<File, string>`) fills lazily as new uploads arrive via a cancellable effect, with a per-batch `hashVersion` counter to materialize the duplicate groups. A warning banner with the `Copy` icon shows above the ungrouped section when ≥1 group is detected, with copy that adapts for singular vs multiple groups. `role="status"` so screen readers announce it without stealing focus. **Deliberately NOT shipped**: per-thumbnail duplicate badges, an inline "merge / delete duplicates" action, or duplicate detection across the broader inventory (Uploader's single-listing flow). Those follow once IMG-001 full scope lands and the unified Image Studio surface exists. Frontend tests **229 passing across 28 files** (was 216 + 13 new); build clean. |
| INV-002 (lite) | Done | Claude | 2026-05-27 | **Duplicate-SKU warnings without a new schema.** Added `src/utils/duplicateSku.ts` — pure helpers `normalizeSku` (lowercase + trim), `isActiveListing` (has SKU AND not sold; archived-but-unsold listings still count), `buildActiveSkuMap`, `findConflictingListings(sku, allListings, currentListingId?)`, `hasSkuConflict`. Sold listings are explicitly excluded so a reused SKU on a previously-sold item doesn't false-positive. **14 unit tests** in `duplicateSku.test.ts` cover the normalize/active/map/conflicts paths including the case-insensitive collision and the self-exclusion rule. Added `src/components/DuplicateSkuWarning.tsx` — small inline warning chip with `role="alert"`, singular/plural copy, and a two-title-plus-"+N more" preview. **3 component tests** cover the empty/single/multi rendering. Wired into `src/components/ResultsEditor.tsx` (new prop `allListings` + optional `currentListingId` for the edit-staged-inline flow — passes the warning under the SKU input) and `src/components/EditListingModal.tsx` (same `allListings` prop, excludes the listing being edited via `listing.id`). Threaded the active pool through the existing parent components: `App.tsx` computes `allListings = [...stagedListings, ...listedProducts]` and passes it to ResultsEditor (New tab), StagedListings, and ListedProducts; StagedListings forwards it to its inline ResultsEditor; ListedProducts forwards it to EditListingModal. The plan ticket dependency notes INV-002 depends on INV-001 (full inventory schema); shipped as **"lite"** because the existing `sku` field already covers the warn-on-stage-or-edit user story and a full inventory collection is a multi-week effort that this slice does NOT block. **INV-001 + the full INV-002 scope (warn-before-push, merge-duplicate-records, quantity-aware rules) remain open.** Frontend tests **192 passing across 24 files** (was 175 + 17 new); build clean. |
| FE-001a | Done | Claude | 2026-05-25 | Extracted pure helpers from `StagedListings.tsx` into `src/components/staged/helpers.ts`: `computeHealthScore`, `autoConditionId`, `timeAgo` (now takes injectable `now` for tests), `toArizonaLocalISO`, `EBAY_CONDITIONS`, `SortOption`, `compareStaged`, `matchesStagedQuery`. Added `src/components/staged/HealthBadge.tsx` (small, pure, with role/tabIndex/Enter+Space keyboard support — UX-002 compliant). 19 tests in `helpers.test.ts` + 6 in `HealthBadge.test.tsx`. |
| FE-001b | Done | Claude | 2026-05-25 | `StagedListings.tsx` now consumes `useListFilterSort` + `compareStaged` + `matchesStagedQuery` + `autoConditionId` + `timeAgo` + `toArizonaLocalISO` + `EBAY_CONDITIONS` instead of duplicating them inline. Net change: ~80 lines of inline state/logic deleted; behavior identical (frontend build clean, all tests pass). The local feature-rich `HealthBadge` (with portal popover) stays in place until FE-001c lifts the popover into a dedicated subcomponent — `staged/HealthBadge.tsx` is the lighter version that future FE-001 splits and FE-002/003 will reuse. |
| FE-001c | Done | Claude | 2026-05-27 | Extracted the portal popover from the local `HealthBadge` into `src/components/staged/HealthIssuesPopover.tsx` (handles Escape dismiss, backdrop click, `role=dialog` + `aria-label`). The local HealthBadge keeps its bespoke trigger styling but composes the new popover; added `aria-expanded` + `aria-label` on the trigger button (UX-002 polish). 6 tests in `HealthIssuesPopover.test.tsx` covering empty-issues no-render, backdrop dismiss vs panel click, Escape dismiss, singular/plural copy. |
| FE-001e | Done | Claude | 2026-05-27 | Extracted the search/sort toolbar and the bulk-action+view-mode toolbar into `src/components/staged/StagedFilters.tsx` and `src/components/staged/StagedBulkToolbar.tsx`. Both are stateless — parent owns the values + setters. New components carry `aria-label` / `aria-pressed` for keyboard + screen-reader users (UX-002 continuation). 4 tests in `StagedFilters.test.tsx` + 9 tests in `StagedBulkToolbar.test.tsx` covering search/sort change events, search-count copy, select-all → bulk actions toggle, disconnected-eBay Push gating, bulkPushing disabled state, view-mode toggle wiring. `StagedListings.tsx` is now ~50 lines smaller and free of `LayoutGrid`/`List`/`Search`/`ChevronDown` imports. |
| FE-001d | Done | Claude | 2026-05-27 | Extracted the per-listing render functions and the dependencies they pulled in: `staged/CompsPanel.tsx` (active-eBay-prices subtree, `aria-label` on close), `staged/StagedListingActions.tsx` (full action button row with `healthBadge` accepted as a ReactNode prop so parent can keep the bespoke trigger styling), `staged/StagedListingCard.tsx` (grid card — checkbox is `role=checkbox` + Space/Enter keyboard, image overlays, sellerNotes pill, slots for `actions` + `compsPanel`), `staged/StagedListingListRow.tsx` (list row — same composition + thumbnail-only lightbox). All four are stateless; the parent supplies callbacks. **StagedListings.tsx is now 941 lines** (down from 1175 at the start of FE-001a). The local `HealthBadge` + `ActionButtons` adapter remain because they bridge closure state (`expandedHealthId`, `pushingId`, `compsId`, etc.) into the extracted components. Added 6 + 8 + 11 + 8 = **33 new tests**. |
| FE-001f | Done | Claude | 2026-05-27 | Extracted the Push-to-eBay confirmation modal to `staged/PushToEbayModal.tsx` (290 lines). Owned state still lives in StagedListings (`pushModal`, `pushExtraSpecifics`); the modal patches it via a single `onChange(patch)` handler so the parent doesn't have to thread setters per field. Modal carries `role=dialog` + `aria-modal` + `aria-label`, every input has an `aria-label`, and `useEscapeKey` dismisses on Escape (UX-002 continuation). `PushModalState` type lives in the modal file and is re-aliased in the parent. 14 tests in `PushToEbayModal.test.tsx` covering: dialog render, loading-state form hiding, default 9-condition list vs category-restricted list + helper copy, condition select onChange patch, shipping policy gating, schedule toggle, Best Offer threshold hiding, missing-Type warning (and the two ways to dismiss it), add-field button, Escape dismiss, backdrop vs panel click. **StagedListings.tsx now 760 lines** (down from 941 → 1175 cumulative reduction is 35%). **FE-001 complete.** |
| FE-002 | Done | Codex | 2026-05-27 | Audited the FE-001 handoff first: frontend build passed and Vitest passed once the Windows sandbox `spawn EPERM` was rerun with approval. Moved generic listing helpers/components (`computeHealthScore`, `autoConditionId`, `timeAgo`, `HealthBadge`, `HealthIssuesPopover`, `CompsPanel`) to `src/components/listings/shared/` with compatibility re-exports left under `staged/`. Extracted `ListedProducts.tsx` into `src/components/listed/`: status/tag filters, toolbar, bulk toolbar, grid card, list row, profit badge, mark-sold modal, end-listing confirm, delist/relist confirm, optimize modal, and listed helper functions. `ListedProducts.tsx` is now 543 lines. It consumes `useListFilterSort` and shared health helpers; added `src/components/listed/helpers.test.ts`. Frontend build is clean; Vitest is 103 passing across 13 files. |
| FE-003 | Done | Claude | 2026-05-27 | Split `ListingOptimizer.tsx` (1099 → **381 lines**, a 65% reduction) into `src/components/optimizer/`: `helpers.ts` (`extractItemId`, `gradeColor`, `scoreBarColor`, `formatOptimizerDate`, `compMedian`), `types.ts` (`FetchedListing`, `SoldComp`, `AISuggestions`, `SpecificRow`), `ScoreCard.tsx` (per-category card with keyboard-accessible expand toggle), `AiSuggestionBox.tsx` (the Accept/Reject AI-suggestion strip with `aria-label`/`aria-expanded` polish), `OptimizerPushDiffModal.tsx` (Confirm-changes modal — uses `useEscapeKey`, backdrop-click dismiss when not pushing, `role=dialog` + `aria-modal`), `OverallScore.tsx` (circular grade badge with `compact` mode for the edit-phase sidebar), `ScoreGrid.tsx` (3-column ScoreCard grid), `OptimizerInputCard.tsx` (the initial paste-URL view with `aria-label` on the URL input), `OptimizerListingHeader.tsx` (analyze-phase header — title/category/price/SKU + ext-link + stats strip), `SoldCompsPanel.tsx` (right-column comps with median card and capped row count), `SeoAnalysisPanel.tsx` (titleSeo + AI seoIssues/keywords merged into one panel), `OptimizerEditForm.tsx` (the full edit-phase right column — title/price/description/specifics with the recommended-price chip and tab-controlled HTML/Preview toggle, stateless). The parent now owns the phase state machine, the AI accept/reject state, and the live re-score memo. Also exported `computePushDiff` from `OptimizerPushDiffModal.tsx` so the diff rules can be tested without going through the DOM. Added **67 new Vitest tests** (helpers: 16, ScoreCard: 7, AiSuggestionBox: 7, OptimizerPushDiffModal: 14 incl. 7 `computePushDiff` rules, OptimizerInputCard: 9, OverallScore: 4, SoldCompsPanel: 5, SeoAnalysisPanel: 5). Frontend tests now **170 passing across 21 files**; server tests unchanged at 188 passing; `npm run build` clean. **Phase 1 frontend split is complete** — all three target screens (Staged 760, Listed 543, Optimizer 381) are below the 400-line budget envisioned by the plan. |
| MOB-001a | Done | Claude | 2026-05-27 | **Responsive shell, first slice.** Added `src/hooks/useMediaQuery.ts` (`useMediaQuery`, `useIsMobile`, `BREAKPOINT_MOBILE_MAX = '(max-width: 767px)'`) with 5 Vitest cases covering initial match, missing `matchMedia`, change-event updates, unmount cleanup, and the `useIsMobile` binding. Added a `MOB-001a responsive shell` block to `src/index.css`: `.mobile-hidden` / `.desktop-hidden` helpers, `.app-sidebar` (sticky on desktop, fixed/translated-off-screen drawer on mobile via `.is-open`), `.app-sidebar-backdrop` (visible behind the open drawer, taps to dismiss), `.app-hamburger` (mobile-only Menu button), `.app-main` (collapses its horizontal padding to `var(--space-3)` below 768px), and `.new-listing-grid` (replaces the inline `minmax(400px, 1fr) minmax(600px, 1.8fr)` that the plan flagged — now a `minmax(0, 1fr) minmax(0, 1.8fr)` grid with `has-results` modifier that collapses to one column at <1024px). Rewired `src/App.tsx`: dropped the inline `aside` style object, switched it to `className="app-sidebar"` with a `--sidebar-width` CSS var driving the desktop collapse animation, added a `mobileSidebarOpen` state + `useIsMobile()`-driven auto-close on viewport grow + tab switch, added a `switchTab()` helper that closes the drawer on tab change, hid the desktop collapse-toggle on mobile, added an `X` close button in the mobile drawer header, added the hamburger to the topbar (mobile-only via `.app-hamburger`) with `aria-expanded`, and added the backdrop element. The collapse toggle and `sidebarCollapsed` localStorage preference are preserved on desktop. **Broader MOB-001 still open**: ResultsEditor single-column polish, staged/listed/sold card touch sizing, sticky modal action bars, PWA shell — left for follow-up slices. Frontend tests **175 passing across 22 files** (was 170 + 5 new); build clean. |
| MOB-001b | Done | Claude | 2026-05-27 | **Uploader + ResultsEditor mobile polish.** Added three opt-in CSS helpers to `src/index.css`: `.responsive-panel-padding` (2rem → `var(--space-4)` at <768px), `.action-row-stack` (horizontal row → reversed-column stack with full-width buttons and primary action on top at <768px), and `.inline-row-wrap` (flex-wrap row where the input keeps a `flex: 1 1 220px` baseline and the trailing button wraps below when there isn't room). Wired into `src/components/Uploader.tsx`: panel `padding: '2rem'` → `responsive-panel-padding` class, the barcode-lookup row's inline `display: flex` → `.inline-row-wrap` (drops the `flex: 1` style on the input — the class handles it). Wired into `src/components/ResultsEditor.tsx`: same panel-padding swap, and the bottom Discard/Save row → `.action-row-stack` so on a 360px screen the primary "Save & Stage" stays above the fold. **Deliberately skipped** `capture="environment"` on the Uploader file input — it would force camera-only on iOS/Android and regress the gallery-first flow; camera-first capture belongs with SCOUT-001 (Phase 5 Sourcing Scout). Frontend tests **175 passing**; build clean. |
| MOB-001d | Done | Claude | 2026-05-27 | **Sticky modal action bars.** Added `.modal-sticky-actions` to `src/index.css` — `position: sticky; bottom: 0` with a solid `--bg-secondary` background, a 1px top box-shadow border, `var(--space-3)` vertical padding, and an extra `var(--space-4)` bottom padding on phones to clear thumb-reach. Applied to three modals whose action row was previously the last child of a single scrolling panel: `src/components/staged/PushToEbayModal.tsx` (Cancel + Push to eBay), `src/components/optimizer/OptimizerPushDiffModal.tsx` (Cancel + Confirm & Push), `src/components/listed/OptimizeListingModal.tsx` (Save Only / Save+Revise / Save+Delist&Relist — kept the existing `flexWrap: wrap`). **Did NOT touch** the modals that already use the header/scrollable-body/footer flex-column pattern (`EditListingModal`, `ImportModal`) — their footer is already pinned via `flexShrink: 0`. **Did NOT touch** the small modals that fit on one screen (`MarkSoldModal`, `ConfirmDialog`). Frontend tests **175 passing**; build clean (CSS +0.29KB gzipped). |
| MOB-001c | Done | Claude | 2026-05-27 | **Summary-tiles responsive collapse.** Added `.summary-tiles-row` to `src/index.css` — `grid-template-columns: repeat(3, minmax(0, 1fr))` on desktop, `repeat(2, ...)` below 768px, single column below 480px. Wired into `src/components/SoldListings.tsx` (Items Sold / Total Revenue / Net Profit summary tiles — previously `repeat(3, 1fr)` which crushed each tile to ~100px wide on a 360px phone) and `src/components/optimizer/ScoreGrid.tsx` (the 3-up category score cards — same rigid `repeat(3, 1fr)` problem). The other `repeat(3, ...)` instance in `src/components/Analytics.tsx:395` is `repeat(3, auto) 1fr` — content-sized columns, so it doesn't need this treatment. **The grid + list card layouts in `StagedListings.tsx`, `ListedProducts.tsx`, and the body of `SoldListings.tsx` are already `repeat(auto-fill, minmax(320–350px, 1fr))` and collapse to one column automatically below ~350px.** **Audited and confirmed mobile-safe (no change needed)**: `StagedFilters` (`flexWrap: 'wrap'`, search has `flex: 1, minWidth: 200px`), `StagedBulkToolbar` (`flexWrap: 'wrap'` on both outer rows). Frontend tests **175 passing**; build clean. |
| MOB-001e | Done | Claude | 2026-05-27 | **BulkUploader mobile audit.** Replaced the two `padding: '2rem'` panel wrappers in `src/components/BulkUploader.tsx` (the upload dropzone wrapper at line 290 and the empty-state at line 442) with the `.responsive-panel-padding` class from MOB-001b. **No changes needed elsewhere in the file**: the header row (`flexWrap: 'wrap'`), the ungrouped action buttons row, the listing-groups header row, and the action buttons (Generate all + Stage all) all already use `flexWrap: 'wrap'`. The 100x100 ungrouped tiles are touch-friendly. The header panel's `padding: '1.5rem 2rem'` was left as-is — at 32px horizontal padding inside a wrapper that already collapses to 12px gutters via `.app-main` on mobile, the readable inner width is still ~272px on a 360px viewport. **Phase 3 MOB-001 is now complete except for the PWA shell**, which the plan explicitly says should not be started until the broader responsive layout is stable. Frontend tests **175 passing**; build clean. |

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

**Implementation status:** `SEC-004` is complete as an in-process limiter v1. `SEC-005` is complete for per-company daily AI token quotas. If ListingStager runs multiple server instances, replace or back this limiter with a shared store such as Redis.

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

**Implementation status:** `QA-001` complete using Node's built-in `node:test` runner. `QA-003` covers the item-specifics XML builder. `QA-002` covers debug-endpoint authorization (unit + integration). `QA-004` covers condition fallback selection (unit + Comics-category integration). Vitest/Supertest can still be added later for broader route-level coverage.

Tasks:

- Add a server test runner. Current implementation uses Node's built-in `node:test`; Vitest/Supertest can still be added later for route-level tests.
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

#### P3.2b Image editing on listed items (IMG-003)

**Status:** open. Current `EditListingModal` only edits title, price, condition, description, item specifics, SKU, quantity, and seller notes — no image management. The `POST /api/ebay/revise` endpoint mirrors that gap: it accepts `newPrice / newTitle / description / conditionId / itemSpecifics / quantity` but **not** images, so even if the frontend collected new images there's nowhere to send them. Sellers who want to swap a photo on a live listing have to delist-and-relist today.

Tasks:

- Extend `src/components/EditListingModal.tsx` with an image-management surface:
  - Show the current image list (local DB copy that came from the initial push or the last `refresh-images/:id` sync) with drag-to-reorder.
  - Add (file picker), remove (X overlay), and replace (existing Crop / Rotate / Straighten / Scissors buttons from the Uploader) per thumbnail. Reuse the helpers under `src/utils/imageRotate.ts`, `src/utils/imageCrop.ts`, `src/utils/imageStraighten.ts`.
  - Surface an "Images modified" badge in the modal footer so the seller knows their next save will push image changes.
- Extend `POST /api/ebay/revise` in `server/routes/ebay/lifecycle.js` to accept an optional `images` field (an array of URLs or `data:` URIs, same shape as the initial push):
  - If `images` is present and non-empty, run them through `uploadImagesToEps()` (already in `server/services/ebay/listingLifecycle.js`) before building the revise XML.
  - Inject `<PictureDetails><PictureURL>…</PictureURL>…</PictureDetails>` into the `ReviseFixedPriceItemRequest` body via the existing `buildPictureDetailsXml()` helper.
  - Be aware: eBay's `ReviseFixedPriceItem` treats `<PictureDetails>` as a full replacement. Document the full-replacement behavior in the modal's save-flow copy so sellers don't lose images by accident.
  - Skip the EPS upload step for URLs that are already `https://i.ebayimg.com/...` (already on EPS — no need to re-upload).
- Update the local DB `images` field after a successful revise so the modal next-open shows the new state without needing a `refresh-images` round-trip.
- Add tests:
  - Service test: revise with an `images` field calls `uploadImagesToEps` and emits the `<PictureDetails>` block. Revise without `images` does not emit a `<PictureDetails>` block (keeps the live photos untouched).
  - Frontend test: the new image-edit row in `EditListingModal` adds / removes / reorders images and dirties the modal so Save targets the new payload.

Acceptance criteria:

- A seller can open the edit modal on a listed item, add a new photo, remove an existing one, reorder, and click Save — the new image set appears on the live eBay listing.
- Reordering without adding/removing still sends the image array (since eBay treats it as a full replacement and order matters for the main image).
- The revise call does NOT touch images when the seller didn't change them — both as an optimization and to avoid the (small) risk of a re-upload changing image quality.
- Errors from `uploadImagesToEps` (per-image rejections from eBay EPS) surface back to the modal with a clear "image #N rejected: <reason>" message so the seller knows which file to fix.

Reference implementations to study:
- `server/services/ebay/listingLifecycle.js` — `pushListingToEbay` already does this for new listings.
- `server/routes/ebay/lifecycle.js` — `POST /relist` already does this end-to-end for the delist-and-relist flow.

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
| QA-004 | P0 | QA/eBay | Add condition fallback selection tests | QA-001 |
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
| IMG-003 | P3 | Frontend/Backend | Edit/add/remove images on listed items + push image changes to eBay | IMG-001 |
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

**Phase 0 ✓, Phase 1 backend ✓, Phase 2 ✓, Phase 1 frontend ✓, MOB-001 (a/b/c/d/e) ✓, FE-004 follow-through ✓, INV-002 lite ✓, UX-002 focus-trap ✓, UX-002 lightbox a11y ✓, IMG-001 lite ✓, IMG-002 lite ✓, FE-003 test backfill ✓, IMG-001 crop ✓, IMG-001 aspect-ratio presets ✓, Quota middleware test backfill ✓, IMG-001 straighten ✓, IMG-003 slice 1 ✓.** Server tests: **204 passing**. Frontend tests: **288 passing across 33 files** (Vitest + happy-dom + testing-library). All three large screens remain below the 400-line plan budget: `StagedListings.tsx` **760**, `ListedProducts.tsx` **543**, `ListingOptimizer.tsx` **381**. On phones: sidebar is a hamburger-triggered drawer; the New-Listing grid no longer breaks; Uploader/ResultsEditor are touch-friendly; the SoldListings/Optimizer 3-up tiles collapse to 2 then 1 column; Push-to-eBay/Optimizer push diff/Listed-tab Optimize modals keep their action row stuck to the bottom; the BulkUploader's panel paddings collapse on phones. Sellers see an inline warning when typing a SKU that's already used by another active listing. Five modals + the image lightbox trap Tab inside and restore focus on close. Uploader thumbnails have a rotate-90° button next to remove-background, and the BulkUploader flags likely-duplicate photos via perceptual hash.

**Remaining Phase 1 frontend** — none. All three target screens have been split.

**Phase 1 frontend follow-through (optional, per-PR as components are touched):**

- **FE-004 follow-through** — `useListFilterSort` is consumed by both Staged and Listed. Consider extending to Sold and Optimizer when their next feature work demands list/filter/sort logic; the Optimizer is single-listing today and would not benefit.
- **UI-001 follow-through** — adopt `.list-row` / `.modal-backdrop` / `.modal-card` / `.tabs-strip` / `.filter-bar` / `.empty-state` / `.metric-cell` / `.badge` / `.btn-danger` as each subcomponent ships. Do it per-PR, not bundled with structural extraction.

**Next phases:**

- **Phase 3** — Seller workflow upgrades (mobile/PWA shell, Image Studio v1, inventory/SKU truth, monitored repricing, offer management, pick-pack discovery). See Section 4.
- **Phase 4** — Listing Intelligence (experiment + outcome schema, optimizer impact panel, listing autopsy, category insight engine). The AI-002 telemetry rows shipped this turn are the upstream input for Phase 4's outcome attribution.
- **Phase 5** — Strategic growth (Sourcing Scout, cross-platform mirror, buyer-question auto-draft, storefront benchmarking, auto-bundle).
- Schedule the 60-minute eBay API discovery session (OFFER-001, FULFILL-001).
- Schedule the 45-minute Listing Intelligence data-modeling session (INTEL-001).

**Phase 1 frontend is complete.** All three target screens have been split into focused subcomponents under `src/components/staged/`, `src/components/listed/`, and `src/components/optimizer/`. Future feature work can touch the subcomponents directly without scanning the large parent screens; the parents are now thin orchestrators that own state and delegate rendering.

### Recommended sequencing for the next session(s):

1. **IMG-001 finish (straighten + auto-enhance + aspect-ratio presets + unified Image Studio modal)** — Phase 3 Image Studio v1. Rotate/crop/duplicate-detection all shipped; straighten (free-angle rotation by ±15°) is the next biggest user-visible win. Auto-enhance can come later — it's a polish feature.
2. **INV-001 + full INV-002** — Phase 3 inventory/SKU truth. Adds the underlying inventory-item schema plus warn-on-push, merge-duplicate-records, and quantity-aware-rules.
3. **PWA shell** — optional polish on top of the now-stable responsive layout.
4. **UI-001 follow-through** — As each subcomponent is touched, replace inline style objects with the shared classes (`.list-row`, `.modal-backdrop`, `.modal-card`, `.tabs-strip`, `.filter-bar`, `.empty-state`, `.metric-cell`, `.badge`, `.btn-danger`).
5. **OFFER-001 / FULFILL-001 discovery sessions** — research-only tickets that unblock OFFER-002 and the pick-pack workflow.
6. **INTEL-001 (listing experiment schema)** — Phase 4 kickoff once a 45-minute data-modeling session is scheduled.

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
