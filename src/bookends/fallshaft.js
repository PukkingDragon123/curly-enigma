// The opening fall's shaft: a ~50 m natural sinkhole below the meadow, seen from inside while
// the mole and Nugget tumble down it. Eight 1/16 relief faces (an octagon) per depth band: an
// undercut funnel under the hole, then Rootsoil (roots, worm holes, pebbles), Clayworks (banded
// terracotta, fossils), a wet stone stretch with an underground waterfall, the Crystal Grotto
// (glowing crystal seams and glow worms), and old packed earth over an abandoned burrow whose
// roof boards make the floor. The ledges they bounce off are placed where the fall puts them.
// Walls stream in 4 m bands (prebuild / ensure) so nothing ever blocks a frame for long.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { meshRelief, hash3, fshade, fmix } from './vox.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { makeNoise2D, clamp, lerp } from '../core/util.js';
import { PIX } from './fx.js';

const VS = 1 / 16;
const BAND = 64; // rows per mesh band (4 m)
const PATCH = [0.94, 1, 1.06];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Depth zones of the fall (y is up; the meadow is at 0). */
export const FALL_ZONES = { rootsoil: -12, clay: -22, wet: -33, crystal: -45 };

function zoneOf(y) {
  if (y > FALL_ZONES.rootsoil) return 0;
  if (y > FALL_ZONES.clay) return 1;
  if (y > FALL_ZONES.wet) return 2;
  if (y > FALL_ZONES.crystal) return 3;
  return 4;
}

const ROCK = [
  [0x5a3e2a, 0x4e3624, 0x664632, 0x463020], // rootsoil
  [0xb8603a, 0xc8743f, 0x9a4e30, 0xd88a50], // clay
  [0x4e5a66, 0x5a6672, 0x46525e, 0x627080], // wet stone
  [0x4a5274, 0x5c6890, 0x3c4464, 0x505a80], // crystal grotto
  [0x6a4a32, 0x58402c, 0x7c5a3c, 0x4e3626], // old packed earth
];

/**
 * opts: { floorY, ledges: [{face, u, y, reach, w}], waterfall: {face, u, yTop, yBot} }
 * Returns { group, prebuild(ms), ensure(y), builtTo, update(dt), glowworms, stats }
 */
