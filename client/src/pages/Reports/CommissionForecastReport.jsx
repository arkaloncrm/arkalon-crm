import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/UI/Table.jsx';
import Badge from '../../components/UI/Badge.jsx';
import { dealsApi } from '../../api/deals.js';
import { formatCurrency, formatMrr } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import { exportToXlsx } from '../../utils/exportCsv.js';
import { STAGE_COLOURS } from '../../utils/constants.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportShell, ReportLoading, ReportEmpty, ExportButton, BU_COLOURS } from './reportPrimitives.jsx';

const ASC_TYPES = ['Direct Customer', 'Partner', 'Referral'];

const CSV_COLUMNS = [
  { label: 'Deal Name', key: 'deal_name' },
  { label: 'Account', getValue: (r) => r.account_name || '' },
  { label: 'BU', key: 'business_unit' },
  { label: 'Deal Type', getValue: (r) => r.deal_type || '' },
  { label: 'Commission', getValue: (r) => r.total_contract_earnings || 0, currency: true },
  { label: 'Close Date', getValue: (r) => r.close_date || '' },
  { label: 'Stage', key: 'stage' },
];

function SummaryLine({ label, sub, amount }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-arkalon-lightgrey last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-opensans font-semibold text-arkalon-navy">{label}</div>
        <div className="text-xs font-opensans text-slate-400">{sub}</div>
      </div>
      <div className="font-montserrat font-bold text-sm flex-shrink-0" style={{ color: '#0073C6' }}>
        {formatCurrency(amount)}
      </div>
    </div>
  );
}

export default function CommissionForecastReport() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [deals, setDeals] = useState(null);

  useEffect(() => {
    dealsApi.getAll({ open_only: 'true' })
      .then((res) => setDeals(res.data.data || []))
      .catch(() => { setDeals([]); addToast('Failed to load commission forecast', 'error'); });
  }, []);

  const model = useMemo(() => {
    const list = deals || [];
    const asc = list.filter((d) => d.business_unit === 'ASC');
    const ss = list.filter((d) => d.business_unit === 'Simply Seated');

    const ascByType = ASC_TYPES.map((type) => {
      const typeDeals = asc.filter((d) => d.deal_type === type);
      return {
        type,
        count: typeDeals.length,
        mrr: typeDeals.reduce((s, d) => s + (d.monthly_recurring_revenue || 0), 0),
        commission: typeDeals.reduce((s, d) => s + (d.total_contract_earnings || 0), 0),
      };
    });

    const ascCommission = asc.reduce((s, d) => s + (d.total_contract_earnings || 0), 0);
    const ssCommission = ss.reduce((s, d) => s + (d.total_contract_earnings || 0), 0);
    const ssGross = ss.reduce((s, d) => s + (d.gross_total_value || 0), 0);

    return {
      ascByType,
      ascCommission,
      ss: { count: ss.length, gross: ssGross, commission: ssCommission },
      grandTotal: ascCommission + ssCommission,
      breakdown: [...list].sort((a, b) => (b.total_contract_earnings || 0) - (a.total_contract_earnings || 0)),
    };
  }, [deals]);

  if (deals === null) {
    return <ReportShell><ReportLoading /></ReportShell>;
  }
  if (deals.length === 0) {
    return <ReportShell><ReportEmpty message="No open deals to forecast commission for." /></ReportShell>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* ASC section */}
        <div className="bg-white border border-arkalon-lightgrey rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-arkalon-lightgrey flex items-center gap-2">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">ASC Technologies</h3>
            <Badge className={BU_COLOURS['ASC']}>ASC</Badge>
          </div>
          <div className="px-5 py-2">
            {model.ascByType.map((row) => (
              <SummaryLine
                key={row.type}
                label={row.type}
                sub={`${row.count} deal${row.count === 1 ? '' : 's'} · ${formatMrr(row.mrr)} MRR`}
                amount={row.commission}
              />
            ))}
          </div>
          <div className="px-5 py-3 bg-slate-50 border-t border-arkalon-lightgrey flex items-center justify-between">
            <span className="text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide">Total ASC Commission</span>
            <span className="font-montserrat font-bold text-base" style={{ color: '#0073C6' }}>
              {formatCurrency(model.ascCommission)}
            </span>
          </div>
        </div>

        {/* Simply Seated section */}
        <div className="bg-white border border-arkalon-lightgrey rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-arkalon-lightgrey flex items-center gap-2">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Simply Seated</h3>
            <Badge className={BU_COLOURS['Simply Seated']}>Simply Seated</Badge>
          </div>
          <div className="px-5 py-2">
            <SummaryLine
              label="All Deals"
              sub={`${model.ss.count} deal${model.ss.count === 1 ? '' : 's'} · ${formatCurrency(model.ss.gross)} gross value`}
              amount={model.ss.commission}
            />
          </div>
          <div className="px-5 py-3 bg-slate-50 border-t border-arkalon-lightgrey flex items-center justify-between">
            <span className="text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide">Total SS Commission</span>
            <span className="font-montserrat font-bold text-base" style={{ color: '#0073C6' }}>
              {formatCurrency(model.ss.commission)}
            </span>
          </div>
        </div>
      </div>

      {/* Grand total */}
      <div className="bg-white border-2 border-arkalon-blue rounded-lg px-5 py-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-montserrat font-bold text-slate-400 uppercase tracking-widest mb-1">
            Grand Total Projected Commission
          </div>
          <div className="text-xs text-slate-400 font-opensans">Combined across ASC Technologies & Simply Seated</div>
        </div>
        <div className="text-3xl font-montserrat font-bold" style={{ color: '#0073C6' }}>
          {formatCurrency(model.grandTotal)}
        </div>
      </div>

      {/* Breakdown table */}
      <ReportShell
        action={<ExportButton onClick={() => exportToXlsx('commission_forecast', model.breakdown, CSV_COLUMNS)} disabled={model.breakdown.length === 0} />}
        filters={<span className="text-xs font-montserrat font-semibold text-slate-400 uppercase tracking-wide">Deal Breakdown — sorted by commission</span>}
      >
        <Table>
          <Thead>
            <tr>
              <Th>Deal Name</Th>
              <Th>Account</Th>
              <Th>BU</Th>
              <Th>Deal Type</Th>
              <Th>Commission</Th>
              <Th>Close Date</Th>
              <Th>Stage</Th>
            </tr>
          </Thead>
          <Tbody>
            {model.breakdown.map((d) => (
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
                  <Badge className={BU_COLOURS[d.business_unit] || 'bg-gray-100 text-gray-600'}>{d.business_unit}</Badge>
                </Td>
                <Td>{d.deal_type || '—'}</Td>
                <Td>
                  <span className="font-bold" style={{ color: '#0073C6' }}>{formatCurrency(d.total_contract_earnings)}</span>
                </Td>
                <Td>{formatDate(d.close_date)}</Td>
                <Td>
                  <Badge className={STAGE_COLOURS[d.stage] || 'bg-gray-100 text-gray-700'}>{d.stage}</Badge>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </ReportShell>
    </div>
  );
}
