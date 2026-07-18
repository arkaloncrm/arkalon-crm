import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, LayoutGrid, Pencil, Trash2, RefreshCw, ChevronUp, ChevronDown, MessageSquare } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import EmptyState from '../../components/UI/EmptyState.jsx';
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx';
import { CardAction } from '../../components/UI/MobileCard.jsx';
import SwipeableCard from '../../components/UI/SwipeableCard.jsx';
import QuickNoteModal from '../../components/UI/QuickNoteModal.jsx';
import { LinkedInLink, CallLogPanel, LogMessagePanel } from '../../components/UI/CommLinks.jsx';
import LeadKanban from './LeadKanban.jsx';
import { leadsApi } from '../../api/leads.js';
import { useToast } from '../../context/ToastContext.jsx';
import { BUSINESS_UNITS, LEAD_STATUSES, PRIORITY_COLOURS } from '../../utils/constants.js';
import { formatRelative } from '../../utils/formatDate.js';
import { formatPhoneAU } from '../../utils/formatPhone.js';

const STATUS_COLOURS = {
  'New': 'bg-gray-100 text-gray-600',
  'Attempted Contact': 'bg-blue-100 text-blue-700',
  'Contacted': 'bg-indigo-100 text-indigo-700',
  'Meeting Booked': 'bg-purple-100 text-purple-700',
  'Qualified': 'bg-green-100 text-green-700',
  'Converted': 'bg-emerald-100 text-emerald-800',
  'Not Qualified': 'bg-orange-100 text-orange-700',
  'Junk': 'bg-red-100 text-red-700',
};

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
};

const PAGE_SIZE = 25;