export function buildFallShaft(opts) {
  const { floorY, ledges = [], waterfall = null } = opts;
  const group = new THREE.Group();
  group.name = 'fall-shaft';
  const n1 = makeNoise2D(41), n2 = makeNoise2D(42), n3 = makeNoise2D(43), n4 = makeNoise2D(44);
  const ROCK_MAT = voxelMaterial('toon'), GLOW_MAT = voxelMaterial('basic');
  const sections = [
    { y0: -0.9, y1: -8.5, R0: 4.3 }, // the undercut funnel below the sinkhole
    { y0: -8.5, y1: floorY - 0.4, R0: 3.0 },
  ];
  const wormPts = [];
  const threads = [];
  let tris = 0;

  /** Inner radius the rock surface sits at, before detail. */
  const radiusAt = (y) => {
    if (y > -8.5) return lerp(3.95, 2.45, smooth(-1, -8.5, y));
    let r = 2.45;
    r += 0.25 * smooth(FALL_ZONES.clay + 2, FALL_ZONES.clay - 1, y) * (1 - smooth(FALL_ZONES.wet + 1, FALL_ZONES.wet - 2, y)); // the wet cavern
    r += 0.12 * smooth(FALL_ZONES.wet, FALL_ZONES.wet - 3, y); // the grotto
    r -= 0.12 * smooth(floorY + 5, floorY + 1, y); // pinches in over the burrow
    return r;
  };

  function makeFace(sec, fi) {
    const th = (fi * Math.PI) / 4;
    const nO = [Math.cos(th), 0, Math.sin(th)], tg = [-Math.sin(th), 0, Math.cos(th)];
    const hw = sec.R0 * Math.tan(Math.PI / 8) + 2 * VS;
    const W = Math.ceil((2 * hw) / VS), rows = Math.round((sec.y0 - sec.y1) / VS);
    const n = W * rows;
    return {
      sec, fi, th, nO, tg, hw, W, rows, gen: 0,
      h: new Uint16Array(n), top: new Uint32Array(n), base: new Uint32Array(n), gh: new Uint16Array(n), gc: new Uint32Array(n),
      origin: [nO[0] * sec.R0 - tg[0] * hw, sec.y0, nO[2] * sec.R0 - tg[2] * hw],
      U: [tg[0] * VS, 0, tg[2] * VS], V: [0, -VS, 0], N: [-nO[0] * VS, 0, -nO[2] * VS],
    };
  }

  /** Fill rows [k0, k1) of a face's heightfield. */
  function genRows(F, k0, k1) {
    const { sec, W, fi, th, hw } = F;
    const myLedges = ledges.filter((L) => L.face === fi);
    const wf = waterfall && waterfall.face === fi ? waterfall : null;
    for (let k = k0; k < Math.min(k1, F.rows); k++) {
      const y = sec.y0 - (k + 0.5) * VS;
      const z = zoneOf(y);
      const pal = ROCK[z];
      const rBase = radiusAt(y);
      for (let i = 0; i < W; i++) {
        const u = -hw + (i + 0.5) * VS;
        const s = (th + Math.atan2(u, sec.R0)) * 2.7; // arc coordinate, continuous between faces
        const q = i + W * k;
        // strata bands that step in and out, lumps, a fine knobbly skin
        const by = y + n1(s * 0.12, 3.3) * 1.1;
        const bandH = z === 1 ? 0.6 : z === 4 ? 0.9 : 1.2;
        const band = Math.floor(by / bandH);
        let d = rBase - (hash3(band, z, 7, 9) - 0.5) * 0.24 - n2(s * 0.35, y * 0.35) * 0.3 - Math.max(0, n3(s * 0.6, y * 0.6)) * 0.35;
        let c = pal[((band % pal.length) + pal.length) % pal.length];
        c = fshade(c, PATCH[(hash3(i >> 1, k >> 1, fi, 1) * 3) | 0]);
        let glow = 0;
        const hh = hash3(i, k, fi, 2);
        if (z === 0 || z === 4) {
          const root = Math.abs(n4(s * 0.25, y * 0.6));
          if (root < 0.02) c = hh < 0.5 ? 0x9a7650 : 0x7e5e40;
          else if (root < 0.03) c = fshade(c, 0.78);
          else if (hh < 0.004) { c = 0x2a1a12; d += 0.1; } // worm holes
          else if (hh > 0.99) c = 0x8a8278; // pebbles
          if (z === 0 && y > -2.2 && n3(s * 1.4, y * 2) > 0.2) c = hh < 0.5 ? 0x3e2a1c : 0x4a3424; // dark topsoil
        } else if (z === 1) {
          const seam = by - band * bandH;
          if (seam < VS * 1.5) c = fshade(c, 0.78);
          const fos = hash3(Math.floor(s * 0.8), Math.floor(y * 0.5), 3, 4);
          if (fos < 0.04 && Math.abs(n4(s * 3, y * 3)) < 0.05) c = 0xe8d8b0; // shell fossils
        } else if (z === 2) {
          const wet = n2(s * 0.5 + 9, y * 0.2) > 0.05;
          if (wet) c = fshade(fmix(c, 0x2a3644, 0.35), hh < 0.05 ? 1.5 : 1); // wet streaks with glints
          if (n3(s * 0.9, y * 0.9) > 0.32) c = hh < 0.5 ? 0x3e6a3a : 0x4a7a40; // moss
        } else if (z === 3) {
          const geo = n3(s * 0.45 + 7, y * 0.45 + 3);
          if (geo > 0.3) { c = 0x1a1a30; d += 0.1; if (hash3(i >> 1, k >> 1, 5, 7) < 0.12) glow = hh < 0.5 ? 0x9ad8ff : 0x6ab0ff; }
          else if (geo > 0.22) glow = hh < 0.5 ? 0x7fd0ff : 0xbfe6ff;
          else if (hh < 0.002) glow = 0xd0f0ff;
        }
        if (!glow && Math.abs(n4(s * 0.7 + 9, y * 0.7)) < 0.01) c = fshade(c, 0.58); // cracks (colour only: cheap)
        // the waterfall: a mouth it pours from, wet rock behind the sheet, a basin ledge below
        if (wf && Math.abs(u - wf.u) < 0.85) {
          const e = Math.abs(u - wf.u) / 0.85;
          if (y < wf.yTop + 0.5 && y > wf.yTop - 0.5 && e < 0.8) { d += 0.5; c = 0x141c22; }
          else if (y <= wf.yTop - 0.5 && y > wf.yBot) c = (k + i) % 3 ? 0x2e4250 : 0x4a6a80;
          if (y <= wf.yBot + 0.02 && y > wf.yBot - 0.6) {
            const reach = 0.95 * (1 - e * e) * (1 - (wf.yBot - y) / 0.6);
            if (reach > 0) { d = Math.min(d, rBase - reach); c = y > wf.yBot - 0.08 ? 0x6a8aa0 : 0x46525e; }
          }
        }
        // ledges the fall needs: a flat top, a wedge underneath, rounded ends
        for (const L of myLedges) {
          const du = Math.abs(u - L.u) / (L.w / 2);
          if (du > 1 || y > L.y + 0.02 || y < L.y - 0.6) continue;
          const t = 1 - (L.y - y) / 0.6;
          const reach = (1 - du * du) * (0.35 + 0.65 * t);
          const r = lerp(rBase, L.reach, reach);
          if (r < d) {
            d = r;
            c = y > L.y - 0.1 ? (z === 3 ? 0x9ad8ff : z === 0 ? 0x5a8a3a : fshade(pal[0], 1.25)) : fshade(pal[1], 0.9);
            glow = z === 3 && y > L.y - 0.1 && hh < 0.4 ? 0xbfe6ff : 0;
          }
        }
        // the rock's own relief steps in 1/8 m (half as many contour walls); ledges keep 1/16
        const ledgeHit = d < rBase - 0.45;
        let lv = clamp(ledgeHit ? Math.round((sec.R0 - d) / VS) : Math.round((sec.R0 - d) / (2 * VS)) * 2, 2, 900);
        // the funnel under the hole falls into shadow, so from the meadow the sinkhole looks deep
        const gloom = y > -8.5 ? lerp(1, 0.5, smooth(-1, -5.5, y)) : 1;
        F.base[q] = fshade(pal[((band % pal.length) + pal.length) % pal.length], gloom); // walls: plain band colour, so they merge into long strips
        if (glow) { lv = Math.max(2, lv - 1); F.gh[q] = lv; F.gc[q] = glow; F.top[q] = 0; } else F.top[q] = fshade(c, gloom);
        F.h[q] = lv;
        // glow worms in the grotto: lights on the rock, some on silk threads hanging off overhangs
        if (z === 3 && !glow && hh > 0.9965) {
          const rr = (sec.R0 - lv * VS) - 0.04;
          const ang = th + Math.atan2(u, sec.R0);
          const px = Math.cos(ang) * rr, pz = Math.sin(ang) * rr;
          const col = hh > 0.9985 ? 0x9affd8 : 0x5ae0ff;
          wormPts.push({ pos: [px, y, pz], color: col, size: 1, big: 2, speed: 0.6 + (hh * 1000 % 1) * 1.2, phase: hh * 997, sharp: 2, base: 0.35, amp: 0.65 });
          if (hh > 0.9982) threads.push({ x: px * 0.97, z: pz * 0.97, y, len: 0.25 + (hh * 7919 % 1) * 0.7, col });
        }
      }
    }
    F.gen = Math.max(F.gen, Math.min(k1, F.rows));
  }

  function sideFor(F) {
    return (q, y, dir) => {
      const c = F.base[q];
      if (dir === 2) return fshade(c, 1.14); // upward faces (V points down here): lit ledge tops
      if (dir === 3) return fshade(c, 0.7); // undersides
      return fshade(c, 0.88);
    };
  }

  function boundsMerge(parts) {
    if (!parts.length) return null;
    const g = parts.length > 1 ? mergeGeometries(parts) : parts[0];
    if (parts.length > 1) {
      const box = new THREE.Box3();
      for (const p of parts) { box.union(p.boundingBox); p.dispose(); }
      g.boundingBox = box;
      g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    }
    return g;
  }

  /** The floor: packed earth over the old burrow, crossed by its weathered roof boards. */
  function buildFloor() {
    const R = 3.1, Wf = Math.ceil((2 * R) / VS);
    const h = new Uint16Array(Wf * Wf), top = new Uint32Array(Wf * Wf);
    for (let k = 0; k < Wf; k++) for (let i = 0; i < Wf; i++) {
      const x = -R + (i + 0.5) * VS, z = -R + (k + 0.5) * VS;
      if (Math.hypot(x, z) > R) continue;
      const q = i + Wf * k;
      let lv = 6 + Math.round(n2(x * 1.2, z * 1.2) * 1.5);
      const hh = hash3(i, k, 9, 1);
      let c = fshade(hh < 0.5 ? 0x5a3e2a : 0x4e3624, PATCH[(hash3(i >> 1, k >> 1, 9, 2) * 3) | 0]);
      if (Math.abs(n4(x * 0.5, z * 0.9)) < 0.025) { c = 0x8a6a48; lv += 1; } // roots
      // three roof boards, grey and split, with rusty nails
      for (let b = 0; b < 3; b++) {
        const cz = -0.75 + b * 0.62 + (b === 1 ? 0.04 : 0);
        if (Math.abs(z - cz) < 0.24 && Math.abs(x + (b - 1) * 0.3) < 1.9 - b * 0.3) {
          const edge = Math.abs(z - cz) > 0.2;
          c = edge ? 0x5a4a3c : ((Math.floor(x * 6 + b) % 5) === 0 ? 0x6a5a4a : 0x7a6a58);
          if (Math.abs(Math.abs(x) - 1.2) < 0.04 && Math.abs(z - cz) < 0.06) c = 0x8a4a2a;
          if (Math.abs(n1(x * 3 + b, 5)) < 0.03) c = 0x3a2a20; // splits
          lv = 8;
        }
      }
      if (hh > 0.99) { c = 0x8a8278; lv += 1; }
      h[q] = lv;
      top[q] = c;
    }
    // the middle (where they land) is its own piece so it can give way
    const hIn = new Uint16Array(Wf * Wf);
    for (let k = 0; k < Wf; k++) for (let i = 0; i < Wf; i++) {
      const x = -R + (i + 0.5) * VS, z = -R + (k + 0.5) * VS;
      if (Math.hypot(x, z) < 1.05 + n1(Math.atan2(z, x) * 3, 4) * 0.25) { hIn[i + Wf * k] = h[i + Wf * k]; h[i + Wf * k] = 0; }
    }
    const opt = { W: Wf, D: Wf, top, side: (q) => fshade(top[q], 0.8), U: [VS, 0, 0], V: [0, 0, VS], N: [0, VS, 0], origin: [-R, floorY - 0.5, -R] };
    const outer = new THREE.Mesh(meshRelief({ ...opt, h }), ROCK_MAT);
    const inner = new THREE.Mesh(meshRelief({ ...opt, h: hIn }), ROCK_MAT);
    outer.name = 'burrow-roof';
    inner.name = 'burrow-roof-middle';
    tris += outer.geometry.index.count / 3 + inner.geometry.index.count / 3;
    const g = new THREE.Group();
    g.add(outer, inner);
    g.userData.middle = inner;
    return g;
  }

  // ---- streaming: bands top to bottom, rows generated one band ahead of the meshing
  const faces = sections.map((sec) => Array.from({ length: 8 }, (_, fi) => makeFace(sec, fi)));
  let builtTo = 0; // lowest y covered by built meshes
  let floor = null, floorMiddle = null;
  function* build() {
    for (const secFaces of faces) {
      const rows = secFaces[0].rows;
      for (let b0 = 0; b0 < rows; b0 += BAND) {
        for (const F of secFaces) {
          const want = Math.min(rows, b0 + 2 * BAND);
          while (F.gen < want) { genRows(F, F.gen, Math.min(want, F.gen + 8)); yield 'rows'; } // thin slices
        }
        const rock = [], glow = [];
        for (const F of secFaces) for (let h0 = b0; h0 < Math.min(rows, b0 + BAND); h0 += BAND / 2) {
          const rws = [h0, Math.min(rows, h0 + BAND / 2)];
          const g = meshRelief({ W: F.W, D: rows, h: F.h, top: F.top, side: sideFor(F), U: F.U, V: F.V, N: F.N, origin: F.origin, rows: rws, wallAO: false });
          if (g.attributes.position.count) rock.push(g);
          const gg = meshRelief({ W: F.W, D: rows, h: F.gh, top: F.gc, U: F.U, V: F.V, N: F.N, origin: F.origin, rows: rws, walls: false, ao: false });
          if (gg.attributes.position.count) glow.push(gg);
          yield 'mesh';
        }
        const gr = boundsMerge(rock), gg = boundsMerge(glow);
        if (gr) { group.add(new THREE.Mesh(gr, ROCK_MAT)); tris += gr.index.count / 3; }
        if (gg) { group.add(new THREE.Mesh(gg, GLOW_MAT)); tris += gg.index.count / 3; }
        builtTo = secFaces[0].sec.y0 - Math.min(rows, b0 + BAND) * VS;
        yield 'merge';
      }
      for (const F of secFaces) { F.h = F.top = F.base = F.gh = F.gc = null; } // done with this section
    }
    floor = buildFloor();
    group.add(floor);
    for (const m of floor.children) group.attach(m); // flat list: the scene culls meshes one by one
    floorMiddle = floor.userData.middle;
    builtTo = -Infinity;
  }
  const gen = build();
  let done = false, ms = 0;
  const worst = {}; // the slowest slice of each kind (for tuning)
  const prebuild = (budget = 3) => {
    if (done) return true;
    const t0 = performance.now(), end = t0 + budget;
    do {
      const a = performance.now();
      const r = gen.next();
      const d = performance.now() - a;
      if (r.value && d > (worst[r.value] || 0)) worst[r.value] = +d.toFixed(2);
      if (r.done) { done = true; break; }
    } while (performance.now() < end); // at least one slice per call
    ms += performance.now() - t0;
    return done;
  };
  /** Make sure the walls reach down to height y (blocks only if the builder fell behind). */
  const ensure = (y) => { while (!done && builtTo > y) prebuild(6); };

  // ---- glow worms: pulsing lights and silk threads with beads, made once the grotto is built
  const glowworms = { points: null, lines: null, update: () => {} };
  const makeWorms = () => {
    if (glowworms.points || !wormPts.length) return;
    const tw = new TwinkleLite(wormPts);
    glowworms.points = tw.points;
    group.add(tw.points);
    const pos = [], col = [];
    const cc = new THREE.Color();
    for (const t of threads) {
      pos.push(t.x, t.y, t.z, t.x, t.y - t.len, t.z);
      cc.set(t.col).multiplyScalar(0.35);
      col.push(0.5, 0.6, 0.65, cc.r, cc.g, cc.b);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    glowworms.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }));
    group.add(glowworms.lines);
    // a bead of light at the end of each thread
    const beads = threads.map((t) => ({ pos: [t.x, t.y - t.len, t.z], color: t.col, size: 2, speed: 1.1, phase: t.len * 31, sharp: 2, base: 0.45, amp: 0.55 }));
    const tb = new TwinkleLite(beads);
    group.add(tb.points);
    glowworms.update = (dt) => { tw.update(dt); tb.update(dt); };
  };
  const update = (dt) => {
    if (!glowworms.points && (done || builtTo < FALL_ZONES.crystal)) makeWorms();
    glowworms.update(dt);
  };

  return {
    group, prebuild, ensure, update, glowworms,
    get builtTo() { return builtTo; },
    get done() { return done; },
    /** The roof boards they crash through (hide it on impact). */
    get floorMiddle() { return floorMiddle; },
    stats: () => ({ ms: Math.round(ms), tris: Math.round(tris), worst }),
  };
}

/** Minimal pulsing points (one draw): like fx Twinkles but without the size/shape swaps. */
class TwinkleLite {
  constructor(pts) {
    this.pts = pts;
    this.t = 0;
    const n = pts.length;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    const c = new THREE.Color();
    pts.forEach((p, i) => {
      this.pos.set(p.pos, i * 3);
      c.set(p.color);
      this.col[i * 4] = c.r; this.col[i * 4 + 1] = c.g; this.col[i * 4 + 2] = c.b; this.col[i * 4 + 3] = 1;
      this.size[i] = p.size ?? 1;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uPix: PIX },
      vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float uPix; varying vec4 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.0, floor(aSize * uPix * clamp(6.0 / max(0.5, -mv.z), 0.6, 2.5) + 0.5)); vC = aColor; }`,
      fragmentShader: 'varying vec4 vC; void main(){ if (vC.a < 0.02) discard; gl_FragColor = vC; }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  update(dt) {
    this.t += dt;
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      const w = Math.max(0, Math.sin(this.t * p.speed + p.phase));
      this.col[i * 4 + 3] = clamp(p.base + Math.pow(w, p.sharp) * p.amp, 0, 1);
    }
    this.geo.attributes.aColor.needsUpdate = true;
  }
}
