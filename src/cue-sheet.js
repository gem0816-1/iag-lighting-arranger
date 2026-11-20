export const MODES = {
  solid: '常亮',
  breathing: '呼吸',
  flash: '闪烁',
  fast_flash: '快闪',
  slow_flash: '慢闪',
  gradient: '渐变',
  off: '关闭',
};

export const DEFAULT_COLOR = '#67E6B1';
export const PREVIEW_FPS = 60;
const SPEEDS = { breathing: 5, flash: 6, fast_flash: 6, slow_flash: 20 };
const MAX_CUES = 50_000;
const MAX_SECONDS = 86_400;
const SHEET_KEYS = ['version', 'fps', 'start_frame', 'timecode_start', 'timeline_name', 'duration_frames', 'cues'];
const CUE_KEYS = ['start_frame', 'end_frame', 'mode', 'color', 'end_color', 'speed', 'brightness'];
let cueId = 0;

export function makeSheet(name = '未命名编排', seconds = 30) {
  return {
    version: 1,
    fps: { numerator: PREVIEW_FPS, denominator: 1 },
    start_frame: 0,
    timecode_start: '00:00:00:00',
    timeline_name: name,
    duration_frames: Math.round(seconds * PREVIEW_FPS),
    cues: [],
  };
}

export function secondsAt(frame, fps) {
  return (frame * fps.denominator) / fps.numerator;
}

export function frameAt(seconds, fps) {
  return Math.round((seconds * fps.numerator) / fps.denominator);
}

export function formatTime(seconds, detailed = false) {
  const milliseconds = Math.round(Math.max(0, seconds) * 1000);
  const minutes = Math.floor(milliseconds / 60_000);
  const wholeSeconds = Math.floor(milliseconds / 1000) % 60;
  const time = `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
  return detailed ? `${time}.${String(milliseconds % 1000).padStart(3, '0')}` : time;
}

function record(value, allowed, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}必须是 JSON 对象。`);
  }
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label}包含暂不支持的字段「${unknown}」。`);
}

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label}超出有效整数范围。`);
  }
  return value;
}

function shortText(value, label) {
  if (typeof value !== 'string' || value.length > 1024) {
    throw new Error(`${label}必须是 1024 字符以内的文字。`);
  }
  return value;
}

function rgbHex(value, label) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`${label}须为 #RRGGBB 颜色。`);
  }
  return value.toUpperCase();
}

export function defaultSpeed(mode) {
  return Object.hasOwn(SPEEDS, mode) ? SPEEDS[mode] : null;
}

function decodeCue(cue, index, maxFrame) {
  const label = `第 ${index + 1} 个灯效`;
  record(cue, CUE_KEYS, label);
  const start_frame = integer(cue.start_frame, 0, maxFrame - 1, `${label}的开始帧`);
  const end_frame = integer(cue.end_frame, start_frame + 1, maxFrame, `${label}的结束帧`);
  const mode = cue.mode;
  if (typeof mode !== 'string' || !Object.hasOwn(MODES, mode)) throw new Error(`${label}的灯效类型不受支持。`);
  const color = rgbHex(cue.color === undefined ? '#000000' : cue.color, `${label}的起始颜色`);
  const end_color = cue.end_color == null ? null : rgbHex(cue.end_color, `${label}的结束颜色`);
  if ((mode === 'gradient') !== (end_color !== null)) {
    throw new Error(`${label}的结束颜色只用于渐变，且渐变必须有结束颜色。`);
  }
  const speed = cue.speed == null ? null : integer(cue.speed, 1, 255, `${label}的速度参数`);
  if (speed !== null && defaultSpeed(mode) === null) throw new Error(`${label}不适用速度参数。`);
  const brightness = integer(cue.brightness === undefined ? 100 : cue.brightness, 0, 100, `${label}的亮度`);
  return { id: ++cueId, start_frame, end_frame, mode, color, end_color, speed, brightness };
}

