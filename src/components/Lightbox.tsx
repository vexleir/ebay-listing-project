import { useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import ImageSearchButton from './ImageSearchButton';
import { useFocusTrap } from '../hooks/useFocusTrap';

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

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  if (!images[index]) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Image ${index + 1} of ${len}`}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Close */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close image viewer"
        style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 1, background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)' }}
      >
        <X size={20} />
      </button>

      {/* Prev */}
      {len > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate((index - 1 + len) % len); }}
          aria-label="Previous image"
          style={{ position: 'absolute', left: '1rem', zIndex: 1, background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)' }}
        >
          <ChevronLeft size={26} />
        </button>
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
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate((index + 1) % len); }}
          aria-label="Next image"
          style={{ position: 'absolute', right: '1rem', zIndex: 1, background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(6px)' }}
        >
          <ChevronRight size={26} />
        </button>
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
