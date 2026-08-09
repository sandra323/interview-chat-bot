import { App as AntApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import ChatPage from '@/pages/Chat';

const antdTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#3b82f6',
    colorBgBase: '#0a0c10',
    colorBgContainer: '#111318',
    colorBorder: '#1e2330',
    colorText: '#e8eaed',
    colorTextSecondary: '#9ca3af',
    borderRadius: 8,
    fontFamily: "'Inter', system-ui, sans-serif",
  },
};

function App() {
  return (
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      <AntApp>
        <ChatPage />
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
