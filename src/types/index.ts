export interface StagedListing {
  id: string;
  title: string;
  description: string;
  condition: string;
  itemSpecifics: Record<string, string>;
  category: string;
  priceRecommendation: string;
  shippingEstimate: string;
  images: string[]; // base64 or object URLs
  createdAt: number;
  priceJustification?: string;
  sku?: string;
  sellerNotes?: string;
  ebayDraftId?: string;
  archived?: boolean;
  status?: 'staged' | 'listed';
  updatedAt?: number;
  costBasis?: string;
  tags?: string[];
  soldAt?: number;
  soldPrice?: string;
  soldPlatform?: 'ebay' | 'shopify';
  shippingLabelCost?: string;
  // Shopify cross-listing
  shopifyProductId?: string;
  shopifyStatus?: 'listed' | 'unlisted';
  shopifyListedAt?: number;
  shopifyCollectionIds?: string[];
  seoKeywords?: string;
  collectionCodes?: string[];
}

export interface AppState {
  apiKey: string;
  ebayToken: string;
  activeTab: 'new' | 'staged' | 'listed';
  isSettingsOpen: boolean;
}

export interface UserSettings {
  storeName?: string;
  sellerZip?: string;
  sellerLocation?: string;
  geminiModel?: 'flash' | 'pro';
  descriptionHeader?: string;
  descriptionFooter?: string;
  defaultFulfillmentPolicyId?: string;
  defaultPaymentPolicyId?: string;
  defaultReturnPolicyId?: string;
  promotedListingPct?: number;
  autoShopifyCrosslist?: boolean;
}

export interface EbayPolicy {
  id: string;
  name: string;
}

export interface EbayPolicies {
  fulfillmentPolicies: EbayPolicy[];
  paymentPolicies: EbayPolicy[];
  returnPolicies: EbayPolicy[];
}

// ─── Shopify SEO Optimizer ─────────────────────────────────────────────────

export interface ShopifyProduct {
  id: string;                    // "gid://shopify/Product/123"
  title: string;
  descriptionHtml: string;
  seo: { title: string; description: string };
  tags: string[];
  productType: string;
  vendor: string;
  images: Array<{ url: string; altText: string | null }>;
  updatedAt: string;
}

export interface ShopifyProductPage {
  products: ShopifyProduct[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export type SEOFieldKey =
  | 'title'
  | 'descriptionHtml'
  | 'seoTitle'
  | 'seoDescription'
  | 'tags'
  | 'productType'
  | 'vendor';

export interface SEOFieldSuggestion {
  field: SEOFieldKey;
  before: string;
  after: string;
  rationale: string;
  accepted: boolean | null;  // null = pending
}

export interface SEOProductSuggestion {
  productId: string;
  productTitle: string;
  fields: SEOFieldSuggestion[];
}

export interface ShopifySEOScore {
  total: number;  // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: {
    titleLength: number;       // 0-25
    descriptionLength: number; // 0-25
    hasSeoTitle: number;       // 0-20
    hasSeoDescription: number; // 0-20
    tagCount: number;          // 0-10
  };
}
