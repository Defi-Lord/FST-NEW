// src/routes/RequireAuth.tsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isAuthed } from '../utils/auth';

export default function RequireAuth() {
  const loc = useLocation();
  if (!isAuthed()) {
    return <Navigate to="/" replace state={{ from: loc }} />;
  }
  return <Outlet />;
}
