// The lift panel as a 3D diorama of the mine: every cell of cave you've walked is a little block of
// air cast in the model (tinted by its stratum, water blue, lava glowing), the six strata are glass
// slabs with their edges inked, and the lifts stand in it as cages on beams of light. A lift you've
// unlocked (rung its bell down there: a checkpoint) is lit and tap-to-ride; one you've found but not
// unlocked sits dark with a padlock; a stratum with no unlocked lift in it is buried in fog. Drag to
// turn it, wheel / pinch to zoom; it turns slowly by itself until you touch it.
//   openLiftDiorama(game, here, opts, dests, ride, locked) → panel handle
// dests: the stops you can ride to (liftDestinations), locked: lifts found but not unlocked
// ([{ id, name, depth, zone, x, y, z }]). Rendered by its own small WebGL renderer, at half
// resolution and pixelated like the rest of the game; it's all disposed when the panel closes.
import * as THREE from 'three';
import { el, clamp } from '../core/util.js';
import { ZONES } from '../data/zones.js';
import { LIFT_ZONE_DEPTHS } from './liftPanel.js';
import './liftDiorama.css';

const MAX_CELLS = 45000;
const hexOf = (s) => parseInt(String(s).replace('#', ''), 16);
const zoneOfDepth = (d) => { for (let z = 1; z <= 6; z++) if (d < LIFT_ZONE_DEPTHS[z]) return z; return 6; };
const hash = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** A soft round puff (fog sprites, glows). */
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Where a stop sits in the model (m; y up, negative = down). */
function stopPos(s, cells) {
  if (typeof s.x === 'number' && typeof s.z === 'number') return new THREE.Vector3(s.x, s.y ?? -(s.depth || 0), s.z);
  if (s.id === 'home' || s.id === 'town') return null;
  // (an old save's lift without a position: on the shaft line at its depth)
  return new THREE.Vector3(cells.cx, -(s.depth || LIFT_ZONE_DEPTHS[(s.zone || 1) - 1] + 2), cells.cz);
}

