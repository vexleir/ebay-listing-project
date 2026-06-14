import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InventoryItemBadge from './InventoryItemBadge';
import type { InventoryItem } from '../hooks/useInventorySkuLookup';

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'inv1',
    sku: 'abc-001',
    displayedSku: 'ABC-001',
    quantityOnHand: 3,
    quantityListed: 1,
    quantitySold: 2,
    costBasis: '5.00',
    sourceTag: '',
    sourceEvent: '',
    createdAt: '2026-05-29T00:00:00.000Z',
    updatedAt: '2026-05-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('InventoryItemBadge', () => {
  it('returns nothing when item is null and not loading', () => {
    const { container } = render(<InventoryItemBadge item={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "Checking inventory…" copy when loading=true and item=null', () => {
    render(<InventoryItemBadge item={null} loading />);
    expect(screen.getByRole('status', { name: 'Checking inventory' })).toBeInTheDocument();
    expect(screen.getByText(/Checking inventory/i)).toBeInTheDocument();
  });

  it('hides the loading state when hideLoading is true', () => {
    const { container } = render(<InventoryItemBadge item={null} loading hideLoading />);
    expect(container.firstChild).toBeNull();
  });

  it('renders displayedSku, on-hand, listed, sold when an item is supplied', () => {
    render(<InventoryItemBadge item={item()} />);
    expect(screen.getByText('ABC-001')).toBeInTheDocument();
    expect(screen.getByText(/3 on hand/)).toBeInTheDocument();
    expect(screen.getByText(/1 listed/)).toBeInTheDocument();
    expect(screen.getByText(/2 sold/)).toBeInTheDocument();
  });

  it('falls back to normalized sku when displayedSku is empty', () => {
    render(<InventoryItemBadge item={item({ displayedSku: '' })} />);
    expect(screen.getByText('abc-001')).toBeInTheDocument();
  });

  it('renders sourceTag only when set', () => {
    const { rerender } = render(<InventoryItemBadge item={item({ sourceTag: '' })} />);
    expect(screen.queryByText(/source:/)).toBeNull();
    rerender(<InventoryItemBadge item={item({ sourceTag: 'estate-sale-2026' })} />);
    expect(screen.getByText(/source:/)).toBeInTheDocument();
    expect(screen.getByText('estate-sale-2026')).toBeInTheDocument();
  });

  it('exposes a descriptive aria-label summarizing the counts', () => {
    render(<InventoryItemBadge item={item()} />);
    expect(screen.getByRole('status', {
      name: 'In inventory: 3 on hand, 1 listed, 2 sold',
    })).toBeInTheDocument();
  });
});
