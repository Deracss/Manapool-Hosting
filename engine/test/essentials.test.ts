import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackOf, availableMana, defenseOf, keywordsOf } from '../src/index.ts';
import { act, advanceTo, attack, fieldNames, giveMana, handSize, life, put, settle, setup, toDeckTop, toHand } from './helpers.ts';
import type { GameState, Iid } from '../src/index.ts';

const play = (s: GameState, pid: number, name: string, targets: string[] = [], mana = 10) => {
  const c = toHand(s, pid, name);
  giveMana(s, pid, mana);
  return act(s, { type: 'play', player: pid, card: c, targets });
};
const activate = (s: GameState, pid: number, card: Iid, ability = 0) => act(s, { type: 'activate', player: pid, card, ability });
const discardOf = (s: GameState, pid: number) => s.players[pid].discard.map((i) => s.cards[i].cardId);

test("Nature's Dance: may draw an extra card in your draw step", () => {
  let s = setup();
  put(s, 0, "Nature's Dance");
  s = advanceTo(s, 1);
  s = advanceTo(s, 0, { confirm: true });
  // P0's turn: 1 normal draw + 1 extra; it is checked from the turn's log
  assert.ok(s.log.filter((l) => l.startsWith(`[T${s.turn}]`)).filter((l) => l.includes('P0 draws 1 card')).length >= 2);
});

test('War Cry: your creatures get +1/+1; Tavern: creatures cost 1 less', () => {
  let s = setup();
  put(s, 0, 'War Cry');
  const e = put(s, 0, 'Goblin Elder');
  const theirs = put(s, 1, 'Goblin Elder');
  assert.equal(attackOf(s, e), 2);
  assert.equal(defenseOf(s, e), 3);
  assert.equal(attackOf(s, theirs), 1);
  put(s, 0, 'Tavern');
  const rusher = toHand(s, 0, 'Goblin Rusher'); // cost 2
  giveMana(s, 0, 1);
  s = act(s, { type: 'play', player: 0, card: rusher });
  assert.equal(availableMana(s, 0), 0);
});

test('Humans: Dual Channeler, Meditating Monk and Mischievous Child tap for cards and mana', () => {
  let s = setup();
  const dual = put(s, 0, 'Dual Channeler');
  const monk = put(s, 0, 'Meditating Monk');
  const child = put(s, 0, 'Mischievous Child');
  const hand = handSize(s, 0);
  s = settle(activate(s, 0, monk));
  s = settle(activate(s, 0, child));
  s = settle(activate(s, 0, dual, 1));
  assert.equal(s.players[0].floating, 2);
  assert.equal(handSize(s, 0), hand + 1);
  assert.throws(() => activate(s, 0, dual, 0), /tapped/);
});

test("Angel's Protection, Divine judgment and Topple the Mighty", () => {
  let s = setup();
  const groot = put(s, 1, 'Groot, Goblin Mercenary'); // cost 4
  const big = put(s, 1, 'Goblin Flanker'); // cost 5
  assert.throws(() => play(s, 0, 'Divine judgment', [big]), /legal target/);
  s = settle(play(s, 0, 'Divine judgment', [groot]));
  assert.ok(!s.perms[groot]);
  s = settle(play(s, 0, "Angel's Protection", [big]));
  assert.ok(keywordsOf(s, big).includes('INDESTRUCTIBLE'));
  s = settle(play(s, 0, 'Topple the Mighty', [big]));
  assert.ok(s.perms[big], 'INDESTRUCTIBLE until end of turn');
  s = advanceTo(s, 1);
  assert.ok(!keywordsOf(s, big).includes('INDESTRUCTIBLE'));
});

test('Morale Boost: during a clash, choose +2 attack or +2 defense', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Scout'); // 1/1
  const b = put(s, 1, 'Goblin Elder'); // 1/2
  const mb = toHand(s, 0, 'Morale Boost');
  giveMana(s, 0, 2);
  s = act(s, { type: 'attack', player: 0, attacker: a, target: 1 });
  s = settle(s, { block: b }); // runs through combat; no boost
  assert.ok(s.perms[b]);
  s = setup();
  const a2 = put(s, 0, 'Goblin Scout');
  const b2 = put(s, 1, 'Goblin Elder');
  const mb2 = toHand(s, 0, 'Morale Boost');
  giveMana(s, 0, 2);
  s = act(s, { type: 'attack', player: 0, attacker: a2, target: 1 });
  for (let i = 0; i < 4 && s.window; i++) s = act(s, { type: 'pass', player: s.window!.holder });
  s = act(s, { type: 'block', player: 1, blocker: b2 });
  // after-block window: active player has priority
  s = act(s, { type: 'play', player: 0, card: mb2, targets: [a2] });
  s = settle(s, { mode: 0 });
  assert.ok(!s.perms[b2], '1 + 2 attack beats 2 defense');
  void mb;
});

