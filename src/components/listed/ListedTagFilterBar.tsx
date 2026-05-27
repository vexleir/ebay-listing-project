import { ChevronDown } from 'lucide-react';

export interface ListedTagFilterBarProps {
  tags: string[];
  activeTag: string | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onActiveTagChange: (tag: string | null) => void;
}

export default function ListedTagFilterBar({
  tags,
  activeTag,
  expanded,
  onExpandedChange,
  onActiveTagChange,
}: ListedTagFilterBarProps) {
  if (tags.length === 0) return null;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => onExpandedChange(!expanded)}
          style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ChevronDown size={12} style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
          Tags ({tags.length})
        </button>
        {activeTag && (
          <span style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '4px', border: '1px solid var(--accent-color)', background: 'rgba(99,102,241,0.25)', color: '#a5b4fc' }}>
            {activeTag}
          </span>
        )}
        {activeTag && (
          <button onClick={() => onActiveTagChange(null)} style={{ fontSize: '0.78rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Clear
          </button>
        )}
      </div>
      {expanded && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onActiveTagChange(activeTag === tag ? null : tag)}
              style={{
                fontSize: '0.78rem',
                padding: '3px 10px',
                borderRadius: '4px',
                border: '1px solid',
                cursor: 'pointer',
                background: activeTag === tag ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
                borderColor: activeTag === tag ? 'var(--accent-color)' : 'var(--border-color)',
                color: activeTag === tag ? '#a5b4fc' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
