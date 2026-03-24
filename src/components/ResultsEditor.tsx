import { useState, useEffect, useRef } from 'react';
import { Save, X, Eye, Code, Type, LayoutTemplate, Tag, Wand2 } from 'lucide-react';
import type { StagedListing } from '../types';
import { useToast } from '../context/ToastContext';

interface ResultsEditorProps {
  data: {
    title: string; description: string; condition: string;
    itemSpecifics: Record<string, string>; category: string;
    priceRecommendation: string; priceJustification?: string; shippingEstimate: string;
    sku?: string; sellerNotes?: string;
  };
  images: File[];
  onStage: (listing: Omit<StagedListing, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
  appPassword?: string;
}

export default function ResultsEditor({ data, images, onStage, onCancel, appPassword = '' }: ResultsEditorProps) {
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

  const [imageUrls, setImageUrls] = useState<string[]>([]);
  useEffect(() => {
    const convertImages = async () => {
      const b64s = await Promise.all(images.map(img => new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(img);
      })));
      setImageUrls(b64s);
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
        </div>

        <div>
          <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>Shipping Estimate</label>
          <textarea className="input-base" value={shippingEstimate} onChange={e => setShippingEstimate(e.target.value)} rows={4} style={{ resize: 'vertical' }} />
        </div>

        <div>
          <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>Seller Notes <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '4px' }}>(internal only, not sent to eBay)</span></label>
          <textarea className="input-base" value={sellerNotes} onChange={e => setSellerNotes(e.target.value)} rows={2} placeholder="Personal notes about this item..." style={{ resize: 'vertical' }} />
        </div>

        {/* Condition */}
        <div>
          <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)', alignItems: 'center', gap: '4px' }}>
            <Tag size={16} /> Condition Report
          </label>
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
          onClick={() => onStage({ title, condition, description, category, priceRecommendation, priceJustification, shippingEstimate, itemSpecifics, images: imageUrls, sku, sellerNotes })}>
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
