import api from './axios.js';

export const notesApi = {
  getAll: (params) => api.get('/notes', { params }),
  create: (data) => api.post('/notes', data),
  // Fired after a note is saved — returns a one-tap task suggestion (or none).
  suggestTask: (data) => api.post('/notes/suggest-task', data),
  update: (id, data) => api.put(`/notes/${id}`, data),
  delete: (id) => api.delete(`/notes/${id}`),
};
