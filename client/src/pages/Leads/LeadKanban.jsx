import React, { useState, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import Badge from '../../components/UI/Badge.jsx';
import { leadsApi } from '../../api/leads.js';
import { useToast } from '../../context/ToastContext.jsx';
import { LEAD_STATUSES, PRIORITY_COLOURS } from '../../utils/constants.js';
import { formatRelative } from '../../utils/formatDate.js';
import { formatPhoneAU } from '../../utils/formatPhone.js';

const STATUS_COLOURS = {
  'New': { header: 'bg-gray-100 text-gray-600', border: 'border-l-gray-400' },
  'Attempted Contact': { header: 'bg-blue-50 text-blue-700', border: 'border-l-blue-400' },
  'Contacted': { header: 'bg-indigo-50 text-indigo-700', border: 'border-l-indigo-400' },
  'Meeting Booked': { header: 'bg-purple-50 text-purple-700', border: 'border-l-purple-400' },
  'Qualified': { header: 'bg-green-50 text-green-700', border: 'border-l-green-400' },
  'Converted': { header: 'bg-emerald-50 text-emerald-800', border: 'border-l-emerald-500' },
  'Not Qualified': { header: 'bg-orange-50 text-orange-700', border: 'border-l-orange-400' },
  'Junk': { header: 'bg-red-50 text-red-700', border: 'border-l-red-400' },
};

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
};

function LeadCard({ lead, onDragStart, onClick }) {
  const colours = STATUS_COLOURS[lead.lead_status] || STATUS_COLOURS['New'];
  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead)}
      onClick={() => onClick(lead.id)}
      className={`bg-white rounded-lg shadow-sm border border-arkalon-lightgrey border-l-4 ${colours.border} p-3 cursor-pointer hover:shadow-md transition-shadow select-none`}
    >
      <div className="font-montserrat font-semibold text-arkalon-navy text-sm mb-0.5">{lead.company}</div>
      {(lead.first_name || lead.last_name) && (
        <div className="text-xs text-slate-500 font-opensans mb-2">
          {lead.first_name} {lead.last_name}
        </div>
      )}
      <div className="flex flex-wrap gap-1 mb-2">
        {lead.business_unit && (
          <Badge className={`text-[10px] py-0 ${BU_COLOURS[lead.business_unit] || 'bg-gray-100 text-gray-600'}`}>
            {lead.business_unit}
          </Badge>
        )}
        {lead.priority && (
          <Badge className={`text-[10px] py-0 ${PRIORITY_COLOURS[lead.priority] || 'bg-gray-100 text-gray-600'}`}>
            {lead.priority}
          </Badge>
        )}
      </div>
      {lead.phone && (
        <div className="text-xs text-slate-500 font-opensans">{formatPhoneAU(lead.phone)}</div>
      )}
      <div className="text-[10px] text-slate-400 font-opensans mt-1.5">
        Updated {formatRelative(lead.updated_at)}
      </div>
    </div>
  );
}

function KanbanColumn({ status, leads, onDragStart, onDragOver, onDrop, onLeadClick }) {
  const colours = STATUS_COLOURS[status] || STATUS_COLOURS['New'];
  return (
    <div
      className="flex-shrink-0 w-56 bg-slate-50 rounded-lg flex flex-col"
      onDragOver={e => { e.preventDefault(); onDragOver(status); }}
      onDrop={() => onDrop(status)}
    >
      <div className={`px-3 py-2.5 rounded-t-lg ${colours.header}`}>
        <div className="flex items-center justify-between">
          <span className="font-montserrat font-semibold text-xs uppercase tracking-wide">{status}</span>
          <span className="bg-white/60 text-xs font-semibold px-1.5 py-0.5 rounded-full">{leads.length}</span>
        </div>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-240px)]">
        {leads.length === 0 && (
          <div className="text-center text-slate-400 text-xs font-opensans py-6">No leads</div>
        )}
        {leads.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onDragStart={onDragStart}
            onClick={onLeadClick}
          />
        ))}
      </div>
    </div>
  );
}

