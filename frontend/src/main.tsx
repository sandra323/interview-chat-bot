import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import 'streamdown/styles.css';
import '@/styles/global.less';
import App from './App';
// Wire auth token bridge + 401 cleanup before any API calls.
import './store/useAuthStore';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
