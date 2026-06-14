// FE-003 — 3-column grid of per-category ScoreCards used in both analyze
// and edit phases. Parent owns which one is expanded so opening one
// closes the others.

import type { ListingScore } from '../../utils/listingScore';
import ScoreCard, { type ScoreCategory } from './ScoreCard';

export interface ScoreGridProps {
  score: ListingScore;
  expandedKey: string | null;
  onToggle: (key: string) => void;
}

export default function ScoreGrid({ score, expandedKey, onToggle }: ScoreGridProps) {
  return (
    <div className="summary-tiles-row" style={{ gap: '0.75rem' }}>
      {(Object.entries(score.categories) as [string, ScoreCategory][]).map(([key, cat]) => (
        <ScoreCard
          key={key}
          catKey={key}
          cat={cat}
          expanded={expandedKey === key}
          onToggle={() => onToggle(key)}
        />
      ))}
    </div>
  );
}
