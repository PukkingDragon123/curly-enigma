// Draws item pictures off the main thread (src/ui/itemVox.js feeds it a job or two at a time): builds
// the item's model, renders the frame (./itemRender.js), packs it into a PNG here (deflated with the
// browser's CompressionStream: no canvas, no GPU) and hands the blob back. Opening the backpack never
// waits on any of this.
import { renderFrame } from './itemRender.js';

// ------------------------------------------------------------------ a small PNG writer
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
const crc32 = (buf, from, to) => { let c = 0xffffffff; for (let i = from; i < to; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}
async function deflate(raw) {
  const cs = new CompressionStream('deflate');
  const w = cs.writable.getWriter();
  w.write(raw); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
/** RGBA pixels (w×h) → a PNG Blob. Each row is "Sub"-filtered (flat runs deflate well). */
async function png(px, w, h) {
  const row = w * 4 + 1, raw = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) {
    raw[y * row] = 1;
    const o = y * w * 4;
    for (let x = 0; x < w * 4; x++) raw[y * row + 1 + x] = (px[o + x] - (x >= 4 ? px[o + x - 4] : 0)) & 255;
  }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return new Blob([sig, chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))], { type: 'image/png' });
}

/** Nearest-neighbour K times over (the page shows the picture at its own size). */
function upscale(img, K) {
  if (K <= 1) return img;
  const W = img.width, out = new ImageData(W * K, img.height * K), s = new Uint32Array(img.data.buffer), d = new Uint32Array(out.data.buffer);
  for (let y = 0; y < out.height; y++) { const sy = ((y / K) | 0) * W, dy = y * W * K; for (let x = 0; x < W * K; x++) d[dy + x] = s[sy + ((x / K) | 0)]; }
  return out;
}
// the last few drawn sprites (the same sprite is often wanted at another scale)
const drawn = new Map();

self.onmessage = async (e) => {
  const { id, key, size, kind, i } = e.data, K = e.data.scale || 1;
  let out = null, err = '';
  const t0 = performance.now();
  const dk = `${kind}:${key}~${size}:${i}`;
  try { out = drawn.get(dk) || renderFrame(key, size, kind, i); } catch (x) { err = String(x?.message || x); }
  if (out && !drawn.has(dk)) { drawn.set(dk, out); while (drawn.size > 64) drawn.delete(drawn.keys().next().value); }
  const t1 = performance.now();
  if (!out) { self.postMessage({ id, ok: false, err }); return; }
  try {
    const big = upscale(out.img, K);
    const blob = await png(big.data, big.width, big.height);
    self.postMessage({ id, ok: true, blob, real: out.real, src: out.src, ms: [t1 - t0, performance.now() - t1] });
  } catch (x) {
    // no CompressionStream here: send the pixels, the page encodes them
    const big = upscale(out.img, K), buf = big === out.img ? big.data.slice().buffer : big.data.buffer;
    self.postMessage({ id, ok: true, px: buf, real: out.real, src: out.src }, [buf]);
  }
};
self.postMessage({ hello: true });
