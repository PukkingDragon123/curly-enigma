// Step registry: recipe step kind → minigame class.
import { ChopStep } from './chop.js';
import { CrackStep } from './crack.js';
import { StirStep } from './stir.js';
import { SeasonStep } from './season.js';
import { FryStep } from './fry.js';
import { PourStep } from './pour.js';
import { KneadStep } from './knead.js';
import { PlateStep } from './plate.js';

export const STEPS = {
  chop: ChopStep,
  crack: CrackStep,
  stir: StirStep,
  season: SeasonStep,
  fry: FryStep,
  pour: PourStep,
  knead: KneadStep,
  plate: PlateStep,
};

export function makeStep(kind, cook, opts) {
  const C = STEPS[kind] || ChopStep;
  return new C(cook, { ...opts, kind });
}
