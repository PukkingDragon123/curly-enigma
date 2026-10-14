// Dev-only scene (?scene=showroom): character art review. Modes (&mode=):
//   lineup (default)  player + random townsfolk, the hen and a paw (+ item icons unless &icons=0)
//   species | ages | bodies | hats | outfits | eyes | kids   labelled grids (rows stack upward)
//   faces | states    every expression / rig state on one spec (&species=, &eyes=, &brows=, &player=1)
//   hero              the player close up (&shades=1 adds the ending's sunglasses)
//   hen | paw | portraits (shop keeper portraits through renderPortrait)
// Params: zoom (ortho half-height), cx/cy/cz (look-at offset), yaw/pitch (camera, radians),
//   rot (character facing), anim (force a rig state), seed, cols, gap, rowh, kind (toon|basic|lambert),
//   t (pre-roll seconds), persp=1, only=<labels|species|indices>, set=key:val,... (spec overrides),
//   stats=0 (hide the build-time overlay), labels=0, bg=<hex>, lod=crowd, simplify=1 (crowd LOD
//   at build time / in place). The overlay shows build time, triangles, meshes per character
//   and the frame's draw calls (colour + outline mask + post).
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { makeCharacter, randomSpec, playerSpec, makeChicken, SPECIES, makePaw, buildStats } from '../gfx/characters.js';
import { el } from '../core/util.js';

const STATES = ['idle', 'walk', 'run', 'jump', 'fall', 'climb', 'swim', 'swing', 'hammer', 'dig', 'chisel', 'brush', 'drill', 'wave', 'talk', 'cheer', 'sit', 'sleep', 'laugh', 'sad', 'carry', 'peck', 'hurt', 'sneeze'];

function lineupSpecs(seed) {
  const list = [playerSpec()];
  for (let i = 0; i < 23; i++) list.push(randomSpec(1000 + i * 17 + seed, i < SPECIES.length ? { species: SPECIES[i] } : {}));
  return list;
}

function modeSpecs(mode, seed) {
  const base = { age: 'adult', body: 'normal', eyes: 'bead', outfit: 'overalls', outfitColor: 0x3a6a9a, hat: 'none', dirt: 0.5, blush: true, seed: 5 + seed };
  if (mode === 'species') return SPECIES.map((species, i) => ({ ...randomSpec(300 + i * 7 + seed, { species, age: 'adult', hat: 'none' }), label: species }));
  if (mode === 'ages') {
    const out = [];
    for (const species of ['mole', 'rabbit', 'hedgehog']) for (const age of ['baby', 'kid', 'adult', 'elder']) out.push({ ...randomSpec(500 + out.length * 3 + seed, { species, age, hat: 'none' }), label: `${species} ${age}` });
    return out;
  }
  if (mode === 'bodies') return ['slim', 'normal', 'chubby', 'tall', 'stocky'].flatMap((body, i) => [
    { ...base, species: 'mole', body, label: `mole ${body}`, seed: 40 + i },
    { ...base, species: 'fox', body, outfit: 'vest', outfitColor: 0x5a2a2a, label: `fox ${body}`, seed: 50 + i },
  ]);
  if (mode === 'hats') return ['none', 'helmet', 'hardhat', 'cap', 'beanie', 'bandana', 'bow', 'tophat'].flatMap((hat, i) => [
    { ...base, species: 'mole', hat, hatColor: [0xe0b030, 0xe0b030, 0xd9582a, 0x3a5a3a, 0xc94a3a, 0x3a6ac9, 0xc94a3a, 0x1a1a1a][i], label: hat },
    { ...base, species: i % 2 ? 'rabbit' : 'badger', hat, hatColor: [0xe0b030, 0xe0b030, 0xd9582a, 0xc94a3a, 0x3a6ac9, 0xe0e0d8, 0x8a3a8a, 0x1a1a1a][i], outfit: 'shirt', label: hat },
  ]);
  if (mode === 'outfits') return ['none', 'overalls', 'apron', 'vest', 'shirt', 'dress', 'suit'].flatMap((outfit, i) => [
    { ...base, species: 'mole', outfit, outfitColor: [0, 0x3a6a9a, 0xd9d0b8, 0x6a3a6a, 0x5a7a3a, 0xb8a070, 0x4a4a6a][i], patches: 2, label: outfit, scarf: i === 3 ? 0xe0b030 : null },
    { ...base, species: 'vole', outfit, outfitColor: [0, 0x8a3a2a, 0x7a5a3a, 0x2a5a5a, 0xa86a2a, 0x9a2a3a, 0x6a1a2a][i], fabric: ['plain', 'plain', 'plain', 'plain', 'stripe', 'dots', 'plain'][i], backpack: i === 1, label: outfit },
  ]);
  if (mode === 'eyes') return ['dot', 'bead', 'tall', 'sleepy', 'happy', 'wide'].flatMap((eyes, i) => [
    { ...base, species: 'mole', eyes, brows: ['none', 'angry', 'worried', 'bushy', 'none', 'none'][i], label: eyes },
    { ...base, species: 'shrew', eyes, outfit: 'shirt', glasses: i === 2 ? true : i === 5 ? 'monocle' : false, label: eyes },
  ]);
  if (mode === 'faces' || mode === 'states') return null;
  if (mode === 'kids') return [
    { ...randomSpec(71, { species: 'mole', age: 'baby' }), label: 'baby' }, { ...randomSpec(72, { species: 'mole', age: 'kid' }), label: 'kid' },
    { ...randomSpec(73, { species: 'starnose', age: 'kid' }), label: 'kid' }, { ...randomSpec(74, { species: 'rabbit', age: 'baby' }), label: 'baby' },
    { ...randomSpec(75, { species: 'mole', age: 'elder', cane: true, glasses: true }), label: 'elder' }, { ...randomSpec(76, { species: 'hedgehog', age: 'elder', cane: true }), label: 'elder' },
  ];
  return lineupSpecs(seed);
}

