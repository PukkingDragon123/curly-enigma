// The raptor egg he found in the forest on the way here (the journey, FallScene: state.data.egg),
// kept in a little nest of straw and twigs on the floor by your bedroll. Day by day it cracks a
// little more (a hairline from the pip, then a zigzag round it, warm light in the cracks: the
// title's egg, forest/egg.js); when you're near it rocks and peeps, more as it gets on. After
// HATCH_DAYS days it's hatching: go to it (E) and the shell gives, the cap tumbles off and a baby
// raptor sits up in the bottom half; you name it (the tame system's naming talk) and it's yours,
// state.data.tame.raptors with how: 'hatched' (it sleeps curled in its nest by your bedroll,
// tame/home.js rec.restAt, and comes down the mine with you like any other).
//
//   state.data.egg: null | { day (found), at (ms), crack, hatched (day) , id (the raptor) }
//   homeEgg(scene) → { group, update, dispose, hatch() } | null   (HomeScene hook, like homeRaptors)
//   eggStage(data) → 0..1 (1: hatching)
import * as THREE from 'three';
import { buildRaptorEgg, nestGeo } from '../bookends/forest/egg.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { clamp, rand } from '../core/util.js';
import { SPOTS, STAR_SPOTS } from './spots.js';
import { walkable } from './plan.js';
import { tameData } from '../deep/tame/index.js';
import { Glint, teachWord } from './tutorFx.js';

/** In-game days from finding it to hatching. */
export const HATCH_DAYS = 4;
/** How the shell looks each day (crack 0..1, the last is the day it hatches). */
const CRACK = [0, 0.16, 0.4, 0.68, 0.92];
const EGG_K = 0.76; // (as in the forest)

/** How far on the egg is: 0 (just found) .. 1 (hatching). */
export function eggStage(d) {
  const e = d?.egg;
  if (!e || e.hatched) return 0;
  return clamp(((d.day || 1) - (e.day || 1)) / HATCH_DAYS, 0, 1);
}

const R = (a, b) => a + Math.random() * (b - a);
/** Its sounds (recorded samples: the title's egg sounds, quieter for a cave floor). */
function eggSounds(au) {
  if (!au?.define || au.presets?.nest_egg_peep) return;
  au.define('nest_egg_peep', (a, p = {}) => a.sample(['squeak1', 'squeak2', 'squeak3', 'chirp1'], { vol: (p.vol ?? 1) * 0.22, pitch: R(1.5, 1.9), pan: p.pan || 0, reverb: 0.35, filter: p.muffled ? 'lowpass' : undefined, ff: 1800 }), 0.2);
  au.define('nest_egg_crack', (a, p = {}) => {
    a.sample(['crack1', 'crack2', 'crack3'], { vol: (p.vol ?? 1) * 0.18, pitch: (p.pitch ?? 1) * R(1.5, 1.9), pan: p.pan || 0, dur: R(0.12, 0.2), release: 0.05, filter: 'highpass', ff: 900, reverb: 0.3 });
    if (Math.random() < 0.6) a.sample('egg', { vol: (p.vol ?? 1) * 0.12, pitch: R(1.3, 1.6), pan: p.pan || 0, dur: 0.12, release: 0.04, delay: 0.03 });
  }, 0.09);
  au.define('nest_egg_hatch', (a, p = {}) => {
    a.sample('egg', { vol: (p.vol ?? 1) * 0.45, pitch: R(0.95, 1.1), pan: p.pan || 0, reverb: 0.35 });
    a.sample(['crack1', 'crack2', 'crack3'], { vol: (p.vol ?? 1) * 0.32, pitch: R(1.2, 1.4), pan: p.pan || 0, delay: 0.05, dur: 0.3, release: 0.1 });
  }, 0.2);
}

