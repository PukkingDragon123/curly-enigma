// Old Star: an old star-nosed mole. Built from the same hi-res voxel parts and skinned assembly as
// makeCharacter (one skinned mesh + whiskers + the lamp lens), with his own extras:
//   - the star: 22 fleshy pink rays around the nose, each on its own bone, so they wiggle (a slow
//     idle ripple, a quick flutter when he sniffs or talks);
//   - a long patched miner's coat over a waistcoat (sewn patches, pockets, turned-up collar, frayed
//     hem), a satchel of notes on a strap, elbow patches;
//   - a battered helmet whose lamp has gone dim (rig.setLamp(k) sets its glow), round spectacles,
//     bushy white brows, a greying muzzle, big digging claws;
//   - an old pickaxe he walks with like a cane.
//
//   import { makeStarMole } from '../gfx/char/starmole.js';
//   const rig = makeStarMole({ height: 0.8 });   // height: top of the head (no helmet), caller units
//   scene.add(rig.root); rig.play('walk'); rig.face(yaw); rig.update(dt); rig.dispose();
//
// It is a CharacterRig (same play / face / talk / doEmote / holdItem / update / dispose / root /
// height / anchors), plus states 'pinned' (sitting with his legs under rocks, propped on one paw),
// 'point' (left paw pointing ahead), 'beckon' ("this way!"), 'lean' (both paws on the pick),
// 'stretch' and 'dust' (patting himself down), and:
//   rig.sniff(sec)          the star flutters and the nose lifts
//   rig.look(yaw, pitch)    turn the head (radians, relative to the body; smoothed)
//   rig.setLamp(k)          helmet lamp glow 0..1 (default 0.55: dim)
//   rig.setPick(on)         his walking pick: true / false, or null = automatic (hidden while he
//                           sits, sleeps or holds something in his right paw via holdItem)
//   rig.headWorld(out)      world point just above the helmet (speech bubbles)
//   rig.lampWorld(out)      world position of the helmet lamp
import * as THREE from 'three';
import { normSpec, proportions, PATCH_COLORS } from './spec.js';
import { Vox, mix, dk, lt, h3, furColor, cached, PX, NX, PY, NY, PZ, NZ } from './vox.js';
import { SkinAssembler, scaleVisible, charMaterial } from './skin.js';
import { buildHead, skullRow } from './head.js';
import { eyeSet, browGeo, browSize, mouthGeo, mouthSize, whiskerGeo } from './face.js';
import { buildBody, buildTail } from './body.js';
import { buildArm, buildLeg } from './limbs.js';
import { buildHat, buildGlasses } from './hats.js';
import { CharacterRig } from './rig.js';

/** His look. species 'mole' gives the pink nose disc the star grows around. */
export const STAR_MOLE_SPEC = Object.freeze({
  seed: 1907, species: 'mole', age: 'elder', body: 'slim', fur: 0x4a4044, eyes: 'bead',
  outfit: 'vest', outfitColor: 0x8a6a34, hat: 'helmet', hatColor: 0x9a8448, glasses: true, scarf: null,
  dirt: 0.6, blush: true, brows: 'bushy', cane: false, backpack: false, patches: 1, freckles: false,
  earring: false, tuft: false, fabric: 'plain', eyeColor: 0x3a2a4a,
});
const COAT = 0x76643e; // waxed canvas, olive-brown
const THREAD = 0xe8dcb8;
const BRASS = 0xc8a048;
const LEATHER = 0x6a4224;
const STAR_N = 22;

