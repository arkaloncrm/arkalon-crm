import React, { useState, useEffect } from 'react';
import { Phone, X } from 'lucide-react';
import Button from './Button.jsx';
import { activitiesApi } from '../../api/activities.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ACTIVITY_OUTCOMES, BUSINESS_UNITS } from '../../utils/constants.js';
import { formatDateTime } from '../../utils/formatDate.js';

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

// Slide-up call logging panel. `call` is null when hidden, otherwise
// { phone, name, businessUnit, link, timestamp }. The timestamp is locked at
// the moment the phone link was clicked. Activities only accept the statuses
// Planned/Held/Not Held, so a logged call is saved as Held with the result in
// `outcome`; the panel header shows "Call Initiated" as a label only.
export function CallLogPanel({ call, onClose, onLogged }) {
  const { addToast } = useToast();
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [businessUnit, setBusinessUnit] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (call) {
      setOutcome('');
      setNotes('');
      setBusinessUnit(BUSINESS_UNITS.includes(call.businessUnit) ? call.businessUnit : '');
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
      onClose();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to log call', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-3xl bg-white border border-arkalon-lightgrey rounded-t-lg shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 bg-arkalon-navy rounded-t-lg">
          <div className="flex items-center gap-2 text-white">
            <Phone className="w-4 h-4" />
            <span className="font-montserrat font-semibold text-sm">Log Call — Call Initiated</span>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-3 gap-3 mb-3">
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
          <div className="grid grid-cols-2 gap-3 mb-3">
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
                {ACTIVITY_OUTCOMES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
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
        </div>
      </div>
    </div>
  );
}
