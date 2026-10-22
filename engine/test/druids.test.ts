import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackOf, availableMana, defenseOf } from '../src/index.ts';
import { act, advanceTo, attack, fieldNames, giveMana, handSize, put, settle, setup, toDeckTop, toHand } from './helpers.ts';

const orbIds = (s: ReturnType<typeof setup>, pid: number) => s.players[pid].orbs.map((o) => o.iid);

test('charging is a game event: Druids #2 gets a counter when you charge', () => {
  let s = setup();
  const d2 = put(s, 0, 'Druids #2'); // 0/1
  put(s, 1, 'Druids #2'); // an opponent's copy doesn't care about your charges
  s = act(s, { type: 'charge', player: 0, card: s.players[0].hand[0] });
  s = settle(s);
  assert.equal(s.perms[d2].counters, 1);
  assert.equal(attackOf(s, d2), 1);
  assert.equal(defenseOf(s, d2), 2);
  const theirs = s.players[1].field[0];
  assert.equal(s.perms[theirs].counters, 0);
});

test('Mana Sage: charging it reveals it and draws a card', () => {
  let s = setup();
  const sage = toHand(s, 0, 'Mana Sage');
  const before = handSize(s, 0);
  s = act(s, { type: 'charge', player: 0, card: sage });
  s = settle(s);
  assert.equal(handSize(s, 0), before); // -1 charged, +1 drawn
  assert.ok(orbIds(s, 0).includes(sage));
  assert.ok(s.log.some((l) => l.includes('reveals Mana Sage')));
});

test('Druids #1: may pay the charged card\'s cost to create a copy of it (any card)', () => {
  // A permanent: a token copy enters the field.
  let s = setup();
  put(s, 0, 'Druids #1');
  giveMana(s, 0, 3);
  const elder = toHand(s, 0, 'Goblin Elder'); // cost 3
  s = act(s, { type: 'charge', player: 0, card: elder });
  s = settle(s, { confirm: true });
  assert.equal(fieldNames(s, 0).filter((x) => x === 'goblin-elder').length, 1, 'token copy entered');
  assert.equal(availableMana(s, 0), 1, 'paid 3 of the 4 available (3 Rocks + the new Orb)');
  const copy = s.players[0].field.find((i) => s.cards[i].cardId === 'goblin-elder')!;
  assert.equal(s.cards[copy].isToken, true);

  // Declining costs nothing.
  s = setup();
  put(s, 0, 'Druids #1');
  giveMana(s, 0, 3);
  const elder2 = toHand(s, 0, 'Goblin Elder');
  s = act(s, { type: 'charge', player: 0, card: elder2 });
  s = settle(s, { confirm: false });
  assert.equal(fieldNames(s, 0).filter((x) => x === 'goblin-elder').length, 0);
  assert.equal(availableMana(s, 0), 4);

  // An Incantation: the copy goes on the stack with a new target, resolves, and vanishes.
  s = setup();
  put(s, 0, 'Druids #1');
  const victim = put(s, 1, 'Goblin Elder'); // 1/2
  giveMana(s, 0, 2);
  const fb = toHand(s, 0, 'Fireball');
  s = act(s, { type: 'charge', player: 0, card: fb });
  s = settle(s, { confirm: true, choose: (d) => (d.options.includes(victim) ? victim : d.options[0]) });
  assert.ok(!s.perms[victim], 'the Fireball copy destroyed the target');
  assert.ok(s.players[0].orbs.some((o) => o.iid === fb), 'the real Fireball stays charged as an Orb');
  assert.ok(!s.players[0].discard.some((i) => s.cards[i].cardId === 'fireball'), 'the copy does not go to the discard pile');

  // A Spell with no target.
  s = setup();
  put(s, 0, 'Druids #1');
  giveMana(s, 0, 2);
  const top = toDeckTop(s, 0, 'Goblin Scout');
  const cosmic = toHand(s, 0, 'Cosmic Channeling');
  s = act(s, { type: 'charge', player: 0, card: cosmic });
  s = settle(s, { confirm: true });
  assert.ok(s.players[0].orbs.some((o) => o.iid === top), 'the copy of Cosmic Channeling charged the top card');
});

test('Druids #3: once per turn, return a Mana Orb to hand and charge a card from hand (without using the turn\'s charge)', () => {
  let s = setup();
  const d3 = put(s, 0, 'Druids #3');
  const first = s.players[0].hand[0];
  s = act(s, { type: 'charge', player: 0, card: first });
  const swapIn = toHand(s, 0, 'Goblin Scout');
  s = act(s, { type: 'activate', player: 0, card: d3 });
  s = settle(s, { choose: (d) => (d.options.includes(swapIn) ? swapIn : d.options[0]) });
  assert.ok(s.players[0].hand.includes(first), 'the old Orb card is back in hand');
  assert.deepEqual(orbIds(s, 0), [swapIn]);
  assert.throws(() => act(s, { type: 'activate', player: 0, card: d3 }), /once per turn/);
  s = advanceTo(s, 0);
  s = act(s, { type: 'activate', player: 0, card: d3 });
  s = settle(s);
  assert.ok(s.log.some((l) => l.endsWith('Swap a Mana Orb with a card in your hand.') && l.startsWith(`[T${s.turn}]`)), 'usable again next turn');
});

