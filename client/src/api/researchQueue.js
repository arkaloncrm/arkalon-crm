import api from './axios.js';

export const researchQueueApi = {
  getAll: (params) => api.get('/research-queue', { params }),
  getById: (id) => api.get(`/research-queue/${id}`),
  create: (data) => api.post('/research-queue', data),
  update: (id, data) => api.put(`/research-queue/${id}`, data),
  delete: (id) => api.delete(`/research-queue/${id}`),
  convert: (id, data) => api.post(`/research-queue/${id}/convert`, data),
  reject: (id, data) => api.post(`/research-queue/${id}/reject`, data),
  park: (id) => api.post(`/research-queue/${id}/park`),
  approve: (id) => api.post(`/research-queue/${id}/approve`),
};
