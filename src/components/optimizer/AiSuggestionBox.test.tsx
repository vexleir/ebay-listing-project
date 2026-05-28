import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AiSuggestionBox from './AiSuggestionBox';

function defaults(overrides: Record<string, unknown> = {}) {
  return {
    label: 'Title',
    original: 'Old Title',
    suggested: 'New AI Title',
    rationale: 'Keyword-rich; brand near the front.',
    accepted: null as boolean | null,
    onAccept: vi.fn(),
    onReject: vi.fn(),
    ...overrides,
  };
}

describe('AiSuggestionBox', () => {
  it('renders the suggestion + rationale in the pending state', () => {
    render(<AiSuggestionBox {...defaults()} />);
    expect(screen.getByText(/AI SUGGESTION for Title/i)).toBeInTheDocument();
    expect(screen.getByText('New AI Title')).toBeInTheDocument();
    expect(screen.getByText(/Keyword-rich/)).toBeInTheDocument();
  });

  it('fires onAccept when Accept is clicked', () => {
    const props = defaults();
    render(<AiSuggestionBox {...props} />);
    fireEvent.click(screen.getByText('Accept'));
    expect(props.onAccept).toHaveBeenCalledTimes(1);
  });

  it('fires onReject when Reject is clicked', () => {
    const props = defaults();
    render(<AiSuggestionBox {...props} />);
    fireEvent.click(screen.getByText('Reject'));
    expect(props.onReject).toHaveBeenCalledTimes(1);
  });

  it('hides the original by default and toggles on Show/Hide click', () => {
    render(<AiSuggestionBox {...defaults()} />);
    expect(screen.queryByText(/Original: Old Title/)).toBeNull();
    fireEvent.click(screen.getByText('Show original'));
    expect(screen.getByText(/Original: Old Title/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Hide original'));
    expect(screen.queryByText(/Original: Old Title/)).toBeNull();
  });

  it('renders the accepted strip with an Undo button when accepted=true', () => {
    const props = defaults({ accepted: true });
    render(<AiSuggestionBox {...props} />);
    expect(screen.getByText('AI suggestion accepted')).toBeInTheDocument();
    // Undo on the accepted strip routes back through onReject.
    fireEvent.click(screen.getByText('Undo'));
    expect(props.onReject).toHaveBeenCalledTimes(1);
  });

  it('renders the rejected strip with an Undo button when accepted=false', () => {
    const props = defaults({ accepted: false });
    render(<AiSuggestionBox {...props} />);
    expect(screen.getByText('AI suggestion rejected')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Undo'));
    expect(props.onAccept).toHaveBeenCalledTimes(1);
  });

  it('skips the rationale line when empty', () => {
    render(<AiSuggestionBox {...defaults({ rationale: '' })} />);
    expect(screen.queryByText(/Keyword-rich/)).toBeNull();
    // suggestion text still shows
    expect(screen.getByText('New AI Title')).toBeInTheDocument();
  });
});
