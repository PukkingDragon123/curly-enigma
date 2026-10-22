// Every creature of the underground by spawn key (Enemies.spawnGroup, debug.spawn). The keys of
// the newer folk are their index ids.
import { Mimic, Golem } from './rock.js';
import { CrystalGolem } from './golem.js';
import { Wisp } from './wisp.js';
import { Imp } from './imp.js';
import { Wyrm } from './wyrm.js';
import { Puffer } from './puffer.js';
import { Bat } from './bats.js';
import { CRITTER_SPECIES, CaveFish } from './critters.js';
import { Kobold } from './kobold.js';
import { Troll } from './troll.js';
import { Spider } from './spider.js';
import { Slime } from './slime.js';
import { Wraith } from './wraith.js';
import { Drake } from './drake.js';
import { Raptor, Tyrant, Shellback, Pterosaur } from './dinos.js';

export const SPECIES = {
  mimic: Mimic, golem: Golem, crystal_golem: CrystalGolem, wisp: Wisp, imp: Imp, wyrm: Wyrm, puffer: Puffer, bat: Bat,
  cave_fish: CaveFish, ...CRITTER_SPECIES,
  kobold: Kobold, cave_troll: Troll, cave_spider: Spider, cave_slime: Slime, ruin_wraith: Wraith, cave_drake: Drake,
  raptor: Raptor, tyrant: Tyrant, shellback: Shellback, pterosaur: Pterosaur,
};
