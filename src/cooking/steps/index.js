// Step registry: recipe step kind → minigame class.
import { ChopStep } from './chop.js';
import { Step } from './base.js';

class TodoStep extends Step {
  get title() { return (this.opts.kind || 'cook').toUpperCase() + '!'; }
  tick() { if (this.live > 1) this.finish(70); }
}

export const STEPS = {
  chop: ChopStep,
};

export function makeStep(kind, cook, opts) {
  const C = STEPS[kind] || TodoStep;
  return new C(cook, { ...opts, kind });
}
