const STAGE_MAP = {
  'Prospect':         { probability: 10,  forecast_category: 'Pipeline' },
  'Qualified':        { probability: 25,  forecast_category: 'Pipeline' },
  'Contacted':        { probability: 30,  forecast_category: 'Pipeline' },
  'Proposal Sent':    { probability: 50,  forecast_category: 'Best Case' },
  'Demo Done':        { probability: 60,  forecast_category: 'Best Case' },
  'Negotiation':      { probability: 75,  forecast_category: 'Commit' },
  'Verbal Agreement': { probability: 85,  forecast_category: 'Commit' },
  'Contract Sent':    { probability: 90,  forecast_category: 'Commit' },
  'Closed Won':       { probability: 100, forecast_category: 'Closed Won' },
  'Closed Lost':      { probability: 0,   forecast_category: 'Omitted' },
};

const r = (v) => Math.round((Number(v) || 0) * 100) / 100;

function calculateDealFinancials(deal, lineItems = []) {
  const recurringMonthlyTotal = r(
    lineItems
      .filter(item => item.is_recurring == 1 || item.is_recurring === true)
      .reduce((sum, item) => {
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unit_price) || 0;
        return sum + (quantity * unitPrice);
      }, 0)
  );

  const nonRecurringTotal = r(
    lineItems
      .filter(item => !(item.is_recurring == 1 || item.is_recurring === true))
      .reduce((sum, item) => {
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unit_price) || 0;
        return sum + (quantity * unitPrice);
      }, 0)
  );

  const termMonths = Number(deal.contract_term_months) || 0;

  const monthly_recurring_revenue = deal.business_unit === 'ASC' ? recurringMonthlyTotal : 0;

  const gross_total_value = deal.business_unit === 'ASC'
    ? r((monthly_recurring_revenue * termMonths) + nonRecurringTotal)
    : r(recurringMonthlyTotal + nonRecurringTotal);

  const probability = STAGE_MAP[deal.stage]?.probability ?? 10;
  const forecast_category = STAGE_MAP[deal.stage]?.forecast_category ?? 'Pipeline';
  const weighted_value = r(gross_total_value * probability / 100);

  let commission_percentage = null;
  let commission_amount = 0;
  let total_contract_earnings = 0;

  const hasOverride =
    deal.commission_override_amount !== null &&
    deal.commission_override_amount !== undefined &&
    String(deal.commission_override_amount).trim() !== '';

  if (hasOverride) {
    const overrideAmount = Number(deal.commission_override_amount);
    commission_amount = r(overrideAmount);
    total_contract_earnings = commission_amount;
    commission_percentage = null;
  } else if (deal.business_unit === 'Simply Seated') {
    commission_percentage = 0.10;
    commission_amount = r(gross_total_value * 0.10);
    total_contract_earnings = commission_amount;
  } else if (deal.business_unit === 'ASC') {
    if (deal.deal_type === 'Direct Customer') {
      commission_percentage = 0.14;
      total_contract_earnings = r(monthly_recurring_revenue * termMonths * 0.14);
    } else {
      commission_percentage = 0.08;
      const effectiveMonths = Math.min(termMonths, 36);
      total_contract_earnings = r(monthly_recurring_revenue * effectiveMonths * 0.08);
    }
    commission_amount = total_contract_earnings;
  }

  return {
    gross_total_value,
    monthly_recurring_revenue,
    commission_percentage,
    commission_amount,
    total_contract_earnings,
    weighted_value,
    probability,
    forecast_category,
  };
}

function commissionBasisString(deal) {
  if (
    deal.commission_override_amount !== null &&
    deal.commission_override_amount !== undefined &&
    String(deal.commission_override_amount).trim() !== ''
  ) {
    return 'Manual override — auto-calculation disabled';
  }
  if (deal.business_unit === 'Simply Seated') {
    return '10% × gross value';
  }
  if (deal.business_unit === 'ASC') {
    const rate = deal.deal_type === 'Direct Customer' ? '14%' : '8%';
    const cap = deal.deal_type !== 'Direct Customer' ? ' (capped at 36 months)' : '';
    const mrr = Number(deal.monthly_recurring_revenue) || 0;
    const term = Number(deal.contract_term_months) || 0;
    return `${rate} × $${mrr.toLocaleString('en-AU')}/mo MRR × ${term} months${cap}`;
  }
  return '—';
}

module.exports = { STAGE_MAP, calculateDealFinancials, commissionBasisString };
