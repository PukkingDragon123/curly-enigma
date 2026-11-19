// The quest poster's pieces (src/ui/Tracker.js): a torn, stained handbill with a woodcut of the
// quest's goal (src/ui/woodcut.js) pinned to a cork patch with a forged nail; the scroll that hangs
// under it on twine (two turned rods, a parchment sheet); progress pips, the ink tick, the scrap a
// poster leaves on the nail when it's torn off; which picture a quest gets; the step in a few words;
// the paper sounds. Lamplight Woodcut: plum shadows, cream lights, one accent ink per poster.
import { Px, art, ART_RES } from './uiArt.js';
import { TONES, paperField, paintPaper, hash, mix } from './craftArt.js';
import { carve, BACKDROP, PIC_W, PIC_H } from './woodcut.js';
import { ITEMS } from '../data/items.js';

export const INK = 0x2e1a28; // plum-black, never pure black
const PLUM = 0x3a2234, CREAM = 0xfff0d2, VERMILION = 0xa8321e;
export const POSTER_W = 46, PIC_X = 5, PIC_Y = 6, TITLE_Y = PIC_Y + PIC_H + 4;
export const SCROLL_W = 50, SHEET_W = 44;

function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, f = (t) => t * t * (3 - 2 * t);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return (a + (b - a) * f(u)) * (1 - f(v)) + (c + (d - c) * f(u)) * f(v);
}
const hashS = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return (h >>> 0) % 9973; };

// ---------------------------------------------------------------- which picture, which paper, which ink
/** Accent inks (earthy, restrained): one per poster. */
const ACC = { red: VERMILION, ochre: 0xb8862a, copper: 0xb0562a, rust: 0x8a4a32, teal: 0x2f6670, moss: 0x4f6a2a, plum: 0x6a3a6a, pink: 0xb0505a, blue: 0x3a6a8a, ember: 0xb8582a, slate: 0x5a5260 };
const MOTIF_ACC = { star: 'pink', ore: 'copper', pick: 'red', anvil: 'ember', blade: 'red', lift: 'ochre', town: 'ochre', pot: 'ember', gem: 'teal', coins: 'ochre', shroom: 'blue', herb: 'moss', ruin: 'teal', beast: 'ember', dyn: 'red', deep: 'ochre', ticket: 'red', lantern: 'ochre', stall: 'red', ingot: 'ochre', parcel: 'red' };
const QUEST_MOTIF = { lessons: 'star', million: 'coins', os_town: 'town', os_neighbours: 'stall', os_gem: 'gem', os_rocco: 'blade', os_lifts: 'lift', os_pristine: 'ore', os_blade: 'anvil', os_cook: 'pot', os_dynamite: 'dyn', os_ruin: 'ruin', os_tenth: 'coins' };
/** Poster stock by the kind of quest (dark → light, never white): Old Star's own handbills on warm
 *  rag paper, his errands on buff, the burrow folk's on newsprint, the town's on ledger paper, lore on linen. */
const PAPERS = {
  main: [0xa8804e, 0xbc945e, 0xcca66e, 0xd8b67e, 0xe2c48e, 0xeacf9c, 0xf0d9aa, 0xf4e1b8],
  story: [0x9e8456, 0xb29866, 0xc2a874, 0xceb682, 0xd8c290, 0xe0cc9c, 0xe8d6aa, 0xeedeb6],
  request: [0x8a8070, 0xa09680, 0xb2a88e, 0xc2b89c, 0xcec4a8, 0xd8ceb2, 0xe0d8be, 0xe8e0c8],
  village: [0x948a66, 0xaaa078, 0xbcb288, 0xcac096, 0xd6cca2, 0xe0d6ae, 0xe8dfba, 0xeee6c4],
  lore: [0x6e5e44, 0x86765a, 0x9c8c6e, 0xb2a282, 0xc4b694, 0xd2c6a4, 0xdcd2b2, 0xe6dcc0],
};
/** A colour from an item's icon, pulled toward the ink so it prints like an earth pigment. */
const inkOf = (c) => (typeof c === 'number' ? mix(mix(c, 0x6a5a50, 0.32), PLUM, 0.12) : null);

