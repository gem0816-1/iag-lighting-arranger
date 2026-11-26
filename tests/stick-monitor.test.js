import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { parseSheet } from '../src/cue-sheet.js';
import { createStickMonitor, monitorPacket, monitorTarget, STICK_SCAN_HINT } from '../src/stick-monitor.js';

const sheet = parseSheet(JSON.stringify({
  version: 1, fps: { numerator: 60, denominator: 1 }, duration_frames: 240,
  cues: [
    { start_frame: 0, end_frame: 60, mode: 'solid', color: '#FF0000', brightness: 50 },
    { start_frame: 60, end_frame: 120, mode: 'flash', color: '#FF0000', speed: 5 },
    { start_frame: 120, end_frame: 180, mode: 'breathing', color: '#0000FF', speed: 10 },
    { start_frame: 192, end_frame: 240, mode: 'gradient', color: '#000000', end_color: '#FFFFFF' },
  ],
}));
const hex = (bytes) => Buffer.from(bytes).toString('hex');
const target = (seconds, playing = true) => monitorTarget(sheet, seconds, playing);
const state = (seconds, playing = true) => hex(monitorPacket(target(seconds, playing)));
const settle = () => delay(0);

function peripheral(acknowledge = async () => {}) {
  let chooserRequests = 0;
  const calls = [];
  const writes = [];
  const device = new EventTarget();
  device.name = 'EMB_Test';
  device.gatt = {
    async connect() { calls.push('connect'); return this; },
    disconnect() { calls.push('disconnect'); },
    async getPrimaryService(uuid) { calls.push(uuid.slice(4, 8)); return this; },
    async getCharacteristic(uuid) {
      calls.push(uuid.slice(4, 8));
      return uuid.startsWith('0000ed02') ? {
        async startNotifications() { calls.push('ED02 subscribed'); },
      } : {
        properties: { write: true },
        writeValueWithResponse(packet) { writes.push(hex(packet)); return acknowledge(); },
      };
    },
  };
  const bluetooth = {
    async requestDevice(options) {
      assert.deepEqual(options, { filters: [{ namePrefix: 'EMB_' }], optionalServices: ['0000ed00-0000-1000-8000-00805f9b34fb'] });
      chooserRequests += 1;
      return device;
    },
  };
  const status = [];
  const monitor = createStickMonitor(bluetooth, (next) => status.push(next));
  return { calls, writes, status, device, monitor, chooserRequests: () => chooserRequests };
}

test('matches the Android color, flash, breath and blackout wire frames', () => {
  assert.equal(state(0), '5aa504000180000084');
  assert.equal(state(1), '5aa5050003ff0000050b');
  assert.equal(state(2), '5aa50500040000ff0a11');
  assert.equal(state(2, false), '5aa50400010000ff03');
  assert.equal(state(3), '5aa504000100000004');
  assert.equal(state(3.6), '5aa504000180808084');
  assert.equal(state(4), state(3));
});

test('keeps the latest lamp state while an acknowledged write is pending and blanks on disconnect', async () => {
  let ack;
  const { monitor, writes, calls, status } = peripheral(() => writes.length === 1 ? new Promise((resolve) => { ack = resolve; }) : Promise.resolve());
  await monitor.connect();
  assert.deepEqual(calls, ['connect', 'ed00', 'ed01', 'ed02', 'ED02 subscribed']);
  assert.deepEqual(status.map(({ phase }) => phase), ['selecting', 'connecting', 'connected']);
  monitor.send(target(0));
  monitor.send(target(1));
  monitor.send(target(2));
  assert.deepEqual(writes, [state(0)]);
  ack();
  await settle();
  assert.deepEqual(writes, [state(0), state(2)]);
  monitor.send(target(2));
  await monitor.disconnect();
  assert.deepEqual(writes, [state(0), state(2), state(3)]);
  assert.equal(calls.at(-1), 'disconnect');
  assert.equal(status.at(-1).phase, 'idle');
});

test('limits gradient writes within a cue and applies blackout immediately', async () => {
  const { monitor, writes } = peripheral();
  await monitor.connect();
  monitor.send(target(3.25));
  await settle();
  monitor.send(target(3.4));
  await settle();
  monitor.send(target(3.6));
  assert.deepEqual(writes, [state(3.25)]);
  await delay(130);
  assert.deepEqual(writes, [state(3.25), state(3.6)]);
  monitor.send(target(3.8));
  monitor.blackout();
  assert.deepEqual(writes, [state(3.25), state(3.6), state(3)]);
  monitor.dispose();
});

test('stops old writes on a lost link and surfaces write failure', async () => {
  const first = peripheral();
  await first.monitor.connect();
  first.device.dispatchEvent(new Event('gattserverdisconnected'));
  first.monitor.send(target(1));
  assert.deepEqual(first.writes, []);
  assert.match(first.status.at(-1).detail, /连接中断/);
  const second = peripheral(async () => { throw new Error('Write rejected'); });
  await second.monitor.connect();
  second.monitor.send(target(2));
  await settle();
  assert.equal(second.calls.at(-1), 'disconnect');
  assert.match(second.status.at(-1).detail, /写入失败/);
});

test('reconnects to the last successful device and discovers its GATT characteristics again', async () => {
  const { monitor, device, calls, status, chooserRequests } = peripheral();
  await monitor.reconnect();
  assert.deepEqual(calls, []);
  await monitor.connect();
  device.dispatchEvent(new Event('gattserverdisconnected'));
  assert.equal(status.at(-1).canReconnect, true);
  await monitor.reconnect();
  assert.equal(chooserRequests(), 1);
  assert.deepEqual(calls.slice(-5), ['connect', 'ed00', 'ed01', 'ed02', 'ED02 subscribed']);
  assert.equal(status.at(-1).phase, 'connected');
  await monitor.disconnect();
  await monitor.connect();
  assert.equal(chooserRequests(), 2);
  monitor.dispose();
  await monitor.reconnect();
  assert.equal(chooserRequests(), 2);
  assert.equal(calls.at(-1), 'disconnect');
});

test('shows the boot-timing hint when the chooser closes without a lamp', async () => {
  const status = [];
  const monitor = createStickMonitor({ async requestDevice() { throw new DOMException('Canceled', 'NotFoundError'); } }, (next) => status.push(next));
  await monitor.connect();
  assert(status[0].detail.includes(STICK_SCAN_HINT));
  assert.deepEqual(status.at(-1), { phase: 'idle', detail: `未选中灯棒。${STICK_SCAN_HINT}`, canReconnect: false });
});
