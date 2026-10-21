// Scripts for the Precon Essentials and the general support cards (Anthems, Artifacts, Spells, Incantations).
import type { ActivatedAbility, CardScript, Effect, Filter, Keyword } from '../types.ts';

const yourCreatures: Filter = { controller: 'you', type: 'Creature' };
const anyCreature: Filter = { zone: 'field', type: 'Creature' };
const yourOrbs: Filter = { zone: 'orbs', controller: 'you' };
const tapFor = (label: string, effects: Effect[], extra: Partial<ActivatedAbility> = {}): ActivatedAbility => ({ label, cost: { tap: true }, effects, ...extra });
const addMana = (n: number): Effect => ({ do: 'addMana', n });

export const essentialScripts: Record<string, CardScript> = {
  // ---------- Anthems ----------
  // During your draw phase, you may draw an extra card.
  'nature-s-dance': {
    triggers: [{ label: 'You may draw an extra card', on: 'drawStep', condition: { eventPlayerIsYou: true }, effects: [{ do: 'may', prompt: 'Draw an extra card?', then: [{ do: 'draw', n: 1 }] }] }],
  },
  // All of your creatures gain +1/1.
  'war-cry': { statics: [{ kind: 'buff', filter: yourCreatures, atk: 1, def: 1 }] },
  // Creatures you cast cost 1 less.
  tavern: { statics: [{ kind: 'costReduction', filter: { type: 'Creature' }, amount: 1 }] },
  // All your creatures gain "Tap; add 1 mana to your mana pool until the end of the turn".
  'mana-harmonics': { statics: [{ kind: 'grantAbility', filter: yourCreatures, ability: tapFor('Tap: add 1 mana (Mana Harmonics)', [addMana(1)]) }] },
  // ON UPKEEP - You may throw a coin: ON HEADS - create 2 Mana Rocks. ON TAILS - Destroy a creature you control.
  'gambler-s-bounty': {
    triggers: [
      {
        label: 'You may flip a coin',
        on: 'upkeep',
        condition: { eventPlayerIsYou: true },
        effects: [
          {
            do: 'may',
            prompt: 'Flip a coin? Heads: 2 Mana Rocks. Tails: destroy a creature you control.',
            then: [
              {
                do: 'coinFlip',
                heads: [{ do: 'createRock', n: 2 }],
                tails: [{ do: 'choose', from: { zone: 'field', ...yourCreatures }, as: 'c', prompt: 'Tails: choose a creature you control to destroy' }, { do: 'destroy', target: 'var:c' }],
              },
            ],
          },
        ],
      },
    ],
  },
  // ON CHARGE - GUIDE 2.
  'path-of-the-seer': { triggers: [{ label: 'GUIDE 2', on: 'charge', subject: { controller: 'you' }, effects: [{ do: 'guide', n: 2 }] }] },

  // ---------- Human creatures ----------
  // Tap; Draw 1 card - Tap; Add 1 mana to your mana pool until the end of the turn.
  'dual-channeler': { activated: [tapFor('Tap: draw a card', [{ do: 'draw', n: 1 }]), tapFor('Tap: add 1 mana', [addMana(1)])] },
  'meditating-monk': { activated: [tapFor('Tap: add 1 mana', [addMana(1)])] },
  'mischievous-child': { activated: [tapFor('Tap: draw a card', [{ do: 'draw', n: 1 }])] },

  // ---------- Incantations ----------
  // Target creature gains INDESTRUCTIBLE until the end of the turn.
  'angel-s-protection': { targets: [{ kind: 'creature' }], resolve: [{ do: 'grant', target: 'target:0', keyword: 'INDESTRUCTIBLE', until: 'turn' }] },
  // ON ANY CLASH - Target creature gains +2/0 or +0/2 until the end of Combat.
  'morale-boost': {
    playCondition: { clashInProgress: true },
    targets: [{ kind: 'creature' }],
    resolve: [
      {
        do: 'chooseMode',
        prompt: 'Morale Boost: choose one',
        modes: [
          { label: '+2 attack', effects: [{ do: 'pump', target: 'target:0', atk: 2, def: 0, until: 'battle' }] },
          { label: '+2 defense', effects: [{ do: 'pump', target: 'target:0', atk: 0, def: 2, until: 'battle' }] },
        ],
      },
    ],
  },
  // Destroy a creature with mana cost 4 or less.
  'divine-judgment': { targets: [{ kind: 'creature', filter: { maxCost: 4 } }], resolve: [{ do: 'destroy', target: 'target:0' }] },
  // Destroy a creature with mana cost 5 or higher.
  'topple-the-mighty': { targets: [{ kind: 'creature', filter: { minCost: 5 } }], resolve: [{ do: 'destroy', target: 'target:0' }] },
  // Destroy all creatures on the field.
  'end-of-war': { resolve: [{ do: 'destroyAll', filter: { type: 'Creature' } }] },
  // Add 1 card from your drop to your hand.
  'forgotten-memory': {
    resolve: [{ do: 'choose', from: { zone: 'discard', controller: 'you' }, as: 'c', prompt: 'Choose a card from your discard pile to put into your hand' }, { do: 'moveToHand', target: 'var:c' }],
  },
  // Negate the Play of a Creature.
  'summoning-seal': { targets: [{ kind: 'stackCard', types: ['Creature'] }], resolve: [{ do: 'negate', target: 'target:0' }] },
  // Draw 3 cards and lose 1 life.
  'two-for-one': { resolve: [{ do: 'draw', n: 3 }, { do: 'loseLife', n: 1 }] },

  // ---------- Spells ----------
  // Divide 5 damage among selected creatures.
  'divide-and-conquer': {
    resolve: [{ do: 'repeat', n: 5, effects: [{ do: 'choose', from: { ...anyCreature, controller: 'any' }, as: 'd', prompt: 'Divide and Conquer: choose a creature to take 1 of the 5 damage' }, { do: 'damage', target: 'var:d', n: 1 }] }],
  },
  // GUIDE 2, draw 1.
  research: { resolve: [{ do: 'guide', n: 2 }, { do: 'draw', n: 1 }] },
  // Draw 1 card, then if you have at least 4 cards in your mana pool; draw 1 card.
  'adeventurer-s-breakfast': { resolve: [{ do: 'draw', n: 1 }, { do: 'if', cond: { count: yourOrbs, atLeast: 4 }, then: [{ do: 'draw', n: 1 }] }] },
  // Draw 1 card for each creature you control.
  reinforcements: { resolve: [{ do: 'draw', n: { count: yourCreatures } }] },
  // Discard your hand; and draw x (x = amount of discarded cards).
  'out-of-bullets': { resolve: [{ do: 'discardHand', as: 'x' }, { do: 'draw', n: { var: 'x' } }] },
  // Destroy target artifact.
  disarm: { targets: [{ kind: 'permanent', filter: { type: 'Artifact' } }], resolve: [{ do: 'destroy', target: 'target:0' }] },
  // Destroy target Anthem.
  'educated-civilian': { targets: [{ kind: 'permanent', filter: { type: 'Anthem' } }], resolve: [{ do: 'destroy', target: 'target:0' }] },
  // Create a copy of target Artifact on the board.
  'replica-creation': { targets: [{ kind: 'permanent', filter: { type: 'Artifact' } }], resolve: [{ do: 'copyToken', target: 'target:0' }] },
  // Add 3 mana to your mana pool until the end of your turn.
  'mana-surge': { resolve: [addMana(3)] },
  // Draw 3 cards.
  rinse: { resolve: [{ do: 'draw', n: 3 }] },
  // Add mana to your mana pool equal to half the amount of artifacts on the board, rounded down.
  'mana-processing-unit': { resolve: [{ do: 'addMana', n: { half: { count: { type: 'Artifact', controller: 'any' } } } }] },

  // ---------- Artifacts ----------
  // tap; Add 1 mana - Once per turn, you may replace one of your mana cards with one card in your hand.
  'mana-portal': {
    activated: [
      tapFor('Tap: add 1 mana', [addMana(1)]),
      {
        label: 'Swap a Mana Orb with a card in your hand',
        cost: {},
        oncePerRound: true,
        condition: { count: yourOrbs, atLeast: 1 },
        effects: [
          { do: 'choose', from: yourOrbs, as: 'back', prompt: 'Choose a Mana Orb to return to your hand' },
          { do: 'moveToHand', target: 'var:back' },
          { do: 'choose', from: { zone: 'hand', controller: 'you' }, as: 'charge', prompt: 'Choose a card from your hand to charge' },
          { do: 'chargeCard', target: 'var:charge' },
        ],
      },
    ],
  },
  // Tap; Send 1 card from your hand to the bottom of the deck; create 1 mana rock.
  'mana-conductor': {
    activated: [
      tapFor(
        'Tap: a card from hand to the bottom of your deck, create a Mana Rock',
        [{ do: 'choose', from: { zone: 'hand', controller: 'you' }, as: 'c', prompt: 'Choose a card to put on the bottom of your deck' }, { do: 'toDeckBottom', target: 'var:c' }, { do: 'createRock', n: 1 }],
        { condition: { count: { zone: 'hand', controller: 'you' }, atLeast: 1 } },
      ),
    ],
  },
  'elemental-well': { activated: [tapFor('Tap: add 2 mana', [addMana(2)])] },
  // Tap - Add 1 mana to your mana pool and draw a card.
  'insight-orb': { activated: [tapFor('Tap: add 1 mana and draw a card', [addMana(1), { do: 'draw', n: 1 }])] },
  // Tap pay 1; Create 1 Corrupted Mana Rock.
  'corrupted-mana-tree': { activated: [{ label: 'Tap, pay 1: create a Corrupted Mana Rock', cost: { tap: true, mana: 1 }, effects: [{ do: 'createRock', n: 1, corrupted: true }] }] },
  'sleight-of-hand': { activated: [tapFor('Tap: draw a card', [{ do: 'draw', n: 1 }])] },
  'mana-tree': { activated: [tapFor('Tap: add 1 mana', [addMana(1)])] },
  // Tap; Create 1 Mana Rock.
  'crystal-nexus': { activated: [tapFor('Tap: create a Mana Rock', [{ do: 'createRock', n: 1 }])] },
  // Tap - Add 1 mana - Once per turn, you may destroy 1 Mana Card and add 1 mana.
  'dark-dealings': {
    activated: [
      tapFor('Tap: add 1 mana', [addMana(1)]),
      {
        label: 'Destroy a Mana Orb: add 1 mana',
        cost: {},
        oncePerTurn: true,
        condition: { count: yourOrbs, atLeast: 1 },
        effects: [{ do: 'choose', from: yourOrbs, as: 'orb', prompt: 'Choose one of your Mana Orbs to destroy' }, { do: 'destroyOrb', target: 'var:orb' }, addMana(1)],
      },
    ],
  },

  // ---------- Construct in the essentials ----------
  // ON TAP - Add a +1/1 counter to target Creature you control.
  'augmenter-drone': {
    triggers: [
      {
        label: '+1/+1 counter when tapped',
        on: 'tapped',
        subject: 'self',
        effects: [{ do: 'choose', from: { zone: 'field', ...yourCreatures }, as: 'c', prompt: 'Augmenter Drone: choose a creature you control to get a +1/+1 counter' }, { do: 'counter', target: 'var:c', atk: 1, def: 1 }],
      },
    ],
  },

  // ---------- Equipment (Equip happens at spell speed: your own Main phase, nothing on the stack) ----------
  'enchanted-mace': equipment(1, 'CRITICAL'),
  'lightweight-sandals': equipment(1, 'HASTE'),
  fangs: equipment(2, 'DMG GAIN'),
  'truesight-helmet': equipment(2, 'FACEOFF'),
  'exalted-weapon': equipment(2, 'DOUBLE STRIKE'),
  'the-gods-blessing': equipment(2, 'INDESTRUCTIBLE'),

  // ---------- RECONFIGURE (once per round, untap whenever you have priority) ----------
  // Tap; Add 1 mana to your mana pool until the end of the turn - Reconfigure
  'resonant-mana-node': { keywords: ['RECONFIGURE'], activated: [tapFor('Tap: add 1 mana', [addMana(1)])] },
  // TAP - target Artifact gains RECONFIGURE
  'runes-of-configuration': {
    activated: [
      tapFor('Tap: an Artifact gains RECONFIGURE', [
        { do: 'choose', from: { zone: 'field', type: 'Artifact', controller: 'any' }, as: 'a', prompt: 'Runes of Configuration: choose an Artifact to gain RECONFIGURE' },
        { do: 'grant', target: 'var:a', keyword: 'RECONFIGURE', until: 'permanent' },
      ]),
    ],
  },
};

/** "pay N - Equip to target creature. Equipped creature gains KEYWORD." Paying again moves it. */
function equipment(cost: number, keyword: Keyword): CardScript {
  return {
    statics: [{ kind: 'equipped', keyword }],
    activated: [
      {
        label: `Pay ${cost}: Equip (gives ${keyword})`,
        cost: { mana: cost },
        speed: 'spell',
        condition: { count: { zone: 'field', ...yourCreatures }, atLeast: 1 },
        effects: [{ do: 'choose', from: { zone: 'field', ...yourCreatures }, as: 'c', prompt: `Equip: choose a creature you control to gain ${keyword}` }, { do: 'attach', target: 'var:c' }],
      },
    ],
  };
}
