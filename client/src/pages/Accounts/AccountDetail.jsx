import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, ExternalLink, Plus, X } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx';
import { accountsApi } from '../../api/accounts.js';
import { notesApi } from '../../api/notes.js';
import ActivitiesRelatedTab from '../../components/Activities/ActivitiesRelatedTab.jsx';
import TasksRelatedTab from '../../components/Tasks/TasksRelatedTab.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { STAGE_COLOURS } from '../../utils/constants.js';
import { formatDate, formatDateTime } from '../../utils/formatDate.js';
import { formatCurrency } from '../../utils/formatCurrency.js';

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
};

function FieldRow({ label, value }) {
  return (
    <div className="flex py-2 border-b border-slate-100 last:border-0">
      <span className="w-44 flex-shrink-0 text-xs text-slate-400 font-opensans uppercase tracking-wide pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 font-opensans flex-1">{value || '—'}</span>
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

function NotesTab({ accountId }) {
  const { addToast } = useToast();
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    notesApi.getAll({ account_id: accountId })
      .then(res => setNotes(res.data.data || []))
      .catch(() => {});
  }, [accountId]);

  const handleAdd = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const res = await notesApi.create({ content: newNote, account_id: accountId });
      setNotes(prev => [res.data.data, ...prev]);
      setNewNote('');
    } catch { addToast('Failed to add note', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await notesApi.delete(id);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch { addToast('Failed to delete note', 'error'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={2} placeholder="Add a note…" className="flex-1 px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 resize-none" />
        <Button size="sm" onClick={handleAdd} disabled={saving || !newNote.trim()}><Plus className="w-3.5 h-3.5" /> Add</Button>
      </div>
      {notes.length === 0 && <p className="text-sm text-slate-400 font-opensans text-center py-4">No notes yet</p>}
      {notes.map(note => (
        <div key={note.id} className="bg-white border border-arkalon-lightgrey rounded p-3 flex justify-between gap-2">
          <div>
            <p className="text-sm font-opensans text-slate-700 whitespace-pre-wrap">{note.content}</p>
            <p className="text-xs text-slate-400 font-opensans mt-1">{formatDateTime(note.created_at)} · {note.created_by_name}</p>
          </div>
          <button onClick={() => handleDelete(note.id)} className="text-slate-300 hover:text-red-400 flex-shrink-0 mt-0.5"><X className="w-3.5 h-3.5" /></button>
        </div>
      ))}
    </div>
  );
}

export default function AccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('contacts');
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    accountsApi.getById(id)
      .then(res => setAccount(res.data.data))
      .catch(() => addToast('Failed to load account', 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await accountsApi.delete(id);
      addToast('Account deleted', 'success');
      navigate('/accounts');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete account', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) return <div className="space-y-3"><div className="h-10 bg-slate-100 rounded animate-pulse w-1/3" /><div className="h-64 bg-slate-100 rounded animate-pulse" /></div>;
  if (!account) return <div className="text-slate-500 font-opensans text-sm">Account not found.</div>;

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <button onClick={() => navigate('/accounts')} className="flex items-center gap-1 text-arkalon-blue text-sm hover:underline font-opensans mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Accounts
          </button>
          <h2 className="font-montserrat font-bold text-arkalon-navy text-2xl">{account.name}</h2>
          {account.industry && <p className="text-slate-500 font-opensans text-sm mt-0.5">{account.industry}</p>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/accounts/${id}/edit`)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Business card */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg px-4 py-3 mb-4 flex items-center gap-6 flex-wrap">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Account</span>
          <span className="text-sm font-opensans text-slate-700 font-semibold">{account.name}</span>
        </div>
        {account.industry && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Industry</span>
            <span className="text-sm font-opensans text-slate-700">{account.industry}</span>
          </div>
        )}
        {account.phone && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Phone</span>
            <span className="text-sm font-opensans text-slate-700">{account.phone}</span>
          </div>
        )}
        {account.website && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Website</span>
            <a href={account.website.startsWith('http') ? account.website : `https://${account.website}`} target="_blank" rel="noopener noreferrer" className="text-sm font-opensans text-arkalon-blue hover:underline flex items-center gap-1">
              {account.website} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
        {account.business_unit && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Business Unit</span>
            <Badge className={`${BU_COLOURS[account.business_unit] || 'bg-gray-100'} mt-0.5`}>{account.business_unit}</Badge>
          </div>
        )}
        <div className="ml-auto flex gap-4">
          <div className="text-center">
            <div className="text-lg font-montserrat font-bold text-arkalon-navy">{account.open_deals_count ?? 0}</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Open Deals</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-montserrat font-bold text-arkalon-navy">{formatCurrency(account.total_pipeline_value ?? 0)}</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Pipeline Value</div>
          </div>
        </div>
      </div>

      {/* Two-column */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <SectionCard title="Account Information">
          <FieldRow label="Account Name" value={account.name} />
          <FieldRow label="Website" value={account.website} />
          <FieldRow label="Industry" value={account.industry} />
          <FieldRow label="Employee Count" value={account.employee_count} />
          <FieldRow label="Annual Revenue" value={account.annual_revenue ? formatCurrency(account.annual_revenue) : null} />
          <FieldRow label="Phone" value={account.phone} />
          <FieldRow label="Business Unit" value={account.business_unit} />
          {account.description && (
            <div className="py-2">
              <span className="text-xs text-slate-400 font-opensans uppercase tracking-wide block mb-1">Description</span>
              <p className="text-sm font-opensans text-slate-700 whitespace-pre-wrap">{account.description}</p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Billing Address">
          <FieldRow label="Street" value={account.billing_street} />
          <FieldRow label="City" value={account.billing_city} />
          <FieldRow label="State" value={account.billing_state} />
          <FieldRow label="Postcode" value={account.billing_postcode} />
          <FieldRow label="Country" value={account.billing_country} />
        </SectionCard>
      </div>

      {/* Related lists */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
        <div className="flex border-b border-arkalon-lightgrey">
          {['contacts', 'deals', 'notes', 'activities', 'tasks'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-montserrat font-semibold capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-arkalon-blue text-arkalon-blue' : 'border-transparent text-slate-500 hover:text-arkalon-navy'}`}>
              {tab}
              {tab === 'contacts' && account.contacts?.length > 0 && (
                <span className="ml-1.5 bg-slate-100 text-slate-500 text-xs px-1.5 py-0.5 rounded-full">{account.contacts.length}</span>
              )}
              {tab === 'deals' && account.deals?.length > 0 && (
                <span className="ml-1.5 bg-slate-100 text-slate-500 text-xs px-1.5 py-0.5 rounded-full">{account.deals.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="p-4">
          {activeTab === 'contacts' && (
            <div>
              <div className="flex justify-end mb-3">
                <Button size="sm" variant="secondary" onClick={() => navigate(`/contacts/new?account_id=${id}`)}>
                  <Plus className="w-3.5 h-3.5" /> New Contact
                </Button>
              </div>
              {(!account.contacts || account.contacts.length === 0) ? (
                <p className="text-sm text-slate-400 font-opensans text-center py-4">No contacts linked to this account</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-arkalon-lightgrey">
                    {['Name', 'Title', 'Email', 'Phone', 'Actions'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {account.contacts.map((c, idx) => (
                      <tr key={c.id} className={`border-b border-arkalon-lightgrey h-10 hover:bg-slate-50 ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                        <td className="px-3">
                          <button onClick={() => navigate(`/contacts/${c.id}`)} className="text-arkalon-blue hover:underline font-opensans text-sm font-semibold">
                            {c.first_name} {c.last_name}
                          </button>
                        </td>
                        <td className="px-3 text-slate-600 font-opensans">{c.title || '—'}</td>
                        <td className="px-3 text-slate-600 font-opensans">{c.email || '—'}</td>
                        <td className="px-3 text-slate-600 font-opensans">{c.phone || '—'}</td>
                        <td className="px-3">
                          <button onClick={() => navigate(`/contacts/${c.id}/edit`)} className="p-1 text-slate-400 hover:text-arkalon-blue">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'deals' && (
            <div>
              <div className="flex justify-end mb-3">
                <Button size="sm" variant="secondary" disabled title="Available in Session 4">
                  <Plus className="w-3.5 h-3.5" /> New Deal
                </Button>
              </div>
              {(!account.deals || account.deals.length === 0) ? (
                <p className="text-sm text-slate-400 font-opensans text-center py-4">No deals linked to this account</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-arkalon-lightgrey">
                    {['Deal Name', 'Stage', 'Value', 'Close Date'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {account.deals.map((d, idx) => (
                      <tr key={d.id} className={`border-b border-arkalon-lightgrey h-10 hover:bg-slate-50 ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                        <td className="px-3">
                          <button onClick={() => navigate(`/deals/${d.id}`)} className="text-arkalon-blue hover:underline font-opensans text-sm">{d.deal_name}</button>
                        </td>
                        <td className="px-3"><Badge className={STAGE_COLOURS[d.stage] || 'bg-gray-100 text-gray-600'}>{d.stage}</Badge></td>
                        <td className="px-3 font-opensans text-slate-600">{d.gross_total_value ? formatCurrency(d.gross_total_value) : '—'}</td>
                        <td className="px-3 text-slate-500 font-opensans">{formatDate(d.close_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'notes' && <NotesTab accountId={id} />}

          {activeTab === 'activities' && (
            <ActivitiesRelatedTab parentType="account" parentId={id} parentBu={account?.business_unit} />
          )}
          {activeTab === 'tasks' && (
            <TasksRelatedTab parentType="account" parentId={id} parentBu={account?.business_unit} />
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Account?"
        message={`Delete "${account.name}"? This action cannot be undone.`}
        loading={deleteLoading}
      />
    </div>
  );
}