// ---------------------------------------------------------------- parts
/** The long coat, the satchel and its strap, in the body's voxel frame (origin at the hip point). */
function coatGeo(spec, p) {
  return cached(`starcoat|${p.bw}|${p.bh}|${p.bd}`, () => {
    const bx = p.bw, by = p.bh, bz = p.bd, H = by * 2;
    const yw = Math.round(H * 0.42);
    const v = new Vox(-bx - 9, bx + 9, -9, H + 6, -bz - 8, bz + 8);
    // the torso's own shape (body.js), grown outward by k
    const torso = (x, y, z, k) => {
      const yc = Math.max(0.5, y);
      const ty = (yc - by) / by;
      const n = ty < 0 ? 3.3 : 3;
      const sx = bx * (1 - Math.max(0, ty) * 0.1) - 0.1 + k, sz = bz - 0.1 + k;
      return Math.abs(x / sx) ** n + Math.abs(ty * by / (by + k * 0.6)) ** n + Math.abs(z / sz) ** 4.4 <= 1;
    };
    // where the coat hangs open at the front: a V above the waist, wider below, tails flaring apart
    const open = (y) => (y >= yw ? 1.1 + (y - yw) * 0.42 : y >= 0 ? 2.2 : 2.2 + -y * 0.45);
    const isOpen = (x, y, z) => z > 0 && Math.abs(x) < open(y);
    // body of the coat: a shell from the shoulders down to the hips
    v.fill(-bx - 4, bx + 4, 0, H, -bz - 4, bz + 4, (x, y, z) => torso(x, y, z, 1.6) && !torso(x, y, z, 0.3) && !isOpen(x, y, z), 0, 1);
    // tails: below the hips the coat hangs on, flaring a little, open at the front
    const tailY0 = -7;
    v.fill(-bx - 6, bx + 6, tailY0, 0.5, -bz - 6, bz + 6, (x, y, z) => {
      const k = 1.7 + (0.5 - y) * 0.22;
      const sx = bx + k, sz = bz + k * 0.8;
      const r = Math.abs(x / sx) ** 3.2 + Math.abs(z / sz) ** 3.2;
      const ri = Math.abs(x / (sx - 1.3)) ** 3.2 + Math.abs(z / (sz - 1.3)) ** 3.2;
      if (r > 1 || ri < 1) return false;
      // a ragged hem: some columns hang a voxel shorter
      if (y < tailY0 + 1 && h3(Math.round(x), 0, Math.round(z), 51) < 0.45) return false;
      return !isOpen(x, y, z);
    }, 0, 1);
    // turned-up collar round the back and sides of the neck
    v.fill(-bx - 3, bx + 3, H - 3, H + 2.5, -bz - 3, bz + 3, (x, y, z) => {
      if (z > bz * 0.35) return false;
      const t = (y - (H - 3)) / 5.5;
      const sx = bx * 0.78 + 1.6 + t * 0.8, sz = bz * 0.78 + 1.6 + t * 0.8;
      const r = (x / sx) ** 2 + (z / sz) ** 2;
      return r <= 1 && r >= 0.5;
    }, 0, 2);
    // lapels: a raised edge along the opening
    v.fill(-bx, bx, yw - 1, H - 1, 0, bz + 4, (x, y, z) => {
      const o = open(y);
      const ax = Math.abs(x);
      return ax >= o && ax < o + 1.6 && torso(x, y, z, 2.4) && !torso(x, y, z, 1.4);
    }, 0, 3);
    // patch pockets low on the front, with flaps
    for (const s of [-1, 1]) {
      const px0 = s > 0 ? 3 : -7, px1 = s > 0 ? 7 : -3;
      for (let x = px0; x < px1; x++) for (let y = -3; y < 3; y++) {
        const z = v.frontZ(x, y);
        if (!isFinite(z) || z < 1) continue;
        v.setM(x, y, z + 1, y === 2 ? 5 : 4);
      }
    }
    // the satchel on the left hip, hanging from a strap over the right shoulder
    const sbx = -bx - 3.2, sby = 1.5, sbz = 0.5;
    v.fill(sbx - 3, sbx + 3, sby - 4, sby + 4, sbz - 4, sbz + 4, (x, y, z) => Math.abs((x - sbx) / 2.6) ** 4 + Math.abs((y - sby) / 3.6) ** 4 + Math.abs((z - sbz) / 3.8) ** 4 <= 1, 0, 6);
    // flap with a buckle
    v.fill(sbx - 3.5, sbx + 1, sby, sby + 4.5, sbz - 4.5, sbz + 4.5, (x, y, z) => x < sbx - 2.2 && x > sbx - 3.6 && Math.abs(z - sbz) < 3.9 && y > sby - 0.6 && y < sby + 3.9, 0, 7);
    v.set(Math.round(sbx - 3.8), Math.round(sby), Math.round(sbz), BRASS);
    v.set(Math.round(sbx - 3.8), Math.round(sby) + 1, Math.round(sbz), lt(BRASS, 0.3));
    // papers sticking out of the top, a pencil
    for (const [dz, dh, c] of [[-2, 2, 0xf2e8d0], [0, 3, 0xe8dcbc], [1, 2, 0xf6eedc], [2, 1, 0xd8c8a0]]) {
      for (let k = 0; k < dh; k++) for (let x = Math.round(sbx - 1); x <= Math.round(sbx); x++) v.set(x, Math.round(sby + 3.6 + k), Math.round(sbz + dz), k === dh - 1 && dz === 0 ? 0x5a4a6a : c);
    }
    v.line(sbx + 0.5, sby + 3, sbz + 3, sbx + 0.5, sby + 7.5, sbz + 3.5, 0xd8a838, 0.5);
    v.set(Math.round(sbx + 0.5), Math.round(sby + 7.6), Math.round(sbz + 3.5), 0x3a2a2a);
    // the strap: across the chest and the back, from the satchel up over the right shoulder
    const strapAt = (x, y) => Math.abs(y - (sby + 4 + (x - sbx) * 0.56)) < 1.15;
    for (let x = Math.floor(sbx); x <= bx; x++) for (let y = 0; y <= H + 1; y++) {
      if (!strapAt(x, y)) continue;
      const zf = v.frontZ(x, y);
      if (isFinite(zf) && zf > 0 && !(x > -1.2 && x < 1.2)) v.setM(x, y, zf + 1, 8);
      const zb = v.backZ(x, y);
      if (isFinite(zb) && zb < 0) v.setM(x, y, zb - 1, 8);
    }
    // sewn patches (one on the chest, one on the back) and brass buttons by the opening
    const patches = [{ x: -6, y: yw + 2, w: 4, h: 4, f: 1, c: PATCH_COLORS[1], plaid: true }, { x: 1, y: 2, w: 5, h: 4, f: -1, c: PATCH_COLORS[4] }, { x: -5, y: -5, w: 4, h: 3, f: -1, c: PATCH_COLORS[0] }];
    for (const pt of patches) {
      for (let x = pt.x; x < pt.x + pt.w; x++) for (let y = pt.y; y < pt.y + pt.h; y++) {
        const z = pt.f > 0 ? v.frontZ(x, y) : v.backZ(x, y);
        if (!isFinite(z)) continue;
        const edge = x === pt.x || x === pt.x + pt.w - 1 || y === pt.y || y === pt.y + pt.h - 1;
        const c = edge ? ((x + y) & 1 ? THREAD : dk(pt.c, 0.15)) : pt.plaid && ((x - pt.x) % 2 === 0 || y - pt.y === 2) ? dk(pt.c, 0.2) : pt.c;
        v.set(x, y, z, c);
      }
    }
    for (const by2 of [yw + 1, yw + 4, yw + 7]) {
      const x = Math.ceil(open(by2) + 0.6);
      const z = v.frontZ(x, by2);
      if (isFinite(z)) v.set(x, by2, z + 1, by2 === yw + 4 ? lt(BRASS, 0.25) : BRASS);
    }
    const seed = 77;
    v.resolve({
      1: (x, y, z, e) => {
        let c = COAT;
        if ((e & (PX | NX)) && !(e & (PZ | NZ)) && Math.abs(z) < 1) c = dk(c, 0.14); // side seams
        if (y === yw - 1 && !(e & PY)) c = dk(c, 0.1); // the belt line
        if (e & PY) c = lt(c, 0.08);
        if (e & NY) c = dk(c, 0.2);
        if (z < -bz * 0.4) c = dk(c, 0.06);
        c = furColor(c, x, y, z, e, seed, 0.35); // canvas weave
        // grime toward the hem, wax shine on the shoulders
        if (y < -3 && (y < -5 || ((x + y + z) & 1))) c = mix(c, 0x3a2a18, 0.25);
        if (y > H - 4 && (e & PY) && h3(x, y, z, 9) < 0.3) c = lt(c, 0.12);
        return c;
      },
      2: (x, y, z, e) => (e & PY ? lt(COAT, 0.05) : (y + x) % 3 === 0 ? dk(COAT, 0.22) : dk(COAT, 0.12)),
      3: (x, y, z, e) => ((e & PZ) ? lt(COAT, 0.1) : dk(COAT, 0.08)),
      4: (x, y, z) => ((x + y) % 2 === 0 && (y === -3 || Math.abs(x) === 3 || Math.abs(x) === 6) ? lt(COAT, 0.3) : dk(COAT, 0.05)),
      5: () => dk(COAT, 0.3),
      6: (x, y, z, e) => {
        let c = LEATHER;
        if (e & PY) c = lt(c, 0.1);
        if (e & NY) c = dk(c, 0.25);
        if (h3(x, y, z, 13) < 0.12) c = dk(c, 0.12); // scuffs
        return c;
      },
      7: (x, y, z, e) => (e & NY ? dk(LEATHER, 0.35) : (y + z) % 4 === 0 ? dk(LEATHER, 0.2) : dk(LEATHER, 0.1)),
      8: (x, y, z, e) => ((x + y) % 5 === 0 ? lt(LEATHER, 0.2) : e & PY ? lt(LEATHER, 0.06) : dk(LEATHER, 0.06)),
    });
    return v.geometry(false);
  });
}

