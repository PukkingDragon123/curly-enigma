// The opening. The mole wakes up in the dark after a cave-in, deep in old collapsed tunnels
// below Deep Town. No tutorial: rubble to clear, a shaft to climb, clucking somewhere behind
// a wall (Nugget!), sand that pours, a pool, and finally old boards with warm light and town
// noise leaking through. Break them and you're out.
import * as THREE from 'three';
import { makeNoise2D, makeRng, clamp, lerp, rand, chance } from '../core/util.js';
import { B, ORES, ORE_ID, isSolid, isGranular } from './blocks.js';
import { MineWorld } from './MineWorld.js';
import { M, CPX, tn, pixelColor } from './micro.js';
import { ChunkGen, NODE } from './MicroGen.js';
import { warpFields, ensureOrePalettes, planDeposit, spikeFeature, rootFeature } from './MineGen.js';
import { settleFluids } from './Fluids.js';
import { makeChicken } from '../gfx/characters.js';

const W = 46, H = 32;

// Open pockets and passages (cells). Gaps between them are what you dig through.
const AIR = [
  { c: [3.6, 26.2, 8.4, 26.4], r: 1.55 }, // where you wake up
  { c: [11.6, 26.3, 18.6, 25.9], r: 1.25 }, // half-collapsed tunnel
  { c: [22.2, 26.4, 22.2, 16.4], r: 1.05 }, // the old shaft
  { c: [22.2, 15.2, 22.2, 15.2], r: 1.7 }, // landing at the top
  { c: [13.4, 15.3, 19.8, 15.4], r: 1.05 }, // passage toward the clucking
  { c: [7.2, 15.0, 8.8, 15.2], r: 2.15 }, // Nugget's pocket
  { c: [24.8, 14.6, 29.8, 13.6], r: 1.05 }, // sandy crawl
  { c: [35.0, 13.4, 35.0, 13.4], r: 2.55 }, // the pool cave
  { c: [36.4, 10.2, 37.6, 7.4], r: 0.95 }, // ramp up
  { c: [31.6, 5.6, 41.0, 5.4], r: 1.3 }, // the old mine gallery
  { c: [43.9, 5.4, 45.0, 5.2], r: 1.25 }, // beyond the boards: the way into town
];
// Materials by region (cells): later entries win.
const MATS = [
  { x0: 0, y0: 0, x1: W, y1: H, m: B.DIRT },
  { x0: 0, y0: 0, x1: W, y1: 9, m: B.LOAM },
  { x0: 0, y0: 18, x1: 12, y1: 23, m: B.STONE },
  { x0: 13, y0: 19, x1: 21, y1: 23, m: B.CLAY },
  { x0: 9.6, y0: 12, x1: 12.4, y1: 18.5, m: B.STONE }, // the wall in front of Nugget
  { x0: 3, y0: 10, x1: 13, y1: 12.6, m: B.LIMESTONE },
  { x0: 23.5, y0: 9.6, x1: 31, y1: 12.6, m: B.SAND }, // sand right above the crawl
  { x0: 30.2, y0: 12, x1: 32.4, y1: 16, m: B.DIRT },
  { x0: 31.5, y0: 15.6, x1: 39, y1: 20, m: B.STONE },
  { x0: 36, y0: 8.3, x1: 39, y1: 9.3, m: B.CLAY }, // plug on the ramp
  { x0: 24, y0: 17, x1: 30, y1: 24, m: B.MUDSTONE },
  { x0: 14, y0: 0, x1: 30, y1: 4, m: B.ROOTS },
];

const nA = makeNoise2D(71), nB = makeNoise2D(72);
function cellMatAt(x, y) {
  // wobble the region borders so nothing reads as a rectangle
  const wx = x + nA.fbm(x * 0.35, y * 0.35, 2) * 2.2, wy = y + nB.fbm(x * 0.35, y * 0.35, 2) * 2.2;
  let m = B.DIRT;
  for (const r of MATS) if (wx >= r.x0 && wx < r.x1 && wy >= r.y0 && wy < r.y1) m = r.m;
  return m;
}

function airness(x, y) {
  let a = 0;
  for (const s of AIR) {
    const [x0, y0, x1, y1] = s.c;
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
    let t = L2 ? ((x - x0) * dx + (y - y0) * dy) / L2 : 0;
    t = clamp(t, 0, 1);
    const d = Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t));
    a = Math.max(a, clamp(0.5 + (s.r - d) / 0.7, 0, 1));
  }
  return a;
}

