import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, PRECON_DEFS, preconCards, viewFor, HIDDEN_CARD } from '../src/index.ts';

test('a player sees their own hand but not other hands, decks or the shuffle', () => {
  const s = createGame({ seed: 7, startingPlayer: 0, players: PRECON_DEFS.slice(0, 4).map((p, i) => ({ name: `P${i}`, deck: preconCards(p), field: p.field })) });
  const v = viewFor(s, 1);
  for (const c of v.players[1].hand) assert.notEqual(v.cards[c].cardId, HIDDEN_CARD);
  for (const c of v.players[0].hand) assert.equal(v.cards[c].cardId, HIDDEN_CARD);
  for (const p of v.players) for (const c of p.deck) assert.equal(v.cards[c].cardId, HIDDEN_CARD);
  assert.equal(v.rng, 0);
  // The original is untouched.
  assert.notEqual(s.cards[s.players[0].hand[0]].cardId, HIDDEN_CARD);
});
