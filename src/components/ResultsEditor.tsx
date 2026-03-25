import { useState, useEffect, useRef } from 'react';
import { Save, X, Eye, Code, Type, LayoutTemplate, Tag, Wand2, GripVertical } from 'lucide-react';
import type { StagedListing } from '../types';
import { useToast } from '../context/ToastContext';

interface ResultsEditorProps {
  data: {
    title: string; description: string; condition: string;
    itemSpecifics: Record<string, string>; category: string;
    priceRecommendation: string; priceJustification?: string; shippingEstimate: string;
    sku?: string; sellerNotes?: string; costBasis?: string; tags?: string[];
  };
  images: File[];
  existingImageUrls?: string[];
  onStage: (listing: Omit<StagedListing, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
  appPassword?: string;
}

export default function ResultsEditor({ data, images, existingImageUrls, onStage, onCancel, appPassword = '' }: ResultsEditorProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(data.title);
  const [description, setDescription] = useState(data.description);
  const [condition, setCondition] = useState(data.condition);
  const [category, setCategory] = useState(data.category);
  const [priceRecommendation, setPriceRecommendation] = useState(data.priceRecommendation);
  const [priceJustification] = useState(data.priceJustification || '');
  const [shippingEstimate, setShippingEstimate] = useState(data.shippingEstimate);
  const [itemSpecifics, setItemSpecifics] = useState<Record<string, string>>(data.itemSpecifics);
  const [sku, setSku] = useState(data.sku || '');
  const [sellerNotes, setSellerNotes] = useState(data.sellerNotes || '');
  const [costBasis, setCostBasis] = useState(data.costBasis || '');
  const [tags, setTags] = useState<string[]>(data.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [previewMode, setPreviewMode] = useState<boolean>(true);

  // Category suggestions
  const [catSuggestions, setCatSuggestions] = useState<{ id: string; name: string }[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchCategorySuggestions = async () => {
    if (!title.trim()) { toast('Enter a title first to get category suggestions.', 'info'); return; }
    setCatLoading(true);
    try {
      const resp = await fetch(`/api/ebay/categories?query=${encodeURIComponent(title)}`, {
        headers: { 'x-app-password': appPassword }
      });
      const data = await resp.json();
      if (data.length === 0) toast('No category suggestions found. Make sure eBay is connected.', 'info');
      else { setCatSuggestions(data); setCatOpen(true); }
    } catch {
      toast('Failed to fetch category suggestions.', 'error');
    } finally {
      setCatLoading(false);
    }
  };

  const [allImages, setAllImages] = useState<string[]>(existingImageUrls || []);
  const [imgDragOverIdx, setImgDragOverIdx] = useState<number | null>(null);
  const imgDraggedIdxRef = useRef<number | null>(null);

  useEffect(() => {
    if (images.length === 0) return;
    const convertImages = async () => {
      const b64s = await Promise.all(images.map(img => new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(img);
      })));
      setAllImages(prev => [...prev, ...b64s]);
    };
    convertImages();
  }, [images]);

  const titleLengthColor = title.length > 80 ? '#ef4444' : title.length >= 70 ? '#10b981' : '#f59e0b';

  return (
    <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <SparkleIcon /> Generated Listing
      </h2>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', paddingRight: '8px' }}>

        {/* Image strip */}
        {allImages.length > 0 && (
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Images <span style={{ opacity: 0.6, fontSize: '0.78rem' }}>— drag to reorder · first image is main</span>
            </label>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '6px' }}>
              {allImages.map((src, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={e => { imgDraggedIdxRef.current = idx; e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setImgDragOverIdx(idx); }}
                  onDragLeave={() => setImgDragOverIdx(null)}
                  onDrop={e => {
                    e.preventDefault();
                    const from = imgDraggedIdxRef.current;
                    if (from !== null && from !== idx) {
                      setAllImages(prev => {
                        const arr = [...prev];
                        const [item] = arr.splice(from, 1);
                        arr.splice(idx, 0, item);
                        return arr;
                      });
                    }
                    imgDraggedIdxRef.current = null;
                    setImgDragOverIdx(null);
                  }}
                  onDragEnd={() => { imgDraggedIdxRef.current = null; setImgDragOverIdx(null); }}
                  style={{
                    position: 'relative', width: '80px', height: '80px', flexShrink: 0,
                    borderRadius: '6px', overflow: 'hidden', cursor: 'grab',
                    border: `2px solid ${imgDragOverIdx === idx ? 'var(--accent-color)' : idx === 0 ? 'rgba(99,102,241,0.6)' : 'var(--border-color)'}`,
                    boxShadow: imgDragOverIdx === idx ? '0 0 0 3px rgba(99,102,241,0.35)' : 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    opacity: imgDraggedIdxRef.current === idx ? 0.3 : 1
                  }}
                >
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                  {idx === 0 && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(99,102,241,0.8)', fontSize: '0.6rem', textAlign: 'center', color: 'white', padding: '2px 0', letterSpacing: '0.05em' }}>MAIN</div>
                  )}
                  <div style={{ position: 'absolute', top: '3px', left: '3px', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }}>
                    <GripVertical size={11} />
                  </div>
                  <button
                    onClick={() => setAllImages(prev => prev.filter((_, i) => i !== idx))}
                    style={{ position: 'absolute', top: '3px', right: '3px', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Title */}
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Type size={16} /> SEO Title</span>
            <span style={{ color: titleLengthColor, fontWeight: 'bold' }}>{title.length} / 80</span>
          </label>
          <input type="text" className="input-base" value={title} onChange={e => setTitle(e.target.value)}
            style={{ borderColor: title.length > 80 ? '#ef4444' : 'var(--border-color)', fontSize: '1.1rem', fontWeight: 500 }} />
          {title.length > 80 && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '4px' }}>Warning: Title exceeds eBay's 80-character limit!</p>}
        </div>

        {/* Category + Price + SKU */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>Category</label>
            <div ref={catRef} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="text" className="input-base" value={category} onChange={e => setCategory(e.target.value)} style={{ flex: 1 }} />
                <button
                  onClick={fetchCategorySuggestions}
                  disabled={catLoading}
                  className="btn-icon"
                  title="Suggest categories from eBay"
                  style={{ background: 'rgba(99,102,241,0.15)', borderRadius: '8px', padding: '8px', flexShrink: 0, border: '1px solid var(--border-color)' }}
                >
                  <Wand2 size={16} style={{ color: catLoading ? 'var(--text-secondary)' : 'var(--accent-color)' }} />
                </button>
              </div>
              {catOpen && catSuggestions.length > 0 && (
                <div className="glass-panel" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: '4px', padding: '4px 0', maxHeight: '200px', overflowY: 'auto' }}>
                  {catSuggestions.map(s => (
                    <button key={s.id} onClick={() => { setCategory(s.name); setCatOpen(false); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>
              List Price (USD) <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '4px' }}>(sent to eBay)</span>
            </label>
            <input type="text" className="input-base" value={priceRecommendation} onChange={e => setPriceRecommendation(e.target.value)} placeholder="e.g. 49.99" />
            {priceJustification && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px', fontStyle: 'italic', lineHeight: 1.4 }}>
                💡 {priceJustification}
              </p>
            )}
          </div>
          <div>
            <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>SKU / Custom Label <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '4px' }}>(sent to eBay)</span></label>
            <input type="text" className="input-base" value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. ITEM-001" />
          </div>
          <div>
            <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>
              Cost Basis (USD) <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '4px' }}>(internal — what you paid)</span>
            </label>
            <input type="text" className="input-base" value={costBasis} onChange={e => setCostBasis(e.target.value)} placeholder="e.g. 12.50" />
          </div>
        </div>

        <div>
          <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>Shipping Estimate</label>
          <textarea className="input-base" value={shippingEstimate} onChange={e => setShippingEstimate(e.target.value)} rows={4} style={{ resize: 'vertical' }} />
        </div>

        <div>
          <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>Seller Notes <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '4px' }}>(internal only, not sent to eBay)</span></label>
          <textarea className="input-base" value={sellerNotes} onChange={e => setSellerNotes(e.target.value)} rows={2} placeholder="Personal notes about this item..." style={{ resize: 'vertical' }} />
        </div>

        <div>
          <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>Tags <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '4px' }}>(press Enter or comma to add)</span></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', minHeight: '42px', alignItems: 'center' }}>
            {tags.map(tag => (
              <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', borderRadius: '4px', padding: '2px 8px', fontSize: '0.82rem' }}>
                {tag}
                <button type="button" onClick={() => setTags(prev => prev.filter(t => t !== tag))} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, opacity: 0.7 }}>×</button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                  e.preventDefault();
                  const newTag = tagInput.trim().toLowerCase().replace(/,/g, '');
                  if (newTag && !tags.includes(newTag)) setTags(prev => [...prev, newTag]);
                  setTagInput('');
                } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                  setTags(prev => prev.slice(0, -1));
                }
              }}
              placeholder={tags.length === 0 ? 'e.g. vintage, fragile, lot...' : ''}
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.9rem', minWidth: '120px', flex: 1 }}
            />
          </div>
        </div>

        {/* Condition */}
        <div>
          <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)', alignItems: 'center', gap: '4px' }}>
            <Tag size={16} /> Condition Report
          </label>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {[
              { label: 'Mint', text: 'Item is in mint condition. No signs of use or wear. All original packaging and accessories included.' },
              { label: 'Excellent', text: 'Item is in excellent condition with minimal signs of use. No significant scratches, dents, or damage.' },
              { label: 'Good', text: 'Item is in good working condition with normal signs of use. Minor cosmetic wear present but fully functional.' },
              { label: 'Fair', text: 'Item shows noticeable wear and cosmetic imperfections but remains fully functional.' },
              { label: 'Poor', text: 'Item is heavily worn or has significant cosmetic damage. Sold as-is for parts or repair.' },
            ].map(({ label, text }) => (
              <button
                key={label}
                type="button"
                onClick={() => setCondition(text)}
                style={{ fontSize: '0.78rem', padding: '4px 10px', background: condition === text ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)', border: `1px solid ${condition === text ? 'var(--accent-color)' : 'var(--border-color)'}`, color: condition === text ? 'var(--accent-color)' : 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s' }}
              >
                {label}
              </button>
            ))}
          </div>
          <textarea className="input-base" value={condition} onChange={e => setCondition(e.target.value)} rows={2} />
        </div>

        {/* Item Specifics */}
        <div>
          <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>Item Specifics</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {Object.entries(itemSpecifics).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="text" className="input-base" style={{ width: '40%', fontSize: '0.9rem', padding: '8px' }} value={key} readOnly title="Key" />
                <input type="text" className="input-base" style={{ width: '60%', fontSize: '0.9rem', padding: '8px' }} value={val}
                  onChange={e => setItemSpecifics({ ...itemSpecifics, [key]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>

        {/* Description */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '350px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
            <label style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <LayoutTemplate size={16} /> HTML Description
            </label>
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)', padding: '4px' }}>
              <button onClick={() => setPreviewMode(true)} style={{ background: previewMode ? 'var(--accent-color)' : 'transparent', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                <Eye size={14} /> Preview
              </button>
              <button onClick={() => setPreviewMode(false)} style={{ background: !previewMode ? 'var(--accent-color)' : 'transparent', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                <Code size={14} /> Code
              </button>
            </div>
          </div>
          {previewMode ? (
            <div className="glass-card" style={{ padding: '1.5rem', flex: 1, overflowY: 'auto', backgroundColor: '#ffffff', color: '#000000', borderRadius: 'var(--radius-sm)' }}
              dangerouslySetInnerHTML={{ __html: description }} />
          ) : (
            <textarea className="input-base" value={description} onChange={e => setDescription(e.target.value)}
              style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: 1.5 }} />
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={onCancel}><X size={18} /> Discard</button>
        <button className="btn-primary" style={{ flex: 2 }} disabled={title.length > 80}
          onClick={() => onStage({ title, condition, description, category, priceRecommendation, priceJustification, shippingEstimate, itemSpecifics, images: allImages, sku, sellerNotes, costBasis, tags })}>
          <Save size={18} /> Save & Stage Listing
        </button>
      </div>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gradient">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" fill="var(--accent-color)" fillOpacity="0.2" />
      <path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
    </svg>
  );
}
