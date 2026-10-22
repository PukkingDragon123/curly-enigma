// Deep Town's townsfolk in first person: little scenes with simple AI (wanderers, a mole family,
// kids playing tag, elders on benches, someone asleep, a busker, a frog fishing in the fountain,
// a sweeping shrew, miners hauling ore to the lift, gossiping pairs, window shoppers, back-lane
// neighbours on their doorsteps). They emote, sneeze, avoid each other and you, turn to look and
// wave when you come close, and chat in bubbles with babble voices. Far folk are built with the
// crowd LOD (one mesh). Town units; the scene supplies the player proxy, say/emote and timers.
import * as THREE from 'three';
import { Actor } from '../iso/Actor.js';
import { makeCharacter, randomSpec } from '../gfx/characters.js';
import { TOWN_CHATTER } from '../data/shops.js';
import { TOWN } from '../iso/townLayout.js';
import { makeRng, rand, pick, chance, clamp } from '../core/util.js';
import { midiToFreq } from '../core/Audio.js';
import { ROLE_MOODS, moodOf } from './moods.js';
import { broom as makeBroom, lute, fishingRod, oreCrate } from './props.js';

const NAMES = ['Pebble', 'Rooty', 'Moss', 'Tuck', 'Clover', 'Burr', 'Dusty', 'Fern', 'Nib', 'Mabel', 'Toby', 'Bea', 'Pip', 'Tansy', 'Wort', 'Clem',
  'Dot', 'Ivo', 'Juniper', 'Nettle', 'Ollie', 'Rue', 'Sorrel', 'Thistle', 'Umber', 'Wren', 'Ginny', 'Barley', 'Cob', 'Loam', 'Marl'];

export const ELDER_LINES = [
  'Came out of Shaft Seven like a cork from a bottle, you did.',
  'Your burrow suits you. Needs more dirt, though.',
  'Fifty years I have sat by that shaft. Never saw it sneeze before.',
  'Save your coins, youngster. The surface is not cheap.',
  'Grubb sells a fine pick. Do not tell him I said so.',
];
const VENDOR_LINES = {
  shrooms: ['Fresh glowcaps! They glow all the way home!', 'Mushrooms, mushrooms, picked this morning!', 'Try the blue ones. Or do not. Your tummy.'],
  fish: ['Blind fish! Still wiggling!', 'Caught in the Deep Lake, they never saw it coming.', 'Smell that? That is freshness.'],
  gems: ['Shiny rocks, shinier prices!', 'Every stone polished by my own paws.', 'Found it in a geode. Probably.'],
};
const HELLOS = ['Oh! Hello there.', 'Evening, neighbour!', 'Mind the puddles.', 'Nice day for it. Probably. Who can tell down here.', 'Hullo!', 'You\'re the new one, aren\'t you?'];
const DOORSTEP = ['Lovely and quiet back here.', 'Kettle\'s on, if you\'re passing.', 'My begonias glow better than Hazel\'s. Don\'t tell her.', 'Back lanes are the best lanes.'];

function voiceFor(spec, rng) {
  let v = { baby: 560, kid: 470, adult: 320, elder: 240 }[spec.age] ?? 320;
  if (spec.species === 'frog') v = 180;
  if (spec.species === 'badger') v -= 80;
  if (spec.species === 'rabbit' || spec.species === 'shrew') v += 70;
  return Math.round(v + rng.range(-30, 30));
}

// ---------------------------------------------------------------- held props (props.js)
// ---------------------------------------------------------------- the crowd
export class Townsfolk {
  constructor(scene) {
    this.s = scene;
    this.list = [];
    this.chatT = rand(5, 9);
    this.sneezeT = rand(8, 16);
    this.rng = makeRng(2024);
    this.nameI = 0;
    this.lastLine = null;
    this.buskT = 0;
    this.buskI = 0;
  }

  make(seed, overrides, role, o = {}) {
    const rng = makeRng(seed * 7 + 3);
    const spec = randomSpec(seed, overrides);
    const rig = makeCharacter(spec, { lod: o.full ? undefined : 'crowd' });
    const name = o.name || NAMES[this.nameI++ % NAMES.length];
    const a = new Actor(rig, { x: o.x, z: o.z, yaw: o.yaw ?? rng.range(0, 6.28), name, voice: voiceFor(spec, rng), radius: spec.age === 'baby' ? 0.17 : spec.age === 'kid' ? 0.21 : 0.25, shadow: spec.age === 'baby' ? 0.42 : spec.age === 'kid' ? 0.5 : 0.6 });
    a.skipFar = true;
    this.s.addActor(a);
    const npc = { a, spec, role, name, st: { t: rand(0.5, 3) }, pause: 0, speed: o.speed ?? (spec.age === 'elder' ? 1.0 : spec.age === 'kid' ? 1.9 : 1.35), region: o.region, seat: o.seat, armed: true };
    // a resting face for the role (some folk are cheerful, some grumpy, some half asleep)
    npc.mood = o.mood || rng.pick(ROLE_MOODS[role] || ROLE_MOODS.wander);
    rig.setMood(npc.mood);
    a.npc = npc;
    this.list.push(npc);
    this.s.addTalk(a, () => `Chat with ${name}`, () => this.talkTo(npc));
    return npc;
  }

