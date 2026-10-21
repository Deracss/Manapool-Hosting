import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackOf, availableMana, defenseOf, keywordsOf } from '../src/index.ts';
import { act, advanceTo, attack, fieldNames, giveMana, handSize, life, passRound, put, settle, setup, toDeckTop, toHand } from './helpers.ts';
import type { GameState, Iid } from '../src/index.ts';

const play = (s: GameState, pid: number, name: string, targets: string[] = [], mana = 10) => {
  const c = toHand(s, pid, name);
  giveMana(s, pid, mana);
  return act(s, { type: 'play', player: pid, card: c, targets });
};
const activate = (s: GameState, pid: number, card: Iid, ability = 0) => act(s, { type: 'activate', player: pid, card, ability });
const count = (s: GameState, pid: number, id: string) => fieldNames(s, pid).filter((x) => x === id).length;

// ---------- Vampires ----------

test('Vampire keywords: Marissa and Duke have DMG GAIN, Infiltrator and Nurse have FACEOFF', () => {
  const s = setup();
  assert.ok(keywordsOf(s, put(s, 0, 'Marissa, Vampire Bride')).includes('DMG GAIN'));
  assert.ok(keywordsOf(s, put(s, 0, 'Vampire Duke')).includes('DMG GAIN'));
  assert.ok(keywordsOf(s, put(s, 0, 'Vampire Infiltrator')).includes('FACEOFF'));
  assert.ok(keywordsOf(s, put(s, 0, 'Vampire Nurse')).includes('FACEOFF'));
});

test('Vampire Merchant grants DMG GAIN; Vampire Castle grants VIGILANCE; Vampire Glutton inherits keywords', () => {
  let s = setup();
  const m = put(s, 0, 'Vampire Merchant');
  const v = put(s, 0, 'Lurking Vampire');
  s = settle(activate(s, 0, m), { choose: (d) => (d.options.includes(v) ? v : d.options[0]) });
  assert.ok(keywordsOf(s, v).includes('DMG GAIN'));
  put(s, 0, 'Vampire Castle');
  assert.ok(keywordsOf(s, v).includes('VIGILANCE'));
  const g = put(s, 0, 'Vampire Glutton');
  put(s, 0, 'Vampire Infiltrator');
  assert.ok(keywordsOf(s, g).includes('FACEOFF'));
  assert.ok(keywordsOf(s, g).includes('DMG GAIN'));
});

test('Xavier: your clashing Vampire gets a +0/1 counter before damage', () => {
  let s = setup();
  put(s, 1, 'Xavier, Vampire Groom');
  const a = put(s, 0, 'Goblin Rusher'); // 2/1
  const b = put(s, 1, 'Lurking Vampire'); // 1/3
  put(s, 0, 'Goblin Token');
  s = attack(s, 0, a, 1, { block: b, atkBoost: [s.players[0].field[1]] }); // 2 + 1 = 3 vs 3 + 1 counter
  assert.ok(s.perms[b], 'the counter saved it');
  assert.equal(s.perms[b].counters, 1);
});

test('Inspired Vampire: surviving a clash creates a 1/1 Vampire Token with the other creature\'s effect', () => {
  let s = setup();
  const iv = put(s, 1, 'Inspired Vampire'); // 1/5
  const a = put(s, 0, 'Goblin Scout');
  s = attack(s, 0, a, 1, { block: iv });
  const tok = s.players[1].field.find((i) => s.cards[i].isToken)!;
  assert.ok(tok);
  assert.equal(attackOf(s, tok), 1);
  assert.match(s.cards[tok].override!.name!, /Vampire Token/);
  assert.equal(s.cards[tok].cardId, 'goblin-scout');
});

test('Vampire Shapeshifter inherits keywords of Vampires entering your field; Nurse adds mana after a clash', () => {
  let s = setup();
  const sh = put(s, 0, 'Vampire Shapeshifter');
  const duke = toHand(s, 0, 'Vampire Duke');
  giveMana(s, 0, 3);
  s = settle(act(s, { type: 'play', player: 0, card: duke }));
  assert.ok(keywordsOf(s, sh).includes('DMG GAIN'));
  s = setup();
  const nurse = put(s, 1, 'Vampire Nurse'); // 0/3
  const a = put(s, 0, 'Goblin Scout');
  s = attack(s, 0, a, 1, { block: nurse });
  assert.ok(s.log.some((l) => l.includes('P1 adds 1 mana')));
});

