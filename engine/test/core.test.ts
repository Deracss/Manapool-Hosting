import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, attackOf, createGame, defenseOf, validateDeck, whoMustAct } from '../src/index.ts';
import { act, advanceTo, attack, FILLER, giveMana, handSize, id, life, passRound, put, settle, setup, toHand } from './helpers.ts';

test('a game starts with 7 life and 7 cards, and decks must be 60 singleton cards', () => {
  const s = createGame({ players: [0, 1, 2, 3].map((i) => ({ name: `P${i}`, deck: Array(20).fill(FILLER) })), validateDecks: false });
  assert.equal(s.players.length, 4);
  for (const p of s.players) {
    assert.equal(p.life, 7);
    assert.equal(p.hand.length, 7);
  }
  assert.match(validateDeck(Array(59).fill('goblin-scout')).join(' '), /exactly 60/);
  assert.match(validateDeck(Array(60).fill('goblin-scout')).join(' '), /Only 1 copy/);
});

test('mulligan draws 6, only once', () => {
  let s = createGame({ players: [0, 1].map((i) => ({ name: `P${i}`, deck: Array(20).fill(FILLER) })), validateDecks: false });
  s = apply(s, { type: 'mulligan', player: 0 });
  assert.equal(s.players[0].hand.length, 6);
  assert.throws(() => apply(s, { type: 'mulligan', player: 0 }), /already/);
});

test('turns go clockwise; the active player draws and their Mana Orbs refill in Upkeep', () => {
  let s = setup();
  assert.equal(s.active, 0);
  assert.equal(handSize(s, 0), 8); // 7 + draw step
  const card = s.players[0].hand[0];
  s = act(s, { type: 'charge', player: 0, card });
  assert.equal(s.players[0].orbs.length, 1);
  assert.throws(() => act(s, { type: 'charge', player: 0, card: s.players[0].hand[0] }), /already charged/);
  s.players[0].orbs[0].filled = false; // spent
  s = advanceTo(s, 1);
  assert.equal(s.active, 1);
  assert.equal(s.players[0].orbs[0].filled, false, "P0's orb does not refill on P1's turn");
  s = advanceTo(s, 2);
  s = advanceTo(s, 3);
  s = advanceTo(s, 0);
  assert.equal(s.players[0].orbs[0].filled, true);
});

test('spell-speed cards only on your own Main phase; incantations when you have priority', () => {
  let s = setup();
  const goblin = toHand(s, 1, 'Goblin Recruit');
  giveMana(s, 1, 5);
  assert.throws(() => act(s, { type: 'play', player: 1, card: goblin }), /own Main phase/);
  const target = put(s, 0, 'Goblin Elder');
  const fireball = toHand(s, 1, 'Fireball');
  assert.throws(() => act(s, { type: 'play', player: 1, card: fireball, targets: [target] }), /priority/);
  // P0 plays something; P1 gets priority first (to P0's left) and can respond.
  const scout = toHand(s, 0, 'Goblin Recruit');
  giveMana(s, 0, 1);
  s = act(s, { type: 'play', player: 0, card: scout });
  assert.equal(whoMustAct(s), 1);
  s = act(s, { type: 'play', player: 1, card: fireball, targets: [target] });
  assert.equal(whoMustAct(s), 2, 'priority moves to the left of whoever added last');
  s = settle(s);
  assert.ok(!s.perms[target], 'Fireball destroyed the 1/2');
  assert.ok(s.players[0].field.some((i) => s.cards[i].cardId === 'goblin-recruit'));
});

test('the stack resolves last in, first out: No! negates Fireball', () => {
  let s = setup();
  const target = put(s, 0, 'Goblin Elder');
  const fireball = toHand(s, 1, 'Fireball');
  const no = toHand(s, 0, 'No!');
  giveMana(s, 0, 5);
  giveMana(s, 1, 5);
  // P0 ends their Main phase; P1 responds with Fireball, P0 answers with No!
  s = act(s, { type: 'pass', player: 0 });
  s = act(s, { type: 'play', player: 1, card: fireball, targets: [target] });
  while (whoMustAct(s) !== 0) s = act(s, { type: 'pass', player: whoMustAct(s)! });
  s = act(s, { type: 'play', player: 0, card: no, targets: [fireball] });
  s = passRound(s);
  assert.ok(s.perms[target], 'Elder survived');
  assert.ok(s.players[1].discard.includes(fireball));
  assert.ok(s.log.some((l) => l.includes('Fireball is negated')));
});