/** A clear patch of floor by the bedroll for the nest (meters), or null. */
function nestSpot(scene) {
  const br = scene.cave?.dyn?.bedroll;
  if (!br) return null;
  const w = scene.world, stand = scene.bedroll?.standAt;
  const keep = [];
  for (const p of Object.values(STAR_SPOTS)) if (p && p.x !== undefined) keep.push([p.x, p.z, 0.5]);
  for (const p of Object.values(SPOTS)) if (p && p.x !== undefined && p !== SPOTS.bed) keep.push([p.x, p.z, 0.42]);
  if (stand) keep.push([stand.x, stand.z, 0.5]);
  const mine = scene.cave?.mine;
  if (mine?.ledge) keep.push([mine.ledge.x, mine.ledge.z, 0.36]);
  if (mine?.trunk) keep.push([mine.trunk.x, mine.trunk.z, 0.4]);
  const floor = (x, z) => walkable(x, z) || scene.inBedroom?.(x, z);
  const yaw = br.yaw || 0, c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const hw = 0.25 * c + 0.72 * s, hd = 0.25 * s + 0.72 * c; // (the bedroll's half extents, as HomeScene.bedrollRec)
  const clear = (x, z) => {
    for (let dx = -0.22; dx <= 0.23; dx += 0.11) for (let dz = -0.22; dz <= 0.23; dz += 0.11) {
      const px = x + dx, pz = z + dz;
      if (!floor(px, pz) || w?.solidAt?.(px, 0.12, pz) || w?.solidAt?.(px, 0.4, pz)) return false;
      if (Math.abs(px - br.x) < hw + 0.04 && Math.abs(pz - br.z) < hd + 0.04) return false;
    }
    return !keep.some(([kx, kz, r]) => Math.hypot(kx - x, kz - z) < r);
  };
  let best = null, bs = 1e9;
  for (let x = br.x - 1.4; x <= br.x + 1.4; x += 0.08) for (let z = br.z - 1.4; z <= br.z + 1.4; z += 0.08) {
    // snug against the bedroll's long side, toward its head (the ledge with your notebook and candle)
    const ex = Math.max(0, Math.abs(x - br.x) - hw), ez = Math.max(0, Math.abs(z - br.z) - hd);
    const gap = Math.hypot(ex, ez);
    if (gap > 0.7 || !clear(x, z)) continue;
    const head = mine?.ledge ? Math.hypot(x - mine.ledge.x, z - mine.ledge.z) : 0;
    const sc = Math.abs(gap - 0.3) * 2 + head * 0.4;
    if (sc < bs) { bs = sc; best = { x, z }; }
  }
  return best;
}

