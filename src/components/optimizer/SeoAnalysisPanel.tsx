// FE-003 — SEO Analysis panel shown in the analyze phase. Combines
// score-engine output with any AI-derived seoIssues / seoKeywords.

import { Info, Search, XCircle, Zap } from 'lucide-react';
import type { ListingScore } from '../../utils/listingScore';

export interface SeoAnalysisPanelProps {
  title: string;
  titleSeo: ListingScore['categories']['titleSeo'];
  aiSeoIssues?: string[];
  aiSeoKeywords?: string[];
}

export default function SeoAnalysisPanel({
  title, titleSeo, aiSeoIssues, aiSeoKeywords,
}: SeoAnalysisPanelProps) {
  const hasSomething = titleSeo.issues.length > 0 || (aiSeoIssues?.length ?? 0) > 0;
  if (!hasSomething) return null;

  const titleLen = title.length;
  const titleBarColor = titleLen >= 75 ? '#10b981' : titleLen >= 55 ? '#f59e0b' : '#ef4444';

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <h3 style={{ marginBottom: '1rem', fontSize: '0.95rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Search size={15} /> SEO Analysis
      </h3>
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
          Title: <strong style={{ color: 'var(--text-primary)' }}>{titleLen}/80 characters</strong>
        </div>
        <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(titleLen / 80) * 100}%`, background: titleBarColor, borderRadius: '4px' }} />
        </div>
      </div>
      {titleSeo.issues.map((issue, i) => (
        <div key={`issue-${i}`} style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', marginBottom: '6px', color: '#fca5a5' }}>
          <XCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {issue}
        </div>
      ))}
      {titleSeo.tips.map((tip, i) => (
        <div key={`tip-${i}`} style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', marginBottom: '6px', color: '#93c5fd' }}>
          <Info size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {tip}
        </div>
      ))}
      {aiSeoIssues?.map((issue, i) => (
        <div key={`ai-issue-${i}`} style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', marginBottom: '6px', color: '#c4b5fd' }}>
          <Zap size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {issue}
        </div>
      ))}
      {(aiSeoKeywords?.length ?? 0) > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Top target keywords:</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {aiSeoKeywords!.map((kw, i) => (
              <span
                key={i}
                style={{ fontSize: '0.73rem', padding: '2px 8px', background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '4px', color: '#c4b5fd' }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
