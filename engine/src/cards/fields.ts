// Field scripts. A Field's abilities belong to the player who chose it.
import type { CardScript } from '../types.ts';

export const fieldScripts: Record<string, CardScript> = {
  // The first time you attack during your turn, draw 1 card. The third time you attack during your turn,
  // attacking creature gains CRITICAL, if it already has CRITICAL, it gains DOUBLESTRIKE.
  forest: {
    triggers: [
      {
        label: 'Forest: first attack draws',
        on: 'attackDeclared',
        subject: { controller: 'you' },
        condition: { and: [{ isYourTurn: true }, { eventAttackNumber: 1 }] },
        effects: [{ do: 'draw', n: 1 }],
      },
      {
        label: 'Forest: third attack sharpens',
        on: 'attackDeclared',
        subject: { controller: 'you' },
        condition: { and: [{ isYourTurn: true }, { eventAttackNumber: 3 }] },
        effects: [
          {
            do: 'if',
            cond: { hasKeyword: ['eventSubject', 'CRITICAL'] },
            then: [{ do: 'grant', target: 'eventSubject', keyword: 'DOUBLE STRIKE', until: 'battle' }],
            else: [{ do: 'grant', target: 'eventSubject', keyword: 'CRITICAL', until: 'battle' }],
          },
        ],
      },
    ],
  },
  // The first time a creature in your field is destroyed in a turn, draw a card. The second time, add 1 mana
  // until the end of the turn. The third time, until the End Phase you may play a card from your discard pile
  // (Corrupted Mana can help pay).
  graveyard: {
    triggers: [
      {
        label: 'Graveyard',
        on: 'destroyed',
        subject: { type: 'Creature' },
        condition: { eventPlayerIsYou: true },
        effects: [
          { do: 'countThisTurn', key: 'deaths', as: 'k' },
          { do: 'if', cond: { varIs: ['k', 1] }, then: [{ do: 'draw', n: 1 }] },
          { do: 'if', cond: { varIs: ['k', 2] }, then: [{ do: 'addMana', n: 1 }] },
          { do: 'if', cond: { varIs: ['k', 3] }, then: [{ do: 'allowDiscardPlay', n: 1 }] },
        ],
      },
    ],
  },
};