  seatAt(npc, seat, sleeping = false) {
    const a = npc.a;
    a.collide = false;
    a.pos.set(seat.x, 0, seat.z);
    a.rig.face(seat.yaw, true);
    a.body.position.y = seat.y ?? 0.2;
    a.rig.seatY = a.body.position.y; // grown-up legs reach down for the floor
    a.headY = a.rig.height + 0.12 - Math.max(0, a.rig.p.lh - 1.5) * a.rig.s; // sitting: the head is lower (bubbles, talk spot)
    a.rig.play('sit');
    npc.seated = true;
    npc.seat = seat;
    if (sleeping) {
      npc.sleeping = true;
      npc.mood = 'asleep';
      a.rig.setMood('asleep');
    }
  }

  spawnAll() {
    const B = TOWN.benches;
    const seat = (b, side) => ({ x: b.x + Math.cos(b.yaw) * 0.42 * side, z: b.z - Math.sin(b.yaw) * 0.42 * side, yaw: b.yaw });
    const plaza = { x0: 12, z0: 9, x1: 25, z1: 22 };
    const town = { x0: 5, z0: 5, x1: 32, z1: 26 };
    const lanes = { x0: 8, z0: 28, x1: 36, z1: 31 };
    const east = { x0: 34, z0: 11, x1: 37, z1: 31 };
    const e1 = this.make(101, { species: 'mole', age: 'elder', cane: true }, 'bench', { x: 0, z: 0 });
    this.seatAt(e1, seat(B[0], -1));
    const e2 = this.make(102, { species: 'mole', age: 'elder', glasses: true, outfit: 'dress' }, 'bench', { x: 0, z: 0 });
    this.seatAt(e2, seat(B[0], 1));
    const e3 = this.make(103, { species: 'hedgehog', age: 'elder', cane: true }, 'bench', { x: 0, z: 0 });
    this.seatAt(e3, seat(B[1], -1));
    const sl = this.make(104, { species: 'badger', age: 'adult', body: 'chubby', hat: 'beanie' }, 'sleeper', { x: 0, z: 0 });
    this.seatAt(sl, seat(B[2], 1), true);
    // the old-timer who sits by the boarded-up shaft and has seen everything
    const el = this.make(108, { species: 'mole', age: 'elder', cane: true, glasses: true, outfit: 'vest', outfitColor: 0x6a4a3a, hat: 'cap', hatColor: 0x5a4a3a, brows: 'bushy' }, 'elder', { x: 0, z: 0, name: 'Old Hollis', full: true });
    this.seatAt(el, seat(B[4], -1));
    this.elder = el;
    // market stall keepers
    (this.s.stallSpots || []).forEach((sp, i) => {
      const v = this.make(170 + i, { age: 'adult', outfit: 'apron', outfitColor: [0xd9d0b8, 0x8ab0d0, 0xc8a0d8][i % 3], hat: i === 1 ? 'bandana' : 'none', hatColor: 0x3a6ac9, species: ['hedgehog', 'frog', 'molerat'][i % 3] }, 'vendor', { x: sp.x, z: sp.z, yaw: sp.yaw });
      v.kind = sp.kind;
      v.home = { x: sp.x, z: sp.z, yaw: sp.yaw };
      v.a.collide = false;
    });
    // busker near the fountain
    const bk = this.make(105, { species: 'golden', age: 'adult', hat: 'cap', hatColor: 0xc94a3a, outfit: 'vest', outfitColor: 0x6a3a6a, scarf: 0xe0b030 }, 'busker', { x: 21.7, z: 19.6, yaw: -2.3 });
    bk.a.rig.holdItem(lute(), 'L');
    bk.a.after = () => {
      const r = bk.a.rig, t = r.t;
      r.armL.rotation.set(-1.0, 0.2, 0.6);
      r.armR.rotation.set(-1.1 + Math.sin(t * 13) * 0.22, -0.2, -0.4);
      r.hip.position.y += Math.abs(Math.sin(t * 4.2)) * r.s * 1.2;
      r.neck.rotation.z += Math.sin(t * 2.1) * 0.12;
    };
    // a frog fishing at the fountain
    const fx = TOWN.fountain.x - TOWN.fountain.r - 0.05, fz = TOWN.fountain.z + 0.9;
    const fr = this.make(106, { species: 'frog', age: 'adult', hat: 'bandana', hatColor: 0x3a6ac9, outfit: 'vest', outfitColor: 0x7a5a3a }, 'fisher', { x: fx, z: fz, yaw: Math.PI / 2 });
    this.seatAt(fr, { x: fx, z: fz, yaw: Math.PI / 2 - 0.15, y: 0.47 });
    const rod = fishingRod();
    rod.rotation.x = -0.5;
    fr.a.rig.holdItem(rod, 'R');
    fr.rod = rod;
    fr.st.t = rand(5, 9);
    // a shrew sweeping the west promenade
    const sw = this.make(107, { species: 'shrew', age: 'adult', outfit: 'apron', outfitColor: 0xd9d0b8, hat: 'bandana', hatColor: 0xc94a3a }, 'sweeper', { x: 5.3, z: 8, yaw: 0 });
    const broom = makeBroom();
    broom.rotation.x = 2.4;
    sw.a.rig.holdItem(broom, 'R');
    sw.st = { mode: 'sweep', t: 2, dir: 1, z0: 7, z1: 26 };
    // miners hauling ore to the lift
    for (let i = 0; i < 2; i++) {
      const m = this.make(110 + i, { species: i ? 'starnose' : 'mole', age: 'adult', backpack: true, hat: 'hardhat', hatColor: 0xe0b030, outfit: 'overalls', dirt: 0.95, body: i ? 'stocky' : 'tall' }, 'miner', { x: TOWN.orePile.x + 1 + i, z: TOWN.orePile.z + 0.8, speed: 1.25 });
      m.st = { mode: 'toPile', t: i * 3 };
      m.crate = oreCrate();
    }
    // a family: parent and two babies
    const par = this.make(120, { species: 'mole', age: 'adult', outfit: 'dress', outfitColor: 0xb8a070, hat: 'bow', hatColor: 0xc94a3a }, 'parent', { x: 15, z: 22, region: plaza, speed: 0.95 });
    for (let i = 0; i < 2; i++) {
      const b = this.make(121 + i, { species: 'mole', age: 'baby' }, 'baby', { x: 15 + i * 0.5, z: 22.6 });
      b.parent = par;
      b.slot = i ? 1 : -1;
    }
    // kids playing tag in the open south-east
    const tagArea = { x0: 23.5, z0: 16.5, x1: 31.5, z1: 26 };
    const kids = [];
    for (let i = 0; i < 3; i++) kids.push(this.make(130 + i, { age: 'kid', species: ['mole', 'rabbit', 'starnose'][i] }, 'tag', { x: 26 + i * 1.6, z: 19 + i, region: tagArea, speed: 3.0 }));
    kids[0].it = true;
    for (const k of kids) k.kids = kids;
    // gossiping pairs
    const pairs = [[{ x: 6.4, z: 9.6 }, { x: 7.2, z: 10.3 }], [{ x: 14.6, z: 24.2 }, { x: 15.5, z: 24.6 }], [{ x: 22.6, z: 29.9 }, { x: 23.5, z: 30.5 }]];
    pairs.forEach((p, i) => {
      const g1 = this.make(140 + i * 2, { age: 'adult' }, 'gossip', { x: p[0].x, z: p[0].z });
      const g2 = this.make(141 + i * 2, { age: i === 1 ? 'elder' : 'adult' }, 'gossip', { x: p[1].x, z: p[1].z });
      g1.mate = g2; g2.mate = g1;
      g1.a.faceToward(p[1].x, p[1].z, true); g2.a.faceToward(p[0].x, p[0].z, true);
      g1.st.t = rand(1, 3); g2.st.t = 99;
      g1.speaker = true;
    });
    // window shoppers
    this.make(150, { age: 'adult', species: 'vole' }, 'shopper', { x: 5.2, z: 13.4, yaw: -Math.PI / 2 });
    this.make(151, { age: 'adult', species: 'molerat' }, 'shopper', { x: 25.4, z: 5.2, yaw: Math.PI });
    // neighbours sitting on their doorsteps in the back lanes
    (this.s.houseDoors || []).slice(0, 3).forEach((d, i) => {
      const h = TOWN.houses[i];
      const fwd = { x: Math.sin(h.yaw), z: Math.cos(h.yaw) };
      const n = this.make(190 + i, { age: i === 1 ? 'elder' : 'adult', species: ['hedgehog', 'mole', 'rabbit'][i] }, 'doorstep', { x: d.x + fwd.x * 0.5 + (i - 1) * 0.1, z: d.z + fwd.z * 0.5 });
      this.seatAt(n, { x: d.x + fwd.x * 0.5 + 0.9, z: d.z + fwd.z * 0.5, yaw: h.yaw, y: 0.08 });
    });
    // wanderers of all sorts (some in the back lanes)
    for (let i = 0; i < 7; i++) {
      const r = i < 2 ? plaza : i < 5 ? town : i === 5 ? lanes : east;
      const p = this.s.map.randomFree(this.rng, r.x0, r.z0, r.x1, r.z1, 0.4) || { x: 18, z: 22 };
      this.make(160 + i * 3, i === 3 ? { age: 'elder' } : i === 4 ? { species: 'armadillo' } : {}, 'wander', { x: p.x, z: p.z, region: r });
    }
    // lane kids chasing each other along the back
    const lk = [];
    for (let i = 0; i < 2; i++) lk.push(this.make(135 + i, { age: 'kid', species: ['hedgehog', 'mole'][i] }, 'tag', { x: 12 + i * 2, z: 30.5, region: { x0: 8, z0: 28.4, x1: 18, z1: 31.6 }, speed: 2.8 }));
    lk[0].it = true;
    for (const k of lk) k.kids = lk;
  }