function itemMotif(id) {
  const it = ITEMS[id];
  if (!it) return { m: 'parcel' };
  const ic = it.icon || {};
  if (it.cat === 'mineral') return { m: 'ore', acc: id === 'coal' ? ACC.slate : inkOf(ic.ore?.[0]) };
  if (it.cat === 'gem') return { m: 'gem', acc: inkOf(ic.c?.[0]) };
  if (it.cat === 'ingot') return { m: 'ingot', acc: inkOf(ic.c?.[0]) };
  if (it.cat === 'plant' || it.cat === 'ingredient') return { m: /cap|shroom|truffle|mush/.test(id) ? 'shroom' : 'herb' };
  if (it.cat === 'food' || it.cat === 'consumable' || /soup|pie|stew|jam|tea|egg/.test(id)) return { m: 'pot' };
  if (it.cat === 'drop' || it.cat === 'critter') return { m: 'beast' };
  return { m: 'parcel' };
}

/** The picture for a step: what it asks for. */
function stepMotif(st, giver) {
  if (!st) return null;
  if (st.gold) return { m: 'coins' };
  if (st.deliver) { const ids = Object.keys(st.deliver.items || {}); return itemMotif(ids[0]); }
  if (st.where?.zone) return { m: 'deep' };
  const on = [].concat(st.on || [])[0] || {};
  const t = on.type;
  if (t === 'ore') return { m: 'ore', acc: inkOf(ITEMS[on.id]?.icon?.ore?.[0]) };
  if (t === 'forge') return { m: 'anvil' };
  if (t === 'smelt') return { m: 'ingot', acc: ACC.copper };
  if (t === 'sell') return { m: 'blade' };
  if (t === 'cook') return { m: 'pot' };
  if (t === 'kill' || t === 'nest') return { m: 'beast' };
  if (t === 'puzzle' || t === 'lore' || t === 'relic' || t === 'look') return { m: 'ruin' };
  if (t === 'explore' || t === 'tame') return { m: 'lantern' };
  if (t === 'forage') return { m: 'herb' };
  if (t === 'gem') return { m: 'gem' };
  if (t === 'blast') return { m: 'dyn' };
  if (t === 'buy') return { m: /ticket/.test(on.id || '') ? 'ticket' : 'stall' };
  if (t === 'axe') return { m: 'pick' };
  if (t === 'talk') return { m: (on.npc || giver) === 'oldstar' ? 'star' : 'stall' };
  if (t === 'reach') return { m: on.place === 'town' ? 'town' : /^lift/.test(on.place || '') ? 'lift' : /^ruin/.test(on.place || '') ? 'ruin' : 'stall' };
  if (st.count) return { m: 'lift' };
  return null;
}

/** The poster's look for a quest: { motif, acc, pal }. */
export function posterLook(def, id) {
  let pick = QUEST_MOTIF[id] ? { m: QUEST_MOTIF[id] } : null;
  if (!pick && /^os_deeper/.test(id)) pick = { m: 'deep' };
  if (!pick) for (let i = def.steps.length - 1; i >= 0 && !pick; i--) pick = stepMotif(def.steps[i], def.giver);
  pick ||= { m: def.giver === 'oldstar' ? 'star' : 'parcel' };
  const pal = PAPERS[def.kind] || PAPERS.story;
  return { motif: pick.m, acc: pick.acc ?? ACC[MOTIF_ACC[pick.m] || 'red'], pal, kind: def.kind || 'story' };
}

// ---------------------------------------------------------------- the step in a few words
const CUT_AT = new Set(['to', 'at', 'in', 'into', 'from', 'for', 'with', 'on', 'down', 'past', 'through', 'by', 'near', 'under', 'inside']);
/** "Forge your own pickaxe at his forge" → "Forge your own pickaxe" (2–6 words; the book has the rest). */
export function brief(text) {
  let s = String(text || '').replace(/\s*\([^)]*\)/g, '').split(/[,;:—–]| - /)[0].trim();
  let w = s.split(/\s+/).filter(Boolean);
  while (w.length > 5) {
    let k = -1;
    for (let i = w.length - 1; i >= 2; i--) if (CUT_AT.has(w[i].toLowerCase())) { k = i; break; }
    if (k < 0) break;
    w = w.slice(0, k);
  }
  if (w.length > 6) w = w.slice(0, 6);
  return w.join(' ');
}

