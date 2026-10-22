// The hero: the player as a blacksmith adventurer mole. Built from the same hi-res voxel parts and
// skinned assembly as makeCharacter (one skinned mesh + whiskers), with his own extras:
//   - a scorched leather smithing apron (stitched hem, rivets, a bib pocket with a chisel and a
//     pencil, burn marks), a tool belt with a brass buckle and two pouches, a rust-red work shirt;
//   - sleeves rolled up over big furry forearms: a leather bracer on the right, a wrap on the left;
//   - brass-rimmed goggles pushed up on the forehead (or pulled down over the eyes), a cowlick,
//     a determined brow;
//   - leather boot wraps over his digging feet;
//   - a travel pack: a canvas rucksack with a bedroll, a coil of rope, a little pot and a lantern;
//   - a big cross-peen smithing hammer: on his shoulder while he walks, in his paw to forge, or
//     strapped across the pack.
//
//   import { makeHeroMole } from '../gfx/char/hero.js';
//   const rig = makeHeroMole({ height: 0.86, pack: true, hammer: true });
//   scene.add(rig.root); rig.play('walk'); rig.face(yaw); rig.update(dt); rig.dispose();
//
// It is a CharacterRig (play / face / talk / doEmote / holdItem / update / dispose / root / height /
// anchors / neck / handR ...). Every base state works; these are his own or reworked:
//   idle     a sturdy stance, hammer on the shoulder
//   walk/run a confident stride, hammer on the shoulder
//   hammer   one-handed forging blows: drive rig.swingPhase (0..1, impact at 0/1) yourself, or set
//            rig.autoSwing = blows per second and rig.onStrike = (faceWorldPos) => {...}
//   fall     tumbling: arms and legs flailing, hammer still gripped
//   brace    the ground moves: knees bent, arms out for balance, wobbling
//   reach    leaning in, left paw reaching forward (opening a chest, picking something up)
//   peer     leaning forward, looking down at something at his feet
//   pose     the hero pose: hammer head planted beside him, paw on the haft, chin up
//   lie      flat on his back, out cold
// Extras:
//   rig.setHammer(mode)   'shoulder' | 'hand' | 'back' | 'none' | null (automatic by state)
//   rig.setPack(on)       show / hide the travel pack
//   rig.setGoggles(pos)   'up' (on the forehead) | 'down' (over the eyes, for forging)
//   rig.look(yaw, pitch)  turn the head (radians, relative to the body; smoothed)
//   rig.headWorld(out)    world point just above the head (speech bubbles)
//   rig.hammerFaceWorld(out)  world position of the hammer's striking face (sparks)
import * as THREE from 'three';
import { normSpec, proportions } from './spec.js';
import { Vox, mix, dk, lt, h3, furColor, cached, templateVox, PX, NX, PY, NY, PZ, NZ } from './vox.js';
import { SkinAssembler, scaleVisible, charMaterial } from './skin.js';
import { buildHead, skullRow } from './head.js';
import { eyeSet, mouthGeo, mouthSize, whiskerGeo } from './face.js';
import { buildBody, buildTail } from './body.js';
import { buildArm, buildLeg } from './limbs.js';
import { CharacterRig } from './rig.js';

const SHIRT = 0x8a3a2c; // rust-red work shirt
const LEATHER = 0x7a4a2a; // the apron
const LEATHER_D = 0x55321c;
const STRAP = 0x4e2e1a;
const BRASS = 0xd8a840;
const BRASS_D = 0x8a6420;
const CANVAS = 0x6a7040; // the pack: moss-green canvas
const THREAD = 0xe8d4a8;
const STEEL = 0x6e747e, STEEL_L = 0xb8c2cc, STEEL_D = 0x3a3e46;
const WOOD = 0x8a5a34, WOOD_D = 0x5e3a20, WOOD_L = 0xa87444;

/** His look (the parts the shared builders read). */
export const HERO_SPEC = Object.freeze({
  seed: 4242, species: 'mole', age: 'adult', body: 'normal', fur: 0x4a3a34, eyes: 'bead',
  outfit: 'shirt', outfitColor: SHIRT, hat: 'none', hatColor: 0, glasses: false, scarf: null,
  dirt: 0.5, blush: false, brows: 'angry', cane: false, backpack: false, patches: 0, freckles: false,
  earring: false, tuft: true, fabric: 'plain', eyeColor: 0x3a2a4a, player: true,
});

/** His build: a broad chest, a longer torso so the apron reads (old 1/16 units, see spec.js). */
function heroProportions(spec) {
  const p = proportions(spec);
  p.bw = 10; p.bh = 8; p.bd = 8; p.lh = 3; p.ah = 4;
  return p;
}

// ---------------------------------------------------------------- torso extras
/** The torso test from body.js (normal build), grown outward by k voxels. */
function torsoTest(p) {
  const bx = p.bw, by = p.bh, bz = p.bd;
  return (x, y, z, k) => {
    const yc = Math.max(0.5, y);
    const ty = (yc - by) / by;
    const n = ty < 0 ? 3.3 : 3;
    const sx = bx * (1 - Math.max(0, ty) * 0.1) - 0.1 + k, sz = bz - 0.1 + k;
    if (Math.abs(x / sx) ** n + Math.abs(ty * by / (by + k * 0.6)) ** n + Math.abs(z / sz) ** 4.4 <= 1) return true;
    // the belly bulge
    const ex = (x) / (bx * 0.72 + k), ey = (y - by * 0.75) / (by * 0.65 + k), ez = (z - bz * 0.3) / (bz * 0.7 + k);
    return ex * ex + ey * ey + ez * ez <= 1;
  };
}

/**
 * Apron, belt and pouches (and the pack's shoulder straps): one geometry in the body's voxel
 * frame (origin at the hip point: x centre, y = body bottom, z centre).
 */
