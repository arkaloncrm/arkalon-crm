import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/UI/Table.jsx';
import Badge from '../../components/UI/Badge.jsx';
import { reportsApi } from '../../api/reports.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import { exportToCsv } from '../../utils/exportCsv.js';
import { STAGE_COLOURS } from '../../utils/constants.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportLoading, ReportEmpty, ExportButton, BU_COLOURS } from './reportPrimitives.jsx';

const CSV_COLUMNS = [
  { label: 'Month', getValue: (r) => r._month_label || '' },
  { label: 'Deal Name', key: 'deal_name' },
  { label: 'Account', getValue: (r) => r.account_name || '' },
  { label: 'BU', key: 'business_unit' },
  { label: 'Stage', key: 'stage' },
  { label: 'Close Date', getValue: (r) => r.close_date || '' },
  { label: 'Gross Value', getValue: (r) => r.gross_total_value || 0, currency: true },
  { label: 'Commission', getValue: (r) => r.total_contract_earnings || 0, currency: true },
];

// "Q2 2026" -> the three calendar months of that quarter.
function quarterMonths(quarterLabel) {
  const m = /Q(\d)\s+(\d{4})/.exec(quarterLabel || '');
  if (!m) return [];
  const firstMonth = (Number(m[1]) - 1) * 3; // 0-indexed January = 0
  const year = Number(m[2]);
  return [0, 1, 2].map((offset) => {
    const d = new Date(year, firstMonth + offset, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
    };
  });
}

export default function CommissionForecastReport() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [data, setData] = useState(null);

  useEffect(() => {
    reportsApi.commissionForecast()
      .then((res) => setData(res.data.data || { deals: [], quarter_label: '' }))
      .catch(() => {
        setData({ deals: [], quarter_label: '' });
        addToast('Failed to load commission forecast', 'error');
      });
  }, []);

  const deals = data?.deals || [];
  const quarterLabel = data?.quarter_label || 'this quarter';

  const months = useMemo(() => {
    const buckets = quarterMonths(data?.quarter_label);
    return buckets.map((month) => {
      const monthDeals = deals.filter((d) => String(d.close_date || '').slice(0, 7) === month.key);
      return {
        ...month,
        deals: monthDeals,
        subtotal: monthDeals.reduce((s, d) => s + (d.total_contract_earnings || 0), 0),
      };
    });
  }, [data]);

  const grandTotal = useMemo(
    () => deals.reduce((s, d) => s + (d.total_contract_earnings || 0), 0),
    [deals],
  );

  const csvRows = useMemo(
    () => months.flatMap((m) => m.deals.map((d) => ({ ...d, _month_label: m.label }))),
    [months],
  );

  if (data === null) {
    return <div className="bg-white border border-arkalon-lightgrey rounded-lg shadow-sm"><ReportLoading /></div>;
  }

  if (deals.length === 0) {
    return (
      <div className="bg-white border border-arkalon-lightgrey rounded-lg shadow-sm">
        <ReportEmpty message={`No open deals are forecast to close in ${quarterLabel}.`} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <span className="text-xs font-montserrat font-semibold text-slate-400 uppercase tracking-wide">
          Forecast Commission — {quarterLabel}
        </span>
        <ExportButton onClick={() => exportToCsv('commission_forecast', csvRows, CSV_COLUMNS)} disabled={csvRows.length === 0} />
      </div>

      {months.map((month) => (
        <div key={month.key} className="bg-white border border-arkalon-lightgrey rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-arkalon-lightgrey bg-slate-50">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm">
              {month.label}
              <span className="ml-2 text-xs font-opensans font-normal text-slate-400">
                {month.deals.length} deal{month.deals.length === 1 ? '' : 's'}
              </span>
            </h3>
            <span className="font-montserrat font-bold text-sm" style={{ color: '#0073C6' }}>
              {formatCurrency(month.subtotal, 2)}
            </span>
          </div>
          {month.deals.length === 0 ? (
            <div className="px-5 py-4 text-sm text-slate-400 font-opensans">
              No deals forecast to close in {month.label}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <Thead>
                  <tr>
                    <Th>Deal Name</Th>
                    <Th>Account</Th>
                    <Th>BU</Th>
                    <Th>Stage</Th>
                    <Th>Close Date</Th>
                    <Th>Gross Value</Th>
                    <Th>Commission</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {month.deals.map((d) => (
                    <Tr key={d.id}>
                      <Td>
                        <button
                          onClick={() => navigate(`/deals/${d.id}`)}
                          className="font-semibold text-arkalon-blue hover:underline font-opensans"
                        >
                          {d.deal_name}
                        </button>
                      </Td>
                      <Td>{d.account_name || '—'}</Td>
                      <Td>
                        <Badge className={BU_COLOURS[d.business_unit] || 'bg-gray-100 text-gray-600'}>
                          {d.business_unit}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge className={STAGE_COLOURS[d.stage] || 'bg-gray-100 text-gray-700'}>{d.stage}</Badge>
                      </Td>
                      <Td>{formatDate(d.close_date)}</Td>
                      <Td>{formatCurrency(d.gross_total_value)}</Td>
                      <Td>
                        <span className="font-bold" style={{ color: '#0073C6' }}>
                          {formatCurrency(d.total_contract_earnings, 2)}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          )}
        </div>
      ))}

      <div className="bg-white border-2 border-arkalon-blue rounded-lg px-5 py-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-montserrat font-bold text-slate-400 uppercase tracking-widest mb-1">
            Total Forecast Commission — {quarterLabel}
          </div>
          <div className="text-xs text-slate-400 font-opensans">
            {deals.length} open deal{deals.length === 1 ? '' : 's'} closing this quarter
          </div>
        </div>
        <div className="text-3xl font-montserrat font-bold" style={{ color: '#0073C6' }}>
          {formatCurrency(grandTotal, 2)}
        </div>
      </div>
    </div>
  );
}
