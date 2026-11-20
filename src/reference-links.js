const YOUTUBE = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);
const BILIBILI = new Set(['bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'player.bilibili.com']);
const AUDIO_FILE = /\.(mp3|wav|m4a|aac|oga|opus|flac)$/i;
const BVID = /^BV[A-Za-z0-9]{10}$/;
const POSITIVE_INTEGER = /^[1-9]\d{0,19}$/;

function youtubeReference(url) {
  const [page, segment] = url.pathname.split('/').filter(Boolean);
  const id = url.hostname === 'youtu.be' ? page : page === 'watch' ? url.searchParams.get('v') : ['embed', 'shorts'].includes(page) ? segment : null;
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('请粘贴单条 YouTube 视频的分享链接。');
  return { kind: 'youtube', label: 'YouTube 视频', url: `https://www.youtube.com/watch?v=${id}`, videoId: id };
}

function bilibiliReference(url) {
  const [, page, id] = url.pathname.split('/');
  const embedLink = url.hostname === 'player.bilibili.com' && page === 'player.html';
  const bvid = embedLink ? url.searchParams.get('bvid') : page === 'video' ? id : null;
  const aid = embedLink ? url.searchParams.get('aid') : page === 'video' && id?.startsWith('av') ? id.slice(2) : null;
  const frame = new URL('https://player.bilibili.com/player.html');
  if (bvid && BVID.test(bvid)) frame.searchParams.set('bvid', bvid);
  else if (aid && POSITIVE_INTEGER.test(aid)) frame.searchParams.set('aid', aid);
  else throw new Error('请粘贴包含 BV 号或 av 号的 B 站视频链接。');

  const part = url.searchParams.get('p');
  const cid = embedLink && url.searchParams.get('cid');
  if (part && POSITIVE_INTEGER.test(part)) frame.searchParams.set('p', part);
  if (cid && POSITIVE_INTEGER.test(cid)) frame.searchParams.set('cid', cid);
  frame.searchParams.set('poster', '1');
  frame.searchParams.set('autoplay', '0');
  frame.searchParams.set('danmaku', '0');
  return { kind: 'bilibili', label: 'B 站视频', url: url.href, embedUrl: frame.href };
}

export function parseReferenceLink(raw) {
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('请输入完整的 HTTPS 视频网址。');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('请输入普通的 HTTPS 链接。');
  }
  if (url.hostname === 'b23.tv') throw new Error('请先在浏览器打开 B 站短链接，再复制地址栏里展开的视频网址。');
  if (YOUTUBE.has(url.hostname)) return youtubeReference(url);
  if (BILIBILI.has(url.hostname)) return bilibiliReference(url);

  url.hash = '';
  const kind = AUDIO_FILE.test(url.pathname) ? 'audio' : 'video';
  return { kind, url: url.href, label: `网络${kind === 'audio' ? '音频' : '视频'} · ${url.hostname}` };
}

export function parseReferenceTime(raw) {
  const value = raw.trim();
  const parts = value.split(':');
  const secondsField = parts.at(-1);
  const validSeconds = parts.length === 1 ? /^\d+(?:\.\d{1,3})?$/ : /^[0-5]\d(?:\.\d{1,3})?$/;
  if (parts.length > 3 || !validSeconds.test(secondsField)
      || (parts.length > 1 && !/^\d+$/.test(parts[0]))
      || (parts.length === 3 && !/^[0-5]\d$/.test(parts[1]))) {
    throw new Error('请输入秒数或视频时间，例如 75.5 或 1:15。');
  }
  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0);
  if (seconds >= 86_400) throw new Error('视频时间须在 24 小时内。');
  return seconds;
}