function apronGeo(p, withPack) {
  return cached(`hero-apron|${p.bw}|${p.bh}|${p.bd}|${withPack ? 1 : 0}`, () => {
    const bx = p.bw, by = p.bh, bz = p.bd, H = by * 2;
    const yw = Math.round(H * 0.42); // waist
    const torso = torsoTest(p);
    const v = new Vox(-bx - 8, bx + 8, -9, H + 5, -bz - 6, bz + 8);
    // the torso's front surface z at (x, y) (k = 0), -inf where the column misses it
    const front = (x, y) => {
      for (let z = bz + 5; z >= 0; z--) if (torso(x + 0.5, y + 0.5, z + 0.5, 0)) return z;
      return -Infinity;
    };
    // apron outline: a bib up top, flaring wider over the hips, hanging to the knees
    const yTop = H - 4, yBot = -6;
    const half = (y) => (y >= yw + 2 ? 4.6 + (yTop - y) * 0.05 : y >= yw - 1 ? 4.6 + (yw + 2 - y) * 1.2 : Math.min(bx + 1.5, 8.2 + (yw - 1 - y) * 0.12));
    // below the belly the apron hangs straight from the most forward point
    let zMax = -Infinity, yBelly = yw;
    for (let y = 0; y < yw + 2; y++) { const f = front(0, y); if (f > zMax) { zMax = f; yBelly = y; } }
    for (let y = yBot; y <= yTop; y++) {
      const hw = half(y);
      for (let x = Math.floor(-hw); x < Math.ceil(hw); x++) {
        if (Math.abs(x + 0.5) > hw) continue;
        let zs;
        if (y >= yBelly) zs = front(x, y);
        else {
          // hang straight down from the belly, curving round the hips at the sides
          const fb = front(x, yBelly);
          zs = (isFinite(fb) ? fb : zMax - 3) + (yBelly - y) * 0.06;
        }
        if (!isFinite(zs)) continue;
        // round the sides back so it wraps the body
        const side = Math.max(0, Math.abs(x + 0.5) - 5);
        const z0 = Math.round(zs + 1 - (y < yBelly ? side * side * 0.12 : 0));
        v.setM(x, y, z0, 1);
        if (y < yBelly && side > 0) v.setM(x, y, z0 - 1, 1); // thickness where it wraps
      }
    }
    // the neck strap: up from the bib corners, round the back of the neck
    for (const s of [-1, 1]) {
      for (let y = yTop; y <= H; y++) {
        const x = s > 0 ? 3 + Math.round((y - yTop) * 0.4) : -4 - Math.round((y - yTop) * 0.4);
        for (const xx of [x, x + 1]) {
          const z = front(xx, y);
          if (isFinite(z)) v.setM(xx, y, z + 1, 3);
        }
      }
    }
    v.fill(-bx, bx, H - 1, H + 1, -bz - 2, 0, (x, y, z) => torso(x, y, z, 1.2) && !torso(x, y, z, 0.1) && Math.abs(x) < 6.5, 0, 3);
    // the tool belt, over the apron at the waist
    v.fill(-bx - 4, bx + 4, yw - 1, yw + 1, -bz - 4, bz + 6, (x, y, z) => {
      if (torso(x, y, z, 0.4)) return false;
      if (z > 0 && Math.abs(x) < 9) { // in front it rides over the apron
        const xi = Math.floor(x), yi = Math.floor(y);
        let zf = -Infinity;
        for (let zz = bz + 6; zz > 0; zz--) if (v.has(xi, yi, zz)) { zf = zz; break; }
        if (isFinite(zf)) return Math.floor(z) === zf + 1;
      }
      return torso(x, y, z, 1.9);
    }, 0, 4);
    // brass buckle at the front
    let bzf = -Infinity;
    for (let zz = bz + 7; zz > 0; zz--) if (v.has(0, yw, zz)) { bzf = zz; break; }
    if (isFinite(bzf)) {
      for (let x = -2; x <= 1; x++) for (let y = yw - 1; y <= yw + 1; y++) {
        const ring = x === -2 || x === 1 || y === yw - 1 || y === yw + 1;
        v.set(x, y, bzf + 1, ring ? (y === yw + 1 ? lt(BRASS, 0.3) : BRASS) : x === -1 && y === yw ? BRASS_D : LEATHER_D);
      }
      v.set(0, yw, bzf + 2, lt(BRASS, 0.4)); // the tongue
    }
    // pouches on both hips
    for (const s of [-1, 1]) {
      const px = s * (bx - 0.5), pz = 2.5;
      v.fill(px - 3, px + 3, yw - 6, yw, pz - 4, pz + 4, (x, y, z) => {
        const ex = Math.abs((x - px) / 2.6), ey = Math.abs((y - (yw - 3)) / 3.1), ez = Math.abs((z - pz) / 3.4);
        return ex ** 4 + ey ** 4 + ez ** 4 <= 1 && !torso(x, y, z, 0.6);
      }, 0, 6);
      // flap
      v.fill(px - 3.2, px + 3.2, yw - 3, yw, pz - 4, pz + 4.5, (x, y, z) => {
        const ex = Math.abs((x - px) / 2.9), ez = Math.abs((z - pz) / 3.7);
        return ex ** 4 + ez ** 4 <= 1 && y > yw - 2.5 && !torso(x, y, z, 0.8) && !v.has(Math.floor(x), Math.floor(y), Math.floor(z));
      }, 0, 7);
      const sx = Math.round(px + s * 2.6) - (s < 0 ? 1 : 0);
      v.set(sx, yw - 3, Math.round(pz), BRASS);
    }
    // the bib pocket (left chest) with a chisel and a carpenter's pencil sticking out
    const py0 = yw + 3, py1 = yw + 7;
    for (let x = -5; x <= -1; x++) for (let y = py0; y < py1; y++) {
      let zf = -Infinity;
      for (let zz = bz + 6; zz > 0; zz--) if (v.has(x, y, zz)) { zf = zz; break; }
      if (isFinite(zf)) v.setM(x, y, zf + 1, y === py1 - 1 ? 9 : 8);
    }
    {
      let zf = -Infinity;
      for (let zz = bz + 7; zz > 0; zz--) if (v.has(-4, py1 - 1, zz)) { zf = zz; break; }
      if (isFinite(zf)) {
        for (let k = 0; k < 4; k++) v.set(-4, py1 - 1 + k, zf - 1, k < 2 ? WOOD_D : k === 3 ? STEEL_L : STEEL); // chisel
        for (let k = 0; k < 3; k++) v.set(-2, py1 - 1 + k, zf - 1, k === 2 ? 0x3a2a2a : 0xd8a030); // pencil
      }
    }
    // rivets at the bib corners and where the strap meets the bib
    for (const [x, y] of [[-5, yTop - 1], [4, yTop - 1], [-5, yw + 2], [4, yw + 2]]) {
      let zf = -Infinity;
      for (let zz = bz + 6; zz > 0; zz--) if (v.has(x, y, zz)) { zf = zz; break; }
      if (isFinite(zf)) v.set(x, y, zf, lt(BRASS, 0.15));
    }
    // the pack's shoulder straps down the front, outside the bib
    if (withPack) {
      for (const s of [-1, 1]) {
        for (let y = yw + 1; y <= H + 1; y++) {
          const x0 = s > 0 ? 6 : -8;
          for (let x = x0; x < x0 + 2; x++) {
            let zf = -Infinity;
            for (let zz = bz + 5; zz >= 0; zz--) if (torso(x + 0.5, y + 0.5, zz + 0.5, 0) || v.has(x, y, zz)) { zf = zz; break; }
            if (isFinite(zf) && !v.has(x, y, zf + 1)) v.setM(x, y, zf + 1, 5);
          }
        }
        // over the shoulder
        v.fill(-bx, bx, H - 2, H + 2, -bz - 2, bz, (x, y, z) => {
          const ax = Math.abs(x);
          return ax > 5.8 && ax < 8 && Math.sign(x) === s && torso(x, y, z, 1.1) && !torso(x, y, z, 0.1);
        }, 0, 5);
        // buckle on the strap
        const bxs = s > 0 ? 6 : -8;
        for (let zz = bz + 6; zz > 0; zz--) if (v.has(bxs, yw + 5, zz)) { v.set(bxs, yw + 5, zz, BRASS); v.set(bxs + 1, yw + 5, zz, BRASS_D); break; }
      }
    }
    const seed = 91;
    v.resolve({
      1: (x, y, z, e) => {
        // worn leather: a warm base, lighter where it rubs, scorched near the hem
        let c = LEATHER;
        const g = h3(x >> 1, y >> 1, 3, seed);
        if (g < 0.18) c = dk(c, 0.08); else if (g > 0.86) c = lt(c, 0.06);
        if (e & PY) c = lt(c, 0.1);
        if (e & NY) c = dk(c, 0.25);
        // stitching just inside the edge
        const hw = half(y);
        if (Math.abs(Math.abs(x + 0.5) - (hw - 1)) < 0.6 && (y & 1) && (e & PZ)) c = lt(c, 0.32);
        if (y === yBot + 1 && (x & 1) && (e & PZ)) c = lt(c, 0.32);
        if (y === yBot) c = dk(c, 0.2);
        // scorch marks and little burn holes from flying sparks
        const sc = h3(x >> 2, y >> 2, 5, seed);
        if (y < yw && sc < 0.22) c = mix(c, 0x2a1a14, 0.3 + (h3(x, y, 1, seed) < 0.4 ? 0.2 : 0));
        if (h3(x, y, 9, seed) < 0.025 && y < yw + 4) c = 0x1e1210;
        // a polished patch on the belly where he leans on the anvil
        const bd = Math.hypot((x + 0.5) / 4, (y - yw + 1) / 3);
        if (bd < 1 && (e & PZ)) c = lt(c, 0.08 * (1 - bd) + 0.04);
        return c;
      },
      3: (x, y, z, e) => (e & PY ? lt(STRAP, 0.1) : (x + y) % 4 === 0 ? dk(STRAP, 0.15) : STRAP),
      4: (x, y, z, e) => {
        let c = STRAP;
        if (y === yw + 1 && (e & PY)) c = lt(c, 0.14);
        if (y === yw - 1) c = dk(c, 0.15);
        if (y === yw && (x + z) % 3 === 0) c = lt(c, 0.12); // stitching
        return c;
      },
      5: (x, y, z, e) => ((x + y) % 5 === 0 ? lt(STRAP, 0.18) : e & PY ? lt(STRAP, 0.06) : STRAP),
      6: (x, y, z, e) => {
        let c = 0x8a5a32;
        if (e & NY) c = dk(c, 0.25);
        if (h3(x, y, z, 31) < 0.12) c = dk(c, 0.12);
        return c;
      },
      7: (x, y, z, e) => (e & NY ? dk(0x6a4224, 0.3) : (x + z) % 3 === 0 ? dk(0x6a4224, 0.12) : 0x6a4224),
      8: (x, y, z) => ((x === -5 || x === -1) && (y & 1) ? lt(LEATHER, 0.3) : dk(LEATHER, 0.06)),
      9: () => dk(LEATHER, 0.32),
    });
    return v.geometry(false);
  });
}

