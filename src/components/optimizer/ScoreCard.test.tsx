import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScoreCard, { type ScoreCategory } from './ScoreCard';

function makeCategory(overrides: Partial<ScoreCategory> = {}): ScoreCategory {
  return {
    name: 'Title & SEO',
    pct: 75,
    score: 15,
    maxScore: 20,
    issues: [],
    tips: [],
    ...overrides,
  };
}

describe('ScoreCard', () => {
  it('renders the category name and percentage', () => {
    render(<ScoreCard catKey="titleSeo" cat={makeCategory()} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText('Title & SEO')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('is non-interactive when there is no feedback', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ScoreCard catKey="titleSeo" cat={makeCategory()} expanded={false} onToggle={onToggle} />,
    );
    // No role="button" because allFeedback is empty.
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.click(container.firstChild as Element);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('fires onToggle when clicked if there are issues', () => {
    const onToggle = vi.fn();
    render(
      <ScoreCard
        catKey="titleSeo"
        cat={makeCategory({ issues: ['Title too short'] })}
        expanded={false}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('fires onToggle when Enter or Space is pressed', () => {
    const onToggle = vi.fn();
    render(
      <ScoreCard
        catKey="titleSeo"
        cat={makeCategory({ tips: ['Add brand'] })}
        expanded={false}
        onToggle={onToggle}
      />,
    );
    const btn = screen.getByRole('button');
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.keyDown(btn, { key: ' ' });
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('shows the issue count summary when collapsed', () => {
    render(
      <ScoreCard
        catKey="titleSeo"
        cat={makeCategory({ issues: ['One', 'Two'] })}
        expanded={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('2 issues')).toBeInTheDocument();
    // Issue body text should NOT yet be visible (still collapsed).
    expect(screen.queryByText('One')).toBeNull();
  });

  it('renders the issue + tip bodies when expanded', () => {
    render(
      <ScoreCard
        catKey="titleSeo"
        cat={makeCategory({ issues: ['Title too short'], tips: ['Add a brand name'] })}
        expanded={true}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('Title too short')).toBeInTheDocument();
    expect(screen.getByText('Add a brand name')).toBeInTheDocument();
  });

  it('singularizes "1 issue"', () => {
    render(
      <ScoreCard
        catKey="titleSeo"
        cat={makeCategory({ issues: ['Just one'] })}
        expanded={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText('1 issue')).toBeInTheDocument();
  });
});
