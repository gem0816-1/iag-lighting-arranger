import { useEffect, useRef, useState } from 'react';
import { App as AntApp, Button } from 'antd';
import { DownloadOutlined, FileAddOutlined, FolderOpenOutlined, RedoOutlined, UndoOutlined } from '@ant-design/icons';
import Inspector, { CommitField } from './Inspector.jsx';
import Stage from './Stage.jsx';
import Timeline from './Timeline.jsx';
import { cueAt, exampleSheet, exportSheet, fileName, frameAt, insertCue, makeSheet, parseSheet, resizeSheet, secondsAt, updateCue } from './cue-sheet.js';
import { measureWaveform, usePlayback } from './playback.js';

const DRAFT_KEY = 'iag-web-arranger:draft:v1';
const UNDO_LIMIT = 30;

function initialHistory() {
  let sheet = makeSheet();
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) sheet = parseSheet(draft);
  } catch {
    // A blocked or obsolete draft must not prevent the editor from starting.
  }
  return { past: [], sheet, future: [] };
}

function download(sheet) {
  const url = URL.createObjectURL(new Blob([exportSheet(sheet)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(sheet.timeline_name);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const { message } = AntApp.useApp();
  const [history, setHistory] = useState(initialHistory);
  const sheet = history.sheet;
  const [selectedId, setSelectedId] = useState(null);
  const [media, setMedia] = useState(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const inputMedia = useRef(null);
  const inputProject = useRef(null);
  const mediaRef = useRef(null);
  const mediaSequence = useRef(0);
  const projectRequest = useRef(0);
  const duration = secondsAt(sheet.duration_frames, sheet.fps);
  const selected = sheet.cues.find((cue) => cue.id === selectedId);
  const playback = usePlayback(duration, mediaRef, (text) => message.error(text));

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, exportSheet(sheet));
      setDraftSaved(true);
    } catch {
      setDraftSaved(false);
    }
  }, [sheet]);

  const localMediaUrl = media?.file ? media.url : undefined;
  useEffect(() => () => { if (localMediaUrl) URL.revokeObjectURL(localMediaUrl); }, [localMediaUrl]);

  function commit(next) {
    setHistory((current) => next === current.sheet ? current : {
      past: [...current.past, current.sheet].slice(-UNDO_LIMIT),
      sheet: next,
      future: [],
    });
  }

  function applyHistory(next) {
    if (!next) return;
    playback.pause();
    const end = secondsAt(next.duration_frames, next.fps);
    if (playback.clock.read() >= end) playback.seek(end);
  }

  function undo() {
    const previous = history.past.at(-1);
    if (!previous) return;
    applyHistory(previous);
    setHistory(({ past, sheet: current, future }) => ({ past: past.slice(0, -1), sheet: previous, future: [current, ...future] }));
  }

  function redo() {
    const next = history.future[0];
    if (!next) return;
    applyHistory(next);
    setHistory(({ past, sheet: current, future }) => ({ past: [...past, current], sheet: next, future: future.slice(1) }));
  }

  function run(action) {
    try {
      action();
    } catch (error) {
      message.error(error.message);
    }
  }

  function resetProject(next) {
    projectRequest.current += 1;
    playback.pause();
    playback.seek(0);
    setSelectedId(null);
    setMedia(null);
    commit(next);
  }

  async function openProject(event) {
    const input = event.currentTarget;
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const request = ++projectRequest.current;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('工程文件超过 20 MB。');
      const next = parseSheet(await file.text());
      if (request !== projectRequest.current) return;
      resetProject(next);
      message.success('工程已打开。可重新选择参考音频或视频。');
    } catch (error) {
      if (request === projectRequest.current) message.error(error.message);
    }
  }

  function openMedia(event) {
    const input = event.currentTarget;
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const kind = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name) ? 'video' : 'audio';
    loadMedia({ file, kind, url: URL.createObjectURL(file), label: file.name });
  }

  function loadMedia(source) {
    playback.pause();
    if (!sheet.cues.length) playback.clock.write(0);
    const id = ++mediaSequence.current;
    setMedia({ ...source, id, status: source.kind === 'bilibili' ? 'ready' : 'loading', seconds: 0, peaks: null });
  }

  function removeMedia() {
    playback.pause();
    setMedia(null);
  }

  function resize(seconds) {
    const next = resizeSheet(sheet, seconds);
    applyHistory(next);
    commit(next);
  }

  function handleDuration(id, seconds) {
    if (media?.id !== id || media.status === 'error' || media.seconds === seconds || (media.seconds && media.kind !== 'bilibili')) return duration;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      handleReferenceError(id, '请输入有固定时长、可以回看的视频。');
      return duration;
    }
    setMedia((current) => current?.id === id ? { ...current, status: 'ready', seconds } : current);
    let limit = duration;
    if (seconds <= 86_400 && (!sheet.cues.length || (media.kind === 'bilibili' && seconds > duration))) {
      const next = resizeSheet(sheet, Math.max(secondsAt(1, sheet.fps), seconds));
      commit(next);
      limit = secondsAt(next.duration_frames, next.fps);
      if (playback.clock.read() > limit) playback.seek(limit, limit);
    }
    if (media.file) {
      measureWaveform(media.file, seconds).then((peaks) => {
        setMedia((current) => current?.id === id ? { ...current, peaks } : current);
      }).catch(() => {});
    }
    return limit;
  }

  function handleMetadata(event) {
    const element = event.currentTarget;
    if (!media || element !== mediaRef.current) return;
    handleDuration(media.id, element.duration);
    if (Number.isFinite(element.duration) && element.duration > 0) {
      element.currentTime = Math.min(playback.clock.read(), element.duration);
    }
  }

  function handleEmbeddedReady(id) {
    setMedia((current) => current?.id === id && current.status !== 'error' ? { ...current, status: 'ready' } : current);
  }

  function handleBilibiliSync(id, sync) {
    setMedia((current) => current?.id === id && current.sync !== sync ? { ...current, sync } : current);
  }

  function handleReferenceError(id, text) {
    if (media?.id !== id) return;
    playback.pause();
    if (media.file) {
      setMedia(null);
      message.error(text);
    } else {
      setMedia({ ...media, status: 'error', error: text });
    }
  }

  function handleMediaError(event) {
    if (!media || event.currentTarget !== mediaRef.current) return;
    handleReferenceError(media.id, media.file
      ? '浏览器无法读取这个媒体。可以试试 WAV、MP3 或常见的 MP4。'
      : '这个网址无法作为媒体播放。请检查链接是否可访问，或试试视频文件直链、B 站或 YouTube 视频页。');
  }

  function locateBilibiliTime(seconds) {
    const frame = frameAt(seconds, sheet.fps);
    let limit = duration;
    if (frame >= sheet.duration_frames) {
      const next = resizeSheet(sheet, Math.min(86_400, seconds + Math.max(2, secondsAt(1, sheet.fps))));
      if (frame >= next.duration_frames) throw new Error('此时间超出工程可编排的范围。');
      commit(next);
      limit = secondsAt(next.duration_frames, next.fps);
    }
    playback.pause();
    setSelectedId(null);
    playback.seek(seconds, limit);
  }

  function selectCue(cue) {
    playback.pause();
    playback.seek(secondsAt(cue.start_frame, sheet.fps));
    setSelectedId(cue.id);
  }

  function addCue() {
    const frame = frameAt(playback.clock.read(), sheet.fps);
    playback.pause();
    const existing = cueAt(sheet.cues, frame);
    if (existing) {
      setSelectedId(existing.id);
      message.info('此处已有灯效。定位到空白处即可添加。');
      return;
    }
    run(() => {
      const result = insertCue(sheet, frame);
      commit(result.sheet);
      selectCue(result.cue);
    });
  }

  function editCue(patch) {
    if (selected) run(() => {
      const next = updateCue(sheet, selected.id, patch);
      commit(next);
      if ('start_frame' in patch && next !== sheet) playback.seek(secondsAt(patch.start_frame, sheet.fps));
    });
  }

  function moveCue(cue, start_frame) {
    run(() => {
      const end_frame = start_frame + cue.end_frame - cue.start_frame;
      commit(updateCue(sheet, cue.id, { start_frame, end_frame }));
      playback.seek(secondsAt(start_frame, sheet.fps));
    });
  }

  function removeCue() {
    if (!selected) return;
    commit({ ...sheet, cues: sheet.cues.filter((cue) => cue.id !== selected.id) });
    setSelectedId(null);
  }

  function onKeyboard(event) {
    if (event.defaultPrevented || event.repeat || event.target.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="combobox"]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (event.key === ' ' && !event.target.closest('button')) {
      event.preventDefault();
      if (media?.status !== 'loading') playback.toggle();
    } else if (event.key === 'Delete' && selected) {
      event.preventDefault();
      removeCue();
    }
  }

  return (
    <div className="editor" onKeyDown={onKeyboard}>
      <header className="app-bar">
        <div className="app-bar-inner">
          <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><h1><b>IAG</b> 灯光编排</h1></div>
          <div className="header-actions">
            <Button type="text" icon={<FileAddOutlined aria-hidden="true" />} onClick={() => resetProject(makeSheet())}>新建</Button>
            <Button icon={<FolderOpenOutlined aria-hidden="true" />} onClick={() => inputProject.current.click()}>打开工程</Button>
            <Button type="primary" icon={<DownloadOutlined aria-hidden="true" />} onClick={() => download(sheet)} disabled={!sheet.cues.length}>导出给 IAG</Button>
          </div>
        </div>
      </header>

      <main className="workspace">
        <div className="project-header">
          <div className="project-title"><CommitField aria-label="工程名称" variant="borderless" placeholder="未命名编排" maxLength={1024} value={sheet.timeline_name} onCommit={(name) => commit({ ...sheet, timeline_name: name.trim() || '未命名编排' })} /></div>
          <div className="history-actions">
            <span className="save-state"><span />{draftSaved ? '草稿已存本机' : '请导出保存'}</span>
            <Button type="text" icon={<UndoOutlined />} onClick={undo} disabled={!history.past.length} aria-label="撤销" title="撤销" />
            <Button type="text" icon={<RedoOutlined />} onClick={redo} disabled={!history.future.length} aria-label="重做" title="重做" />
          </div>
        </div>
        <div className="workbench">
          <Stage
            sheet={sheet}
            playback={playback}
            duration={duration}
            media={media}
            mediaRef={mediaRef}
            onMedia={() => inputMedia.current.click()}
            onLink={loadMedia}
            onRemoveMedia={removeMedia}
            onMetadata={handleMetadata}
            onMediaError={handleMediaError}
            onEmbeddedReady={handleEmbeddedReady}
            onDuration={handleDuration}
            onBilibiliSync={handleBilibiliSync}
            onEmbeddedError={handleReferenceError}
            onEmbeddedBlocked={() => message.info('可用 YouTube 视频内的播放键开始播放。')}
            onLocate={locateBilibiliTime}
          />
          <Inspector
            cue={selected}
            sheet={sheet}
            run={run}
            onUpdate={editCue}
            onRemove={removeCue}
            onResize={resize}
            onExample={() => resetProject(exampleSheet())}
          />
        </div>
        <Timeline
          sheet={sheet}
          playback={playback}
          media={media}
          peaks={media?.peaks}
          selectedId={selectedId}
          onSelect={selectCue}
          onMove={moveCue}
          onAdd={addCue}
          onSeek={(seconds) => { setSelectedId(null); playback.seek(seconds); }}
        />
        <footer className="workspace-footer">
          <span>本地文件仅在浏览器读取</span>
          <span className="shortcuts"><kbd>空格</kbd> 播放 / 暂停 <kbd>Del</kbd> 删除灯效</span>
        </footer>
      </main>
      <input hidden ref={inputMedia} type="file" aria-label="选择本地媒体文件" accept="audio/*,video/*,.wav,.mp3,.m4a,.ogg,.flac,.mp4,.webm,.mov,.m4v,.mkv" onChange={openMedia} />
      <input hidden ref={inputProject} type="file" aria-label="选择灯光工程文件" accept=".json,application/json" onChange={openProject} />
    </div>
  );
}