test('End of War destroys every creature; Summoning Seal negates a creature', () => {
  let s = setup();
  put(s, 0, 'Goblin Elder');
  put(s, 1, 'Goblin Scout');
  const artifact = put(s, 1, 'Mana Tree');
  s = settle(play(s, 0, 'End of War'));
  assert.equal(Object.keys(s.perms).length, 1);
  assert.ok(s.perms[artifact]);

  s = setup();
  const seal = toHand(s, 1, 'Summoning Seal');
  giveMana(s, 1, 2);
  const creature = toHand(s, 0, 'Goblin Rusher');
  giveMana(s, 0, 2);
  s = act(s, { type: 'play', player: 0, card: creature });
  s = act(s, { type: 'play', player: 1, card: seal, targets: [creature] });
  s = settle(s);
  assert.ok(!s.perms[creature]);
  assert.ok(discardOf(s, 0).includes('goblin-rusher'));
});

test('Forgotten Memory and Creature Retrieval take cards back from your discard pile', () => {
  let s = setup();
  const scout = put(s, 0, 'Goblin Scout');
  s = settle(play(s, 1 === 1 ? 0 : 0, 'Fireball', [scout]));
  const before = handSize(s, 0);
  s = settle(play(s, 0, 'Forgotten Memory'), { choose: (d) => d.options.find((o) => s.cards[o].cardId === 'goblin-scout') ?? d.options[0] });
  assert.ok(s.players[0].hand.some((i) => s.cards[i].cardId === 'goblin-scout'));
  assert.ok(handSize(s, 0) >= before);
});

test('Divide and Conquer: 5 damage split among creatures, one at a time', () => {
  let s = setup();
  const a = put(s, 1, 'Goblin Elder'); // 2 def
  const b = put(s, 1, 'Groot, Goblin Mercenary'); // 3 def
  let picks = 0;
  s = settle(play(s, 0, 'Divide and Conquer'), { choose: (d) => (picks++ < 2 ? a : d.options.includes(b) ? b : d.options[0]) });
  assert.ok(!s.perms[a] && !s.perms[b], '2 + 3 damage destroys both');
});

test('Research: GUIDE 2 (reorder or bottom), then draw', () => {
  let s = setup();
  const x = toDeckTop(s, 0, 'Goblin Scout');
  const y = toDeckTop(s, 0, 'Goblin Elder'); // y on top, then x
  s = play(s, 0, 'Research');
  s = settle(s, { guide: (cards) => ({ top: [cards[1]], bottom: [cards[0]] }) });
  assert.ok(s.players[0].hand.includes(x), 'x was put on top, then drawn');
  assert.equal(s.players[0].deck.at(-1), y, 'y went to the bottom');
});

test("Adeventurer's Breakfast, Reinforcements, Out of Bullets, Rinse, Two for one", () => {
  let s = setup({ deckSize: 40 });
  for (let i = 0; i < 4; i++) s.players[0].orbs.push({ iid: s.players[0].hand.pop()!, filled: false });
  let h = handSize(s, 0);
  s = settle(play(s, 0, "Adeventurer's Breakfast"));
  assert.equal(handSize(s, 0), h + 2, 'draws 2 (4 Orbs)');
  put(s, 0, 'Goblin Scout');
  put(s, 0, 'Goblin Elder');
  h = handSize(s, 0);
  s = settle(play(s, 0, 'Reinforcements'));
  assert.equal(handSize(s, 0), h + 2);
  h = handSize(s, 0);
  s = settle(play(s, 0, 'Out of Bullets'));
  assert.equal(handSize(s, 0), h, 'discarded h, drew h');
  h = handSize(s, 0);
  s = settle(play(s, 0, 'Two for one'));
  assert.equal(handSize(s, 0), h + 4, 'draws 3, then 1 more for the life lost');
  assert.equal(life(s, 0), 6);
});

