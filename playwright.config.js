import { defineConfig } from '@playwright/test';

const host = 'http://127.0.0.1:4187';
const baseURL = `${host}/iag-lighting-arranger/`;

export default defineConfig({
  testDir: 'tests/browser',
  use: {
    baseURL,
    channel: process.env.IAG_BROWSER_CHANNEL || undefined,
    viewport: { width: 1366, height: 850 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4187 --strictPort --base /iag-lighting-arranger/',
    url: baseURL,
    reuseExistingServer: false,
  },
});
