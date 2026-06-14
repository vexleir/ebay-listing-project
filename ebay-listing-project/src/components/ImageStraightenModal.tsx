// IMG-001 — straighten modal. A range slider for the angle (±15°) plus a
// live CSS-transform preview. The Save handler does the heavy canvas work
// once, via `straightenImageFile` — preview never touches canvas so dragging
// the slider stays smooth on phones.

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, Scaling, X } from 'lucide-react';
import {
  STRAIGHTEN_LIMIT_DEG,
  clampStraightenAngle,
  straightenImageFile,
} from '../utils/imageStraighten';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface ImageStraightenModalProps {
  file: File;
  onSave: (next: File) => void;
  onCancel: () => void;
}

export default function ImageStraightenModal({ file, onSave, onCancel }: ImageStraightenModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onCancel);
  useFocusTrap(dialogRef);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [angle, setAngle] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => { URL.revokeObjectURL(url); };
  }, [file]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await straightenImageFile(file, angle);
      onSave(next);
    } catch (e: any) {
      setError(e?.message || 'Straighten failed.');
      setSaving(false);
    }
  };

  return createPortal(
    <div
      onClick={onCancel}
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        ref={dialogRef}
        className="glass-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Straighten image"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '780px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Scaling size={16} style={{ color: 'var(--accent-color)' }} /> Straighten Image
          </h3>
          <button onClick={onCancel} aria-label="Cancel straighten" className="btn-icon"><X size={16} /></button>
        </div>

        <div style={{ flex: 1, padding: '1.25rem', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}>
          {imageUrl && (
            // Wrapper clips the preview to a fixed box so the CSS transform
            // rotation matches what the canvas-inscribed crop will produce
            // on save. The image itself is rendered larger than the wrapper
            // so the inscribed-rect math has something to "crop from."
            <div style={{ width: '100%', maxWidth: '520px', aspectRatio: '4 / 3', overflow: 'hidden', position: 'relative', background: '#000', borderRadius: '8px' }}>
              <img
                src={imageUrl}
                alt="Straighten preview"
                style={{
                  width: '110%',
                  height: '110%',
                  position: 'absolute',
                  top: '-5%',
                  left: '-5%',
                  objectFit: 'cover',
                  transform: `rotate(${angle}deg)`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.05s linear',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
                draggable={false}
              />
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '8px 16px', color: 'var(--danger)', fontSize: '0.85rem', borderTop: '1px solid var(--border-color)' }}>{error}</div>
        )}

        {/* Slider row */}
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="straighten-angle" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', minWidth: '60px' }}>
            Angle
          </label>
          <input
            id="straighten-angle"
            type="range"
            min={-STRAIGHTEN_LIMIT_DEG}
            max={STRAIGHTEN_LIMIT_DEG}
            step={0.5}
            value={angle}
            onChange={(e) => setAngle(clampStraightenAngle(parseFloat(e.target.value)))}
            aria-label={`Rotation angle in degrees. Current value: ${angle}.`}
            style={{ flex: 1, minWidth: '180px' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.85rem', minWidth: '54px', textAlign: 'right' }}>
              {angle.toFixed(1)}°
            </span>
            <button
              onClick={() => setAngle(0)}
              disabled={angle === 0 || saving}
              aria-label="Reset angle to 0"
              className="btn-icon"
              style={{ padding: '4px 8px' }}
              title="Reset to 0°"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Check size={14} /> {saving ? 'Saving…' : 'Apply straighten'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
