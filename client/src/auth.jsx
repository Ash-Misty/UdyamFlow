import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('udyamflow-user') || 'null'); } catch { return null; }
  });
  const [checking, setChecking] = useState(Boolean(localStorage.getItem('udyamflow-token')));

  useEffect(() => {
    if (!localStorage.getItem('udyamflow-token')) return setChecking(false);
    api('/auth/me')
      .then(setUser)
      .catch((error) => {
        if (error instanceof TypeError) return;
        localStorage.removeItem('udyamflow-token');
        localStorage.removeItem('udyamflow-user');
        setUser(null);
      })
      .finally(() => setChecking(false));
  }, []);

  const value = useMemo(() => ({
    user,
    checking,
    async login(email, password) {
      const result = await api('/auth/login', { method: 'POST', body: { email, password } });
      localStorage.setItem('udyamflow-token', result.token);
      localStorage.setItem('udyamflow-user', JSON.stringify(result.user));
      setUser(result.user);
      return result.user;
    },
    logout() {
      localStorage.removeItem('udyamflow-token');
      localStorage.removeItem('udyamflow-user');
      setUser(null);
    },
  }), [user, checking]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
