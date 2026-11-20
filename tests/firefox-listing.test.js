import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extensionInstallHref, firefoxListing } from '../src/extension-install.js';

test('accepts Firefox store listings and normalizes their public URL', () => {
  assert.equal(firefoxListing('https://addons.mozilla.org/zh-CN/firefox/addon/iag-time-sync?src=iag'), 'https://addons.mozilla.org/zh-CN/firefox/addon/iag-time-sync/');
  assert.equal(firefoxListing('https://addons.mozilla.org/firefox/addon/iag-time-sync/'), 'https://addons.mozilla.org/firefox/addon/iag-time-sync/');
  for (const unsafe of ['', 'https://addons.mozilla.org.example/firefox/addon/iag/', 'http://addons.mozilla.org/firefox/addon/iag/', 'https://addons.mozilla.org/developers/', 'https://user@addons.mozilla.org/firefox/addon/iag/']) {
    assert.equal(firefoxListing(unsafe), null);
  }
});

test('routes Firefox directly to AMO when configured and keeps the setup routes otherwise', () => {
  const listing = 'https://addons.mozilla.org/firefox/addon/iag-time-sync/';
  assert.equal(extensionInstallHref('Mozilla/5.0 Firefox/159.0', './', listing), listing);
  assert.equal(extensionInstallHref('Mozilla/5.0 Firefox/159.0', './', null), './?install=firefox');
  assert.equal(extensionInstallHref('Mozilla/5.0 Chrome/159.0 Edg/157.0', './', listing), './?install=edge');
  assert.equal(extensionInstallHref('Mozilla/5.0 Chrome/159.0', './', listing), './?install=chrome');
});
