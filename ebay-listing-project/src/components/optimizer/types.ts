// FE-003 — shared types for the optimizer subcomponents.

import type { CategorySpecific } from '../../utils/listingScore';

export interface FetchedListing {
  itemId: string;
  isOwner: boolean;
  sellerUserId: string;
  title: string;
  categoryId: string;
  categoryName: string;
  price: number;
  conditionId: string;
  conditionName: string;
  description: string;
  watchCount: number;
  hitCount: number;
  listingStatus: string;
  timeLeft: string;
  quantity: number;
  quantitySold: number;
  sku: string;
  shippingType: string;
  shippingServiceCost: string;
  itemSpecifics: Record<string, string>;
  images: string[];
  categorySpecifics: CategorySpecific[];
}

export interface SoldComp {
  title: string;
  price: number;
  currency: string;
  condition: string;
  endDate: string;
  url: string;
  image: string;
}

export interface AISuggestions {
  title: string;
  titleRationale: string;
  description: string;
  descriptionRationale: string;
  itemSpecifics: Record<string, string>;
  itemSpecificsRationale: string;
  priceRecommendation: string;
  priceRationale: string;
  seoKeywords: string[];
  seoIssues: string[];
  overallTips: string[];
}

export interface SpecificRow { name: string; value: string; }