export default class ShowroomScene extends Scene {
  async enter(params) {
    this.hud = 'none';
    const mode = params.mode || 'lineup';
    this.mode = mode;
    this.scene.background = new THREE.Color(params.bg ? parseInt(params.bg, 16) : 0x2a2030);
    const seed = parseInt(params.seed, 10) || 0;
    const kind = params.kind || 'toon';
    this.rigs = [];
    this.labels = [];
    const add = (obj) => { this.scene.add(obj); return obj; };

    // lights similar to the iso scenes
    add(new THREE.HemisphereLight(0xfff0dd, 0x403050, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6);
    dl.position.set(3, 6, 4);
    add(dl);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 60), new THREE.MeshLambertMaterial({ color: 0x5a4030 }));
    floor.position.y = -0.1;
    add(floor);

    const stats = [];
    // &set=dirt:0,hat:none,fur:0x8a6a4a overrides spec fields on every character
    const over = {};
    if (params.set) for (const kv of params.set.split(',')) {
      const [k, val] = kv.split(':');
      over[k] = val === 'true' ? true : val === 'false' ? false : val === 'null' ? null : /^(0x)?[0-9.]+$/.test(val) ? Number(val) : val;
    }
    const lod = params.lod || undefined;
    const build = (spec, opts = {}) => {
      const rig = makeCharacter({ ...spec, ...over }, { kind, lod, ...opts });
      if (params.simplify === '1') rig.simplify();
      stats.push({ ms: buildStats.ms, tris: buildStats.tris, meshes: rig.meshes.length, label: spec.label || spec.species });
      return rig;
    };

