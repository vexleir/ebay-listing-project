# Shopify Integration Implementation Plan

**Created:** 2026-04-14  
**Goal:** Add Shopify as a second sales platform alongside eBay, with automatic cross-delist when an item sells on either platform.

---

## Architecture Overview

### Key Design Decisions
- **App type:** Shopify Custom App (single-store, no App Store listing) — tokens are long-lived, no refresh cycle
- **API:** GraphQL exclusively (REST is legacy as of 2025, 10x lower rate limits)
- **GraphQL endpoint:** `POST https://{store}.myshopify.com/admin/api/2026-01/graphql.json`
- **Auth header:** `X-Shopify-Access-Token: {token}` (stored per-company in MongoDB config collection)
- **Required scopes:** `write_products`, `read_products`, `write_inventory`, `read_inventory`, `read_orders`
- **Node package:** `@shopify/shopify-api`
- **Images:** Cloudinary URLs work directly — no re-upload to Shopify needed
- **Sold sync model:** eBay uses polling; Shopify uses push webhooks (`orders/create`)

### Data Model Changes (StagedListing)
```typescript
// Fields to ADD to src/types/index.ts
platforms?: ('ebay' | 'shopify')[];
shopifyProductId?: string;        // "gid://shopify/Product/123"
shopifyStatus?: 'listed' | 'unlisted' | 'draft';
shopifyListedAt?: number;
shopifySoldAt?: number;
shopifySoldPrice?: string;
```

### Config Collection (MongoDB) — New Fields Per Company
```
shopifyAccessToken: string
shopifyStoreDomain: string        // e.g. "my-store.myshopify.com"
shopifyLocationId: string         // fetched once on connect, stored for inventory calls
```

---

## Phase 1 — Foundation: Shopify Connection ✅ COMPLETE
**Goal:** Shopify connection works in Settings; no listing push yet. Zero risk to existing eBay functionality.

### Server
- [x] Create `server/shopifyAuth.js` (OAuth URL, code exchange, token storage, GraphQL helper, location ID fetch)
- [x] `GET /api/shopify/callback` — public OAuth redirect handler
- [x] `GET /api/shopify/auth-status` — returns `{ connected, shop, locationId }`
- [x] `GET /api/shopify/auth-url` — generates Shopify OAuth URL
- [x] `DELETE /api/shopify/tokens` — disconnect

### Frontend
- [x] `src/components/SettingsPanel.tsx` — Shopify Integration section with connect/disconnect UI
- [x] `src/App.tsx` — `isShopifyConnected` state, fetched on login/load, passed to SettingsPanel

**Notes:**
- No `@shopify/shopify-api` package needed — native fetch (Node 18+)
- OAuth app via Shopify Partners Dashboard (store admin custom apps deprecated Jan 2026)
- Redirect URL: `https://ebay-listing-project.onrender.com/api/shopify/callback`
- Env vars required in Render: `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`

**Deliverable:** Settings panel shows Shopify connected/disconnected. Ready to build Phase 2.

---

## Phase 2 — Push to Shopify ✅ COMPLETE
**Goal:** Can manually push any listed item to Shopify from the Listed tab.

### Type Changes
- [x] `src/types/index.ts` — added `shopifyProductId?`, `shopifyStatus?`, `shopifyListedAt?` to `StagedListing`

### Server
- [x] `POST /api/shopify/push` — `productCreate` → `productVariantUpdate` (price) → `inventorySetQuantities` (qty=1) → persists to MongoDB
- [x] `POST /api/shopify/delist/:listingId` — sets inventory to 0, updates `shopifyStatus: 'unlisted'`

### Frontend
- [x] `src/components/ListedProducts.tsx` — ShoppingBag icon button (push/delist toggle), "Shopify ✓" badge, spinner states, works in grid and list view
- [x] `src/App.tsx` — passes `isShopifyConnected` to ListedProducts

**Notes:** Price set via separate `productVariantUpdate` mutation. Images via Cloudinary URLs (no re-upload).

**Deliverable:** Can manually cross-list any listed item to Shopify.

---

## Phase 3 — Webhook & Automatic Cross-Delist
**Goal:** Selling on either platform automatically updates both. This is the core value of the integration.