/** The travel pack on his back, in the body's voxel frame. */
function packGeo(p) {
  return cached(`hero-pack|${p.bw}|${p.bh}|${p.bd}`, () => {
    const bx = p.bw, by = p.bh, bz = p.bd, H = by * 2;
    const torso = torsoTest(p);
    const v = new Vox(-bx - 8, bx + 8, -4, H + 12, -bz - 18, 0);
    // back surface z of the torso at y (x = 0)
    const back = (y) => { for (let z = -bz - 4; z < 0; z++) if (torso(0.5, y + 0.5, z + 0.5, 0)) return z; return -bz; };
    const pw = 7, y0 = Math.round(H * 0.28), y1 = H + 1;
    const zIn = Math.min(back(Math.round(H * 0.5)), back(Math.round(H * 0.8))) - 0.5;
    const depth = 7, pzc = zIn - depth / 2;
    const yc = (y0 + y1) / 2, hh = (y1 - y0) / 2;
    // the sack: a rounded box, fuller at the bottom
    v.fill(-pw - 2, pw + 2, y0 - 1, y1 + 1, zIn - depth - 2, zIn + 1, (x, y, z) => {
      const ty = (y - yc) / hh;
      const fat = 1 + Math.max(0, -ty) * 0.08;
      return Math.abs(x / (pw * fat)) ** 3.4 + Math.abs(ty) ** 3.4 + Math.abs((z - pzc) / (depth / 2 * fat)) ** 3.4 <= 1 && !torso(x, y, z, 0.5);
    }, 0, 1);
    // the flap over the top, with two straps and buckles
    v.fill(-pw - 1, pw + 1, y1 - 5, y1 + 1.5, zIn - depth - 2, zIn + 1, (x, y, z) => {
      const ty = (y - yc) / hh;
      const inside = Math.abs(x / (pw + 0.6)) ** 3.4 + Math.abs(Math.min(ty, 0.98)) ** 3.4 + Math.abs((z - pzc) / (depth / 2 + 0.6)) ** 3.4 <= 1;
      return inside && (y > y1 - 1.5 || z < zIn - depth + 0.6) && !v.has(Math.floor(x), Math.floor(y), Math.floor(z)) && !torso(x, y, z, 0.5);
    }, 0, 2);
    for (const sx of [-4, 3]) {
      for (let y = y1 - 7; y <= y1 + 1; y++) for (let x = sx; x < sx + 2; x++) {
        const zb = v.backZ(x, y);
        if (isFinite(zb)) v.setM(x, y, zb - 1, 3);
      }
      const zb = v.backZ(sx, y1 - 6);
      if (isFinite(zb)) { v.set(sx, y1 - 6, zb - 1, BRASS); v.set(sx + 1, y1 - 6, zb - 1, BRASS_D); }
    }
    // a front pocket low on the pack
    v.fill(-4.5, 4.5, y0, y0 + 6, zIn - depth - 3, zIn - depth + 1, (x, y, z) => Math.abs(x / 4.2) ** 4 + Math.abs((y - y0 - 3) / 3) ** 4 <= 1 && !v.has(Math.floor(x), Math.floor(y), Math.floor(z)) && z < zIn - depth + 0.5, 0, 4);
    // the bedroll across the top: a rolled red blanket tied with two thongs
    const ry = y1 + 2.6, rz = pzc + 0.5, rr = 2.6;
    v.fill(-pw - 3, pw + 3, ry - rr - 1, ry + rr + 1, rz - rr - 1, rz + rr + 1, (x, y, z) => (y - ry) ** 2 + (z - rz) ** 2 <= rr * rr && Math.abs(x) < pw + 2.5, 0, 5);
    // a coil of rope on the right side
    const cx = pw + 1.6, cy = yc - 1;
    v.fill(cx - 2, cx + 2, cy - 5, cy + 5, pzc - 5, pzc + 5, (x, y, z) => {
      const d = Math.hypot(y - cy, z - pzc);
      return x > cx - 1.6 && x < cx + 1.4 && d > 1.6 && d < 4.2;
    }, 0, 6);
    // a little iron pot hanging on the left
    const kx = -pw - 2, ky = y0 + 2;
    v.fill(kx - 2, kx + 2, ky - 3, ky + 3, pzc - 3, pzc + 3, (x, y, z) => ((x - kx) / 2) ** 2 + ((y - ky) / 2.6) ** 2 + ((z - pzc) / 2.6) ** 2 <= 1 && y < ky + 1.6, 0, 7);
    v.box(Math.round(kx) - 2, Math.round(ky + 1), Math.round(pzc) - 3, Math.round(kx) + 2, Math.round(ky + 2), Math.round(pzc) + 3, 0, 8); // rim
    v.line(kx, ky + 2, pzc - 2.5, kx + 0.5, ky + 5, pzc, 0x3a3a40, 0.5);
    v.line(kx + 0.5, ky + 5, pzc, kx, ky + 2, pzc + 2.5, 0x3a3a40, 0.5);
    // a brass lantern tied to the left strap, high up
    const lx = -pw - 1.5, ly = y1 - 3, lz = pzc - 1;
    v.box(Math.round(lx) - 1, Math.round(ly) - 2, Math.round(lz) - 1, Math.round(lx) + 2, Math.round(ly) + 2, Math.round(lz) + 2, 0, 9);
    v.box(Math.round(lx) - 2, Math.round(ly) - 3, Math.round(lz) - 2, Math.round(lx) + 3, Math.round(ly) - 2, Math.round(lz) + 3, BRASS_D);
    v.box(Math.round(lx) - 2, Math.round(ly) + 2, Math.round(lz) - 2, Math.round(lx) + 3, Math.round(ly) + 3, Math.round(lz) + 3, BRASS);
    v.set(Math.round(lx), Math.round(ly) + 3, Math.round(lz), BRASS_D);
    v.set(Math.round(lx), Math.round(ly) + 4, Math.round(lz), BRASS);
    const seed = 57;
    v.resolve({
      1: (x, y, z, e) => {
        let c = CANVAS;
        if (e & PY) c = lt(c, 0.1);
        if (e & NY) c = dk(c, 0.25);
        if ((e & (PX | NX)) && Math.abs(z - pzc) < 0.6) c = dk(c, 0.16); // side seam
        c = furColor(c, x, y, z, e, seed, 0.4); // canvas weave
        if (h3(x >> 1, y >> 1, z >> 1, seed) < 0.12) c = mix(c, 0x4a3a24, 0.3); // grime
        if (y < y0 + 2) c = dk(c, 0.1);
        return c;
      },
      2: (x, y, z, e) => (e & NY ? dk(0x6a4224, 0.3) : e & PY ? lt(0x6a4224, 0.08) : (x + y) % 4 === 0 ? dk(0x6a4224, 0.1) : 0x6a4224),
      3: (x, y) => ((y & 1) ? STRAP : lt(STRAP, 0.1)),
      4: (x, y, z, e) => (y === y0 + 5 ? dk(CANVAS, 0.3) : (e & NZ) && (x === -4 || x === 3) && (y & 1) ? lt(CANVAS, 0.3) : dk(CANVAS, 0.08)),
      5: (x, y, z) => {
        const a = Math.atan2(y - ry, z - rz);
        let c = (Math.floor(a * 1.6 + x * 0.0) & 1) ? 0xa83a2a : 0xc04a34;
        if (Math.abs(x) > pw - 0.5 && Math.abs(x) < pw + 1.5) c = 0xe8d4a8; // blanket edge
        if (Math.abs(Math.abs(x + 0.5) - 4) < 1) c = STRAP; // the thongs
        if (y < ry - 1.5) c = dk(c, 0.18);
        return c;
      },
      6: (x, y, z) => {
        const a = Math.atan2(y - cy, z - pzc);
        return (Math.floor(a * 4 + Math.hypot(y - cy, z - pzc) * 2) & 1) ? 0xc8a46a : 0xa8844a;
      },
      7: (x, y, z, e) => (e & PY ? 0x4a4a52 : h3(x, y, z, 3) < 0.2 ? 0x2a2a30 : 0x3a3a42),
      8: (x, y, z, e) => (e & PY ? 0x6a6a74 : 0x4a4a52),
      9: (x, y, z) => ((x + z) & 1 ? 0xffd070 : 0xffe8a0), // the glass (unlit candle glow baked in)
    });
    return v.geometry(false);
  });
}

