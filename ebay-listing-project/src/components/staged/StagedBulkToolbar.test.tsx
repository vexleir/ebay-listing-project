import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StagedBulkToolbar from './StagedBulkToolbar';

const noop = () => {};

function defaults(overrides: Record<string, unknown> = {}) {
  return {
    visibleCount: 10,
    totalCount: 10,
    search: '',
    selectedCount: 0,
    onSelectAll: noop,
    onClearSelection: noop,
    onBulkPush: noop,
    onBulkDelete: noop,
    viewMode: 'grid' as const,
    onViewModeChange: noop,
    ...overrides,
  };
}

describe('StagedBulkToolbar', () => {
  it('shows "X listings" when no search is active', () => {
    render(<StagedBulkToolbar {...defaults({ visibleCount: 5, totalCount: 5 })} />);
    expect(screen.getByText(/5 listings/)).toBeInTheDocument();
    expect(screen.queryByText(/matching/)).toBeNull();
  });

  it('shows "X of Y listings matching" when search is active', () => {
    render(<StagedBulkToolbar {...defaults({ visibleCount: 3, totalCount: 10, search: 'shoes' })} />);
    expect(screen.getByText(/3 of 10 listings/)).toBeInTheDocument();
    expect(screen.getByText(/matching "shoes"/)).toBeInTheDocument();
  });

  it('pluralizes correctly for 1 vs many listings', () => {
    const { rerender } = render(<StagedBulkToolbar {...defaults({ visibleCount: 1 })} />);
    expect(screen.getByText(/^1 listing$/)).toBeInTheDocument();
    rerender(<StagedBulkToolbar {...defaults({ visibleCount: 2 })} />);
    expect(screen.getByText(/^2 listings$/)).toBeInTheDocument();
  });

  it('shows "Select All" when nothing is selected and fires onSelectAll', () => {
    const onSelectAll = vi.fn();
    render(<StagedBulkToolbar {...defaults({ onSelectAll })} />);
    fireEvent.click(screen.getByText('Select All'));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('shows bulk actions when at least one item is selected', () => {
    const onBulkPush = vi.fn();
    const onBulkDelete = vi.fn();
    const onClearSelection = vi.fn();
    render(<StagedBulkToolbar {...defaults({ selectedCount: 3, onBulkPush, onBulkDelete, onClearSelection })} />);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Push 3 to eBay'));
    fireEvent.click(screen.getByText('Delete Selected'));
    fireEvent.click(screen.getByLabelText('Clear selection'));
    expect(onBulkPush).toHaveBeenCalledTimes(1);
    expect(onBulkDelete).toHaveBeenCalledTimes(1);
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('disables Push and fades opacity when eBay is disconnected', () => {
    render(<StagedBulkToolbar {...defaults({ selectedCount: 2, isEbayConnected: false })} />);
    const push = screen.getByText('Push 2 to eBay');
    expect(push).toHaveStyle({ opacity: '0.5' });
    expect(push).toHaveAttribute('title', 'Connect to eBay first');
  });

  it('disables Push while bulkPushing is true', () => {
    render(<StagedBulkToolbar {...defaults({ selectedCount: 2, bulkPushing: true })} />);
    expect(screen.getByText('Push 2 to eBay')).toBeDisabled();
  });

  it('reflects active view mode via aria-pressed on the grid/list buttons', () => {
    const { rerender } = render(<StagedBulkToolbar {...defaults({ viewMode: 'grid' })} />);
    expect(screen.getByLabelText('Grid view')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('List view')).toHaveAttribute('aria-pressed', 'false');
    rerender(<StagedBulkToolbar {...defaults({ viewMode: 'list' })} />);
    expect(screen.getByLabelText('Grid view')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('List view')).toHaveAttribute('aria-pressed', 'true');
  });

  it('fires onViewModeChange when toggling view modes', () => {
    const onViewModeChange = vi.fn();
    render(<StagedBulkToolbar {...defaults({ onViewModeChange })} />);
    fireEvent.click(screen.getByLabelText('List view'));
    expect(onViewModeChange).toHaveBeenLastCalledWith('list');
    fireEvent.click(screen.getByLabelText('Grid view'));
    expect(onViewModeChange).toHaveBeenLastCalledWith('grid');
  });
});
