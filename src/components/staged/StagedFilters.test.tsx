import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StagedFilters from './StagedFilters';

describe('StagedFilters', () => {
  it('renders the search input with the provided value', () => {
    render(<StagedFilters search="foo" onSearchChange={() => {}} sortBy="date-desc" onSortChange={() => {}} />);
    const input = screen.getByLabelText('Search staged listings') as HTMLInputElement;
    expect(input.value).toBe('foo');
  });

  it('fires onSearchChange when the user types', () => {
    const onSearchChange = vi.fn();
    render(<StagedFilters search="" onSearchChange={onSearchChange} sortBy="date-desc" onSortChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search staged listings'), { target: { value: 'shoes' } });
    expect(onSearchChange).toHaveBeenCalledWith('shoes');
  });

  it('renders the sort select with all 6 options and the current value', () => {
    render(<StagedFilters search="" onSearchChange={() => {}} sortBy="price-asc" onSortChange={() => {}} />);
    const select = screen.getByLabelText('Sort staged listings') as HTMLSelectElement;
    expect(select.value).toBe('price-asc');
    expect(select.querySelectorAll('option').length).toBe(6);
  });

  it('fires onSortChange with the typed SortOption when changed', () => {
    const onSortChange = vi.fn();
    render(<StagedFilters search="" onSearchChange={() => {}} sortBy="date-desc" onSortChange={onSortChange} />);
    fireEvent.change(screen.getByLabelText('Sort staged listings'), { target: { value: 'health-asc' } });
    expect(onSortChange).toHaveBeenCalledWith('health-asc');
  });
});
