// Playthrough of the progression spine (docs/DESIGN_PROGRESSION.md), up to and through the first
// gate: the lessons done, the Rootsoil card filled at Old Star's slate, the bronze pick forged,
// iron ore refusing the copper pick and giving to the bronze one, the Clayworks card, the Clay
// Warden down by its lift stop, its heart in the bag. Gathering is stood in for (items are added);
// everything else goes through the game's own paths. Usage: node scripts/progression.mjs [outDir]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome.mjs';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] || 'shots/wave21/progression';
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error', clearScreen: false });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, a) => page.evaluate(fn, a);
const shot = (n) => page.screenshot({ path: `${outDir}/${n}.png`, timeout: 120000 });
const scene = () => ev(() => window.__game?.sceneName);
const go = async (name, params = {}) => {
  await ev(([n, p]) => window.__game.goto(n, p, { transition: 'none' }), [name, params]);
  for (let i = 0; i < 80; i++) { await wait(250); if ((await scene()) === name && !(await ev(() => window.__game.transitioning))) break; }
  await wait(1500);
};
const tracked = () => ev(() => window.__game.quests.tracked()?.id || null);
let failed = 0;
const step = async (label, fn) => {
  const n = errors.length;
  try { await fn(); } catch (e) { errors.push(`[${label}] ${e.message}`); }
  const bad = errors.length > n;
  if (bad) failed++;
  console.log(`${bad ? '✗' : '✓'} ${label}${bad ? '\n   ' + errors.slice(n).join('\n   ') : ''}`);
};
const expect = (ok, msg) => { if (!ok) throw new Error(msg); };
const lookAtSlate = (d = 0.75) => ev((dist) => {
  const s = window.__game.scene, b = s.debug; const yaw = -0.72;
  b.stand(7.28 + Math.sin(yaw) * dist, -3.55 + Math.cos(yaw) * dist); b.aim(7.28, 0.5, -3.55); b.step(3);
}, d);

await page.goto(`http://127.0.0.1:${port}/?fresh=1&scene=home&bag=48`);
for (let i = 0; i < 120; i++) { await wait(500); if ((await scene()) === 'home' && (await ev(() => !!window.__game.scene?.debug && !window.__game.transitioning))) break; }

await step('the lessons end on the slate', async () => {
  await ev(() => {
    const g = window.__game, st = g.state;
    st.data.owned.pick_first = 1; st.equip('pick_first');
    g.scene.debug.lesson('done'); g.quests.debug.complete('lessons');
  });
  await wait(2500);
  expect((await tracked()) === 'way_rootsoil', 'the poster is not on the slate: ' + (await tracked()));
  await lookAtSlate();
  await wait(2500);
  await shot('01-slate-first-card');
});

await step('a Rootsoil trip fills the first card (bronze opens)', async () => {
  const r = await ev(() => {
    const g = window.__game, st = g.state;
    st.addItem('copper_ore', { n: 8, q: 70 }); st.addItem('tin_ore', { n: 3, q: 70 }); st.addItem('coal', { n: 5, q: 70 });
    const a = g.scene.debug.handIn();
    return { a, done: !!st.data.way.done.rootsoil };
  });
  expect(r.a && r.done, 'the card did not fill: ' + JSON.stringify(r));
  await wait(3000);
  expect((await tracked()) === 'way_bronze', 'not on to the bronze pick: ' + (await tracked()));
  await lookAtSlate();
  await wait(2500);
  await shot('02-slate-card-two');
});

