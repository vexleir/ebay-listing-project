import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SeoAnalysisPanel from './SeoAnalysisPanel';

function makeTitleSeo(overrides: Partial<{ issues: string[]; tips: string[] }> = {}) {
  return {
    name: 'Title & SEO',
    score: 15,
    maxScore: 30,
    pct: 50,
    issues: [],
    tips: [],
    ...overrides,
  };
}

describe('SeoAnalysisPanel', () => {
  it('returns null when there is nothing to surface', () => {
    const { container } = render(
      <SeoAnalysisPanel title="Whatever" titleSeo={makeTitleSeo()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when titleSeo has issues', () => {
    render(
      <SeoAnalysisPanel
        title="Short"
        titleSeo={makeTitleSeo({ issues: ['Title is too short'] })}
      />,
    );
    expect(screen.getByText('SEO Analysis')).toBeInTheDocument();
    expect(screen.getByText('Title is too short')).toBeInTheDocument();
  });

  it('renders when AI seoIssues are present even if titleSeo is clean', () => {
    render(
      <SeoAnalysisPanel
        title="A reasonable title"
        titleSeo={makeTitleSeo()}
        aiSeoIssues={['Add the model number']}
      />,
    );
    expect(screen.getByText('SEO Analysis')).toBeInTheDocument();
    expect(screen.getByText('Add the model number')).toBeInTheDocument();
  });

  it('renders AI keywords when provided', () => {
    render(
      <SeoAnalysisPanel
        title="A title"
        titleSeo={makeTitleSeo({ issues: ['x'] })}
        aiSeoKeywords={['leica', 'vintage', '35mm']}
      />,
    );
    expect(screen.getByText('Top target keywords:')).toBeInTheDocument();
    expect(screen.getByText('leica')).toBeInTheDocument();
    expect(screen.getByText('35mm')).toBeInTheDocument();
  });

  it('shows the title character count', () => {
    render(
      <SeoAnalysisPanel
        title={'A'.repeat(42)}
        titleSeo={makeTitleSeo({ issues: ['x'] })}
      />,
    );
    // The count is rendered as "42/80 characters" — content split across nodes.
    expect(screen.getByText('42/80 characters')).toBeInTheDocument();
  });
});
