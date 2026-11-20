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

export function firefoxListing(input) {
  if (!input) return null;
  try {
    const url = new URL(input);
    const listingPath = /^\/(?:[a-zA-Z-]+\/)?firefox\/addon\/[a-z0-9-]+\/?$/;
    return url.origin === 'https://addons.mozilla.org' && !url.username && !url.password && listingPath.test(url.pathname)
      ? `${url.origin}${url.pathname.replace(/\/$/, '')}/`
      : null;
  } catch {
    return null;
  }
}

export const FIREFOX_LISTING = firefoxListing(import.meta.env?.VITE_FIREFOX_AMO_URL);

export function extensionInstallHref(userAgent, base, listing = FIREFOX_LISTING) {
  const browser = detectInstaller(userAgent);
  return browser === 'firefox' && listing ? listing : `${base}?install=${browser}`;
}
