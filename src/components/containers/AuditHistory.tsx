import { useCallback, useEffect, useState } from 'react';
import { Clock, User, ArrowRight, Loader2, FileText } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  actionType: string;
  entityId: string;
  entityType: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  relatedEntities: string[];
  userId: string;
  timestamp: string;
}

interface AuditHistoryProps {
  containerId: string;
  appPassword: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  rename: 'Renamed',
  merge: 'Merged',
  split: 'Split',
  location_change: 'Location Changed',
  item_move: 'Item Moved',
  archive: 'Archived',
  restore: 'Restored',
  status_change: 'Status Changed',
  review_accept: 'Review Accepted',
  review_reject: 'Review Rejected',
  review_create_new: 'Created from Review',
};

const ACTION_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  create: { bg: 'rgba(34,197,94,0.12)', fg: '#86efac', border: 'rgba(34,197,94,0.4)' },
  rename: { bg: 'rgba(59,130,246,0.12)', fg: '#93c5fd', border: 'rgba(59,130,246,0.4)' },
  merge: { bg: 'rgba(168,85,247,0.12)', fg: '#d8b4fe', border: 'rgba(168,85,247,0.4)' },
  split: { bg: 'rgba(245,158,11,0.12)', fg: '#fcd34d', border: 'rgba(245,158,11,0.4)' },
  location_change: { bg: 'rgba(14,165,233,0.12)', fg: '#7dd3fc', border: 'rgba(14,165,233,0.4)' },
  item_move: { bg: 'rgba(99,102,241,0.12)', fg: '#c7d2fe', border: 'rgba(99,102,241,0.4)' },
  archive: { bg: 'rgba(239,68,68,0.12)', fg: '#fca5a5', border: 'rgba(239,68,68,0.4)' },
  restore: { bg: 'rgba(34,197,94,0.12)', fg: '#86efac', border: 'rgba(34,197,94,0.4)' },
  status_change: { bg: 'rgba(245,158,11,0.12)', fg: '#fcd34d', border: 'rgba(245,158,11,0.4)' },
};

const DEFAULT_ACTION_COLOR = { bg: 'rgba(148,163,184,0.12)', fg: '#cbd5e1', border: 'rgba(148,163,184,0.4)' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(', ');
  }
  return String(value);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AuditHistory({ containerId, appPassword }: AuditHistoryProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const fetchAuditHistory = useCallback(async (currentOffset: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const resp = await fetch(
        `/api/containers/${containerId}/audit?limit=${PAGE_SIZE}&offset=${currentOffset}`,
        { headers: { Authorization: `Bearer ${appPassword}` } }
      );

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `Failed to load audit history (${resp.status})`);
      }

      const data = await resp.json();
      const newEntries: AuditEntry[] = data.entries || [];

      if (append) {
        setEntries(prev => [...prev, ...newEntries]);
      } else {
        setEntries(newEntries);
      }

      setHasMore(newEntries.length >= PAGE_SIZE);
      setOffset(currentOffset + newEntries.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load audit history');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [containerId, appPassword]);

  useEffect(() => {
    setEntries([]);
    setOffset(0);
    setHasMore(true);
    fetchAuditHistory(0, false);
  }, [containerId, fetchAuditHistory]);

  const handleLoadMore = () => {
    fetchAuditHistory(offset, true);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginRight: '0.5rem' }} />
        Loading audit history…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#fca5a5' }}>
        <p style={{ margin: '0 0 0.75rem 0' }}>{error}</p>
        <button
          onClick={() => fetchAuditHistory(0, false)}
          className="btn-secondary"
          style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)', gap: '0.75rem' }}>
        <FileText size={32} style={{ opacity: 0.5 }} />
        <p style={{ margin: 0, fontSize: '0.95rem' }}>No audit history</p>
        <p style={{ margin: 0, fontSize: '0.8rem' }}>Actions performed on this container will appear here.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {entries.map((entry) => (
        <AuditEntryRow key={entry.id} entry={entry} />
      ))}

      {hasMore && (
        <div style={{ textAlign: 'center', paddingTop: '0.75rem' }}>
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="btn-secondary"
            style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem', opacity: loadingMore ? 0.6 : 1 }}
          >
            {loadingMore ? 'Loading…' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Audit Entry Row ─────────────────────────────────────────────────────────

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const colors = ACTION_COLORS[entry.actionType] || DEFAULT_ACTION_COLOR;
  const label = ACTION_LABELS[entry.actionType] || entry.actionType;

  return (
    <div
      style={{
        padding: '0.75rem 1rem',
        background: 'var(--glass-bg)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      {/* Header row: action badge, user, timestamp */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 10px',
            borderRadius: '999px',
            fontSize: '0.72rem',
            fontWeight: 600,
            background: colors.bg,
            color: colors.fg,
            border: `1px solid ${colors.border}`,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <User size={12} />
          {entry.userId}
        </span>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          <Clock size={12} />
          {formatTimestamp(entry.timestamp)}
        </span>
      </div>

      {/* Values: previous → new */}
      {(entry.previousValue || entry.newValue) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', flexWrap: 'wrap' }}>
          {entry.previousValue && (
            <span style={{ color: 'var(--text-secondary)', background: 'rgba(239,68,68,0.08)', padding: '2px 8px', borderRadius: '4px', wordBreak: 'break-word' }}>
              {formatValue(entry.previousValue)}
            </span>
          )}
          {entry.previousValue && entry.newValue && (
            <ArrowRight size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0, marginTop: '2px' }} />
          )}
          {entry.newValue && (
            <span style={{ color: 'var(--text-primary)', background: 'rgba(34,197,94,0.08)', padding: '2px 8px', borderRadius: '4px', wordBreak: 'break-word' }}>
              {formatValue(entry.newValue)}
            </span>
          )}
        </div>
      )}

      {/* Related entities */}
      {entry.relatedEntities && entry.relatedEntities.length > 0 && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Related: {entry.relatedEntities.join(', ')}
        </div>
      )}
    </div>
  );
}