/** "12.4k / 1M": gold short enough for the scroll. */
export function shortGold(n) {
  const f = (v) => (v >= 1e6 ? +(v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M' : v >= 1e4 ? Math.floor(v / 1e3) + 'k' : v >= 1e3 ? +(v / 1e3).toFixed(1) + 'k' : String(Math.floor(v)));
  return f(Math.max(0, n));
}

// ---------------------------------------------------------------- the poster
function posterPx(o) {
  const { W, H, pal, seed: s } = o, p = new Px(W, H), r = p.r, fw = p.fw, fh = p.fh;
  // the ragged outline (fine grid): a wandering tear, a bite, a dog-eared or torn-off corner
  const bite = [Math.floor(hash(s, 1, 3) * 4), 6 + hash(s, 2, 3) * (Math.min(W, H) - 14)];
  const corner = hash(s, 3, 3); // < .5: dog-ear bottom right; else a torn corner bottom left
  const inset = (e, u) => {
    let d = 0.2 + vnoise(u * 0.42, e * 3.7, s) * 1.15 + (hash(Math.floor(u * r), e, s + 1) < 0.14 ? 0.5 : 0);
    if (e === bite[0]) { const k = (u - bite[1]) / 1.7; if (Math.abs(k) < 1) d += 1.9 * (1 - k * k); }
    return d;
  };
  const DOG = 6.4;
  const inside = (X, Y) => {
    if (X < inset(3, Y) || W - X < inset(1, Y) || Y < inset(0, X) || H - Y < inset(2, X)) return false;
    if (corner >= 0.5) { const a = X, b = H - Y; if (a + b < 7 + vnoise(X * 1.3, Y * 1.3, s + 4) * 2.4) return false; }
    else if ((W - X) + (H - Y) < DOG) return false;
    return true;
  };
  const M = new Uint8Array(fw * fh);
  for (let fy = 0; fy < fh; fy++) for (let fx = 0; fx < fw; fx++) M[fy * fw + fx] = inside((fx + 0.5) / r, (fy + 0.5) / r) ? 1 : 0;
  const m = (fx, fy) => (fx < 0 || fy < 0 || fx >= fw || fy >= fh ? 0 : M[fy * fw + fx]);
  // the paper
  paintPaper(p, paperField(W, H, { res: r, seed: s, base: 0.66, stains: 1, fox: 1.3, mottle: 0.34, fibres: 1.2 }), pal);
  // folds: a vertical and a horizontal crease, each panel tilted a little to the lamp
  const xf = W * 0.5 + (hash(s, 5, 3) - 0.5) * 4, yf = H * 0.55 + (hash(s, 6, 3) - 0.5) * 5;
  const xfAt = (Y) => xf + Math.sin(Y * 0.31 + s) * 0.35, yfAt = (X) => yf + Math.sin(X * 0.27 + s) * 0.3;
  p.fine((X, Y, fx, fy) => {
    if (!M[fy * fw + fx]) return undefined;
    let c = p.fget(fx, fy);
    // lamplight from the top left, plum shade toward the bottom right
    const lt = 0.42 - (X / W) * 0.44 - (Y / H) * 0.58;
    c = lt > 0 ? mix(c, CREAM, lt * 0.36) : mix(c, PLUM, -lt * 0.56);
    if (X > xfAt(Y)) c = mix(c, PLUM, 0.05);
    if (Y > yfAt(X)) c = mix(c, CREAM, 0.04);
    // age gathers at the rim
    let e = 99;
    for (let k = 1; k <= 3 * r && e === 99; k++) if (!m(fx - k, fy) || !m(fx + k, fy) || !m(fx, fy - k) || !m(fx, fy + k)) e = k;
    if (e <= 3 * r) c = mix(c, 0x9a6a40, (1 - e / (3 * r + 1)) * 0.28);
    // a damp streak run down from the top, a tea ring, a sooty thumbprint
    const dx = Math.abs(X - o.damp[0] - Math.sin(Y * 0.5) * 0.6), dl = o.damp[1] * (0.7 + vnoise(X, 2, s) * 0.3);
    if (dx < 1.6 && Y < dl) c = mix(c, 0x9a7048, (Math.abs(dx - 1.3) < 0.3 || Math.abs(Y - dl) < 0.4 ? 0.22 : 0.08) * (1 - Y / dl * 0.5));
    const tr = Math.hypot(X - o.ring[0], Y - o.ring[1]) - o.ring[2];
    if (Math.abs(tr) < 0.5 && vnoise(X * 0.8, Y * 0.8, s + 7) > 0.3) c = mix(c, 0x8a5a34, 0.3);
    else if (tr < 0) c = mix(c, 0xb08050, 0.08);
    const tx = X - o.thumb[0], ty = Y - o.thumb[1], td = Math.hypot(tx, ty * 1.25);
    if (td < 2.6 && Math.sin(td * 5.2 + Math.atan2(ty, tx) * 0.5) > 0.35) c = mix(c, 0x4a3a40, 0.16 * (1 - td / 2.6));
    return c;
  });
  // the print: a thick-thin border rule, the woodcut, a little rule under it
  const ruleAt = (fx, fy, a) => { if (m(fx, fy) && hash(fx >> 1, fy >> 1, s + 9) > 0.07) p.fset(fx, fy, INK, a); };
  const box = (x0, y0, x1, y1, w, a) => {
    for (let k = 0; k < w; k++) {
      for (let fx = x0 * r; fx <= x1 * r; fx++) { ruleAt(fx, y0 * r + k, a); ruleAt(fx, y1 * r - k, a); }
      for (let fy = y0 * r; fy <= y1 * r; fy++) { ruleAt(x0 * r + k, fy, a); ruleAt(x1 * r - k, fy, a); }
    }
  };
  box(2, 2, W - 2, H - 2, 2, 236);
  box(3.5, 3.5, W - 3.5, H - 3.5, 1, 200);
  const b = carve(o.motif, s % 97, r);
  b.print(p, PIC_X, PIC_Y, { ...BACKDROP[o.motif], acc: o.acc, ink: INK, seed: s });
  const ry = (PIC_Y + PIC_H + 1.6) * r, cx = (W / 2) * r;
  for (let fx = 9 * r; fx < (W - 9) * r; fx++) if (Math.abs(fx - cx) > 3 && hash(fx, 3, s) > 0.08) p.fset(fx, ry, INK, 200);
  for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) p.fset(cx + dx, ry + dy, dx || dy ? INK : o.acc, 240);
  if (o.main) for (const sx of [-1, 1]) { const x = cx + sx * 7 * r, y = ry; for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]) p.fset(x + dx, y + dy, o.acc, 230); }
  // creases over the print: a dark valley and a lit ridge; the ink cracks along them
  for (let fy = 0; fy < fh; fy++) {
    const fx = Math.round(xfAt(fy / r) * r);
    if (m(fx, fy)) { p.fset(fx, fy, mix(p.fget(fx, fy), 0x5a3a40, 0.32)); if (m(fx - 1, fy)) p.fset(fx - 1, fy, mix(p.fget(fx - 1, fy), CREAM, 0.38)); }
  }
  for (let fx = 0; fx < fw; fx++) {
    const fy = Math.round(yfAt(fx / r) * r);
    if (m(fx, fy)) { p.fset(fx, fy, mix(p.fget(fx, fy), 0x5a3a40, 0.28)); if (m(fx, fy + 1)) p.fset(fx, fy + 1, mix(p.fget(fx, fy + 1), CREAM, 0.34)); }
  }
  // the nail hole, and the paper pulled taut below it: little tension creases fanning down
  const nx = (W / 2) * r, ny = 2.6 * r;
  for (const [dx, len] of [[-3.6, 5], [-1.2, 6.5], [1.6, 6], [3.8, 4.6]]) {
    for (let t = 1.2; t < len; t += 1 / r) {
      const fx = Math.round(nx + (dx * t * r) / len), fy = Math.round(ny + t * r);
      if (!m(fx, fy)) continue;
      const a = 1 - t / len;
      p.fset(fx, fy, mix(p.fget(fx, fy), 0x5a3a40, 0.26 * a)); p.fset(fx - 1, fy, mix(p.fget(fx - 1, fy), CREAM, 0.3 * a));
    }
  }
  for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0], [0, 1], [1, 0]]) p.fset(nx + dx, ny + dy, 0x2a1622);
  // the holes the scroll's twine goes through
  for (const sx of [-14, 14]) { const hx = (W / 2 + sx) * r, hy = (H - 2.4) * r; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (m(hx + dx, hy + dy)) p.fset(hx + dx, hy + dy, 0x2a1622); }
  // cut it out; the torn rim shows the pulp, darker on the shadow side
  for (let fy = 0; fy < fh; fy++)
    for (let fx = 0; fx < fw; fx++) {
      if (!M[fy * fw + fx]) { p.fclear(fx, fy); continue; }
      if (!m(fx + 1, fy) || !m(fx, fy + 1)) p.fset(fx, fy, mix(p.fget(fx, fy), 0x3a2028, 0.7));
      else if ((!m(fx - 1, fy) || !m(fx, fy - 1)) && hash(fx, fy, s + 12) < 0.7) p.fset(fx, fy, mix(p.fget(fx, fy), 0x7a5a48, 0.45));
    }
  // a few fibres poke out of the tear
  for (let fy = 0; fy < fh; fy++)
    for (let fx = 0; fx < fw; fx++)
      if (!M[fy * fw + fx] && (m(fx - 1, fy) || m(fx + 1, fy) || m(fx, fy - 1) || m(fx, fy + 1)) && hash(fx, fy, s + 13) < 0.06) p.fset(fx, fy, pal[2], 170);
  // the dog-ear: the corner folded over onto the front, its back a shade darker, a shadow under it
  if (corner < 0.5) {
    p.fine((X, Y, fx, fy) => {
      const a = W - X, b = H - Y;
      if (a > DOG || b > DOG || a + b < DOG) return undefined;
      const flapEdge = a > DOG - 0.6 || b > DOG - 0.6;
      if (a + b < DOG + 0.5) return mix(pal[5], CREAM, 0.3); // the fold, catching the light
      return flapEdge ? 0x5a3a38 : mix(pal[1], PLUM, 0.12 + (a + b - DOG) * 0.03);
    }, W - DOG - 1, H - DOG - 1, DOG + 1, DOG + 1);
    for (let fy = (H - DOG) * r; fy < fh; fy++) { const fx = (W - DOG) * r - 1; if (m(fx, fy)) p.fset(fx, fy, mix(p.fget(fx, fy), PLUM, 0.35)); }
    for (let fx = (W - DOG) * r; fx < fw; fx++) { const fy = (H - DOG) * r - 1; if (m(fx, fy)) p.fset(fx, fy, mix(p.fget(fx, fy), PLUM, 0.35)); }
  }
  return p;
}