// ---------------------------------------------------------------- arms
/**
 * Rolled sleeve, big forearm and bracer (side 'R') or wrap ('L'), in the arm frame (origin at the
 * shoulder pivot, the arm hangs down -y, built for the +x side).
 */
function sleeveGeo(p, fur, side) {
  return cached(`hero-sleeve|${p.ah}|${fur}|${side}`, () => {
    const ah = p.ah * 2, armBot = -ah + 2;
    const v = new Vox(-6, 7, -ah - 4, 6, -6, 7);
    // the sleeve over the shoulder and upper arm
    v.fill(-5, 5, -2, 5, -5, 5, (x, y, z) => {
      const yc = Math.max(-0.8, Math.min(1.2, y));
      const r = 3.3;
      return x * x + (y - yc) ** 2 + z * z * 1.05 <= r * r && y > -1.6;
    }, 0, 1);
    // the rolled cuff
    v.fill(-5, 5, -3.2, -0.8, -5, 5, (x, y, z) => x * x + z * z * 1.05 <= 3.75 * 3.75 && y > -3.1 && y < -1.0, 0, 2);
    // the big furry forearm
    v.ell(0.2, armBot + 1.3, 0.3, 3.5, 2.9, 3.4, 0, 3);
    if (side === 'R') {
      // a leather bracer with a brass stud
      v.fill(-5, 5, armBot - 1.4, armBot + 1, -5, 5, (x, y, z) => {
        const r = 3.6;
        return (x - 0.2) ** 2 + (z - 0.3) ** 2 * 1.02 <= r * r && y > armBot - 1.2 && y < armBot + 0.9;
      }, 0, 4);
    } else {
      // a cloth wrap round the wrist
      v.fill(-5, 5, armBot - 1.2, armBot + 0.6, -5, 5, (x, y, z) => (x - 0.2) ** 2 + (z - 0.3) ** 2 <= 3.5 * 3.5 && y > armBot - 1.1 && y < armBot + 0.5, 0, 5);
    }
    const seed = side === 'R' ? 11 : 12;
    v.resolve({
      1: (x, y, z, e) => {
        let c = SHIRT;
        if (e & PY) c = lt(c, 0.08);
        if ((e & NX) && y < 1) c = dk(c, 0.12);
        if (h3(x, y, z, seed) < 0.1) c = dk(c, 0.1);
        return c;
      },
      2: (x, y, z, e) => (y === -2 ? lt(SHIRT, 0.22) : e & NY ? dk(SHIRT, 0.2) : lt(SHIRT, 0.1)),
      3: (x, y, z, e) => furColor(lt(fur, 0.04), x, y, z, e || PZ, seed, 1.3),
      4: (x, y, z, e) => {
        let c = STRAP;
        if (y === armBot - 1 || y === armBot + 0) c = (x + z) % 2 ? lt(STRAP, 0.25) : STRAP;
        if ((e & PZ) && Math.abs(x) < 1 && y === armBot) c = BRASS;
        return c;
      },
      5: (x, y, z) => ((x + y + z) % 3 === 0 ? 0xc8b896 : 0xe8dcc0),
    });
    return v.geometry(false);
  });
}

