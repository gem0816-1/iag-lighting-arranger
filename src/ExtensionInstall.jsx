import { useState } from 'react';
import { App, Button, Input, Select } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { INSTALLERS, detectInstaller } from './extension-install.js';

export default function ExtensionInstall({ browser }) {
  const [selected, setSelected] = useState(() => Object.hasOwn(INSTALLERS, browser) ? browser : detectInstaller(navigator.userAgent));
  const { message } = App.useApp();
  const installer = INSTALLERS[selected];
  const firefox = selected === 'firefox';
  const base = import.meta.env.BASE_URL;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(installer.address);
      message.success('已复制。粘贴到浏览器地址栏后按回车。');
    } catch {
      message.info('可以选中上面的地址并复制。');
    }
  }

  return (
    <main className="extension-install">
      <a href={base}>返回 IAG 灯光编排</a>
      <section className="panel extension-install-panel">
        <div className="panel-heading">
          <h1>安装 B 站同步扩展</h1>
          <Select aria-label="安装浏览器" value={selected} onChange={setSelected} options={Object.entries(INSTALLERS).map(([value, entry]) => ({ value, label: entry.name }))} />
        </div>
        <div className="extension-install-body">
          <Button type="primary" icon={<DownloadOutlined aria-hidden="true" />} href={`${base}${installer.download}`} download={installer.download}>
            下载 {installer.name} 扩展{firefox ? '（临时版）' : ''}
          </Button>
          <ol>
            <li>{firefox ? '下载 XPI 文件。' : '下载 ZIP 文件并解压。'}</li>
            <li>
              在浏览器地址栏打开扩展管理页面。
              <div className="install-address">
                <Input aria-label="扩展管理地址" readOnly value={installer.address} onFocus={(event) => event.target.select()} />
                <Button onClick={copyAddress}>复制地址</Button>
              </div>
            </li>
            <li>{firefox ? '在「此 Firefox」点「临时载入附加组件」，选择下载的 XPI。重启 Firefox 后需要重新载入。' : '开启「开发者模式」，点「加载已解压的扩展程序」，选择包含 manifest.json 的目录。'}</li>
            <li>刷新编排页，导入 B 站链接并在视频里点播放。出现「B 站已自动同步」即可。</li>
          </ol>
          {firefox && <p className="reference-help">Firefox 永久安装需要 Mozilla 签名。<a href="https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/" target="_blank" rel="noreferrer">Mozilla 安装说明</a></p>}
        </div>
      </section>
    </main>
  );
}