/** A patch sewn on the outside of the elbow (arm frame; mirrored for the left arm). */
function elbowGeo(p) {
  return cached(`starelbow|${p.ah}`, () => {
    const ah = p.ah * 2, armBot = -ah + 2;
    const v = new Vox(-1, 6, -ah - 2, 2, -4, 4);
    const y0 = armBot + 3;
    for (let y = y0; y < y0 + 4; y++) for (let z = -2; z < 2; z++) {
      // sit just outside the sleeve (a tapered capsule, see limbs.js)
      const t = (-0.8 - y) / (-0.8 - armBot), r = 2.75 - t * 0.45;
      const xs = Math.floor(Math.sqrt(Math.max(0, r * r - (z + 0.5) ** 2 * 1.05)) - 0.5);
      const edge = y === y0 || y === y0 + 3 || z === -2 || z === 1;
      v.set(xs + 1, y, z, edge ? ((y + z) & 1 ? THREAD : 0x5a4a6a) : 0x7a6a8a);
    }
    return v.geometry(false);
  });
}

/** One ray of the star: a thin fleshy finger along +x from the root, length L voxels. */
function rayGeo(L) {
  return cached(`starray|${L}`, () => {
    const v = new Vox(-1, L + 2, -1, 2, -1, 2);
    for (let i = 0; i < L; i++) {
      const t = i / (L - 1);
      v.set(i, 0, 0, t > 0.85 ? 0xf7a0b4 : t > 0.4 ? 0xe8708c : 0xd2587a);
    }
    return v.geometry(false, [0, 0.5, 0.5]);
  });
}

