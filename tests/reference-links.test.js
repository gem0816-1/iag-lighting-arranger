import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseReferenceLink, parseReferenceTime } from '../src/reference-links.js';

test('keeps a direct HTTPS media URL and its query intact', () => {
  const video = parseReferenceLink(' https://example.test/watch?sig=abc%2F123#t=10 ');
  assert.equal(video.kind, 'video');
  assert.equal(video.url, 'https://example.test/watch?sig=abc%2F123');
  assert.equal(parseReferenceLink('https://example.test/loop.WAV?token=1').kind, 'audio');
});

test('parses YouTube share URLs and uses exact platform hosts', () => {
  const id = 'M7lc1UVf-VE';
  for (const link of [`https://www.youtube.com/watch?v=${id}&t=20`, `https://youtu.be/${id}`, `https://www.youtube.com/shorts/${id}`]) {
    assert.equal(parseReferenceLink(link).videoId, id);
  }
  assert.equal(parseReferenceLink(`https://youtube.com.example.test/watch?v=${id}`).kind, 'video');
  assert.throws(() => parseReferenceLink('https://www.youtube.com/playlist?list=1'), /单条/);
});

test('constructs the official Bilibili embed and preserves an explicit part', () => {
  const result = parseReferenceLink('https://www.bilibili.com/video/BV1B7411m7LV/?p=3&autoplay=1');
  assert.equal(result.kind, 'bilibili');
  const url = new URL(result.embedUrl);
  assert.equal(url.origin, 'https://player.bilibili.com');
  assert.equal(url.searchParams.get('bvid'), 'BV1B7411m7LV');
  assert.equal(url.searchParams.get('p'), '3');
  assert.equal(url.searchParams.get('autoplay'), '0');
  assert.match(parseReferenceLink('https://m.bilibili.com/video/av170001').embedUrl, /aid=170001/);
  assert.match(parseReferenceLink('https://player.bilibili.com/player.html?aid=170001&cid=279786').embedUrl, /cid=279786/);
  assert.throws(() => parseReferenceLink('https://b23.tv/test'), /短链接/);
});

test('rejects unsafe URL schemes and links with credentials', () => {
  for (const url of ['javascript:alert(1)', 'http://example.test/v.mp4', 'file:///clip.mp4', 'https://a:password@example.test/v.mp4', 'blob:https://example.test/1']) {
    assert.throws(() => parseReferenceLink(url), /HTTPS/);
  }
});

test('interprets .millisecond, minute and hour time inputs without rolling invalid fields', () => {
  assert.equal(parseReferenceTime('75.5'), 75.5);
  assert.equal(parseReferenceTime('1:15.500'), 75.5);
  assert.equal(parseReferenceTime('1:02:03'), 3723);
  for (const time of ['', '1:60', '-2', 'abc', '24:00:00', '1:2:03', '1:02:3']) {
    assert.throws(() => parseReferenceTime(time), /时间|秒数/);
  }
});
