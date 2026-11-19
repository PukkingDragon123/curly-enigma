// Chunk streaming hitch profile: walks the mole through the mine (driving scene.update directly, as
// the e2e does) and times what the main thread spends per frame on terrain streaming and on chunk
// meshes arriving from the workers. node scripts/chunk-prof.mjs
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome.mjs';

const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error', clearScreen: false });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/?fresh=1&scene=deep`);
for (let i = 0; i < 160; i++) { await page.waitForTimeout(250); if (await page.evaluate(() => window.__game?.sceneName === 'deep' && !window.__game.transitioning && !!window.__game.scene.terrain)) break; }
await page.waitForTimeout(1500);
const r = await page.evaluate(async () => {
  const sc = window.__game.scene, T = sc.terrain, pl = sc.player;
  const prof = {};
  const wrap = (o, k, slot) => { if (!o || typeof o[k] !== 'function') return; const f = o[k].bind(o); prof[slot] = 0; o[k] = (...a) => { const t0 = performance.now(); try { return f(...a); } finally { prof[slot] += performance.now() - t0; } }; };
  wrap(T, 'update', 'upd');
  wrap(T, 'mesh', 't.mesh');
  wrap(T, 'build', 't.build');
  wrap(T, 'cull', 't.cull');
  wrap(T, 'prefetch', 't.prefetch');
  wrap(sc.world, 'unload', 'w.unload');
  wrap(sc.world, 'request', 'w.request');
  wrap(sc.world, 'ensure', 'w.ensure');
  for (const k of ['props', 'vegetation', 'enemies', 'fluids', 'ruins', 'traders', 'explosives', 'clumps', 'harvest', 'bodies', 'fx', 'bits', 'shadow']) wrap(sc[k], 'update', k);
  for (const k of ['updateProgress', 'updateTarget', 'useTools', 'lights', 'hudTick', 'digTick', 'ambient', 'updateGhost']) wrap(sc, k, 'sc.' + k);
  const frames = [];
  // worker results land between frames (message handlers): time those too
  const between = [];
  const pool = sc.world.pool;
  if (pool) { const f = pool.onMsg.bind(pool); pool.onMsg = (i, m) => { const t0 = performance.now(); try { return f(i, m); } finally { between.push(performance.now() - t0); } }; if (pool.drain) wrap(pool, 'drain', 'pool.drain'); }
  // a straight run through rock and caves (noclip: the mole is carried, the terrain streams round it)
  const x0 = pl.pos.x, z0 = pl.pos.z, y0 = pl.pos.y;
  sc.game.ui.isPanelOpen = () => true; // no input
  for (let i = 0; i < 900; i++) {
    pl.pos.set(x0 + i * 0.09, y0, z0 + i * 0.05); pl.vel.set(0, 0, 0);
    for (const k in prof) prof[k] = 0;
    const t0 = performance.now();
    sc.update(1 / 60);
    const tot = performance.now() - t0;
    frames.push({ tot, ...prof });
    await new Promise((res) => setTimeout(res, 4)); // let the workers' results in
  }
  const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  const col = (k) => frames.map((f) => f[k]);
  const out = {};
  for (const k of ['tot', ...Object.keys(prof)]) { const m = Math.max(...col(k)); if (m > 1 || k === 'tot') out[k] = { p50: +pct(col(k), 0.5).toFixed(2), p99: +pct(col(k), 0.99).toFixed(2), max: +m.toFixed(2) }; }
  out.over16 = frames.filter((f) => f.tot > 16).length;
  out.between = { max: +Math.max(0, ...between).toFixed(2), p99: +(pct(between.length ? between : [0], 0.99)).toFixed(2), n: between.length };
  const vs = sc.vegetation?.stats; if (vs) out.veg = { built: vs.built, avgMs: +(vs.buildMs / Math.max(1, vs.built)).toFixed(2), maxBuild: +vs.maxBuild.toFixed(2) };
  out.poolOk = !!sc.world.pool?.ok;
  try { const ps = (await import('/src/deep/veg/plants.js')).protoStats; out.plantProtos = { built: ps.built, fromWorker: ps.adopted || 0, mainMs: +ps.ms.toFixed(0) }; } catch (e) { /* no plants */ }
  return out;
});
for (const [k, v] of Object.entries(r)) console.log(k.padEnd(18), JSON.stringify(v));
await browser.close();
await server.close();
