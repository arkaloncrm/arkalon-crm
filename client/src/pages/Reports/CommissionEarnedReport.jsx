import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/UI/Table.jsx';
import Badge from '../../components/UI/Badge.jsx';
import { reportsApi } from '../../api/reports.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import { exportToCsv } from '../../utils/exportCsv.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportShell, ReportLoading, ReportEmpty, ExportButton, BU_COLOURS } from './reportPrimitives.jsx';

const CSV_COLUMNS = [
  { label: 'Deal Name', key: 'deal_name' },
  { label: 'Account', getValue: (r) => r.account_name || '' },
  { label: 'BU', key: 'business_unit' },
  { label: 'Close Date', getValue: (r) => r.close_date || '' },
  { label: 'Gross Value', getValue: (r) => r.gross_total_value || 0, currency: true },
  { label: 'Commission Earned', getValue: (r) => r.total_contract_earnings || 0, currency: true },
];

export default function CommissionEarnedReport() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [data, setData] = useState(null);

  useEffect(() => {
    reportsApi.commissionEarned()
      .then((res) => setData(res.data.data || { deals: [], month_label: '' }))
      .catch(() => {
        setData({ deals: [], month_label: '' });
        addToast('Failed to load commission earned report', 'error');
      });
  }, []);

  const deals = data?.deals || [];
  const monthLabel = data?.month_label || 'this month';

  const total = useMemo(
    () => deals.reduce((s, d) => s + (d.total_contract_earnings || 0), 0),
    [deals],
  );

  if (data === null) {
    return <ReportShell><ReportLoading /></ReportShell>;
  }

  return (
    <div className="space-y-4">
      <ReportShell
        filters={
          <span className="text-xs font-montserrat font-semibold text-slate-400 uppercase tracking-wide">
            Closed Won — {monthLabel}
          </span>
        }
        action={<ExportButton onClick={() => exportToCsv('commission_earned', deals, CSV_COLUMNS)} disabled={deals.length === 0} />}
      >
        {deals.length === 0 ? (
          <ReportEmpty message="No deals closed this month yet." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Deal Name</Th>
                <Th>Account</Th>
                <Th>BU</Th>
                <Th>Close Date</Th>
                <Th>Gross Value</Th>
                <Th>Commission Earned</Th>
              </tr>
            </Thead>
            <Tbody>
              {deals.map((d) => (
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
                  <Td>{formatDate(d.close_date)}</Td>
                  <Td>{formatCurrency(d.gross_total_value, 0)}</Td>
                  <Td>
                    <span className="font-bold" style={{ color: '#0073C6' }}>
                      {formatCurrency(d.total_contract_earnings, 2)}
                    </span>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </ReportShell>

      {deals.length > 0 && (
        <div className="bg-white border-2 border-arkalon-blue rounded-lg px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-montserrat font-bold text-slate-400 uppercase tracking-widest mb-1">
              Total Commission Earned — {monthLabel}
            </div>
            <div className="text-xs text-slate-400 font-opensans">
              {deals.length} deal{deals.length === 1 ? '' : 's'} closed won
            </div>
          </div>
          <div className="text-3xl font-montserrat font-bold" style={{ color: '#0073C6' }}>
            {formatCurrency(total, 2)}
          </div>
        </div>
      )}
    </div>
  );
}