// Mobile fallback — drag-and-drop is unreliable on touch, so each status is a
// collapsible section and each card carries a Change Status dropdown instead.
function MobileStatus({ status, leads, onLeadClick, onStatusChange }) {
  const [open, setOpen] = useState(false);
  const colours = STATUS_COLOURS[status] || STATUS_COLOURS['New'];
  return (
    <div className="border border-arkalon-lightgrey rounded-lg overflow-hidden bg-white">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-3 ${colours.header}`}
      >
        <span className="font-montserrat font-semibold text-xs uppercase tracking-wide truncate">{status}</span>
        <span className="flex items-center gap-2 flex-shrink-0">
          <span className="bg-white/60 text-xs font-semibold px-1.5 py-0.5 rounded-full">{leads.length}</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>
      {open && (
        <div className="p-2 space-y-2 bg-slate-50">
          {leads.length === 0 ? (
            <div className="text-center text-slate-400 text-xs font-opensans py-4">No leads</div>
          ) : leads.map(lead => (
            <div key={lead.id} className={`bg-white rounded-lg border border-arkalon-lightgrey border-l-4 ${colours.border} p-3`}>
              <div onClick={() => onLeadClick(lead.id)} className="cursor-pointer">
                <div className="font-montserrat font-semibold text-arkalon-navy text-sm truncate">{lead.company}</div>
                {(lead.first_name || lead.last_name) && (
                  <div className="text-xs text-slate-500 font-opensans truncate">{lead.first_name} {lead.last_name}</div>
                )}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100">
                <label className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Change Status</label>
                <select
                  value={lead.lead_status}
                  onChange={e => onStatusChange(lead, e.target.value)}
                  className="mt-0.5 w-full px-2 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
                >
                  {LEAD_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LeadKanban({ filters = {}, onLeadClick }) {
  const { addToast } = useToast();
  const [leadsByStatus, setLeadsByStatus] = useState(() =>
    Object.fromEntries(LEAD_STATUSES.map(s => [s, []]))
  );
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(null);

  const fetchLeads = useCallback(() => {
    setLoading(true);
    leadsApi.getAll({ ...filters, converted: 0, sort_by: 'updated_at', sort_dir: 'desc' })
      .then(res => {
        const grouped = Object.fromEntries(LEAD_STATUSES.map(s => [s, []]));
        (res.data.data || []).forEach(lead => {
          if (grouped[lead.lead_status]) grouped[lead.lead_status].push(lead);
          else if (grouped['New']) grouped['New'].push(lead);
        });
        setLeadsByStatus(grouped);
      })
      .catch(() => addToast('Failed to load kanban leads', 'error'))
      .finally(() => setLoading(false));
  }, [filters.business_unit]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleDragStart = (lead) => setDragging(lead);
  const handleDragOver = () => {};

  const handleMobileStatusChange = async (lead, newStatus) => {
    if (lead.lead_status === newStatus) return;
    const originalStatus = lead.lead_status;
    setLeadsByStatus(prev => {
      const next = { ...prev };
      next[originalStatus] = (prev[originalStatus] || []).filter(l => l.id !== lead.id);
      next[newStatus] = [{ ...lead, lead_status: newStatus }, ...(prev[newStatus] || [])];
      return next;
    });
    try {
      await leadsApi.update(lead.id, { lead_status: newStatus });
    } catch {
      setLeadsByStatus(prev => {
        const next = { ...prev };
        next[newStatus] = (prev[newStatus] || []).filter(l => l.id !== lead.id);
        next[originalStatus] = [{ ...lead, lead_status: originalStatus }, ...(prev[originalStatus] || [])];
        return next;
      });
      addToast('Failed to update lead status. Please try again.', 'error');
    }
  };

  const handleDrop = async (newStatus) => {
    if (!dragging || dragging.lead_status === newStatus) { setDragging(null); return; }

    const originalStatus = dragging.lead_status;
    const leadId = dragging.id;

    // Optimistic update
    setLeadsByStatus(prev => {
      const next = { ...prev };
      next[originalStatus] = prev[originalStatus].filter(l => l.id !== leadId);
      next[newStatus] = [{ ...dragging, lead_status: newStatus }, ...prev[newStatus]];
      return next;
    });
    setDragging(null);

    try {
      await leadsApi.update(leadId, { lead_status: newStatus });
    } catch {
      // Revert on failure
      setLeadsByStatus(prev => {
        const next = { ...prev };
        next[newStatus] = prev[newStatus].filter(l => l.id !== leadId);
        next[originalStatus] = [{ ...dragging, lead_status: originalStatus }, ...prev[originalStatus]];
        return next;
      });
      addToast('Failed to update lead status. Please try again.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {LEAD_STATUSES.map(s => (
          <div key={s} className="flex-shrink-0 w-56 bg-slate-100 rounded-lg h-64 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Mobile: vertical collapsible statuses with a Change Status dropdown */}
      <div className="sm:hidden space-y-2">
        {LEAD_STATUSES.map(status => (
          <MobileStatus
            key={status}
            status={status}
            leads={leadsByStatus[status] || []}
            onLeadClick={onLeadClick}
            onStatusChange={handleMobileStatusChange}
          />
        ))}
      </div>
      {/* Desktop: horizontal drag-and-drop board */}
      <div className="hidden sm:flex gap-3 overflow-x-auto pb-4">
        {LEAD_STATUSES.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            leads={leadsByStatus[status] || []}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onLeadClick={onLeadClick}
          />
        ))}
      </div>
    </>
  );
}
