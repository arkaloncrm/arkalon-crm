import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Calendar, Mail, Linkedin, Monitor, Activity, Pencil, Trash2 } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import EmptyState from '../../components/UI/EmptyState.jsx';
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/UI/Table.jsx';
import { activitiesApi } from '../../api/activities.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatLocalDatetime } from '../../utils/formatDate.js';
import { BUSINESS_UNITS, ACTIVITY_TYPES } from '../../utils/constants.js';

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

const DIRECTION_COLOURS = {
  'Outbound': 'bg-orange-100 text-orange-700',
  'Inbound': 'bg-sky-100 text-sky-700',
};

function TypeIcon({ type }) {
  const cfg = TYPE_ICON[type] || TYPE_ICON.Other;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded ${cfg.bg} mr-1.5 flex-shrink-0`}>
      <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
    </span>
  );
}

export default function ActivitiesList() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [buFilter, setBuFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchActivities = useCallback(() => {
    setLoading(true);
    const params = {};
    if (buFilter) params.business_unit = buFilter;
    if (typeFilter) params.type = typeFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;

    activitiesApi.getAll(params)
      .then(res => setActivities(res.data.data || []))
      .catch(() => addToast('Failed to load activities', 'error'))
      .finally(() => setLoading(false));
  }, [buFilter, typeFilter, dateFrom, dateTo]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this activity?')) return;
    try {
      await activitiesApi.delete(id);
      addToast('Activity deleted', 'success');
      setActivities(prev => prev.filter(a => a.id !== id));
    } catch {
      addToast('Failed to delete activity', 'error');
    }
  };

  const searchLower = search.toLowerCase();
  const filtered = activities.filter(row => {
    if (!search) return true;
    return (
      (row.subject?.toLowerCase() || '').includes(searchLower) ||
      (row.contact_name?.toLowerCase() || '').includes(searchLower) ||
      (row.lead_company?.toLowerCase() || '').includes(searchLower) ||
      (row.account_name?.toLowerCase() || '').includes(searchLower)
    );
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Activities</h2>
          <span className="bg-slate-100 text-slate-500 text-xs font-montserrat font-semibold px-2 py-0.5 rounded-full">
            {filtered.length}
          </span>
        </div>
        <Button onClick={() => navigate('/activities/new')}>+ Log Activity</Button>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search activities…"
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 w-56"
        />
        <select value={buFilter} onChange={e => setBuFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
          <option value="">All Business Units</option>
          {BUSINESS_UNITS.map(u => <option key={u}>{u}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
          <option value="">All Types</option>
          {ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-opensans">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-1.5 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30" />
          <label className="text-xs text-slate-400 font-opensans">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-1.5 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30" />
        </div>
      </div>

      <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 font-opensans text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No activities yet"
            description="Log calls, meetings, and emails to track your outreach."
            action={() => navigate('/activities/new')}
            actionLabel="Log your first activity"
          />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Type</Th>
                <Th>Subject</Th>
                <Th>Contact / Lead</Th>
                <Th>Account</Th>
                <Th>Direction</Th>
                <Th>Outcome</Th>
                <Th>Date</Th>
                <Th>Business Unit</Th>
                <Th></Th>
              </tr>
            </Thead>
            <Tbody>
              {filtered.map(row => (
                <Tr key={row.id} onClick={() => navigate(`/activities/${row.id}`)} className="cursor-pointer">
                  <Td>
                    <div className="flex items-center">
                      <TypeIcon type={row.type} />
                      <span className="text-xs font-opensans text-slate-600">{row.type}</span>
                    </div>
                  </Td>
                  <Td className="font-semibold text-arkalon-blue">{row.subject}</Td>
                  <Td className="text-slate-600">{row.contact_name || row.lead_company || '—'}</Td>
                  <Td className="text-slate-600">{row.account_name || '—'}</Td>
                  <Td>
                    {row.direction ? (
                      <Badge className={DIRECTION_COLOURS[row.direction] || 'bg-gray-100 text-gray-600'}>
                        {row.direction}
                      </Badge>
                    ) : '—'}
                  </Td>
                  <Td className="text-slate-500 text-xs">{row.outcome || '—'}</Td>
                  <Td className="text-slate-500 text-xs">{formatLocalDatetime(row.start_datetime)}</Td>
                  <Td>
                    {row.business_unit && (
                      <Badge className={BU_COLOURS[row.business_unit] || 'bg-gray-100 text-gray-600'}>
                        {row.business_unit}
                      </Badge>
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/activities/${row.id}/edit`); }}
                        className="p-1 text-slate-400 hover:text-arkalon-blue"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => handleDelete(row.id, e)}
                        className="p-1 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