test('effect damage kills at 0 defense and wears off at end of turn', () => {
  let s = setup();
  const tough = put(s, 1, 'Groot, Goblin Mercenary'); // 1/3
  const fb = toHand(s, 0, 'Fireball');
  giveMana(s, 0, 2);
  s = act(s, { type: 'play', player: 0, card: fb, targets: [tough] });
  s = settle(s);
  assert.ok(!s.perms[tough], '3 damage on 3 defense destroys it');

  s = setup();
  put(s, 1, 'Goblin Shaman');
  const groot = put(s, 1, 'Groot, Goblin Mercenary'); // 1/3, +1/+1 from Shaman = 2/4
  assert.equal(defenseOf(s, groot), 4);
  const fb2 = toHand(s, 0, 'Fireball');
  giveMana(s, 0, 2);
  s = act(s, { type: 'play', player: 0, card: fb2, targets: [groot] });
  s = settle(s);
  assert.equal(defenseOf(s, groot), 1, 'survives with 1 defense left');
  s = advanceTo(s, 1);
  assert.equal(defenseOf(s, groot), 4, 'damage is gone after the turn ends');
});

test('summoning sickness stops attacks; HASTE ignores it', () => {
  const s = setup();
  const sick = put(s, 0, 'Goblin Elder', { sick: true });
  const hasty = put(s, 0, 'Goblin Rusher', { sick: true });
  assert.throws(() => act(s, { type: 'attack', player: 0, attacker: sick, target: 1 }), /summoning sickness/);
  const after = attack(s, 0, hasty, 1);
  assert.equal(life(after, 1), 6);
});

test('unblocked attack: defender loses 1 life and draws a card', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Elder');
  const before = handSize(s, 1);
  s = attack(s, 0, a, 1);
  assert.equal(life(s, 1), 6);
  assert.equal(handSize(s, 1), before + 1);
  assert.equal(s.perms[a].tapped, true);
});

test('blocked: higher attack kills the blocker and costs 1 life; equal kills with no damage; lower does nothing', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Marksman'); // 3/2 CRITICAL
  const b = put(s, 1, 'Goblin Elder'); // 1/2
  s = attack(s, 0, a, 1, { block: b });
  assert.ok(!s.perms[b]);
  assert.equal(life(s, 1), 6);

  s = setup();
  const a2 = put(s, 0, 'Goblin Rusher'); // 2/1
  const b2 = put(s, 1, 'Goblin Elder'); // 1/2
  s = attack(s, 0, a2, 1, { block: b2 });
  assert.ok(!s.perms[b2]);
  assert.equal(life(s, 1), 7);
  assert.ok(s.perms[a2], 'the attacker never dies in a clash');

  s = setup();
  const a3 = put(s, 0, 'Goblin Scout'); // 1/1
  const b3 = put(s, 1, 'Groot, Goblin Mercenary'); // 1/3
  s = attack(s, 0, a3, 1, { block: b3 });
  assert.ok(s.perms[b3] && s.perms[a3]);
  assert.equal(life(s, 1), 7);
});

test('tapped creatures cannot block', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Elder');
  const tapped = put(s, 1, 'Goblin Shaman', { tapped: true });
  s = act(s, { type: 'attack', player: 0, attacker: a, target: 1 });
  s = passRound(s);
  assert.equal(s.decision, null, 'no block decision when nothing can block');
  assert.throws(() => act(s, { type: 'block', player: 1, blocker: tapped }));
});

