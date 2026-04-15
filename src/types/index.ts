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