export function generateIntro(seed) {
  ensureOrePalettes();
  const w = new MineWorld(0, W, H);
  w.intro = true;
  const rng = makeRng(seed || 1234);
  const cellMat = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = w.idx(x, y);
    cellMat[i] = cellMatAt(x + 0.5, y + 0.5);
    w.back[i] = isGranular(cellMat[i]) ? B.DIRT : cellMat[i];
  }
  const { WX, WY, NW, NH } = warpFields(w, seed, 13);
  const A = new Float32Array(NW * NH);
  for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) A[j * NW + i] = airness((i * NODE) / M, (j * NODE) / M);
  const plan = { seed, cellMat, mode: 'mask', A, WX, WY, region: { x0: 1, y0: 1, x1: W - 1, y1: H - 1 }, features: [], growth: { cover: 0.5 } };
  const gen = new ChunkGen(w, plan);
  w.gen = gen;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w.block[w.idx(x, y)] = airness(x + 0.5, y + 0.5) > 0.5 ? B.AIR : cellMat[w.idx(x, y)];

  const F = plan.features;
  const fillRect = (x0, y0, x1, y1, mat, test) => F.push({ kind: 'fill', mat, x0: Math.floor(x0 * M), y0: Math.floor(y0 * M), x1: Math.ceil(x1 * M), y1: Math.ceil(y1 * M), test: test || (() => true) });
  // rubble: the cave-in that trapped you, piled against the right side of your pocket
  fillRect(8.3, 23.6, 11.4, 27.6, B.RUBBLE, (x, y, cur) => !cur && (x / M - 8.3) * 0.9 + (27.6 - y / M) * 0.55 < 2.6 + tn(x, y, 8, 3) * 0.6);
  fillRect(13.5, 25.8, 16.8, 27.4, B.RUBBLE, (x, y, cur) => !cur && Math.hypot((x / M - 15.1) / 1.7, (y / M - 27.3) / 0.75) < 1 + (tn(x, y, 8, 5) - 0.5) * 0.3);
  // collapsed plug in the old tunnel
  fillRect(18.8, 24.6, 21.0, 27.4, B.RUBBLE, (x, y, cur) => !cur && tn(x, y, 8, 7) > 0.18);
  // old boards nailed across the gallery's far end: the way out
  fillRect(41.4, 3.6, 43.2, 7.2, B.BOARDS, () => true);
  // plugs you have to dig through
  fillRect(35.4, 8.1, 38.8, 9.5, B.CLAY, (x, y, cur) => !cur);
  // old timber posts and beams along the gallery
  for (const px of [33.2, 36.4, 39.6]) {
    fillRect(px - 0.14, 4.0, px + 0.14, 6.9, B.TIMBER, (x, y, cur) => !cur);
    fillRect(px - 0.7, 4.0, px + 0.7, 4.32, B.TIMBER, (x, y, cur) => !cur || cur === B.LOAM || cur === B.ROOTS);
  }
  // a few hanging roots and drips of stone
  for (const [x, y, len] of [[5.2, 24.7, 22], [15.6, 24.7, 26], [26.6, 12.6, 18], [33.8, 4.3, 16], [38.2, 4.3, 24]]) F.push(rootFeature(x * M, y * M, len, rng.int(1, 99)));
  for (const [x, y, len] of [[34.0, 11.0, 26], [36.2, 11.2, 18]]) F.push(spikeFeature(x * M, y * M, len, 6, 1, B.STONE));
  // bedrock border
  F.push({ kind: 'fill', mat: B.BEDROCK, back: B.BEDROCK, x0: 0, y0: 0, x1: w.MW, y1: M, test: (x, y) => y < 12 + tn(x, y, 16, 9) * 18 });
  F.push({ kind: 'fill', mat: B.BEDROCK, back: B.BEDROCK, x0: 0, y0: w.MH - M, x1: w.MW, y1: w.MH, test: (x, y) => y > w.MH - 12 - tn(x, y, 16, 9) * 18 });
  F.push({ kind: 'fill', mat: B.BEDROCK, back: B.BEDROCK, x0: 0, y0: 0, x1: M, y1: w.MH, test: (x, y) => x < 12 + tn(x, y, 16, 9) * 18 });
  F.push({ kind: 'fill', mat: B.BEDROCK, back: B.BEDROCK, x0: w.MW - M, y0: 0, x1: w.MW, y1: w.MH, test: (x, y) => x > w.MW - 10 - tn(x, y, 16, 9) * 8 });
  // something shiny to learn careful digging on
  const dep = (item, x, y, q) => planDeposit(w, plan, ORE_ID[item], x * M, y * M, q, rng.int(1, 1e6));
  dep('copper_ore', 14.6, 24.3, 92);
  dep('copper_ore', 17.2, 27.5, 86);
  dep('coal', 6.4, 28.0, 90);
  dep('quartz', 21.0, 19.5, 95);
  dep('fossil', 4.2, 13.4, 96);
  dep('tin_ore', 27.4, 15.9, 88);
  dep('copper_ore', 38.6, 15.0, 90);
  // water in the pool cave
  for (let y = 13; y <= 15; y++) for (let x = 33; x <= 37; x++) {
    const i = w.idx(x, y);
    if (w.block[i] === B.AIR) { w.fluid[i] = 1; w.ftype[i] = 1; }
  }
  w.spawn = { x: 4.6, y: 26.4 };
  w.stations = [];
  settleFluids(w, 120);
  // everything is small enough to build up front
  for (let cy = 0; cy < w.CH; cy++) for (let cx = 0; cx < w.CW; cx++) gen.chunk(cx, cy);

  const plants = [
    { type: 'glowcap', x: 7, y: 26, side: 'floor' }, { type: 'glowcap', x: 2, y: 25, side: 'wallL' },
    { type: 'carrot', x: 12, y: 26, side: 'floor' }, { type: 'fern', x: 17, y: 26, side: 'floor' },
    { type: 'glowcap', x: 21, y: 21, side: 'wallL' }, { type: 'glowcap', x: 23, y: 17, side: 'wallR' },
    { type: 'glowcap', x: 6, y: 16, side: 'floor' }, { type: 'glowcap', x: 10, y: 16, side: 'floor' }, { type: 'carrot', x: 8, y: 16, side: 'floor' },
    { type: 'whisper', x: 27, y: 13, side: 'ceil' }, { type: 'glowcap', x: 33, y: 15, side: 'floor' }, { type: 'fern', x: 38, y: 13, side: 'floor' },
    { type: 'glowcap', x: 32, y: 6, side: 'floor' }, { type: 'carrot', x: 35, y: 6, side: 'floor' },
  ];
  const creatures = [
    { type: 'earthworm', x: 9.5, y: 22.5 }, { type: 'earthworm', x: 19.5, y: 21.5 }, { type: 'mole_cricket', x: 15.5, y: 26.5 },
    { type: 'dust_bunny', x: 34.5, y: 6.2 }, { type: 'earthworm', x: 29.5, y: 7.5 },
  ];
  const intro = { nugget: { x: 7.4, y: 16.2 }, exit: { x0: 41.4, y0: 3.6, x1: 43.2, y1: 7.2 }, lantern: { x: 44.3, y: 5.0 } };
  return { world: w, plants, creatures, gen, intro };
}

