import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import 'streamdown/styles.css';
import '@/styles/global.less';
import App from './App';
// 在任何 API 调用前连接 auth token bridge + 401 清理。
import './store/useAuthStore';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
