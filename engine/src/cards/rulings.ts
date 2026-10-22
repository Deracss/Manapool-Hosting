// Cards scripted after Gustavo's rulings 4–24 (Oct 2026). See docs: rules-and-card-changes.md.
import type { CardScript, Effect, Filter } from '../types.ts';

const yourVampires: Filter = { controller: 'you', type: 'Creature', tribe: 'Vampire' };
const contracts = { var: 'contracts' } as const;
const ifContracts = (then: Effect[]): Effect => ({ do: 'if', cond: { varAtLeast: ['contracts', 1] }, then });
const destroyOneOf = (type: 'Anthem' | 'Artifact', as: string): Effect => ({
  do: 'if',
  cond: { count: { controller: 'you', type }, atLeast: 1 },
  then: [{ do: 'choose', from: { zone: 'field', controller: 'you', type }, as, prompt: `COMMAND: destroy 1 ${type} you control` }, { do: 'destroy', target: `var:${as}` }],
});

export const rulingScripts: Record<string, CardScript> = {
  // ---------- Vampires ----------
  'vampire-feeder': { statics: [{ kind: 'buff', filter: yourVampires, atk: 0, def: 1 }] },
  'vampire-butler': {
    triggers: [
      {
        label: 'Another Vampire got a counter: +1/+1 counter',
        on: 'counterAdded',
        subject: { ...yourVampires, other: true },
        // Butlers don't trigger each other's counters (that would loop forever).
        condition: { not: { eventKind: 'vampire-butler' } },
        effects: [{ do: 'counter', target: 'self', atk: 1, def: 1 }],
      },
    ],
  },
  'atredes-vampire-overlord': {
    keywords: ['DMG GAIN', 'FACEOFF'],
    triggers: [
      {
        label: 'Vampires attacked for 9+: 0/3 Vampire Token',
        on: 'endPhase',
        condition: { and: [{ eventPlayerIsYou: true }, { attackTotal: { tribe: 'Vampire' }, atLeast: 9 }] },
        effects: [{ do: 'createToken', token: 'vampire-token', n: 1, keywords: ['DMG GAIN'] }],
      },
    ],
  },
  'herald-food-critic': {
    triggers: [{ label: 'Blocked below 5 life: gain 1 life', on: 'blocked', subject: 'self', condition: { lifeBelow: 5 }, effects: [{ do: 'gainLife', n: 1 }] }],
  },
  'alucard-prince-of-the-night': {
    keywords: ['HASTE', 'FACEOFF'],
    triggers: [
      {
        label: 'Destroyed a creature in combat: a Vampire gets +1/+1',
        on: 'clashKill',
        subject: 'self',
        effects: [
          { do: 'choose', from: { zone: 'field', type: 'Creature', tribe: 'Vampire', controller: 'any' }, as: 'v', prompt: 'Alucard: choose a Vampire to get +1/+1' },
          { do: 'pump', target: 'var:v', atk: 1, def: 1, until: 'permanent' },
        ],
      },
    ],
  },
  'isolde-bloodborne-mistress': {
    triggers: [{ label: 'Copy the creature she clashes with (as a Vampire)', on: 'clash', subject: 'self', effects: [{ do: 'createSpecialToken', base: 'eventOther', set: { tribe: 'Vampire' }, n: 1 }] }],
  },
  'arsen-vampire-familiar': {
    statics: [{ kind: 'equipped', atk: 1, def: 1, keyword: 'FACEOFF' }, { kind: 'equipAsArtifact' }],
    activated: [
      {
        label: 'Equip to another Vampire',
        cost: {},
        oncePerTurn: true,
        condition: { and: [{ isYourTurn: true }, { count: { ...yourVampires, other: true }, atLeast: 1 }] },
        effects: [{ do: 'choose', from: { zone: 'field', ...yourVampires, other: true }, as: 'v', prompt: 'Arsen: choose a Vampire to equip' }, { do: 'attach', target: 'var:v' }],
      },
    ],
  },

  // ---------- Zombies ----------
  'isolated-sentinel': {
    triggers: [{ label: 'A Zombie was destroyed: +1/+1', on: 'destroyed', subject: { tribe: 'Zombie' }, effects: [{ do: 'pump', target: 'self', atk: 1, def: 1, until: 'permanent' }] }],
  },
  'krr-ask-virulent-contagion': {
    activated: [
      {
        label: 'Tap: INFECT a tapped creature',
        cost: { tap: true },
        condition: { count: { type: 'Creature', tapped: true, controller: 'any', other: true }, atLeast: 1 },
        effects: [{ do: 'choose', from: { zone: 'field', type: 'Creature', tapped: true, controller: 'any', other: true }, as: 'c', prompt: 'INFECT: choose a tapped creature' }, { do: 'infect', target: 'var:c' }],
      },
    ],
  },
  'deathly-reconjurer': {
    triggers: [
      {
        label: 'Return a Zombie to attack the same target',
        on: 'attackDeclared',
        subject: 'self',
        effects: [
          { do: 'choose', from: { zone: 'discard', controller: 'you', type: 'Creature', tribe: 'Zombie' }, as: 'z', optional: true, prompt: 'Deathly Reconjurer: return a Zombie from your discard pile' },
          { do: 'returnToField', target: 'var:z' },
          { do: 'extraAttack', target: 'var:z' },
        ],
      },
    ],
  },

  // ---------- Demons ----------
  'beelzebub-lord-of-the-flies': {
    triggers: [
      {
        label: 'OFFER: draw 1 and a Mana Rock',
        on: 'etb',
        subject: 'self',
        effects: [
          {
            do: 'offer',
            prompt: 'Draw 1 card and create 1 Mana Rock.',
            gift: [{ do: 'draw', n: 1 }, { do: 'createRock', n: 1 }],
            after: [ifContracts([{ do: 'may', prompt: 'Beelzebub: draw 1 and create 1 Mana Rock per contract?', then: [{ do: 'repeat', n: contracts, effects: [{ do: 'draw', n: 1 }, { do: 'createRock', n: 1 }] }] }])],
          },
        ],
      },
    ],
  },
  'demon-shade': {
    triggers: [{ label: 'OFFER: draw 1', on: 'etb', subject: 'self', effects: [{ do: 'offer', prompt: 'Draw 1 card.', gift: [{ do: 'draw', n: 1 }], after: [{ do: 'draw', n: contracts }] }] }],
  },
  'paimon-great-king-of-hell': {
    triggers: [
      {
        label: 'OFFER: a Mana Rock',
        on: 'etb',
        subject: 'self',
        effects: [
          {
            do: 'offer',
            prompt: 'Create 1 Mana Rock. If you refuse, you are COMMANDED to destroy 1 Anthem and 1 Artifact you control.',
            gift: [{ do: 'createRock', n: 1 }],
            denied: [{ do: 'asPlayer', who: 'pvar:o', effects: [destroyOneOf('Anthem', 'an'), destroyOneOf('Artifact', 'ar')] }, { do: 'contract', kind: 'command', who: 'pvar:o' }],
            after: [{ do: 'addMana', n: { mul: [contracts, 2] } }],
          },
        ],
      },
    ],
  },
  'evil-spirit': {
    triggers: [
      {
        label: 'Search for an OFFER card',
        on: 'etb',
        subject: 'self',
        effects: [
          { do: 'choose', from: { zone: 'deck', controller: 'you', types: ['Spell', 'Incantation'], keywordRef: 'OFFER' }, as: 'c', optional: true, prompt: 'Evil Spirit: choose a Spell or Incantation with OFFER' },
          { do: 'moveToHand', target: 'var:c', reveal: true },
          { do: 'shuffleDeck' },
        ],
      },
    ],
  },
  'demon-1': {
    triggers: [
      {
        label: 'COMMAND: they create a Mana Rock',
        on: 'playerDamaged',
        subject: { controller: 'you', tribe: 'Demon' },
        effects: [{ do: 'createRock', n: 1, who: 'eventTarget' }, { do: 'contract', kind: 'command', who: 'eventTarget' }],
      },
    ],
  },
  'infernal-tutor': {
    resolve: [
      {
        do: 'offer',
        prompt: 'Create a 1/1 Demon Token with "Tap: draw 1 card."',
        gift: [{ do: 'createSpecialToken', base: 'demon-token', set: { attack: 1, defense: 1, scriptFrom: 'mischievous-child', text: 'Tap: draw 1 card.' }, n: 1 }],
        after: [ifContracts([{ do: 'guide', n: { mul: [contracts, 2] } }]), { do: 'draw', n: 1 }],
      },
    ],
  },
  'carnival-games': {
    resolve: [
      {
        do: 'offer',
        prompt: 'Search your deck for a card that costs 2 or less, put it into your hand, then shuffle.',
        gift: [
          { do: 'choose', from: { zone: 'deck', controller: 'you', maxCost: 2 }, as: 'c', optional: true, prompt: 'Carnival Games: choose a card that costs 2 or less' },
          { do: 'moveToHand', target: 'var:c', reveal: true },
          { do: 'shuffleDeck' },
        ],
        after: [{ do: 'draw', n: contracts }, { do: 'gainSouls', n: contracts }],
      },
    ],
  },
  // The token uses this card's trigger (a Spell is never on the field, so only the token has it).
  'pact-of-insight': {
    resolve: [
      {
        do: 'offer',
        prompt: 'Create a 1/1 Pact Token: "At the start of your Upkeep, you and the player who OFFERED it may each draw 1 card."',
        gift: [
          {
            do: 'createSpecialToken',
            base: 'demon-token',
            owner: 'pvar:offerer',
            set: { name: 'Pact Token', tribe: 'Pact', attack: 1, defense: 1, scriptFrom: 'pact-of-insight', text: 'At the start of your Upkeep, you and the player who OFFERED this may each draw 1 card.' },
            n: 1,
          },
        ],
      },
    ],
    triggers: [
      {
        label: 'Pact: both may draw',
        on: 'upkeep',
        condition: { eventPlayerIsYou: true },
        effects: [
          { do: 'may', prompt: 'Pact Token: draw 1 card?', then: [{ do: 'draw', n: 1 }] },
          { do: 'asPlayer', who: 'owner', effects: [{ do: 'may', prompt: 'Pact Token: draw 1 card?', then: [{ do: 'draw', n: 1 }] }] },
        ],
      },
    ],
  },
  'demon-leecher': {
    triggers: [
      { label: 'You OFFERED: you may draw', on: 'offered', condition: { eventPlayerIsYou: true }, effects: [{ do: 'may', prompt: 'Demon Leecher: draw 1 card?', then: [{ do: 'draw', n: 1 }] }] },
      { label: 'You COMMANDED: you may draw', on: 'contract', condition: { and: [{ eventPlayerIsYou: true }, { eventKind: 'command' }] }, effects: [{ do: 'may', prompt: 'Demon Leecher: draw 1 card?', then: [{ do: 'draw', n: 1 }] }] },
    ],
  },
  'demon-pup': {
    triggers: [
      { label: 'You OFFERED: +1/+1 counter', on: 'offered', condition: { eventPlayerIsYou: true }, effects: [{ do: 'counter', target: 'self', atk: 1, def: 1 }] },
      { label: 'You COMMANDED: +1/+1 counter', on: 'contract', condition: { and: [{ eventPlayerIsYou: true }, { eventKind: 'command' }] }, effects: [{ do: 'counter', target: 'self', atk: 1, def: 1 }] },
    ],
  },
  'demon-pit': {
    triggers: [
      {
        label: 'First OFFER of your turn: OFFER a Mana Orb swap',
        on: 'offered',
        condition: { and: [{ eventPlayerIsYou: true }, { isYourTurn: true }, { onceFlag: 'demon-pit' }] },
        effects: [
          {
            do: 'offer',
            prompt: 'Swap 1 of your Mana Orbs with 1 card in your hand (the new Orb is filled).',
            gift: [
              {
                do: 'if',
                cond: { and: [{ count: { zone: 'orbs', controller: 'you' }, atLeast: 1 }, { count: { zone: 'hand', controller: 'you' }, atLeast: 1 }] },
                then: [
                  { do: 'choose', from: { zone: 'hand', controller: 'you' }, as: 'h', prompt: 'Choose a card from your hand to become a Mana Orb' },
                  { do: 'choose', from: { zone: 'orbs', controller: 'you' }, as: 'b', prompt: 'Choose a Mana Orb to return to your hand' },
                  { do: 'moveToHand', target: 'var:b' },
                  { do: 'chargeCard', target: 'var:h' },
                ],
              },
            ],
            after: [{ do: 'createRock', n: contracts }],
          },
        ],
      },
    ],
  },
  'win-win': {
    triggers: [{ label: 'Nobody accepted: a Mana Rock', on: 'offerResolved', condition: { and: [{ eventPlayerIsYou: true }, { eventNIs: 0 }] }, effects: [{ do: 'createRock', n: 1 }] }],
  },

  // ---------- Support cards ----------
  'counter-the-counter': { targets: [{ kind: 'stackCard', types: ['Spell', 'Incantation'], negaters: true }], resolve: [{ do: 'negate', target: 'target:0' }, { do: 'if', cond: { varIs: ['negated', 1] }, then: [{ do: 'draw', n: 1 }] }] },
  'arcane-vanishing': { resolve: [{ do: 'fadeOut', filter: { controller: 'you' } }] },
  anthropomorph: {
    targets: [{ kind: 'creature' }],
    resolve: [{ do: 'override', target: 'target:0', set: { attack: 1, defense: 1, tribe: 'Human', scriptFrom: null, text: 'Transformed: a 1/1 Human with no abilities.' } }],
  },
  'frog-song': {
    triggers: [{ label: 'Your creature triggered: GUIDE 1, draw 1', on: 'creatureTriggered', condition: { eventPlayerIsYou: true }, effects: [{ do: 'may', prompt: 'Frog Song: GUIDE 1 and draw 1 card?', then: [{ do: 'guide', n: 1 }, { do: 'draw', n: 1 }] }] }],
  },
  'blood-vial': {
    triggers: [
      { label: '2 creature Tap abilities: draw 1, add 1 mana', on: 'creatureTapAbility', condition: { and: [{ eventPlayerIsYou: true }, { eventNMultipleOf: 2 }] }, effects: [{ do: 'draw', n: 1 }, { do: 'addMana', n: 1 }] },
    ],
  },
  'combat-mk-ii': {
    keywords: ['CRITICAL'],
    triggers: [{ label: 'Untapped mid-turn: DOUBLE STRIKE', on: 'untapped', subject: 'self', condition: { not: { eventKind: 'untapStep' } }, effects: [{ do: 'grant', target: 'self', keyword: 'DOUBLE STRIKE', until: 'turn' }] }],
  },

  // ---------- Fields ----------
  'city-night': { statics: [{ kind: 'grantKeyword', filter: { controller: 'you', type: 'Creature', atkAbovePrinted: 4 }, keyword: 'EVASIVE' }] },
  'demon-field': {
    statics: [
      { kind: 'buff', filter: { controller: 'you', type: 'Creature', tribe: 'Demon' }, atk: 1, def: 1, minSouls: 5 },
      { kind: 'grantKeyword', filter: { controller: 'you', type: 'Creature', tribe: 'Demon' }, keyword: 'DOUBLE STRIKE', minSouls: 15 },
    ],
    triggers: [
      {
        label: '10 Souls: draw per damage',
        on: 'playerDamaged',
        subject: { controller: 'you' },
        condition: { soulsAtLeast: 10 },
        effects: [{ do: 'repeat', n: { eventN: true }, effects: [{ do: 'may', prompt: 'Demon Field: draw 1 card?', then: [{ do: 'draw', n: 1 }] }] }],
      },
    ],
    activated: [
      {
        label: 'Pay 2 Souls: +1/+1 counter on a creature',
        cost: { souls: 2 },
        condition: { count: { type: 'Creature', controller: 'any' }, atLeast: 1 },
        effects: [{ do: 'choose', from: { zone: 'field', type: 'Creature', controller: 'any' }, as: 'c', prompt: 'Demon Field: choose a creature to get a +1/+1 counter' }, { do: 'counter', target: 'var:c', atk: 1, def: 1 }],
      },
    ],
  },
};
