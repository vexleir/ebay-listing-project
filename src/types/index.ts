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
  sku?: string;
  sellerNotes?: string;
}

export interface AppState {
  apiKey: string;
  ebayToken: string;
  activeTab: 'new' | 'staged' | 'listed';
  isSettingsOpen: boolean;
}
