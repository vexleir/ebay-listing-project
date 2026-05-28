// IMG-001 — crop modal. Renders the source image scaled to fit, with a
// draggable + 4-corner-resizable crop rectangle. Save invokes the pure
// `cropImageFile` utility and returns a new File to the parent.
//
// Geometry note: the crop rect is stored in IMAGE-pixel coordinates so
// the math stays stable regardless of the on-screen display size. We
// derive a `scale` from the rendered image bounds and translate pointer
// deltas back into image coordinates at the mousemove edge.

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Crop as CropIcon, X, Check } from 'lucide-react';
import {
  aspectRatioCropRect,
  cropImageFile,
  defaultCropRect,
  moveCropRect,
  resizeCropRect,
  type CropRect,
  type ResizeCorner,
} from '../utils/imageCrop';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface ImageCropModalProps {
  file: File;
  onSave: (cropped: File) => void;
  onCancel: () => void;
}

type DragMode = { kind: 'idle' } | { kind: 'move' } | { kind: 'resize'; corner: ResizeCorner };

export default function ImageCropModal({ file, onSave, onCancel }: ImageCropModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onCancel);
  useFocusTrap(dialogRef);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<CropRect | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  // Decode the source file once and seed the initial crop rect at 80% center.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    const img = new Image();
    img.onload = () => {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setRect(defaultCropRect(img.naturalWidth, img.naturalHeight));
    };
    img.onerror = () => setError('Could not load image for cropping.');
    img.src = url;
    return () => { URL.revokeObjectURL(url); };
  }, [file]);

  // Compute display ↔ image scale from the rendered image element.
  const getScale = (): number => {
    if (!imgRef.current || !naturalSize) return 1;
    const rendered = imgRef.current.getBoundingClientRect().width;
    return rendered / naturalSize.w || 1;
  };

  const onPointerDown = (e: React.PointerEvent, mode: DragMode) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragMode(mode);
    lastPointer.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragMode.kind === 'idle' || !rect || !naturalSize || !lastPointer.current) return;
    const scale = getScale();
    if (scale === 0) return;
    const dx = (e.clientX - lastPointer.current.x) / scale;
    const dy = (e.clientY - lastPointer.current.y) / scale;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    if (dragMode.kind === 'move') {
      setRect((prev) => prev ? moveCropRect(prev, dx, dy, naturalSize.w, naturalSize.h) : prev);
    } else {
      setRect((prev) => prev ? resizeCropRect(prev, dragMode.corner, dx, dy, naturalSize.w, naturalSize.h) : prev);
    }
  };

  const onPointerUp = () => {
    setDragMode({ kind: 'idle' });
    lastPointer.current = null;
  };

  const handleSave = async () => {
    if (!rect) return;
    setSaving(true);
    setError(null);
    try {
      const cropped = await cropImageFile(file, rect);
      onSave(cropped);
    } catch (e: any) {
      setError(e?.message || 'Crop failed.');
      setSaving(false);
    }
  };

  // Snap the crop rectangle to a preset aspect ratio (centered, 90% size).
  // `null` resets to the 80%-centered freeform default. Once the user grabs
  // a resize handle the ratio is no longer enforced — this is a one-shot
  // snap rather than a sticky lock.
  const applyAspect = (ratio: number | null) => {
    if (!naturalSize) return;
    setRect(
      ratio === null
        ? defaultCropRect(naturalSize.w, naturalSize.h)
        : aspectRatioCropRect(naturalSize.w, naturalSize.h, ratio),
    );
  };

  const scale = getScale();
  const rectStyle: React.CSSProperties = rect
    ? {
      position: 'absolute',
      left: `${rect.x * scale}px`,
      top: `${rect.y * scale}px`,
      width: `${rect.width * scale}px`,
      height: `${rect.height * scale}px`,
      border: '2px solid var(--accent-color)',
      boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
      cursor: dragMode.kind === 'move' ? 'grabbing' : 'grab',
      touchAction: 'none',
    }
    : { display: 'none' };

  const handle = (corner: ResizeCorner, position: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    width: '14px',
    height: '14px',
    background: 'var(--accent-color)',
    border: '2px solid white',
    borderRadius: '50%',
    touchAction: 'none',
    cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
    ...position,
  });

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
        aria-label="Crop image"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '780px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CropIcon size={16} style={{ color: 'var(--accent-color)' }} /> Crop Image
          </h3>
          <button onClick={onCancel} aria-label="Cancel crop" className="btn-icon"><X size={16} /></button>
        </div>

        <div style={{ flex: 1, padding: '1rem', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}>
          {imageUrl && (
            <div
              style={{ position: 'relative', maxWidth: '100%', maxHeight: '60vh', display: 'inline-block' }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Source for crop"
                draggable={false}
                style={{ display: 'block', maxWidth: '100%', maxHeight: '60vh', userSelect: 'none' }}
                onLoad={(e) => {
                  // Re-seed natural size in case the off-screen Image and the
                  // rendered <img> differ (they shouldn't, but defensive).
                  const t = e.currentTarget;
                  if (!naturalSize) setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
                }}
              />
              {rect && (
                <div
                  style={rectStyle}
                  onPointerDown={(e) => onPointerDown(e, { kind: 'move' })}
                  aria-label="Crop rectangle (drag to move, drag corners to resize)"
                >
                  <div aria-label="Resize from top-left" style={handle('nw', { left: '-7px', top: '-7px' })} onPointerDown={(e) => onPointerDown(e, { kind: 'resize', corner: 'nw' })} />
                  <div aria-label="Resize from top-right" style={handle('ne', { right: '-7px', top: '-7px' })} onPointerDown={(e) => onPointerDown(e, { kind: 'resize', corner: 'ne' })} />
                  <div aria-label="Resize from bottom-left" style={handle('sw', { left: '-7px', bottom: '-7px' })} onPointerDown={(e) => onPointerDown(e, { kind: 'resize', corner: 'sw' })} />
                  <div aria-label="Resize from bottom-right" style={handle('se', { right: '-7px', bottom: '-7px' })} onPointerDown={(e) => onPointerDown(e, { kind: 'resize', corner: 'se' })} />
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '8px 16px', color: 'var(--danger)', fontSize: '0.85rem', borderTop: '1px solid var(--border-color)' }}>{error}</div>
        )}

        {/* Aspect-ratio presets row */}
        {rect && naturalSize && (
          <div style={{ padding: '8px 1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Aspect:</span>
            {([
              { label: 'Free', ratio: null as number | null },
              { label: '1:1', ratio: 1 },
              { label: '4:3', ratio: 4 / 3 },
              { label: '16:9', ratio: 16 / 9 },
            ] as const).map(({ label, ratio }) => (
              <button
                key={label}
                onClick={() => applyAspect(ratio)}
                disabled={saving}
                aria-label={ratio === null ? 'Reset to freeform crop' : `Snap crop to ${label} aspect ratio`}
                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', cursor: saving ? 'default' : 'pointer', fontSize: '0.78rem' }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {rect && naturalSize
              ? `Crop: ${rect.width}×${rect.height} (from ${naturalSize.w}×${naturalSize.h})`
              : 'Loading image…'}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={!rect || saving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Check size={14} /> {saving ? 'Saving…' : 'Save crop'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
