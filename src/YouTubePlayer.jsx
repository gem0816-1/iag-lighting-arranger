import { useEffect, useLayoutEffect, useRef } from 'react';

let loadingApi;

function loadPlayerApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loadingApi) return loadingApi;

  loadingApi = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previous = window.onYouTubeIframeAPIReady;
    const timeout = setTimeout(fail, 15_000);

    function cleanup() {
      clearTimeout(timeout);
      window.onYouTubeIframeAPIReady = previous;
    }

    function fail() {
      cleanup();
      script.remove();
      reject(new Error('连不上 YouTube 播放服务。可以重新导入，或换一个视频地址。'));
    }

    window.onYouTubeIframeAPIReady = () => {
      cleanup();
      resolve(window.YT);
      previous?.();
    };
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = fail;
    document.head.append(script);
  }).catch((error) => {
    loadingApi = undefined;
    throw error;
  });
  return loadingApi;
}

function controllerFor(player, videoId) {
  let pendingSeek;
  return {
    get duration() { return player.getDuration() || 0; },
    get paused() { return ![1, 3].includes(player.getPlayerState()); },
    get currentTime() {
      const seconds = player.getCurrentTime() || 0;
      if (pendingSeek && performance.now() < pendingSeek.until && Math.abs(seconds - pendingSeek.seconds) > 0.25) return pendingSeek.seconds;
      pendingSeek = undefined;
      return seconds;
    },
    set currentTime(seconds) {
      if (Math.abs(seconds - this.currentTime) <= 0.015) return;
      const state = player.getPlayerState();
      if ([-1, 0, 5].includes(state)) player.cueVideoById({ videoId, startSeconds: seconds });
      else player.seekTo(seconds, true);
      pendingSeek = { seconds, until: performance.now() + 350 };
    },
    async play() { player.playVideo(); },
    pause() { player.pauseVideo(); },
  };
}

const ERRORS = {
  2: 'YouTube 视频网址无效。',
  100: 'YouTube 视频已失效或设为私密。',
  101: '这条 YouTube 视频限制了站外播放。请换一条允许嵌入的视频。',
  150: '这条 YouTube 视频限制了站外播放。请换一条允许嵌入的视频。',
  153: 'YouTube 无法识别当前页面的播放来源。可从原视频网页观看。',
};

export default function YouTubePlayer({ videoId, mediaRef, onReady, onDuration, onPlayback, onBlocked, onError }) {
  const host = useRef(null);
  const callbacks = useRef(null);
  useLayoutEffect(() => {
    callbacks.current = { onReady, onDuration, onPlayback, onBlocked, onError };
  }, [onReady, onDuration, onPlayback, onBlocked, onError]);

  useEffect(() => {
    const container = host.current;
    let disposed = false;
    let player;
    let controller;
    let reportedDuration = false;
    const readyTimeout = setTimeout(() => fail('YouTube 播放器加载超时。可重试或打开原视频。'), 22_000);

    function fail(text) {
      if (disposed) return;
      clearTimeout(readyTimeout);
      callbacks.current.onError(text);
    }

    function reportDuration() {
      if (reportedDuration || !controller?.duration) return;
      reportedDuration = true;
      callbacks.current.onDuration(controller.duration);
    }

    loadPlayerApi().then((api) => {
      if (disposed) return;
      const video = new URL(`https://www.youtube.com/embed/${videoId}`);
      video.search = new URLSearchParams({ enablejsapi: '1', origin: window.location.origin, playsinline: '1' });
      const frame = document.createElement('iframe');
      frame.title = 'YouTube 参考视频';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
      frame.allowFullscreen = true;
      frame.src = video.href;
      container.append(frame);
      player = new api.Player(frame, {
        events: {
          onReady({ target }) {
            if (disposed) return;
            clearTimeout(readyTimeout);
            controller = controllerFor(target, videoId);
            mediaRef.current = controller;
            callbacks.current.onReady();
            reportDuration();
          },
          onStateChange({ data }) {
            if (disposed || !controller) return;
            reportDuration();
            if (data === 1) callbacks.current.onPlayback('playing', controller.currentTime);
            if (data === 2) callbacks.current.onPlayback('paused', controller.currentTime);
            if (data === 0) callbacks.current.onPlayback('ended', controller.duration);
          },
          onAutoplayBlocked() {
            if (disposed || !controller) return;
            callbacks.current.onPlayback('paused', controller.currentTime);
            callbacks.current.onBlocked();
          },
          onError({ data }) { fail(ERRORS[data] ?? 'YouTube 无法在这里播放这条视频。可打开原视频查看。'); },
        },
      });
    }).catch((error) => fail(error.message));

    return () => {
      disposed = true;
      clearTimeout(readyTimeout);
      if (mediaRef.current === controller) mediaRef.current = null;
      player?.destroy();
      container.replaceChildren();
    };
  }, [mediaRef, videoId]);

  return <div className="reference-player" ref={host} />;
}
