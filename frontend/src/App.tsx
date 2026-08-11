import { App as AntApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthBootstrap } from '@/auth/AuthBootstrap';
import { AuthNavigationEffect } from '@/auth/AuthNavigationEffect';
import { GuestOnly } from '@/auth/GuestOnly';
import { RequireAuth } from '@/auth/RequireAuth';
import ChatPage from '@/pages/Chat';
import LoginPage from '@/pages/Login';

const antdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#3b82f6',
    colorBgBase: '#0a0c10',
    colorBgContainer: '#111318',
    colorBgElevated: '#111318',
    colorBorder: '#1e2330',
    colorText: '#e8eaed',
    colorTextSecondary: '#9ca3af',
    colorError: '#ef4444',
    borderRadius: 8,
    fontFamily: "'Inter', system-ui, sans-serif",
  },
};

function App() {
  return (
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      <AntApp>
        <BrowserRouter>
          <AuthBootstrap />
          <AuthNavigationEffect />
          <Routes>
            <Route
              path="/login"
              element={
                <GuestOnly>
                  <LoginPage />
                </GuestOnly>
              }
            />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <ChatPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