  // ------------------------------------------------------------ talking
  talkTo(npc) {
    const s = this.s, a = npc.a, p = s.player;
    if (!npc.seated) a.faceToward(p.x, p.z);
    npc.pause = 3.6;
    let line;
    if (npc.sleeping) line = pick(['Zzz... five more minutes...', 'Mmh? Wha... oh, hello. Zzz.', 'Zzz... shiny... so shiny...']);
    else if (npc.role === 'busker') line = pick(['A coin for the song? Only joking. Mostly.', 'This one is about the sun. I have never seen it.', '♪ Dig, dig, dig, little paws... ♪']);
    else if (npc.role === 'baby') line = pick(['Bah!', 'Mama! Chicken!', 'Hee hee!', 'Dirt!']);
    else if (npc.role === 'elder') line = pick(s.game.state.escaped ? ELDER_LINES : ['Mind the old shaft, youngster. Nothing comes out of there.', 'Shaft Seven caved in before you were born.']);
    else if (npc.role === 'vendor') line = pick(VENDOR_LINES[npc.kind] || VENDOR_LINES.shrooms);
    else if (npc.role === 'tag' && npc.it) line = pick(['You\'re it! No wait, I\'m it!', 'Can\'t talk, I\'m IT!']);
    else if (npc.role === 'doorstep') line = pick(DOORSTEP);
    else line = pick(TOWN_CHATTER.filter((l) => l !== this.lastLine));
    this.lastLine = line;
    if (!npc.sleeping && !npc.seated && chance(0.4)) a.rig.doEmote(pick(['nod', 'wave']), 0.9);
    // the face: woken sleepers grumble, the rest say it with the line's mood
    let mood = npc.sleeping ? 'sleepy' : npc.role === 'baby' ? pick(['laugh', 'happy', 'surprised']) : npc.role === 'busker' ? 'happy' : moodOf(line);
    if (npc.sleeping && chance(0.3)) mood = 'angry';
    s.say(a, line, { name: npc.name, voice: a.voice, mood, life: 3.6 });
    if (!npc.sleeping) a.rig.lookAt(s.eyeTarget);
    npc.lookHold = 4;
    return line;
  }

