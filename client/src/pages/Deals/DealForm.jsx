import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { dealsApi } from '../../api/deals.js';
import { productsApi } from '../../api/products.js';
import { accountsApi } from '../../api/accounts.js';
import { contactsApi } from '../../api/contacts.js';
import {
  DEAL_STAGES, DEAL_TYPES, CONTACT_ROLES, UNIT_TYPES, STAGE_MAP, LEAD_SOURCES, BUSINESS_UNITS,
} from '../../utils/constants.js';
import { formatCurrency, formatMrr } from '../../utils/formatCurrency.js';

const r = (v) => Math.round((Number(v) || 0) * 100) / 100;

function calcFinancials(form, lineItems) {
  const bu = form.business_unit;
  const dealType = form.deal_type;
  const termMonths = Number(form.contract_term_months) || 0;

  const overrideRaw = form.commission_override_amount;
  const hasOverride = overrideRaw !== null && overrideRaw !== undefined && String(overrideRaw).trim() !== '';
  const overrideAmt = hasOverride ? Number(overrideRaw) : null;

  const recurringTotal = r(
    lineItems.filter(i => i.is_recurring).reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  );
  const nonRecurringTotal = r(
    lineItems.filter(i => !i.is_recurring).reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  );

  const mrr = bu === 'ASC' ? recurringTotal : 0;
  const gross = bu === 'ASC'
    ? r(mrr * termMonths + nonRecurringTotal)
    : r(recurringTotal + nonRecurringTotal);

  const probability = STAGE_MAP[form.stage]?.probability ?? 10;
  const forecast_category = STAGE_MAP[form.stage]?.forecast_category ?? 'Pipeline';
  const weighted = r(gross * probability / 100);

  let commPct = null;
  let earnings = 0;

  if (hasOverride && Number.isFinite(overrideAmt) && overrideAmt >= 0) {
    earnings = r(overrideAmt);
  } else if (bu === 'Simply Seated') {
    commPct = 0.10;
    earnings = r(gross * 0.10);
  } else if (bu === 'ASC') {
    if (dealType === 'Direct Customer') {
      commPct = 0.14;
      earnings = r(mrr * termMonths * 0.14);
    } else {
      commPct = 0.08;
      earnings = r(mrr * Math.min(termMonths, 36) * 0.08);
    }
  }

  return { gross, mrr, probability, forecast_category, weighted, commPct, earnings, hasOverride };
}

const emptyForm = {
  deal_name: '',
  account_id: '',
  business_unit: '',
  stage: 'Prospect',
  deal_type: 'Direct Customer',
  close_date: '',
  contract_term_months: '',
  lead_source: '',
  next_action: '',
  next_action_date: '',
  description: '',
  commission_override_amount: '',
};

