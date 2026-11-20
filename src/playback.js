import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

function createClock() {
  let seconds = 0;
  const listeners = new Set();
  return {
    read: () => seconds,
    write(next) {
      if (next === seconds) return;
      seconds = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useTime(clock) {
  return useSyncExternalStore(clock.subscribe, clock.read);
}

export function usePlayback(duration, mediaRef, onError) {
  const [clock] = useState(createClock);
  const [playing, setPlaying] = useState(false);
  const request = useRef(0);

  const pause = useCallback(() => {
    request.current += 1;
    mediaRef.current?.pause();
    setPlaying(false);
  }, [mediaRef]);

  function playMedia(media) {
    const id = ++request.current;
    media.play().catch((error) => {
      if (id === request.current && mediaRef.current === media && error.name !== 'AbortError') {
        pause();
        onError('浏览器无法开始播放这个媒体文件。');
      }
    });
  }

  function seek(seconds) {
    const time = Math.max(0, Math.min(duration, seconds));
    clock.write(time);
    const media = mediaRef.current;
    if (media && Number.isFinite(media.duration)) {
      media.currentTime = Math.min(time, media.duration);
      if (time >= media.duration) media.pause();
      else if (playing && media.paused && time < duration) playMedia(media);
    }
    if (time >= duration) pause();
  }

  function toggle() {
    if (playing) {
      pause();
      return;
    }
    if (clock.read() >= duration) seek(0);
    const media = mediaRef.current;
    if (media && !Number.isFinite(media.duration)) {
      onError('媒体正在加载，请稍后再播放。');
      return;
    }
    if (media && clock.read() < media.duration) {
      media.currentTime = clock.read();
      playMedia(media);
    }
    setPlaying(true);
  }

  useEffect(() => {
    if (!playing) return undefined;
    let last = performance.now();
    let animation;
    function tick(now) {
      const media = mediaRef.current;
      const time = clock.read();
      const followsMedia = media && Number.isFinite(media.duration) && time < media.duration;
      // The media element owns the clock while its audio or video is playing.
      const next = followsMedia ? media.currentTime : time + Math.max(0, now - last) / 1000;
      clock.write(Math.min(next, duration));
      last = now;
      if (next >= duration) pause();
      else animation = requestAnimationFrame(tick);
    }
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [clock, duration, mediaRef, pause, playing]);

  return { clock, playing, pause, seek, toggle };
}

export async function measureWaveform(file, duration) {
  if (file.size > 24 * 1024 * 1024 || duration > 1200 || !globalThis.AudioContext) return null;
  const audio = new AudioContext();
  try {
    const buffer = await audio.decodeAudioData(await file.arrayBuffer());
    const count = Math.min(1600, buffer.length);
    const channels = Array.from({ length: Math.min(buffer.numberOfChannels, 2) }, (_, index) => buffer.getChannelData(index));
    return Array.from({ length: count }, (_, index) => {
      const first = Math.floor(index * buffer.length / count);
      const end = Math.floor((index + 1) * buffer.length / count);
      const stride = Math.max(1, Math.floor((end - first) / 128));
      let peak = 0;
      for (let sample = first; sample < end; sample += stride) {
        for (const channel of channels) peak = Math.max(peak, Math.abs(channel[sample]));
      }
      return peak;
    });
  } catch {
    return null;
  } finally {
    await audio.close().catch(() => {});
  }
}
