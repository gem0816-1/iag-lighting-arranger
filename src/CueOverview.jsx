import { useEffect, useRef } from 'react';
import { MODES } from './cue-sheet.js';

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
      if (painted?.total === total && left >= painted.left && left + visible <= painted.right + 1) return;
      const start = Math.max(0, Math.floor(left - visible / 2));
      const finish = Math.min(total, Math.ceil(left + visible * 1.5));
      const width = finish - start;
      const pixelsPerFrame = total / duration;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      painted = { left: start, right: finish, total };
      surface.width = Math.ceil(width * ratio);
      surface.height = Math.ceil(HEIGHT * ratio);
      surface.style.width = `${width}px`;
      surface.style.transform = `translate3d(${start}px, 0, 0)`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.font = '11px Aptos, Microsoft YaHei UI, sans-serif';

      for (const cue of cues) {
        const x = cue.start_frame * pixelsPerFrame - start;
        const size = (cue.end_frame - cue.start_frame) * pixelsPerFrame;
        if (x + size <= 0) continue;
        if (x >= width) break;
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
