// Headless first-person hand/arm probe: steps the view model (src/fps/ViewModel.js) through every
// state it can be in and measures the arm chain and every hand/tool bone each frame, flagging any
// segment more than 10% over its rest length, NaNs, and joints that snap between frames.
//   node scripts/hand-probe.mjs [--verbose]
// Exit code 1 when anything is flagged.
import * as THREE from 'three';

// a tiny canvas stand-in (icons are drawn to pick snack colours; the probe needs no pixels)
if (typeof document === 'undefined') {
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'getImageData' || k === 'createImageData' ? (x, y, w = 32, h = 32) => ({ width: w, height: h, data: new Uint8ClampedArray((w | 0) * (h | 0) * 4) }) : () => ({ addColorStop() {} })),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  globalThis.document = { createElement: () => ({ width: 32, height: 32, style: {}, getContext: () => ctx, toDataURL: () => '' }) };
}

const { ViewModel, VMV } = await import('../src/fps/ViewModel.js');
let heldGeo = null;
try { ({ heldGeo } = await import('../src/deep/build/models.js')); } catch { /* optional */ }

const VERBOSE = process.argv.includes('--verbose');
const TOL = 1.1; // flag at 10% over rest
const ARM_LEN = 170 * VMV;
const WRIST = 12 * VMV;

const flags = [];
const stats = { frames: 0, states: 0, maxRatio: { seg: '', v: 0 } };
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion();
let label = '';
const prev = new Map();

function flag(seg, ratio, extra = '') {
  flags.push({ state: label, seg, ratio, extra });
  if (VERBOSE) console.log(`  FLAG ${label} ${seg} ${ratio.toFixed(3)} ${extra}`);
}
function note(seg, r) { if (r > stats.maxRatio.v) stats.maxRatio = { seg: `${label}: ${seg}`, v: r }; }

