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

function mediaEnd(media) {
  const seconds = media.duration;
  // YouTube exposes play controls before it knows the video's length.
  return seconds === 0 ? Infinity : seconds;
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
        onError(error.name === 'NotAllowedError' ? '请先在视频内点播放，浏览器会允许后续控制。' : '浏览器无法开始播放这段媒体。');
      }
    });
  }

  function seek(seconds, limit = duration) {
    const time = Math.max(0, Math.min(limit, seconds));
    clock.write(time);
    const media = mediaRef.current;
    if (media && Number.isFinite(media.duration)) {
      const end = mediaEnd(media);
      media.currentTime = Math.min(time, end);
      if (time >= end) media.pause();
      else if (playing && media.paused && time < limit) playMedia(media);
    }
    if (time >= limit) pause();
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
    if (media && clock.read() < mediaEnd(media)) {
      media.currentTime = clock.read();
      playMedia(media);
    }
    setPlaying(true);
  }

  function syncMedia(state, seconds, limit = duration) {
    if (!Number.isFinite(seconds)) return;
    const media = mediaRef.current;
    if (state === 'paused' && media && clock.read() > mediaEnd(media) && seconds >= mediaEnd(media)) return;
    clock.write(Math.max(0, Math.min(limit, seconds)));
    if (seconds >= limit) {
      if (state === 'playing') pause();
      else setPlaying(false);
    } else if (state !== 'ended') {
      setPlaying(state === 'playing');
    }
  }

  useEffect(() => {
    if (!playing) return undefined;
    let last = performance.now();
    let animation;
    function tick(now) {
      const media = mediaRef.current;
      const time = clock.read();
      const followsMedia = media && Number.isFinite(media.duration) && time < mediaEnd(media);
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

  return { clock, playing, pause, seek, toggle, syncMedia };
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
