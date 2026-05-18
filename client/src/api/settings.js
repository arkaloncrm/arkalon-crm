import api from './axios.js';

export const settingsApi = {
  getProfile: () => api.get('/settings/profile'),
  updateProfile: (data) => api.patch('/settings/profile', data),
  getStats: () => api.get('/settings/stats'),
  // responseType: 'blob' is critical — without it Axios treats xlsx bytes as text/JSON
  exportEntity: (entity) => api.get(`/settings/export/${entity}`, { responseType: 'blob' }),
  runImport: (payload) => api.post('/settings/import', payload),
};