test('Lair Entrance: a creature with counters attacking lets you draw', () => {
  let s = setup();
  put(s, 0, 'Lair Entrance');
  const a = put(s, 0, 'Goblin Scout');
  s.perms[a].counters = 1;
  const h = handSize(s, 0);
  s = attack(s, 0, a, 1, { confirm: true });
  assert.equal(handSize(s, 0), h + 1);
});

// ---------- Zombies ----------

test('Mourning Marauder draws when your creature is destroyed; Dreaded Lineage makes a tapped Zombie Token', () => {
  let s = setup();
  put(s, 0, 'Mourning Marauder');
  put(s, 0, 'Dreaded Lineage');
  const z = put(s, 0, 'Zombie Spawn');
  const h = handSize(s, 0);
  s = settle(play(s, 0, 'Fireball', [z]), { confirm: true });
  assert.equal(handSize(s, 0), h + 1);
  const tok = s.players[0].field.find((i) => s.cards[i].cardId === 'zombie-token')!;
  assert.equal(s.perms[tok].tapped, true);
});

test('Resilient Revenant returns tapped; Graveborn Guardian makes a token and returns to hand', () => {
  let s = setup();
  const r = put(s, 0, 'Resilient Revenant');
  const g = put(s, 0, 'Graveborn Guardian');
  s = settle(play(s, 1 === 1 ? 0 : 0, 'Fireball', [r]));
  assert.ok(s.perms[r] && s.perms[r].tapped);
  s = settle(play(s, 0, 'Fireball', [g]), { confirm: true });
  assert.ok(s.players[0].hand.includes(g));
  assert.equal(count(s, 0, 'zombie-token'), 1);
});

test('Gravebound Martyr: destroy it, and your next Zombie this turn costs 2 less', () => {
  let s = setup();
  const m = put(s, 0, 'Gravebound Martyr');
  s = settle(activate(s, 0, m));
  assert.ok(!s.perms[m]);
  const sentinel = toHand(s, 0, 'Isolated Sentinel'); // cost 4
  giveMana(s, 0, 2);
  s = act(s, { type: 'play', player: 0, card: sentinel });
  assert.equal(availableMana(s, 0), 0);
  const second = toHand(s, 0, 'Zombie Spawn');
  s = settle(s);
  assert.throws(() => act(s, { type: 'play', player: 0, card: second }), /needs 1 mana/, 'the discount is used up');
});

test('Cryptic Reclaimer, Morbid Manipulator, Necromantic Summoner, Unholy Grimoire, Grim Gauntlet', () => {
  let s = setup();
  const spawn = put(s, 0, 'Zombie Spawn');
  const manip = put(s, 0, 'Morbid Manipulator');
  s = settle(activate(s, 0, manip), { choose: (d) => (d.options.includes(spawn) ? spawn : d.options[0]) });
  assert.ok(s.players[0].discard.includes(spawn));
  assert.equal(count(s, 0, 'zombie-token'), 1);
  const rec = toHand(s, 0, 'Cryptic Reclaimer'); // used from the hand
  s = settle(act(s, { type: 'activate', player: 0, card: rec, ability: 0 }), { choose: (d) => (d.options.includes(spawn) ? spawn : d.options[0]) });
  assert.ok(s.players[0].hand.includes(spawn));
  const summ = toHand(s, 0, 'Necromantic Summoner');
  giveMana(s, 0, 3);
  s = settle(act(s, { type: 'play', player: 0, card: summ }), { choose: (d) => d.options.find((o) => s.cards[o].cardId === 'cryptic-reclaimer') ?? d.options[0] });
  assert.equal(count(s, 0, 'cryptic-reclaimer'), 1, 'returned from the discard pile');
  const grim = put(s, 0, 'Unholy Grimoire');
  s = settle(activate(s, 0, grim));
  assert.equal(s.players[0].corruptedRocks, 1);
  const gaunt = put(s, 0, 'Grim Gauntlet');
  s = settle(activate(s, 0, gaunt));
  assert.ok(count(s, 0, 'zombie-token') >= 1);
});