### Server
- [ ] `POST /api/shopify/webhooks/orders` endpoint:
  - Verify HMAC signature (`X-Shopify-Hmac-Sha256` header)
  - Match `line_items[].product_id` to listing with matching `shopifyProductId`
  - Mark listing: `soldAt`, `soldPrice`, `shopifySoldAt`, `shopifySoldPrice`, `archived: true`
  - If listing has `ebayDraftId`: automatically call eBay `EndFixedPriceItem` to delist
  - Return 200 quickly (Shopify retries if response takes >5s)
- [ ] Register `orders/create` webhook on Shopify during the connect flow (Phase 1 `save-config` endpoint)
- [ ] Extend existing `handleSyncSold()` flow (eBay sold → Shopify delist):
  - After marking an eBay-sold item, if `shopifyProductId` exists, call `POST /api/shopify/delist/:id`

### Frontend
- [ ] Webhook health indicator in Settings — last received, any failures
- [ ] Sold listings show which platform originated the sale (eBay vs Shopify badge)

**Deliverable:** Full cross-platform sold sync. Selling on one platform automatically delists from the other.

---

## Phase 4 — Polish & Analytics
**Goal:** Production-ready, top-tier multi-platform experience.

### Platform Visibility
- [ ] Platform badges everywhere — eBay / Shopify / both / neither on all listing cards (staged, listed, sold)
- [ ] Per-listing audit trail — timestamped log of platform actions (pushed to eBay, sold on Shopify, etc.)

### Automation
- [ ] Settings: "Auto cross-list" toggle — when enabled, pushing to eBay auto-pushes to Shopify
- [ ] Retry UI — failed Shopify pushes show with retry button, don't silently fail
- [ ] Platform-specific pricing fields — allow different price per platform

### Analytics
- [ ] Analytics tab: revenue breakdown by platform (eBay vs Shopify)
- [ ] Fee calculator: eBay ~13% FVF vs Shopify 2.9% + $0.30 + subscription → net profit per platform
- [ ] Best platform predictor (by category/price range, based on historical sell-through)

### Shopify Order History
- [ ] Shopify orders tab (analogous to eBay Import tab) — pull Shopify order history to reconcile sold items

**Deliverable:** Full multi-platform dashboard with analytics, automation, and error resilience.

---

## Future Platforms (Architecture is Ready)
The platform-aware data model (`platforms[]`, per-platform ID fields, per-platform status) is designed to extend to additional marketplaces:
- Poshmark (API program)
- Mercari (API)
- Facebook Marketplace
- Amazon
- Whatnot (live auctions)

---

## Key API Reference

### GraphQL Endpoint
```
POST https://{store}.myshopify.com/admin/api/2026-01/graphql.json
X-Shopify-Access-Token: {token}
Content-Type: application/json
```

### Core Mutations
```graphql
# Create product
mutation productCreate($input: ProductCreateInput!) { ... }

# Set inventory to 1 (or 0 for sold out)
mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) { ... }

# Unpublish (reversible delist)
mutation publishableUnpublish($id: ID!) { ... }

# Delete permanently
mutation productDelete($input: ProductDeleteInput!) { ... }

# Register webhook
mutation webhookSubscriptionCreate($topic: String!, $callbackUrl: URL!) { ... }
```

### Order Webhook Payload Key Fields
```json
{
  "line_items": [
    {
      "product_id": 1111111,
      "variant_id": 2222222,
      "title": "Item title",
      "price": "99.99",
      "sku": "MY-SKU"
    }
  ],
  "total_price": "99.99",
  "created_at": "2026-04-14T12:00:00Z"
}
```

### Rate Limits (GraphQL)
- Standard plan: 100 points/second
- Each mutation: ~10–20 points
- Max query size: 1,000 points

---

## Progress Tracker

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 — Foundation | ✅ Complete | server/shopifyAuth.js + Settings UI |
| Phase 2 — Push to Shopify | ✅ Complete | ShoppingBag button in Listed tab |
| Phase 3 — Webhooks & Auto-Delist | ⬜ Not Started | Depends on Phase 2 |
| Phase 4 — Polish & Analytics | ⬜ Not Started | Depends on Phase 3 |