/** Grey sideburns and wisps poking out under the helmet (head frame, head-local voxels). */
function tuftsGeo(info) {
  return cached(`startufts|${info.W}|${info.H}|${info.D}|${info.browY}`, () => {
    const { hx, hy, hz, n, H } = info;
    const row = skullRow(hx, hy, hz, n);
    const v = new Vox(-hx - 5, hx + 5, 0, H + 4, -hz - 4, hz + 4);
    const band = Math.round(info.browY) + 1;
    const greys = [0xc4beb8, 0xa8a09c, 0xd4cec8, 0x8a827e];
    // the skull's half-width at height y (z = 0) and half-depth (x = 0)
    const half = (y, axis) => { const r = row(y + 0.5); const t = 1 - Math.abs(r[3]) ** r[2]; return t > 0 ? (axis ? r[1] : r[0]) * t ** (1 / r[2]) : 0; };
    for (const side of [-1, 1]) {
      for (let y = band - 6; y <= band - 1; y++) {
        const w = half(y, 0);
        for (let z = -3; z <= 2; z++) {
          const k = h3(side, y, z, 71);
          const out = 1 + (k > 0.7 ? 1 : 0) + (y < band - 4 && k > 0.85 ? 1 : 0);
          for (let i = 0; i < out; i++) {
            const x = side > 0 ? Math.floor(w) + i : -Math.floor(w) - 1 - i;
            v.set(x, y - (i > 1 ? 1 : 0), z, greys[(Math.abs(y * 3 + z + i) + (side > 0 ? 1 : 0)) % 4]);
          }
        }
      }
    }
    // wisps at the nape, under the back of the helmet
    for (let x = -4; x <= 3; x++) for (let y = band - 4; y <= band - 1; y++) {
      if (h3(x, y, 5, 73) < 0.35) continue;
      const d = half(y, 1);
      v.set(x, y, -Math.floor(d) - 1, greys[Math.abs(x + y) % 4]);
    }
    return v.geometry(false);
  });
}

