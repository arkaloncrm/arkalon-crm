import React, { useState, useCallback } from 'react';
import Badge from '../../components/UI/Badge.jsx';
import { DEAL_STAGES } from '../../utils/constants.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import { dealsApi } from '../../api/deals.js';
import { useToast } from '../../context/ToastContext.jsx';

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
};

const COLUMN_STYLES = {
  'Prospect':         { header: 'bg-gray-100 text-gray-600', border: 'border-l-gray-400', bg: '' },
  'Qualified':        { header: 'bg-gray-100 text-gray-700', border: 'border-l-gray-500', bg: '' },
  'Contacted':        { header: 'bg-gray-100 text-gray-700', border: 'border-l-slate-400', bg: '' },
  'Proposal Sent':    { header: 'bg-blue-50 text-blue-700', border: 'border-l-blue-400', bg: '' },
  'Demo Done':        { header: 'bg-blue-50 text-blue-700', border: 'border-l-blue-500', bg: '' },
  'Negotiation':      { header: 'bg-amber-50 text-amber-800', border: 'border-l-amber-400', bg: '' },
  'Verbal Agreement': { header: 'bg-amber-50 text-amber-800', border: 'border-l-amber-500', bg: '' },
  'Contract Sent':    { header: 'bg-amber-50 text-amber-800', border: 'border-l-amber-600', bg: '' },
  'Closed Won':       { header: 'bg-green-100 text-green-800', border: 'border-l-green-500', bg: 'bg-green-50/60' },
  'Closed Lost':      { header: 'bg-red-100 text-red-700', border: 'border-l-red-400', bg: 'bg-red-50/60' },
};

function DealCard({ deal, onDragStart, onClick }) {
  const styles = COLUMN_STYLES[deal.stage] || COLUMN_STYLES['Prospect'];
  return (
    <div
      draggable
      onDragStart={() => onDragStart(deal)}
      onClick={() => onClick(deal.id)}
      className={`bg-white rounded-lg shadow-sm border border-arkalon-lightgrey border-l-4 ${styles.border} p-3 cursor-pointer hover:shadow-md transition-shadow select-none`}
    >
      <div className="font-montserrat font-semibold text-arkalon-navy text-sm mb-0.5 truncate">{deal.deal_name}</div>
      {deal.account_name && (
        <div className="text-xs text-slate-500 font-opensans mb-2 truncate">{deal.account_name}</div>
      )}
      <div className="font-bold text-sm mb-2" style={{ color: '#0073C6' }}>
        {formatCurrency(deal.total_contract_earnings)}
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {deal.business_unit && (
          <Badge className={`text-[10px] py-0 ${BU_COLOURS[deal.business_unit] || 'bg-gray-100 text-gray-600'}`}>
            {deal.business_unit}
          </Badge>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400 font-opensans">
          {formatCurrency(deal.gross_total_value)} gross
        </span>
        {deal.close_date && (
          <span className="text-[10px] text-slate-400 font-opensans">{formatDate(deal.close_date)}</span>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({ stage, deals, onDragStart, onDragOver, onDrop, onDealClick }) {
  const styles = COLUMN_STYLES[stage] || COLUMN_STYLES['Prospect'];
  return (
    <div
      className={`flex-shrink-0 w-56 rounded-lg flex flex-col ${styles.bg || 'bg-slate-50'}`}
      onDragOver={e => { e.preventDefault(); onDragOver(stage); }}
      onDrop={() => onDrop(stage)}
    >
      <div className={`px-3 py-2.5 rounded-t-lg ${styles.header}`}>
        <div className="flex items-center justify-between">
          <span className="font-montserrat font-semibold text-xs uppercase tracking-wide truncate">{stage}</span>
          <span className="bg-white/60 text-xs font-semibold px-1.5 py-0.5 rounded-full ml-1 flex-shrink-0">{deals.length}</span>
        </div>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-240px)]">
        {deals.length === 0 && (
          <div className="text-center text-slate-400 text-xs font-opensans py-6">No deals</div>
        )}
        {deals.map(deal => (
          <DealCard key={deal.id} deal={deal} onDragStart={onDragStart} onClick={onDealClick} />
        ))}
      </div>
    </div>
  );
}

export default function DealKanban({ deals, onStageChange, onDealClick }) {
  const { addToast } = useToast();
  const [draggingDeal, setDraggingDeal] = useState(null);
  const [overStage, setOverStage] = useState(null);
  const [localDeals, setLocalDeals] = useState(null);

  const displayDeals = localDeals !== null ? localDeals : deals;

  const dealsByStage = DEAL_STAGES.reduce((acc, stage) => {
    acc[stage] = displayDeals.filter(d => d.stage === stage);
    return acc;
  }, {});

  const handleDragStart = useCallback((deal) => {
    setDraggingDeal(deal);
  }, []);

  const handleDragOver = useCallback((stage) => {
    setOverStage(stage);
  }, []);

  const handleDrop = useCallback(async (targetStage) => {
    if (!draggingDeal || draggingDeal.stage === targetStage) {
      setDraggingDeal(null);
      setOverStage(null);
      return;
    }

    const prevDeals = localDeals !== null ? localDeals : deals;
    const updatedDeals = prevDeals.map(d =>
      d.id === draggingDeal.id ? { ...d, stage: targetStage } : d
    );
    setLocalDeals(updatedDeals);
    setDraggingDeal(null);
    setOverStage(null);

    try {
      await dealsApi.updateStage(draggingDeal.id, targetStage);
      onStageChange();
      setLocalDeals(null);
    } catch {
      setLocalDeals(prevDeals);
      addToast('Failed to update deal stage', 'error');
    }
  }, [draggingDeal, localDeals, deals, onStageChange, addToast]);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {DEAL_STAGES.map(stage => (
          <KanbanColumn
            key={stage}
            stage={stage}
            deals={dealsByStage[stage] || []}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDealClick={onDealClick}
          />
        ))}
      </div>
    </div>
  );
}