/** The poster for a quest (its look, the poster's height in art px): a data URL (cached). */
export function posterArt(id, look, H) {
  const s = hashS(id) + 11;
  return art(`qp:${id}:${H}`, () => posterPx({
    W: POSTER_W, H, pal: look.pal, motif: look.motif, acc: look.acc, main: look.kind === 'main', seed: s,
    ring: [6 + hash(s, 21, 1) * (POSTER_W - 12), 4 + hash(s, 22, 1) * (H - 8), 3.4 + hash(s, 23, 1) * 2.4],
    thumb: [hash(s, 24, 1) < 0.5 ? 6 : POSTER_W - 8, H - 7 - hash(s, 25, 1) * 4],
    damp: [hash(s, 26, 1) < 0.5 ? 3 + hash(s, 27, 1) * 3 : POSTER_W - 4 - hash(s, 27, 1) * 3, 9 + hash(s, 28, 1) * 10],
  }), { refine: false });
}

/** The bit of a torn-off poster left on the nail: same paper, ragged below. */
export function scrapArt(look, id) {
  const s = hashS(id) + 5;
  return art(`qp:scrap:${id}`, () => {
    const W = 14, H = 8, p = new Px(W, H), r = p.r;
    paintPaper(p, paperField(W, H, { res: r, seed: s, base: 0.62, fox: 0.8 }), look.pal);
    p.fine((X, Y, fx, fy) => {
      const bot = 3.4 + vnoise(X * 0.9, 1, s) * 3.2 + (hash(fx, 2, s) < 0.2 ? 0.6 : 0) - Math.abs(X - W / 2) * 0.18;
      const side = Math.min(X, W - X) < 0.6 + vnoise(Y, 3, s) * 1.2;
      if (Y > bot || side || Y < 0.3 + vnoise(X * 0.6, 5, s) * 0.8) { p.fclear(fx, fy); return undefined; }
      let c = p.fget(fx, fy);
      if (Y > bot - 0.8) c = mix(c, 0x9a7a5a, 0.35); // the fresh tear, pale pulp
      return mix(c, PLUM, 0.06 + (Y / H) * 0.12);
    });
    const nx = (W / 2) * r, ny = 2.6 * r;
    for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) p.fset(nx + dx, ny + dy, 0x2a1622);
    for (let fx = 2 * r; fx < (W - 2) * r; fx++) if (p.fa(fx, 2 * r) && hash(fx, 7, s) > 0.1) p.fset(fx, 2 * r, INK, 220); // a scrap of the border rule
    return p;
  }, { refine: false });
}

