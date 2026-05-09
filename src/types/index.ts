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
  collectionCodes?: string[];
  // Consignment
  isConsignment?: boolean;
  consignorId?: string;
  consignmentFeePct?: number; // Our commission % (0-100); consignor gets the remainder
  consignorPaidAt?: number;
  consignorPayoutAmount?: string; // Dollar amount paid out to consignor (computed at mark-paid time)
  // Inventory
  containerId?: string;
  // Package dimensions (used by eBay for calculated shipping / shipping rate calcs).
  // Strings so empty inputs round-trip cleanly through the form.
  packageLength?: string;
  packageWidth?: string;
  packageDepth?: string;
  packageWeightLbs?: string;
  packageWeightOz?: string;
}

export type ContainerType = 'bin' | 'box' | 'shelf' | 'drawer' | 'tote' | 'pallet' | 'other';

export interface ContainerLooseItem {
  id: string;
  label: string;
  notes?: string;
  createdAt: number;
}

export interface Container {
  id: string;
  name: string;
  type: ContainerType;
  location?: string;
  notes?: string;
  looseItems?: ContainerLooseItem[];
  archived?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface Consignor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  defaultSplitPct?: number; // Our default commission % for this consignor
  createdAt: number;
  updatedAt?: number;
}

export interface AppState {
  apiKey: string;
  ebayToken: string;
  activeTab: 'new' | 'staged' | 'listed' | 'consignment';
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
