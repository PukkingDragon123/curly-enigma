// Dev helper: boots the game in headless Chromium and takes screenshots.
//
//   node scripts/shot.mjs "<query>" out.png [--wait 2500] [--size 1280x720] [--steps steps.json] [--touch] [--dpr 2]
//   --touch emulates a phone (touch events, coarse pointer, devicePixelRatio 2 unless --dpr is given).
//
// <query> is the URL query string, e.g. "scene=mine&zone=2&fresh=1".
// steps.json is an array of actions run after the initial wait:
//   {"wait": 500} | {"key": "KeyD", "hold": 400} | {"press": "KeyE"} | {"click": [x, y], "button": "left", "hold": 0}
//   {"move": [x, y]} | {"down": [x, y]} | {"up": true} | {"keydown": "KeyD"} | {"keyup": "KeyD"} | {"shot": "file.png"} | {"eval": "window.__game.state.addGold(100)"} | {"type": "motherlode"}
//   {"waitFor": "window.__game.sceneName === 'town'", "timeout": 30000}
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const query = args[0] || '';
const out = args[1] || 'shots/shot.png';
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const wait = parseInt(opt('wait', '2500'), 10);
const [w, h] = opt('size', '1280x720').split('x').map((n) => parseInt(n, 10));
const stepsFile = opt('steps', null);
const steps = stepsFile ? JSON.parse(readFileSync(stepsFile, 'utf8')) : [];

const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error', clearScreen: false });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const touch = args.includes('--touch');
const dpr = parseFloat(opt('dpr', touch ? '2' : '1'));
const page = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: dpr })).newPage();
const errors = [];
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || m.type() === 'warning') { console.log(`[${m.type()}]`, t); if (m.type() === 'error') errors.push(t); }
  else if (process.env.VERBOSE) console.log('[log]', t);
});
page.on('pageerror', (e) => { console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(1, 4).join(' | ')); errors.push(e.message); });
await page.goto(`http://127.0.0.1:${port}/?${query}`);
await page.waitForTimeout(wait);
for (const s of steps) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.waitFor) await page.waitForFunction(s.waitFor, null, { timeout: s.timeout || 60000, polling: 100 }).catch(() => console.log('[waitFor timeout]', s.waitFor));
  if (s.move) await page.mouse.move(s.move[0], s.move[1]);
  if (s.down) { await page.mouse.move(s.down[0], s.down[1]); await page.mouse.down({ button: s.button || 'left' }); }
  if (s.up) await page.mouse.up({ button: s.button || 'left' });
  if (s.keydown) await page.keyboard.down(s.keydown);
  if (s.keyup) await page.keyboard.up(s.keyup);
  if (s.click) {
    await page.mouse.move(s.click[0], s.click[1]);
    await page.mouse.down({ button: s.button || 'left' });
    if (s.hold) await page.waitForTimeout(s.hold);
    await page.mouse.up({ button: s.button || 'left' });
  }
  if (s.key) {
    await page.keyboard.down(s.key);
    await page.waitForTimeout(s.hold || 100);
    await page.keyboard.up(s.key);
  }
  if (s.press) await page.keyboard.press(s.press);
  if (s.type) await page.keyboard.type(s.type, { delay: 20 });
  if (s.eval) {
    const r = await page.evaluate(s.eval);
    if (r !== undefined) console.log('[eval]', typeof r === 'string' ? r : JSON.stringify(r));
  }
  if (s.shot) await page.screenshot({ path: s.shot });
}
await page.screenshot({ path: out });
console.log('saved', out, errors.length ? `(${errors.length} errors)` : '');
await browser.close();
await server.close();
process.exit(0);
