// FE-001a — small badge that surfaces a listing's health score with a
// color-coded shield icon. Tooltip shows the score breakdown so sellers
// can see *why* a listing graded as Fair/Poor.

import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import type { StagedListing } from '../../../types';
import { computeHealthScore } from './helpers';

export interface HealthBadgeProps {
  listing: StagedListing;
  size?: number;
  // Render a small expand caret when the badge is clickable.
  expandable?: boolean;
  expanded?: boolean;
  onClick?: () => void;
}

function colorsForScore(score: number): { bg: string; color: string; Icon: typeof ShieldCheck } {
  if (score >= 80) return { bg: 'rgba(16,185,129,0.15)', color: 'var(--success)', Icon: ShieldCheck };
  if (score >= 55) return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', Icon: ShieldAlert };
  return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', Icon: ShieldX };
}

export default function HealthBadge({ listing, size = 12, expandable = false, expanded = false, onClick }: HealthBadgeProps) {
  const { score, issues } = computeHealthScore(listing);
  const { bg, color, Icon } = colorsForScore(score);
  const tooltip = score >= 80
    ? `Health: ${score}/100 — Good`
    : `Health: ${score}/100\n${issues.join('\n')}`;
  const interactive = !!onClick;
  return (
    <span
      title={tooltip}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
      aria-label={`Health score ${score} of 100`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '0.75rem',
        background: bg,
        color,
        padding: '2px 7px',
        borderRadius: '4px',
        fontWeight: 600,
        cursor: interactive ? 'pointer' : 'help',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={size} /> {score}
      {expandable && <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{expanded ? '▲' : '▼'}</span>}
    </span>
  );
}