/** Measure one frame of a view model. */
function measure(vm, dt) {
  stats.frames++;
  vm.rig.updateMatrixWorld(true);
  _inv.copy(vm.rig.matrixWorld).invert();
  // every bone: its axes (rig space, so the uniform layout shrink is not counted) vs its rest scale
  for (let i = 0; i < vm.bones.length; i++) {
    const b = vm.bones[i];
    const e = b.matrixWorld.elements;
    if (e.some((v) => !Number.isFinite(v))) { flag(`bone${i} NaN`, Infinity); continue; }
    _m.multiplyMatrices(_inv, b.matrixWorld);
    _x.setFromMatrixColumn(_m, 0); _y.setFromMatrixColumn(_m, 1); _z.setFromMatrixColumn(_m, 2); // (extractBasis gives a unit basis for a zero-scaled bone)
    const rest = b.userData.restScale || b.scale;
    const r0 = Math.abs(rest.x), r1 = Math.abs(rest.y), r2 = Math.abs(rest.z);
    if (r0 < 1e-9 || _x.length() < 1e-9) continue; // hidden (scaled to 0)
    const rs = [_x.length() / r0, _y.length() / r1, _z.length() / r2];
    const r = Math.max(...rs);
    note(`bone${i}`, r);
    if (r > TOL) flag(`bone${i} axis`, r);
  }
  // the arm chains
  for (const [side, hand, arm, upper] of [[1, vm.handR, vm.armR, vm.uarmR], [-1, vm.handL, vm.armL, vm.uarmL]]) {
    const S = side > 0 ? 'R' : 'L';
    for (const o of [hand, arm, upper]) if (![o.position.x, o.position.y, o.position.z, o.quaternion.w].every(Number.isFinite)) flag(`${S} NaN pose`, Infinity);
    // hand → wrist
    const wrist = _a.set(0, 0, WRIST).applyQuaternion(hand.quaternion).add(hand.position);
    const hw = wrist.distanceTo(arm.position);
    if (hw > WRIST * 0.1) flag(`${S} wrist gap`, 1 + hw / WRIST);
    // the forearm's drawn length (its z axis, the shape runs 170 voxels along z)
    const fl = arm.scale.z * ARM_LEN;
    note(`${S} forearm`, fl / ARM_LEN);
    if (fl > ARM_LEN * TOL) flag(`${S} forearm`, fl / ARM_LEN);
    // shoulder: where the chain must reach (rig space)
    const sh = vm.shR ? _b.copy(side > 0 ? vm.shR : vm.shL) : vm.shoulderAt ? vm.shoulderAt(side, _b) : null; // (the shoulder the arm is drawn to)
    const upVis = upper.scale.x > 1e-6;
    if (sh) {
      const D = sh.distanceTo(arm.position);
      // the forearm's far end and the elbow
      const fEnd = _p.set(0, 0, ARM_LEN * arm.scale.z).applyQuaternion(arm.quaternion).add(arm.position);
      if (upVis) {
        const ul = upper.scale.z * ARM_LEN;
        note(`${S} upper`, ul / ARM_LEN);
        if (ul > ARM_LEN * TOL) flag(`${S} upper arm`, ul / ARM_LEN);
        // the elbow joint must meet the forearm's end, and the upper arm must reach the shoulder
        const gapE = fEnd.distanceTo(upper.position);
        if (gapE > ARM_LEN * 0.1) flag(`${S} elbow gap`, 1 + gapE / ARM_LEN);
        const us = sh.distanceTo(upper.position);
        const tipU = _x.set(0, 0, ul).applyQuaternion(upper.quaternion).add(upper.position);
        const reachGap = Math.max(0, us - ul);
        note(`${S} upper→shoulder`, us / ARM_LEN);
        if (us > ul * TOL) flag(`${S} upper→shoulder (IK unreachable)`, us / ul, `D=${D.toFixed(3)}`);
        void tipU; void reachGap;
      } else {
        // one bone: the forearm must run from the wrist through (or to) the shoulder
        note(`${S} wrist→shoulder`, D / ARM_LEN);
        if (D > ARM_LEN * TOL) flag(`${S} forearm→shoulder (IK unreachable)`, D / ARM_LEN);
      }
      // snaps: the elbow (or the forearm's end) jumping between frames at a small dt
      const key = vm.__id + S;
      const elbow = upVis ? upper.position : fEnd;
      const pv = prev.get(key);
      if (pv && dt > 0 && dt <= 1 / 30) {
        const dE = pv.elbow.distanceTo(elbow), dW = pv.wrist.distanceTo(arm.position);
        // an elbow moving far more than the wrist drives it (60 Hz: > 0.06 m with the wrist nearly still)
        if (dE > 0.06 && dE > dW * 4 + 0.03 && !pv.skip) flag(`${S} elbow snap`, 1 + dE / ARM_LEN, `dE=${dE.toFixed(3)} dW=${dW.toFixed(3)} D=${D.toFixed(3)}`);
      }
      prev.set(key, { elbow: elbow.clone(), wrist: arm.position.clone() });
    }
  }
}

let vmId = 0;
function makeVM(aspect = 16 / 9) {
  const vm = new ViewModel();
  vm.__id = ++vmId;
  vm.resize(aspect);
  return vm;
}
/** Step a VM for `secs` at `dt`, calling fn(vm, t) before each update for per-frame inputs. */
function run(vm, secs, dt, opts = {}, fn = null) {
  let t = 0;
  const n = Math.max(1, Math.round(secs / dt));
  for (let i = 0; i < n; i++) {
    const o = typeof opts === 'function' ? opts(t) : opts;
    if (fn) fn(vm, t, i);
    vm.update(dt, o);
    measure(vm, dt);
    t += dt;
  }
}
function state(name, body) {
  label = name;
  stats.states++;
  const before = flags.length;
  body();
  if (VERBOSE || flags.length > before) console.log(`${flags.length > before ? '✗' : '✓'} ${name}${flags.length > before ? `  (${flags.length - before} flags)` : ''}`);
}

