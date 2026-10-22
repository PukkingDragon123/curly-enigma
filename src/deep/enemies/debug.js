// Test hooks: scene.enemies.debug (headless tests drive everything through these).
//
//   spawn(kind, x, y, z, opts)   one creature (or 'bats') at a point; opts: { awake, asleep, zone,
//                                group: n (a pack of n), baby, raw (no floor snap) } → summary
//   list()                       [{ kind, state, mode, hp, x, y, z, dist, asleep, stun, tell }]
//   get(i | kind)                the creature object itself
//   clear()                      remove every creature (and carcasses, nests, webs)
//   auto(on)                     automatic spawning on/off
//   block(on)                    hold the guard (as if F were held; DigScene's own input wins)
//   hit(e, power)                a pick blow on a creature (as DigScene.strike would)
//   step(n, dt)                  run the scene n frames
//   stage(kind, { dist, n, depth: [d0, d1], test(biome, depth), awake, yaw, roomy }) → spot
//                                find a fitting cave, teleport the mole there, spawn in front, aim
//   look(e)                      aim the camera at a creature
//   clean()                      hide toasts and the "click to look" card (screenshots)
//   eco() · perf() · info()      ecosystem, timing, spawn stats
import * as THREE from 'three';
import { zoneAt } from '../Generator.js';