test('boosting: each tapped creature adds +1, sick creatures can boost, defenders boost their defending creature', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Scout'); // 1/1
  const helper = put(s, 0, 'Goblin Elder', { sick: true });
  const b = put(s, 1, 'Goblin Elder'); // 1/2
  s = attack(s, 0, a, 1, { block: b, atkBoost: [helper] });
  assert.ok(!s.perms[b], '1 + 1 boost = 2 kills the 2-defense blocker');
  assert.equal(s.perms[helper].tapped, true);

  s = setup();
  const a2 = put(s, 0, 'Goblin Rusher'); // 2/1
  const blocker = put(s, 1, 'Goblin Elder'); // 1/2
  const helper2 = put(s, 1, 'Goblin Token');
  s = attack(s, 0, a2, 1, { block: blocker, defBoost: [helper2] });
  assert.ok(s.perms[blocker], '2 attack vs 2 + 1 boost: the blocker survives');
  assert.equal(s.perms[helper2].tapped, true);

  s = setup();
  const a3 = put(s, 0, 'Goblin Rusher');
  put(s, 1, 'Goblin Token', { tapped: true });
  const spare = put(s, 1, 'Goblin Token');
  s = act(s, { type: 'attack', player: 0, attacker: a3, target: 1 });
  s = passRound(s);
  s = act(s, { type: 'block', player: 1, blocker: null });
  s = passRound(s);
  assert.equal(s.decision, null, 'no defense boost without a defending creature');
  s = settle(s);
  assert.equal(life(s, 1), 6);
  assert.equal(s.perms[spare].tapped, false);
});

test('CRITICAL: the defender does not draw', () => {
  let s = setup();
  const m = put(s, 0, 'Goblin Marksman');
  const before = handSize(s, 1);
  s = attack(s, 0, m, 1);
  assert.equal(life(s, 1), 6);
  assert.equal(handSize(s, 1), before);
});

test('VIGILANCE does not tap; EVASIVE cannot be blocked; FACEOFF attacks a creature', () => {
  let s = setup();
  const groot = put(s, 0, 'Groot, Goblin Mercenary');
  put(s, 0, 'Goblin Token');
  put(s, 1, 'Goblin Elder');
  s = act(s, { type: 'attack', player: 0, attacker: groot, target: 1 });
  s = settle(s);
  assert.equal(s.perms[groot].tapped, false);
  assert.equal(life(s, 1), 6, 'no block step for EVASIVE');

  s = setup();
  const g = put(s, 0, 'Goblin Elder');
  const victim = put(s, 1, 'Goblin Scout');
  assert.throws(() => act(s, { type: 'attack', player: 0, attacker: g, target: 1, targetCreature: victim }), /FACEOFF/);
});

test('Swords Up! can only be played during a clash', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Scout'); // 1/1
  const b = put(s, 1, 'Goblin Elder'); // 1/2
  const swords = toHand(s, 0, 'Swords Up!');
  giveMana(s, 0, 1);
  assert.throws(() => act(s, { type: 'play', player: 0, card: swords, targets: [a] }), /clash/);
  s = act(s, { type: 'attack', player: 0, attacker: a, target: 1 });
  s = settle(s, { block: b });
  assert.ok(s.perms[b], 'without Swords Up! the 1/1 bounces off');

  s = setup();
  const a2 = put(s, 0, 'Goblin Scout');
  const b2 = put(s, 1, 'Goblin Elder');
  const sw = toHand(s, 0, 'Swords Up!');
  giveMana(s, 0, 1);
  s = act(s, { type: 'attack', player: 0, attacker: a2, target: 1 });
  s = passRound(s);
  s = act(s, { type: 'block', player: 1, blocker: b2 });
  // nobody has creatures left to boost, so we go straight to the post-boost window;
  // after boosting, priority starts with P1 (left of the attacker); everyone passes back to P0
  while (whoMustAct(s) !== 0) s = act(s, { type: 'pass', player: whoMustAct(s)! });
  s = act(s, { type: 'play', player: 0, card: sw, targets: [a2] });
  assert.equal(attackOf(s, a2), 1, 'not resolved yet');
  s = settle(s);
  assert.ok(!s.perms[b2], '1 + 2 = 3 beats 2 defense');
  assert.equal(life(s, 1), 6);
});

test('players at 0 life are eliminated with their permanents; last one standing wins', () => {
  let s = setup({ players: 2 });
  s.players[1].life = 1;
  const keep = put(s, 1, 'Goblin Shaman', { tapped: true });
  const a = put(s, 0, 'Goblin Elder');
  s = attack(s, 0, a, 1);
  assert.equal(s.players[1].eliminated, true);
  assert.ok(!s.perms[keep]);
  assert.equal(s.winner, 0);
  assert.equal(s.phase, 'over');
});

