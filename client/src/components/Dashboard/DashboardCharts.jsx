import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, CartesianGrid,
} from 'recharts';
import Badge from '../UI/Badge.jsx';
import { dealsApi } from '../../api/deals.js';
import { formatCurrency, formatCurrencyCompact } from '../../utils/formatCurrency.js';
import { closeDateInfo } from '../../utils/formatDate.js';
import { STAGE_COLOURS } from '../../utils/constants.js';

const PIPELINE_STAGES = [
  { stage: 'Prospect', forecast: 'Pipeline' },
  { stage: 'Qualified', forecast: 'Pipeline' },
  { stage: 'Contacted', forecast: 'Pipeline' },
  { stage: 'Proposal Sent', forecast: 'Best Case' },
  { stage: 'Demo Done', forecast: 'Best Case' },
  { stage: 'Negotiation', forecast: 'Commit' },
  { stage: 'Verbal Agreement', forecast: 'Commit' },
  { stage: 'Contract Sent', forecast: 'Commit' },
];

const FORECAST_FILL = {
  'Pipeline': '#94A3B8',
  'Best Case': '#0073C6',
  'Commit': '#F59E0B',
};

const BU_FILL = {
  'ASC': '#0073C6',
  'Simply Seated': '#002B5C',
};

function ChartCard({ title, children }) {
  return (
    <div className="arkalon-card overflow-hidden">
      <div className="px-5 py-3 border-b border-arkalon-lightgrey">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ChartEmpty({ message }) {
  return (
    <div className="flex items-center justify-center h-[260px] text-slate-400 font-opensans text-sm">
      {message}
    </div>
  );
}

function PipelineTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white rounded-lg shadow-md border border-arkalon-lightgrey px-3 py-2 text-xs font-opensans">
      <div className="font-montserrat font-semibold text-arkalon-navy mb-0.5">{d.stage}</div>
      <div className="text-slate-500">{d.deal_count} deal{d.deal_count === 1 ? '' : 's'}</div>
      <div className="font-semibold mt-0.5" style={{ color: '#0073C6' }}>{formatCurrency(d.total_commission)}</div>
    </div>
  );
}

function BuTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white rounded-lg shadow-md border border-arkalon-lightgrey px-3 py-2 text-xs font-opensans">
      <div className="font-montserrat font-semibold text-arkalon-navy mb-0.5">{d.business_unit}</div>
      <div className="text-slate-500">{d.deal_count} deal{d.deal_count === 1 ? '' : 's'}</div>
      <div className="font-semibold mt-0.5" style={{ color: '#0073C6' }}>{formatCurrency(d.total_commission)}</div>
    </div>
  );
}

const CLOSE_TONE = {
  overdue: 'text-red-600',
  today: 'text-amber-600',
  soon: 'text-red-600',
  later: 'text-slate-500',
  none: 'text-slate-400',
};

