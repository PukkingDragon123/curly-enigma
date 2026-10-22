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

await page.goto(`http://127.0.0.1:${port}/?fresh=1&bag=48`); // bag=48: the test adds a lot of stuff
await wait(3500);
await step('title loads', async () => { if ((await scene()) !== 'title') throw new Error('not on title'); await shot('01-title'); });
await step('save stones → new game → the journey', async () => {
  // the title's three save stones: an empty one starts a new adventure
  await page.evaluate(() => { const d = window.__game.scene.debug; d.openStones(); d.step?.(2); });
  await wait(2500);
  await shot('01b-stones');
  await page.evaluate(() => window.__game.scene.debug.pick(0));
  for (let i = 0; i < 120 && (await scene()) !== 'fall'; i++) await wait(250);
  if ((await scene()) !== 'fall') throw new Error('no journey: ' + (await scene()));
  await wait(4000);
  await shot('02-journey');
  await page.evaluate(() => window.__game.scene.skip());
  // the ground gives way, the mole blacks out... and wakes at Old Star's forge
  for (let i = 0; i < 160 && ((await scene()) !== 'home' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'home') throw new Error('did not wake up at home: ' + (await scene()));
});
await step('waking up: cold water and Old Star', async () => {
  await wait(1500);
  await shot('02b-waking');
  const r = await page.evaluate(() => window.__game.scene.debug.finishWake());
  if (!r || r.waking) throw new Error('still waking: ' + JSON.stringify(r));
  const f = await page.evaluate(() => ['fallen', 'nugget', 'escaped'].map((k) => window.__game.state.flag(k)));
  if (!f[0] || !f[1]) throw new Error('waking flags missing: ' + f);
  if (f[2]) throw new Error('escaped flag set on a new game');
  const q = await page.evaluate(() => window.__game.quests?.active?.().map((x) => x.id || x) || []);
  if (!q.includes('lessons')) throw new Error('the lessons quest did not start: ' + JSON.stringify(q));
  await shot('02c-old-star');
});
await step("Old Star's mining lesson (down the lift and back)", async () => {
  // the cage ride is a scripted animation on scene time: drive it (headless frames are slow)
  await page.evaluate(async () => {
    const d = window.__game.scene.debug;
    if (!d.interact('Ride down to the dig')) d.useLift('L0');
    await d.run(900, 1 / 30, () => window.__game.transitioning || window.__game.sceneName !== 'home');
  });
  for (let i = 0; i < 160 && ((await scene()) !== 'deep' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'deep') throw new Error('not down at the dig: ' + (await scene()));
  await wait(2500);
  if (!(await page.evaluate(() => !!window.__game.scene.prologue))) throw new Error('no lesson in the dig');
  await page.evaluate(() => { const s = window.__game.scene; for (let k = 0; k < 90; k++) s.update(1 / 30); });
  await shot('03-dig-lesson');
  // the lesson is played through by its own tests; here: skip this lesson, which rides home
  await page.evaluate(() => window.__game.scene.prologue.debug.skip(false));
  for (let i = 0; i < 200 && ((await scene()) !== 'home' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'home') throw new Error('did not ride home: ' + (await scene()));
  if (!(await page.evaluate(() => window.__game.state.flag('prologue')))) throw new Error('mining lesson not marked done');
  // Old Star sniffs the copper and sends you to his forge
  const stage = await page.evaluate(() => window.__game.scene.debug.run(600, 1 / 30, () => {
    const t = window.__game.ui.tutor;
    if (t?.active?.wait) { t.next(); t.next(); }
    return window.__game.scene.lessonStage() === 'forge';
  }).then(() => window.__game.scene.lessonStage()));
  if (stage !== 'forge') throw new Error('the forge lesson did not come next: ' + stage);
});
await step("Old Star's forge lesson", async () => {
  await go('forge', { from: 'home', tutorial: true });
  await wait(3000);
  await shot('03b-forge-lesson');
  const r = await page.evaluate(() => {
    const sc = window.__game.scene, d = sc.debug, st = window.__game.state;
    st.data.energy = 100;
    st.addItem('copper_ore', { q: 90, n: 4, spill: true }); st.addItem('coal', { q: 90, n: 4, spill: true });
    d.smelt('smelt_copper');
    for (let n = 0; sc.activity && sc.activity.phase === 'heat' && n < 900; n++) { const a = sc.activity; d.pump(a.sim.T < a.r.temp[0] * 0.35 + a.r.temp[1] * 0.65); d.step(1); }
    d.pump(false);
    d.until('idle', 900);
    const before = st.data.weapons.length;
    d.forge({ type: 'dagger', metal: 'copper' });
    for (let n = 0; n < 900; n++) { const a = sc.activity; if (a.sim.meanT() >= (a.m.work[0] + a.m.work[1]) / 2) break; d.pump(true); d.step(1); }
    d.pump(false);
    d.toAnvil();
    d.until('docked', 120);
    for (const c of [0, 1, 2, 3, 2, 3, 4]) { d.strike(c, 0.6); d.step(12); }
    d.finishShaping();
    d.until('balance', 600);
    d.balance(true);
    d.until('result', 600);
    d.step(60);
    return { made: st.data.weapons.length - before, lesson: st.data.oldstar?.lesson, stage: sc.lesson?.debug?.stage?.() };
  });
  if (r.made !== 1) throw new Error('the forge lesson made no dagger: ' + JSON.stringify(r));
  await shot('03c-forge-lesson-done');
});
await step("Old Star's cooking lesson", async () => {
  await go('cooking', { from: 'home', tutorial: true });
  await wait(3000);
  await shot('03e-cooking-lesson');
  const r = await page.evaluate(() => {
    const d = window.__game.scene.debug;
    let lesson = false;
    const on = (a) => { if (a.type === 'lesson' && a.step === 'cook_done') lesson = true; };
    window.__game.state.on('act', on);
    d.auto(90, 0.2);
    const res = d.toResult();
    for (let k = 0; k < 120 && !lesson; k++) window.__game.scene.update(1 / 30);
    return { res: !!res, dish: res?.dish, lesson };
  });
  if (!r.res) throw new Error('the cooking lesson made no dish: ' + JSON.stringify(r));
  await shot('03f-cooking-done');
});
await step('down the lift to the mine', async () => {
  await go('deep', { from: 'lift', lift: 'L0' });
  await wait(2500);
  if (await page.evaluate(() => !!window.__game.scene.prologue?.debug?.on?.())) throw new Error('the lesson came back after it was done');
  await shot('03d-mine');
});
// headless frames are slow: the deep steps drive the simulation directly with scene.update()
await step('deep: dig out an ore', async () => {
  const r = await page.evaluate(() => {
    const s = window.__game.scene, w = s.world, pl = s.player, V = 16;
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
await step('deep: radar + the hand-drawn map in the book', async () => {
  const n = await page.evaluate(() => window.__game.scene.radar().markers.length);
  if (!(n >= 2)) throw new Error('radar has no markers');
  await page.evaluate(() => window.__game.ui.openBook('map'));
  await wait(2500);
  await page.evaluate(() => window.__game.ui.book?.map?.debug?.finish?.());
  await wait(800);
  await shot('04b-map');
  await page.evaluate(() => window.__game.ui.closeAllPanels());
});
await step('deep: a ruin puzzle opens to treasure', async () => {
  const r = await page.evaluate(async () => {
    const s = window.__game.scene, d = s.ruins?.debug;
    if (!d) return { err: 'no ruins module' };
    const acts = [];
    const off = (a) => { if (a.type === 'puzzle' || a.type === 'relic') acts.push(a.type); };
    window.__game.state.on('act', off);
    await d.go('R10', 'door', 'door');
    for (let k = 0; k < 60; k++) s.update(1 / 30);
    d.solve('R10');
    for (let k = 0; k < 150; k++) s.update(1 / 30);
    await d.go('R10', 'room', 'chest');
    for (let k = 0; k < 40; k++) s.update(1 / 30);
    d.press('R10', 'chest');
    for (let k = 0; k < 60; k++) s.update(1 / 30);
    return { acts, open: d.list().find((x) => x.id === 'R10')?.open };
  });
  if (r.err) throw new Error(r.err);
  if (!r.open || !r.acts.includes('puzzle')) throw new Error('the ruin did not open: ' + JSON.stringify(r));
  await shot('04d-ruin-treasure');
});
await step('deep: NPC burrows — the trading post and Rocco', async () => {
  const r = await page.evaluate(async () => {
    const s = window.__game.scene, d = s.traders?.debug;
    if (!d) return { err: 'no traders module' };
    const list = d.list();
    d.go('trader', 'counter');
    for (let k = 0; k < 60; k++) s.update(1 / 30);
    const shop = await d.shop('trader', 'buy');
    return { n: list.length, kinds: list.map((b) => b.kind), shop: !!shop };
  });
  if (r.err) throw new Error(r.err);
  if (r.n < 4 || !r.shop) throw new Error('burrows: ' + JSON.stringify(r));
  await wait(2500);
  await shot('04e-trading-post');
  await page.evaluate(() => window.__game.ui.closeAllPanels());
  const rocco = await page.evaluate(async () => {
    const s = window.__game.scene, d = s.traders.debug;
    d.go('raccoon', 'counter');
    for (let k = 0; k < 60; k++) s.update(1 / 30);
    return !!(await d.shop('raccoon', 'weapons'));
  });
  if (!rocco) throw new Error("Rocco's counter did not open");
  await wait(2500);
  await shot('04f-rocco');
  await page.evaluate(() => window.__game.ui.closeAllPanels());
});
await step('deep: Nugget eats, follows, gets carried', async () => {
  const r = await page.evaluate(() => {
    const s = window.__game.scene, n = s.nugget?.debug;
    if (!n) return { err: 'no Nugget in the mine' };
    n.here?.();
    n.feed?.();
    for (let k = 0; k < 60; k++) s.update(1 / 30);
    const fed = n.state?.();
    n.carry?.();
    for (let k = 0; k < 20; k++) s.update(1 / 30);
    const carrying = !!s.nugget.carrying;
    n.put?.();
    for (let k = 0; k < 20; k++) s.update(1 / 30);
    return { fed, carrying, after: !!s.nugget.carrying };
  });
  if (r.err) throw new Error(r.err);
  if (!r.carrying || r.after) throw new Error('carry/put: ' + JSON.stringify(r));
});
await step('skills: activities give XP, a skill gets stamped', async () => {
  const r = await page.evaluate(() => {
    const st = window.__game.state, d = st.skillsDebug;
    if (!d) return { err: 'no skills' };
    d.xp('mining', 5000);
    const pts = st.data.skills?.points ?? null;
    const before = JSON.stringify(st.data.skills?.unlocked || st.data.skills?.nodes || {}).length;
    d.unlockAll?.('mining');
    const after = JSON.stringify(st.data.skills?.unlocked || st.data.skills?.nodes || {}).length;
    return { pts, grew: after > before, power: st.skill('power') };
  });
  if (r.err) throw new Error(r.err);
  if (!r.grew || !(r.power > 1)) throw new Error('skills: ' + JSON.stringify(r));
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
await step("Old Star's cave: talk, his notes and his chest", async () => {
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
await step('the book: quests, skills, index', async () => {
  for (const tab of ['quests', 'skills', 'index']) {
    await page.evaluate((t) => { window.__game.ui.closeAllPanels(); return window.__game.ui.openBook(t); }, tab);
    await wait(1500);
    await shot('13-book-' + tab);
  }
  await page.evaluate(() => window.__game.ui.closeAllPanels());
  const q = await page.evaluate(() => window.__game.quests.debug.list().length);
  if (!(q > 0)) throw new Error('no quests listed');
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
