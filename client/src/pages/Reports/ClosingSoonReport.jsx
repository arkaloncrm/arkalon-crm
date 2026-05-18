import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/UI/Table.jsx';
import Badge from '../../components/UI/Badge.jsx';
import { dealsApi } from '../../api/deals.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate, closeDateInfo } from '../../utils/formatDate.js';
import { exportToXlsx } from '../../utils/exportCsv.js';
import { STAGE_COLOURS } from '../../utils/constants.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportShell, ReportLoading, ReportEmpty, ExportButton, FilterField, PillGroup, BuFilter, BU_COLOURS } from './reportPrimitives.jsx';

const DAY_OPTIONS = [
  { value: 7, label: '7' },
  { value: 14, label: '14' },
  { value: 30, label: '30' },
  { value: 60, label: '60' },
  { value: 90, label: '90' },
];

const CSV_COLUMNS = [
  { label: 'Deal Name', key: 'deal_name' },
  { label: 'Account', getValue: (r) => r.account_name || '' },
  { label: 'Close Date', getValue: (r) => r.close_date || '' },
  { label: 'Status', getValue: (r) => closeDateInfo(r.close_date).label },
  { label: 'Stage', key: 'stage' },
  { label: 'Commission', getValue: (r) => r.total_contract_earnings || 0, currency: true },
  { label: 'Probability', getValue: (r) => (r.probability != null ? `${r.probability}%` : '') },
  { label: 'BU', key: 'business_unit' },
];

export default function ClosingSoonReport() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [deals, setDeals] = useState(null);
  const [days, setDays] = useState(30);
  const [bu, setBu] = useState('');

  useEffect(() => {
    setDeals(null);
    dealsApi.getClosingSoon(days, bu || undefined)
      .then((res) => setDeals(res.data.data || []))
      .catch(() => { setDeals([]); addToast('Failed to load closing soon report', 'error'); });
  }, [days, bu]);

  const totalCommission = useMemo(
    () => (deals || []).reduce((s, d) => s + (d.total_contract_earnings || 0), 0),
    [deals],
  );

  const filters = (
    <>
      <FilterField label="Days Ahead">
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
      action={<ExportButton onClick={() => exportToXlsx('closing_soon', deals || [], CSV_COLUMNS)} disabled={!deals || deals.length === 0} />}
    >
      {deals === null ? (
        <ReportLoading />
      ) : deals.length === 0 ? (
        <ReportEmpty message={`No deals overdue or closing within ${days} days.`} />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Deal Name</Th>
              <Th>Account</Th>
              <Th>Close Date</Th>
              <Th>Stage</Th>
              <Th>Commission</Th>
              <Th>Probability</Th>
              <Th>BU</Th>
            </tr>
          </Thead>
          <Tbody>
            {deals.map((d) => {
              const info = closeDateInfo(d.close_date);
              const urgent = info.diffDays != null && info.diffDays <= 7;
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
                    <div className={urgent ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                      {formatDate(d.close_date)}
                    </div>
                    <div className={`text-xs ${urgent ? 'text-red-600' : 'text-slate-400'}`}>{info.label}</div>
                  </Td>
                  <Td>
                    <Badge className={STAGE_COLOURS[d.stage] || 'bg-gray-100 text-gray-700'}>{d.stage}</Badge>
                  </Td>
                  <Td>
                    <span className="font-bold" style={{ color: '#0073C6' }}>{formatCurrency(d.total_contract_earnings)}</span>
                  </Td>
                  <Td>{d.probability != null ? `${d.probability}%` : '—'}</Td>
                  <Td>
                    <Badge className={BU_COLOURS[d.business_unit] || 'bg-gray-100 text-gray-600'}>{d.business_unit}</Badge>
                  </Td>
                </Tr>
              );
            })}
            <tr className="bg-slate-100 font-montserrat font-semibold text-arkalon-navy">
              <Td className="font-semibold">{deals.length} deal{deals.length === 1 ? '' : 's'}</Td>
              <Td></Td>
              <Td></Td>
              <Td className="font-semibold text-right">Total Commission</Td>
              <Td className="font-bold">
                <span style={{ color: '#0073C6' }}>{formatCurrency(totalCommission)}</span>
              </Td>
              <Td></Td>
              <Td></Td>
            </tr>
          </Tbody>
        </Table>
      )}
    </ReportShell>
  );
}