// ---------------------------------------------------------------- the cork patch and the nail
export const corkArt = () => art('qp:cork', () => {
  const W = 34, H = 15, p = new Px(W, H), r = p.r, pal = TONES.cork;
  const shape = (X, Y) => {
    const dx = (X - W / 2) / (W / 2 - 1), dy = (Y - H / 2) / (H / 2 - 1.2), a = Math.atan2(dy, dx);
    const R = 1 + Math.sin(a * 3 + 1.3) * 0.05 + Math.sin(a * 5 + 0.4) * 0.04 + (vnoise(a * 4 + 9, 1, 3) - 0.5) * 0.14;
    return [Math.hypot(dx, dy), R, dy];
  };
  p.fine((X, Y, fx, fy) => {
    const [d, R, dy] = shape(X, Y);
    if (d > R) return undefined;
    // pressed granules lit on their upper left, dark pits; the cut edge shows lower right
    const gx = Math.floor(X / 1.4), gy = Math.floor(Y / 1.4), g = hash(gx, gy, 41);
    let k = 0.4 + g * 0.36 - (X / W) * 0.14 - (Y / H) * 0.16;
    if ((X / 1.4 - gx) < 0.36 || (Y / 1.4 - gy) < 0.36) k += 0.1;
    if (hash(fx, fy, 42) < 0.05) k -= 0.3;
    if (d > R - 0.12 && dy > -0.1) k = 0.06; // the patch's thickness, in shadow
    else if (d > R - 0.1) k = 0.62;
    return pal[Math.max(0, Math.min(pal.length - 1, Math.floor(k * pal.length)))];
  });
  // old pin holes, a corner of some earlier notice still under a brass tack
  for (const [x, y] of [[9, 4], [25, 5], [28, 9], [12, 10], [21, 3]]) { p.dot(x, y, 0x2a1810); p.dot(x + 0.5, y + 0.5, pal[6], 160); }
  p.fine((X, Y) => (X > 3.6 && Y > 3.4 && X + Y * 0.9 < 12.4 && Y < 9.6 ? (X + Y * 0.9 > 11.6 || Y > 9 ? 0x9a8462 : mix(TONES.news[5], PLUM, (Y - 3) * 0.03)) : undefined), 3, 3, 9, 7);
  p.fdisk(6.6, 5.6, 1.5, 0x6e4a1a); p.fdisk(6.4, 5.4, 1.15, 0xc08e30); p.fdisk(6.1, 5.1, 0.55, 0xf7d97c); p.dot(6, 5, 0xfff6d8);
  p.outline(0x24141a);
  return p;
}, { refine: false });

