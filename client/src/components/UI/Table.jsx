import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export function Table({ children, className = '' }) {
  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <table className="w-full text-sm text-left border-collapse">{children}</table>
    </div>
  );
}

export function Thead({ children }) {
  return (
    <thead className="bg-slate-50 border-b border-arkalon-lightgrey">
      {children}
    </thead>
  );
}

export function Th({ children, sortable, sorted, direction, onClick, className = '' }) {
  return (
    <th
      className={`px-4 py-2.5 font-montserrat font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap select-none ${sortable ? 'cursor-pointer hover:text-arkalon-navy' : ''} ${className}`}
      onClick={sortable ? onClick : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortable && (
          <span className="text-slate-300">
            {sorted ? (direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronDown className="w-3 h-3 opacity-40" />}
          </span>
        )}
      </span>
    </th>
  );
}

export function Tbody({ children }) {
  return <tbody className="divide-y divide-arkalon-lightgrey">{children}</tbody>;
}

export function Tr({ children, onClick, className = '' }) {
  return (
    <tr
      className={`bg-white hover:bg-blue-50/40 transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className = '' }) {
  return (
    <td className={`px-4 py-2.5 text-slate-700 font-opensans whitespace-nowrap ${className}`}>
      {children}
    </td>
  );
}