test('Cloudwhisper and Anthem #1 each allow one more charge per turn', () => {
  let s = setup();
  s = act(s, { type: 'charge', player: 0, card: s.players[0].hand[0] });
  assert.throws(() => act(s, { type: 'charge', player: 0, card: s.players[0].hand[0] }), /already charged/);
  put(s, 0, 'Cloudwhisper');
  s = act(s, { type: 'charge', player: 0, card: s.players[0].hand[0] });
  put(s, 0, 'Anthem #1');
  s = act(s, { type: 'charge', player: 0, card: s.players[0].hand[0] });
  assert.equal(s.players[0].orbs.length, 3);
  assert.throws(() => act(s, { type: 'charge', player: 0, card: s.players[0].hand[0] }), /3 times/);
});

test('El Crow Druid: pay 2 to untap; destroy a Mana Orb for a permanent +2/+2 (not a counter)', () => {
  let s = setup();
  const crow = put(s, 0, 'El Crow Druid', { tapped: true });
  giveMana(s, 0, 2);
  s = act(s, { type: 'activate', player: 0, card: crow, ability: 0 });
  s = settle(s);
  assert.equal(s.perms[crow].tapped, false);
  assert.throws(() => act(s, { type: 'activate', player: 0, card: crow, ability: 1 }), /can't use/, 'needs a Mana Orb');
  const orbCard = s.players[0].hand[0];
  s = act(s, { type: 'charge', player: 0, card: orbCard });
  s = act(s, { type: 'activate', player: 0, card: crow, ability: 1 });
  s = settle(s);
  assert.equal(s.players[0].orbs.length, 0);
  assert.ok(s.players[0].discard.includes(orbCard), 'destroyed Orb card goes to the discard pile');
  assert.equal(attackOf(s, crow), 6);
  assert.equal(s.perms[crow].counters, 0, 'not a counter');
  s = advanceTo(s, 1);
  assert.equal(attackOf(s, crow), 6, 'the bonus is permanent');
  assert.equal(defenseOf(s, crow), 6);
});

test('Druids #4 adds mana for each Mana Orb; Druids #5 refills a used Orb', () => {
  let s = setup();
  const d4 = put(s, 0, 'Druids #4');
  const d5 = put(s, 0, 'Druids #5');
  s = act(s, { type: 'charge', player: 0, card: s.players[0].hand[0] });
  s.players[0].orbs.push({ iid: s.players[0].hand.pop()!, filled: false });
  s = act(s, { type: 'activate', player: 0, card: d4 });
  s = settle(s);
  assert.equal(s.players[0].floating, 2);
  s = act(s, { type: 'activate', player: 0, card: d5 });
  s = settle(s);
  assert.ok(s.players[0].orbs.every((o) => o.filled));
});

test('Mana Droid may draw on each charge; Mana Ramp and Cosmic Channeling charge cards (and trigger it)', () => {
  let s = setup();
  put(s, 0, 'Mana Droid');
  const before = handSize(s, 0);
  s = act(s, { type: 'charge', player: 0, card: s.players[0].hand[0] });
  s = settle(s, { confirm: true });
  assert.equal(handSize(s, 0), before);
  const ramp = toHand(s, 0, 'Mana Ramp');
  const top = toDeckTop(s, 0, 'Goblin Scout');
  const cosmic = toHand(s, 0, 'Cosmic Channeling');
  giveMana(s, 0, 4);
  s = act(s, { type: 'play', player: 0, card: cosmic });
  s = settle(s, { confirm: false });
  assert.ok(orbIds(s, 0).includes(top));
  s = act(s, { type: 'play', player: 0, card: ramp });
  s = settle(s, { confirm: false });
  assert.equal(s.players[0].orbs.length, 3);
  assert.equal(s.players[0].chargesThisTurn, 1, 'effects don\'t use up the turn\'s charge');
});

test('blocking taps the blocker', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Scout');
  const b = put(s, 1, 'Groot, Goblin Mercenary');
  s = attack(s, 0, a, 1, { block: b });
  assert.equal(s.perms[b].tapped, true);
});

test('a charged card only uses its own ON CHARGE THIS CARD ability, not its "whenever you charge" ones', () => {
  let s = setup();
  const droid = toHand(s, 0, 'Mana Droid');
  s = act(s, { type: 'charge', player: 0, card: droid });
  assert.equal(s.stack.length, 0, 'Mana Droid in the mana pool does nothing');
  assert.equal(s.decision, null);
});
