import React from 'react';

// Card chrome for mobile list views (shown below the `sm` breakpoint while the
// desktop table is hidden). The whole card is tappable; action buttons should
// sit in a row that calls stopPropagation so they don't trigger the card tap.
export default function MobileCard({ onClick, children, className = '' }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-arkalon-lightgrey rounded-lg p-3 active:bg-blue-50/40 transition-colors ${className}`}
    >
      {children}
    </div>
  );
}

// 44px-square icon button for use in mobile card footers.
export function CardAction({ onClick, label, children, danger }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center h-11 w-11 rounded transition-colors text-slate-400 hover:bg-slate-50 ${
        danger ? 'hover:text-red-500' : 'hover:text-arkalon-blue'
      }`}
    >
      {children}
    </button>
  );
}
