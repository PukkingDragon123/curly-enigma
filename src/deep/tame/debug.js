// Test hooks for raptor taming: window.__game.debug.tame (the e2e test drives the real flow with
// these: crouch with the real C key, aim at the raptor, press E through DigScene.interact()).
//
//   info()                    save data + the live stray / companion
//   stage(o)                  find a dino cavern, put the mole there, clear the creatures, and the lone
//                             raptor o.dist m in front (o: { dist, trust }) → info()
//   stray() · pal()           the live ones (objects)
//   visit(dist)               its next visit: the same lone raptor turns up in front of you
//   crouch(on)                hold / release C (the real key)
//   look(which)               aim the camera at 'stray' | 'pal' | a creature
//   offer()                   aim at the stray and press E (the scene's own interact)
//   step(n, dt, until)        run the scene n frames (until(): stop early)
//   name(i)                   in the naming talk: pick answer i (finishing the typing first)
//   fight(kind, dist)         a creature `dist` m in front, after you → summary
//   reset()                   forget every tamed raptor and the stray (tests)

const game = () => (typeof window !== 'undefined' ? window.__game : null);
const T = () => game()?.scene?.enemies?.tame || null;

const sum = (e) => e && ({
  plan: e.plan, mode: e.mode, fear: e.fear !== undefined ? +e.fear.toFixed(2) : undefined, calm: e.calm !== undefined ? +e.calm.toFixed(2) : undefined,
  trust: e.rec?.trust !== undefined ? Math.round(e.rec.trust) : undefined, hp: +e.hp.toFixed(1), staying: e.staying, dist: +(e.hd ?? 0).toFixed(2),
  x: +e.pos.x.toFixed(2), y: +e.pos.y.toFixed(2), z: +e.pos.z.toFixed(2), name: e.name, meals: e.meals, stats: e.stats ? { ...e.stats } : undefined,
  foe: e.foe?.kind || null, found: e.found || null,
});

export function makeTameDebug() {
  const D = {
    info() {
      const t = T(), st = game()?.state;
      const data = st?.data?.tame || null;
      return { data: data ? JSON.parse(JSON.stringify(data)) : null, stray: sum(t?.stray), pal: sum(t?.pal), naming: !!t?.naming, foods: t?.foods?.length || 0, log: t?.log?.slice(-8) || [] };
    },
    stray: () => T()?.stray || null,
    pal: () => T()?.pal || null,
    crouch(on = true) { const inp = game()?.input; if (!inp) return false; if (on) inp.down.add('KeyC'); else inp.down.delete('KeyC'); return on; },
    stage(o = {}) {
      const t = T(), s = game()?.scene, en = s?.enemies;
      if (!t || !en?.debug) return null;
      const r = en.debug.stage('raptor', { test: (b) => b === 4, dist: o.dist ?? 4.2, depth: o.depth || [30, 130], r0: 90, flatR: 3, ...o.stage });
      if (!r) return null;
      const w = en.list.find((e) => e.alive && e.kind === 'raptor');
      const at = w ? w.pos.clone() : null;
      en.debug.clear();
      if (!at) return null;
      if (o.trust !== undefined) { const d = game().state.data; d.tame ||= { raptors: [] }; d.tame.stray = { ...(d.tame.stray || { meals: 0, variant: 1, encounters: 0, met: d.day || 1 }), trust: o.trust }; }
      t.bolted = false;
      t.spawnStray(at.x, at.y, at.z);
      D.look('stray');
      return D.info();
    },
    /** Its next visit: the lone raptor (the same one, trusting you as much as it did) turns up `dist` m in front of you. */
    visit(dist = 3.5) {
      const t = T(), pl = game()?.scene?.player;
      if (!t || !pl) return null;
      t.dropStray(true);
      t.bolted = false;
      const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
      t.spawnStray(pl.pos.x + fx * dist, pl.pos.y + 0.3, pl.pos.z + fz * dist);
      D.look('stray');
      return D.info().stray;
    },
    look(which = 'stray') {
      const s = game()?.scene, en = s?.enemies, pl = s?.player;
      const e = typeof which === 'object' ? which : which === 'pal' ? T()?.pal : T()?.stray;
      if (!e || !pl) return null;
      const eye = pl.eye(), c = e.center;
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      pl.yaw = Math.atan2(-dx, -dz);
      pl.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      void en;
      return { yaw: pl.yaw, pitch: pl.pitch };
    },
    /** Aim and press E the way the player does (DigScene.interact → Enemies.catch → tame.use). */
    offer(which = 'stray') {
      const s = game()?.scene;
      if (!D.look(which)) return false;
      s.updateTarget?.();
      const label = document.querySelector('.crosshair-label, .xh-label')?.textContent || null;
      s.interact();
      return { label, info: D.info() };
    },
    step(n = 30, dt = 1 / 30, until = null) { const s = game()?.scene; for (let i = 0; i < n; i++) { s.update(dt); if (until && until()) return i + 1; } return n; },
    name(i = 0) {
      const cv = game()?.convo;
      if (!cv?.cur) return false;
      if (!cv.cur.typed) cv.cur.typer?.finish();
      if (cv.cur.choices?.length) return cv.pick(i);
      return cv.next();
    },
    fight(kind = 'kobold', dist = 3) {
      const s = game()?.scene, en = s?.enemies, pl = s?.player;
      if (!en || !pl) return null;
      const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
      const e = en.debugSpawn(kind, pl.pos.x + fx * dist, pl.pos.y + 0.4, pl.pos.z + fz * dist, { awake: true });
      if (e) { e.lastHitT = en.time; e.lastHitBy = 'player'; e.yaw = Math.atan2(pl.pos.x - e.pos.x, pl.pos.z - e.pos.z); }
      return e ? { kind: e.kind, hp: e.hp, maxHp: e.maxHp } : null;
    },
    reset() {
      const t = T(), st = game()?.state;
      if (t) { t.dropStray(true); t.pal?.dispose(); t.pal = null; t.palWant = false; t.naming = null; }
      if (st?.data) st.data.tame = { raptors: [] };
      return true;
    },
  };
  return D;
}

let installed = null;
/** window.__game.debug.tame (one object; it always talks to the scene that's running). */
export function installTameDebug() {
  const g = game();
  if (!g) return null;
  g.debug ||= {};
  if (!installed || g.debug.tame !== installed) installed = g.debug.tame = makeTameDebug();
  return installed;
}

