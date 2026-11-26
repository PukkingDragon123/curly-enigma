// Backpack pieces that are not item icons, hand-drawn as pixel maps (src/ui/handKit.js legend):
//   sewn    a pocket sewn shut (until a bigger bag): the flap stitched down with a zigzag of heavy
//           thread, a cross-stitch in the pocket. 9-slice 5 3 3.
//   trunk   a slot in the trunk at home: dark oak with brass corners (on: lit). 9-slice 4.
//   toss    the toss pit: a hole dug in the dirt, crumbs round the rim (open: a glint inside).
//   brush   the tidy brush; weight the spring balance by the weight readout.
// installInvArt(node) publishes the slices as --inv-* custom properties.
import { art, cssUrl } from './uiArt.js';
import { mapPx, kitPx, tileFrom } from './handKit.js';

const SEWN = [
  '..pppppppppppppp..',
  '.pCCCCCCCCCCCCCCp.',
  'pCccccccccccccccsp',
  'pCccsccccsccccscsp',
  'pCccccccccccccccsp',
  'pCcccscccccsccccsp',
  'pssssssssssssssstp',
  'ptOtxtOtxtOtxtOttp',
  'pxtOtxtOtxtOtxtOtp',
  'ptttttttttttttttWp',
  'pttttttxttOtttttWp',
  'ptttttttxOttttttWp',
  'ptttttttOxttttttWp',
  'pttttttOttxtttttWp',
  'ptttttttttttttttWp',
  'pttttttttttttttWWp',
  '.pWWWWWWWWWWWWWWp.',
  '..pppppppppppppp..',
];
const TRUNK = [
  '.kkkkkkkkkkkk.',
  'kYGwwwwwwwwYGk',
  'kGuBBBBBBBBGuk',
  'kwBppppppppBwk',
  'kwBppppppppBwk',
  'kwBppppppppBwk',
  'kwBppppppppBwk',
  'kwBppppppppBwk',
  'kwBppppppppBwk',
  'kwBppppppppBwk',
  'kwBppppppppBwk',
  'kYGwwwwwwwwYGk',
  'kGuwwwwwwwwGuk',
  '.kkkkkkkkkkkk.',
];
const TOSS = [
  '.......wwwwwwww.........',
  '....wwwWWWWWWWWwww...L..',
  '..wwWWWLLLLLLLWWWWww....',
  '.wWWLLWWWWWWWWLLWWWWw...',
  'wWLLWwBBBBBBBBwwWLLWWw..',
  'wWLWwBppppppppBBwWLWWw.L',
  'wWWwBpkkkkkkkkppBwWWWWw.',
  'wWWwBpkkkkkkkkkkpBwWWWw.',
  'wWWwBpkkkkkkkkkkpBwWWw..',
  '.wWWwBpkkkkkkkkpBwWWWw..',
  '.wWWWwBppkkkkppBwWWWw...',
  '..wWWWwBBppppBBwWWWw....',
  '...wwWWWwwBBwwWWWww..L..',
  '.L...wwWWWWWWWWww.......',
  '.......wwwwwwww.........',
  '........................',
  '..L................L....',
  '........................',
];
const BRUSH = [
  '........kkkk',
  '.......kCsCk',
  '......kCsCsk',
  '.....kgCsCk.',
  '....kGbukk..',
  '...kLbuk....',
  '..kLWk......',
  '.kLWk.......',
  'kLWk........',
  'kWwk........',
  'kwk.........',
  '.k..........',
];
const WEIGHT = [
  '....kkk.....',
  '...kG.bk....',
  '..kkGbkkk...',
  '.kGGGGGbuk..',
  '.kGCCCCCuk..',
  '.kGCCrCCuk..',
  '.kGCrkCCuk..',
  '.kGCCCCCuk..',
  '.kbuuuuuuk..',
  '..kkk2kkk...',
  '....k3k.....',
  '....k2kk....',
];

const sprite = (key, fn) => art('inv:kit:' + key, fn, { res: 1 });
export const INV_ART = {
  sewn: () => sprite('sewn', () => mapPx(SEWN)),
  trunk: (on = false) => sprite('trunk' + (on ? 1 : 0), () => mapPx(TRUNK, on ? { p: 'B', B: 'w', w: 'W' } : null)),
  toss: (open = false) => sprite('toss' + (open ? 1 : 0), () => mapPx(open ? TOSS.map((r, y) => (y === 7 ? r.slice(0, 9) + 'G' + r.slice(10) : y === 8 ? r.slice(0, 14) + 'Y' + r.slice(15) : r)) : TOSS)),
  brush: () => sprite('brush', () => mapPx(BRUSH)),
  weight: () => sprite('weight', () => mapPx(WEIGHT)),
};

/** Publish the slot slices as --inv-* custom properties on a node. */
export function installInvArt(node) {
  node.style.setProperty('--inv-sewn', cssUrl(INV_ART.sewn()));
  node.style.setProperty('--inv-trunk', cssUrl(INV_ART.trunk(false)));
  node.style.setProperty('--inv-trunkOn', cssUrl(INV_ART.trunk(true)));
}

// ---------------------------------------------------------------- the bag itself (over packArt's --pk-*)
const L3 = (n) => [[n, [n, 'h'], n], [[n, 'v'], [n, 'hv'], [n, 'h']], [[n, 'h'], n, [n, 'v']]];
const FLAP = { e: 'D', E: 'e', D: 'p' };
const PACK = {
  leather: () => tileFrom(L3('leather32')),
  flap: () => tileFrom(L3('leather32'), FLAP),
  canvas: () => tileFrom([['canvas32', ['canvas32', 'h']], [['canvas32', 'v'], 'canvas32']]),
  edge: () => kitPx('bagEdge'),
  pocket: () => kitPx('pocket'),
  pocketOn: () => kitPx('pocket', { t: 'g', W: 'b', c: 'C' }),
  sleeve: () => kitPx('sleeve'),
  sleeveOn: () => kitPx('sleeve', { e: 'E', D: 'e', p: 'b' }),
  buckle: () => kitPx('buckle'),
  rivet: () => mapPx(['.Gb.', 'GYbu', 'bbuk', '.uk.']),
};
/** Publish the hand-drawn bag over packArt's (call after installPackArt on the same node). */
export function installPackKit(node) {
  for (const [k, fn] of Object.entries(PACK)) node.style.setProperty('--pk-' + k, cssUrl(art('pk:kit:' + k, fn, { res: 1 })));
}
