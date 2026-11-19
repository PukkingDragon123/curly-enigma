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
const t0 = Date.now();
const openMs = await page.evaluate(() => { const t = performance.now(); __game.ui.openInventory(); return performance.now() - t; });
console.log('open ms', openMs.toFixed(0));
await settle(30000);
await page.screenshot({ path: out('backpack') });
console.log(JSON.stringify(await page.evaluate(async () => { const out = []; for (const img of document.querySelectorAll('.bp-hot img, .bp-equip img')) { let px = null; try { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0, s = [0,0,0]; for (let i = 0; i < d.length; i += 4) if (d[i+3] > 200) { n++; s[0]+=d[i]; s[1]+=d[i+1]; s[2]+=d[i+2]; } px = [n, s.map((v) => Math.round(v / Math.max(1, n)))]; } catch (e) { px = String(e); } out.push([img.dataset.vox, img.src.slice(0, 40), img.naturalWidth, img.complete, px]); } return out; })));
// hover a pocket (it sways; the tooltip shows its picture)
const r = await page.evaluate(() => { const b = document.querySelector('.bp-pack .inv-slot[data-i="12"]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, b.width]; });
await page.mouse.move(r[0] - 30, r[1] - 30);
await page.waitForTimeout(200);
await page.mouse.move(r[0], r[1], { steps: 4 });
await page.waitForTimeout(1600);
console.log('tip', await page.evaluate(() => { const t = document.querySelector('.inv-tip'); return t ? [t.hidden, JSON.stringify(t.getBoundingClientRect()), t.textContent] : 'none'; }));
await page.screenshot({ path: out('hover') });
// a drag in progress
await page.mouse.down();
for (let k = 1; k <= 8; k++) { await page.mouse.move(r[0] + k * 22, r[1] - k * 9); await page.waitForTimeout(60); }
await page.waitForTimeout(900);
await page.screenshot({ path: out('drag') });
await page.mouse.move(r[0] + 200, r[1] - 70);
await page.mouse.up();
await page.waitForTimeout(500);
await page.evaluate(() => __game.ui.closeAllPanels());
await page.waitForTimeout(2500);
await page.screenshot({ path: out('hotbar') });
console.log(JSON.stringify(await page.evaluate(() => import('/src/ui/itemVox.js').then((m) => m.itemVox.stats()))));
await browser.close(); await server.close(); process.exit(0);
