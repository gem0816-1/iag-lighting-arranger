import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import './style.css';
import App from './App.jsx';
import ExtensionInstall from './ExtensionInstall.jsx';

const editorTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#67E6B1',
    colorTextLightSolid: '#10251E',
    colorBgBase: '#101820',
    colorTextBase: '#F1F5F4',
    colorBorder: '#354653',
    borderRadius: 7,
    controlHeight: 36,
    fontFamily: '"Aptos", "Microsoft YaHei UI", "PingFang SC", sans-serif',
  },
};

const install = new URLSearchParams(window.location.search).get('install');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider theme={editorTheme} locale={zhCN}>
      <AntApp>{install === null ? <App /> : <ExtensionInstall browser={install} />}</AntApp>
    </ConfigProvider>
  </StrictMode>,
);
