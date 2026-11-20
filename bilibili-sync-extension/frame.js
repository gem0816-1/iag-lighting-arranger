(() => {
  const editorOrigin = 'https://gem0816-1.github.io';
  if (window.parent === window || window.parent !== window.top) return;

  const events = ['loadedmetadata', 'durationchange', 'play', 'playing', 'pause', 'waiting', 'seeking', 'seeked', 'timeupdate', 'ratechange', 'ended'];
  let stopConnection;

  window.addEventListener('message', (event) => {
    if (event.origin !== editorOrigin || event.source !== window.parent ||
        event.data?.type !== 'iag-bilibili-sync-v1' || event.ports.length !== 1) return;
    stopConnection?.();

    const [port] = event.ports;
    const listeners = new AbortController();
    let video = document.querySelector('#shinonome video');
    let stalled = false;
    let lastCommand = 0;

    function report() {
      if (!video?.isConnected || !Number.isFinite(video.duration) || video.duration <= 0) return;
      port.postMessage({
        type: 'state',
        duration: video.duration,
        time: video.currentTime,
        paused: video.paused,
        ended: video.ended,
        running: !video.paused && !video.ended && !video.seeking && !stalled && video.readyState >= 2,
        rate: video.playbackRate,
        command: lastCommand,
      });
    }

    function onVideoEvent(event) {
      if (!(event.target instanceof HTMLVideoElement) || !event.target.closest('#shinonome')) return;
      if (video !== event.target) {
        video = event.target;
        stalled = false;
      }
      if (event.type === 'waiting') stalled = true;
      if (event.type === 'playing' || event.type === 'seeked') stalled = false;
      report();
    }

    const disconnect = () => { listeners.abort(); port.close(); };
    stopConnection = disconnect;
    for (const type of events) {
      document.addEventListener(type, onVideoEvent, { capture: true, signal: listeners.signal });
    }
    port.onmessage = async ({ data }) => {
      if (data?.type === 'disconnect') { disconnect(); return; }
      if (!Number.isSafeInteger(data?.id) || data.id <= lastCommand || !video?.isConnected) return;
      if (!['play', 'pause', 'seek'].includes(data.type)) return;
      lastCommand = data.id;
      try {
        if (data.type === 'play') await video.play();
        if (data.type === 'pause') video.pause();
        if (data.type === 'seek' && Number.isFinite(data.time) && Number.isFinite(video.duration)) {
          video.currentTime = Math.max(0, Math.min(video.duration, data.time));
        }
        port.postMessage({ type: 'result', id: data.id, ok: true });
      } catch (error) {
        port.postMessage({ type: 'result', id: data.id, ok: false, name: error.name });
      }
      report();
    };
    port.postMessage({ type: 'connected' });
    report();
  });
})();