test('Dread Envoy +1/+0 to your Zombies; Corrupted Artificer: Corrupted Mana for the first 2 Zombies each turn', () => {
  let s = setup();
  put(s, 0, 'Dread Envoy');
  put(s, 0, 'Corrupted Artificer');
  const g = put(s, 0, 'Grim Gauntlet');
  const z = put(s, 0, 'Zombie Spawn');
  assert.equal(attackOf(s, z), 3);
  s = settle(activate(s, 0, g));
  s = settle(play(s, 0, 'Zombie Spawn', [], 1));
  s = settle(play(s, 0, 'Resilient Revenant', [], 1));
  const made = s.log.filter((l) => l.includes('creates 1 Corrupted Mana Rock')).length;
  assert.equal(made, 2, 'only the first 2 Zombies (a token and a Spawn); not the third');
});

test('Tombstone: a creature coming back from a discard pile makes a Mana Rock; Reanimation takes from any pile', () => {
  let s = setup();
  put(s, 0, 'Tombstone');
  const theirs = put(s, 1, 'Goblin Elder');
  s = settle(play(s, 0, 'Fireball', [theirs]));
  s.players[0].rocks = 0;
  s = settle(play(s, 0, 'Reanimation', [], 4), { choose: (d) => (d.options.includes(theirs) ? theirs : d.options[0]) });
  assert.equal(s.perms[theirs].controller, 0);
  assert.equal(s.players[0].rocks, 1, 'the Tombstone Rock');
});

test('Corruption Engine: every 3 of your creatures that die make a Corrupted Mana Rock', () => {
  let s = setup();
  put(s, 0, 'Corruption Engine');
  for (let i = 0; i < 3; i++) {
    const z = put(s, 0, 'Zombie Spawn');
    s = settle(play(s, 0, 'Fireball', [z], 2));
  }
  assert.equal(s.players[0].corruptedRocks, 1);
});

test('Sacrifice: sacrifice your creature (even INDESTRUCTIBLE) to destroy a target', () => {
  let s = setup();
  const mine = put(s, 0, 'Zombie Spawn');
  const theirs = put(s, 1, 'Goblin Elder');
  s = play(s, 0, 'Sacrifice', [mine, theirs]);
  assert.ok(!s.perms[mine], 'sacrificed as the card is played');
  s = settle(s);
  assert.ok(!s.perms[theirs]);
});

test('Sacrifice: the sacrificed creature and the target must be different cards', () => {
  const s = setup();
  const only = put(s, 0, 'Zombie Spawn');
  assert.throws(() => play(s, 0, 'Sacrifice', [only, only]), /different card/);
});

// ---------- Constructs ----------

test('Constructs are Artifacts: Clockwork Titan counts them, Disarm can hit them', () => {
  let s = setup();
  const titan = put(s, 0, 'Clockwork Titan');
  put(s, 0, 'Mana Tree');
  put(s, 0, 'Clockwork Servitor');
  assert.equal(attackOf(s, titan), 3);
  assert.equal(defenseOf(s, titan), 3);
  s = settle(play(s, 1 === 1 ? 0 : 0, 'Disarm', [titan]));
  assert.ok(!s.perms[titan]);
});

test('Tharix: your Constructs get a counter whenever they become tapped; Clockwork Servitor untaps an Artifact', () => {
  let s = setup();
  put(s, 0, 'Tharix, Gearwork Animator');
  const serv = put(s, 0, 'Clockwork Servitor');
  const tree = put(s, 0, 'Mana Tree', { tapped: true });
  s = settle(activate(s, 0, serv), { choose: () => tree });
  assert.equal(s.perms[serv].counters, 1);
  assert.equal(s.perms[tree].tapped, false);
});

