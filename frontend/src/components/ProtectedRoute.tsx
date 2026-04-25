import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

export default function ProtectedRoute() {
  const hasRefreshToken = !!localStorage.getItem('refresh_token');
  return hasRefreshToken ? <Outlet /> : <Navigate to="/login" replace />;
}