export function parseSheet(source) {
  let document;
  try {
    document = JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('文件不是有效的 JSON。');
  }
  if (document?.schemaVersion === 2 || Array.isArray(document?.tracks)) {
    throw new Error('此编辑器读取 .iagcue.json 工程。iaglight 和 RRNN 仍可在 IAG 手机 App 中使用。');
  }
  record(document, SHEET_KEYS, '工程');
  integer(document.version === undefined ? 1 : document.version, 1, 1, '工程版本');
  record(document.fps, ['numerator', 'denominator'], '帧率');
  const numerator = integer(document.fps.numerator, 1, 1_000_000, '帧率分子');
  const denominator = integer(document.fps.denominator, 1, 1_000_000, '帧率分母');
  if (numerator > denominator * 1000) throw new Error('帧率须不超过 1000 fps。');
  const fps = { numerator, denominator };
  const maximum = Math.floor(MAX_SECONDS * numerator / denominator);
  const start_frame = integer(document.start_frame === undefined ? 0 : document.start_frame, 0, Number.MAX_SAFE_INTEGER, '时间轴起帧');
  const timecode_start = shortText(document.timecode_start === undefined ? '00:00:00:00' : document.timecode_start, '起始时间码');
  const timeline_name = shortText(document.timeline_name === undefined ? '' : document.timeline_name, '工程名称');
  if (!Array.isArray(document.cues) || document.cues.length > MAX_CUES) throw new Error('灯效列表格式有误或超过 50,000 个。');
  const cues = document.cues.map((cue, index) => decodeCue(cue, index, maximum));
  cues.sort((left, right) => left.start_frame - right.start_frame || left.end_frame - right.end_frame);
  assertNonOverlapping(cues);
  const lastFrame = cues.at(-1)?.end_frame ?? 0;
  const duration_frames = integer(document.duration_frames ?? lastFrame, Math.max(1, lastFrame), maximum, '工程时长');
  return { version: 1, fps, start_frame, timecode_start, timeline_name, duration_frames, cues };
}

function assertNonOverlapping(cues) {
  const overlapping = cues.some((cue, index) => index > 0 && cues[index - 1].end_frame > cue.start_frame);
  if (overlapping) throw new Error('灯效时间有重叠。请移到空白处，或先缩短灯效。');
}

export function exportSheet(sheet) {
  const cues = sheet.cues.map(({ start_frame, end_frame, mode, color, end_color, speed, brightness }) => ({
    start_frame, end_frame, mode, color, brightness,
    ...(end_color === null ? {} : { end_color }),
    ...(speed === null ? {} : { speed }),
  }));
  return `${JSON.stringify({ ...sheet, cues }, null, 2)}\n`;
}