test('Fabrication Sentinel and Automaton Forge make Construct Tokens; Insight Automaton draws on your turn', () => {
  let s = setup();
  put(s, 0, 'Insight Automaton');
  const h = handSize(s, 0);
  s = settle(play(s, 0, 'Fabrication Sentinel', [], 2), { confirm: true });
  assert.equal(count(s, 0, 'construct-token'), 1);
  assert.equal(handSize(s, 0), h + 2, 'drew for the Sentinel and for the token (both Artifacts)');
  const forge = put(s, 0, 'Automaton Forge');
  s = settle(activate(s, 0, forge), { confirm: false });
  assert.equal(count(s, 0, 'construct-token'), 2);
});

test('Support MK II: pay 1 and tap an Artifact to draw; Reset untaps your Artifacts; Repairs returns one', () => {
  let s = setup();
  const sup = put(s, 0, 'Support MK II');
  const tree = put(s, 0, 'Mana Tree');
  giveMana(s, 0, 1);
  const h = handSize(s, 0);
  s = settle(activate(s, 0, sup), { choose: (d) => (d.options.includes(tree) ? tree : d.options[0]) });
  assert.equal(handSize(s, 0), h + 1);
  assert.equal(s.perms[tree].tapped, true);
  s = settle(play(s, 0, 'Reset', [], 4));
  assert.equal(s.perms[tree].tapped, false);
  s = settle(play(s, 0, 'Disarm', [tree]));
  s = settle(play(s, 0, 'Repairs'));
  assert.ok(s.players[0].hand.includes(tree));
});

test('Database: tapping 3 Artifacts in a turn makes a Construct Token at the end of turn', () => {
  let s = setup();
  put(s, 0, 'Database');
  for (const n of ['Mana Tree', 'Sleight of Hand', 'Crystal Nexus']) s = settle(activate(s, 0, put(s, 0, n)));
  s = advanceTo(s, 1);
  assert.equal(count(s, 0, 'construct-token'), 1);
});

test('Arcane Foundry: your Artifacts tap to help pay for an Artifact; Foundry Stone makes Artifacts cost 1 less', () => {
  let s = setup();
  put(s, 0, 'Arcane Foundry');
  put(s, 0, 'Mana Tree');
  put(s, 0, 'Sleight of Hand');
  const well = toHand(s, 0, 'Elemental Well'); // cost 4
  giveMana(s, 0, 2);
  s = settle(act(s, { type: 'play', player: 0, card: well }));
  assert.equal(count(s, 0, 'elemental-well'), 1);
  s = setup();
  put(s, 0, 'Foundry Stone');
  const tree = toHand(s, 0, 'Mana Tree');
  giveMana(s, 0, 1);
  s = settle(act(s, { type: 'play', player: 0, card: tree }));
  assert.equal(count(s, 0, 'mana-tree'), 1);
});

test('Foundry Stone: take the top card if it is an Artifact', () => {
  let s = setup();
  const stone = put(s, 0, 'Foundry Stone');
  const top = toDeckTop(s, 0, 'Mana Tree');
  s = settle(activate(s, 0, stone), { confirm: true });
  assert.ok(s.players[0].hand.includes(top));
});

test("Machinist's Reservoir collects counters from your other Artifacts tapping", () => {
  let s = setup();
  const res = put(s, 0, "Machinist's Reservoir");
  for (const n of ['Mana Tree', 'Sleight of Hand', 'Crystal Nexus']) s = settle(activate(s, 0, put(s, 0, n)));
  assert.equal(s.perms[res].counters, 3);
  const h = handSize(s, 0);
  s = settle(activate(s, 0, res, 0));
  assert.equal(handSize(s, 0), h + 1);
  assert.equal(s.perms[res].counters, 0);
});

test("Artificer's Insight: GUIDE 3, draw, and a Mana Rock if you drew an Artifact", () => {
  let s = setup();
  toDeckTop(s, 0, 'Mana Tree');
  s = settle(play(s, 0, "Artificer's Insight", [], 3), { confirm: true });
  assert.equal(s.players[0].rocks, 1);
});

test('Artifact #1 keeps the counters of your creature that left, then gives them out', () => {
  let s = setup();
  const a1 = put(s, 0, 'Artifact #1');
  const z = put(s, 0, 'Zombie Spawn');
  s.perms[z].counters = 2;
  s.perms[z].counterAtk = 2;
  s.perms[z].counterDef = 2;
  s = settle(play(s, 0, 'Divide and Conquer'), { confirm: true, choose: (d) => (d.options.includes(z) ? z : d.options[0]) });
  assert.equal(s.perms[a1].counters, 2);
  const g = put(s, 0, 'Goblin Scout');
  s = settle(activate(s, 0, a1), { choose: () => g });
  assert.equal(attackOf(s, g), 3);
});