/** Put the egg (or, once hatched, its empty nest) by your bedroll. scene: HomeScene. */
export function homeEgg(scene) {
  const g = scene.game, st = g.state, d = st.data;
  if (!d?.egg || !scene.scene || !scene.rig) return null;
  eggSounds(g.audio);
  const E = d.egg;
  // (where it was last time, unless your bedroll has moved: then a new place by it, and the little one's bed moves too)
  const brNow = scene.cave?.dyn?.bedroll;
  const keepOld = E.spot && brNow && Math.hypot(E.spot.x - brNow.x, E.spot.z - brNow.z) < 1.8 && (walkable(E.spot.x, E.spot.z) || scene.inBedroom?.(E.spot.x, E.spot.z)) && !scene.world?.solidAt?.(E.spot.x, 0.12, E.spot.z);
  const at = keepOld ? E.spot : nestSpot(scene);
  if (!at) { console.warn('[egg] no room by the bedroll for the nest'); return null; }
  E.spot = { x: +at.x.toFixed(3), z: +at.z.toFixed(3) };
  if (E.id) { const r = tameData(st).raptors.find((x) => x.id === E.id); if (r?.restAt) { r.restAt.x = E.spot.x; r.restAt.z = E.spot.z; } }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // (the egg keeps a little of the warmth inside it: it glows faintly in the dark cave, and its cracks show light)
  const eggMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2814 });
  const group = new THREE.Group();
  group.name = 'raptor-egg-nest';
  group.position.set(at.x, 0, at.z);
  const br = scene.cave.dyn.bedroll;
  group.rotation.y = Math.atan2(br.x - at.x, br.z - at.z) + 2.4;
  const nest = new THREE.Mesh(nestGeo(23, { r: 0.27, straw: 1.3 }), mat);
  nest.layers.enable(LAYER_OUTLINE);
  group.add(nest);
  const egg = buildRaptorEgg(31);
  const hold = new THREE.Group(); // (it rocks on its foot)
  hold.position.y = 0.03;
  hold.scale.setScalar(EGG_K);
  group.add(hold);
  const shell = new THREE.Mesh(egg.geo, eggMat);
  shell.layers.enable(LAYER_OUTLINE);
  shell.rotation.set(-0.1, 0.4, 0.06); // lying back in the straw a little, the pip toward you
  hold.add(shell);
  const half = new THREE.Mesh(egg.half, eggMat), cap = new THREE.Mesh(egg.top, eggMat);
  half.layers.enable(LAYER_OUTLINE); cap.layers.enable(LAYER_OUTLINE);
  half.visible = cap.visible = false;
  hold.add(half);
  group.add(cap);
  cap.scale.setScalar(EGG_K);
  scene.scene.add(group);
  const tag = 'egg-nest';
  const box = [at.x - 0.24, 0, at.z - 0.24, at.x + 0.24, 0.16, at.z + 0.24];
  scene.world?.add?.(...box, tag);

  const stageNow = () => eggStage(d);
  const dayN = () => clamp(Math.floor((d.day || 1) - (E.day || 1)), 0, HATCH_DAYS);
  const paint = () => {
    if (E.hatched) { shell.visible = false; half.visible = true; cap.visible = true; cap.position.set(0.2, 0.0, 0.12); cap.rotation.set(1.9, 0.6, 0.3); return; }
    egg.setCrack(CRACK[dayN()]);
    E.crack = CRACK[dayN()];
  };
  paint();
  const off = st.on?.('day', () => paint());

  const its = [];
  const label = () => {
    if (E.hatched) return 'The nest';
    const n = dayN();
    return n >= HATCH_DAYS ? 'The egg is hatching!' : n === 0 ? 'The raptor egg' : 'The raptor egg (cracking)';
  };
  const LOOK = [
    'The egg from the forest, in its straw. It\'s warm. When I put my ear to it something inside goes <i>tik</i>.',
    'A hairline crack by the pip. It peeps when I talk to it. I think it knows my voice.',
    'The crack runs round its middle now, zigzagging. It rocks if I come close.',
    'Cracked all over its front, warm light in every crack. Any day now. Tomorrow?',
  ];
  its.push(scene.addIt({
    x: at.x, y: 0.14, z: at.z, r: 0.26, reach: 2.2,
    label,
    action: () => {
      if (E.hatched) { scene.think?.('The nest it hatched in. It still likes to curl up here.', 2.6); return; }
      if (dayN() >= HATCH_DAYS) { hatch(); return; }
      rock = 1; peep(0.8);
      scene.think?.(LOOK[Math.min(LOOK.length - 1, dayN())], 3.6);
    },
  }));

  // ---- alive in its straw: a rock and a peep now and then while you're near (more as it gets on)
  let t = 0, rock = 0, peepT = rand(2, 5), hatching = null, boxT = 0, wordT = 1.5, glint = null;
  // (wave 12: shown, not told) the first time you come near, a few words say how it hatches; on its
  // day it glints with gold motes and says so as you come near
  const eggTop = () => new THREE.Vector3(at.x, 0.62, at.z);
  const teach = (dt, dist, n) => {
    if (n >= HATCH_DAYS && !glint && scene.fx) glint = new Glint(scene.fx, () => (hatching || E.hatched ? null : new THREE.Vector3(at.x, 0.3, at.z)), { r: 0.18, rate: 0.1 });
    glint?.update(dt);
    if ((wordT -= dt) > 0 || dist > 3.2 || scene.cine || scene.scripted || scene.waking) return;
    const st = g.state;
    if (n >= HATCH_DAYS) { wordT = 14; teachWord(g, 'It\'s hatching!', eggTop(), { kind: 'great', life: 2.4 }); }
    else if (st?.flag && !st.flag('tipEgg')) { st.flag('tipEgg', true); wordT = 9; teachWord(g, 'Sleep. It hatches.', eggTop(), { life: 2.6 }); }
  };
  const peep = (v = 1, muffled = false) => {
    const pl = scene.rig?.player?.pos;
    const dist = pl ? Math.hypot(pl.x - at.x, pl.z - at.z) : 2;
    g.audio?.play?.('nest_egg_peep', { vol: v * clamp(1.3 - dist / 6, 0.15, 1), muffled });
  };
  const tick = (dt) => {
    t += dt;
    if ((boxT -= dt) <= 0) { boxT = 1; if (scene.world?.boxes && !scene.world.boxes.some((b) => b.tag === tag)) scene.world.add(...box, tag); }
    if (hatching) { hatchTick(dt); return; }
    if (E.hatched) return;
    const pl = scene.rig?.player?.pos;
    const dist = pl ? Math.hypot(pl.x - at.x, pl.z - at.z) : 99;
    const n = dayN();
    teach(dt, dist, n);
    peepT -= dt;
    if (dist < 4 && peepT <= 0) {
      peepT = rand(3, 7) / (1 + n * 0.6);
      if (n > 0 || Math.random() < 0.4) { rock = Math.max(rock, 0.4 + n * 0.15); peep(0.5 + n * 0.12, n < 2); if (n >= 2 && Math.random() < 0.5) g.audio?.play?.('nest_egg_crack', { vol: 0.35 }); }
    }
    rock = Math.max(0, rock - dt * 1.2);
    const k = rock * (0.12 + n * 0.03);
    hold.rotation.z = Math.sin(t * 22) * k;
    hold.rotation.x = Math.sin(t * 17 + 1) * k * 0.5;
  };

  // ---- the hatching: it rocks hard, cracks, the cap tumbles off, a baby raptor sits up; you name it
  function hatch() {
    if (hatching || E.hatched) return;
    hatching = { t: 0, step: 0 };
    rock = 1.6;
    scene.game.ui?.setHints?.(null);
  }
  const capV = new THREE.Vector3(), capS = new THREE.Vector3();
  function hatchTick(dt) {
    const H = hatching;
    H.t += dt;
    const k = Math.min(1, H.t / 1.4);
    hold.rotation.z = Math.sin(H.t * (24 + k * 20)) * (0.12 + k * 0.16);
    egg.setCrack(Math.min(1, CRACK[HATCH_DAYS] + k * 0.12));
    if (H.step === 0 && H.t > 0.15) { H.step = 1; g.audio?.play?.('nest_egg_crack', { vol: 0.8 }); peep(1); }
    if (H.step === 1 && H.t > 0.7) { H.step = 2; g.audio?.play?.('nest_egg_crack', { vol: 0.9, pitch: 0.85 }); }
    if (H.step === 2 && H.t > 1.4) {
      H.step = 3;
      g.audio?.play?.('nest_egg_hatch', { vol: 1 });
      shell.visible = false; half.visible = true; cap.visible = true;
      hold.rotation.set(0, 0, 0);
      cap.position.set(0, 0.03 + egg.height * EGG_K * 0.62, 0);
      capV.set(rand(0.4, 0.7), 1.3, rand(-0.2, 0.3)); capS.set(rand(4, 7), rand(-2, 2), rand(-3, 3));
      // bits of shell and a puff of warm light (tiny voxels)
      const p = new THREE.Vector3(at.x, 0.2, at.z);
      for (let i = 0; i < 16; i++) scene.fx?.spawn?.({ x: p.x, y: p.y, z: p.z, vx: rand(-0.7, 0.7), vy: rand(0.6, 1.6), vz: rand(-0.7, 0.7), life: rand(0.6, 1.1), size: 0.012, color: i % 3 ? [0.96, 0.9, 0.78] : [1, 0.75, 0.35], glow: i % 3 === 0, drag: 1.2, grav: 2.2 });
      born();
    }
    if (H.step >= 3) {
      // the cap tumbling off onto the straw beside it
      if (cap.position.y > 0.02 || capV.y > 0) {
        capV.y -= 6 * dt;
        cap.position.addScaledVector(capV, dt * 0.35);
        cap.rotation.x += capS.x * dt; cap.rotation.y += capS.y * dt; cap.rotation.z += capS.z * dt;
        if (cap.position.y <= 0.02 && capV.y < 0) { cap.position.y = 0.02; capV.set(0, 0, 0); }
      }
      if (H.t > 6 && !H.naming) hatching = null;
    }
  }
  /** The record, the baby in its nest, then the naming talk. */
  function born() {
    const T = tameData(st);
    const rec = {
      id: 'rx' + Date.now().toString(36) + (10 + ((Math.random() * 90) | 0)), name: 'Hatchling', trust: 100,
      bornAt: Date.now(), bornDay: d.day || 1, how: 'hatched', variant: 0, size: 0.5, zone: 1, bites: 0, finds: 0,
      restAt: { x: at.x, z: at.z, yaw: group.rotation.y - 2.4 + Math.PI },
    };
    T.raptors.push(rec);
    if (!T.active) T.active = rec.id;
    E.hatched = d.day || 1;
    E.id = rec.id;
    try { st.learn?.('raptor_friend'); } catch (e) { /* the index card is a bonus */ }
    try { st.save?.(); } catch (e) { /* autosave will */ }
    import('../deep/tame/home.js').then(async (m) => {
      if (scene.gone) return;
      scene.raptors?.dispose?.();
      const RH = m.homeRaptors(scene);
      const r = RH?.list.find((x) => x.rec.id === rec.id);
      if (!r) return;
      r.awake = 1; r.happy = 3; r.hop = 1; r.greeted = true;
      g.audio?.play?.('raptor_chirp', { n: 3 });
      // the naming talk (the tame system's own), framed on the little one
      const N = await import('../deep/tame/naming.js');
      const e = {
        root: r.root, pos: r.root.position, lookAt: new THREE.Vector3(), faceAt: null, talkHold: false, talking: false, jawOpen: 0,
        get yaw() { return r.root.rotation.y; },
        headPos(out) { r.root.updateWorldMatrix(true, true); return r.neck.getWorldPosition(out).add(new THREE.Vector3(0, 0.04, 0)); },
        hop() { r.hop = 1; r.happy = 2.5; g.audio?.play?.('raptor_chirp', { n: 2 }); },
      };
      if (hatching) hatching.naming = true;
      // the talk's camera: low beside the nest, on the open side (away from the bedroll), the little one
      // and its shell in the frame, you (your stand-in body) at the edge of it, not over your dark head
      const dir = g.convo?.director, plan0 = dir?.plan;
      if (dir && plan0) {
        dir.plan = function (kind, sp, pl, o) {
          if (sp?.obj !== r.root) return plan0.call(this, kind, sp, pl, o);
          const shot = plan0.call(this, 'close', sp, pl, o) || plan0.call(this, 'face', sp, pl, o);
          if (!shot) return shot;
          const ax = pl.pos.x - at.x, az = pl.pos.z - at.z, al = Math.hypot(ax, az) || 1;
          const A = { x: ax / al, z: az / al }, S = { x: A.z, z: -A.x };
          const side = Math.hypot(at.x + S.x * 0.6 - br.x, at.z + S.z * 0.6 - br.z) > Math.hypot(at.x - S.x * 0.6 - br.x, at.z - S.z * 0.6 - br.z) ? 1 : -1;
          shot.p = new THREE.Vector3(at.x + S.x * 0.85 * side + A.x * 0.62, 0.42, at.z + S.z * 0.85 * side + A.z * 0.62);
          Object.assign(shot, { kind: 'close', fixed: true, hero: true, focus: 'speaker', fov: 46, drift: 0.02, comp: { x: 0.12 * side, y: shot.portrait ? 0.18 : 0.06 }, side });
          return shot;
        };
      }
      const unplan = () => { if (dir && plan0) dir.plan = plan0; };
      try {
        const taken = T.raptors.filter((x) => x !== rec).map((x) => x.name);
        const name = await N.nameRaptor(g, e, taken, { who: 'Hatchling', first: '<i>Wet, wobbly, all eyes. It blinks at you, sneezes out a bit of shell and squeaks.</i> <w>Peep!</w>' }).catch(() => 'Pip');
        rec.name = String(name || 'Pip').slice(0, 16);
        try { st.save?.(); } catch (err) { /* autosave */ }
        await N.welcome(g, e, rec.name, { text: `<w>Peep-peep!</w> <i>${rec.name} totters out of its shell and curls up against your boot. You found it in the forest; now it's found you.</i>` });
      } finally { unplan(); }
      if (hatching) hatching.naming = false;
      st.emit?.('act', { type: 'tame', what: 'hatch', name: rec.name });
    }).catch((err) => console.warn('[egg] hatch', err));
  }

  scene.tickers.push(tick);
  const H = {
    group, at, update: tick, hatch,
    dispose() {
      const i = scene.tickers.indexOf(tick);
      if (i >= 0) scene.tickers.splice(i, 1);
      off?.();
      group.removeFromParent();
      scene.world?.remove?.(tag);
      for (const it of its) scene.rig?.remove?.(it);
      nest.geometry.dispose(); egg.dispose(); mat.dispose(); eggMat.dispose();
    },
  };
  scene.egg = H;
  scene.own?.(() => H.dispose());
  return H;
}
