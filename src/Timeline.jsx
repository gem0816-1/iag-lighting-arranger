import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Select } from 'antd';
import { AudioOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { formatTime, MODES, secondsAt } from './cue-sheet.js';
import { useTime } from './playback.js';

const ZOOM_OPTIONS = [1, 2, 4, 8, 16, 32, 64].map((value) => ({ value, label: value === 1 ? '整段' : `${value}×` }));

function Ruler({ duration, zoom }) {
  const target = duration / Math.min(160, zoom * 8);
  const power = 10 ** Math.floor(Math.log10(target));
  const unit = Math.max(0.001, [1, 2, 5, 10].map((step) => step * power).find((step) => step >= target) ?? 10 * power);
  const ticks = Array.from({ length: Math.floor(duration / unit) + 1 }, (_, index) => index * unit);
  return ticks.filter((time) => time === 0 || time < duration - unit * 0.4).map((time) => (
    <span className="tick" key={time} style={{ left: `${100 * time / duration}%` }}>
      {formatTime(time, unit < 1)}
    </span>
  ));
}

function Waveform({ duration, media, peaks }) {
  if (!media || media.status === 'error') return <span className="lane-hint">选择本地素材或导入视频网址</span>;
  if (!peaks) {
    const hint = media.kind === 'bilibili' && media.sync !== 'ready' ? 'B 站视频 · 手动定位可用' : '可跟随媒体播放';
    return <span className="lane-hint">{media.status === 'loading' ? '正在读取媒体…' : hint}</span>;
  }
  const path = peaks.map((peak, index) => `M${index + 0.5},${28 - peak * 25}v${Math.max(1, peak * 50)}`).join('');
  const width = `${100 * media.seconds / duration}%`;
  return (
    <svg className="waveform" aria-hidden="true" preserveAspectRatio="none" viewBox={`0 0 ${peaks.length} 56`} style={{ width }}>
      <path d={path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Playhead({ clock, duration, playing, viewport }) {
  const time = useTime(clock);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!playing || !element || element.scrollWidth <= element.clientWidth) return;
    const position = element.scrollWidth * time / duration;
    if (position < element.scrollLeft || position > element.scrollLeft + element.clientWidth - 12) {
      element.scrollLeft = Math.max(0, position - element.clientWidth * 0.1);
    }
  }, [duration, playing, time, viewport]);
  return <div className="playhead" style={{ left: `${time / duration * 100}%` }} aria-hidden="true" />;
}

function CueBlock({ cue, start, selected, sheet, onPointerDown, onClick }) {
  const duration = sheet.duration_frames;
  const title = `${MODES[cue.mode]} · ${formatTime(secondsAt(start, sheet.fps), true)}`;
  const fill = cue.mode === 'gradient' ? `linear-gradient(100deg, ${cue.color}, ${cue.end_color})` : cue.color;
  return (
    <button
      type="button"
      className={`cue-block${cue.mode === 'off' ? ' cue-off' : ''}`}
      style={{ left: `${100 * start / duration}%`, width: `${100 * (cue.end_frame - cue.start_frame) / duration}%`, '--cue-fill': fill }}
      aria-label={title}
      aria-pressed={selected}
      title={title}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <span>{MODES[cue.mode]}</span>
    </button>
  );
}

export default function Timeline({ sheet, playback, media, peaks, selectedId, onSelect, onMove, onAdd, onSeek }) {
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState(null);
  const viewport = useRef(null);
  const content = useRef(null);
  const gesture = useRef(null);
  const duration = secondsAt(sheet.duration_frames, sheet.fps);
  const rate = sheet.fps.numerator / sheet.fps.denominator;
  const rateLabel = Number.isInteger(rate) ? rate : `${sheet.fps.numerator}/${sheet.fps.denominator}`;

  useLayoutEffect(() => {
    const element = viewport.current;
    if (element) element.scrollLeft = element.scrollWidth * playback.clock.read() / duration - element.clientWidth / 2;
  }, [duration, playback.clock, zoom]);

  function frameFromScreen(clientX) {
    const { left, width } = content.current.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (clientX - left) / width)) * sheet.duration_frames);
  }

  function startSeek(event) {
    if (event.button !== 0 || event.target.closest('button')) return;
    gesture.current = { pointer: event.pointerId };
    content.current.setPointerCapture(event.pointerId);
    onSeek(secondsAt(frameFromScreen(event.clientX), sheet.fps));
  }

  function startDrag(event, cue) {
    if (event.button !== 0) return;
    event.stopPropagation();
    gesture.current = {
      pointer: event.pointerId,
      cue,
      originFrame: frameFromScreen(event.clientX),
      originX: event.clientX,
      start: cue.start_frame,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(cue);
  }

  function movePointer(event) {
    const active = gesture.current;
    if (active?.pointer !== event.pointerId) return;
    const frame = frameFromScreen(event.clientX);
    if (!active.cue) {
      onSeek(secondsAt(frame, sheet.fps));
      return;
    }
    if (!active.moved && Math.abs(event.clientX - active.originX) < 4) return;
    active.moved = true;
    const cueLength = active.cue.end_frame - active.cue.start_frame;
    active.start = Math.min(sheet.duration_frames - cueLength, Math.max(0, active.cue.start_frame + frame - active.originFrame));
    setDrag({ id: active.cue.id, start: active.start });
  }

  function finishPointer(event) {
    const active = gesture.current;
    if (active?.pointer !== event.pointerId) return;
    gesture.current = null;
    setDrag(null);
    if (event.type === 'pointerup' && active.cue && active.start !== active.cue.start_frame) onMove(active.cue, active.start);
  }

  function seekWithKey(event) {
    if (event.target !== event.currentTarget) return;
    const second = secondsAt(1, sheet.fps) * (event.shiftKey ? 10 : 1);
    const steps = { ArrowLeft: -second, ArrowRight: second, Home: -duration, End: duration };
    if (!Object.hasOwn(steps, event.key)) return;
    event.preventDefault();
    onSeek(playback.clock.read() + steps[event.key]);
  }

  return (
    <section className="panel timeline-panel" aria-label="时间轴">
      <div className="panel-heading timeline-heading">
        <div className="timeline-title">
          <h2>时间轴</h2>
          <span className="timeline-count">{sheet.cues.length} 个灯效</span>
        </div>
        <div className="timeline-tools">
          <Select aria-label="时间轴缩放" value={zoom} options={ZOOM_OPTIONS} onChange={setZoom} popupMatchSelectWidth={false} virtual={false} />
          <Button icon={<PlusOutlined aria-hidden="true" />} onClick={onAdd}>添加灯效</Button>
        </div>
      </div>
      <div className="timeline-main">
        <div className="track-labels" aria-hidden="true">
          <div className="ruler-label">分∶秒</div>
          <div className="track-label"><AudioOutlined />媒体</div>
          <div className="track-label"><ThunderboltOutlined />灯效</div>
        </div>
        <div className="timeline-scroll" ref={viewport}>
          <div
            className="timeline-content"
            ref={content}
            style={{ width: `${zoom * 100}%` }}
            role="group"
            tabIndex={0}
            aria-label="时间轴定位，方向键移动播放头，按住 Shift 移动十帧"
            onKeyDown={seekWithKey}
            onPointerDown={startSeek}
            onPointerMove={movePointer}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
            onLostPointerCapture={finishPointer}
          >
            <div className="ruler"><Ruler duration={duration} zoom={zoom} /></div>
            <div className="wave-lane"><Waveform duration={duration} media={media} peaks={peaks} /></div>
            <div className="cue-lane">
              {sheet.cues.length === 0 && <span className="lane-hint">在时间轴上定位，再添加灯效</span>}
              {sheet.cues.map((cue) => (
                <CueBlock
                  key={cue.id}
                  cue={cue}
                  start={drag?.id === cue.id ? drag.start : cue.start_frame}
                  selected={cue.id === selectedId}
                  sheet={sheet}
                  onPointerDown={(event) => startDrag(event, cue)}
                  onClick={(event) => { if (event.detail === 0) onSelect(cue); }}
                />
              ))}
            </div>
            <Playhead clock={playback.clock} duration={duration} playing={playback.playing} viewport={viewport} />
          </div>
        </div>
      </div>
      <div className="timeline-footer"><span>点击定位 · 拖动灯效块移动</span><span>{rateLabel} fps</span></div>
    </section>
  );
}
