import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SoldCompsPanel from './SoldCompsPanel';
import type { SoldComp } from './types';

function comp(overrides: Partial<SoldComp> = {}): SoldComp {
  return {
    title: 'Sample comp',
    price: 25,
    currency: 'USD',
    condition: 'Used',
    endDate: '2026-05-01T00:00:00.000Z',
    url: 'https://www.ebay.com/itm/1',
    image: '',
    ...overrides,
  };
}

describe('SoldCompsPanel', () => {
  it('shows the empty-state copy when comps is empty and not loading', () => {
    render(<SoldCompsPanel comps={[]} loading={false} />);
    expect(screen.getByText('No sold comps found.')).toBeInTheDocument();
  });

  it('does NOT show the empty-state copy while loading', () => {
    render(<SoldCompsPanel comps={[]} loading={true} />);
    expect(screen.queryByText('No sold comps found.')).toBeNull();
  });

  it('skips the Sold Median card when fewer than 3 comps', () => {
    render(<SoldCompsPanel comps={[comp({ price: 10 }), comp({ price: 20 })]} loading={false} />);
    expect(screen.queryByText('Sold Median Price')).toBeNull();
  });

  it('renders the Sold Median card when ≥3 comps with the correct median', () => {
    render(
      <SoldCompsPanel
        comps={[comp({ price: 10 }), comp({ price: 20 }), comp({ price: 30 }), comp({ price: 40 })]}
        loading={false}
      />,
    );
    expect(screen.getByText('Sold Median Price')).toBeInTheDocument();
    // Median of [10,20,30,40] = 25 — none of the comp rows render $25 so this
    // text uniquely identifies the median card.
    expect(screen.getByText(/^\$25\.00$/)).toBeInTheDocument();
    expect(screen.getByText('from 4 recent sales')).toBeInTheDocument();
  });

  it('caps the visible rows to maxToShow', () => {
    const comps = Array.from({ length: 12 }, (_, i) => comp({ title: `Comp ${i}`, price: i + 10 }));
    render(<SoldCompsPanel comps={comps} loading={false} maxToShow={3} />);
    expect(screen.getByText('Comp 0')).toBeInTheDocument();
    expect(screen.getByText('Comp 1')).toBeInTheDocument();
    expect(screen.getByText('Comp 2')).toBeInTheDocument();
    expect(screen.queryByText('Comp 3')).toBeNull();
  });
});