export function fileName(title) {
  const clean = title.replace(/[^\S ]|[<>:"/\\|?*]|\p{Cc}/gu, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 100);
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  return `${clean && !reserved.test(clean) ? clean : 'IAG-灯光编排'}.iagcue.json`;
}

function floorIndex(cues, frame) {
  let low = 0;
  let high = cues.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (cues[middle].start_frame <= frame) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

export function cueAt(cues, frame) {
  const cue = cues[floorIndex(cues, frame)];
  return cue && frame < cue.end_frame ? cue : null;
}

export function insertCue(sheet, frame) {
  if (sheet.cues.length >= MAX_CUES) throw new Error('最多可放置 50,000 个灯效。');
  integer(frame, 0, sheet.duration_frames - 1, '灯效起点');
  const index = floorIndex(sheet.cues, frame);
  if (sheet.cues[index]?.end_frame > frame) throw new Error('播放头处已有灯效，请先选择空白处。');
  const nextFrame = sheet.cues[index + 1]?.start_frame ?? sheet.duration_frames;
  const endFrame = Math.min(frame + Math.max(1, frameAt(2, sheet.fps)), nextFrame);
  const cue = decodeCue({ start_frame: frame, end_frame: endFrame, mode: 'solid', color: DEFAULT_COLOR }, index + 1, sheet.duration_frames);
  const cues = sheet.cues.slice();
  cues.splice(index + 1, 0, cue);
  return { sheet: { ...sheet, cues }, cue };
}

export function updateCue(sheet, id, patch) {
  const index = sheet.cues.findIndex((cue) => cue.id === id);
  if (index < 0) throw new Error('这个灯效已经被删除。');
  const { id: existingId, ...current } = sheet.cues[index];
  const updated = { ...current, ...patch };
  if (Object.keys(patch).every((key) => current[key] === updated[key])) return sheet;
  const cue = { ...decodeCue(updated, index, sheet.duration_frames), id: existingId };
  const cues = sheet.cues.slice();
  cues[index] = cue;
  cues.sort((left, right) => left.start_frame - right.start_frame);
  assertNonOverlapping(cues);
  return { ...sheet, cues };
}

function sliceCue(cue, start_frame, end_frame, fps) {
  if (cue.mode !== 'gradient') return { ...cue, start_frame, end_frame };
  const source = { ...cue, brightness: 100 };
  return {
    ...cue, start_frame, end_frame,
    color: sampleColor(source, start_frame, fps, false),
    end_color: sampleColor(source, end_frame, fps, false),
  };
}

function editSheet(sheet, cues) {
  if (cues.length > MAX_CUES) throw new Error('最多可放置 50,000 个灯效。');
  cues.sort((first, second) => first.start_frame - second.start_frame);
  assertNonOverlapping(cues);
  return { ...sheet, cues };
}

export function splitCue(sheet, cue, frame) {
  const index = sheet.cues.indexOf(cue);
  if (index < 0 || !Number.isSafeInteger(frame) || frame <= cue.start_frame || frame >= cue.end_frame) return sheet;
  const first = sliceCue(cue, cue.start_frame, frame, sheet.fps);
  const second = { ...sliceCue(cue, frame, cue.end_frame, sheet.fps), id: ++cueId };
  const cues = sheet.cues.slice();
  cues.splice(index, 1, first, second);
  return editSheet(sheet, cues);
}

export function moveCueOverwrite(sheet, cue, start) {
  if (start === cue.start_frame) return sheet;
  const end = start + cue.end_frame - cue.start_frame;
  integer(start, 0, sheet.duration_frames - 1, '灯效起点');
  integer(end, start + 1, sheet.duration_frames, '灯效终点');
  const cues = [{ ...cue, start_frame: start, end_frame: end }];
  for (const other of sheet.cues) {
    if (other.id === cue.id) continue;
    if (other.end_frame <= start || other.start_frame >= end) {
      cues.push(other);
      continue;
    }
    if (other.start_frame < start) cues.push(sliceCue(other, other.start_frame, start, sheet.fps));
    if (other.end_frame > end) {
      const tail = sliceCue(other, end, other.end_frame, sheet.fps);
      if (other.start_frame < start) tail.id = ++cueId;
      cues.push(tail);
    }
  }
  return editSheet(sheet, cues);
}

export function trimCue(sheet, cue, start, end, ripple = false) {
  if (start === cue.start_frame && end === cue.end_frame) return sheet;
  integer(start, 0, sheet.duration_frames - 1, '灯效起点');
  integer(end, start + 1, sheet.duration_frames, '灯效终点');
  const change = end - start - (cue.end_frame - cue.start_frame);
  return editSheet(sheet, sheet.cues.map((other) => {
    if (other.id === cue.id) return { ...cue, start_frame: start, end_frame: end };
    if (!ripple || other.start_frame < cue.end_frame) return other;
    const start_frame = other.start_frame + change;
    const end_frame = other.end_frame + change;
    integer(start_frame, 0, sheet.duration_frames - 1, '后续灯效起点');
    integer(end_frame, start_frame + 1, sheet.duration_frames, '后续灯效终点');
    return { ...other, start_frame, end_frame };
  }));
}

export function removeCueFromSheet(sheet, cue, ripple = false) {
  const length = cue.end_frame - cue.start_frame;
  const cues = sheet.cues.filter((other) => other.id !== cue.id);
  return { ...sheet, cues: !ripple ? cues : cues.map((other) => other.start_frame < cue.end_frame ? other : {
    ...other, start_frame: other.start_frame - length, end_frame: other.end_frame - length,
  }) };
}

export function resizeSheet(sheet, seconds) {
  const minFrame = Math.max(1, sheet.cues.at(-1)?.end_frame ?? 0);
  const duration_frames = frameAt(seconds, sheet.fps);
  if (duration_frames < minFrame) throw new Error('工程时长须覆盖最后一个灯效，且至少保留一帧。');
  const maxFrame = Math.floor(MAX_SECONDS * sheet.fps.numerator / sheet.fps.denominator);
  integer(duration_frames, minFrame, maxFrame, '工程时长');
  return duration_frames === sheet.duration_frames ? sheet : { ...sheet, duration_frames };
}

function rgb(color) {
  return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
}

function roundEven(value) {
  const floor = Math.floor(value);
  return value - floor === 0.5 && floor % 2 === 0 ? floor : Math.round(value);
}

const BREATH_RATES = [[3, 0.590], [4, 0.780], [5, 0.977], [6, 1.165], [8, 1.579], [10, 1.935], [12, 2.310], [15, 3.000], [20, 3.750]];

function breathRate(speed) {
  if (speed < 3 || speed > 20) return null;
  const upper = BREATH_RATES.findIndex(([gear]) => speed <= gear);
  if (upper === 0) return BREATH_RATES[0][1];
  const [lowGear, lowRate] = BREATH_RATES[upper - 1];
  const [highGear, highRate] = BREATH_RATES[upper];
  return lowRate + (highRate - lowRate) * (speed - lowGear) / (highGear - lowGear);
}

export function sampleColor(cue, frame, fps, animate = true) {
  if (!cue || cue.mode === 'off' || cue.brightness === 0) return '#000000';
  const elapsedFrames = frame - cue.start_frame;
  let channels = rgb(cue.color);
  if (cue.mode === 'gradient') {
    const target = rgb(cue.end_color);
    const progress = Math.max(0, Math.min(1, elapsedFrames / (cue.end_frame - cue.start_frame)));
    channels = channels.map((channel, index) => roundEven(channel + (target[index] - channel) * progress));
  }
  channels = channels.map((channel) => Math.round(channel * cue.brightness / 100));
  const speed = cue.speed ?? defaultSpeed(cue.mode);
  if (animate && speed !== null) {
    const elapsed = secondsAt(elapsedFrames, fps);
    let factor = 1;
    if (cue.mode === 'breathing') {
      const rate = breathRate(speed);
      if (rate !== null) factor = 0.12 + 0.88 * (0.5 - 0.5 * Math.cos(2 * Math.PI * elapsed * rate));
    } else if (speed >= 5 && speed <= 104) {
      factor = (elapsed * 52.05 / speed) % 1 < 0.5 ? 1 : 0;
    }
    channels = channels.map((channel) => Math.round(channel * factor));
  }
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function exampleSheet() {
  const sheet = makeSheet('色彩排练', 15);
  return parseSheet(JSON.stringify({
    ...sheet,
    cues: [
      { start_frame: 0, end_frame: 96, mode: 'solid', color: '#67E6B1' },
      { start_frame: 120, end_frame: 221, mode: 'gradient', color: '#6BA7FC', end_color: '#CE8AFF' },
      { start_frame: 221, end_frame: 318, mode: 'breathing', color: '#FFAD66', speed: 5 },
      { start_frame: 342, end_frame: 400, mode: 'slow_flash', color: '#F27BA6', speed: 20 },
    ].map((cue) => ({ ...cue, start_frame: cue.start_frame * 2, end_frame: cue.end_frame * 2 })),
  }));
}
