// CHOP: the ingredient lies on the board with dotted guide lines. The knife follows the
// mouse along x; click to chop. Each chop takes the nearest uncut line and scores by distance.
// The voxel ingredient is really split at the knife, so sloppy cuts make uneven pieces.
import { Step, V3, THREE } from './base.js';
import { spriteCells, slabMesh, mainColor, itemName } from '../food.js';
import { dashTex } from '../tex.js';
import { crumbs, sparkle } from '../fx.js';
import { BOARD_TOP } from '../kitchen.js';
import { clamp, damp } from '../../core/util.js';

const PX = 0.046;
const DEPTH = 3;
const GAP = 0.032;
const EDGE = new THREE.Vector3(-0.0125, -0.0875, 0.49); // knife-local point on the edge, mid-blade
const _v = new THREE.Vector3();

export class ChopStep extends Step {
  get station() { return 'board'; }
  get title() { return 'CHOP!'; }
  get hint() { return '<kbd>Click</kbd> when the knife is on a dotted line'; }

  begin() {
    this.limit = 11;
    this.item = this.opts.item;
    this.sprite = spriteCells(this.item, { horizontal: true });
    const { x0, x1, z0, z1 } = this.sprite;
    this.cx = (x0 + x1 + 1) / 2;
    const S = this.S;
    this.base = V3(S.x, BOARD_TOP, S.z - 0.04);
    this.top = BOARD_TOP + DEPTH * PX;
    this.color = mainColor(this.item);
    // guide lines at column boundaries
    const w = x1 - x0 + 1;
    const n = clamp(Math.round(w / 2.3), 4, 6);
    const seen = new Set();
    this.lines = [];
    for (let k = 1; k <= n; k++) {
      const b = clamp(x0 + Math.round((k * w) / (n + 1)), x0 + 1, x1);
      if (seen.has(b)) continue;
      seen.add(b);
      this.lines.push({ b, x: this.bx(b), cut: false, score: 0 });
    }
    const len = (z1 - z0 + 1) * PX + 0.14;
    const tex = dashTex();
    tex.repeat.set(1, len / 0.1);
    for (const L of this.lines) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.016, len), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(L.x, this.top + 0.004, this.base.z);
      m.renderOrder = 3;
      L.mesh = this.temp(m);
    }
    this.cuts = [];
    this.offsets = new Map();
    this.pieces = [];
    this.group = this.temp(new THREE.Group());
    this.rebuild();
    // knife in the right paw
    this.knife = this.borrow('knife');
    this.knifeX = this.bx(x1 + 2.5);
    this.roll = 0.75;
    this.chopT = -1;
    this.misses = 0;
    this.finishT = -1;
    this.R.speed = 40;
    this.placeKnife(this.top + 0.11);
  }

  /** World x of an icon column boundary. */
  bx(b) { return this.base.x + (b - this.cx) * PX; }

  rebuild() {
    for (const p of this.pieces) { p.mesh.parent?.remove(p.mesh); p.mesh.geometry.dispose(); }
    const { x0, x1 } = this.sprite;
    const bounds = [x0, ...[...this.cuts].sort((a, b) => a - b), x1 + 1];
    const segs = [];
    for (let i = 0; i + 1 < bounds.length; i++) if (bounds[i + 1] > bounds[i]) segs.push([bounds[i], bounds[i + 1]]);
    const n = segs.length;
    this.pieces = segs.map(([a, b], i) => {
      const mesh = slabMesh(this.sprite, { px: PX, depth: DEPTH, cols: [a, b] });
      this.group.add(mesh);
      // inherit the current offset of the piece this one came from
      let cur = 0;
      for (const [start, off] of this.offsets) if (start <= a) cur = off;
      return { a, b, mesh, off: cur, target: (i - (n - 1) / 2) * GAP, hop: 0 };
    });
    this.offsets = new Map(this.pieces.map((p) => [p.a, p.off]));
  }

  placeKnife(edgeY) {
    const k = this.knife;
    k.rotation.set(0, Math.PI, this.roll);
    k.updateMatrix();
    _v.copy(EDGE).applyQuaternion(k.quaternion);
    k.position.set(this.knifeX - _v.x, edgeY - _v.y, this.base.z - _v.z);
  }

  tick(dt, live) {
    const { x0, x1 } = this.sprite;
    // knife follows the mouse along x
    if (live) {
      const m = this.mouseAt(this.top + 0.1);
      if (m) this.knifeX = clamp(m.x, this.bx(x0) - 0.18, this.bx(x1 + 1) + 0.18);
      if (this.chopT < 0 && this.finishT < 0 && this.pressed()) { this.chopT = 0; this.didCut = false; }
    }
    // chop animation: down fast, bite, back up
    let edgeY = this.top + 0.11;
    let roll = 0.75;
    if (this.chopT >= 0) {
      this.chopT += dt;
      const t = this.chopT;
      const low = BOARD_TOP + 0.004;
      if (t < 0.07) { const k = t / 0.07; edgeY = this.top + 0.11 + (low - this.top - 0.11) * k * k; roll = 0.75 - 0.45 * k; }
      else if (t < 0.13) { edgeY = low; roll = 0.3; if (!this.didCut) { this.didCut = true; this.cut(); } }
      else if (t < 0.32) { const k = (t - 0.13) / 0.19; edgeY = low + (this.top + 0.11 - low) * (1 - (1 - k) * (1 - k)); roll = 0.3 + 0.45 * k; }
      else this.chopT = -1;
    }
    this.roll = roll;
    this.placeKnife(edgeY);
    // pieces slide apart, with a little hop
    for (const p of this.pieces) {
      p.off = damp(p.off, p.target, 10, dt);
      p.hop = Math.max(0, p.hop - dt * 3);
      p.mesh.position.set(this.base.x + p.off, this.base.y + Math.sin(p.hop * Math.PI) * 0.03, this.base.z);
      this.offsets.set(p.a, p.off);
    }
    // lines glow when the knife is on them
    for (const L of this.lines) {
      L.mesh.visible = !L.cut;
      const near = Math.abs(L.x + this.pieceShift(L.b) - this.knifeX) < PX * 0.55;
      L.mesh.material.color.set(near ? 0xffd84a : 0xffffff);
      L.mesh.position.x = L.x + this.pieceShift(L.b);
    }
    // paws: right holds the knife handle, left steadies the food
    const k = this.knife.position;
    this.R.goal.set(k.x + 0.02, k.y + 0.07, k.z + 0.06);
    this.R.setPose({ pitch: 0.75, roll: 0.25, yaw: 0.2 });
    const left = this.pieces[0];
    const lx = this.bx(x0) + (left ? left.off : 0) - 0.07;
    const press = this.chopT >= 0 && this.chopT < 0.2 ? -0.012 : 0;
    this.L.goal.set(Math.min(lx - 0.12, this.knifeX - 0.45), this.top + 0.07 + press, this.base.z + 0.1);
    this.L.setPose({ pitch: 0.8, roll: 0.35, yaw: 1.05 });
    if (this.finishT >= 0) {
      this.finishT += dt;
      if (this.finishT > 0.45) this.finish(this.total());
    }
  }

  /** Visual shift of a boundary as pieces spread (average of the two neighbours). */
  pieceShift(b) {
    let l = 0, r = 0;
    for (const p of this.pieces) {
      if (p.a <= b - 1 && b - 1 < p.b) l = p.off;
      if (p.a <= b && b < p.b) r = p.off;
    }
    return (l + r) / 2;
  }

  cut() {
    const kx = this.knifeX;
    const { x0, x1 } = this.sprite;
    const audio = this.audio;
    const impact = V3(kx, this.top, this.base.z + 0.05);
    this.cook.shake(0.006);
    // off the food entirely?
    if (kx < this.bx(x0) - PX * 0.5 || kx > this.bx(x1 + 1) + PX * 0.5) {
      audio.play('chop');
      audio.play('clunk', { vol: 0.5 });
      this.misses++;
      this.float('Miss!', impact, '#ff9a8a');
      return;
    }
    let best = null, bd = 1e9;
    for (const L of this.lines) {
      if (L.cut) continue;
      const d = Math.abs(L.x + this.pieceShift(L.b) - kx);
      if (d < bd) { bd = d; best = L; }
    }
    if (!best) return;
    const dpx = bd / PX;
    best.cut = true;
    best.score = dpx <= 0.35 ? 100 : clamp(100 - (dpx - 0.35) * 55, 0, 100);
    // where the blade really landed (column boundary under the knife)
    let b = clamp(Math.round((kx - this.base.x - this.pieceShift(best.b)) / PX + this.cx), x0 + 1, x1);
    if (this.cuts.includes(b)) b = best.b;
    if (!this.cuts.includes(b)) this.cuts.push(b);
    this.rebuild();
    for (const p of this.pieces) if (p.a === b || p.b === b) p.hop = 1;
    audio.play('chop');
    crumbs(this.fx, impact, this.color, 7, BOARD_TOP);
    const word = best.score >= 90 ? 'Perfect!' : best.score >= 65 ? 'Nice!' : best.score >= 35 ? 'Okay' : 'Wonky';
    const col = best.score >= 90 ? '#ffe066' : best.score >= 65 ? '#9af07a' : best.score >= 35 ? '#9fdcff' : '#ff9a8a';
    this.float(word, V3(kx, this.top + 0.12, this.base.z), col);
    if (best.score >= 90) sparkle(this.fx, impact, 6);
    if (this.lines.every((L) => L.cut)) this.finishT = 0;
  }

  total() {
    const avg = this.lines.reduce((s, L) => s + L.score, 0) / Math.max(1, this.lines.length);
    return avg - this.misses * 6;
  }

  timeout() { this.finish(this.total()); }

  end() {
    // record what was chopped for later steps (pot chunks, pan pieces)
    const f = this.cook.food;
    f.chunks.push(this.color);
    f.pieces = { item: this.item, sprite: this.sprite, cuts: this.cuts.slice() };
    f.chopped.push(this.item);
    // leave the pieces piled at the back of the board
    this.cook.leftover(this.group, this.item);
    this.objs = this.objs.filter((o) => o !== this.group);
    this.R.speed = 14;
    super.end();
  }

  get name() { return itemName(this.item); }
}
