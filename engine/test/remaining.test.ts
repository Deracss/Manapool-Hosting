// The last Spells, Incantations and Anthems (Oct 22, 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasKeyword, getDef } from '../src/index.ts';
import { act, advanceTo, attack, fieldNames, giveMana, handSize, id, life, put, settle, setup, toDeckTop, toHand } from './helpers.ts';
import type { Choices } from './helpers.ts';
import type { GameState, Iid } from '../src/index.ts';

const play = (s: GameState, pid: number, name: string, targets: string[] = [], mana = 10) => {
  const c = toHand(s, pid, name);
  giveMana(s, pid, mana);
  return act(s, { type: 'play', player: pid, card: c, targets });
};
const run = (s: GameState, c: Choices = {}) => settle(s, c);

test('Goblin Assembly: a Goblin Token at the end of your draw step', () => {
  let s = setup({ players: 2 });
  put(s, 0, 'Goblin Assembly');
  s = advanceTo(s, 1);
  s = advanceTo(s, 0);
  assert.equal(fieldNames(s, 0).filter((x) => x === 'goblin-token').length, 1);
});

test('Counterflux Reservoir: an opponent\'s Incantation on your turn makes a Mana Rock', () => {
  let s = setup();
  put(s, 0, 'Counterflux Reservoir');
  const c = toHand(s, 0, 'Goblin Elder');
  giveMana(s, 0, 3);
  s = act(s, { type: 'play', player: 0, card: c });
  const gb = toHand(s, 1, "God's Blessing");
  giveMana(s, 1, 3);
  const rocks = s.players[0].rocks;
  s = settle(act(s, { type: 'play', player: 1, card: gb }));
  assert.equal(s.players[0].rocks, rocks + 1);
});

test('Shade: a 3/1 Illusion attacks the chosen player and stays', () => {
  let s = setup();
  s = run(play(s, 0, 'Shade', [], 3), { player: 2 });
  const ill = s.players[0].field.find((x) => s.cards[x].cardId === 'illusion');
  assert.ok(ill);
  assert.equal(life(s, 2), 6);
  assert.ok(s.perms[ill!]);
});

test('Hymn draws 1 per Anthem on the board; Choir finds an Anthem with 2 of yours out', () => {
  let s = setup();
  put(s, 0, 'Tavern');
  put(s, 1, 'Mount Olympus');
  put(s, 2, 'Twin Rhythms');
  const h = handSize(s, 0);
  s = run(play(s, 0, 'Hymn', [], 3));
  assert.equal(handSize(s, 0), h + 3);
  const a = toHand(s, 0, 'Book of Spells');
  s.players[0].hand = s.players[0].hand.filter((x) => x !== a);
  s.players[0].deck.push(a);
  put(s, 0, 'Token Tide');
  s = run(play(s, 0, 'Choir', [], 3));
  assert.ok(s.players[0].hand.includes(a));
});

test('Switching Sides trades creatures and untaps the one you get', () => {
  let s = setup();
  const mine = put(s, 0, 'Goblin Elder');
  const theirs = put(s, 1, 'Goblin Marksman', { tapped: true });
  s = run(play(s, 0, 'Switching Sides', [mine, theirs], 3));
  assert.equal(s.perms[mine].controller, 1);
  assert.equal(s.perms[theirs].controller, 0);
  assert.equal(s.perms[theirs].tapped, false);
});

test('Goblin Soup: 1 damage per sacrificed Goblin to each creature of the chosen opponent', () => {
  let s = setup();
  const g1 = put(s, 0, 'Goblin Token');
  const g2 = put(s, 0, 'Goblin Token');
  const keep = put(s, 0, 'Goblin Elder');
  const a = put(s, 1, 'Goblin Marksman'); // 3/2
  const b = put(s, 1, 'Inspired Vampire'); // 1/4
  const other = put(s, 2, 'Goblin Elder');
  let picks = 0;
  s = run(play(s, 0, 'Goblin Soup', [], 4), { player: 1, choose: (d) => (picks++ < 2 ? (d.options.includes(g1) ? g1 : g2) : null) });
  assert.ok(!s.perms[g1] && !s.perms[g2] && s.perms[keep]);
  assert.ok(!s.perms[a], '2 damage kills a 3/2');
  assert.ok(s.perms[b]);
  assert.ok(s.perms[other]);
});

test('Frantic Summon reveals to a creature, plays it free, discards the rest', () => {
  let s = setup();
  const c = toDeckTop(s, 0, 'Goblin Marksman');
  const x = toDeckTop(s, 0, 'Hymn');
  const y = toDeckTop(s, 0, 'Choir');
  s = run(play(s, 0, 'Frantic Summon', [], 4));
  assert.ok(s.perms[c]);
  assert.ok(s.players[0].discard.includes(x) && s.players[0].discard.includes(y));
});

test('Arcane Spell plays 2 cheap cards from your hand for free, then draws', () => {
  let s = setup();
  const a = toHand(s, 0, 'Goblin Elder');
  const b = toHand(s, 0, 'Two for one');
  const h = handSize(s, 0);
  s = run(play(s, 0, 'Arcane Spell', [], 6), { choose: (d) => (d.options.includes(a) && !s.perms[a] ? a : d.options.includes(b) ? b : null) });
  assert.ok(s.perms[a]);
  assert.equal(handSize(s, 0), h - 2 + 3 + 1 + 1 + 1, 'Two for One: 3 + 1, Goblin Elder ETB: 1, Arcane Spell: 1');
  assert.equal(s.players[0].rocks, 0, 'nothing paid beyond the 6');
});

