import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OverallScore from './OverallScore';
import type { ListingScore } from '../../utils/listingScore';

function makeScore(overrides: Partial<ListingScore> = {}): ListingScore {
  return {
    total: 72,
    grade: 'B',
    categories: {
      titleSeo: { name: 'Title & SEO', score: 22, maxScore: 30, pct: 73, issues: [], tips: [] },
      itemSpecifics: { name: 'Item Specifics', score: 18, maxScore: 25, pct: 72, issues: [], tips: [] },
      images: { name: 'Images', score: 15, maxScore: 20, pct: 75, issues: [], tips: [] },
      description: { name: 'Description', score: 7, maxScore: 10, pct: 70, issues: [], tips: [] },
      pricing: { name: 'Pricing', score: 7, maxScore: 10, pct: 70, issues: [], tips: [] },
      shipping: { name: 'Shipping', score: 3, maxScore: 5, pct: 60, issues: [], tips: [] },
    },
    ...overrides,
  };
}

describe('OverallScore', () => {
  it('renders the total, /100, and the grade', () => {
    render(<OverallScore score={makeScore()} />);
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('/100')).toBeInTheDocument();
    expect(screen.getByText('Grade B')).toBeInTheDocument();
    expect(screen.getByText('Listing Health Score')).toBeInTheDocument();
  });

  it('does not show the "Pushed to eBay" pill by default', () => {
    render(<OverallScore score={makeScore()} />);
    expect(screen.queryByText('Pushed to eBay')).toBeNull();
  });

  it('shows the "Pushed to eBay" pill when pushSuccess is true', () => {
    render(<OverallScore score={makeScore()} pushSuccess />);
    expect(screen.getByText('Pushed to eBay')).toBeInTheDocument();
  });

  it('renders an accessible aria-label with the score and grade', () => {
    render(<OverallScore score={makeScore()} />);
    expect(screen.getByLabelText('Overall score 72 of 100, grade B')).toBeInTheDocument();
  });
});