  /** The mole bumped into someone: a start, then a look (grumpy folk glare, the rest shrug it off). */
  bumped(npc) {
    const s = this.s, a = npc.a;
    if (npc.bumpT > 0 || npc.sleeping) return;
    npc.bumpT = 4;
    a.rig.setExpression('surprised', { hold: 0.7 });
    s.later(0.7, () => a.rig.setExpression(npc.mood === 'stern' || npc.mood === 'smug' || chance(0.3) ? 'angry' : 'worried', { hold: 1.8 }));
    a.rig.lookAt(s.eyeTarget);
    npc.lookHold = 3;
    if (!s.game.ui.bubbles.has(a.key) && chance(0.6)) s.say(a, pick(['Oof!', 'Hey! Watch the paws!', 'Oi!', 'Mind where you dig!', 'Pardon you!']), { name: npc.name, life: 2, mood: 'angry' });
  }

  /** Townsfolk turn to look at a spot, some walk over to gawk (the escape arrival). */
  gather(tx, tz, n = 4) {
    const s = this.s;
    const free = this.list.filter((f) => !f.seated && !f.sleeping && (f.role === 'wander' || f.role === 'gossip' || f.role === 'shopper' || f.role === 'parent') && f.a.dist(tx, tz) < 16);
    free.sort((a, b) => a.a.dist(tx, tz) - b.a.dist(tx, tz));
    free.slice(0, n).forEach((f, i) => {
      const ang = Math.PI * (0.2 + 0.6 * (i / Math.max(1, n - 1)));
      const gx = tx + Math.cos(ang) * 2.2 * (i % 2 ? 1 : -1) * 0.8, gz = tz + Math.sin(ang) * 2.0 + 0.6;
      f.gawk = { x: tx, z: tz, t: 7 + i };
      f.a.setPath(s.map.findPath(f.a.x, f.a.z, gx, gz, f.a.radius));
      // the faces of a crowd watching someone crawl out of a caved-in shaft
      f.a.rig.setExpression(pick(['surprised', 'surprised', 'worried', 'thinking']), { hold: 3 + i * 0.4 });
      s.later(3.2 + i * 0.4, () => f.a.rig.setExpression(pick(['happy', 'thinking', 'smug', 'worried']), { hold: 3.5 }));
    });
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    const s = this.s, map = s.map, p = s.player;
    for (const n of this.list) {
      const a = n.a;
      // eyes on the mole when it is close (unless busy running about or asleep)
      if (n.bumpT > 0) n.bumpT -= dt;
      if (n.lookHold > 0) n.lookHold -= dt;
      else if (p && !n.sleeping && n.role !== 'tag') {
        const d = a.dist(p.x, p.z);
        const want = d < (n.seated ? 2.8 : 3.4) && a.speedNow < 0.6;
        if (want !== !!a.rig.lookTarget) a.rig.lookAt(want ? s.eyeTarget : null);
      }
      if (n.sneezing > 0) {
        n.sneezing -= dt;
        a.drive(dt, 0, 0, map, { anim: false });
        if (!n.sneezed && n.sneezing < 0.45) {
          n.sneezed = true;
          const fy = a.rig.facing;
          s.particles.dustPuff(a.x + Math.sin(fy) * 0.35, a.headY * 0.75, a.z + Math.cos(fy) * 0.35, 9, 0x9a7a5a);
          if (p && a.dist(p.x, p.z) < 8) s.game.audio.play('sneeze');
        }
        if (n.sneezing <= 0) a.rig.play(n.seated ? 'sit' : 'idle');
        continue;
      }
      // gawking at something (the arrival): walk over, then stare a while
      if (n.gawk) {
        n.gawk.t -= dt;
        if (a.path) a.followPath(dt, map, n.speed * 1.3, { avoid: this.avoid(n) });
        else { a.drive(dt, 0, 0, map); if (chance(dt * 0.6)) a.faceToward(n.gawk.x, n.gawk.z); }
        if (n.gawk.t <= 0) { n.gawk = null; n.st.mode = 'idle'; n.st.t = rand(1, 3); }
        continue;
      }
      if (n.pause > 0) {
        n.pause -= dt;
        if (!n.seated) a.drive(dt, 0, 0, map);
        continue;
      }
      // notice the mole walking up: turn, sometimes wave or say hello (once per approach)
      if (p && !n.sleeping && n.role !== 'tag' && n.role !== 'baby') {
        const d = a.dist(p.x, p.z);
        if (d < 2.3 && n.armed && !s.locked) {
          n.armed = false;
          if (!n.seated) { a.faceToward(p.x, p.z); a.setPath(null); n.pause = 1.6; }
          if (chance(0.55)) a.rig.doEmote('wave', 1.0);
          // a face for the newcomer: most light up, some are startled, grumps stay grumpy
          a.rig.setExpression(n.mood === 'stern' ? (chance(0.5) ? 'smug' : 'stern') : chance(0.25) ? 'surprised' : 'happy', { hold: rand(1.6, 2.6) });
          if (chance(0.3) && !s.game.ui.bubbles.has(a.key)) s.say(a, pick(n.role === 'doorstep' ? DOORSTEP : HELLOS), { name: n.name, life: 2.8, mood: 'happy' });
          if (n.pause > 0) continue;
        } else if (d > 5) n.armed = true;
      }
      const fn = this['r_' + n.role];
      if (fn) fn.call(this, n, dt);
    }
    // ambient chatter near the player (rate-limited, never blocking)
    this.chatT -= dt;
    if (this.chatT <= 0 && p) {
      this.chatT = rand(7, 13);
      const near = this.list.filter((n) => !n.sleeping && n.role !== 'baby' && n.a.dist(p.x, p.z) < 5.5 && !s.game.ui.bubbles.has(n.a.key) && s.inView(n.a));
      if (near.length) {
        const n = pick(near);
        this.lastLine = pick(TOWN_CHATTER.filter((l) => l !== this.lastLine));
        s.say(n.a, this.lastLine, { name: n.name, life: 4.2, mood: moodOf(this.lastLine) });
      }
    }
    // sneezes
    this.sneezeT -= dt;
    if (this.sneezeT <= 0 && p) {
      this.sneezeT = rand(12, 24);
      const cand = this.list.filter((n) => !n.sleeping && n.role !== 'fisher' && n.a.dist(p.x, p.z) < 9);
      if (cand.length) {
        const n = pick(cand);
        n.sneezing = 0.95;
        n.sneezed = false;
        n.a.rig.play('sneeze');
      }
    }
  }

