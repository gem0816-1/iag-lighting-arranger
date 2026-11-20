import { Button } from 'antd';
import { AudioOutlined, CaretRightOutlined, CloseOutlined, PauseOutlined, StepBackwardOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { cueAt, formatTime, MODES, sampleColor } from './cue-sheet.js';
import { useTime } from './playback.js';
import { BilibiliPosition, ReferenceLinkButton } from './ReferenceMedia.jsx';
import YouTubePlayer from './YouTubePlayer.jsx';

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

export default function Stage({
  sheet, playback, duration, media, mediaRef, onMedia, onLink, onRemoveMedia, onMetadata, onMediaError,
  onEmbeddedReady, onDuration, onEmbeddedError, onEmbeddedBlocked, onLocate,
}) {
  const available = media && media.status !== 'error';
  const youtube = available && media.kind === 'youtube';
  const bilibili = available && media.kind === 'bilibili';
  const nativeVideo = available && media.kind === 'video';
  const nativeAudio = available && media.kind === 'audio';
  const embedded = youtube || bilibili;
  const playLabel = playback.playing ? '暂停' : '播放';
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
        <div className="stage-source-actions">
          <Button icon={nativeVideo ? <VideoCameraOutlined aria-hidden="true" /> : <AudioOutlined aria-hidden="true" />} onClick={onMedia}>选择音频或视频</Button>
          <ReferenceLinkButton onLink={onLink} />
        </div>
      </div>
      <div className={`stage-view${embedded ? ' with-embed' : nativeVideo ? ' with-video' : ''}`}>
        {nativeVideo && <video key={media.id} {...mediaProps} playsInline aria-label="参考视频" />}
        {nativeAudio && <audio key={media.id} {...mediaProps} />}
        {bilibili && (
          <div className="reference-player" key={media.id}>
            <iframe src={media.embedUrl} title="B 站参考视频" allow="fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          </div>
        )}
        {youtube && (
          <YouTubePlayer
            key={media.id}
            videoId={media.videoId}
            mediaRef={mediaRef}
            onReady={() => onEmbeddedReady(media.id)}
            onDuration={(seconds) => onDuration(media.id, seconds)}
            onPlayback={playback.syncMedia}
            onBlocked={onEmbeddedBlocked}
            onError={(text) => onEmbeddedError(media.id, text)}
          />
        )}
        <LightPreview sheet={sheet} clock={playback.clock} playing={playback.playing} />
      </div>
      {bilibili && <BilibiliPosition key={media.id} url={media.url} onLocate={onLocate} />}
      <div className="playback-bar">
        <Button
          className="play-button"
          type="primary"
          icon={playback.playing ? <PauseOutlined aria-hidden="true" /> : <CaretRightOutlined aria-hidden="true" />}
          onClick={playback.toggle}
          disabled={media?.status === 'loading'}
        >{bilibili ? `${playLabel}灯效` : playLabel}</Button>
        <Button type="text" icon={<StepBackwardOutlined />} onClick={() => playback.seek(0)} aria-label="回到起点" title="回到起点" />
        <TimeReadout clock={playback.clock} duration={duration} />
      </div>
      <div className="media-caption">
        <span title={media?.label}>
          {media?.status === 'loading' && '正在读取 · '}
          {media?.status === 'error' && '无法载入 · '}
          {media?.label ?? '可预览灯效，也可用本地素材或网页视频对齐'}
        </span>
        {media?.status === 'error' && media.kind === 'youtube' && <a href={media.url} target="_blank" rel="noreferrer">打开原视频</a>}
        {media && <Button size="small" type="text" icon={<CloseOutlined />} onClick={onRemoveMedia} aria-label="移除参考媒体" title="移除参考媒体" />}
      </div>
      {media?.error && <p className="stage-media-error" role="alert">{media.error}</p>}
    </section>
  );
}