    let specs = modeSpecs(mode, seed);
    let center = new THREE.Vector3(0, 0.6, 0);
    let zoom = 4.5;
    const rot = params.rot !== undefined ? parseFloat(params.rot) : 0.5;
    if (mode === 'lineup') {
      specs.forEach((spec, i) => {
        const rig = build(spec);
        const col = i % 8, row = Math.floor(i / 8);
        rig.root.position.set((col - 3.5) * 1.9, 0, (row - 1) * 2.6);
        rig.face(0.6, true);
        const lineupStates = ['idle', 'walk', 'wave', 'cheer', 'talk', 'dig', 'laugh', 'sit'];
        this.setState(rig, params.anim || lineupStates[i % lineupStates.length]);
        add(rig.root);
        this.rigs.push(rig);
      });
      const hen = makeChicken({ hat: 'straw', kind });
      hen.root.position.set(6.8, 0, 3);
      add(hen.root);
      this.rigs.push(hen);
      const paw = makePaw(1, { scale: 1, kind });
      paw.position.set(-7, 0.8, 3);
      paw.rotation.y = 0.8;
      add(paw);
    } else if (mode === 'faces' || mode === 'states') {
      const list = mode === 'faces'
        ? ['idle', 'blink', 'talk', 'laugh', 'cheer', 'sad', 'hurt', 'sneeze', 'sleep', 'hop', 'shake', 'surprise', 'angry', 'dig']
        : STATES;
      const cols = parseInt(params.cols, 10) || 7;
      const gap = parseFloat(params.gap) || (mode === 'faces' ? 1.15 : 1.6);
      const rows = Math.ceil(list.length / cols);
      const rowH = parseFloat(params.rowh) || 1.75;
      const base = mode === 'faces' && !params.player
        ? randomSpec(9 + seed, { species: params.species || 'mole', age: 'adult', hat: 'none', glasses: false, eyes: params.eyes || 'bead', brows: params.brows || 'none' })
        : params.species ? randomSpec(9 + seed, { species: params.species, age: 'adult' }) : playerSpec();
      list.forEach((st, i) => {
        const rig = build({ ...base, label: st });
        const col = i % cols, row = Math.floor(i / cols);
        rig.root.position.set((col - (cols - 1) / 2) * gap, (rows - 1 - row) * rowH, 0);
        rig.face(rot, true);
        if (['hop', 'shake', 'surprise', 'angry', 'nod'].includes(st)) { rig.play('idle'); rig.doEmote(st, 1e9); }
        else if (st === 'blink') { rig.play('idle'); rig.blinkT = -1; rig.blinkK = 0.06; rig.persistBlink = true; }
        else this.setState(rig, st);
        if (st === 'swing' || st === 'hammer') rig.swingPhase = 0.35;
        add(rig.root);
        this.rigs.push(rig);
        this.labels.push({ obj: rig.root, text: st, h: rig.height });
      });
      floor.visible = false;
      center.set(0, ((rows - 1) * rowH + 1.3) / 2, 0);
      // fit both the rows and the columns
      zoom = Math.max(1.0, (rows * rowH) / 2 + 0.25, (cols * gap) / (2 * this.game.engine.aspect) + 0.15);
    } else if (mode === 'portraits') {
      // shop keeper portraits through renderPortrait (as the shop UI does)
      const { SHOPS } = await import('../data/shops.js');
      const { renderPortrait } = await import('../gfx/characters.js');
      const wrap = el('div', { style: { position: 'absolute', left: '20px', top: '40px', display: 'flex', gap: '12px', flexWrap: 'wrap' } });
      for (const id of Object.keys(SHOPS)) {
        const k = SHOPS[id].keeper;
        const t0 = performance.now();
        const c = renderPortrait(this.game.engine.renderer, { seed: 9, eyes: 'bead', dirt: 0.2, blush: true, ...k, hat: k.hat || 'none', glasses: k.glasses || false }, 72);
        stats.push({ ms: performance.now() - t0, tris: 0, meshes: 0, label: id });
        c.style.width = '216px'; c.style.height = '216px'; c.style.imageRendering = 'pixelated';
        wrap.append(el('div', { style: { color: '#f0e0c0', font: '12px monospace' } }, [c, el('div', {}, [k.name])]));
      }
      this.game.ui.world.append(wrap);
    } else if (mode === 'hero') {
      const rig = build({ ...playerSpec(), label: 'player' });
      rig.face(rot, true);
      this.setState(rig, params.anim || 'idle');
      add(rig.root);
      this.rigs.push(rig);
      if (params.shades === '1') {
        // the ending's sunglasses, placed exactly as EndingScene does
        // (EndingScene places them with these classic offsets; anchors.headW sizes them)
        const { makeSunglasses } = await import('../bookends/props.js');
        const sh = makeSunglasses(rig.anchors.headW);
        sh.position.set(0, 6 * rig.s + (rig.eyeDrop ? 0 : rig.s), 6.6 * rig.s);
        rig.neck.add(sh);
      }
      center.set(0, 0.72, 0);
      zoom = 0.95;
    } else if (mode === 'hen') {
      ['idle', 'walk', 'sit', 'peck', 'flap'].forEach((st, i) => {
        const hen = makeChicken({ hat: i % 2 ? 'straw' : undefined, kind });
        hen.root.position.set((i - 2) * 1.2, 0, 0);
        hen.face(rot, true);
        hen.play(st === 'peck' || st === 'flap' ? 'idle' : st);
        hen.persist = st;
        add(hen.root);
        this.rigs.push(hen);
      });
      center.set(0, 0.45, 0);
      zoom = 1.3;
    } else if (mode === 'paw') {
      for (const side of [-1, 1]) {
        const paw = makePaw(side, { scale: 1, kind });
        paw.position.set(side * 0.7, 0.5, -0.6);
        paw.rotation.set(-0.9, side * -0.25, 0);
        add(paw);
        const paw2 = makePaw(side, { scale: 1, kind });
        paw2.position.set(side * 2.2 + side * 0.4, 0.5, 0);
        paw2.rotation.set(0, side * -1.2, 0);
        add(paw2);
      }
      center.set(0, 0.6, 0);
      zoom = 1.3;
    } else {
      if (params.only) specs = specs.filter((s, i) => params.only.split(',').some((k) => k === String(i) || k === s.label || k === s.species));
      const cols = Math.min(specs.length, parseInt(params.cols, 10) || (specs.length > 12 ? 8 : 6));
      const gap = parseFloat(params.gap) || 1.3;
      const rows = Math.ceil(specs.length / cols);
      const rowH = parseFloat(params.rowh) || 1.75;
      // rows are stacked upward (floating) so they never overlap on screen
      specs.forEach((spec, i) => {
        const rig = build(spec);
        const col = i % cols, row = Math.floor(i / cols);
        rig.root.position.set((col - (cols - 1) / 2) * gap, (rows - 1 - row) * rowH, 0);
        rig.face(rot, true);
        this.setState(rig, params.anim || 'idle');
        add(rig.root);
        this.rigs.push(rig);
        this.labels.push({ obj: rig.root, text: spec.label || '', h: rig.height });
      });
      floor.visible = false;
      center.set(0, ((rows - 1) * rowH + 1.3) / 2, 0);
      // fit both the rows and the columns
      zoom = Math.max(1.0, (rows * rowH) / 2 + 0.25, (cols * gap) / (2 * this.game.engine.aspect) + 0.15);
    }

