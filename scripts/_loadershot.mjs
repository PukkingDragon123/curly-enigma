// temp: shoot the loader (3D and 2D) frames
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome.mjs';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'shots/wave21/feel';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text()); });
await page.goto(`http://127.0.0.1:${port}/src/ui/oreLoader.js`).catch(() => {});
await page.setContent('<html><body style="margin:0;background:#1e1424"></body></html>');
await page.addScriptTag({ type: 'module', content: `
  import * as M from 'http://127.0.0.1:${port}/src/ui/oreLoader3d.js';
  window.__M = M;` });
await page.waitForFunction(() => window.__M, null, { timeout: 60000 });
if (process.env.FR) await page.evaluate(([f, sc]) => { window.__FR = f; window.__SC = sc; }, [JSON.parse(process.env.FR), +(process.env.SC || 2)]);
for (const mode of ['3d']) {
  const r = await page.evaluate(() => {
    const { Bake3D, G3 } = window.__M;
    const b = new Bake3D();
    const cv = document.createElement('canvas');
    const fr = window.__FR || [8, 10];
    cv.width = G3.W * fr.length; cv.height = G3.H * 2;
    cv.style.cssText = 'image-rendering:pixelated;width:' + cv.width * (window.__SC||2) + 'px';
    const ctx = cv.getContext('2d');
    fr.forEach((f, i) => { b.frame(ctx, 0, f, i * G3.W, 0); b.frame(ctx, 7, f, i * G3.W, G3.H); });
    document.body.appendChild(cv);
    return 'ok';
  });
  console.log(r);
  await page.screenshot({ path: `${out}/loader3d.png` });
}
await browser.close(); await server.close();
