// IMG-003 — image edit modal. Originally extracted from StagedListings for
// the staged tab; under IMG-003 the listed-item EditListingModal reuses it
// too, and slice 2 unified the "existing URL" / "new File" state into a
// single ordered `items` list so per-thumbnail edits (Crop / Rotate /
// Straighten / Scissors) preserve position.
//
// Each item is either a remote URL the parent supplied (e.g. an EPS or
// Cloudinary image already saved to the listing) or a local File that
// arrived via drop / file-picker / an in-place edit. On Save, all File-
// backed items are uploaded to Cloudinary via /api/images/upload and the
// emitted list mixes pass-through URLs with the freshly-uploaded URLs in
// the user's chosen order.

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ImagePlus, X, GripVertical, UploadCloud,
  Crop as CropIcon, RotateCw, Scaling, Scissors, Sliders,
} from 'lucide-react';
import type { StagedListing } from '../types';
import { useToast } from '../context/ToastContext';
import { rotateImageFile } from '../utils/imageRotate';
import { urlToFile } from '../utils/urlToFile';
import ImageCropModal from './ImageCropModal';
import ImageStraightenModal from './ImageStraightenModal';
import ImageEnhanceModal from './ImageEnhanceModal';

export interface ImageEditModalProps {
  listing: StagedListing;
  appPassword: string;
  onSave: (images: string[]) => void;
  onClose: () => void;
}

// One slot in the ordered image list. Either `url` (passthrough) or
// `file` (needs upload on save) is set, never both.
interface ItemSlot {
  id: string;
  url: string | null;
  file: File | null;
  previewUrl: string;       // What the <img> renders. For files this is a blob: URL.
  blobUrlOwned: boolean;    // Whether we created the blob URL (so we know when to revoke).
}

let nextId = 0;
function makeItemFromUrl(url: string): ItemSlot {
  return { id: `i${++nextId}`, url, file: null, previewUrl: url, blobUrlOwned: false };
}
function makeItemFromFile(file: File): ItemSlot {
  const previewUrl = URL.createObjectURL(file);
  return { id: `i${++nextId}`, url: null, file, previewUrl, blobUrlOwned: true };
}

