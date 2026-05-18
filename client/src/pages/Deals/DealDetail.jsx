import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil, Trash2, Phone, Mail } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx';
import ExecutiveSummary from '../../components/UI/ExecutiveSummary.jsx';
import { PhoneLink, EmailLink, CallLogPanel } from '../../components/UI/CommLinks.jsx';
import DealContactRoles from './DealContactRoles.jsx';
import ActivitiesRelatedTab from '../../components/Activities/ActivitiesRelatedTab.jsx';
import TasksRelatedTab from '../../components/Tasks/TasksRelatedTab.jsx';
import { dealsApi } from '../../api/deals.js';
import { notesApi } from '../../api/notes.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  DEAL_STAGES, STAGE_COLOURS, FORECAST_COLOURS,
} from '../../utils/constants.js';
import { formatCurrency, formatMrr, formatPercentage } from '../../utils/formatCurrency.js';
import { formatDate, formatDateTime } from '../../utils/formatDate.js';

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
};

const ROLE_COLOURS = {
  'Primary': 'bg-blue-100 text-blue-700',
  'Operations': 'bg-indigo-100 text-indigo-700',
  'Billing': 'bg-purple-100 text-purple-700',
  'Technical': 'bg-cyan-100 text-cyan-700',
  'Executive': 'bg-amber-100 text-amber-800',
  'Other': 'bg-gray-100 text-gray-600',
};

function FieldRow({ label, value }) {
  return (
    <div className="flex py-2 border-b border-slate-100 last:border-0">
      <span className="w-44 flex-shrink-0 text-xs text-slate-400 font-opensans uppercase tracking-wide pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 font-opensans flex-1">{value ?? '—'}</span>
    </div>
  );
}

function SectionCard({ title, children, className = '' }) {
  return (
    <div className={`bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden mb-4 ${className}`}>
      <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">{title}</h3>
      </div>
      <div className="px-4 py-2">{children}</div>
    </div>
  );
}

