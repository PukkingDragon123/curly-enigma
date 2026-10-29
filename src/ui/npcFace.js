// Faces for quest givers: head-and-shoulders renders of their real 3D character (renderPortrait,
// the same rig the town builds), cached per npc and expression. Deep Town's folk are rebuilt from
// their seed and look (src/data/villagers.js), keepers and burrow folk from SHOPS[id].keeper.
// Old Star and Rocco have their own rigs: until a live 3D portrait renderer exists for them they
// fall back to the book's ink sketch (BART.giver).
//   npcFace(game, npc, { size, expression }) → data URL
//   npcSpec(npc) → character spec | null
//   npcWho(npc) → who for the live 3D portraits (src/gfx/portrait3d.js): a shop id, 'oldstar',
//     'rocco', or { spec, name, backdrop } for Deep Town's folk
import { renderPortrait, randomSpec } from '../gfx/characters.js';
import { VILLAGERS } from '../data/villagers.js';
import { SHOPS } from '../data/shops.js';
import { NPC_ALIAS } from '../data/quests.js';
import { BART } from './bookArt.js';

const P3D = Object.values(import.meta.glob('../gfx/portrait3d.js', { eager: true }))[0]?.portrait3d || null;
const cache = new Map();
const KEEPER_BASE = { seed: 9, eyes: 'bead', dirt: 0.2, blush: true };
/** The town keepers' grown-up extras (as TownScene builds them). */
const KEEPER_LOOKS = {
  tools: { belt: 2, shirt: 0x9a3a32, rolled: true, boots: 0x4a2e1e, brows: 'bushy', dirt: 0.5 },
  grocer: { shirt: 0x6a8ab0, rolled: true, belt: 0, boots: false },
  furniture: { shirt: 0xd8ccb0, belt: 0, boots: 0x6a4a2a, rolled: true },
  blueprints: { belt: 0, boots: 0x3a2a22 },
  outfitter: { belt: 1, boots: 0x7a5232 },
  assay: { belt: 0, boots: 0x3a2a22, brows: 'bushy' },
  ticket: { belt: 0, boots: 0x1e1618 },
  lift: { shirt: 0xb84a3a, rolled: true, belt: 2, boots: 0x5a3a24 },
};
const OWN_RIG = new Set(['oldstar', 'rocco']);

export function npcSpec(npc) {
  npc = NPC_ALIAS[npc] || npc;
  if (OWN_RIG.has(npc)) return null;
  const v = VILLAGERS[npc];
  if (v?.seed) return randomSpec(v.seed, v.look || {});
  if (v?.look) return { ...KEEPER_BASE, ...KEEPER_LOOKS[npc], ...v.look };
  const id = v?.keeper || npc, k = SHOPS[id]?.keeper;
  if (k) return SHOPS[id].panel === 'burrow' ? { ...k } : { ...KEEPER_BASE, ...KEEPER_LOOKS[id], ...k, hat: k.hat || 'none', glasses: k.glasses || false };
  return null;
}

export function npcWho(npc) {
  npc = NPC_ALIAS[npc] || npc;
  if (OWN_RIG.has(npc) || SHOPS[npc]?.keeper) return npc;
  const v = VILLAGERS[npc];
  const spec = npcSpec(npc);
  return spec ? { spec, name: v?.name || npc, backdrop: 'town' } : npc;
}

export function npcFace(game, npc, { size = 72, expression = 'happy' } = {}) {
  npc = NPC_ALIAS[npc] || npc;
  const key = npc + ':' + size + ':' + expression;
  if (cache.has(key)) return cache.get(key);
  const mood = { happy: 'happy', thinking: 'calm', smug: 'proud', sleepy: 'calm' }[expression] || 'calm';
  const spec = npcSpec(npc);
  const r = game?.engine?.renderer;
  // their own rigs (Old Star, Rocco): the live portrait renderer's still, once it has made one
  if (!spec) {
    let url = '';
    try { url = P3D?.stillURL?.(npcWho(npc), mood, size) || ''; } catch (e) { url = ''; }
    if (url) cache.set(key, url);
    return url || BART.giver(npc);
  }
  let url = null;
  if (r) {
    // the live portraits read back through a pixel-pack buffer: step round it for this one read
    const gl = r.getContext?.();
    const PACK = gl?.PIXEL_PACK_BUFFER;
    const prev = PACK ? gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) : null;
    if (prev) gl.bindBuffer(PACK, null);
    try { url = renderPortrait(r, spec, size, { expression }).toDataURL(); } catch (e) { console.warn('portrait', npc, e); }
    finally { if (prev) gl.bindBuffer(PACK, prev); }
  }
  url ||= BART.giver(npc);
  cache.set(key, url);
  return url;
}

/** Is the face for this npc ready (not the stand-in sketch)? */
export const faceReady = (npc, size = 72, expression = 'happy') => cache.has((NPC_ALIAS[npc] || npc) + ':' + size + ':' + expression);