  avoid(n) {
    const a = n.a;
    let ax = 0, az = 0;
    for (const o of this.s.actors) {
      if (o === a || !o.collide) continue;
      const dx = a.x - o.x, dz = a.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.64 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      ax += (dx / d) * (0.8 - d) * 3.2;
      az += (dz / d) * (0.8 - d) * 3.2;
    }
    const p = this.s.player;
    if (p) {
      const dx = a.x - p.x, dz = a.z - p.z, d2 = dx * dx + dz * dz;
      if (d2 < 1.0 && d2 > 1e-6) { const d = Math.sqrt(d2); ax += (dx / d) * (1.0 - d) * 4; az += (dz / d) * (1.0 - d) * 4; }
    }
    return { x: ax, z: az };
  }

  walkTo(n, x, z) {
    n.a.setPath(this.s.map.findPath(n.a.x, n.a.z, x, z, n.a.radius));
    return !!n.a.path;
  }

  idleFidget(n, dt) {
    const a = n.a;
    a.drive(dt, 0, 0, this.s.map);
    n.st.look = (n.st.look ?? rand(1, 3)) - dt;
    if (n.st.look <= 0) {
      n.st.look = rand(1.5, 4);
      const p = this.s.player;
      if (p && a.dist(p.x, p.z) < 3.2 && chance(0.7)) {
        a.faceToward(p.x, p.z);
        if (chance(0.15)) a.rig.doEmote('wave', 1.0);
      } else a.rig.face(a.rig.facing + rand(-1.4, 1.4));
      if (chance(0.06)) this.s.emote(a, pick(['?', '!', '♪', '…']));
    }
  }

  // ------------------------------------------------------------ roles
  r_wander(n, dt) {
    const st = n.st, a = n.a;
    if (st.mode === 'walk') {
      const r = a.followPath(dt, this.s.map, n.speed, { avoid: this.avoid(n) });
      if (r !== 'moving') { st.mode = 'idle'; st.t = rand(2, 7); }
      return;
    }
    this.idleFidget(n, dt);
    st.t -= dt;
    if (st.t <= 0) {
      const R = n.region;
      const q = this.s.map.randomFree(Math.random, R.x0, R.z0, R.x1, R.z1, 0.4);
      if (q && this.walkTo(n, q.x, q.z)) st.mode = 'walk';
      else st.t = 1;
    }
  }

  r_parent(n, dt) { this.r_wander(n, dt); }

