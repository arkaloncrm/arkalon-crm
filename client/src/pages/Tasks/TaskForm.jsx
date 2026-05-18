import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Button from '../../components/UI/Button.jsx';
import { tasksApi } from '../../api/tasks.js';
import { leadsApi } from '../../api/leads.js';
import { contactsApi } from '../../api/contacts.js';
import { accountsApi } from '../../api/accounts.js';
import { dealsApi } from '../../api/deals.js';
import { useToast } from '../../context/ToastContext.jsx';
import { TASK_STATUSES, TASK_PRIORITIES, BUSINESS_UNITS } from '../../utils/constants.js';
import { toSqliteUtcFromLocalInput, fromSqliteUtcToDatetimeLocal } from '../../utils/formatDate.js';

const EMPTY_FORM = {
  subject: '', status: 'Not Started', priority: 'Normal', business_unit: '',
  due_date: '', due_time: '', set_specific_time: false, is_all_day: true,
  reminder_datetime: '', description: '',
  lead_id: '', contact_id: '', account_id: '', deal_id: '',
};

function buildDueDatetime(form) {
  if (!form.due_date) return null;
  if (form.set_specific_time && form.due_time) {
    return toSqliteUtcFromLocalInput(`${form.due_date}T${form.due_time}`);
  }
  return toSqliteUtcFromLocalInput(`${form.due_date}T00:00`);
}

