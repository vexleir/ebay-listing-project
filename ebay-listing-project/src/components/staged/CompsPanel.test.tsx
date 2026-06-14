import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CompsPanel from './CompsPanel';

const sampleComps = [
  { title: 'A',     price: '10.00', currency: 'USD', condition: 'New',  url: 'https://a.example/1' },
  { title: 'Bee',   price: '25.50', currency: 'USD', condition: 'Used', url: 'https://b.example/2' },
];

describe('CompsPanel', () => {
  it('renders the loading state when loading=true', () => {
    render(<CompsPanel loading={true} comps={[]} onDismiss={() => {}} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders an empty-state message when not loading and no comps', () => {
    render(<CompsPanel loading={false} comps={[]} onDismiss={() => {}} />);
    expect(screen.getByText('No results found.')).toBeInTheDocument();
  });

  it('renders one row per comp with the title, condition, and formatted price', () => {
    render(<CompsPanel loading={false} comps={sampleComps} onDismiss={() => {}} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('Bee')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Used')).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
    expect(screen.getByText('$25.50')).toBeInTheDocument();
  });

  it('linkifies each title with target=_blank + rel=noreferrer', () => {
    render(<CompsPanel loading={false} comps={sampleComps} onDismiss={() => {}} />);
    const link = screen.getByText('A').closest('a')!;
    expect(link.getAttribute('href')).toBe('https://a.example/1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer');
  });

  it('fires onDismiss when the close button is clicked', () => {
    const onDismiss = vi.fn();
    render(<CompsPanel loading={false} comps={sampleComps} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Close comps panel'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('skips the condition line when comp.condition is empty', () => {
    render(<CompsPanel loading={false} comps={[{ title: 'NoCond', price: '5.00', currency: 'USD', condition: '', url: 'https://x' }]} onDismiss={() => {}} />);
    expect(screen.getByText('NoCond')).toBeInTheDocument();
    // The condition span only renders when condition is truthy — no "New"/"Used" should appear.
    expect(screen.queryByText('New')).toBeNull();
    expect(screen.queryByText('Used')).toBeNull();
  });
});
