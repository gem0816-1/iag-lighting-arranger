import { useLayoutEffect, useRef } from 'react';
import { Button } from 'antd';
import { AudioOutlined, CaretRightOutlined, CloseOutlined, PauseOutlined, StepBackwardOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { cueAt, formatTime, MODES, sampleColor } from './cue-sheet.js';
import { BilibiliPosition, ReferenceLinkButton } from './ReferenceMedia.jsx';
import YouTubePlayer from './YouTubePlayer.jsx';
import BilibiliPlayer from './BilibiliPlayer.jsx';
import StickMonitor from './StickMonitor.jsx';

function LightPreview({ sheet, clock, playing }) {
  const stage = useRef(null);
  const emitter = useRef(null);
  const mode = useRef(null);
  const colorText = useRef(null);

  useLayoutEffect(() => {
    const light = emitter.current;
    const background = stage.current;
    const label = mode.current;
    const value = colorText.current;
    const frameRate = sheet.fps.numerator / sheet.fps.denominator;
    let previousCue;
    let previousColor;
    let previousText;

    function paint() {
      const time = clock.read();
      const position = time * frameRate;
      const exact = Math.round(position);
      const cue = cueAt(sheet.cues, Math.abs(position - exact) < 1e-7 ? exact : position);
      const baseColor = sampleColor(cue, position, sheet.fps, false);
      const color = playing && cue?.mode !== 'gradient' ? sampleColor(cue, position, sheet.fps) : baseColor;
      if (cue !== previousCue || previousColor === undefined) {
        background.style.setProperty('--base-color', sampleColor(cue, cue?.start_frame ?? 0, sheet.fps, false));
        label.textContent = cue ? MODES[cue.mode] : '黑场';
        previousCue = cue;
      }
      if (color !== previousColor) {
        light.style.setProperty('--light-color', color);
        previousColor = color;
      }
      if (baseColor !== previousText) {
        value.textContent = baseColor;
        previousText = baseColor;
      }
    }

    paint();
    return clock.subscribe(paint);
  }, [clock, playing, sheet]);

  return (
    <div className="light-preview" ref={stage}>
      <div className="stage-grid" aria-hidden="true" />
      <div className="stage-orbit" aria-hidden="true" />
      <div className="lightstick" aria-hidden="true"><div className="lightstick-cap" ref={emitter} /><div className="lightstick-handle" /></div>
      <div className="stage-status">
        <span className="status-light" aria-hidden="true" />
        <span ref={mode} />
        <code ref={colorText} />
      </div>
    </div>
  );
}

function TimeReadout({ clock, duration }) {
  const value = useRef(null);
  useLayoutEffect(() => {
    const element = value.current;
    let last;
    function paint() {
      const now = Math.round(clock.read() * 1000);
      if (now === last) return;
      last = now;
      element.textContent = formatTime(now / 1000, true);
    }
    paint();
    return clock.subscribe(paint);
  }, [clock]);
  return <output className="time-readout" aria-label="播放位置" aria-live="off"><strong ref={value} /><span> / {formatTime(duration, true)}</span></output>;
}

export default function Stage({
  sheet, playback, duration, media, mediaRef, onMedia, onLink, onRemoveMedia, onMetadata, onMediaError,
  onEmbeddedReady, onDuration, onBilibiliSync, onEmbeddedError, onEmbeddedBlocked, onLocate,
}) {
  const available = media && media.status !== 'error';
  const youtube = available && media.kind === 'youtube';
  const bilibili = available && media.kind === 'bilibili';
  const synced = bilibili && media.sync === 'ready';
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
          <BilibiliPlayer
            key={media.id}
            src={media.embedUrl}
            mediaRef={mediaRef}
            onStatus={(status) => onBilibiliSync(media.id, status)}
            onDuration={(seconds) => onDuration(media.id, seconds)}
            onPlayback={playback.syncMedia}
          />
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
      {bilibili && (synced
        ? <p className="bilibili-sync-status" role="status">B 站已自动同步</p>
        : <BilibiliPosition key={media.id} url={media.url} onLocate={onLocate} waiting={media.sync === 'waiting'} />)}
      <div className="playback-bar">
        <Button
          className="play-button"
          type="primary"
          icon={playback.playing ? <PauseOutlined aria-hidden="true" /> : <CaretRightOutlined aria-hidden="true" />}
          onClick={playback.toggle}
          disabled={media?.status === 'loading'}
        >{bilibili && !synced ? `${playLabel}灯效` : playLabel}</Button>
        <Button type="text" icon={<StepBackwardOutlined />} onClick={() => playback.seek(0)} aria-label="回到起点" title="回到起点" />
        <TimeReadout clock={playback.clock} duration={duration} />
      </div>
      <StickMonitor sheet={sheet} clock={playback.clock} playing={playback.playing} />
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
