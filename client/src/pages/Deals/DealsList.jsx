import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { List, LayoutGrid, Pencil, Trash2, X } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import SearchBar from '../../components/UI/SearchBar.jsx';
import EmptyState from '../../components/UI/EmptyState.jsx';
import Badge from '../../components/UI/Badge.jsx';
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx';
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/UI/Table.jsx';
import { BUSINESS_UNITS, DEAL_STAGES, STAGE_COLOURS, FORECAST_CATEGORIES } from '../../utils/constants.js';
import { formatCurrency, formatMrr } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import { dealsApi } from '../../api/deals.js';
import { useToast } from '../../context/ToastContext.jsx';
import DealKanban from './DealKanban.jsx';

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
};

function isCloseDatePast(dateStr, stage) {
  if (!dateStr) return false;
  if (stage === 'Closed Won' || stage === 'Closed Lost') return false;
  return new Date(dateStr) < new Date();
}

// Inline-editable table cell. Shows display content with a pencil that appears
// on row hover; double-click swaps in an input. Commits on blur, reverts on
// Escape. `onCommit` is expected to handle its own errors and never reject.
function EditableCell({ value, type, options, children, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = (e) => {
    e.stopPropagation();
    setDraft(value ?? '');
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = draft === '' ? null : draft;
    if (next === (value ?? null)) return;
    onCommit(next);
  };

  const cancel = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  const fieldCls =
    'px-2 py-1 text-sm border border-arkalon-blue rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30';

  if (editing) {
    return (
      <Td>
        <div onClick={e => e.stopPropagation()}>
          {type === 'select' ? (
            <select
              autoFocus
              value={draft ?? ''}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
              className={fieldCls}
            >
              {options.map(o => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <input
              autoFocus
              type="date"
              value={draft || ''}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
              className={fieldCls}
            />
          )}
        </div>
      </Td>
    );
  }

  return (
    <Td>
      <div
        onClick={e => e.stopPropagation()}
        onDoubleClick={startEdit}
        title="Double-click to edit"
        className="flex items-center gap-1.5 cursor-text min-h-[1.5rem]"
      >
        {children}
        <Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>
    </Td>
  );
}

export default function DealsList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const productIdFilter = searchParams.get('product_id');
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [buFilter, setBuFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [forecastFilter, setForecastFilter] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadDeals = () => {
    setLoading(true);
    dealsApi.getAll({ sort_by: 'close_date', sort_dir: 'asc', product_id: productIdFilter || undefined })
      .then(res => setDeals(res.data.data || []))
      .catch(() => addToast('Failed to load deals', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDeals(); }, [productIdFilter]);

  const clearProductFilter = () => {
    searchParams.delete('product_id');
    setSearchParams(searchParams);
  };

  const records = deals.filter(d => {
    if (buFilter && d.business_unit !== buFilter) return false;
    if (stageFilter && d.stage !== stageFilter) return false;
    if (forecastFilter && d.forecast_category !== forecastFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const nameMatch = (d.deal_name?.toLowerCase() || '').includes(q);
      const accountMatch = (d.account_name?.toLowerCase() || '').includes(q);
      if (!nameMatch && !accountMatch) return false;
    }
    return true;
  });

  const handleInlineEdit = async (deal, field, value) => {
    const snapshot = deals;
    // Optimistic update so the cell reflects the change immediately.
    setDeals(ds => ds.map(d => (d.id === deal.id ? { ...d, [field]: value } : d)));
    try {
      const res = await dealsApi.patch(deal.id, { [field]: value });
      // Merge the server row — a stage change recomputes probability/forecast/weighted.
      setDeals(ds => ds.map(d => (d.id === deal.id ? { ...d, ...res.data.data } : d)));
      addToast('Deal updated', 'success');
    } catch (err) {
      setDeals(snapshot);
      addToast(err.response?.data?.error || 'Failed to update deal', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await dealsApi.delete(deleteTarget.id);
      addToast('Deal deleted', 'success');
      setDeals(prev => prev.filter(d => d.id !== deleteTarget.id));
    } catch {
      addToast('Failed to delete deal', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Deals</h2>
          <span className="bg-slate-100 text-slate-500 text-xs font-montserrat font-semibold px-2 py-0.5 rounded-full">
            {records.length}
          </span>
        </div>
        <Button onClick={() => navigate('/deals/new')}>+ New Deal</Button>
      </div>

      {productIdFilter && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-opensans text-arkalon-navy">
            Filtered to deals containing the selected product.
          </span>
          <button onClick={clearProductFilter}
            className="ml-auto inline-flex items-center gap-1 text-sm text-arkalon-blue hover:underline font-opensans">
            <X className="w-3.5 h-3.5" /> Clear filter
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchBar value={search} onChange={setSearch} placeholder="Search deals or accounts..." className="w-64" />
        <select value={buFilter} onChange={e => setBuFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
          <option value="">All Business Units</option>
          {BUSINESS_UNITS.map(bu => <option key={bu}>{bu}</option>)}
        </select>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
          <option value="">All Stages</option>
          {DEAL_STAGES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={forecastFilter} onChange={e => setForecastFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
          <option value="">All Forecasts</option>
          {FORECAST_CATEGORIES.map(f => <option key={f}>{f}</option>)}
        </select>

        <div className="ml-auto flex items-center gap-1 border border-arkalon-lightgrey rounded overflow-hidden">
          <button onClick={() => setViewMode('list')}
            className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-arkalon-blue text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
            <List className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('kanban')}
            className={`p-2 transition-colors ${viewMode === 'kanban' ? 'bg-arkalon-blue text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <DealKanban deals={records} onStageChange={loadDeals} onDealClick={id => navigate(`/deals/${id}`)} />
      ) : (
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          {loading ? (
            <div className="py-12 text-center text-slate-400 font-opensans text-sm">Loading…</div>
          ) : records.length === 0 ? (
            <EmptyState
              title="No deals yet"
              description="Track your opportunities from prospect to close."
              action={() => navigate('/deals/new')}
              actionLabel="Create your first deal"
            />
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
                  <Th>Prob%</Th>
                  <Th>Next Action</Th>
                  <Th>BU</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <Tbody>
                {records.map(r => (
                  <Tr key={r.id} className="group" onClick={() => navigate(`/deals/${r.id}`)}>
                    <Td className="font-semibold text-arkalon-blue">{r.deal_name}</Td>
                    <Td>
                      {r.account_name ? (
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/accounts/${r.account_id}`); }}
                          className="text-arkalon-blue hover:underline font-opensans text-sm"
                        >
                          {r.account_name}
                        </button>
                      ) : '—'}
                    </Td>
                    <EditableCell
                      type="select"
                      value={r.stage}
                      options={DEAL_STAGES}
                      onCommit={(v) => handleInlineEdit(r, 'stage', v)}
                    >
                      <Badge className={STAGE_COLOURS[r.stage] || 'bg-gray-100 text-gray-700'}>
                        {r.stage}
                      </Badge>
                    </EditableCell>
                    <EditableCell
                      type="date"
                      value={r.close_date}
                      onCommit={(v) => handleInlineEdit(r, 'close_date', v)}
                    >
                      <span className={isCloseDatePast(r.close_date, r.stage) ? 'text-red-600 font-semibold' : ''}>
                        {formatDate(r.close_date)}
                      </span>
                    </EditableCell>
                    <Td>{formatCurrency(r.gross_total_value)}</Td>
                    <Td>{r.business_unit === 'ASC' ? formatMrr(r.monthly_recurring_revenue) : '—'}</Td>
                    <Td>
                      <span className="font-bold" style={{ color: '#0073C6' }}>
                        {formatCurrency(r.total_contract_earnings)}
                      </span>
                    </Td>
                    <Td>{r.probability != null ? `${r.probability}%` : '—'}</Td>
                    <EditableCell
                      type="date"
                      value={r.next_action_date}
                      onCommit={(v) => handleInlineEdit(r, 'next_action_date', v)}
                    >
                      <span>{formatDate(r.next_action_date)}</span>
                    </EditableCell>
                    <Td>
                      <Badge className={BU_COLOURS[r.business_unit] || 'bg-gray-100 text-gray-600'}>
                        {r.business_unit}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => navigate(`/deals/${r.id}/edit`)}
                          className="p-1 text-slate-400 hover:text-arkalon-blue transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteTarget(r)}
                          className="p-1 text-slate-400 hover:text-red-600 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Deal"
        message={`Delete "${deleteTarget?.deal_name}"? This will also remove all linked notes, activities, and tasks.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
