// FE-003 — per-category score card for the optimizer health breakdown.
// Pure: parent owns the expanded state so multiple cards share one
// "only one expanded at a time" rule.

import {
  AlertTriangle, ChevronDown, ChevronUp, DollarSign, FileText, Image as ImageIcon,
  Info, Tag, Truck, XCircle,
} from 'lucide-react';
import type { ListingScore } from '../../utils/listingScore';
import { scoreBarColor } from './helpers';

export type ScoreCategory = ListingScore['categories'][keyof ListingScore['categories']];

function categoryIcon(key: string) {
  if (key === 'titleSeo') return <Tag size={16} />;
  if (key === 'itemSpecifics') return <FileText size={16} />;
  if (key === 'images') return <ImageIcon size={16} />;
  if (key === 'description') return <FileText size={16} />;
  if (key === 'pricing') return <DollarSign size={16} />;
  if (key === 'shipping') return <Truck size={16} />;
  return <Info size={16} />;
}

export interface ScoreCardProps {
  catKey: string;
  cat: ScoreCategory;
  expanded: boolean;
  onToggle: () => void;
}

export default function ScoreCard({ catKey, cat, expanded, onToggle }: ScoreCardProps) {
  const allFeedback = [...cat.issues, ...cat.tips];
  const interactive = allFeedback.length > 0;
  return (
    <div
      style={{
        background: 'var(--glass-bg)',
        border: `1px solid ${cat.issues.length > 0 ? 'rgba(239,68,68,0.3)' : 'var(--glass-border)'}`,
        borderRadius: '10px',
        overflow: 'hidden',
        cursor: interactive ? 'pointer' : 'default',
      }}
      onClick={interactive ? onToggle : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-expanded={interactive ? expanded : undefined}
      aria-label={`${cat.name} score ${cat.pct}%`}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } } : undefined}
    >
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {categoryIcon(catKey)}
            {cat.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: scoreBarColor(cat.pct) }}>
              {cat.pct}%
            </span>
            {allFeedback.length > 0 && (
              expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />
            )}
          </div>
        </div>
        <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${cat.pct}%`, background: scoreBarColor(cat.pct), borderRadius: '3px', transition: 'width 0.6s ease' }} />
        </div>
        {cat.issues.length > 0 && !expanded && (
          <div style={{ marginTop: '6px', fontSize: '0.72rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertTriangle size={11} /> {cat.issues.length} issue{cat.issues.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
      {expanded && allFeedback.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-color)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {cat.issues.map((issue, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.78rem', color: '#fca5a5' }}>
              <XCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {issue}
            </div>
          ))}
          {cat.tips.map((tip, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.78rem', color: '#93c5fd' }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {tip}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