/** Leather boot wraps over the lower leg (leg frame, origin at the hip joint). */
function bootGeo(p) {
  return cached(`hero-boot|${p.lh}`, () => {
    const L = p.lh * 2;
    const v = new Vox(-6, 6, -L - 4, 2, -6, 7);
    v.fill(-5, 5, -L - 1, -L + 3, -5, 6, (x, y, z) => x * x + z * z <= 3.95 * 3.95 && y > -L - 0.6 && y < -L + 2.6, 0, 1);
    // the cuff turned over at the top
    v.fill(-5, 5, -L + 1, -L + 4, -5, 6, (x, y, z) => x * x + z * z <= 4.4 * 4.4 && y > -L + 1.6 && y < -L + 3.2, 0, 2);
    v.resolve({
      1: (x, y, z, e) => {
        let c = 0x5a3a24;
        if ((x + y) % 3 === 0 && (e & PZ)) c = 0x3e2618; // criss-cross laces
        if ((x - y) % 3 === 0 && (e & PZ)) c = 0x3e2618;
        if (e & NY) c = dk(c, 0.2);
        return c;
      },
      2: (x, y, z, e) => (e & PY ? 0x8a6040 : 0x6e4a2e),
    });
    return v.geometry(false);
  });
}

// ---------------------------------------------------------------- head extras
/** Goggles: the strap round the skull at height gy (head frame). */
function goggleStrapGeo(info, gy, skipFront) {
  return cached(`hero-gstrap|${info.W}|${info.H}|${info.D}|${gy}|${skipFront ? 1 : 0}`, () => {
    const { hx, hy, hz, n } = info;
    const v = new Vox(-hx - 4, hx + 4, gy - 3, gy + 4, -hz - 4, hz + 4);
    const outer = skullRow(hx, hy, hz, n, 1.1), inner = skullRow(hx, hy, hz, n, 0.05);
    const inside = (row, x, y, z) => { const [sx, sz, nr, ty, nz] = row(y); return Math.abs(x / sx) ** nr + Math.abs(ty) ** nr + Math.abs(z / sz) ** nz <= 1; };
    v.fill(-hx - 3, hx + 3, gy, gy + 1.9, -hz - 3, hz + 3, (x, y, z) => {
      if (skipFront && z > 0 && Math.abs(x) < hx * 0.75) return false;
      return inside(outer, x, y, z) && !inside(inner, x, y, z);
    }, (x, y, z) => ((Math.round(Math.atan2(z, x) * 6) & 1) ? 0x3a2a24 : 0x4a362c));
    return v.geometry(false);
  });
}

/** Two brass-rimmed lenses and their bridge, facing +z, centred on the origin. */
function goggleLensGeo(eyeX) {
  return cached(`hero-lens|${eyeX}`, () => {
    const v = new Vox(-12, 12, -6, 6, -1, 4);
    for (const s of [-1, 1]) {
      const cx = s * eyeX;
      v.fill(cx - 5, cx + 5, -5, 5, 0, 2.9, (x, y, z) => {
        const r = Math.hypot(x - cx, y);
        if (r > 3.9) return false;
        if (r >= 2.6) return z < 2.9; // the brass rim, proud of the glass
        return z < 1.9;
      }, (x, y, z) => {
        const r = Math.hypot(x + 0.5 - cx, y + 0.5);
        if (r >= 2.6) return (y > 0.5 && x < cx) ? lt(BRASS, 0.35) : r > 3.4 ? BRASS_D : BRASS;
        // glass: smoky amber with a hard glint
        const g = Math.hypot(x + 0.5 - cx + 1, y + 0.5 - 1);
        if (g < 0.8) return 0xfff8e0;
        if (g < 1.6 && x < cx) return 0xe8b860;
        return y < 0 ? 0x6a3a1a : 0x9a5a24;
      });
      // the side clip where the strap attaches
      v.box(Math.round(cx + s * 3.6) - (s < 0 ? 1 : 0), -1, 0, Math.round(cx + s * 3.6) + (s > 0 ? 1 : 0) + 0, 1, 2, BRASS_D);
    }
    v.box(-2, 0, 1, 2, 1, 2, BRASS); // bridge
    return v.geometry(false);
  });
}

/** A lopsided half-smile: his resting mouth (6 wide like the others, top row first). */
function smirkGeo(lip) {
  return cached(`hero-smirk|${lip}`, () => {
    const v = templateVox(['.....D', '....D.', 'DDDD..'], { D: lip }, 1);
    return v.geometry(false, [v.w / 2, 0, 0]);
  });
}

/** His heavy, determined brows (inner ends low), drawn for the +x eye; two voxels deep. */
const HERO_BROW = ['.....BB', '..BBBBH', 'BBBBB..'];
function heroBrowGeo(side, color) {
  return cached(`hero-brow|${side}|${color}`, () => {
    const rows = side > 0 ? HERO_BROW : HERO_BROW.map((r) => r.split('').reverse().join(''));
    const v = templateVox(rows, { B: color, H: lt(color, 0.25) }, 2);
    v.paint((x, y, z, c) => (z === 1 && y === v.h - 1 ? lt(c, 0.18) : undefined));
    return v.geometry(false, [v.w / 2, v.h / 2, 0]);
  });
}

