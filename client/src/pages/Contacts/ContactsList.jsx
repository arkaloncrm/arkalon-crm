import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import EmptyState from '../../components/UI/EmptyState.jsx';
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx';
import { contactsApi } from '../../api/contacts.js';
import { accountsApi } from '../../api/accounts.js';
import { useToast } from '../../context/ToastContext.jsx';
import { BUSINESS_UNITS } from '../../utils/constants.js';
import { formatDate } from '../../utils/formatDate.js';

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
};

const PAGE_SIZE = 25;

export default function ContactsList() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);

  const [search, setSearch] = useState('');
  const [buFilter, setBuFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [page, setPage] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    accountsApi.getAll().then(res => setAccounts(res.data.data || [])).catch(() => {});
  }, []);

  const fetchContacts = useCallback(() => {
    setLoading(true);
    const params = {};
    if (buFilter) params.business_unit = buFilter;
    if (accountFilter) params.account_id = accountFilter;
    if (search) params.search = search;

    contactsApi.getAll(params)
      .then(res => { setContacts(res.data.data || []); setPage(1); })
      .catch(() => addToast('Failed to load contacts', 'error'))
      .finally(() => setLoading(false));
  }, [search, buFilter, accountFilter]);

  useEffect(() => {
    const t = setTimeout(fetchContacts, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchContacts, search]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await contactsApi.delete(deleteTarget.id);
      addToast('Contact deleted', 'success');
      setDeleteTarget(null);
      setSelectedIds([]);
      fetchContacts();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.length} record(s)? This cannot be undone.`)) return;
    // allSettled — attempt every delete even if one fails; always refresh afterwards
    const outcomes = await Promise.allSettled(selectedIds.map(id => contactsApi.delete(id)));
    const deleted = outcomes.filter(o => o.status === 'fulfilled').length;
    const failed = outcomes.length - deleted;
    setSelectedIds([]);
    fetchContacts();
    if (failed === 0) addToast(`${deleted} record(s) deleted`, 'success');
    else if (deleted === 0) addToast(`Could not delete ${failed} record(s)`, 'error');
    else addToast(`${deleted} deleted · ${failed} could not be deleted`, 'error');
  };

  const filtersActive = buFilter || accountFilter || search;
  const totalPages = Math.ceil(contacts.length / PAGE_SIZE);
  const paginated = contacts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const start = contacts.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, contacts.length);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Contacts</h2>
          <span className="bg-slate-100 text-slate-500 text-xs font-montserrat font-semibold px-2 py-0.5 rounded-full">{contacts.length}</span>
        </div>
        <Button onClick={() => navigate('/contacts/new')}>+ New Contact</Button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts..."
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 w-56"
        />
        <select
          value={buFilter}
          onChange={e => setBuFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
        >
          <option value="">All Business Units</option>
          {BUSINESS_UNITS.map(bu => <option key={bu}>{bu}</option>)}
        </select>
        <select
          value={accountFilter}
          onChange={e => setAccountFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
        >
          <option value="">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {filtersActive && (
          <button onClick={() => { setSearch(''); setBuFilter(''); setAccountFilter(''); }} className="text-xs text-arkalon-blue hover:underline font-opensans">
            Clear filters
          </button>
        )}
        {selectedIds.length > 0 && (
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
          >
            <Trash2 size={14} />
            Delete {selectedIds.length} selected
          </button>
        )}
      </div>

      <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : contacts.length === 0 ? (
          <EmptyState title="No contacts yet" description="Create your first contact to start building relationships." action={() => navigate('/contacts/new')} actionLabel="Create your first contact" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-arkalon-lightgrey">
              <tr>
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selectedIds.length === contacts.length && contacts.length > 0}
                    onChange={(e) => setSelectedIds(e.target.checked ? contacts.map(r => r.id) : [])}
                  />
                </th>
                {['Name', 'Account', 'Business Unit', 'Title', 'Email', 'Phone', 'Created', 'Actions'].map(col => (
                  <th key={col} className="px-3 py-2.5 text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((contact, idx) => (
                <tr key={contact.id} className={`border-b border-arkalon-lightgrey h-11 hover:bg-blue-50/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}>
                  <td className="px-3">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedIds.includes(contact.id)}
                      onChange={(e) => setSelectedIds(prev =>
                        e.target.checked ? [...prev, contact.id] : prev.filter(id => id !== contact.id)
                      )}
                    />
                  </td>
                  <td className="px-3 whitespace-nowrap">
                    <button onClick={() => navigate(`/contacts/${contact.id}`)} className="font-semibold text-arkalon-blue hover:underline font-opensans text-sm">
                      {contact.first_name} {contact.last_name}
                    </button>
                  </td>
                  <td className="px-3 font-opensans text-slate-600 whitespace-nowrap">
                    {contact.account_name ? (
                      <button onClick={() => navigate(`/accounts/${contact.account_id}`)} className="text-arkalon-blue hover:underline">
                        {contact.account_name}
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-3">
                    {contact.business_unit && <Badge className={BU_COLOURS[contact.business_unit] || 'bg-gray-100 text-gray-600'}>{contact.business_unit}</Badge>}
                  </td>
                  <td className="px-3 text-slate-600 font-opensans whitespace-nowrap">{contact.title || '—'}</td>
                  <td className="px-3 text-slate-600 font-opensans">{contact.email || '—'}</td>
                  <td className="px-3 text-slate-600 font-opensans whitespace-nowrap">{contact.phone || '—'}</td>
                  <td className="px-3 text-slate-500 font-opensans whitespace-nowrap">{formatDate(contact.created_at)}</td>
                  <td className="px-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => navigate(`/contacts/${contact.id}/edit`)} className="p-1 text-slate-400 hover:text-arkalon-blue transition-colors" title="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(contact)} className="p-1 text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {contacts.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-slate-500 font-opensans">Showing {start}–{end} of {contacts.length}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs font-opensans border border-arkalon-lightgrey rounded bg-white hover:bg-slate-50 disabled:opacity-40">Prev</button>
            <span className="text-xs text-slate-600 font-opensans">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-xs font-opensans border border-arkalon-lightgrey rounded bg-white hover:bg-slate-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Contact?"
        message={`Delete "${deleteTarget?.first_name} ${deleteTarget?.last_name}"? This action cannot be undone.`}
        loading={deleteLoading}
      />
    </div>
  );
}
