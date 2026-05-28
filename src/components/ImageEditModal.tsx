// Image edit modal extracted from StagedListings.tsx (FE-001 era) so it can
// be reused by EditListingModal under IMG-003. Behavior is unchanged: shows
// existing image URLs with drag-to-reorder + remove, accepts new file uploads
// via a drop zone, and on Save uploads any new files to Cloudinary via
// /api/images/upload before invoking the parent's `onSave(images)` with the
// merged URL list.

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, X, GripVertical, UploadCloud } from 'lucide-react';
import type { StagedListing } from '../types';
import { useToast } from '../context/ToastContext';

export interface ImageEditModalProps {
  listing: StagedListing;
  appPassword: string;
  onSave: (images: string[]) => void;
  onClose: () => void;
}

export default function ImageEditModal({ listing, appPassword, onSave, onClose }: ImageEditModalProps) {
  const { toast } = useToast();
  const [images, setImages] = useState<string[]>(listing.images || []);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newFilePreviews, setNewFilePreviews] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const previews = valid.map((f) => URL.createObjectURL(f));
    setNewFiles((prev) => [...prev, ...valid]);
    setNewFilePreviews((prev) => [...prev, ...previews]);
  };

  const removeExisting = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));
  const removeNew = (idx: number) => {
    URL.revokeObjectURL(newFilePreviews[idx]);
    setNewFiles((prev) => prev.filter((_, i) => i !== idx));
    setNewFilePreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let uploadedUrls: string[] = [];
      if (newFiles.length > 0) {
        const base64Array = await Promise.all(
          newFiles.map(
            (file) =>
              new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
              }),
          ),
        );
        const resp = await fetch('/api/images/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appPassword}` },
          body: JSON.stringify({ images: base64Array }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        uploadedUrls = data.urls;
      }
      onSave([...images, ...uploadedUrls]);
    } catch (e: any) {
      toast('Failed to save images: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '560px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><ImagePlus size={18} /> Edit Images</h3>
          <button onClick={onClose} className="btn-icon" aria-label="Close image editor"><X size={18} /></button>
        </div>

        {/* Existing images — drag to reorder */}
        {images.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>Drag to reorder · click × to remove</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {images.map((src, idx) => {
                const isOver = dragOverIdx === idx;
                const isDragging = draggedIdx === idx;
                return (
                  <div
                    key={idx}
                    draggable={true}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setTimeout(() => setDraggedIdx(idx), 0); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; if (dragOverIdx !== idx) setDragOverIdx(idx); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverIdx(null); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedIdx !== null && draggedIdx !== idx) {
                        const from = draggedIdx;
                        setImages((prev) => {
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
                      position: 'relative', width: '90px', height: '90px', flexShrink: 0,
                      borderRadius: '6px', overflow: 'hidden',
                      border: `2px solid ${isOver ? 'var(--accent-color)' : 'var(--border-color)'}`,
                      cursor: 'grab', opacity: isDragging ? 0.35 : 1,
                      boxShadow: isOver ? '0 0 0 3px rgba(99,102,241,0.35)' : 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s, opacity 0.15s',
                      userSelect: 'none',
                    }}
                  >
                    <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                    {idx === 0 && (
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(99,102,241,0.8)', fontSize: '0.62rem', textAlign: 'center', color: 'white', padding: '2px 0' }}>MAIN</div>
                    )}
                    <div style={{ position: 'absolute', top: '4px', left: '4px', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }}><GripVertical size={12} /></div>
                    <button onClick={() => removeExisting(idx)} aria-label={`Remove image ${idx + 1}`} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* New files preview */}
        {newFiles.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>New photos to upload ({newFiles.length})</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {newFilePreviews.map((src, idx) => (
                <div key={idx} style={{ position: 'relative', width: '90px', height: '90px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', border: '2px solid var(--success)' }}>
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => removeNew(idx)} aria-label={`Remove pending upload ${idx + 1}`} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
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
            {isSaving ? 'Uploading & Saving...' : `Save Images (${images.length + newFiles.length} total)`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
