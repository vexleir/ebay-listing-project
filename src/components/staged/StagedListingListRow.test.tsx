import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StagedListingListRow from './StagedListingListRow';
import type { StagedListing } from '../../types';

function makeListing(overrides: Partial<StagedListing> = {}): StagedListing {
  return {
    id: 'l1',
    title: 'Vintage Camera',
    description: '',
    priceRecommendation: '24.99',
    category: 'Cameras',
    categoryId: '11',
    condition: 'Used',
    images: [],
    itemSpecifics: {},
    shippingEstimate: '',
    status: 'staged',
    createdAt: new Date('2026-05-20T12:00:00Z').getTime(),
    updatedAt: new Date('2026-05-20T12:00:00Z').getTime(),
    ...overrides,
  };
}

function defaults(overrides: Record<string, unknown> = {}) {
  return {
    listing: makeListing(),
    isSelected: false,
    onToggleSelect: vi.fn(),
    onOpenLightbox: vi.fn(),
    actions: <button>action-slot</button>,
    compsPanel: null,
    ...overrides,
  };
}

describe('StagedListingListRow', () => {
  it('renders title, price, and a "—" placeholder when no images', () => {
    render(<StagedListingListRow {...defaults()} />);
    expect(screen.getByText('Vintage Camera')).toBeInTheDocument();
    expect(screen.getByText('$24.99')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the SKU pill only when listing.sku is set', () => {
    const { rerender } = render(<StagedListingListRow {...defaults()} />);
    expect(screen.queryByText('CAM-001')).toBeNull();
    rerender(<StagedListingListRow {...defaults({ listing: makeListing({ sku: 'CAM-001' }) })} />);
    expect(screen.getByText('CAM-001')).toBeInTheDocument();
  });

  it('renders the sellerNotes line only when present', () => {
    const { rerender } = render(<StagedListingListRow {...defaults()} />);
    expect(screen.queryByText(/📝/)).toBeNull();
    rerender(<StagedListingListRow {...defaults({ listing: makeListing({ sellerNotes: 'minor wear' }) })} />);
    expect(screen.getByText(/minor wear/)).toBeInTheDocument();
  });

  it('fires onToggleSelect from click and from Space/Enter keys', () => {
    const onToggleSelect = vi.fn();
    render(<StagedListingListRow {...defaults({ onToggleSelect })} />);
    const box = screen.getByRole('checkbox');
    fireEvent.click(box);
    fireEvent.keyDown(box, { key: ' ' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onToggleSelect).toHaveBeenCalledTimes(3);
    expect(onToggleSelect).toHaveBeenCalledWith('l1');
  });

  it('reflects selection via aria-checked and tints the row background when selected', () => {
    const { rerender } = render(<StagedListingListRow {...defaults({ isSelected: false })} />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
    rerender(<StagedListingListRow {...defaults({ isSelected: true })} />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    // Walk up from the checkbox to the row element that owns the background.
    const row = screen.getByRole('checkbox').parentElement as HTMLElement;
    // happy-dom normalizes "rgba(99,102,241,0.06)" → "rgba(99, 102, 241, 0.06)" with spaces.
    expect(row.getAttribute('style') || '').toMatch(/rgba\(99,\s*102,\s*241,\s*0\.06\)/);
  });

  it('opens lightbox at index 0 when the thumbnail is clicked (image present)', () => {
    const onOpenLightbox = vi.fn();
    const listing = makeListing({ images: ['https://a/1.jpg', 'https://a/2.jpg'] });
    const { container } = render(<StagedListingListRow {...defaults({ listing, onOpenLightbox })} />);
    const thumbWrapper = container.querySelector('img')!.parentElement!;
    fireEvent.click(thumbWrapper);
    expect(onOpenLightbox).toHaveBeenCalledWith(listing.images, 0);
  });

  it('does NOT open lightbox when the placeholder is clicked', () => {
    const onOpenLightbox = vi.fn();
    render(<StagedListingListRow {...defaults({ onOpenLightbox })} />);
    fireEvent.click(screen.getByText('—').parentElement!);
    expect(onOpenLightbox).not.toHaveBeenCalled();
  });

  it('renders the supplied actions and compsPanel nodes', () => {
    render(<StagedListingListRow {...defaults({ actions: <button>my-action</button>, compsPanel: <div data-testid="cp">comps</div> })} />);
    expect(screen.getByText('my-action')).toBeInTheDocument();
    expect(screen.getByTestId('cp')).toBeInTheDocument();
  });
});
