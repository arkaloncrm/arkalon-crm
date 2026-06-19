import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import DuplicateWarning from '../../components/UI/DuplicateWarning.jsx';
import { accountsApi } from '../../api/accounts.js';
import { picklistsApi } from '../../api/picklists.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useDuplicateCheck } from '../../hooks/useDuplicateCheck.js';
import { BUSINESS_UNITS, INDUSTRIES } from '../../utils/constants.js';

// Constant is mapped to {value,label} and kept as the fallback / loading state
// so the dropdown is never empty while the picklist loads (or if it fails).
const asOptions = (arr) => arr.map((v) => ({ value: v, label: v }));

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

export default function AccountForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    name: '', website: '', industry: '', employee_count: '',
    annual_revenue: '', phone: '', business_unit: '',
    billing_street: '', billing_city: '', billing_state: '',
    billing_postcode: '', billing_country: 'Australia',
    description: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [industries, setIndustries] = useState(asOptions(INDUSTRIES));

  useEffect(() => {
    let active = true;
    picklistsApi.get('industry')
      .then(res => { if (active && res.data.data?.length) setIndustries(res.data.data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const { matches: duplicates, check: checkDuplicates, clear: clearDuplicates } = useDuplicateCheck(
    'account',
    () => ({ company_name: form.name, website: form.website, phone: form.phone }),
    isEdit ? Number(id) : 0,
  );

  useEffect(() => {
    if (!isEdit) return;
    accountsApi.getById(id)
      .then(res => {
        const a = res.data.data;
        setForm({
          name: a.name || '',
          website: a.website || '',
          industry: a.industry || '',
          employee_count: a.employee_count ?? '',
          annual_revenue: a.annual_revenue ?? '',
          phone: a.phone || '',
          business_unit: a.business_unit || '',
          billing_street: a.billing_street || '',
          billing_city: a.billing_city || '',
          billing_state: a.billing_state || '',
          billing_postcode: a.billing_postcode || '',
          billing_country: a.billing_country || 'Australia',
          description: a.description || '',
        });
      })
      .catch(() => addToast('Failed to load account', 'error'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Account name is required';
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
        ? await accountsApi.update(id, payload)
        : await accountsApi.create(payload);
      addToast(isEdit ? 'Account updated' : 'Account created', 'success');
      navigate(`/accounts/${res.data.data.id}`);
    } catch (err) {
      addToast(err.response?.data?.error || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-64 bg-slate-100 rounded animate-pulse" />;

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center gap-3 mb-5">
        <button type="button" onClick={() => navigate('/accounts')} className="flex items-center gap-1 text-arkalon-blue text-sm hover:underline font-opensans">
          <ArrowLeft className="w-3.5 h-3.5" /> Accounts
        </button>
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">
          {isEdit ? `Edit Account: ${form.name}` : 'New Account'}
        </h2>
      </div>

      <DuplicateWarning matches={duplicates} entityType="account" onDismiss={clearDuplicates} />

      <div className="space-y-4 pb-4">
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Account Information</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Account Name" required error={errors.name}>
              <input type="text" className={inputCls(errors.name)} value={form.name} onChange={set('name')} onBlur={checkDuplicates} />
            </Field>
            <Field label="Business Unit" required error={errors.business_unit}>
              <select className={selectCls(errors.business_unit)} value={form.business_unit} onChange={set('business_unit')}>
                <option value="">—</option>
                {BUSINESS_UNITS.map(bu => <option key={bu}>{bu}</option>)}
              </select>
            </Field>
            <Field label="Website">
              <input type="text" className={inputCls()} value={form.website} onChange={set('website')} onBlur={checkDuplicates} placeholder="https://" />
            </Field>
            <Field label="Phone">
              <input type="text" className={inputCls()} value={form.phone} onChange={set('phone')} onBlur={checkDuplicates} />
            </Field>
            <Field label="Industry">
              <select className={selectCls()} value={form.industry} onChange={set('industry')}>
                <option value="">—</option>
                {industries.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
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

        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Billing Address</h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Street">
                <input type="text" className={inputCls()} value={form.billing_street} onChange={set('billing_street')} />
              </Field>
            </div>
            <Field label="City">
              <input type="text" className={inputCls()} value={form.billing_city} onChange={set('billing_city')} />
            </Field>
            <Field label="State">
              <input type="text" className={inputCls()} value={form.billing_state} onChange={set('billing_state')} />
            </Field>
            <Field label="Postcode">
              <input type="text" className={inputCls()} value={form.billing_postcode} onChange={set('billing_postcode')} />
            </Field>
            <Field label="Country">
              <input type="text" className={inputCls()} value={form.billing_country} onChange={set('billing_country')} />
            </Field>
          </div>
        </div>

        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Description</h3>
          </div>
          <div className="p-5">
            <textarea rows={4} className={inputCls()} value={form.description} onChange={set('description')} placeholder="Notes about this account…" />
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 bg-white border-t border-arkalon-lightgrey px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:justify-end gap-2 z-30">
        <Button type="button" variant="secondary" onClick={() => navigate('/accounts')} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0">Cancel</Button>
        <Button type="submit" disabled={saving} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0">{saving ? 'Saving…' : 'Save Account'}</Button>
      </div>
    </form>
  );
}
