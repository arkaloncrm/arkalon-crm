import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, RefreshCw, Plus, X, MessageSquare } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import Modal from '../../components/UI/Modal.jsx';
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx';
import ExecutiveSummary from '../../components/UI/ExecutiveSummary.jsx';
import { PhoneLink, EmailLink, LinkedInLink, CallLogPanel, LogMessagePanel } from '../../components/UI/CommLinks.jsx';
import { leadsApi } from '../../api/leads.js';
import { accountsApi } from '../../api/accounts.js';
import { notesApi } from '../../api/notes.js';
import ActivitiesRelatedTab from '../../components/Activities/ActivitiesRelatedTab.jsx';
import TasksRelatedTab from '../../components/Tasks/TasksRelatedTab.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { DEAL_STAGES } from '../../utils/constants.js';
import { formatDate, formatDateTime } from '../../utils/formatDate.js';
import { formatCurrency } from '../../utils/formatCurrency.js';

const STATUS_COLOURS = {
  'New': 'bg-gray-100 text-gray-600',
  'Attempted Contact': 'bg-blue-100 text-blue-700',
  'Contacted': 'bg-indigo-100 text-indigo-700',
  'Meeting Booked': 'bg-purple-100 text-purple-700',
  'Qualified': 'bg-green-100 text-green-700',
  'Converted': 'bg-emerald-100 text-emerald-800',
  'Not Qualified': 'bg-orange-100 text-orange-700',
  'Junk': 'bg-red-100 text-red-700',
};

const PRIORITY_COLOURS = {
  'P1 - Act Now': 'bg-red-100 text-red-700',
  'P2 - This Month': 'bg-orange-100 text-orange-700',
  'P3 - Pipeline': 'bg-yellow-100 text-yellow-700',
  'Parked': 'bg-gray-100 text-gray-500',
};

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
};

