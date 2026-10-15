// Showroom test bench for the first-person view model (?scene=showroom&mode=fps): a lit voxel
// cave wall in front, the paws and tools composited through the engine's overlay pass, an auto
// demo that cycles every tool and animation, and keyboard triggers:
//   1-9 tool (pick chisel brush drill xray stake beam food none) · T next tier/variant
//   Space/click swing · E toggle use · Q eat · H hurt · J jump · W walk · R run · C climb · V swim
//   arrow keys look · P pause the auto demo
// Snapshot params: tool, item, act (swing|use|eat|hurt|walk|run|climb|swim|jump|land|look),
//   at (seconds into the act), hold=1 (freeze there), food (item eaten), demo=0 (no auto demo).
import * as THREE from 'three';
import { VoxelGrid, voxelMesh } from '../../gfx/Voxel.js';
import { ViewModel, TOOL_KINDS } from '../ViewModel.js';
import { el } from '../../core/util.js';

const VARIANTS = {
  pick: ['pick_rusty', 'pick_copper', 'pick_iron', 'pick_steel', 'pick_mithril', 'pick_adamant'],
  chisel: ['chisel_basic', 'chisel_fine'], brush: ['brush_basic', 'brush_badger'],
  drill: ['drill_steam', 'drill_lumite'], xray: ['xray_lamp', 'xray_prism'],
  stake: [null], beam: [null], food: ['grub_bar', 'cave_carrot', 'hearty_pie', 'glowcap'], none: [null],
};

function hash(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A rough voxel rock face with strata, stones, roots and ore nuggets. */
function caveWall() {
  const W = 72, H = 48, D = 12;
  const g = new VoxelGrid(W, H, D);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = Math.sin(x * 0.31) * Math.cos(y * 0.27) * 1.6 + Math.sin(x * 0.13 + y * 0.21) * 2 + hash(x >> 1, y >> 1, 3) * 1.4;
    const depth = Math.max(2, Math.round(6 + n));
    const band = Math.floor((y + Math.sin(x * 0.12) * 2) / 7) % 3;
    for (let z = 0; z < depth; z++) {
      let c = band === 0 ? 0x5a3e2a : band === 1 ? 0x6e4c32 : 0x4e3626;
      const r = hash(x, y, 7 + z);
      if (r < 0.12) c = 0x4a3222; else if (r > 0.9) c = 0x7a5a3e;
      if (hash(x >> 2, y >> 2, 11) < 0.12) c = (x + y) & 1 ? 0x6a6460 : 0x7a7470; // stones
      g.set(x, y, z, c);
    }
  }
  // ore nuggets and a gem
  const ores = [[20, 26, 0xd9773f], [44, 18, 0xf0c040], [52, 33, 0xd9773f], [30, 12, 0x5ae0f0], [12, 36, 0xbfc3c4]];
  for (const [ox, oy, c] of ores) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (dx * dx + dy * dy > 5) continue;
    const z = 8;
    for (let k = 0; k < z; k++) if (!g.filled(ox + dx, oy + dy, k + 1)) { g.set(ox + dx, oy + dy, k, (dx + dy) & 1 ? c : 0xffffff & (c | 0x202020)); break; }
  }
  // roots hanging over the top
  for (const rx of [8, 23, 47, 61]) for (let y = H - 1, x = rx; y > H - 14; y--) { x += hash(x, y, 5) < 0.3 ? 1 : 0; g.set(x, y, 9, 0x3a2416); g.set(x, y, 10, 0x4a2e1c); }
  const m = voxelMesh(g, { greedy: true, scale: 1 / 16, pivot: [W / 2, H / 2, 0], kind: 'toon' });
  return m;
}

