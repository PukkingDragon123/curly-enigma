// End-to-end smoke test: visits every scene, exercises the main transitions and
// reports console errors. Usage: node scripts/e2e.mjs [outDir]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] || 'shots/e2e';
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error', clearScreen: false });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

const wait = (ms) => page.waitForTimeout(ms);
const scene = () => page.evaluate(() => window.__game.sceneName);
const go = async (name, params = {}) => {
  await page.evaluate(([n, p]) => window.__game.goto(n, p, { transition: 'none' }), [name, params]);
  for (let i = 0; i < 60; i++) { await wait(250); if ((await scene()) === name && !(await page.evaluate(() => window.__game.transitioning))) break; }
};
const shot = (n) => page.screenshot({ path: `${outDir}/${n}.png` });
const step = async (label, fn) => {
  const before = errors.length;
  try { await fn(); } catch (e) { errors.push(`[step:${label}] ${e.message}`); }
  console.log(`${errors.length > before ? '✗' : '✓'} ${label}${errors.length > before ? '\n   ' + errors.slice(before).join('\n   ') : ''}`);
};

await page.goto(`http://127.0.0.1:${port}/?fresh=1`);
await wait(3500);
await step('title loads', async () => { if ((await scene()) !== 'title') throw new Error('not on title'); await shot('01-title'); });
await step('new game → trapped in the intro', async () => {
  await page.evaluate(() => { window.__game.state.reset(); window.__game.goto('mine', { intro: '1' }, { transition: 'none' }); });
  for (let i = 0; i < 80 && (await scene()) !== 'mine'; i++) await wait(250);
  await wait(3000);
  if ((await scene()) !== 'mine') throw new Error('not in the intro mine: ' + (await scene()));
  if (await page.evaluate(() => window.__game.state.escaped)) throw new Error('escaped flag set on a new game');
  await shot('02-intro');
});
await step('escape → town arrival', async () => {
  await page.evaluate(() => { const s = window.__game.scene; s.introCtl.found = true; s.introCtl.escape(); });
  for (let i = 0; i < 80 && ((await scene()) !== 'town' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'town') throw new Error('did not reach town: ' + (await scene()));
  if (!(await page.evaluate(() => window.__game.state.escaped))) throw new Error('escaped flag missing');
  await wait(2500);
  await shot('02b-arrival');
});
await step('home', async () => {
  await go('home', { from: 'town' });
  await wait(2500);
  if ((await scene()) !== 'home') throw new Error('not home: ' + (await scene()));
  await shot('02c-home');
});
await step('town', async () => { await go('town', { from: 'home' }); await wait(2500); await shot('03-town'); });
await step('shops open & buy', async () => {
  await page.evaluate(() => { window.__game.state.addGold(5000); return window.__game.ui.openShop('tools'); });
  await wait(1200);
  await shot('04-shop');
  const ok = await page.evaluate(() => { const r = window.__game.state.buy('chisel_basic', 120); window.__game.ui.closeAllPanels(); return r.ok; });
  if (!ok) throw new Error('buy failed');
});
await step('mine zone 1', async () => {
  await go('mine', { zone: 1 });
  await wait(3000);
  await page.mouse.move(700, 470);
  await page.mouse.down();
  await wait(1500);
  await page.mouse.up();
  await shot('05-mine');
});
await step('face mode', async () => {
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 120 && !(await page.evaluate(() => window.__game.scene.face && window.__game.scene.face.on)); i++) await wait(250);
  await page.keyboard.up('KeyD');
  const on = await page.evaluate(() => window.__game.scene.face.on);
  if (!on) {
    // the spawn may not face a wall: walk the other way
    await page.keyboard.down('KeyA');
    for (let i = 0; i < 120 && !(await page.evaluate(() => window.__game.scene.face.on)); i++) await wait(250);
    await page.keyboard.up('KeyA');
  }
  if (!(await page.evaluate(() => window.__game.scene.face.on))) throw new Error('face mode never engaged');
  await wait(1500);
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await wait(2000);
  await page.mouse.up();
  await shot('05b-face');
  await page.keyboard.press('KeyS');
  await wait(800);
});
await step('mine → town via lift', async () => {
  await page.evaluate(() => window.__game.scene.leave('town'));
  for (let i = 0; i < 40 && (await scene()) !== 'town'; i++) await wait(250);
  if ((await scene()) !== 'town') throw new Error('did not reach town');
  await wait(1500);
});
await step('assay sells', async () => {
  await page.evaluate(() => { const st = window.__game.state; st.addItem('copper_ore', { q: 80, n: 3 }); return window.__game.ui.openShop('assay'); });
  await wait(1000);
  await shot('06-assay');
  const g = await page.evaluate(() => { const st = window.__game.state; const before = st.gold; for (const l of st.lotsOf('copper_ore')) st.sellLot(l.uid); window.__game.ui.closeAllPanels(); return st.gold - before; });
  if (!(g > 0)) throw new Error('no gold from selling');
});
await step('forge', async () => {
  await page.evaluate(() => { const st = window.__game.state; st.addItem('copper_ore', { q: 90, n: 6 }); st.addItem('tin_ore', { q: 90, n: 2 }); st.addItem('coal', { q: 90, n: 6 }); st.addItem('bronze_ingot', { q: 90, n: 4 }); });
  await go('forge');
  await wait(3000);
  await shot('07-forge');
});
await step('cooking', async () => {
  await page.evaluate(() => { const st = window.__game.state; ['glowcap', 'salt_crystal', 'egg', 'pepperroot'].forEach((i) => st.addItem(i, { n: 3 })); });
  await go('cooking');
  await wait(3000);
  await shot('08-cooking');
});
await step('home again + sleep', async () => {
  await go('home', { from: 'forge' });
  await wait(2000);
  const d0 = await page.evaluate(() => window.__game.state.data.day);
  await page.evaluate(() => window.__game.sleep());
  const d1 = await page.evaluate(() => window.__game.state.data.day);
  if (d1 !== d0 + 1) throw new Error('day did not advance');
  await shot('09-home');
});
await step('index book', async () => {
  await page.evaluate(() => window.__game.ui.openIndex());
  await wait(1000);
  await shot('10-index');
  await page.evaluate(() => window.__game.ui.closeAllPanels());
});
await step('ticket → ending', async () => {
  await go('town', { from: 'home' });
  await wait(1500);
  await page.evaluate(() => { window.__game.state.addGold(1000000); return window.__game.ui.openShop('ticket'); });
  await wait(1000);
  await shot('11-ticket');
  await page.evaluate(() => window.__game.ui.closeAllPanels());
  await go('ending');
  await wait(9000);
  await shot('12-ending-a');
  await wait(14000);
  await shot('13-ending-b');
});
console.log(`\n${errors.length ? errors.length + ' error(s)' : 'no errors'}`);
if (errors.length) console.log(errors.slice(0, 30).join('\n'));
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