const DT = 1 / 60;
const camFor = (fov, aspect = 16 / 9) => { const c = new THREE.PerspectiveCamera(fov, aspect, 0.03, 80); c.position.set(0, 0.72, 0); c.updateMatrixWorld(); return c; };
const TOOLS = [
  ['pick', 'pick_rusty'], ['pick', 'pick_steel'], ['pick', 'pick_adamant'], ['chisel', 'chisel_basic'], ['brush', 'brush_basic'],
  ['drill', 'drill_steam'], ['xray', 'xray_lamp'], ['stake', null], ['beam', null], ['food', 'grub_bar'], ['food', 'hearty_pie'],
  ['none', null], ['hammer', null], ['tongs', null], ['smith', null], ['dynamite', 'dynamite'],
];
const HELD = ['axe_iron', 'axe_stone', 'spade_iron', 'shears_iron', 'torch', 'plank', 'stone_block', 'lantern', 'build_hammer', 'clump_iron'];
const ITEM_HELD = ['glowcap', 'copper_ore', 'amethyst', 'ruby', 'egg', 'honey', 'mushroom_stew', 'copper_ingot', 'chair_wood', 'blk_planks', 'bp_dagger', 'exit_ticket', 'stick', 'w.shortsword.iron.', 'w.axe.bronze.', 'cave_carrot', 'worm', 'helmet_basic', 'relic_idol'];
const heldOf = (id) => { try { return heldGeo?.(id) || null; } catch { return null; } };
const ASPECTS = [['16:9', 16 / 9], ['21:9', 21 / 9], ['32:9', 32 / 9], ['4:3', 4 / 3], ['1:1', 1], ['tall 9:16', 9 / 16], ['very tall 9:21', 9 / 21]];