/** The old pick he walks with: haft down to the floor from the paw, the head above it. */
function walkPickGeo(len) {
  len = Math.max(8, Math.round(len));
  return cached(`starpick|${len}`, () => {
    const v = new Vox(-3, 3, -len - 1, 12, -12, 14);
    const wood = 0x7a5232, woodD = 0x553820, woodL = 0x9a6c42;
    v.box(-1, -len, -1, 1, 9, 1, (x, y) => (y < -len + 1 ? 0x4a4a50 : (y + 60) % 6 === 0 ? woodD : x === -1 ? woodL : wood));
    // a leather grip where the paw holds it
    for (let y = -2; y < 3; y++) for (const [x, z] of [[-2, -1], [-2, 0], [1, -1], [1, 0], [-1, -2], [0, -2], [-1, 1], [0, 1]]) v.set(x, y, z, (y & 1) ? LEATHER : lt(LEATHER, 0.15));
    // the head: a long spike forward, a broad blade back, both curving down a touch
    const iron = 0x6a6e76, ironL = 0x9aa0a8, ironD = 0x3e4046, rust = 0x8a4a2a;
    for (let i = -9; i <= 12; i++) {
      const t = Math.abs(i) / (i > 0 ? 12 : 9);
      const y = 9.5 - t * t * 2.4;
      const r = i > 0 ? 1.4 - t * 1.0 : 1.6 - t * 0.5;
      v.fill(-2, 2, y - 2, y + 2, i, i, (x, yy) => Math.abs(x) < (i > 0 ? r : 0.9) + 0.1 && Math.abs(yy - y) < r + 0.2, (x, yy, z) => {
        if (h3(x, yy, z, 5) < 0.16) return rust;
        if (yy > y + r - 0.8) return ironL;
        if (yy < y - r + 0.8) return ironD;
        return iron;
      });
    }
    v.box(-2, 8, -2, 2, 11, 2, ironD); // the eye round the haft
    v.set(-2, 10, -1, ironL);
    return v.geometry(false, [0, 0, 0]);
  });
}

// ---------------------------------------------------------------- the rig
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const AZ = new THREE.Vector3(0, 0, 1), AY = new THREE.Vector3(0, 1, 0);

export class StarMoleRig extends CharacterRig {
  constructor(parts) {
    super(parts);
    this.sniffT = 0;
    this.lookYaw = 0; this.lookPitch = 0; this.lookYawT = 0; this.lookPitchT = 0;
    this.lampK = 0.55;
    this.waveArm = false;
  }

  sniff(sec = 1.2) { this.sniffT = Math.max(this.sniffT, sec); }
  /** Show or hide his walking pick (null: automatic, hidden while sitting, sleeping or holding something). */
  setPick(on = null) { this.pickOn = on; }
  holdItem(obj, hand = 'R') {
    super.holdItem(obj, hand);
    if (hand === 'R') this.pickAuto();
  }
  pickAuto() {
    if (!this.pick) return;
    const want = this.pickOn ?? !(this.hold || this.state === 'sit' || this.state === 'sleep');
    if (this.pick.visible !== want) this.pick.visible = want;
  }
  look(yaw = 0, pitch = 0) {
    this.lookYawT = Math.max(-1.1, Math.min(1.1, yaw));
    this.lookPitchT = Math.max(-0.5, Math.min(0.6, pitch));
  }
  setLamp(k) { this.lampK = Math.max(0, Math.min(1, k)); }
  headWorld(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return this.neck.localToWorld(out.copy(this.anchors.headTop));
  }
  lampWorld(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return this.lamp ? this.lamp.getWorldPosition(out) : this.headWorld(out);
  }

