// src/routes/RedirectIfAuthed.tsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthed } from '../utils/auth';

export default function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  if (isAuthed()) return <Navigate to="/homehub" replace />;
  return <>{children}</>;
}
