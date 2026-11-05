// Recorded sound effects and music (CC0 / CC-BY packs from OpenGameArt.org, listed with their
// authors in CREDITS-AUDIO.md). Every file is mono MP3 (decodes in every browser). Vite bundles
// them: `npm run build` emits them as assets, the single-file build inlines them as data: URLs.
//   URLS[id] -> url      META[id] -> { d: seconds, f0?: Hz of a pitched note, loop?: 1 }
import META from './meta.json';

const files = {
  ...import.meta.glob('./sfx/*.mp3', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('./music/*.mp3', { eager: true, query: '?url', import: 'default' }),
};

export const URLS = {};
for (const [path, url] of Object.entries(files)) URLS[path.replace(/^.*\/|\.mp3$/g, '')] = url;
export { META };

/** The file's bytes (data: URLs are decoded in place: no fetch, so no CSP connect-src needed). */
export async function bytesOf(url) {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    const head = url.slice(0, comma);
    const body = url.slice(comma + 1);
    if (!/;base64/i.test(head)) return new TextEncoder().encode(decodeURIComponent(body)).buffer;
    const bin = atob(body);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('audio ' + r.status + ' ' + url);
  return r.arrayBuffer();
}
