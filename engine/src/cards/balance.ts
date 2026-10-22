// Cards implemented in the balance pass of Oct 22, 2026.
import type { ActivatedAbility, CardScript, Effect, Filter } from '../types.ts';

const yourCreatures: Filter = { controller: 'you', type: 'Creature' };
const anyStackCard = { kind: 'stackCard' as const, types: ['Creature', 'Artifact', 'Spell', 'Incantation', 'Anthem'] as ('Creature' | 'Artifact' | 'Spell' | 'Incantation' | 'Anthem')[] };
const tapFor = (label: string, effects: Effect[]): ActivatedAbility => ({ label, cost: { tap: true }, effects });

export const balanceScripts: Record<string, CardScript> = {
  // Search your deck for 1 creature and send it to the Discard Pile. If you have at least 4 cards in your mana pool, draw 2 cards.
  'abyssal-disposal': {
    resolve: [
      { do: 'choose', from: { zone: 'deck', controller: 'you', type: 'Creature' }, as: 'c', prompt: 'Abyssal Disposal: choose a creature from your deck to send to your discard pile' },
      { do: 'moveToDiscard', target: 'var:c' },
      { do: 'shuffleDeck' },
      { do: 'if', cond: { count: { zone: 'orbs', controller: 'you' }, atLeast: 4 }, then: [{ do: 'draw', n: 2 }] },
    ],
  },
  // Play a Spell or Incantation from your discard pile. Pay its cost.
  'echoes-of-the-past': {
    resolve: [
      { do: 'choose', from: { zone: 'discard', controller: 'you', types: ['Spell', 'Incantation'], other: true }, as: 'e', optional: true, prompt: 'Echoes of the Past: choose a Spell or Incantation in your discard pile to play' },
      { do: 'if', cond: { varSet: 'e' }, then: [{ do: 'may', prompt: 'Echoes of the Past: pay its cost and play it?', cost: { costOf: 'var:e' }, then: [{ do: 'castCard', target: 'var:e' }] }] },
    ],
  },
  // Copy your next Spell or Incantation. You may choose new targets for the copy.
  'mimicry-magic': { resolve: [{ do: 'copyNext' }] },
  // Add 1 mana for each of your creatures with +X/+Y counters.
  'parasitic-society': { resolve: [{ do: 'addMana', n: { count: { ...yourCreatures, statCounters: true } } }] },
  // Return all creatures to their owners' hands (tokens cease to exist).
  ragnarok: { resolve: [{ do: 'bounceAll', filter: { type: 'Creature', controller: 'any' } }] },
  // Deal X damage to a creature or player (X = your creatures' total attack); X > 6: CRITICAL. A player may block and boost.
  'raining-arrows': { resolve: [{ do: 'rainingArrows' }] },
  // Pay 2 - Become a copy of target creature or artifact until the end of the turn.
  'shifting-relic': {
    activated: [
      {
        label: 'Pay 2: become a copy of a creature or Artifact until the end of the turn',
        cost: { mana: 2 },
        condition: { count: { types: ['Creature', 'Artifact'], controller: 'any', other: true }, atLeast: 1 },
        effects: [
          { do: 'choose', from: { zone: 'field', types: ['Creature', 'Artifact'], controller: 'any', other: true }, as: 'c', prompt: 'Shifting Relic: choose a creature or Artifact to copy' },
          { do: 'becomeCopy', target: 'var:c' },
        ],
      },
    ],
  },
  // Tap; your creatures get +1/+1 until the end of the turn for each Equipment you control.
  'weapons-rack': {
    activated: [
      tapFor('Tap: your creatures get +1/+1 per Equipment you control', [
        { do: 'pumpAll', filter: yourCreatures, atk: { count: { controller: 'you', equipment: true } }, def: { count: { controller: 'you', equipment: true } }, until: 'turn' },
      ]),
    ],
  },
  // Switch target creature's attack with its defense (for good; later buffs switch too).
  'confused-knight': { targets: [{ kind: 'creature', filter: { controller: 'any' }, prompt: 'Choose a creature to switch its attack and defense' }], resolve: [{ do: 'swapStats', target: 'target:0' }] },
  // OFFER the player to pay 1; otherwise negate the card being played.
  'price-of-passage': {
    targets: [{ ...anyStackCard, prompt: 'Choose a card being played' }],
    resolve: [{ do: 'offerTo', who: 'controllerOf:target:0', prompt: 'pay 1 mana, or your card is negated.', cost: 1, denied: [{ do: 'negate', target: 'target:0' }] }],
  },
  // Target permanent leaves the field. It returns at the End Phase.
  blink: { targets: [{ kind: 'permanent', filter: { controller: 'any' }, prompt: 'Choose a permanent to blink' }], resolve: [{ do: 'blink', target: 'target:0' }] },
  // Return target permanent to its owner's hand.
  bounce: { targets: [{ kind: 'permanent', filter: { controller: 'any' }, prompt: 'Choose a permanent to return to its owner\'s hand' }], resolve: [{ do: 'bounce', target: 'target:0' }] },
  // Negate target card being played and destroy 1 creature you control (sacrificed as you play it).
  'shadowbane-sacrifice': {
    targets: [
      { ...anyStackCard, prompt: 'Choose a card being played to negate' },
      { kind: 'creature', filter: { controller: 'you' }, sacrifice: true, prompt: 'Choose a creature you control to sacrifice' },
    ],
    resolve: [{ do: 'negate', target: 'target:0' }],
  },
  // Copy target card being played.
  'echoing-reflection': { targets: [{ ...anyStackCard, prompt: 'Choose a card being played to copy' }], resolve: [{ do: 'copyToken', target: 'target:0' }] },
  // Destroy all tapped creatures an opponent you battled this turn controls.
  'low-kick': {
    resolve: [
      { do: 'choosePlayer', as: 'lk', prompt: 'Low Kick: choose an opponent you fought this turn', battled: true },
      { do: 'asPlayer', who: 'pvar:lk', effects: [{ do: 'destroyAll', filter: { type: 'Creature', controller: 'you', tapped: true } }] },
    ],
  },
  // You can play Spells as though they were Incantations (they count as both).
  'book-of-spells': { statics: [{ kind: 'spellsAsIncantations' }] },
  // Whenever you cast a creature with cost 5 or more, create 1 Mana Rock.
  'mount-olympus': { triggers: [{ label: 'Mana Rock', on: 'cardPlayed', subject: { type: 'Creature', minCost: 5 }, condition: { eventPlayerIsYou: true }, effects: [{ do: 'createRock', n: 1 }] }] },
  // WHEN YOU'RE DENIED AN OFFER - tap a creature that player controls, gain 1 counter. ON 3 COUNTERS - remove them; 2 damage divided among opponents.
  'spiteful-bargain': {
    triggers: [
      {
        label: 'OFFER denied: tap their creature, gain a counter',
        on: 'offerDenied',
        condition: { eventPlayerIsYou: true },
        effects: [
          { do: 'chooseCreatureOf', who: 'eventTarget', as: 'sb', prompt: 'Spiteful Bargain: choose a creature of the player who refused to tap' },
          { do: 'tap', target: 'var:sb' },
          { do: 'counter', target: 'self', atk: 0, def: 0 },
          {
            do: 'if',
            cond: { selfCounters: 3 },
            then: [
              { do: 'removeCounters', target: 'self', n: 3 },
              { do: 'repeat', n: 2, effects: [{ do: 'choosePlayer', as: 'd', prompt: 'Spiteful Bargain: choose an opponent to take 1 damage', opponentsOnly: true }, { do: 'loseLife', who: 'pvar:d', n: 1 }] },
            ],
          },
        ],
      },
    ],
  },
  // All your Token creatures gain "Tap; add 1 mana until the end of the turn".
  'token-tide': { statics: [{ kind: 'grantAbility', filter: { ...yourCreatures, token: true }, ability: tapFor('Tap: add 1 mana (Token Tide)', [{ do: 'addMana', n: 1 }]) }] },
  // Your Upkeep effects trigger twice.
  'twin-rhythms': { statics: [{ kind: 'twinUpkeep' }] },
  // 10 Souls: once per round, an OFFER is a COMMAND for one player. 20 Souls: once per round, for everyone. (Handled by OFFER.)
  'fine-print': { statics: [] },
  // END PHASE - If at least 3 of your attacks weren't blocked this turn, deal 1 damage to any player.
  'royal-banquet': {
    triggers: [
      {
        label: '3 unblocked attacks: 1 damage to a player',
        on: 'endPhase',
        condition: { and: [{ isYourTurn: true }, { unblockedAttacks: 3 }] },
        effects: [{ do: 'choosePlayer', as: 'rb', prompt: 'Royal Banquet: choose a player to take 1 damage' }, { do: 'loseLife', who: 'pvar:rb', n: 1 }],
      },
    ],
  },
};
