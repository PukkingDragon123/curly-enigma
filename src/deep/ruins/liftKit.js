// The lift stations' fittings (the stone, planks and rails are voxels: gen/lifts.js): a lever on a
// stone post beside the car (E: pull it, the lift map opens), a plank sign with the station's name
// and depth on the back wall (E: read it), and two wall torches. Built when the mole comes near,
// dropped when far, like the dungeons (Ruins.js runs both).
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { openLiftPanel, discoverLift } from '../../fps/lifts.js';
import * as MD from './models.js';

const R_BUILD = 18, R_DROP = 26;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Where the fittings go round a lift (world metres, yaw of the model's +z). */
function fittings(L, plan) {
  const { x, y, z } = L;
  if (L.id[0] === 's') {
    // a stop on the town shaft: the shaft is west (-x), the way out east (+x)
    return {
      lever: { x: x - 0.25, y, z: z + 1.2, yaw: Math.PI },
      sign: { x: x + 0.15, y: y + 1.5, z: z - 1.5, yaw: 0 },
      torches: [{ x: x + 0.55, y: y + 1.2, z: z - 1.5, yaw: 0 }, { x: x + 0.55, y: y + 1.2, z: z + 1.5, yaw: Math.PI }],
    };
  }
  void plan;
  return {
    lever: { x: x + 1.12, y, z: z + 0.35, yaw: -Math.PI / 2 },
    sign: { x, y: y + 1.55, z: z - 1.5, yaw: 0 },
    torches: [{ x: x - 1.5, y: y + 1.25, z: z - 0.55, yaw: Math.PI / 2 }, { x: x + 1.5, y: y + 1.25, z: z - 0.55, yaw: -Math.PI / 2 }],
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
    // the lever: a stone post, the handle on a pivot
    const lv = new THREE.Group();
    lv.position.set(F.lever.x, F.lever.y, F.lever.z);
    lv.rotation.y = F.lever.yaw;
    g.add(lv);
    add(MD.liftLeverBase(), R.mat, lv);
    const pv = new THREE.Group();
    pv.position.set(0, 20 / 32, 0);
    pv.rotation.x = -0.6;
    lv.add(pv);
    add(MD.liftLeverHandle(), R.mat, pv);
    it.handle = pv;
    // the sign
    const lines = (L.name.length > 13 ? splitName(L.name) : [L.name]).concat([`${L.depth} M`]);
    const sg = add(MD.plankSign(lines));
    sg.position.set(F.sign.x, F.sign.y, F.sign.z);
    sg.rotation.y = F.sign.yaw;
    // the torches
    it.flames = F.torches.map((t) => {
      const tg = new THREE.Group();
      tg.position.set(t.x, t.y, t.z);
      tg.rotation.y = t.yaw;
      g.add(tg);
      add(MD.torch(), R.mat, tg);
      const fl = add(MD.torchFlame(), R.flameMat, tg);
      fl.position.set(0, 10 / 32, 5 / 32);
      fl.layers.disable(LAYER_OUTLINE);
      const w = new THREE.Vector3();
      fl.updateWorldMatrix(true, false);
      return { fl, t: Math.random() * 7, w };
    });
    R.root.add(g);
    it.group = g;
    it.built = true;
    g.updateMatrixWorld(true);
    for (const f of it.flames) f.fl.getWorldPosition(f.w);
    const lp = new THREE.Vector3(F.lever.x, F.lever.y + 0.72, F.lever.z);
    const sp = new THREE.Vector3(F.sign.x, F.sign.y, F.sign.z + (L.id[0] === 's' ? 0.05 : 0.05));
    it.els = [
      { pos: lp, r: 0.32, label: 'Pull the lever: ride the lift', use: () => this.pull(it) },
      { pos: sp, r: 0.4, label: 'Read the sign', use: () => this.read(it) },
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

  /** Pull the lever: it clunks down, the lift map opens (ride from there). */
  pull(it) {
    const R = this.R, D = R.owner, L = it.L, pv = it.handle;
    R.sfx.lever();
    if (pv) this.anim = { t: 0, dur: 1.4, fn: (k) => { const t = Math.min(1, k) * 1.4; pv.rotation.x = t < 0.25 ? -0.6 + 1.2 * ease(t / 0.25) : t < 1.1 ? 0.6 : 0.6 - 1.2 * ease((t - 1.1) / 0.3); } };
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
    return [{ say: `The sign reads: <b>${L.name}</b> · ${L.depth} m down. Pull the lever to ride.`, key: 'liftsign', tone: 'good', cd: 0.5 }];
  }

  update(dt, eye) {
    for (const it of this.list) {
      const L = it.L, d = Math.hypot(L.x - eye.x, (L.y + 1 - eye.y) * 1.3, L.z - eye.z);
      if (!it.built && d < R_BUILD) this.build(it);
      else if (it.built && d > R_DROP) this.drop(it);
      if (!it.built) continue;
      for (const f of it.flames) {
        f.t += dt;
        f.fl.scale.set(1 + Math.sin(f.t * 9) * 0.1, 1 + Math.sin(f.t * 13) * 0.15, 1);
        if (d < 12 && Math.random() < dt * 4) this.R.fx.ember(f.w.x + (Math.random() - 0.5) * 0.04, f.w.y + 0.1, f.w.z + (Math.random() - 0.5) * 0.04);
      }
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
