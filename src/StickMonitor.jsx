import { useEffect, useState } from 'react';
import { Button } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { createStickMonitor, monitorTarget } from './stick-monitor.js';

export default function StickMonitor({ sheet, clock, playing }) {
  const [status, setStatus] = useState({ phase: 'idle', detail: '' });
  const [monitor] = useState(() => createStickMonitor(navigator.bluetooth, setStatus));
  const supported = typeof navigator.bluetooth?.requestDevice === 'function';
  const { phase, detail } = status;
  const connected = phase === 'connected';

  useEffect(() => () => monitor.dispose(), [monitor]);

  useEffect(() => {
    if (!connected) return undefined;
    function sendCurrent() {
      if (document.hidden) monitor.blackout();
      else monitor.send(monitorTarget(sheet, clock.read(), playing));
    }
    const unsubscribe = clock.subscribe(sendCurrent);
    document.addEventListener('visibilitychange', sendCurrent);
    sendCurrent();
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', sendCurrent);
    };
  }, [clock, connected, monitor, playing, sheet]);

  return (
    <section className="stick-monitor" aria-label="实体灯棒监看">
      {supported && (
        <Button
          size="small"
          icon={<LinkOutlined aria-hidden="true" />}
          loading={!connected && phase !== 'idle'}
          onClick={connected ? monitor.disconnect : monitor.connect}
        >{connected ? '断开灯棒' : '连接灯棒'}</Button>
      )}
      <span role="status">
        {supported
          ? connected ? `${detail} 已连接，跟随编排预览` : detail || '连接后可用实体灯棒监看'
          : '实体灯棒监看请用支持网页蓝牙的 Chrome 或 Edge。'}
      </span>
    </section>
  );
}
