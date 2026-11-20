import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportSheet, makeSheet, moveCueOverwrite, parseSheet, removeCueFromSheet, splitCue, trimCue } from '../src/cue-sheet.js';
import { detectInstaller } from '../src/extension-install.js';
import { actionShortcut, presetShortcut } from '../src/shortcuts.js';
import { editPoints, neighborEdit, prepareCueDrag } from '../src/timeline-edit.js';

function project() {
  return parseSheet(JSON.stringify({
    ...makeSheet('剪辑验收', 10),
    cues: [
      { start_frame: 0, end_frame: 120, mode: 'solid', color: '#67E6B1' },
      { start_frame: 180, end_frame: 420, mode: 'gradient', color: '#000000', end_color: '#FFFFFF', brightness: 50 },
      { start_frame: 480, end_frame: 540, mode: 'solid', color: '#6BA7FC' },
    ],
  }));
}

const ranges = (sheet) => sheet.cues.map((cue) => [cue.start_frame, cue.end_frame]);

test('cuts at one exact frame and preserves both sides of a gradient', () => {
  const sheet = project();
  const cue = sheet.cues[1];
  assert.equal(splitCue(sheet, cue, 180), sheet);
  const cut = splitCue(sheet, cue, 300);
  assert.deepEqual(ranges(cut), [[0, 120], [180, 300], [300, 420], [480, 540]]);
  assert.equal(cut.cues[1].end_color, '#808080');
  assert.equal(cut.cues[2].color, '#808080');
  assert.equal(cut.cues[2].brightness, 50);
  assert.notEqual(cut.cues[1].id, cut.cues[2].id);
});

test('moving a cue overwrites only the part it covers', () => {
  const sheet = project();
  const moved = moveCueOverwrite(sheet, sheet.cues[0], 240);
  assert.deepEqual(ranges(moved), [[180, 240], [240, 360], [360, 420], [480, 540]]);
  assert.equal(moved.cues[0].end_color, '#404040');
  assert.equal(moved.cues[2].color, '#BFBFBF');
  assert.notEqual(moved.cues[0].id, moved.cues[2].id);
  assert.deepEqual(ranges(parseSheet(exportSheet(moved))), ranges(moved));
});

test('trims stop at neighbors or ripple later cues within the original timeline', () => {
  const sheet = project();
  const cue = sheet.cues[0];
  const normal = prepareCueDrag(sheet, cue, 'end', false, false, 0, 1);
  assert.deepEqual(normal(100), { start: 0, end: 180 });
  const ripple = prepareCueDrag(sheet, cue, 'end', true, false, 0, 1);
  const { start, end } = ripple(100);
  assert.deepEqual([start, end], [0, 180]);
  assert.deepEqual(ranges(trimCue(sheet, cue, start, end, true)), [[0, 180], [240, 480], [540, 600]]);
  assert.deepEqual(ranges(removeCueFromSheet(sheet, cue, true)), [[60, 300], [360, 420]]);
  assert.deepEqual(ranges(removeCueFromSheet(sheet, cue)), [[180, 420], [480, 540]]);
});

test('snaps both move edges and navigates strict previous and next edit points', () => {
  const sheet = project();
  const moving = prepareCueDrag(sheet, sheet.cues[0], undefined, false, true, 300, 1);
  assert.deepEqual(moving(176), { start: 180, end: 300 });
  assert.deepEqual(moving(359), { start: 360, end: 480 });
  const points = editPoints(sheet);
  assert.equal(neighborEdit(points, 180, -1), 120);
  assert.equal(neighborEdit(points, 180, 1), 420);
});

const key = (value, modifiers = {}) => ({ key: value, ...modifiers });

test('maps the distinct tools and cut shortcuts without stealing other modifier combinations', () => {
  assert.equal(actionShortcut(key('b'), 'resolve'), 'blade');
  assert.equal(actionShortcut(key('b'), 'premiere'), 'trim');
  assert.equal(actionShortcut(key('c'), 'premiere'), 'blade');
  assert.equal(actionShortcut(key('k', { ctrlKey: true }), 'premiere'), 'cut');
  assert.equal(actionShortcut(key('b', { metaKey: true }), 'finalcut'), 'cut');
  assert.equal(actionShortcut(key('Backspace'), 'finalcut'), 'ripple');
  assert.equal(actionShortcut(key('Backspace', { shiftKey: true }), 'finalcut'), 'lift');
  assert.equal(actionShortcut(key('c', { ctrlKey: true, altKey: true }), 'premiere'), undefined);
  assert.equal(presetShortcut(key('@', { code: 'Digit2', altKey: true, shiftKey: true })), 'premiere');
});

test('routes Firefox and Edge before the Chromium fallback', () => {
  assert.equal(detectInstaller('Mozilla/5.0 Firefox/159.0'), 'firefox');
  assert.equal(detectInstaller('Chrome/158.0 Edg/158.0'), 'edge');
  assert.equal(detectInstaller('Chrome/158.0 Safari/537.36'), 'chrome');
});
