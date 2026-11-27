import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { chromePath } from './chrome.mjs';
const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/src/ui/oreLoader.js?loader3d=0`).catch(() => {});
await page.evaluate(() => { history.replaceState(null, '', '/?loader3d=0'); document.documentElement.innerHTML = '<body style="margin:0;background:#1e1424"></body>'; });
await page.addScriptTag({ type: 'module', content: `import { oreLoader } from 'http://127.0.0.1:${port}/src/ui/oreLoader.js'; window.L = oreLoader(document.body, { mode: 'full' });` });
await page.waitForTimeout(1500);
for (const t of [0, 200, 400, 600]) { await page.waitForTimeout(t ? 170 : 0); await page.screenshot({ path: `shots/wave21/feel/loader2d-${t}.png` }); }
await browser.close(); await server.close();
