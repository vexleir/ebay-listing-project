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
}

export interface AppState {
  apiKey: string;
  ebayToken: string;
  activeTab: 'new' | 'staged' | 'listed';
  isSettingsOpen: boolean;
}