  update(dt) {
    const st = this.state;
    super.update(dt);
    const t = this.t, s = this.s;
    const { hip, neck, armL, armR, legL, legR } = this;
    const breathe = Math.sin(t * 2.2);
    // his own poses (CharacterRig treats unknown states as idle; we pose over that)
    if (st === 'pinned') {
      legL.rotation.set(-1.5, 0, 0.12);
      legR.rotation.set(-1.5, 0, -0.12);
      hip.position.y = s * 1.6 + breathe * s * 0.15;
      hip.rotation.x = -0.22;
      neck.rotation.x = 0.1 + Math.sin(t * 0.9) * 0.03;
      armL.rotation.set(0.75, 0, 0.45); // propped on a paw behind him
      if (this.talkT > 0 || this.waveArm) armR.rotation.set(-2.35 + Math.sin(t * 3.5) * 0.18, 0, -0.6 + Math.sin(t * 7) * 0.32); // waving, up and out of his face
      else armR.rotation.set(-0.5 + Math.sin(t * 1.4) * 0.06, 0, -0.3);
    } else if (st === 'point') {
      armL.rotation.set(-1.45, 0, 0.08 + Math.sin(t * 2) * 0.02);
      hip.rotation.x = this.baseHunch * 0.6;
    } else if (st === 'beckon') {
      armL.rotation.set(-1.5 + Math.sin(t * 8) * 0.45, 0, 0.25);
      neck.rotation.z = Math.sin(t * 4) * 0.06;
    } else if (st === 'lean') {
      armL.rotation.set(-0.7, 0, -0.35);
      armR.rotation.set(-0.55, 0, 0.1);
      hip.rotation.x = this.baseHunch + 0.12;
    } else if (st === 'stretch') {
      const k = Math.min(1, (this.stateT || 0) / 0.6);
      armL.rotation.set(-2.9 * k, 0, 0.5 * k);
      armR.rotation.set(-2.9 * k, 0, -0.5 * k);
      hip.rotation.x = this.baseHunch - 0.35 * k;
      neck.rotation.x = -0.3 * k;
    } else if (st === 'dust') {
      armL.rotation.set(-0.5 + Math.sin(t * 14) * 0.35, 0, 0.3);
      armR.rotation.set(-0.5 - Math.sin(t * 14) * 0.35, 0, -0.3);
      hip.rotation.x = this.baseHunch + 0.2;
    } else if (st === 'walk') {
      // an old fellow's walk: shorter steps, the pick plants like a cane
      legL.rotation.x *= 0.7; legR.rotation.x *= 0.7;
      armR.rotation.x *= 0.35;
      hip.rotation.x += 0.08;
    }
    // sniffing: nose up, quick little head bobs
    if (this.sniffT > 0) {
      this.sniffT -= dt;
      neck.rotation.x -= 0.18 + Math.sin(t * 19) * 0.04;
    }
    // head look (relative to the body)
    const kl = Math.min(1, dt * 6);
    this.lookYaw += (this.lookYawT - this.lookYaw) * kl;
    this.lookPitch += (this.lookPitchT - this.lookPitch) * kl;
    neck.rotation.y += this.lookYaw;
    neck.rotation.x -= this.lookPitch;
    // the star
    const busy = this.sniffT > 0 ? 1 : this.talkT > 0 || st === 'talk' ? 0.6 : 0;
    this.starK = (this.starK || 0) + (busy - (this.starK || 0)) * Math.min(1, dt * 8);
    const k = this.starK;
    for (const r of this.star) {
      const w1 = Math.sin(t * (2.1 + k * 13) + r.ph) * (0.07 + k * 0.22);
      const w2 = Math.sin(t * (1.7 + k * 11) + r.ph * 1.7) * (0.06 + k * 0.3) + k * 0.18 * (0.5 + 0.5 * Math.sin(t * 9 + r.ph * 0.5));
      _q1.setFromAxisAngle(AZ, r.a + w1);
      _q2.setFromAxisAngle(AY, -(r.tilt + w2));
      r.bone.quaternion.copy(_q1).multiply(_q2);
    }
    this.pickAuto();
    // the dim helmet lamp flickers a little
    if (this.lensMat) {
      const f = this.lampK * (0.92 + Math.sin(t * 13) * 0.04 + Math.sin(t * 31) * 0.03);
      this.lensMat.color.setRGB(f, f * 0.92, f * 0.78);
    }
  }

  dispose() {
    super.dispose();
    this.lensMat?.dispose();
  }
}

// ---------------------------------------------------------------- build
const V16 = 1 / 16;

/**
 * Build Old Star. opts.height: top of his head without the helmet (default 0.8, in the caller's
 * units, e.g. meters); opts.kind: 'toon' | 'lambert' | 'basic'; opts.lamp: helmet lamp glow 0..1.
 */
