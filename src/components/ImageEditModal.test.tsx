import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImageEditModal from './ImageEditModal';
import type { StagedListing } from '../types';
import { ToastProvider } from '../context/ToastContext';

function listing(overrides: Partial<StagedListing> = {}): StagedListing {
  return {
    id: 'l1',
    title: 'Test',
    description: '',
    condition: 'Used',
    itemSpecifics: {},
    category: 'Cameras',
    priceRecommendation: '10',
    shippingEstimate: '',
    images: [],
    createdAt: 0,
    status: 'staged',
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof ImageEditModal>> = {}) {
  const defaults = {
    listing: listing(),
    appPassword: 'tok',
    onSave: vi.fn(),
    onClose: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  return {
    ...render(
      <ToastProvider>
        <ImageEditModal {...merged} />
      </ToastProvider>,
    ),
    props: merged,
  };
}

describe('ImageEditModal', () => {
  let originalFetch: typeof fetch;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;
  let createdUrls: string[];
  let revokedUrls: string[];

  beforeEach(() => {
    originalFetch = global.fetch;
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    createdUrls = [];
    revokedUrls = [];
    // happy-dom's createObjectURL exists but we spy so we can assert
    // ownership-tracking behavior.
    URL.createObjectURL = vi.fn((file: Blob) => {
      const url = `blob:fake-${createdUrls.length}`;
      createdUrls.push(url);
      // satisfy unused-param lint
      void file;
      return url;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn((url: string) => { revokedUrls.push(url); });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('renders the dialog header and the existing images from the listing', () => {
    renderModal({
      listing: listing({ images: ['https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg'] }),
    });
    expect(screen.getByText('Edit Images')).toBeInTheDocument();
    // Each image renders as an <img>; we expect 2 product images plus any
    // icons baked into the SVG controls.
    const productImages = document.body.querySelectorAll('img[alt=""]');
    expect(productImages.length).toBe(2);
    expect((productImages[0] as HTMLImageElement).src).toContain('i.ebayimg.com/a.jpg');
  });

  it('shows the empty-state drop zone copy when no images exist', () => {
    renderModal({ listing: listing({ images: [] }) });
    expect(screen.getByText(/Drop photos here or click to browse/i)).toBeInTheDocument();
    // The counter line "X existing · Y pending upload" only renders when
    // there is at least one item, so an empty listing should NOT show it.
    expect(screen.queryByText(/pending upload/)).toBeNull();
  });

  it('marks the first image as MAIN', () => {
    renderModal({
      listing: listing({ images: ['https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg'] }),
    });
    // One MAIN label, on the first slot.
    const mains = screen.getAllByText('MAIN');
    expect(mains).toHaveLength(1);
  });

  it('removes an image when its X button is clicked', () => {
    renderModal({
      listing: listing({ images: ['https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg'] }),
    });
    const removeBtn = screen.getByRole('button', { name: 'Remove image 1' });
    fireEvent.click(removeBtn);
    // The remaining image should be what was previously the second slot;
    // it inherits MAIN now.
    const productImages = document.body.querySelectorAll('img[alt=""]');
    expect(productImages.length).toBe(1);
    expect((productImages[0] as HTMLImageElement).src).toContain('i.ebayimg.com/b.jpg');
    expect(screen.getAllByText('MAIN')).toHaveLength(1);
  });

  it('exposes per-thumbnail Crop / Straighten / Rotate / Enhance / Scissors buttons with aria-labels', () => {
    renderModal({ listing: listing({ images: ['https://i.ebayimg.com/a.jpg'] }) });
    expect(screen.getByRole('button', { name: 'Crop image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Straighten image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rotate image 90 degrees clockwise' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enhance image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove background' })).toBeInTheDocument();
  });

  it('fires onClose when the X header button is clicked', () => {
    const onClose = vi.fn();
    renderModal({ listing: listing({ images: ['https://i.ebayimg.com/a.jpg'] }), onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Close image editor' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call /api/images/upload when only URL-backed items exist', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const onSave = vi.fn();
    renderModal({
      listing: listing({ images: ['https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg'] }),
      onSave,
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Images/i }));
    // Wait a microtask so the async save handler has a chance to bail.
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(['https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg']);
  });

  it('shows the existing vs pending-upload counter line under the grid', () => {
    renderModal({
      listing: listing({ images: ['https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg'] }),
    });
    expect(screen.getByText('2 existing · 0 pending upload')).toBeInTheDocument();
  });

  it('reorders items by drag-and-drop', async () => {
    const onSave = vi.fn();
    renderModal({
      listing: listing({ images: ['https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg', 'https://i.ebayimg.com/c.jpg'] }),
      onSave,
    });
    const productImages = document.body.querySelectorAll('img[alt=""]') as NodeListOf<HTMLImageElement>;
    const wrappers = Array.from(productImages).map((img) => img.closest('[draggable="true"]') as HTMLElement);
    expect(wrappers.length).toBe(3);

    // The onDragStart handler defers `setDraggedIdx(idx)` via `setTimeout(0)`
    // so the drag ghost can render before React re-renders. Yield to the
    // macrotask queue so the deferred state update actually applies before
    // the drop handler reads it.
    fireEvent.dragStart(wrappers[2], { dataTransfer: { effectAllowed: '', setData: () => {} } });
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.dragOver(wrappers[0], { dataTransfer: { dropEffect: '', effectAllowed: '' } });
    fireEvent.drop(wrappers[0]);

    fireEvent.click(screen.getByRole('button', { name: /Save Images/i }));
    await Promise.resolve();
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledWith(['https://i.ebayimg.com/c.jpg', 'https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg']);
  });
});
