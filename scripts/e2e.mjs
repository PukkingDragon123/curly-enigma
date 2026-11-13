// End-to-end smoke test: visits every scene, exercises the main transitions and
// reports console errors. Usage: node scripts/e2e.mjs [outDir]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome.mjs';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] || 'shots/e2e';
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error', clearScreen: false });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({
  executablePath: chromePath(),
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
const shot = (n) => page.screenshot({ path: `${outDir}/${n}.png`, timeout: 120000 }); // slow software GL on a busy box
// E2E_UNTIL="part of a step label": stop after that step (a quicker run while fixing one step)
const UNTIL = process.env.E2E_UNTIL || '';
let done = false;
const step = async (label, fn) => {
  if (done) return;
  if (UNTIL && label.includes(UNTIL)) done = true;
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
await step("waking up in Old Star's house", async () => {
  await wait(1500);
  await shot('02b-waking');
  const r = await page.evaluate(() => window.__game.scene.debug.finishWake());
  if (!r || r.waking) throw new Error('still waking: ' + JSON.stringify(r));
  const f = await page.evaluate(() => ['fallen', 'escaped'].map((k) => window.__game.state.flag(k)));
  if (!f[0]) throw new Error('waking flags missing: ' + f);
  if (f[1]) throw new Error('escaped flag set on a new game');
  const q = await page.evaluate(() => window.__game.quests?.active?.().map((x) => x.id || x) || []);
  if (!q.includes('lessons')) throw new Error('the lessons quest did not start: ' + JSON.stringify(q));
  await shot('02c-old-star');
});
await step('the raptor egg from the journey is in its nest by the bedroll', async () => {
  // (the journey wraps it and stows it on his pack; skipped short, it still comes along)
  let r = null;
  for (let i = 0; i < 40 && !(r && r.nest); i++) { await wait(250); r = await page.evaluate(() => ({ egg: window.__game.state.data.egg, nest: window.__game.scene.egg ? { x: window.__game.scene.egg.at.x, z: window.__game.scene.egg.at.z } : null })); }
  if (!r?.egg || !(r.egg.day >= 1)) throw new Error('no egg saved from the journey: ' + JSON.stringify(r));
  if (!r.nest) throw new Error('the egg is not at home: ' + JSON.stringify(r));
  const lbl = await page.evaluate(() => window.__game.scene.rig.items.some((i) => /raptor egg/i.test(String(i.label))));
  if (!lbl) throw new Error('the egg cannot be looked at');
});
await step("Old Star's pickaxe lesson (forge your own pick first)", async () => {
  const st0 = await page.evaluate(() => ({ stage: window.__game.scene.lessonStage(), pick: window.__game.state.equipped('pick')?.id || null }));
  if (st0.stage !== 'pick') throw new Error('the pickaxe lesson is not first: ' + JSON.stringify(st0));
  if (st0.pick) throw new Error('a new game starts with a pick already: ' + st0.pick);
  await go('forge', { from: 'home', tutorial: true, pick: true });
  await wait(3000);
  await shot('02d-pick-lesson');
  const r = await page.evaluate(() => {
    const sc = window.__game.scene;
    sc.lesson?.endCine?.();
    if (sc.activity) sc.endActivity?.();
    const res = sc.debug.part('pick_first', { give: true });
    return { res, stage: sc.lesson?.debug?.stage?.(), lesson: window.__game.state.data.oldstar?.lesson, pick: window.__game.state.equipped('pick')?.id || null };
  });
  if (r.pick !== 'pick_first' || r.lesson !== 'mine') throw new Error('the pickaxe lesson did not give a pick: ' + JSON.stringify(r));
  await shot('02e-pick-made');
  await go('home', { from: 'forge' });
  await wait(1500);
  const ok = await page.evaluate(() => window.__game.scene.debug.run(900, 1 / 30, () => {
    const t = window.__game.ui.tutor;
    if (t?.active?.wait) { t.next(); t.next(); } if (window.__game.ui.isPanelOpen?.()) window.__game.convo?.next?.(); // (the line may be cutscene talk)
    return window.__game.scene.homeTutor?.()?.step === 'follow' || window.__game.scene.homeTutor?.()?.step === 'lift';
  }).then(() => window.__game.scene.homeTutor?.()));
  if (!ok) console.log('   (no follow step after the pick: ' + JSON.stringify(ok) + ')');
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
  if (!(await page.evaluate(() => !!window.__game.scene.firstDig?.debug?.on?.()))) throw new Error('no mining lesson in the mine');
  await page.evaluate(() => { const s = window.__game.scene; for (let k = 0; k < 90; k++) s.update(1 / 30); });
  await shot('03-dig-lesson');
  // his old copper dig is a short walk from the cage: real copper deposits there
  const seams = await page.evaluate(() => { const s = window.__game.scene, L0 = s.world.plan.lifts.find((l) => l.id === 'L0'); return s.world.depositsNear(L0.x, L0.y, L0.z, 12).filter((d) => String(d.id).startsWith('acu0_')).length; });
  if (!seams) throw new Error('no copper near the mine entrance');
  // digging is tested by the deep steps; here the copper's handed over, and E at the cage's bell rides home
  const cu = await page.evaluate(() => window.__game.scene.debug.giveTutorialCopper());
  if (!(cu > 0)) throw new Error('no copper in the pack: ' + cu);
  await page.evaluate(() => window.__game.scene.firstDig.debug.ride());
  for (let i = 0; i < 200 && ((await scene()) !== 'home' || (await page.evaluate(() => window.__game.transitioning))); i++) await wait(250);
  if ((await scene()) !== 'home') throw new Error('did not ride home: ' + (await scene()));
  // Old Star sniffs the copper and sends you to his forge
  const stage = await page.evaluate(() => window.__game.scene.debug.run(600, 1 / 30, () => {
    const t = window.__game.ui.tutor;
    if (t?.active?.wait) { t.next(); t.next(); } if (window.__game.ui.isPanelOpen?.()) window.__game.convo?.next?.(); // (the line may be cutscene talk)
    return window.__game.scene.lessonStage() === 'forge';
  }).then(() => window.__game.scene.lessonStage()));
  if (stage !== 'forge') {
    const why = await page.evaluate(() => { const s = window.__game.scene, st = window.__game.state; return { copper: st.count('copper_ore'), tut: s.homeTutor?.(), cine: !!s.cine, scripted: !!s.scripted, riding: !!s.riding, star: s.debug.star?.(), line: window.__game.ui.tutor?.active?.html?.slice(0, 80) ?? null, panels: window.__game.ui.isPanelOpen?.(), stack: (window.__game.ui.panelStack || []).map((h) => h.el?.className + '|' + (h.el?.textContent || '').slice(0, 60)) }; });
    throw new Error('the forge lesson did not come next: ' + stage + ' ' + JSON.stringify(why));
  }
  if (!(await page.evaluate(() => window.__game.state.flag('prologue')))) throw new Error('mining lesson not marked done');
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
    d.start(window.__game.scene.lesson?.dish || 'glowcap_soup'); // pick his ingredients and Cook!
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
  if (await page.evaluate(() => !!window.__game.scene.firstDig?.debug?.on?.())) throw new Error('the lesson came back after it was done');
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
await step('deep: the radar finds things; no map in the book', async () => {
  const n = await page.evaluate(() => window.__game.scene.radar().markers.length);
  if (!(n >= 2)) throw new Error('radar has no markers');
  // the book has no map chapter any more: asking for it opens the quests
  await page.evaluate(() => window.__game.ui.openBook('map'));
  await wait(2500);
  const b = await page.evaluate(() => ({ chapter: window.__game.ui.book?.chapter ?? null, mapTab: !!document.querySelector('.ib-tab[aria-label=Map]') }));
  await shot('04b-book');
  await page.evaluate(() => window.__game.ui.closeAllPanels());
  if (b.chapter !== 'quests') throw new Error('openBook("map") did not open the quests: ' + JSON.stringify(b));
  if (b.mapTab) throw new Error('the book still has a Map tab');
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
await step('deep: a heavy pack slows you', async () => {
  const r = await page.evaluate(() => {
    const g = window.__game, s = g.scene, st = g.state;
    for (let i = 0; i < 16; i++) st.addItem('iron_ore', { q: 70 });
    for (let k = 0; k < 12; k++) s.update(1 / 30);
    const heavy = { kg: st.bagLoad().kg, speed: s.load?.speed, run: s.load?.run };
    // the backpack opens with the pockets (no other side away from home) and shows the load
    g.ui.openInventory();
    const pack = { scale: !!document.querySelector('.bp-scale'), tabs: [...document.querySelectorAll('.bp-sidetabs .bp-label')].map((b) => b.textContent) };
    g.ui.closeAllPanels();
    // lighten the load again for the steps after this one
    st.removeItem('iron_ore', 16);
    for (let k = 0; k < 12; k++) s.update(1 / 30);
    return { heavy, pack, after: { kg: st.bagLoad().kg, speed: s.load?.speed } };
  });
  if (!(r.heavy.speed < 1) || r.heavy.run) throw new Error('a heavy pack did not slow the mole: ' + JSON.stringify(r.heavy));
  if (!r.pack.scale) throw new Error('the backpack shows no load: ' + JSON.stringify(r.pack));
  if (!(r.after.kg < r.heavy.kg)) throw new Error('the ore did not come out of the pack: ' + JSON.stringify(r));
  await shot('04e-heavy-pack');
});
await step('deep: block a kobold, then fight it', async () => {
  const r = await page.evaluate(() => {
    const s = window.__game.scene, en = s.enemies, d = en?.debug, st = window.__game.state;
    if (!d) return { err: 'no creatures in the mine' };
    // a card or panel left open pauses the mine (and the creatures): note it, close it
    const ui = window.__game.ui, open0 = ui.panelStack.map((p) => p.node?.className || p.kind || '?');
    ui.closeAllPanels();
    const c = en.combat, b0 = c.stats.blocked + c.stats.parried, t0 = en.time;
    // stage a kobold in a roomy cave and hold the guard up; if it wanders off or vanishes, stage again
    let e = null, tries = 0, gone = 0;
    for (; tries < 3 && c.stats.blocked + c.stats.parried === b0; tries++) {
      const staged = d.stage('kobold', { dist: 2.2, awake: true });
      if (!staged?.spawned) continue;
      e = d.get('kobold');
      if (!e) continue;
      st.data.energy = 100;
      d.block(true);
      for (let k = 0; k < 360 && c.stats.blocked + c.stats.parried === b0; k++) {
        if (ui.isPanelOpen()) ui.closeAllPanels();
        if (!e.alive || !en.list.includes(e)) { gone++; break; }
        d.look(e); s.update(1 / 30);
      }
      d.unblock();
    }
    if (!e) return { err: 'no cave for a fight' };
    const dtBlock = +(en.time - t0).toFixed(2);
    const guarded = c.stats.blocked + c.stats.parried - b0;
    const kills0 = st.data.stats?.kills ?? 0;
    let acts = 0;
    const onAct = (a) => { if (a?.type === 'kill') acts++; };
    st.on?.('act', onAct);
    for (let k = 0; k < 40 && e.alive; k++) { st.data.energy = 100; d.look(e); d.hit(e, 4); for (let j = 0; j < 6; j++) s.update(1 / 30); }
    st.off?.('act', onAct);
    for (let k = 0; k < 30; k++) s.update(1 / 30);
    return { guarded, log: c.log.slice(-3), dead: !e.alive, acts, kills: (st.data.stats?.kills ?? 0) - kills0, open0, dtBlock, tries, gone, leaving: !!s.leaving, kobold: d.list().find((x) => x.kind === 'kobold') || null };
  });
  if (r.err) throw new Error(r.err);
  if (!(r.guarded > 0)) throw new Error('no blow was blocked: ' + JSON.stringify({ log: r.log, open0: r.open0, dtBlock: r.dtBlock, tries: r.tries, gone: r.gone, leaving: r.leaving, kobold: r.kobold }));
  if (!r.dead) throw new Error('the kobold would not go down: ' + JSON.stringify(r));
  await shot('04f-fight');
});
await step('deep: tame a lone raptor (calm, feed, name), it follows and fights', async () => {
  // a lone raptor in a dino cavern and a pack of dino steaks; the real keys: C to crouch, E to toss
  const s0 = await page.evaluate(() => {
    const g = window.__game, d = g.debug?.tame;
    if (!d) return { err: 'no raptor taming in the mine' };
    g.ui.closeAllPanels();
    g.state.addItem('dino_meat', { n: 6 });
    const r = d.stage({ dist: 4.2 });
    if (!r?.stray) return { err: 'no dino cavern for the lone raptor' };
    g.scene.enemies.debug.clean(false);
    d.step(20);
    return r;
  });
  if (s0.err) throw new Error(s0.err);
  // crouch and keep still: it settles (a coo), its fear drops
  const calm = await page.evaluate(() => { const d = window.__game.debug.tame; d.crouch(true); for (let i = 0; i < 40 && !d.stray()?.calmed; i++) { d.step(15); d.look('stray'); } return { ...d.info().stray, calmed: !!d.stray()?.calmed }; });
  await shot('04g-tame-calm');
  if (!calm.calmed) throw new Error('the raptor never calmed down: ' + JSON.stringify(calm));
  // feed it: E on it tosses a steak, it comes for it, sniffs, eats; two meals a visit, then it wanders off (and comes back)
  let fedShot = false, offers = 0;
  for (let k = 0; k < 9; k++) {
    const r = await page.evaluate(() => {
      const g = window.__game, d = g.debug.tame, t = g.scene.enemies.tame;
      if (t.naming) return { naming: true };
      if (!d.stray() || d.stray().full() || ['leave', 'full', 'bolt'].includes(d.stray().plan)) d.visit(3.2);
      d.step(30);
      d.look('stray');
      const o = d.offer();
      let eating = false;
      for (let i = 0; i < 240; i++) { d.step(1); const s = d.stray(); if (!s) break; if (s.plan === 'eat' && s.planT > 0.5) { eating = true; break; } }
      return { label: o?.label, eating, trust: d.info().stray?.trust, foods: d.info().foods };
    });
    if (r.naming) break;
    offers++;
    if (r.eating && !fedShot) { fedShot = true; await page.evaluate(() => { const d = window.__game.debug.tame; d.look('stray'); window.__game.scene.player.pitch -= 0.25; }); await shot('04h-tame-feed'); }
    await page.evaluate(() => { const d = window.__game.debug.tame, t = window.__game.scene.enemies.tame; d.step(240, 1 / 30, () => !!t.naming || !d.stray() || (d.stray().plan !== 'eat' && d.stray().plan !== 'food' && d.stray().plan !== 'sniffFood' && d.stray().plan !== 'ate')); });
  }
  const meals = await page.evaluate(() => window.__game.state.data.tame?.stray?.meals ?? null);
  if (!fedShot) throw new Error('it never ate: ' + JSON.stringify(await page.evaluate(() => window.__game.debug.tame.info())));
  // full trust: a moment of happy hopping, then the naming talk (the game's own cutscene talk)
  for (let i = 0; i < 80 && !(await page.evaluate(() => !!window.__game.convo?.cur)); i++) await page.evaluate(() => window.__game.debug.tame.step(3));
  if (!(await page.evaluate(() => !!window.__game.convo?.cur))) throw new Error('no naming moment after ' + offers + ' meals: ' + JSON.stringify(await page.evaluate(() => window.__game.debug.tame.info())));
  await page.evaluate(() => { window.__game.convo.debug?.settle?.(); window.__game.debug.tame.step(10); });
  await wait(1500);
  await shot('04i-tame-bond');
  let named = null;
  for (let i = 0; i < 10; i++) {
    const c = await page.evaluate(() => { const cv = window.__game.convo; return cv?.cur ? { choices: cv.cur.choices?.map((x) => x.label) || null } : null; });
    if (!c) break;
    if (c.choices) { await page.evaluate(() => { window.__game.convo.debug?.settle?.(); window.__game.debug.tame.step(4); }); await wait(900); await shot('04j-tame-name'); named = c.choices[0]; }
    await page.evaluate(() => window.__game.debug.tame.name(0));
    await wait(600);
  }
  const bonded = await page.evaluate(() => { const g = window.__game, d = g.debug.tame; d.step(20); d.crouch(false); g.ui.closeAllPanels(); return d.info(); });
  if (bonded.data?.raptors?.length !== 1 || !bonded.pal) throw new Error('not bonded: ' + JSON.stringify(bonded));
  if (named && bonded.pal.name !== named) throw new Error(`named ${named} but it is ${bonded.pal.name}`);
  // it follows: walk off (the real W key) and it keeps up, beside and behind you, out of your swing
  const fol = await page.evaluate(() => {
    const g = window.__game, d = g.debug.tame, pl = g.scene.player, p0 = pl.pos.clone();
    g.input.down.add('KeyW'); d.step(80); pl.yaw += 0.8; d.step(40); g.input.down.delete('KeyW'); d.step(50);
    const f = { x: -Math.sin(pl.yaw), z: -Math.cos(pl.yaw) }, p = d.pal();
    const dx = p.pos.x - pl.pos.x, dz = p.pos.z - pl.pos.z, l = Math.hypot(dx, dz) || 1;
    return { walked: +p0.distanceTo(pl.pos).toFixed(2), dist: +l.toFixed(2), inFront: +((dx * f.x + dz * f.z) / l).toFixed(2), pal: d.info().pal };
  });
  if (!(fol.dist < 4.5)) throw new Error('it did not follow: ' + JSON.stringify(fol));
  await page.evaluate(() => { const d = window.__game.debug.tame; d.look('pal'); window.__game.scene.player.pitch -= 0.1; d.step(1); });
  await shot('04k-tame-follow');
  // a kobold comes for you: the raptor goes for it (bites count as yours), and never for you
  const fight = await page.evaluate(() => {
    const g = window.__game, d = g.debug.tame, en = g.scene.enemies, st = g.state;
    if (!d.fight('kobold', 2.8)) return { err: 'no kobold' };
    const e = en.list.find((x) => x.alive && x.kind === 'kobold');
    const b0 = d.pal().stats.bites, hp0 = e.hp;
    let shotAt = null;
    for (let i = 0; i < 420 && d.pal().stats.bites === b0; i++) { st.data.energy = 100; d.step(1); }
    return { bites: d.pal().stats.bites - b0, kobold: { alive: e.alive, hp: +e.hp.toFixed(2), hp0: +hp0.toFixed(2) }, pal: d.info().pal, shotAt };
  });
  if (fight.err) throw new Error(fight.err);
  if (!(fight.bites > 0)) throw new Error('the raptor never bit the kobold: ' + JSON.stringify(fight));
  await page.evaluate(() => { const g = window.__game, en = g.scene.enemies, d = g.debug.tame, e = en.list.find((x) => x.alive && x.kind === 'kobold'); d.step(4); if (e) d.look(e); g.scene.player.pitch -= 0.15; d.step(1); });
  await shot('04l-tame-fight');
  const after = await page.evaluate(() => {
    const g = window.__game, en = g.scene.enemies, d = g.debug.tame, st = g.state;
    const e = en.list.find((x) => x.alive && x.kind === 'kobold');
    for (let k = 0; k < 40 && e?.alive; k++) { st.data.energy = 100; en.debug.look(e); en.debug.hit(e, 4); d.step(6); }
    d.step(40);
    // E on it: it sits and waits; E again: it comes along
    const a = d.offer('pal'), s1 = d.pal().staying; d.step(10);
    const b = d.offer('pal'), s2 = d.pal().staying;
    return { dead: !e?.alive, a: a?.label, s1, b: b?.label, s2, pal: d.info().pal };
  });
  if (!after.dead) throw new Error('the kobold would not go down: ' + JSON.stringify(after));
  if (!after.s1 || after.s2) throw new Error('stay / come did not toggle: ' + JSON.stringify(after));
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
await step('home: your raptor waits in the cave', async () => {
  const r = await page.evaluate(async () => {
    const s = window.__game.scene;
    for (let i = 0; i < 50 && !s.raptors; i++) await new Promise((res) => setTimeout(res, 100));
    if (!s.raptors) return { n: 0 };
    const R = s.raptors.list[0], p = R.root.position;
    // stand a step off it, toward the middle of the hollow, and look at it
    const dx = 5.4 - p.x, dz = -2.4 - p.z, l = Math.hypot(dx, dz) || 1;
    s.debug.stand(p.x + dx / l * 1.05, p.z + dz / l * 1.05);
    s.debug.aim(p.x, 0.3, p.z);
    s.debug.step(20);
    const target = s.debug.target;
    const pet = s.debug.interact('Pet ');
    s.debug.step(12);
    return { n: s.raptors.list.length, target, pet, name: R.rec.name };
  });
  if (!r.n) throw new Error('no raptor waiting at home');
  if (!r.pet) throw new Error('could not pet it: ' + JSON.stringify(r));
  await shot('12b-home-raptor');
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