test('drawing from an empty deck eliminates you', () => {
  let s = setup({ players: 3 });
  // P1 has 1 card left; they draw it on their turn, then lose on their next draw.
  s.players[1].deck = s.players[1].deck.slice(0, 1);
  s = advanceTo(s, 1);
  assert.equal(s.players[1].deck.length, 0);
  s = advanceTo(s, 2);
  s = advanceTo(s, 0);
  s = advanceTo(s, 2); // P1's turn comes first: their draw step eliminates them
  assert.equal(s.players[1].eliminated, true);
  assert.equal(s.active, 2, 'play continues with the next player');
  assert.ok(s.log.some((l) => l.includes('P1 is eliminated: had to draw from an empty deck')));
});

test('apply() never changes the state it was given', () => {
  const s = setup();
  const snapshot = JSON.stringify(s);
  const card = s.players[0].hand[0];
  apply(s, { type: 'charge', player: 0, card });
  assert.equal(JSON.stringify(s), snapshot);
  assert.equal(id('Goblin Scout'), 'goblin-scout');
});

test('the stack resolves one item at a time, like MTG: players can respond between items', () => {
  let s = setup();
  const elder = put(s, 1, 'Goblin Elder'); // 1/2
  const groot = put(s, 1, 'Groot, Goblin Mercenary'); // 1/3
  const fb1 = toHand(s, 0, 'Fireball');
  const fb2 = toHand(s, 2, 'Fireball');
  giveMana(s, 0, 2);
  giveMana(s, 2, 2);
  s = act(s, { type: 'play', player: 0, card: fb1, targets: [elder] });
  s = passRound(s);
  assert.ok(!s.perms[elder], 'Fireball resolved');
  assert.equal(s.stack.length, 0);
  assert.equal(s.window, null, 'empty stack in Main: control returns to the active player');
  // Now with two items: after the top one resolves, the active player gets priority again.
  const fb3 = toHand(s, 0, 'Fireball');
  giveMana(s, 0, 2);
  s = act(s, { type: 'play', player: 0, card: fb3, targets: [groot] });
  s = act(s, { type: 'pass', player: 1 });
  s = act(s, { type: 'play', player: 2, card: fb2, targets: [groot] });
  s = passRound(s); // P2's Fireball (top) resolves: 3 damage on 3 defense
  assert.ok(!s.perms[groot]);
  assert.equal(s.stack.length, 1, "P0's Fireball is still waiting");
  assert.equal(whoMustAct(s), 0, 'the active player gets priority after each resolution');
});

test('mana: pay automatically (floating, Orbs, then Rocks; Corrupted Mana is kept) or choose exactly what to spend', () => {
  let s = setup();
  const p = s.players[0];
  const card = p.hand[0];
  s = act(s, { type: 'charge', player: 0, card });
  s.players[0].rocks = 1;
  s.players[0].corruptedRocks = 1;
  const g = toHand(s, 0, 'Goblin Rusher'); // cost 2
  s = act(s, { type: 'play', player: 0, card: g });
  assert.equal(s.players[0].orbs[0].filled, false, 'Orb used first');
  assert.equal(s.players[0].rocks, 0, 'then the Mana Rock');
  assert.equal(s.players[0].corruptedRocks, 1, 'Corrupted Mana only pays for creatures from the discard pile');
  s = settle(s);

  s = setup();
  s = act(s, { type: 'charge', player: 0, card: s.players[0].hand[0] });
  s.players[0].rocks = 2;
  const orb = s.players[0].orbs[0].iid;
  const g2 = toHand(s, 0, 'Goblin Rusher');
  assert.throws(() => act(s, { type: 'play', player: 0, card: g2, pay: ['rock'] }), /costs 2/);
  assert.throws(() => act(s, { type: 'play', player: 0, card: g2, pay: ['corrupted', 'rock'] }), /Corrupted/);
  s = act(s, { type: 'play', player: 0, card: g2, pay: ['rock', 'rock'] });
  assert.equal(s.players[0].rocks, 0);
  assert.equal(s.players[0].orbs.find((o) => o.iid === orb)!.filled, true, 'the Orb was not touched');
});

test('activated abilities are Incantation speed unless the card says otherwise', () => {
  let s = setup();
  const rec = put(s, 1, 'Goblin Recruiter');
  // It's P0's turn; P1 uses Recruiter when P0 ends their Main phase.
  s = act(s, { type: 'pass', player: 0 });
  assert.equal(whoMustAct(s), 1);
  s = act(s, { type: 'activate', player: 1, card: rec });
  s = passRound(s);
  assert.ok(s.players[1].field.some((i) => s.cards[i].cardId === 'goblin-token'));
});
