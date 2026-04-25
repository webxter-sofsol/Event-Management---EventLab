import React, { createContext, useContext, useState, ReactNode } from 'react';
import { setAccessToken } from '../api/axiosInstance';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => !!localStorage.getItem('refresh_token')
  );

  function login(access: string, refresh: string) {
    setAccessToken(access);
    localStorage.setItem('refresh_token', refresh);
    setIsAuthenticated(true);
  }

  function logout() {
    setAccessToken(null);
    localStorage.removeItem('refresh_token');
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
