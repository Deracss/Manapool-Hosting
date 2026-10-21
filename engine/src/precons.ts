// Preconstructed decks. Each is: the 39 Precon Essentials + every card of the main tribe +
// that tribe's support cards (Anthems, Artifacts, Spells, Incantations) up to exactly 60 cards.
import { allDefs } from './cards/registry.ts';

/** The "Precon Essentials" list: in every precon. */
export const PRECON_ESSENTIALS: string[] = [
  'mana-droid', 'nature-s-dance', 'war-cry', 'dual-channeler', 'mana-sage', 'meditating-monk', 'mischievous-child',
  'angel-s-protection', 'morale-boost', 'fireball', 'divine-judgment', 'no', 'end-of-war', 'forgotten-memory',
  'summoning-seal', 'counter-the-counter', 'arcane-vanishing', 'topple-the-mighty', 'divide-and-conquer', 'research',
  'adeventurer-s-breakfast', 'reinforcements', 'anthropomorph', 'out-of-bullets', 'mana-ramp', 'disarm',
  'educated-civilian', 'cosmic-channeling', 'replica-creation', 'mana-portal', 'mana-conductor', 'the-gods-blessing',
  'elemental-well', 'insight-orb', 'resonant-mana-node', 'corrupted-mana-tree', 'sleight-of-hand', 'mana-tree',
  'augmenter-drone',
];

export interface Precon {
  id: string;
  name: string;
  tribe: string;
  field: string; // every deck comes with a Field (a player always needs one)
  support: string[]; // tribe support cards added after the essentials and the tribe
  leftOut: { id: string; why: string }[]; // tribe support cards that didn't fit in 60
}

export const PRECON_DEFS: Precon[] = [
  {
    id: 'precon-goblin',
    name: 'Goblin Horde',
    tribe: 'Goblin',
    field: 'forest',
    support: [],
    leftOut: [
      { id: 'goblin-assembly', why: 'Essentials + 21 Goblins already make 60' },
      { id: 'goblin-soup', why: 'Essentials + 21 Goblins already make 60' },
    ],
  },
  {
    id: 'precon-vampire',
    name: 'Vampire Court',
    tribe: 'Vampire',
    field: 'city-night',
    support: ['vampire-castle', 'fangs', 'truesight-helmet', 'lair-entrance'],
    leftOut: [{ id: 'parasitic-society', why: '5 support cards for 4 slots' }],
  },
  {
    id: 'precon-zombie',
    name: 'Zombie Plague',
    tribe: 'Zombie',
    field: 'graveyard',
    support: ['unholy-grimoire', 'grim-gauntlet', 'tombstone', 'corruption-engine', 'reanimation', 'creature-retrieval', 'sacrifice'],
    leftOut: [{ id: 'abyssal-disposal', why: '8 support cards for 7 slots' }],
  },
  {
    id: 'precon-demon',
    name: 'Demon Contract',
    tribe: 'Demon',
    field: 'demon-field',
    support: ['infernal-tutor', 'carnival-games', 'pact-of-insight', 'insightful-decree', 'demon-pit', 'win-win'],
    leftOut: [
      { id: 'fine-print', why: '9 support cards for 6 slots' },
      { id: 'spiteful-bargain', why: '9 support cards for 6 slots' },
      { id: 'price-of-passage', why: '9 support cards for 6 slots' },
    ],
  },
  {
    id: 'precon-construct',
    name: 'Construct Foundry',
    tribe: 'Construct',
    field: 'neural-nexus',
    support: [
      'database', 'arcane-foundry', 'machinist-s-reservoir', 'runes-of-configuration', 'automaton-forge', 'foundry-stone',
      'repairs', 'reset', 'mana-processing-unit', 'artificer-s-insight', 'artifact-1',
    ],
    leftOut: [],
  },
];

/** The full 60-card list for a precon: essentials, then the whole tribe, then the support cards. */
export function preconCards(p: Precon): string[] {
  const tribe = allDefs()
    .filter((d) => d.tribe === p.tribe && d.type === 'Creature')
    .map((d) => d.id);
  const out: string[] = [];
  for (const id of [...PRECON_ESSENTIALS, ...tribe, ...p.support]) if (!out.includes(id)) out.push(id);
  return out;
}
