import api from './axios.js';

export const reportsApi = {
  leadSourcePerformance: (params) => api.get('/reports/lead-source-performance', { params }),
  activitySummary: (params) => api.get('/reports/activity-summary', { params }),
  commissionEarned: () => api.get('/reports/commission-earned'),
  commissionForecast: () => api.get('/reports/commission-forecast'),
  buSplit: () => api.get('/reports/bu-split'),
  // params.paid: 'unpaid' | 'paid' | 'all' (omit/all = every deal)
  commissionByDeal: (params) => api.get('/reports/commission-by-deal', { params }),
};