// ---------------------------------------------------------------- the opening's little director
export class IntroController {
  constructor(scene, data) {
    this.s = scene;
    this.d = data;
    this.t = 0;
    this.wake = 0;
    this.found = scene.state.flag('nugget') === true && scene.state.flag('introNugget') === true;
    this.clucks = 2.5;
    this.trail = [];
    this.exiting = false;
    this.boards0 = 0;
    // Nugget: a little voxel hen, lit like the mole
    const hen = makeChicken({ hat: 'straw', scale: 0.55, kind: 'basic' });
    this.hen = hen;
    this.henMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    hen.root.traverse((o) => { if (o.isMesh) o.material = this.henMat; });
    scene.scene.add(hen.root);
    this.henPos = { x: data.nugget.x, y: data.nugget.y, vy: 0, facing: 1 };
    hen.play('sit');
    // count the boards so we know when they're broken
    const w = scene.world, e = data.exit;
    for (let y = Math.floor(e.y0 * M); y < e.y1 * M; y++) for (let x = Math.floor(e.x0 * M); x < e.x1 * M; x++) if (w.pmat(x, y) === B.BOARDS) this.boards0++;
  }

  start() {
    const s = this.s, g = s.game;
    this.wake = 0.001;
    s.player.rig.play('sleep');
    s.audio.play('rumble_hit');
    s.audio.play('trickle');
    s.shake(0.25);
    setTimeout(() => { if (g.scene === s) s.fx.dustCloud(s.player.x + 1.5, s.player.y - 0.8, 2.2, [0.6, 0.55, 0.5]); }, 300);
    // the last pebbles of the cave-in still dropping from the ceiling
    for (let k = 0; k < 5; k++) {
      setTimeout(() => {
        if (g.scene !== s) return;
        const cx = (s.player.x + rand(-1.6, 2.6)) * M, cy = (s.player.y - 1.25) * M;
        const r = rand(1.6, 3.4), pix = [];
        for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= r * r) pix.push({ x: Math.round(cx + x), y: Math.round(cy + y), c: pixelColor(B.RUBBLE, 2 + ((x * 3 + y * 5) & 7)) });
        s.bodies.spawn(pix, { vx: rand(-0.4, 0.4), vy: -rand(0, 1), vz: rand(-0.3, 0.3), min: 3 });
        s.fx.trickle(cx / M - 0.5, cy / M);
      }, 250 + k * rand(250, 700));
    }
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (!coarse) g.ui.setHints('<kbd>A</kbd><kbd>D</kbd> move · <kbd>W</kbd>/<kbd>Space</kbd> jump &amp; climb · <kbd>Mouse</kbd> dig · walk into a wall to dig up close · <kbd>1</kbd>–<kbd>8</kbd> tools · <kbd>Q</kbd> snack');
    else g.ui.setHints('Stick to walk and climb · tap the rock to dig · push into a wall to dig up close');
    setTimeout(() => { if (g.scene === s) g.ui.setHints(null); }, 60000);
  }

  locked() { return (this.wake > 0 && this.wake < 2.6) || this.exiting; }
  blockTools() { return this.locked(); }

  lampScale() {
    if (this.wake <= 0 || this.wake >= 2.6) return 1;
    // the helmet lamp sputters to life
    const k = clamp((this.wake - 0.9) / 1.4, 0, 1);
    const flick = this.wake > 0.9 && this.wake < 2.2 ? (Math.sin(this.wake * 37) > 0.2 ? 1 : 0.25) : 1;
    return Math.max(0.05, k * flick);
  }

  nearHen(r = 1.4) {
    const p = this.s.player;
    return Math.hypot(p.x - this.henPos.x, p.y - this.henPos.y) < r;
  }

  interact() {
    if (this.nearHen(1.6)) { this.meet(); return true; }
    return false;
  }
  hit(t, kind) {
    if (Math.hypot(t.mx - this.henPos.x, t.my - this.henPos.y) < 0.6) {
      this.s.audio.play('bawk');
      this.hen.flap(0.6);
      if (!this.found) this.meet();
      return true;
    }
    return false;
  }
  grab(t) {
    if (Math.hypot(t.mx - this.henPos.x, t.my - this.henPos.y) < 0.8 || this.nearHen(1.2)) { this.meet(); return true; }
    return false;
  }
  prompt() {
    if (!this.found && this.nearHen(1.8) && this.henReachable()) return '<kbd>E</kbd> Nugget!';
    return null;
  }
  henReachable() {
    const w = this.s.world, p = this.s.player;
    // line of sight through open pixels between the mole and the hen
    const n = 20;
    for (let i = 1; i < n; i++) {
      const x = lerp(p.x, this.henPos.x, i / n), y = lerp(p.y - 0.1, this.henPos.y - 0.2, i / n);
      if (w.solidPt(x, y)) return false;
    }
    return true;
  }

  meet() {
    const s = this.s, st = s.state;
    if (this.found) {
      // a pat on the head
      s.audio.play('cluck', { n: 2 });
      s.fx.hearts(this.henPos.x, this.henPos.y - 0.3);
      s.player.rig.doEmote('happy', 1.2);
      return;
    }
    if (!this.henReachable()) return;
    this.found = true;
    st.flag('nugget', true);
    st.flag('introNugget', true);
    s.audio.play('bawk');
    s.audio.play('discover');
    this.hen.flap(1.4);
    s.player.rig.doEmote('happy', 2.2);
    this.hen.play('idle');
    s.fx.hearts(this.henPos.x, this.henPos.y - 0.3);
    s.fx.sparkle(this.henPos.x, this.henPos.y - 0.2, [1, 0.9, 0.6]);
    const p = s.screen(this.henPos.x, this.henPos.y - 0.9);
    s.game.ui.bubble('nugget', 'BAWK! ♥', p.x, p.y, { life: 2.2 });
    s.game.ui.toast('<b>Nugget!</b> Your hen squeezes out of her pocket and won\'t leave your side.', { kind: 'good', dur: 4500 });
    this.henPos.vy = -4;
  }

  update(dt) {
    const s = this.s, pl = s.player, w = s.world;
    this.t += dt;
    if (this.wake > 0 && this.wake < 2.6) {
      this.wake += dt;
      if (this.wake < 1.6) pl.rig.play('sleep');
      if (this.wake > 1.6 && this.wake - dt <= 1.6) { s.audio.play('yawn'); s.audio.play('glow'); }
      if (this.wake >= 2.6) {
        const p = s.screen(pl.x, pl.y - 1.1);
        s.game.ui.bubble('mole', '...the tunnel came down. Which way is up?', p.x, p.y, { life: 3.4 });
      }
    }
    // Nugget clucks from behind the rock until you find her
    if (!this.found) {
      this.clucks -= dt;
      const dx = this.henPos.x - pl.x, dy = this.henPos.y - pl.y;
      const dist = Math.hypot(dx, dy);
      if (this.clucks <= 0 && dist < 16 && this.wake >= 2.6) {
        this.clucks = rand(2.6, 5.5);
        const vol = clamp(0.09 * (1 - dist / 17), 0.012, 0.09);
        const pan = clamp(dx / 8, -1, 1);
        const n = 1 + (Math.random() * 3) | 0;
        for (let i = 0; i < n; i++) {
          const f = rand(500, 650);
          s.audio.tone({ f, f2: f * 0.7, type: 'square', dur: 0.05, vol, delay: i * 0.11, filter: 'bandpass', ff: 1400, q: 2, pan });
        }
        if (dist < 7) this.hen.peck();
      }
      this.henIdle(dt);
    } else this.follow(dt);
    // the hen model
    const L = s.lighting.sample(this.henPos.x, this.henPos.y - 0.2);
    const amb = s.renderer.U.ambient.value;
    this.henMat.color.setRGB(clamp(amb.r * 2.2 + L[0] * 1.15, 0.08, 1.6), clamp(amb.g * 2.2 + L[1] * 1.15, 0.08, 1.6), clamp(amb.b * 2.2 + L[2] * 1.15, 0.08, 1.6));
    this.hen.root.position.set(this.henPos.x, -this.henPos.y - 0.02, 0.15);
    this.hen.face(this.henPos.facing > 0 ? 1.1 : -1.1);
    this.hen.root.visible = !(s.face.hidesPlayer() && this.found && Math.abs(this.henPos.x - pl.x) < 0.8);
    this.hen.update(dt);
    // the boards at the end
    if (!this.exiting) {
      const e = this.d.exit;
      let left = 0;
      if (Math.floor(this.t * 4) !== Math.floor((this.t - dt) * 4)) {
        for (let y = Math.floor(e.y0 * M); y < e.y1 * M; y += 2) for (let x = Math.floor(e.x0 * M); x < e.x1 * M; x += 2) if (w.pmat(x, y) === B.BOARDS) left++;
        this.boardsLeft = left * 4;
      }
      const near = Math.abs(pl.x - (e.x0 - 0.4)) < 2.5 && pl.y > e.y0 - 1 && pl.y < e.y1 + 1;
      const through = pl.x > e.x0 + 0.15 && pl.y > e.y0 - 0.5 && pl.y < e.y1 + 0.5;
      if (through || (this.boardsLeft !== undefined && this.boardsLeft < this.boards0 * 0.3 && near)) this.escape();
      // town noise through the boards
      if (near && chance(dt * 0.6)) s.audio.play('babble', { pitch: rand(0.8, 1.3), n: 2 });
    }
  }

  henIdle(dt) {
    const h = this.henPos, w = this.s.world;
    // settle onto the floor of her pocket
    h.vy = Math.min(h.vy + 18 * dt, 8);
    const ny = h.y + h.vy * dt;
    if (w.solidPt(h.x, ny + 0.02)) { let g = 0; let y = ny; while (w.solidPt(h.x, y + 0.02) && g++ < 40) y -= 1 / M; h.y = y; h.vy = 0; } else h.y = ny;
    if (chance(dt * 0.3)) h.facing = -h.facing;
  }

  follow(dt) {
    const s = this.s, pl = s.player, h = this.henPos, w = s.world;
    this.trailT = (this.trailT || 0) - dt;
    if (this.trailT <= 0) { this.trailT = 0.08; this.trail.push({ x: pl.x - pl.facing * 0.55, y: pl.y + 0.42 }); if (this.trail.length > 40) this.trail.shift(); }
    const tgt = this.trail.length > 10 ? this.trail[this.trail.length - 10] : this.trail[0];
    if (!tgt) return;
    const dx = tgt.x - h.x;
    const dist = Math.hypot(dx, tgt.y - h.y);
    if (dist > 6) { h.x = tgt.x; h.y = tgt.y - 0.02; h.vy = 0; s.fx.dust(h.x, h.y - 0.2, 4); return; }
    const speed = clamp(dist * 3, 0, 5);
    if (Math.abs(dx) > 0.1) { h.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt); h.facing = Math.sign(dx); }
    // hop up ledges toward the trail, fall down to floors
    if (tgt.y < h.y - 0.35 && h.vy >= 0 && w.solidPt(h.x, h.y + 0.04)) h.vy = -5.2;
    h.vy = Math.min(h.vy + 20 * dt, 9);
    let ny = h.y + h.vy * dt;
    if (h.vy > 0 && w.solidPt(h.x, ny + 0.02)) { let g = 0; while (w.solidPt(h.x, ny + 0.02) && g++ < 40) ny -= 1 / M; h.vy = 0; }
    else if (h.vy < 0 && w.solidPt(h.x, ny - 0.45)) h.vy = 0;
    if (w.solidPt(h.x, ny - 0.2)) { h.x = tgt.x; ny = tgt.y - 0.02; }
    h.y = ny;
    this.hen.play(Math.abs(dx) > 0.15 ? 'walk' : 'idle');
    if (Math.abs(dx) < 0.15 && chance(dt * 0.25)) this.hen.peck();
  }

  escape() {
    const s = this.s, st = s.state, g = s.game;
    if (this.exiting) return;
    this.exiting = true;
    s.face.exit('leave');
    s.audio.play('gate');
    s.audio.play('bell');
    s.audio.play('fanfare');
    s.post.flash = 0.7;
    s.post.flashColor = 0xffe0a0;
    s.fx.dustCloud(this.d.exit.x0 + 0.6, (this.d.exit.y0 + this.d.exit.y1) / 2, 2, [0.85, 0.75, 0.6]);
    st.flag('escaped', true);
    if (!this.found) {
      // she wasn't going to be left behind: Nugget comes flapping out of the dark at the last moment
      this.found = true;
      const pl = s.player;
      this.henPos.x = pl.x - 1.4 * (pl.facing || 1);
      this.henPos.y = pl.y;
      this.hen.flap(1.4);
      s.audio.play('bawk');
    }
    st.flag('nugget', true);
    st.learn('elevator');
    st.save();
    setTimeout(() => {
      if (g.scene !== s) return;
      g.goto('town', { from: 'escape' }, { transition: 'fade', dur: 1.2, color: 0xfff0d0 });
    }, 1400);
  }

  lights(out) {
    const L = this.d.lantern;
    const flick = 0.85 + Math.sin(this.t * 9) * 0.06 + Math.sin(this.t * 23) * 0.04;
    out.push({ x: L.x, y: L.y, r: 1.2 * flick, g: 0.8 * flick, b: 0.42 * flick, radius: 4.2, pierce: 2 });
    if (!this.found) out.push({ x: this.henPos.x, y: this.henPos.y - 0.4, r: 0.18, g: 0.16, b: 0.1, radius: 1.6, noOcc: true });
  }

  render() {}

  dispose() {
    const s = this.s;
    if (this.hen.root.parent) this.hen.root.parent.remove(this.hen.root);
    this.henMat.dispose();
    s.game.ui.hideBubble('nugget');
    s.game.ui.hideBubble('mole');
  }
}

export { CPX, ORES, isSolid };
