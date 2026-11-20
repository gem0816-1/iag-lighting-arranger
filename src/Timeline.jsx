import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { Button, Select } from 'antd';
import { AudioOutlined, ColumnWidthOutlined, LinkOutlined, PlusOutlined, ScissorOutlined, SelectOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { cueAt, formatTime, frameAt, MODES, PREVIEW_FPS, secondsAt } from './cue-sheet.js';
import { prepareCueDrag } from './timeline-edit.js';
import CueOverview from './CueOverview.jsx';

export const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32, 64];
const ZOOM_OPTIONS = ZOOM_LEVELS.map((value) => ({ value, label: value === 1 ? '整段' : `${value}×` }));
const TOOLS = [
  { id: 'select', label: '选择', icon: <SelectOutlined aria-hidden="true" /> },
  { id: 'trim', label: '波纹修剪', icon: <ColumnWidthOutlined aria-hidden="true" /> },
  { id: 'blade', label: '刀片', icon: <ScissorOutlined aria-hidden="true" /> },
];

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

const Waveform = memo(function Waveform({ duration, media, peaks }) {
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
});

function Playhead({ clock, duration, playing, viewport, content }) {
  const head = useRef(null);
  useEffect(() => {
    const scroll = viewport.current;
    const track = content.current;
    const line = head.current;
    let left = scroll.scrollLeft;
    let width;
    let visible;
    let last;

    function paint() {
      const position = Math.max(0, Math.min(width - 1, width * clock.read() / duration));
      if (position === last) return;
      last = position;
      line.style.transform = `translate3d(${position}px, 0, 0)`;
      if (playing && width > visible && (position < left || position > left + visible - 12)) {
        left = Math.max(0, position - visible * 0.1);
        scroll.scrollLeft = left;
      }
    }

    function measure() {
      width = track.clientWidth;
      visible = scroll.clientWidth;
      paint();
    }

    const rememberScroll = () => { left = scroll.scrollLeft; };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(track);
    resize.observe(scroll);
    scroll.addEventListener('scroll', rememberScroll, { passive: true });
    const unsubscribe = clock.subscribe(paint);
    return () => {
      unsubscribe();
      resize.disconnect();
      scroll.removeEventListener('scroll', rememberScroll);
    };
  }, [clock, content, duration, playing, viewport]);
  return <div className="playhead" ref={head} aria-hidden="true" />;
}

const CueBlock = memo(function CueBlock({ cue, index, selected, duration, fps }) {
  const title = `${MODES[cue.mode]} · ${formatTime(secondsAt(cue.start_frame, fps), true)}`;
  const fill = cue.mode === 'gradient' ? `linear-gradient(100deg, ${cue.color}, ${cue.end_color})` : cue.color;
  return (
    <button
      type="button"
      className={`cue-block${cue.mode === 'off' ? ' cue-off' : ''}`}
      data-cue-index={index}
      style={{ left: `${100 * cue.start_frame / duration}%`, width: `${100 * (cue.end_frame - cue.start_frame) / duration}%`, '--cue-fill': fill }}
      aria-label={title}
      aria-pressed={selected}
      title={title}
    >
      <span className="cue-caption">{MODES[cue.mode]}</span>
      <span className="cue-edge cue-edge-start" data-edge="start" aria-hidden="true" />
      <span className="cue-edge cue-edge-end" data-edge="end" aria-hidden="true" />
    </button>
  );
});

