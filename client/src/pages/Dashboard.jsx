import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, User, Building2, Briefcase, TrendingUp, DollarSign,
  Phone, Calendar, Mail, Linkedin, Monitor, Activity,
} from 'lucide-react';
import StatCard from '../components/UI/StatCard.jsx';
import Badge from '../components/UI/Badge.jsx';
import DashboardCharts from '../components/Dashboard/DashboardCharts.jsx';
import { formatCurrencyCompact } from '../utils/formatCurrency.js';
import { formatRelative, formatLocalDatetime, formatDate } from '../utils/formatDate.js';
import api from '../api/axios.js';
import { leadsApi } from '../api/leads.js';
import { tasksApi } from '../api/tasks.js';
import { activitiesApi } from '../api/activities.js';
import { dealsApi } from '../api/deals.js';

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

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
};

const PRIORITY_COLOURS = {
  'High': 'bg-red-100 text-red-700',
  'Normal': 'bg-blue-100 text-blue-700',
  'Low': 'bg-gray-100 text-gray-500',
};

const TYPE_ICON = {
  Call: { icon: Phone, bg: 'bg-blue-100', color: 'text-blue-600' },
  Meeting: { icon: Calendar, bg: 'bg-purple-100', color: 'text-purple-600' },
  Email: { icon: Mail, bg: 'bg-green-100', color: 'text-green-600' },
  LinkedIn: { icon: Linkedin, bg: 'bg-indigo-100', color: 'text-indigo-600' },
  Demo: { icon: Monitor, bg: 'bg-orange-100', color: 'text-orange-600' },
  Other: { icon: Activity, bg: 'bg-slate-100', color: 'text-slate-600' },
};