// ---------------------------------------------------------------- the hammer
/** The cross-peen smithing hammer: the grip at the origin, the haft up +y, the head along z. */
function hammerGeo() {
  return cached('hero-hammer', () => {
    const top = 23;
    const v = new Vox(-5, 5, -8, top + 6, -10, 10);
    // haft
    v.box(-1, -6, -1, 1, top, 1, (x, y) => {
      if (y < -4) return y === -6 ? STEEL_D : STEEL; // pommel cap
      if (y < 4) return ((y + x + 40) % 2) ? 0x5a3820 : 0x7a5030; // leather grip wrap
      if (y === 4) return 0x3e2618;
      return (y + 60) % 7 === 0 ? WOOD_D : x === -1 ? WOOD_L : WOOD;
    });
    v.box(-2, -6, -2, 2, -4, 2, (x, y) => (y === -5 ? STEEL_L : STEEL_D)); // pommel
    v.box(-2, top - 6, -2, 2, top - 4, 2, (x, y) => (y === top - 5 ? lt(BRASS, 0.3) : BRASS)); // ferrule
    // the head: a heavy block, a flat striking face (+z) and a wedge peen (-z)
    const hy0 = top - 3, hy1 = top + 4, hc = (hy0 + hy1) / 2;
    v.fill(-4, 4, hy0, hy1, -9, 9, (x, y, z) => {
      if (z > 0) return Math.abs(x) < 3.1 && Math.abs(y - hc) < 3.6 && z < 7.6; // face side
      const t = -z / 8.6; // peen tapers in y toward a horizontal edge
      return Math.abs(x) < 3.1 - t * 0.6 && Math.abs(y - hc) < 3.6 - t * 2.9 && z > -8.6;
    }, (x, y, z) => {
      const ax = Math.abs(x + 0.5), ay = Math.abs(y + 0.5 - hc);
      if (z >= 6) return ax > 2.2 || ay > 2.8 ? STEEL : STEEL_L; // polished face
      if (z <= -7) return STEEL_L; // the peen edge
      if (ay > 2.6 && y > hc) return lt(STEEL, 0.25);
      if (ay > 2.6) return STEEL_D;
      if (ax > 2.4) return dk(STEEL, 0.1);
      if (h3(x, y, z, 77) < 0.1) return dk(STEEL, 0.25);
      return STEEL;
    });
    // a chamfered collar round the face
    v.fill(-5, 5, hy0 - 1, hy1 + 1, 4, 6, (x, y, z) => Math.abs(x) < 3.7 && Math.abs(y - hc) < 4.2 && Math.abs(x) + Math.abs(y - hc) < 6.6, (x, y) => (y > hc ? lt(STEEL, 0.15) : STEEL_D));
    // a wedge through the eye on top
    v.box(-1, hy1, -1, 1, hy1 + 1, 1, WOOD_D);
    return v.geometry(false);
  });
}

// ---------------------------------------------------------------- the rig
const _v = new THREE.Vector3();
const HAMMER_FACE = new THREE.Vector3(0, 24.5, 7.5); // the face centre in hammer voxels

export class HeroRig extends CharacterRig {
  constructor(parts) {
    super(parts);
    this.lookYaw = 0; this.lookPitch = 0; this.lookYawT = 0; this.lookPitchT = 0;
    this.hammerMode = null;
    this.autoSwing = 0;
    this.onStrike = null;
    this.gogglesPos = 'up';
  }

  setHammer(mode = null) { this.hammerMode = mode; }
  setPack(on) { if (this.packBone) this.packBone.visible = !!on; }
  setGoggles(pos = 'up') {
    this.gogglesPos = pos === 'down' ? 'down' : 'up';
    if (this.gogUp) for (const b of this.gogUp) b.visible = this.gogglesPos === 'up';
    if (this.gogDown) for (const b of this.gogDown) b.visible = this.gogglesPos === 'down';
  }
  look(yaw = 0, pitch = 0) {
    this.lookYawT = Math.max(-1.1, Math.min(1.1, yaw));
    this.lookPitchT = Math.max(-0.6, Math.min(0.7, pitch));
  }
  headWorld(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return this.neck.localToWorld(out.copy(this.anchors.headTop));
  }
  hammerFaceWorld(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    const b = this.hammerHand;
    if (!b) return this.handR.getWorldPosition(out);
    return b.localToWorld(out.copy(HAMMER_FACE));
  }

  /** Which way the hammer is carried right now. */
  hammerNow() {
    if (!this.hammerHand) return 'none';
    if (this.hammerMode) return this.hammerMode;
    if (this.holds && this.holds.R) return 'back';
    const st = this.state;
    if (st === 'hammer' || st === 'swing' || st === 'fall' || st === 'pose') return 'hand';
    if (st === 'sit' || st === 'sleep' || st === 'lie' || st === 'climb' || st === 'swim' || st === 'carry' || st === 'dig' || st === 'chisel' || st === 'brush' || st === 'drill') return 'back';
    return 'shoulder';
  }

