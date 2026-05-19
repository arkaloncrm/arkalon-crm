import React, { useState } from 'react';
import { Wallet, DollarSign, TrendingUp, Scale, Calendar, ListChecks, AlertTriangle, BarChart2, Activity } from 'lucide-react';
import CommissionEarnedReport from './CommissionEarnedReport.jsx';
import CommissionForecastReport from './CommissionForecastReport.jsx';
import OpenPipelineReport from './OpenPipelineReport.jsx';
import BuSplitReport from './BuSplitReport.jsx';
import ClosingSoonReport from './ClosingSoonReport.jsx';
import CommissionByDealReport from './CommissionByDealReport.jsx';
import StaleDealsReport from './StaleDealsReport.jsx';
import LeadSourceReport from './LeadSourceReport.jsx';
import ActivitySummaryReport from './ActivitySummaryReport.jsx';

const REPORTS = [
  {
    id: 'commission-earned',
    label: 'Commission Earned',
    icon: Wallet,
    description: 'Commission from deals closed won this month',
    component: CommissionEarnedReport,
  },
  {
    id: 'commission-forecast',
    label: 'Commission Forecast',
    icon: DollarSign,
    description: 'Forecast commission this quarter, grouped by month',
    component: CommissionForecastReport,
  },
  {
    id: 'open-pipeline',
    label: 'Pipeline Commission',
    icon: TrendingUp,
    description: 'All open deals by stage and commission value',
    component: OpenPipelineReport,
  },
  {
    id: 'bu-split',
    label: 'ASC vs Simply Seated',
    icon: Scale,
    description: 'Commission split across the two business units',
    component: BuSplitReport,
  },
  {
    id: 'closing-soon',
    label: 'Closing Soon',
    icon: Calendar,
    description: 'Overdue deals and 30/60/90-day close windows',
    component: ClosingSoonReport,
  },
  {
    id: 'commission-by-deal',
    label: 'Commission by Deal',
    icon: ListChecks,
    description: 'Every deal — sortable, filterable, exportable',
    component: CommissionByDealReport,
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
  const [activeId, setActiveId] = useState('commission-earned');
  const active = REPORTS.find((r) => r.id === activeId) || REPORTS[0];
  const ActiveReport = active.component;

  return (
    <div className="arkalon-page arkalon-reports">
      <div className="mb-6">
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Reports</h2>
        <p className="text-arkalon-grey text-sm font-opensans mt-0.5">
          Commission intelligence for ASC Technologies &amp; Simply Seated
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
              className={`text-left arkalon-card border-l-4 p-4 transition-all ${
                isActive ? '' : 'border-l-transparent hover:shadow-md'
              }`}
              style={isActive ? { borderLeftColor: 'var(--arkalon-copper)', background: 'var(--arkalon-surface-strong)' } : undefined}
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
