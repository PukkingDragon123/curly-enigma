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
await page.goto(`http://127.0.0.1:${port}/?scene=none`);
await page.waitForTimeout(2500);
await page.addStyleTag({ content: 'vite-error-overlay{display:none!important}' });
const ids = ['glowcap','gloomshroom','mushroom','cave_carrot','pepperroot','crystal_lily','emberbloom','bubblebulb','cave_berry','truffle','stone_thyme','whisperweed',
  'copper_ore','iron_ore','gold_ore','silver_ore','coal','fossil','amethyst','quartz','lumite','ruby','emerald','diamond',
  'copper_ingot','iron_ingot','gold_ingot','steel_ingot','pick_rusty','pick_steel','chisel_basic','brush_basic','drill_steam','axe_iron','spade_copper','shears',
  'mushroom_stew','fried_fish','berry_jam','herb_bread','tea_flask','hearty_pie','egg','honey','flour','butter','rootbeer','drake_meat',
  'worm','glow_beetle','blind_fish','frost_shrimp','spider_silk','troll_tusk','ember_scale','slime_gel','ptero_feather','kobold_trinket','beast_hide','wisp_essence',
  'bp_dagger','dynamite','glow_stake','blk_planks','blk_torch','chair_wood','barrel','helmet_basic','bag_large','grip_boots','relic_idol','relic_crown',
  'stick','clay_lump','vine_cut','sand_pile','star_coin','brass_weights','floor_plank','relic_orb','w.shortsword.iron.','w.axe.bronze.','w.longsword.steel.magmaite','exit_ticket'];
await page.evaluate(async ([ids, W, H, PX]) => {
  const { renderFrame } = await import('/src/ui/itemRender.js');
  const { PACK_ART } = await import('/src/ui/packArt.js');
  const well = await new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = PACK_ART.well('pocket', false); });
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:999999;image-rendering:pixelated';
  document.body.append(cv);
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#c2ac80'; g.fillRect(0, 0, W, H);
  const S = 36 * PX, gap = 2 * PX, cols = Math.floor((W - gap) / (S + gap)), rows = Math.floor((H - gap) / (S + gap));
  const ox = Math.floor((W - cols * (S + gap) + gap) / 2), oy = Math.floor((H - rows * (S + gap) + gap) / 2);
  const R = 32, K = PX; // one sprite pixel = one UI art pixel
  const nine = (x, y) => { const s = 6, w = well.width / (well.naturalWidth / 18) ; const sw = 18, sl = 6, d = sl * PX; const src = [[0, sl], [sl, sw - 2 * sl], [sw - sl, sl]], dst = [[0, d], [d, S - 2 * d], [S - d, d]];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) g.drawImage(well, src[i][0], src[j][0], src[i][1], src[j][1], x + dst[i][0], y + dst[j][0], dst[i][1], dst[j][1]); };
  let n = 0;
  for (const id of ids) {
    if (n >= cols * rows) break;
    const x = ox + (n % cols) * (S + gap), y = oy + Math.floor(n / cols) * (S + gap);
    nine(x, y);
    const f = renderFrame(id, R, 'still', 0);
    if (f) { const c = document.createElement('canvas'); c.width = c.height = R; c.getContext('2d').putImageData(f.img, 0, 0); g.drawImage(c, x + (S - R * K) / 2, y + (S - R * K) / 2, R * K, R * K); }
    n++;
  }
}, [ids, W, H, W >= 1900 ? 4 : 3]);
await page.waitForTimeout(500);
await page.screenshot({ path: out('itemsheet') });
await browser.close(); await server.close(); process.exit(0);
