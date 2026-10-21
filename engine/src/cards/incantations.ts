// A few Incantations, scripted early so the stack and responses can be tested.
import type { CardScript } from '../types.ts';

export const incantationScripts: Record<string, CardScript> = {
  // Deal 3 damage to any creature.
  fireball: {
    targets: [{ kind: 'creature' }],
    resolve: [{ do: 'damage', target: 'target:0', n: 3 }],
  },

  // ON ANY CLASH - Target creature gains +2/0 until the end of CLASH.
  'swords-up': {
    playCondition: { clashInProgress: true },
    targets: [{ kind: 'creature' }],
    resolve: [{ do: 'pump', target: 'target:0', atk: 2, def: 0, until: 'battle' }],
  },

  // ON ANY CLASH - Target creature gains +0/2 until the end of CLASH.
  'shields-up': {
    playCondition: { clashInProgress: true },
    targets: [{ kind: 'creature' }],
    resolve: [{ do: 'pump', target: 'target:0', atk: 0, def: 2, until: 'battle' }],
  },

  // Negate the play of an Incantation or Spell.
  no: {
    targets: [{ kind: 'stackCard', types: ['Spell', 'Incantation'] }],
    resolve: [{ do: 'negate', target: 'target:0' }],
  },
};
