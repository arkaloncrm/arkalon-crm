import api from './axios.js';

export const productsApi = {
  getAll: (params) => api.get('/products', { params }),
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
  getCategories: () => api.get('/products/categories'),
  checkSku: (sku, excludeId) => api.get('/products/check-sku', { params: { sku, exclude_id: excludeId } }),
  toggleActive: (id) => api.patch(`/products/${id}/toggle-active`),
  duplicate: (id) => api.post(`/products/${id}/duplicate`),
};
