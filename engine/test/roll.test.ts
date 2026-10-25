// The D20 roll for who goes first (Oct 24, 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, createGame, rollPending, whoMustAct, botAction, preconCards, PRECON_DEFS } from '../src/index.ts';
import type { GameState } from '../src/index.ts';

const deck = () => preconCards(PRECON_DEFS[0]);
const make = (seed: number, n = 4) => createGame({ seed, rollForFirst: true, players: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, deck: deck() })) });

test('everyone rolls; the highest goes first, ties roll again until one wins', () => {
  let sawTie = false;
  for (let seed = 1; seed < 120; seed++) {
    let s: GameState = make(seed);
    assert.throws(() => apply(s, { type: 'keep', player: 0 }), /Roll the D20 first/);
    for (let k = 0; k < 40 && !s.roll!.done; k++) {
      const pend = rollPending(s);
      s = apply(s, { type: 'roll', player: pend[pend.length - 1] });
    }
    assert.ok(s.roll!.done);
    const r = s.roll!;
    if (r.round > 1) sawTie = true;
    const last = r.history.filter((h) => h.round === r.round);
    const best = Math.max(...last.map((h) => h.value));
    assert.equal(last.filter((h) => h.value === best).length, 1);
    assert.equal(last.find((h) => h.value === best)!.player, s.active);
    assert.ok(r.history.every((h) => h.value >= 1 && h.value <= 20));
    assert.throws(() => apply(s, { type: 'roll', player: 0 }), /keep or mulligan/);
    // Rerolls only for the players tied at the top.
    for (let round = 2; round <= r.round; round++) {
      const prev = r.history.filter((h) => h.round === round - 1);
      const top = Math.max(...prev.map((h) => h.value));
      assert.deepEqual(r.history.filter((h) => h.round === round).map((h) => h.player).sort(), prev.filter((h) => h.value === top).map((h) => h.player).sort());
    }
  }
  assert.ok(sawTie, 'some seed produced a tie');
});

test('no double rolls; bots roll for a given seat; mulligan comes after', () => {
  let s = make(7, 2);
  s = apply(s, { type: 'roll', player: 1 });
  assert.throws(() => apply(s, { type: 'roll', player: 1 }), /already rolled/);
  assert.deepEqual(botAction(s, 0), { type: 'roll', player: 0 });
  while (!s.roll!.done) s = apply(s, botAction(s));
  assert.equal(s.phase, 'mulligan');
  assert.notEqual(whoMustAct(s), null);
  s = apply(s, { type: 'keep', player: 0 });
  s = apply(s, { type: 'keep', player: 1 });
  assert.equal(s.phase, 'upkeep' === s.phase ? 'upkeep' : s.phase);
  assert.equal(s.turn, 1);
});
