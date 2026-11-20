import { Button } from 'antd';
import { AudioOutlined, CaretRightOutlined, PauseOutlined, StepBackwardOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { cueAt, formatTime, MODES, sampleColor } from './cue-sheet.js';
import { useTime } from './playback.js';

function LightPreview({ sheet, clock, playing }) {
  const time = useTime(clock);
  const position = time * sheet.fps.numerator / sheet.fps.denominator;
  const nearest = Math.round(position);
  const frame = Math.abs(position - nearest) < 1e-7 ? nearest : position;
  const cue = cueAt(sheet.cues, frame);
  const baseColor = sampleColor(cue, frame, sheet.fps, false);
  const color = playing ? sampleColor(cue, frame, sheet.fps) : baseColor;
  return (
    <div className="light-preview" style={{ '--light-color': color, '--base-color': baseColor }}>
      <div className="stage-grid" aria-hidden="true" />
      <div className="stage-orbit" aria-hidden="true" />
      <div className="lightstick" aria-hidden="true"><div className="lightstick-cap" /><div className="lightstick-handle" /></div>
      <div className="stage-status">
        <span className="status-light" aria-hidden="true" />
        <span>{cue ? MODES[cue.mode] : '黑场'}</span>
        <code>{baseColor}</code>
      </div>
    </div>
  );
}

function TimeReadout({ clock, duration }) {
  const time = useTime(clock);
  return <output className="time-readout" aria-label="播放位置" aria-live="off"><strong>{formatTime(time, true)}</strong><span> / {formatTime(duration, true)}</span></output>;
}

export default function Stage({ sheet, playback, duration, media, mediaRef, onMedia, onMetadata, onMediaError }) {
  const mediaProps = {
    ref: mediaRef,
    src: media?.url,
    preload: 'metadata',
    onLoadedMetadata: onMetadata,
    onError: onMediaError,
  };
  return (
    <section className="panel stage-panel" aria-label="灯光预览">
      <div className="panel-heading">
        <h2>灯光预览</h2>
        <Button icon={media?.kind === 'video' ? <VideoCameraOutlined aria-hidden="true" /> : <AudioOutlined aria-hidden="true" />} onClick={onMedia}>选择音频或视频</Button>
      </div>
      <div className={`stage-view${media?.kind === 'video' ? ' with-video' : ''}`}>
        {media?.kind === 'video' && <video key={media.url} {...mediaProps} playsInline aria-label="参考视频" />}
        {media?.kind === 'audio' && <audio key={media.url} {...mediaProps} />}
        <LightPreview sheet={sheet} clock={playback.clock} playing={playback.playing} />
      </div>
      <div className="playback-bar">
        <Button
          className="play-button"
          type="primary"
          icon={playback.playing ? <PauseOutlined aria-hidden="true" /> : <CaretRightOutlined aria-hidden="true" />}
          onClick={playback.toggle}
          disabled={media?.status === 'loading'}
        >{playback.playing ? '暂停' : '播放'}</Button>
        <Button type="text" icon={<StepBackwardOutlined />} onClick={() => playback.seek(0)} aria-label="回到起点" title="回到起点" />
        <TimeReadout clock={playback.clock} duration={duration} />
      </div>
      <div className="media-caption" title={media?.file.name}>
        {media ? `${media.status === 'loading' ? '正在读取 · ' : ''}${media.file.name}` : '可直接预览灯效，也可用本地媒体对齐节奏'}
      </div>
    </section>
  );
}
