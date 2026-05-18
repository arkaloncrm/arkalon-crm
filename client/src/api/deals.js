import api from './axios.js';

export const dealsApi = {
  getAll: (params) => api.get('/deals', { params }),
  getSummary: () => api.get('/deals/summary'),
  getSummaryByBu: () => api.get('/deals/summary/by-bu'),
  getClosingSoon: (days = 30, business_unit) => api.get('/deals/closing-soon', { params: { days, business_unit } }),
  getStale: (days = 14, business_unit) => api.get('/deals/stale', { params: { days, business_unit } }),
  getById: (id) => api.get(`/deals/${id}`),
  create: (data) => api.post('/deals', data),
  update: (id, data) => api.put(`/deals/${id}`, data),
  delete: (id) => api.delete(`/deals/${id}`),
  updateStage: (id, stage) => api.patch(`/deals/${id}/stage`, { stage }),
};