export function makeStarMole(opts = {}) {
  const spec = normSpec(STAR_MOLE_SPEC);
  const p = proportions(spec);
  const height = opts.height ?? 0.8;
  const u = height / (p.lh + p.bh + p.hh + 1); // classic unit (rig.s)
  const vs = u / 2;
  const kind = opts.kind || 'toon';
  const bake = kind === 'basic';
  const A = new SkinAssembler();
  const R = [vs, vs, vs], L = [-vs, vs, vs];
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const root = new THREE.Group();
  root.name = 'old-star';
  const hip = group(root);

  // legs (trousers under the coat)
  const legL = group(root, -p.bw * 0.27 * u, p.lh * u + u, 0);
  const legR = group(root, p.bw * 0.27 * u, p.lh * u + u, 0);
  A.part(legR, buildLeg(spec, p, 1, bake).geo, { scale: R });
  A.part(legL, buildLeg(spec, p, -1, bake).geo, { scale: L });

  // body: waistcoat, then the coat, satchel and strap on the same (breathing) bone
  hip.position.y = p.lh * u + u * 0.5;
  const bodyMesh = A.part(hip, buildBody(spec, p, bake).geo, { scale: R });
  A.attach(bodyMesh, coatGeo(spec, p));
  const tail = group(hip, 0, 3 * vs, (-p.bd + 1.5) * vs);
  A.part(tail, buildTail({ species: 'starnose', fur: spec.fur, age: spec.age }, bake), { scale: R });

  // head and face
  const neck = group(hip, 0, (p.bh - 1) * u, u * 0.5);
  const head = buildHead(spec, p, bake);
  const info = head.info;
  const headMesh = A.part(neck, head.geo, { scale: R });
  A.part(neck, tuftsGeo(info), { scale: R });
  const eyes = info.eyes.map((e) => {
    const set = eyeSet(e.type, e.side, info.lid, spec.eyeColor, bake);
    const g = group(neck, e.x * vs, e.y * vs, e.z * vs + vs * 0.02);
    const variants = {};
    const fpH = Math.max(3, set.h);
    for (const [name, geo] of Object.entries(set.variants)) {
      const bb = geo.boundingBox || (geo.computeBoundingBox(), geo.boundingBox);
      const h = Math.round(bb.max.y - bb.min.y);
      const b = scaleVisible(A.part(g, geo, { pos: [0, (fpH - h) % 2 ? -0.5 * vs : 0, 0], scale: R }));
      b.visible = name === 'open';
      variants[name] = b;
    }
    g.userData.variants = variants;
    g.userData.side = e.side;
    return g;
  });
  const bs = browSize('bushy');
  const brows = info.eyes.map((e, i) => {
    const y = (info.browY + 0.5 + bs.h / 2) * vs;
    const g = group(neck, e.x * vs + e.side * vs, y, info.browZ[i] * vs);
    g.userData.side = e.side;
    g.userData.y = y;
    A.part(g, browGeo('bushy', e.side, 0xf2eee6, bake), { scale: R });
    return g;
  });
  const mi = info.mouth;
  const restSet = { rest: mi.teeth ? 'restT' : 'rest', smile: 'smile', frown: 'frown', line: 'line' };
  const openSet = { talk: mi.teeth ? 'talkT' : 'talk', laugh: mi.teeth ? 'laughT' : 'laugh', oh: 'oh', grimace: 'grimace' };
  const mouthTop = (mi.y + 1.5) * vs;
  const mkMouthGroup = (set, dz) => {
    const g = group(neck, 0, mouthTop, (mi.z + dz) * vs);
    const variants = {};
    for (const [k, name] of Object.entries(set)) {
      const b = scaleVisible(A.part(g, mouthGeo(name, info.lip, bake), { pos: [0, -mouthSize(name).h / 2 * vs, 0], scale: R }));
      b.visible = false;
      variants[k] = b;
    }
    g.userData.variants = variants;
    return g;
  };
  const mouthRest = mkMouthGroup(restSet, 0.02);
  const mouth = scaleVisible(mkMouthGroup(openSet, 0.35), new THREE.Vector3(1, 1, 1));
  mouth.visible = false;
  let whiskers = null;
  if (info.whisk) {
    const w = info.whisk;
    whiskers = [-1, 1].map((side) => {
      const g = group(neck, side * (w.x + 1.2) * vs, (w.y - 1.2) * vs, (w.z - 0.5) * vs);
      A.part(g, whiskerGeo(0xd8d0c8, 4, bake), { scale: [side * vs, vs * 0.5, vs * 0.5], layer: 'detail' });
      g.userData.side = side;
      return g;
    });
  }
  const glassesGeo = buildGlasses(spec, info, bake);
  if (glassesGeo) A.part(neck, glassesGeo, { scale: R });

  // the star: 22 rays round the pink nose disc, 11 a side, the lowest pair short. They are
  // hairline parts like the whiskers (no outline), so they read as fingers, not a disc.
  const star = [];
  {
    const cx = 0, cy = info.noseY, cz = info.snoutFront + 0.2;
    for (let i = 0; i < STAR_N; i++) {
      const side = i < STAR_N / 2 ? 1 : -1;
      const j = i % (STAR_N / 2); // 0 = top centre, 10 = bottom centre
      const ang = Math.PI / 2 - side * (j + 0.5) * (Math.PI / (STAR_N / 2)); // from the top round each side
      const len = j >= 9 ? 3 : j <= 1 ? 4 : 5;
      const rx = 2.5, ry = 1.9;
      const x = cx + Math.cos(ang) * rx, y = cy + Math.sin(ang) * ry;
      const bone = A.part(neck, rayGeo(len), { pos: [x * vs, y * vs, cz * vs], scale: R, layer: 'detail' });
      star.push({ bone, a: ang, tilt: 0.42 + (j >= 9 ? 0.3 : 0), ph: i * 2.39 });
    }
  }

  // the battered helmet and its dim lamp
  const hat = buildHat(spec, info, bake);
  let lampPos = null, lens = null, lensMat = null;
  if (hat) {
    const hatGroup = group(neck, 0, 0, 0);
    A.part(hatGroup, hat.geo, { scale: R });
    if (hat.lens) {
      lensMat = new THREE.MeshBasicMaterial({ vertexColors: true });
      lens = new THREE.Mesh(hat.lens, lensMat);
      lens.scale.setScalar(vs);
      hatGroup.add(lens);
    }
    if (hat.lamp) {
      lampPos = new THREE.Object3D();
      lampPos.position.set(hat.lamp[0] * vs, hat.lamp[1] * vs, hat.lamp[2] * vs);
      hatGroup.add(lampPos);
    }
  }

  // arms: coat sleeves with elbow patches, the big digging paws
  const shoulderY = (p.bh - 1.5) * u;
  const armL = group(hip, -(p.bw / 2 + 1.6) * u, shoulderY, u * 0.5);
  const armR = group(hip, (p.bw / 2 + 1.6) * u, shoulderY, u * 0.5);
  const arm = buildArm({ ...spec, outfit: 'shirt', outfitColor: COAT }, p, bake);
  const big = [vs * 1.08, vs * 1.04, vs * 1.08], bigL = [-vs * 1.08, vs * 1.04, vs * 1.08];
  A.part(armR, arm.geo, { scale: big });
  A.part(armL, arm.geo, { scale: bigL });
  A.part(armR, elbowGeo(p), { scale: big });
  A.part(armL, elbowGeo(p), { scale: bigL });
  const handL = group(armL, 0, -(p.ah + 1) * u, u);
  const handR = group(armR, 0, -(p.ah + 1) * u, u);
  const pickLen = (p.lh + 0.5 + p.bh - 1.5 - (p.ah + 1)) * 2 + 1;
  const pick = scaleVisible(A.part(handR, walkPickGeo(pickLen), { scale: R }));

  // skin
  const h = (p.lh + p.bh + p.hh + 1) * u;
  const bounds = new THREE.Sphere(new THREE.Vector3(0, h * 0.55, 0), h * 1.05);
  const skin = A.build(charMaterial(kind), bounds);
  root.add(skin.main);
  if (skin.detail) root.add(skin.detail);
  const meshes = [skin.main, skin.detail, lens].filter(Boolean);

  const rig = new StarMoleRig({
    root, hip, neck, headMesh, armL, armR, legL, legR, handL, handR, eyes, mouth, tail, lamp: lampPos, height: h, s: u, spec, p,
    vs, bodyMesh, brows, mouthRest, whiskers, ears: null, eyeType: spec.eyes, restMouth: 'rest',
    breath: 0.016, digger: true, skeleton: skin.skeleton, meshes, lod: 'full',
    skin: { assembler: A, main: skin.main, detail: skin.detail, lens, lensPart: null },
  });
  rig.star = star;
  rig.pick = pick;
  rig.lensMat = lensMat;
  rig.lampK = opts.lamp ?? 0.55;
  const eyeZ = Math.max(...info.eyes.map((e) => e.z));
  rig.anchors = {
    eyes: new THREE.Vector3(0, info.eyes[0].y * vs, eyeZ * vs),
    mouth: new THREE.Vector3(0, mouthTop, (mi.z + 0.5) * vs),
    nose: new THREE.Vector3(0, info.noseY * vs, (info.snoutFront + 1.5) * vs),
    headTop: new THREE.Vector3(0, (info.H + 7) * vs, 0),
    headW: info.W * vs, headH: info.H * vs, headD: info.D * vs,
  };
  rig.eyeDrop = true;
  root.userData.rig = rig;
  rig.update(0);
  return rig;
}
