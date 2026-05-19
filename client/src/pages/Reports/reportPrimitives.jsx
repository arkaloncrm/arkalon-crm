import React from 'react';
import { Download, BarChart2 } from 'lucide-react';

export function PillGroup({ options, value, onChange }) {
  return (
    <div className="inline-flex items-center border border-arkalon-lightgrey rounded overflow-hidden">
      {options.map((opt) => {
        const v = typeof opt === 'object' ? opt.value : opt;
        const label = typeof opt === 'object' ? opt.label : opt;
        const active = v === value;
        return (
          <button
            key={String(v)}
            onClick={() => onChange(v)}
            className={`px-3 py-1.5 text-xs font-montserrat font-semibold transition-colors border-r border-arkalon-lightgrey last:border-r-0 ${
              active ? 'bg-arkalon-blue text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function BuFilter({ value, onChange }) {
  return (
    <PillGroup
      options={[
        { value: '', label: 'All' },
        { value: 'ASC', label: 'ASC' },
        { value: 'Simply Seated', label: 'Simply Seated' },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

export function FilterField({ label, children }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-montserrat font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      {children}
    </div>
  );
}

export function ExportButton({ onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-montserrat font-semibold rounded border border-arkalon-lightgrey bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <Download className="w-3.5 h-3.5" />
      Export CSV
    </button>
  );
}

export function ReportShell({ filters, action, children }) {
  const hasBar = filters || action;
  return (
    <div className="bg-white border border-arkalon-lightgrey rounded-lg shadow-sm overflow-hidden">
      {hasBar && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-arkalon-lightgrey">
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">{filters}</div>
          <div className="flex-shrink-0">{action}</div>
        </div>
      )}
      {/* Report tables can be dense — allow horizontal scroll within the card */}
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function ReportLoading() {
  return <div className="py-16 text-center text-slate-400 font-opensans text-sm">Loading…</div>;
}

export function ReportEmpty({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <BarChart2 className="w-6 h-6 text-slate-400" />
      </div>
      <p className="text-slate-400 font-opensans text-sm max-w-xs">{message}</p>
    </div>
  );
}

export const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
};

export const CLOSE_TONE_CLASS = {
  overdue: 'text-red-600 font-semibold',
  today: 'text-amber-600 font-semibold',
  soon: 'text-red-600 font-semibold',
  later: 'text-slate-600',
  none: 'text-slate-400',
};