test('Disarm, Educated Civilian, Replica Creation', () => {
  let s = setup();
  const tree = put(s, 1, 'Mana Tree');
  const cry = put(s, 1, 'War Cry');
  assert.throws(() => play(s, 0, 'Disarm', [cry]), /legal target/);
  s = settle(play(s, 0, 'Replica Creation', [tree]));
  assert.equal(fieldNames(s, 0).filter((x) => x === 'mana-tree').length, 1, 'copied for you');
  s = settle(play(s, 0, 'Disarm', [tree]));
  s = settle(play(s, 0, 'Educated Civilian', [cry]));
  assert.ok(!s.perms[tree] && !s.perms[cry]);
});

test('Mana artifacts: Mana Tree, Elemental Well, Insight Orb, Sleight of Hand, Crystal Nexus, Corrupted Mana Tree', () => {
  let s = setup();
  const ids = ['Mana Tree', 'Elemental Well', 'Insight Orb', 'Sleight of Hand', 'Crystal Nexus'].map((n) => put(s, 0, n));
  const h = handSize(s, 0);
  for (const i of ids) s = settle(activate(s, 0, i));
  assert.equal(s.players[0].floating, 4);
  assert.equal(handSize(s, 0), h + 2);
  assert.equal(s.players[0].rocks, 1);
  const cmt = put(s, 0, 'Corrupted Mana Tree');
  s = settle(activate(s, 0, cmt));
  assert.equal(s.players[0].corruptedRocks, 1);
});

test('Mana Portal swaps an Orb with a hand card once per round; Mana Conductor makes 2 Rocks', () => {
  let s = setup();
  const portal = put(s, 0, 'Mana Portal');
  const orbCard = s.players[0].hand[0];
  s = act(s, { type: 'charge', player: 0, card: orbCard });
  s = settle(activate(s, 0, portal, 1));
  assert.ok(s.players[0].hand.includes(orbCard));
  assert.throws(() => activate(s, 0, portal, 1), /once per round/);
  const cond = put(s, 0, 'Mana Conductor');
  const deckLen = s.players[0].deck.length;
  s = settle(activate(s, 0, cond));
  assert.equal(s.players[0].rocks, 2);
  assert.equal(s.players[0].deck.length, deckLen + 1);
});

test('Dark Dealings destroys an Orb for mana; Mana Surge; Mana Processing Unit counts half the Artifacts', () => {
  let s = setup();
  const dd = put(s, 0, 'Dark Dealings');
  s = act(s, { type: 'charge', player: 0, card: s.players[0].hand[0] });
  s = settle(activate(s, 0, dd, 1));
  assert.equal(s.players[0].orbs.length, 0);
  assert.equal(s.players[0].floating, 1);
  s = settle(play(s, 0, 'Mana surge', [], 2));
  assert.equal(s.players[0].floating, 3, 'the floating mana is spent first, then +3');
  put(s, 1, 'Mana Tree');
  put(s, 1, 'Sleight of Hand');
  put(s, 0, 'Clockwork Servitor'); // a Construct counts as an Artifact
  s.players[0].floating = 0;
  s.players[0].rocks = 5;
  s = settle(play(s, 0, 'Mana Processing Unit', [], 0));
  assert.equal(s.players[0].floating, 2, '4 Artifacts on the board (incl. Dark Dealings) → 2');
});

test('Mana Harmonics gives your creatures a Tap: add 1 mana ability', () => {
  let s = setup();
  put(s, 0, 'Mana Harmonics');
  const g = put(s, 0, 'Goblin Elder');
  s = settle(activate(s, 0, g, 0));
  assert.equal(s.players[0].floating, 1);
});

test("Gambler's Bounty flips a coin in your Upkeep", () => {
  let s = setup();
  put(s, 0, "Gambler's Bounty");
  put(s, 0, 'Goblin Elder');
  s = advanceTo(s, 1);
  s = advanceTo(s, 0, { confirm: true });
  assert.ok(s.log.some((l) => l.includes('flips a coin')));
});

test('Path of the Seer: GUIDE 2 when you charge', () => {
  let s = setup();
  put(s, 0, 'Path of the Seer');
  s = act(s, { type: 'charge', player: 0, card: s.players[0].hand[0] });
  assert.equal(s.stack.length, 1);
  s = settle(s);
  assert.ok(s.log.some((l) => l.includes('guides')));
});

test('Augmenter Drone: whenever it becomes tapped, a creature you control gets +1/+1', () => {
  let s = setup();
  const drone = put(s, 0, 'Augmenter Drone');
  const a = put(s, 0, 'Goblin Scout');
  s = attack(s, 0, a, 1, { atkBoost: [drone], choose: (d) => (d.options.includes(a) ? a : d.options[0]) });
  assert.equal(s.perms[a].counters, 1);
});
