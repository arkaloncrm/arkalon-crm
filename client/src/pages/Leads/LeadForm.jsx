import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import DuplicateWarning from '../../components/UI/DuplicateWarning.jsx';
import { leadsApi } from '../../api/leads.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useDuplicateCheck } from '../../hooks/useDuplicateCheck.js';
import {
  BUSINESS_UNITS, LEAD_STATUSES, LEAD_SOURCES,
  INDUSTRIES, TARGET_TYPES, PRIORITY_COLOURS,
} from '../../utils/constants.js';

const SALUTATIONS = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'];
const PRIORITIES = ['P1 - Act Now', 'P2 - This Month', 'P3 - Pipeline', 'Parked'];

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="block text-xs font-opensans font-semibold text-slate-500 uppercase tracking-wide mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 font-opensans mt-0.5">{error}</p>}
    </div>
  );
}

const inputCls = (err) =>
  `w-full px-3 py-2 text-sm border rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 ${err ? 'border-red-400' : 'border-arkalon-lightgrey'}`;

const selectCls = (err) =>
  `w-full px-3 py-2 text-sm border rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 ${err ? 'border-red-400' : 'border-arkalon-lightgrey'}`;

export default function LeadForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    salutation: '', first_name: '', last_name: '', title: '', company: '', email: '',
    phone: '', mobile: '', website: '', lead_source: '', lead_status: 'New',
    business_unit: '', target_type: '', priority: '', industry: '', employee_count: '',
    annual_revenue: '', street: '', city: '', state: '', postcode: '', country: 'Australia',
    warm_path: '', next_action: '', next_action_date: '', description: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  const { matches: duplicates, check: checkDuplicates, clear: clearDuplicates } = useDuplicateCheck(
    'lead',
    () => ({
      company_name: form.company,
      email: form.email,
      phone: form.phone,
      mobile: form.mobile,
      website: form.website,
    }),
    isEdit ? Number(id) : 0,
  );

  useEffect(() => {
    if (!isEdit) return;
    leadsApi.getById(id)
      .then(res => {
        const l = res.data.data;
        setForm({
          salutation: l.salutation || '',
          first_name: l.first_name || '',
          last_name: l.last_name || '',
          title: l.title || '',
          company: l.company || '',
          email: l.email || '',
          phone: l.phone || '',
          mobile: l.mobile || '',
          website: l.website || '',
          lead_source: l.lead_source || '',
          lead_status: l.lead_status || 'New',
          business_unit: l.business_unit || '',
          target_type: l.target_type || '',
          priority: l.priority || '',
          industry: l.industry || '',
          employee_count: l.employee_count ?? '',
          annual_revenue: l.annual_revenue ?? '',
          street: l.street || '',
          city: l.city || '',
          state: l.state || '',
          postcode: l.postcode || '',
          country: l.country || 'Australia',
          warm_path: l.warm_path || '',
          next_action: l.next_action || '',
          next_action_date: l.next_action_date || '',
          description: l.description || '',
        });
      })
      .catch(() => addToast('Failed to load lead', 'error'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.last_name.trim()) e.last_name = 'Last name is required';
    if (!form.company.trim()) e.company = 'Company is required';
    if (!form.lead_status) e.lead_status = 'Status is required';
    if (!form.business_unit) e.business_unit = 'Business unit is required';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setSaving(true);
    try {
      const payload = {
        ...form,
        employee_count: form.employee_count !== '' ? Number(form.employee_count) : null,
        annual_revenue: form.annual_revenue !== '' ? Number(form.annual_revenue) : null,
      };
      const res = isEdit
        ? await leadsApi.update(id, payload)
        : await leadsApi.create(payload);
      addToast(isEdit ? 'Lead updated' : 'Lead created', 'success');
      navigate(`/leads/${res.data.data.id}`);
    } catch (err) {
      addToast(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-64 bg-slate-100 rounded animate-pulse" />;
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button type="button" onClick={() => navigate('/leads')} className="flex items-center gap-1 text-arkalon-blue text-sm hover:underline font-opensans">
          <ArrowLeft className="w-3.5 h-3.5" /> Leads
        </button>
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">
          {isEdit ? `Edit Lead: ${form.first_name} ${form.last_name}`.trim() : 'New Lead'}
        </h2>
      </div>

      <DuplicateWarning matches={duplicates} entityType="lead" onDismiss={clearDuplicates} />

      <div className="space-y-4 pb-4">
        {/* Section 1 — Lead Information */}
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Lead Information</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Salutation">
              <select className={selectCls()} value={form.salutation} onChange={set('salutation')}>
                <option value="">—</option>
                {SALUTATIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="First Name">
              <input type="text" className={inputCls()} value={form.first_name} onChange={set('first_name')} />
            </Field>
            <Field label="Last Name" required error={errors.last_name}>
              <input type="text" className={inputCls(errors.last_name)} value={form.last_name} onChange={set('last_name')} />
            </Field>
            <Field label="Title">
              <input type="text" className={inputCls()} value={form.title} onChange={set('title')} />
            </Field>
            <Field label="Company" required error={errors.company}>
              <input type="text" className={inputCls(errors.company)} value={form.company} onChange={set('company')} onBlur={checkDuplicates} />
            </Field>
            <Field label="Email">
              <input type="email" className={inputCls()} value={form.email} onChange={set('email')} onBlur={checkDuplicates} />
            </Field>
            <Field label="Phone">
              <input type="text" className={inputCls()} value={form.phone} onChange={set('phone')} onBlur={checkDuplicates} />
            </Field>
            <Field label="Mobile">
              <input type="text" className={inputCls()} value={form.mobile} onChange={set('mobile')} onBlur={checkDuplicates} />
            </Field>
            <Field label="Website">
              <input type="text" className={inputCls()} value={form.website} onChange={set('website')} onBlur={checkDuplicates} />
            </Field>
            <Field label="Lead Source">
              <select className={selectCls()} value={form.lead_source} onChange={set('lead_source')}>
                <option value="">—</option>
                {LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Lead Status" required error={errors.lead_status}>
              <select className={selectCls(errors.lead_status)} value={form.lead_status} onChange={set('lead_status')}>
                <option value="">—</option>
                {LEAD_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Business Unit" required error={errors.business_unit}>
              <select className={selectCls(errors.business_unit)} value={form.business_unit} onChange={set('business_unit')}>
                <option value="">—</option>
                {BUSINESS_UNITS.map(bu => <option key={bu}>{bu}</option>)}
              </select>
            </Field>
            <Field label="Target Type">
              <select className={selectCls()} value={form.target_type} onChange={set('target_type')}>
                <option value="">—</option>
                {TARGET_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select className={selectCls()} value={form.priority} onChange={set('priority')}>
                <option value="">—</option>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* Section 2 — Company Details */}
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Company Details</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Industry">
              <select className={selectCls()} value={form.industry} onChange={set('industry')}>
                <option value="">—</option>
                {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
              </select>
            </Field>
            <Field label="Employee Count">
              <input type="number" min="0" className={inputCls()} value={form.employee_count} onChange={set('employee_count')} />
            </Field>
            <Field label="Annual Revenue (AUD)">
              <input type="number" min="0" step="0.01" className={inputCls()} value={form.annual_revenue} onChange={set('annual_revenue')} />
            </Field>
          </div>
        </div>

        {/* Section 3 — Address */}
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Address</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Street">
                <input type="text" className={inputCls()} value={form.street} onChange={set('street')} />
              </Field>
            </div>
            <Field label="City">
              <input type="text" className={inputCls()} value={form.city} onChange={set('city')} />
            </Field>
            <Field label="State">
              <input type="text" className={inputCls()} value={form.state} onChange={set('state')} />
            </Field>
            <Field label="Postcode">
              <input type="text" className={inputCls()} value={form.postcode} onChange={set('postcode')} />
            </Field>
            <Field label="Country">
              <input type="text" className={inputCls()} value={form.country} onChange={set('country')} />
            </Field>
          </div>
        </div>

        {/* Section 4 — Additional */}
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Additional</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Warm Path">
              <input type="text" className={inputCls()} value={form.warm_path} onChange={set('warm_path')} />
            </Field>
            <Field label="Next Action">
              <input type="text" className={inputCls()} value={form.next_action} onChange={set('next_action')} />
            </Field>
            <Field label="Next Action Date">
              <input type="date" className={inputCls()} value={form.next_action_date} onChange={set('next_action_date')} />
            </Field>
            <div className="col-span-2">
              <Field label="Description">
                <textarea
                  rows={4}
                  className={inputCls()}
                  value={form.description}
                  onChange={set('description')}
                />
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 bg-white border-t border-arkalon-lightgrey px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:justify-end gap-2 z-30">
        <Button type="button" variant="secondary" onClick={() => navigate('/leads')} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0">Cancel</Button>
        <Button type="submit" disabled={saving} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0">{saving ? 'Saving…' : 'Save Lead'}</Button>
      </div>
    </form>
  );
}
