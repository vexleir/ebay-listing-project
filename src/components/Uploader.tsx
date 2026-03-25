import React, { useRef, useState, useEffect } from 'react';
import { UploadCloud, X, Image as ImageIcon, Sparkles, CheckCircle2, Circle, GripVertical, Barcode, Scissors } from 'lucide-react';

interface UploaderProps {
  images: File[];
  setImages: React.Dispatch<React.SetStateAction<File[]>>;
  instructions: string;
  setInstructions: (val: string) => void;
  onGenerate: (images: File[], instructions: string) => void;
  isGenerating: boolean;
  disabled: boolean;
  appPassword?: string;
}

export default function Uploader({
  images, setImages, instructions, setInstructions, onGenerate, isGenerating, disabled, appPassword = ''
}: UploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<File>>(new Set());
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Stable object URL cache — prevents new URLs from being created on every render
  const urlCacheRef = useRef<Map<File, string>>(new Map());
  const getUrl = (file: File) => {
    if (!urlCacheRef.current.has(file)) {
      urlCacheRef.current.set(file, URL.createObjectURL(file));
    }
    return urlCacheRef.current.get(file)!;
  };
  useEffect(() => {
    const current = new Set(images);
    for (const [file, url] of urlCacheRef.current) {
      if (!current.has(file)) {
        URL.revokeObjectURL(url);
        urlCacheRef.current.delete(file);
      }
    }
  }, [images]);

  useEffect(() => {
    if (images.length === 0) setSelectedFiles(new Set());
  }, [images]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIdx === null) setIsDragging(true); // only highlight for external file drops
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (draggedIdx !== null) return; // internal reorder — ignore on the file drop zone
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
      setImages(prev => [...prev, ...newFiles]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
      setImages(prev => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    const fileToRemove = images[index];
    setImages(prev => prev.filter((_, i) => i !== index));
    setSelectedFiles(prev => {
      const next = new Set(prev);
      next.delete(fileToRemove);
      return next;
    });
  };

  const [removingBgIdx, setRemovingBgIdx] = useState<number | null>(null);

  const removeBackground = async (index: number) => {
    setRemovingBgIdx(index);
    try {
      const file = images[index];
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      const resp = await fetch('/api/images/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-password': appPassword },
        body: JSON.stringify({ imageBase64: base64 })
      });
      const data = await resp.json();
      if (data.error) { alert('Background removal failed: ' + data.error); return; }
      // Convert data URL back to File
      const res = await fetch(data.imageBase64);
      const blob = await res.blob();
      const newFile = new File([blob], file.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' });
      setImages(prev => {
        const arr = [...prev];
        arr[index] = newFile;
        return arr;
      });
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (next.has(file)) { next.delete(file); next.add(newFile); }
        return next;
      });
    } catch (e: any) {
      alert('Background removal failed: ' + e.message);
    } finally {
      setRemovingBgIdx(null);
    }
  };

  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<{ title: string; brand: string; category: string; description: string } | null>(null);

  const lookupBarcode = async () => {
    const upc = barcodeInput.trim();
    if (!upc) return;
    setBarcodeLoading(true);
    setBarcodeResult(null);
    try {
      const resp = await fetch(`/api/barcode?upc=${encodeURIComponent(upc)}`, { headers: { 'x-app-password': appPassword } });
      const data = await resp.json();
      if (data.error) { setBarcodeResult(null); return; }
      setBarcodeResult(data);
      if (data.title) {
        const parts = [data.title, data.brand, data.description].filter(Boolean);
        setInstructions(parts.join('\n'));
      }
    } catch { /* ignore */ } finally {
      setBarcodeLoading(false);
    }
  };

  const toggleSelection = (file: File) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  return (
    <div className="glass-panel" style={{ padding: '2rem' }}>
      <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ImageIcon size={24} className="text-gradient" /> Product Images
      </h2>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragging ? 'var(--accent-color)' : 'var(--border-color)'}`,
          backgroundColor: isDragging ? 'var(--accent-light)' : 'rgba(0,0,0,0.2)',
          borderRadius: 'var(--radius-md)',
          padding: '3rem 2rem',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          marginBottom: '2rem'
        }}
      >
        <UploadCloud size={48} style={{ color: isDragging ? 'var(--accent-color)' : 'var(--text-secondary)', marginBottom: '1rem', transition: 'color 0.2s' }} />
        <h3 style={{ marginBottom: '8px' }}>Drag & Drop images here</h3>
        <p style={{ color: 'var(--text-secondary)' }}>or click to browse your files</p>
        <input
          type="file"
          multiple
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {images.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Select to analyze · drag to reorder. <span style={{ opacity: 0.7 }}>{selectedFiles.size} of {images.length} selected.</span>
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setSelectedFiles(new Set(images))}
                style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer' }}
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedFiles(new Set())}
                style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer' }}
              >
                Deselect All
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem' }}>
            {images.map((file, index) => {
              const isSelected = selectedFiles.has(file);
              const isDragOver = dragOverIdx === index;
              const isBeingDragged = draggedIdx === index;
              return (
                <div
                  key={index}
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    // Use a tiny delay so the drag ghost renders before state update
                    setTimeout(() => setDraggedIdx(index), 0);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverIdx !== index) setDragOverIdx(index);
                  }}
                  onDragLeave={(e) => {
                    // Only clear if we're actually leaving this element (not entering a child)
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverIdx(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (draggedIdx !== null && draggedIdx !== index) {
                      const from = draggedIdx;
                      setImages(prev => {
                        const arr = [...prev];
                        const [item] = arr.splice(from, 1);
                        arr.splice(index, 0, item);
                        return arr;
                      });
                    }
                    setDraggedIdx(null);
                    setDragOverIdx(null);
                  }}
                  onDragEnd={() => {
                    setDraggedIdx(null);
                    setDragOverIdx(null);
                  }}
                  onClick={() => !isBeingDragged && toggleSelection(file)}
                  style={{
                    position: 'relative', width: '120px', height: '120px', flexShrink: 0,
                    borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                    border: `2px solid ${isDragOver ? 'var(--accent-color)' : isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`,
                    cursor: 'grab',
                    opacity: isBeingDragged ? 0.35 : isSelected ? 1 : 0.6,
                    transition: 'border-color 0.15s, opacity 0.15s, box-shadow 0.15s',
                    boxShadow: isDragOver ? '0 0 0 3px rgba(99,102,241,0.4)' : 'none',
                    userSelect: 'none'
                  }}
                >
                  <img
                    src={getUrl(file)}
                    alt="Upload preview"
                    draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                  />
                  <div style={{ position: 'absolute', top: '8px', left: '8px', color: isSelected ? 'var(--accent-color)' : 'white', background: isSelected ? 'white' : 'rgba(0,0,0,0.5)', borderRadius: '50%', display: 'flex', pointerEvents: 'none' }}>
                    {isSelected ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                  </div>
                  <div style={{ position: 'absolute', bottom: '6px', left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.6)', pointerEvents: 'none' }}>
                    <GripVertical size={14} />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeImage(index); }}
                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={14} />
                  </button>
                  <button
                    title="Remove background"
                    onClick={(e) => { e.stopPropagation(); removeBackground(index); }}
                    disabled={removingBgIdx === index}
                    style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(99,102,241,0.85)', border: 'none', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                  >
                    {removingBgIdx === index ? <span style={{ fontSize: '9px' }}>...</span> : <Scissors size={12} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Barcode Lookup */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Barcode size={18} /> Barcode Lookup <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '4px' }}>optional</span></h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="input-base"
            placeholder="Scan or type UPC / EAN barcode..."
            value={barcodeInput}
            onChange={e => setBarcodeInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookupBarcode()}
            style={{ flex: 1 }}
          />
          <button onClick={lookupBarcode} disabled={barcodeLoading || !barcodeInput.trim()} className="btn-secondary" style={{ flexShrink: 0, padding: '10px 16px' }}>
            {barcodeLoading ? 'Looking up...' : 'Lookup'}
          </button>
        </div>
        {barcodeResult && (
          <div style={{ marginTop: '8px', padding: '10px 14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', fontSize: '0.85rem' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{barcodeResult.title}</p>
            {barcodeResult.brand && <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)' }}>Brand: {barcodeResult.brand}</p>}
            {barcodeResult.category && <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)' }}>Category: {barcodeResult.category}</p>}
            <p style={{ margin: '6px 0 0', color: 'var(--success)', fontSize: '0.78rem' }}>✓ Details added to instructions below</p>
          </div>
        )}
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Additional Instructions / Details</h3>
        <textarea
          className="input-base"
          placeholder="Enter any specific details, brand, model number, or condition notes..."
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={4}
        />
      </div>

      <button
        className="btn-primary"
        style={{ width: '100%', padding: '14px', fontSize: '1.1rem' }}
        onClick={() => {
          if (selectedFiles.size === 0 && instructions.trim() === '') {
            alert('No information is being sent. Please select at least one image or provide written instructions to analyze.');
            return;
          }
          onGenerate(Array.from(selectedFiles), instructions);
        }}
        disabled={disabled || isGenerating}
      >
        {isGenerating ? (
          <>
            <svg style={{ animation: 'spin 1s linear infinite', height: '20px', width: '20px' }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"></circle>
              <path d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="31.4" strokeDashoffset="15.7"></path>
            </svg>
            Analyzing Product & Generating Listing...
          </>
        ) : (
          <><Sparkles size={20} /> Analyze & Generate Listing</>
        )}
      </button>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
