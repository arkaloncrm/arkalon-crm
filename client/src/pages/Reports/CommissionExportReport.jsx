import React, { useState, useEffect, useMemo } from 'react';
import { Table, Thead, Th, Tbody, Td } from '../../components/UI/Table.jsx';
import Badge from '../../components/UI/Badge.jsx';
import api from '../../api/axios.js';
import { formatCurrency, formatMrr, formatPercentage } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import { STAGE_COLOURS } from '../../utils/constants.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportShell, ReportLoading, ReportEmpty, ExportButton, FilterField } from './reportPrimitives.jsx';

const selectClass =
  'px-3 py-1.5 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30';

// Browser local time is Sydney for Stuart — default the picker to this month.
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// CSV column sets differ by business unit (per the monthly statement layout).
const SS_CSV_COLUMNS = [
  { label: 'Deal Name', getValue: (r) => r.deal_name || '' },
  { label: 'Account', getValue: (r) => r.account_name || '' },
  { label: 'Reference No.', getValue: (r) => r.reference_no || '' },
  { label: 'Close Date', getValue: (r) => formatDate(r.close_date) },
  { label: 'Gross Value (ex-GST)', getValue: (r) => Number(r.gross_total_value ?? 0).toFixed(2) },
  { label: 'Commission Rate', getValue: (r) => formatPercentage(r.commission_percentage) },
  { label: 'Commission Amount', getValue: (r) => r.commission_amount ?? 0 },
  { label: 'Stage', getValue: (r) => r.stage || '' },
];

const ASC_CSV_COLUMNS = [
  { label: 'Deal Name', getValue: (r) => r.deal_name || '' },
  { label: 'Account', getValue: (r) => r.account_name || '' },
  { label: 'Reference No.', getValue: (r) => r.reference_no || '' },
  { label: 'Close Date', getValue: (r) => formatDate(r.close_date) },
  { label: 'MRR', getValue: (r) => r.monthly_recurring_revenue ?? 0 },
  { label: 'Contract Term (months)', getValue: (r) => r.contract_term_months ?? '' },
  // ASC commission is the full earned amount over the contract term (what gets invoiced).
  { label: 'Total Commission', getValue: (r) => r.total_contract_earnings ?? 0 },
  { label: 'Stage', getValue: (r) => r.stage || '' },
];