    // camera
    this.zoom = parseFloat(params.zoom) || zoom;
    center.x += parseFloat(params.cx) || 0;
    center.y += parseFloat(params.cy) || 0;
    center.z += parseFloat(params.cz) || 0;
    const yaw = params.yaw !== undefined ? parseFloat(params.yaw) : 0.45;
    const pitch = params.pitch !== undefined ? parseFloat(params.pitch) : (mode === 'lineup' ? 0.38 : 0.3);
    const dist = 30;
    const cam = params.persp === '1'
      ? new THREE.PerspectiveCamera(30, this.game.engine.aspect, 0.1, 100)
      : new THREE.OrthographicCamera(-8, 8, this.zoom, -this.zoom, 0.1, 100);
    cam.position.set(center.x + Math.sin(yaw) * Math.cos(pitch) * dist, center.y + Math.sin(pitch) * dist, center.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    if (cam.isPerspectiveCamera) cam.position.lerp(center, 1 - this.zoom * 2.2 / dist);
    cam.lookAt(center);
    this.camera = cam;
    this.onResize(this.game.engine.width, this.game.engine.height);

    // pre-roll the animation
    const pre = parseFloat(params.t) || 0;
    for (let k = 0; k < pre; k += 1 / 30) this.update(1 / 30);

    // stats overlay + console
    if (stats.length) {
      const tot = stats.reduce((a, s) => a + s.ms, 0);
      const tris = stats.reduce((a, s) => a + s.tris, 0);
      const maxT = Math.max(...stats.map((s) => s.tris));
      const meshes = stats.reduce((a, s) => a + s.meshes, 0);
      const line = `${stats.length} chars · build ${tot.toFixed(1)} ms total, ${(tot / stats.length).toFixed(2)} ms avg, first ${stats[0].ms.toFixed(1)} ms · tris avg ${Math.round(tris / stats.length)} max ${maxT} · ${(meshes / stats.length).toFixed(1)} meshes/char`;
      console.log('[showroom]', line);
      for (const s of stats) console.log('[showroom]', s.label, s.ms.toFixed(2), 'ms', s.tris, 'tris');
      if (params.stats !== '0') {
        this.statsEl = el('div', { style: { position: 'absolute', left: '8px', top: '6px', color: '#f0e0c0', font: '12px monospace', background: 'rgba(0,0,0,.45)', padding: '2px 6px', whiteSpace: 'pre' } }, [line]);
        this.statsLine = line;
        this.game.ui.world.append(this.statsEl);
      }
    }
    // labels
    if (params.labels !== '0') {
      for (const L of this.labels) {
        const d = el('div', { style: { position: 'absolute', color: '#f8ecd0', font: '11px monospace', transform: 'translate(-50%, 0)', textShadow: '0 1px 0 #000', whiteSpace: 'nowrap' } }, [L.text]);
        this.game.ui.world.append(d);
        L.el = d;
      }
    }

    if (mode === 'lineup' && params.icons !== '0') {
      // icons load lazily so character review never depends on the pixel-art modules
      const [{ ITEMS }, { iconURL, weaponIconURL }, { WEAPON_TYPES }] = await Promise.all([import('../data/items.js'), import('../gfx/PixelArt.js'), import('../data/weapons.js')]);
      const wrap = el('div', { style: { position: 'absolute', left: '8px', bottom: '8px', right: '8px', display: 'flex', flexWrap: 'wrap', gap: '2px', background: 'rgba(0,0,0,.5)', padding: '4px', maxHeight: '45vh', overflow: 'auto' } });
      for (const id of Object.keys(ITEMS)) wrap.append(el('img', { class: 'pix', src: iconURL(id), title: id, style: { width: '32px', height: '32px', background: '#e8d2a2' } }));
      for (const t of Object.keys(WEAPON_TYPES)) for (const m of ['iron', 'gold', 'mithril']) wrap.append(el('img', { class: 'pix', src: weaponIconURL(t, m, m === 'mithril' ? 'bioxide' : null), title: t + ' ' + m, style: { width: '32px', height: '32px', background: '#e8d2a2' } }));
      this.game.ui.world.append(wrap);
    }
    window.__showroom = this;
  }

