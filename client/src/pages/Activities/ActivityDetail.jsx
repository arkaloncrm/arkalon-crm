import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Phone, Calendar, Mail, Linkedin, Monitor, Activity } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import { activitiesApi } from '../../api/activities.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatLocalDatetime, formatDate } from '../../utils/formatDate.js';
import { formatDuration } from '../../utils/formatDuration.js';

const TYPE_ICON = {
  Call: { icon: Phone, bg: 'bg-blue-100', color: 'text-blue-600' },
  Meeting: { icon: Calendar, bg: 'bg-purple-100', color: 'text-purple-600' },
  Email: { icon: Mail, bg: 'bg-green-100', color: 'text-green-600' },
  LinkedIn: { icon: Linkedin, bg: 'bg-indigo-100', color: 'text-indigo-600' },
  Demo: { icon: Monitor, bg: 'bg-orange-100', color: 'text-orange-600' },
  Other: { icon: Activity, bg: 'bg-slate-100', color: 'text-slate-600' },
};

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

export default function ActivityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    activitiesApi.getById(id)
      .then(res => setActivity(res.data.data))
      .catch(() => addToast('Failed to load activity', 'error'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this activity?')) return;
    try {
      await activitiesApi.delete(id);
      addToast('Activity deleted', 'success');
      navigate('/activities');
    } catch {
      addToast('Failed to delete activity', 'error');
    }
  };

  if (loading) {
    return <div className="space-y-3"><div className="h-10 bg-slate-100 rounded animate-pulse w-1/3" /><div className="h-64 bg-slate-100 rounded animate-pulse" /></div>;
  }
  if (!activity) {
    return <div className="text-slate-500 font-opensans text-sm">Activity not found.</div>;
  }

  const typeCfg = TYPE_ICON[activity.type] || TYPE_ICON.Other;
  const TypeIcon = typeCfg.icon;

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <button onClick={() => navigate('/activities')} className="flex items-center gap-1 text-arkalon-blue text-sm hover:underline font-opensans mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Activities
          </button>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${typeCfg.bg}`}>
              <TypeIcon className={`w-5 h-5 ${typeCfg.color}`} />
            </span>
            <h2 className="font-montserrat font-bold text-arkalon-navy text-2xl">{activity.subject}</h2>
          </div>
          <p className="text-slate-500 font-opensans text-sm mt-1 ml-12">{activity.type} · {activity.status}</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/activities/${id}/edit`)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg px-4 py-3 mb-4 flex items-center gap-6 flex-wrap">
        {activity.direction && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Direction</span>
            <span className="text-sm font-opensans text-slate-700">{activity.direction}</span>
          </div>
        )}
        {activity.outcome && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Outcome</span>
            <span className="text-sm font-opensans text-slate-700">{activity.outcome}</span>
          </div>
        )}
        {activity.start_datetime && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Date</span>
            <span className="text-sm font-opensans text-slate-700">{formatLocalDatetime(activity.start_datetime)}</span>
          </div>
        )}
        {activity.duration_minutes !== null && activity.duration_minutes !== undefined && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Duration</span>
            <span className="text-sm font-opensans text-slate-700">{formatDuration(activity.duration_minutes)}</span>
          </div>
        )}
        {activity.business_unit && (
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-opensans">Business Unit</span>
            <Badge className={`${BU_COLOURS[activity.business_unit] || 'bg-gray-100'} mt-0.5`}>
              {activity.business_unit}
            </Badge>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SectionCard title="Activity Details">
          <FieldRow label="Type" value={activity.type} />
          <FieldRow label="Subject" value={activity.subject} />
          <FieldRow label="Status" value={activity.status} />
          <FieldRow label="Direction" value={activity.direction} />
          <FieldRow label="Outcome" value={activity.outcome} />
          <FieldRow label="Start Date" value={formatLocalDatetime(activity.start_datetime)} />
          <FieldRow label="Duration" value={formatDuration(activity.duration_minutes)} />
          <FieldRow label="Business Unit" value={activity.business_unit} />
        </SectionCard>

        <SectionCard title="Linked Records &amp; Follow-up">
          <FieldRow label="Contact" value={activity.contact_name} />
          <FieldRow label="Lead" value={activity.lead_company} />
          <FieldRow label="Account" value={activity.account_name} />
          <FieldRow label="Deal" value={activity.deal_name} />
          <FieldRow label="Next Action" value={activity.next_action} />
          <FieldRow label="Next Action Date" value={formatDate(activity.next_action_date)} />
          <FieldRow label="Created" value={formatLocalDatetime(activity.created_at)} />
        </SectionCard>
      </div>

      {activity.description && (
        <SectionCard title="Notes">
          <div className="py-3">
            <p className="text-sm font-opensans text-slate-700 whitespace-pre-wrap">{activity.description}</p>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
