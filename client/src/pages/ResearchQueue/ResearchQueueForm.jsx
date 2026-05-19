import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import { researchQueueApi } from '../../api/researchQueue.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  RESEARCH_BUSINESS_UNITS, RESEARCH_CANDIDATE_TYPES, RESEARCH_STATUSES, CONFIDENCE_LEVELS,
} from '../../utils/constants.js';

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

const SectionCard = ({ title, children }) => (
  <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
    <div className="px-5 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
      <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">{title}</h3>
    </div>
    <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

const EMPTY = {
  title: '', candidate_type: '', business_unit: '', status: 'New', confidence_level: '',
  source: '', source_url: '', company_name: '', first_name: '', last_name: '', email: '',
  phone: '', mobile: '', website: '', linkedin_url: '', ai_summary: '', why_it_matters: '',
  suggested_next_action: '', review_notes: '', rejected_reason: '',
};

// Build the initial form from router state — used by the Business Card Scanner,
// which navigates here with extracted fields for the user to review and save.
function initialForm(state) {
  if (!state) return EMPTY;
  const next = { ...EMPTY };
  if (state.prefill && typeof state.prefill === 'object') {
    for (const key of Object.keys(EMPTY)) {
      const v = state.prefill[key];
      if (v != null && v !== '') next[key] = v;
    }
  }
  if (state.candidate_type) next.candidate_type = state.candidate_type;
  if (state.source) next.source = state.source;
  if (state.confidence_level) next.confidence_level = state.confidence_level;
  return next;
}

export default function ResearchQueueForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(() => (isEdit ? EMPTY : initialForm(location.state)));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    researchQueueApi.getById(id)
      .then(res => {
        const r = res.data.data;
        setForm({
          title: r.title || '',
          candidate_type: r.candidate_type || '',
          business_unit: r.business_unit || '',
          status: r.status || 'New',
          confidence_level: r.confidence_level || '',
          source: r.source || '',
          source_url: r.source_url || '',
          company_name: r.company_name || '',
          first_name: r.first_name || '',
          last_name: r.last_name || '',
          email: r.email || '',
          phone: r.phone || '',
          mobile: r.mobile || '',
          website: r.website || '',
          linkedin_url: r.linkedin_url || '',
          ai_summary: r.ai_summary || '',
          why_it_matters: r.why_it_matters || '',
          suggested_next_action: r.suggested_next_action || '',
          review_notes: r.review_notes || '',
          rejected_reason: r.rejected_reason || '',
        });
      })
      .catch(() => addToast('Failed to load record', 'error'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.candidate_type) e.candidate_type = 'Candidate type is required';
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
        // The blank "—" option yields '' which fails the confidence_level
        // CHECK constraint (NULL is permitted, '' is not).
        confidence_level: form.confidence_level || null,
      };
      const res = isEdit
        ? await researchQueueApi.update(id, payload)
        : await researchQueueApi.create(payload);
      addToast(isEdit ? 'Record updated' : 'Record created', 'success');
      navigate(`/research-queue/${res.data.data.id}`);
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
        <button type="button" onClick={() => navigate('/research-queue')} className="flex items-center gap-1 text-arkalon-blue text-sm hover:underline font-opensans">
          <ArrowLeft className="w-3.5 h-3.5" /> Research Queue
        </button>
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">
          {isEdit ? 'Edit Research Record' : 'New Research Record'}
        </h2>
      </div>

      <div className="space-y-4 pb-4">
        {/* Section 1 — Record Details */}
        <SectionCard title="Record Details">
          <div className="sm:col-span-2">
            <Field label="Title">
              <input type="text" className={inputCls()} value={form.title} onChange={set('title')} />
            </Field>
          </div>
          <Field label="Candidate Type" required error={errors.candidate_type}>
            <select className={selectCls(errors.candidate_type)} value={form.candidate_type} onChange={set('candidate_type')}>
              <option value="">—</option>
              {RESEARCH_CANDIDATE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Business Unit" required error={errors.business_unit}>
            <select className={selectCls(errors.business_unit)} value={form.business_unit} onChange={set('business_unit')}>
              <option value="">—</option>
              {RESEARCH_BUSINESS_UNITS.map(bu => <option key={bu}>{bu}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={selectCls()} value={form.status} onChange={set('status')}>
              {RESEARCH_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Confidence Level">
            <select className={selectCls()} value={form.confidence_level} onChange={set('confidence_level')}>
              <option value="">—</option>
              {CONFIDENCE_LEVELS.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Source">
            <input type="text" className={inputCls()} value={form.source} onChange={set('source')} />
          </Field>
          <Field label="Source URL">
            <input type="text" className={inputCls()} value={form.source_url} onChange={set('source_url')} />
          </Field>
        </SectionCard>

        {/* Section 2 — Person / Company */}
        <SectionCard title="Person / Company">
          <div className="sm:col-span-2">
            <Field label="Company Name">
              <input type="text" className={inputCls()} value={form.company_name} onChange={set('company_name')} />
            </Field>
          </div>
          <Field label="First Name">
            <input type="text" className={inputCls()} value={form.first_name} onChange={set('first_name')} />
          </Field>
          <Field label="Last Name">
            <input type="text" className={inputCls()} value={form.last_name} onChange={set('last_name')} />
          </Field>
          <Field label="Email">
            <input type="email" className={inputCls()} value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Phone">
            <input type="text" className={inputCls()} value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Mobile">
            <input type="text" className={inputCls()} value={form.mobile} onChange={set('mobile')} />
          </Field>
          <Field label="Website">
            <input type="text" className={inputCls()} value={form.website} onChange={set('website')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="LinkedIn URL">
              <input type="text" className={inputCls()} value={form.linkedin_url} onChange={set('linkedin_url')} />
            </Field>
          </div>
        </SectionCard>

        {/* Section 3 — AI Intelligence */}
        <SectionCard title="AI Intelligence">
          <div className="sm:col-span-2">
            <Field label="AI Summary">
              <textarea rows={4} className={inputCls()} value={form.ai_summary} onChange={set('ai_summary')} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Why It Matters">
              <textarea rows={3} className={inputCls()} value={form.why_it_matters} onChange={set('why_it_matters')} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Suggested Next Action">
              <input type="text" className={inputCls()} value={form.suggested_next_action} onChange={set('suggested_next_action')} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Review Notes">
              <textarea rows={3} className={inputCls()} value={form.review_notes} onChange={set('review_notes')} />
            </Field>
          </div>
          {form.status === 'Rejected' && (
            <div className="sm:col-span-2">
              <Field label="Rejected Reason">
                <input type="text" className={inputCls()} value={form.rejected_reason} onChange={set('rejected_reason')} />
              </Field>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 bg-white border-t border-arkalon-lightgrey px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:justify-end gap-2 z-30">
        <Button type="button" variant="secondary" onClick={() => navigate('/research-queue')} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0">Cancel</Button>
        <Button type="submit" disabled={saving} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0">{saving ? 'Saving…' : 'Save Record'}</Button>
      </div>
    </form>
  );
}
