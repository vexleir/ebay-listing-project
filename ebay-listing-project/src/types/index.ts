export interface StagedListing {
  id: string;
  title: string;
  description: string;
  condition: string;
  itemSpecifics: Record<string, string>;
  category: string;
  categoryId?: string;
  priceRecommendation: string;
  shippingEstimate: string;
  images: string[]; // base64 or object URLs
  createdAt: number;
  priceJustification?: string;
  sku?: string;
  sellerNotes?: string;
  quantity?: number; // defaults to 1 on push
  ebayDraftId?: string;
  archived?: boolean;
  status?: 'staged' | 'listed';
  updatedAt?: number;
  costBasis?: string;
  tags?: string[];
  soldAt?: number;
  soldPrice?: string;
  shippingLabelCost?: string;
  seoKeywords?: string;
  // Container assignment (links listing to a physical storage container)
  containerId?: string;
  containerName?: string;
  // Package dimensions (used by eBay for calculated shipping / shipping rate calcs).
  // Strings so empty inputs round-trip cleanly through the form.
  packageLength?: string;
  packageWidth?: string;
  packageDepth?: string;
  packageWeightLbs?: string;
  packageWeightOz?: string;
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
  // Per-company daily AI token cap. Blank / undefined falls back to the
  // AI_DAILY_TOKEN_LIMIT env var (default 100000).
  aiDailyTokenLimit?: number;
  // When true, skip the daily-quota 429 check entirely. Sellers who pay
  // their own AI bills can turn the cap off; the per-call rate limits
  // still apply.
  aiQuotaDisabled?: boolean;
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

export type FeedbackStatus = 'not_started' | 'under_review' | 'pending' | 'implemented' | 'cancelled';

export interface FeedbackReply {
  id: string;
  message: string;
  authorId: string;
  authorName: string;
  isAdmin: boolean;
  createdAt: number;
}

export interface FeedbackPost {
  id: string;
  title: string;
  message: string;
  images: string[];
  status: FeedbackStatus;
  authorId: string;
  authorName: string;
  authorEmail: string;
  authorCompanyId?: string;
  replies: FeedbackReply[];
  createdAt: number;
  updatedAt?: number;
}
