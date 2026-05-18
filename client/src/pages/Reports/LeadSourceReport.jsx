import React, { useState, useEffect, useMemo } from 'react';
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/UI/Table.jsx';
import Badge from '../../components/UI/Badge.jsx';
import { reportsApi } from '../../api/reports.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { exportToXlsx } from '../../utils/exportCsv.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportShell, ReportLoading, ReportEmpty, ExportButton, FilterField, BuFilter, BU_COLOURS } from './reportPrimitives.jsx';

const CSV_COLUMNS = [
  { label: 'Lead Source', key: 'source' },
  { label: 'BU', key: 'business_unit' },
  { label: 'Leads', getValue: (r) => r.lead_count || 0 },
  { label: 'Converted', getValue: (r) => r.converted_count || 0 },
  { label: 'Conv%', getValue: (r) => `${r.conversion_rate || 0}%` },
  { label: 'Deals', getValue: (r) => r.deal_count || 0 },
  { label: 'Commission', getValue: (r) => r.total_commission || 0, currency: true },
];

export default function LeadSourceReport() {
  const { addToast } = useToast();
  const [rows, setRows] = useState(null);
  const [bu, setBu] = useState('');

  useEffect(() => {
    setRows(null);
    reportsApi.leadSourcePerformance(bu ? { business_unit: bu } : {})
      .then((res) => setRows(res.data.data || []))
      .catch(() => { setRows([]); addToast('Failed to load lead source report', 'error'); });
  }, [bu]);

  const totals = useMemo(() => {
    const list = rows || [];
    return {
      leads: list.reduce((s, r) => s + (r.lead_count || 0), 0),
      converted: list.reduce((s, r) => s + (r.converted_count || 0), 0),
      deals: list.reduce((s, r) => s + (r.deal_count || 0), 0),
      commission: list.reduce((s, r) => s + (r.total_commission || 0), 0),
    };
  }, [rows]);

  const overallConv = totals.leads > 0 ? Math.round((totals.converted / totals.leads) * 100) : 0;

  return (
    <ReportShell
      filters={
        <FilterField label="Business Unit">
          <BuFilter value={bu} onChange={setBu} />
        </FilterField>
      }
      action={<ExportButton onClick={() => exportToXlsx('lead_source_performance', rows || [], CSV_COLUMNS)} disabled={!rows || rows.length === 0} />}
    >
      {rows === null ? (
        <ReportLoading />
      ) : rows.length === 0 ? (
        <ReportEmpty message="No lead source data for the selected business unit." />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Lead Source</Th>
              <Th>BU</Th>
              <Th>Leads</Th>
              <Th>Converted</Th>
              <Th>Conv%</Th>
              <Th>Deals</Th>
              <Th>Commission</Th>
            </tr>
          </Thead>
          <Tbody>
            {rows.map((r, i) => (
              <Tr key={`${r.source}|${r.business_unit}|${i}`}>
                <Td className="font-semibold text-arkalon-navy">{r.source}</Td>
                <Td>
                  <Badge className={BU_COLOURS[r.business_unit] || 'bg-gray-100 text-gray-600'}>{r.business_unit}</Badge>
                </Td>
                <Td>{r.lead_count}</Td>
                <Td>{r.converted_count}</Td>
                <Td>
                  <span className={r.conversion_rate >= 50 ? 'text-arkalon-success font-semibold' : ''}>
                    {r.conversion_rate}%
                  </span>
                </Td>
                <Td>{r.deal_count}</Td>
                <Td>
                  <span className="font-bold" style={{ color: '#0073C6' }}>{formatCurrency(r.total_commission)}</span>
                </Td>
              </Tr>
            ))}
            <tr className="bg-slate-100 font-montserrat font-semibold text-arkalon-navy">
              <Td className="font-semibold">All Sources</Td>
              <Td></Td>
              <Td className="font-semibold">{totals.leads}</Td>
              <Td className="font-semibold">{totals.converted}</Td>
              <Td className="font-semibold">{overallConv}%</Td>
              <Td className="font-semibold">{totals.deals}</Td>
              <Td className="font-bold">
                <span style={{ color: '#0073C6' }}>{formatCurrency(totals.commission)}</span>
              </Td>
            </tr>
          </Tbody>
        </Table>
      )}
    </ReportShell>
  );
}
