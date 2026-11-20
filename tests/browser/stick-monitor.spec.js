import { expect, test } from '@playwright/test';

test('a user-selected lamp follows playback and paused edits, then blanks on disconnect', async ({ page }) => {
  await page.addInitScript(() => {
    const writes = [];
    const device = new EventTarget();
    device.name = 'EMB_Preview_Test';
    device.gatt = {
      async connect() { return this; },
      disconnect() {},
      async getPrimaryService(uuid) {
        if (!uuid.startsWith('0000ed00')) throw new Error('Unexpected service');
        return this;
      },
      async getCharacteristic(uuid) {
        if (uuid.startsWith('0000ed02')) return { async startNotifications() { window.iagSubscribed = true; } };
        if (!uuid.startsWith('0000ed01')) throw new Error('Unexpected characteristic');
        return { properties: { write: true }, async writeValueWithResponse(packet) { writes.push(Array.from(packet).join(',')); } };
      },
    };
    Object.defineProperty(navigator, 'bluetooth', { value: {
      async requestDevice(options) {
        if (!navigator.userActivation.isActive || options.filters[0].namePrefix !== 'EMB_') throw new Error('Unexpected Bluetooth request');
        return device;
      },
    } });
    window.iagWrites = writes;
  });
  await page.goto('./');
  const project = { version: 1, duration_frames: 240, fps: { numerator: 60, denominator: 1 }, cues: [
    { start_frame: 0, end_frame: 30, mode: 'solid', color: '#FF0000', brightness: 50 },
    { start_frame: 30, end_frame: 150, mode: 'breathing', color: '#0000FF', speed: 10 },
    { start_frame: 150, end_frame: 210, mode: 'slow_flash', color: '#FF0000', speed: 5 },
  ] };
  await page.getByLabel('选择灯光工程文件').setInputFiles({ name: 'monitor.iagcue.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  const monitor = page.getByRole('region', { name: '实体灯棒监看' });
  await monitor.getByRole('button', { name: '连接灯棒' }).click();
  await expect(monitor.getByRole('status')).toContainText('EMB_Preview_Test 已连接');
  expect(await page.evaluate(() => window.iagSubscribed)).toBe(true);
  const lastWrite = () => page.evaluate(() => window.iagWrites.at(-1));
  await expect.poll(lastWrite).toBe('90,165,4,0,1,128,0,0,132');

  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(lastWrite).toBe('90,165,5,0,4,0,0,255,10,17');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect.poll(lastWrite).toBe('90,165,4,0,1,0,0,255,3');
  const ruler = page.locator('.ruler');
  const { width } = await ruler.boundingBox();
  await ruler.click({ position: { x: width * 0.75, y: 10 } });
  await expect.poll(lastWrite).toBe('90,165,4,0,1,255,0,0,3');
  await monitor.getByRole('button', { name: '断开灯棒' }).click();
  await expect(monitor.getByRole('status')).toHaveText('灯棒已断开。');
  await expect.poll(lastWrite).toBe('90,165,4,0,1,0,0,0,4');
});
