import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Plus, X } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx';
import ExecutiveSummary from '../../components/UI/ExecutiveSummary.jsx';
import { PhoneLink, EmailLink, CallLogPanel } from '../../components/UI/CommLinks.jsx';
import { contactsApi } from '../../api/contacts.js';
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
      <span className="w-40 flex-shrink-0 text-xs text-slate-400 font-opensans uppercase tracking-wide pt-0.5">{label}</span>
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

function NotesTab({ contactId }) {
  const { addToast } = useToast();
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    notesApi.getAll({ contact_id: contactId })
      .then(res => setNotes(res.data.data || []))
      .catch(() => {});
  }, [contactId]);

  const handleAdd = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const res = await notesApi.create({ content: newNote, contact_id: contactId });
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

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('notes');
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [call, setCall] = useState(null);

  useEffect(() => {
    setLoading(true);
    contactsApi.getById(id)
      .then(res => setContact(res.data.data))
      .catch(() => addToast('Failed to load contact', 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await contactsApi.delete(id);
      addToast('Contact deleted', 'success');
      navigate('/contacts');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) return <div className="space-y-3"><div className="h-10 bg-slate-100 rounded animate-pulse w-1/3" /><div className="h-64 bg-slate-100 rounded animate-pulse" /></div>;
  if (!contact) return <div className="text-slate-500 font-opensans text-sm">Contact not found.</div>;

  const fullName = [contact.salutation, contact.first_name, contact.last_name].filter(Boolean).join(' ');

  const handleCall = (phone) => setCall({
    phone,
    name: fullName,
    businessUnit: contact.business_unit,
    link: { contact_id: Number(id) },
    timestamp: new Date().toISOString(),
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <button onClick={() => navigate('/contacts')} className="flex items-center gap-1 text-arkalon-blue text-sm hover:underline font-opensans mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Contacts
          </button>
          <h2 className="font-montserrat font-bold text-arkalon-navy text-2xl">{fullName}</h2>
          {contact.title && <p className="text-slate-500 font-opensans text-sm mt-0.5">{contact.title}</p>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/contacts/${id}/edit`)}>
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
          <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Name</span>
          <span className="text-sm font-opensans text-slate-700 font-semibold">{fullName}</span>
        </div>
        {contact.title && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Title</span>
            <span className="text-sm font-opensans text-slate-700">{contact.title}</span>
          </div>
        )}
        {contact.email && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Email</span>
            <EmailLink email={contact.email} refName={contact.account_name || fullName} className="text-sm font-opensans" />
          </div>
        )}
        {contact.phone && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Phone</span>
            <PhoneLink phone={contact.phone} onCall={handleCall} className="text-sm font-opensans" />
          </div>
        )}
        {contact.account_name && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Account</span>
            <button onClick={() => navigate(`/accounts/${contact.account_id}`)} className="text-sm font-opensans text-arkalon-blue hover:underline text-left">
              {contact.account_name}
            </button>
          </div>
        )}
      </div>

      <ExecutiveSummary
        value={contact.executive_summary}
        entityName="contact"
        onSave={(v) => contactsApi.update(id, { executive_summary: v })}
      />

      {/* Two-column */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Contact Information">
          <FieldRow label="Salutation" value={contact.salutation} />
          <FieldRow label="First Name" value={contact.first_name} />
          <FieldRow label="Last Name" value={contact.last_name} />
          <FieldRow label="Title" value={contact.title} />
          <FieldRow label="Email" value={<EmailLink email={contact.email} refName={contact.account_name || fullName} />} />
          <FieldRow label="Phone" value={<PhoneLink phone={contact.phone} onCall={handleCall} />} />
          <FieldRow label="Mobile" value={<PhoneLink phone={contact.mobile} onCall={handleCall} />} />
          <FieldRow label="LinkedIn" value={contact.linkedin_url} />
          <FieldRow label="Department" value={contact.department} />
          <FieldRow label="Business Unit" value={contact.business_unit} />
        </SectionCard>

        <SectionCard title="Account Details">
          <FieldRow label="Account" value={contact.account_name} />
          {contact.description && (
            <div className="py-2">
              <span className="text-xs text-slate-400 font-opensans uppercase tracking-wide block mb-1">Description</span>
              <p className="text-sm font-opensans text-slate-700 whitespace-pre-wrap">{contact.description}</p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Related lists */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
        <div className="flex border-b border-arkalon-lightgrey">
          {['notes', 'deals', 'activities', 'tasks'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-montserrat font-semibold capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-arkalon-blue text-arkalon-blue' : 'border-transparent text-slate-500 hover:text-arkalon-navy'}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="p-4">
          {activeTab === 'notes' && <NotesTab contactId={id} />}
          {activeTab === 'deals' && (
            <div>
              {(!contact.deals || contact.deals.length === 0) ? (
                <p className="text-sm text-slate-400 font-opensans text-center py-4">No deals linked</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-arkalon-lightgrey">
                    {['Deal Name', 'Stage', 'Value', 'Close Date'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {contact.deals.map(d => (
                      <tr key={d.id} className="border-b border-arkalon-lightgrey h-10 hover:bg-slate-50">
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
          {activeTab === 'activities' && (
            <ActivitiesRelatedTab parentType="contact" parentId={id} parentBu={contact?.business_unit} />
          )}
          {activeTab === 'tasks' && (
            <TasksRelatedTab parentType="contact" parentId={id} parentBu={contact?.business_unit} />
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Contact?"
        message={`Delete "${fullName}"? This action cannot be undone.`}
        loading={deleteLoading}
      />

      <CallLogPanel call={call} onClose={() => setCall(null)} />
    </div>
  );
}
