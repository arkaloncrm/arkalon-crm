import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/UI/Table.jsx';
import Badge from '../../components/UI/Badge.jsx';
import { dealsApi } from '../../api/deals.js';
import { formatCurrency, formatMrr } from '../../utils/formatCurrency.js';
import { formatDate, closeDateInfo } from '../../utils/formatDate.js';
import { exportToXlsx } from '../../utils/exportCsv.js';
import { STAGE_COLOURS } from '../../utils/constants.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportShell, ReportLoading, ReportEmpty, ExportButton, FilterField, BU_COLOURS } from './reportPrimitives.jsx';

const OPEN_STAGES = [
  'Prospect', 'Qualified', 'Contacted', 'Proposal Sent',
  'Demo Done', 'Negotiation', 'Verbal Agreement', 'Contract Sent',
];

const selectClass =
  'px-3 py-1.5 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30';

const CSV_COLUMNS = [
  { label: 'Deal Name', key: 'deal_name' },
  { label: 'Account', getValue: (r) => r.account_name || '' },
  { label: 'Stage', key: 'stage' },
  { label: 'Close Date', getValue: (r) => r.close_date || '' },
  { label: 'Gross Value', getValue: (r) => r.gross_total_value || 0, currency: true },
  { label: 'MRR', getValue: (r) => (r.business_unit === 'ASC' ? r.monthly_recurring_revenue || 0 : ''), currency: true },
  { label: 'Commission', getValue: (r) => r.total_contract_earnings || 0, currency: true },
  { label: 'Probability', getValue: (r) => (r.probability != null ? `${r.probability}%` : '') },
  { label: 'BU', key: 'business_unit' },
];

export default function OpenPipelineReport() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [deals, setDeals] = useState(null);
  const [bu, setBu] = useState('');
  const [stage, setStage] = useState('');
  const [forecast, setForecast] = useState('');

  useEffect(() => {
    dealsApi.getAll({ open_only: 'true', sort_by: 'close_date', sort_dir: 'asc' })
      .then((res) => setDeals(res.data.data || []))
      .catch(() => { setDeals([]); addToast('Failed to load open pipeline', 'error'); });
  }, []);

  const rows = useMemo(() => {
    if (!deals) return [];
    return deals.filter((d) => {
      if (bu && d.business_unit !== bu) return false;
      if (stage && d.stage !== stage) return false;
      if (forecast && d.forecast_category !== forecast) return false;
      return true;
    });
  }, [deals, bu, stage, forecast]);

  const totals = useMemo(() => ({
    gross: rows.reduce((s, d) => s + (d.gross_total_value || 0), 0),
    commission: rows.reduce((s, d) => s + (d.total_contract_earnings || 0), 0),
    count: rows.length,
  }), [rows]);

  const filters = (
    <>
      <FilterField label="Business Unit">
        <select value={bu} onChange={(e) => setBu(e.target.value)} className={selectClass}>
          <option value="">All</option>
          <option value="ASC">ASC</option>
          <option value="Simply Seated">Simply Seated</option>
        </select>
      </FilterField>
      <FilterField label="Stage">
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={selectClass}>
          <option value="">All</option>
          {OPEN_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </FilterField>
      <FilterField label="Forecast">
        <select value={forecast} onChange={(e) => setForecast(e.target.value)} className={selectClass}>
          <option value="">All</option>
          <option value="Pipeline">Pipeline</option>
          <option value="Best Case">Best Case</option>
          <option value="Commit">Commit</option>
        </select>
      </FilterField>
    </>
  );

  return (
    <ReportShell
      filters={filters}
      action={<ExportButton onClick={() => exportToXlsx('open_pipeline', rows, CSV_COLUMNS)} disabled={rows.length === 0} />}
    >
      {deals === null ? (
        <ReportLoading />
      ) : rows.length === 0 ? (
        <ReportEmpty message="No open deals match the selected filters." />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Deal Name</Th>
              <Th>Account</Th>
              <Th>Stage</Th>
              <Th>Close Date</Th>
              <Th>Gross Value</Th>
              <Th>MRR</Th>
              <Th>Commission</Th>
              <Th>Probability</Th>
              <Th>BU</Th>
            </tr>
          </Thead>
          <Tbody>
            {rows.map((d) => {
              const info = closeDateInfo(d.close_date);
              const closeRed = info.diffDays != null && info.diffDays < 30;
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
                    <Badge className={STAGE_COLOURS[d.stage] || 'bg-gray-100 text-gray-700'}>{d.stage}</Badge>
                  </Td>
                  <Td className={closeRed ? 'text-red-600 font-semibold' : ''}>{formatDate(d.close_date)}</Td>
                  <Td>{formatCurrency(d.gross_total_value)}</Td>
                  <Td>{d.business_unit === 'ASC' ? formatMrr(d.monthly_recurring_revenue) : '—'}</Td>
                  <Td>
                    <span className="font-bold" style={{ color: '#0073C6' }}>
                      {formatCurrency(d.total_contract_earnings)}
                    </span>
                  </Td>
                  <Td>{d.probability != null ? `${d.probability}%` : '—'}</Td>
                  <Td>
                    <Badge className={BU_COLOURS[d.business_unit] || 'bg-gray-100 text-gray-600'}>
                      {d.business_unit}
                    </Badge>
                  </Td>
                </Tr>
              );
            })}
            <tr className="bg-slate-100 font-montserrat font-semibold text-arkalon-navy">
              <Td className="font-semibold">{totals.count} deal{totals.count === 1 ? '' : 's'}</Td>
              <Td></Td>
              <Td></Td>
              <Td></Td>
              <Td className="font-semibold">{formatCurrency(totals.gross)}</Td>
              <Td></Td>
              <Td className="font-bold" >
                <span style={{ color: '#0073C6' }}>{formatCurrency(totals.commission)}</span>
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
