import api from './axios.js';

export const bulkImportApi = {
  preview: (data) => api.post('/bulk-import/preview', data),
  confirm: (data) => api.post('/bulk-import/confirm', data),
};
