import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OptimizerListingHeader from './OptimizerListingHeader';
import type { FetchedListing } from './types';
import type { ListingScore } from '../../utils/listingScore';

function makeListing(overrides: Partial<FetchedListing> = {}): FetchedListing {
  return {
    itemId: '123456789012',
    isOwner: true,
    sellerUserId: 'me',
    title: 'Vintage Leica IIIf with 50mm Summitar Lens',
    categoryId: '11',
    categoryName: 'Cameras > Vintage',
    price: 249.95,
    conditionId: '4000',
    conditionName: 'Very Good',
    description: '',
    watchCount: 12,
    hitCount: 240,
    listingStatus: 'Active',
    timeLeft: '',
    quantity: 1,
    quantitySold: 0,
    sku: 'CAM-001',
    shippingType: 'Calculated',
    shippingServiceCost: '0',
    itemSpecifics: {},
    images: ['a.jpg', 'b.jpg'],
    categorySpecifics: [],
    ...overrides,
  };
}

function makeScore(overrides: Partial<ListingScore> = {}): ListingScore {
  return {
    total: 81,
    grade: 'A',
    categories: {
      titleSeo: { name: 'Title & SEO', score: 22, maxScore: 30, pct: 73, issues: [], tips: [] },
      itemSpecifics: { name: 'Item Specifics', score: 18, maxScore: 25, pct: 72, issues: [], tips: [] },
      images: { name: 'Images', score: 15, maxScore: 20, pct: 75, issues: [], tips: [] },
      description: { name: 'Description', score: 7, maxScore: 10, pct: 70, issues: [], tips: [] },
      pricing: { name: 'Pricing', score: 7, maxScore: 10, pct: 70, issues: [], tips: [] },
      shipping: { name: 'Shipping', score: 3, maxScore: 5, pct: 60, issues: [], tips: [] },
    },
    ...overrides,
  };
}

describe('OptimizerListingHeader', () => {
  it('renders the title, category, price, condition, and SKU', () => {
    render(
      <OptimizerListingHeader
        listing={makeListing()}
        score={makeScore()}
        pushSuccess={false}
        onNewAnalysis={() => {}}
      />,
    );
    expect(screen.getByText(/Vintage Leica IIIf/)).toBeInTheDocument();
    expect(screen.getByText('Cameras > Vintage')).toBeInTheDocument();
    expect(screen.getByText('$249.95')).toBeInTheDocument();
    expect(screen.getByText('Very Good')).toBeInTheDocument();
    expect(screen.getByText('SKU: CAM-001')).toBeInTheDocument();
  });

  it('renders the stats strip (watch, views, sold, status, image count)', () => {
    render(
      <OptimizerListingHeader
        listing={makeListing()}
        score={makeScore()}
        pushSuccess={false}
        onNewAnalysis={() => {}}
      />,
    );
    expect(screen.getByText('Watch Count')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(screen.getByText('240')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    // Images = 2
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows the "Not your listing" notice when isOwner is false', () => {
    render(
      <OptimizerListingHeader
        listing={makeListing({ isOwner: false })}
        score={makeScore()}
        pushSuccess={false}
        onNewAnalysis={() => {}}
      />,
    );
    expect(screen.getByText(/Not your listing/)).toBeInTheDocument();
  });

  it('renders the View-on-eBay link with the correct href', () => {
    render(
      <OptimizerListingHeader
        listing={makeListing()}
        score={makeScore()}
        pushSuccess={false}
        onNewAnalysis={() => {}}
      />,
    );
    const link = screen.getByRole('link', { name: /View on eBay/i });
    expect(link).toHaveAttribute('href', 'https://www.ebay.com/itm/123456789012');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('fires onNewAnalysis when the New Analysis button is clicked', () => {
    const onNewAnalysis = vi.fn();
    render(
      <OptimizerListingHeader
        listing={makeListing()}
        score={makeScore()}
        pushSuccess={false}
        onNewAnalysis={onNewAnalysis}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /New Analysis/i }));
    expect(onNewAnalysis).toHaveBeenCalledTimes(1);
  });

  it('omits the SKU pill when no SKU is set', () => {
    render(
      <OptimizerListingHeader
        listing={makeListing({ sku: '' })}
        score={makeScore()}
        pushSuccess={false}
        onNewAnalysis={() => {}}
      />,
    );
    expect(screen.queryByText(/SKU:/)).toBeNull();
  });

  it('omits the condition fragment when conditionName is empty', () => {
    render(
      <OptimizerListingHeader
        listing={makeListing({ conditionName: '' })}
        score={makeScore()}
        pushSuccess={false}
        onNewAnalysis={() => {}}
      />,
    );
    expect(screen.queryByText('Very Good')).toBeNull();
  });
});
