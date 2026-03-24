import { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import ImageSearchButton from './ImageSearchButton';

interface LightboxProps {
  images: string[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
}

export default function Lightbox({ images, index, onClose, onNavigate }: LightboxProps) {
  const len = images.length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && len > 1) onNavigate((index + 1) % len);
      if (e.key === 'ArrowLeft' && len > 1) onNavigate((index - 1 + len) % len);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, len, onClose, onNavigate]);

  if (!images[index]) return null;

  const btn = (style: React.CSSProperties, onClick: () => void, children: React.ReactNode) => (
    <button onClick={onClick} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)', ...style }}>
      {children}
    </button>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Close */}
      <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 1 }}>
        {btn({}, onClose, <X size={20} />)}
      </div>

      {/* Prev */}
      {len > 1 && (
        <div style={{ position: 'absolute', left: '1rem', zIndex: 1 }} onClick={e => { e.stopPropagation(); onNavigate((index - 1 + len) % len); }}>
          {btn({}, () => {}, <ChevronLeft size={26} />)}
        </div>
      )}

      {/* Image + search button */}
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
        <img src={images[index]} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', display: 'block' }} />
        <div style={{ position: 'absolute', bottom: '10px', right: '10px' }}>
          <ImageSearchButton src={images[index]} />
        </div>
      </div>

      {/* Next */}
      {len > 1 && (
        <div style={{ position: 'absolute', right: '1rem', zIndex: 1 }} onClick={e => { e.stopPropagation(); onNavigate((index + 1) % len); }}>
          {btn({}, () => {}, <ChevronRight size={26} />)}
        </div>
      )}

      {/* Counter */}
      {len > 1 && (
        <div style={{ position: 'absolute', bottom: '1.25rem', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.55)', color: 'white', padding: '4px 14px', borderRadius: '20px', fontSize: '0.85rem', backdropFilter: 'blur(6px)' }}>
          {index + 1} / {len}
        </div>
      )}
    </div>
  );
}
