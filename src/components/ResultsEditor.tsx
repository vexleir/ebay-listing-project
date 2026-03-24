import { useState, useEffect } from 'react';
import { Save, X, Eye, Code, Type, LayoutTemplate, Tag } from 'lucide-react';
import type { StagedListing } from '../types';

interface ResultsEditorProps {
  data: {
    title: string;
    description: string;
    condition: string;
    itemSpecifics: Record<string, string>;
    category: string;
    priceRecommendation: string;
    shippingEstimate: string;
  };
  images: File[];
  onStage: (listing: Omit<StagedListing, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}

export default function ResultsEditor({ data, images, onStage, onCancel }: ResultsEditorProps) {
  const [title, setTitle] = useState(data.title);
  const [description, setDescription] = useState(data.description);
  const [condition, setCondition] = useState(data.condition);
  const [category, setCategory] = useState(data.category);
  const [priceRecommendation, setPriceRecommendation] = useState(data.priceRecommendation);
  const [shippingEstimate, setShippingEstimate] = useState(data.shippingEstimate);
  const [itemSpecifics, setItemSpecifics] = useState<Record<string, string>>(data.itemSpecifics);
  const [previewMode, setPreviewMode] = useState<boolean>(true);
  
  // Create object URLs for images just to save them in our staged listing
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  
  useEffect(() => {
    // Convert files to base64 so they can be securely saved in localStorage
    const convertImages = async () => {
      const b64s = await Promise.all(images.map(img => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(img);
        });
      }));
      setImageUrls(b64s);
    };
    convertImages();
  }, [images]);

  const titleLengthColor = title.length > 80 
    ? '#ef4444' // red
    : title.length >= 70 
      ? '#10b981' // green (optimal)
      : '#f59e0b'; // yellow (could be longer)

  return (
    <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <SparkleIcon /> Generated Listing
      </h2>
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', paddingRight: '8px' }}>
        
        {/* Title Field */}
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Type size={16} /> SEO Title</span>
            <span style={{ color: titleLengthColor, fontWeight: 'bold' }}>
              {title.length} / 80
            </span>
          </label>
          <input 
            type="text" 
            className="input-base" 
            value={title} 
            onChange={e => setTitle(e.target.value)} 
            style={{ 
              borderColor: title.length > 80 ? '#ef4444' : 'var(--border-color)',
              fontSize: '1.1rem',
              fontWeight: 500
            }}
          />
          {title.length > 80 && (
            <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '4px' }}>
              Warning: Title exceeds eBay's 80-character limit!
            </p>
          )}
        </div>

        {/* Category & Pricing & Shipping */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>Category</label>
            <input type="text" className="input-base" value={category} onChange={e => setCategory(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>Price Recommendation</label>
            <input type="text" className="input-base" value={priceRecommendation} onChange={e => setPriceRecommendation(e.target.value)} />
          </div>
        </div>

        <div>
           <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>Shipping Estimate</label>
           <textarea className="input-base" value={shippingEstimate} onChange={e => setShippingEstimate(e.target.value)} rows={4} style={{ resize: 'vertical' }} />
        </div>

        {/* Condition Field */}
        <div>
          <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)', alignItems: 'center', gap: '4px' }}>
            <Tag size={16} /> Condition Report
          </label>
          <textarea 
            className="input-base" 
            value={condition} 
            onChange={e => setCondition(e.target.value)} 
            rows={2}
          />
        </div>

        {/* Item Specifics */}
        <div>
          <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)' }}>Item Specifics</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {Object.entries(itemSpecifics).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="text" className="input-base" style={{ width: '40%', fontSize: '0.9rem', padding: '8px' }} value={key} readOnly title="Key" />
                <input 
                  type="text" className="input-base" style={{ width: '60%', fontSize: '0.9rem', padding: '8px' }} value={val} 
                  onChange={e => setItemSpecifics({ ...itemSpecifics, [key]: e.target.value })} 
                />
              </div>
            ))}
          </div>
        </div>

        {/* Description Field */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '350px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
            <label style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <LayoutTemplate size={16} /> HTML Description
            </label>
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)', padding: '4px' }}>
              <button 
                onClick={() => setPreviewMode(true)}
                style={{
                  background: previewMode ? 'var(--accent-color)' : 'transparent',
                  color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem'
                }}
              >
                <Eye size={14} /> Preview
              </button>
              <button 
                onClick={() => setPreviewMode(false)}
                style={{
                  background: !previewMode ? 'var(--accent-color)' : 'transparent',
                  color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem'
                }}
              >
                <Code size={14} /> Code
              </button>
            </div>
          </div>
          
          {previewMode ? (
            <div 
              className="glass-card" 
              style={{ padding: '1.5rem', flex: 1, overflowY: 'auto', backgroundColor: '#ffffff', color: '#000000', borderRadius: 'var(--radius-sm)' }}
              dangerouslySetInnerHTML={{ __html: description }}
            />
          ) : (
            <textarea 
              className="input-base" 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: 1.5 }}
            />
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={onCancel}>
          <X size={18} /> Discard
        </button>
        <button 
          className="btn-primary" 
          style={{ flex: 2 }} 
          disabled={title.length > 80}
          onClick={() => onStage({ title, condition, description, category, priceRecommendation, shippingEstimate, itemSpecifics, images: imageUrls })}
        >
          <Save size={18} /> Save & Stage Listing
        </button>
      </div>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gradient">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" fill="var(--accent-color)" fillOpacity="0.2"/>
      <path d="M5 3v4"/>
      <path d="M19 17v4"/>
      <path d="M3 5h4"/>
      <path d="M17 19h4"/>
    </svg>
  );
}