// Inline CSV builder — we need an exact filename (commission-export-<bu>-<month>.csv)
// with no date suffix, which the shared exportToCsv helper always appends.
function downloadCsv(filename, rows, columns) {
  if (!rows || rows.length === 0) return;

  const escapeCell = (val) => {
    if (val === null || val === undefined) return '';
    let str = String(val);
    if (/^[=+\-@]/.test(str)) str = `'${str}`;
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = columns.map((c) => escapeCell(c.label)).join(',');
  const data = rows
    .map((row) => columns.map((c) => escapeCell(c.getValue(row))).join(','))
    .join('\n');

  const BOM = '﻿';
  const csv = `${BOM}${headers}\n${data}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function CommissionExportReport() {
  const { addToast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [bu, setBu] = useState('Simply Seated');
  const [deals, setDeals] = useState(null);

  useEffect(() => {
    setDeals(null);
    let cancelled = false;
    api.get('/reports/commission-export', { params: { month, business_unit: bu } })
      .then((res) => { if (!cancelled) setDeals(res.data.data || []); })
      .catch(() => {
        if (!cancelled) {
          setDeals([]);
          addToast('Failed to load commission export', 'error');
        }
      });
    return () => { cancelled = true; };
  }, [month, bu]);

  const isASC = bu === 'ASC';
  const rows = deals || [];

  const totalGross = useMemo(
    () => rows.reduce((s, d) => s + (Number(d.gross_total_value) || 0), 0),
    [rows],
  );
  // ASC invoices the full earned commission over the term; SS uses the flat per-deal amount.
  const totalCommission = useMemo(
    () => rows.reduce(
      (s, d) => s + (Number(isASC ? d.total_contract_earnings : d.commission_amount) || 0),
      0,
    ),
    [rows, isASC],
  );

  const handleExport = () => {
    const buSlug = isASC ? 'asc' : 'simply-seated';
    const columns = isASC ? ASC_CSV_COLUMNS : SS_CSV_COLUMNS;
    downloadCsv(`commission-export-${buSlug}-${month}.csv`, rows, columns);
  };

  const filters = (
    <>
      <FilterField label="Month">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={selectClass}
        />
      </FilterField>
      <FilterField label="Business Unit">
        <select value={bu} onChange={(e) => setBu(e.target.value)} className={selectClass}>
          <option value="Simply Seated">Simply Seated</option>
          <option value="ASC">ASC</option>
        </select>
      </FilterField>
    </>
  );

  return (
    <ReportShell
      filters={filters}
      action={<ExportButton onClick={handleExport} disabled={rows.length === 0} />}
    >
      {deals === null ? (
        <ReportLoading />
      ) : rows.length === 0 ? (
        <ReportEmpty message="No Closed Won deals found for this period" />
      ) : isASC ? (
        <Table>
          <Thead>
            <tr>
              <Th>Deal Name</Th>
              <Th>Account</Th>
              <Th>Reference No.</Th>
              <Th>Close Date</Th>
              <Th>MRR</Th>
              <Th>Contract Term (months)</Th>
              <Th>Total Commission</Th>
              <Th>Stage</Th>
            </tr>
          </Thead>
          <Tbody>
            {rows.map((d, i) => (
              <tr key={i} className="bg-green-50 hover:bg-green-100/60 transition-colors">
                <Td className="font-semibold text-arkalon-navy">{d.deal_name}</Td>
                <Td>{d.account_name || '—'}</Td>
                <Td>{d.reference_no || '—'}</Td>
                <Td>{formatDate(d.close_date)}</Td>
                <Td>{formatMrr(d.monthly_recurring_revenue)}</Td>
                <Td>{d.contract_term_months != null ? d.contract_term_months : '—'}</Td>
                <Td>
                  <span className="font-bold" style={{ color: '#0073C6' }}>
                    {formatCurrency(d.total_contract_earnings, 2)}
                  </span>
                </Td>
                <Td>
                  <Badge className={STAGE_COLOURS[d.stage] || 'bg-gray-100 text-gray-700'}>{d.stage}</Badge>
                </Td>
              </tr>
            ))}
            <tr className="bg-slate-100 font-montserrat font-semibold text-arkalon-navy">
              <Td colSpan={6} className="font-semibold text-right">
                {rows.length} deal{rows.length === 1 ? '' : 's'} — Total Gross {formatCurrency(totalGross, 2)}
              </Td>
              <Td className="font-bold">
                <span style={{ color: '#0073C6' }}>{formatCurrency(totalCommission, 2)}</span>
              </Td>
              <Td></Td>
            </tr>
          </Tbody>
        </Table>
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Deal Name</Th>
              <Th>Account</Th>
              <Th>Reference No.</Th>
              <Th>Close Date</Th>
              <Th>Gross Value (ex-GST)</Th>
              <Th>Commission Rate</Th>
              <Th>Commission Amount</Th>
              <Th>Stage</Th>
            </tr>
          </Thead>
          <Tbody>
            {rows.map((d, i) => (
              <tr key={i} className="bg-green-50 hover:bg-green-100/60 transition-colors">
                <Td className="font-semibold text-arkalon-navy">{d.deal_name}</Td>
                <Td>{d.account_name || '—'}</Td>
                <Td>{d.reference_no || '—'}</Td>
                <Td>{formatDate(d.close_date)}</Td>
                <Td>{formatCurrency(d.gross_total_value, 2)}</Td>
                <Td>{formatPercentage(d.commission_percentage)}</Td>
                <Td>
                  <span className="font-bold" style={{ color: '#0073C6' }}>
                    {formatCurrency(d.commission_amount, 2)}
                  </span>
                </Td>
                <Td>
                  <Badge className={STAGE_COLOURS[d.stage] || 'bg-gray-100 text-gray-700'}>{d.stage}</Badge>
                </Td>
              </tr>
            ))}
            <tr className="bg-slate-100 font-montserrat font-semibold text-arkalon-navy">
              <Td colSpan={4} className="font-semibold">
                {rows.length} deal{rows.length === 1 ? '' : 's'}
              </Td>
              <Td className="font-bold">{formatCurrency(totalGross, 2)}</Td>
              <Td className="font-semibold text-right">Total</Td>
              <Td className="font-bold">
                <span style={{ color: '#0073C6' }}>{formatCurrency(totalCommission, 2)}</span>
              </Td>
              <Td></Td>
            </tr>
          </Tbody>
        </Table>
      )}
    </ReportShell>
  );
}
