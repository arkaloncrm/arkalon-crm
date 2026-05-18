import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import DuplicateWarning from '../../components/UI/DuplicateWarning.jsx';
import { contactsApi } from '../../api/contacts.js';
import { accountsApi } from '../../api/accounts.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useDuplicateCheck } from '../../hooks/useDuplicateCheck.js';
import { BUSINESS_UNITS } from '../../utils/constants.js';

const SALUTATIONS = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'];

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

export default function ContactForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    salutation: '', first_name: '', last_name: '', title: '',
    email: '', phone: '', mobile: '', linkedin_url: '',
    department: '', business_unit: '',
    account_id: searchParams.get('account_id') || '',
    description: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [accounts, setAccounts] = useState([]);

  const { matches: duplicates, check: checkDuplicates, clear: clearDuplicates } = useDuplicateCheck(
    'contact',
    () => ({
      email: form.email,
      phone: form.phone,
      mobile: form.mobile,
      linkedin_url: form.linkedin_url,
    }),
    isEdit ? Number(id) : 0,
  );

  useEffect(() => {
    accountsApi.getAll().then(res => setAccounts(res.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    contactsApi.getById(id)
      .then(res => {
        const c = res.data.data;
        setForm({
          salutation: c.salutation || '',
          first_name: c.first_name || '',
          last_name: c.last_name || '',
          title: c.title || '',
          email: c.email || '',
          phone: c.phone || '',
          mobile: c.mobile || '',
          linkedin_url: c.linkedin_url || '',
          department: c.department || '',
          business_unit: c.business_unit || '',
          account_id: c.account_id ? String(c.account_id) : '',
          description: c.description || '',
        });
      })
      .catch(() => addToast('Failed to load contact', 'error'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.last_name.trim()) e.last_name = 'Last name is required';
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
      const payload = { ...form, account_id: form.account_id ? Number(form.account_id) : null };
      const res = isEdit
        ? await contactsApi.update(id, payload)
        : await contactsApi.create(payload);
      addToast(isEdit ? 'Contact updated' : 'Contact created', 'success');
      navigate(`/contacts/${res.data.data.id}`);
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
        <button type="button" onClick={() => navigate('/contacts')} className="flex items-center gap-1 text-arkalon-blue text-sm hover:underline font-opensans">
          <ArrowLeft className="w-3.5 h-3.5" /> Contacts
        </button>
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">
          {isEdit ? `Edit Contact: ${form.first_name} ${form.last_name}`.trim() : 'New Contact'}
        </h2>
      </div>

      <DuplicateWarning matches={duplicates} entityType="contact" onDismiss={clearDuplicates} />

      <div className="pb-4">
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Contact Information</h3>
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
            <Field label="Account">
              <select className={selectCls()} value={form.account_id} onChange={set('account_id')}>
                <option value="">— No account —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Business Unit" required error={errors.business_unit}>
              <select className={selectCls(errors.business_unit)} value={form.business_unit} onChange={set('business_unit')}>
                <option value="">—</option>
                {BUSINESS_UNITS.map(bu => <option key={bu}>{bu}</option>)}
              </select>
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
            <Field label="LinkedIn URL">
              <input type="text" className={inputCls()} value={form.linkedin_url} onChange={set('linkedin_url')} onBlur={checkDuplicates} />
            </Field>
            <Field label="Department">
              <input type="text" className={inputCls()} value={form.department} onChange={set('department')} />
            </Field>
            <div className="col-span-2">
              <Field label="Description">
                <textarea rows={4} className={inputCls()} value={form.description} onChange={set('description')} />
              </Field>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 bg-white border-t border-arkalon-lightgrey px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:justify-end gap-2 z-30">
        <Button type="button" variant="secondary" onClick={() => navigate('/contacts')} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0">Cancel</Button>
        <Button type="submit" disabled={saving} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0">{saving ? 'Saving…' : 'Save Contact'}</Button>
      </div>
    </form>
  );
}
