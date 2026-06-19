import React, { useState, useEffect } from 'react';
import { Phone, X, Linkedin, Mail, MessageSquare, CalendarPlus, PhoneCall } from 'lucide-react';
import Button from './Button.jsx';
import { activitiesApi } from '../../api/activities.js';
import { tasksApi } from '../../api/tasks.js';
import { picklistsApi } from '../../api/picklists.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ACTIVITY_OUTCOMES, BUSINESS_UNITS } from '../../utils/constants.js';
import { formatDateTime, toSqliteUtcFromLocalInput } from '../../utils/formatDate.js';

// Constant is mapped to {value,label} and kept as the fallback / loading state
// so the dropdown is never empty while the picklist loads (or if the API fails).
const asOptions = (arr) => arr.map((v) => ({ value: v, label: v }));

// Shared hook so both the call-log and log-message panels read the
// activity_outcome picklist from one place (matches ActivityForm's pattern).
function useActivityOutcomes() {
  const [outcomes, setOutcomes] = useState(asOptions(ACTIVITY_OUTCOMES));
  useEffect(() => {
    let active = true;
    picklistsApi.get('activity_outcome')
      .then(res => { if (active && res.data.data?.length) setOutcomes(res.data.data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  return outcomes;
}

// Click-to-call link. The href dials the number; the onClick opens the call
// logging panel via the supplied onCall callback. Propagation is stopped so the
// link works inside clickable parent rows/cards.
export function PhoneLink({ phone, onCall, className = '' }) {
  if (!phone) return null;
  return (
    <a
      href={`tel:${phone}`}
      onClick={(e) => { e.stopPropagation(); onCall(phone); }}
      className={`text-arkalon-blue hover:underline ${className}`}
    >
      {phone}
    </a>
  );
}

// Click-to-email link with a pre-filled "Arkalon Ref" subject line.
export function EmailLink({ email, refName, className = '' }) {
  if (!email) return null;
  const subject = encodeURIComponent(`Arkalon Ref: ${refName || ''} - Follow Up`);
  return (
    <a
      href={`mailto:${email}?subject=${subject}`}
      onClick={(e) => e.stopPropagation()}
      className={`text-arkalon-blue hover:underline ${className}`}
    >
      {email}
    </a>
  );
}

// Normalise a stored LinkedIn URL for safe external linking.
//  - already has http:// or https:// → used as-is
//  - starts with linkedin.com / www.linkedin.com (or any bare host) → https:// prepended
//  - empty / missing → null, so callers hide the link entirely
export function normaliseLinkedInUrl(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

// One-tap external LinkedIn link. Renders nothing when no URL is on record so
// it can be dropped into any layout without leaving a dead control behind.
export function LinkedInLink({ url, showText = false, className = '' }) {
  const href = normaliseLinkedInUrl(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label="Open LinkedIn profile"
      title="Open LinkedIn profile"
      className={`inline-flex items-center gap-1 text-arkalon-blue hover:underline ${className}`}
    >
      <Linkedin className="w-4 h-4 flex-shrink-0" />
      {showText && <span>View LinkedIn profile</span>}
    </a>
  );
}

// Slide-up panel chrome shared by the call and message logging panels.
function SlideUpPanel({ icon, title, onClose, closeDisabled, children }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 px-2 sm:px-4 pointer-events-none"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto mx-auto max-w-3xl max-h-[85dvh] overflow-y-auto bg-white border border-arkalon-lightgrey rounded-t-lg shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 bg-arkalon-navy rounded-t-lg sticky top-0">
          <div className="flex items-center gap-2 text-white">
            {icon}
            <span className="font-montserrat font-semibold text-sm">{title}</span>
          </div>
          <button
            onClick={closeDisabled ? undefined : onClose}
            disabled={closeDisabled}
            className="text-white/70 hover:text-white disabled:opacity-40"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// Build a SQLite-UTC due_datetime string for a timed task `daysAhead` days from
// now at 09:00 local time. Routing the local-format string through
// toSqliteUtcFromLocalInput (which `new Date()`-parses it in the device's
// timezone) keeps the conversion free of UTC date-shift bugs.
function timedDueDatetime(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n) => String(n).padStart(2, '0');
  const localDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return toSqliteUtcFromLocalInput(`${localDate}T09:00`);
}

// Slide-up call logging panel. `call` is null when hidden, otherwise
// { phone, name, email, businessUnit, link, timestamp }. The timestamp is
// locked at the moment the phone link was clicked. Activities only accept the
// statuses Planned/Held/Not Held, so a logged call is saved as Held with the
// result in `outcome`.
//
// Once a call is logged the panel slides to a Post-Call Action screen rather
// than closing, offering one-tap follow-ups (meeting task, follow-up email,
// callback task) all inheriting the call's business unit and record links.
export function CallLogPanel({ call, onClose, onLogged }) {
  const { addToast } = useToast();
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [businessUnit, setBusinessUnit] = useState('');
  const outcomes = useActivityOutcomes();
  const [saving, setSaving] = useState(false);
  // 'log' = the call log form; 'actions' = the post-call follow-up screen.
  const [view, setView] = useState('log');
  const [emailConfirm, setEmailConfirm] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (call) {
      setOutcome('');
      setNotes('');
      setBusinessUnit(BUSINESS_UNITS.includes(call.businessUnit) ? call.businessUnit : '');
      setView('log');
      setEmailConfirm(false);
      setActionBusy(false);
      setSaving(false);
    }
  }, [call]);

  if (!call) return null;

  const handleSave = async () => {
    if (!businessUnit) {
      addToast('Select a business unit for this call', 'error');
      return;
    }
    setSaving(true);
    try {
      await activitiesApi.create({
        type: 'Call',
        subject: `Call — ${call.name}`,
        status: 'Held',
        direction: 'Outbound',
        outcome: outcome || null,
        start_datetime: call.timestamp,
        description: notes.trim() || null,
        business_unit: businessUnit,
        ...call.link,
      });
      addToast('Call logged', 'success');
      onLogged?.();
      setView('actions');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to log call', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Create a High-priority follow-up task linked to the same record as the call.
  const handleCreateTask = async (subject, daysAhead) => {
    setActionBusy(true);
    try {
      await tasksApi.create({
        subject,
        status: 'Not Started',
        priority: 'High',
        due_datetime: timedDueDatetime(daysAhead),
        // POST /api/tasks coerces is_all_day with `!== false`, so a boolean
        // false is required to store a timed (non-all-day) task.
        is_all_day: false,
        business_unit: businessUnit,
        ...call.link,
      });
      addToast('Task created', 'success');
      onClose();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to create task', 'error');
      setActionBusy(false);
    }
  };

  // Open the device mail composer, then ask for confirmation — a mailto link
  // cannot tell us whether the email was actually sent.
  const handleSendEmail = () => {
    const subject = encodeURIComponent(`Arkalon Ref: ${call.name || ''} - Follow Up`);
    window.location.href = `mailto:${call.email}?subject=${subject}`;
    setEmailConfirm(true);
  };

  const handleLogEmail = async () => {
    setActionBusy(true);
    try {
      await activitiesApi.create({
        type: 'Email',
        subject: `Follow-up email — ${call.name || ''}`,
        status: 'Held',
        direction: 'Outbound',
        outcome: 'Email Sent',
        start_datetime: new Date().toISOString(),
        business_unit: businessUnit,
        ...call.link,
      });
      addToast('Follow-up email logged', 'success');
      onClose();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to log email', 'error');
      setActionBusy(false);
    }
  };

  // --- Post-call action screen ---------------------------------------------
  if (view === 'actions') {
    if (emailConfirm) {
      return (
        <SlideUpPanel
          icon={<Mail className="w-4 h-4" />}
          title="Follow-up Email"
          onClose={onClose}
          closeDisabled={actionBusy}
        >
          <p className="font-montserrat font-semibold text-arkalon-navy text-base mb-1">
            Did you send the email?
          </p>
          <p className="text-sm text-slate-500 font-opensans mb-4">
            Log it as a sent Email activity against {call.name}?
          </p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleLogEmail}
              disabled={actionBusy}
              className="w-full justify-center min-h-[56px]"
            >
              {actionBusy ? 'Logging…' : 'Yes, log it'}
            </Button>
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={actionBusy}
              className="w-full justify-center min-h-[56px]"
            >
              No, skip
            </Button>
          </div>
        </SlideUpPanel>
      );
    }

    return (
      <SlideUpPanel
        icon={<Phone className="w-4 h-4" />}
        title="Post-Call Actions"
        onClose={onClose}
        closeDisabled={actionBusy}
      >
        <p className="font-montserrat font-semibold text-arkalon-navy text-lg mb-4">
          Call logged. What's next?
        </p>
        <div className="flex flex-col gap-2.5">
          <Button
            variant="secondary"
            onClick={() => handleCreateTask(`Book meeting with ${call.name}`, 1)}
            disabled={actionBusy}
            className="w-full justify-start min-h-[56px] text-sm"
          >
            <CalendarPlus className="w-5 h-5 text-arkalon-blue flex-shrink-0" />
            Create Meeting Task
          </Button>

          {call.email && (
            <Button
              variant="secondary"
              onClick={handleSendEmail}
              disabled={actionBusy}
              className="w-full justify-start min-h-[56px] text-sm"
            >
              <Mail className="w-5 h-5 text-arkalon-blue flex-shrink-0" />
              Send Follow-up Email
            </Button>
          )}

          <Button
            variant="secondary"
            onClick={() => handleCreateTask(`Call back ${call.name}`, 7)}
            disabled={actionBusy}
            className="w-full justify-start min-h-[56px] text-sm"
          >
            <PhoneCall className="w-5 h-5 text-arkalon-blue flex-shrink-0" />
            Schedule Callback
          </Button>
        </div>
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={actionBusy}
            className="text-sm text-slate-500 hover:text-arkalon-navy font-opensans disabled:opacity-40 min-h-[44px] px-4"
          >
            Done — no action needed
          </button>
        </div>
      </SlideUpPanel>
    );
  }

  // --- Call log form -------------------------------------------------------
  return (
    <SlideUpPanel
      icon={<Phone className="w-4 h-4" />}
      title="Log Call — Call Initiated"
      onClose={onClose}
      closeDisabled={saving}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans block">Contact</span>
          <span className="text-sm font-opensans text-slate-700">{call.name}</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans block">Phone</span>
          <span className="text-sm font-opensans text-slate-700">{call.phone}</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans block">Time</span>
          <span className="text-sm font-opensans text-slate-700">{formatDateTime(call.timestamp)}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans block mb-1">Business Unit</label>
          <select
            value={businessUnit}
            onChange={e => setBusinessUnit(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
          >
            <option value="">Select…</option>
            {BUSINESS_UNITS.map(bu => <option key={bu}>{bu}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans block mb-1">Outcome</label>
          <select
            value={outcome}
            onChange={e => setOutcome(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
          >
            <option value="">Select outcome…</option>
            {outcomes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onFocus={e => {
          // iOS: the virtual keyboard can obscure a bottom-fixed panel —
          // nudge the field into view once the keyboard has animated in.
          const el = e.target;
          setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
        }}
        rows={2}
        placeholder="Call notes…"
        className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 resize-none mb-3"
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Dismiss</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Call Log'}
        </Button>
      </div>
    </SlideUpPanel>
  );
}

// Message types offered by the quick-log panel. LinkedIn messages map to the
// existing 'LinkedIn' activity type; the rest fall back to 'Other' — the precise
// channel is always preserved in the activity subject.
const MESSAGE_TYPES = ['WhatsApp', 'SMS', 'LinkedIn Message', 'Other Message'];

// Slide-up panel for quickly logging a WhatsApp / SMS / LinkedIn message
// conversation against a lead or contact. `record` is null when hidden,
// otherwise { name, link, businessUnit } where `link` carries exactly the
// lead_id / contact_id / account_id / deal_id of the originating record.
//
// Saving is a two-step process: the Activity is always created first; a linked
// follow-up Task is created only when both Next Action fields are filled. If the
// Activity saves but the Task fails, the Activity is not recreated on retry.
export function LogMessagePanel({ record, onClose, onLogged }) {
  const { addToast } = useToast();
  const [type, setType] = useState('WhatsApp');
  const [direction, setDirection] = useState('Outbound');
  const [summary, setSummary] = useState('');
  const [outcome, setOutcome] = useState('');
  const [businessUnit, setBusinessUnit] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const outcomes = useActivityOutcomes();
  const [saving, setSaving] = useState(false);
  // True once the Activity has saved — guards against creating it twice when
  // only the follow-up Task failed and the user retries.
  const [activityDone, setActivityDone] = useState(false);

  const buLocked = record ? BUSINESS_UNITS.includes(record.businessUnit) : false;

  useEffect(() => {
    if (record) {
      setType('WhatsApp');
      setDirection('Outbound');
      setSummary('');
      setOutcome('');
      setBusinessUnit(BUSINESS_UNITS.includes(record.businessUnit) ? record.businessUnit : '');
      setNextAction('');
      setNextActionDate('');
      setSaving(false);
      setActivityDone(false);
    }
  }, [record]);

  if (!record) return null;

  const handleSave = async () => {
    if (!type) { addToast('Select a message type', 'error'); return; }
    if (!summary.trim()) { addToast('Summary is required', 'error'); return; }
    if (!businessUnit) { addToast('Select a business unit', 'error'); return; }

    setSaving(true);
    // Local snapshot — React state updates are async, so the catch block below
    // cannot rely on `activityDone` reflecting a set made earlier this call.
    let activityCreated = activityDone;
    try {
      if (!activityCreated) {
        await activitiesApi.create({
          type: type === 'LinkedIn Message' ? 'LinkedIn' : 'Other',
          subject: `${type} with ${record.name}`,
          status: 'Held',
          direction,
          description: summary.trim(),
          outcome: outcome || null,
          next_action: nextAction.trim() || null,
          next_action_date: nextActionDate || null,
          start_datetime: new Date().toISOString(),
          business_unit: businessUnit,
          ...record.link,
        });
        activityCreated = true;
        setActivityDone(true);
      }

      // A follow-up task is only created when both Next Action fields are set,
      // so the follow-up surfaces on Today's Hit List.
      if (nextAction.trim() && nextActionDate) {
        await tasksApi.create({
          subject: nextAction.trim(),
          status: 'Not Started',
          priority: 'Normal',
          // Date-only follow-up — stored as an all-day task.
          due_datetime: toSqliteUtcFromLocalInput(`${nextActionDate}T00:00`),
          is_all_day: true,
          business_unit: businessUnit,
          ...record.link,
        });
      }

      addToast('Message logged', 'success');
      onLogged?.();
      onClose();
    } catch (err) {
      if (activityCreated) {
        addToast('Message logged, but follow-up task failed.', 'error');
      } else {
        addToast(err.response?.data?.error || 'Failed to log message', 'error');
      }
      setSaving(false);
    }
  };

  const fieldClass = 'w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30';
  const labelClass = 'text-[10px] text-slate-400 uppercase tracking-wide font-opensans block mb-1';

  return (
    <SlideUpPanel
      icon={<MessageSquare className="w-4 h-4" />}
      title="Log Message"
      onClose={onClose}
      closeDisabled={saving}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelClass}>Type <span className="text-red-500">*</span></label>
          <select value={type} onChange={e => setType(e.target.value)} className={fieldClass}>
            {MESSAGE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Related Record</label>
          <div className="px-3 py-2 text-sm rounded font-opensans bg-slate-50 border border-arkalon-lightgrey text-slate-600 truncate">
            {record.name}
          </div>
        </div>
        <div>
          <label className={labelClass}>Direction</label>
          <select value={direction} onChange={e => setDirection(e.target.value)} className={fieldClass}>
            <option>Outbound</option>
            <option>Inbound</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Business Unit <span className="text-red-500">*</span></label>
          {buLocked ? (
            <div className="px-3 py-2 text-sm rounded font-opensans bg-slate-50 border border-arkalon-lightgrey text-slate-600">
              {businessUnit} <span className="text-xs opacity-60">(inherited)</span>
            </div>
          ) : (
            <select value={businessUnit} onChange={e => setBusinessUnit(e.target.value)} className={fieldClass}>
              <option value="">Select…</option>
              {BUSINESS_UNITS.map(bu => <option key={bu}>{bu}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="mb-3">
        <label className={labelClass}>Summary <span className="text-red-500">*</span></label>
        <textarea
          value={summary}
          onChange={e => setSummary(e.target.value)}
          onFocus={e => {
            const el = e.target;
            setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
          }}
          rows={5}
          placeholder="What was discussed? Tap the microphone on your keyboard to dictate..."
          className={`${fieldClass} resize-none`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelClass}>Outcome</label>
          <select value={outcome} onChange={e => setOutcome(e.target.value)} className={fieldClass}>
            <option value="">Select outcome…</option>
            {outcomes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Next Action</label>
          <input
            type="text"
            value={nextAction}
            onChange={e => setNextAction(e.target.value)}
            placeholder="Follow-up to do…"
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass}>Next Action Date</label>
          <input
            type="date"
            value={nextActionDate}
            onChange={e => setNextActionDate(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      {activityDone && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3 font-opensans">
          Message logged. The follow-up task didn't save — tap Retry to create it again.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Dismiss</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : activityDone ? 'Retry follow-up task' : 'Log Message'}
        </Button>
      </div>
    </SlideUpPanel>
  );
}
