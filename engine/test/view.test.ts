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

test('GUIDE cards and deck searches are visible to the player deciding; a revealed card is visible to everyone', async () => {
  const { apply } = await import('../src/index.ts');
  const { put, setup, toHand, giveMana } = await import('./helpers.ts');
  let s = setup();
  const c = toHand(s, 0, 'Rinse');
  giveMana(s, 0, 3);
  s = apply(s, { type: 'play', player: 0, card: c });
  for (let i = 0; i < 4 && !s.decision; i++) s = apply(s, { type: 'pass', player: s.window!.holder });
  assert.equal(s.decision?.kind, 'guide');
  const mine = viewFor(s, 0);
  if (s.decision?.kind === 'guide') {
    for (const g of s.decision.cards) assert.notEqual(mine.cards[g].cardId, HIDDEN_CARD);
    for (const g of s.decision.cards) assert.equal(viewFor(s, 1).cards[g].cardId, HIDDEN_CARD);
  }
  // Mana Sage: charging it reveals it to everyone (for that update).
  let t = setup();
  const sage = toHand(t, 0, 'Mana Sage');
  t = apply(t, { type: 'charge', player: 0, card: sage });
  let shown = false;
  for (let i = 0; i < 8 && (t.stack.length || t.window); i++) {
    t = apply(t, { type: 'pass', player: t.window!.holder });
    if (t.reveals?.some((r) => r.iid === sage)) shown = viewFor(t, 2).cards[sage].cardId === 'mana-sage';
  }
  void put;
  t = apply(t, { type: 'pass', player: 0 });
  assert.ok(shown, 'the other players see Mana Sage when it is revealed');
  assert.equal(viewFor(t, 2).cards[sage].cardId, HIDDEN_CARD, 'and it is face-down again afterwards');
});