for (const [an, aspect] of ASPECTS) {
  const settle = (vm) => run(vm, 0.6, DT, {});
  state(`${an} idle`, () => { const vm = makeVM(aspect); vm.setTool('pick', { item: 'pick_iron' }); settle(vm); run(vm, 2, DT, {}); });
  state(`${an} walk/sprint/jump/land/crouch`, () => {
    const vm = makeVM(aspect); vm.setTool('pick', { item: 'pick_iron' }); settle(vm);
    run(vm, 1.5, DT, { speed: 2.4 }); run(vm, 1.5, DT, { speed: 4.6 }); run(vm, 1.5, DT, { speed: 6.5 });
    run(vm, 0.7, DT, { speed: 4.6, grounded: false }); run(vm, 0.6, DT, { speed: 4.6 });
    run(vm, 1.4, DT, { grounded: false }); run(vm, 0.8, DT, {}); run(vm, 1, DT, { speed: 1.1 });
    // with the body's velocity (paw inertia) and stride phase, strafing, stopping dead, falling fast
    const vel = new THREE.Vector3();
    run(vm, 3, DT, (t) => { vel.set(Math.sin(t * 3) * 3.9, t > 2 ? -18 : 0, Math.cos(t * 2) * 3.9); return { speed: 3.9, vel, yaw: t, stridePh: t * 10, grounded: t < 2, sway: 1 }; });
    run(vm, 1, DT, () => { vel.set(0, 0, 0); return { vel, yaw: 0 }; });
  });
  state(`${an} crawl/climb/mantle/swim`, () => {
    const vm = makeVM(aspect); vm.setTool('drill', { item: 'drill_steam' }); settle(vm);
    run(vm, 2, DT, (t) => ({ crawling: true, crawlPh: t * 5, speed: 1 }));
    run(vm, 2, DT, { climbing: true, speed: 1.5 }); run(vm, 0.3, DT, { grounded: false }); run(vm, 0.5, DT, {});
    run(vm, 2, DT, { swimming: true, speed: 1.5, grounded: false }); run(vm, 1, DT, {});
  });
  for (const [kind, item] of TOOLS) {
    state(`${an} ${kind}${item ? ':' + item : ''} swings/use/guard/hurt`, () => {
      const vm = makeVM(aspect); vm.setTool(kind, { item }); settle(vm);
      for (const dur of [0.08, 0.2, 0.3, 0.5, 0.9]) { vm.swing(kind, dur, { weight: 1.25 }); run(vm, dur, DT, {}); vm.impact(kind, 1.5, { feel: 'clang', stop: 0.1 }); run(vm, 0.8, DT, {}); }
      // held swings: each one grows out of the last
      for (let i = 0; i < 6; i++) { vm.swing(kind, 0.26, { weight: 0.8 + i * 0.1 }); run(vm, 0.26, DT, {}); vm.impact(kind, 1, { feel: i & 1 ? 'bite' : 'rebound', stop: 0.05 }); run(vm, 0.12, DT, {}); }
      run(vm, 1.2, DT, {});
      vm.use(kind, true); run(vm, 2.5, DT, { speed: 2.4 }); vm.use(kind, false); run(vm, 0.5, DT, {});
      vm.block(true); run(vm, 0.4, DT, {}); vm.guardHit(1.5, false); run(vm, 0.3, DT, {}); vm.guardHit(1, true); run(vm, 0.4, DT, {}); vm.block(false); run(vm, 0.5, DT, {});
      vm.hurt(); run(vm, 0.7, DT, {});
      vm.eat('hearty_pie'); run(vm, 1.5, DT, { speed: 2.4 });
      vm.eat('grub_bar'); run(vm, 0.4, DT, {}); vm.cancelEat(); run(vm, 0.8, DT, {});
    });
  }
  // the dig: chained blows of every weight and feel, hit-stops, re-swings mid-recovery, while walking
  for (const [kind, item] of [['pick', 'pick_iron'], ['chisel', 'chisel_basic'], ['brush', 'brush_basic'], ['drill', 'drill_steam']]) {
    state(`${an} ${kind} dig chains (anticipation, hit-stop, recoil, variation)`, () => {
      const vm = makeVM(aspect); vm.setTool(kind, { item }); run(vm, 0.6, DT, {});
      const feels = [undefined, 'bite', 'rebound', 'clang'];
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 24; i++) {
        const dur = 0.12 + rnd() * 0.32;
        vm.swing(kind, dur, { weight: 0.8 + rnd() * 0.45 });
        run(vm, dur, DT, { speed: i % 3 ? 0 : 2.6 });
        vm.impact(kind, 0.4 + rnd() * 1.2, { feel: feels[i % 4], stop: i % 5 === 0 ? undefined : rnd() * 0.08 });
        run(vm, i % 4 === 0 ? 0.02 : 0.05 + rnd() * 0.3, i % 6 === 0 ? 1 / 144 : DT, {}); // (re-swing mid-recovery, at 144 Hz now and then)
      }
      run(vm, 1.2, DT, {});
    });
  }
  state(`${an} held items (axes, spades, torch, blocks, clumps)`, () => {
    const vm = makeVM(aspect);
    for (const id of HELD) {
      const geo = heldOf(id);
      for (const kind of ['pick', 'stake']) { vm.setTool(kind, { item: id, geo }); run(vm, 0.5, DT, {}); vm.swing(kind, 0.3); run(vm, 1.4, DT, {}); }
    }
  });
  // (wave 19) any item in the paw as its real model, each grip: pinch, cradle (open palm up), sheet, haft;
  // idle sway, walking, a shrug, the guard, eating raw food from it, quick switches between them
  state(`${an} held item models (pinch, cradle, sheet, haft)`, () => {
    const vm = makeVM(aspect);
    for (const id of ITEM_HELD) {
      vm.setTool('held', { item: id }); run(vm, 0.5, DT, {}); run(vm, 1, DT, { speed: 4.6 });
      vm.swing('held', 0.3); run(vm, 0.6, DT, {}); vm.block(true); run(vm, 0.4, DT, {}); vm.block(false); run(vm, 0.3, DT, {});
      vm.eat('cave_carrot'); run(vm, 1.4, DT, {});
    }
    for (let i = 0; i < ITEM_HELD.length * 2; i++) { vm.setTool('held', { item: ITEM_HELD[(i * 7) % ITEM_HELD.length] }); run(vm, 0.04 + (i % 3) * 0.07, DT, {}); }
    for (const id of ['cave_carrot', 'glowcap', 'egg', 'mushroom_stew']) { vm.setTool('food', { item: id }); run(vm, 0.5, DT, {}); vm.eat(id); run(vm, 1.4, DT, {}); }
    run(vm, 1, DT, {});
  });
  state(`${an} tool switching mid-swing / mid-eat`, () => {
    const vm = makeVM(aspect); vm.setTool('pick', { item: 'pick_iron' }); run(vm, 0.6, DT, {});
    for (let i = 0; i < TOOLS.length; i++) {
      const [k] = TOOLS[i], [k2, it2] = TOOLS[(i + 5) % TOOLS.length];
      vm.swing(k, 0.3); run(vm, 0.1 + (i % 4) * 0.05, DT, {});
      vm.setTool(k2, { item: it2 }); run(vm, 0.05, DT, {});
      vm.eat('grub_bar'); vm.setTool(TOOLS[(i + 3) % TOOLS.length][0]); run(vm, 0.6, DT, {});
    }
    run(vm, 1, DT, {});
  });
  state(`${an} panels open/close (input frozen, large gaps)`, () => {
    const vm = makeVM(aspect); vm.setTool('pick', { item: 'pick_iron' }); run(vm, 0.6, DT, {});
    vm.swing('pick', 0.3); run(vm, 0.15, DT, {});
    run(vm, 0.5, 0.5, {}); run(vm, 3, 1.5, {}); run(vm, 1, DT, { look: { dx: 400, dy: -300 } }); run(vm, 1, DT, {});
  });
  state(`${an} mouse look flicks`, () => {
    const vm = makeVM(aspect); vm.setTool('pick', { item: 'pick_iron' }); run(vm, 0.6, DT, {});
    run(vm, 2, DT, (t) => ({ look: { dx: Math.sin(t * 30) * 900, dy: Math.cos(t * 23) * 600 } }));
    run(vm, 1, 1 / 240, (t) => ({ look: { dx: 120, dy: -80 } }));
  });
  state(`${an} dt spikes / low fps`, () => {
    const vm = makeVM(aspect); vm.setTool('pick', { item: 'pick_iron' }); run(vm, 0.6, DT, {});
    for (const dt of [1 / 15, 1 / 8, 0.25, 1, 3, 1 / 144, 1 / 240, 0]) { vm.swing('pick', 0.3); run(vm, 0.9, Math.max(dt, 1 / 500), { speed: 4.6 }); }
    run(vm, 2, 1 / 12, (t) => ({ crawling: true, crawlPh: t * 5 }));
    run(vm, 2, 1 / 12, { climbing: true });
  });
  // steered paws (gathering in the mine, the forge's hammer and tongs) with the world camera's FOV
  for (const fov of [60, 74, 82, 90, 100, 110]) {
    state(`${an} drive fov ${fov} (gather / forge)`, () => {
      const vm = makeVM(aspect); vm.setTool('none'); run(vm, 0.6, DT, {});
      const cam = camFor(fov, aspect);
      const targets = [[0, 0.45, -0.45], [0.15, 0.3, -0.7], [-0.2, 0.25, -0.9], [0.3, 0.1, -1.2], [0, 0.7, -0.35], [0.05, 0.6, -2]];
      // one drive session per shoulder setup (gather names its shoulders, the forge does not); the
      // paws glide from target to target like the real drivers (src/deep/gather, src/forge/paws.js)
      for (const sh of [null, { R: [0.62, -0.5, 0.05], L: [-0.62, -0.5, 0.05] }]) {
        const cur = new THREE.Vector3(), from = new THREE.Vector3();
        let first = true;
        for (const [x, y, z] of targets) {
          const P = vm.toView(new THREE.Vector3(x, y, z), cam, new THREE.Vector3());
          from.copy(first ? P : cur);
          run(vm, 0.8, DT, {}, (v, t) => {
            cur.lerpVectors(from, P, Math.min(1, t / 0.28));
            const k = first ? Math.min(1, t * 4) : 1;
            v.drive = { k: 1, R: { p: cur.clone(), q: v.R.q.clone(), at: [0, 0, 0], grip: true, tool: false, k }, L: { p: cur.clone().setX(-cur.x - 0.06), q: v.L.q.clone(), at: [0, 0, 0], k }, shoulder: sh || undefined };
          });
          first = false;
        }
        vm.drive = null; run(vm, 0.8, DT, {});
      }
      for (const kind of ['hammer', 'tongs', 'smith']) {
        vm.setTool(kind); run(vm, 0.4, DT, {});
        run(vm, 1.2, DT, {}, (v, t) => {
          const P = vm.toView(new THREE.Vector3(0.1 * Math.sin(t * 3), 0.35, -0.55 - 0.3 * Math.sin(t * 2)), cam, new THREE.Vector3());
          v.drive = { k: 1, R: { p: P, q: v.R.q.clone(), at: [0, 30, 0], k: 1 }, L: { p: P.clone().setX(-0.12), q: v.L.q.clone(), at: [0, 40, 0], k: 1 } };
        });
      }
      vm.drive = null; run(vm, 1, DT, {});
    });
  }
  state(`${an} window resize mid-action`, () => {
    const vm = makeVM(aspect); vm.setTool('pick', { item: 'pick_iron' }); run(vm, 0.6, DT, {});
    vm.swing('pick', 0.4); run(vm, 0.2, DT, {});
    for (const [, a] of ASPECTS) { vm.resize(a); run(vm, 0.05, DT, {}); }
    vm.resize(aspect); run(vm, 1, DT, {});
  });
}
// scene changes: a fresh rig in each scene (home ↔ town ↔ mine, cutscene → play), the old drive left behind
state('transitions home↔town↔mine, cutscene→play', () => {
  let vm = makeVM(16 / 9);
  for (const [scene, kind, item] of [['home', 'none', null], ['town', 'none', null], ['mine', 'pick', 'pick_iron'], ['home', 'hammer', null], ['mine', 'drill', 'drill_steam'], ['cutscene', 'none', null], ['play', 'pick', 'pick_rusty']]) {
    const cam = camFor(scene === 'cutscene' ? 55 : 74);
    vm.drive = { k: 1, R: { p: vm.toView(new THREE.Vector3(0.1, 0.4, -0.8), cam, new THREE.Vector3()), q: vm.R.q.clone(), at: [0, 0, 0], k: 1 } };
    run(vm, 0.3, DT, { speed: 3 });
    vm.dispose();
    vm = makeVM(scene === 'town' ? 21 / 9 : 16 / 9);
    vm.setTool(kind, { item });
    run(vm, 0.2, 0.25, {}); // the first frames after a scene build are long
    run(vm, 1, DT, { speed: 3 });
    // a seamless hand-off arrives mid-stride
    run(vm, 0.5, DT, { speed: 4.6, look: { dx: 30, dy: 0 } });
  }
});

const by = new Map();
for (const f of flags) { const k = `${f.seg.replace(/bone\d+/, 'bone')}`; const e = by.get(k) || { n: 0, max: 0, ex: f }; e.n++; if (f.ratio > e.max) { e.max = f.ratio; e.ex = f; } by.set(k, e); }
console.log(`\nhand probe: ${stats.states} states, ${stats.frames} frames, ${flags.length} flags`);
for (const [k, e] of by) console.log(`  ${k}: ${e.n} frames, worst ${e.max === Infinity ? 'NaN' : e.max.toFixed(2) + '×'} (${e.ex.state}${e.ex.extra ? ', ' + e.ex.extra : ''})`);
console.log(`  largest ratio seen: ${stats.maxRatio.v.toFixed(3)} (${stats.maxRatio.seg})`);
process.exit(flags.length ? 1 : 0);
