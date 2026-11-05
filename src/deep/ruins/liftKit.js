// The lifts' fittings (the alcove, the shaft and the cage's plank floor are voxels: gen/lifts.js):
// the cage hanging on its rope in the rough shaft, a brass bell on the cage's post (E: ring it, the
// lift map opens), a name board on the cage's back (E: read it) and a lantern hung inside. A stop
// on the town shaft has a timber gantry at the shaft's edge instead, the rope running down the
// middle of the shaft. Built when the mole comes near, dropped when far, like the dungeons
// (Ruins.js runs both).
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { openLiftPanel, discoverLift } from '../../fps/lifts.js';
import * as MD from './models.js';

const R_BUILD = 18, R_DROP = 26;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Where the fittings go round a lift (world metres, yaw of the model's +z). */
function fittings(L, plan) {
  const { x, y, z } = L;
  void plan;
  if (L.id[0] === 's') {
    // a stop on the town shaft: the shaft is west (-x), the way out east (+x); a gantry at its edge
    return {
      stop: true,
      gantry: { x: x - 1.25, y, z },
      lever: { x: x - 1.15, y: y + 1.05, z: z + 0.55, yaw: Math.PI / 2 }, // the bell, under the beam
      sign: { x: x - 1.05, y: y + 1.7, z: z - 0.2, yaw: Math.PI / 2 },
      lantern: { x: x - 1.25, y: y + 2.15, z: z - 0.62 },
      rope: { x: x - 2.6, y: y - 0.4, z, len: 9 },
    };
  }
  return {
    cage: { x, y, z },
    lever: { x: x + 0.56, y: y + 1.12, z: z + 0.6, yaw: -Math.PI / 2 }, // the bell, on the front post
    sign: { x, y: y + 1.5, z: z - 0.64, yaw: 0 },
    lantern: { x: x - 0.42, y: y + 1.98, z: z - 0.45 },
    rope: { x, y: y + 37 / 16, z, len: 3.8 },
  };
}

export class LiftKit {
  constructor(R) {
    this.R = R;
    this.list = (R.plan.lifts || []).map((L) => ({ L, F: fittings(L, R.plan), built: false, els: [], group: null, geos: [] }));
  }

  build(it) {
    const R = this.R, L = it.L, F = it.F;
    const g = new THREE.Group();
    g.name = 'lift-' + L.id;
    const add = (geo, mat = R.mat, parent = g) => { const m = new THREE.Mesh(geo, mat); m.layers.enable(LAYER_OUTLINE); parent.add(m); it.geos.push(geo); return m; };
    // the cage on its rope (or, at a stop on the town shaft, the gantry at the shaft's edge)
    if (F.cage) { const c = add(MD.liftCage()); c.position.set(F.cage.x, F.cage.y, F.cage.z); }
    if (F.gantry) { const c = add(MD.liftGantry()); c.position.set(F.gantry.x, F.gantry.y, F.gantry.z); }
    const rp = add(MD.liftRope(F.rope.len));
    rp.position.set(F.rope.x, F.rope.y, F.rope.z);
    rp.layers.disable(LAYER_OUTLINE);
    // the bell: it swings on its yoke when rung
    const bl = new THREE.Group();
    bl.position.set(F.lever.x, F.lever.y, F.lever.z);
    bl.rotation.y = F.lever.yaw;
    g.add(bl);
    const pv = new THREE.Group();
    bl.add(pv);
    add(MD.liftBell(), R.mat, pv);
    it.handle = pv;
    // the name board
    const lines = (L.name.length > 13 ? splitName(L.name) : [L.name]).concat([`${L.depth} M`]);
    const sg = add(MD.plankSign(lines));
    sg.position.set(F.sign.x, F.sign.y, F.sign.z);
    sg.rotation.y = F.sign.yaw;
    // the lantern
    const ln = new THREE.Group();
    ln.position.set(F.lantern.x, F.lantern.y, F.lantern.z);
    g.add(ln);
    add(MD.liftLantern(), R.mat, ln);
    const fl = add(MD.liftLanternGlow(), R.flameMat, ln);
    fl.layers.disable(LAYER_OUTLINE);
    it.lantern = ln;
    it.flames = [{ fl, t: Math.random() * 7, w: new THREE.Vector3(), ember: false }];
    R.root.add(g);
    it.group = g;
    it.built = true;
    g.updateMatrixWorld(true);
    for (const f of it.flames) f.fl.getWorldPosition(f.w);
    const lp = new THREE.Vector3(F.lever.x, F.lever.y - 0.25, F.lever.z);
    const sp = new THREE.Vector3(F.sign.x, F.sign.y, F.sign.z);
    it.els = [
      { pos: lp, r: 0.3, label: 'Ring the bell: ride the lift', use: () => this.pull(it) },
      { pos: sp, r: 0.4, label: 'Read the board', use: () => this.read(it) },
    ];
  }

  drop(it) {
    if (!it.built) return;
    this.R.root.remove(it.group);
    for (const g of it.geos) g.dispose();
    it.geos = [];
    it.els = [];
    it.group = null;
    it.built = false;
  }

  /** Ring the bell: it swings and clangs, the lift map opens (ride from there). */
  pull(it) {
    const R = this.R, D = R.owner, L = it.L, pv = it.handle;
    R.sfx.bell();
    if (pv) this.anim = { t: 0, dur: 1.6, fn: (k) => { const t = Math.min(1, k); pv.rotation.z = Math.sin(t * 19) * 0.55 * (1 - ease(t)); } };
    if (!D?.game) return [{ handled: true }];
    if (discoverLift(R.st, L)) D.liftFound?.(L);
    setTimeout(() => {
      if (D.leaving || D.game.scene !== D) return;
      openLiftPanel(D.game, L.id, { title: L.name, sub: `${L.depth} m · a lift station. Where to?`, onRide: (id) => (D.rideLift ? D.rideLift(id) : null) });
    }, 280);
    return [{ handled: true }];
  }
  read(it) {
    const L = it.L;
    this.R.st?.emit?.('act', { type: 'look', at: 'signpost' });
    return [{ say: `The board reads: <b>${L.name}</b> · ${L.depth} m down. Ring the bell to ride.`, key: 'liftsign', tone: 'good', cd: 0.5 }];
  }

  update(dt, eye) {
    for (const it of this.list) {
      const L = it.L, d = Math.hypot(L.x - eye.x, (L.y + 1 - eye.y) * 1.3, L.z - eye.z);
      if (!it.built && d < R_BUILD) this.build(it);
      else if (it.built && d > R_DROP) this.drop(it);
      if (!it.built) continue;
      for (const f of it.flames) {
        f.t += dt;
        const k = 1 + Math.sin(f.t * 9) * 0.05 + Math.sin(f.t * 23) * 0.03;
        f.fl.scale.set(k, k, k);
      }
      if (it.lantern) it.lantern.rotation.z = Math.sin(this.R.time * 0.9 + L.x) * 0.04;
    }
    if (this.anim) { const a = this.anim; a.t += dt; a.fn(a.t / a.dur); if (a.t >= a.dur) this.anim = null; }
  }

  /** Elements under the crosshair (for Ruins.pick). */
  *elements() { for (const it of this.list) if (it.built) yield* it.els; }

  dispose() { for (const it of this.list) this.drop(it); }
}

function splitName(n) {
  const at = n.indexOf(' ', Math.floor(n.length / 2) - 3);
  const i = at > 0 ? at : n.lastIndexOf(' ');
  return i > 0 ? [n.slice(0, i), n.slice(i + 1)] : [n];
}

export { ease };
