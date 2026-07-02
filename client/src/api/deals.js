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
  patch: (id, data) => api.patch(`/deals/${id}`, data),
  // Batch mark commission paid/unpaid across several deals in one request.
  markCommissionPaid: (ids, paid = true) => api.post('/deals/commission/mark-paid', { ids, paid }),
  delete: (id) => api.delete(`/deals/${id}`),
  updateStage: (id, stage) => api.patch(`/deals/${id}/stage`, { stage }),
  getContacts: (id) => api.get(`/deals/${id}/contacts`),
  addContact: (id, data) => api.post(`/deals/${id}/contacts`, data),
  updateContactRole: (id, contactId, role) => api.patch(`/deals/${id}/contacts/${contactId}`, { role }),
  removeContact: (id, contactId) => api.delete(`/deals/${id}/contacts/${contactId}`),
};
