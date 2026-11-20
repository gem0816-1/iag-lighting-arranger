const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function editPoints(sheet, ignore) {
  const points = [0];
  for (const cue of sheet.cues) {
    if (cue.id === ignore) continue;
    if (points.at(-1) !== cue.start_frame) points.push(cue.start_frame);
    points.push(cue.end_frame);
  }
  if (points.at(-1) !== sheet.duration_frames) points.push(sheet.duration_frames);
  return points;
}

function insertionIndex(points, value) {
  let lower = 0;
  let upper = points.length;
  while (lower < upper) {
    const middle = (lower + upper) >>> 1;
    if (points[middle] < value) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}

export function neighborEdit(points, frame, direction) {
  const index = insertionIndex(points, frame);
  return direction < 0 ? points[Math.max(0, index - 1)]
    : points[index + Number(points[index] === frame)] ?? points.at(-1);
}

function snapOffset(frame, points, threshold) {
  const index = insertionIndex(points, frame);
  const lower = points[index - 1] ?? -Infinity;
  const upper = points[index] ?? Infinity;
  const closest = frame - lower <= upper - frame ? lower : upper;
  return Math.abs(frame - closest) <= threshold ? closest - frame : null;
}

export function prepareCueDrag(sheet, cue, edge, ripple, snapping, playhead, framesPerPixel) {
  const start = cue.start_frame;
  const end = cue.end_frame;
  const length = end - start;
  const duration = sheet.duration_frames;
  const index = sheet.cues.indexOf(cue);
  const previousEnd = sheet.cues[index - 1]?.end_frame ?? 0;
  const nextStart = sheet.cues[index + 1]?.start_frame ?? duration;
  const tailSpace = duration - (sheet.cues.at(-1)?.end_frame ?? end);
  const points = snapping ? editPoints(sheet, cue.id) : [];
  if (snapping) points.splice(insertionIndex(points, playhead), 0, playhead);
  const threshold = framesPerPixel * 7;
  const snap = (frame) => frame + (snapOffset(frame, points, threshold) ?? 0);

  return (delta) => {
    if (!edge) {
      const left = start + delta;
      const fromLeft = snapOffset(left, points, threshold);
      const fromRight = snapOffset(left + length, points, threshold);
      const correction = fromLeft !== null && (fromRight === null || Math.abs(fromLeft) <= Math.abs(fromRight)) ? fromLeft : fromRight ?? 0;
      const after = clamp(left + correction, 0, duration - length);
      return { start: after, end: after + length };
    }
    if (ripple) {
      const target = edge === 'start' ? start - snap(start + delta) : snap(end + delta) - end;
      return { start, end: end + clamp(target, 1 - length, tailSpace) };
    }
    return edge === 'start'
      ? { start: clamp(snap(start + delta), previousEnd, end - 1), end }
      : { start, end: clamp(snap(end + delta), start + 1, nextStart) };
  };
}