export default function DealForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const isEdit = !!id;

  const [form, setForm] = useState(emptyForm);
  const [lineItems, setLineItems] = useState([]);
  const [contactRoles, setContactRoles] = useState([]);
  const [noteContent, setNoteContent] = useState('');

  const [accounts, setAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [products, setProducts] = useState([]);
  const [accountSearch, setAccountSearch] = useState('');

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [buLocked, setBuLocked] = useState(false);

  useEffect(() => {
    productsApi.getAll({ is_active: 1 }).then(res => setProducts(res.data.data || [])).catch(() => {});
    accountsApi.getAll().then(res => setAccounts(res.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      dealsApi.getById(id).then(res => {
        const d = res.data.data;
        setForm({
          deal_name: d.deal_name || '',
          account_id: d.account_id ? String(d.account_id) : '',
          business_unit: d.business_unit || '',
          stage: d.stage || 'Prospect',
          deal_type: d.deal_type || 'Direct Customer',
          close_date: d.close_date || '',
          contract_term_months: d.contract_term_months != null ? String(d.contract_term_months) : '',
          lead_source: d.lead_source || '',
          next_action: d.next_action || '',
          next_action_date: d.next_action_date || '',
          description: d.description || '',
          commission_override_amount: d.commission_override_amount != null ? String(d.commission_override_amount) : '',
        });
        setLineItems((d.line_items || []).map(item => ({
          product_id: item.product_id || null,
          product_name: item.product_name || '',
          sku: item.sku || '',
          description: item.description || '',
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          unit_type: item.unit_type || '',
          is_recurring: !!item.is_recurring,
          commission_pct: item.commission_pct,
        })));
        setContactRoles((d.contacts || []).map(c => ({ contact_id: String(c.id), role: c.role || 'Primary' })));
        if (d.account_id) {
          setAccountSearch(d.account_name || '');
          loadContactsForAccount(d.account_id);
        }
      }).catch(() => addToast('Failed to load deal', 'error'))
        .finally(() => setLoading(false));
    } else {
      const buParam = searchParams.get('business_unit');
      const accountIdParam = searchParams.get('account_id');
      if (buParam) {
        setForm(f => ({ ...f, business_unit: buParam }));
        setBuLocked(true);
      }
      if (accountIdParam) {
        setForm(f => ({ ...f, account_id: accountIdParam }));
        loadContactsForAccount(accountIdParam);
      }
    }
  }, [id]);

  const loadContactsForAccount = (accountId) => {
    if (!accountId) { setContacts([]); return; }
    contactsApi.getAll({ account_id: accountId })
      .then(res => setContacts(res.data.data || []))
      .catch(() => setContacts([]));
  };

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleAccountChange = (accountId) => {
    const acct = accounts.find(a => String(a.id) === String(accountId));
    setForm(f => ({ ...f, account_id: accountId }));
    setContactRoles([]);
    loadContactsForAccount(accountId);
    if (acct) setAccountSearch(acct.name);
  };

  const handleAccountClear = () => {
    setForm(f => ({ ...f, account_id: '' }));
    setAccountSearch('');
    setContacts([]);
    setContactRoles([]);
  };

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.toLowerCase();
    return accounts.filter(a =>
      (!form.business_unit || a.business_unit === form.business_unit || a.business_unit === 'Both') &&
      a.name.toLowerCase().includes(q)
    );
  }, [accounts, accountSearch, form.business_unit]);

  const filteredProducts = useMemo(() =>
    products.filter(p =>
      !form.business_unit || p.business_unit === form.business_unit || p.business_unit === 'Both'
    ),
    [products, form.business_unit]
  );

  const addLineItem = () => {
    setLineItems(prev => [...prev, {
      product_id: null, product_name: '', sku: '', description: '',
      quantity: 1, unit_price: 0, unit_type: '', is_recurring: false, commission_pct: null,
    }]);
  };

  const updateLineItem = (index, key, value) => {
    setLineItems(prev => prev.map((item, i) => i === index ? { ...item, [key]: value } : item));
  };

  const selectProduct = (index, productId) => {
    const product = products.find(p => String(p.id) === String(productId));
    if (!product) {
      updateLineItem(index, 'product_id', null);
      return;
    }
    setLineItems(prev => prev.map((item, i) => i !== index ? item : {
      ...item,
      product_id: product.id,
      product_name: product.name,
      sku: product.sku || '',
      description: item.description || product.description || '',
      unit_price: product.unit_price,
      unit_type: product.unit_type || '',
      is_recurring: !!product.is_recurring,
      commission_pct: product.default_commission_pct,
    }));
  };

  const removeLineItem = (index) => setLineItems(prev => prev.filter((_, i) => i !== index));

  const addContactRole = () => {
    const available = contacts.filter(c => !contactRoles.some(cr => String(cr.contact_id) === String(c.id)));
    if (available.length === 0) return;
    setContactRoles(prev => [...prev, { contact_id: String(available[0].id), role: 'Primary' }]);
  };

  const updateContactRole = (index, key, value) => {
    setContactRoles(prev => prev.map((cr, i) => i === index ? { ...cr, [key]: value } : cr));
  };

  const removeContactRole = (index) => setContactRoles(prev => prev.filter((_, i) => i !== index));

  const financials = useMemo(() => calcFinancials(form, lineItems), [form, lineItems]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        account_id: form.account_id ? Number(form.account_id) : null,
        contract_term_months: form.contract_term_months ? Number(form.contract_term_months) : null,
        commission_override_amount: form.commission_override_amount !== '' ? form.commission_override_amount : null,
        line_items: lineItems.map(item => ({
          product_id: item.product_id || null,
          product_name: item.product_name,
          description: item.description || null,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          unit_type: item.unit_type || null,
          is_recurring: item.is_recurring,
          commission_pct: item.commission_pct,
        })),
        contact_roles: contactRoles.map(cr => ({
          contact_id: Number(cr.contact_id),
          role: cr.role,
        })),
      };

      let dealId;
      if (isEdit) {
        await dealsApi.update(id, payload);
        dealId = id;
        addToast('Deal updated', 'success');
      } else {
        const res = await dealsApi.create(payload);
        dealId = res.data.data.id;
        addToast('Deal created', 'success');
      }

      navigate(`/deals/${dealId}`);
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save deal', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-slate-400 font-opensans text-sm">Loading…</div>;
  }

  const isASC = form.business_unit === 'ASC';
  const isSS = form.business_unit === 'Simply Seated';

  const inputCls = 'w-full px-3 py-2 text-base sm:text-sm min-h-[44px] sm:min-h-0 border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 bg-white';
  const labelCls = 'block text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide mb-1';
  const readonlyCls = 'w-full px-3 py-2 text-base sm:text-sm min-h-[44px] sm:min-h-0 border border-slate-100 rounded font-opensans bg-slate-50 text-slate-600';

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate(isEdit ? `/deals/${id}` : '/deals')}
          className="text-arkalon-blue text-sm hover:underline font-opensans">
          ← {isEdit ? 'Back to Deal' : 'Deals'}
        </button>
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">
          {isEdit ? `Edit: ${form.deal_name || 'Deal'}` : 'New Deal'}
        </h2>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        <div className="flex-1 min-w-0 space-y-4">

          {/* Section 1 — Deal Details */}
          <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
              <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Deal Details</h3>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div className="col-span-2">
                <label className={labelCls}>Deal Name *</label>
                <input className={inputCls} value={form.deal_name}
                  onChange={e => setField('deal_name', e.target.value)} required />
              </div>

              <div>
                <label className={labelCls}>Business Unit *</label>
                <select className={inputCls} value={form.business_unit}
                  onChange={e => { setField('business_unit', e.target.value); setContactRoles([]); }}
                  required disabled={buLocked}>
                  <option value="">— Select —</option>
                  {BUSINESS_UNITS.map(bu => <option key={bu}>{bu}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Account</label>
                {form.account_id ? (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans bg-slate-50 text-slate-700 truncate">
                      {accountSearch || `Account #${form.account_id}`}
                    </span>
                    <button type="button" onClick={handleAccountClear}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition-colors border border-arkalon-lightgrey rounded">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      className={inputCls}
                      placeholder="Search accounts…"
                      value={accountSearch}
                      onChange={e => setAccountSearch(e.target.value)}
                      list="account-list"
                    />
                    <datalist id="account-list">
                      {filteredAccounts.map(a => (
                        <option key={a.id} value={a.name} data-id={a.id} />
                      ))}
                    </datalist>
                    {accountSearch && filteredAccounts.length > 0 && (
                      <div className="mt-1 border border-arkalon-lightgrey rounded bg-white shadow-sm max-h-40 overflow-y-auto z-10">
                        {filteredAccounts.filter(a => a.name.toLowerCase().includes(accountSearch.toLowerCase())).slice(0, 8).map(a => (
                          <button key={a.id} type="button"
                            className="w-full text-left px-3 py-2 text-sm font-opensans hover:bg-blue-50 transition-colors"
                            onClick={() => handleAccountChange(String(a.id))}>
                            {a.name}
                            <span className="ml-2 text-xs text-slate-400">{a.business_unit}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className={labelCls}>Stage *</label>
                <select className={inputCls} value={form.stage}
                  onChange={e => setField('stage', e.target.value)} required>
                  {DEAL_STAGES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Close Date *</label>
                <input type="date" className={inputCls} value={form.close_date}
                  onChange={e => setField('close_date', e.target.value)} required />
              </div>

              {isASC && (
                <div>
                  <label className={labelCls}>Deal Type *</label>
                  <select className={inputCls} value={form.deal_type}
                    onChange={e => setField('deal_type', e.target.value)}>
                    {DEAL_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              )}

              {isASC && (
                <div>
                  <label className={labelCls}>Contract Term (months)</label>
                  <input type="number" min="1" className={inputCls} value={form.contract_term_months}
                    onChange={e => setField('contract_term_months', e.target.value)}
                    placeholder="e.g. 36" />
                </div>
              )}

              <div>
                <label className={labelCls}>Probability</label>
                <div className={readonlyCls}>{financials.probability}%</div>
              </div>

              <div>
                <label className={labelCls}>Forecast Category</label>
                <div className={readonlyCls}>{financials.forecast_category}</div>
              </div>

              <div>
                <label className={labelCls}>Lead Source</label>
                <select className={inputCls} value={form.lead_source}
                  onChange={e => setField('lead_source', e.target.value)}>
                  <option value="">— Select —</option>
                  {LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Next Action</label>
                <input className={inputCls} value={form.next_action}
                  onChange={e => setField('next_action', e.target.value)} />
              </div>

              <div>
                <label className={labelCls}>Next Action Date</label>
                <input type="date" className={inputCls} value={form.next_action_date}
                  onChange={e => setField('next_action_date', e.target.value)} />
              </div>

              <div>
                <label className={labelCls}>Commission Override ($)</label>
                <input type="number" min="0" step="0.01" className={inputCls}
                  value={form.commission_override_amount}
                  onChange={e => setField('commission_override_amount', e.target.value)}
                  placeholder="Leave blank to auto-calculate" />
                <p className="text-xs text-slate-400 font-opensans mt-1">
                  Leave blank to auto-calculate from line items. If set, overrides all percentage-based calculation.
                </p>
              </div>

              <div className="col-span-2">
                <label className={labelCls}>Description</label>
                <textarea rows={3} className={inputCls} value={form.description}
                  onChange={e => setField('description', e.target.value)} />
              </div>

            </div>
          </div>

          {/* Section 2 — Linked Contacts */}
          <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey flex items-center justify-between">
              <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Linked Contacts</h3>
              {form.account_id && contacts.length > 0 && (
                <Button type="button" size="sm" variant="secondary" onClick={addContactRole}>
                  <Plus className="w-3 h-3" /> Add Contact
                </Button>
              )}
            </div>
            <div className="p-4">
              {!form.account_id ? (
                <p className="text-sm text-slate-400 font-opensans">Select an account to link contacts.</p>
              ) : contacts.length === 0 ? (
                <p className="text-sm text-slate-400 font-opensans">No contacts found for this account.</p>
              ) : contactRoles.length === 0 ? (
                <p className="text-sm text-slate-400 font-opensans">
                  No contacts linked.{' '}
                  <button type="button" onClick={addContactRole} className="text-arkalon-blue hover:underline">Add one</button>
                </p>
              ) : (
                <div className="space-y-2">
                  {contactRoles.map((cr, idx) => {
                    const contact = contacts.find(c => String(c.id) === String(cr.contact_id));
                    const availableContacts = contacts.filter(c =>
                      String(c.id) === String(cr.contact_id) ||
                      !contactRoles.some((r2, j) => j !== idx && String(r2.contact_id) === String(c.id))
                    );
                    return (
                      <div key={idx} className="flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <select className={`${inputCls} sm:flex-1`} value={cr.contact_id}
                          onChange={e => updateContactRole(idx, 'contact_id', e.target.value)}>
                          {availableContacts.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.first_name} {c.last_name}{c.title ? ` — ${c.title}` : ''}
                            </option>
                          ))}
                        </select>
                        <select className={`${inputCls} w-full sm:w-44`} value={cr.role}
                          onChange={e => updateContactRole(idx, 'role', e.target.value)}>
                          {CONTACT_ROLES.map(role => <option key={role}>{role}</option>)}
                        </select>
                        <button type="button" onClick={() => removeContactRole(idx)}
                          className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Section 3 — Line Items */}
          <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
              <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Line Items</h3>
            </div>
            <div className="p-4">
              {lineItems.length > 0 && (
                <div className="overflow-x-auto mb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-arkalon-lightgrey">
                        <th className="text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3 w-48">Product</th>
                        <th className="text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">Description</th>
                        <th className="text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3 w-20">Qty</th>
                        <th className="text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3 w-28">Unit Price</th>
                        <th className="text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3 w-28">Unit Type</th>
                        <th className="text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3 w-24">Recurring</th>
                        <th className="text-right text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3 w-28">Line Total</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, idx) => {
                        const lineTotal = r((Number(item.quantity) || 0) * (Number(item.unit_price) || 0));
                        const hasProduct = !!item.product_id;
                        return (
                          <tr key={idx} className="border-b border-slate-100">
                            <td className="py-2 pr-3">
                              <select
                                className="w-full px-2 py-1.5 text-xs border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-1 focus:ring-arkalon-blue/30 bg-white"
                                value={item.product_id || ''}
                                onChange={e => selectProduct(idx, e.target.value)}
                              >
                                <option value="">Custom item</option>
                                {filteredProducts.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 pr-3">
                              <input
                                className="w-full px-2 py-1.5 text-xs border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-1 focus:ring-arkalon-blue/30"
                                value={item.description}
                                onChange={e => updateLineItem(idx, 'description', e.target.value)}
                                placeholder="Description"
                              />
                            </td>
                            <td className="py-2 pr-3">
                              <input
                                type="number" min="0" step="1"
                                className="w-full px-2 py-1.5 text-xs border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-1 focus:ring-arkalon-blue/30"
                                value={item.quantity}
                                onChange={e => updateLineItem(idx, 'quantity', e.target.value)}
                              />
                            </td>
                            <td className="py-2 pr-3">
                              <input
                                type="number" min="0" step="0.01"
                                className="w-full px-2 py-1.5 text-xs border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-1 focus:ring-arkalon-blue/30"
                                value={item.unit_price}
                                onChange={e => updateLineItem(idx, 'unit_price', e.target.value)}
                              />
                            </td>
                            <td className="py-2 pr-3">
                              <span className="text-xs text-slate-500 font-opensans">{item.unit_type || '—'}</span>
                            </td>
                            <td className="py-2 pr-3">
                              {hasProduct ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-montserrat font-semibold ${item.is_recurring ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {item.is_recurring ? 'Recurring' : 'One-off'}
                                </span>
                              ) : (
                                <input type="checkbox" checked={item.is_recurring}
                                  onChange={e => updateLineItem(idx, 'is_recurring', e.target.checked)}
                                  className="rounded border-arkalon-lightgrey" />
                              )}
                            </td>
                            <td className="py-2 pr-3 text-right">
                              <span className="text-xs font-opensans font-semibold text-slate-700">
                                {formatCurrency(lineTotal)}
                              </span>
                            </td>
                            <td className="py-2">
                              <button type="button" onClick={() => removeLineItem(idx)}
                                className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <Button type="button" size="sm" variant="secondary" onClick={addLineItem}>
                <Plus className="w-3 h-3" /> Add Line Item
              </Button>
            </div>
          </div>

          {/* Section 4 — Notes */}
          <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
              <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Note (optional)</h3>
            </div>
            <div className="p-4">
              <textarea rows={3} className={inputCls} value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Add a note about this deal…" />
            </div>
          </div>

        </div>

        {/* Financial Summary Panel */}
        <div className="w-full lg:w-72 lg:flex-shrink-0 lg:sticky lg:top-4">
          <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
              <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Deal Financials</h3>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex justify-between text-sm font-opensans">
                <span className="text-slate-500">Gross Value</span>
                <span className="font-semibold text-slate-800">{formatCurrency(financials.gross)}</span>
              </div>
              {isASC && (
                <>
                  <div className="flex justify-between text-sm font-opensans">
                    <span className="text-slate-500">MRR</span>
                    <span className="font-semibold text-slate-800">{formatMrr(financials.mrr)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-opensans">
                    <span className="text-slate-500">Contract Term</span>
                    <span className="font-semibold text-slate-800">
                      {form.contract_term_months ? `${form.contract_term_months} months` : '—'}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm font-opensans">
                <span className="text-slate-500">Weighted Value</span>
                <span className="font-semibold text-slate-800">{formatCurrency(financials.weighted)}</span>
              </div>
              <hr className="border-arkalon-lightgrey my-3" />
              {financials.hasOverride ? (
                <div className="flex justify-between text-sm font-opensans">
                  <span className="text-slate-500">Commission (Override)</span>
                </div>
              ) : (
                <div className="flex justify-between text-sm font-opensans">
                  <span className="text-slate-500">Commission Rate</span>
                  <span className="font-semibold text-slate-800">
                    {financials.commPct != null ? `${Math.round(financials.commPct * 100)}%` : '—'}
                  </span>
                </div>
              )}
              <div className="pt-1">
                <div className="text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide mb-1">Stuart's Commission</div>
                <div className="text-2xl font-montserrat font-bold" style={{ color: '#0073C6' }}>
                  {formatCurrency(financials.earnings)}
                </div>
              </div>
              {lineItems.length === 0 && (
                <p className="text-xs text-slate-400 font-opensans mt-2">
                  No line items — add products to calculate commission.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-white border-t border-arkalon-lightgrey mt-6 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
        <Button type="button" variant="secondary" onClick={() => navigate(isEdit ? `/deals/${id}` : '/deals')} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0">
          Cancel
        </Button>
        <Button type="submit" disabled={saving} className="w-full sm:w-auto justify-center min-h-[44px] sm:min-h-0">
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Deal'}
        </Button>
      </div>
    </form>
  );
}
