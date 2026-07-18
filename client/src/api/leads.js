import api from './axios.js';

export const leadsApi = {
  getAll: (params) => api.get('/leads', { params }),
  getById: (id) => api.get(`/leads/${id}`),
  create: (data) => api.post('/leads', data),
  update: (id, data) => api.put(`/leads/${id}`, data),
  delete: (id) => api.delete(`/leads/${id}`),
  convert: (id, data) => api.post(`/leads/${id}/convert`, data),
  bulkDelete: (ids) => api.post('/leads/bulk-delete', { ids }),
};
