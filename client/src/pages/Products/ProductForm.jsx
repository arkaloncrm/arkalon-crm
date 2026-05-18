import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '../../components/UI/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { productsApi } from '../../api/products.js';
import { UNIT_TYPES, BUSINESS_UNITS } from '../../utils/constants.js';

const emptyForm = {
  name: '',
  sku: '',
  description: '',
  category: '',
  unit_price: '',
  unit_type: '',
  business_unit: '',
  default_commission_pct: '',
  is_recurring: false,
  is_active: true,
  notes: '',
};

export default function ProductForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { addToast } = useToast();
  const isEdit = !!id;

  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [skuError, setSkuError] = useState('');
  const [skuChecking, setSkuChecking] = useState(false);

  useEffect(() => {
    productsApi.getCategories()
      .then(res => setCategories(res.data.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    productsApi.getById(id)
      .then(res => {
        const p = res.data.data;
        const commPct = p.default_commission_pct != null
          ? String(Math.round((p.default_commission_pct > 1 ? p.default_commission_pct : p.default_commission_pct * 100) * 100) / 100)
          : '';
        setForm({
          name: p.name || '',
          sku: p.sku || '',
          description: p.description || '',
          category: p.category || '',
          unit_price: p.unit_price != null ? String(p.unit_price) : '',
          unit_type: p.unit_type || '',
          business_unit: p.business_unit || '',
          default_commission_pct: commPct,
          is_recurring: !!p.is_recurring,
          is_active: p.is_active !== 0,
          notes: p.notes || '',
        });
      })
      .catch(() => addToast('Failed to load product', 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleSkuBlur = async () => {
    const sku = form.sku.trim();
    if (!sku) { setSkuError(''); return; }
    setSkuChecking(true);
    try {
      const res = await productsApi.checkSku(sku, isEdit ? id : undefined);
      setSkuError(res.data.available ? '' : `SKU "${sku}" is already in use`);
    } catch {
      setSkuError('');
    } finally {
      setSkuChecking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (skuError) {
      addToast(skuError, 'error');
      return;
    }
    const commPct = form.default_commission_pct;
    if (commPct !== '' && (Number(commPct) < 0 || Number(commPct) > 100)) {
      addToast('Default Commission % must be between 0 and 100', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        description: form.description || null,
        category: form.category || null,
        unit_price: form.unit_price !== '' ? Number(form.unit_price) : 0,
        unit_type: form.unit_type || null,
        business_unit: form.business_unit,
        default_commission_pct: form.default_commission_pct !== '' ? Number(form.default_commission_pct) : null,
        is_recurring: form.is_recurring,
        is_active: form.is_active,
        notes: form.notes || null,
      };

      if (isEdit) {
        await productsApi.update(id, payload);
        addToast('Product updated', 'success');
      } else {
        await productsApi.create(payload);
        addToast('Product created', 'success');
      }
      navigate('/products');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save product', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-slate-400 font-opensans text-sm">Loading…</div>;
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 bg-white';
  const labelCls = 'block text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide mb-1';

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate('/products')}
          className="text-arkalon-blue text-sm hover:underline font-opensans">
          ← Products
        </button>
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">
          {isEdit ? `Edit: ${form.name || 'Product'}` : 'New Product'}
        </h2>
      </div>

      <div className="max-w-2xl">
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Product Details</h3>
          </div>
          <div className="p-4 grid grid-cols-2 gap-4">

            <div className="col-span-2">
              <label className={labelCls}>Product Name *</label>
              <input className={inputCls} value={form.name}
                onChange={e => setField('name', e.target.value)} required />
            </div>

            <div>
              <label className={labelCls}>SKU *</label>
              <input className={`${inputCls} ${skuError ? 'border-red-400 ring-1 ring-red-200' : ''}`}
                value={form.sku}
                onChange={e => { setField('sku', e.target.value); setSkuError(''); }}
                onBlur={handleSkuBlur}
                required />
              {skuChecking && <p className="text-xs text-slate-400 font-opensans mt-1">Checking SKU…</p>}
              {skuError && <p className="text-xs text-red-600 font-opensans mt-1">{skuError}</p>}
            </div>

            <div>
              <label className={labelCls}>Category</label>
              <input className={inputCls} list="product-categories"
                value={form.category}
                onChange={e => setField('category', e.target.value)}
                placeholder="e.g. Licences, Hardware, Services" />
              <datalist id="product-categories">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div>
              <label className={labelCls}>Business Unit *</label>
              <select className={inputCls} value={form.business_unit}
                onChange={e => setField('business_unit', e.target.value)} required>
                <option value="">— Select —</option>
                {[...BUSINESS_UNITS, 'Both'].map(bu => <option key={bu}>{bu}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Unit Price ($)</label>
              <input type="number" min="0" step="0.01" className={inputCls}
                value={form.unit_price}
                onChange={e => setField('unit_price', e.target.value)}
                placeholder="0.00" />
            </div>

            <div>
              <label className={labelCls}>Unit Type</label>
              <select className={inputCls} value={form.unit_type}
                onChange={e => setField('unit_type', e.target.value)}>
                <option value="">— Select —</option>
                {UNIT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Default Commission % (0–100)</label>
              <input type="number" min="0" max="100" step="0.1" className={inputCls}
                value={form.default_commission_pct}
                onChange={e => setField('default_commission_pct', e.target.value)}
                placeholder="e.g. 14" />
              <p className="text-xs text-slate-400 font-opensans mt-1">Enter as whole number (e.g. 14 for 14%)</p>
            </div>

            <div className="flex items-end gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_recurring}
                  onChange={e => setField('is_recurring', e.target.checked)}
                  className="rounded border-arkalon-lightgrey" />
                <span className="text-sm font-opensans text-slate-700">Recurring</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setField('is_active', e.target.checked)}
                  className="rounded border-arkalon-lightgrey" />
                <span className="text-sm font-opensans text-slate-700">Active</span>
              </label>
            </div>

            <div className="col-span-2">
              <label className={labelCls}>Description</label>
              <textarea rows={3} className={inputCls} value={form.description}
                onChange={e => setField('description', e.target.value)} />
            </div>

            <div className="col-span-2">
              <label className={labelCls}>Internal Notes</label>
              <textarea rows={3} className={inputCls} value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder="Optional internal notes about this product" />
            </div>

          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-4">
          <Button type="button" variant="secondary" onClick={() => navigate('/products')}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Product'}
          </Button>
        </div>
      </div>
    </form>
  );
}
