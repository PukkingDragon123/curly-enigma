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

self.onmessage = async (e) => {
  const { id, key, size, kind, i } = e.data;
  let out = null, err = '';
  const t0 = performance.now();
  try { out = renderFrame(key, size, kind, i); } catch (x) { err = String(x?.message || x); }
  const t1 = performance.now();
  if (!out) { self.postMessage({ id, ok: false, err }); return; }
  try {
    const blob = await png(out.img.data, size, size);
    self.postMessage({ id, ok: true, blob, real: out.real, src: out.src, ms: [t1 - t0, performance.now() - t1] });
  } catch (x) {
    // no CompressionStream here: send the pixels, the page encodes them
    self.postMessage({ id, ok: true, px: out.img.data.buffer, real: out.real, src: out.src }, [out.img.data.buffer]);
  }
};
self.postMessage({ hello: true });
