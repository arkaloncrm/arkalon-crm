import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Thead, Th, Tbody, Td } from '../../components/UI/Table.jsx';
import Badge from '../../components/UI/Badge.jsx';
import { reportsApi } from '../../api/reports.js';
import { dealsApi } from '../../api/deals.js';
import { formatCurrency, formatPercentage } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import { exportToCsv } from '../../utils/exportCsv.js';
import { DEAL_STAGES, STAGE_COLOURS } from '../../utils/constants.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportShell, ReportLoading, ReportEmpty, ExportButton, FilterField, BU_COLOURS } from './reportPrimitives.jsx';

const selectClass =
  'px-3 py-1.5 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30';

function rateLabel(d) {
  const hasOverride =
    d.commission_override_amount !== null &&
    d.commission_override_amount !== undefined &&
    String(d.commission_override_amount).trim() !== '';
  return hasOverride ? 'Override' : formatPercentage(d.commission_percentage);
}

const CSV_COLUMNS = [
  { label: 'Deal Name', key: 'deal_name' },
  { label: 'Account', getValue: (r) => r.account_name || '' },
  { label: 'BU', key: 'business_unit' },
  { label: 'Stage', key: 'stage' },
  { label: 'Close Date', getValue: (r) => r.close_date || '' },
  { label: 'Gross Value', getValue: (r) => r.gross_total_value || 0, currency: true },
  { label: 'Commission Rate', getValue: (r) => rateLabel(r) },
  { label: 'Commission Value', getValue: (r) => r.total_contract_earnings || 0, currency: true },
  { label: 'Paid', getValue: (r) => (r.commission_paid ? 'Paid' : 'Unpaid') },
];

