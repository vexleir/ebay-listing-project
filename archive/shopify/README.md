# Shopify Integration (Archived)

This directory contains the Shopify cross-listing functionality that was removed from the active app to refocus on eBay only. The code is preserved here as a reference in case Shopify is ever re-enabled.

## What's here

```
archive/shopify/
  server/
    shopifyAuth.js          — OAuth + token management for Shopify Admin API
    shopify-routes.js       — All /api/shopify/* Express routes (extracted verbatim from server/index.js)
  src/
    components/
      ShopifySEOTab.tsx     — UI for the Shopify SEO optimizer
      CollectionSelector.tsx — Multi-select for Shopify collection codes
    utils/
      shopifySeoScore.ts    — SEO score computation
  SHOPIFY_INTEGRATION_PLAN.md  — Original 4-phase rollout plan
```

## What was removed from the active code

- All `/api/shopify/*` Express routes from `server/index.js`
- The Shopify webhook handler and OAuth callback (public routes)
- The `shopifyAuth` import and any references to it
- Frontend tabs: Shopify SEO sidebar button, settings panel section, push/delist buttons
- Type fields on listings: `shopifyProductId`, `shopifyStatus`, `shopifyListedAt`, `shopifyCollectionIds`, plus `soldPlatform` and the `autoShopifyCrosslist` setting
- Auto-delist-on-sell logic (when an eBay item sold, it would also unpublish from Shopify)

## What was preserved

- Existing DB documents are **not** modified — listings still have whatever Shopify fields they had. The active code just no longer reads/writes them.
- The `catalog_codes` feature stays in the active app (it's also used for AI eBay categorization), just without the Shopify framing in its description.

## To re-enable

1. Move files back to their original paths.
2. Restore the Shopify imports and routes in `server/index.js`.
3. Restore the type fields in `src/types/index.ts`.
4. Restore the UI in `App.tsx`, `SettingsPanel.tsx`, `ListedProducts.tsx`, etc.
5. Re-register the Shopify webhook in the Shopify Partner dashboard.
