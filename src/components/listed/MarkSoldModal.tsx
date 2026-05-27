import { createPortal } from 'react-dom';
import { DollarSign } from 'lucide-react';

export interface MarkSoldModalProps {
  price: string;
  date: string;
  markingSold: boolean;
  onPriceChange: (price: string) => void;
  onDateChange: (date: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export default function MarkSoldModal({ price, date, markingSold, onPriceChange, onDateChange, onClose, onConfirm }: MarkSoldModalProps) {
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        <h3 style={{ margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DollarSign size={18} style={{ color: 'var(--success)' }} /> Mark as Sold
        </h3>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Sold Price ($)</label>
        <input className="input-base" type="number" step="0.01" min="0" value={price} onChange={(e) => onPriceChange(e.target.value)} style={{ marginBottom: '1rem' }} />
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Sold Date</label>
        <input className="input-base" type="date" value={date} onChange={(e) => onDateChange(e.target.value)} style={{ marginBottom: '1.5rem' }} />
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn-primary" style={{ flex: 2, background: 'rgba(16,185,129,0.25)', borderColor: 'rgba(16,185,129,0.5)', color: 'var(--success)' }} disabled={markingSold} onClick={onConfirm}>
            {markingSold ? 'Saving...' : 'Mark as Sold'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
