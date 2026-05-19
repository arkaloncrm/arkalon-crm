import api from './axios.js';

export const scanApi = {
  businessCard: (data) => api.post('/scan/business-card', data),
};
