import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/UI/Table.jsx';
import Badge from '../../components/UI/Badge.jsx';
import { dealsApi } from '../../api/deals.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate, closeDateInfo } from '../../utils/formatDate.js';
import { exportToCsv } from '../../utils/exportCsv.js';
import { STAGE_COLOURS } from '../../utils/constants.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportLoading, ReportEmpty, ExportButton, FilterField, BuFilter, BU_COLOURS } from './reportPrimitives.jsx';

const CSV_COLUMNS = [
  { label: 'Section', getValue: (r) => r._section || '' },
  { label: 'Deal Name', key: 'deal_name' },
  { label: 'Account', getValue: (r) => r.account_name || '' },
  { label: 'BU', key: 'business_unit' },
  { label: 'Stage', key: 'stage' },
  { label: 'Close Date', getValue: (r) => r.close_date || '' },
  { label: 'Commission', getValue: (r) => r.total_contract_earnings || 0, currency: true },
];

function Section({ title, deals, accent, navigate }) {
  const subtotal = deals.reduce((s, d) => s + (d.total_contract_earnings || 0), 0);
  return (
    <div className={`bg-white border rounded-lg shadow-sm overflow-hidden ${accent ? 'border-red-200' : 'border-arkalon-lightgrey'}`}>
      <div className={`flex items-center justify-between px-5 py-3 border-b ${accent ? 'border-red-200 bg-red-50' : 'border-arkalon-lightgrey bg-slate-50'}`}>
        <h3 className={`font-montserrat font-semibold text-sm ${accent ? 'text-red-700' : 'text-arkalon-navy'}`}>
          {title}
          <span className="ml-2 text-xs font-opensans font-normal text-slate-400">
            {deals.length} deal{deals.length === 1 ? '' : 's'}
          </span>
        </h3>
        <span className="font-montserrat font-bold text-sm" style={{ color: accent ? '#dc2626' : '#0073C6' }}>
          {formatCurrency(subtotal, 2)}
        </span>
      </div>
      {deals.length === 0 ? (
        <div className="px-5 py-4 text-sm text-slate-400 font-opensans">No deals in this window.</div>
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
                <Th>Commission</Th>
              </tr>
            </Thead>
            <Tbody>
              {deals.map((d) => {
                const info = closeDateInfo(d.close_date);
                return (
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
                    <Td>
                      <div className={accent ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                        {formatDate(d.close_date)}
                      </div>
                      <div className={`text-xs ${accent ? 'text-red-600' : 'text-slate-400'}`}>{info.label}</div>
                    </Td>
                    <Td>
                      <span className="font-bold" style={{ color: '#0073C6' }}>
                        {formatCurrency(d.total_contract_earnings, 2)}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function ClosingSoonReport() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [deals, setDeals] = useState(null);
  const [bu, setBu] = useState('');

  useEffect(() => {
    setDeals(null);
    // 90-day window with no lower bound — the endpoint also returns overdue open deals.
    dealsApi.getClosingSoon(90, bu || undefined)
      .then((res) => setDeals(res.data.data || []))
      .catch(() => { setDeals([]); addToast('Failed to load closing soon report', 'error'); });
  }, [bu]);

  const buckets = useMemo(() => {
    const overdue = [], d30 = [], d60 = [], d90 = [];
    for (const d of deals || []) {
      const diff = closeDateInfo(d.close_date).diffDays;
      if (diff == null) continue;
      if (diff < 0) overdue.push(d);
      else if (diff <= 30) d30.push(d);
      else if (diff <= 60) d60.push(d);
      else d90.push(d);
    }
    return { overdue, d30, d60, d90 };
  }, [deals]);

  const csvRows = useMemo(() => [
    ...buckets.overdue.map((d) => ({ ...d, _section: 'Overdue' })),
    ...buckets.d30.map((d) => ({ ...d, _section: 'Next 30 days' })),
    ...buckets.d60.map((d) => ({ ...d, _section: 'Next 60 days' })),
    ...buckets.d90.map((d) => ({ ...d, _section: 'Next 90 days' })),
  ], [buckets]);

  if (deals === null) {
    return <div className="bg-white border border-arkalon-lightgrey rounded-lg shadow-sm"><ReportLoading /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <FilterField label="Business Unit">
          <BuFilter value={bu} onChange={setBu} />
        </FilterField>
        <ExportButton onClick={() => exportToCsv('closing_soon', csvRows, CSV_COLUMNS)} disabled={csvRows.length === 0} />
      </div>

      {deals.length === 0 ? (
        <div className="bg-white border border-arkalon-lightgrey rounded-lg shadow-sm">
          <ReportEmpty message="No open deals are overdue or closing within 90 days." />
        </div>
      ) : (
        <>
          {buckets.overdue.length > 0 && (
            <Section title="Overdue" deals={buckets.overdue} accent navigate={navigate} />
          )}
          <Section title="Next 30 days" deals={buckets.d30} navigate={navigate} />
          <Section title="Next 60 days" deals={buckets.d60} navigate={navigate} />
          <Section title="Next 90 days" deals={buckets.d90} navigate={navigate} />
        </>
      )}
    </div>
  );
}
