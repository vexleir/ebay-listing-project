import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OptimizerInputCard from './OptimizerInputCard';

function defaults(overrides: Record<string, unknown> = {}) {
  return {
    url: '',
    onUrlChange: vi.fn(),
    onSubmit: vi.fn(),
    loading: false,
    error: '',
    ...overrides,
  };
}

describe('OptimizerInputCard', () => {
  it('renders the heading and the description copy', () => {
    render(<OptimizerInputCard {...defaults()} />);
    expect(screen.getByText('Listing Optimizer')).toBeInTheDocument();
    expect(screen.getByText(/health score, SEO analysis/i)).toBeInTheDocument();
  });

  it('fires onUrlChange when the input changes', () => {
    const props = defaults();
    render(<OptimizerInputCard {...props} />);
    const input = screen.getByLabelText('eBay listing URL or item number') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '123456789012' } });
    expect(props.onUrlChange).toHaveBeenCalledWith('123456789012');
  });

  it('disables Analyze when the URL is blank', () => {
    render(<OptimizerInputCard {...defaults()} />);
    const btn = screen.getByRole('button', { name: /Analyze Listing/i });
    expect(btn).toBeDisabled();
  });

  it('enables Analyze when a URL is provided', () => {
    render(<OptimizerInputCard {...defaults({ url: '123456789012' })} />);
    const btn = screen.getByRole('button', { name: /Analyze Listing/i });
    expect(btn).not.toBeDisabled();
  });

  it('fires onSubmit when Analyze is clicked', () => {
    const props = defaults({ url: '123456789012' });
    render(<OptimizerInputCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Analyze Listing/i }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('fires onSubmit on Enter when URL non-blank and not loading', () => {
    const props = defaults({ url: '123456789012' });
    render(<OptimizerInputCard {...props} />);
    fireEvent.keyDown(screen.getByLabelText('eBay listing URL or item number'), { key: 'Enter' });
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onSubmit on Enter while loading', () => {
    const props = defaults({ url: '123456789012', loading: true });
    render(<OptimizerInputCard {...props} />);
    fireEvent.keyDown(screen.getByLabelText('eBay listing URL or item number'), { key: 'Enter' });
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('shows the loading copy on the button when loading', () => {
    render(<OptimizerInputCard {...defaults({ url: '123', loading: true })} />);
    expect(screen.getByText(/Fetching listing/)).toBeInTheDocument();
  });

  it('shows the error message when error is non-empty', () => {
    render(<OptimizerInputCard {...defaults({ error: 'Could not parse item ID' })} />);
    expect(screen.getByText('Could not parse item ID')).toBeInTheDocument();
  });
});
