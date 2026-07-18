import React, { useState, useEffect, useMemo } from 'react';
import { reportsApi } from '../../api/reports.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { exportToCsv } from '../../utils/exportCsv.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportShell, ReportLoading, ReportEmpty, ExportButton, FilterField } from './reportPrimitives.jsx';

const selectClass =
  'px-3 py-1.5 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30';

function currentYearRange() {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

const CSV_COLUMNS = [
  { label: 'Month', key: 'label' },
  { label: 'Won Deals', getValue: (r) => r.won.count },
  { label: 'Won Gross', getValue: (r) => r.won.gross_total, currency: true },
  { label: 'Won Commission', getValue: (r) => r.won.commission_total, currency: true },
  { label: 'Won Commission Paid', getValue: (r) => r.won.paid_total, currency: true },
  { label: 'Won Commission Unpaid', getValue: (r) => r.won.unpaid_total, currency: true },
  { label: 'Open Deals', getValue: (r) => r.open.count },
  { label: 'Open Gross', getValue: (r) => r.open.gross_total, currency: true },
  { label: 'Open Commission (if won)', getValue: (r) => r.open.commission_total, currency: true },
  { label: 'Open Commission (weighted)', getValue: (r) => r.open.weighted_total, currency: true },
];

// Reconciled with the Dashboard's "My Commission Pipeline" widget by
// construction — both call GET /api/reports/commission-by-month and read the
// same fields (open.weighted_total for the projection). Nothing here is
// recalculated: total_contract_earnings / commission_paid / probability are
// kept current by the deal POST/PUT/PATCH routes.
export default function CommissionForecastReport() {
  const { addToast } = useToast();
  const defaultRange = currentYearRange();
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [bu, setBu] = useState('');
  const [paid, setPaid] = useState('all');
  const [stageGroup, setStageGroup] = useState('all');
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    let cancelled = false;
    reportsApi.commissionByMonth({
      date_from: from, date_to: to, business_unit: bu || undefined,
      paid, stage_group: stageGroup,
    })
      .then((res) => { if (!cancelled) setData(res.data.data); })
      .catch(() => {
        if (!cancelled) {
          setData({ months: [], totals: { won: {}, open: {} } });
          addToast('Failed to load commission by month report', 'error');
        }
      });
    return () => { cancelled = true; };
  }, [from, to, bu, paid, stageGroup]);

  const months = useMemo(() => (data?.months || []).slice().reverse(), [data]);
  const totals = data?.totals;

  const showWon = stageGroup !== 'open';
  const showOpen = stageGroup !== 'won';

  const filters = (
    <>
      <FilterField label="Close From">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass} />
      </FilterField>
      <FilterField label="Close To">
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectClass} />
      </FilterField>
      <FilterField label="Business Unit">
        <select value={bu} onChange={(e) => setBu(e.target.value)} className={selectClass}>
          <option value="">All</option>
          <option value="ASC">ASC</option>
          <option value="Simply Seated">Simply Seated</option>
        </select>
      </FilterField>
      <FilterField label="Stage Group">
        <select value={stageGroup} onChange={(e) => setStageGroup(e.target.value)} className={selectClass}>
          <option value="all">All</option>
          <option value="won">Closed Won only</option>
          <option value="open">Open pipeline only</option>
        </select>
      </FilterField>
      <FilterField label="Paid Status">
        <select value={paid} onChange={(e) => setPaid(e.target.value)} className={selectClass} disabled={stageGroup === 'open'}>
          <option value="all">All</option>
          <option value="unpaid">Unpaid only</option>
          <option value="paid">Paid only</option>
        </select>
      </FilterField>
    </>
  );

  if (data === null) {
    return <ReportShell filters={filters}><ReportLoading /></ReportShell>;
  }

  return (
    <div className="space-y-4">
      <ReportShell
        filters={filters}
        action={<ExportButton onClick={() => exportToCsv('commission_by_month', months, CSV_COLUMNS)} disabled={months.length === 0} />}
      >
        {months.length === 0 ? (
          <ReportEmpty message="No deals match the selected filters and date range." />
        ) : (
          <div className="divide-y divide-arkalon-lightgrey">
            {months.map((m) => (
              <div key={m.month} className="px-4 sm:px-5 py-4">
                <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm mb-3">{m.label}</h3>
                <div className={`grid gap-3 ${showWon && showOpen ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                  {showWon && (
                    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                      <div className="text-[11px] font-montserrat font-bold text-green-700 uppercase tracking-wide mb-1.5">
                        Closed Won — Actual ({m.won.count} deal{m.won.count === 1 ? '' : 's'})
                      </div>
                      <div className="text-xl font-montserrat font-bold text-green-800">{formatCurrency(m.won.commission_total, 2)}</div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs font-opensans text-green-700">
                        <span>Paid {formatCurrency(m.won.paid_total, 0)}</span>
                        <span>·</span>
                        <span>Unpaid {formatCurrency(m.won.unpaid_total, 0)}</span>
                      </div>
                    </div>
                  )}
                  {showOpen && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                      <div className="text-[11px] font-montserrat font-bold text-blue-700 uppercase tracking-wide mb-1.5">
                        Open Pipeline — Projected ({m.open.count} deal{m.open.count === 1 ? '' : 's'})
                      </div>
                      <div className="text-xl font-montserrat font-bold text-blue-800">{formatCurrency(m.open.weighted_total, 2)}</div>
                      <div className="mt-1.5 text-xs font-opensans text-blue-700">
                        {formatCurrency(m.open.commission_total, 0)} if all close won (weighted by stage probability)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ReportShell>

      {totals && (months.length > 0) && (
        <div className={`grid gap-3 ${showWon && showOpen ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          {showWon && (
            <div className="bg-white border-2 border-green-600 rounded-lg px-5 py-4">
              <div className="text-xs font-montserrat font-bold text-slate-400 uppercase tracking-widest mb-1">
                Total Closed Won — Actual
              </div>
              <div className="text-2xl font-montserrat font-bold text-green-700">{formatCurrency(totals.won.commission_total, 2)}</div>
              <div className="text-xs text-slate-400 font-opensans mt-1">
                {formatCurrency(totals.won.paid_total, 0)} paid · {formatCurrency(totals.won.unpaid_total, 0)} unpaid
              </div>
            </div>
          )}
          {showOpen && (
            <div className="bg-white border-2 border-arkalon-blue rounded-lg px-5 py-4">
              <div className="text-xs font-montserrat font-bold text-slate-400 uppercase tracking-widest mb-1">
                Total Open Pipeline — Projected
              </div>
              <div className="text-2xl font-montserrat font-bold" style={{ color: '#0073C6' }}>{formatCurrency(totals.open.weighted_total, 2)}</div>
              <div className="text-xs text-slate-400 font-opensans mt-1">
                {formatCurrency(totals.open.commission_total, 0)} if all close won
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
