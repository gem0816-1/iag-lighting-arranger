import { useEffect, useRef } from 'react';
import { cueIndexAtOrAfter, MODES } from './cue-sheet.js';

const HEIGHT = 50;

export default function CueOverview({ cues, duration, viewport, content }) {
  const canvas = useRef(null);

  useEffect(() => {
    const scroll = viewport.current;
    const track = content.current;
    const surface = canvas.current;
    const context = surface.getContext('2d');
    let painted;
    let pending;

    function paint() {
      pending = undefined;
      const total = track.clientWidth;
      const visible = scroll.clientWidth;
      const left = scroll.scrollLeft;
      if (!total || !visible || !context) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      if (painted?.total === total && painted.ratio === ratio && left >= painted.left && left + visible <= painted.right + 1) return;
      const start = Math.max(0, Math.floor(left - visible / 2));
      const finish = Math.min(total, Math.ceil(left + visible * 1.5));
      const width = finish - start;
      const pixelsPerFrame = total / duration;
      painted = { left: start, right: finish, total, ratio };
      const pixelWidth = Math.ceil(width * ratio);
      const pixelHeight = Math.ceil(HEIGHT * ratio);
      if (surface.width !== pixelWidth) surface.width = pixelWidth;
      if (surface.height !== pixelHeight) surface.height = pixelHeight;
      if (surface.style.width !== `${width}px`) surface.style.width = `${width}px`;
      surface.style.transform = `translate3d(${start}px, 0, 0)`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, pixelWidth / ratio, pixelHeight / ratio);
      context.font = '11px Aptos, Microsoft YaHei UI, sans-serif';

      const first = cueIndexAtOrAfter(cues, start / pixelsPerFrame);
      for (let index = first; index < cues.length; index += 1) {
        const cue = cues[index];
        let x = cue.start_frame * pixelsPerFrame - start;
        const size = (cue.end_frame - cue.start_frame) * pixelsPerFrame;
        if (x + size <= 0) continue;
        if (x >= width) break;
        if (size <= 1) {
          // Several cues can share one pixel in the full view. The cue data still drives hit-testing and editing.
          x = Math.max(0, Math.floor(x));
          const next = cues[index + 1];
          if (next && Math.floor(next.start_frame * pixelsPerFrame - start) === x && (next.end_frame - next.start_frame) * pixelsPerFrame <= 1) continue;
        }
        const bar = Math.max(1, size - 1);
        context.fillStyle = '#213340';
        context.fillRect(x, 6, bar, 37);
        const color = cue.mode === 'off' ? '#71828e' : cue.color;
        if (cue.mode === 'gradient' && size > 12) {
          const stripe = context.createLinearGradient(x, 0, x + size, 0);
          stripe.addColorStop(0, color);
          stripe.addColorStop(1, cue.end_color);
          context.fillStyle = stripe;
        } else {
          context.fillStyle = color;
        }
        context.fillRect(x, 6, bar, 4);
        if (bar >= 36) {
          context.fillStyle = '#f4f8f6';
          context.fillText(MODES[cue.mode], x + 5, 29, bar - 10);
        }
      }
    }

    function schedule() {
      if (pending === undefined) pending = requestAnimationFrame(paint);
    }

    paint();
    const resize = new ResizeObserver(schedule);
    resize.observe(scroll);
    resize.observe(track);
    scroll.addEventListener('scroll', schedule, { passive: true });
    return () => {
      resize.disconnect();
      scroll.removeEventListener('scroll', schedule);
      cancelAnimationFrame(pending);
    };
  }, [content, cues, duration, viewport]);

  return <canvas className="cue-overview" ref={canvas} aria-hidden="true" />;
}
