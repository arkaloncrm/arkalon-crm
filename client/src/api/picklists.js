import api from './axios.js';

export const picklistsApi = {
  // Active values for a single list, ordered by sort_order (server-cached)
  get: (listName) => api.get(`/settings/picklists/${listName}`),
  // All lists with every value (incl. inactive) for the Settings manager
  getAll: () => api.get('/settings/picklists'),
  create: (listName, data) => api.post(`/settings/picklists/${listName}`, data),
  update: (listName, id, data) => api.put(`/settings/picklists/${listName}/${id}`, data),
  remove: (listName, id) => api.delete(`/settings/picklists/${listName}/${id}`),
};
