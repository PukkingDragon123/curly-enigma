// Touch smoke test: a phone in landscape (or portrait with --portrait). Walks with the on-screen
// stick, digs by tapping the rock, pushes into a wall until the face close-up takes over, taps
// the backpack and the book open, and reports console errors.
// Usage: node scripts/e2e-touch.mjs [outDir] [--portrait]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const portrait = args.includes('--portrait');
const outDir = args.find((a) => !a.startsWith('--')) || 'shots/e2e-touch';
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error', clearScreen: false });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const size = portrait ? { width: 390, height: 844 } : { width: 844, height: 390 };
const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = (n) => page.screenshot({ path: `${outDir}/${n}.png` });
const step = async (label, fn) => {
  const before = errors.length;
  try { await fn(); } catch (e) { errors.push(`[step:${label}] ${e.message}`); }
  console.log(`${errors.length > before ? '✗' : '✓'} ${label}${errors.length > before ? '\n   ' + errors.slice(before).join('\n   ') : ''}`);
};
const waitFor = async (fn, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(fn)) return true; await wait(250); }
  return false;
};
// synthetic touches through CDP so pointer events fire exactly like a finger
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
const tap = async (x, y, hold = 60) => { await touch('touchStart', [[x, y]]); await wait(hold); await touch('touchEnd', []); };
const center = (sel) => ev((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }, sel);

await page.goto(`http://127.0.0.1:${port}/?fresh=1&scene=mine&zone=1`);
await step('mine loads with touch controls', async () => {
  if (!(await waitFor(() => window.__game && window.__game.sceneName === 'mine' && !window.__game.transitioning, 120000))) throw new Error('mine never loaded');
  await wait(2500);
  if (!(await center('.tc-stick'))) throw new Error('no on-screen stick');
  await shot('01-mine');
});
await step('stick walks the mole', async () => {
  const c = await center('.tc-stick');
  await ev(() => { window.__x0 = window.__game.scene.player.x; });
  await touch('touchStart', [c]);
  for (let k = 1; k <= 6; k++) { await touch('touchMove', [[c[0] + k * 9, c[1]]]); await wait(30); }
  // walking right moves the mole (or, right at a wall, the face close-up takes over)
  const ok = await waitFor(() => { const s = window.__game.scene; return Math.abs(s.player.x - window.__x0) > 0.6 || s.face.on; }, 90000);
  await touch('touchEnd', []);
  if (!ok) throw new Error('the stick did not move the mole');
});
await step('tap the rock to dig', async () => {
  const air = () => ev(() => { const w = window.__game.scene.world; let n = 0; for (let i = 0; i < w.pm.length; i += 7) if (w.pm[i] === 0) n++; return n; });
  const before = await air();
  // the solid ground just in front of the mole's feet (toScreen gives page CSS pixels)
  const p = await ev(() => { const s = window.__game.scene, pl = s.player, d = pl.facing || 1; const v = s.screen(pl.x + 0.7 * d, pl.y + 0.75); return [v.x, v.y]; });
  await touch('touchStart', [p]);
  await waitFor(() => false, 3500);
  await touch('touchEnd', []);
  await shot('02-dig');
  const after = await air();
  if (!(after > before)) throw new Error(`tapping did not dig (air samples ${before} → ${after})`);
});
await step('push into a wall → face close-up', async () => {
  const c = await center('.tc-stick');
  for (const dir of [1, -1]) {
    if (await ev(() => window.__game.scene.face.on)) break;
    await touch('touchStart', [c]);
    for (let k = 1; k <= 6; k++) { await touch('touchMove', [[c[0] + dir * k * 9, c[1]]]); await wait(30); }
    await waitFor(() => window.__game.scene.face.on, 90000);
    await touch('touchEnd', []);
  }
  if (!(await ev(() => window.__game.scene.face.on))) throw new Error('face mode never engaged');
  await wait(1500);
  const vw = size.width, vh = size.height;
  await touch('touchStart', [[vw * 0.6, vh * 0.45]]);
  await waitFor(() => false, 2500);
  await touch('touchEnd', []);
  await shot('03-face');
  const back = await center('.b-back');
  if (back) await tap(back[0], back[1]);
  else await ev(() => window.__game.scene.face.exit('test'));
  if (!(await waitFor(() => !window.__game.scene.face.on, 30000))) throw new Error('could not leave face mode');
});
await step('backpack and book open by tap', async () => {
  const bag = await center('.pack-bag');
  if (!bag) throw new Error('no backpack button');
  await tap(bag[0], bag[1]);
  if (!(await waitFor(() => window.__game.ui.panelStack.some((p) => p.kind === 'inv'), 15000))) throw new Error('backpack did not open');
  await wait(1200);
  await shot('04-backpack');
  await ev(() => window.__game.ui.closeAllPanels());
  await waitFor(() => !document.querySelector('.modal-back'), 5000);
  const book = await center('.pack-book');
  if (book) {
    await tap(book[0], book[1]);
    if (!(await waitFor(() => window.__game.ui.panelStack.some((p) => p.kind === 'book'), 15000))) throw new Error('tapping the book did not open the Index Book');
    await wait(1500);
    await shot('05-book');
    await ev(() => window.__game.ui.closeAllPanels());
  }
});

console.log(errors.length ? `\n${errors.length} error(s)` : '\nno errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
