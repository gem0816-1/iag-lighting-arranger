import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cueAt, exampleSheet, exportSheet, fileName, formatTime, frameAt, insertCue, makeSheet, parseSheet, resizeSheet, sampleColor, secondsAt, updateCue } from '../src/cue-sheet.js';

const existing = {
  version: 1,
  fps: { numerator: 30000, denominator: 1001 },
  start_frame: 107892,
  timecode_start: '01:00:00;00',
  timeline_name: '回放',
  duration_frames: 240,
  cues: [
    { start_frame: 0, end_frame: 30, mode: 'solid', color: '#110022', brightness: 100 },
    { start_frame: 30, end_frame: 90, mode: 'gradient', color: '#000000', end_color: '#FFFFFF', brightness: 50 },
    { start_frame: 120, end_frame: 150, mode: 'breathing', color: '#C04030', speed: 20, brightness: 100 },
  ],
};

test('retains exact frame boundaries, rational fps, origin and effects across export', () => {
  const sheet = parseSheet(`\uFEFF${JSON.stringify(existing)}`);
  assert.deepEqual(JSON.parse(exportSheet(sheet)), existing);
  assert.equal(frameAt(Number(secondsAt(47, sheet.fps).toFixed(3)), sheet.fps), 47);
});

test('samples exclusive ends, gaps and a gradient with Android brightness rounding', () => {
  const { cues, fps } = parseSheet(JSON.stringify(existing));
  assert.equal(cueAt(cues, 29.99).mode, 'solid');
  assert.equal(cueAt(cues, 30).mode, 'gradient');
  assert.equal(cueAt(cues, 90), null);
  assert.equal(sampleColor(cueAt(cues, 60), 60, fps), '#404040');
  assert.equal(sampleColor(null, 90, fps), '#000000');
});

test('inserts only in free space, limiting a new cue to the next start frame', () => {
  const demo = exampleSheet();
  const { sheet, cue } = insertCue(demo, 200);
  assert.equal(cue.start_frame, 200);
  assert.equal(cue.end_frame, 240);
  assert.equal(sheet.cues[1].id, cue.id);
  assert.throws(() => insertCue(demo, 240), /已有灯效/);
  assert.throws(() => insertCue(demo, demo.duration_frames), /灯效起点/);
});

test('failed time edits are atomic and accepted moves keep identity', () => {
  const sheet = exampleSheet();
  const original = exportSheet(sheet);
  const first = sheet.cues[0];
  assert.throws(() => updateCue(sheet, first.id, { end_frame: 241 }), /重叠/);
  assert.throws(() => updateCue(sheet, first.id, { start_frame: -1 }), /开始帧/);
  assert.equal(exportSheet(sheet), original);
  const moved = updateCue(sheet, first.id, { start_frame: 10, end_frame: 202 });
  assert.equal(moved.cues[0].id, first.id);
  assert.equal(moved.cues[0].start_frame, 10);
});

test('project limits protect all cues and allow a single frame', () => {
  const demo = exampleSheet();
  assert.throws(() => resizeSheet(demo, 3), /最后一个灯效/);
  assert.throws(() => resizeSheet(demo, 86401), /时长/);
  const short = resizeSheet(makeSheet(), 1 / 60);
  assert.equal(short.duration_frames, 1);
  assert.equal(parseSheet(exportSheet(short)).duration_frames, 1);
});

test('invalid import fails clearly for wrong formats, overflow, and unsupported effect data', () => {
  assert.throws(() => parseSheet('{'), /有效的 JSON/);
  assert.throws(() => parseSheet('{"schemaVersion":2}'), /iagcue/);
  assert.throws(() => parseSheet(JSON.stringify({ ...existing, start_frame: Number.MAX_SAFE_INTEGER + 1 })), /起帧/);
  assert.throws(() => parseSheet(JSON.stringify({ ...existing, cues: [{ ...existing.cues[0], mode: ['solid'] }] })), /灯效类型/);
  assert.throws(() => parseSheet(JSON.stringify({ ...existing, cues: [{ ...existing.cues[1], end_color: null }] })), /结束颜色/);
  assert.throws(() => parseSheet(JSON.stringify({ ...existing, cues: [...existing.cues, existing.cues[0]] })), /重叠/);
});

test('naming a download and rounding the displayed clock are safe', () => {
  assert.equal(fileName('CON'), 'IAG-灯光编排.iagcue.json');
  assert.equal(fileName('周末 / 排练'), '周末 _ 排练.iagcue.json');
  assert.equal(formatTime(59.9999, true), '01:00.000');
});
