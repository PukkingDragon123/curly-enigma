// Building Old Star's camp without stopping the game. The camp is a few big jobs (houseJobs.js:
// the rock, the west and east of the hollow, the steps and door, your nook's walls); they run in
// parallel in build workers (houseWorker.js) and come back packed (pack.js), and the scene puts them
// together (StarHouse.assemble). While the scene is waiting for them (its loading screen is up) the
// main thread takes jobs off the queue too, so a slow or busy worker never holds it up; without
// workers at all (blocked, or ?houseWorkers=0) the main thread does them all, yielding between
// jobs. Every finished job is kept (keyed by what it depends on: the notes on the board, whether the
// door to Deep Town is open), so coming home again (from the lift, the forge, the kitchen, town)
// reuses it instead of building it all over, and prebuildHouse(game) can start it early in the
// workers only (during the journey, on the title) so the camp is ready when you get there.
//
//   loadHouse(want, onProgress) → Promise<{ jobs, vista (null), shell, ms, workers, built }>   want: houseWant(state)
//   onProgress({ k: 0..1, label }) while it builds (and once more at the end)
import HouseWorker from './houseWorker.js?worker&inline';
import { JOBS, runJob } from './houseJobs.js';
import { loadNotes } from './notes.js';
import { roomSize } from '../iso/homeLayout.js';

/** Bump when the house's build changes shape (keys only: nothing is stored across page loads). */
const VERSION = 5;
/** Rough relative cost of each job (for the progress bar and to start the big ones first). */
const COST = { rock: 2.6, west: 2.2, east: 1.8, ways: 0.6, shell: 1.6 };
/** What each job depends on (besides the code): the keys of `want` that change it. */
const DEPENDS = { east: ['notes'], ways: ['doorOpen', 'notes'], shell: ['W', 'D', 'wallId'] };
const JOB_TIMEOUT = 60000;
const KEEP = 24; // packed jobs kept

const cache = new Map(); // job key → packed result
const inflight = new Map(); // job key → Promise
let runner = null;

/** What the house to build depends on, from the save. */
export function houseWant(state) {
  const d = state.data;
  const [W, D] = roomSize(d.home?.level || 0);
  return { doorOpen: !!state.flag('escaped'), notes: loadNotes().length, W, D, wallId: d.home?.wall || 'wall_dirt' };
}

function jobKey(id, want) {
  const dep = DEPENDS[id] || [];
  return `v${VERSION}|${id}|` + dep.map((k) => `${k}:${want[k]}`).join('|');
}

/** Start building the house the save wants in the workers (never on the main thread), as early as you like. */
export function prebuildHouse(game) {
  try { if (game?.state) loadHouse(houseWant(game.state), null, { background: true }).catch(() => {}); } catch (e) { console.warn('[home] prebuild failed', e); }
}

/** Is everything for `want` built already? */
export function houseReady(want) { return [...JOBS, 'shell'].every((id) => cache.has(jobKey(id, want))); }

/** Forget what's kept (memory is short). */
export function dropHouseCache() { cache.clear(); }

/**
 * The house and your room's walls for `want`: kept, building (joined), or started now.
 * opts.background: workers only (a prebuild). Resolves { jobs, vista, shell, ms, workers, built }.
 */
