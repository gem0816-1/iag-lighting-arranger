import { useEffect, useLayoutEffect, useRef } from 'react';

const PLAYER_ORIGIN = 'https://player.bilibili.com';

function validState(data) {
  return data?.type === 'state' && Number.isFinite(data.duration) && data.duration > 0 &&
    Number.isFinite(data.time) && data.time >= 0 && data.time <= data.duration + 0.1 &&
    Number.isFinite(data.rate) && data.rate > 0 && Number.isSafeInteger(data.command) &&
    typeof data.paused === 'boolean' && typeof data.ended === 'boolean' && typeof data.running === 'boolean';
}

export default function BilibiliPlayer({ src, mediaRef, onStatus, onDuration, onPlayback }) {
  const connection = useRef(null);
  const callbacks = useRef(null);
  useLayoutEffect(() => { callbacks.current = { onStatus, onDuration, onPlayback }; }, [onStatus, onDuration, onPlayback]);
  useEffect(() => () => connection.current?.(), []);

  function connect(event) {
    connection.current?.();
    callbacks.current.onStatus('manual');
    const channel = new MessageChannel();
    const port = channel.port1;
    let sequence = 0;
    let snapshot;
    let readAt;
    let pendingSeek;
    let waitingPlay;

    function send(type, data) {
      const id = ++sequence;
      port.postMessage({ type, id, ...data });
      return id;
    }

    function resolvePlay(name) {
      if (!waitingPlay) return;
      clearTimeout(waitingPlay.timer);
      if (name) waitingPlay.reject(new DOMException('Bilibili playback did not start', name));
      else waitingPlay.resolve();
      waitingPlay = undefined;
    }

    const controller = {
      get duration() { return snapshot?.duration ?? 0; },
      get paused() { return !waitingPlay && (snapshot?.paused ?? true); },
      get currentTime() {
        if (pendingSeek !== undefined) return pendingSeek;
        if (!snapshot) return 0;
        const elapsed = snapshot.running ? Math.min(0.25, (performance.now() - readAt) / 1000) * snapshot.rate : 0;
        return Math.min(snapshot.duration, snapshot.time + elapsed);
      },
      set currentTime(time) {
        if (Math.abs(time - this.currentTime) < 0.01) return;
        pendingSeek = time;
        send('seek', { time });
      },
      play() {
        resolvePlay('AbortError');
        return new Promise((resolve, reject) => {
          waitingPlay = { id: send('play'), resolve, reject, timer: setTimeout(() => resolvePlay('TimeoutError'), 7000) };
        });
      },
      pause() { send('pause'); resolvePlay('AbortError'); },
    };

    port.onmessage = ({ data }) => {
      if (data?.type === 'connected') callbacks.current.onStatus('waiting');
      if (data?.type === 'result' && waitingPlay && waitingPlay.id === data.id) {
        resolvePlay(data.ok ? undefined : data.name || 'NotAllowedError');
      }
      if (!validState(data) || data.command < sequence) return;
      pendingSeek = undefined;
      const needsDuration = snapshot?.duration !== data.duration;
      snapshot = data;
      readAt = performance.now();
      let limit;
      if (needsDuration) {
        mediaRef.current = controller;
        callbacks.current.onStatus('ready');
        limit = callbacks.current.onDuration(data.duration);
      }
      const state = data.ended ? 'ended' : data.paused ? 'paused' : 'playing';
      callbacks.current.onPlayback(state, data.time, limit);
    };

    connection.current = () => {
      if (mediaRef.current === controller) mediaRef.current = null;
      resolvePlay('AbortError');
      port.postMessage({ type: 'disconnect' });
      port.close();
    };
    event.currentTarget.contentWindow.postMessage({ type: 'iag-bilibili-sync-v1' }, PLAYER_ORIGIN, [channel.port2]);
  }

  return (
    <div className="reference-player">
      <iframe src={src} title="B 站参考视频" allow="autoplay; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onLoad={connect} />
    </div>
  );
}
