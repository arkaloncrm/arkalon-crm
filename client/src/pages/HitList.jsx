import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone, Mail, StickyNote, Check, Clock, Calendar, Activity, Monitor, Linkedin, Zap,
} from 'lucide-react';
import Badge from '../components/UI/Badge.jsx';
import { CallLogPanel } from '../components/UI/CommLinks.jsx';
import QuickNoteModal from '../components/UI/QuickNoteModal.jsx';
import { tasksApi } from '../api/tasks.js';
import { activitiesApi } from '../api/activities.js';
import { contactsApi } from '../api/contacts.js';
import { leadsApi } from '../api/leads.js';
import { accountsApi } from '../api/accounts.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatLocalDatetime } from '../utils/formatDate.js';

const BU_OPTIONS = ['All', 'ASC', 'Simply Seated'];

const PRIORITY_COLOURS = {
  High: 'bg-red-100 text-red-700',
  Normal: 'bg-blue-100 text-blue-700',
  Low: 'bg-gray-100 text-gray-500',
};

const TYPE_ICON = {
  Call: Phone, Meeting: Calendar, Email: Mail, LinkedIn: Linkedin, Demo: Monitor, Other: Activity,
};

// Deterministic snooze targets (see Mobile-A spec).
function snoozeDatetime(option) {
  const d = new Date();
  if (option === 'later') {
    d.setHours(17, 0, 0, 0);
  } else if (option === 'tomorrow') {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else if (option === 'nextweek') {
    const addDays = ((8 - d.getDay()) % 7) || 7; // always the *next* Monday
    d.setDate(d.getDate() + addDays);
    d.setHours(9, 0, 0, 0);
  }
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

const SNOOZE_OPTIONS = [
  { key: 'later', label: 'Later Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'nextweek', label: 'Next Week' },
  { key: 'park', label: 'Park' },
];

function SectionShell({ title, tone, count, children }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    grey: 'bg-slate-50 text-slate-600 border-arkalon-lightgrey',
  };
  return (
    <div className="mb-5">
      <div className={`flex items-center justify-between px-4 py-2.5 rounded-t-lg border ${tones[tone]}`}>
        <h3 className="font-montserrat font-bold text-sm uppercase tracking-wide">{title}</h3>
        {count != null && (
          <span className="text-xs font-montserrat font-bold px-2 py-0.5 rounded-full bg-white/70">{count}</span>
        )}
      </div>
      <div className="border border-t-0 border-arkalon-lightgrey rounded-b-lg bg-white p-3 space-y-3">
        {children}
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, tone = 'slate', children, href }) {
  const tones = {
    green: 'text-green-600 hover:bg-green-50',
    blue: 'text-arkalon-blue hover:bg-blue-50',
    slate: 'text-slate-500 hover:bg-slate-100',
  };
  const cls = `flex items-center justify-center h-11 w-11 rounded transition-colors ${tones[tone]}`;
  if (href) {
    return (
      <a href={href} aria-label={label} title={label} className={cls} onClick={(e) => e.stopPropagation()}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export default function HitList() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [buFilter, setBuFilter] = useState('All');
  const [dueToday, setDueToday] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const [lookups, setLookups] = useState({ contacts: {}, leads: {}, accounts: {} });
  const [call, setCall] = useState(null);
  const [noteTarget, setNoteTarget] = useState(null);
  const [snoozeFor, setSnoozeFor] = useState(null);

  // Linked-record contact details aren't returned on task rows, so the lists
  // are fetched once and indexed by id to resolve phone / email client-side.
  useEffect(() => {
    Promise.allSettled([contactsApi.getAll(), leadsApi.getAll(), accountsApi.getAll()])
      .then(([c, l, a]) => {
        const index = (rows) => Object.fromEntries((rows || []).map((r) => [r.id, r]));
        setLookups({
          contacts: index(c.status === 'fulfilled' ? c.value.data.data : []),
          leads: index(l.status === 'fulfilled' ? l.value.data.data : []),
          accounts: index(a.status === 'fulfilled' ? a.value.data.data : []),
        });
      });
  }, []);

  const loadTasks = useCallback(() => {
    setLoading(true);
    const bu = buFilter === 'All' ? {} : { business_unit: buFilter };
    Promise.allSettled([
      tasksApi.getAll({ due_today: 'true', ...bu }),
      tasksApi.getAll({ overdue: 'true', ...bu }),
    ]).then(([due, over]) => {
      const dueRows = due.status === 'fulfilled' ? (due.value.data.data || []) : [];
      const overRows = over.status === 'fulfilled' ? (over.value.data.data || []) : [];
      // A task due earlier today is returned by both queries — show it only
      // under Overdue so each task appears exactly once.
      const overdueIds = new Set(overRows.map((t) => t.id));
      setDueToday(dueRows.filter((t) => !overdueIds.has(t.id)));
      setOverdue(overRows);
      setLoading(false);
    });
  }, [buFilter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    const bu = buFilter === 'All' ? {} : { business_unit: buFilter };
    activitiesApi.getAll({ sort_by: 'created_at', sort_dir: 'desc', limit: 5, ...bu })
      .then((res) => setRecent(res.data.data || []))
      .catch(() => setRecent([]));
  }, [buFilter]);

  const linkedName = (t) =>
    t.contact_name || t.lead_company || t.account_name || t.deal_name || 'No linked record';

  // Resolve a phone / email and the record to log the call against.
  const resolveComms = (t) => {
    if (t.contact_id && lookups.contacts[t.contact_id]) {
      const c = lookups.contacts[t.contact_id];
      return { phone: c.phone || c.mobile || null, email: c.email || null, link: { contact_id: t.contact_id } };
    }
    if (t.lead_id && lookups.leads[t.lead_id]) {
      const l = lookups.leads[t.lead_id];
      return { phone: l.phone || l.mobile || null, email: l.email || null, link: { lead_id: t.lead_id } };
    }
    if (t.account_id && lookups.accounts[t.account_id]) {
      const a = lookups.accounts[t.account_id];
      return { phone: a.phone || null, email: null, link: { account_id: t.account_id } };
    }
    return { phone: null, email: null, link: null };
  };

  const noteParentFor = (t) => {
    if (t.contact_id) return { contact_id: t.contact_id };
    if (t.lead_id) return { lead_id: t.lead_id };
    if (t.account_id) return { account_id: t.account_id };
    if (t.deal_id) return { deal_id: t.deal_id };
    return null;
  };

  const handleCall = (t, phone, link) => {
    setCall({
      phone,
      name: linkedName(t),
      businessUnit: t.business_unit,
      link: link || {},
      timestamp: new Date().toISOString(),
    });
  };

  const handleComplete = async (t) => {
    try {
      await tasksApi.complete(t.id);
      addToast('Task completed', 'success');
      loadTasks();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to complete task', 'error');
    }
  };

  const handleSnooze = async (t, option) => {
    setSnoozeFor(null);
    try {
      if (option === 'park') {
        await tasksApi.update(t.id, { status: 'Deferred' });
        addToast('Task parked', 'success');
      } else {
        await tasksApi.update(t.id, { due_datetime: snoozeDatetime(option) });
        addToast('Task snoozed', 'success');
      }
      loadTasks();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to snooze task', 'error');
    }
  };

  const renderTaskRow = (t, { showDueDate } = {}) => {
    const comms = resolveComms(t);
    const noteParent = noteParentFor(t);
    return (
      <div key={t.id} className="border border-arkalon-lightgrey rounded-lg p-3">
        <div
          onClick={() => navigate(`/tasks/${t.id}/edit`)}
          className="cursor-pointer"
        >
          <div className="flex items-start gap-2">
            {t.priority && (
              <Badge className={`${PRIORITY_COLOURS[t.priority] || 'bg-gray-100 text-gray-600'} flex-shrink-0 mt-0.5`}>
                {t.priority}
              </Badge>
            )}
            <span className="flex-1 text-sm font-opensans font-semibold text-arkalon-navy">{t.subject}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs font-opensans">
            <span className="text-slate-500 truncate">{linkedName(t)}</span>
            {showDueDate && t.due_datetime && (
              <span className="text-red-600 font-semibold">Due {formatLocalDatetime(t.due_datetime)}</span>
            )}
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1">
          {comms.phone && (
            <ActionButton label="Call" tone="green" onClick={() => handleCall(t, comms.phone, comms.link)}>
              <Phone className="w-4 h-4" />
            </ActionButton>
          )}
          {comms.email && (
            <ActionButton
              label="Email"
              tone="blue"
              href={`mailto:${comms.email}?subject=${encodeURIComponent(`Arkalon Ref: ${linkedName(t)} - Follow Up`)}`}
            >
              <Mail className="w-4 h-4" />
            </ActionButton>
          )}
          {noteParent && (
            <ActionButton
              label="Add note"
              onClick={() => setNoteTarget({ parent: noteParent, recordName: linkedName(t) })}
            >
              <StickyNote className="w-4 h-4" />
            </ActionButton>
          )}
          <ActionButton label="Complete task" tone="green" onClick={() => handleComplete(t)}>
            <Check className="w-4 h-4" />
          </ActionButton>
          <div className="relative ml-auto">
            <ActionButton label="Snooze" onClick={() => setSnoozeFor(snoozeFor === t.id ? null : t.id)}>
              <Clock className="w-4 h-4" />
            </ActionButton>
            {snoozeFor === t.id && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSnoozeFor(null)} />
                <div className="absolute right-0 bottom-full mb-1 z-50 w-40 bg-white border border-arkalon-lightgrey rounded-lg shadow-lg overflow-hidden">
                  {SNOOZE_OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => handleSnooze(t, o.key)}
                      className="w-full text-left px-3 py-2.5 text-sm font-opensans text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-arkalon-blue" />
        <div>
          <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Today's List</h2>
          <p className="text-arkalon-grey text-sm font-opensans">Your call sheet for the day.</p>
        </div>
      </div>

      {/* Business unit filter */}
      <div className="flex items-center gap-2 mb-5">
        {BU_OPTIONS.map((bu) => (
          <button
            key={bu}
            type="button"
            onClick={() => setBuFilter(bu)}
            className={`px-3 h-9 rounded-full text-sm font-montserrat font-semibold transition-colors ${
              buFilter === bu
                ? 'bg-arkalon-navy text-white'
                : 'bg-white text-slate-500 border border-arkalon-lightgrey hover:bg-slate-50'
            }`}
          >
            {bu}
          </button>
        ))}
      </div>

      {/* Due Today */}
      <SectionShell title="Due Today" tone="amber" count={loading ? null : dueToday.length}>
        {loading ? (
          <p className="text-sm text-slate-400 font-opensans text-center py-3">Loading…</p>
        ) : dueToday.length === 0 ? (
          <p className="text-sm text-slate-400 font-opensans text-center py-3">Nothing due today</p>
        ) : (
          dueToday.map((t) => renderTaskRow(t))
        )}
      </SectionShell>

      {/* Overdue */}
      <SectionShell title="Overdue" tone="red" count={loading ? null : overdue.length}>
        {loading ? (
          <p className="text-sm text-slate-400 font-opensans text-center py-3">Loading…</p>
        ) : overdue.length === 0 ? (
          <p className="text-sm text-slate-400 font-opensans text-center py-3">No overdue tasks</p>
        ) : (
          overdue.map((t) => renderTaskRow(t, { showDueDate: true }))
        )}
      </SectionShell>

      {/* Recent Activity */}
      <SectionShell title="Recent Activity" tone="grey">
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400 font-opensans text-center py-3">No recent activity</p>
        ) : (
          recent.map((a) => {
            const Icon = TYPE_ICON[a.type] || Activity;
            const who = a.contact_name || a.account_name || a.lead_company || a.deal_name || '—';
            return (
              <div
                key={a.id}
                onClick={() => navigate(`/activities/${a.id}`)}
                className="flex items-center gap-3 px-1 py-2 cursor-pointer hover:bg-slate-50 rounded transition-colors"
              >
                <span className="inline-flex items-center justify-center w-8 h-8 rounded bg-slate-100 flex-shrink-0">
                  <Icon className="w-4 h-4 text-slate-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-opensans text-arkalon-navy truncate">{a.subject}</div>
                  <div className="text-xs font-opensans text-slate-400 truncate">{who}</div>
                </div>
                <span className="text-xs font-opensans text-slate-400 flex-shrink-0">
                  {formatLocalDatetime(a.created_at || a.start_datetime)}
                </span>
              </div>
            );
          })
        )}
      </SectionShell>

      <CallLogPanel call={call} onClose={() => setCall(null)} />
      <QuickNoteModal
        open={!!noteTarget}
        onClose={() => setNoteTarget(null)}
        parent={noteTarget?.parent}
        recordName={noteTarget?.recordName}
      />
    </div>
  );
}