export default function DashboardCharts() {
  const navigate = useNavigate();
  const [openDeals, setOpenDeals] = useState(null);
  const [buSummary, setBuSummary] = useState(null);
  const [closingSoon, setClosingSoon] = useState(null);

  useEffect(() => {
    dealsApi.getAll({ open_only: 'true' })
      .then(res => setOpenDeals(res.data.data || []))
      .catch(() => setOpenDeals([]));
  }, []);

  useEffect(() => {
    dealsApi.getSummaryByBu()
      .then(res => setBuSummary(res.data.data || []))
      .catch(() => setBuSummary([]));
  }, []);

  useEffect(() => {
    dealsApi.getClosingSoon(30)
      .then(res => setClosingSoon(res.data.data || []))
      .catch(() => setClosingSoon([]));
  }, []);

  const deals = openDeals || [];
  const chartData = PIPELINE_STAGES.map(({ stage, forecast }) => {
    const stageDeals = deals.filter(d => d.stage === stage);
    return {
      stage,
      forecast,
      deal_count: stageDeals.length,
      total_commission: stageDeals.reduce((sum, d) => sum + (d.total_contract_earnings || 0), 0),
    };
  });
  const pipelineEmpty = openDeals !== null && deals.length === 0;

  const buRows = buSummary || [];
  const totalCommission = buRows.reduce((s, b) => s + (b.total_commission || 0), 0);
  const buEmpty = buSummary !== null && buRows.length === 0;

  return (
    <div className="mb-6 space-y-4">
      {/* Chart 1 — Pipeline by Stage */}
      <ChartCard title="Pipeline by Stage">
        {openDeals === null ? (
          <div className="flex items-center justify-center h-[280px] text-slate-400 font-opensans text-sm">Loading…</div>
        ) : pipelineEmpty ? (
          <div className="flex items-center justify-center h-[280px] text-slate-400 font-opensans text-sm">
            No open deals in pipeline
          </div>
        ) : (
          <>
            <div className="w-full h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                  <CartesianGrid horizontal={false} stroke="#F1F5F9" />
                  <XAxis
                    type="number"
                    tickFormatter={formatCurrencyCompact}
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    width={108}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<PipelineTooltip />} cursor={{ fill: '#F8FAFC' }} />
                  <Bar dataKey="total_commission" radius={[0, 4, 4, 0]} barSize={18}>
                    {chartData.map((entry) => (
                      <Cell key={entry.stage} fill={FORECAST_FILL[entry.forecast]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 pl-2">
              {Object.entries(FORECAST_FILL).map(([label, fill]) => (
                <div key={label} className="flex items-center gap-1.5 text-xs font-opensans text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: fill }} />
                  {label}
                </div>
              ))}
            </div>
          </>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Chart 2 — Commission by Business Unit */}
        <ChartCard title="Commission by Business Unit">
          {buSummary === null ? (
            <ChartEmpty message="Loading…" />
          ) : buEmpty ? (
            <ChartEmpty message="No open deals" />
          ) : (
            <div className="w-full h-[260px]">
              <div className="relative h-[185px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={buRows}
                      dataKey="total_commission"
                      nameKey="business_unit"
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={82}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {buRows.map((entry) => (
                        <Cell key={entry.business_unit} fill={BU_FILL[entry.business_unit] || '#94A3B8'} />
                      ))}
                    </Pie>
                    <Tooltip content={<BuTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 font-montserrat font-semibold">Total</div>
                  <div className="text-lg font-montserrat font-bold" style={{ color: '#0073C6' }}>
                    {formatCurrencyCompact(totalCommission)}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 px-1">
                {buRows.map(b => (
                  <div key={b.business_unit} className="flex items-center gap-2 text-xs font-opensans">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: BU_FILL[b.business_unit] || '#94A3B8' }} />
                    <span className="text-slate-600 flex-1 truncate">{b.business_unit}</span>
                    <span className="font-semibold text-arkalon-navy">{formatCurrency(b.total_commission)}</span>
                    <span className="text-slate-400">· {b.deal_count} deal{b.deal_count === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>

        {/* Chart 3 — Closing Soon */}
        <div className="bg-white border border-arkalon-lightgrey rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-arkalon-lightgrey">
            <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">Closing Soon</h3>
            <button onClick={() => navigate('/deals')} className="text-xs text-arkalon-blue hover:underline font-opensans">
              View all →
            </button>
          </div>
          {closingSoon === null ? (
            <ChartEmpty message="Loading…" />
          ) : closingSoon.length === 0 ? (
            <div className="flex items-center justify-center h-[260px] text-slate-400 font-opensans text-sm px-4 text-center">
              No deals closing in the next 30 days 🎉
            </div>
          ) : (
            <div className="h-[260px] overflow-y-auto divide-y divide-arkalon-lightgrey">
              {closingSoon.map(deal => {
                const info = closeDateInfo(deal.close_date);
                return (
                  <div
                    key={deal.id}
                    onClick={() => navigate(`/deals/${deal.id}`)}
                    className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-blue-50/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-arkalon-navy font-opensans text-sm truncate">{deal.deal_name}</div>
                      <div className="flex items-center gap-2">
                        {deal.account_name && (
                          <span className="text-xs text-slate-400 font-opensans truncate">{deal.account_name}</span>
                        )}
                        <span className={`text-xs font-opensans font-semibold ${CLOSE_TONE[info.tone]}`}>{info.label}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold font-opensans text-sm" style={{ color: '#0073C6' }}>
                        {formatCurrencyCompact(deal.total_contract_earnings)}
                      </div>
                      <Badge className={`${STAGE_COLOURS[deal.stage] || 'bg-gray-100 text-gray-700'} mt-0.5`}>
                        {deal.stage}
                      </Badge>
                    </div>
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