export function makeDebug(mgr) {
  const scene = () => mgr.owner;
  const summary = (e) => e && ({
    kind: e.kind, key: e.key, state: e.state, mode: e.mode, hp: +e.hp.toFixed(2), maxHp: +e.maxHp.toFixed(2),
    x: +e.pos.x.toFixed(2), y: +e.pos.y.toFixed(2), z: +e.pos.z.toFixed(2), dist: +(e.dist ?? 0).toFixed(2),
    asleep: !!e.asleep, stun: +e.stunT.toFixed(2), tell: +(e.tellK || 0).toFixed(2), alive: e.alive, group: e.group?.alive ? e.group.kind + ':' + e.group.alive() : null,
  });
  /** Is the floor around (x, y, z) roughly level out to r m (from the generator's cave shapes)? */
  const flat = (x, y, z, r) => {
    const s = scene();
    let bad = 0;
    for (let i = 0; i < 8; i++) for (const d of [r * 0.5, r]) {
      const a = i * Math.PI / 4, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (s.debug.density(px, y + 0.5, pz) <= 0) continue; // a wall there: fine
      let h = y + 0.5;
      while (h > y - 1.5 && s.debug.density(px, h, pz) > 0) h -= 0.1;
      if (Math.abs(h - y) > 0.6) bad++;
    }
    return bad <= 2;
  };
  const D = {
    spawn(kind, x, y, z, o = {}) {
      const n = o.group || 1;
      if (n > 1) {
        const out = mgr.spawner.pack(kind, x, y, z, o.zone ?? zoneAt(Math.max(0, -y)), n, { hidden: false, r: o.r ?? 1.6, asleep: o.asleep });
        if (o.awake) out.forEach((e) => { e.awake = true; });
        return out.map(summary);
      }
      const e = mgr.debugSpawn(kind, x, y, z, { ...o, group: null });
      return Array.isArray(e) ? e.map(summary) : summary(e);
    },
    list: () => mgr.list.filter((e) => e.alive).map(summary),
    get: (k = 0) => (typeof k === 'number' ? mgr.list.filter((e) => e.alive)[k] : mgr.list.find((e) => e.alive && (e.kind === k || e.key === k))),
    clear() {
      for (const e of mgr.list) e.dispose();
      mgr.list.length = 0;
      mgr.tokens.clear();
      mgr.eco.dispose();
      mgr.eco = new mgr.eco.constructor(mgr);
      mgr.webs?.clear?.();
      return true;
    },
    auto(on) { mgr.autoSpawn = !!on; return mgr.autoSpawn; },
    /**
     * Pose a creature for a close look: put it `dist` m in front of the mole (turned by `turn` rad
     * from facing it), hold it still (animation keeps running) and aim the camera at it.
     * o: { dist, turn, pose(e, dt), height (camera pitch offset) }
     */
    portrait(e, o = {}) {
      if (typeof e !== 'object') e = D.get(e);
      const s = scene(), pl = s?.player;
      if (!e || !pl) return null;
      const dist = o.dist ?? 1.6;
      // a direction with level floor at that distance
      let a = pl.yaw, f = null, x = 0, z = 0;
      for (let i = 0; i < 24; i++) {
        const b = pl.yaw + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.26;
        const tx = pl.pos.x - Math.sin(b) * dist, tz = pl.pos.z - Math.cos(b) * dist;
        const g = mgr.floorAt(tx, pl.pos.y + 0.6, tz, 0.5, 2, 1.2);
        if (g && Math.abs(g.y - pl.pos.y) < (o.level ?? 0.2)) { a = b; f = g; x = tx; z = tz; break; }
      }
      if (!f) { x = pl.pos.x - Math.sin(a) * dist; z = pl.pos.z - Math.cos(a) * dist; f = mgr.floorAt(x, pl.pos.y + 0.6, z, 0.3, 2, 1.2); }
      pl.yaw = a;
      if (o.crouch) { pl.crouched = true; pl.h = 0.5; }
      e.pos.set(x, f ? f.y + 0.01 : pl.pos.y, z);
      e.home.copy(e.pos);
      e.yaw = Math.atan2(pl.pos.x - x, pl.pos.z - z) + (o.turn ?? 0.5);
      e.held = { pose: o.pose };
      if (e.mode !== undefined && !e.asleep) { e.mode = 'idle'; e.headDown = 0; e.restK = 0; e.lookAt?.copy(pl.eye()); }
      e.legs?.reset?.();
      for (let i = 0; i < 6; i++) e.update(1 / 30);
      D.look(e);
      pl.pitch += o.height ?? 0;
      return true;
    },
    release(e) { if (typeof e !== 'object') e = D.get(e); if (e) e.held = null; return true; },
    /** Peace: creatures treat the mole as if it stood somewhere safe (posing for screenshots). */
    peace(on = true) { mgr.peace = !!on; return mgr.peace; },
    block(on) { mgr.combat.forced = { on: !!on, t0: mgr.time }; return true; },
    unblock() { mgr.combat.forced = null; return true; },
    hit(e, power = 1) {
      if (typeof e !== 'object') e = D.get(e);
      if (!e) return null;
      const eye = mgr.eye.clone(), dir = new THREE.Vector3().subVectors(e.center, eye).normalize();
      const hit = mgr.hitTest(eye, dir, 6);
      return hit ? mgr.damage(hit, power, dir) : null;
    },
    step(n = 30, dt = 1 / 30) { const s = scene(); for (let i = 0; i < n; i++) s.update(dt); return D.list(); },
    look(e) {
      if (typeof e !== 'object') e = D.get(e);
      const s = scene(), pl = s?.player;
      if (!e || !pl) return null;
      const eye = pl.eye();
      const dx = e.center.x - eye.x, dy = e.center.y - eye.y, dz = e.center.z - eye.z;
      pl.yaw = Math.atan2(-dx, -dz);
      pl.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      return { yaw: pl.yaw, pitch: pl.pitch };
    },
    /** Find a cave for a fight, put the mole there and the creature(s) in front of it. */
    stage(kind, o = {}) {
      const s = scene();
      if (!s?.debug) return null;
      const S = mgr.species(kind);
      const [d0, d1] = o.depth || S?.info?.depth || [10, 60];
      const need = o.roomy ?? (S?.info?.space?.[1] > 2 ? 6 : 4);
      let spot = null;
      for (let seed = 1; seed < 12 && !spot; seed++) {
        const p = s.debug.find((b, d, x, y, z) => (!o.test || o.test(b, d, x, y, z)) && mgr.spawner.roomyD(x, y + 0.1, z, o.ceil ?? Math.max(2.2, (S?.info?.space?.[1] ?? 1) + 0.6), o.r ?? 4.5) >= need && (o.flat === false || flat(x, y, z, o.flatR ?? 2.4)), { r: o.r0 ?? 70, d0, d1, seed: seed * 7 + (o.seed || 0) });
        if (p) spot = p;
      }
      if (!spot) return null;
      // look down the most open direction
      if (o.yaw === undefined) {
        let best = 0, bl = -1;
        for (let i = 0; i < 16; i++) {
          const a = i * Math.PI / 8;
          let l = 0;
          while (l < 12 && s.debug.density(spot.x - Math.sin(a) * (l + 0.5), spot.y + 0.9, spot.z - Math.cos(a) * (l + 0.5)) > 0) l += 0.5;
          if (l > bl) { bl = l; best = a; }
        }
        o.yaw = best;
      }
      s.debug.teleport(spot.x, spot.y, spot.z, o.yaw ?? 0, 0);
      s.terrain.warm(spot.x, spot.y + 0.5, spot.z, o.warm ?? 3);
      mgr.autoSpawn = false;
      D.clear();
      const dist = o.dist ?? 3.5, yaw = o.yaw ?? 0;
      const fx = spot.x - Math.sin(yaw) * dist, fz = spot.z - Math.cos(yaw) * dist;
      const out = D.spawn(kind, fx, spot.y + 0.4, fz, { awake: o.awake, asleep: o.asleep, group: o.n, zone: o.zone, baby: o.baby });
      const first = mgr.list.find((e) => e.alive);
      if (first) { first.yaw = Math.atan2(spot.x - first.pos.x, spot.z - first.pos.z); D.look(first); }
      s.player.pitch = o.pitch ?? Math.min(0.1, s.player.pitch);
      return { spot, spawned: out };
    },
    clean(hideHands = true) {
      const ui = mgr.ui;
      if (!document.getElementById('dbg-clean')) document.head.append(Object.assign(document.createElement('style'), { id: 'dbg-clean', textContent: '.toast,.look-catch,.prompt,.tutor{display:none!important}' }));
      if (hideHands && mgr.owner?.vm?.rig) mgr.owner.vm.rig.visible = false;
      if (ui?.toasts) ui.toasts.innerHTML = '';
      if (ui?.lookCatch) ui.lookCatch.style.display = 'none';
      document.querySelectorAll('.toast,.look-catch,.prompt').forEach((n) => { n.style.display = 'none'; });
      return true;
    },
    /**
     * Model sheet: renders a creature's real rig from `angles` (yaw, radians) with plain lighting
     * into an overlay of pixelated images (for screenshots). Returns the overlay element.
     * o: { angles, size, pitch, scale (css px per pixel), pose(e) }
     */
    sheet(e, o = {}) {
      if (typeof e === 'string') e = D.get(e);
      const r = mgr.owner?.game?.engine?.renderer || window.__game?.engine?.renderer;
      if (!e || !r) return null;
      const angles = o.angles || [0.6, -0.6, Math.PI, Math.PI / 2];
      const size = o.size || 192, k = o.scale || 2;
      const sc = new THREE.Scene();
      sc.background = new THREE.Color(o.bg ?? 0x2a2230);
      sc.add(new THREE.HemisphereLight(0xfff4e0, 0x503848, 3.2));
      const sun = new THREE.DirectionalLight(0xffffff, 3.5); sun.position.set(2, 4, 3); sc.add(sun);
      const over = new THREE.MeshLambertMaterial({ vertexColors: true });
      sc.overrideMaterial = over;
      const parent = e.root.parent, pos = e.root.position.clone(), rot = e.root.rotation.y;
      sc.add(e.root);
      e.root.position.set(0, 0, 0);
      const box = new THREE.Box3().setFromObject(e.root);
      const c = box.getCenter(new THREE.Vector3()), dim = box.getSize(new THREE.Vector3());
      const R = Math.max(dim.x, dim.y, dim.z) * 0.62;
      const cam = new THREE.OrthographicCamera(-R, R, R, -R, 0.01, 50);
      const rt = new THREE.WebGLRenderTarget(size, size);
      const host = document.getElementById('dbg-sheet') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'dbg-sheet' }));
      host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;display:flex;flex-wrap:wrap;gap:4px;background:#000;padding:4px';
      const buf = new Uint8Array(size * size * 4);
      for (const a of angles) {
        const pitch = o.pitch ?? 0.3;
        cam.position.set(c.x + Math.sin(a) * 10 * Math.cos(pitch), c.y + Math.sin(pitch) * 10, c.z + Math.cos(a) * 10 * Math.cos(pitch));
        cam.lookAt(c);
        r.setRenderTarget(rt);
        r.render(sc, cam);
        r.readRenderTargetPixels(rt, 0, 0, size, size, buf);
        const cv = document.createElement('canvas'); cv.width = cv.height = size;
        const g = cv.getContext('2d'), img = g.createImageData(size, size);
        for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
        g.putImageData(img, 0, 0);
        cv.style.cssText = `width:${size * k}px;height:${size * k}px;image-rendering:pixelated`;
        host.append(cv);
      }
      r.setRenderTarget(null);
      rt.dispose(); over.dispose();
      parent?.add(e.root);
      e.root.position.copy(pos); e.root.rotation.y = rot;
      return host;
    },
    eco: () => mgr.eco.info(),
    perf: () => ({ ms: +mgr.perf.toFixed(3), avg: +mgr.perfAvg.toFixed(3), alive: mgr.list.filter((e) => e.alive).length, tokens: mgr.tokens.size }),
    info: () => ({ ...mgr.stats, spawner: mgr.spawner.info(), combat: mgr.combat.stats }),
  };
  return D;
}
