// temp playtest: mining feel shots
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome.mjs';
import { mkdirSync } from 'node:fs';
const out = 'shots/wave21/feel'; mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || /^(strike|blow)/.test(m.text())) console.log('[c]', m.text()); });
await page.goto(`http://127.0.0.1:${port}/?scene=deep&fresh=1&from=lift&lift=L0`);
await page.waitForFunction(() => window.__game?.sceneName === 'deep' && !window.__game.transitioning && window.__game.scene.player, null, { timeout: 120000 });
await page.waitForTimeout(3000);
const R = await page.evaluate(() => {
  const g = window.__game, s = g.scene, st = g.state;
  st.addItem('pick_first'); st.equip('pick_first'); s.updateHotbar?.();
  s.firstDig?.debug?.off?.();
  const inp = g.input; inp.locked = true; window.__hold = false;
  const md = inp.mouseDown.bind(inp); inp.mouseDown = (b) => (b === 0 && window.__hold) || md(b);
  window.__step = (n, dt = 1 / 30) => { for (let k = 0; k < n; k++) s.update(dt); };
  return { slot: s.slotName, pos: s.player.pos.toArray().map((v) => +v.toFixed(2)) };
});
console.log(R);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
await page.evaluate((dy) => { window.__DY = dy; window.__step(3); }, +(process.env.DY || 0.25));
const t = await page.evaluate(() => {
  const s = window.__game.scene, w = s.world, pl = s.player, V = 16;
  for (const a of w.plan.areas.slice(0, 8)) {
    s.terrain.warm(a.x, a.y, a.z, 2);
    const d = w.depositsNear(a.x, a.y, a.z, 6).find((q) => !w.depState(q).taken);
    if (!d) continue;
    const px = d.x + 1.3, py = d.y - 0.6, pz = d.z;
    for (let z = Math.floor((pz - 0.7) * V); z <= Math.ceil((pz + 0.7) * V); z++) for (let y = Math.floor(py * V); y <= Math.ceil((py + 1) * V); y++) for (let x = Math.floor((px - 0.6) * V); x <= Math.ceil((px + 0.6) * V); x++) if (w.voxelAt(x, y, z) < 128) w.setVoxel(x, y, z, 0);
    pl.pos.set(px, py, pz); pl.vel.set(0, 0, 0);
    s.terrain.warm(px, py + 0.5, pz, 2);
    const e = pl.eye(); const dx = d.x - e.x, dy = d.y + (window.__DY ?? 0.25) - e.y, dz = d.z + 0.45 - e.z; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    window.__step(30);
    s.updateTarget();
    window.__dep = d;
    return { m: s.target?.m, d: s.target?.dist, item: d.item };
  }
});
console.log('target', t);
await page.evaluate(() => { const s = window.__game.scene; s.selectSlot(0); window.__hold = true;
  const o = s.digger.strike.bind(s.digger); s.digger.strike = (...a) => { const r = o(...a); console.log('strike', s.target?.m, s.target?.dist?.toFixed(2), 'brk', r.brk, 'n', r.broken?.length, 'dmg', JSON.stringify(r.dmg ?? r.d ?? null)); return r; };
  const so = s.strike.bind(s); s.strike = () => { console.log('blow m', s.target?.m, 'dist', s.target?.dist?.toFixed(2)); return so(); };
});
const STEPS = JSON.parse(process.env.STEPS || '[3,3,3,10,10,10]');
for (let i = 0; i < STEPS.length; i++) {
  await page.evaluate((n) => window.__step(n), STEPS[i]);
  await shot('dig-' + i);
}
await page.evaluate(() => { window.__hold = false; window.__step(20); });
await shot('dig-after');
await browser.close(); await server.close();
