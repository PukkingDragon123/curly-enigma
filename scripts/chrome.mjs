// Finds a Chromium for the test/screenshot scripts: $CHROME if set, else the first that exists of
// the old pinned path, Playwright's own chromium for this playwright-core, and any
// /opt/pw-browsers (or $PLAYWRIGHT_BROWSERS_PATH) chromium-*. Returns undefined when none is
// found, so chromium.launch() falls back to its own lookup.
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const cands = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
  try { cands.push(chromium.executablePath()); } catch { /* no bundled browser registered */ }
  for (const root of [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(Boolean)) {
    cands.push(join(root, 'chromium'));
    let dirs = [];
    try { dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => parseInt(b.slice(9), 10) - parseInt(a.slice(9), 10)); } catch { /* missing */ }
    for (const d of dirs) for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) cands.push(join(root, d, sub));
  }
  return cands.find((p) => p && existsSync(p));
}
