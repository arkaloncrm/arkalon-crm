import api from './axios.js';

export const reportsApi = {
  leadSourcePerformance: (params) => api.get('/reports/lead-source-performance', { params }),
  activitySummary: (params) => api.get('/reports/activity-summary', { params }),
  commissionEarned: () => api.get('/reports/commission-earned'),
  commissionForecast: () => api.get('/reports/commission-forecast'),
  buSplit: () => api.get('/reports/bu-split'),
  // params.paid: 'unpaid' | 'paid' | 'all' (omit/all = every deal)
  commissionByDeal: (params) => api.get('/reports/commission-by-deal', { params }),
  // Single source of truth for "commission by month, Won vs open pipeline" —
  // the Dashboard's My Commission Pipeline widget and the Commission by Month
  // report both read this same endpoint so their figures always reconcile.
  // params: date_from, date_to (close_date range), business_unit, paid ('paid'|'unpaid'|'all'), stage_group ('won'|'open'|'all')
  commissionByMonth: (params) => api.get('/reports/commission-by-month', { params }),
};
