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
await step('new game → the fall', async () => {
  await page.evaluate(() => { window.__game.state.reset(); window.__game.goto('fall', {}, { transition: 'none' }); });
  for (let i = 0; i < 80 && (await scene()) !== 'fall'; i++) await wait(250);
  await wait(2500);
  if ((await scene()) !== 'fall') throw new Error('not falling: ' + (await scene()));
  await shot('02-fall');
  await page.evaluate(() => window.__game.scene.skip());
  for (let i = 0; i < 80 && ((await scene()) !== 'home' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'home') throw new Error('did not land home: ' + (await scene()));
});
await step('home landing', async () => {
  await wait(4000);
  const f = await page.evaluate(() => [window.__game.state.flag('fallen'), window.__game.state.flag('nugget'), window.__game.state.flag('escaped')]);
  if (!f[0] || !f[1]) throw new Error('landing flags missing: ' + f);
  if (f[2]) throw new Error('escaped flag set on a new game');
  await shot('02b-home-landing');
});
await step('dig out of the burrow wall → first person', async () => {
  await page.evaluate(() => { const it = window.__game.scene.digIts.find((i) => i.label === 'Dig'); window.__game.scene.locked = false; it.action(); });
  for (let i = 0; i < 120 && ((await scene()) !== 'deep' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'deep') throw new Error('not underground: ' + (await scene()));
  await wait(2500);
  if (!(await page.evaluate(() => window.__game.state.data.deep.tunnels.length))) throw new Error('tunnel not remembered');
  await shot('03-deep');
});
// headless frames are slow: the deep steps drive the simulation directly with scene.update()
await step('deep: dig out an ore', async () => {
  const r = await page.evaluate(() => {
    const s = window.__game.scene, w = s.world, pl = s.player, V = 8;
    const ores0 = window.__game.state.data.stats.ores;
    for (const a of w.plan.areas.slice(0, 6)) {
      s.terrain.warm(a.x, a.y, a.z, 2);
      const d = w.depositsNear(a.x, a.y, a.z, 6).find((q) => !w.depState(q).taken);
      if (!d) continue;
      // stand in a little dug pocket beside the deposit
      const px = d.x + 1.1, py = d.y - 0.6, pz = d.z;
      for (let z = Math.floor((pz - 0.7) * V); z <= Math.ceil((pz + 0.7) * V); z++) for (let y = Math.floor(py * V); y <= Math.ceil((py + 1) * V); y++) for (let x = Math.floor((px - 0.6) * V); x <= Math.ceil((px + 0.6) * V); x++) if (w.voxelAt(x, y, z) < 128) w.setVoxel(x, y, z, 0);
      pl.pos.set(px, py, pz); pl.vel.set(0, 0, 0);
      s.terrain.warm(px, py + 0.5, pz, 2);
      const aim = (ox, oy, oz) => { const e = pl.eye(); const dx = d.x + ox - e.x, dy = d.y + oy - e.y, dz = d.z + oz - e.z; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
      const offs = [[0, 0.35, 0], [0, 0.3, 0.25], [0, 0.3, -0.25], [0, 0, 0.32], [0, 0, -0.32], [0, -0.3, 0], [0, -0.3, 0.25], [0, -0.3, -0.25], [-0.2, 0.3, 0], [-0.2, -0.3, 0], [-0.2, 0, 0.3], [-0.2, 0, -0.3]];
      for (let i = 0; i < 60 && !s.bodies.list.some((b) => b.pickup); i++) {
        const o = offs[i % offs.length]; aim(...o); s.updateTarget();
        if (!s.target || s.target.m >= 128) continue;
        window.__game.state.data.energy = 100;
        s.strike();
      }
      if (!s.bodies.list.some((b) => b.pickup)) continue;
      for (let k = 0; k < 8; k++) s.update(1 / 30);
      return { popped: true, item: d.item, ores0 };
    }
    return { popped: false };
  });
  if (!r.popped) throw new Error('no ore came loose');
  await shot('04-deep-ore');
  const got = await page.evaluate(() => { const s = window.__game.scene; for (let k = 0; k < 90; k++) s.update(1 / 30); return window.__game.state.data.stats.ores; });
  if (!(got > r.ores0)) throw new Error('the ore never reached the backpack');
});
await step('deep: radar + survey map', async () => {
  const n = await page.evaluate(() => window.__game.scene.radar().markers.length);
  if (!(n >= 2)) throw new Error('radar has no markers');
  await page.evaluate(() => window.__game.ui.openSurvey());
  await wait(1200);
  await shot('04b-survey');
  await page.evaluate(() => window.__game.ui.closeAllPanels());
});
await step('deep: reach the town gate → escape', async () => {
  await page.evaluate(() => {
    const s = window.__game.scene, pl = s.player, T = s.world.plan.town;
    pl.pos.set(T.x + 1.6, T.y + 0.05, T.z + 0.8); pl.vel.set(0, 0, 0);
    s.terrain.warm(pl.pos.x, pl.pos.y + 0.5, pl.pos.z, 2);
    for (let k = 0; k < 10 && !s.leaving; k++) s.update(1 / 30);
  });
  for (let i = 0; i < 80 && ((await scene()) !== 'town' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'town') throw new Error('did not reach town: ' + (await scene()));
  if (!(await page.evaluate(() => window.__game.state.escaped))) throw new Error('escaped flag missing');
  await wait(2500);
  await shot('05-arrival');
});
await step('shops open & buy', async () => {
  await page.evaluate(() => { window.__game.state.addGold(5000); return window.__game.ui.openShop('tools'); });
  await wait(1200);
  await shot('06-shop');
  const ok = await page.evaluate(() => { const r = window.__game.state.buy('chisel_basic', 120); window.__game.ui.closeAllPanels(); return r.ok; });
  if (!ok) throw new Error('buy failed');
});
await step('town lift → deep station → back up', async () => {
  await go('deep', { from: 'town', station: 0 });
  await wait(2500);
  if ((await scene()) !== 'deep') throw new Error('lift did not go down');
  await shot('07-station');
  await page.evaluate(() => window.__game.scene.interact());
  for (let i = 0; i < 80 && ((await scene()) !== 'town' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'town') throw new Error('lift bell did not ride up: ' + (await scene()));
  await wait(1500);
});
await step('tunnel home', async () => {
  const t = await page.evaluate(() => window.__game.state.data.deep.tunnels[0]);
  await go('deep', { from: 'home', wall: t.wall, t: t.t });
  await wait(2000);
  await page.evaluate(() => window.__game.scene.headHome());
  for (let i = 0; i < 80 && ((await scene()) !== 'home' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'home') throw new Error('did not get home: ' + (await scene()));
  await wait(2500);
  await shot('08-home-from-tunnel');
  await go('town', { from: 'home' });
  await wait(1500);
});
await step('assay sells', async () => {
  await page.evaluate(() => { const st = window.__game.state; st.addItem('copper_ore', { q: 80, n: 3 }); return window.__game.ui.openShop('assay'); });
  await wait(1000);
  await shot('09-assay');
  const g = await page.evaluate(() => { const st = window.__game.state; const before = st.gold; for (const l of st.lotsOf('copper_ore')) st.sellLot(l.uid); window.__game.ui.closeAllPanels(); return st.gold - before; });
  if (!(g > 0)) throw new Error('no gold from selling');
});
await step('forge', async () => {
  await page.evaluate(() => { const st = window.__game.state; st.addItem('copper_ore', { q: 90, n: 6 }); st.addItem('tin_ore', { q: 90, n: 2 }); st.addItem('coal', { q: 90, n: 6 }); st.addItem('bronze_ingot', { q: 90, n: 4 }); });
  await go('forge');
  await wait(3000);
  await shot('10-forge');
});
await step('cooking', async () => {
  await page.evaluate(() => { const st = window.__game.state; ['glowcap', 'salt_crystal', 'egg', 'pepperroot'].forEach((i) => st.addItem(i, { n: 3 })); });
  await go('cooking');
  await wait(3000);
  await shot('11-cooking');
});
await step('home again + sleep', async () => {
  await go('home', { from: 'forge' });
  await wait(2000);
  const d0 = await page.evaluate(() => window.__game.state.data.day);
  await page.evaluate(() => window.__game.sleep());
  const d1 = await page.evaluate(() => window.__game.state.data.day);
  if (d1 !== d0 + 1) throw new Error('day did not advance');
  await shot('12-home');
});
await step('index book', async () => {
  await page.evaluate(() => window.__game.ui.openIndex());
  await wait(1000);
  await shot('13-index');
  await page.evaluate(() => window.__game.ui.closeAllPanels());
});
await step('ticket → ending', async () => {
  await go('town', { from: 'home' });
  await wait(1500);
  await page.evaluate(() => { window.__game.state.addGold(1000000); return window.__game.ui.openShop('ticket'); });
  await wait(1000);
  await shot('14-ticket');
  await page.evaluate(() => window.__game.ui.closeAllPanels());
  await go('ending');
  await wait(9000);
  await shot('15-ending-a');
  await wait(14000);
  await shot('16-ending-b');
});
console.log(`\n${errors.length ? errors.length + ' error(s)' : 'no errors'}`);
if (errors.length) console.log(errors.slice(0, 30).join('\n'));
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
