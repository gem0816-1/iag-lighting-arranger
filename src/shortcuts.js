export const SHORTCUT_PRESETS = {
  resolve: { label: 'DaVinci Resolve', select: 'A', trim: 'T', blade: 'B', snap: 'N', cut: 'Mod+B', lift: 'Backspace', ripple: 'Delete' },
  premiere: { label: 'Premiere Pro', select: 'V', trim: 'B', blade: 'C', snap: 'S', cut: 'Mod+K', lift: 'Delete', ripple: 'Shift+Delete' },
  finalcut: { label: 'Final Cut Pro', select: 'A', trim: 'T', blade: 'B', snap: 'N', cut: 'Mod+B', lift: 'Shift+Backspace', ripple: 'Backspace' },
};

const COMMON = {
  Space: 'toggle', J: 'rewind', K: 'pause', L: 'play',
  ArrowLeft: 'previousFrame', 'Shift+ArrowLeft': 'previousFrames',
  ArrowRight: 'nextFrame', 'Shift+ArrowRight': 'nextFrames',
  ArrowUp: 'previousEdit', ArrowDown: 'nextEdit', Home: 'start', End: 'end', Enter: 'selectAtPlayhead',
  '=': 'zoomIn', '+': 'zoomIn', 'Shift++': 'zoomIn', '-': 'zoomOut',
  'Mod+Z': 'undo', 'Mod+Shift+Z': 'redo', 'Mod+Y': 'redo', Escape: 'clear',
};

export function presetShortcut(event) {
  if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return null;
  return { Digit1: 'resolve', Digit2: 'premiere', Digit3: 'finalcut' }[event.code] ?? null;
}

export function actionShortcut(event, preset) {
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const binding = [event.ctrlKey || event.metaKey ? 'Mod' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', key].filter(Boolean).join('+');
  const entry = Object.entries(SHORTCUT_PRESETS[preset]).find(([action, shortcut]) => action !== 'label' && shortcut === binding);
  return entry?.[0] ?? COMMON[binding];
}