export const nailArt = () => art('qp:nail', () => {
  const p = new Px(7, 7), r = p.r;
  // a soft shadow cast down-right onto the poster
  for (let fy = 0; fy < p.fh; fy++) for (let fx = 0; fx < p.fw; fx++) { const X = (fx + 0.5) / r, Y = (fy + 0.5) / r; if (Math.hypot(X - 4.1, (Y - 4.2) * 1.1) < 2.5) p.fset(fx, fy, 0x1a0c12, 110); }
  // the forged head: a squarish dome, hammer facets lit from the top left, a dark rim
  const cx = 3.2, cy = 3.1;
  p.fine((X, Y) => {
    const dx = X - cx, dy = Y - cy, d = Math.max(Math.abs(dx) * 0.92, Math.abs(dy)) + Math.hypot(dx, dy) * 0.25;
    if (d > 2.25) return undefined;
    if (d > 1.8) return dx + dy > 0.4 ? 0x140a10 : 0x3a2e2e;
    const l = -(dx * 0.7 + dy * 0.75) / 1.8 + (Math.floor((dx + 3) * 1.6) % 2 ? 0.08 : -0.06);
    return l > 0.45 ? 0xd8ccba : l > 0.15 ? 0x9a8a7c : l > -0.2 ? 0x6e5e56 : l > -0.5 ? 0x4a3c3a : 0x2a2024;
  });
  p.dot(cx - 0.9, cy - 0.9, 0xfff2dc); p.dot(cx - 0.4, cy - 0.9, 0xe8dccb, 200);
  // a rust bloom running down from it
  p.dot(cx, cy + 2.3, 0x7a3a1c, 200); p.dot(cx, cy + 2.8, 0x6a3018, 150); p.dot(cx + 0.5, cy + 2.3, 0x5a2a16, 120);
  return p;
}, { refine: false });

