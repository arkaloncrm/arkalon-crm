import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Thead, Th, Tbody, Td } from '../../components/UI/Table.jsx';
import Badge from '../../components/UI/Badge.jsx';
import { dealsApi } from '../../api/deals.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate, formatLocalDatetime } from '../../utils/formatDate.js';
import { exportToXlsx } from '../../utils/exportCsv.js';
import { STAGE_COLOURS } from '../../utils/constants.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportShell, ReportLoading, ReportEmpty, ExportButton, FilterField, PillGroup, BuFilter, BU_COLOURS } from './reportPrimitives.jsx';

const DAY_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
];

const CSV_COLUMNS = [
  { label: 'Deal Name', key: 'deal_name' },
  { label: 'Account', getValue: (r) => r.account_name || '' },
  { label: 'Stage', key: 'stage' },
  { label: 'Close Date', getValue: (r) => r.close_date || '' },
  { label: 'Commission', getValue: (r) => r.total_contract_earnings || 0, currency: true },
  { label: 'Last Touch', getValue: (r) => (r.last_touch_date ? r.last_touch_date.slice(0, 10) : 'Never touched') },
  { label: 'Days Stale', getValue: (r) => r.days_stale ?? 'Never touched' },
  { label: 'Next Task', getValue: (r) => (r.next_open_task_due ? r.next_open_task_due.slice(0, 10) : 'No open tasks') },
  { label: 'BU', key: 'business_unit' },
];

function lastTouchLabel(row) {
  if (row.days_stale == null) return 'Never touched';
  const n = row.days_stale;
  return `${n} day${n === 1 ? '' : 's'} ago`;
}

export default function StaleDealsReport() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [deals, setDeals] = useState(null);
  const [days, setDays] = useState(14);
  const [bu, setBu] = useState('');

  useEffect(() => {
    setDeals(null);
    dealsApi.getStale(days, bu || undefined)
      .then((res) => setDeals(res.data.data || []))
      .catch(() => { setDeals([]); addToast('Failed to load stale deals report', 'error'); });
  }, [days, bu]);

  const filters = (
    <>
      <FilterField label="Stale Threshold">
        <PillGroup options={DAY_OPTIONS} value={days} onChange={setDays} />
      </FilterField>
      <FilterField label="Business Unit">
        <BuFilter value={bu} onChange={setBu} />
      </FilterField>
    </>
  );

  return (
    <ReportShell
      filters={filters}
      action={<ExportButton onClick={() => exportToXlsx('stale_deals', deals || [], CSV_COLUMNS)} disabled={!deals || deals.length === 0} />}
    >
      {deals === null ? (
        <ReportLoading />
      ) : deals.length === 0 ? (
        <ReportEmpty message={`No open deals have gone stale beyond ${days} days. 🎉`} />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Deal Name</Th>
              <Th>Account</Th>
              <Th>Stage</Th>
              <Th>Close Date</Th>
              <Th>Commission</Th>
              <Th>Last Touch</Th>
              <Th>Days Stale</Th>
              <Th>Next Task</Th>
              <Th>BU</Th>
              <Th></Th>
            </tr>
          </Thead>
          <Tbody>
            {deals.map((d) => {
              const neverTouched = d.last_touch_date == null;
              const rowTint = neverTouched
                ? 'bg-red-50'
                : (d.days_stale != null && d.days_stale > 30 ? 'bg-amber-50' : 'bg-white');
              return (
                <tr key={d.id} className={rowTint}>
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
                    <Badge className={STAGE_COLOURS[d.stage] || 'bg-gray-100 text-gray-700'}>{d.stage}</Badge>
                  </Td>
                  <Td>{formatDate(d.close_date)}</Td>
                  <Td>
                    <span className="font-bold" style={{ color: '#0073C6' }}>{formatCurrency(d.total_contract_earnings)}</span>
                  </Td>
                  <Td className={neverTouched ? 'text-red-600 font-semibold' : ''}>{lastTouchLabel(d)}</Td>
                  <Td>
                    {d.days_stale == null
                      ? <span className="text-red-600 font-semibold">Never touched</span>
                      : <span className={d.days_stale > 30 ? 'text-amber-700 font-semibold' : ''}>{d.days_stale}</span>}
                  </Td>
                  <Td>{d.next_open_task_due ? `Due ${formatLocalDatetime(d.next_open_task_due)}` : <span className="text-slate-400">No open tasks</span>}</Td>
                  <Td>
                    <Badge className={BU_COLOURS[d.business_unit] || 'bg-gray-100 text-gray-600'}>{d.business_unit}</Badge>
                  </Td>
                  <Td>
                    <button
                      onClick={() => navigate(`/activities/new?deal_id=${d.id}`)}
                      className="px-2.5 py-1 text-xs font-montserrat font-semibold rounded border border-arkalon-lightgrey bg-white text-arkalon-blue hover:bg-blue-50 transition-colors whitespace-nowrap"
                    >
                      Log Activity
                    </button>
                  </Td>
                </tr>
              );
            })}
          </Tbody>
        </Table>
      )}
    </ReportShell>
  );
}
