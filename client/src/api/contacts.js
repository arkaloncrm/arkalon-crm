import api from './axios.js';

export const contactsApi = {
  getAll: (params) => api.get('/contacts', { params }),
  getById: (id) => api.get(`/contacts/${id}`),
  create: (data) => api.post('/contacts', data),
  update: (id, data) => api.put(`/contacts/${id}`, data),
  delete: (id) => api.delete(`/contacts/${id}`),
  bulkDelete: (ids) => api.post('/contacts/bulk-delete', { ids }),
};
