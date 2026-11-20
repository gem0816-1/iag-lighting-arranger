import { useCallback, useEffect, useRef, useState } from 'react';
import { PREVIEW_FPS } from './cue-sheet.js';

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

function mediaEnd(media) {
  const seconds = media.duration;
  // YouTube exposes play controls before it knows the video's length.
  return seconds === 0 ? Infinity : seconds;
}

export function usePlayback(duration, mediaRef, onError) {
  const [clock] = useState(createClock);
  const [direction, setDirection] = useState(0);
  const directionRef = useRef(0);
  const playing = direction !== 0;
  const request = useRef(0);

  const transport = useCallback((value) => {
    directionRef.current = value;
    setDirection(value);
  }, []);

  const pause = useCallback(() => {
    request.current += 1;
    const media = mediaRef.current;
    const wasReverse = directionRef.current < 0;
    transport(0);
    media?.pause();
    if (wasReverse && media && Number.isFinite(media.duration)) media.currentTime = Math.min(clock.read(), mediaEnd(media));
  }, [clock, mediaRef, transport]);

  function playMedia(media) {
    const id = ++request.current;
    media.play().catch((error) => {
      if (id === request.current && mediaRef.current === media && error.name !== 'AbortError') {
        pause();
        onError(error.name === 'NotAllowedError' ? '请先在视频内点播放，再试编排页的播放按钮。' : '浏览器无法开始播放这段媒体。');
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
      else if (directionRef.current > 0 && media.paused && time < limit) playMedia(media);
    }
    if (time >= limit) pause();
  }

  function play() {
    if (directionRef.current === 1) return;
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
    transport(1);
  }

  function rewind() {
    if (directionRef.current < 0 || clock.read() <= 0) return;
    request.current += 1;
    transport(-1);
    mediaRef.current?.pause();
  }

  function toggle() {
    if (directionRef.current) pause();
    else play();
  }

  function syncMedia(state, seconds, limit = duration) {
    if (!Number.isFinite(seconds) || (directionRef.current < 0 && state !== 'playing')) return;
    const media = mediaRef.current;
    if (state === 'paused' && media && clock.read() > mediaEnd(media) && seconds >= mediaEnd(media)) return;
    if (state === 'playing' && directionRef.current === 1 && seconds < limit) return;
    clock.write(Math.max(0, Math.min(limit, seconds)));
    if (seconds >= limit) {
      if (state === 'playing') pause();
      else transport(0);
    } else if (state !== 'ended') {
      transport(state === 'playing' ? 1 : 0);
    }
  }

  useEffect(() => {
    if (!direction) return undefined;
    let last = performance.now();
    let origin;
    let renderedFrame = -1;
    let animation;
    function tick(now) {
      if (directionRef.current !== direction) return;
      origin ??= now;
      const frame = Math.floor((now - origin + 0.5) * PREVIEW_FPS / 1000);
      if (renderedFrame === frame) {
        animation = requestAnimationFrame(tick);
        return;
      }
      renderedFrame = frame;
      const media = mediaRef.current;
      const time = clock.read();
      const followsMedia = direction > 0 && media && Number.isFinite(media.duration) && time < mediaEnd(media);
      // The media element owns the clock while its audio or video is playing.
      const next = followsMedia ? media.currentTime : time + direction * Math.max(0, now - last) / 1000;
      clock.write(Math.max(0, Math.min(next, duration)));
      last = now;
      if (next >= duration || (direction < 0 && next <= 0)) pause();
      else animation = requestAnimationFrame(tick);
    }
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [clock, direction, duration, mediaRef, pause]);

  return { clock, playing, play, pause, rewind, seek, toggle, syncMedia };
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
