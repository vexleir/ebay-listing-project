// IMG-001 last slice — enhance modal. Three sliders for brightness /
// contrast / saturation, each ±100, with a live CSS-filter preview that
// matches the canvas math run on Save. Identity values short-circuit the
// canvas pipeline so a no-op save is free.

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, Sliders, X } from 'lucide-react';
import {
  ENHANCE_LIMIT,
  clampPercent,
  cssFilterFor,
  enhanceImageFile,
  isIdentity,
  type EnhanceOptions,
} from '../utils/imageEnhance';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface ImageEnhanceModalProps {
  file: File;
  onSave: (next: File) => void;
  onCancel: () => void;
}

export default function ImageEnhanceModal({ file, onSave, onCancel }: ImageEnhanceModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onCancel);
  useFocusTrap(dialogRef);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [opts, setOpts] = useState<Required<EnhanceOptions>>({ brightness: 0, contrast: 0, saturation: 0 });
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
      const next = await enhanceImageFile(file, opts);
      onSave(next);
    } catch (e: any) {
      setError(e?.message || 'Enhance failed.');
      setSaving(false);
    }
  };

  const update = (key: keyof EnhanceOptions, raw: number) => {
    setOpts((prev) => ({ ...prev, [key]: clampPercent(raw) }));
  };
  const resetAll = () => setOpts({ brightness: 0, contrast: 0, saturation: 0 });

  const filter = cssFilterFor(opts);

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
        aria-label="Enhance image"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '780px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={16} style={{ color: 'var(--accent-color)' }} /> Enhance Image
          </h3>
          <button onClick={onCancel} aria-label="Cancel enhance" className="btn-icon"><X size={16} /></button>
        </div>

        <div style={{ flex: 1, padding: '1.25rem', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}>
          {imageUrl && (
            <div style={{ width: '100%', maxWidth: '520px', aspectRatio: '4 / 3', overflow: 'hidden', position: 'relative', background: '#000', borderRadius: '8px' }}>
              <img
                src={imageUrl}
                alt="Enhance preview"
                style={{
                  width: '100%',
                  height: '100%',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  objectFit: 'contain',
                  filter,
                  transition: 'filter 0.05s linear',
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

        {/* Slider rows */}
        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {([
            { key: 'brightness' as const, label: 'Brightness' },
            { key: 'contrast' as const, label: 'Contrast' },
            { key: 'saturation' as const, label: 'Saturation' },
          ]).map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <label htmlFor={`enhance-${key}`} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', minWidth: '90px' }}>
                {label}
              </label>
              <input
                id={`enhance-${key}`}
                type="range"
                min={-ENHANCE_LIMIT}
                max={ENHANCE_LIMIT}
                step={1}
                value={opts[key]}
                onChange={(e) => update(key, parseInt(e.target.value, 10))}
                aria-label={`${label} adjustment. Current value: ${opts[key]}.`}
                style={{ flex: 1, minWidth: '180px' }}
              />
              <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.85rem', minWidth: '40px', textAlign: 'right' }}>
                {opts[key] > 0 ? '+' : ''}{opts[key]}
              </span>
            </div>
          ))}
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={resetAll}
            disabled={isIdentity(opts) || saving}
            aria-label="Reset all sliders to 0"
            className="btn-icon"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <RotateCcw size={14} /> Reset
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Check size={14} /> {saving ? 'Saving…' : 'Apply enhance'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
