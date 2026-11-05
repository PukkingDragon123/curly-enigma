// SFX presets, ambience loops and music for the whole game, all from recorded files (src/audio,
// credits in CREDITS-AUDIO.md). A preset picks a variant of a few recordings, with a little random
// pitch so repeats don't sound copied. Every name is locked: later define() calls for the same
// name (enemies/sfx.js, the forest, the skill tree) keep these recordings instead.
const R = (a, b) => a + Math.random() * (b - a);

export function registerSounds(au) {
  const d = (name, fn, gap) => au.define(name, fn, gap, true);
  const loop = (name, fn) => au.defineLoop(name, fn, true);
  /** A preset playing one of `ids`; base: vol, pitch, jit, reverb, dur, a, rate. Honours o.vol, o.pitch, o.pan, o.delay. */
  const S = (ids, base = {}) => (a, o = {}) => a.sample(ids, {
    ...base, vol: (base.vol ?? 1) * (o.vol ?? 1), pitch: (base.pitch ?? 1) * (o.pitch || 1),
    pan: o.pan ?? base.pan, delay: (base.delay || 0) + (o.delay || 0), reverb: o.reverb ?? base.reverb,
  });
  const L = (...layers) => (a, o = {}) => { for (const l of layers) l(a, o); };
  const at = (dt, fn) => (a, o = {}) => fn(a, { ...o, delay: (o.delay || 0) + dt });
  const by = (key, table, fallback) => (a, o = {}) => (table[o[key]] || table[fallback])(a, o);

  // ---------- UI ----------
  d('ui_click', S(['ui_click1', 'ui_click2', 'ui_click3'], { vol: 0.42 }));
  d('ui_hover', S(['ui_hover1', 'ui_hover2'], { vol: 0.14 }), 0.03);
  d('ui_open', S(['ui_open1', 'ui_open2'], { vol: 0.42 }));
  d('ui_close', S(['ui_close1', 'ui_close2'], { vol: 0.38 }));
  d('ui_error', S(['ui_err1', 'ui_err2'], { vol: 0.38 }));
  d('ui_buy', L(S(['buy1', 'buy2'], { vol: 0.5 }), at(0.06, S('toast', { vol: 0.2, jit: 0 }))));
  d('coins', (a, o = {}) => {
    const n = o.n || 4;
    a.sample(n <= 2 ? 'coins_s' : n <= 4 ? 'coins_m' : n <= 6 ? 'coins_l' : 'coins_xl', { vol: 0.45 * (o.vol ?? 1), pan: o.pan, delay: o.delay });
  }, 0.08);
  d('discover', S('j_discover', { vol: 0.5, jit: 0 }), 0.3);
  d('page', S(['page1', 'page2', 'page3', 'page4'], { vol: 0.45 }));
  d('toast', S('toast', { vol: 0.28 }));
  d('levelup', S('j_levelup', { vol: 0.55, jit: 0 }), 0.4);

  // ---------- movement ----------
  const STEP = {
    dirt: ['step_dirt1', 'step_dirt2', 'step_dirt3', 'step_dirt4'],
    stone: ['step_stone1', 'step_stone2', 'step_stone3', 'step_stone4'],
    wood: ['step_wood1', 'step_wood2', 'step_wood3'],
    sand: ['step_sand1', 'step_sand2', 'step_sand3'],
    water: ['step_wet1', 'step_wet2', 'step_wet3'],
  };
  d('step', (a, o = {}) => a.sample(STEP[o.mat] || STEP.dirt, { vol: 0.3 * (o.vol ?? 1), jit: 0.06, pan: o.pan }), 0.06);
  d('jump', S(['jump1', 'jump2'], { vol: 0.25 }));
  d('land', (a, o = {}) => (o.hard ? a.sample('land_hard', { vol: 0.6 * (o.vol ?? 1) }) : a.sample(['land1', 'land2'], { vol: 0.45 * (o.vol ?? 1) })), 0.08);
  d('climb', S(['climb1', 'climb2'], { vol: 0.25, jit: 0.08 }), 0.12);
  d('swim', S(['swim1', 'swim2'], { vol: 0.3 }), 0.25);
  d('splash', S(['splash1', 'splash2', 'splash3'], { vol: 0.55 }), 0.15);

  // ---------- mining hits ----------
  const HIT = {
    dirt: S(['hit_dirt1', 'hit_dirt2', 'hit_dirt3'], { vol: 0.55, jit: 0.07 }),
    sand: S(['hit_sand1', 'hit_sand2'], { vol: 0.45, jit: 0.07 }),
    clay: S(['hit_clay1', 'hit_clay2'], { vol: 0.5, jit: 0.07 }),
    stone: S(['hit_stone1', 'hit_stone2', 'hit_stone3', 'hit_stone4'], { vol: 0.55, jit: 0.06 }),
    hard: S(['hit_hard1', 'hit_hard2'], { vol: 0.5, jit: 0.05 }),
    crystal: S(['hit_crystal1', 'hit_crystal2'], { vol: 0.45, jit: 0.08, reverb: 0.3 }),
    metal: S(['hit_metal1', 'hit_metal2'], { vol: 0.45, jit: 0.05, reverb: 0.2 }),
    wood: S(['hit_wood1', 'hit_wood2'], { vol: 0.5, jit: 0.06 }),
    ice: S(['hit_ice1', 'hit_crystal2'], { vol: 0.42, jit: 0.08, pitch: 1.1 }),
    flesh: S(['hit_flesh1', 'thwack1'], { vol: 0.5, jit: 0.06 }),
  };
  d('hit', by('snd', HIT, 'stone'), 0.03);
  const BRK = {
    dirt: S(['brk_dirt1', 'brk_dirt2'], { vol: 0.6 }),
    sand: S('brk_sand', { vol: 0.5 }),
    clay: S('brk_clay', { vol: 0.55 }),
    stone: S(['brk_stone1', 'brk_stone2', 'brk_stone3'], { vol: 0.65 }),
    hard: S(['brk_hard', 'brk_stone1'], { vol: 0.65 }),
    crystal: S(['brk_crystal1', 'brk_crystal2'], { vol: 0.5, reverb: 0.3 }),
    metal: L(S(['brk_stone2', 'brk_stone3'], { vol: 0.5 }), S('brk_metal', { vol: 0.45 })),
    wood: S(['brk_wood1', 'brk_wood2'], { vol: 0.55 }),
    ice: S(['brk_ice', 'brk_crystal1'], { vol: 0.5, reverb: 0.25 }),
    flesh: HIT.flesh,
  };
  d('break', by('snd', BRK, 'stone'), 0.04);

  d('chisel', S(['chisel1', 'chisel2', 'chisel3'], { vol: 0.35, jit: 0.06 }), 0.05);
  d('brush', S(['brush1', 'brush2', 'brush3'], { vol: 0.3, jit: 0.08 }), 0.09);
  d('debris', S(['debris1', 'debris2', 'debris3'], { vol: 0.16, jit: 0.12 }), 0.025);
  d('ore_damage', L(S('ore_dmg', { vol: 0.35 }), S(['debris1', 'debris2'], { vol: 0.2 })), 0.06);
  d('ore_free', L(S('ore_free', { vol: 0.5 }), at(0.06, S('chime1', { vol: 0.25, reverb: 0.4 }))), 0.1);
  d('pristine', S(['chime2', 'chime3'], { vol: 0.35, reverb: 0.5 }), 0.2);
  d('pickup', S(['pickup1', 'pickup2'], { vol: 0.35 }), 0.04);
  d('pickup_gem', S(['gem1', 'gem2', 'gem3'], { vol: 0.45, reverb: 0.3 }), 0.05);
  d('creak', S(['creak1', 'creak2', 'creak3'], { vol: 0.4 }), 0.4);
  d('trickle', S(['trickle1', 'trickle2'], { vol: 0.28, jit: 0.1 }), 0.2);
  d('collapse', S('collapse', { vol: 0.8 }), 0.15);
  d('thud', S(['thud1', 'thud2', 'thud3'], { vol: 0.62 }), 0.05);
  d('explode', S(['explode1', 'explode2', 'explode3'], { vol: 0.9, jit: 0.06, reverb: 0.3 }), 0.1);
  d('zap', S(['zap1', 'zap2'], { vol: 0.42 }), 0.07);
  d('sizzle', S(['sizzle1', 'sizzle2'], { vol: 0.35 }), 0.1);
  d('steam', S(['steam1', 'steam2'], { vol: 0.4 }), 0.15);
  d('bubble', S(['bubble1', 'bubble2', 'bubble3'], { vol: 0.3, jit: 0.12 }), 0.04);
  d('drip', S(['drip1', 'drip2', 'drip3', 'drip4'], { vol: 0.32, jit: 0.1, reverb: 0.6 }), 0.08);
  d('bloop', S(['bloop1', 'bloop2'], { vol: 0.45, jit: 0.1 }), 0.1);
  d('freeze', S('freeze', { vol: 0.4 }), 0.2);
  d('ignite', S(['ignite1', 'ignite2'], { vol: 0.5 }), 0.15);
  d('glow', S('magic1', { vol: 0.25, pitch: 1.2, reverb: 0.5 }), 0.3);
  d('xray_on', S('magic2', { vol: 0.35, reverb: 0.3 }));
  d('drill_start', S('drill_start', { vol: 0.35 }));
  d('overheat', L(S('overheat', { vol: 0.4 }), S('ui_err1', { vol: 0.25 })), 0.4);

  // ---------- creatures / chars ----------
  d('hurt', S(['hurt1', 'hurt2', 'hurt3'], { vol: 0.5 }), 0.2);
  d('faint', S('j_faint', { vol: 0.5, jit: 0 }), 1);
  d('eat', S(['eat1', 'eat2', 'eat3'], { vol: 0.5 }), 0.3);
  d('gulp', S(['gulp1', 'gulp2'], { vol: 0.5 }), 0.15);
  d('squeak', S(['squeak1', 'squeak2', 'squeak3'], { vol: 0.35, jit: 0.08 }), 0.15);
  d('chirp', S(['chirp1', 'chirp2'], { vol: 0.28 }), 0.3);
  d('click', S(['latch1', 'latch2'], { vol: 0.38 }), 0.1);
  d('slurp', S(['slurp1', 'slurp2'], { vol: 0.4 }), 0.4);
  d('buzz', S('buzz', { vol: 0.25 }), 0.4);
  d('hiss', S(['hiss1', 'hiss2'], { vol: 0.3 }), 0.3);
  d('wisp', S('wisp', { vol: 0.3, reverb: 0.7 }), 0.5);
  d('cluck', (a, o = {}) => {
    const n = o.n || (1 + ((Math.random() * 3) | 0));
    for (let i = 0; i < n; i++) a.sample(['cluck1', 'cluck2', 'cluck3', 'cluck4'], { vol: 0.4 * (o.vol ?? 1), pitch: o.pitch || 1, jit: 0.06, delay: (o.delay || 0) + i * 0.12, pan: o.pan });
  }, 0.25);
  d('bawk', S('bawk', { vol: 0.5 }), 0.4);
  // gibberish talk: recorded syllables at the speaker's pitch (o.pitch is the old base frequency)
  d('babble', (a, o = {}) => {
    const n = Math.max(2, Math.min(10, o.n || 5));
    const rate = Math.max(0.55, Math.min(2.2, (o.pitch || 300) / 330));
    let t = o.delay || 0;
    for (let i = 0; i < n; i++) {
      a.sample(['syl1', 'syl2', 'syl3', 'syl4', 'syl5', 'syl6'], { vol: 0.32 * (o.vol ?? 1), rate, jit: 0.12, delay: t, dur: R(0.07, 0.12), release: 0.04, pan: o.pan });
      t += R(0.07, 0.1);
    }
  }, 0.15);
  d('laugh', (a, o = {}) => a.sample('laugh', { vol: 0.45 * (o.vol ?? 1), rate: Math.max(0.6, Math.min(1.8, (o.pitch || 400) / 400)), pan: o.pan }), 0.5);
  d('sneeze', S(['sneeze1', 'sneeze2'], { vol: 0.5 }), 0.5);
  d('yawn', S('yawn', { vol: 0.45 }), 1);
  d('snore', S(['snore1', 'snore2'], { vol: 0.35 }), 1);
  const EMOTE = {
    love: S('chime1', { vol: 0.28, pitch: 1.15, reverb: 0.3 }),
    alert: S('toast', { vol: 0.32, pitch: 1.3 }),
    question: S('cute1', { vol: 0.3 }),
    angry: S('grumble', { vol: 0.35 }),
    other: S('toast', { vol: 0.22 }),
  };
  d('emote', by('kind', EMOTE, 'other'), 0.12);

  // ---------- forge ----------
  d('clang', S(['anvil1', 'anvil2', 'anvil3', 'anvil4'], { vol: 0.55, jit: 0.04, reverb: 0.2 }), 0.05);
  d('clunk', S(['clunk1', 'clunk2'], { vol: 0.45 }), 0.05);
  d('bellows', S(['bellows1', 'bellows2'], { vol: 0.5, jit: 0.06 }), 0.15);
  d('quench', L(S('quench', { vol: 0.55 }), S('splash1', { vol: 0.25 })), 0.4);
  d('crack', S(['crack1', 'crack2', 'crack3'], { vol: 0.5 }), 0.15);
  d('sparkle', S(['sparkle1', 'sparkle2'], { vol: 0.25, jit: 0.1, reverb: 0.3 }), 0.1);
  d('whoosh', S(['whoosh1', 'whoosh2', 'whoosh3'], { vol: 0.35, jit: 0.08 }), 0.08);
  d('success', S('j_success', { vol: 0.5, jit: 0 }), 0.5);
  d('fail', S('j_fail', { vol: 0.45, jit: 0 }), 0.5);

  // ---------- cooking ----------
  d('chop', S(['chop1', 'chop2', 'chop3'], { vol: 0.5, jit: 0.06 }), 0.04);
  d('crack_egg', L(S('egg', { vol: 0.45 }), at(0.07, S('slurp2', { vol: 0.2 }))), 0.1);
  d('stir', S(['stir1', 'stir2'], { vol: 0.3 }), 0.12);
  d('pour', S('pour', { vol: 0.4 }), 0.3);
  d('ding', S('ding', { vol: 0.45, jit: 0 }), 0.3);
  d('perfect', S('j_perfect', { vol: 0.5, jit: 0 }), 0.3);
  d('good', S('j_good', { vol: 0.45, jit: 0 }), 0.3);
  d('oops', S('j_oops', { vol: 0.45, jit: 0 }), 0.3);
  d('plate', S(['plate1', 'plate2', 'plate3'], { vol: 0.4 }), 0.2);
  d('shake', S(['shake1', 'shake2'], { vol: 0.35 }), 0.1);
  d('squish', S(['squish1', 'squish2'], { vol: 0.4 }), 0.05);
  d('flip', S(['whoosh1', 'whoosh3'], { vol: 0.3, pitch: 1.1 }), 0.1);

  // ---------- world ----------
  d('door', S(['door1', 'door2', 'door3'], { vol: 0.45 }), 0.2);
  d('bell', S('bell', { vol: 0.45, jit: 0, reverb: 0.4 }), 0.3);
  d('gate', S(['gate1', 'gate2'], { vol: 0.45 }), 0.2);
  d('place', S(['place1', 'place2', 'place3'], { vol: 0.45 }), 0.05);
  d('remove', S(['remove1', 'remove2'], { vol: 0.4 }), 0.05);
  d('seagull', S(['seagull1', 'seagull2'], { vol: 0.3 }), 1);
  d('firework', S(['firework1', 'firework2'], { vol: 0.55, jit: 0.06 }), 0.2);
  d('fanfare', S('j_fanfare', { vol: 0.55, jit: 0 }), 1);
  d('rumble_hit', S(['rumble_hit1', 'rumble_hit2'], { vol: 0.65 }), 0.3);

  // ---------- creatures and combat (names used by deep/enemies) ----------
  d('golem_roar', S(['troll1', 'troll2'], { vol: 0.65 }), 0.35);
  d('crystal_ring', S(['chime2', 'chime1', 'n_glass'], { vol: 0.35, reverb: 0.6, jit: 0.06 }), 0.04);
  d('golem_crumble', L(S('crumble', { vol: 0.65 }), S('collapse', { vol: 0.35 })), 0.3);
  d('block', (a, o = {}) => a.sample(o.heavy ? 'block_heavy' : ['block1', 'block2', 'block3'], { vol: 0.65 * (o.vol ?? 1), pan: o.pan }), 0.05);
  d('parry', S(['parry1', 'parry2'], { vol: 0.6, reverb: 0.35 }), 0.08);
  d('thwack', S(['thwack1', 'thwack2'], { vol: 0.6 }), 0.03);
  d('smash', S(['smash1', 'smash2'], { vol: 0.7 }), 0.06);
  d('tell', S('n_ping', { vol: 0.28, pitch: 0.75, jit: 0, reverb: 0.4 }), 0.12);
  d('tell_heavy', S('tell_heavy', { vol: 0.45 }), 0.2);
  d('stomp', S(['stomp1', 'stomp2'], { vol: 0.7 }), 0.08);
  d('growl', S(['growl1', 'growl2', 'growl3'], { vol: 0.5 }), 0.4);
  d('roar_big', S(['roar1', 'roar2', 'roar3'], { vol: 0.75, reverb: 0.4 }), 1);
  d('screech', S(['screech1', 'screech2'], { vol: 0.45 }), 0.25);
  d('bark', (a, o = {}) => {
    for (let i = 0; i < ((o.n || 2) > 2 ? 2 : 1); i++) a.sample(['bark1', 'bark2'], { vol: 0.45 * (o.vol ?? 1), pitch: o.pitch || 1, pan: o.pan, delay: i * 0.3 });
  }, 0.15);
  d('chitter', S(['chitter1', 'chitter2', 'chitter3'], { vol: 0.35 }), 0.2);
  d('spider_hiss', S(['hiss1', 'hiss2'], { vol: 0.35, pitch: 0.85 }), 0.4);
  d('wail', S('wail', { vol: 0.45, reverb: 0.8 }), 1.2);
  d('whisper', S(['whisper1', 'whisper2'], { vol: 0.3, reverb: 0.7 }), 0.8);
  d('blorp', S(['blorp1', 'blorp2', 'blorp3'], { vol: 0.4 }), 0.06);
  d('splat', S(['splat1', 'splat2'], { vol: 0.55 }), 0.05);
  d('snarl', S(['snarl1', 'snarl2'], { vol: 0.5 }), 0.35);
  d('inhale', S('inhale', { vol: 0.4 }), 0.5);
  d('fire_breath', (a, o = {}) => a.sample(['firebreath1', 'firebreath2'], { vol: 0.65 * (o.vol ?? 1), pan: o.pan, dur: o.dur }), 0.5);
  d('grunt', S(['grunt1', 'grunt2', 'grunt3'], { vol: 0.5 }), 0.25);
  d('yip', S(['yip', 'cute1'], { vol: 0.4 }), 0.1);
  d('chomp', S(['chomp1', 'chomp2'], { vol: 0.5 }), 0.3);
  d('crunch', S(['eat1', 'eat2'], { vol: 0.45 }), 0.2);
  d('flap', S(['flap1', 'flap2'], { vol: 0.4, jit: 0.08 }), 0.12);
  d('web_shot', S('spit', { vol: 0.4 }), 0.15);
  d('web_tear', S(['tear1', 'tear2'], { vol: 0.4 }), 0.1);
  d('big_snore', S(['snore1', 'snore2'], { vol: 0.45, pitch: 0.8 }), 1.5);

  // ---------- the forest (names used by bookends/forest) ----------
  const SONG = { trill: ['bird1', 'bird6'], robin: ['bird2', 'bird5'], cuckoo: ['bird3'], dove: ['bird6'], wren: ['bird4', 'bird2'] };
  d('forest_song', (a, o = {}) => {
    const kind = SONG[o.kind] ? o.kind : 'trill';
    a.sample(SONG[kind], { vol: (o.vol ?? 0.03) * 9, pitch: (o.pitch || 1) * (kind === 'dove' ? 0.7 : kind === 'wren' ? 1.2 : 1), pan: o.pan || 0, reverb: 0.35, jit: 0.05 });
  }, 0.05);
  d('forest_squirrel', S(['cute2', 'squeak3'], { vol: 0.25, pitch: 1.4 }));
  d('forest_flutter', (a, o = {}) => a.sample(['flap1', 'flap2'], { vol: (o.vol ?? 0.06) * 5, pitch: 1.5, pan: o.pan || 0 }));
  d('forest_flock', (a) => {
    for (let i = 0; i < 6; i++) a.sample(['flap1', 'flap2'], { vol: R(0.15, 0.3), pitch: R(1.3, 1.8), delay: R(0, 1.0), pan: R(-0.8, 0.8) });
    for (let i = 0; i < 2; i++) a.sample(['bird2', 'bird4', 'bird5'], { vol: 0.15, delay: R(0, 0.8), pan: R(-0.7, 0.7), reverb: 0.4 });
  }, 0.5);
  d('forest_woodpecker', (a, o = {}) => {
    const n = 9 + ((Math.random() * 5) | 0);
    for (let i = 0; i < n; i++) a.sample('knock', { vol: (o.vol ?? 0.07) * 5 * (1 - (i / n) * 0.6), pitch: 1.6, jit: 0.03, delay: i * 0.052, pan: o.pan || 0.3, reverb: 0.5 });
  }, 0.6);
  d('forest_frog', S(['frog1', 'frog2'], { vol: 0.35 }), 0.4);
  d('forest_deer', (a) => {
    a.sample(['rustle1', 'rustle2'], { vol: 0.3 });
    for (let i = 0; i < 6; i++) a.sample(STEP.dirt, { vol: 0.28 * (1 - i * 0.12), pitch: 0.8, delay: 0.25 + i * 0.16 });
  }, 1);
  d('forest_snap', (a, o = {}) => a.sample(['snap1', 'snap2'], { vol: (o.vol ?? 0.3) * 1.8 }), 0.04);
  d('forest_groan', (a, o = {}) => a.sample('tree_groan', { vol: (o.vol ?? 0.05) * 9, pitch: o.pitch || 1, reverb: 0.4 }), 0.3);
  d('forest_chest', S('chest', { vol: 0.4 }));
  d('forest_chord', (a, o = {}) => {
    const v = (o.vol ?? 0.05) * 8;
    a.sample('chime3', { vol: v, reverb: 0.7, jit: 0 });
    a.sample(['sparkle1', 'sparkle2'], { vol: v * 0.6, delay: 0.3, reverb: 0.6 });
    a.sample(['sparkle1', 'sparkle2'], { vol: v * 0.5, delay: 0.65, pitch: 1.2, reverb: 0.6 });
  }, 0.8);

  // ---------- the skill tree (names used by ui/SkillTree) ----------
  d('sk_stamp', L(S('book_close', { vol: 0.55 }), at(0.14, S('n_ping', { vol: 0.16, pitch: 0.8, jit: 0, reverb: 0.4 }))), 0.08);
  d('sk_ink', S(['brush1', 'brush2'], { vol: 0.25, pitch: 1.25 }), 0.1);
  d('sk_pick', S(['ui_click2', 'ui_click3'], { vol: 0.38 }), 0.04);
  d('sk_level', L(S('j_levelup', { vol: 0.5, jit: 0 }), at(0.33, S('book_close', { vol: 0.35 }))), 0.5);
  d('sk_xp', S('tick1', { vol: 0.18, jit: 0.08 }), 0.25);
  d('sk_scrape', S(['brush1', 'brush2', 'brush3'], { vol: 0.3, pitch: 0.8 }), 0.3);
  d('sk_points', S('j_points', { vol: 0.45, jit: 0 }), 0.3);

  // ---------- loops ----------
  /** Recorded one-shots dropped into a loop's output every [min, max] seconds. */
  const sprinkle = (a, out, ids, min, max, vol, extra = {}) => {
    let alive = true;
    const tick = () => {
      if (!alive || !a.ctx) return;
      a.sample(ids, { vol: vol * R(0.6, 1), bus: out, jit: 0.1, ...extra });
      setTimeout(tick, R(min, max) * 1000);
    };
    setTimeout(tick, R(min, max) * 500);
    return () => { alive = false; };
  };
  loop('drill', (a, out) => {
    const b = a.bed(out, 'lp_drill', { vol: 0.9, ff: 3500 });
    return {
      set(p) {
        if (p.load === undefined) return;
        b.setRate(0.85 + p.load * 0.35);
        b.filter.frequency.setTargetAtTime(2500 + p.load * 5000, a.ctx.currentTime, 0.05);
      },
      stop: b.stop,
    };
  });
  const fireLoop = (rate, vol, roar) => (a, out, p) => {
    const b = a.bed(out, 'lp_fire', { rate, vol, ff: 6000 });
    const r = roar ? a.bed(out, 'lp_wind', { rate: 0.5, vol: roar, ff: 320 }) : null;
    return {
      set(q) { if (q.intensity !== undefined) b.filter.frequency.setTargetAtTime(2500 + 6000 * Math.min(1, q.intensity), a.ctx.currentTime, 0.1); },
      stop() { b.stop(); r?.stop(); },
    };
  };
  loop('fire', fireLoop(1, 0.9, 0));
  loop('forge_fire', fireLoop(0.8, 1, 0.35));
  loop('rumble', (a, out) => a.bed(out, 'lp_wind', { rate: 0.5, vol: 1.3, ff: 240 }));
  loop('xray', (a, out) => a.bed(out, 'lp_xray', { vol: 0.5 }));
  loop('water', (a, out) => {
    const b = a.bed(out, 'lp_water', { vol: 0.8 });
    const s = sprinkle(a, out, ['bubble1', 'bubble2', 'bubble3'], 0.4, 1.6, 0.25);
    return { stop() { s(); b.stop(); } };
  });
  loop('lava', (a, out) => {
    const b = a.bed(out, 'lp_lava', { vol: 0.9 });
    const s = sprinkle(a, out, ['bloop1', 'bloop2'], 0.5, 1.6, 0.4);
    return { stop() { s(); b.stop(); } };
  });
  loop('sizzle', (a, out) => a.bed(out, 'lp_sizzle', { vol: 0.8 }));
  loop('boil', (a, out) => a.bed(out, 'lp_boil', { vol: 0.9 }));
  loop('wind', (a, out) => a.bed(out, 'lp_wind', { vol: 0.8, ff: 3000 }));
  loop('waves', (a, out) => a.bed(out, 'lp_waves', { vol: 0.9 }));
  loop('elevator', (a, out) => {
    const w = a.bed(out, 'lp_winch', { vol: 0.7 });
    const r = a.bed(out, 'lp_wind', { rate: 0.5, vol: 0.35, ff: 300 });
    const s = sprinkle(a, out, ['creak1', 'creak3', 'latch2'], 0.8, 2.4, 0.2);
    return { stop() { s(); w.stop(); r.stop(); } };
  });
  loop('grind', (a, out) => a.bed(out, 'lp_grind', { vol: 0.8 }));
  loop('hum', (a, out, p) => a.bed(out, 'lp_hum', { rate: Math.max(0.5, Math.min(2.5, (p.f || 110) / 110)), vol: 0.7 }));
  loop('forest_leaves', (a, out) => {
    const b = a.bed(out, 'lp_wind', { vol: 0.35, filter: 'highpass', ff: 700 });
    let alive = true;
    const gust = () => {
      if (!alive || !a.ctx) return;
      b.gain.gain.setTargetAtTime(R(0.15, 0.55), a.ctx.currentTime, 1.0);
      setTimeout(gust, R(1400, 4200));
    };
    gust();
    const s = sprinkle(a, out, ['rustle1', 'rustle2', 'rustle3'], 1.4, 4.2, 0.3);
    return { stop() { alive = false; s(); b.stop(); } };
  });
  loop('forest_brook', (a, out) => {
    const b = a.bed(out, 'lp_water', { vol: 0.85 });
    const s = sprinkle(a, out, ['bubble2', 'drip1', 'drip3'], 0.5, 1.8, 0.12);
    return { stop() { s(); b.stop(); } };
  });
  // music: recorded tracks m_<name> (src/audio/music), played by AudioSys.playMusic
}
