import api from './axios.js';

export const validationApi = {
  checkDuplicate: (data) => api.post('/validation/check-duplicate', data),
};
