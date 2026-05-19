import React, { useState, useEffect } from 'react';
import { X, Calendar, Phone, Mail, Briefcase, CheckSquare, Activity, FileText, ArrowRight } from 'lucide-react';
import Badge from './Badge.jsx';
import { LinkedInLink } from './CommLinks.jsx';
import { activitiesApi } from '../../api/activities.js';
import { notesApi } from '../../api/notes.js';
import { tasksApi } from '../../api/tasks.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate, formatLocalDatetime } from '../../utils/formatDate.js';

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
  'Both': 'bg-purple-100 text-purple-700',
};

const STAGE_COLOURS = {
  'Closed Won': 'bg-green-100 text-green-800',
  'Closed Lost': 'bg-red-100 text-red-700',
};

const ID_FIELD = { contact: 'contact_id', account: 'account_id', deal: 'deal_id' };
const OPEN_DEAL = (d) => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost';

// Resolve the entity-specific shape the brief renders from. Keeps the JSX below
// free of per-type branching.
function deriveSubject(entityType, entity) {
  if (!entity) return {};
  if (entityType === 'contact') {
    const name = [entity.salutation, entity.first_name, entity.last_name].filter(Boolean).join(' ');
    return {
      name: name || 'Contact',
      phone: entity.phone || entity.mobile || null,
      email: entity.email || null,
      linkedin: entity.linkedin_url || null,
      openDeals: (entity.deals || []).filter(OPEN_DEAL),
      nextAction: null,
    };
  }
  if (entityType === 'account') {
    return {
      name: entity.name || 'Account',
      phone: entity.phone || null,
      email: null,
      linkedin: null,
      openDeals: (entity.deals || []).filter(OPEN_DEAL),
      nextAction: null,
    };
  }
  // deal
  const primary = (entity.contacts || []).find((c) => c.role === 'Primary') || (entity.contacts || [])[0];
  return {
    name: entity.deal_name || 'Deal',
    phone: primary?.phone || null,
    email: primary?.email || null,
    linkedin: null,
    openDeals: OPEN_DEAL(entity)
      ? [{ id: entity.id, deal_name: entity.deal_name, stage: entity.stage, gross_total_value: entity.gross_total_value }]
      : [],
    nextAction: entity.next_action || null,
  };
}

function Section({ icon: Icon, label, children }) {
  return (
    <div className="px-4 py-3 border-b border-arkalon-lightgrey last:border-0">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[10px] font-montserrat font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      {children}
    </div>
  );
}

