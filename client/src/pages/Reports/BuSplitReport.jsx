import React, { useState, useEffect, useMemo } from 'react';
import Badge from '../../components/UI/Badge.jsx';
import { reportsApi } from '../../api/reports.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { exportToCsv } from '../../utils/exportCsv.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportShell, ReportLoading, ExportButton, BU_COLOURS } from './reportPrimitives.jsx';

const CSV_COLUMNS = [
  { label: 'Business Unit', key: 'business_unit' },
  { label: 'Open Deals', getValue: (r) => r.open_count || 0 },
  { label: 'Pipeline Commission', getValue: (r) => r.pipeline_commission || 0, currency: true },
  { label: 'Closed Commission YTD', getValue: (r) => r.closed_commission || 0, currency: true },
];

function StatLine({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-arkalon-lightgrey last:border-b-0">
      <span className="text-sm font-opensans text-slate-500">{label}</span>
      <span
        className={`font-montserrat font-bold text-sm ${accent ? '' : 'text-arkalon-navy'}`}
        style={accent ? { color: '#0073C6' } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function BuPanel({ name, stats, year }) {
  return (
    <div className="bg-white border border-arkalon-lightgrey rounded-lg shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-arkalon-lightgrey flex items-center gap-2">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">{name}</h3>
        <Badge className={BU_COLOURS[name] || 'bg-gray-100 text-gray-600'}>{name}</Badge>
      </div>
      <div className="px-5 py-2">
        <StatLine label="Open Deals" value={stats.open_count} />
        <StatLine label="Pipeline Commission" value={formatCurrency(stats.pipeline_commission, 2)} accent />
        <StatLine label={`Closed Commission (${year})`} value={formatCurrency(stats.closed_commission, 2)} accent />
      </div>
    </div>
  );
}

export default function BuSplitReport() {
  const { addToast } = useToast();
  const [data, setData] = useState(null);

  useEffect(() => {
    reportsApi.buSplit()
      .then((res) => setData(res.data.data || null))
      .catch(() => {
        setData(null);
        addToast('Failed to load BU split report', 'error');
      });
  }, []);

  const blank = { open_count: 0, pipeline_commission: 0, closed_commission: 0 };
  const asc = data?.split?.['ASC'] || blank;
  const ss = data?.split?.['Simply Seated'] || blank;
  const year = data?.year || '';

  const totalPipe = (asc.pipeline_commission || 0) + (ss.pipeline_commission || 0);
  const ascPct = totalPipe > 0 ? Math.round((asc.pipeline_commission / totalPipe) * 100) : 0;
  const ssPct = totalPipe > 0 ? 100 - ascPct : 0;

  const leader = useMemo(() => {
    if (totalPipe === 0) return 'No open pipeline commission in either business unit.';
    if (asc.pipeline_commission > ss.pipeline_commission) {
      return `ASC has the larger pipeline — ${formatCurrency(asc.pipeline_commission - ss.pipeline_commission, 2)} more commission in play.`;
    }
    if (ss.pipeline_commission > asc.pipeline_commission) {
      return `Simply Seated has the larger pipeline — ${formatCurrency(ss.pipeline_commission - asc.pipeline_commission, 2)} more commission in play.`;
    }
    return 'ASC and Simply Seated have an equal commission pipeline.';
  }, [totalPipe, asc.pipeline_commission, ss.pipeline_commission]);

  if (data === null) {
    return <ReportShell><ReportLoading /></ReportShell>;
  }

  const csvRows = [
    { business_unit: 'ASC', ...asc },
    { business_unit: 'Simply Seated', ...ss },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <span className="text-xs font-montserrat font-semibold text-slate-400 uppercase tracking-wide">
          Commission Split — ASC vs Simply Seated
        </span>
        <ExportButton onClick={() => exportToCsv('bu_split', csvRows, CSV_COLUMNS)} disabled={false} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <BuPanel name="ASC" stats={asc} year={year} />
        <BuPanel name="Simply Seated" stats={ss} year={year} />
      </div>

      <div className="bg-white border border-arkalon-lightgrey rounded-lg shadow-sm p-5">
        <div className="text-xs font-montserrat font-bold text-slate-400 uppercase tracking-widest mb-3">
          Pipeline Commission Comparison
        </div>
        {totalPipe > 0 && (
          <div className="flex h-7 rounded overflow-hidden mb-2">
            <div
              className="bg-blue-500 flex items-center justify-center text-xs font-montserrat font-semibold text-white"
              style={{ width: `${ascPct}%` }}
            >
              {ascPct >= 12 ? `ASC ${ascPct}%` : ''}
            </div>
            <div
              className="bg-teal-500 flex items-center justify-center text-xs font-montserrat font-semibold text-white"
              style={{ width: `${ssPct}%` }}
            >
              {ssPct >= 12 ? `SS ${ssPct}%` : ''}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between text-sm font-opensans">
          <span className="text-blue-600 font-semibold">ASC {formatCurrency(asc.pipeline_commission, 2)}</span>
          <span className="text-teal-600 font-semibold">Simply Seated {formatCurrency(ss.pipeline_commission, 2)}</span>
        </div>
        <p className="mt-3 text-sm font-opensans text-arkalon-navy">{leader}</p>
      </div>
    </div>
  );
}