export default function ImageEditModal({ listing, appPassword, onSave, onClose }: ImageEditModalProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<ItemSlot[]>(() =>
    (listing.images || []).map((u) => makeItemFromUrl(u)),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track in-flight per-item operations so we can show a spinner without
  // blocking the whole modal.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cropFor, setCropFor] = useState<{ id: string; file: File } | null>(null);
  const [straightenFor, setStraightenFor] = useState<{ id: string; file: File } | null>(null);
  const [enhanceFor, setEnhanceFor] = useState<{ id: string; file: File } | null>(null);

  // Revoke any blob: URLs we created when the modal unmounts.
  useEffect(() => () => {
    items.forEach((it) => { if (it.blobUrlOwned) URL.revokeObjectURL(it.previewUrl); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (valid.length === 0) return;
    setItems((prev) => [...prev, ...valid.map((f) => makeItemFromFile(f))]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target && target.blobUrlOwned) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  };

  // Replaces an item with a new file-backed version, revoking the old blob:
  // URL if we owned it. Used by all four per-thumbnail edit actions.
  const replaceWithFile = (id: string, next: File) => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      if (it.blobUrlOwned) URL.revokeObjectURL(it.previewUrl);
      return makeItemFromFile(next);
    }));
  };

  // Returns a File representation of the item — either the local file or a
  // freshly-fetched one for URL-backed slots.
  const ensureFile = async (item: ItemSlot): Promise<File> => {
    if (item.file) return item.file;
    if (!item.url) throw new Error('Item has neither a file nor a URL');
    return urlToFile(item.url);
  };

  // Rotate runs synchronously and does not need a sub-modal.
  const handleRotate = async (item: ItemSlot) => {
    setBusyId(item.id);
    try {
      const original = await ensureFile(item);
      const rotated = await rotateImageFile(original, 90);
      replaceWithFile(item.id, rotated);
    } catch (e: any) {
      toast('Rotate failed: ' + (e?.message || 'unknown error'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCropClick = async (item: ItemSlot) => {
    setBusyId(item.id);
    try {
      const file = await ensureFile(item);
      setCropFor({ id: item.id, file });
    } catch (e: any) {
      toast('Could not load image for crop: ' + (e?.message || 'unknown error'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleStraightenClick = async (item: ItemSlot) => {
    setBusyId(item.id);
    try {
      const file = await ensureFile(item);
      setStraightenFor({ id: item.id, file });
    } catch (e: any) {
      toast('Could not load image for straighten: ' + (e?.message || 'unknown error'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleEnhanceClick = async (item: ItemSlot) => {
    setBusyId(item.id);
    try {
      const file = await ensureFile(item);
      setEnhanceFor({ id: item.id, file });
    } catch (e: any) {
      toast('Could not load image for enhance: ' + (e?.message || 'unknown error'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  // Background-removal calls the existing /api/images/remove-bg endpoint.
  // The response is a data: URI which we wrap into a File and slot back.
  const handleRemoveBg = async (item: ItemSlot) => {
    setBusyId(item.id);
    try {
      const file = await ensureFile(item);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const resp = await fetch('/api/images/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appPassword}` },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'remove-bg failed');
      const dataUrl: string = data.imageBase64;
      // data: URL → blob → File
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const newName = file.name.replace(/\.[^.]+$/, '') + '.png';
      replaceWithFile(item.id, new File([blob], newName, { type: 'image/png' }));
    } catch (e: any) {
      toast('Background removal failed: ' + (e?.message || 'unknown error'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Split: file-backed items get uploaded, url-backed pass through.
      const toUpload: { idx: number; file: File }[] = [];
      items.forEach((it, idx) => { if (it.file) toUpload.push({ idx, file: it.file }); });

      let uploadedUrls: string[] = [];
      if (toUpload.length > 0) {
        // Cloudinary's uploader expects the FULL data URI
        // (`data:image/png;base64,iVBORw0…`). Stripping the prefix here was
        // the original IMG-003 save bug — Cloudinary then errored with no
        // `.message`, the server's `{ error: undefined }` serialized to
        // `{}`, and the user saw "Failed to save images: {}".
        const dataUrls = await Promise.all(toUpload.map(({ file }) => new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })));
        const resp = await fetch('/api/images/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appPassword}` },
          body: JSON.stringify({ images: dataUrls }),
        });
        if (!resp.ok) {
          // Surface HTTP status + body so future failures are diagnosable
          // (the previous shape was `throw new Error("{}")`).
          const body = await resp.text().catch(() => '');
          throw new Error(`Image upload failed (${resp.status} ${resp.statusText})${body ? `: ${body}` : ''}`);
        }
        const data = await resp.json();
        if (!Array.isArray(data?.urls)) {
          throw new Error('Image upload returned an unexpected response shape');
        }
        uploadedUrls = data.urls as string[];
      }

      // Re-merge in the original item order.
      let uploadCursor = 0;
      const out: string[] = items.map((it) => {
        if (it.url) return it.url;
        return uploadedUrls[uploadCursor++];
      });
      onSave(out);
    } catch (e: any) {
      toast('Failed to save images: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const filesCount = items.filter((it) => it.file !== null).length;
  const urlCount = items.length - filesCount;

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '560px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><ImagePlus size={18} /> Edit Images</h3>
          <button onClick={onClose} className="btn-icon" aria-label="Close image editor"><X size={18} /></button>
        </div>

        {items.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Drag to reorder · use the icons to crop, rotate, straighten, or remove background
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {items.map((it, idx) => {
                const isOver = dragOverIdx === idx;
                const isDragging = draggedIdx === idx;
                const isBusy = busyId === it.id;
                return (
                  <div
                    key={it.id}
                    draggable={true}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setTimeout(() => setDraggedIdx(idx), 0); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; if (dragOverIdx !== idx) setDragOverIdx(idx); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverIdx(null); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedIdx !== null && draggedIdx !== idx) {
                        const from = draggedIdx;
                        setItems((prev) => {
                          const arr = [...prev];
                          const [item] = arr.splice(from, 1);
                          arr.splice(idx, 0, item);
                          return arr;
                        });
                      }
                      setDraggedIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
                    style={{
                      position: 'relative', width: '110px', height: '110px', flexShrink: 0,
                      borderRadius: '6px', overflow: 'hidden',
                      border: `2px solid ${isOver ? 'var(--accent-color)' : it.file ? 'var(--success)' : 'var(--border-color)'}`,
                      cursor: 'grab', opacity: isDragging ? 0.35 : 1,
                      boxShadow: isOver ? '0 0 0 3px rgba(99,102,241,0.35)' : 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s, opacity 0.15s',
                      userSelect: 'none',
                    }}
                  >
                    <img src={it.previewUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                    {idx === 0 && (
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(99,102,241,0.8)', fontSize: '0.6rem', textAlign: 'center', color: 'white', padding: '2px 0' }}>MAIN</div>
                    )}
                    <div style={{ position: 'absolute', top: '4px', left: '4px', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }}><GripVertical size={12} /></div>
                    <button onClick={() => removeItem(it.id)} aria-label={`Remove image ${idx + 1}`} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                      <X size={11} />
                    </button>
                    {/* Per-thumbnail edit row — 5 buttons (Crop / Straighten /
                        Rotate / Enhance / Scissors). Shrunk to 18px with 2px
                        gaps so all five fit in the 110px thumbnail. */}
                    <div
                      style={{ position: 'absolute', bottom: '4px', right: '4px', display: 'flex', gap: '2px', opacity: isBusy ? 0.5 : 1 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        title="Crop image"
                        aria-label="Crop image"
                        disabled={isBusy}
                        onClick={() => handleCropClick(it)}
                        style={{ background: 'rgba(99,102,241,0.85)', border: 'none', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                      ><CropIcon size={10} /></button>
                      <button
                        title="Straighten image"
                        aria-label="Straighten image"
                        disabled={isBusy}
                        onClick={() => handleStraightenClick(it)}
                        style={{ background: 'rgba(99,102,241,0.85)', border: 'none', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                      ><Scaling size={10} /></button>
                      <button
                        title="Rotate 90° clockwise"
                        aria-label="Rotate image 90 degrees clockwise"
                        disabled={isBusy}
                        onClick={() => handleRotate(it)}
                        style={{ background: 'rgba(99,102,241,0.85)', border: 'none', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                      ><RotateCw size={10} /></button>
                      <button
                        title="Enhance (brightness / contrast / saturation)"
                        aria-label="Enhance image"
                        disabled={isBusy}
                        onClick={() => handleEnhanceClick(it)}
                        style={{ background: 'rgba(99,102,241,0.85)', border: 'none', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                      ><Sliders size={10} /></button>
                      <button
                        title="Remove background"
                        aria-label="Remove background"
                        disabled={isBusy}
                        onClick={() => handleRemoveBg(it)}
                        style={{ background: 'rgba(99,102,241,0.85)', border: 'none', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                      ><Scissors size={10} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              {urlCount} existing · {filesCount} pending upload
            </p>
          </div>
        )}

        {/* Drop zone for adding new images */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingFiles(true); }}
          onDragLeave={() => setIsDraggingFiles(false)}
          onDrop={(e) => { e.preventDefault(); setIsDraggingFiles(false); addFiles(e.dataTransfer.files); }}
          style={{ border: `2px dashed ${isDraggingFiles ? 'var(--accent-color)' : 'var(--border-color)'}`, borderRadius: '8px', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', background: isDraggingFiles ? 'var(--accent-light)' : 'rgba(0,0,0,0.2)', transition: 'all 0.2s', marginBottom: '1.5rem' }}
        >
          <UploadCloud size={28} style={{ color: isDraggingFiles ? 'var(--accent-color)' : 'var(--text-secondary)', marginBottom: '8px' }} />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>Drop photos here or click to browse</p>
          <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={(e) => addFiles(e.target.files)} style={{ display: 'none' }} />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Uploading & Saving...' : `Save Images (${items.length} total)`}
          </button>
        </div>
      </div>

      {/* Per-item sub-modals */}
      {cropFor && (
        <ImageCropModal
          file={cropFor.file}
          onSave={(next) => { replaceWithFile(cropFor.id, next); setCropFor(null); }}
          onCancel={() => setCropFor(null)}
        />
      )}
      {straightenFor && (
        <ImageStraightenModal
          file={straightenFor.file}
          onSave={(next) => { replaceWithFile(straightenFor.id, next); setStraightenFor(null); }}
          onCancel={() => setStraightenFor(null)}
        />
      )}
      {enhanceFor && (
        <ImageEnhanceModal
          file={enhanceFor.file}
          onSave={(next) => { replaceWithFile(enhanceFor.id, next); setEnhanceFor(null); }}
          onCancel={() => setEnhanceFor(null)}
        />
      )}
    </div>,
    document.body,
  );
}
