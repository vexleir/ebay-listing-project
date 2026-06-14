import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StagedListingCard from './StagedListingCard';
import type { StagedListing } from '../../types';

function makeListing(overrides: Partial<StagedListing> = {}): StagedListing {
  return {
    id: 'l1',
    title: 'Vintage Camera with a really long title that should be clamped after two visual lines',
    description: '',
    priceRecommendation: '24.99',
    category: 'Cameras',
    categoryId: '11',
    condition: 'Used — works great',
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
    onEditImages: vi.fn(),
    onOpenLightbox: vi.fn(),
    actions: <button>action-slot</button>,
    compsPanel: null,
    ...overrides,
  };
}

describe('StagedListingCard', () => {
  it('renders title, condition, price, category, and the No-images placeholder when images is empty', () => {
    render(<StagedListingCard {...defaults()} />);
    expect(screen.getByText(/Vintage Camera/)).toBeInTheDocument();
    expect(screen.getByText('Used — works great')).toBeInTheDocument();
    expect(screen.getByText('$24.99')).toBeInTheDocument();
    expect(screen.getByText('Cameras')).toBeInTheDocument();
    expect(screen.getByText('No images')).toBeInTheDocument();
  });

  it('shows the SKU pill only when listing.sku is set', () => {
    const { rerender } = render(<StagedListingCard {...defaults()} />);
    expect(screen.queryByText(/^SKU:/)).toBeNull();
    rerender(<StagedListingCard {...defaults({ listing: makeListing({ sku: 'CAM-001' }) })} />);
    expect(screen.getByText('SKU: CAM-001')).toBeInTheDocument();
  });

  it('renders the sellerNotes block only when present', () => {
    const { rerender } = render(<StagedListingCard {...defaults()} />);
    expect(screen.queryByText(/📝/)).toBeNull();
    rerender(<StagedListingCard {...defaults({ listing: makeListing({ sellerNotes: 'box has dent' }) })} />);
    expect(screen.getByText(/box has dent/)).toBeInTheDocument();
  });

  it('shows "updated Xm ago" only when updatedAt differs from createdAt', () => {
    const t0 = Date.now();
    const { rerender } = render(<StagedListingCard {...defaults({ listing: makeListing({ createdAt: t0, updatedAt: t0 }) })} />);
    expect(screen.queryByText(/updated/)).toBeNull();
    rerender(<StagedListingCard {...defaults({ listing: makeListing({ createdAt: t0 - 86400000, updatedAt: t0 - 60_000 }) })} />);
    expect(screen.getByText(/updated/)).toBeInTheDocument();
  });

  it('fires onToggleSelect with the listing id when the checkbox is clicked', () => {
    const onToggleSelect = vi.fn();
    render(<StagedListingCard {...defaults({ onToggleSelect })} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleSelect).toHaveBeenCalledWith('l1');
  });

  it('reflects selection via aria-checked and an accent outline when selected', () => {
    const { rerender, container } = render(<StagedListingCard {...defaults({ isSelected: false })} />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
    // Card root has no accent color in the inline style when unselected.
    expect((container.firstChild as HTMLElement).getAttribute('style') || '').not.toContain('var(--accent-color)');
    rerender(<StagedListingCard {...defaults({ isSelected: true })} />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    expect((container.firstChild as HTMLElement).getAttribute('style') || '').toContain('var(--accent-color)');
  });

  it('toggles selection via keyboard (Space + Enter)', () => {
    const onToggleSelect = vi.fn();
    render(<StagedListingCard {...defaults({ onToggleSelect })} />);
    const box = screen.getByRole('checkbox');
    fireEvent.keyDown(box, { key: ' ' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onToggleSelect).toHaveBeenCalledTimes(2);
  });

  it('fires onEditImages when the overlay Edit button is clicked', () => {
    const onEditImages = vi.fn();
    render(<StagedListingCard {...defaults({ onEditImages })} />);
    fireEvent.click(screen.getByLabelText('Edit or add images'));
    expect(onEditImages).toHaveBeenCalledWith('l1');
  });

  it('opens lightbox at index 0 when the main image is clicked', () => {
    const onOpenLightbox = vi.fn();
    const listing = makeListing({ images: ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg'] });
    const { container } = render(<StagedListingCard {...defaults({ listing, onOpenLightbox })} />);
    const mainImg = container.querySelector('img[alt="Main"]')!.parentElement!;
    fireEvent.click(mainImg);
    expect(onOpenLightbox).toHaveBeenCalledWith(listing.images, 0);
  });

  it('opens lightbox at the correct index when a thumbnail is clicked', () => {
    const onOpenLightbox = vi.fn();
    const listing = makeListing({ images: ['m', 't1', 't2'] });
    const { container } = render(<StagedListingCard {...defaults({ listing, onOpenLightbox })} />);
    const thumbs = container.querySelectorAll('img[alt^="Thumb"]');
    expect(thumbs.length).toBe(2);
    fireEvent.click((thumbs[1] as HTMLElement).parentElement!);
    expect(onOpenLightbox).toHaveBeenCalledWith(listing.images, 2);
  });

  it('renders the supplied actions and compsPanel nodes', () => {
    render(<StagedListingCard {...defaults({ actions: <button>my-action</button>, compsPanel: <div data-testid="cp">comps</div> })} />);
    expect(screen.getByText('my-action')).toBeInTheDocument();
    expect(screen.getByTestId('cp')).toBeInTheDocument();
  });
});
