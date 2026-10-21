// Scripts for the Druid tribe and other cards about charging mana.
// "On ManaCharge" means whenever you charge a card (by the turn's charge or by an effect).
import type { CardScript, Effect, Filter } from '../types.ts';

const youCharge: Filter = { controller: 'you' };
const yourOrbs: Filter = { zone: 'orbs', controller: 'you' };
const destroyOneOfYourOrbs: Effect[] = [
  { do: 'choose', from: yourOrbs, as: 'orb', prompt: 'Choose one of your Mana Orbs to destroy' },
  { do: 'destroyOrb', target: 'var:orb' },
];

export const druidScripts: Record<string, CardScript> = {
  // On ManaCharge may pay X to create a copy of the card charged. X is the card's cost.
  'druids-1': {
    triggers: [
      {
        label: 'Copy the charged card',
        on: 'charge',
        subject: youCharge,
        effects: [{ do: 'may', prompt: 'Pay its cost to create a copy of the card you charged?', cost: { costOf: 'eventSubject' }, then: [{ do: 'copyToken', target: 'eventSubject' }] }],
      },
    ],
  },

  // On ManaCharge gain a +1/1 counter.
  'druids-2': {
    triggers: [{ label: '+1/+1 counter', on: 'charge', subject: youCharge, effects: [{ do: 'counter', target: 'self', atk: 1, def: 1 }] }],
  },

  // Once per turn, may return 1 card from the mana pool to the hand and ManaCharge 1 card from the hand.
  'druids-3': {
    activated: [
      {
        label: 'Swap a Mana Orb with a card in your hand',
        cost: {},
        oncePerTurn: true,
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

  // ON CHARGE THIS CARD - Reveal this card and draw 1 card.
  'mana-sage': {
    triggers: [{ label: 'Reveal and draw', on: 'charge', subject: 'self', effects: [{ do: 'reveal', target: 'self' }, { do: 'draw', n: 1 }] }],
  },

  // You may charge an extra card per turn from your hand.
  cloudwhisper: { statics: [{ kind: 'extraCharge', n: 1 }] },

  // PAY 2 - Untap this card. Destroy 1 mana ; Gain +2/2.
  // Two abilities: "Pay 2: untap this card" and "Destroy 1 of your Mana Orbs: +2/+2" (permanent, but not a counter).
  'el-crow-druid': {
    activated: [
      { label: 'Pay 2: untap', cost: { mana: 2 }, effects: [{ do: 'untap', target: 'self' }] },
      {
        label: 'Destroy a Mana Orb: +2/+2',
        cost: {},
        condition: { count: yourOrbs, atLeast: 1 },
        effects: [...destroyOneOfYourOrbs, { do: 'pump', target: 'self', atk: 2, def: 2, until: 'permanent' }],
      },
    ],
  },

  // TAP - Add X mana to your Mana Pool equal to the amount of Mana Cards in your Mana Pool.
  'druids-4': {
    activated: [{ label: 'Add mana for each Mana Orb', cost: { tap: true }, effects: [{ do: 'addMana', n: { count: yourOrbs } }] }],
  },

  // TAP - Fill 1 mana from your ManaPool.
  'druids-5': {
    activated: [{ label: 'Refill a Mana Orb', cost: { tap: true }, condition: { count: { ...yourOrbs, orbFilled: false }, atLeast: 1 }, effects: [{ do: 'fillOrb', n: 1 }] }],
  },

  // Whenever you charge mana you may draw a card.
  'mana-droid': {
    triggers: [{ label: 'You may draw', on: 'charge', subject: youCharge, effects: [{ do: 'may', prompt: 'Draw a card?', then: [{ do: 'draw', n: 1 }] }] }],
  },

  // You may play an extra mana card during your turn.
  'vendor-street': { statics: [{ kind: 'extraCharge', n: 1 }] },

  // You can CHARGE an additional time during your Main Phase.
  'anthem-1': { statics: [{ kind: 'extraCharge', n: 1 }] },

  // Charge 1 mana from your hand.
  'mana-ramp': {
    resolve: [
      { do: 'choose', from: { zone: 'hand', controller: 'you' }, as: 'c', prompt: 'Choose a card from your hand to charge' },
      { do: 'chargeCard', target: 'var:c' },
    ],
  },

  // Charge 1 mana from the top of your deck.
  'cosmic-channeling': { resolve: [{ do: 'chargeFromDeck' }] },
};
