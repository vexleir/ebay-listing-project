// FE-003 — the Accept/Reject AI-suggestion strip used under each editable
// field in the optimizer's edit phase. Pure — parent owns `accepted`.

import { useState } from 'react';
import { CheckCircle, XCircle, Zap } from 'lucide-react';

export interface AiSuggestionBoxProps {
  label: string;
  original: string;
  suggested: string;
  rationale: string;
  // null = pending, true = accepted, false = rejected.
  accepted: boolean | null;
  onAccept: () => void;
  onReject: () => void;
}

export default function AiSuggestionBox({
  label, original, suggested, rationale, accepted, onAccept, onReject,
}: AiSuggestionBoxProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  if (accepted === true) {
    return (
      <div style={{ fontSize: '0.75rem', color: '#86efac', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
        <CheckCircle size={12} /> AI suggestion accepted
        <button onClick={onReject} aria-label={`Undo accepting ${label} suggestion`} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 6px' }}>Undo</button>
      </div>
    );
  }

  if (accepted === false) {
    return (
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
        <XCircle size={12} /> AI suggestion rejected
        <button onClick={onAccept} aria-label={`Undo rejecting ${label} suggestion`} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 6px' }}>Undo</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '8px', padding: '10px 12px', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', fontSize: '0.8rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: '#c4b5fd', fontWeight: 600, fontSize: '0.75rem' }}>
        <Zap size={12} /> AI SUGGESTION for {label}
      </div>
      <div style={{ color: 'var(--text-primary)', marginBottom: '6px', lineHeight: 1.4 }}>{suggested}</div>
      {rationale && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.73rem', fontStyle: 'italic', marginBottom: '8px' }}>{rationale}</div>
      )}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={onAccept} className="btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <CheckCircle size={12} /> Accept
        </button>
        <button onClick={onReject} className="btn-icon" style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#ef4444' }}>
          <XCircle size={12} /> Reject
        </button>
        <button
          onClick={() => setShowOriginal((s) => !s)}
          aria-label={showOriginal ? 'Hide original' : 'Show original'}
          aria-expanded={showOriginal}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.72rem', textDecoration: 'underline', padding: 0 }}
        >
          {showOriginal ? 'Hide' : 'Show'} original
        </button>
      </div>
      {showOriginal && (
        <div style={{ marginTop: '6px', padding: '6px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '0.73rem' }}>
          Original: {original}
        </div>
      )}
    </div>
  );
}