// Pre-meeting brief — a fast, read-only prep card. Slides up from the bottom,
// mirroring the call logging panel. Fetches last activity / note / open task
// count when opened; the parent record is passed in already loaded.
export default function MeetingBrief({ open, onClose, entityType, entity, onCall }) {
  const [loading, setLoading] = useState(false);
  const [lastActivity, setLastActivity] = useState(null);
  const [lastNote, setLastNote] = useState(null);
  const [openTaskCount, setOpenTaskCount] = useState(0);

  useEffect(() => {
    if (!open || !entity) return;
    const idField = ID_FIELD[entityType];
    const idVal = entity.id;
    setLoading(true);
    setLastActivity(null);
    setLastNote(null);
    setOpenTaskCount(0);
    Promise.allSettled([
      activitiesApi.getAll({ [idField]: idVal, sort_by: 'created_at', sort_dir: 'desc', limit: 1 }),
      notesApi.getAll({ [idField]: idVal }),
      tasksApi.getAll({ [idField]: idVal }),
    ]).then(([act, notes, tasks]) => {
      setLastActivity(act.status === 'fulfilled' ? (act.value.data.data || [])[0] || null : null);
      setLastNote(notes.status === 'fulfilled' ? (notes.value.data.data || [])[0] || null : null);
      const taskRows = tasks.status === 'fulfilled' ? (tasks.value.data.data || []) : [];
      setOpenTaskCount(taskRows.filter((t) => t.status !== 'Completed').length);
      setLoading(false);
    });
  }, [open, entity, entityType]);

  if (!open || !entity) return null;

  const s = deriveSubject(entityType, entity);
  const execSummary = entity.executive_summary
    ? String(entity.executive_summary).slice(0, 150)
    : null;
  const notePreview = lastNote?.content ? String(lastNote.content).slice(0, 100) : null;

  const activityDate = lastActivity?.start_datetime || lastActivity?.created_at || null;
  const noteDate = lastNote?.created_at || null;
  const lastTouched = [activityDate, noteDate].filter(Boolean).sort().slice(-1)[0] || null;

  const suggestedAction = s.nextAction || lastActivity?.next_action || null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 px-2 sm:px-4 pointer-events-none"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-[480px] max-h-[85dvh] overflow-y-auto bg-white border border-arkalon-lightgrey rounded-t-lg shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 flex items-start justify-between px-4 py-3 bg-arkalon-navy rounded-t-lg">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-white/60">
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-[10px] font-montserrat font-bold uppercase tracking-widest">Pre-Meeting Brief</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <h3 className="font-montserrat font-bold text-white text-base truncate">{s.name}</h3>
              {entity.business_unit && (
                <Badge className={`${BU_COLOURS[entity.business_unit] || 'bg-white/20 text-white'} flex-shrink-0`}>
                  {entity.business_unit}
                </Badge>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white flex-shrink-0 ml-2" aria-label="Close brief">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Executive summary */}
        <Section icon={FileText} label="Executive Summary">
          <p className="text-sm font-opensans text-slate-700">
            {execSummary ? `${execSummary}${entity.executive_summary.length > 150 ? '…' : ''}` : 'No executive summary recorded.'}
          </p>
        </Section>

        {/* Last activity */}
        <Section icon={Activity} label="Last Activity">
          {loading ? (
            <p className="text-sm font-opensans text-slate-400">Loading…</p>
          ) : lastActivity ? (
            <p className="text-sm font-opensans text-slate-700">
              <span className="font-semibold">{lastActivity.type}</span>
              {lastActivity.outcome ? ` · ${lastActivity.outcome}` : ''}
              <span className="text-slate-400"> · {formatLocalDatetime(activityDate)}</span>
            </p>
          ) : (
            <p className="text-sm font-opensans text-slate-400">No activity logged yet.</p>
          )}
        </Section>

        {/* Last note */}
        <Section icon={FileText} label="Last Note">
          {loading ? (
            <p className="text-sm font-opensans text-slate-400">Loading…</p>
          ) : notePreview ? (
            <p className="text-sm font-opensans text-slate-700">
              {notePreview}{lastNote.content.length > 100 ? '…' : ''}
              <span className="block text-xs text-slate-400 mt-0.5">{formatLocalDatetime(noteDate)}</span>
            </p>
          ) : (
            <p className="text-sm font-opensans text-slate-400">No notes yet.</p>
          )}
        </Section>

        {/* Open deals */}
        <Section icon={Briefcase} label="Open Deals">
          {s.openDeals.length === 0 ? (
            <p className="text-sm font-opensans text-slate-400">No open deals.</p>
          ) : (
            <div className="space-y-1.5">
              {s.openDeals.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm font-opensans text-slate-700 truncate">{d.deal_name}</span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <Badge className={STAGE_COLOURS[d.stage] || 'bg-slate-100 text-slate-600'}>{d.stage}</Badge>
                    <span className="text-sm font-opensans font-semibold text-slate-700">
                      {formatCurrency(d.gross_total_value)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Open tasks + last touched */}
        <Section icon={CheckSquare} label="Status">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-opensans text-slate-700">
              {loading ? 'Loading…' : `${openTaskCount} open task${openTaskCount === 1 ? '' : 's'}`}
            </span>
            <span className="text-sm font-opensans text-slate-500">
              Last touched: {lastTouched ? formatDate(lastTouched) : '—'}
            </span>
          </div>
        </Section>

        {/* Suggested next action */}
        <Section icon={ArrowRight} label="Suggested Next Action">
          <p className="text-sm font-opensans text-slate-700">
            {suggestedAction || 'No next action recorded.'}
          </p>
        </Section>

        {/* Quick actions */}
        <div className="px-4 py-3 flex items-center gap-2">
          {s.phone ? (
            <button
              onClick={() => { onClose(); onCall?.(s.phone, s.name); }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded bg-green-600 text-white font-montserrat font-semibold text-sm hover:bg-green-700 transition-colors"
            >
              <Phone className="w-4 h-4" /> Call
            </button>
          ) : null}
          {s.email ? (
            <a
              href={`mailto:${s.email}?subject=${encodeURIComponent(`Arkalon Ref: ${s.name} - Follow Up`)}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded bg-arkalon-blue text-white font-montserrat font-semibold text-sm hover:bg-blue-700 transition-colors"
            >
              <Mail className="w-4 h-4" /> Email
            </a>
          ) : null}
          {s.linkedin ? (
            <LinkedInLink
              url={s.linkedin}
              showText
              className="flex-1 justify-center h-11 rounded border border-arkalon-lightgrey font-montserrat font-semibold text-sm"
            />
          ) : null}
          {!s.phone && !s.email && !s.linkedin && (
            <p className="text-sm font-opensans text-slate-400 py-2">No contact details on record.</p>
          )}
        </div>
      </div>
    </div>
  );
}
