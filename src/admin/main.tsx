import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#155eef',
          colorSuccess: '#16a34a',
          colorError: '#dc2626',
          colorTextBase: '#111827',
          colorBgLayout: '#f4f7fb',
          borderRadius: 12,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
        },
        components: {
          Layout: { headerBg: '#ffffff', siderBg: '#08111f' },
          Menu: { darkItemBg: '#08111f', darkSubMenuItemBg: '#08111f', darkItemSelectedBg: '#155eef' },
          Card: { headerFontSize: 16 }
        }
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
