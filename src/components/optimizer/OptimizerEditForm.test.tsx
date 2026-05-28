import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OptimizerEditForm from './OptimizerEditForm';
import type { AISuggestions, FetchedListing, SpecificRow } from './types';

function makeListing(overrides: Partial<FetchedListing> = {}): FetchedListing {
  return {
    itemId: '123456789012',
    isOwner: true,
    sellerUserId: 'me',
    title: 'Old Title',
    categoryId: '11',
    categoryName: 'Cameras',
    price: 25,
    conditionId: '3000',
    conditionName: 'Used',
    description: '<p>HTML body</p>',
    watchCount: 0,
    hitCount: 0,
    listingStatus: 'Active',
    timeLeft: '',
    quantity: 1,
    quantitySold: 0,
    sku: '',
    shippingType: 'Calculated',
    shippingServiceCost: '0',
    itemSpecifics: { Brand: 'Acme' },
    images: [],
    categorySpecifics: [],
    ...overrides,
  };
}

function makeAi(overrides: Partial<AISuggestions> = {}): AISuggestions {
  return {
    title: 'AI New Title',
    titleRationale: 'Keyword-rich',
    description: '<p>AI body</p>',
    descriptionRationale: '',
    itemSpecifics: { Brand: 'Acme', Color: 'Black' },
    itemSpecificsRationale: '',
    priceRecommendation: '$29.99',
    priceRationale: 'Recent comp median',
    seoKeywords: [],
    seoIssues: [],
    overallTips: [],
    ...overrides,
  };
}

function defaults(overrides: Record<string, unknown> = {}) {
  return {
    listing: makeListing(),
    aiSuggestions: null as AISuggestions | null,
    editTitle: 'Old Title',
    onEditTitleChange: vi.fn(),
    acceptTitle: null,
    onAcceptAiTitle: vi.fn(),
    onRejectAiTitle: vi.fn(),
    editPrice: '25',
    onEditPriceChange: vi.fn(),
    editDescription: '<p>HTML body</p>',
    onEditDescriptionChange: vi.fn(),
    descView: 'html' as const,
    onDescViewChange: vi.fn(),
    acceptDesc: null,
    onAcceptAiDesc: vi.fn(),
    onRejectAiDesc: vi.fn(),
    editSpecifics: [{ name: 'Brand', value: 'Acme' }] as SpecificRow[],
    onUpdateSpecific: vi.fn(),
    onRemoveSpecific: vi.fn(),
    onAddSpecific: vi.fn(),
    acceptSpecifics: null,
    onAcceptAiSpecifics: vi.fn(),
    onRejectAiSpecifics: vi.fn(),
    aiLoading: false,
    onAiOptimize: vi.fn(),
    onReviewPush: vi.fn(),
    error: '',
    pushSuccess: false,
    ...overrides,
  };
}

describe('OptimizerEditForm', () => {
  it('renders the header copy when the user owns the listing', () => {
    render(<OptimizerEditForm {...defaults()} />);
    expect(screen.getByText('Edit & Optimize')).toBeInTheDocument();
    expect(screen.queryByText(/Read-only/)).toBeNull();
  });

  it('switches to the Preview header + read-only banner when isOwner is false', () => {
    render(<OptimizerEditForm {...defaults({ listing: makeListing({ isOwner: false }) })} />);
    expect(screen.getByText('Preview Optimizations')).toBeInTheDocument();
    expect(screen.getByText(/Read-only/)).toBeInTheDocument();
  });

  it('shows the current title length counter', () => {
    // 24 chars: "Something with 24 chars." — keep this literal so any future
    // edits notice the counter math.
    render(<OptimizerEditForm {...defaults({ editTitle: 'Something with 24 chars.' })} />);
    expect(screen.getByText('24/80')).toBeInTheDocument();
  });

  it('truncates input to 80 characters when typing', () => {
    const props = defaults();
    render(<OptimizerEditForm {...props} />);
    const input = screen.getByLabelText('Listing title') as HTMLInputElement;
    const long = 'A'.repeat(120);
    fireEvent.change(input, { target: { value: long } });
    expect(props.onEditTitleChange).toHaveBeenCalledWith('A'.repeat(80));
  });

  it('fires onAddSpecific when the + Add button is clicked', () => {
    const props = defaults();
    render(<OptimizerEditForm {...props} />);
    fireEvent.click(screen.getByText('+ Add'));
    expect(props.onAddSpecific).toHaveBeenCalledTimes(1);
  });

  it('toggles the description tab via onDescViewChange', () => {
    const props = defaults({ descView: 'html' });
    render(<OptimizerEditForm {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(props.onDescViewChange).toHaveBeenCalledWith('preview');
  });

  it('renders the AI-suggested price chip when AI suggestions are present', () => {
    render(<OptimizerEditForm {...defaults({ aiSuggestions: makeAi() })} />);
    expect(screen.getByText(/Suggested: \$29\.99/)).toBeInTheDocument();
    expect(screen.getByText(/Recent comp median/)).toBeInTheDocument();
  });

  it('applies the suggested price via onEditPriceChange when the chip is clicked', () => {
    const props = defaults({ aiSuggestions: makeAi() });
    render(<OptimizerEditForm {...props} />);
    fireEvent.click(screen.getByText(/Suggested: \$29\.99/).closest('button')!);
    expect(props.onEditPriceChange).toHaveBeenCalledWith('29.99');
  });

  it('marks the chip as "applied" when editPrice equals the suggestion', () => {
    render(<OptimizerEditForm {...defaults({ aiSuggestions: makeAi(), editPrice: '29.99' })} />);
    expect(screen.getByText(/Suggested price applied: \$29\.99/)).toBeInTheDocument();
  });

  it('fires onReviewPush when the Review & Push button is clicked', () => {
    const props = defaults();
    render(<OptimizerEditForm {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Review & Push to eBay/i }));
    expect(props.onReviewPush).toHaveBeenCalledTimes(1);
  });

  it('hides the Review & Push button when the user is not the owner', () => {
    render(<OptimizerEditForm {...defaults({ listing: makeListing({ isOwner: false }) })} />);
    expect(screen.queryByRole('button', { name: /Review & Push to eBay/i })).toBeNull();
  });

  it('shows the AI loading copy when aiLoading is true', () => {
    render(<OptimizerEditForm {...defaults({ aiLoading: true })} />);
    expect(screen.getByText(/Optimizing…/)).toBeInTheDocument();
  });

  it('shows the pushSuccess banner when pushSuccess is true', () => {
    render(<OptimizerEditForm {...defaults({ pushSuccess: true })} />);
    expect(screen.getByText(/Changes pushed to eBay successfully/)).toBeInTheDocument();
  });

  it('shows the error banner when error is set', () => {
    render(<OptimizerEditForm {...defaults({ error: 'eBay rejected the push' })} />);
    expect(screen.getByText('eBay rejected the push')).toBeInTheDocument();
  });

  it('fires onRemoveSpecific with the row index when ✕ is clicked', () => {
    const props = defaults();
    render(<OptimizerEditForm {...props} />);
    fireEvent.click(screen.getByLabelText('Remove item specific row 1'));
    expect(props.onRemoveSpecific).toHaveBeenCalledWith(0);
  });
});
