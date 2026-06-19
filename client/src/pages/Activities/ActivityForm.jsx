import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Button from '../../components/UI/Button.jsx';
import { activitiesApi } from '../../api/activities.js';
import { leadsApi } from '../../api/leads.js';
import { contactsApi } from '../../api/contacts.js';
import { accountsApi } from '../../api/accounts.js';
import { dealsApi } from '../../api/deals.js';
import { picklistsApi } from '../../api/picklists.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ACTIVITY_TYPES, ACTIVITY_OUTCOMES, BUSINESS_UNITS } from '../../utils/constants.js';
import { toSqliteUtcFromLocalInput, fromSqliteUtcToDatetimeLocal } from '../../utils/formatDate.js';

const DIRECTION_OPTIONS = ['Outbound', 'Inbound'];
const STATUS_OPTIONS = ['Planned', 'Held', 'Not Held'];

// Constants are mapped to {value,label} and kept as the fallback / loading state
// so the dropdowns are never empty while picklists load (or if the API fails).
const asOptions = (arr) => arr.map((v) => ({ value: v, label: v }));

const EMPTY_FORM = {
  type: '', subject: '', direction: 'Outbound', status: 'Held', outcome: '',
  business_unit: '', start_datetime: '', duration_minutes: '',
  lead_id: '', contact_id: '', account_id: '', deal_id: '',
  description: '', next_action: '', next_action_date: '',
};

export default function ActivityForm() {
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

  const [activityTypes, setActivityTypes] = useState(asOptions(ACTIVITY_TYPES));
  const [activityOutcomes, setActivityOutcomes] = useState(asOptions(ACTIVITY_OUTCOMES));

  // Load picklists — fall back to constants on failure / while loading
  useEffect(() => {
    let active = true;
    picklistsApi.get('activity_type')
      .then(res => { if (active && res.data.data?.length) setActivityTypes(res.data.data); })
      .catch(() => {});
    picklistsApi.get('activity_outcome')
      .then(res => { if (active && res.data.data?.length) setActivityOutcomes(res.data.data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Load lookup data
  useEffect(() => {
    Promise.all([
      leadsApi.getAll({ converted: 0 }),
      contactsApi.getAll({}),
      accountsApi.getAll({}),
    ]).then(([l, c, a]) => {
      setAllLeads(l.data.data || []);
      const contacts = c.data.data || [];
      setAllContacts(contacts);
      setFilteredContacts(contacts);
      setAllAccounts(a.data.data || []);
    }).catch(() => {});
  }, []);

  // Load deals
  useEffect(() => {
    dealsApi.getAll({}).then(res => setAllDeals(res.data.data || [])).catch(() => {});
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
      activitiesApi.getById(id)
        .then(res => {
          const a = res.data.data;
          setForm({
            type: a.type || '',
            subject: a.subject || '',
            direction: a.direction || 'Outbound',
            status: a.status || 'Held',
            outcome: a.outcome || '',
            business_unit: a.business_unit || '',
            start_datetime: fromSqliteUtcToDatetimeLocal(a.start_datetime),
            duration_minutes: a.duration_minutes ?? '',
            lead_id: a.lead_id ?? '',
            contact_id: a.contact_id ?? '',
            account_id: a.account_id ?? '',
            deal_id: a.deal_id ?? '',
            description: a.description || '',
            next_action: a.next_action || '',
            next_action_date: a.next_action_date || '',
          });
        })
        .catch(() => addToast('Failed to load activity', 'error'))
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

  // Filter contacts when account changes
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
    if (!form.type) { addToast('Type is required', 'error'); return; }
    if (!form.subject.trim()) { addToast('Subject is required', 'error'); return; }
    if (!form.business_unit) { addToast('Business unit is required', 'error'); return; }

    setSaving(true);
    try {
      const payload = {
        type: form.type,
        subject: form.subject.trim(),
        direction: form.direction || null,
        status: form.status,
        outcome: form.outcome || null,
        business_unit: form.business_unit,
        start_datetime: toSqliteUtcFromLocalInput(form.start_datetime),
        duration_minutes: form.duration_minutes !== '' ? Number(form.duration_minutes) : null,
        lead_id: form.lead_id || null,
        contact_id: form.contact_id || null,
        account_id: form.account_id || null,
        deal_id: form.deal_id || null,
        description: form.description || null,
        next_action: form.next_action || null,
        next_action_date: form.next_action_date || null,
      };

      if (isEdit) {
        await activitiesApi.update(id, payload);
        addToast('Activity updated', 'success');
      } else {
        await activitiesApi.create(payload);
        addToast('Activity logged', 'success');
      }
      navigate('/activities');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save activity', 'error');
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
        <button type="button" onClick={() => navigate('/activities')} className="text-arkalon-blue text-sm hover:underline font-opensans">
          ← Activities
        </button>
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">
          {isEdit ? 'Edit Activity' : 'Log Activity'}
        </h2>
      </div>

      {/* Section 1 — Activity Details */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg p-5 mb-4">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-xs uppercase tracking-wide mb-4">Activity Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Type <span className="text-red-500">*</span></label>
            <select value={form.type} onChange={e => handleChange('type', e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
              <option value="">Select type…</option>
              {activityTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Subject <span className="text-red-500">*</span></label>
            <input type="text" value={form.subject} onChange={e => handleChange('subject', e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
              placeholder="Activity subject…" />
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Direction</label>
            <select value={form.direction} onChange={e => handleChange('direction', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
              <option value="">—</option>
              {DIRECTION_OPTIONS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Status</label>
            <select value={form.status} onChange={e => handleChange('status', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Outcome</label>
            <select value={form.outcome} onChange={e => handleChange('outcome', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
              <option value="">—</option>
              {activityOutcomes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
            <label className="block text-xs text-slate-500 font-opensans mb-1">Start Date & Time</label>
            <input type="datetime-local" value={form.start_datetime} onChange={e => handleChange('start_datetime', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30" />
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Duration (minutes)</label>
            <input type="number" min="0" value={form.duration_minutes} onChange={e => handleChange('duration_minutes', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
              placeholder="e.g. 30" />
          </div>
        </div>
      </div>

      {/* Section 2 — Link to Record */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg p-5 mb-4">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-xs uppercase tracking-wide mb-4">Link to Record</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* Section 3 — Notes */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg p-5 mb-40 sm:mb-20">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-xs uppercase tracking-wide mb-4">Notes</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 font-opensans mb-1">Description / Notes</label>
            <textarea rows={4} value={form.description} onChange={e => handleChange('description', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 resize-none"
              placeholder="Activity notes…" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 font-opensans mb-1">Next Action</label>
              <input type="text" value={form.next_action} onChange={e => handleChange('next_action', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
                placeholder="Next step…" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-opensans mb-1">Next Action Date</label>
              <input type="date" value={form.next_action_date} onChange={e => handleChange('next_action_date', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30" />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-arkalon-lightgrey px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-3 z-10"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <Button type="button" variant="secondary" onClick={() => navigate('/activities')} disabled={saving} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0">Cancel</Button>
        <Button type="submit" disabled={saving} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0">{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Log Activity'}</Button>
      </div>
    </form>
  );
}