function FieldRow({ label, value }) {
  return (
    <div className="flex py-2 border-b border-slate-100 last:border-0">
      <span className="w-40 flex-shrink-0 text-xs text-slate-400 font-opensans uppercase tracking-wide pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 font-opensans flex-1 min-w-0 break-words">{value || '—'}</span>
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

function ConvertModal({ isOpen, onClose, lead, onConverted }) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [accountName, setAccountName] = useState('');
  const [createDeal, setCreateDeal] = useState(true);
  const [dealName, setDealName] = useState('');
  const [dealStage, setDealStage] = useState('New');
  const [dealCloseDate, setDealCloseDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [useExisting, setUseExisting] = useState(false);
  const [existingAccountId, setExistingAccountId] = useState('');

  useEffect(() => {
    if (isOpen && lead) {
      setAccountName(lead.company || '');
      setDealName(`${lead.company || 'Opportunity'} — ${lead.business_unit || ''} Opportunity`);
      setUseExisting(false);
      setExistingAccountId('');
      accountsApi.getAll({ business_unit: lead.business_unit })
        .then(res => setAccounts(res.data.data || []))
        .catch(() => {});
    }
  }, [isOpen, lead]);

  const handleConvert = async () => {
    if (!useExisting && !accountName.trim()) {
      addToast('Account name is required', 'error'); return;
    }
    setLoading(true);
    try {
      const payload = {
        account_name: useExisting
          ? accounts.find(a => String(a.id) === String(existingAccountId))?.name || accountName
          : accountName,
        create_deal: createDeal,
        deal_name: createDeal ? dealName : undefined,
        deal_stage: createDeal ? dealStage : undefined,
        deal_close_date: createDeal && dealCloseDate ? dealCloseDate : undefined,
      };
      const res = await leadsApi.convert(lead.id, payload);
      addToast('Lead converted successfully', 'success');
      onConverted();
      onClose();
      navigate(`/accounts/${res.data.data.account_id}`);
    } catch (err) {
      addToast(err.response?.data?.error || 'Conversion failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!lead) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Convert Lead" size="md">
      <div className="space-y-5">
        {/* Account */}
        <div>
          <div className="font-montserrat font-semibold text-arkalon-navy text-xs uppercase tracking-wide mb-2">Account</div>
          <div className="flex gap-3 mb-2">
            <label className="flex items-center gap-2 text-sm font-opensans cursor-pointer">
              <input type="radio" checked={!useExisting} onChange={() => setUseExisting(false)} />
              Create new account
            </label>
            <label className="flex items-center gap-2 text-sm font-opensans cursor-pointer">
              <input type="radio" checked={useExisting} onChange={() => setUseExisting(true)} />
              Link to existing
            </label>
          </div>
          {!useExisting ? (
            <input
              type="text"
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
              placeholder="Account name"
            />
          ) : (
            <select
              value={existingAccountId}
              onChange={e => setExistingAccountId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
            >
              <option value="">Select account…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </div>

        {/* Contact */}
        <div>
          <div className="font-montserrat font-semibold text-arkalon-navy text-xs uppercase tracking-wide mb-2">Contact</div>
          <div className="px-3 py-2 bg-slate-50 rounded border border-arkalon-lightgrey text-sm font-opensans text-slate-600">
            {lead.salutation} {lead.first_name} {lead.last_name} — will be created and linked automatically
          </div>
        </div>

        {/* Deal */}
        <div>
          <div className="font-montserrat font-semibold text-arkalon-navy text-xs uppercase tracking-wide mb-2">Deal</div>
          <label className="flex items-center gap-2 text-sm font-opensans cursor-pointer mb-3">
            <input type="checkbox" checked={createDeal} onChange={e => setCreateDeal(e.target.checked)} />
            Create a deal
          </label>
          {createDeal && (
            <div className="space-y-2 pl-5">
              <input
                type="text"
                value={dealName}
                onChange={e => setDealName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
                placeholder="Deal name"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={dealStage}
                  onChange={e => setDealStage(e.target.value)}
                  className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
                >
                  {DEAL_STAGES.map(s => <option key={s}>{s}</option>)}
                </select>
                <input
                  type="date"
                  value={dealCloseDate}
                  onChange={e => setDealCloseDate(e.target.value)}
                  className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-arkalon-lightgrey">
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleConvert} disabled={loading}>
            {loading ? 'Converting…' : 'Convert'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function NotesTab({ leadId }) {
  const { addToast } = useToast();
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    notesApi.getAll({ lead_id: leadId })
      .then(res => setNotes(res.data.data || []))
      .catch(() => {});
  }, [leadId]);

  const handleAdd = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const res = await notesApi.create({ content: newNote, lead_id: leadId });
      setNotes(prev => [res.data.data, ...prev]);
      setNewNote('');
    } catch {
      addToast('Failed to add note', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await notesApi.delete(id);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch {
      addToast('Failed to delete note', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          rows={2}
          placeholder="Add a note…"
          className="flex-1 px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 resize-none"
        />
        <Button size="sm" onClick={handleAdd} disabled={saving || !newNote.trim()}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      {notes.length === 0 && (
        <p className="text-sm text-slate-400 font-opensans text-center py-4">No notes yet</p>
      )}
      {notes.map(note => (
        <div key={note.id} className="bg-white border border-arkalon-lightgrey rounded p-3 flex justify-between gap-2">
          <div>
            <p className="text-sm font-opensans text-slate-700 whitespace-pre-wrap">{note.content}</p>
            <p className="text-xs text-slate-400 font-opensans mt-1">{formatDateTime(note.created_at)} · {note.created_by_name}</p>
          </div>
          <button onClick={() => handleDelete(note.id)} className="text-slate-300 hover:text-red-400 flex-shrink-0 mt-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('notes');
  const [showConvert, setShowConvert] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [call, setCall] = useState(null);
  const [logMessageRecord, setLogMessageRecord] = useState(null);

  const fetchLead = () => {
    setLoading(true);
    leadsApi.getById(id)
      .then(res => setLead(res.data.data))
      .catch(() => addToast('Failed to load lead', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLead(); }, [id]);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await leadsApi.delete(id);
      addToast('Lead deleted', 'success');
      navigate('/leads');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete lead', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 bg-slate-100 rounded animate-pulse w-1/3" />
        <div className="h-64 bg-slate-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!lead) {
    return <div className="text-slate-500 font-opensans text-sm">Lead not found.</div>;
  }

  const fullName = [lead.salutation, lead.first_name, lead.last_name].filter(Boolean).join(' ');

  const handleCall = (phone) => setCall({
    phone,
    name: fullName || lead.company,
    email: lead.email,
    businessUnit: lead.business_unit,
    link: { lead_id: Number(id) },
    timestamp: new Date().toISOString(),
  });

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <button onClick={() => navigate('/leads')} className="flex items-center gap-1 text-arkalon-blue text-sm hover:underline font-opensans mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Leads
          </button>
          <h2 className="font-montserrat font-bold text-arkalon-navy text-2xl min-w-0 break-words">{fullName || lead.company}</h2>
          <p className="text-slate-500 font-opensans text-sm mt-0.5 break-words">{lead.company}</p>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLogMessageRecord({
              name: fullName || lead.company,
              link: { lead_id: Number(id) },
              businessUnit: lead.business_unit,
            })}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Log Message
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/leads/${id}/edit`)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          {!lead.converted && (
            <Button size="sm" onClick={() => setShowConvert(true)}>
              <RefreshCw className="w-3.5 h-3.5" /> Convert
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Business card strip */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg px-4 py-3 mb-4 flex items-center gap-6 flex-wrap">
        {lead.phone && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Phone</span>
            <PhoneLink phone={lead.phone} onCall={handleCall} className="text-sm font-opensans" />
          </div>
        )}
        {lead.email && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Email</span>
            <EmailLink email={lead.email} refName={lead.company} className="text-sm font-opensans" />
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Status</span>
          <Badge className={`${STATUS_COLOURS[lead.lead_status] || 'bg-gray-100 text-gray-600'} mt-0.5`}>
            {lead.lead_status}
          </Badge>
        </div>
        {lead.business_unit && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Business Unit</span>
            <Badge className={`${BU_COLOURS[lead.business_unit] || 'bg-gray-100'} mt-0.5`}>{lead.business_unit}</Badge>
          </div>
        )}
        {lead.priority && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Priority</span>
            <Badge className={`${PRIORITY_COLOURS[lead.priority] || 'bg-gray-100'} mt-0.5`}>{lead.priority}</Badge>
          </div>
        )}
        {!!lead.converted && (
          <div className="ml-auto">
            <Badge className="bg-emerald-100 text-emerald-800 text-sm px-3 py-1">✓ Converted {formatDate(lead.converted_at)}</Badge>
          </div>
        )}
      </div>

      <ExecutiveSummary
        value={lead.executive_summary}
        entityName="lead"
        onSave={(v) => leadsApi.update(id, { executive_summary: v })}
      />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Lead Information">
          <FieldRow label="Salutation" value={lead.salutation} />
          <FieldRow label="First Name" value={lead.first_name} />
          <FieldRow label="Last Name" value={lead.last_name} />
          <FieldRow label="Title" value={lead.title} />
          <FieldRow label="Company" value={lead.company} />
          <FieldRow label="Email" value={<EmailLink email={lead.email} refName={lead.company} />} />
          <FieldRow label="Phone" value={<PhoneLink phone={lead.phone} onCall={handleCall} />} />
          <FieldRow label="Mobile" value={<PhoneLink phone={lead.mobile} onCall={handleCall} />} />
          <FieldRow label="Website" value={lead.website} />
          {lead.linkedin_url && (
            <FieldRow label="LinkedIn" value={<LinkedInLink url={lead.linkedin_url} showText />} />
          )}
          <FieldRow label="Lead Source" value={lead.lead_source} />
          <FieldRow label="Lead Status" value={lead.lead_status} />
          <FieldRow label="Business Unit" value={lead.business_unit} />
          <FieldRow label="Target Type" value={lead.target_type} />
          <FieldRow label="Priority" value={lead.priority} />
        </SectionCard>

        <SectionCard title="Additional Details">
          <FieldRow label="Industry" value={lead.industry} />
          <FieldRow label="Employees" value={lead.employee_count} />
          <FieldRow label="Annual Revenue" value={lead.annual_revenue ? formatCurrency(lead.annual_revenue) : null} />
          <FieldRow label="City" value={lead.city} />
          <FieldRow label="State" value={lead.state} />
          <FieldRow label="Country" value={lead.country} />
          <FieldRow label="Warm Path" value={lead.warm_path} />
          <FieldRow label="Next Action" value={lead.next_action} />
          <FieldRow label="Next Action Date" value={formatDate(lead.next_action_date)} />
          <FieldRow label="Last Contacted" value={formatDate(lead.last_contacted)} />
          {lead.description && (
            <div className="py-2">
              <span className="text-xs text-slate-400 font-opensans uppercase tracking-wide block mb-1">Description</span>
              <p className="text-sm font-opensans text-slate-700 whitespace-pre-wrap">{lead.description}</p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Related lists */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
        <div className="flex border-b border-arkalon-lightgrey">
          {['notes', 'activities', 'tasks'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-montserrat font-semibold capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-arkalon-blue text-arkalon-blue' : 'border-transparent text-slate-500 hover:text-arkalon-navy'}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="p-4">
          {activeTab === 'notes' && <NotesTab leadId={id} />}
          {activeTab === 'activities' && (
            <ActivitiesRelatedTab parentType="lead" parentId={id} parentBu={lead?.business_unit} />
          )}
          {activeTab === 'tasks' && (
            <TasksRelatedTab parentType="lead" parentId={id} parentBu={lead?.business_unit} />
          )}
        </div>
      </div>

      <ConvertModal
        isOpen={showConvert}
        onClose={() => setShowConvert(false)}
        lead={lead}
        onConverted={fetchLead}
      />

      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Lead?"
        message={`Delete "${lead.company}"? This action cannot be undone.`}
        loading={deleteLoading}
      />

      <CallLogPanel call={call} onClose={() => setCall(null)} />

      <LogMessagePanel
        record={logMessageRecord}
        onClose={() => setLogMessageRecord(null)}
      />
    </div>
  );
}
