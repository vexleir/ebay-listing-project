// FE-003 — the circular grade + total badge used in both the analyze
// header and the sticky edit-phase sidebar. `compact` shrinks it for the
// sidebar slot.

import { CheckCircle } from 'lucide-react';
import type { ListingScore } from '../../utils/listingScore';
import { gradeColor } from './helpers';

export interface OverallScoreProps {
  score: ListingScore;
  compact?: boolean;
  pushSuccess?: boolean;
}

export default function OverallScore({ score, compact = false, pushSuccess = false }: OverallScoreProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '12px' : '20px' }}>
      <div
        style={{
          width: compact ? '56px' : '80px',
          height: compact ? '56px' : '80px',
          borderRadius: '50%',
          border: `${compact ? 4 : 6}px solid ${gradeColor(score.grade)}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-label={`Overall score ${score.total} of 100, grade ${score.grade}`}
      >
        <span style={{ fontSize: compact ? '1.1rem' : '1.5rem', fontWeight: 800, color: gradeColor(score.grade), lineHeight: 1 }}>{score.total}</span>
        <span style={{ fontSize: compact ? '0.6rem' : '0.72rem', color: 'var(--text-secondary)' }}>/100</span>
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: compact ? '1.1rem' : '1.4rem', fontWeight: 800, color: gradeColor(score.grade) }}>Grade {score.grade}</span>
          {pushSuccess && (
            <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle size={12} /> Pushed to eBay
            </span>
          )}
        </div>
        <span style={{ fontSize: compact ? '0.75rem' : '0.82rem', color: 'var(--text-secondary)' }}>Listing Health Score</span>
      </div>
    </div>
  );
}