export function makeFpsDemo(showroom, params) {
  const { game } = showroom;
  const scene = showroom.scene;
  scene.background = new THREE.Color(0x0c0809);
  const cam = new THREE.PerspectiveCamera(70, game.engine.aspect, 0.05, 40);
  const wall = caveWall();
  wall.position.set(0, 0.25, -1.75);
  scene.add(wall);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 6), new THREE.MeshLambertMaterial({ color: 0x3a281c }));
  floor.position.set(0, -0.62, -1.5);
  scene.add(floor);
  scene.add(new THREE.HemisphereLight(0x6a5a5a, 0x1a1012, 0.7));
  const lamp = new THREE.PointLight(0xffe0b0, 7, 9, 1.3);
  scene.add(lamp);

  const vm = new ViewModel();
  vm.resize(game.engine.aspect);
  scene.add(vm.world);
  const S = {
    vm, cam, tool: 0, variant: 0, walk: false, run: false, climb: false, swim: false, use: false,
    jumpT: 0, yaw: 0, pitch: 0, look: { dx: 0, dy: 0 }, auto: params.demo !== '0' && !params.tool, demoT: 0, step: -1,
    hold: false, frozen: false, pendingImpact: -1,
  };
  const kinds = TOOL_KINDS;
  const equip = (i, v = 0) => {
    S.tool = (i + kinds.length) % kinds.length;
    const list = VARIANTS[kinds[S.tool]];
    S.variant = ((v % list.length) + list.length) % list.length;
    if (S.use) { vm.use(kinds[S.tool], false); S.use = false; }
    vm.setTool(kinds[S.tool], { item: list[S.variant] });
  };
  const swing = () => { vm.swing(vm.kind, 0.32); S.pendingImpact = 0.32; };
  const toggleUse = () => { S.use = !S.use; vm.use(vm.kind, S.use); };

  // ---- the auto demo: each step is [duration, action]
  const steps = [];
  for (let i = 0; i < kinds.length; i++) {
    const k = kinds[i];
    steps.push([0.9, () => equip(i, S.demoVariant = (S.demoVariant || 0) + 1)]);
    steps.push([1.3, () => { S.walk = true; }]);
    steps.push([0.1, () => { S.walk = false; }]);
    if (k === 'brush' || k === 'drill' || k === 'xray') { steps.push([1.8, () => toggleUse()]); steps.push([0.6, () => toggleUse()]); }
    else if (k === 'food') steps.push([1.6, () => vm.eat(VARIANTS.food[S.variant])]);
    else { steps.push([0.7, swing]); steps.push([1.2, swing]); }
  }
  steps.push([0.6, () => equip(0, 3)]);
  steps.push([2.2, () => { S.climb = true; }]);
  steps.push([0.5, () => { S.climb = false; }]);
  steps.push([2.4, () => { S.swim = true; }]);
  steps.push([0.6, () => { S.swim = false; }]);
  steps.push([1.6, () => vm.eat('cave_carrot')]);
  steps.push([0.9, () => vm.hurt()]);
  steps.push([1.2, () => { S.jumpT = 0.55; }]);
  steps.push([1.4, () => { S.run = true; }]);
  steps.push([0.4, () => { S.run = false; }]);

  // ---- keys
  const onKey = (e) => {
    const k = e.code;
    if (/^Digit[1-9]$/.test(k)) equip(+k.slice(5) - 1);
    else if (k === 'KeyT') equip(S.tool, S.variant + 1);
    else if (k === 'Space') swing();
    else if (k === 'KeyE') toggleUse();
    else if (k === 'KeyQ') vm.eat(VARIANTS.food[1]);
    else if (k === 'KeyH') vm.hurt();
    else if (k === 'KeyJ') S.jumpT = 0.55;
    else if (k === 'KeyW') S.walk = !S.walk;
    else if (k === 'KeyR') S.run = !S.run;
    else if (k === 'KeyC') S.climb = !S.climb;
    else if (k === 'KeyV') S.swim = !S.swim;
    else if (k === 'KeyP') S.auto = !S.auto;
    else return;
    if (k !== 'KeyP') S.auto = false;
    e.preventDefault();
  };
  const keysDown = new Set();
  const onDown = (e) => { keysDown.add(e.code); onKey(e); };
  const onUp = (e) => keysDown.delete(e.code);
  const onClick = () => { S.auto = false; swing(); };
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('pointerdown', onClick);
  showroom.own(() => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('pointerdown', onClick);
    vm.dispose();
  });
  if (params.help !== '0') {
    game.ui.world.append(el('div', { style: { position: 'absolute', right: '8px', top: '6px', color: '#f0e0c0', font: '11px monospace', background: 'rgba(0,0,0,.45)', padding: '3px 6px', whiteSpace: 'pre', textAlign: 'right' } }, [
      '1-9 tool · T tier · Space swing · E use · Q eat · H hurt\nJ jump · W walk · R run · C climb · V swim · arrows look · P demo']));
  }

  // close-up review: &vmfov=24&vmlook=0.17,-0.16,-0.34 narrows the view-model camera onto a point
  const closeUp = () => {
    if (!params.vmfov) return;
    vm.camera.fov = parseFloat(params.vmfov);
    const l = (params.vmlook || '0.15,-0.16,-0.34').split(',').map(Number);
    vm.camera.lookAt(l[0], l[1], l[2]);
    vm.camera.updateProjectionMatrix();
  };
  const update = (dt) => {
    if (S.frozen) dt = 0;
    // auto demo
    if (S.auto && dt > 0) {
      S.demoT -= dt;
      if (S.demoT <= 0) {
        S.step = (S.step + 1) % steps.length;
        const [d, fn] = steps[S.step];
        fn();
        S.demoT = d;
      }
    }
    if (S.pendingImpact >= 0) { S.pendingImpact -= dt; if (S.pendingImpact < 0) vm.impact(vm.kind, 1); }
    // look with the arrow keys
    let dx = 0, dy = 0;
    if (keysDown.has('ArrowLeft')) dx -= 600 * dt;
    if (keysDown.has('ArrowRight')) dx += 600 * dt;
    if (keysDown.has('ArrowUp')) dy -= 400 * dt;
    if (keysDown.has('ArrowDown')) dy += 400 * dt;
    dx += S.look.dx; dy += S.look.dy;
    S.yaw -= dx * 0.0022; S.pitch = Math.max(-0.6, Math.min(0.6, S.pitch - dy * 0.0022));
    cam.rotation.set(S.pitch, S.yaw, 0, 'YXZ');
    const bob = S.walk || S.run ? Math.abs(Math.sin(showroom.time * (S.run ? 11 : 7))) * 0.02 : 0;
    cam.position.set(0, bob, 0);
    lamp.position.set(0.12, 0.2 + bob, 0.05).applyEuler(cam.rotation);
    if (S.jumpT > 0) S.jumpT -= dt;
    vm.update(dt, {
      speed: S.run ? 5.4 : S.walk ? 2.6 : 0,
      grounded: S.jumpT <= 0,
      climbing: S.climb,
      swimming: S.swim,
      look: { dx, dy },
      lamp: { color: 0xffe0b0, intensity: 1 },
      ambient: 0x5a4a4a,
      camera: cam,
    });
  };

  // ---- snapshot mode
  if (params.tool) {
    const i = Math.max(0, kinds.indexOf(params.tool));
    S.tool = i;
    vm.setTool(kinds[i], { item: params.item || VARIANTS[kinds[i]][0] });
    for (let k = 0; k < 24; k++) update(1 / 30);
    const act = params.act;
    const at = parseFloat(params.at) || 0;
    if (act === 'swing') swing();
    else if (act === 'use') { S.use = true; vm.use(vm.kind, true); }
    else if (act === 'eat') vm.eat(params.food || 'cave_carrot');
    else if (act === 'hurt') vm.hurt();
    else if (act === 'walk') S.walk = true;
    else if (act === 'run') S.run = true;
    else if (act === 'climb') S.climb = true;
    else if (act === 'swim') S.swim = true;
    else if (act === 'jump') S.jumpT = 99;
    else if (act === 'land') S.jumpT = 0.6;
    else if (act === 'look') S.look.dx = 14;
    const pre = act === 'land' ? 0.62 : 0; // land: fall first, then `at` after touching down
    for (let k = 0; k < pre + at; k += 1 / 60) update(1 / 60);
    S.look.dx = 0;
    if (params.hold === '1') S.frozen = true;
  }

  return {
    vm,
    state: S,
    camera: cam,
    overlay: { scene: vm.scene, camera: vm.camera },
    update,
    resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); vm.resize(w / h); closeUp(); },
  };
}
