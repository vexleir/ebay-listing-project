import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OptimizerPushDiffModal, { computePushDiff } from './OptimizerPushDiffModal';
import type { FetchedListing, SpecificRow } from './types';

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
    description: '<p>Original HTML description with <b>tags</b>.</p>',
    watchCount: 0,
    hitCount: 0,
    listingStatus: 'Active',
    timeLeft: '',
    quantity: 1,
    quantitySold: 0,
    sku: '',
    shippingType: 'Calculated',
    shippingServiceCost: '0',
    itemSpecifics: { Brand: 'Acme', Model: 'X1' },
    images: [],
    categorySpecifics: [],
    ...overrides,
  };
}

const listing = makeListing();

describe('computePushDiff', () => {
  it('returns no changes when nothing differs', () => {
    const diff = computePushDiff(
      listing,
      listing.title,
      String(listing.price),
      listing.description,
      [{ name: 'Brand', value: 'Acme' }, { name: 'Model', value: 'X1' }],
    );
    expect(diff).toHaveLength(0);
  });

  it('detects a title-only change', () => {
    const diff = computePushDiff(
      listing,
      'New Title',
      String(listing.price),
      listing.description,
      [{ name: 'Brand', value: 'Acme' }, { name: 'Model', value: 'X1' }],
    );
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ field: 'Title', before: 'Old Title', after: 'New Title' });
  });

  it('detects a price-only change with the $-prefixed labels', () => {
    const diff = computePushDiff(
      listing, listing.title, '29.99', listing.description,
      [{ name: 'Brand', value: 'Acme' }, { name: 'Model', value: 'X1' }],
    );
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ field: 'Price', before: '$25', after: '$29.99' });
  });

  it('strips HTML from the description diff and truncates to 120 chars + ...', () => {
    const longDesc = '<p>' + 'A'.repeat(200) + '</p>';
    const diff = computePushDiff(listing, listing.title, String(listing.price), longDesc, [
      { name: 'Brand', value: 'Acme' }, { name: 'Model', value: 'X1' },
    ]);
    expect(diff).toHaveLength(1);
    expect(diff[0].field).toBe('Description');
    expect(diff[0].after).toMatch(/^A{120}\.\.\.$/);
    expect(diff[0].before).not.toMatch(/<p>/);
  });

  it('detects added specifics', () => {
    const diff = computePushDiff(
      listing, listing.title, String(listing.price), listing.description,
      [{ name: 'Brand', value: 'Acme' }, { name: 'Model', value: 'X1' }, { name: 'Color', value: 'Black' }],
    );
    expect(diff).toHaveLength(1);
    expect(diff[0].field).toBe('Item Specifics');
    expect(diff[0].after).toContain('Color: Black');
  });

  it('ignores empty-name or empty-value specifics in the comparison', () => {
    const specifics: SpecificRow[] = [
      { name: 'Brand', value: 'Acme' },
      { name: 'Model', value: 'X1' },
      { name: '', value: 'orphan' },
      { name: 'Empty', value: '' },
    ];
    const diff = computePushDiff(listing, listing.title, String(listing.price), listing.description, specifics);
    expect(diff).toHaveLength(0);
  });

  it('shows "(none)" when one side is empty', () => {
    const noSpecificsListing = makeListing({ itemSpecifics: {} });
    const diff = computePushDiff(noSpecificsListing, noSpecificsListing.title, String(noSpecificsListing.price), noSpecificsListing.description, [
      { name: 'Brand', value: 'Acme' },
    ]);
    expect(diff[0]).toMatchObject({ field: 'Item Specifics', before: '(none)' });
  });
});

describe('OptimizerPushDiffModal', () => {
  it('renders inside a portal with the right dialog label', () => {
    render(
      <OptimizerPushDiffModal
        listing={listing}
        editTitle="New Title"
        editPrice="25"
        editDescription={listing.description}
        editSpecifics={[{ name: 'Brand', value: 'Acme' }, { name: 'Model', value: 'X1' }]}
        onConfirm={() => {}}
        onClose={() => {}}
        pushing={false}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm Changes — Push to eBay')).toBeInTheDocument();
  });

  it('disables Confirm when no diff is detected', () => {
    render(
      <OptimizerPushDiffModal
        listing={listing}
        editTitle={listing.title}
        editPrice={String(listing.price)}
        editDescription={listing.description}
        editSpecifics={[{ name: 'Brand', value: 'Acme' }, { name: 'Model', value: 'X1' }]}
        onConfirm={() => {}}
        onClose={() => {}}
        pushing={false}
      />,
    );
    expect(screen.getByText('No changes detected.')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Push to eBay/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('fires onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <OptimizerPushDiffModal
        listing={listing}
        editTitle="New Title"
        editPrice="25"
        editDescription={listing.description}
        editSpecifics={[{ name: 'Brand', value: 'Acme' }, { name: 'Model', value: 'X1' }]}
        onConfirm={onConfirm}
        onClose={() => {}}
        pushing={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Push to eBay/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <OptimizerPushDiffModal
        listing={listing}
        editTitle="New Title"
        editPrice="25"
        editDescription={listing.description}
        editSpecifics={[{ name: 'Brand', value: 'Acme' }, { name: 'Model', value: 'X1' }]}
        onConfirm={() => {}}
        onClose={onClose}
        pushing={false}
      />,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT close on backdrop click while pushing', () => {
    const onClose = vi.fn();
    const { container } = render(
      <OptimizerPushDiffModal
        listing={listing}
        editTitle="New Title"
        editPrice="25"
        editDescription={listing.description}
        editSpecifics={[{ name: 'Brand', value: 'Acme' }, { name: 'Model', value: 'X1' }]}
        onConfirm={() => {}}
        onClose={onClose}
        pushing={true}
      />,
    );
    // The portal target is document.body, not `container`, so query through screen.
    const dialog = screen.getByRole('dialog');
    // backdrop is the parent
    const backdrop = dialog.parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    // appease unused-var lint for container
    void container;
  });

  it('closes on backdrop click when not pushing', () => {
    const onClose = vi.fn();
    render(
      <OptimizerPushDiffModal
        listing={listing}
        editTitle="New Title"
        editPrice="25"
        editDescription={listing.description}
        editSpecifics={[{ name: 'Brand', value: 'Acme' }, { name: 'Model', value: 'X1' }]}
        onConfirm={() => {}}
        onClose={onClose}
        pushing={false}
      />,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open on click inside the dialog (stopPropagation)', () => {
    const onClose = vi.fn();
    render(
      <OptimizerPushDiffModal
        listing={listing}
        editTitle="New Title"
        editPrice="25"
        editDescription={listing.description}
        editSpecifics={[{ name: 'Brand', value: 'Acme' }, { name: 'Model', value: 'X1' }]}
        onConfirm={() => {}}
        onClose={onClose}
        pushing={false}
      />,
    );
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
