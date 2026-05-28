import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScoreGrid from './ScoreGrid';
import type { ListingScore } from '../../utils/listingScore';

function makeScore(overrides: Partial<ListingScore> = {}): ListingScore {
  return {
    total: 60,
    grade: 'C',
    categories: {
      titleSeo:      { name: 'Title & SEO',     score: 18, maxScore: 30, pct: 60, issues: ['short'], tips: [] },
      itemSpecifics: { name: 'Item Specifics',  score: 15, maxScore: 25, pct: 60, issues: [], tips: [] },
      images:        { name: 'Images',          score: 12, maxScore: 20, pct: 60, issues: [], tips: [] },
      description:   { name: 'Description',     score: 6,  maxScore: 10, pct: 60, issues: [], tips: [] },
      pricing:       { name: 'Pricing',         score: 6,  maxScore: 10, pct: 60, issues: [], tips: [] },
      shipping:      { name: 'Shipping',        score: 3,  maxScore: 5,  pct: 60, issues: [], tips: [] },
    },
    ...overrides,
  };
}

describe('ScoreGrid', () => {
  it('renders one ScoreCard per category', () => {
    render(<ScoreGrid score={makeScore()} expandedKey={null} onToggle={() => {}} />);
    expect(screen.getByText('Title & SEO')).toBeInTheDocument();
    expect(screen.getByText('Item Specifics')).toBeInTheDocument();
    expect(screen.getByText('Images')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Pricing')).toBeInTheDocument();
    expect(screen.getByText('Shipping')).toBeInTheDocument();
  });

  it('passes the per-category pct through to ScoreCard', () => {
    render(<ScoreGrid score={makeScore()} expandedKey={null} onToggle={() => {}} />);
    // Six categories, all at 60% — should render 60% six times.
    expect(screen.getAllByText('60%')).toHaveLength(6);
  });

  it('fires onToggle with the category key when the interactive card is clicked', () => {
    const onToggle = vi.fn();
    render(<ScoreGrid score={makeScore()} expandedKey={null} onToggle={onToggle} />);
    // Only titleSeo has issues → only that ScoreCard is interactive.
    const button = screen.getByRole('button', { name: /Title & SEO score 60%/i });
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith('titleSeo');
  });

  it('marks the expanded category as aria-expanded', () => {
    render(<ScoreGrid score={makeScore()} expandedKey="titleSeo" onToggle={() => {}} />);
    const expanded = screen.getByRole('button', { name: /Title & SEO score 60%/i });
    expect(expanded).toHaveAttribute('aria-expanded', 'true');
  });
});
