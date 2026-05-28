import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DuplicateSkuWarning from './DuplicateSkuWarning';
import type { StagedListing } from '../types';

function listing(overrides: Partial<StagedListing> = {}): StagedListing {
  return {
    id: 'l1', title: 'Existing SKU holder', description: '', condition: 'Used',
    itemSpecifics: {}, category: 'Cameras', priceRecommendation: '10',
    shippingEstimate: '', images: [], createdAt: 0, status: 'staged',
    ...overrides,
  };
}

describe('DuplicateSkuWarning', () => {
  it('renders nothing when there are no conflicts', () => {
    const { container } = render(<DuplicateSkuWarning conflicts={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the singular copy and title for a single conflict', () => {
    render(<DuplicateSkuWarning conflicts={[listing({ title: 'Vintage Camera' })]} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('This SKU is already used by another active listing.')).toBeInTheDocument();
    expect(screen.getByText('Vintage Camera')).toBeInTheDocument();
  });

  it('renders the plural copy and the multi-title preview for several conflicts', () => {
    const items = [
      listing({ id: 'a', title: 'A' }),
      listing({ id: 'b', title: 'B' }),
      listing({ id: 'c', title: 'C' }),
    ];
    render(<DuplicateSkuWarning conflicts={items} />);
    expect(screen.getByText('This SKU is already used by 3 active listings.')).toBeInTheDocument();
    // First 2 titles + (+1 more)
    expect(screen.getByText(/A · B \(\+1 more\)/)).toBeInTheDocument();
  });
});