  r_shopper(n, dt) {
    const st = n.st;
    if (st.mode === 'walk') {
      const r = n.a.followPath(dt, this.s.map, n.speed, { avoid: this.avoid(n) });
      if (r !== 'moving') { st.mode = 'look'; st.t = rand(9, 18); n.a.rig.face(st.face ?? 0); }
      return;
    }
    n.a.drive(dt, 0, 0, this.s.map);
    st.t = (st.t ?? rand(6, 12)) - dt;
    if (chance(dt * 0.15)) n.a.rig.doEmote(pick(['nod', 'shake']), 0.8);
    if (st.t <= 0) {
      const sh = pick(TOWN.shops);
      const mid = sh.a + sh.w / 2 + rand(-1.4, 1.4);
      const [x, z, face] = sh.wall === 'N' ? [mid, TOWN.northFace + 2.3, Math.PI] : [TOWN.westFace + 2.3, mid, -Math.PI / 2];
      st.face = face;
      if (this.walkTo(n, x, z)) st.mode = 'walk'; else st.t = 3;
    }
  }

  r_baby(n, dt) {
    const a = n.a, par = n.parent.a;
    const fy = par.rig.facing;
    const bx = -Math.sin(fy), bz = -Math.cos(fy);
    const tx = par.x + bx * 0.75 + bz * 0.45 * n.slot, tz = par.z + bz * 0.75 - bx * 0.45 * n.slot;
    const d = Math.hypot(tx - a.x, tz - a.z);
    if (d > 0.35) {
      const sp = Math.min(2.6, d * 2.2);
      const av = this.avoid(n);
      a.drive(dt, ((tx - a.x) / d) * sp + av.x * 0.5, ((tz - a.z) / d) * sp + av.z * 0.5, this.s.map, { runAt: 2.4 });
    } else {
      a.drive(dt, 0, 0, this.s.map);
      if (chance(dt * 0.25)) a.rig.doEmote('hop', 0.6);
      if (chance(dt * 0.4)) a.faceToward(par.x, par.z);
    }
  }

  r_tag(n, dt) {
    const a = n.a, R = n.region, map = this.s.map;
    if (n.frozen > 0) { n.frozen -= dt; a.drive(dt, 0, 0, map); return; }
    const others = n.kids.filter((k) => k !== n);
    let vx = 0, vz = 0;
    if (n.it) {
      let tgt = null, bd = Infinity;
      for (const k of others) { const d = a.dist(k.a.x, k.a.z); if (d < bd) { bd = d; tgt = k; } }
      if (tgt) {
        const dx = tgt.a.x - a.x, dz = tgt.a.z - a.z, d = Math.hypot(dx, dz) || 1;
        vx = (dx / d) * n.speed * 0.95; vz = (dz / d) * n.speed * 0.95;
        if (d < 0.55) {
          n.it = false; tgt.it = true; tgt.frozen = 1.0; n.frozen = 0.3;
          this.s.emote(tgt.a, '!');
          tgt.a.rig.setExpression('surprised', { hold: 0.9 });
          this.s.later(0.9, () => tgt.a.rig.setExpression('angry', { hold: 1.2, body: false }));
          n.a.rig.setExpression('laugh', { hold: 1.5, body: false });
          const p = this.s.player;
          if (p && a.dist(p.x, p.z) < 9) this.s.game.audio.play('laugh', { pitch: 520 });
        }
      }
    } else {
      const it = others.find((k) => k.it);
      const d = it ? a.dist(it.a.x, it.a.z) : 99;
      if (it && d < 3.4) {
        const dx = a.x - it.a.x, dz = a.z - it.a.z, l = Math.hypot(dx, dz) || 1;
        vx = (dx / l) * n.speed; vz = (dz / l) * n.speed;
      } else {
        n.st.wt = (n.st.wt ?? 0) - dt;
        if (n.st.wt <= 0 || !n.st.goal) { n.st.wt = rand(1.5, 3); n.st.goal = { x: rand(R.x0, R.x1), z: rand(R.z0, R.z1) }; }
        const dx = n.st.goal.x - a.x, dz = n.st.goal.z - a.z, l = Math.hypot(dx, dz) || 1;
        if (l > 0.4) { vx = (dx / l) * 1.4; vz = (dz / l) * 1.4; }
      }
    }
    const m = 1.0;
    if (a.x < R.x0 + m) vx += (R.x0 + m - a.x) * 4;
    if (a.x > R.x1 - m) vx -= (a.x - R.x1 + m) * 4;
    if (a.z < R.z0 + m) vz += (R.z0 + m - a.z) * 4;
    if (a.z > R.z1 - m) vz -= (a.z - R.z1 + m) * 4;
    const av = this.avoid(n);
    a.drive(dt, vx + av.x * 0.4, vz + av.z * 0.4, map, { runAt: 2.0 });
  }

  r_bench(n, dt) {
    const a = n.a;
    n.st.t -= dt;
    const p = this.s.player;
    if (p && a.dist(p.x, p.z) < 2.6 && chance(dt * 0.8)) { a.faceToward(p.x, p.z); return; }
    if (n.st.t <= 0) {
      n.st.t = rand(2.5, 6);
      const roll = Math.random();
      const base = n.seat?.yaw ?? a.rig.targetFacing;
      if (roll < 0.35) { a.rig.face(base + rand(-0.6, 0.6)); this.s.later(1.5, () => a.rig.face(base)); }
      else if (roll < 0.55) a.rig.doEmote('nod', 0.8);
      else if (roll < 0.7) a.rig.talk(1.4);
    }
  }
  r_doorstep(n, dt) { this.r_bench(n, dt); }

