import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2, ExternalLink, Star } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import EmptyState from '../../components/UI/EmptyState.jsx';
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx';
import MobileCard, { CardAction } from '../../components/UI/MobileCard.jsx';
import { accountsApi } from '../../api/accounts.js';
import { useToast } from '../../context/ToastContext.jsx';
import { BUSINESS_UNITS, INDUSTRIES } from '../../utils/constants.js';
import { formatDate } from '../../utils/formatDate.js';

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
};

const PAGE_SIZE = 25;

// 44px-square star toggle. `active` renders a filled gold star, otherwise an
// outline. stopPropagation keeps a tap from triggering row/card navigation.
function PriorityStar({ active, onToggle }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={active ? 'Remove priority from account' : 'Mark account as priority'}
      title={active ? 'Remove priority' : 'Mark as priority'}
      className="flex items-center justify-center h-11 w-11 rounded transition-colors text-slate-300 hover:bg-slate-50 hover:text-amber-500"
    >
      <Star className="w-4 h-4" style={active ? { fill: '#f59e0b', stroke: '#f59e0b' } : undefined} />
    </button>
  );
}

export default function AccountsList() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [buFilter, setBuFilter] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState(false);
  const [page, setPage] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const fetchAccounts = useCallback(() => {
    setLoading(true);
    const params = {};
    if (buFilter) params.business_unit = buFilter;
    if (industryFilter) params.industry = industryFilter;
    if (search) params.search = search;

    accountsApi.getAll(params)
      .then(res => { setAccounts(res.data.data || []); setPage(1); })
      .catch(() => addToast('Failed to load accounts', 'error'))
      .finally(() => setLoading(false));
  }, [search, buFilter, industryFilter]);

  useEffect(() => {
    const t = setTimeout(fetchAccounts, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchAccounts, search]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await accountsApi.delete(deleteTarget.id);
      addToast('Account deleted', 'success');
      setDeleteTarget(null);
      setSelectedIds([]);
      fetchAccounts();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} record(s)? This cannot be undone.`)) return;
    // allSettled — attempt every delete even if one fails; always refresh afterwards
    const outcomes = await Promise.allSettled(selectedIds.map(id => accountsApi.delete(id)));
    const deleted = outcomes.filter(o => o.status === 'fulfilled').length;
    const failed = outcomes.length - deleted;
    setSelectedIds([]);
    fetchAccounts();
    if (failed === 0) addToast(`${deleted} record(s) deleted`, 'success');
    else if (deleted === 0) addToast(`Could not delete ${failed} record(s)`, 'error');
    else addToast(`${deleted} deleted · ${failed} could not be deleted`, 'error');
  };

  // Optimistic toggle — flip priority_flag immediately, roll back if the API fails.
  const handleTogglePriority = async (account) => {
    const previous = account.priority_flag === true;
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, priority_flag: !previous } : a));
    try {
      await accountsApi.togglePriority(account.id);
    } catch (err) {
      setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, priority_flag: previous } : a));
      addToast('Failed to update priority', 'error');
    }
  };

  const handleTogglePriorityFilter = () => {
    setPriorityFilter(p => !p);
    setPage(1);
  };

  const filtersActive = buFilter || industryFilter || search;
  // Priority is a frontend-only filter applied on top of the backend-filtered set.
  const visibleAccounts = priorityFilter ? accounts.filter(a => a.priority_flag === true) : accounts;
  const totalPages = Math.ceil(visibleAccounts.length / PAGE_SIZE);
  const paginated = visibleAccounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const start = visibleAccounts.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, visibleAccounts.length);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Accounts</h2>
          <span className="bg-slate-100 text-slate-500 text-xs font-montserrat font-semibold px-2 py-0.5 rounded-full">{visibleAccounts.length}</span>
        </div>
        <Button onClick={() => navigate('/accounts/new')}>+ New Account</Button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search accounts..."
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 w-56"
        />
        <select
          value={buFilter}
          onChange={e => setBuFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
        >
          <option value="">All Business Units</option>
          {BUSINESS_UNITS.map(bu => <option key={bu}>{bu}</option>)}
        </select>
        <select
          value={industryFilter}
          onChange={e => setIndustryFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
        >
          <option value="">All Industries</option>
          {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
        </select>
        <button
          type="button"
          onClick={handleTogglePriorityFilter}
          aria-pressed={priorityFilter}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded border font-opensans transition-colors ${
            priorityFilter
              ? 'bg-amber-50 border-amber-300 text-amber-700'
              : 'bg-white border-arkalon-lightgrey text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Star className="w-3.5 h-3.5" style={priorityFilter ? { fill: '#f59e0b', stroke: '#f59e0b' } : undefined} />
          Priority
        </button>
        {filtersActive && (
          <button onClick={() => { setSearch(''); setBuFilter(''); setIndustryFilter(''); }} className="text-xs text-arkalon-blue hover:underline font-opensans">
            Clear filters
          </button>
        )}
        {selectedIds.length > 0 && (
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
          >
            <Trash2 size={14} />
            Delete {selectedIds.length} selected
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white border border-arkalon-lightgrey rounded-lg p-8 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
      ) : accounts.length === 0 ? (
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <EmptyState title="No accounts yet" description="Create accounts to group your contacts and deals." action={() => navigate('/accounts/new')} actionLabel="Create your first account" />
        </div>
      ) : visibleAccounts.length === 0 ? (
        <div className="bg-white border border-arkalon-lightgrey rounded-lg p-8 text-center text-sm text-slate-400 font-opensans">
          No priority accounts match the current filters.
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="sm:hidden space-y-3">
            {paginated.map(account => (
              <MobileCard key={account.id} onClick={() => navigate(`/accounts/${account.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-arkalon-blue font-opensans text-sm truncate">{account.name}</span>
                  {account.business_unit && (
                    <Badge className={`${BU_COLOURS[account.business_unit] || 'bg-gray-100 text-gray-600'} flex-shrink-0`}>
                      {account.business_unit}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 space-y-0.5">
                  <div className="text-xs text-slate-500 font-opensans truncate">{account.industry || 'No industry'}</div>
                  <div className="text-xs text-slate-500 font-opensans truncate">{account.phone || 'No phone'}</div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-400 font-opensans">
                    {account.open_deals_count > 0
                      ? `${account.open_deals_count} open deal${account.open_deals_count === 1 ? '' : 's'}`
                      : 'No open deals'}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <PriorityStar active={account.priority_flag === true} onToggle={() => handleTogglePriority(account)} />
                    <CardAction label="Edit" onClick={() => navigate(`/accounts/${account.id}/edit`)}>
                      <Pencil className="w-4 h-4" />
                    </CardAction>
                    <CardAction label="Delete" danger onClick={() => setDeleteTarget(account)}>
                      <Trash2 className="w-4 h-4" />
                    </CardAction>
                  </div>
                </div>
              </MobileCard>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden sm:block bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-arkalon-lightgrey">
              <tr>
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selectedIds.length === visibleAccounts.length && visibleAccounts.length > 0}
                    onChange={(e) => setSelectedIds(e.target.checked ? visibleAccounts.map(r => r.id) : [])}
                  />
                </th>
                <th className="px-2 py-2.5 w-11"><span className="sr-only">Priority</span></th>
                {['Account Name', 'Business Unit', 'Industry', 'Phone', 'Website', 'Employees', 'Open Deals', 'Created', 'Actions'].map(col => (
                  <th key={col} className="px-3 py-2.5 text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((account, idx) => (
                <tr key={account.id} className={`border-b border-arkalon-lightgrey h-11 hover:bg-blue-50/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}>
                  <td className="px-3">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedIds.includes(account.id)}
                      onChange={(e) => setSelectedIds(prev =>
                        e.target.checked ? [...prev, account.id] : prev.filter(id => id !== account.id)
                      )}
                    />
                  </td>
                  <td className="px-2">
                    <PriorityStar active={account.priority_flag === true} onToggle={() => handleTogglePriority(account)} />
                  </td>
                  <td className="px-3 whitespace-nowrap">
                    <button onClick={() => navigate(`/accounts/${account.id}`)} className="font-semibold text-arkalon-blue hover:underline font-opensans text-sm">
                      {account.name}
                    </button>
                  </td>
                  <td className="px-3">
                    {account.business_unit && <Badge className={BU_COLOURS[account.business_unit] || 'bg-gray-100 text-gray-600'}>{account.business_unit}</Badge>}
                  </td>
                  <td className="px-3 text-slate-600 font-opensans whitespace-nowrap">{account.industry || '—'}</td>
                  <td className="px-3 text-slate-600 font-opensans whitespace-nowrap">{account.phone || '—'}</td>
                  <td className="px-3 font-opensans">
                    {account.website ? (
                      <a href={account.website.startsWith('http') ? account.website : `https://${account.website}`} target="_blank" rel="noopener noreferrer" className="text-arkalon-blue hover:underline flex items-center gap-1">
                        {account.website} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-3 text-slate-600 font-opensans text-center">{account.employee_count || '—'}</td>
                  <td className="px-3 text-center">
                    {account.open_deals_count > 0 ? (
                      <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">{account.open_deals_count}</span>
                    ) : (
                      <span className="text-slate-400 text-xs font-opensans">0</span>
                    )}
                  </td>
                  <td className="px-3 text-slate-500 font-opensans whitespace-nowrap">{formatDate(account.created_at)}</td>
                  <td className="px-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => navigate(`/accounts/${account.id}/edit`)} className="p-1 text-slate-400 hover:text-arkalon-blue transition-colors" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(account)} className="p-1 text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {visibleAccounts.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-slate-500 font-opensans">Showing {start}–{end} of {visibleAccounts.length}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs font-opensans border border-arkalon-lightgrey rounded bg-white hover:bg-slate-50 disabled:opacity-40">Prev</button>
            <span className="text-xs text-slate-600 font-opensans">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-xs font-opensans border border-arkalon-lightgrey rounded bg-white hover:bg-slate-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Account?"
        message={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
        loading={deleteLoading}
      />
    </div>
  );
}
