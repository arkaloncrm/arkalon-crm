import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, CheckCircle, X, Archive } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import EmptyState from '../../components/UI/EmptyState.jsx';
import MobileCard, { CardAction } from '../../components/UI/MobileCard.jsx';
import { ConvertDropdown, RejectModal } from '../../components/ResearchQueue/ResearchQueueActions.jsx';
import ScanCardButton from '../../components/ResearchQueue/ScanCardButton.jsx';
import { researchQueueApi } from '../../api/researchQueue.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  RESEARCH_BUSINESS_UNITS, RESEARCH_CANDIDATE_TYPES, RESEARCH_STATUSES, CONFIDENCE_LEVELS,
  RESEARCH_STATUS_COLOURS, CONFIDENCE_COLOURS, CANDIDATE_TYPE_COLOURS, RESEARCH_BU_COLOURS,
} from '../../utils/constants.js';
import { formatDate } from '../../utils/formatDate.js';

const selectCls =
  'px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30';

export default function ResearchQueueList() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [buFilter, setBuFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('');

  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const fetchRecords = useCallback(() => {
    setLoading(true);
    const params = { limit: 100 };
    if (buFilter) params.business_unit = buFilter;
    if (typeFilter) params.candidate_type = typeFilter;
    if (statusFilter) params.status = statusFilter;
    if (confidenceFilter) params.confidence_level = confidenceFilter;
    if (search) params.search = search;
    params.sort_by = sortBy;
    params.sort_dir = sortDir;

    researchQueueApi.getAll(params)
      .then(res => setRecords(res.data.data || []))
      .catch(() => addToast('Failed to load research queue', 'error'))
      .finally(() => setLoading(false));
  }, [search, buFilter, typeFilter, statusFilter, confidenceFilter, sortBy, sortDir]);

  useEffect(() => {
    const t = setTimeout(fetchRecords, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchRecords, search]);

  const handleApprove = async (rec) => {
    setBusyId(rec.id);
    try {
      await researchQueueApi.approve(rec.id);
      addToast('Record approved', 'success');
      fetchRecords();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to approve', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handlePark = async (rec) => {
    setBusyId(rec.id);
    try {
      await researchQueueApi.park(rec.id);
      addToast('Record parked', 'success');
      fetchRecords();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to park', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleConvert = async (rec, target) => {
    setBusyId(rec.id);
    try {
      await researchQueueApi.convert(rec.id, { convert_to: target });
      addToast(`Converted to ${target}`, 'success');
      fetchRecords();
    } catch (err) {
      addToast(err.response?.data?.error || 'Conversion failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (reason) => {
    if (!rejectTarget) return;
    setRejectLoading(true);
    try {
      await researchQueueApi.reject(rejectTarget.id, { rejected_reason: reason });
      addToast('Record rejected', 'success');
      setRejectTarget(null);
      fetchRecords();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to reject', 'error');
    } finally {
      setRejectLoading(false);
    }
  };

  const filtersActive = buFilter || typeFilter || statusFilter || confidenceFilter || search;
  const clearFilters = () => {
    setSearch(''); setBuFilter(''); setTypeFilter(''); setStatusFilter(''); setConfidenceFilter('');
  };

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Research Queue</h2>
          <span className="bg-slate-100 text-slate-500 text-xs font-montserrat font-semibold px-2 py-0.5 rounded-full">
            {records.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ScanCardButton />
          <Button onClick={() => navigate('/research-queue/new')}>+ Add Record</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search records..."
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 w-56"
        />
        <select value={buFilter} onChange={e => setBuFilter(e.target.value)} className={selectCls}>
          <option value="">All Business Units</option>
          {RESEARCH_BUSINESS_UNITS.map(bu => <option key={bu}>{bu}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={selectCls}>
          <option value="">All Types</option>
          {RESEARCH_CANDIDATE_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="">All Statuses</option>
          {RESEARCH_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={confidenceFilter} onChange={e => setConfidenceFilter(e.target.value)} className={selectCls}>
          <option value="">All Confidence</option>
          {CONFIDENCE_LEVELS.map(c => <option key={c}>{c}</option>)}
        </select>
        {filtersActive && (
          <button onClick={clearFilters} className="text-xs text-arkalon-blue hover:underline font-opensans">
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white border border-arkalon-lightgrey rounded-lg p-8 space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <EmptyState
            title="No research records"
            description="Records ingested by AI or added manually appear here for review before becoming live CRM records."
            action={() => navigate('/research-queue/new')}
            actionLabel="Add your first record"
          />
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="sm:hidden space-y-3">
            {records.map(rec => (
              <MobileCard key={rec.id} onClick={() => navigate(`/research-queue/${rec.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold font-opensans text-sm text-arkalon-blue truncate">
                    {rec.title || rec.company_name || 'Untitled record'}
                  </span>
                  {rec.business_unit && (
                    <Badge className={`${RESEARCH_BU_COLOURS[rec.business_unit] || 'bg-gray-100 text-gray-600'} flex-shrink-0`}>
                      {rec.business_unit}
                    </Badge>
                  )}
                </div>
                {rec.company_name && rec.title && (
                  <div className="text-xs text-slate-500 font-opensans mt-0.5 truncate">{rec.company_name}</div>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {rec.candidate_type && (
                    <Badge className={CANDIDATE_TYPE_COLOURS[rec.candidate_type] || 'bg-gray-100 text-gray-600'}>
                      {rec.candidate_type}
                    </Badge>
                  )}
                  {rec.status && (
                    <Badge className={RESEARCH_STATUS_COLOURS[rec.status] || 'bg-gray-100 text-gray-600'}>
                      {rec.status}
                    </Badge>
                  )}
                  {rec.confidence_level && (
                    <Badge className={CONFIDENCE_COLOURS[rec.confidence_level] || 'bg-gray-100 text-gray-600'}>
                      {rec.confidence_level}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-400 font-opensans truncate">
                    {rec.source || 'No source'} · {formatDate(rec.created_at)}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <CardAction label="Review" onClick={() => navigate(`/research-queue/${rec.id}`)}>
                      <Eye className="w-4 h-4" />
                    </CardAction>
                    <ConvertDropdown
                      variant="card"
                      disabled={busyId === rec.id}
                      onConvert={(target) => handleConvert(rec, target)}
                    />
                    <CardAction label="Reject" danger onClick={() => setRejectTarget(rec)}>
                      <X className="w-4 h-4" />
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
                    {[
                      { label: 'Title / Company', sortKey: 'title' },
                      { label: 'Type' },
                      { label: 'Status', sortKey: 'status' },
                      { label: 'Confidence' },
                      { label: 'Business Unit', sortKey: 'business_unit' },
                      { label: 'Source' },
                      { label: 'Created', sortKey: 'created_at' },
                      { label: 'Actions' },
                    ].map(({ label, sortKey }) => (
                      <th
                        key={label}
                        onClick={sortKey ? () => handleSort(sortKey) : undefined}
                        className={`px-3 py-2.5 text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap${sortKey ? ' cursor-pointer select-none hover:text-slate-700' : ''}`}
                      >
                        {label}
                        {sortKey && (
                          <span className="ml-1">
                            {sortBy === sortKey
                              ? (sortDir === 'asc' ? '↑' : '↓')
                              : <span className="text-slate-300">↕</span>}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec, idx) => (
                    <tr
                      key={rec.id}
                      className={`border-b border-arkalon-lightgrey h-11 hover:bg-blue-50/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}
                    >
                      <td className="px-3 whitespace-nowrap">
                        <a
                          href={`/research-queue/${rec.id}`}
                          onClick={(e) => { e.preventDefault(); navigate(`/research-queue/${rec.id}`); }}
                          className="font-semibold hover:underline font-opensans text-sm text-arkalon-blue text-left"
                        >
                          {rec.title || rec.company_name || 'Untitled record'}
                        </a>
                        {rec.company_name && rec.title && (
                          <div className="text-xs text-slate-400 font-opensans">{rec.company_name}</div>
                        )}
                      </td>
                      <td className="px-3">
                        {rec.candidate_type && (
                          <Badge className={CANDIDATE_TYPE_COLOURS[rec.candidate_type] || 'bg-gray-100 text-gray-600'}>
                            {rec.candidate_type}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3">
                        {rec.status && (
                          <Badge className={RESEARCH_STATUS_COLOURS[rec.status] || 'bg-gray-100 text-gray-600'}>
                            {rec.status}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3">
                        {rec.confidence_level && (
                          <Badge className={CONFIDENCE_COLOURS[rec.confidence_level] || 'bg-gray-100 text-gray-600'}>
                            {rec.confidence_level}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3">
                        {rec.business_unit && (
                          <Badge className={RESEARCH_BU_COLOURS[rec.business_unit] || 'bg-gray-100 text-gray-600'}>
                            {rec.business_unit}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 text-slate-600 font-opensans whitespace-nowrap">{rec.source || '—'}</td>
                      <td className="px-3 text-slate-500 font-opensans whitespace-nowrap">{formatDate(rec.created_at)}</td>
                      <td className="px-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => navigate(`/research-queue/${rec.id}`)}
                            className="p-1 text-slate-400 hover:text-arkalon-blue transition-colors"
                            title="Review"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleApprove(rec)}
                            disabled={busyId === rec.id}
                            className="p-1 text-slate-400 hover:text-green-600 transition-colors disabled:opacity-30"
                            title="Approve"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                          <ConvertDropdown
                            disabled={busyId === rec.id}
                            onConvert={(target) => handleConvert(rec, target)}
                          />
                          <button
                            onClick={() => setRejectTarget(rec)}
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                            title="Reject"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handlePark(rec)}
                            disabled={busyId === rec.id}
                            className="p-1 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30"
                            title="Park"
                          >
                            <Archive className="w-3.5 h-3.5" />
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

      <RejectModal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onSubmit={handleReject}
        loading={rejectLoading}
      />
    </div>
  );
}
