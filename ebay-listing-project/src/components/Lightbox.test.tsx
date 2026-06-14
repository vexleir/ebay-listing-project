import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Lightbox from './Lightbox';

function defaults(overrides: Record<string, unknown> = {}) {
  return {
    images: ['a.jpg', 'b.jpg', 'c.jpg'],
    index: 1,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    ...overrides,
  };
}

describe('Lightbox', () => {
  it('renders as a labelled modal dialog with the current position', () => {
    render(<Lightbox {...defaults()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Image 2 of 3');
    // Counter chip too
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('exposes Close / Previous / Next buttons with aria-labels', () => {
    render(<Lightbox {...defaults()} />);
    expect(screen.getByRole('button', { name: 'Close image viewer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next image' })).toBeInTheDocument();
  });

  it('hides the prev/next buttons when there is only one image', () => {
    render(<Lightbox {...defaults({ images: ['only.jpg'], index: 0 })} />);
    expect(screen.queryByRole('button', { name: 'Previous image' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next image' })).toBeNull();
  });

  it('fires onClose when the Close button is clicked', () => {
    const props = defaults();
    render(<Lightbox {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close image viewer' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when the backdrop is clicked', () => {
    const props = defaults();
    render(<Lightbox {...props} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onClose when the image area is clicked', () => {
    const props = defaults();
    render(<Lightbox {...props} />);
    const img = screen.getByRole('dialog').querySelector('img')!;
    fireEvent.click(img);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('navigates forward via the Next button (and wraps from last → first)', () => {
    const props = defaults({ index: 2 });
    render(<Lightbox {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
    expect(props.onNavigate).toHaveBeenCalledWith(0);
  });

  it('navigates backward via the Previous button (and wraps from first → last)', () => {
    const props = defaults({ index: 0 });
    render(<Lightbox {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));
    expect(props.onNavigate).toHaveBeenCalledWith(2);
  });

  it('navigates via ArrowLeft / ArrowRight keys', () => {
    const props = defaults({ index: 1 });
    render(<Lightbox {...props} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(props.onNavigate).toHaveBeenCalledWith(2);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(props.onNavigate).toHaveBeenCalledWith(0);
  });

  it('closes on Escape', () => {
    const props = defaults();
    render(<Lightbox {...props} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
