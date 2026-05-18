import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('arkalon_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('arkalon_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then((res) => {
        setUser(res.data.data);
        localStorage.setItem('arkalon_user', JSON.stringify(res.data.data));
      })
      .catch(() => {
        localStorage.removeItem('arkalon_token');
        localStorage.removeItem('arkalon_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, user: userData } = res.data.data;
    localStorage.setItem('arkalon_token', token);
    localStorage.setItem('arkalon_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('arkalon_token');
    localStorage.removeItem('arkalon_user');
    setUser(null);
  };

  // Re-fetch the current user so the topbar reflects profile edits immediately.
  const refreshUser = async () => {
    const res = await api.get('/auth/me');
    setUser(res.data.data);
    localStorage.setItem('arkalon_user', JSON.stringify(res.data.data));
    return res.data.data;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
