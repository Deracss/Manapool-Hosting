// Scripts for the Goblin tribe. Printed name, cost, stats and text come from data/cards.json;
// these describe what each card does, keyed by card id.
import type { CardScript, Effect, Filter } from '../types.ts';

const yourGoblins: Filter = { zone: 'field', controller: 'you', tribe: 'Goblin' };
const critBoostGoblin: Effect = { do: 'createToken', token: 'goblin-token', n: 1, keywords: ['CRITICAL BOOST'] };

export const goblinScripts: Record<string, CardScript> = {
  // CRITICAL BOOST and draw a card when Boosting.
  'baby-goblin': {
    keywords: ['CRITICAL BOOST'],
    triggers: [{ label: 'Draw when boosting', on: 'boost', subject: 'self', effects: [{ do: 'draw', n: 1 }] }],
  },

  // For each "Goblin" you control that was boosted this turn - Gain +2/0 for the rest of the turn.
  'goblin-artillery': {
    statics: [{ kind: 'selfAtkPerCount', per: { ...yourGoblins, flag: 'wasBoostedThisTurn' }, atk: 2 }],
  },

  // When CLASHING, inflict double damage.
  'goblin-assassin': {
    statics: [{ kind: 'clashDouble' }],
  },

  // When BOOSTED by "Goblin" creatures, gain DOUBLE STRIKE until the end of Battle.
  // Whenever this creature destroys another creature via CLASH; create a 1/1 Goblin Token with CRITICAL BOOST.
  'goblin-berserker': {
    triggers: [
      {
        label: 'Double strike when boosted by Goblins',
        on: 'attackBoosted',
        subject: 'self',
        condition: { eventBoostersInclude: { tribe: 'Goblin' } },
        effects: [{ do: 'grant', target: 'self', keyword: 'DOUBLE STRIKE', until: 'battle' }],
      },
      { label: 'Goblin Token on clash kill', on: 'clashKill', subject: 'self', effects: [critBoostGoblin] },
    ],
  },

  // ETB - Draw a card for each "Goblin" you control.
  'goblin-elder': {
    triggers: [{ label: 'Draw per Goblin', on: 'etb', subject: 'self', effects: [{ do: 'draw', n: { count: yourGoblins } }] }],
  },

  // HASTE - If you control at least 3 "Goblin" creatures, you can play this card by paying 2.
  'goblin-flanker': {
    keywords: ['HASTE'],
    altCost: { condition: { count: yourGoblins, atLeast: 3 }, cost: 2 },
  },

  // CRITICAL
  'goblin-marksman': { keywords: ['CRITICAL'] },

  // ON PLAY - Search your deck for a "Goblin" cost {3} or less, reveal it and add it to your hand.
  'goblin-messenger': {
    triggers: [
      {
        label: 'Search for a Goblin',
        on: 'etb',
        subject: 'self',
        effects: [
          {
            do: 'choose',
            from: { zone: 'deck', controller: 'you', tribe: 'Goblin', maxCost: 3 },
            as: 'found',
            optional: true,
            prompt: 'Choose a Goblin costing 3 or less to add to your hand',
          },
          { do: 'moveToHand', target: 'var:found', reveal: true },
          { do: 'shuffleDeck' },
        ],
      },
    ],
  },

  // End Phase - If at least 1 of your "Goblin" creatures successfully inflicted damage to an opponent; create a 1/1 Goblin Token.
  'goblin-miner': {
    triggers: [
      {
        label: 'Goblin Token if a Goblin hit',
        on: 'endPhase',
        condition: { and: [{ isYourTurn: true }, { hitsThisTurn: { tribe: 'Goblin' }, atLeast: 1 }] },
        effects: [{ do: 'createToken', token: 'goblin-token', n: 1 }],
      },
    ],
  },

  // Whenever you tap a "Goblin" to Attack, add 1 mana to your mana pool until the end of the turn.
  'goblin-planner': {
    triggers: [
      {
        label: 'Mana when a Goblin attacks',
        on: 'tappedToAttack',
        subject: { controller: 'you', tribe: 'Goblin' },
        effects: [{ do: 'addMana', n: 1 }],
      },
    ],
  },

  'goblin-recruit': { keywords: ['HASTE'] },

  // TAP; Create a 1/1 Goblin Token with CRITICAL BOOST.
  'goblin-recruiter': {
    activated: [{ label: 'Create a Goblin Token', cost: { tap: true }, effects: [critBoostGoblin] }],
  },

  'goblin-rusher': { keywords: ['HASTE'] },

  // On Play - Draw a card. When destroyed, draw 1 card.
  'goblin-scout': {
    triggers: [
      { label: 'Draw on play', on: 'etb', subject: 'self', effects: [{ do: 'draw', n: 1 }] },
      { label: 'Draw when destroyed', on: 'destroyed', subject: 'self', effects: [{ do: 'draw', n: 1 }] },
    ],
  },

  // WHILE ON FIELD - all your other "Goblin" gain +1/1.
  'goblin-shaman': {
    statics: [{ kind: 'buff', filter: { ...yourGoblins, other: true }, atk: 1, def: 1 }],
  },

  // Your BOOSTING "Goblins" provide an extra point in attack.
  'goblin-wizard': {
    statics: [{ kind: 'boostBonus', filter: { controller: 'you', tribe: 'Goblin' }, extra: 1 }],
  },

  // EVASIVE, VIGILANCE - ON ATTACK - Destroy another creature you control and if it was a "Goblin"; gain a +0/1 counter.
  'groot-goblin-mercenary': {
    keywords: ['EVASIVE', 'VIGILANCE'],
    triggers: [
      {
        label: 'Destroy another creature you control',
        on: 'attackDeclared',
        subject: 'self',
        effects: [
          {
            do: 'choose',
            from: { zone: 'field', controller: 'you', type: 'Creature', other: true },
            as: 'victim',
            prompt: 'Choose another creature you control to destroy',
          },
          { do: 'if', cond: { varTribe: ['victim', 'Goblin'] }, then: [{ do: 'counter', target: 'self', atk: 0, def: 1 }] },
          { do: 'destroy', target: 'var:victim' },
        ],
      },
    ],
  },

  // END PHASE - for each "Goblin" you control that BOOSTED this turn; Select 1 "Goblin", it gains a +1/1 counter (3 counters max).
  // Urgal can give each Goblin at most 3 counters; counters from other cards don't count toward that.
  'urgal-the-whisperer': {
    triggers: [
      {
        label: 'Counters for boosting Goblins',
        on: 'endPhase',
        condition: { isYourTurn: true },
        effects: [
          {
            do: 'repeat',
            n: { count: { ...yourGoblins, flag: 'boostedThisTurn' } },
            effects: [
              { do: 'choose', from: { ...yourGoblins, type: 'Creature' }, as: 'g', prompt: 'Choose a Goblin to get a +1/+1 counter' },
              { do: 'counter', target: 'var:g', atk: 1, def: 1 },
            ],
          },
        ],
      },
    ],
  },

  // ON PLAY - Create 2 1/1 Goblin Tokens.
  'goblin-whelpcaller': {
    triggers: [{ label: 'Create 2 Goblin Tokens', on: 'etb', subject: 'self', effects: [{ do: 'createToken', token: 'goblin-token', n: 2 }] }],
  },

  // ON CREATE GOBLIN TOKEN - Create 1 more.
  'grukza-the-goblin-mother': {
    replacements: [{ kind: 'extraTokens', tribe: 'Goblin', extra: 1 }],
  },

  // HASTE ; Whenever a creature is tapped to boost during the turn this creature entered, gain a +1/1 counter.
  'goblin-1': {
    keywords: ['HASTE'],
    triggers: [
      {
        label: 'Counter when a creature boosts',
        on: 'boost',
        condition: { selfEnteredThisTurn: true },
        effects: [{ do: 'counter', target: 'self', atk: 1, def: 1 }],
      },
    ],
  },

  'goblin-token': {},
};
