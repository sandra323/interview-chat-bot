import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from 'antd';
import { onForceLogoutLocal } from '@/store/useAuthStore';

/** Navigate to /login when session is cleared (401 / logout / expiry / boot fail). */
export function AuthNavigationEffect() {
  const navigate = useNavigate();
  const { message } = App.useApp();

  useEffect(() => {
    return onForceLogoutLocal(({ reason }) => {
      if (reason === 'unauthorized') {
        message.warning('登录已失效，请重新登录');
      }
      navigate('/login', { replace: true });
    });
  }, [navigate, message]);

  return null;
}
