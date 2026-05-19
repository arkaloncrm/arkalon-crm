import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, CheckCircle, X, Archive, ChevronDown, ChevronRight } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx';
import { LinkedInLink } from '../../components/UI/CommLinks.jsx';
import { ConvertDropdown, RejectModal } from '../../components/ResearchQueue/ResearchQueueActions.jsx';
import { researchQueueApi } from '../../api/researchQueue.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  RESEARCH_STATUS_COLOURS, CONFIDENCE_COLOURS, CANDIDATE_TYPE_COLOURS, RESEARCH_BU_COLOURS,
} from '../../utils/constants.js';
import { formatDate, formatDateTime } from '../../utils/formatDate.js';

// Where each conversion target's live record lives. Tasks have no detail page,
// so their link points at the task edit form.
const CONVERTED_LINKS = [
  { idField: 'converted_lead_id', label: 'Lead', path: (id) => `/leads/${id}` },
  { idField: 'converted_account_id', label: 'Account', path: (id) => `/accounts/${id}` },
  { idField: 'converted_contact_id', label: 'Contact', path: (id) => `/contacts/${id}` },
  { idField: 'converted_deal_id', label: 'Deal', path: (id) => `/deals/${id}` },
  { idField: 'converted_task_id', label: 'Task', path: (id) => `/tasks/${id}/edit` },
];

const CONVERT_PATHS = {
  lead: (id) => `/leads/${id}`,
  account: (id) => `/accounts/${id}`,
  contact: (id) => `/contacts/${id}`,
  task: (id) => `/tasks/${id}/edit`,
};

