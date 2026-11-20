import { useRef, useState } from 'react';
import { Button, Input, Modal } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { parseReferenceLink, parseReferenceTime } from './reference-links.js';
import { detectInstaller } from './extension-install.js';

export function ReferenceLinkButton({ onLink }) {
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const input = useRef(null);

  function open() {
    setUrl('');
    setError('');
    setVisible(true);
  }

  function submit() {
    try {
      onLink(parseReferenceLink(url));
      setVisible(false);
    } catch (error) {
      setError(error.message);
    }
  }

  return (
    <>
      <Button icon={<LinkOutlined aria-hidden="true" />} onClick={open}>导入网址</Button>
      <Modal title="导入网络视频" open={visible} onCancel={() => setVisible(false)} onOk={submit} okText="载入视频" cancelText="取消" afterOpenChange={(open) => { if (open) input.current?.focus(); }}>
        <p className="reference-help" id="reference-link-help">支持视频文件直链、允许嵌入的 YouTube 视频和 B 站视频页。B 站可搭配桌面浏览器扩展自动同步。</p>
        <Input
          ref={input}
          aria-label="视频网址"
          aria-describedby="reference-link-help"
          status={error ? 'error' : undefined}
          placeholder="https://…"
          autoComplete="off"
          inputMode="url"
          value={url}
          onChange={(event) => { setUrl(event.target.value); setError(''); }}
          onPressEnter={submit}
        />
        {error && <p className="reference-error" role="alert">{error}</p>}
      </Modal>
    </>
  );
}

export function BilibiliPosition({ url, onLocate, waiting }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function locate(event) {
    event.preventDefault();
    try {
      onLocate(parseReferenceTime(value));
      setError('');
    } catch (error) {
      setError(error.message);
    }
  }

  return (
    <div className="bilibili-position">
      <form onSubmit={locate}>
        <Input
          aria-label="B 站视频进度"
          placeholder="视频时间，如 1:15"
          value={value}
          maxLength={24}
          status={error ? 'error' : undefined}
          onChange={(event) => { setValue(event.target.value); setError(''); }}
        />
        <Button htmlType="submit">定位时间轴</Button>
      </form>
      {error && <p className="reference-error" role="alert">{error}</p>}
      <p className="reference-help">
        {waiting ? '扩展已连接。请在视频内点播放，载入后自动同步。' : '桌面浏览器可安装扩展自动同步。'}{' '}
        {!waiting && <a href={`${import.meta.env.BASE_URL}?install=${detectInstaller(navigator.userAgent)}`} target="_blank" rel="noreferrer">下载同步扩展</a>}{' '}
        <a href={url} target="_blank" rel="noreferrer">到 B 站观看</a>
      </p>
    </div>
  );
}
