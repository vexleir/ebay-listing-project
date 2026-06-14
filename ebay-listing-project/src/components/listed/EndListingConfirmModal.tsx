import { createPortal } from 'react-dom';
import { CircleSlash } from 'lucide-react';

export interface EndListingConfirmModalProps {
  ending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function EndListingConfirmModal({ ending, onClose, onConfirm }: EndListingConfirmModalProps) {
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        <h3 style={{ margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}><CircleSlash size={18} style={{ color: '#ef4444' }} /> End eBay Listing?</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>This will permanently end the live eBay listing. The item will be archived in ListingStager. This action cannot be undone.</p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button style={{ flex: 2, background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }} onClick={onConfirm} disabled={ending}>
            {ending ? 'Ending...' : 'End Listing on eBay'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
