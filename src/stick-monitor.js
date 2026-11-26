import { cueAt, defaultSpeed, sampleColor } from './cue-sheet.js';

const service = '0000ed00-0000-1000-8000-00805f9b34fb';
const control = '0000ed01-0000-1000-8000-00805f9b34fb';
const notifications = '0000ed02-0000-1000-8000-00805f9b34fb';
const BLACK = { color: '#000000', command: 1, speed: null, gradient: null };
const GRADIENT_MS = 100;
const WRITE_TIMEOUT_MS = 6000;
export const STICK_SCAN_HINT = '列表里找不到时，保持蓝牙列表打开，把灯棒关掉两秒再开。';

export function monitorTarget(sheet, seconds, playing) {
  const position = seconds * sheet.fps.numerator / sheet.fps.denominator;
  const nearestFrame = Math.round(position);
  const frame = Math.abs(position - nearestFrame) < 1e-7 ? nearestFrame : position;
  const cue = cueAt(sheet.cues, frame);
  const color = sampleColor(cue, frame, sheet.fps, false);
  if (color === BLACK.color) return BLACK;
  const speed = playing ? cue.speed ?? defaultSpeed(cue.mode) : null;
  const command = speed === null ? 1 : cue.mode === 'breathing' ? 4 : 3;
  return { color, command, speed, gradient: cue.mode === 'gradient' ? cue.id : null };
}

// StickProtocol.kt uses a little-endian length and the low byte of the sum.
export function monitorPacket({ color, command, speed }) {
  const rgb = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  const effect = speed === null ? [] : [speed];
  const bytes = [0x5a, 0xa5, 4 + effect.length, 0, command, ...rgb, ...effect];
  return Uint8Array.from([...bytes, bytes.reduce((sum, byte) => sum + byte, 0) & 0xff]);
}

function sameOutput(left, right) {
  return left?.command === right?.command && left?.color === right?.color && left?.speed === right?.speed;
}

async function withTimeout(operation, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('GATT timeout')), milliseconds); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function createWriter(characteristic, onError) {
  let desired;
  let delivered;
  let inFlight;
  let sentAt = 0;
  let timer;
  let closed = false;
  const write = (output) => withTimeout(() => characteristic.writeValueWithResponse(monitorPacket(output)), WRITE_TIMEOUT_MS);

  function flush() {
    if (closed || inFlight) return;
    if (sameOutput(desired, delivered)) {
      clearTimeout(timer);
      timer = undefined;
      return;
    }
    const now = performance.now();
    const withinGradient = desired.gradient !== null && desired.gradient === delivered?.gradient;
    const wait = withinGradient ? GRADIENT_MS - (now - sentAt) : 0;
    if (wait > 0) {
      timer ??= setTimeout(() => { timer = undefined; flush(); }, wait);
      return;
    }
    clearTimeout(timer);
    timer = undefined;
    const sending = desired;
    sentAt = now;
    inFlight = write(sending);
    inFlight.then(() => {
      inFlight = null;
      delivered = sending;
      flush();
    }, () => {
      inFlight = null;
      if (!closed) onError();
    });
  }

  return {
    send(output) { desired = output; flush(); },
    async close(blackout = false) {
      closed = true;
      clearTimeout(timer);
      if (!blackout) return;
      await inFlight;
      if (!sameOutput(delivered, BLACK)) await write(BLACK);
    },
  };
}

export function createStickMonitor(bluetooth, report) {
  let phase = 'idle';
  let generation = 0;
  let device;
  let lastDevice;
  let writer;

  function update(next, detail = '') {
    phase = next;
    report({ phase, detail, canReconnect: Boolean(lastDevice) });
  }

  function reset() {
    generation += 1;
    writer?.close();
    writer = null;
    device?.removeEventListener('gattserverdisconnected', disconnected);
    device?.gatt?.disconnect();
    device = null;
    phase = 'idle';
  }

  function end(detail) {
    reset();
    update('idle', detail);
  }

  function disconnected() {
    end('灯棒连接中断。');
  }

  async function open(previousDevice) {
    if (phase !== 'idle' || !bluetooth?.requestDevice) return;
    const current = ++generation;
    if (!previousDevice) update('selecting', STICK_SCAN_HINT);
    try {
      const chosen = previousDevice ?? await bluetooth.requestDevice({ filters: [{ namePrefix: 'EMB_' }], optionalServices: [service] });
      if (current !== generation) return;
      device = chosen;
      chosen.addEventListener('gattserverdisconnected', disconnected);
      update('connecting', '等待灯棒响应…');
      const characteristic = await withTimeout(async () => {
        const server = await chosen.gatt.connect();
        if (current !== generation) {
          if (device !== chosen) server.disconnect();
          return null;
        }
        const primary = await server.getPrimaryService(service);
        const write = await primary.getCharacteristic(control);
        const notify = await primary.getCharacteristic(notifications);
        if (!write.properties.write) throw new Error('ED01 does not support write with response');
        if (current !== generation) return null;
        await notify.startNotifications();
        return write;
      }, 12000);
      if (current !== generation) return;
      lastDevice = chosen;
      writer = createWriter(characteristic, () => end('灯效写入失败，已断开灯棒。请重连后再试。'));
      update('connected', chosen.name?.replace(/\p{Cc}/gu, '') || '荧光棒');
    } catch (error) {
      if (current !== generation) return;
      const canceled = phase === 'selecting' && error.name === 'NotFoundError';
      if (canceled) end(`未选中灯棒。${STICK_SCAN_HINT}`);
      else if (error.name === 'SecurityError' || error.name === 'NotAllowedError') end('请允许网页使用蓝牙。');
      else end('连接失败。请打开蓝牙，并在手机上断开灯棒。');
    }
  }

  return {
    connect: () => open(),
    reconnect: () => { if (lastDevice) return open(lastDevice); },
    send(output) { if (phase === 'connected') writer.send(output); },
    blackout() { if (phase === 'connected') writer.send(BLACK); },
    async disconnect() {
      if (phase !== 'connected') return;
      const current = generation;
      update('closing', '正在熄灯并断开…');
      let detail = '灯棒已断开。';
      try {
        await writer.close(true);
      } catch {
        detail = '灯棒已断开，熄灯写入未完成。';
      }
      if (current === generation) end(detail);
    },
    dispose() {
      reset();
      lastDevice = undefined;
    },
  };
}