export async function loadHouse(want, onProgress = null, opts = {}) {
  const t0 = performance.now();
  const r = getRunner();
  if (!opts.background) r.foreground++;
  const jobIds = JOBS.filter((id) => id !== 'ways');
  const total = jobIds.reduce((s, id) => s + (COST[id] ?? 2), 0) + COST.ways + COST.shell;
  let done = 0, built = 0;
  const tick = (id) => { done += COST[id] ?? 2; onProgress?.({ k: Math.min(0.99, done / total), label: id }); };
  onProgress?.({ k: 0, label: 'start' });
  const get = (id, job) => {
    const key = jobKey(id, want);
    if (cache.has(key)) { tick(id); return Promise.resolve(cache.get(key)); }
    let p = inflight.get(key);
    if (!p) {
      built++;
      p = r.run(job, COST[id] ?? 2).then((m) => {
        cache.set(key, m);
        while (cache.size > KEEP) cache.delete(cache.keys().next().value);
        return m;
      }).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return p.then((m) => { tick(id); return m; });
  };
  try {
    const opt = { doorOpen: want.doorOpen, notes: want.notes };
    const shellP = get('shell', { kind: 'shell', W: want.W, D: want.D, wallId: want.wallId });
    const jobs = await Promise.all(jobIds.map((id) => get(id, { kind: 'room', id, opts: opt })));
    const lights = jobs.flatMap((p) => p.lights);
    jobs.push(await get('ways', { kind: 'room', id: 'ways', opts: opt, lights }));
    const shell = await shellP;
    onProgress?.({ k: 1, label: 'done' });
    return { jobs, vista: null, shell: shell.surf, ms: Math.round(performance.now() - t0), workers: r.n, built };
  } finally {
    if (!opts.background) r.foreground--;
    r.pump();
  }
}

/** A job on this thread (failures give an empty room rather than no house at all). */
function runHere(job) {
  try { return runJob(job).msg; } catch (e) {
    console.error(`[home] building ${job.id || job.kind} failed`, e);
    if (job.kind === 'shell') return { kind: 'shell', surf: null };
    return { kind: 'room', id: job.id, meshes: [], surf: [], nodes: [], meta: {}, lights: [], boxes: [], shadowSpots: [], looks: [], waters: [], drips: [], steps: {}, ms: 0, failed: String(e?.message || e) };
  }
}

// ---------------------------------------------------------------- the runner: workers + this thread
function getRunner() {
  if (!runner) runner = new Runner();
  return runner;
}

class Runner {
  constructor() {
    this.queue = [];
    this.slots = [];
    this.foreground = 0; // scenes waiting: the main thread helps while > 0
    this.mainBusy = false;
    this.idleT = null;
    let n = 0;
    if (typeof Worker !== 'undefined') {
      n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
      try { const q = /[?&]houseWorkers=(\d+)/.exec(location.search); if (q) n = +q[1]; } catch (e) { /* no location */ }
    }
    this.n = n;
  }

  /** Make the workers (on first use; they're closed again when idle a while). */
  ensureWorkers() {
    if (this.slots.length || !this.n || this.broken) return;
    try {
      for (let i = 0; i < this.n; i++) {
        const w = new HouseWorker();
        const slot = { w, busy: null, dead: false };
        w.onmessage = (e) => this.onMsg(slot, e.data);
        w.onerror = (e) => this.onErr(slot, e);
        this.slots.push(slot);
      }
    } catch (e) {
      console.warn('[home] build workers unavailable, building on the main thread', e);
      this.broken = true;
      this.closeWorkers();
    }
  }

  run(job, cost = 1) {
    return new Promise((resolve, reject) => {
      this.queue.push({ job, cost, resolve, reject });
      this.queue.sort((a, b) => b.cost - a.cost);
      this.pump();
    });
  }

  pump() {
    clearTimeout(this.idleT);
    if (this.queue.length) this.ensureWorkers();
    for (const slot of this.slots) {
      if (slot.busy || slot.dead || !this.queue.length) continue;
      const t = this.queue.shift();
      slot.busy = t;
      t.key = Math.random();
      t.timer = setTimeout(() => { if (slot.busy === t) { slot.busy = null; slot.dead = true; try { slot.w.terminate(); } catch (e) { /* gone */ } this.queue.unshift(t); this.pump(); } }, JOB_TIMEOUT);
      try { slot.w.postMessage({ ...t.job, key: t.key }); } catch (e) { clearTimeout(t.timer); slot.busy = null; slot.dead = true; this.queue.unshift(t); }
    }
    // this thread lends a hand while a scene waits (or does it all when no worker can)
    const noWorkers = !this.slots.some((s) => !s.dead);
    if (this.queue.length && !this.mainBusy && (this.foreground > 0 || noWorkers && this.foreground > 0)) {
      this.mainBusy = true;
      setTimeout(() => {
        const t = this.queue.shift();
        if (t) { const m = runHere(t.job); t.resolve(m); }
        this.mainBusy = false;
        this.pump();
      }, 0);
    }
    // workers idle a while: let them go (memory)
    if (!this.queue.length && this.slots.length && this.slots.every((s) => !s.busy)) this.idleT = setTimeout(() => { if (!this.queue.length && this.slots.every((s) => !s.busy)) this.closeWorkers(); }, 8000);
  }

  onMsg(slot, d) {
    const t = slot.busy;
    if (!t || d.key !== t.key) return;
    clearTimeout(t.timer);
    slot.busy = null;
    if (d.ok) t.resolve(d.msg);
    else { console.warn(`[home] build worker failed on ${t.job.id || t.job.kind}, building it here`, d.error); t.resolve(runHere(t.job)); }
    this.pump();
  }

  onErr(slot, e) {
    // the worker couldn't start (or died): its job goes back on the queue
    e?.preventDefault?.();
    slot.dead = true;
    const t = slot.busy;
    slot.busy = null;
    if (t) { clearTimeout(t.timer); this.queue.unshift(t); }
    if (this.slots.every((s) => s.dead)) { console.warn('[home] build workers failed, building on the main thread', e?.message || ''); this.broken = true; }
    this.pump();
  }

  closeWorkers() {
    for (const s of this.slots) { try { s.w.terminate(); } catch (e) { /* gone */ } if (s.busy) { clearTimeout(s.busy.timer); this.queue.unshift(s.busy); } }
    this.slots = [];
  }
}
