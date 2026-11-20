const CHROMIUM_PACKAGE = 'iag-bilibili-sync.zip';

export const INSTALLERS = {
  chrome: { name: 'Chrome', address: 'chrome://extensions/', download: CHROMIUM_PACKAGE },
  edge: { name: 'Edge', address: 'edge://extensions/', download: CHROMIUM_PACKAGE },
  firefox: { name: 'Firefox', address: 'about:debugging#/runtime/this-firefox', download: 'iag-bilibili-sync-firefox.xpi' },
};

export function detectInstaller(userAgent) {
  if (/Firefox\/|FxiOS\//i.test(userAgent)) return 'firefox';
  if (/Edg(?:e|A|iOS)?\//i.test(userAgent)) return 'edge';
  return 'chrome';
}