export default function CommissionByDealReport() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [deals, setDeals] = useState(null);
  const [bu, setBu] = useState('');
  const [stage, setStage] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [paidFilter, setPaidFilter] = useState('unpaid'); // default: show still-owed
  const [selected, setSelected] = useState(new Set());
  const [marking, setMarking] = useState(false);
  const [sortBy, setSortBy] = useState('close_date');
  const [sortDir, setSortDir] = useState('asc');

  // Server applies the paid filter (SQL); other dimensions filter client-side.
  const loadReport = () => reportsApi.commissionByDeal({ paid: paidFilter })
    .then((res) => setDeals(res.data.data || []))
    .catch(() => { setDeals([]); addToast('Failed to load commission by deal report', 'error'); });

  useEffect(() => {
    setDeals(null);
    setSelected(new Set());
    loadReport();
  }, [paidFilter]);

  const toggleSelect = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Batch mark the selected deals paid/unpaid in one request, then refresh.
  const handleBatch = async (paid) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setMarking(true);
    try {
      await dealsApi.markCommissionPaid(ids, paid);
      addToast(`Marked ${ids.length} deal${ids.length === 1 ? '' : 's'} ${paid ? 'paid' : 'unpaid'}`, 'success');
      setSelected(new Set());
      await loadReport();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update paid status', 'error');
    } finally {
      setMarking(false);
    }
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const rows = useMemo(() => {
    let list = (deals || []).filter((d) => {
      if (bu && d.business_unit !== bu) return false;
      if (stage && d.stage !== stage) return false;
      if (from || to) {
        if (!d.close_date) return false;
        const cd = String(d.close_date).slice(0, 10);
        if (from && cd < from) return false;
        if (to && cd > to) return false;
      }
      return true;
    });

    const numeric = sortBy === 'total_contract_earnings';
    list = [...list].sort((a, b) => {
      let av = a[sortBy];
      let bv = b[sortBy];
      if (numeric) { av = av || 0; bv = bv || 0; }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;   // nulls always last
      if (bv == null) return -1;
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [deals, bu, stage, from, to, sortBy, sortDir]);

  const total = useMemo(
    () => rows.reduce((s, d) => s + (d.total_contract_earnings || 0), 0),
    [rows],
  );

  const allSelected = rows.length > 0 && rows.every((d) => selected.has(d.id));
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((d) => d.id)));

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
          {DEAL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </FilterField>
      <FilterField label="Close From">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass} />
      </FilterField>
      <FilterField label="Close To">
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectClass} />
      </FilterField>
      <FilterField label="Paid Status">
        <select value={paidFilter} onChange={(e) => setPaidFilter(e.target.value)} className={selectClass}>
          <option value="unpaid">Unpaid only</option>
          <option value="all">All</option>
          <option value="paid">Paid only</option>
        </select>
      </FilterField>
    </>
  );

  return (
    <ReportShell
      filters={filters}
      action={<ExportButton onClick={() => exportToCsv('commission_by_deal', rows, CSV_COLUMNS)} disabled={rows.length === 0} />}
    >
      {deals === null ? (
        <ReportLoading />
      ) : rows.length === 0 ? (
        <ReportEmpty message="No deals match the selected filters." />
      ) : (
        <>
          {/* Batch mark-paid bar — the core "money landed, mark them together" flow */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-sm font-opensans text-arkalon-navy font-semibold">
                {selected.size} selected
              </span>
              <button onClick={() => handleBatch(true)} disabled={marking}
                className="text-sm font-montserrat font-semibold text-green-700 hover:underline disabled:opacity-50">
                Mark paid
              </button>
              <button onClick={() => handleBatch(false)} disabled={marking}
                className="text-sm font-montserrat font-semibold text-slate-600 hover:underline disabled:opacity-50">
                Mark unpaid
              </button>
              <button onClick={() => setSelected(new Set())}
                className="ml-auto text-sm font-opensans text-slate-500 hover:underline">
                Clear
              </button>
            </div>
          )}
          <Table>
            <Thead>
              <tr>
                <Th>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                    className="accent-arkalon-blue align-middle" aria-label="Select all" />
                </Th>
                <Th>Deal Name</Th>
                <Th>Account</Th>
                <Th sortable sorted={sortBy === 'business_unit'} direction={sortDir} onClick={() => toggleSort('business_unit')}>BU</Th>
                <Th sortable sorted={sortBy === 'stage'} direction={sortDir} onClick={() => toggleSort('stage')}>Stage</Th>
                <Th sortable sorted={sortBy === 'close_date'} direction={sortDir} onClick={() => toggleSort('close_date')}>Close Date</Th>
                <Th>Gross Value</Th>
                <Th>Commission Rate</Th>
                <Th sortable sorted={sortBy === 'total_contract_earnings'} direction={sortDir} onClick={() => toggleSort('total_contract_earnings')}>Commission Value</Th>
                <Th>Paid</Th>
              </tr>
            </Thead>
            <Tbody>
              {rows.map((d) => {
                const won = d.stage === 'Closed Won';
                const lost = d.stage === 'Closed Lost';
                const rowClass = won
                  ? 'bg-green-50 hover:bg-green-100/60'
                  : lost
                    ? 'bg-slate-100 text-slate-400 hover:bg-slate-200/60'
                    : 'bg-white hover:bg-blue-50/40';
                return (
                  <tr key={d.id} className={`transition-colors ${rowClass}`}>
                    <Td>
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)}
                        className="accent-arkalon-blue align-middle" aria-label={`Select ${d.deal_name}`} />
                    </Td>
                    <Td>
                      <button
                        onClick={() => navigate(`/deals/${d.id}`)}
                        className={`font-semibold hover:underline font-opensans ${lost ? 'text-slate-400' : 'text-arkalon-blue'}`}
                      >
                        {d.deal_name}
                      </button>
                    </Td>
                    <Td className={lost ? 'text-slate-400' : ''}>{d.account_name || '—'}</Td>
                    <Td>
                      <Badge className={BU_COLOURS[d.business_unit] || 'bg-gray-100 text-gray-600'}>
                        {d.business_unit}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge className={STAGE_COLOURS[d.stage] || 'bg-gray-100 text-gray-700'}>{d.stage}</Badge>
                    </Td>
                    <Td className={lost ? 'text-slate-400' : ''}>{formatDate(d.close_date)}</Td>
                    <Td className={lost ? 'text-slate-400' : ''}>{formatCurrency(d.gross_total_value, 0)}</Td>
                    <Td className={lost ? 'text-slate-400' : ''}>{rateLabel(d)}</Td>
                    <Td>
                      <span className="font-bold" style={{ color: lost ? '#94a3b8' : '#0073C6' }}>
                        {formatCurrency(d.total_contract_earnings, 2)}
                      </span>
                    </Td>
                    <Td>
                      {d.commission_paid
                        ? <Badge className="bg-green-100 text-green-700">Paid</Badge>
                        : <Badge className="bg-slate-100 text-slate-500">Unpaid</Badge>}
                    </Td>
                  </tr>
                );
              })}
              <tr className="bg-slate-100 font-montserrat font-semibold text-arkalon-navy">
                <Td></Td>
                <Td className="font-semibold">{rows.length} deal{rows.length === 1 ? '' : 's'}</Td>
                <Td></Td>
                <Td></Td>
                <Td></Td>
                <Td></Td>
                <Td></Td>
                <Td className="font-semibold text-right">Total</Td>
                <Td className="font-bold">
                  <span style={{ color: '#0073C6' }}>{formatCurrency(total, 2)}</span>
                </Td>
                <Td></Td>
              </tr>
            </Tbody>
          </Table>
        </>
      )}
    </ReportShell>
  );
}