  update(dt) {
    // automatic forging blows
    if (this.state === 'hammer' && this.autoSwing > 0) {
      const prev = this.swingPhase;
      this.swingPhase = (this.swingPhase + dt * this.autoSwing) % 1;
      if (this.swingPhase < prev) this.onStrike?.(this.hammerFaceWorld(new THREE.Vector3()));
    }
    const st = this.state;
    super.update(dt);
    const t = this.t, s = this.s, T = this.stateT || 0;
    const { hip, neck, armL, armR, legL, legR } = this;
    const mode = this.hammerNow();
    const breathe = Math.sin(t * 2.2);

    switch (st) {
      case 'idle':
        // planted feet, chest out
        hip.rotation.x = this.baseHunch - 0.04;
        legL.rotation.z = 0.06; legR.rotation.z = -0.06;
        armL.rotation.set(Math.sin(t * 1.3) * 0.04, 0, 0.22);
        break;
      case 'walk': case 'run': {
        const f = st === 'run' ? 14 : 8.5;
        const w = Math.sin(t * f);
        legL.rotation.x = w * (st === 'run' ? 0.95 : 0.72);
        legR.rotation.x = -w * (st === 'run' ? 0.95 : 0.72);
        armL.rotation.x = -w * 0.7;
        armL.rotation.z = 0.18;
        hip.rotation.y = w * 0.08; // a swagger in the shoulders
        neck.rotation.y = -w * 0.06;
        break;
      }
      case 'hammer': {
        // 0 → 0.62 raise (easing out), hold at the top, 0.8 → 1 slam down
        const ph = this.swingPhase % 1;
        const up = ph < 0.62 ? 1 - (1 - ph / 0.62) ** 2 : ph < 0.8 ? 1 : 1 - ((ph - 0.8) / 0.2) ** 2;
        armR.rotation.set(-1.62 - up * 1.3, 0, -0.18 + up * 0.1);
        armL.rotation.set(-0.95, 0, 0.32); // holding the work with tongs, out front
        hip.rotation.x = this.baseHunch + 0.16 - up * 0.2;
        hip.rotation.y = -0.12 + up * 0.08;
        neck.rotation.x = 0.28 - up * 0.12;
        legL.rotation.x = -0.18; legR.rotation.x = 0.16;
        if (ph < 0.06) hip.position.y -= s * 0.4 * (1 - ph / 0.06); // the jolt of the blow
        break;
      }
      case 'fall': {
        armL.rotation.set(-2.5 + Math.sin(t * 13) * 0.55, 0, 0.7 + Math.sin(t * 9) * 0.35);
        armR.rotation.set(-2.3 + Math.sin(t * 11 + 1) * 0.5, 0, -0.7 - Math.sin(t * 8) * 0.35);
        legL.rotation.x = Math.sin(t * 10) * 0.8;
        legR.rotation.x = -Math.sin(t * 10) * 0.8;
        neck.rotation.x = -0.3;
        break;
      }
      case 'brace': {
        const wob = Math.sin(t * 17) * 0.06 + Math.sin(t * 7.3) * 0.05;
        hip.position.y -= s * 0.9;
        hip.rotation.z = wob;
        hip.rotation.x = this.baseHunch + 0.12;
        legL.rotation.set(-0.35, 0, 0.32); legR.rotation.set(-0.35, 0, -0.32);
        armL.rotation.set(-0.5 + Math.sin(t * 9) * 0.2, 0, 1.25 + wob * 3);
        if (mode !== 'shoulder') armR.rotation.set(-0.5 + Math.sin(t * 8 + 2) * 0.2, 0, -1.25 + wob * 3);
        neck.rotation.x = 0.3;
        break;
      }
      case 'reach': {
        const k = Math.min(1, T / 0.5);
        hip.rotation.x = this.baseHunch + 0.38 * k;
        hip.position.y -= s * 0.7 * k;
        legL.rotation.x = -0.3 * k; legR.rotation.x = 0.25 * k;
        armL.rotation.set(-1.25 * k + Math.sin(t * 3) * 0.04, 0, 0.12);
        neck.rotation.x = 0.1 * k;
        break;
      }
      case 'peer': {
        const k = Math.min(1, T / 0.6);
        hip.rotation.x = this.baseHunch + 0.3 * k;
        neck.rotation.x = 0.42 * k + Math.sin(t * 1.1) * 0.03;
        armL.rotation.set(-0.3 * k, 0, 0.35);
        break;
      }
      case 'pose': {
        hip.rotation.x = this.baseHunch - 0.08;
        neck.rotation.x = -0.14;
        neck.rotation.y = 0.18;
        legL.rotation.z = 0.1; legR.rotation.z = -0.1;
        armR.rotation.set(-0.55, 0, -0.42); // paw on the haft end, the head planted on the ground
        armL.rotation.set(0.15, 0, 0.55); // fist on the hip
        hip.position.y += breathe * s * 0.2;
        break;
      }
      case 'lie': {
        hip.position.y = s * 1.2;
        hip.rotation.x = -1.45;
        neck.rotation.x = -0.1;
        neck.rotation.z = 0.35;
        armL.rotation.set(-0.3, 0, 1.2); armR.rotation.set(-0.2, 0, -1.0);
        legL.rotation.set(-0.15, 0, 0.2); legR.rotation.set(0.1, 0, -0.15);
        break;
      }
      default: break;
    }
    // carrying the hammer
    const H = this.hammerHand, B = this.hammerBack;
    if (H) {
      if (mode === 'shoulder') {
        // forearm raised, the haft resting on the shoulder, the head behind it
        armR.rotation.set(-1.0 + (st === 'walk' || st === 'run' ? Math.sin(t * (st === 'run' ? 14 : 8.5)) * 0.06 : breathe * 0.02), 0, -0.05);
        this.hammerGrip.rotation.set(0.05, 0, -0.42);
        this.hammerGrip.position.set(this.s * 0.6, 0, 0);
        H.position.y = 0;
      } else if (mode === 'hand') {
        // the haft carries on along the forearm, the face square to what he hits; to forge he
        // chokes up on the haft
        this.hammerGrip.rotation.set(Math.PI + (st === 'hammer' ? 0.04 : 0.1), 0, 0);
        this.hammerGrip.position.set(0, 0, 0);
        H.position.y = st === 'hammer' ? -9 * this.vs : 0;
        if (st === 'pose') this.hammerGrip.rotation.set(Math.PI - 0.55, 0, 0.25);
      }
      H.visible = mode === 'shoulder' || mode === 'hand';
      B.visible = mode === 'back';
    }
    if (this.gogglesPos === 'down') this.eyes.forEach((g) => { g.scale.y = 1; });
    // head look (relative to the body)
    const kl = Math.min(1, dt * 6);
    this.lookYaw += (this.lookYawT - this.lookYaw) * kl;
    this.lookPitch += (this.lookPitchT - this.lookPitch) * kl;
    neck.rotation.y += this.lookYaw;
    neck.rotation.x -= this.lookPitch;
  }
}

// ---------------------------------------------------------------- build
/**
 * Build the hero. opts.height: top of his head (without the goggles and cowlick), default 0.86
 * (meters, FPS scale); opts.pack (default true): the travel pack; opts.hammer (default true): the
 * smithing hammer; opts.goggles: 'up' (default) | 'down'; opts.kind: 'toon' | 'lambert' | 'basic'.
 */
