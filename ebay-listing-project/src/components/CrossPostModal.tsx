import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, ExternalLink } from 'lucide-react';
import type { StagedListing } from '../types';

interface Platform {
  id: string;
  name: string;
  color: string;
  titleMax: number;
  descMax: number;
  url: string;
  tip: string;
}

const PLATFORMS: Platform[] = [
  {
    id: 'poshmark',
    name: 'Poshmark',
    color: '#c4325e',
    titleMax: 50,
    descMax: 500,
    url: 'https://poshmark.com/create-listing',
    tip: 'Best for clothing, shoes & accessories. Free shipping offers boost visibility.',
  },
  {
    id: 'mercari',
    name: 'Mercari',
    color: '#e44035',
    titleMax: 40,
    descMax: 1000,
    url: 'https://www.mercari.com/sell/',
    tip: 'Great for general items. Lower fees than eBay. Consider pricing 5–10% lower.',
  },
  {
    id: 'facebook',
    name: 'Facebook Marketplace',
    color: '#1877f2',
    titleMax: 100,
    descMax: 5000,
    url: 'https://www.facebook.com/marketplace/create/item',
    tip: 'Best for local pickup / bulky items. No selling fees on local sales.',
  },
  {
    id: 'depop',
    name: 'Depop',
    color: '#ff2300',
    titleMax: 50,
    descMax: 1000,
    url: 'https://www.depop.com/sell/',
    tip: 'Best for vintage, streetwear & Y2K items. Younger buyer demographic.',
  },
];

function stripHtml(html: string): string {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function adaptTitle(title: string, maxLen: number): string {
  if (title.length <= maxLen) return title;
  // Trim at last word boundary within limit
  const trimmed = title.substring(0, maxLen);
  const lastSpace = trimmed.lastIndexOf(' ');
  return lastSpace > maxLen * 0.7 ? trimmed.substring(0, lastSpace) : trimmed;
}

function buildDescription(listing: StagedListing, platform: Platform): string {
  const plain = stripHtml(listing.description);
  const condition = listing.condition ? `Condition: ${listing.condition.split('.')[0]}.\n\n` : '';
  const specifics = listing.itemSpecifics && Object.keys(listing.itemSpecifics).length > 0
    ? Object.entries(listing.itemSpecifics)
        .filter(([, v]) => v && v !== 'Unable to determine' && v !== 'Does Not Apply')
        .slice(0, 6)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n') + '\n\n'
    : '';

  let desc = condition + plain + (specifics ? '\n\n' + specifics.trim() : '');

  // Platform-specific closers
  if (platform.id === 'facebook') {
    desc += '\n\nLocal pickup available. Message with questions!';
  } else if (platform.id === 'depop') {
    desc += '\n\nOpen to offers! 🤝';
  } else if (platform.id === 'poshmark') {
    desc += '\n\n✨ Bundle to save on shipping!';
  }

  if (desc.length > platform.descMax) {
    const trimmed = desc.substring(0, platform.descMax - 3);
    const lastBreak = trimmed.lastIndexOf('\n');
    return (lastBreak > platform.descMax * 0.8 ? trimmed.substring(0, lastBreak) : trimmed) + '...';
  }
  return desc;
}

interface CrossPostModalProps {
  listing: StagedListing;
  onClose: () => void;
}

export default function CrossPostModal({ listing, onClose }: CrossPostModalProps) {
  const [activePlatform, setActivePlatform] = useState(PLATFORMS[0].id);
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(PLATFORMS.map(p => [p.id, listing.priceRecommendation || '']))
  );
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  const platform = PLATFORMS.find(p => p.id === activePlatform)!;
  const adaptedTitle = adaptTitle(listing.title || '', platform.titleMax);
  const adaptedDesc = buildDescription(listing, platform);
  const price = prices[platform.id] || '';

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setCopied(prev => ({ ...prev, [key]: false })), 2000);
  };

  const copyAll = () => {
    const full = `${adaptedTitle}\n\n$${price}\n\n${adaptedDesc}`;
    copy('all', full);
  };

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '620px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Cross-Post to Other Platforms</h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '420px' }}>
              {listing.title}
            </p>
          </div>
          <button onClick={onClose} className="btn-icon"><X size={18} /></button>
        </div>

        {/* Platform tabs */}
        <div style={{ display: 'flex', padding: '0 1.5rem', borderBottom: '1px solid var(--border-color)', gap: '4px', overflowX: 'auto' }}>
          {PLATFORMS.map(p => (
            <button key={p.id} onClick={() => setActivePlatform(p.id)}
              style={{ padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: activePlatform === p.id ? 600 : 400, color: activePlatform === p.id ? p.color : 'var(--text-secondary)', borderBottom: activePlatform === p.id ? `2px solid ${p.color}` : '2px solid transparent', marginBottom: '-1px', whiteSpace: 'nowrap', transition: 'color 0.15s' }}>
              {p.name}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Platform tip */}
          <div style={{ padding: '8px 12px', background: `${platform.color}18`, border: `1px solid ${platform.color}40`, borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            💡 {platform.tip}
          </div>

          {/* Title */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Title</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: adaptedTitle.length > platform.titleMax * 0.9 ? '#f59e0b' : 'var(--text-secondary)' }}>
                  {adaptedTitle.length}/{platform.titleMax}
                </span>
                <button className="btn-icon" style={{ padding: '3px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => copy(`title-${platform.id}`, adaptedTitle)}>
                  {copied[`title-${platform.id}`] ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                  {copied[`title-${platform.id}`] ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {adaptedTitle}
            </div>
            {listing.title.length > platform.titleMax && (
              <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: '#f59e0b' }}>
                eBay title trimmed from {listing.title.length} → {adaptedTitle.length} chars to fit {platform.name}'s limit.
              </p>
            )}
          </div>

          {/* Price */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Price (USD)</label>
              <button className="btn-icon" style={{ padding: '3px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => copy(`price-${platform.id}`, price)}>
                {copied[`price-${platform.id}`] ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                {copied[`price-${platform.id}`] ? 'Copied' : 'Copy'}
              </button>
            </div>
            <input className="input-base" value={price} onChange={e => setPrices(prev => ({ ...prev, [platform.id]: e.target.value }))}
              placeholder="e.g. 49.99" style={{ maxWidth: '180px' }} />
            <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
              Adjust per-platform — your eBay price is ${listing.priceRecommendation || '—'}.
            </p>
          </div>

          {/* Description */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Description</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {adaptedDesc.length}/{platform.descMax}
                </span>
                <button className="btn-icon" style={{ padding: '3px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => copy(`desc-${platform.id}`, adaptedDesc)}>
                  {copied[`desc-${platform.id}`] ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                  {copied[`desc-${platform.id}`] ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <textarea readOnly value={adaptedDesc} rows={8}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.82rem', lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
          <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }} onClick={copyAll}>
            {copied['all'] ? <><Check size={14} color="var(--success)" /> Copied!</> : <><Copy size={14} /> Copy All Fields</>}
          </button>
          <a href={platform.url} target="_blank" rel="noreferrer" className="btn-primary"
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', background: platform.color, borderColor: platform.color, marginLeft: 'auto' }}>
            <ExternalLink size={14} /> Open {platform.name}
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