export default function Timeline({
  sheet, playback, media, peaks, selectedId, zoom, onZoom, tool, onTool, snapping, onSnap,
  shortcuts, onSelect, onEdit, onSplit, onAdd, onSeek,
}) {
  const viewport = useRef(null);
  const content = useRef(null);
  const ghost = useRef(null);
  const gesture = useRef(null);
  const animation = useRef(null);
  const duration = secondsAt(sheet.duration_frames, sheet.fps);
  const dense = sheet.cues.length > 200;
  const selectedIndex = dense ? sheet.cues.findIndex((cue) => cue.id === selectedId) : -1;
  const rate = sheet.fps.numerator / sheet.fps.denominator;
  const rateLabel = Number.isInteger(rate) ? rate : `${sheet.fps.numerator}/${sheet.fps.denominator}`;

  useLayoutEffect(() => {
    const element = viewport.current;
    if (element) element.scrollLeft = element.scrollWidth * playback.clock.read() / duration - element.clientWidth / 2;
  }, [duration, playback.clock, zoom]);

  useLayoutEffect(() => () => cancelAnimationFrame(animation.current), []);

  function frameFromScreen(active, clientX) {
    const x = clientX - active.left + viewport.current.scrollLeft - active.scroll;
    return Math.max(0, Math.min(sheet.duration_frames, Math.round(x * active.framesPerPixel)));
  }

  function startPointer(event) {
    if (event.button !== 0 || gesture.current) return;
    const { left, width } = content.current.getBoundingClientRect();
    const active = { left, framesPerPixel: sheet.duration_frames / width, scroll: viewport.current.scrollLeft, pointer: event.pointerId, x: event.clientX };
    active.originFrame = frameFromScreen(active, event.clientX);
    active.originX = event.clientX;
    active.button = event.target.closest('[data-cue-index]');
    active.cue = active.button ? sheet.cues[Number(active.button.dataset.cueIndex)] : null;
    if (!active.cue && dense && event.target.closest('.cue-lane')) active.cue = cueAt(sheet.cues, active.originFrame);
    if (active.cue) {
      if (tool === 'blade') {
        onSplit(active.cue, active.originFrame);
        return;
      }
      onSelect(active.cue);
      active.edge = event.target.dataset.edge;
      if (!active.button) {
        const { start_frame: from, end_frame: to } = active.cue;
        const hit = Math.min(9 * active.framesPerPixel, (to - from) / 4);
        if (active.originFrame - from < hit) active.edge = 'start';
        else if (to - active.originFrame <= hit) active.edge = 'end';
      }
      if (tool === 'trim' && !active.edge) return;
      active.ripple = tool === 'trim';
      active.calculate = prepareCueDrag(sheet, active.cue, active.edge, active.ripple, snapping, frameAt(playback.clock.read(), sheet.fps), active.framesPerPixel);
    } else {
      onSeek(secondsAt(active.originFrame, sheet.fps));
    }
    gesture.current = active;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function previewPointer(active) {
    const frame = frameFromScreen(active, active.x);
    if (!active.cue) {
      onSeek(secondsAt(frame, sheet.fps));
      return;
    }
    if (!active.moved && Math.abs(active.x - active.originX) < 3) return;
    active.moved = true;
    active.range = active.calculate(frame - active.originFrame);
    if (active.button) active.button.dataset.dragging = 'true';
    const preview = ghost.current;
    preview.hidden = false;
    preview.style.width = `${(active.range.end - active.range.start) / active.framesPerPixel}px`;
    preview.style.transform = `translate3d(${active.range.start / active.framesPerPixel}px, 0, 0)`;
  }

  function movePointer(event) {
    const active = gesture.current;
    if (active?.pointer !== event.pointerId) return;
    active.x = event.clientX;
    if (animation.current === null) {
      animation.current = requestAnimationFrame(() => {
        animation.current = null;
        if (gesture.current === active) previewPointer(active);
      });
    }
  }

  function endGesture(apply) {
    const active = gesture.current;
    if (!active) return;
    cancelAnimationFrame(animation.current);
    animation.current = null;
    gesture.current = null;
    if (active.button) delete active.button.dataset.dragging;
    ghost.current.hidden = true;
    if (apply && active.range) onEdit(active.cue, active.range, active.edge, active.ripple);
  }

  function finishPointer(event) {
    const active = gesture.current;
    if (active?.pointer !== event.pointerId) return;
    const apply = event.type === 'pointerup';
    if (apply && active.x !== event.clientX) {
      active.x = event.clientX;
      previewPointer(active);
    } else if (apply && animation.current !== null) {
      previewPointer(active);
    }
    endGesture(apply);
  }

  return (
    <section className="panel timeline-panel" aria-label="时间轴">
      <div className="panel-heading timeline-heading">
        <div className="timeline-title">
          <h2>时间轴</h2>
          <span className="timeline-count">{sheet.cues.length} 个灯效</span>
        </div>
        <div className="timeline-tools">
          <div className="timeline-edit-tools" role="group" aria-label="编辑工具">
            {TOOLS.map(({ id, label, icon }) => <Button key={id} icon={icon} type={tool === id ? 'primary' : 'default'} aria-pressed={tool === id} onClick={() => onTool(id)} title={`${label} · ${shortcuts[id]}`}>{label}</Button>)}
            <Button icon={<LinkOutlined aria-hidden="true" />} type={snapping ? 'primary' : 'default'} aria-pressed={snapping} onClick={onSnap} title={`吸附 · ${shortcuts.snap}`}>吸附</Button>
          </div>
          <Select aria-label="时间轴缩放" value={zoom} options={ZOOM_OPTIONS} onChange={onZoom} popupMatchSelectWidth={false} virtual={false} />
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
            className={`timeline-content tool-${tool}`}
            ref={content}
            style={{ width: `${zoom * 100}%` }}
            role="group"
            tabIndex={0}
            aria-label="时间轴定位，方向键移动播放头，按住 Shift 移动十帧"
            onKeyDown={(event) => { if (event.key === 'Escape') endGesture(false); }}
            onPointerDown={startPointer}
            onPointerMove={movePointer}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
            onLostPointerCapture={finishPointer}
            onClick={(event) => {
              const button = event.target.closest('[data-cue-index]');
              if (!event.detail && button) onSelect(sheet.cues[Number(button.dataset.cueIndex)]);
            }}
          >
            <div className="ruler"><Ruler duration={duration} zoom={zoom} /></div>
            <div className="wave-lane"><Waveform duration={duration} media={media} peaks={peaks} /></div>
            <div className="cue-lane">
              {sheet.cues.length === 0 && <span className="lane-hint">在时间轴上定位，再添加灯效</span>}
              {dense && <CueOverview cues={sheet.cues} duration={sheet.duration_frames} viewport={viewport} content={content} />}
              {dense && selectedIndex >= 0 && <CueBlock cue={sheet.cues[selectedIndex]} index={selectedIndex} selected duration={sheet.duration_frames} fps={sheet.fps} />}
              {!dense && sheet.cues.map((cue, index) => (
                <CueBlock
                  key={cue.id}
                  cue={cue}
                  index={index}
                  selected={cue.id === selectedId}
                  duration={sheet.duration_frames}
                  fps={sheet.fps}
                />
              ))}
              <div className="cue-ghost" ref={ghost} hidden aria-hidden="true" />
            </div>
            <Playhead clock={playback.clock} duration={duration} playing={playback.playing} viewport={viewport} content={content} />
          </div>
        </div>
      </div>
      <div className="timeline-footer"><span>拖中间移动 · 拖边缘修剪 · 刀片点击切开</span><span>工程 {rateLabel} fps · 预览 {PREVIEW_FPS} fps</span></div>
    </section>
  );
}