  setState(rig, st) {
    if (st === 'talk') { rig.play('idle'); rig.talkT = 1e9; } else rig.play(st);
  }

  render() {
    // count every draw call of the frame (colour + outline mask + post) for the overlay
    const info = this.game.engine.renderer.info;
    info.autoReset = false;
    info.reset();
    super.render();
    this.calls = info.render.calls;
    info.autoReset = true;
    if (this.statsEl && (this.callsT = (this.callsT || 0) + 1) % 20 === 1) this.statsEl.textContent = `${this.statsLine}\nframe: ${this.calls} draw calls, ${info.render.triangles} tris`;
  }

  update(dt) {
    super.update(dt);
    for (const r of this.rigs) {
      if (r.persist === 'peck' && r.peckT <= 0) r.peck();
      if (r.persist === 'flap' && r.flapT <= 0) r.flap(1);
      if (r.persistBlink) { r.blinkK = 0.06; r.blinkT = 1; }
      if (r.talkT > 1e8) r.talkT = 1e9;
      r.update(dt);
    }
    for (const L of this.labels) {
      if (!L.el) continue;
      const p = this.toScreen(L.obj.position.clone().add(new THREE.Vector3(0, -0.04, 0)));
      L.el.style.left = p.x + 'px';
      L.el.style.top = p.y + 'px';
    }
  }

  onResize(w, h) {
    const a = w / h;
    if (this.camera.isOrthographicCamera) {
      this.camera.left = -this.zoom * a; this.camera.right = this.zoom * a; this.camera.top = this.zoom; this.camera.bottom = -this.zoom;
    } else this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