  r_elder(n, dt) {
    this.r_bench(n, dt);
    n.st.peek = (n.st.peek ?? rand(6, 12)) - dt;
    if (n.st.peek <= 0) {
      n.st.peek = rand(8, 16);
      n.a.faceToward(TOWN.tunnel.cx, TOWN.northFace);
      this.s.later(2.2, () => n.a.rig.face(n.seat?.yaw ?? TOWN.benches[4].yaw));
    }
  }

  r_vendor(n, dt) {
    const s = this.s, a = n.a, p = s.player;
    a.drive(dt, 0, 0, s.map);
    n.st.t -= dt;
    const d = p ? a.dist(p.x, p.z) : 99;
    if (d < 3.5) a.faceToward(p.x, p.z);
    if (n.st.t <= 0) {
      n.st.t = rand(4, 9);
      if (d < 4.2 && !s.game.ui.bubbles.has(a.key)) s.say(a, pick(VENDOR_LINES[n.kind] || VENDOR_LINES.shrooms), { name: n.name, life: 3.2 });
      else if (d >= 3.5) { a.rig.face(n.home.yaw + rand(-0.8, 0.8)); if (chance(0.3)) a.rig.doEmote(pick(['nod', 'wave']), 0.9); }
    }
  }

  r_sleeper(n, dt) {
    n.st.t -= dt;
    if (n.st.t <= 0) {
      n.st.t = rand(3, 5);
      this.s.emote(n.a, 'Zz', { life: 2.2 });
      const p = this.s.player;
      if (p && n.a.dist(p.x, p.z) < 3.5) this.s.game.audio.play('snore', { gap: 3 });
    }
  }

  r_busker(n, dt) {
    const s = this.s, a = n.a, p = s.player;
    a.rig.play('idle');
    n.st.t -= dt;
    if (n.st.t <= 0) { n.st.t = rand(2.5, 4.5); s.emote(a, pick(['♪', '♫']), { life: 1.6 }); }
    const d = p ? a.dist(p.x, p.z) : 99;
    if (d < 7.5) {
      this.buskT -= dt;
      if (this.buskT <= 0) {
        const scale = [0, 2, 4, 7, 9, 12, 14, 16];
        const step = [0, 2, 4, 5, 4, 2, 3, 1, 0, 4, 5, 7, 5, 4, 2, 0];
        const note = 62 + scale[step[this.buskI++ % step.length] % scale.length];
        this.buskT = this.buskI % 4 === 0 ? 0.48 : 0.24;
        const vol = clamp(1 - d / 7.5, 0, 1) * 0.6;
        s.game.audio.tone({ f: midiToFreq(note), type: 'triangle', dur: 0.22, vol: 0.07 * vol, release: 0.2, filter: 'lowpass', ff: 2400, reverb: 0.25 });
        if (this.buskI % 2 === 0) s.game.audio.tone({ f: midiToFreq(note - 12), type: 'sine', dur: 0.3, vol: 0.05 * vol, release: 0.2 });
      }
    }
  }

  r_fisher(n, dt) {
    const s = this.s, a = n.a;
    n.st.t -= dt;
    const rod = n.rod;
    if (n.st.bite > 0) {
      n.st.bite -= dt;
      rod.rotation.x = -0.5 - Math.sin(n.st.bite * 18) * 0.15;
      if (n.st.bite <= 0) {
        rod.rotation.x = -0.9;
        const fy = a.rig.facing;
        const bx = a.x + Math.sin(fy) * 1.3, bz = a.z + Math.cos(fy) * 1.3;
        s.particles.burst(7, { x: bx, y: 0.5, z: bz, vy: 1.2, life: 0.5, size: 1.6, color: 0xd8f6ff, alpha: 0.9, alpha2: 0, grav: 5 }, { x: 0.1, z: 0.1, v: 0.6 });
        if (s.player && a.dist(s.player.x, s.player.z) < 7) s.game.audio.play('splash', { vol: 0.5 });
        if (chance(0.5)) {
          s.particles.spawn({ x: bx, y: 0.55, z: bz, vx: (a.x - bx) * 0.9, vz: (a.z - bz) * 0.9, vy: 2.2, grav: 6, life: 0.6, size: 3.5, color: 0xf0d8d8, alpha: 1, alpha2: 1 });
          s.later(0.5, () => { s.emote(a, '♥'); a.rig.setExpression('laugh', { hold: 2 }); });
        } else s.later(0.3, () => { s.emote(a, '?'); a.rig.setExpression(chance(0.5) ? 'sad' : 'angry', { hold: 2.2 }); });
        s.later(0.9, () => { rod.rotation.x = -0.5; });
      }
      return;
    }
    if (n.st.t <= 0) { n.st.t = rand(9, 16); n.st.bite = 0.9; s.emote(a, '!'); a.rig.setExpression('surprised', { hold: 1 }); }
  }

