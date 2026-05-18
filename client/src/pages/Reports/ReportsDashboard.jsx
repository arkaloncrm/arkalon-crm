import React, { useState } from 'react';
import { TrendingUp, DollarSign, Calendar, AlertTriangle, BarChart2, Activity } from 'lucide-react';
import OpenPipelineReport from './OpenPipelineReport.jsx';
import CommissionForecastReport from './CommissionForecastReport.jsx';
import ClosingSoonReport from './ClosingSoonReport.jsx';
import StaleDealsReport from './StaleDealsReport.jsx';
import LeadSourceReport from './LeadSourceReport.jsx';
import ActivitySummaryReport from './ActivitySummaryReport.jsx';

const REPORTS = [
  {
    id: 'open-pipeline',
    label: 'Open Pipeline',
    icon: TrendingUp,
    description: 'All open deals by stage and value',
    component: OpenPipelineReport,
  },
  {
    id: 'commission-forecast',
    label: 'Commission Forecast',
    icon: DollarSign,
    description: 'Projected commission by business unit and deal type',
    component: CommissionForecastReport,
  },
  {
    id: 'closing-soon',
    label: 'Closing Soon',
    icon: Calendar,
    description: 'Deals overdue or due to close in the selected window',
    component: ClosingSoonReport,
  },
  {
    id: 'stale-deals',
    label: 'Stale Deals',
    icon: AlertTriangle,
    description: 'Open deals with no recent activity',
    component: StaleDealsReport,
  },
  {
    id: 'lead-source',
    label: 'Lead Source Performance',
    icon: BarChart2,
    description: 'Where your leads and deals are coming from',
    component: LeadSourceReport,
  },
  {
    id: 'activity-summary',
    label: 'Activity Summary',
    icon: Activity,
    description: 'Calls, meetings and emails logged — last N days',
    component: ActivitySummaryReport,
  },
];

export default function ReportsDashboard() {
  const [activeId, setActiveId] = useState('open-pipeline');
  const active = REPORTS.find((r) => r.id === activeId) || REPORTS[0];
  const ActiveReport = active.component;

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Reports</h2>
        <p className="text-arkalon-grey text-sm font-opensans mt-0.5">
          Pipeline intelligence for ASC Technologies &amp; Simply Seated
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const isActive = r.id === activeId;
          return (
            <button
              key={r.id}
              onClick={() => setActiveId(r.id)}
              className={`text-left bg-white rounded-lg shadow-sm border border-arkalon-lightgrey border-l-4 p-4 transition-all ${
                isActive
                  ? 'border-l-arkalon-blue bg-blue-50/50'
                  : 'border-l-transparent hover:shadow-md'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${
                  isActive ? 'bg-arkalon-blue text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="font-montserrat font-semibold text-arkalon-navy text-sm">{r.label}</div>
              <div className="text-xs font-opensans text-slate-400 mt-0.5">{r.description}</div>
            </button>
          );
        })}
      </div>

      <ActiveReport />
    </div>
  );
}
