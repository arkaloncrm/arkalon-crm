import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Briefcase } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx';
import { productsApi } from '../../api/products.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatCurrency, formatPercentage } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
  'Both': 'bg-gray-100 text-gray-600',
};

function FieldRow({ label, value }) {
  return (
    <div className="flex py-2 border-b border-slate-100 last:border-0">
      <span className="w-44 flex-shrink-0 text-xs text-slate-400 font-opensans uppercase tracking-wide pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 font-opensans flex-1">{(value === null || value === undefined || value === '') ? '—' : value}</span>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden mb-4">
      <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">{title}</h3>
      </div>
      <div className="px-4 py-1">{children}</div>
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    productsApi.getById(id)
      .then(res => setProduct(res.data.data))
      .catch(() => addToast('Failed to load product', 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await productsApi.delete(id);
      addToast('Product deleted', 'success');
      navigate('/products');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete product';
      addToast(msg.includes('Cannot delete')
        ? 'This product is used in existing deals and cannot be deleted.'
        : msg, 'error');
      setShowDelete(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) return <div className="space-y-3"><div className="h-10 bg-slate-100 rounded animate-pulse w-1/3" /><div className="h-64 bg-slate-100 rounded animate-pulse" /></div>;
  if (!product) return <div className="text-slate-500 font-opensans text-sm">Product not found.</div>;

  const dealCount = product.deal_count || 0;

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <button onClick={() => navigate('/products')} className="flex items-center gap-1 text-arkalon-blue text-sm hover:underline font-opensans mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Products
          </button>
          <h2 className="font-montserrat font-bold text-arkalon-navy text-2xl">{product.name}</h2>
          <p className="text-slate-500 font-opensans text-sm mt-0.5 font-mono">{product.sku || 'No SKU'}</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/products/${id}/edit`)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg px-4 py-3 mb-4 flex items-center gap-6 flex-wrap">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Unit Price</span>
          <span className="text-sm font-opensans text-slate-700 font-semibold">{formatCurrency(product.unit_price)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Business Unit</span>
          <Badge className={`${BU_COLOURS[product.business_unit] || 'bg-gray-100'} mt-0.5`}>{product.business_unit}</Badge>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Status</span>
          <Badge className={`${product.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'} mt-0.5`}>
            {product.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => navigate(`/deals?product_id=${id}`)}
            className="flex items-center gap-2 text-arkalon-blue hover:underline font-opensans"
          >
            <Briefcase className="w-4 h-4" />
            <span className="text-sm font-semibold">Used in {dealCount} deal{dealCount === 1 ? '' : 's'}</span>
          </button>
        </div>
      </div>

      {/* Two-column */}
      <div className="grid grid-cols-2 gap-4">
        <SectionCard title="Product Information">
          <FieldRow label="Product Name" value={product.name} />
          <FieldRow label="SKU" value={product.sku} />
          <FieldRow label="Category" value={product.category} />
          <FieldRow label="Business Unit" value={product.business_unit} />
          <FieldRow label="Unit Type" value={product.unit_type} />
          {product.description && (
            <div className="py-2">
              <span className="text-xs text-slate-400 font-opensans uppercase tracking-wide block mb-1">Description</span>
              <p className="text-sm font-opensans text-slate-700 whitespace-pre-wrap">{product.description}</p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Pricing & Commission">
          <FieldRow label="Unit Price" value={formatCurrency(product.unit_price)} />
          <FieldRow label="Default Commission" value={product.default_commission_pct != null ? formatPercentage(product.default_commission_pct) : null} />
          <FieldRow label="Recurring" value={product.is_recurring ? 'Yes' : 'No'} />
          <FieldRow label="Active" value={product.is_active ? 'Yes' : 'No'} />
          <FieldRow label="Created" value={formatDate(product.created_at)} />
          <FieldRow label="Last Updated" value={formatDate(product.updated_at)} />
        </SectionCard>
      </div>

      {product.notes && (
        <SectionCard title="Internal Notes">
          <p className="text-sm font-opensans text-slate-700 whitespace-pre-wrap py-2">{product.notes}</p>
        </SectionCard>
      )}

      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Product"
        message={`Delete "${product.name}"? This cannot be undone.`}
        loading={deleteLoading}
      />
    </div>
  );
}