test('Spell #1 makes a 2/2 Shapeshifter', () => {
  let s = setup();
  s = run(play(s, 0, 'Spell #1', [], 2));
  assert.ok(fieldNames(s, 0).includes('shapeshifter-token'));
});

test('Honorable Sacrifice: each opponent loses their strongest creature (they pick among ties)', () => {
  let s = setup();
  const a = put(s, 1, 'Goblin Marksman');
  const a2 = put(s, 1, 'Goblin Elder');
  const b = put(s, 2, 'Goblin Elder');
  const b2 = put(s, 2, 'Goblin Elder');
  const mine = put(s, 0, 'Goblin Marksman');
  s = run(play(s, 0, 'Honorable Sacrifice', [], 4));
  assert.ok(!s.perms[a] && s.perms[a2]);
  assert.equal([b, b2].filter((x) => s.perms[x]).length, 1);
  assert.ok(s.perms[mine]);
});

test('Power Chord gives CRITICAL in a clash; Fury Surge gives the attacker DOUBLE STRIKE', () => {
  let s = setup();
  const atk = put(s, 0, 'Goblin Marksman');
  s = act(s, { type: 'attack', player: 0, attacker: atk, target: 1 });
  const fs = toHand(s, 0, 'Fury Surge');
  giveMana(s, 0, 2);
  s = act(s, { type: 'play', player: 0, card: fs, targets: [atk] });
  s = run(s);
  assert.equal(life(s, 1), 5, 'DOUBLE STRIKE: 2 life');
  assert.ok(!hasKeyword(s, atk, 'DOUBLE STRIKE'), 'only for that battle');
  const pc = toHand(s, 0, 'Power Chord');
  assert.throws(() => act(s, { type: 'play', player: 0, card: pc, targets: [atk] }), /clash/);
});

test('Nullify the Arcane only hits Spells and Incantations costing 5+', () => {
  let s = setup();
  const big = toHand(s, 0, 'Ragnarok');
  giveMana(s, 0, 5);
  s = act(s, { type: 'play', player: 0, card: big });
  const n = toHand(s, 1, 'Nullify the Arcane');
  giveMana(s, 1, 2);
  s = act(s, { type: 'play', player: 1, card: n, targets: [big] });
  s = run(s);
  assert.ok(s.players[0].discard.includes(big));
  assert.ok(s.log.some((l) => /Ragnarok is negated/.test(l)));
  assert.ok(getDef(id('Nullify the Arcane')).scripted);
});

test("God's Blessing: your creatures are INDESTRUCTIBLE this turn; Apocalyptic Cleansing destroys everything else", () => {
  let s = setup();
  const mine = put(s, 0, 'Goblin Elder');
  const art = put(s, 0, 'Mana Tree');
  const theirs = put(s, 1, 'Goblin Elder');
  s = run(play(s, 0, "God's Blessing", [], 3));
  assert.ok(hasKeyword(s, mine, 'INDESTRUCTIBLE'));
  s = run(play(s, 0, 'Apocalyptic Cleansing', [], 9));
  assert.ok(s.perms[mine]);
  assert.ok(!s.perms[art] && !s.perms[theirs]);
});

void attack;
void ({} as Iid);

test('Equipment: Enchanted Mace, Lightweight Sandals, Truesight Helmet, Exalted Weapon, The Gods\' Blessing', () => {
  for (const [name, cost, kw] of [
    ['Enchanted Mace', 1, 'CRITICAL'],
    ['Lightweight Sandals', 1, 'HASTE'],
    ['Truesight Helmet', 2, 'FACEOFF'],
    ['Exalted Weapon', 2, 'DOUBLE STRIKE'],
    ["The Gods' Blessing", 2, 'INDESTRUCTIBLE'],
  ] as const) {
    let s = setup();
    const eq = put(s, 0, name);
    const c = put(s, 0, 'Goblin Elder');
    giveMana(s, 0, cost);
    s = run(act(s, { type: 'activate', player: 0, card: eq, ability: 0 }), { choose: () => c });
    assert.ok(hasKeyword(s, c, kw), `${name} gives ${kw}`);
    assert.equal(s.players[0].rocks, 0, `${name} costs ${cost}`);
  }
});

test('Shields Up! gives +0/+2 in a clash; Resonant Mana Node taps for mana and RECONFIGUREs', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Marksman'); // 3/2
  const b = put(s, 1, 'Goblin Elder'); // 1/2
  s = act(s, { type: 'attack', player: 0, attacker: a, target: 1 });
  while (s.decision?.kind !== 'block') s = act(s, { type: 'pass', player: s.window!.holder });
  s = act(s, { type: 'block', player: 1, blocker: b });
  while (s.window?.holder !== 1) s = act(s, { type: 'pass', player: s.window!.holder });
  const su = toHand(s, 1, 'Shields Up!');
  giveMana(s, 1, 2);
  s = act(s, { type: 'play', player: 1, card: su, targets: [b] });
  s = run(s);
  assert.ok(s.perms[b], 'the blocker survives with +0/+2');
  assert.equal(life(s, 1), 7);
  let t = setup();
  const node = put(t, 0, 'Resonant Mana Node');
  t = run(act(t, { type: 'activate', player: 0, card: node, ability: 0 }));
  assert.equal(t.players[0].floating, 1);
  t = act(t, { type: 'activate', player: 0, card: node, ability: 1 });
  assert.equal(t.perms[node].tapped, false);
});
