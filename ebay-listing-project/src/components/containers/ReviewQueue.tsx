import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, PlusCircle, EyeOff, RefreshCw, Inbox } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface ReviewQueueEntry {
  id: string;
  originalSku: string;
  suggestedContainerName: string;
  confidenceScore: number;
  reason: string;
  status: string;
  createdAt: string;
}

interface Props {
  appPassword: string;
}

export default function ReviewQueue({ appPassword }: Props) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<ReviewQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${appPassword}` }),
    [appPassword],
  );
  const bearer = useMemo(() => ({ Authorization: `Bearer ${appPassword}` }), [appPassword]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/containers/review-queue', { headers: bearer });
      if (!resp.ok) throw new Error('Failed to load review queue');
      const data = await resp.json();
      setEntries(Array.isArray(data) ? data : data.entries ?? []);
    } catch (e: any) {
      toast('Failed to load review queue: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [bearer, toast]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleAction = async (id: string, action: 'accept' | 'reject' | 'create-new' | 'ignore') => {
    setActionInProgress(id);
    try {
      const resp = await fetch(`/api/containers/review-queue/${id}/${action}`, {
        method: 'POST',
        headers,
      });

      if (resp.status === 400) {
        const data = await resp.json().catch(() => ({}));
        toast(data.error || 'Container no longer exists', 'error');
        return;
      }

      if (resp.status === 409) {
        const data = await resp.json().catch(() => ({}));
        toast(data.error || 'Entry already resolved', 'error');
        // Remove the resolved entry from the local list
        setEntries(prev => prev.filter(e => e.id !== id));
        return;
      }

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        toast(data.error || 'Action failed', 'error');
        return;
      }

      const actionLabels: Record<string, string> = {
        accept: 'Merge accepted',
        reject: 'Merge rejected',
        'create-new': 'New container created',
        ignore: 'Recommendation ignored',
      };
      toast(actionLabels[action] || 'Done', 'success');
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (e: any) {
      toast('Action failed: ' + e.message, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const confidenceColor = (score: number): string => {
    if (score >= 80) return '#22c55e';
    if (score >= 65) return '#f59e0b';
    return '#ef4444';
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
        Loading review queue…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', borderRadius: '12px' }}>
        <Inbox size={40} style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem' }} />
        <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)' }}>
          No pending review entries. All container matches have been resolved.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Review Queue</h3>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {entries.length} pending {entries.length === 1 ? 'entry' : 'entries'} — ordered by confidence score
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={loadEntries}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Table */}
      <div className="glass-panel" style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={thStyle}>Original SKU</th>
                <th style={thStyle}>Suggested Container</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Confidence</th>
                <th style={thStyle}>Reason</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={tdStyle}>
                    <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem' }}>
                      {entry.originalSku}
                    </code>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500 }}>{entry.suggestedContainerName}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: '999px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        background: `${confidenceColor(entry.confidenceScore)}22`,
                        color: confidenceColor(entry.confidenceScore),
                        border: `1px solid ${confidenceColor(entry.confidenceScore)}44`,
                      }}
                    >
                      {entry.confidenceScore}%
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {entry.reason}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <ActionButton
                        label="Accept Merge"
                        icon={<CheckCircle2 size={13} />}
                        color="#22c55e"
                        disabled={actionInProgress === entry.id}
                        onClick={() => handleAction(entry.id, 'accept')}
                      />
                      <ActionButton
                        label="Reject Merge"
                        icon={<XCircle size={13} />}
                        color="#ef4444"
                        disabled={actionInProgress === entry.id}
                        onClick={() => handleAction(entry.id, 'reject')}
                      />
                      <ActionButton
                        label="Create New"
                        icon={<PlusCircle size={13} />}
                        color="#6366f1"
                        disabled={actionInProgress === entry.id}
                        onClick={() => handleAction(entry.id, 'create-new')}
                      />
                      <ActionButton
                        label="Ignore"
                        icon={<EyeOff size={13} />}
                        color="#94a3b8"
                        disabled={actionInProgress === entry.id}
                        onClick={() => handleAction(entry.id, 'ignore')}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Action Button ──────────────────────────────────────────────────────────

function ActionButton({
  label,
  icon,
  color,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        fontSize: '0.75rem',
        fontWeight: 500,
        borderRadius: '6px',
        border: `1px solid ${color}55`,
        background: `${color}15`,
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.15s, opacity 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Table styles ───────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  textAlign: 'left',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const tdStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  verticalAlign: 'middle',
};
