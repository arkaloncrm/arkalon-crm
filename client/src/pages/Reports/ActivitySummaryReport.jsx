import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Calendar, Mail, Linkedin, Monitor, Activity, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/UI/Table.jsx';
import Badge from '../../components/UI/Badge.jsx';
import { reportsApi } from '../../api/reports.js';
import { exportToCsv } from '../../utils/exportCsv.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ReportShell, ReportLoading, ReportEmpty, ExportButton, FilterField, PillGroup, BuFilter, BU_COLOURS } from './reportPrimitives.jsx';

const PERIOD_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

const TYPE_ICON = {
  Call: { icon: Phone, bg: 'bg-blue-100', color: 'text-blue-600' },
  Meeting: { icon: Calendar, bg: 'bg-purple-100', color: 'text-purple-600' },
  Email: { icon: Mail, bg: 'bg-green-100', color: 'text-green-600' },
  LinkedIn: { icon: Linkedin, bg: 'bg-indigo-100', color: 'text-indigo-600' },
  Demo: { icon: Monitor, bg: 'bg-orange-100', color: 'text-orange-600' },
  Other: { icon: Activity, bg: 'bg-slate-100', color: 'text-slate-600' },
};

const CSV_COLUMNS = [
  { label: 'Type', key: 'type' },
  { label: 'Count', getValue: (r) => r.count || 0 },
  { label: 'Outbound', getValue: (r) => r.outbound_count || 0 },
  { label: 'Inbound', getValue: (r) => r.inbound_count || 0 },
  { label: 'BU', getValue: (r) => r.business_unit || '' },
];

export default function ActivitySummaryReport() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState(30);
  const [bu, setBu] = useState('');

  useEffect(() => {
    setData(null);
    reportsApi.activitySummary({ period, ...(bu ? { business_unit: bu } : {}) })
      .then((res) => setData(res.data.data || null))
      .catch(() => { setData({ byType: [], overdue: { count: 0 }, completedTasks: { count: 0 }, days: period }); addToast('Failed to load activity summary', 'error'); });
  }, [period, bu]);

  const byType = data?.byType || [];
  const days = data?.days ?? period;
  const overdueCount = data?.overdue?.count ?? 0;
  const completedCount = data?.completedTasks?.count ?? 0;

  const filters = (
    <>
      <FilterField label="Period">
        <PillGroup options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
      </FilterField>
      <FilterField label="Business Unit">
        <BuFilter value={bu} onChange={setBu} />
      </FilterField>
    </>
  );

  return (
    <div className="space-y-4">
      <ReportShell
        filters={
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-montserrat font-semibold text-slate-400 uppercase tracking-wide">
              Activities — Last {days} Days
            </span>
            {filters}
          </div>
        }
        action={<ExportButton onClick={() => exportToCsv('activity_summary', byType, CSV_COLUMNS)} disabled={byType.length === 0} />}
      >
        {data === null ? (
          <ReportLoading />
        ) : byType.length === 0 ? (
          <ReportEmpty message={`No activities logged in the last ${days} days.`} />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Type</Th>
                <Th>Count</Th>
                <Th>Outbound</Th>
                <Th>Inbound</Th>
                <Th>BU</Th>
              </tr>
            </Thead>
            <Tbody>
              {byType.map((r, i) => {
                const cfg = TYPE_ICON[r.type] || TYPE_ICON.Other;
                const Icon = cfg.icon;
                return (
                  <Tr key={`${r.type}|${r.business_unit}|${i}`}>
                    <Td>
                      <span className="inline-flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded ${cfg.bg}`}>
                          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                        </span>
                        <span className="font-semibold text-arkalon-navy">{r.type}</span>
                      </span>
                    </Td>
                    <Td className="font-semibold">{r.count}</Td>
                    <Td>{r.outbound_count}</Td>
                    <Td>{r.inbound_count}</Td>
                    <Td>
                      <Badge className={BU_COLOURS[r.business_unit] || 'bg-gray-100 text-gray-600'}>
                        {r.business_unit || '—'}
                      </Badge>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </ReportShell>

      {/* Task summary */}
      <div className="bg-white border border-arkalon-lightgrey rounded-lg shadow-sm p-5">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide mb-4">
          Task Summary — Last {days} Days
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 border border-arkalon-lightgrey rounded-lg px-4 py-3">
            <span className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${overdueCount > 0 ? 'bg-red-100' : 'bg-slate-100'}`}>
              <AlertCircle className={`w-5 h-5 ${overdueCount > 0 ? 'text-red-600' : 'text-slate-400'}`} />
            </span>
            <div>
              <div className="text-xs font-montserrat font-semibold text-slate-400 uppercase tracking-wide">Overdue Tasks</div>
              <div className={`text-2xl font-montserrat font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-arkalon-navy'}`}>
                {overdueCount}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 border border-arkalon-lightgrey rounded-lg px-4 py-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-green-100">
              <CheckCircle2 className="w-5 h-5 text-arkalon-success" />
            </span>
            <div>
              <div className="text-xs font-montserrat font-semibold text-slate-400 uppercase tracking-wide">Completed This Period</div>
              <div className="text-2xl font-montserrat font-bold text-arkalon-success">{completedCount}</div>
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate('/tasks?overdue=true')}
          className="mt-3 text-xs text-arkalon-blue hover:underline font-opensans"
        >
          View overdue tasks →
        </button>
      </div>
    </div>
  );
}
