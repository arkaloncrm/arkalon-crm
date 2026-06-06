import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2, Copy } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import SearchBar from '../../components/UI/SearchBar.jsx';
import EmptyState from '../../components/UI/EmptyState.jsx';
import Badge from '../../components/UI/Badge.jsx';
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx';
import MobileCard, { CardAction } from '../../components/UI/MobileCard.jsx';
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/UI/Table.jsx';
import { BUSINESS_UNITS } from '../../utils/constants.js';
import { formatCurrency, formatPercentage } from '../../utils/formatCurrency.js';
import { productsApi } from '../../api/products.js';
import { useToast } from '../../context/ToastContext.jsx';

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
  'Both': 'bg-gray-100 text-gray-600',
};

export default function ProductsList() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [buFilter, setBuFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const loadProducts = () => {
    setLoading(true);
    productsApi.getAll()
      .then(res => setProducts(res.data.data || []))
      .catch(() => addToast('Failed to load products', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadProducts(); }, []);

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();

  const records = products.filter(p => {
    if (buFilter && p.business_unit !== buFilter) return false;
    if (categoryFilter && p.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (p.name?.toLowerCase() || '').includes(q) || (p.sku?.toLowerCase() || '').includes(q);
    }
    return true;
  });

  const ascCount = products.filter(p => p.business_unit === 'ASC').length;
  const ssCount = products.filter(p => p.business_unit === 'Simply Seated').length;
  const bothCount = products.filter(p => p.business_unit === 'Both').length;
  const breakdown = [`${ascCount} ASC`, `${ssCount} Simply Seated`]
    .concat(bothCount > 0 ? [`${bothCount} Both`] : [])
    .join(' · ');

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await productsApi.delete(deleteTarget.id);
      addToast('Product deleted', 'success');
      setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete product';
      if (msg.includes('Cannot delete')) {
        addToast('This product is used in existing deals and cannot be deleted.', 'error');
      } else {
        addToast(msg, 'error');
      }
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleToggleActive = async (product) => {
    setBusyId(product.id);
    // Optimistic flip — reverted on failure
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_active: p.is_active ? 0 : 1 } : p));
    try {
      await productsApi.toggleActive(product.id);
    } catch {
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_active: product.is_active } : p));
      addToast('Failed to update product status', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (product) => {
    setBusyId(product.id);
    try {
      await productsApi.duplicate(product.id);
      addToast(`Duplicated "${product.name}"`, 'success');
      loadProducts();
    } catch {
      addToast('Failed to duplicate product', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const emptyTitle = buFilter
    ? `No ${buFilter} products yet`
    : 'No products yet';
  const emptyDescription = buFilter
    ? `Add your first ${buFilter} product to the catalogue.`
    : 'Define your product catalogue for use in deals.';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Products</h2>
          <span className="bg-slate-100 text-slate-500 text-xs font-montserrat font-semibold px-2 py-0.5 rounded-full">{records.length}</span>
        </div>
        <Button onClick={() => navigate('/products/new')}>+ New Product</Button>
      </div>
      <p className="text-arkalon-grey text-sm font-opensans mb-4">
        {products.length} product{products.length === 1 ? '' : 's'} ({breakdown})
      </p>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchBar value={search} onChange={setSearch} placeholder="Search name or SKU…" className="w-64" />
        <select value={buFilter} onChange={e => setBuFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
          <option value="">All Business Units</option>
          {[...BUSINESS_UNITS, 'Both'].map(bu => <option key={bu}>{bu}</option>)}
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="bg-white border border-arkalon-lightgrey rounded-lg py-12 text-center text-slate-400 font-opensans text-sm">Loading…</div>
      ) : records.length === 0 ? (
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={() => navigate('/products/new')}
            actionLabel="+ New Product"
          />
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="sm:hidden space-y-3">
            {records.map(r => (
              <MobileCard key={r.id} onClick={() => navigate(`/products/${r.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-arkalon-blue font-opensans text-sm truncate">{r.name}</span>
                  <Badge className={`${BU_COLOURS[r.business_unit] || 'bg-gray-100 text-gray-600'} flex-shrink-0`}>{r.business_unit}</Badge>
                </div>
                {r.sku && <div className="text-xs font-mono text-slate-400 mt-0.5 truncate">{r.sku}</div>}
                <div className="flex items-center justify-between gap-2 mt-2">
                  <span className="text-sm font-opensans font-semibold text-slate-700">{formatCurrency(r.unit_price, 2)}</span>
                  <span className="text-xs text-slate-500 font-opensans">{r.unit_type || '—'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <Badge className={r.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Badge className={r.is_recurring ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                    {r.is_recurring ? 'Recurring' : 'One-off'}
                  </Badge>
                </div>
                <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-slate-100">
                  <CardAction label="Edit" onClick={() => navigate(`/products/${r.id}/edit`)}>
                    <Pencil className="w-4 h-4" />
                  </CardAction>
                  <CardAction label="Duplicate" onClick={() => handleDuplicate(r)}>
                    <Copy className="w-4 h-4" />
                  </CardAction>
                  <CardAction label="Delete" danger onClick={() => setDeleteTarget(r)}>
                    <Trash2 className="w-4 h-4" />
                  </CardAction>
                </div>
              </MobileCard>
            ))}
          </div>
          {/* Desktop: table */}
          <div className="hidden sm:block bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th>Name</Th>
                <Th>SKU</Th>
                <Th>Category</Th>
                <Th>Business Unit</Th>
                <Th>Unit Price</Th>
                <Th>Commission</Th>
                <Th>Unit Type</Th>
                <Th>Recurring</Th>
                <Th>Active</Th>
                <Th></Th>
              </tr>
            </Thead>
            <Tbody>
              {records.map(r => (
                <Tr key={r.id} onClick={() => navigate(`/products/${r.id}`)}>
                  <Td className="font-semibold text-arkalon-blue">{r.name}</Td>
                  <Td className="font-mono text-xs text-slate-500">{r.sku || '—'}</Td>
                  <Td className="text-slate-600">{r.category || '—'}</Td>
                  <Td>
                    <Badge className={BU_COLOURS[r.business_unit] || 'bg-gray-100 text-gray-600'}>
                      {r.business_unit}
                    </Badge>
                  </Td>
                  <Td>{formatCurrency(r.unit_price, 2)}</Td>
                  <Td className="text-slate-600">{r.default_commission_pct != null ? formatPercentage(r.default_commission_pct) : '—'}</Td>
                  <Td className="text-slate-500">{r.unit_type || '—'}</Td>
                  <Td>
                    <Badge className={r.is_recurring ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                      {r.is_recurring ? 'Yes' : 'No'}
                    </Badge>
                  </Td>
                  <Td>
                    <div onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleToggleActive(r)}
                        disabled={busyId === r.id}
                        title="Click to toggle"
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold transition-colors disabled:opacity-50
                          ${r.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                      >
                        {r.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => navigate(`/products/${r.id}/edit`)}
                        title="Edit"
                        className="p-1 text-slate-400 hover:text-arkalon-blue transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDuplicate(r)} disabled={busyId === r.id}
                        title="Duplicate"
                        className="p-1 text-slate-400 hover:text-arkalon-blue transition-colors disabled:opacity-50">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(r)}
                        title="Delete"
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Product"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