export function openLiftDiorama(game, here, opts, dests, ride, locked = []) {
  const st = game.state;
  const ex = st.data.deep?.explored || {};
  // ---- the cave you've walked: cells (1 m), sampled down if there are a great many
  const keys = Object.keys(ex);
  const stride = Math.max(1, Math.ceil(keys.length / MAX_CELLS));
  const cells = [];
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, ylo = 0;
  for (let i = 0; i < keys.length; i += stride) {
    const [x, y, z] = keys[i].split(',').map(Number);
    cells.push(x, y, z, ex[keys[i]]);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; if (y < ylo) ylo = y;
  }
  const stops = dests.map((d) => ({ ...d, open: true })).concat(locked.map((d) => ({ ...d, open: false })));
  const C = { cx: cells.length ? (x0 + x1) / 2 : 0, cz: cells.length ? (z0 + z1) / 2 : 0 };
  for (const s of stops) {
    s.p = stopPos(s, C);
    if (!s.p) continue;
    x0 = Math.min(x0, s.p.x); x1 = Math.max(x1, s.p.x); z0 = Math.min(z0, s.p.z); z1 = Math.max(z1, s.p.z); ylo = Math.min(ylo, s.p.y);
  }
  if (x1 < x0) { x0 = -10; x1 = 10; z0 = -10; z1 = 10; }
  const pad = 6;
  x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const deepest = Math.min(-LIFT_ZONE_DEPTHS[1], ylo - 4);
  const zoneMax = zoneOfDepth(-deepest);
  // the zones with an unlocked lift in them (the first always: the mine entrance)
  const lit = new Set([1]);
  for (const s of stops) if (s.open && s.p && s.zone) lit.add(s.zone);

  // ---- three
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0a0c);
  scene.fog = new THREE.Fog(0x0e0a0c, 160, 520);
  scene.add(new THREE.HemisphereLight(0xffe6c8, 0x3a2a24, 2.1));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.4);
  sun.position.set(30, 80, 40);
  scene.add(sun);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  // the strata: glass slabs with inked edges, from the surface down to the deepest you've been
  for (let z = 1; z <= zoneMax; z++) {
    const top = -LIFT_ZONE_DEPTHS[z - 1], bot = -LIFT_ZONE_DEPTHS[z];
    const h = top - bot, col = hexOf(ZONES[z].color);
    const g = keep(new THREE.BoxGeometry(x1 - x0, h, z1 - z0));
    const slab = new THREE.Mesh(g, keep(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: lit.has(z) ? 0.045 : 0.09, depthWrite: false })));
    slab.position.set(cx, (top + bot) / 2, cz);
    scene.add(slab);
    const edges = new THREE.LineSegments(keep(new THREE.EdgesGeometry(g)), keep(new THREE.LineBasicMaterial({ color: new THREE.Color(col).lerp(new THREE.Color(0xfff0d8), 0.35), transparent: true, opacity: 0.55 })));
    edges.position.copy(slab.position);
    scene.add(edges);
  }
  // the surface: the turf's edge drawn round the top (the model is cut open: you look in)
  {
    const g = keep(new THREE.EdgesGeometry(keep(new THREE.BoxGeometry(x1 - x0, 0.8, z1 - z0))));
    const lid = new THREE.LineSegments(g, keep(new THREE.LineBasicMaterial({ color: 0x7ab84a })));
    lid.position.set(cx, 0.4, cz);
    scene.add(lid);
  }

  // the cave: one block per walked cell (floors lighter, water and lava their own)
  const box = keep(new THREE.BoxGeometry(0.94, 0.94, 0.94));
  const n = cells.length / 4;
  const mat = keep(new THREE.MeshLambertMaterial({ vertexColors: false }));
  const cave = new THREE.InstancedMesh(box, mat, Math.max(1, n));
  const set = new Set();
  for (let i = 0; i < cells.length; i += 4) set.add(cells[i] + ',' + cells[i + 1] + ',' + cells[i + 2]);
  const m4 = new THREE.Matrix4(), col = new THREE.Color(), tmp = new THREE.Color();
  const fogged = [];
  for (let i = 0, k = 0; i < cells.length; i += 4, k++) {
    const x = cells[i], y = cells[i + 1], z = cells[i + 2], v = cells[i + 3];
    m4.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
    cave.setMatrixAt(k, m4);
    const zn = zoneOfDepth(-y);
    if (v === 2) col.setHex(0x3a8ad8);
    else if (v === 3) col.setHex(0xff6a1a);
    else {
      col.setHex(hexOf(ZONES[zn].color)).lerp(tmp.setHex(0xd8c8a8), 0.35);
      if (!set.has(x + ',' + (y - 1) + ',' + z)) col.lerp(tmp.setHex(0xfff0d0), 0.28); // a floor
      col.multiplyScalar(0.86 + 0.22 * hash(x, y, z));
    }
    if (!lit.has(zn)) { col.multiplyScalar(0.35); fogged.push(x, y, z); }
    cave.setColorAt(k, col);
  }
  cave.instanceMatrix.needsUpdate = true;
  if (cave.instanceColor) cave.instanceColor.needsUpdate = true;
  scene.add(cave);
  // lava glows
  const glowTex = keep(puffTexture());

  // fog over the strata you haven't unlocked a lift in: slow drifting puffs
  const puffs = [];
  const fogMat = keep(new THREE.SpriteMaterial({ map: glowTex, color: 0x8a8296, transparent: true, opacity: 0.32, depthWrite: false }));
  for (let z = 2; z <= zoneMax; z++) {
    if (lit.has(z)) continue;
    const top = -LIFT_ZONE_DEPTHS[z - 1], bot = -LIFT_ZONE_DEPTHS[z];
    const count = clamp(Math.round(((x1 - x0) * (z1 - z0)) / 90), 24, 140);
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(fogMat);
      const sc = 9 + hash(i, z, 3) * 14;
      s.scale.set(sc, sc * 0.6, 1);
      s.position.set(x0 + hash(i, z, 1) * (x1 - x0), bot + 2 + hash(i, z, 2) * (top - bot - 4), z0 + hash(i, z, 4) * (z1 - z0));
      s.userData = { ox: s.position.x, oz: s.position.z, ph: hash(i, z, 5) * 6.28, sp: 0.2 + hash(i, z, 6) * 0.3 };
      scene.add(s);
      puffs.push(s);
    }
  }

  // ---- the lifts: cages on beams of light (lit: gold; locked: dark, a padlock)
  const markers = [];
  const cageGeo = keep(new THREE.BoxGeometry(1.4, 2.2, 1.4));
  const cageEdge = keep(new THREE.EdgesGeometry(cageGeo));
  const beamGeo = keep(new THREE.CylinderGeometry(0.3, 0.3, 1, 8, 1, true));
  const ringGeo = keep(new THREE.TorusGeometry(1.6, 0.14, 6, 24));
  // (markers are drawn big enough to see on a model a hundred meters across)
  const mk = clamp(Math.max(x1 - x0, z1 - z0, -deepest) / 45, 1, 4);
  for (const s of stops) {
    if (!s.p) continue;
    const g = new THREE.Group();
    g.position.copy(s.p);
    g.scale.setScalar(mk);
    const on = s.open;
    const c = on ? 0xffc85a : 0x6a6470;
    const cage = new THREE.LineSegments(cageEdge, keep(new THREE.LineBasicMaterial({ color: c })));
    cage.position.y = 1.1;
    g.add(cage);
    const core = new THREE.Mesh(cageGeo, keep(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: on ? 0.22 : 0.12, depthWrite: false })));
    core.position.y = 1.1;
    g.add(core);
    // the cable up to the surface
    const up = Math.max(1, -s.p.y / mk);
    const beam = new THREE.Mesh(beamGeo, keep(new THREE.MeshBasicMaterial({ color: on ? 0xffd88a : 0x4a4450, transparent: true, opacity: on ? 0.35 : 0.18, depthWrite: false, blending: on ? THREE.AdditiveBlending : THREE.NormalBlending })));
    beam.scale.y = up;
    beam.position.y = up / 2 + 2.2;
    g.add(beam);
    if (on) {
      const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc860, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
      halo.scale.set(6, 6, 1);
      halo.position.y = 1.2;
      g.add(halo);
    }
    if (s.id === here) {
      const ring = new THREE.Mesh(ringGeo, keep(new THREE.MeshBasicMaterial({ color: 0x8affc8 })));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.1;
      g.add(ring);
      g.userData.ring = ring;
    }
    scene.add(g);
    markers.push({ s, g });
  }
  // you, if you're down in the mine right now
  const me = game.scene?.player?.pos;
  let meMark = null;
  if (me && game.sceneName === 'deep') {
    meMark = new THREE.Mesh(keep(new THREE.ConeGeometry(1.2, 2.6, 4)), keep(new THREE.MeshBasicMaterial({ color: 0x8affc8 })));
    meMark.rotation.x = Math.PI;
    meMark.position.set(me.x, me.y + 2.6, me.z);
    scene.add(meMark);
  }

  // ---- DOM: the view, labels that follow the markers, the list of stops, the legend
  const view = el('div', { class: 'ld-view', role: 'img', 'aria-label': 'A model of the mine you have explored, with its lifts' });
  const labels = el('div', { class: 'ld-labels' });
  const hint = el('div', { class: 'ld-hint' }, 'Drag to turn · wheel or pinch to zoom · tap a lit lift to ride');
  view.append(labels, hint);
  const list = el('div', { class: 'ld-list' });
  const rideTo = (s) => { h?.close(); ride(s.id); };
  for (const s of [...stops].sort((a, b) => (a.depth || 0) - (b.depth || 0))) {
    const isHere = s.id === here;
    const Z = ZONES[s.zone];
    const row = el(s.open && !isHere ? 'button' : 'div', {
      class: 'ld-stop' + (s.open ? '' : ' locked') + (isHere ? ' here' : ''), type: s.open && !isHere ? 'button' : undefined,
      title: s.open ? (s.desc || '') : 'Locked: ring this lift\'s bell down there to unlock it as a checkpoint.',
      onclick: s.open && !isHere ? () => rideTo(s) : undefined,
    }, [
      el('i', { class: 'ld-dot' }),
      el('span', { class: 'ld-name' }, s.name),
      el('span', { class: 'ld-depth' }, s.id === 'home' ? 'home' : s.id === 'town' ? 'town' : `${Math.round(s.depth || 0)} m`),
      isHere ? el('em', {}, 'you are here') : !s.open ? el('em', {}, 'locked') : null,
    ]);
    row.style.setProperty('--zc', s.id === 'home' ? '#8a5a2a' : s.id === 'town' ? '#c8902a' : (Z && Z.color) || '#8a7a6a');
    list.append(row);
  }
  const legend = el('div', { class: 'ld-legend' }, [
    el('span', {}, [el('i', { class: 'ld-k lit' }), 'checkpoint: tap to ride']),
    el('span', {}, [el('i', { class: 'ld-k lock' }), 'found, locked: ring its bell to unlock']),
    el('span', {}, [el('i', { class: 'ld-k fog' }), 'fog: no checkpoint in that stratum yet']),
  ]);
  const side = el('div', { class: 'ld-side' }, [el('div', { class: 'ld-title' }, 'Stops'), list, legend]);
  const body = el('div', { class: 'ld-body' }, [view, side]);

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(0.5);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'ld-canvas';
  view.prepend(canvas);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);

  // the camera orbits a target (the lift you're at, or the middle)
  // (the whole model in view, a little from the side: the strata read as layers)
  const hereStop = markers.find((m) => m.s.id === here);
  const target = new THREE.Vector3(cx, deepest * 0.5, cz);
  if (hereStop) { target.x = hereStop.g.position.x * 0.35 + cx * 0.65; target.z = hereStop.g.position.z * 0.35 + cz * 0.65; target.y = hereStop.g.position.y * 0.4 + deepest * 0.3; }
  const span = Math.max(x1 - x0, z1 - z0, -deepest * 1.3, 30);
  const orb = { yaw: 0.7, pitch: 0.32, dist: clamp(span * 1.55, 40, 380), auto: true };
  const placeCam = () => {
    const cp = Math.cos(orb.pitch);
    camera.position.set(target.x + Math.sin(orb.yaw) * cp * orb.dist, target.y + Math.sin(orb.pitch) * orb.dist, target.z + Math.cos(orb.yaw) * cp * orb.dist);
    camera.lookAt(target);
  };
  // labels for the markers (buttons over the lit ones)
  for (const m of markers) {
    const s = m.s, isHere = s.id === here;
    const tag = el(s.open && !isHere ? 'button' : 'div', {
      class: 'ld-tag' + (s.open ? '' : ' locked') + (isHere ? ' here' : ''), type: s.open && !isHere ? 'button' : undefined,
      onclick: s.open && !isHere ? () => rideTo(s) : undefined,
      'aria-label': s.open ? `Ride to ${s.name}` : `${s.name} (locked)`,
    }, [s.open ? null : el('i', { class: 'ld-lock' }), el('span', {}, s.name), isHere ? el('em', {}, 'you are here') : null]);
    labels.append(tag);
    m.tag = tag;
  }

  // ---- input: drag to orbit, wheel / pinch to zoom
  const ptrs = new Map();
  let pinch0 = 0;
  const onDown = (e) => { if (e.target.closest('.ld-tag')) return; view.setPointerCapture?.(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); orb.auto = false; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } };
  const onMove = (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    if (ptrs.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) orb.dist = clamp(orb.dist * (pinch0 / d), 12, 400);
      pinch0 = d;
      return;
    }
    orb.yaw -= (e.clientX - p.x) * 0.008;
    orb.pitch = clamp(orb.pitch + (e.clientY - p.y) * 0.006, -0.2, 1.35);
    p.x = e.clientX; p.y = e.clientY;
  };
  const onUp = (e) => { ptrs.delete(e.pointerId); pinch0 = 0; };
  const onWheel = (e) => { e.preventDefault(); orb.auto = false; orb.dist = clamp(orb.dist * Math.exp(e.deltaY * 0.0012), 12, 400); };
  view.addEventListener('pointerdown', onDown);
  view.addEventListener('pointermove', onMove);
  view.addEventListener('pointerup', onUp);
  view.addEventListener('pointercancel', onUp);
  view.addEventListener('wheel', onWheel, { passive: false });

  // ---- frame
  let raf = 0, t0 = performance.now(), alive = true;
  const v = new THREE.Vector3();
  const frame = () => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const w = view.clientWidth, hh = view.clientHeight;
    if (!w || !hh) return;
    if (canvas.width !== Math.round(w * 0.5) || canvas.height !== Math.round(hh * 0.5)) { renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); }
    const t = (performance.now() - t0) / 1000;
    if (orb.auto) orb.yaw += 0.0025;
    placeCam();
    for (const s of puffs) { const u = s.userData; s.position.x = u.ox + Math.sin(t * u.sp + u.ph) * 2.5; s.position.z = u.oz + Math.cos(t * u.sp * 0.8 + u.ph) * 2.5; }
    for (const m of markers) {
      if (m.g.userData.ring) { const k = 1 + 0.18 * Math.sin(t * 4); m.g.userData.ring.scale.set(k, k, k); }
      v.copy(m.g.position); v.y += 3.2 * mk;
      v.project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      m.tag.style.display = vis ? '' : 'none';
      if (vis) m.tag.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * hh).toFixed(1)}px) translate(-50%, -100%)`;
    }
    if (meMark) meMark.position.y = me.y + 2.6 + Math.sin(t * 3) * 0.3;
    renderer.render(scene, camera);
  };

  game.audio.play('bell', { vol: 0.5 });
  const h = game.ui.openPanel({
    title: opts.title || 'The Lift', sub: opts.sub || 'Where to?', body, className: 'ld-panel',
    onClose: () => {
      alive = false;
      cancelAnimationFrame(raf);
      cave.dispose();
      for (const d of disposables) d.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  });
  frame();
  h.debug = { cells: n, stops: stops.length, locked: locked.length, fogged: puffs.length, lit: [...lit], orb };
  return h;
}
