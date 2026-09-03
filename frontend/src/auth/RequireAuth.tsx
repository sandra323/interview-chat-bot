import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { USE_MOCK } from '@/config/app';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * 保护 Chat（`/`）。auth 状态为 `unknown` 时等待。
 *
 * USE_MOCK：为无后端的纯 UI 演示有意跳过门禁。
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
