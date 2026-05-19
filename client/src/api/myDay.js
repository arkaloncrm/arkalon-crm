import api from './axios.js';

export const myDayApi = {
  getAll: () => api.get('/my-day'),
  create: (data) => api.post('/my-day', data),
  toggleComplete: (id) => api.patch(`/my-day/${id}/complete`),
  push: (id) => api.patch(`/my-day/${id}/push`),
  delete: (id) => api.delete(`/my-day/${id}`),
  rollover: () => api.post('/my-day/rollover'),
};
