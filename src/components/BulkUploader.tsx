import { useRef, useState, useEffect, useMemo } from 'react';
import { UploadCloud, X, Sparkles, CheckCircle2, Circle, Plus, Layers, Trash2, RotateCw, AlertTriangle, Check, Ban, Copy } from 'lucide-react';
import { generateListing } from '../services/ai';
import type { StagedListing } from '../types';
import { useToast } from '../context/ToastContext';
import { computeAverageHash, findDuplicateGroups } from '../utils/imageHash';

type GroupStatus = 'pending' | 'generating' | 'success' | 'failed';

interface GeneratedResult {
  title: string;
  description: string;
  condition: string;
  itemSpecifics: Record<string, string>;
  category: string;
  priceRecommendation: string;
  priceJustification?: string;
  shippingEstimate: string;
  tags?: string[];
  seoKeywords?: string;
}

interface Group {
  id: string;
  files: File[];
  status: GroupStatus;
  error?: string;
  result?: GeneratedResult;
  staged?: boolean;
}

interface BulkUploaderProps {
  onStage: (listing: Omit<StagedListing, 'id' | 'createdAt'>) => Promise<void> | void;
  appPassword: string;
}

const CONCURRENCY = 3;
const GENERATE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes per group before auto-abort

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function BulkUploader({ onStage, appPassword }: BulkUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [allImages, setAllImages] = useState<File[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<File>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStaging, setIsStaging] = useState(false);

  // Stable object URLs for previews
  const urlCacheRef = useRef<Map<File, string>>(new Map());
  const getUrl = (file: File) => {
    if (!urlCacheRef.current.has(file)) {
      urlCacheRef.current.set(file, URL.createObjectURL(file));
    }
    return urlCacheRef.current.get(file)!;
  };
  useEffect(() => {
    const current = new Set(allImages);
    for (const [file, url] of urlCacheRef.current) {
      if (!current.has(file)) {
        URL.revokeObjectURL(url);
        urlCacheRef.current.delete(file);
      }
    }
  }, [allImages]);

  // IMG-002 (lite) — perceptual hash per uploaded image, computed lazily
  // off the main thread (well, off the render anyway). The hash map is a
  // ref so the async fills don't re-trigger renders mid-compute; we bump a
  // version counter at the end of each batch to materialize the
  // duplicate groups into state for the banner.
  const hashesRef = useRef<Map<File, string>>(new Map());
  const [hashVersion, setHashVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const pending = allImages.filter((f) => !hashesRef.current.has(f));
    if (pending.length === 0) return;
    (async () => {
      let anyAdded = false;
      for (const file of pending) {
        try {
          const hash = await computeAverageHash(file);
          if (cancelled) return;
          hashesRef.current.set(file, hash);
          anyAdded = true;
        } catch {
          // Couldn't hash this file (canvas/CORS/etc) — skip silently. The
          // banner just won't flag it; the upload itself still works.
        }
      }
      if (!cancelled && anyAdded) setHashVersion((v) => v + 1);
    })();
    return () => { cancelled = true; };
  }, [allImages]);

  // Clean hashes for files no longer in the upload pool.
  useEffect(() => {
    const current = new Set(allImages);
    for (const file of Array.from(hashesRef.current.keys())) {
      if (!current.has(file)) hashesRef.current.delete(file);
    }
  }, [allImages]);

  const duplicateGroups = useMemo(() => {
    // Use the index in allImages as the stable id since File names can collide.
    const entries: { id: string; hash: string }[] = [];
    allImages.forEach((file, idx) => {
      const hash = hashesRef.current.get(file);
      if (hash) entries.push({ id: String(idx), hash });
    });
    return findDuplicateGroups(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allImages, hashVersion]);

  const groupedFileSet = useMemo(() => {
    const s = new Set<File>();
    groups.forEach(g => g.files.forEach(f => s.add(f)));
    return s;
  }, [groups]);

  const ungrouped = useMemo(
    () => allImages.filter(f => !groupedFileSet.has(f)),
    [allImages, groupedFileSet],
  );

  const addFiles = (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    setAllImages(prev => [...prev, ...imgs]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleSelect = (file: File) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file); else next.add(file);
      return next;
    });
  };

  const removeFromAll = (file: File) => {
    setAllImages(prev => prev.filter(f => f !== file));
    setGroups(prev => prev.map(g => ({ ...g, files: g.files.filter(f => f !== file) })).filter(g => g.files.length > 0));
    setSelectedFiles(prev => {
      const next = new Set(prev);
      next.delete(file);
      return next;
    });
  };

  const createGroupFromSelection = () => {
    const picked = Array.from(selectedFiles).filter(f => !groupedFileSet.has(f));
    if (picked.length === 0) {
      toast('Select one or more ungrouped images to create a group.', 'info');
      return;
    }
    setGroups(prev => [
      ...prev,
      { id: crypto.randomUUID(), files: picked, status: 'pending' },
    ]);
    setSelectedFiles(new Set());
  };

  const addSelectionToGroup = (groupId: string) => {
    const picked = Array.from(selectedFiles).filter(f => !groupedFileSet.has(f));
    if (picked.length === 0) return;
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, files: [...g.files, ...picked] } : g));
    setSelectedFiles(new Set());
  };

  const removeFileFromGroup = (groupId: string, file: File) => {
    setGroups(prev => prev
      .map(g => g.id === groupId ? { ...g, files: g.files.filter(f => f !== file) } : g)
      .filter(g => g.files.length > 0));
  };

  const removeGroup = (groupId: string) => {
    setGroups(prev => prev.filter(g => g.id !== groupId));
  };

  // Per-group AbortControllers so stuck/hung groups can be cancelled individually.
  const abortersRef = useRef<Map<string, AbortController>>(new Map());
  // Keep a ref of groups so the worker loop reads the freshest files when it starts a job.
  const groupsRef = useRef<Group[]>([]);
  useEffect(() => { groupsRef.current = groups; }, [groups]);

  const generateOne = async (group: Group, signal: AbortSignal): Promise<Partial<Group>> => {
    try {
      const result = await generateListing(group.files, '', appPassword, signal);
      return { status: 'success', result, error: undefined };
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'Cancelled (timed out or manually stopped)' : (e?.message || 'Generation failed');
      return { status: 'failed', error: msg };
    }
  };

  const runOne = async (id: string) => {
    const controller = new AbortController();
    abortersRef.current.set(id, controller);
    const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
    setGroups(prev => prev.map(g => g.id === id ? { ...g, status: 'generating', error: undefined } : g));
    const current = groupsRef.current.find(g => g.id === id);
    if (!current) {
      clearTimeout(timer);
      abortersRef.current.delete(id);
      return;
    }
    const patch = await generateOne(current, controller.signal);
    clearTimeout(timer);
    abortersRef.current.delete(id);
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...patch } : g));
  };

  const runPool = async (targetIds: string[]) => {
    const queue = [...targetIds];
    const workers = Array(Math.min(CONCURRENCY, queue.length)).fill(0).map(async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) continue;
        await runOne(id);
      }
    });
    await Promise.all(workers);
  };

  const handleGenerateAll = async () => {
    const pending = groups.filter(g => (g.status === 'pending' || g.status === 'failed') && !g.staged);
    if (pending.length === 0) {
      toast('No groups to generate. Create at least one group first.', 'info');
      return;
    }
    setIsGenerating(true);
    try {
      await runPool(pending.map(g => g.id));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRetryGroup = (groupId: string) => {
    // Fire independently — doesn't block on the global batch pool.
    void runOne(groupId);
  };

  const handleCancelGroup = (groupId: string) => {
    const controller = abortersRef.current.get(groupId);
    if (controller) controller.abort();
    else {
      // No in-flight request (shouldn't happen, but be defensive): mark failed directly.
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, status: 'failed', error: 'Cancelled' } : g));
    }
  };

  const handleStageAll = async () => {
    const ready = groups.filter(g => g.status === 'success' && !g.staged && g.result);
    if (ready.length === 0) {
      toast('No successfully-generated groups to stage.', 'info');
      return;
    }
    setIsStaging(true);
    try {
      for (const g of ready) {
        const imageDataUrls = await Promise.all(g.files.map(fileToDataUrl));
        const r = g.result!;
        await onStage({
          title: r.title,
          description: r.description,
          condition: r.condition,
          itemSpecifics: r.itemSpecifics,
          category: r.category,
          priceRecommendation: r.priceRecommendation,
          priceJustification: r.priceJustification,
          shippingEstimate: r.shippingEstimate,
          tags: r.tags,
          seoKeywords: r.seoKeywords,
          images: imageDataUrls,
        } as Omit<StagedListing, 'id' | 'createdAt'>);
        setGroups(prev => prev.map(x => x.id === g.id ? { ...x, staged: true } : x));
      }
      toast(`${ready.length} listing${ready.length > 1 ? 's' : ''} staged.`, 'success');
    } catch (e: any) {
      toast('Staging failed: ' + (e?.message || 'unknown error'), 'error');
    } finally {
      setIsStaging(false);
    }
  };

  const counts = useMemo(() => {
    const c = { total: groups.length, success: 0, failed: 0, pending: 0, generating: 0, staged: 0 };
    groups.forEach(g => {
      if (g.staged) c.staged++;
      else if (g.status === 'success') c.success++;
      else if (g.status === 'failed') c.failed++;
      else if (g.status === 'generating') c.generating++;
      else c.pending++;
    });
    return c;
  }, [groups]);

  const stageableCount = counts.success; // success but not staged
  const selectedUngroupedCount = Array.from(selectedFiles).filter(f => !groupedFileSet.has(f)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="glass-panel" style={{ padding: '1.5rem 2rem' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Layers size={24} className="text-gradient" /> Bulk Listing Creator
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: '6px 0 0', fontSize: '0.9rem' }}>
          Upload many images, group them by product, then generate SEO-optimized listings for all groups at once.
        </p>
      </div>

      {/* Upload dropzone */}
      <div className="glass-panel responsive-panel-padding">
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragging ? 'var(--accent-color)' : 'var(--border-color)'}`,
            backgroundColor: isDragging ? 'var(--accent-light)' : 'rgba(0,0,0,0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '2.5rem 2rem',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <UploadCloud size={44} style={{ color: isDragging ? 'var(--accent-color)' : 'var(--text-secondary)', marginBottom: '0.75rem' }} />
          <h3 style={{ margin: '0 0 6px' }}>Drag & drop images or click to browse</h3>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            {allImages.length} uploaded &middot; {ungrouped.length} ungrouped &middot; {groups.length} group{groups.length === 1 ? '' : 's'}
          </p>
          <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
        </div>
      </div>

      {/* IMG-002 (lite) — duplicate-photo banner. Shows up when ≥1 group
          of likely-duplicate uploads is detected via perceptual hash. */}
      {duplicateGroups.length > 0 && (
        <div
          role="status"
          className="glass-panel"
          style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.35)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}
        >
          <Copy size={16} style={{ color: 'var(--warning)', marginTop: '2px', flexShrink: 0 }} aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--warning)' }}>
              {duplicateGroups.length === 1
                ? `Found ${duplicateGroups[0].length} likely-duplicate images in this upload.`
                : `Found ${duplicateGroups.length} likely-duplicate groups (${duplicateGroups.reduce((sum, g) => sum + g.length, 0)} photos total).`}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              These look like the same photo. Remove the extras before grouping so each listing has unique images.
            </div>
          </div>
        </div>
      )}

      {/* Ungrouped pool */}
      {ungrouped.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ margin: 0 }}>Ungrouped images</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Click to select, then create a group. {selectedUngroupedCount} of {ungrouped.length} selected.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => setSelectedFiles(new Set(ungrouped))}
                style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer' }}
              >
                Select all
              </button>
              <button
                onClick={() => setSelectedFiles(new Set())}
                style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer' }}
              >
                Deselect all
              </button>
              <button
                className="btn-primary"
                onClick={createGroupFromSelection}
                disabled={selectedUngroupedCount === 0}
                style={{ fontSize: '0.85rem', padding: '6px 14px' }}
              >
                <Plus size={16} /> New group from selection
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {ungrouped.map((file, idx) => {
              const isSelected = selectedFiles.has(file);
              return (
                <div
                  key={idx}
                  onClick={() => toggleSelect(file)}
                  style={{
                    position: 'relative', width: '100px', height: '100px',
                    borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                    border: `2px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`,
                    cursor: 'pointer',
                    opacity: isSelected ? 1 : 0.65,
                    transition: 'opacity 0.15s, border-color 0.15s',
                  }}
                >
                  <img src={getUrl(file)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', top: '6px', left: '6px', color: isSelected ? 'var(--accent-color)' : 'white', background: isSelected ? 'white' : 'rgba(0,0,0,0.5)', borderRadius: '50%', display: 'flex', pointerEvents: 'none' }}>
                    {isSelected ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFromAll(file); }}
                    style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Groups */}
      {groups.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0 }}>Listing groups ({groups.length})</h3>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Staged: {counts.staged} &middot; Ready: {counts.success} &middot; Failed: {counts.failed} &middot; Pending: {counts.pending + counts.generating}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className="btn-secondary"
                onClick={handleGenerateAll}
                disabled={isGenerating || isStaging || (counts.pending + counts.failed === 0)}
                style={{ padding: '10px 16px' }}
              >
                {isGenerating ? (
                  <>
                    <svg style={{ animation: 'spin 1s linear infinite', height: '18px', width: '18px' }} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"></circle>
                      <path d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="31.4" strokeDashoffset="15.7"></path>
                    </svg>
                    Generating ({counts.generating} of {counts.pending + counts.generating})
                  </>
                ) : (
                  <><Sparkles size={16} /> Generate all ({counts.pending + counts.failed})</>
                )}
              </button>
              <button
                className="btn-primary"
                onClick={handleStageAll}
                disabled={isStaging || stageableCount === 0}
                style={{ padding: '10px 16px' }}
              >
                {isStaging ? 'Staging…' : <>Stage {stageableCount} successful</>}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {groups.map((g, i) => (
              <GroupCard
                key={g.id}
                group={g}
                index={i}
                getUrl={getUrl}
                canAddSelection={selectedUngroupedCount > 0 && !g.staged}
                onAddSelection={() => addSelectionToGroup(g.id)}
                onRemoveFile={(f) => removeFileFromGroup(g.id, f)}
                onRemove={() => removeGroup(g.id)}
                onRetry={() => handleRetryGroup(g.id)}
                onCancel={() => handleCancelGroup(g.id)}
                isStaging={isStaging}
              />
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 && ungrouped.length === 0 && (
        <div className="glass-panel responsive-panel-padding" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          Upload images to get started. Group them by product, then generate listings in bulk.
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

interface GroupCardProps {
  group: Group;
  index: number;
  getUrl: (f: File) => string;
  canAddSelection: boolean;
  onAddSelection: () => void;
  onRemoveFile: (f: File) => void;
  onRemove: () => void;
  onRetry: () => void;
  onCancel: () => void;
  isStaging: boolean;
}

function GroupCard({ group, index, getUrl, canAddSelection, onAddSelection, onRemoveFile, onRemove, onRetry, onCancel, isStaging }: GroupCardProps) {
  const isGenerating = group.status === 'generating';
  const editDisabled = isGenerating || isStaging || group.staged;
  const statusBadge = () => {
    if (group.staged) return <Badge color="#10b981" icon={<Check size={12} />} label="Staged" />;
    switch (group.status) {
      case 'success': return <Badge color="#10b981" icon={<Check size={12} />} label="Ready" />;
      case 'failed': return <Badge color="#ef4444" icon={<AlertTriangle size={12} />} label="Failed" />;
      case 'generating': return <Badge color="#6366f1" icon={<Spinner />} label="Generating…" />;
      default: return <Badge color="#9ca3af" icon={<Circle size={12} />} label="Pending" />;
    }
  };

  return (
    <div className="glass-card" style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: 600 }}>Group {index + 1}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{group.files.length} image{group.files.length === 1 ? '' : 's'}</span>
          {statusBadge()}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {canAddSelection && !group.staged && !isGenerating && (
            <button onClick={onAddSelection} disabled={isStaging} style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer' }}>
              <Plus size={12} style={{ verticalAlign: 'middle' }} /> Add selected
            </button>
          )}
          {group.status === 'failed' && !group.staged && (
            <button onClick={onRetry} disabled={isStaging} style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer' }}>
              <RotateCw size={12} style={{ verticalAlign: 'middle' }} /> Retry
            </button>
          )}
          {isGenerating && (
            <button onClick={onCancel} title="Cancel this generation" style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', borderRadius: '6px', cursor: 'pointer' }}>
              <Ban size={12} style={{ verticalAlign: 'middle' }} /> Cancel
            </button>
          )}
          {!group.staged && !isGenerating && (
            <button onClick={onRemove} disabled={editDisabled} title="Remove group (returns images to ungrouped)" style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', borderRadius: '6px', cursor: 'pointer' }}>
              <Trash2 size={12} style={{ verticalAlign: 'middle' }} /> Ungroup
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: group.result || group.error ? '10px' : 0 }}>
        {group.files.map((f, i) => (
          <div key={i} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <img src={getUrl(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {!group.staged && !isGenerating && (
              <button
                onClick={() => onRemoveFile(f)}
                disabled={isStaging}
                style={{ position: 'absolute', top: '3px', right: '3px', background: 'rgba(0,0,0,0.75)', border: 'none', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
      </div>

      {group.result && (
        <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '6px', fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '2px' }}>{group.result.title}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            {group.result.condition} &middot; ${group.result.priceRecommendation} &middot; {group.result.category}
          </div>
        </div>
      )}

      {group.error && group.status === 'failed' && (
        <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', fontSize: '0.85rem', color: '#fca5a5' }}>
          {group.error}
        </div>
      )}
    </div>
  );
}

function Badge({ color, icon, label }: { color: string; icon: React.ReactNode; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', background: `${color}22`, color, fontSize: '0.75rem', fontWeight: 500, border: `1px solid ${color}55` }}>
      {icon} {label}
    </span>
  );
}

function Spinner() {
  return (
    <svg style={{ animation: 'spin 1s linear infinite', height: '12px', width: '12px' }} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
      <path d="M12 2C6.47715 2 2 6.47715 2 12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
