// The solid interface on screen (wave 9): open panels, HUD widgets (purse, pack, tracker, radar,
// belt...), the forge's page, thermometer and buttons, the touch buttons. Floating words (the
// boxless text of src/ui/floatType.js, the talk's lines in Convo.js, the voxel words of
// src/gfx/text3d.js) keep out of it: they slide into free space (or wrap narrower, or shrink) so a
// whole word is always seen instead of being covered or cut off by a panel.
//   solidRects()              → [{ l, t, r, b, el }] page CSS px (read at most ~8 times a second)
//   clearOf(rect, o)          → { dx, dy, ok, w? }  the smallest move that takes rect ({ l, t, r, b })
//        clear of them and inside the screen; ok false: no room at this size (w: the widest free span
//        on its row, to wrap or shrink into). o: { pad, margin, bounds, prefer: 'x' | 'y', rects,
//        skip (an element: solids containing it don't count) }
//   keepClear(node, o)        keeps a floating node clear, re-checked a few times a second while it's
//        on the page (it slides there: the `translate` property); o.wrap: may wrap narrower. → stop()
// Anything else can count as solid with a `data-solid` attribute.
const SOLID = [
  '.modal-back > *', '#ui > .panel:not(.ob-layer)', '.hud > .panel',
  '.hud-tl', '.hud-tr', '.qt', '.belt-strap', '.radar', '.depth', '.cal', '.fb-strip', '.hint-keys',
  '.fg-side', '.fg-thermo', '.fg-actions', '.fg-cert', '.fg-ruler', '.fg-layer > .panel',
  '.tc-stick', '.tc-btn', '.tc-dig', '.tc-pad > *', '.tc-deep > *',
  '[data-solid]',
].join(',');

let cache = null, cacheT = 0;
const shown = (e) => {
  if (e.checkVisibility) return e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true });
  const cs = getComputedStyle(e);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
};

/** The solid interface's rects now (cached for a few frames). */
export function solidRects(force = false) {
  const now = performance.now();
  if (!force && cache && now - cacheT < 120) return cache;
  const W = innerWidth, H = innerHeight, out = [];
  for (const e of document.querySelectorAll(SOLID)) {
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H) continue;
    if (r.width * r.height > W * H * 0.6) continue; // (a layer over everything, not a widget)
    if (!shown(e)) continue;
    out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom, el: e });
  }
  cache = out;
  cacheT = now;
  return out;
}

const hitsOf = (R, obs) => obs.filter((q) => R.l < q.r && R.r > q.l && R.t < q.b && R.b > q.t);

/** The smallest move taking rect clear of the solid interface and inside the screen (see above). */
export function clearOf(rect, o = {}) {
  const pad = o.pad ?? 6, m = o.margin ?? 6, W = innerWidth, H = innerHeight;
  const B = o.bounds || { l: m, t: m, r: W - m, b: H - m };
  let obs = (o.rects || solidRects());
  if (o.skip) obs = obs.filter((q) => !q.el?.contains?.(o.skip));
  obs = obs.map((q) => ({ l: q.l - pad, t: q.t - pad, r: q.r + pad, b: q.b + pad }));
  const w = rect.r - rect.l, h = rect.b - rect.t;
  // (moves that keep it on screen; a rect bigger than the screen stays centred on that axis)
  const cx = (dx) => (w > B.r - B.l ? (B.l + B.r) / 2 - (rect.l + rect.r) / 2 : Math.min(B.r - rect.r, Math.max(B.l - rect.l, dx)));
  const cy = (dy) => (h > B.b - B.t ? (B.t + B.b) / 2 - (rect.t + rect.b) / 2 : Math.min(B.b - rect.b, Math.max(B.t - rect.t, dy)));
  const kx = o.prefer === 'y' ? 1.8 : 1, ky = o.prefer === 'x' ? 1.8 : 1;
  const cost = (dx, dy) => Math.hypot(dx * kx, dy * ky);
  let best = null;
  const seen = new Set();
  let front = [[cx(0), cy(0)]];
  for (let depth = 0; depth < 5 && front.length; depth++) {
    const next = [];
    for (const [dx, dy] of front) {
      const key = Math.round(dx) + ',' + Math.round(dy);
      if (seen.has(key)) continue;
      seen.add(key);
      const c = cost(dx, dy);
      if (best && c >= best.c) continue;
      const R = { l: rect.l + dx, t: rect.t + dy, r: rect.r + dx, b: rect.b + dy };
      const hs = hitsOf(R, obs);
      if (!hs.length) { best = { dx, dy, c }; continue; }
      for (const q of hs) {
        next.push([cx(dx + q.l - R.r), cy(dy)], [cx(dx + q.r - R.l), cy(dy)], [cx(dx), cy(dy + q.t - R.b)], [cx(dx), cy(dy + q.b - R.t)]);
      }
    }
    front = next;
    if (seen.size > 600) break;
  }
  if (best) return { dx: best.dx, dy: best.dy, ok: true };
  // no room at this size: the widest free span on its row (to wrap or shrink into)
  const band = obs.filter((q) => q.t < rect.b && q.b > rect.t).sort((a, b) => a.l - b.l);
  let x = B.l, span = { l: B.l, r: B.l };
  for (const q of band) { if (q.l - x > span.r - span.l) span = { l: x, r: q.l }; x = Math.max(x, q.r); }
  if (B.r - x > span.r - span.l) span = { l: x, r: B.r };
  return { dx: cx((span.l + span.r) / 2 - (rect.l + rect.r) / 2), dy: 0, ok: false, w: Math.max(0, span.r - span.l) };
}

// ------------------------------------------------------------------ DOM nodes
const watched = new Map();
let timer = 0;

function check(node, o) {
  if (!node.isConnected) return false;
  const av = node._av || (node._av = { dx: 0, dy: 0, w: 0 });
  const r = node.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return true;
  // (where it would be without our move)
  const base = { l: r.left - av.dx, t: r.top - av.dy, r: r.right - av.dx, b: r.bottom - av.dy };
  let res = clearOf(base, { ...o, skip: node });
  if (!res.ok && o.wrap && res.w > 40 && res.w < base.r - base.l) {
    // wrap narrower into the widest free span on its row (re-checked next time round)
    if (!av.w) av.full = base.r - base.l;
    node.style.maxWidth = Math.floor(res.w) + 'px';
    av.w = res.w;
  } else if (res.ok && av.w) {
    // (room again: it gets its width back once it would be clear at full size)
    const c = (base.l + base.r) / 2, full = { l: c - av.full / 2, r: c + av.full / 2, t: base.t, b: base.b };
    if (clearOf(full, { ...o, skip: node }).ok) { node.style.maxWidth = ''; av.w = 0; }
  }
  if (!res.ok) res = { dx: res.dx, dy: 0 };
  const dx = Math.round(res.dx), dy = Math.round(res.dy);
  if (dx !== av.dx || dy !== av.dy) {
    av.dx = dx; av.dy = dy;
    node.classList.add('ft-avoid');
    node.style.translate = dx || dy ? `${dx}px ${dy}px` : '';
  }
  return true;
}

function tick() {
  for (const [node, o] of watched) if (!check(node, o)) watched.delete(node);
  if (!watched.size) { clearInterval(timer); timer = 0; }
}

/** Keep a floating DOM node clear of the solid interface while it's on the page. → stop() */
export function keepClear(node, o = {}) {
  if (!node) return () => {};
  watched.set(node, o);
  if (!timer) timer = setInterval(tick, 180);
  // first look once it's laid out
  requestAnimationFrame(() => { if (watched.has(node)) check(node, o); });
  return () => watched.delete(node);
}
