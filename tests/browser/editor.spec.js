import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

function referenceAudio() {
  const rate = 8000;
  const frames = rate * 6;
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 2, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    const envelope = Math.exp(-((frame % (rate / 2)) / (rate / 18)));
    const pulse = Math.sin(2 * Math.PI * 180 * frame / rate) * envelope;
    buffer.writeInt16LE(Math.round(pulse * 6000), 44 + frame * 2);
  }
  return { name: '排练节拍.wav', mimeType: 'audio/wav', buffer };
}

async function downloadCue(page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出给 IAG' }).click();
  return download;
}

test('opens from a Pages subdirectory and creates a cue in sync with local WAV', async ({ page }, testInfo) => {
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('./');
  await page.getByLabel('选择本地媒体文件').setInputFiles(referenceAudio());
  await expect(page.locator('.waveform path')).toBeVisible();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate((audio) => audio.currentTime)).toBeGreaterThan(0.06);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const ruler = page.locator('.ruler');
  const bounds = await ruler.boundingBox();
  await ruler.click({ position: { x: bounds.width / 4, y: 15 } });
  await page.getByRole('button', { name: '添加灯效' }).click();
  await expect(page.getByLabel('开始（秒）')).toHaveValue('1.5');
  await page.getByLabel('灯效类型').click();
  await page.getByRole('option', { name: '渐变', exact: true }).click();
  const endColor = page.getByRole('button', { name: '结束颜色', exact: true });
  await endColor.press('Enter');
  await page.locator('.ant-color-picker-presets-color').nth(5).click();
  await expect(endColor).toContainText('#FFF1A3');
  await page.getByRole('heading', { name: '灯效属性' }).click();
  const duration = page.getByLabel('结束（秒）');
  await duration.fill('4.2');
  await duration.press('Enter');
  const down = await downloadCue(page);
  const output = testInfo.outputPath('web-download.iagcue.json');
  await down.saveAs(output);
  expect(down.suggestedFilename()).toBe('未命名编排.iagcue.json');
  const sheet = JSON.parse(await readFile(output, 'utf8'));
  expect(sheet.duration_frames).toBe(180);
  expect(sheet.cues).toEqual([{ start_frame: 45, end_frame: 126, mode: 'gradient', color: '#67E6B1', end_color: '#FFF1A3', brightness: 100 }]);
  expect(requests.filter((url) => !url.startsWith('http://127.0.0.1:4187/') && !url.startsWith('blob:'))).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
});

test('opens existing Resolve cues, rejects overlaps, moves cues, and restores the draft', async ({ page }) => {
  const original = {
    version: 1,
    fps: { numerator: 30_000, denominator: 1001 },
    start_frame: 107_892,
    timecode_start: '01:00:00;00',
    timeline_name: '旧工程',
    duration_frames: 300,
    cues: [
      { start_frame: 0, end_frame: 60, mode: 'solid', color: '#67E6B1', brightness: 100 },
      { start_frame: 120, end_frame: 180, mode: 'breathing', color: '#FFAD66', speed: 5, brightness: 80 },
    ],
  };
  await page.goto('./');
  const input = page.getByLabel('选择灯光工程文件');
  await input.setInputFiles({ name: '旧工程.iagcue.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(original)) });
  await expect(page.getByLabel('工程名称')).toHaveValue('旧工程');
  const cue = page.getByRole('button', { name: /^呼吸 ·/ });
  await cue.click();
  const start = page.getByLabel('开始（秒）');
  await expect(start).toHaveValue('4.004');
  await start.fill('1');
  await start.press('Enter');
  await expect(page.getByText('灯效时间有重叠。请移到空白处，或先缩短灯效。')).toBeVisible();
  await expect(start).toHaveValue('4.004');

  const box = await cue.boundingBox();
  await page.mouse.move(box.x + 12, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 15, { steps: 6 });
  await page.mouse.up();
  await expect(start).not.toHaveValue('4.004');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(start).toHaveValue('4.004');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(start).not.toHaveValue('4.004');

  const edited = JSON.parse(await readFile(await (await downloadCue(page)).path(), 'utf8'));
  expect(edited.fps).toEqual(original.fps);
  expect(edited.timecode_start).toEqual(original.timecode_start);
  expect(edited.start_frame).toEqual(original.start_frame);
  expect(edited.cues[1].start_frame).toBeGreaterThan(120);
  expect(edited.cues[1].end_frame - edited.cues[1].start_frame).toBe(60);

  await input.setInputFiles({ name: '错误.iagcue.json', mimeType: 'application/json', buffer: Buffer.from('{bad}') });
  await expect(page.getByText('文件不是有效的 JSON。')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('工程名称')).toHaveValue('旧工程');
  await expect(cue).toHaveCount(1);
});

test('keeps all editing controls within a narrow viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('button', { name: '试用示例' }).click();
  await page.getByRole('button', { name: /^渐变 ·/ }).click();
  await expect(page.getByRole('heading', { name: '灯效属性' })).toBeVisible();
  const viewport = await page.evaluate(() => ({ inner: window.innerWidth, width: document.documentElement.scrollWidth }));
  expect(viewport.width).toBe(viewport.inner);
  await expect(page.getByRole('button', { name: '导出给 IAG' })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});