function FieldRow({ label, value }) {
  return (
    <div className="flex py-2 border-b border-slate-100 last:border-0">
      <span className="w-36 flex-shrink-0 text-xs text-slate-400 font-opensans uppercase tracking-wide pt-0.5">{label}</span>
      <span className="text-sm text-slate-800 font-opensans flex-1 break-words">{value || value === 0 ? value : '—'}</span>
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

function TextBlock({ title, value }) {
  return (
    <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden mb-4">
      <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">{title}</h3>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm font-opensans text-slate-700 whitespace-pre-wrap">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function ResearchQueueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [payloadOpen, setPayloadOpen] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchRecord = () => {
    setLoading(true);
    researchQueueApi.getById(id)
      .then(res => {
        setRecord(res.data.data);
        setReviewNotes(res.data.data.review_notes || '');
      })
      .catch(() => addToast('Failed to load record', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRecord(); }, [id]);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await researchQueueApi.update(id, { review_notes: reviewNotes });
      addToast('Review notes saved', 'success');
      fetchRecord();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save notes', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleApprove = async () => {
    setBusy(true);
    try {
      await researchQueueApi.approve(id);
      addToast('Record approved', 'success');
      fetchRecord();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to approve', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handlePark = async () => {
    setBusy(true);
    try {
      await researchQueueApi.park(id);
      addToast('Record parked', 'success');
      fetchRecord();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to park', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (reason) => {
    setRejectLoading(true);
    try {
      await researchQueueApi.reject(id, { rejected_reason: reason });
      addToast('Record rejected', 'success');
      setShowReject(false);
      fetchRecord();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to reject', 'error');
    } finally {
      setRejectLoading(false);
    }
  };

  const handleConvert = async (target) => {
    setBusy(true);
    try {
      const res = await researchQueueApi.convert(id, { convert_to: target });
      addToast(`Converted to ${target}`, 'success');
      const newId = res.data.data.id;
      navigate(CONVERT_PATHS[target](newId));
    } catch (err) {
      addToast(err.response?.data?.error || 'Conversion failed', 'error');
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await researchQueueApi.delete(id);
      addToast('Record deleted', 'success');
      navigate('/research-queue');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete', 'error');
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

  if (!record) {
    return <div className="text-slate-500 font-opensans text-sm">Research record not found.</div>;
  }

  const conversions = CONVERTED_LINKS.filter(c => record[c.idField]);

  let prettyPayload = null;
  if (record.source_payload) {
    try {
      prettyPayload = JSON.stringify(JSON.parse(record.source_payload), null, 2);
    } catch {
      prettyPayload = record.source_payload;
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <button onClick={() => navigate('/research-queue')} className="flex items-center gap-1 text-arkalon-blue text-sm hover:underline font-opensans mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Research Queue
          </button>
          <h2 className="font-montserrat font-bold text-arkalon-navy text-2xl">
            {record.title || record.company_name || 'Untitled record'}
          </h2>
          {record.company_name && record.title && (
            <p className="text-slate-500 font-opensans text-sm mt-0.5">{record.company_name}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="success" size="sm" onClick={handleApprove} disabled={busy}>
            <CheckCircle className="w-3.5 h-3.5" /> Approve
          </Button>
          <ConvertDropdown variant="button" disabled={busy} onConvert={handleConvert} />
          <Button variant="danger" size="sm" onClick={() => setShowReject(true)} disabled={busy}>
            <X className="w-3.5 h-3.5" /> Reject
          </Button>
          <Button variant="secondary" size="sm" onClick={handlePark} disabled={busy}>
            <Archive className="w-3.5 h-3.5" /> Park
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/research-queue/${id}/edit`)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Conversion history */}
      {conversions.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 mb-4">
          <span className="text-xs text-purple-700 font-montserrat font-semibold uppercase tracking-wide">Converted records</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {conversions.map(c => (
              <button
                key={c.idField}
                onClick={() => navigate(c.path(record[c.idField]))}
                className="px-3 py-1 bg-white border border-purple-200 rounded text-sm font-opensans text-purple-700 hover:bg-purple-100 transition-colors"
              >
                {c.label} #{record[c.idField]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Left: record fields */}
        <SectionCard title="Record Details">
          <FieldRow label="Title" value={record.title} />
          <FieldRow label="Company" value={record.company_name} />
          <FieldRow label="Contact Name" value={record.contact_name || [record.first_name, record.last_name].filter(Boolean).join(' ')} />
          <FieldRow label="Email" value={record.email} />
          <FieldRow label="Phone" value={record.phone} />
          <FieldRow label="Mobile" value={record.mobile} />
          <FieldRow label="Website" value={record.website} />
          <FieldRow label="LinkedIn" value={<LinkedInLink url={record.linkedin_url} showText />} />
          <FieldRow
            label="Business Unit"
            value={record.business_unit && (
              <Badge className={RESEARCH_BU_COLOURS[record.business_unit] || 'bg-gray-100 text-gray-600'}>
                {record.business_unit}
              </Badge>
            )}
          />
          <FieldRow
            label="Candidate Type"
            value={record.candidate_type && (
              <Badge className={CANDIDATE_TYPE_COLOURS[record.candidate_type] || 'bg-gray-100 text-gray-600'}>
                {record.candidate_type}
              </Badge>
            )}
          />
          <FieldRow
            label="Status"
            value={record.status && (
              <Badge className={RESEARCH_STATUS_COLOURS[record.status] || 'bg-gray-100 text-gray-600'}>
                {record.status}
              </Badge>
            )}
          />
          <FieldRow
            label="Confidence"
            value={record.confidence_level && (
              <Badge className={CONFIDENCE_COLOURS[record.confidence_level] || 'bg-gray-100 text-gray-600'}>
                {record.confidence_level}
              </Badge>
            )}
          />
          <FieldRow label="Source" value={record.source} />
          <FieldRow label="Source URL" value={record.source_url} />
          <FieldRow label="Assigned To" value={record.assigned_to_name} />
          <FieldRow label="Created" value={formatDate(record.created_at)} />
          {record.reviewed_by_name && (
            <FieldRow label="Reviewed By" value={`${record.reviewed_by_name} · ${formatDateTime(record.reviewed_at)}`} />
          )}
        </SectionCard>

        {/* Right: AI intelligence + review */}
        <div>
          <TextBlock title="AI Summary" value={record.ai_summary} />
          <TextBlock title="Why It Matters" value={record.why_it_matters} />
          <TextBlock title="Suggested Next Action" value={record.suggested_next_action} />
          {record.status === 'Rejected' && record.rejected_reason && (
            <TextBlock title="Rejected Reason" value={record.rejected_reason} />
          )}

          <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden mb-4">
            <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
              <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Review Notes</h3>
            </div>
            <div className="px-4 py-3">
              <textarea
                rows={4}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add review notes…"
                className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 resize-none"
              />
              <div className="flex justify-end mt-2">
                <Button
                  size="sm"
                  onClick={handleSaveNotes}
                  disabled={savingNotes || reviewNotes === (record.review_notes || '')}
                >
                  {savingNotes ? 'Saving…' : 'Save Notes'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Raw source payload */}
      {prettyPayload && (
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden mb-4">
          <button
            onClick={() => setPayloadOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey text-left"
          >
            {payloadOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Raw Source Payload</h3>
          </button>
          {payloadOpen && (
            <pre className="px-4 py-3 text-xs font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap">{prettyPayload}</pre>
          )}
        </div>
      )}

      <RejectModal
        isOpen={showReject}
        onClose={() => setShowReject(false)}
        onSubmit={handleReject}
        loading={rejectLoading}
      />

      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Research Record?"
        message={`Delete "${record.title || record.company_name || 'this record'}"? This permanently removes it from the queue.`}
        loading={deleteLoading}
      />
    </div>
  );
}
