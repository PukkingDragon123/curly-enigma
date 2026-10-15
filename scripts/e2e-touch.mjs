// Touch smoke test: a phone in landscape (or portrait with --portrait), first person underground.
// Looks around by dragging the right half, walks with the floating stick on the left half, holds
// the big dig button until rock breaks, taps the backpack and the book open, and reports console
// errors.
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

await page.goto(`http://127.0.0.1:${port}/?fresh=1&scene=deep`);
await step('underground loads with touch controls', async () => {
  if (!(await waitFor(() => window.__game && window.__game.sceneName === 'deep' && !window.__game.transitioning, 120000))) throw new Error('deep never loaded');
  await wait(2500);
  if (!(await center('.tc-dig'))) throw new Error('no dig button');
  if (!(await center('.tc-look'))) throw new Error('no look layer');
  await shot('01-deep');
});
await step('drag the right half to look around', async () => {
  const vw = size.width, vh = size.height;
  await ev(() => { window.__yaw0 = window.__game.scene.player.yaw; });
  await touch('touchStart', [[vw * 0.7, vh * 0.4]]);
  for (let k = 1; k <= 8; k++) { await touch('touchMove', [[vw * 0.7 - k * 12, vh * 0.4]]); await wait(40); }
  await touch('touchEnd', []);
  // frames are slow headless: give the scene time to read the look accumulator
  if (!(await waitFor(() => Math.abs(window.__game.scene.player.yaw - window.__yaw0) > 0.05, 30000))) throw new Error('looking did not turn the camera');
});
await step('stick moves the mole', async () => {
  const vw = size.width, vh = size.height;
  await ev(() => { window.__p0 = window.__game.scene.player.pos.clone(); window.__wish = 0; });
  const c = [vw * 0.18, vh * 0.7];
  await touch('touchStart', [c]);
  for (let k = 1; k <= 6; k++) { await touch('touchMove', [[c[0] + k * 9, c[1]]]); await wait(30); }
  // strafing right: the mole wants to move (and does, unless a wall is right there)
  const ok = await waitFor(() => { const s = window.__game.scene; if (Math.hypot(s.wish.x, s.wish.z) > 0.3) window.__wish = 1; return window.__wish && s.player.pos.distanceTo(window.__p0) > 0.05; }, 60000);
  await touch('touchEnd', []);
  if (!ok && !(await ev(() => window.__wish))) throw new Error('the stick did not steer the mole');
});
await step('hold dig to break rock', async () => {
  const edits = () => ev(() => { let n = 0; for (const m of window.__game.scene.world.edits.values()) n += m.size; return n; });
  const before = await edits();
  await ev(() => { const pl = window.__game.scene.player; pl.pitch = -0.1; });
  const d = await center('.tc-dig');
  await touch('touchStart', [d]);
  const ok = await waitFor(() => { let n = 0; for (const m of window.__game.scene.world.edits.values()) n += m.size; return n > 0 && window.__game.scene.bodies.list.length + window.__game.scene.fx.soft.p.length > 0; }, 90000);
  await touch('touchEnd', []);
  await shot('02-dig');
  const after = await edits();
  if (!ok || !(after > before)) throw new Error(`holding dig did not break rock (edited voxels ${before} → ${after})`);
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