function isOverdue(task) {
  if (!task.due_datetime || task.status === 'Completed') return false;
  const iso = task.due_datetime.includes('T') ? task.due_datetime : task.due_datetime.replace(' ', 'T') + 'Z';
  return new Date(iso) < new Date();
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [recentLeads, setRecentLeads] = useState([]);
  const [dueTodayTasks, setDueTodayTasks] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [topOpenDeals, setTopOpenDeals] = useState([]);
  const [dealSummary, setDealSummary] = useState(null);

  useEffect(() => {
    api.get('/reports/summary')
      .then(res => setSummary(res.data.data))
      .catch(() => setSummary(null));
  }, []);

  useEffect(() => {
    leadsApi.getAll({ converted: 0, sort_by: 'created_at', sort_dir: 'desc' })
      .then(res => setRecentLeads((res.data.data || []).slice(0, 5)))
      .catch(() => setRecentLeads([]));
  }, []);

  useEffect(() => {
    tasksApi.getAll({ due_today: 'true', limit: 5 })
      .then(res => setDueTodayTasks(res.data.data || []))
      .catch(() => setDueTodayTasks([]));
  }, []);

  useEffect(() => {
    activitiesApi.getAll({ sort_by: 'created_at', sort_dir: 'desc', limit: 5 })
      .then(res => setRecentActivities(res.data.data || []))
      .catch(() => setRecentActivities([]));
  }, []);

  useEffect(() => {
    dealsApi.getAll({ open_only: 'true', sort_by: 'total_contract_earnings', sort_dir: 'desc', limit: 3 })
      .then(res => setTopOpenDeals(res.data.data || []))
      .catch(() => setTopOpenDeals([]));
  }, []);

  useEffect(() => {
    dealsApi.getSummary()
      .then(res => setDealSummary(res.data.data))
      .catch(() => setDealSummary(null));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Welcome back, Stuart</h2>
        <p className="text-arkalon-grey text-sm font-opensans mt-0.5">Here's your pipeline at a glance.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <div onClick={() => navigate('/leads')} className="cursor-pointer hover:shadow-md transition-shadow rounded-lg">
          <StatCard label="Open Leads" value={summary?.leads ?? '—'} icon={Users} colour="text-arkalon-blue" />
        </div>
        <div onClick={() => navigate('/contacts')} className="cursor-pointer hover:shadow-md transition-shadow rounded-lg">
          <StatCard label="Contacts" value={summary?.contacts ?? '—'} icon={User} colour="text-arkalon-purple" />
        </div>
        <div onClick={() => navigate('/accounts')} className="cursor-pointer hover:shadow-md transition-shadow rounded-lg">
          <StatCard label="Accounts" value={summary?.accounts ?? '—'} icon={Building2} colour="text-arkalon-grey" />
        </div>
        <div onClick={() => navigate('/deals')} className="cursor-pointer hover:shadow-md transition-shadow rounded-lg">
          <StatCard label="Open Deals" value={summary?.open_deals ?? '—'} icon={Briefcase} colour="text-arkalon-warning" />
        </div>
        <div onClick={() => navigate('/deals')} className="cursor-pointer hover:shadow-md transition-shadow rounded-lg">
          <StatCard
            label="Weighted Pipeline"
            value={summary ? formatCurrencyCompact(summary.pipeline_value) : '—'}
            icon={TrendingUp}
            colour="text-arkalon-blue"
          />
        </div>
        <div onClick={() => navigate('/deals?stage=Closed+Won')} className="cursor-pointer hover:shadow-md transition-shadow rounded-lg">
          <StatCard
            label="Closed Won"
            value={summary ? formatCurrencyCompact(summary.closed_won_value) : '—'}
            icon={DollarSign}
            colour="text-arkalon-success"
          />
        </div>
      </div>

      {/* Commission Summary */}
      <div className="bg-white border-2 border-arkalon-blue rounded-lg px-5 py-4 mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs font-montserrat font-bold text-slate-400 uppercase tracking-widest mb-1">Total Projected Commission</div>
          <div className="text-3xl font-montserrat font-bold" style={{ color: '#0073C6' }}>
            {dealSummary ? formatCurrencyCompact(dealSummary.projected_commission_total) : '—'}
          </div>
          <div className="text-xs text-slate-400 font-opensans mt-1">
            Across {dealSummary?.open_deal_count ?? '—'} open deals
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-montserrat font-semibold text-slate-400 uppercase tracking-wide mb-1">Open Pipeline</div>
          <div className="text-xl font-montserrat font-bold text-arkalon-navy">
            {dealSummary ? formatCurrencyCompact(dealSummary.open_gross_total) : '—'}
          </div>
          <div className="text-xs text-slate-400 font-opensans mt-1">
            {dealSummary ? formatCurrencyCompact(dealSummary.open_weighted_total) : '—'} weighted
          </div>
        </div>
      </div>

      {/* Dashboard Charts — pipeline by stage, commission by BU, closing soon */}
      <DashboardCharts />

      {/* Top Open Deals */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden mb-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-arkalon-lightgrey">
          <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Top Open Deals</h3>
          <button onClick={() => navigate('/deals')} className="text-xs text-arkalon-blue hover:underline font-opensans">
            View all →
          </button>
        </div>
        {topOpenDeals.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-slate-400 font-opensans text-sm">No open deals yet.</p>
            <button onClick={() => navigate('/deals/new')} className="mt-3 text-sm text-arkalon-blue hover:underline font-opensans">
              + Create a deal
            </button>
          </div>
        ) : (
          <div className="divide-y divide-arkalon-lightgrey">
            {topOpenDeals.map(deal => (
              <div key={deal.id} onClick={() => navigate(`/deals/${deal.id}`)}
                className="px-5 py-3 flex items-center gap-4 cursor-pointer hover:bg-blue-50/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-arkalon-navy font-opensans text-sm truncate">{deal.deal_name}</div>
                  {deal.account_name && (
                    <div className="text-xs text-slate-400 font-opensans truncate">{deal.account_name}</div>
                  )}
                </div>
                <div className="font-bold font-opensans text-sm flex-shrink-0" style={{ color: '#0073C6' }}>
                  {formatCurrencyCompact(deal.total_contract_earnings)}
                </div>
                {deal.close_date && (
                  <div className="text-xs text-slate-400 font-opensans flex-shrink-0">
                    {new Date(deal.close_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Leads */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden mb-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-arkalon-lightgrey">
          <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Recent Leads</h3>
          <button onClick={() => navigate('/leads')} className="text-xs text-arkalon-blue hover:underline font-opensans">
            View all →
          </button>
        </div>
        {recentLeads.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-slate-400 font-opensans text-sm">No leads yet. Create your first lead to get started.</p>
            <button onClick={() => navigate('/leads/new')} className="mt-3 text-sm text-arkalon-blue hover:underline font-opensans">
              + Create a lead
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-arkalon-lightgrey">
              <tr>
                {['Company', 'Contact', 'Status', 'Business Unit', 'Created'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentLeads.map((lead, idx) => (
                <tr
                  key={lead.id}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                  className={`border-b border-arkalon-lightgrey h-11 cursor-pointer hover:bg-blue-50/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}
                >
                  <td className="px-4 font-semibold text-arkalon-blue font-opensans hover:underline">{lead.company}</td>
                  <td className="px-4 text-slate-600 font-opensans">{lead.first_name} {lead.last_name}</td>
                  <td className="px-4">
                    {lead.lead_status && (
                      <Badge className={STATUS_COLOURS[lead.lead_status] || 'bg-gray-100 text-gray-600'}>
                        {lead.lead_status}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4">
                    {lead.business_unit && (
                      <Badge className={BU_COLOURS[lead.business_unit] || 'bg-gray-100 text-gray-600'}>
                        {lead.business_unit}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 text-slate-500 font-opensans">{formatRelative(lead.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Tasks Due Today + Recent Activities */}
      <div className="grid grid-cols-2 gap-4">
        {/* Tasks Due Today */}
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-arkalon-lightgrey">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Tasks Due Today</h3>
            <button onClick={() => navigate('/tasks')} className="text-xs text-arkalon-blue hover:underline font-opensans">
              View all tasks →
            </button>
          </div>
          {dueTodayTasks.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-slate-400 font-opensans text-sm">No tasks due today 🎉</p>
            </div>
          ) : (
            <div className="divide-y divide-arkalon-lightgrey">
              {dueTodayTasks.map(task => {
                const overdue = isOverdue(task);
                return (
                  <div
                    key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}/edit`)}
                    className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    {task.priority && (
                      <Badge className={`${PRIORITY_COLOURS[task.priority] || 'bg-gray-100'} flex-shrink-0 text-xs`}>
                        {task.priority}
                      </Badge>
                    )}
                    <span className="flex-1 text-sm font-opensans text-arkalon-navy truncate">{task.subject}</span>
                    {task.due_datetime && !task.is_all_day && (
                      <span className={`text-xs font-opensans flex-shrink-0 ${overdue ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                        {formatLocalDatetime(task.due_datetime)}
                      </span>
                    )}
                    {task.contact_name || task.lead_company || task.account_name ? (
                      <span className="text-xs text-slate-400 font-opensans flex-shrink-0 hidden xl:block truncate max-w-[120px]">
                        {task.contact_name || task.lead_company || task.account_name}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activities */}
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-arkalon-lightgrey">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Recent Activities</h3>
            <button onClick={() => navigate('/activities')} className="text-xs text-arkalon-blue hover:underline font-opensans">
              View all activities →
            </button>
          </div>
          {recentActivities.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-slate-400 font-opensans text-sm">No activities yet. Log a call or meeting to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-arkalon-lightgrey">
              {recentActivities.map(act => {
                const cfg = TYPE_ICON[act.type] || TYPE_ICON.Other;
                const Icon = cfg.icon;
                return (
                  <div
                    key={act.id}
                    onClick={() => navigate(`/activities/${act.id}`)}
                    className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded flex-shrink-0 ${cfg.bg}`}>
                      <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                    </span>
                    <span className="flex-1 text-sm font-opensans text-arkalon-navy truncate">{act.subject}</span>
                    {act.outcome && (
                      <span className="text-xs text-slate-400 font-opensans flex-shrink-0 hidden xl:block">{act.outcome}</span>
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
      </div>
    </div>
  );
}