// ---------------------------------------------------------------- the scroll
/** A turned wooden rod with knobs, 4 frames down (the grain rolls as it turns). */
export const rodArt = (heavy) => art('qp:rod' + (heavy ? 'H' : ''), () => {
  const W = SCROLL_W, FH = 6, p = new Px(W, FH * 4), r = p.r, wood = TONES.oak;
  for (let f = 0; f < 4; f++) {
    const oy = f * FH;
    p.fine((X, Y, fx, fy) => {
      const y = Y - oy, x = X;
      const knob = x < 3.2 || x > W - 3.2;
      const top = knob ? 0.6 : 1.4, bot = knob ? 5.4 : 4.6;
      if (y < top || y >= bot) return undefined;
      const v = (y - top) / (bot - top); // 0 top .. 1 bottom
      let k = 0.86 - v * 0.75 + (v < 0.2 ? 0.1 : 0);
      if (knob) {
        const kx = x < 3.2 ? x : W - x;
        if (kx > 2.3 && kx < 2.8) k -= 0.28; // the turned groove
        if (kx < 0.7) k -= 0.18;
      } else {
        // grain streaks running along the rod, rolling with the frame
        const g = hash(Math.floor((x + f * 1.3) / 2.6), Math.floor((y - top) * r + f) & 7, 61);
        if (g < 0.22) k -= 0.16; else if (g > 0.9) k += 0.08;
      }
      return wood[Math.max(1, Math.min(wood.length - 1, Math.round(k * (wood.length - 1))))];
    }, 0, oy, W, FH);
  }
  p.outline(0x1e0f12);
  if (heavy) for (let f = 0; f < 4; f++) for (const x of [3.6, W - 4.6]) { p.rect(x, f * 6 + 1, 1, 4, 0xa8772c); p.set(x, f * 6 + 1, 0xf7d97c); }
  return p;
}, { refine: false });

/** The scroll's parchment: one period (the sheet tiles down), a deckled edge each side, lamplight from the left. */
export const sheetArt = () => art('qp:sheet', () => {
  const W = SHEET_W, H = 18, p = new Px(W, H), TAU = Math.PI * 2;
  paintPaper(p, paperField(W, H, { res: p.r, seed: 77, base: 0.6, fibres: 1.3, fox: 0.8, mottle: 0.3 }), PAPERS.main);
  p.fine((X, Y, fx, fy) => {
    const ex = Math.min(X, W - X), k = X < W / 2 ? 0 : 2.1;
    const rag = 0.35 + (Math.sin((Y / H) * TAU * 2 + k) * 0.5 + 0.5) * 0.45 + (Math.sin((Y / H) * TAU * 5 + k * 3) * 0.5 + 0.5) * 0.35 + (hash(fy, X < W / 2 ? 1 : 2, 79) < 0.15 ? 0.5 : 0);
    if (ex < rag) { p.fclear(fx, fy); return undefined; }
    let c = p.fget(fx, fy);
    c = mix(c, X < W / 2 ? CREAM : PLUM, Math.abs(X / W - 0.5) * (X < W / 2 ? 0.26 : 0.34));
    if (ex < rag + 0.6) c = mix(c, 0x7a5040, 0.42);
    return c;
  });
  return p;
}, { refine: false });

/** The shade where the paper curls round a rod (laid over the sheet's top; flipped for the bottom). */
export const curlArt = () => art('qp:curl', () => {
  const W = SHEET_W, p = new Px(W, 4), r = p.r;
  for (let fy = 0; fy < 4 * r; fy++) {
    const t = 1 - fy / (4 * r), a = Math.round(40 + 150 * t * t);
    for (let fx = 0; fx < W * r; fx++) if (t > 0.6 || ((fx + fy * 2) % 4) < Math.round(t * 5)) p.fset(fx, fy, PLUM, a);
  }
  return p;
}, { refine: false });

/** The two twine strings from the poster's holes down to the scroll's top rod. */
export const twineArt = () => art('qp:twine', () => {
  const W = SCROLL_W, H = 11, p = new Px(W, H), r = p.r;
  for (const x of [W / 2 - 14, W / 2 + 14]) {
    for (let fy = 0; fy < H * r; fy++) {
      const fx = Math.round(x * r) - 1;
      p.fset(fx - 1, fy, 0x2a1810, 120);
      p.fset(fx, fy, (fy % 3) === 0 ? 0x7a5a36 : 0xd8b884);
      p.fset(fx + 1, fy, (fy % 3) === 1 ? 0x4a3020 : 0x9a7a4c);
      p.fset(fx + 2, fy, 0x1a0c10, 140);
    }
    for (let fx = Math.round(x * r) - 2; fx <= Math.round(x * r) + 1; fx++) { p.fset(fx, H * r - 2, 0xb8945e); p.fset(fx, H * r - 1, 0x6a4a2c); }
  }
  return p;
}, { refine: false });

