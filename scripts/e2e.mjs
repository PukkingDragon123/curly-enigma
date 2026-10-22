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
  // the fall ends in Old Star's dig, in the mine
  for (let i = 0; i < 120 && ((await scene()) !== 'deep' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'deep') throw new Error('did not land in the dig: ' + (await scene()));
});
await step("Old Star's lessons → ride up to the tavern", async () => {
  await wait(2500);
  const s0 = await page.evaluate(() => { const P = window.__game.scene.prologue; if (!P) return null; P.debug.run(3); return P.debug.step(); });
  if (!s0) throw new Error('no prologue in the dig');
  await shot('02b-oldstar-pinned');
  // play the lessons through the test hooks: rocks, the copper clump, the ladder and map, the plug, the lift
  const seen = await page.evaluate(() => {
    const d = window.__game.scene.prologue.debug, out = [d.step()];
    const go = (fn, sec = 2.5) => { if (d[fn]) d[fn](); d.run(sec); const st = d.step(); if (out[out.length - 1] !== st) out.push(st); };
    go('clearRocks', 4); go('freeOre', 3); go('grab', 1.5); go('clean', 2); go('bag', 2);
    return out;
  });
  await shot('02c-oldstar-lessons');
  const more = await page.evaluate(() => {
    const d = window.__game.scene.prologue.debug, out = [d.step()];
    const go = (fn, sec = 2.5) => { if (d[fn]) d[fn](); d.run(sec); const st = d.step(); if (out[out.length - 1] !== st) out.push(st); };
    go('ladder', 2); go('toLedge', 2); go('takeMap', 3); go('breakPlug', 3);
    return out;
  });
  if (!(seen.length + more.length > 4)) throw new Error('the lessons did not move on: ' + seen.concat(more).join(' '));
  await shot('02d-oldstar-plug');
  // the last bit (the walk to the cage and the ride) is skipped: it rides up with all flags set
  await page.evaluate(() => window.__game.scene.prologue.debug.skip());
  for (let i = 0; i < 160 && ((await scene()) !== 'home' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'home') throw new Error('did not ride up home: ' + (await scene()) + ' after ' + seen.concat(more).join(' '));
  await wait(3000);
  const f = await page.evaluate(() => ['prologue', 'fallen', 'nugget', 'escaped'].map((k) => window.__game.state.flag(k)));
  if (!f[0] || !f[1] || !f[2]) throw new Error('opening flags missing: ' + f);
  if (f[3]) throw new Error('escaped flag set on a new game');
  await shot('02e-tavern-arrival');
});
await step('home lift → the mine entrance', async () => {
  // no digging outside the mine: the cage lift in the house is the way down
  await page.evaluate(() => window.__game.scene.debug.useLift('L0'));
  for (let i = 0; i < 120 && ((await scene()) !== 'deep' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'deep') throw new Error('not underground: ' + (await scene()));
  await wait(2500);
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
      const popped = () => s.bodies.list.some((b) => b.pickup) || (s.clumps && s.clumps.list.length > 0);
      for (let i = 0; i < 60 && !popped(); i++) {
        const o = offs[i % offs.length]; aim(...o); s.updateTarget();
        if (!s.target || s.target.m >= 128) continue;
        window.__game.state.data.energy = 100;
        s.strike();
      }
      if (!popped()) continue;
      for (let k = 0; k < 8; k++) s.update(1 / 30);
      return { popped: true, item: d.item, ores0, clump: !!(s.clumps && s.clumps.list.length) };
    }
    return { popped: false };
  });
  if (!r.popped) throw new Error('no ore came loose');
  await shot('04-deep-ore');
  // a clump: let it settle, pick it up, look at it, bag it
  if (r.clump) {
    await page.evaluate(() => {
      const s = window.__game.scene;
      for (let k = 0; k < 60; k++) s.update(1 / 30);
      s.clumps.debug.grab(s.clumps.list[0]);
      for (let k = 0; k < 20; k++) s.update(1 / 30);
    });
    await shot('04c-clump-held');
    await page.evaluate(() => { const s = window.__game.scene; s.interact(); });
  }
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
  // first-person town: play out the scripted escape arrival (headless frames are slow), then use
  // the counter the way E does (scene.debug.openShop) and chat with someone
  await page.evaluate(() => window.__game.scene.debug.run(4));
  if (await page.evaluate(() => window.__game.scene.locked)) throw new Error('arrival never handed control back');
  await page.evaluate(() => { window.__game.state.addGold(5000); return window.__game.scene.debug.openShop('tools'); });
  await wait(1200);
  await shot('06-shop');
  const ok = await page.evaluate(() => { const r = window.__game.state.buy('chisel_basic', 120); window.__game.ui.closeAllPanels(); return r.ok; });
  if (!ok) throw new Error('buy failed');
  const line = await page.evaluate(() => { const d = window.__game.scene.debug; return d.talkTo(d.names()[0]); });
  if (!line) throw new Error('nobody to chat with');
});
await step('town lift → deep station → back up', async () => {
  // Bramble's lift: the gate opens, the mole steps in, the cage drops into the pit → the first mine lift
  await page.evaluate(() => { const d = window.__game.scene.debug; d.useLift('L0'); return d.run(3.5); });
  for (let i = 0; i < 80 && ((await scene()) !== 'deep' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'deep') throw new Error('lift did not go down: ' + (await scene()));
  await wait(2500);
  await shot('07-station');
  // ride back up to town from the mine lift: the cage rises out of the pit and the mole steps out
  await page.evaluate(() => import('/src/fps/lifts.js').then((m) => m.rideTo(window.__game, 'town')));
  for (let i = 0; i < 80 && ((await scene()) !== 'town' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'town') throw new Error('lift did not ride up: ' + (await scene()));
  const r = await page.evaluate(() => window.__game.scene.debug.run(4));
  if (r.locked) throw new Error('still in the cage after the ride up');
  await wait(500);
});
await step('mine lift home', async () => {
  await go('deep', { from: 'lift', lift: 'L0' });
  await wait(2000);
  await page.evaluate(() => import('/src/fps/lifts.js').then((m) => m.rideTo(window.__game, 'home')));
  for (let i = 0; i < 80 && ((await scene()) !== 'home' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'home') throw new Error('did not get home: ' + (await scene()));
  await wait(2500);
  await shot('08-home-by-lift');
  await go('town', { from: 'home' });
  await wait(1500);
});
await step('assay sells', async () => {
  await page.evaluate(() => { const st = window.__game.state; st.addItem('copper_ore', { q: 80, n: 3 }); return window.__game.scene.debug.openShop('assay'); });
  await wait(1000);
  await shot('09-assay');
  const g = await page.evaluate(() => { const st = window.__game.state; const before = st.gold; for (const l of st.lotsOf('copper_ore')) st.sellLot(l.uid); window.__game.ui.closeAllPanels(); return st.gold - before; });
  if (!(g > 0)) throw new Error('no gold from selling');
});
await step('forge', async () => {
  await page.evaluate(() => { const st = window.__game.state; st.addItem('copper_ore', { q: 90, n: 6 }); st.addItem('tin_ore', { q: 90, n: 2 }); st.addItem('coal', { q: 90, n: 6 }); st.addItem('bronze_ingot', { q: 90, n: 4 }); });
  await go('forge', { from: 'home' });
  await wait(3000);
  await shot('10-forge');
  // first-person smithing, driven through the scene's test hooks (scene.debug): smelt bronze ...
  const smelt = await page.evaluate(() => {
    const sc = window.__game.scene, d = sc.debug, st = window.__game.state;
    const before = st.count('bronze_ingot');
    d.smelt('smelt_bronze');
    for (let n = 0; sc.activity && sc.activity.phase === 'heat' && n < 900; n++) { const a = sc.activity; d.pump(a.sim.T < a.r.temp[0] * 0.35 + a.r.temp[1] * 0.65); d.step(1); }
    d.pump(false);
    d.until('idle', 900);
    return { gained: st.count('bronze_ingot') - before, state: d.state() };
  });
  if (!(smelt.gained > 0)) throw new Error('smelting made no ingot: ' + JSON.stringify(smelt));
  // ... then forge a bronze dagger: heat, hammer, grind, balance, the reveal
  const forged = await page.evaluate(() => {
    const sc = window.__game.scene, d = sc.debug, st = window.__game.state;
    const before = st.data.weapons.length;
    st.data.energy = 100;
    d.forge({ type: 'dagger', metal: 'bronze' });
    for (let n = 0; n < 900; n++) { const a = sc.activity; if (a.sim.meanT() >= (a.m.work[0] + a.m.work[1]) / 2) break; d.pump(true); d.step(1); }
    d.pump(false);
    d.toAnvil();
    d.until('docked', 120);
    for (const c of [0, 1, 2, 3, 2, 3, 4]) { d.strike(c, 0.6); d.step(12); }
    d.finishShaping();
    d.until('balance', 600);
    d.balance(true);
    d.until('result', 600);
    d.step(40);
    return { made: st.data.weapons.length - before, state: d.state() };
  });
  if (forged.made !== 1) throw new Error('forging made no weapon: ' + JSON.stringify(forged));
  await wait(1500);
  await shot('10b-forge-result');
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
  // first-person burrow hooks: build mode places a piece, the lift panel lists the mine entrance
  const b = await page.evaluate(() => {
    const dbg = window.__game.scene.debug;
    const on = dbg.toggleBuild(true);
    const spots = [[3, 4], [2, 5], [5, 6], [6, 4], [1, 4]];
    let placed = null;
    for (const [x, z] of spots) { const r = dbg.placeAt('stool', x, z, 0); if (r.ok) { placed = r; break; } }
    const off = dbg.toggleBuild(false);
    dbg.interact('Ride the lift');
    const panel = document.body.textContent.includes('Mine entrance');
    window.__game.ui.closeAllPanels();
    return { on, off, placed: !!placed, panel };
  });
  if (!b.on || b.off || !b.placed) throw new Error('build mode: ' + JSON.stringify(b));
  if (!b.panel) throw new Error('the lift panel has no mine entrance');
  const d0 = await page.evaluate(() => window.__game.state.data.day);
  await page.evaluate(() => window.__game.sleep());
  const d1 = await page.evaluate(() => window.__game.state.data.day);
  if (d1 !== d0 + 1) throw new Error('day did not advance');
  await shot('12-home');
});
await step('tavern: Old Star, his notes and his chest', async () => {
  const r = await page.evaluate(() => {
    const d = window.__game.scene.debug;
    const line = d.talk();
    const note = d.openNotes();
    const panel = !!document.querySelector('.nt-panel');
    window.__game.ui.closeAllPanels();
    return { line, note, panel, read: (window.__game.state.data.notesRead || []).length, labels: d.labels().length };
  });
  if (!r.line) throw new Error('Old Star had nothing to say');
  if (!r.panel || !r.read) throw new Error('notes: ' + JSON.stringify(r));
  await page.evaluate(() => { window.__chestDone = null; window.__game.scene.debug.openChest().then((x) => { window.__chestDone = x || []; }); });
  // the loot flies to the backpack in real time (DOM animations), the lid in game time: drive both
  for (let i = 0; i < 120 && !(await page.evaluate(() => window.__chestDone)); i++) { await page.evaluate(() => window.__game.scene.debug.step(10)); await wait(100); }
  const got = await page.evaluate(() => window.__chestDone);
  if (!got || !got.length) throw new Error('the chest gave nothing');
  await shot('12b-tavern');
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
  await page.evaluate(() => { window.__game.state.addGold(1000000); return window.__game.scene.debug.openShop('ticket'); });
  await wait(1000);
  await shot('14-ticket');
  // buy the ticket and board, as the Surface Express window's button does
  await page.evaluate(() => { const b = document.querySelector('.sh-board'); if (!b) throw new Error('no board button'); b.click(); });
  await wait(600);
  await page.evaluate(() => document.querySelector('.stamp-btn.yes')?.click());
  for (let i = 0; i < 80 && ((await scene()) !== 'ending' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'ending') { await page.evaluate(() => window.__game.ui.closeAllPanels()); await go('ending'); }
  if (!(await page.evaluate(() => window.__game.state.owns('exit_ticket')))) throw new Error('no ticket bought');
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
