import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StagedListingActions from './StagedListingActions';
import type { StagedListing } from '../../types';

function makeListing(overrides: Partial<StagedListing> = {}): StagedListing {
  return {
    id: 'l1',
    title: 'Vintage Camera',
    description: '<p>Hi</p>',
    priceRecommendation: '24.99',
    category: 'Cameras',
    categoryId: '11',
    condition: 'Used',
    images: [],
    itemSpecifics: {},
    shippingEstimate: '',
    status: 'staged',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function defaults(overrides: Record<string, unknown> = {}) {
  const noop = vi.fn();
  return {
    listing: makeListing(),
    healthBadge: <span data-testid="health-badge">90</span>,
    isEbayConnected: true,
    isPushing: false,
    isCompsActive: false,
    isCopied: false,
    onPush: noop,
    onFetchComps: noop,
    onReanalyze: noop,
    onCopyHtml: noop,
    onEditImages: noop,
    onEdit: noop,
    onCrossPost: noop,
    onMoveToListed: noop,
    onDelete: noop,
    ...overrides,
  };
}

describe('StagedListingActions', () => {
  it('renders the provided healthBadge node', () => {
    render(<StagedListingActions {...defaults()} />);
    expect(screen.getByTestId('health-badge')).toBeInTheDocument();
  });

  it('renders the Push button with default label and fires onPush with the listing', () => {
    const onPush = vi.fn();
    const props = defaults({ onPush });
    render(<StagedListingActions {...props} />);
    const btn = screen.getByText('Push to eBay');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onPush).toHaveBeenCalledTimes(1);
    expect(onPush).toHaveBeenCalledWith(props.listing);
  });

  it('shows "Pushing..." and disables the Push button when isPushing=true', () => {
    render(<StagedListingActions {...defaults({ isPushing: true })} />);
    const btn = screen.getByText('Pushing...');
    expect(btn).toBeDisabled();
  });

  it('fades and re-titles the Push button when eBay is disconnected', () => {
    render(<StagedListingActions {...defaults({ isEbayConnected: false })} />);
    const btn = screen.getByText('Push to eBay');
    expect(btn).toHaveStyle({ opacity: '0.5' });
    expect(btn).toHaveAttribute('title', 'Connect to eBay first');
  });

  it('highlights the comps button via inline style when isCompsActive=true', () => {
    // happy-dom doesn't resolve CSS variables to computed values, so check
    // the raw inline style attribute instead of computedStyle.
    render(<StagedListingActions {...defaults({ isCompsActive: true })} />);
    const btn = screen.getByLabelText('Find market comps');
    expect(btn.getAttribute('style')).toContain('var(--success)');
  });

  it('does NOT inject the success-color style when isCompsActive=false', () => {
    render(<StagedListingActions {...defaults({ isCompsActive: false })} />);
    const btn = screen.getByLabelText('Find market comps');
    expect(btn.getAttribute('style') || '').not.toContain('var(--success)');
  });

  it('renders the Check icon (instead of Copy) when isCopied=true', () => {
    const { container } = render(<StagedListingActions {...defaults({ isCopied: true })} />);
    // Lucide gives every icon a class like `lucide-check` / `lucide-copy`.
    expect(container.querySelector('.lucide-check')).toBeTruthy();
    // Note: HealthBadge also uses Check internally — but we passed a plain
    // <span>, so the only check icon present is the Copy-success one.
  });

  it('wires every callback to the listing via lambda props', () => {
    const handlers = {
      onFetchComps: vi.fn(),
      onReanalyze: vi.fn(),
      onCopyHtml: vi.fn(),
      onEditImages: vi.fn(),
      onEdit: vi.fn(),
      onCrossPost: vi.fn(),
      onMoveToListed: vi.fn(),
      onDelete: vi.fn(),
    };
    render(<StagedListingActions {...defaults(handlers)} />);
    fireEvent.click(screen.getByLabelText('Find market comps'));
    fireEvent.click(screen.getByLabelText('Re-analyze with AI'));
    fireEvent.click(screen.getByLabelText('Copy HTML description'));
    fireEvent.click(screen.getByLabelText('Edit or add images'));
    fireEvent.click(screen.getByLabelText('Edit listing'));
    fireEvent.click(screen.getByLabelText('Cross-post to other platforms'));
    fireEvent.click(screen.getByLabelText('Mark as listed without pushing'));
    fireEvent.click(screen.getByLabelText('Delete listing'));
    for (const key of Object.keys(handlers) as (keyof typeof handlers)[]) {
      expect(handlers[key]).toHaveBeenCalledTimes(1);
    }
  });
});
