// Shots of the story and daily life (wave 21, src/core/daily.js): the morning letter by the bedroll
// and opened, Old Star's chapter after the first card, a chat with Hollis, the gift tray, hearts,
// a heart event, the notice board's day notes. Usage: node scripts/story.mjs [outDir]
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome.mjs';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] || 'shots/wave21/story';
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
  for (let i = 0; i < 120; i++) { await wait(250); if ((await scene()) === name && !(await ev(() => window.__game.transitioning))) break; }
  await wait(2000);
};
const step = async (label, fn) => {
  const n = errors.length;
  try { await fn(); } catch (e) { errors.push(`[${label}] ${e.message}`); }
  console.log(`${errors.length > n ? '✗' : '✓'} ${label}${errors.length > n ? '\n   ' + errors.slice(n).join('\n   ') : ''}`);
};
const expect = (ok, msg) => { if (!ok) throw new Error(msg); };
const endTalk = async () => { await ev(() => { const c = window.__game.convo; for (let i = 0; i < 8 && c.active; i++) c.next(); c.end?.(); window.__game.ui.closeAllPanels(); }); await wait(900); };

await page.goto(`http://127.0.0.1:${port}/?fresh=1&scene=home`);
for (let i = 0; i < 160; i++) { await wait(500); if ((await scene()) === 'home' && (await ev(() => !!window.__game.scene?.debug && !window.__game.transitioning))) break; }

await step('a letter under the door in the morning', async () => {
  await ev(() => {
    const g = window.__game, st = g.state;
    st.data.owned.pick_first = 1; st.equip('pick_first');
    g.scene.debug.lesson('done'); g.quests.debug.complete('lessons');
    st.flag('escaped', true);
    st.data.way.done.rootsoil = 1;
    g.sleep(); g.scene.placePost();
  });
  await wait(1500);
  const o = await ev(() => { const s = window.__game.scene, p = s.letterObj.position, b = s.debug; b.star('fire'); b.stand(p.x + (5 - p.x) * 0.5, p.z + (-2.5 - p.z) * 0.5); b.aim(p.x, p.y, p.z); b.step(4); return { mail: window.__game.daily.mail?.from, vis: s.letterObj.visible }; });
  expect(o.mail && o.vis, 'no letter: ' + JSON.stringify(o));
  await wait(1500);
  await shot('01-letter-under-the-door');
});

await step('reading it', async () => {
  await ev(() => window.__game.scene.readPost());
  await wait(2200);
  expect(await ev(() => !!document.querySelector('.lt-sheet')), 'no letter sheet');
  await shot('02-the-letter');
  await ev(() => window.__game.ui.closeAllPanels());
  await wait(600);
});

await step("Old Star's chapter after the first card", async () => {
  let r = await ev(() => window.__game.scene.debug.talk());
  for (let i = 0; i < 3 && r !== 'story'; i++) { await wait(1200); await endTalk(); r = await ev(() => window.__game.scene.debug.talk()); } // (he hands over a poster first)
  expect(r === 'story', 'no chapter: ' + r);
  await wait(2600);
  await shot('03-old-star-chapter');
  await endTalk();
  expect(await ev(() => window.__game.lore.has('st_root')), 'the chapter is not in the book');
});

let WHO = 'Old Hollis', WID = 'hollis';
await step('town: first chat of the day', async () => {
  await go('town');
  // somebody from the cast with no quest business today (their tales already heard)
  [WHO, WID] = await ev(async () => {
    const g = window.__game, Q = g.quests, { VILLAGERS } = await import('/src/data/villagers.js');
    for (const id of ['lark', 'nubs', 'mabel', 'tuck', 'hollis']) {
      for (const t of VILLAGERS[id].tales || []) g.lore.add(t, { quiet: true });
      if (!Q.offers(id).length && !Q.stepsFor(id).length) return [VILLAGERS[id].name, id];
    }
    return ['Old Hollis', 'hollis'];
  });
  const line = await ev((n) => window.__game.scene.debug.talkTo(n), WHO);
  expect(line, 'no line');
  await wait(2600);
  await shot('04-first-chat');
  await endTalk();
});

await step('town: a gift', async () => {
  await ev(() => { const g = window.__game; g.state.addItem('crystal_tea', { n: 2 }); g.state.addItem('quartz', { n: 3, q: 80 }); g.state.addItem('bat_guano', { n: 1 }); });
  await ev((n) => window.__game.scene.debug.talkTo(n), WHO);
  await wait(2400);
  await ev(() => window.__game.convo.pick(0));
  await wait(1800);
  expect(await ev(() => !!document.querySelector('.lt-tray')), 'no gift tray');
  await shot('05-gift-tray');
  await ev(() => [...document.querySelectorAll('.lt-tag')].find((b) => /Quartz/i.test(b.getAttribute('aria-label')))?.click());
  await wait(2600);
  await shot('06-loved-it');
  const pts = await ev((id) => window.__game.daily.points(id), WID);
  expect(pts > 20, 'the gift counted for nothing: ' + pts);
  await endTalk();
});

await step('town: a heart event (two hearts)', async () => {
  await ev((id) => { const D = window.__game.daily; D.d.f[id] = 230; }, WID);
  const l = await ev((n) => window.__game.scene.debug.talkTo(n), WHO);
  expect(await ev((id) => !!window.__game.daily.d.ev[id + ':0'], WID), 'no heart event: ' + l);
  await wait(3000);
  await shot('07-heart-event');
  await endTalk();
});

await step("town: the notice board's day notes", async () => {
  await ev(() => window.__game.scene.townQuests.notices());
  await wait(1800);
  const t = await ev(() => document.querySelector('.nb')?.textContent || '');
  expect(/HEARD/.test(t) && /TODAY/.test(t), 'no day notes');
  await shot('08-notice-board');
});

console.log(errors.length ? `${errors.length} errors` : 'no errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
