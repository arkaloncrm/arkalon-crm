import React from 'react';

/*
 * Deals-only presentational helpers (UI revamp Session 2).
 * Used exclusively by DealsList.jsx and DealDetail.jsx — NOT shared with other
 * pages. These intentionally do not reuse the shared Badge / STAGE_COLOURS so
 * the rest of the app keeps its current look. Display only: nothing here reads
 * or changes deal data beyond the stage/business-unit string passed in.
 */

// Stage -> pastel pill token key. Only the COLOUR a stage renders as changes;
// the stage value itself is never altered.
const STAGE_PILL = {
  'Prospect': 'violet',
  'Qualified': 'violet',
  'Contacted': 'amber',
  'Proposal Sent': 'amber',
  'Demo Done': 'orange',
  'Negotiation': 'orange',
  'Verbal Agreement': 'blue',
  'Contract Sent': 'blue',
  'Confirmed': 'green',
  'Closed Won': 'green',
};

export function StagePill({ stage, className = '' }) {
  if (!stage) return null;
  const tone = STAGE_PILL[stage] || 'grey';
  return (
    <span
      className={`inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${className}`}
      style={{
        background: `var(--pill-${tone}-bg)`,
        color: `var(--pill-${tone}-text)`,
      }}
    >
      {stage}
    </span>
  );
}

// Business unit as a coloured dot + label: ASC blue, Simply Seated orange.
export function BuDot({ unit, className = '' }) {
  if (!unit) return null;
  const colour = unit === 'Simply Seated' ? 'var(--bu-ss)' : 'var(--bu-asc)';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colour }} />
      <span className="text-ink-body">{unit}</span>
    </span>
  );
}
