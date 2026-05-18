import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Calendar, Mail, Linkedin, Monitor, Activity } from 'lucide-react';
import Button from '../UI/Button.jsx';
import { activitiesApi } from '../../api/activities.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatLocalDatetime } from '../../utils/formatDate.js';

const TYPE_ICON = {
  Call: { icon: Phone, bg: 'bg-blue-100', color: 'text-blue-600' },
  Meeting: { icon: Calendar, bg: 'bg-purple-100', color: 'text-purple-600' },
  Email: { icon: Mail, bg: 'bg-green-100', color: 'text-green-600' },
  LinkedIn: { icon: Linkedin, bg: 'bg-indigo-100', color: 'text-indigo-600' },
  Demo: { icon: Monitor, bg: 'bg-orange-100', color: 'text-orange-600' },
  Other: { icon: Activity, bg: 'bg-slate-100', color: 'text-slate-600' },
};

// parentType: 'lead' | 'contact' | 'account'
// parentId: string | number
// parentBu: business_unit of the parent record
export default function ActivitiesRelatedTab({ parentType, parentId, parentBu }) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = { [`${parentType}_id`]: parentId };
    activitiesApi.getAll(params)
      .then(res => setActivities(res.data.data || []))
      .catch(() => addToast('Failed to load activities', 'error'))
      .finally(() => setLoading(false));
  }, [parentType, parentId]);

  const handleLogActivity = () => {
    const params = new URLSearchParams();
    params.set(`${parentType}_id`, parentId);
    if (parentBu && ['ASC', 'Simply Seated'].includes(parentBu)) {
      params.set('business_unit', parentBu);
    }
    navigate(`/activities/new?${params.toString()}`);
  };

  if (loading) {
    return <div className="py-4 text-slate-400 font-opensans text-sm text-center">Loading…</div>;
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" variant="secondary" onClick={handleLogActivity}>Log Activity</Button>
      </div>
      {activities.length === 0 ? (
        <p className="text-sm text-slate-400 font-opensans text-center py-4">No activities linked</p>
      ) : (
        <div className="space-y-1">
          {activities.map(act => {
            const cfg = TYPE_ICON[act.type] || TYPE_ICON.Other;
            const Icon = cfg.icon;
            return (
              <div
                key={act.id}
                onClick={() => navigate(`/activities/${act.id}`)}
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-arkalon-lightgrey"
              >
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded flex-shrink-0 ${cfg.bg}`}>
                  <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                </span>
                <span className="flex-1 text-sm font-opensans font-semibold text-arkalon-navy">{act.subject}</span>
                {act.outcome && (
                  <span className="text-xs text-slate-400 font-opensans">{act.outcome}</span>
                )}
                <span className="text-xs text-slate-400 font-opensans flex-shrink-0">
                  {formatLocalDatetime(act.start_datetime || act.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