export default function TaskForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [buLocked, setBuLocked] = useState(false);

  const [allLeads, setAllLeads] = useState([]);
  const [allContacts, setAllContacts] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [allDeals, setAllDeals] = useState([]);
  const [filteredContacts, setFilteredContacts] = useState([]);

  // Load lookup data
  useEffect(() => {
    Promise.all([
      leadsApi.getAll({ converted: 0 }),
      contactsApi.getAll({}),
      accountsApi.getAll({}),
      dealsApi.getAll({}),
    ]).then(([l, c, a, d]) => {
      setAllLeads(l.data.data || []);
      const contacts = c.data.data || [];
      setAllContacts(contacts);
      setFilteredContacts(contacts);
      setAllAccounts(a.data.data || []);
      setAllDeals(d.data.data || []);
    }).catch(() => {});
  }, []);

  // Initialise form from query params or load existing record
  useEffect(() => {
    const qLeadId = searchParams.get('lead_id') || '';
    const qContactId = searchParams.get('contact_id') || '';
    const qAccountId = searchParams.get('account_id') || '';
    const qDealId = searchParams.get('deal_id') || '';
    const qBu = searchParams.get('business_unit') || '';

    if (isEdit) {
      setLoading(true);
      tasksApi.getById(id)
        .then(res => {
          const t = res.data.data;
          const dueDt = t.due_datetime
            ? (t.due_datetime.includes('T') ? t.due_datetime : t.due_datetime.replace(' ', 'T') + 'Z')
            : '';
          let dueDate = '';
          let dueTime = '';
          if (dueDt) {
            const d = new Date(dueDt);
            const pad = n => String(n).padStart(2, '0');
            dueDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            dueTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
          }
          setForm({
            subject: t.subject || '',
            status: t.status || 'Not Started',
            priority: t.priority || 'Normal',
            business_unit: t.business_unit || '',
            due_date: dueDate,
            due_time: dueTime,
            set_specific_time: !t.is_all_day,
            is_all_day: Boolean(t.is_all_day),
            reminder_datetime: fromSqliteUtcToDatetimeLocal(t.reminder_datetime),
            description: t.description || '',
            lead_id: t.lead_id ?? '',
            contact_id: t.contact_id ?? '',
            account_id: t.account_id ?? '',
            deal_id: t.deal_id ?? '',
          });
          if (t.account_id) {
            setFilteredContacts(prev => prev.filter(c => c.account_id === t.account_id));
          }
        })
        .catch(() => addToast('Failed to load task', 'error'))
        .finally(() => setLoading(false));
    } else {
      const initialBu = qBu && ['ASC', 'Simply Seated'].includes(qBu) ? qBu : '';
      setForm(prev => ({
        ...prev,
        lead_id: qLeadId,
        contact_id: qContactId,
        account_id: qAccountId,
        deal_id: qDealId,
        business_unit: initialBu,
      }));
      if (initialBu) setBuLocked(true);
    }
  }, [id, isEdit]);

  const handleAccountChange = (accountId) => {
    setForm(prev => ({ ...prev, account_id: accountId, contact_id: '' }));
    if (accountId) {
      setFilteredContacts(allContacts.filter(c => c.account_id === Number(accountId)));
    } else {
      setFilteredContacts(allContacts);
    }
  };

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subject.trim()) { addToast('Subject is required', 'error'); return; }
    if (!form.business_unit) { addToast('Business unit is required', 'error'); return; }

    setSaving(true);
    try {
      const due_datetime = buildDueDatetime(form);
      const payload = {
        subject: form.subject.trim(),
        status: form.status,
        priority: form.priority,
        business_unit: form.business_unit,
        due_datetime,
        is_all_day: form.set_specific_time ? 0 : 1,
        reminder_datetime: toSqliteUtcFromLocalInput(form.reminder_datetime) || null,
        description: form.description || null,
        lead_id: form.lead_id || null,
        contact_id: form.contact_id || null,
        account_id: form.account_id || null,
        deal_id: form.deal_id || null,
      };

      if (isEdit) {
        await tasksApi.update(id, payload);
        addToast('Task updated', 'success');
      } else {
        await tasksApi.create(payload);
        addToast('Task created', 'success');
      }
      navigate('/tasks');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save task', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="space-y-3"><div className="h-10 bg-slate-100 rounded animate-pulse w-1/3" /></div>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate('/tasks')} className="text-arkalon-blue text-sm hover:underline font-opensans">
          ← Tasks
        </button>
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">
          {isEdit ? 'Edit Task' : 'New Task'}
        </h2>
      </div>

      {/* Section 1 — Task Details */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg p-5 mb-4">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-xs uppercase tracking-wide mb-4">Task Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 font-opensans mb-1">Subject <span className="text-red-500">*</span></label>
            <input type="text" value={form.subject} onChange={e => handleChange('subject', e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
              placeholder="Task subject…" />
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Status</label>
            <select value={form.status} onChange={e => handleChange('status', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
              {TASK_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Priority</label>
            <select value={form.priority} onChange={e => handleChange('priority', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
              {TASK_PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">
              Business Unit <span className="text-red-500">*</span>
            </label>
            {buLocked ? (
              <div className={`px-3 py-2 text-sm rounded font-opensans font-semibold ${
                form.business_unit === 'ASC' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-teal-50 text-teal-700 border border-teal-200'
              }`}>
                {form.business_unit} <span className="text-xs font-normal opacity-60">(inherited)</span>
              </div>
            ) : (
              <select value={form.business_unit} onChange={e => handleChange('business_unit', e.target.value)} required
                className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
                <option value="">Select…</option>
                {BUSINESS_UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Due Date</label>
            <input type="date" value={form.due_date} onChange={e => handleChange('due_date', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30" />
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs text-slate-500 font-opensans mb-1 cursor-pointer">
              <input type="checkbox" checked={form.set_specific_time} onChange={e => handleChange('set_specific_time', e.target.checked)} />
              Set specific time
            </label>
            {form.set_specific_time && (
              <input type="time" value={form.due_time} onChange={e => handleChange('due_time', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30" />
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Reminder</label>
            <input type="datetime-local" value={form.reminder_datetime} onChange={e => handleChange('reminder_datetime', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30" />
          </div>
        </div>
      </div>

      {/* Section 2 — Link to Record */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg p-5 mb-4">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-xs uppercase tracking-wide mb-4">Link to Record</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Lead</label>
            <select value={form.lead_id} onChange={e => handleChange('lead_id', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
              <option value="">— None —</option>
              {allLeads.map(l => <option key={l.id} value={l.id}>{l.company} ({l.first_name} {l.last_name})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Account</label>
            <select value={form.account_id} onChange={e => handleAccountChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
              <option value="">— None —</option>
              {allAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Contact</label>
            <select value={form.contact_id} onChange={e => handleChange('contact_id', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
              <option value="">— None —</option>
              {filteredContacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Deal</label>
            <select value={form.deal_id} onChange={e => handleChange('deal_id', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
              <option value="">— None —</option>
              {allDeals.map(d => <option key={d.id} value={d.id}>{d.deal_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Section 3 — Description */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg p-5 mb-20">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-xs uppercase tracking-wide mb-4">Description</h3>
        <textarea rows={4} value={form.description} onChange={e => handleChange('description', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 resize-none"
          placeholder="Task description…" />
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-arkalon-lightgrey px-6 py-3 flex justify-end gap-3 z-10">
        <Button type="button" variant="secondary" onClick={() => navigate('/tasks')} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Task'}</Button>
      </div>
    </form>
  );
}