  r_sweeper(n, dt) {
    const s = this.s, a = n.a, st = n.st;
    if (st.mode === 'sweep') {
      a.drive(dt, 0, 0, s.map, { anim: false });
      a.rig.play('brush');
      st.t -= dt;
      st.puff = (st.puff ?? 0) - dt;
      if (st.puff <= 0) {
        st.puff = 0.45;
        const fy = a.rig.facing;
        s.particles.dustPuff(a.x + Math.sin(fy) * 0.45, 0.05, a.z + Math.cos(fy) * 0.45, 3, 0x8a6a4a);
      }
      if (st.t <= 0) {
        st.mode = 'step';
        let nz = a.z + st.dir * rand(1.2, 2.4);
        if (nz > st.z1 || nz < st.z0) { st.dir = -st.dir; nz = a.z + st.dir * 1.5; }
        st.goal = { x: rand(4.6, 6.2), z: nz };
        a.rig.play('idle');
      }
      return;
    }
    const g = st.goal;
    const dx = g.x - a.x, dz = g.z - a.z, d = Math.hypot(dx, dz);
    const av = this.avoid(n);
    if (d > 0.15) a.drive(dt, (dx / d) * 0.8 + av.x, (dz / d) * 0.8 + av.z, s.map);
    if (d <= 0.15 || (a.speedNow < 0.05 && st.t < -2)) { st.mode = 'sweep'; st.t = rand(2, 4); a.rig.face(st.dir > 0 ? 0 : Math.PI); }
    st.t -= dt;
  }

  r_miner(n, dt) {
    const s = this.s, a = n.a, st = n.st;
    const pile = TOWN.orePile, lift = TOWN.lift.front;
    const avoid = this.avoid(n);
    if (st.mode === 'toPile') {
      if (!a.path && !this.walkTo(n, pile.x + 0.9, pile.z + 0.9)) { st.mode = 'rest'; st.t = rand(2, 4); return; }
      const r = a.followPath(dt, s.map, n.speed, { avoid });
      if (r !== 'moving') { st.mode = 'load'; st.t = rand(1.2, 2.2); a.faceToward(pile.x, pile.z); }
      return;
    }
    if (st.mode === 'load') {
      a.drive(dt, 0, 0, s.map, { anim: false });
      a.rig.play('dig');
      st.t -= dt;
      if (st.t <= 0) { a.rig.holdItem(n.crate, 'R'); n.crate.position.set(-0.17, -0.05, 0.1); st.mode = 'toLift'; a.setPath(null); }
      return;
    }
    if (st.mode === 'toLift') {
      if (!a.path && !this.walkTo(n, lift.x - 0.8 + (n.spec.seed % 2) * 1.6, lift.z + 0.8)) { st.mode = 'drop'; st.t = 0.5; return; }
      const r = a.followPath(dt, s.map, n.speed * 0.85, { avoid, walkAnim: 'carry', idleAnim: 'carry' });
      a.rig.play('carry');
      if (a.speedNow > 0.2) { const r2 = a.rig; r2.legL.rotation.x = Math.sin(r2.t * 9) * 0.5; r2.legR.rotation.x = -Math.sin(r2.t * 9) * 0.5; }
      if (r !== 'moving') { st.mode = 'drop'; st.t = 0.8; a.faceToward(TOWN.lift.cage.x, TOWN.lift.cage.z); }
      return;
    }
    if (st.mode === 'drop') {
      a.drive(dt, 0, 0, s.map, { anim: false });
      st.t -= dt;
      if (st.t <= 0) {
        a.rig.holdItem(null);
        a.rig.play('idle');
        if (s.player && a.dist(s.player.x, s.player.z) < 7) s.game.audio.play('clunk', { vol: 0.5 });
        a.rig.setExpression(chance(0.5) ? 'happy' : 'sleepy', { hold: 2 });
        s.particles.dustPuff(a.x + Math.sin(a.rig.facing) * 0.5, 0.2, a.z + Math.cos(a.rig.facing) * 0.5, 5);
        st.mode = chance(0.3) ? 'rest' : 'toPile';
        st.t = rand(2, 4);
        a.setPath(null);
      }
      return;
    }
    if (st.mode === 'rest') { this.idleFidget(n, dt); st.t -= dt; if (st.t <= 0) st.mode = 'toPile'; }
  }

  r_gossip(n, dt) {
    const s = this.s, a = n.a, m = n.mate;
    a.drive(dt, 0, 0, s.map);
    if (!n.speaker) return;
    n.st.t -= dt;
    if (n.st.t <= 0) {
      n.st.t = rand(1.6, 3.4);
      const talker = chance(0.5) ? n : m;
      const listener = talker === n ? m : n;
      talker.a.rig.talk(rand(1, 2));
      talker.a.rig.setExpression(pick(['happy', 'smug', 'worried', 'surprised', 'neutral', 'thinking']), { hold: rand(1.4, 2.6) });
      listener.a.rig.setExpression(pick(['surprised', 'happy', 'thinking', 'worried', 'laugh']), { hold: rand(1.2, 2.2), body: chance(0.6) });
      const p = s.player;
      const near = p && a.dist(p.x, p.z) < 4.5;
      if (near) s.game.audio.play('babble', { pitch: talker.a.voice, n: 3 });
      const r = Math.random();
      if (r < 0.12) { talker.a.rig.play('laugh'); s.later(1.1, () => talker.a.rig.play('idle')); if (near) s.game.audio.play('laugh', { pitch: talker.a.voice }); }
      else if (r < 0.2) s.emote(talker.a, pick(['!', '?', '♥', '…']));
      else if (r < 0.28) talker.a.rig.doEmote(pick(['nod', 'shake']), 0.9);
    }
  }
}
