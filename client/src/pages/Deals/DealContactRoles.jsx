import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, Search } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Modal from '../../components/UI/Modal.jsx';
import { dealsApi } from '../../api/deals.js';
import { contactsApi } from '../../api/contacts.js';
import { useToast } from '../../context/ToastContext.jsx';
import { CONTACT_ROLES } from '../../utils/constants.js';

function contactName(c, fallbackId) {
  return `${c.first_name || ''} ${c.last_name || ''}`.trim() || `Contact #${fallbackId}`;
}

function AddContactModal({ isOpen, onClose, dealId, accountId, linkedIds, onAdded }) {
  const { addToast } = useToast();
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setLoading(true);
    // A deal's account constrains which contacts may be linked.
    contactsApi.getAll(accountId ? { account_id: accountId } : {})
      .then(res => setContacts(res.data.data || []))
      .catch(() => addToast('Failed to load contacts', 'error'))
      .finally(() => setLoading(false));
  }, [isOpen, accountId]);

  const available = contacts.filter(c => {
    if (linkedIds.includes(c.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(q)
      || (c.email || '').toLowerCase().includes(q);
  });

  const handleAdd = async (contact) => {
    setAddingId(contact.id);
    try {
      await dealsApi.addContact(dealId, { contact_id: contact.id, role: 'Primary' });
      addToast('Contact linked', 'success');
      onAdded();
      onClose();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to link contact', 'error');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Contact to Deal" size="md">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          autoFocus
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
        />
      </div>
      {loading ? (
        <p className="text-sm text-slate-400 font-opensans text-center py-6">Loading…</p>
      ) : available.length === 0 ? (
        <p className="text-sm text-slate-400 font-opensans text-center py-6">
          {accountId ? 'No more contacts available for this account.' : 'No contacts found.'}
        </p>
      ) : (
        <div className="max-h-72 overflow-y-auto divide-y divide-arkalon-lightgrey">
          {available.map(c => (
            <div key={c.id} className="flex items-center justify-between py-2">
              <div className="min-w-0">
                <div className="text-sm font-opensans font-semibold text-arkalon-navy truncate">
                  {contactName(c, c.id)}
                </div>
                <div className="text-xs text-slate-500 font-opensans truncate">
                  {c.title ? `${c.title} · ` : ''}{c.account_name || 'No account'}
                </div>
              </div>
              <Button size="sm" variant="secondary" disabled={addingId === c.id} onClick={() => handleAdd(c)}>
                {addingId === c.id ? 'Adding…' : 'Add'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// Contact Roles panel for the deal detail page — lists linked contacts with an
// inline role dropdown, plus add/remove against the deal_contacts junction.
export default function DealContactRoles({ dealId, accountId }) {
  const { addToast } = useToast();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => {
    setLoading(true);
    dealsApi.getContacts(dealId)
      .then(res => setContacts(res.data.data || []))
      .catch(() => addToast('Failed to load contact roles', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [dealId]);

  const handleRoleChange = async (contactId, role) => {
    const prev = contacts;
    setContacts(cs => cs.map(c => (c.contact_id === contactId ? { ...c, role } : c)));
    try {
      await dealsApi.updateContactRole(dealId, contactId, role);
      addToast('Role updated', 'success');
    } catch (err) {
      setContacts(prev);
      addToast(err.response?.data?.error || 'Failed to update role', 'error');
    }
  };

  const handleRemove = async (contactId) => {
    const prev = contacts;
    setContacts(cs => cs.filter(c => c.contact_id !== contactId));
    try {
      await dealsApi.removeContact(dealId, contactId);
      addToast('Contact removed from deal', 'success');
    } catch (err) {
      setContacts(prev);
      addToast(err.response?.data?.error || 'Failed to remove contact', 'error');
    }
  };

  return (
    <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden mb-4">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">
          Contact Roles
        </h3>
        <Button size="sm" variant="secondary" onClick={() => setShowAdd(true)}>
          <UserPlus className="w-3.5 h-3.5" /> Add Contact
        </Button>
      </div>
      <div className="px-4 py-2">
        {loading ? (
          <p className="text-sm text-slate-400 font-opensans text-center py-4">Loading…</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-slate-400 font-opensans text-center py-4">
            No contacts linked to this deal. Add one above.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-arkalon-lightgrey">
                {['Contact Name', 'Account', 'Role', ''].map((h, i) => (
                  <th key={i} className="text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide py-2 pr-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.contact_id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-opensans font-semibold text-arkalon-navy">
                    {contactName(c, c.contact_id)}
                  </td>
                  <td className="py-2 pr-3 font-opensans text-slate-600">{c.account_name || '—'}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={c.role || 'Primary'}
                      onChange={e => handleRoleChange(c.contact_id, e.target.value)}
                      className="px-2 py-1 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
                    >
                      {CONTACT_ROLES.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => handleRemove(c.contact_id)}
                      className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                      title="Remove from deal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <AddContactModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        dealId={dealId}
        accountId={accountId}
        linkedIds={contacts.map(c => c.contact_id)}
        onAdded={load}
      />
    </div>
  );
}
