import api from './axios.js';

export const reportsApi = {
  leadSourcePerformance: (params) => api.get('/reports/lead-source-performance', { params }),
  activitySummary: (params) => api.get('/reports/activity-summary', { params }),
};
