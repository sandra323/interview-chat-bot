import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { USE_MOCK } from '@/config/app';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Protects Chat (`/`). Waits while auth status is `unknown`.
 *
 * USE_MOCK: intentionally skips the gate for UI-only demos without a backend.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);

  if (USE_MOCK) {
    return <>{children}</>;
  }

  if (status === 'unknown') {
    return <div style={{ minHeight: '100vh', background: '#0a0c10' }} />;
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