// ---------------------------------------------------------------- little inked marks
/** A progress pip: an inked nugget, empty (outline, a little hatch) or full (accent, glint). */
export function pipArt(full, acc = VERMILION) {
  return art(`qp:pip:${full ? 1 : 0}:${acc}`, () => {
    const p = new Px(7, 6), r = p.r;
    const shape = (X, Y) => { const dx = (X - 3.5) / 3, dy = (Y - 3.1) / 2.5, a = Math.atan2(dy, dx); return Math.hypot(dx, dy) < 1 + Math.sin(a * 3 + 1) * 0.08 + Math.sin(a * 2) * 0.05; };
    p.fine((X, Y, fx, fy) => {
      if (!shape(X, Y)) return undefined;
      const edge = !shape(X + 0.5, Y) || !shape(X, Y + 0.5) || !shape(X - 0.5, Y) || !shape(X, Y - 0.5);
      if (edge) return INK;
      if (!full) return ((fx + fy) % 4 === 0) ? mix(INK, 0xf2e1b9, 0.45) : undefined;
      if (X < 3 && Y < 2.6) return mix(acc, CREAM, 0.5);
      return (fx + fy) % 3 === 0 ? mix(acc, INK, 0.35) : acc;
    });
    if (!full) for (let fy = 0; fy < p.fh; fy++) for (let fx = 0; fx < p.fw; fx++) if (p.fa(fx, fy) && p.fget(fx, fy) !== INK) p.fset(fx, fy, p.fget(fx, fy), 140);
    return p;
  }, { refine: false });
}

/** A brushed ink tick, thick then thin, in vermilion. */
export const tickArt = () => art('qp:tick', () => {
  const p = new Px(12, 10), r = p.r;
  const pts = [[1.2, 5.2], [3.2, 7.4], [4.4, 8.4], [6.4, 5.2], [8.6, 2.6], [11, 0.8]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) * r * 2);
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, along = (i + t) / (pts.length - 1);
      const w = along < 0.45 ? 1.25 : 1.25 - (along - 0.45) * 1.8;
      p.fdisk(x, y, Math.max(0.3, w / 2), VERMILION);
    }
  }
  // a dry-brush streak and a blot at the turn
  p.each((x, y, c) => (hash(x, y, 91) < 0.12 ? mix(c, 0xd8603a, 0.5) : undefined));
  p.fdisk(4.2, 8.1, 0.75, 0x8a2414);
  return p;
}, { refine: false });

// ---------------------------------------------------------------- paper sounds
const live = (a) => a && a.ctx && a.ctx.state === 'running';
export const PSFX = {
  /** A sheet of paper fluttering down: quick flaps slowing, a soft rush of air. */
  flutter(audio, { n = 6, vol = 1, delay = 0 } = {}) {
    if (!live(audio)) return;
    audio.noise({ color: 'pink', filter: 'lowpass', f: 900, dur: 0.32, vol: 0.05 * vol, a: 0.08, delay });
    let t = delay;
    for (let i = 0; i < n; i++) {
      audio.noise({ filter: 'bandpass', f: 1600 + Math.random() * 1800, f2: 1100 + Math.random() * 900, q: 1.3, dur: 0.035 + Math.random() * 0.03, vol: (0.07 - i * 0.008) * vol, a: 0.004, delay: t });
      t += 0.045 + i * 0.012 + Math.random() * 0.02;
    }
  },
  /** The poster catching on its nail: a dull tap and the paper snapping taut. */
  catch(audio) {
    if (!live(audio)) return;
    audio.tone({ f: 260, f2: 150, type: 'triangle', dur: 0.07, vol: 0.09, a: 0.002, release: 0.05 });
    audio.noise({ filter: 'bandpass', f: 2600, q: 1.6, dur: 0.05, vol: 0.08, a: 0.002, delay: 0.01 });
    audio.noise({ filter: 'highpass', f: 4200, q: 0.8, dur: 0.03, vol: 0.04, delay: 0.06 });
  },
  /** Paper tearing off a nail: a ragged rising rip. */
  rip(audio) {
    if (!live(audio)) return;
    audio.noise({ filter: 'bandpass', f: 900, f2: 3200, q: 2.2, dur: 0.26, vol: 0.1, a: 0.01 });
    for (let i = 0; i < 6; i++) audio.noise({ filter: 'bandpass', f: 1800 + i * 300, q: 3, dur: 0.02, vol: 0.06, delay: 0.02 + i * 0.035 + Math.random() * 0.015 });
  },
};

export const ART_HI = ART_RES > 1;
