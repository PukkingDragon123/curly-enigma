import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { resolve as pathResolve, dirname } from 'node:path';
const [prefix, size] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const out = (n) => `shots/wave19/inv/${prefix}-${n}-${W}.png`;
const server = await createServer({ plugins: [{ name: "stub-missing", enforce: "pre",
  resolveId(id, imp) { if (!imp || !id.startsWith('.') || imp.startsWith('\0')) return; const f = pathResolve(dirname(imp.split('?')[0]), id.split('?')[0]); if (!existsSync(f)) return '\0stub:' + id + '|' + imp.split('?')[0]; },
  load(id) { if (!id.startsWith('\0stub:')) return; const [spec, imp] = id.slice(6).split('|'); const src = readFileSync(imp, 'utf8'); const names = new Set(); for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) if (m[2] === spec) m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach((n) => names.add(n));
    return 'const any = new Proxy(function () { return any; }, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : any), apply: () => any, construct: () => any });\n' + [...names].map((n) => `export const ${n} = any;`).join('\n') + '\nexport default any;'; } }], server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error', clearScreen: false });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 200)); });
await page.goto(`http://127.0.0.1:${port}/?scene=home&fresh=1`);
await page.waitForFunction("window.__game && window.__game.sceneName === 'home' && window.__game.scene && !window.__game.loading", null, { timeout: 120000 });
await page.addStyleTag({ content: 'vite-error-overlay{display:none!important}' });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const st = __game.state;
  const ids = ['glowcap', 'gloomshroom', 'cave_carrot', 'copper_ore', 'iron_ore', 'amethyst', 'ruby', 'copper_ingot', 'gold_ingot', 'mushroom_stew', 'egg', 'honey', 'bp_dagger', 'crystal_lily', 'pepperroot', 'coal', 'quartz', 'truffle', 'worm', 'spider_silk', 'stick', 'dynamite', 'blk_planks', 'chair_wood', 'cave_berry', 'fried_fish', 'tea_flask'];
  for (const id of ids) for (let i = 0; i < 3; i++) st.addItem(id, { q: 80 });
  st.addWeapon?.({ type: 'shortsword', metal: 'iron', matQ: 80, score: 70 });
});
const settle = async (ms) => { const t = Date.now(); while (Date.now() - t < ms) { const q = await page.evaluate(() => import('/src/ui/itemVox.js').then((m) => m.itemVox.stats().queued)); if (!q) break; await page.waitForTimeout(500); } await page.waitForTimeout(800); };
await settle(25000);
await page.screenshot({ path: out('hotbar') });
const t0 = Date.now();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 300 }); await cdp.send('Profiler.start');
const openMs = await page.evaluate(() => { const t = performance.now(); __game.ui.openInventory(); return performance.now() - t; });
const { profile } = await cdp.send('Profiler.stop');
{ const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const tot = new Map();
  profile.samples.forEach((id, i) => { const d = profile.timeDeltas[i] || 0; const seen = new Set(); for (let x = id; x; x = parent.get(x)) { const n = byId.get(x); const k = n.callFrame.functionName + ' ' + n.callFrame.url.split('/').slice(-2).join('/') + ':' + n.callFrame.lineNumber; if (seen.has(k)) continue; seen.add(k); tot.set(k, (tot.get(k) || 0) + d); } });
  console.log([...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => (v / 1000).toFixed(0) + 'ms ' + k).join('\n')); }
console.log('open ms', openMs.toFixed(0));
await browser.close(); await server.close(); process.exit(0);
await settle(30000);
await page.screenshot({ path: out('backpack') });
// hover a pocket (it sways; the tooltip shows its picture)
const r = await page.evaluate(() => { const b = document.querySelector('.bp-pack .inv-slot[data-i="12"]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, b.width]; });
await page.mouse.move(r[0], r[1]);
await page.waitForTimeout(1600);
await page.screenshot({ path: out('hover') });
// a drag in progress
await page.mouse.down();
for (let k = 1; k <= 8; k++) { await page.mouse.move(r[0] + k * 22, r[1] - k * 9); await page.waitForTimeout(60); }
await page.waitForTimeout(900);
await page.screenshot({ path: out('drag') });
await page.mouse.move(r[0] + 200, r[1] - 70);
await page.mouse.up();
console.log(JSON.stringify(await page.evaluate(() => import('/src/ui/itemVox.js').then((m) => m.itemVox.stats()))));
await browser.close(); await server.close(); process.exit(0);
