import { useEffect, useId, useState } from 'react';
import { Button } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { createStickMonitor, monitorTarget, STICK_SCAN_HINT } from './stick-monitor.js';

const BUSY_LABELS = { selecting: '正在搜索…', connecting: '正在连接…', closing: '正在断开…' };

export default function StickMonitor({ sheet, clock, playing }) {
  const [status, setStatus] = useState({ phase: 'idle', detail: '' });
  const [monitor] = useState(() => createStickMonitor(navigator.bluetooth, setStatus));
  const statusId = useId();
  const supported = typeof navigator.bluetooth?.requestDevice === 'function';
  const { phase, detail, canReconnect } = status;
  const connected = phase === 'connected';
  const busyLabel = BUSY_LABELS[phase];
  const action = connected ? monitor.disconnect : canReconnect ? monitor.reconnect : monitor.connect;
  const label = busyLabel ?? (connected ? '断开灯棒' : canReconnect ? '重连灯棒' : '连接灯棒');

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
          loading={Boolean(busyLabel)}
          aria-describedby={statusId}
          onClick={action}
        >{label}</Button>
      )}
      {supported && phase === 'idle' && canReconnect && <Button size="small" type="text" onClick={monitor.connect}>重选灯棒</Button>}
      <span role="status" id={statusId}>
        {supported
          ? connected ? `${detail} 已连接，跟随编排预览` : detail || STICK_SCAN_HINT
          : '实体灯棒监看请用支持网页蓝牙的 Chrome 或 Edge。'}
      </span>
    </section>
  );
}