export function makeHeroMole(opts = {}) {
  const spec = normSpec(opts.spec ? { ...HERO_SPEC, ...opts.spec } : HERO_SPEC); // opts.spec: dev overrides
  const p = heroProportions(spec);
  const height = opts.height ?? 0.86;
  const u = height / (p.lh + p.bh + p.hh + 1); // classic unit (rig.s)
  const vs = u / 2;
  const kind = opts.kind || 'toon';
  const bake = kind === 'basic';
  const withPack = opts.pack !== false;
  const withHammer = opts.hammer !== false;
  const A = new SkinAssembler();
  const R = [vs, vs, vs], L = [-vs, vs, vs];
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const root = new THREE.Group();
  root.name = 'hero-mole';
  const hip = group(root);

  // legs: work trousers, boot wraps
  const legSpec = { ...spec, outfit: 'apron' };
  const legL = group(root, -p.bw * 0.27 * u, p.lh * u + u, 0);
  const legR = group(root, p.bw * 0.27 * u, p.lh * u + u, 0);
  const legRb = A.part(legR, buildLeg(legSpec, p, 1, bake).geo, { scale: R });
  const legLb = A.part(legL, buildLeg(legSpec, p, -1, bake).geo, { scale: L });
  A.attach(legRb, bootGeo(p));
  A.attach(legLb, bootGeo(p));

  // body: the shirt, then the apron, belt and pouches on the same (breathing) bone
  hip.position.y = p.lh * u + u * 0.5;
  const bodyMesh = A.part(hip, buildBody(spec, p, bake).geo, { scale: R });
  A.attach(bodyMesh, apronGeo(p, withPack));
  const tail = group(hip, 0, 3 * vs, (-p.bd + 1.5) * vs);
  A.part(tail, buildTail({ species: 'mole', fur: spec.fur, age: spec.age }, bake), { scale: R });
  let packBone = null;
  if (withPack) packBone = scaleVisible(A.part(hip, packGeo(p), { scale: R }));

  // head and face
  const neck = group(hip, 0, (p.bh - 1) * u, u * 0.5);
  const head = buildHead(spec, p, bake);
  const info = head.info;
  A.part(neck, head.geo, { scale: R });
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
  const brows = info.eyes.map((e, i) => {
    const y = (info.browY + 1.5 + 0.5) * vs;
    const g = group(neck, (e.x + e.side * 0.5) * vs, y, (info.browZ[i] - 0.5) * vs);
    g.userData.side = e.side;
    g.userData.y = y;
    A.part(g, heroBrowGeo(e.side, 0x1a100e), { scale: R, rot: [0, 0, e.side * 0.26] });
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
  {
    const b = scaleVisible(A.part(mouthRest, smirkGeo(info.lip), { pos: [0, -3 * vs, 0], scale: R }));
    b.visible = false;
    mouthRest.userData.variants.smirk = b;
  }
  const mouth = scaleVisible(mkMouthGroup(openSet, 0.35), new THREE.Vector3(1, 1, 1));
  mouth.visible = false;
  let whiskers = null;
  if (info.whisk) {
    const w = info.whisk;
    whiskers = [-1, 1].map((side) => {
      const g = group(neck, side * w.x * vs, w.y * vs, w.z * vs);
      A.part(g, whiskerGeo(w.color, w.len, bake), { scale: [side * vs, vs * 0.5, vs * 0.5], layer: 'detail' });
      g.userData.side = side;
      return g;
    });
  }

  // goggles: up on the forehead, or down over the eyes
  const eyeX = Math.abs(info.eyes[0].x);
  const eyeY = info.eyes[0].y;
  const eyeZ = Math.max(...info.eyes.map((e) => e.z));
  const gyUp = Math.round(info.browY) + 3;
  // where the forehead is at the lens height (the skull's front)
  let zFore = info.hz;
  for (let z = info.hz + 4; z > 0; z--) if (info.skull(0.5, gyUp + 1.5, z + 0.5)) { zFore = z + 1; break; }
  const gogUp = [
    scaleVisible(A.part(neck, goggleStrapGeo(info, gyUp, false), { scale: R })),
    scaleVisible(A.part(neck, goggleLensGeo(eyeX), { pos: [0, (gyUp + 1.5) * vs, (zFore - 0.8) * vs], scale: R, rot: [-0.62, 0, 0] })),
  ];
  const gogDown = [
    scaleVisible(A.part(neck, goggleStrapGeo(info, Math.round(eyeY) - 1, true), { scale: R })),
    scaleVisible(A.part(neck, goggleLensGeo(eyeX), { pos: [0, (eyeY + 0.5) * vs, (eyeZ + 0.2) * vs], scale: R })),
  ];

  // arms: rolled sleeves over big forearms, the big digging paws
  const shoulderY = (p.bh - 1.5) * u;
  const armL = group(hip, -(p.bw / 2 + 1.5) * u, shoulderY, u * 0.5);
  const armR = group(hip, (p.bw / 2 + 1.5) * u, shoulderY, u * 0.5);
  const arm = buildArm({ ...spec, outfit: 'none', dirt: 0.6 }, p, bake);
  const big = [vs * 1.1, vs * 1.06, vs * 1.1], bigL = [-vs * 1.1, vs * 1.06, vs * 1.1];
  const armRb = A.part(armR, arm.geo, { scale: big });
  const armLb = A.part(armL, arm.geo, { scale: bigL });
  A.attach(armRb, sleeveGeo(p, spec.fur, 'R'));
  A.attach(armLb, sleeveGeo(p, spec.fur, 'L'));
  const handL = group(armL, 0, -(p.ah + 1) * u * 1.06, u);
  const handR = group(armR, 0, -(p.ah + 1) * u * 1.06, u);

  // the hammer: in the paw (or on the shoulder), and a copy strapped across the pack
  let hammerHand = null, hammerBack = null, hammerGrip = null;
  if (withHammer) {
    hammerGrip = group(handR, 0, 0, 0);
    hammerHand = scaleVisible(A.part(hammerGrip, hammerGeo(), { scale: R }));
    const backG = group(hip, 0, (p.bh * 1.1) * u, -(p.bd + (withPack ? 8 : 3)) * vs);
    backG.rotation.set(0, 0, 0.75);
    hammerBack = scaleVisible(A.part(backG, hammerGeo(), { pos: [0, -12 * vs, 0], scale: R, rot: [0, Math.PI / 2, 0] }));
    hammerBack.visible = false;
  }

  // skin
  const h = (p.lh + p.bh + p.hh + 1) * u;
  const bounds = new THREE.Sphere(new THREE.Vector3(0, h * 0.6, 0), h * 1.3);
  const skin = A.build(charMaterial(kind), bounds);
  root.add(skin.main);
  if (skin.detail) root.add(skin.detail);
  const meshes = [skin.main, skin.detail].filter(Boolean);

  const rig = new HeroRig({
    root, hip, neck, headMesh: null, armL, armR, legL, legR, handL, handR, eyes, mouth, tail, lamp: null, height: h, s: u, spec, p,
    vs, bodyMesh, brows, mouthRest, whiskers, ears: null, eyeType: spec.eyes, restMouth: 'smirk',
    breath: 0.016, digger: true, skeleton: skin.skeleton, meshes, lod: 'full',
    skin: { assembler: A, main: skin.main, detail: skin.detail, lens: null, lensPart: null },
  });
  rig.packBone = packBone;
  rig.hammerHand = hammerHand;
  rig.hammerBack = hammerBack;
  rig.hammerGrip = hammerGrip;
  rig.gogUp = gogUp;
  rig.gogDown = gogDown;
  rig.anchors = {
    eyes: new THREE.Vector3(0, eyeY * vs, eyeZ * vs),
    mouth: new THREE.Vector3(0, mouthTop, (mi.z + 0.5) * vs),
    nose: new THREE.Vector3(0, info.noseY * vs, info.snoutFront * vs),
    headTop: new THREE.Vector3(0, (info.H + 4) * vs, 0),
    headW: info.W * vs, headH: info.H * vs, headD: info.D * vs,
  };
  rig.eyeDrop = true;
  rig.setGoggles(opts.goggles || 'up');
  root.userData.rig = rig;
  rig.update(0);
  return rig;
}
