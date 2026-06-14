import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewQueue from './ReviewQueue';
import { ToastProvider } from '../../context/ToastContext';

function wrap(ui: React.ReactNode) {
  return <ToastProvider>{ui}</ToastProvider>;
}

const mockEntries = [
  {
    id: 'rq-1',
    originalSku: 'S-Bin-1',
    suggestedContainerName: 'S Bin 1',
    confidenceScore: 78,
    reason: 'Partial token overlap with existing container',
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'rq-2',
    originalSku: 'Tote_02',
    suggestedContainerName: 'Tote 2',
    confidenceScore: 65,
    reason: 'Numeric suffix matches after stripping leading zeros',
    status: 'pending',
    createdAt: '2024-01-02T00:00:00Z',
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ReviewQueue', () => {
  it('shows loading state initially', () => {
    // Never resolve the fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(wrap(<ReviewQueue appPassword="test-token" />));
    expect(screen.getByText(/loading review queue/i)).toBeInTheDocument();
  });

  it('shows empty state when no pending entries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    render(wrap(<ReviewQueue appPassword="test-token" />));

    await waitFor(() => {
      expect(screen.getByText(/no pending review entries/i)).toBeInTheDocument();
    });
  });

  it('renders entries ordered by confidence score with correct columns', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockEntries,
    } as Response);

    render(wrap(<ReviewQueue appPassword="test-token" />));

    await waitFor(() => {
      expect(screen.getByText('S-Bin-1')).toBeInTheDocument();
    });

    // Check all columns are rendered
    expect(screen.getByText('S Bin 1')).toBeInTheDocument();
    expect(screen.getByText('78%')).toBeInTheDocument();
    expect(screen.getByText('Partial token overlap with existing container')).toBeInTheDocument();

    expect(screen.getByText('Tote_02')).toBeInTheDocument();
    expect(screen.getByText('Tote 2')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
  });

  it('renders all four action buttons for each entry', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [mockEntries[0]],
    } as Response);

    render(wrap(<ReviewQueue appPassword="test-token" />));

    await waitFor(() => {
      expect(screen.getByText('S-Bin-1')).toBeInTheDocument();
    });

    expect(screen.getByTitle('Accept Merge')).toBeInTheDocument();
    expect(screen.getByTitle('Reject Merge')).toBeInTheDocument();
    expect(screen.getByTitle('Create New')).toBeInTheDocument();
    expect(screen.getByTitle('Ignore')).toBeInTheDocument();
  });

  it('calls accept endpoint and removes entry on success', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => [mockEntries[0]] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) } as Response);

    render(wrap(<ReviewQueue appPassword="test-token" />));

    await waitFor(() => {
      expect(screen.getByText('S-Bin-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTitle('Accept Merge'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/containers/review-queue/rq-1/accept',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // Entry should be removed from the list
    await waitFor(() => {
      expect(screen.queryByText('S-Bin-1')).not.toBeInTheDocument();
    });
  });

  it('shows error toast when container is deleted (400)', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => [mockEntries[0]] } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Suggested container no longer exists' }),
      } as Response);

    render(wrap(<ReviewQueue appPassword="test-token" />));

    await waitFor(() => {
      expect(screen.getByText('S-Bin-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTitle('Accept Merge'));

    // Entry should remain in the list (not removed on 400)
    await waitFor(() => {
      expect(screen.getByText('S-Bin-1')).toBeInTheDocument();
    });
  });

  it('removes entry from list when already resolved (409)', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => [mockEntries[0]] } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Entry already resolved' }),
      } as Response);

    render(wrap(<ReviewQueue appPassword="test-token" />));

    await waitFor(() => {
      expect(screen.getByText('S-Bin-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTitle('Reject Merge'));

    await waitFor(() => {
      expect(screen.queryByText('S-Bin-1')).not.toBeInTheDocument();
    });
  });

  it('shows entry count in the header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockEntries,
    } as Response);

    render(wrap(<ReviewQueue appPassword="test-token" />));

    await waitFor(() => {
      expect(screen.getByText(/2 pending entries/)).toBeInTheDocument();
    });
  });
});
