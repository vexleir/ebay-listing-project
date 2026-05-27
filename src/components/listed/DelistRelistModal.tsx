import { createPortal } from 'react-dom';
import { RotateCcw } from 'lucide-react';

export interface DelistRelistModalProps {
  allowOffers: boolean;
  working: boolean;
  onAllowOffersChange: (allowOffers: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DelistRelistModal({ allowOffers, working, onAllowOffersChange, onClose, onConfirm }: DelistRelistModalProps) {
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '420px', padding: '2rem' }}>
        <h3 style={{ margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}><RotateCcw size={18} style={{ color: '#f59e0b' }} /> Delist & Relist on eBay?</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>This ends the current eBay listing and immediately creates a fresh one with the same details (no scheduling). Useful for refreshing listing visibility. The item will get a new eBay item ID.</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: '1.25rem', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={allowOffers} onChange={(e) => onAllowOffersChange(e.target.checked)} style={{ cursor: 'pointer' }} />
          Allow offers (Best Offer enabled)
        </label>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose} disabled={working}>Cancel</button>
          <button style={{ flex: 2, background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }} onClick={onConfirm} disabled={working}>
            {working ? 'Working...' : 'Delist & Relist'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
