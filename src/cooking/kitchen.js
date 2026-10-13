// The kitchen set: red plank wall, shelves, round window, hanging herbs, honey-wood counter,
// cast-iron stove with burners and flames, and all the props the minigames use.
import * as THREE from 'three';
import * as M from './models.js';
import { wallPlanksTex, counterTex, beamTex, caveViewTex, nuggetPortraitTex, chalkboardTex } from './tex.js';
import { setOutline } from '../gfx/Voxel.js';
import { makeRng } from '../core/util.js';

const PS = M.PS;

/** Station points on the counter (y = 0 is the counter top). */
export const SPOTS = {
  bowl: new THREE.Vector3(-2.3, 0, -0.15),
  cup: new THREE.Vector3(-1.4, 0, -0.1),
  board: new THREE.Vector3(0, 0, -0.1),
  plate: new THREE.Vector3(1.02, 0, -0.08),
  pot: null, // filled from the stove burners
  pan: null,
};
export const WALL_Z = -1.3;
export const BOARD_TOP = 0.075;
export const STOVE = { x0: 1.55, x1: 3.45, top: 0.04 };

export class Kitchen {
  constructor(root) {
    this.root = root;
    this.t = 0;
    this.sway = [];
    this.flames = [[], []];
    this.burnerOn = [0, 0];
    this.burnerHeat = [0, 0];
    this.buildLights();
    this.buildRoom();
    this.buildStove();
    this.buildWallDecor();
    this.buildProps();
  }

