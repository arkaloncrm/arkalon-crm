import React, { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import Button from './Button.jsx';
import { tasksApi } from '../../api/tasks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { BUSINESS_UNITS } from '../../utils/constants.js';
import { toSqliteUtcFromLocalInput } from '../../utils/formatDate.js';

// Build a human label from the Sydney-local date/time parts (no timezone
// reconversion — the parts are already local, so a wall-clock Date is correct).
function dueLabel(date, time) {
  if (!date) return 'No date';
  const d = new Date(`${date}T${time || '00:00'}`);
  if (isNaN(d.getTime())) return date;
  const day = d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  return time ? `${day} · ${time}` : day;
}

// One-tap follow-up task suggestion. Shown only when the server detected an
// action + time. On Add it POSTs to the Job-1-guarded /api/tasks with the
// inherited (or user-picked) business_unit and the matching polymorphic link.
export default function TaskSuggestion({ suggestion, onClose }) {
  const { addToast } = useToast();
  const [subject, setSubject] = useState(suggestion.subject || '');
  const [dueDate, setDueDate] = useState(suggestion.due_date || '');
  const [dueTime, setDueTime] = useState(suggestion.due_time || '');
  // When BU could not be inherited validly, the user must pick one before Add.
  const [bu, setBu] = useState(suggestion.bu_valid ? suggestion.business_unit : '');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const needsBuPick = !suggestion.bu_valid;

  const handleAdd = async () => {
    const finalBu = suggestion.bu_valid ? suggestion.business_unit : bu;
    if (!finalBu) { addToast('Pick a business unit for this task', 'error'); return; }

    // Recompute due_datetime from edited parts; otherwise reuse the server value.
    let due_datetime = suggestion.due_datetime;
    let is_all_day = suggestion.is_all_day;
    if (editing) {
      if (dueDate) {
        due_datetime = dueTime
          ? toSqliteUtcFromLocalInput(`${dueDate}T${dueTime}`)
          : toSqliteUtcFromLocalInput(`${dueDate}T00:00`);
        is_all_day = !dueTime;
      } else {
        due_datetime = null;
        is_all_day = true;
      }
    }

    setAdding(true);
    try {
      await tasksApi.create({
        subject: subject.trim() || 'Follow up',
        business_unit: finalBu,
        status: 'Not Started',
        priority: 'Normal',
        due_datetime,
        is_all_day,
        reminder_datetime: suggestion.reminder_datetime || null,
        ...suggestion.link,
      });
      addToast('Task added', 'success');
      onClose?.();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to add task', 'error');
      setAdding(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-arkalon-blue/30 rounded-lg p-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock className="w-4 h-4 text-arkalon-blue flex-shrink-0" />
        <span className="text-sm font-montserrat font-semibold text-arkalon-navy">Add follow-up task?</span>
      </div>

      {editing ? (
        <div className="space-y-2 mb-2">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Task subject…"
            className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
            />
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
            />
          </div>
        </div>
      ) : (
        <p className="text-sm font-opensans text-slate-700 mb-2">
          <span className="font-semibold">{subject || 'Follow up'}</span>
          <span className="text-slate-400"> · Due {dueLabel(dueDate, dueTime)}</span>
        </p>
      )}

      {suggestion.bu_valid ? (
        <p className="text-xs font-opensans text-slate-400 mb-2">
          Business unit: <span className="font-semibold text-slate-600">{suggestion.business_unit}</span> (inherited)
        </p>
      ) : (
        <div className="mb-2">
          <label className="block text-xs font-opensans text-amber-700 mb-1">
            Business unit couldn’t be inherited — pick one:
          </label>
          <select
            value={bu}
            onChange={(e) => setBu(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-amber-300 rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
          >
            <option value="">Select…</option>
            {BUSINESS_UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={adding}>Dismiss</Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)} disabled={adding}>
          {editing ? 'Done editing' : 'Edit'}
        </Button>
        <Button size="sm" onClick={handleAdd} disabled={adding || (needsBuPick && !bu)}>
          {adding ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </div>
  );
}
