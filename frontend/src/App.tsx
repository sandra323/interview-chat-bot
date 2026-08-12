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
    // Inputs / containers keep original card depth
    colorBgContainer: '#111318',
    // Dropdowns / popovers / menus use a slightly lighter elevated surface
    colorBgElevated: '#1c2333',
    colorBorder: '#1e2330',
    colorText: '#e8eaed',
    colorTextSecondary: '#9ca3af',
    colorError: '#ef4444',
    borderRadius: 8,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  components: {
    Select: {
      optionSelectedBg: 'rgba(59, 130, 246, 0.16)',
      optionActiveBg: 'rgba(255, 255, 255, 0.06)',
    },
    Dropdown: {
      controlItemBgHover: 'rgba(255, 255, 255, 0.06)',
      controlItemBgActive: 'rgba(59, 130, 246, 0.16)',
    },
    Input: {
      colorBgContainer: '#111318',
    },
    Modal: {
      contentBg: '#1c2333',
      headerBg: '#1c2333',
      footerBg: '#1c2333',
    },
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
