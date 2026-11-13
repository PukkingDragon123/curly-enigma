// (scratch) wave 12 teaching-moment screenshots: node scripts/.w12teach.mjs [--phone]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome.mjs';
import { mkdirSync } from 'node:fs';
const phone = process.argv.includes('--phone');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const out = 'shots/wave12/teach';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error', clearScreen: false });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const wait = (ms) => page.waitForTimeout(ms);
const tag = phone ? 'phone' : 'desk';
const shot = async (n) => { await wait(700); return page.screenshot({ path: `${out}/${n}-${tag}.png`, timeout: 120000 }); };
const scene = () => page.evaluate(() => window.__game.sceneName);
const go = async (name, params = {}) => {
  await page.evaluate(([n, p]) => window.__game.goto(n, p, { transition: 'none' }), [name, params]);
  for (let i = 0; i < 80; i++) { await wait(250); if ((await scene()) === name && !(await page.evaluate(() => window.__game.transitioning))) break; }
  await wait(1200);
};
const want = (k) => !only || only.split(',').includes(k);

await page.goto(`http://127.0.0.1:${port}/?fresh=1&bag=48`);
await wait(3500);
await page.evaluate(() => { const d = window.__game.scene.debug; d.openStones(); d.step?.(2); });
await wait(1500);
await page.evaluate(() => window.__game.scene.debug.pick(0));
for (let i = 0; i < 120 && (await scene()) !== 'fall'; i++) await wait(250);
await wait(1500);
await page.evaluate(() => window.__game.scene.skip());
for (let i = 0; i < 160 && ((await scene()) !== 'home' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
await wait(1500);
await page.evaluate(() => window.__game.scene.debug.finishWake());

if (want('chip')) {
  // Old Star's chisel demonstration (back with the pick: stage 'mine', from the forge)
  await page.evaluate(() => { const s = window.__game.scene; s.givePick(); s.setLesson('mine'); });
  await page.evaluate(() => { window.__arr = window.__game.scene.debug.arrive('forge'); });
  await page.evaluate(() => window.__game.scene.debug.run(600, 1 / 30, () => { const s = window.__game.scene; if (s.chipLump) return true; window.__game.convo?.next?.(); return false; }));
  await page.evaluate(() => window.__game.scene.debug.run(40, 1 / 30));
  console.log(JSON.stringify(await page.evaluate(() => { const s = window.__game.scene, l = s.chipLump; if (!l) return null; const w = l.getWorldPosition(new s.camera.position.constructor()); const h = s.star.head(new s.camera.position.constructor()); const c = s.camera.getWorldPosition(new s.camera.position.constructor()); let vis = true; for (let o = l; o; o = o.parent) if (!o.visible) vis = false; const ws = new s.camera.position.constructor(); l.getWorldScale(ws); return { w, h, c, vis, ws, kids: l.children.filter((b) => b.visible).length, inScene: !!l.parent?.parent }; })));
  await shot('01-star-chips');
  console.log('after', await page.evaluate(() => { const s = window.__game.scene; const sp = s.toScreen?.(s.chipLump.getWorldPosition(s.camera.position.clone())); const hp = s.toScreen?.(s.star.head(s.camera.position.clone())); return [JSON.stringify(sp), JSON.stringify(hp), s.camera.near, s.camera.layers.mask, s.chipLump.children[0].layers.mask, !!s.chipLump, s.chipLump?.children.filter((b) => b.visible).length, s.camera.position.toArray().map((v) => v.toFixed(2)).join(','), window.__game.engine?.camera === s.camera]; }));
  await page.evaluate(() => window.__game.scene.debug.run(60, 1 / 30));
  await page.evaluate(() => window.__game.convo?.next?.());
  await page.evaluate(() => window.__game.scene.debug.run(14, 1 / 30));
  await shot('02-star-clean');
  await page.evaluate(() => window.__game.scene.debug.run(600, 1 / 30, () => { const s = window.__game.scene; if (!s.cine) return true; window.__game.convo?.next?.(); return false; }));
}

// the mine
await page.evaluate(() => { const st = window.__game.state; st.data.oldstar.lesson = 'mine'; st.flag('prologue', false); window.__game.ui.unlock?.(['belt', 'dig', 'tools', 'pack']); });
await go('deep', { from: 'lift', lift: 'L0', lesson: 'mine' });
const step = (n) => page.evaluate((n) => { const s = window.__game.scene; for (let k = 0; k < n; k++) { s.update(1 / 30); window.__game.ui.update(1 / 30); } }, n);
await step(80);
if (want('seam')) {
  await page.evaluate(() => window.__game.scene.firstDig.debug.view(0, 1.6));
  await step(4);
  await page.evaluate(() => { const s = window.__game.scene; s.player.pitch = -0.05; });
  for (let i = 0; i < 60 && !(await page.evaluate(() => window.__game.scene.firstDig.debug.demo().n >= 3)); i++) await step(3);
  await step(6);
  await shot('03-seam-demo');
  await step(150);
  await shot('04-seam-glints');
}
if (want('clump')) {
  await page.evaluate(() => { const s = window.__game.scene, p = s.player.pos; s.firstDig.debug.view(0, 1.6); s.clumps.debug.spawnNear(p.x, p.y, p.z, 6); });
  await step(40);
  await shot('05-its-free');
  await page.evaluate(() => { const s = window.__game.scene; s.clumps.debug.grab(s.clumps.list[s.clumps.list.length - 1]); });
  await step(30);
  await shot('06-clump-chisel');
  await page.evaluate(() => { const s = window.__game.scene; const i = (s.state.data.hotbar || []).indexOf?.('chisel'); s.debug?.slot?.('chisel'); if (s.slotName !== 'chisel') { for (let k = 0; k < 9 && s.slotName !== 'chisel'; k++) s.slot = k; } });
  await step(40);
  await page.evaluate(() => { const s = window.__game.scene; for (let k = 0; k < 4; k++) s.clumps.debug.chip('chisel'); });
  await step(20);
  await shot('07-clump-glints');
  await page.evaluate(() => { const s = window.__game.scene; s.clumps.debug.clean(); s.clumps.held.g.updateClean(); s.clumps.word('Spotless!', 0.12, 'great', 1.6); });
  await step(30);
  await shot('08-bag-it');
  await page.evaluate(() => { const s = window.__game.scene; s.clumps.held && s.clumps.stash?.(s.clumps.held); });
  await step(30);
}
if (want('enemy')) {
  await page.evaluate(() => {
    const s = window.__game.scene, D = s.enemies.debug; s.firstDig.on = false; s.firstDig.dispose();
    D.clear(); D.auto(false);
    const r = D.stage('kobold', { dist: 2.6, awake: true });
    const e = D.get('kobold'); if (e) { s.enemies.seen(e); }
    window.__e = e;
  });
  await step(10);
  await shot('09-enemy-intro');
  await page.evaluate(() => { const s = window.__game.scene, e = window.__e; if (e) { e.dist = 2.5; s.enemies.combat.glint(e); } });
  await step(6);
  await shot('10-enemy-guard');
  await page.evaluate(() => { const s = window.__game.scene; s.enemies.debug.clear(); });
}
if (want('heavy')) {
  await page.evaluate(() => { const s = window.__game.scene, st = s.state; st.addItem('iron_ore', { n: 30 }); s.player.pitch = 0; s.loadT = 0; s.weigh(0.1); });
  await step(15);
  await shot('11-heavy');
  await page.evaluate(() => { const s = window.__game.scene, st = s.state; st.data.energy = 20; s.flags.low = false; });
  await step(15);
  await shot('12-low-energy');
}
if (want('stray')) {
  const r = await page.evaluate(() => { const g = window.__game, d = g.debug?.tame; if (!d) return null; g.state.addItem('dino_meat', { n: 3 }); const r = d.stage({ dist: 5 }); d.crouch(false); d.step(60); d.look('stray'); return !!r; });
  await step(5);
  await shot('13-stray-crouch');
  await page.evaluate(() => { const d = window.__game.debug.tame; d.crouch(true); for (let i = 0; i < 40 && !d.stray()?.calmed; i++) { d.step(15); d.look('stray'); } });
  await step(3);
  await shot('14-stray-food');
}
if (want('egg')) {
  await page.evaluate(() => { const st = window.__game.state; if (st.data.egg) st.data.egg.day = (st.data.day || 1) - 4; });
  await go('home', { from: 'lift' });
  await page.evaluate(() => { const s = window.__game.scene; const e = s.egg; if (e) { s.debug.stand(e.at.x + 1.3, e.at.z + 0.6, 0); s.debug.aim(e.at.x, 0.3, e.at.z); } });
  await page.evaluate(() => window.__game.scene.debug.run(60, 1 / 30));
  await shot('15-egg-hatching');
}
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'no errors');
await browser.close();
await server.close();