await step('the forge board offers the bronze pick, and it is forged', async () => {
  await go('forge', { from: 'home' });
  const r0 = await ev(() => { const sc = window.__game.scene; sc.menus.main(); return sc.menus.nextPick(); });
  expect(r0 === 'pick_copper', 'the forge does not offer the bronze pick: ' + r0);
  await wait(1500);
  await shot('03-forge-pick-card');
  const r = await ev(async () => {
    const g = window.__game, sc = g.scene, st = g.state;
    st.addItem('bronze_ingot', { n: 2, q: 80 }); // (the smelt: 3 copper ore + 1 tin)
    const res = sc.debug.part('pick_copper', {});
    for (let i = 0; i < 200 && !sc.activity?.finished && sc.activity; i++) await new Promise((k) => setTimeout(k, 50));
    return { res, pick: st.equipped('pick')?.id };
  });
  expect(r.pick === 'pick_copper', 'no bronze pick: ' + JSON.stringify(r));
  await wait(2000);
  await shot('04-bronze-pick');
  for (let i = 0; i < 20 && (await tracked()) !== 'way_clayworks'; i++) await wait(250);
  expect((await tracked()) === 'way_clayworks', 'not on to the Clayworks card: ' + (await tracked()));
});

await step('iron ore refuses the copper pick, gives to the bronze one', async () => {
  await go('deep', { from: 'lift', lift: 'L0' });
  const r = await ev(() => {
    const g = window.__game, s = g.scene, w = s.world, pl = s.player, st = g.state, V = 16;
    const area = w.plan.areas.find((a) => a.item === 'iron_ore');
    if (!area) return { err: 'no iron in this world' };
    s.terrain.warm(area.x, area.y, area.z, 2);
    const d = w.depositsNear(area.x, area.y, area.z, 8).find((q) => !w.depState(q).taken && q.item === 'iron_ore');
    if (!d) return { err: 'no iron deposit loaded' };
    const px = d.x + 1.1, py = d.y - 0.6, pz = d.z;
    for (let z = Math.floor((pz - 0.7) * V); z <= Math.ceil((pz + 0.7) * V); z++) for (let y = Math.floor(py * V); y <= Math.ceil((py + 1) * V); y++) for (let x = Math.floor((px - 0.6) * V); x <= Math.ceil((px + 0.6) * V); x++) if (w.voxelAt(x, y, z) < 128) w.setVoxel(x, y, z, 0);
    pl.pos.set(px, py, pz); pl.vel.set(0, 0, 0);
    s.terrain.warm(px, py + 0.5, pz, 2);
    // dig round it the way a player does (rock and ore alike), as in scripts/e2e.mjs
    const offs = [[0, 0, 0], [0, 0.35, 0], [0, 0.3, 0.25], [0, 0.3, -0.25], [0, 0, 0.32], [0, 0, -0.32], [0, -0.3, 0], [0, -0.3, 0.25], [0, -0.3, -0.25], [-0.2, 0.3, 0], [-0.2, -0.3, 0], [-0.2, 0, 0.3], [-0.2, 0, -0.3]];
    const aim = (ox, oy, oz) => { const e = pl.eye(); const dx = d.x + ox - e.x, dy = d.y + oy - e.y, dz = d.z + oz - e.z; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(dy, Math.hypot(dx, dz)); s.updateTarget(); };
    const dig = (n) => { for (let i = 0; i < n && !w.depState(d).taken; i++) { aim(...offs[i % offs.length]); st.data.energy = 100; if (s.target) s.strike(); } };
    st.equip('pick_first');
    dig(70);
    const soft = { taken: !!w.depState(d).taken, brk: w.depState(d).brk || 0, told: !!s.flags.toughSeen };
    st.equip('pick_copper');
    dig(70);
    for (let k = 0; k < 10; k++) s.update(1 / 30);
    return { soft, hard: { taken: !!w.depState(d).taken } };
  });
  expect(!r.err, r.err);
  expect(!r.soft.taken && !r.soft.brk && r.soft.told, 'the copper pick freed iron (or never said why not): ' + JSON.stringify(r));
  expect(r.hard.taken, 'the bronze pick did not free iron: ' + JSON.stringify(r));
  await shot('05-iron-free');
});