function NotesTab({ dealId }) {
  const { addToast } = useToast();
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    setLoading(true);
    notesApi.getAll({ deal_id: dealId })
      .then(res => setNotes(res.data.data || []))
      .catch(() => addToast('Failed to load notes', 'error'))
      .finally(() => setLoading(false));
  }, [dealId]);

  const handleAdd = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      const res = await notesApi.create({ content: noteText.trim(), deal_id: dealId });
      setNotes(prev => [res.data.data, ...prev]);
      setNoteText('');
      addToast('Note added', 'success');
    } catch {
      addToast('Failed to add note', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (note) => {
    try {
      const res = await notesApi.update(note.id, { content: editText.trim() });
      setNotes(prev => prev.map(n => n.id === note.id ? res.data.data : n));
      setEditingId(null);
      addToast('Note updated', 'success');
    } catch {
      addToast('Failed to update note', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await notesApi.delete(id);
      setNotes(prev => prev.filter(n => n.id !== id));
      addToast('Note deleted', 'success');
    } catch {
      addToast('Failed to delete note', 'error');
    }
  };

  if (loading) return <div className="py-4 text-slate-400 font-opensans text-sm text-center">Loading…</div>;

  return (
    <div>
      <div className="mb-4">
        <textarea
          rows={3}
          className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
          placeholder="Add a note…"
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
        />
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={handleAdd} disabled={saving || !noteText.trim()}>
            {saving ? 'Saving…' : 'Add Note'}
          </Button>
        </div>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-slate-400 font-opensans text-center py-4">No notes yet</p>
      ) : (
        <div className="space-y-3">
          {notes.map(note => (
            <div key={note.id} className="bg-slate-50 rounded-lg p-3 border border-arkalon-lightgrey">
              {editingId === note.id ? (
                <div>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={() => handleEdit(note)}>Save</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-opensans text-slate-800 whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-400 font-opensans">{formatDateTime(note.created_at)}</span>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingId(note.id); setEditText(note.content); }}
                        className="text-xs text-arkalon-blue hover:underline font-opensans">Edit</button>
                      <button onClick={() => handleDelete(note.id)}
                        className="text-xs text-red-500 hover:underline font-opensans">Delete</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [deal, setDeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('activities');
  const [deleting, setDeleting] = useState(false);
  const [stageChanging, setStageChanging] = useState(false);
  const [selectedStage, setSelectedStage] = useState('');
  const [call, setCall] = useState(null);

  const loadDeal = () => {
    setLoading(true);
    dealsApi.getById(id)
      .then(res => {
        const d = res.data.data;
        setDeal(d);
        setSelectedStage(d.stage);
      })
      .catch(() => addToast('Failed to load deal', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDeal(); }, [id]);

  const handleStageChange = async () => {
    if (!selectedStage || selectedStage === deal.stage) return;
    setStageChanging(true);
    try {
      await dealsApi.updateStage(id, selectedStage);
      addToast('Stage updated', 'success');
      loadDeal();
    } catch {
      addToast('Failed to update stage', 'error');
      setSelectedStage(deal.stage);
    } finally {
      setStageChanging(false);
    }
  };

  const handleDelete = async () => {
    try {
      await dealsApi.delete(id);
      addToast('Deal deleted', 'success');
      navigate('/deals');
    } catch {
      addToast('Failed to delete deal', 'error');
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-slate-400 font-opensans text-sm">Loading…</div>;
  }
  if (!deal) {
    return <div className="py-12 text-center text-slate-400 font-opensans text-sm">Deal not found.</div>;
  }

  const isASC = deal.business_unit === 'ASC';

  const handleCall = (phone, contactName) => setCall({
    phone,
    name: contactName,
    businessUnit: deal.business_unit,
    link: { deal_id: Number(id) },
    timestamp: new Date().toISOString(),
  });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => navigate('/deals')} className="text-arkalon-blue text-sm hover:underline font-opensans">
              ← Deals
            </button>
          </div>
          <h2 className="font-montserrat font-bold text-arkalon-navy text-2xl mb-2">{deal.deal_name}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {deal.account_name && (
              <button onClick={() => navigate(`/accounts/${deal.account_id}`)}
                className="text-arkalon-blue text-sm hover:underline font-opensans font-semibold">
                {deal.account_name}
              </button>
            )}
            <Badge className={STAGE_COLOURS[deal.stage] || 'bg-gray-100 text-gray-700'}>{deal.stage}</Badge>
            <Badge className={BU_COLOURS[deal.business_unit] || 'bg-gray-100 text-gray-600'}>{deal.business_unit}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/deals/${id}/edit`)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setDeleting(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Inline stage change */}
      <div className="flex flex-wrap items-center gap-2 mb-5 bg-white border border-arkalon-lightgrey rounded-lg px-4 py-3">
        <span className="text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide mr-1">Change Stage</span>
        <select
          className="px-3 py-1.5 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 bg-white"
          value={selectedStage}
          onChange={e => setSelectedStage(e.target.value)}
        >
          {DEAL_STAGES.map(s => <option key={s}>{s}</option>)}
        </select>
        <Button size="sm" onClick={handleStageChange} disabled={stageChanging || selectedStage === deal.stage}>
          {stageChanging ? 'Updating…' : 'Update Stage'}
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        <div className="flex-1 min-w-0">

          <ExecutiveSummary
            value={deal.executive_summary}
            entityName="deal"
            onSave={(v) => dealsApi.patch(id, { executive_summary: v })}
          />

          {/* Financial Summary — HERO CARD */}
          <div className="bg-white border-2 border-arkalon-blue rounded-lg overflow-hidden mb-4">
            <div className="px-5 py-3 bg-arkalon-navy">
              <h3 className="font-montserrat font-bold text-white text-sm uppercase tracking-wider">Deal Financials</h3>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mb-4">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-sm text-slate-500 font-opensans">Gross Value (Total Contract)</span>
                  <span className="font-semibold text-slate-800 font-opensans">{formatCurrency(deal.gross_total_value)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-sm text-slate-500 font-opensans">Weighted Value</span>
                  <span className="font-semibold text-slate-800 font-opensans">
                    {formatCurrency(deal.weighted_value)}
                    <span className="text-slate-400 ml-1 text-xs">({deal.probability}%)</span>
                  </span>
                </div>
                {isASC && (
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                    <span className="text-sm text-slate-500 font-opensans">Monthly Recurring (MRR)</span>
                    <span className="font-semibold text-slate-800 font-opensans">{formatMrr(deal.monthly_recurring_revenue)}</span>
                  </div>
                )}
                {isASC && (
                  <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                    <span className="text-sm text-slate-500 font-opensans">Contract Term</span>
                    <span className="font-semibold text-slate-800 font-opensans">
                      {deal.contract_term_months ? `${deal.contract_term_months} months` : '—'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                  <span className="text-sm text-slate-500 font-opensans">Forecast Category</span>
                  <Badge className={FORECAST_COLOURS[deal.forecast_category] || 'bg-gray-100 text-gray-600'}>
                    {deal.forecast_category}
                  </Badge>
                </div>
              </div>
              <div className="border-t-2 border-arkalon-lightgrey pt-4">
                <div className="text-xs font-montserrat font-bold text-slate-400 uppercase tracking-widest mb-1">Stuart's Commission</div>
                <div className="text-4xl font-montserrat font-bold leading-none mb-2" style={{ color: '#0073C6' }}>
                  {formatCurrency(deal.total_contract_earnings)}
                </div>
                <div className="text-sm text-slate-500 font-opensans">{deal.commission_basis}</div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          {deal.line_items && deal.line_items.length > 0 && (
            <SectionCard title="Line Items">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-arkalon-lightgrey">
                      {['Product', 'SKU', 'Description', 'Qty', 'Unit Price', 'Unit Type', 'Recurring', 'Line Total'].map(h => (
                        <th key={h} className="text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deal.line_items.map((item, i) => (
                      <tr key={item.id || i} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-3 font-semibold text-arkalon-navy font-opensans text-xs">{item.product_name}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-500">{item.sku || '—'}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600 font-opensans">{item.description || '—'}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600 font-opensans">{item.quantity}</td>
                        <td className="py-2 pr-3 text-xs text-slate-600 font-opensans">{formatCurrency(item.unit_price)}</td>
                        <td className="py-2 pr-3 text-xs text-slate-500 font-opensans">{item.unit_type || '—'}</td>
                        <td className="py-2 pr-3">
                          <Badge className={item.is_recurring ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                            {item.is_recurring ? 'Recurring' : 'One-off'}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 font-semibold text-slate-700 font-opensans text-xs">
                          {formatCurrency(item.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* Deal Info */}
          <SectionCard title="Deal Info">
            <FieldRow label="Stage" value={<Badge className={STAGE_COLOURS[deal.stage] || 'bg-gray-100 text-gray-700'}>{deal.stage}</Badge>} />
            {isASC && <FieldRow label="Deal Type" value={deal.deal_type} />}
            <FieldRow label="Close Date" value={formatDate(deal.close_date)} />
            {isASC && <FieldRow label="Contract Term" value={deal.contract_term_months ? `${deal.contract_term_months} months` : null} />}
            <FieldRow label="Probability" value={deal.probability != null ? `${deal.probability}%` : null} />
            <FieldRow label="Forecast" value={deal.forecast_category} />
            <FieldRow label="Lead Source" value={deal.lead_source} />
            <FieldRow label="Next Action" value={deal.next_action} />
            <FieldRow label="Next Action Date" value={formatDate(deal.next_action_date)} />
            {deal.description && <FieldRow label="Description" value={deal.description} />}
            <FieldRow label="Created" value={formatDateTime(deal.created_at)} />
            <FieldRow label="Updated" value={formatDateTime(deal.updated_at)} />
          </SectionCard>

          {/* Contact Roles */}
          <DealContactRoles dealId={id} accountId={deal.account_id} />

          {/* Tabs */}
          <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
            <div className="flex border-b border-arkalon-lightgrey">
              {['activities', 'tasks', 'notes'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-3 text-sm font-montserrat font-semibold capitalize transition-colors ${
                    activeTab === tab
                      ? 'text-arkalon-blue border-b-2 border-arkalon-blue -mb-px'
                      : 'text-slate-500 hover:text-arkalon-navy'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="p-4">
              {activeTab === 'activities' && (
                <ActivitiesRelatedTab parentType="deal" parentId={id} parentBu={deal.business_unit} />
              )}
              {activeTab === 'tasks' && (
                <TasksRelatedTab parentType="deal" parentId={id} parentBu={deal.business_unit} />
              )}
              {activeTab === 'notes' && <NotesTab dealId={id} />}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="w-full lg:w-64 lg:flex-shrink-0 space-y-4">

          {/* Linked Contacts */}
          <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
              <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Contacts</h3>
            </div>
            <div className="p-3">
              {(!deal.contacts || deal.contacts.length === 0) ? (
                <p className="text-xs text-slate-400 font-opensans py-2 text-center">No contacts linked</p>
              ) : (
                <div className="space-y-3">
                  {deal.contacts.map(contact => (
                    <div key={contact.id}
                      onClick={() => navigate(`/contacts/${contact.id}`)}
                      className="cursor-pointer hover:bg-slate-50 rounded p-2 transition-colors -mx-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-montserrat font-semibold text-arkalon-navy truncate">
                            {contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()}
                          </div>
                          {contact.title && (
                            <div className="text-xs text-slate-500 font-opensans truncate">{contact.title}</div>
                          )}
                        </div>
                        <Badge className={`${ROLE_COLOURS[contact.role] || 'bg-gray-100 text-gray-600'} text-[10px] flex-shrink-0`}>
                          {contact.role}
                        </Badge>
                      </div>
                      {contact.phone && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <PhoneLink
                            phone={contact.phone}
                            onCall={() => handleCall(
                              contact.phone,
                              contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
                            )}
                            className="text-xs font-opensans"
                          />
                        </div>
                      )}
                      {contact.email && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <EmailLink
                            email={contact.email}
                            refName={deal.account_name}
                            className="text-xs font-opensans truncate"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
              <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Quick Actions</h3>
            </div>
            <div className="p-3 space-y-2">
              <button
                onClick={() => navigate(`/activities/new?deal_id=${id}&business_unit=${deal.business_unit}`)}
                className="w-full text-left px-3 py-2 text-sm font-opensans text-slate-700 hover:bg-slate-50 rounded transition-colors border border-arkalon-lightgrey">
                Log Activity
              </button>
              <button
                onClick={() => navigate(`/tasks/new?deal_id=${id}&business_unit=${deal.business_unit}`)}
                className="w-full text-left px-3 py-2 text-sm font-opensans text-slate-700 hover:bg-slate-50 rounded transition-colors border border-arkalon-lightgrey">
                Add Task
              </button>
              <button
                onClick={() => navigate(`/deals/${id}/edit`)}
                className="w-full text-left px-3 py-2 text-sm font-opensans text-arkalon-blue hover:bg-blue-50 rounded transition-colors border border-arkalon-lightgrey">
                Edit Deal
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleting}
        title="Delete Deal"
        message={`Delete "${deal.deal_name}"? This will also remove all linked notes, activities, and tasks.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(false)}
      />

      <CallLogPanel call={call} onClose={() => setCall(null)} />
    </div>
  );
}