const SORTABLE_COLS = [
  { key: 'last_name', label: 'Lead Name' },
  { key: 'company', label: 'Company' },
  { key: 'business_unit', label: 'Business Unit' },
  { key: 'lead_status', label: 'Lead Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'updated_at', label: 'Last Activity' },
];

function SortHeader({ col, sortBy, sortDir, onSort }) {
  const isActive = sortBy === col.key;
  return (
    <th
      className="px-3 py-2.5 text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-arkalon-navy whitespace-nowrap"
      onClick={() => onSort(col.key)}
    >
      <span className="flex items-center gap-1">
        {col.label}
        {isActive ? (
          sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-arkalon-blue" /> : <ChevronDown className="w-3 h-3 text-arkalon-blue" />
        ) : (
          <ChevronDown className="w-3 h-3 text-slate-300" />
        )}
      </span>
    </th>
  );
}

export default function LeadsList() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list');

  const [search, setSearch] = useState('');
  const [buFilter, setBuFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const [openSwipeId, setOpenSwipeId] = useState(null);
  const [call, setCall] = useState(null);
  const [logMessageRecord, setLogMessageRecord] = useState(null);
  const [noteLead, setNoteLead] = useState(null);

  const fetchLeads = useCallback(() => {
    setLoading(true);
    const params = { converted: 0, sort_by: sortBy, sort_dir: sortDir };
    if (buFilter) params.business_unit = buFilter;
    if (statusFilter) params.status = statusFilter;
    if (priorityFilter) params.priority = priorityFilter;
    if (search) params.search = search;

    leadsApi.getAll(params)
      .then(res => { setLeads(res.data.data || []); setPage(1); })
      .catch(() => addToast('Failed to load leads', 'error'))
      .finally(() => setLoading(false));
  }, [search, buFilter, statusFilter, priorityFilter, sortBy, sortDir]);

  useEffect(() => {
    const t = setTimeout(fetchLeads, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchLeads, search]);

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await leadsApi.delete(deleteTarget.id);
      addToast('Lead deleted', 'success');
      setDeleteTarget(null);
      setSelectedIds([]);
      fetchLeads();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete lead';
      addToast(msg, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} record(s)? This cannot be undone.`)) return;
    // allSettled — attempt every delete even if one fails; always refresh afterwards
    const outcomes = await Promise.allSettled(selectedIds.map(id => leadsApi.delete(id)));
    const deleted = outcomes.filter(o => o.status === 'fulfilled').length;
    const failed = outcomes.length - deleted;
    setSelectedIds([]);
    fetchLeads();
    if (failed === 0) addToast(`${deleted} record(s) deleted`, 'success');
    else if (deleted === 0) addToast(`Could not delete ${failed} record(s)`, 'error');
    else addToast(`${deleted} deleted · ${failed} could not be deleted`, 'error');
  };

  // Swipe-right Call action — reuses the shared click-to-call logging panel.
  const handleSwipeCall = (lead) => {
    const phone = lead.phone || lead.mobile;
    if (!phone) {
      addToast('No phone number on record', 'error');
      return;
    }
    setCall({
      phone,
      name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.company,
      email: lead.email,
      businessUnit: lead.business_unit,
      link: { lead_id: lead.id },
      timestamp: new Date().toISOString(),
    });
  };

  const filtersActive = buFilter || statusFilter || priorityFilter || search;

  const totalPages = Math.ceil(leads.length / PAGE_SIZE);
  const paginated = leads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const start = leads.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, leads.length);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Leads</h2>
          <span className="bg-slate-100 text-slate-500 text-xs font-montserrat font-semibold px-2 py-0.5 rounded-full">
            {leads.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0 border border-arkalon-lightgrey rounded overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-arkalon-blue text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 transition-colors ${viewMode === 'kanban' ? 'bg-arkalon-blue text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
              title="Kanban view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={() => navigate('/leads/new')}>+ New Lead</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search leads..."
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
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
        >
          <option value="">All Statuses</option>
          {LEAD_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
        >
          <option value="">All Priorities</option>
          {['P1 - Act Now', 'P2 - This Month', 'P3 - Pipeline', 'Parked'].map(p => <option key={p}>{p}</option>)}
        </select>
        {filtersActive && (
          <button
            onClick={() => { setSearch(''); setBuFilter(''); setStatusFilter(''); setPriorityFilter(''); }}
            className="text-xs text-arkalon-blue hover:underline font-opensans"
          >
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

      {viewMode === 'kanban' ? (
        <LeadKanban filters={{ business_unit: buFilter }} onLeadClick={id => navigate(`/leads/${id}`)} />
      ) : (
        <>
          {loading ? (
            <div className="bg-white border border-arkalon-lightgrey rounded-lg p-8 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
              <EmptyState
                title="No leads yet"
                description="Start building your pipeline by creating your first lead."
                action={() => navigate('/leads/new')}
                actionLabel="Create your first lead"
              />
            </div>
          ) : (
            <>
              {/* Mobile: swipeable stacked cards — swipe right to Call, left to Note */}
              <div className="sm:hidden space-y-3">
                {paginated.map(lead => (
                  <SwipeableCard
                    key={lead.id}
                    swipeId={lead.id}
                    openId={openSwipeId}
                    setOpenId={setOpenSwipeId}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    onCall={() => handleSwipeCall(lead)}
                    onNote={() => setNoteLead(lead)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`font-semibold font-opensans text-sm truncate ${lead.converted ? 'line-through text-slate-400' : 'text-arkalon-blue'}`}>
                        {lead.company}
                      </span>
                      {lead.business_unit && (
                        <Badge className={`${BU_COLOURS[lead.business_unit] || 'bg-gray-100 text-gray-600'} flex-shrink-0`}>
                          {lead.business_unit}
                        </Badge>
                      )}
                    </div>
                    {(lead.first_name || lead.last_name) && (
                      <div className="text-xs text-slate-500 font-opensans mt-0.5 truncate">
                        {[lead.first_name, lead.last_name].filter(Boolean).join(' ')}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {lead.lead_status && (
                        <Badge className={STATUS_COLOURS[lead.lead_status] || 'bg-gray-100 text-gray-600'}>{lead.lead_status}</Badge>
                      )}
                      {lead.priority && (
                        <Badge className={PRIORITY_COLOURS[lead.priority] || 'bg-gray-100 text-gray-600'}>{lead.priority}</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-400 font-opensans truncate">
                        {lead.lead_source || 'No source'} · {formatRelative(lead.updated_at)}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {lead.linkedin_url && (
                          <LinkedInLink
                            url={lead.linkedin_url}
                            className="h-11 w-11 justify-center text-slate-400 hover:text-arkalon-blue hover:bg-slate-50 rounded"
                          />
                        )}
                        <CardAction
                          label="Log Message"
                          onClick={() => setLogMessageRecord({
                            name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.company,
                            link: { lead_id: lead.id },
                            businessUnit: lead.business_unit,
                          })}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </CardAction>
                        <CardAction label="Edit" onClick={() => navigate(`/leads/${lead.id}/edit`)}>
                          <Pencil className="w-4 h-4" />
                        </CardAction>
                        <CardAction label="Delete" danger onClick={() => setDeleteTarget(lead)}>
                          <Trash2 className="w-4 h-4" />
                        </CardAction>
                      </div>
                    </div>
                  </SwipeableCard>
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
                        checked={selectedIds.length === leads.length && leads.length > 0}
                        onChange={(e) => setSelectedIds(e.target.checked ? leads.map(r => r.id) : [])}
                      />
                    </th>
                    {SORTABLE_COLS.map(col => (
                      <SortHeader key={col.key} col={col} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                    ))}
                    <th className="px-3 py-2.5 text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Phone</th>
                    <th className="px-3 py-2.5 text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Email</th>
                    <th className="px-3 py-2.5 text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((lead, idx) => (
                    <tr
                      key={lead.id}
                      className={`border-b border-arkalon-lightgrey h-11 hover:bg-blue-50/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'} ${lead.converted ? 'opacity-60' : ''}`}
                    >
                      <td className="px-3">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedIds.includes(lead.id)}
                          onChange={(e) => setSelectedIds(prev =>
                            e.target.checked ? [...prev, lead.id] : prev.filter(id => id !== lead.id)
                          )}
                        />
                      </td>
                      <td className="px-3 whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/leads/${lead.id}`)}
                          className={`font-semibold hover:underline font-opensans text-sm ${lead.converted ? 'line-through text-slate-400' : 'text-arkalon-blue'}`}
                        >
                          {lead.first_name} {lead.last_name}
                        </button>
                      </td>
                      <td className="px-3 font-opensans text-slate-700 whitespace-nowrap">{lead.company}</td>
                      <td className="px-3">
                        {lead.business_unit && (
                          <Badge className={BU_COLOURS[lead.business_unit] || 'bg-gray-100 text-gray-600'}>
                            {lead.business_unit}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3">
                        {lead.lead_status && (
                          <Badge className={STATUS_COLOURS[lead.lead_status] || 'bg-gray-100 text-gray-600'}>
                            {lead.lead_status === 'Converted' ? `✓ ${lead.lead_status}` : lead.lead_status}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3">
                        {lead.priority && (
                          <Badge className={PRIORITY_COLOURS[lead.priority] || 'bg-gray-100 text-gray-600'}>
                            {lead.priority}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 text-slate-500 font-opensans whitespace-nowrap">{formatRelative(lead.updated_at)}</td>
                      <td className="px-3 text-slate-600 font-opensans whitespace-nowrap">{formatPhoneAU(lead.phone) || '—'}</td>
                      <td className="px-3 text-slate-600 font-opensans">{lead.email || '—'}</td>
                      <td className="px-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/leads/${lead.id}/edit`); }}
                            className="p-1 text-slate-400 hover:text-arkalon-blue transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {!lead.converted && (
                            <button
                              onClick={e => { e.stopPropagation(); navigate(`/leads/${lead.id}`); }}
                              className="p-1 text-slate-400 hover:text-green-600 transition-colors"
                              title="Convert"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteTarget(lead); }}
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
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

          {/* Pagination */}
          {leads.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-3 px-1">
              <span className="text-xs text-slate-500 font-opensans">Showing {start}–{end} of {leads.length}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-xs font-opensans border border-arkalon-lightgrey rounded bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-xs text-slate-600 font-opensans">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs font-opensans border border-arkalon-lightgrey rounded bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Lead?"
        message={`Delete "${deleteTarget?.company}"? This action cannot be undone.`}
        loading={deleteLoading}
      />

      <CallLogPanel call={call} onClose={() => setCall(null)} />
      <LogMessagePanel
        record={logMessageRecord}
        onClose={() => setLogMessageRecord(null)}
      />
      <QuickNoteModal
        open={!!noteLead}
        onClose={() => setNoteLead(null)}
        parent={noteLead ? { lead_id: noteLead.id } : undefined}
        recordName={noteLead?.company || ''}
      />
    </div>
  );
}
