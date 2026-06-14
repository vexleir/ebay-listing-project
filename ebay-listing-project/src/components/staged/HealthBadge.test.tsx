import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HealthBadge from './HealthBadge';
import type { StagedListing } from '../../types';

function makeListing(overrides: Partial<StagedListing> = {}): StagedListing {
  return {
    id: 'l1',
    title: 'Test',
    description: '',
    priceRecommendation: '',
    category: '',
    categoryId: '',
    condition: '',
    images: [],
    itemSpecifics: {},
    shippingEstimate: '',
    status: 'staged',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('HealthBadge', () => {
  it('renders the numeric score and an accessible label', () => {
    render(<HealthBadge listing={makeListing()} />);
    const badge = screen.getByLabelText(/Health score \d+ of 100/);
    expect(badge).toBeInTheDocument();
  });

  it('uses cursor:help when not interactive', () => {
    render(<HealthBadge listing={makeListing()} />);
    const badge = screen.getByLabelText(/Health score/);
    expect(badge).toHaveStyle({ cursor: 'help' });
  });

  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(<HealthBadge listing={makeListing()} onClick={onClick} />);
    fireEvent.click(screen.getByLabelText(/Health score/));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('responds to Enter / Space when interactive (keyboard accessibility)', () => {
    const onClick = vi.fn();
    render(<HealthBadge listing={makeListing()} onClick={onClick} />);
    const badge = screen.getByLabelText(/Health score/);
    fireEvent.keyDown(badge, { key: 'Enter' });
    fireEvent.keyDown(badge, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('exposes role=button only when interactive', () => {
    const { rerender } = render(<HealthBadge listing={makeListing()} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<HealthBadge listing={makeListing()} onClick={() => {}} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders an expand caret when expandable', () => {
    render(<HealthBadge listing={makeListing()} expandable expanded={false} />);
    expect(screen.getByLabelText(/Health score/).textContent).toContain('▼');
  });
});