await step('the Clayworks card sends you to the warden', async () => {
  await go('home', { from: 'lift' });
  await ev(() => { const st = window.__game.state; st.addItem('iron_ore', { n: 4, q: 70 }); st.addItem('lumite', { n: 2, q: 70 }); st.addItem('amber', { n: 1, q: 70 }); window.__game.scene.debug.handIn(); });
  for (let i = 0; i < 20 && (await tracked()) !== 'gate_clay'; i++) await wait(250);
  expect((await tracked()) === 'gate_clay', 'not on to the warden: ' + (await tracked()));
  await lookAtSlate();
  await wait(2500);
  await shot('06-slate-warden-next');
});

await step('the Clay Warden sleeps by the lift stop and goes down', async () => {
  await go('deep', { from: 'lift', lift: 'L0' });
  const r = await ev(() => {
    const g = window.__game, s = g.scene, pl = s.player, st = g.state;
    const h = s.world.plan.wardens.find((x) => x.id === 'clay');
    const x = h.x - 3, z = h.z - 0.5;
    s.terrain.warm(h.x, h.y + 1, h.z, 3);
    const f = s.enemies.floorAt(x, h.y + 1, z, 0.6, 4, 2);
    pl.pos.set(x, (f?.y ?? h.y) + 0.05, z); pl.vel.set(0, 0, 0);
    for (let k = 0; k < 40; k++) s.update(1 / 30);
    const e = s.wardens.live.clay;
    if (!e) return { err: 'no warden in its hall', hall: h };
    pl.yaw = Math.atan2(-(e.pos.x - pl.pos.x), -(e.pos.z - pl.pos.z)); pl.pitch = -0.1;
    for (let k = 0; k < 20; k++) s.update(1 / 30);
    return { hp: e.hp, kind: e.kind, size: e.size };
  });
  expect(!r.err, JSON.stringify(r));
  await wait(2000);
  await shot('07-clay-warden');
  const k = await ev(() => {
    const g = window.__game, s = g.scene, st = g.state, en = s.enemies, d = en.debug, e = s.wardens.live.clay;
    for (let i = 0; i < 200 && e.alive; i++) { st.data.energy = 100; st.data.injury = 0; e.awake = true; d.look(e); d.hit(e, 6); for (let j = 0; j < 4; j++) s.update(1 / 30); }
    for (let j = 0; j < 120; j++) s.update(1 / 30);
    return { dead: !e.alive, beaten: !!st.data.way.wardens.clay, heart: st.count('clay_heart') };
  });
  expect(k.dead && k.beaten, 'the warden would not go down: ' + JSON.stringify(k));
  expect(k.heart > 0, 'no heart in the bag: ' + JSON.stringify(k));
  await wait(1500);
  await shot('08-warden-down');
  for (let i = 0; i < 20 && (await tracked()) !== 'way_iron'; i++) await wait(250);
  expect((await tracked()) === 'way_iron', 'not on to the iron pick: ' + (await tracked()));
});

await step('the Grotto Warden waits in its hall by the next stop', async () => {
  const r = await ev(() => {
    const g = window.__game, s = g.scene, pl = s.player;
    const h = s.world.plan.wardens.find((x) => x.id === 'grotto');
    s.terrain.warm(h.x, h.y + 1, h.z, 3);
    const f = s.enemies.floorAt(h.x - 4, h.y + 1, h.z - 0.5, 0.6, 4, 2);
    pl.pos.set(h.x - 4, (f?.y ?? h.y) + 0.05, h.z - 0.5); pl.vel.set(0, 0, 0);
    for (let k = 0; k < 40; k++) s.update(1 / 30);
    const e = s.wardens.live.grotto;
    if (e) { pl.yaw = Math.atan2(-(e.pos.x - pl.pos.x), -(e.pos.z - pl.pos.z)); pl.pitch = 0.05; for (let k = 0; k < 10; k++) s.update(1 / 30); }
    return e ? { kind: e.kind, hp: Math.round(e.hp), depth: Math.round(-e.pos.y) } : { err: 'no grotto warden' };
  });
  expect(!r.err, JSON.stringify(r));
  await wait(2000);
  await shot('09-grotto-warden');
});

console.log(errors.length ? `${failed} step(s) failed` : 'no errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