test('Neural Nexus: your first Artifact each turn costs 1 less', () => {
  let s = setup({ fields: ['neural-nexus'] });
  const t1 = toHand(s, 0, 'Mana Tree');
  const t2 = toHand(s, 0, 'Sleight of Hand');
  giveMana(s, 0, 3);
  s = settle(act(s, { type: 'play', player: 0, card: t1 }));
  assert.equal(availableMana(s, 0), 2);
  s = settle(act(s, { type: 'play', player: 0, card: t2 }));
  assert.equal(availableMana(s, 0), 0);
});

// ---------- Demons (COMMAND) ----------

test('Insightful Decree: COMMAND an opponent to draw (a contract, +1 Soul), then you draw', () => {
  let s = setup();
  const theirs = handSize(s, 2);
  s = settle(play(s, 0, 'Insightful Decree', [], 1), { player: 2 });
  assert.equal(handSize(s, 2), theirs + 1);
  assert.equal(s.players[0].souls, 1);
});

test('Soul Collector adds a Soul on COMMAND; Demon Bard COMMANDs on the first Demon each turn; Demon Charger rewards Souls', () => {
  let s = setup();
  put(s, 0, 'Soul Collector');
  const charger = put(s, 0, 'Demon Charger');
  s.players[0].souls = 3;
  s = settle(play(s, 0, 'Demon Bard', [], 2));
  assert.equal(s.players[0].souls, 5, '+1 contract, +1 Soul Collector');
  assert.equal(s.perms[charger].counters, 1, '5 Souls reward');
  s = settle(play(s, 0, 'Demon Spawn', [], 1));
  assert.equal(s.players[0].souls, 5, 'Bard only once per turn');
});

test('Lilith: COMMAND an opponent to give you a creature, untapped', () => {
  let s = setup();
  const theirs = put(s, 1, 'Goblin Elder', { tapped: true });
  s = settle(play(s, 0, 'Lilith, Queen of Demons', [], 5), { player: 1, confirm: false });
  assert.equal(s.perms[theirs].controller, 0);
  assert.equal(s.perms[theirs].tapped, false);
  assert.equal(s.players[0].souls, 1);
});

test('Chained Demon destroys a creature when it attacks with 10 Souls', () => {
  let s = setup();
  s.players[0].souls = 10;
  const cd = put(s, 0, 'Chained Demon');
  const theirs = put(s, 1, 'Goblin Elder');
  s = attack(s, 0, cd, 2, { choose: (d) => (d.options.includes(theirs) ? theirs : d.options[0]) });
  assert.ok(!s.perms[theirs]);
});

test('Charitable Demon: blocked = a Mana Orb won\'t refill; unblocked = the defender draws', () => {
  let s = setup();
  const cd = put(s, 0, 'Charitable Demon');
  const h = handSize(s, 1);
  s = attack(s, 0, cd, 1);
  assert.equal(handSize(s, 1), h + 1 + 1, 'combat draw + Charitable Demon draw');
  s = setup();
  const cd2 = put(s, 0, 'Charitable Demon'); // 3/1
  const b = put(s, 1, 'Groot, Goblin Mercenary');
  s.players[1].orbs.push({ iid: s.players[1].hand.pop()!, filled: false }, { iid: s.players[1].hand.pop()!, filled: false });
  s = attack(s, 0, cd2, 1, { block: b });
  s = advanceTo(s, 1);
  assert.equal(s.players[1].orbs.filter((o) => o.filled).length, 1);
});

test('Demon Summoner: with 10 Souls, every contract makes a 2/2 Demon Token', () => {
  let s = setup();
  put(s, 0, 'Demon Summoner');
  s.players[0].souls = 9;
  s = settle(play(s, 0, 'Insightful Decree', [], 1), { player: 1 });
  assert.equal(count(s, 0, 'demon-token'), 1);
  assert.equal(life(s, 0), 7);
  void passRound;
});