  add(obj, x, y, z, ry = 0) {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    this.root.add(obj);
    return obj;
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xffe2c0, 0x3a2418, 1.05);
    this.root.add(hemi);
    const key = new THREE.DirectionalLight(0xfff0dc, 1.15);
    key.position.set(-2.5, 4, 3.5);
    this.root.add(key);
    this.root.add(key.target);
    this.key = key;
    const fire = new THREE.PointLight(0xffa060, 0, 2.0, 2);
    fire.position.set(2, 0.25, -0.1);
    this.root.add(fire);
    this.fireLight = fire;
  }

  buildRoom() {
    // back wall
    const wallW = 12, wallH = 3.2;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(wallW, wallH), new THREE.MeshLambertMaterial({ map: wallPlanksTex([wallW / 4, wallH / 3]) }));
    wall.position.set(0, wallH / 2 - 0.3, WALL_Z);
    this.root.add(wall);
    // counter top (left part and right part around the stove)
    const mkCounter = (x0, x1) => {
      const w = x1 - x0, d = 0.85 - WALL_Z;
      const t = counterTex([w / 4, d / 2]);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), [
        new THREE.MeshLambertMaterial({ color: 0x6a4228 }), new THREE.MeshLambertMaterial({ color: 0x6a4228 }),
        new THREE.MeshLambertMaterial({ map: t }), new THREE.MeshLambertMaterial({ color: 0x3a2414 }),
        new THREE.MeshLambertMaterial({ color: 0x7a4c2c }), new THREE.MeshLambertMaterial({ color: 0x6a4228 }),
      ]);
      m.position.set((x0 + x1) / 2, -0.15, (WALL_Z + 0.85) / 2);
      this.root.add(m);
      return m;
    };
    mkCounter(-6.5, STOVE.x0);
    mkCounter(STOVE.x1, 6.5);
    // front trim of the counter (darker lip, gives a crisp edge at the bottom of the view)
    const lip = new THREE.Mesh(new THREE.BoxGeometry(13, 0.06, 0.08), new THREE.MeshLambertMaterial({ color: 0x5a3420 }));
    lip.position.set(0, -0.02, 0.86);
    this.root.add(lip);
    // backsplash rail where counter meets wall
    const rail = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 0.06), new THREE.MeshLambertMaterial({ map: beamTex([12, 1]) }));
    rail.position.set(0, 0.04, WALL_Z + 0.03);
    this.root.add(rail);
    // ceiling beam + posts
    const beam = new THREE.Mesh(new THREE.BoxGeometry(12, 0.22, 0.22), new THREE.MeshLambertMaterial({ map: beamTex([8, 1]) }));
    beam.position.set(0, 2.35, WALL_Z + 0.11);
    this.root.add(beam);
    for (const x of [-4.7, -0.95, 3.75]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.12), new THREE.MeshLambertMaterial({ color: 0x4a2c18 }));
      post.position.set(x, 1.3, WALL_Z + 0.06);
      this.root.add(post);
    }
    // vines along the beam
    const rng = makeRng(12);
    for (let i = 0; i < 26; i++) {
      const v = M.vine(rng.int(8, 26), i + 3);
      v.scale.setScalar(1.2);
      this.add(v, -5.5 + i * 0.44 + rng.range(-0.1, 0.1), 2.27, WALL_Z + 0.24);
      this.sway.push({ obj: v, amp: 0.05, sp: rng.range(0.6, 1.2), ph: rng.range(0, 6), axis: 'z' });
    }
  }

  buildStove() {
    const w = STOVE.x1 - STOVE.x0, d = 0.85 - WALL_Z - 0.05;
    const top = M.stoveTop(w, d);
    top.group.position.set((STOVE.x0 + STOVE.x1) / 2, STOVE.top, WALL_Z + 0.05 + d / 2);
    this.root.add(top.group);
    this.stove = top;
    this.burners = top.burners.map((b) => new THREE.Vector3(top.group.position.x + b.x, STOVE.top, top.group.position.z + b.z));
    SPOTS.pot = this.burners[0].clone();
    SPOTS.pan = this.burners[1].clone();
    // stove body below the top (dark iron box, seen only at the front edge)
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), new THREE.MeshLambertMaterial({ color: 0x1e1a1c }));
    body.position.set(top.group.position.x, STOVE.top - 0.4, top.group.position.z);
    this.root.add(body);
    // back panel with a heat dial, and the stovepipe
    const back = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, 0.1), new THREE.MeshLambertMaterial({ color: 0x2a2628 }));
    panel.position.set(0, 0.16, 0);
    back.add(panel);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.04, 0.12), new THREE.MeshLambertMaterial({ color: 0xd8a840 }));
    trim.position.set(0, 0.33, 0);
    back.add(trim);
    back.position.set(top.group.position.x, STOVE.top, WALL_Z + 0.06);
    this.root.add(back);
    for (let i = 0; i < 2; i++) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8), new THREE.MeshLambertMaterial({ color: 0xd8a840 }));
      knob.rotation.x = Math.PI / 2;
      knob.position.set(this.burners[i].x, STOVE.top + 0.16, WALL_Z + 0.13);
      setOutline(knob, true);
      this.root.add(knob);
    }
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 2.6, 10), new THREE.MeshLambertMaterial({ color: 0x2a2628 }));
    pipe.position.set(STOVE.x1 - 0.3, 1.55, WALL_Z + 0.2);
    setOutline(pipe, true);
    this.root.add(pipe);
    for (const y of [0.9, 1.7]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.05, 10), new THREE.MeshLambertMaterial({ color: 0x4a4648 }));
      band.position.set(STOVE.x1 - 0.3, y, WALL_Z + 0.2);
      this.root.add(band);
    }
    // flames around each burner
    for (let b = 0; b < 2; b++) {
      const n = 14;
      for (let i = 0; i < n; i++) {
        const f = M.flameTongue();
        const a = (i / n) * Math.PI * 2;
        const r = 0.29 + (i % 2) * 0.025;
        f.position.set(this.burners[b].x + Math.cos(a) * r, STOVE.top + 0.005, this.burners[b].z + Math.sin(a) * r);
        f.rotation.y = -a;
        f.visible = false;
        f.userData = { a, ph: Math.random() * 10, sp: 9 + Math.random() * 7 };
        this.root.add(f);
        this.flames[b].push(f);
      }
    }
  }

  buildWallDecor() {
    const z = WALL_Z;
    // left shelves with jars
    const s1 = M.shelf(3.3); this.add(s1, -4.6, 0.62, z);
    const s2 = M.shelf(3.3); this.add(s2, -4.6, 1.42, z);
    const jarSpecs = [
      [0x5ab8ff, { cloth: 0x3a6ac9, fill: 0.8 }], [0xe8a0a0, { lid: 'cork', fill: 0.6 }], [0xf2a32c, { label: true }],
      [0xf6eedc, { cloth: 0x6aa84a, h: 14 }], [0x8a6a3a, { lid: 'cork', r: 3.4 }], [0x6aa84a, { label: true, fill: 0.5 }],
      [0xd94a3a, { cloth: 0xe0b030, r: 3.6, h: 10 }], [0xc9a6ff, { lid: 'cork', fill: 0.85 }],
    ];
    let x = -4.4;
    for (let i = 0; i < 10; i++) {
      const [c, o] = jarSpecs[i % jarSpecs.length];
      const j = i % 4 === 3 ? M.bottle([0x3a7a4a, 0x7a3a2a, 0x3a5a8a][i % 3]) : i % 5 === 4 ? M.crock(i % 2 ? 0x9a6a4a : 0x7a8a6a) : M.jar(c, o);
      this.add(j, x, 0.62, z + 0.12, (i % 3 - 1) * 0.3);
      x += 0.3 + (i % 3) * 0.04;
    }
    x = -4.4;
    for (let i = 0; i < 9; i++) {
      const [c, o] = jarSpecs[(i + 3) % jarSpecs.length];
      const j = i % 3 === 1 ? M.bottle([0x5a3a7a, 0x3a7a4a, 0x8a5a2a][i % 3]) : M.jar(c, { ...o, h: 10 + (i % 3) * 2 });
      this.add(j, x, 1.42, z + 0.12, (i % 3 - 1) * 0.3);
      x += 0.34 + (i % 2) * 0.05;
    }
    // round window
    const win = M.windowFrame(0.42);
    this.add(win, 0.1, 1.08, z + 0.05);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ map: caveViewTex() }));
    glass.position.set(0.1, 1.08, z + 0.02);
    this.root.add(glass);
    this.add(M.potPlant(0x5aa84a, true), -0.05, 0.6, z + 0.12);
    // hanging rod with herbs and garlic
    const rod = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 0.04), new THREE.MeshLambertMaterial({ color: 0x6a4228 }));
    rod.position.set(0.15, 1.98, z + 0.32);
    setOutline(rod, true);
    this.root.add(rod);
    const herbCols = [0x6a8a3a, 0x8a7a3a, 0x7a5a8a, 0x5a7a3a, 0xa0803a, 0x6a9a5a];
    for (let i = 0; i < 7; i++) {
      const hx = -1.0 + i * 0.38;
      const h = i % 3 === 2 ? M.garlicBraid(3 + (i % 2)) : M.herbBundle(herbCols[i % herbCols.length], i + 1);
      h.scale.setScalar(1.15);
      this.add(h, hx, 1.98, z + 0.32);
      this.sway.push({ obj: h, amp: 0.06, sp: 0.8 + i * 0.07, ph: i, axis: 'z' });
    }
    // Nugget's portrait & chalkboard
    const port = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.42), new THREE.MeshLambertMaterial({ map: nuggetPortraitTex() }));
    port.position.set(-0.75, 0.62, z + 0.015);
    port.rotation.z = 0.04;
    setOutline(port, true);
    this.root.add(port);
    const chalk = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.64), new THREE.MeshLambertMaterial({ map: chalkboardTex() }));
    chalk.position.set(4.6, 1.05, z + 0.015);
    setOutline(chalk, true);
    this.root.add(chalk);
    // over the stove: a utensil rail with a ladle and pans
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.03, 0.03), new THREE.MeshLambertMaterial({ color: 0xd8a840 }));
    rail.position.set(2.25, 1.62, z + 0.1);
    setOutline(rail, true);
    this.root.add(rail);
    const ld = M.ladle(); ld.scale.setScalar(1.2); this.add(ld, 1.8, 1.62, z + 0.12);
    const hp = M.hangingPan(); this.add(hp, 2.3, 1.62, z + 0.08);
    const ld2 = M.ladle(); this.add(ld2, 2.75, 1.62, z + 0.12);
    this.sway.push({ obj: ld, amp: 0.04, sp: 1.1, ph: 1, axis: 'z' }, { obj: ld2, amp: 0.05, sp: 1.3, ph: 2, axis: 'z' });
    // right side: spice rack, garlic
    this.add(M.spiceRack(), 4.4, 0.42, z + 0.01);
    const gb = M.garlicBraid(4); gb.scale.setScalar(1.2); this.add(gb, 3.95, 1.9, z + 0.14);
    // counter clutter (kept away from the stations)
    this.add(M.sack(0xe8dcc0), -3.35, 0, -0.75, 0.4);
    this.add(M.utensilCrock(), -1.85, 0, -1.0);
    this.add(M.candle(), 1.32, 0, -0.95);
    this.add(M.potPlant(0x6aa84a), -3.1, 0, -1.0);
    this.add(M.crock(0x7a8a6a), 4.0, 0, -0.85, 0.5);
    this.add(M.sack(0xd8c8a0), 4.6, 0, -0.5, -0.5);
  }

  buildProps() {
    const P = (this.props = {});
    P.board = this.add(M.cuttingBoard(), SPOTS.board.x, BOARD_TOP, SPOTS.board.z);
    P.bowl = this.add(M.bowl(), SPOTS.bowl.x, 0, SPOTS.bowl.z);
    P.mug = this.add(M.mug(), SPOTS.cup.x, 0, SPOTS.cup.z, -0.4);
    P.plate = this.add(M.plate(), SPOTS.plate.x, 0, SPOTS.plate.z);
    P.pot = this.add(M.pot(), SPOTS.pot.x, STOVE.top + 0.03, SPOTS.pot.z);
    P.pan = this.add(M.pan(), SPOTS.pan.x, STOVE.top + 0.03, SPOTS.pan.z, -0.35);
    P.knife = this.add(M.knife(), SPOTS.board.x + 0.36, BOARD_TOP + 0.012, SPOTS.board.z - 0.26, -1.25);
    P.knife.rotation.z = Math.PI / 2;
    P.spoon = this.add(M.spoon(), 1.65, 0.05, 0.62, 0.3);
    P.spatula = this.add(M.spatula(), 3.6, 0.03, 0.3, -0.2);
    P.shaker = this.add(M.saltShaker(), 1.38, 0, -0.55);
    P.jug = this.add(M.jug(), -0.95, 0, -0.8, 0.4);
    // rest transforms so tools can go back after a step
    this.rest = {};
    for (const [k, o] of Object.entries(P)) this.rest[k] = { pos: o.position.clone(), quat: o.quaternion.clone(), parent: this.root };
  }

  /** Put a prop back where it lives. */
  restore(name) {
    const o = this.props[name];
    const r = this.rest[name];
    if (!o || !r) return;
    r.parent.add(o);
    o.position.copy(r.pos);
    o.quaternion.copy(r.quat);
    o.scale.setScalar(1);
    o.visible = true;
  }

  setBurner(i, on) { this.burnerOn[i] = on ? 1 : 0; }

  update(dt) {
    this.t += dt;
    const t = this.t;
    for (const s of this.sway) s.obj.rotation[s.axis] = Math.sin(t * s.sp + s.ph) * s.amp;
    let light = 0;
    for (let b = 0; b < 2; b++) {
      this.burnerHeat[b] += (this.burnerOn[b] - this.burnerHeat[b]) * Math.min(1, dt * 4);
      const h = this.burnerHeat[b];
      for (const f of this.flames[b]) {
        f.visible = h > 0.05;
        if (!f.visible) continue;
        const u = f.userData;
        const fl = 0.75 + Math.sin(t * u.sp + u.ph) * 0.18 + Math.sin(t * u.sp * 2.3 + u.ph * 2) * 0.12;
        f.scale.set(1, Math.max(0.1, fl * h * 0.9), 1);
        f.rotation.z = Math.sin(t * 5 + u.ph) * 0.15;
      }
      const g = this.stove.grates[b];
      const k = 0.2 + h * (0.8 + Math.sin(t * 13 + b) * 0.08);
      g.material.color.setRGB(k, k * 0.92, k * 0.85);
      if (h > light) { light = h; this.fireLight.position.set(this.burners[b].x, 0.05, this.burners[b].z + 0.5); }
    }
    this.fireLight.intensity = light * (0.2 + Math.sin(t * 17) * 0.03 + Math.sin(t * 7.3) * 0.03);
  }
}
