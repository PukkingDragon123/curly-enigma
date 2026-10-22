// Step registry: recipe step kind → minigame class.
import { ChopStep } from './chop.js';
import { CrackStep } from './crack.js';
import { StirStep } from './stir.js';
import { SeasonStep } from './season.js';
import { FryStep } from './fry.js';
import { PourStep } from './pour.js';
import { KneadStep } from './knead.js';
import { PlateStep } from './plate.js';
import { SimmerStep } from './simmer.js';
import { FlipStep } from './flip.js';
import { GrateStep } from './grate.js';
import { RollStep } from './roll.js';
import { BakeStep } from './bake.js';
import { MashStep } from './mash.js';

export const STEPS = {
  chop: ChopStep,
  crack: CrackStep,
  stir: StirStep,
  season: SeasonStep,
  fry: FryStep,
  pour: PourStep,
  knead: KneadStep,
  plate: PlateStep,
  simmer: SimmerStep,
  flip: FlipStep,
  grate: GrateStep,
  roll: RollStep,
  bake: BakeStep,
  mash: MashStep,
};

export function makeStep(kind, cook, opts) {
  const C = STEPS[kind] || ChopStep;
  return new C(cook, { ...opts, kind });
}
