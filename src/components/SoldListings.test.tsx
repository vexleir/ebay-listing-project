// P0.2 — tests for the sold-history lookback selector + manual sync control
// wired into the Sold tab.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SoldListings from './SoldListings';
import { ToastProvider } from '../context/ToastContext';
import type { StagedListing } from '../types';

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function soldListing(overrides: Partial<StagedListing> = {}): StagedListing {
  return {
    id: 'L1',
    title: 'Vintage Camera',
    description: '',
    condition: 'Used',
    itemSpecifics: {},
    category: 'Cameras',
    priceRecommendation: '50.00',
    shippingEstimate: '',
    images: [],
    createdAt: Date.now(),
    soldAt: Date.now(),
    soldPrice: '48.00',
    ...overrides,
  };
}

const noop = () => {};

describe('SoldListings lookback + sync controls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the sync control in the empty state when onSyncSold is provided', () => {
    renderWithToast(
      <SoldListings
        listings={[]}
        onDelete={noop}
        onUnmarkSold={noop}
        isEbayConnected
        lookbackDays={30}
        onLookbackChange={noop}
        onSyncSold={noop}
      />,
    );
    expect(screen.getByText('No Sold Items')).toBeInTheDocument();
    expect(screen.getByLabelText('Sold history lookback window')).toBeInTheDocument();
    expect(screen.getByText('Sync Sold')).toBeInTheDocument();
  });

  it('does NOT render the sync control when onSyncSold is omitted', () => {
    renderWithToast(<SoldListings listings={[]} onDelete={noop} onUnmarkSold={noop} />);
    expect(screen.queryByLabelText('Sold history lookback window')).toBeNull();
  });

  it('passes the selected lookback window to onSyncSold', () => {
    const onSync = vi.fn();
    renderWithToast(
      <SoldListings
        listings={[soldListing()]}
        onDelete={noop}
        onUnmarkSold={noop}
        isEbayConnected
        lookbackDays={90}
        onLookbackChange={noop}
        onSyncSold={onSync}
      />,
    );
    fireEvent.click(screen.getByText('Sync Sold'));
    expect(onSync).toHaveBeenCalledWith(90);
  });

  it('fires onLookbackChange when the window is changed', () => {
    const onChange = vi.fn();
    renderWithToast(
      <SoldListings
        listings={[soldListing()]}
        onDelete={noop}
        onUnmarkSold={noop}
        isEbayConnected
        lookbackDays={30}
        onLookbackChange={onChange}
        onSyncSold={noop}
      />,
    );
    fireEvent.change(screen.getByLabelText('Sold history lookback window'), { target: { value: '60' } });
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it('disables the sync button when eBay is not connected', () => {
    renderWithToast(
      <SoldListings
        listings={[soldListing()]}
        onDelete={noop}
        onUnmarkSold={noop}
        isEbayConnected={false}
        lookbackDays={30}
        onLookbackChange={noop}
        onSyncSold={noop}
      />,
    );
    expect((screen.getByText('Sync Sold').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
