import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackOf, defenseOf, keywordsOf } from '../src/index.ts';
import { act, advanceTo, attack, fieldNames, giveMana, handSize, life, passRound, put, settle, setup, toDeckTop, toHand } from './helpers.ts';

const count = (s: ReturnType<typeof setup>, pid: number, cardId: string) => fieldNames(s, pid).filter((x) => x === cardId).length;

test('Baby Goblin: boosting draws a card and gives the attack CRITICAL', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Elder');
  const baby = put(s, 0, 'Baby Goblin', { sick: true });
  const myHand = handSize(s, 0);
  const theirHand = handSize(s, 1);
  s = attack(s, 0, a, 1, { atkBoost: [baby] });
  assert.equal(life(s, 1), 6);
  assert.equal(handSize(s, 0), myHand + 1, 'Baby Goblin drew');
  assert.equal(handSize(s, 1), theirHand, 'CRITICAL BOOST: no draw for the defender');
});

test('Goblin Artillery: +2/0 for each of your Goblins boosted this turn', () => {
  let s = setup();
  const art = put(s, 0, 'Goblin Artillery'); // 2/1
  const helper = put(s, 0, 'Goblin Token');
  assert.equal(attackOf(s, art), 2);
  s = attack(s, 0, art, 1, { atkBoost: [helper] });
  assert.equal(attackOf(s, art), 4, 'Artillery itself was boosted');
  s = advanceTo(s, 1);
  assert.equal(attackOf(s, art), 2, 'resets next turn');
});

test('Goblin Assassin: doubles its attack in a clash', () => {
  let s = setup();
  const sin = put(s, 0, 'Goblin Assassin'); // 1/1
  const b = put(s, 1, 'Goblin Elder'); // 1/2
  s = attack(s, 0, sin, 1, { block: b });
  assert.ok(!s.perms[b], '1 doubled = 2 kills a 2-defense blocker');
  assert.equal(life(s, 1), 7, 'equal, so no life lost');
});

test('Goblin berserker: Goblin boost grants DOUBLE STRIKE; clash kills make a CRITICAL BOOST token', () => {
  let s = setup();
  const bz = put(s, 0, 'Goblin berserker'); // 3/2
  const g = put(s, 0, 'Goblin Token');
  const b = put(s, 1, 'Goblin Scout'); // 1/1
  s = attack(s, 0, bz, 1, { block: b, atkBoost: [g] });
  assert.equal(life(s, 1), 5, 'DOUBLE STRIKE: 2 life');
  const tokens = s.players[0].field.filter((i) => s.cards[i].cardId === 'goblin-token' && i !== g);
  assert.equal(tokens.length, 1);
  assert.deepEqual(keywordsOf(s, tokens[0]), ['CRITICAL BOOST']);
  assert.equal(keywordsOf(s, bz).length, 0, 'DOUBLE STRIKE ended with the battle');
});

test('Goblin Elder: draws a card for each Goblin you control', () => {
  let s = setup();
  put(s, 0, 'Goblin Token');
  put(s, 0, 'Goblin Token');
  const elder = toHand(s, 0, 'Goblin Elder');
  giveMana(s, 0, 3);
  const before = handSize(s, 0);
  s = act(s, { type: 'play', player: 0, card: elder });
  s = settle(s);
  assert.equal(handSize(s, 0), before - 1 + 3, 'two tokens + Elder itself');
});

test('Goblin Flanker: costs 2 with 3 Goblins, and has HASTE', () => {
  let s = setup();
  const fl = toHand(s, 0, 'Goblin Flanker');
  giveMana(s, 0, 2);
  assert.throws(() => act(s, { type: 'play', player: 0, card: fl }), /needs 5 mana/);
  put(s, 0, 'Goblin Token');
  put(s, 0, 'Goblin Token');
  put(s, 0, 'Goblin Token');
  s = act(s, { type: 'play', player: 0, card: fl });
  s = settle(s);
  assert.equal(s.players[0].rocks, 0);
  s = attack(s, 0, fl, 1);
  assert.equal(life(s, 1), 6, 'attacks the turn it arrives');
});

test('Goblin Messenger: searches for a Goblin costing 3 or less', () => {
  let s = setup();
  const cheap = toDeckTop(s, 0, 'Goblin Elder'); // cost 3
  toDeckTop(s, 0, 'Goblin berserker'); // cost 4, not allowed
  const m = toHand(s, 0, 'Goblin Messenger');
  giveMana(s, 0, 3);
  s = act(s, { type: 'play', player: 0, card: m });
  s = passRound(s); // Messenger resolves; its ON PLAY ability goes on the stack
  s = passRound(s); // the ability resolves and asks for a choice
  assert.equal(s.decision?.kind, 'choose');
  assert.deepEqual(s.decision!.options, [cheap]);
  s = act(s, { type: 'choose', player: 0, choice: cheap });
  s = settle(s);
  assert.ok(s.players[0].hand.includes(cheap));
  assert.ok(s.log.some((l) => l.includes('reveals Goblin Elder')));
});

test('Goblin Miner: End Phase token if one of your Goblins hit an opponent', () => {
  let s = setup();
  put(s, 0, 'Goblin Miner');
  const r = put(s, 0, 'Goblin Rusher');
  s = advanceTo(s, 1);
  assert.equal(count(s, 0, 'goblin-token'), 0, 'no hit, no token');
  s = advanceTo(s, 0);
  s = attack(s, 0, r, 1);
  s = advanceTo(s, 1);
  assert.equal(count(s, 0, 'goblin-token'), 1);
});

test('Goblin Planner: tapping a Goblin to attack adds 1 mana, through the stack', () => {
  let s = setup();
  const planner = put(s, 0, 'Goblin Planner');
  const r = put(s, 0, 'Goblin Rusher');
  const fb = toHand(s, 1, 'Fireball');
  giveMana(s, 1, 2);
  s = act(s, { type: 'attack', player: 0, attacker: r, target: 1 });
  assert.equal(s.players[0].floating, 0, 'the trigger is on the stack, not resolved yet');
  // P1 responds by destroying Planner; its ability still resolves.
  s = act(s, { type: 'pass', player: 0 });
  s = act(s, { type: 'play', player: 1, card: fb, targets: [planner] });
  s = passRound(s); // Fireball resolves
  assert.ok(!s.perms[planner]);
  s = passRound(s); // Planner's ability resolves
  assert.equal(s.players[0].floating, 1);
  s = settle(s);
  s = advanceTo(s, 1);
  assert.equal(s.players[0].floating, 0, 'floating mana empties at end of turn');
});

test('Goblin Recruit and Goblin Rusher have HASTE', () => {
  let s = setup();
  const r1 = put(s, 0, 'Goblin Recruit', { sick: true });
  const r2 = put(s, 0, 'Goblin Rusher', { sick: true });
  s = attack(s, 0, r1, 1);
  s = attack(s, 0, r2, 2);
  assert.equal(life(s, 1), 6);
  assert.equal(life(s, 2), 6);
});

test('Goblin Recruiter: TAP to create a Goblin Token with CRITICAL BOOST (not while summoning sick)', () => {
  let s = setup();
  const sick = put(s, 0, 'Goblin Recruiter', { sick: true });
  assert.throws(() => act(s, { type: 'activate', player: 0, card: sick }), /summoning sickness/);
  const rec = put(s, 0, 'Goblin Recruiter');
  s = act(s, { type: 'activate', player: 0, card: rec });
  s = settle(s);
  const tok = s.players[0].field.find((i) => s.cards[i].cardId === 'goblin-token')!;
  assert.deepEqual(keywordsOf(s, tok), ['CRITICAL BOOST']);
  assert.equal(s.perms[rec].tapped, true);
});

test('Goblin Scout: draws on play and when destroyed', () => {
  let s = setup();
  const sc = toHand(s, 0, 'Goblin Scout');
  giveMana(s, 0, 1);
  const before = handSize(s, 0);
  s = act(s, { type: 'play', player: 0, card: sc });
  s = settle(s);
  assert.equal(handSize(s, 0), before); // -1 played, +1 drawn
  const fb = toHand(s, 1, 'Fireball');
  giveMana(s, 1, 2);
  s = act(s, { type: 'pass', player: 0 });
  s = act(s, { type: 'play', player: 1, card: fb, targets: [sc] });
  s = passRound(s); // Fireball resolves, Scout's trigger goes on the stack
  s = passRound(s);
  assert.equal(handSize(s, 0), before + 1);
});

test('Goblin Shaman: your other Goblins get +1/+1', () => {
  const s = setup();
  const sh = put(s, 0, 'Goblin Shaman');
  const e = put(s, 0, 'Goblin Elder');
  const theirs = put(s, 1, 'Goblin Elder');
  assert.equal(attackOf(s, sh), 0);
  assert.equal(attackOf(s, e), 2);
  assert.equal(defenseOf(s, e), 3);
  assert.equal(attackOf(s, theirs), 1, "doesn't help opponents");
});

test('Goblin Wizard: your boosting Goblins add 2 attack instead of 1', () => {
  let s = setup();
  put(s, 0, 'Goblin Wizard', { tapped: true });
  const a = put(s, 0, 'Goblin Scout'); // 1/1
  const g = put(s, 0, 'Goblin Token');
  const b = put(s, 1, 'Groot, Goblin Mercenary'); // 1/3
  s = attack(s, 0, a, 1, { block: b, atkBoost: [g] });
  assert.ok(!s.perms[b], '1 + 2 = 3 kills the 3-defense blocker');
});

test('Groot: VIGILANCE, EVASIVE, and destroys another creature you control on attack (+0/1 if a Goblin)', () => {
  let s = setup();
  const groot = put(s, 0, 'Groot, Goblin Mercenary');
  const victim = put(s, 0, 'Goblin Token');
  s = attack(s, 0, groot, 1);
  assert.ok(!s.perms[victim]);
  assert.equal(defenseOf(s, groot), 4);
  assert.equal(s.perms[groot].tapped, false);
  assert.equal(life(s, 1), 6);
});

test('Urgal the Whisperer: End Phase counters for each Goblin that boosted (Urgal gives one Goblin 3 at most)', () => {
  let s = setup();
  put(s, 0, 'Urgal the Whisperer', { tapped: true });
  const a = put(s, 0, 'Goblin Rusher');
  const g1 = put(s, 0, 'Goblin Token');
  const g2 = put(s, 0, 'Goblin Token');
  s = attack(s, 0, a, 1, { atkBoost: [g1, g2] });
  s.perms[a].countersFrom['urgal-the-whisperer'] = 2; // Urgal already gave it 2
  s.perms[a].counters = 4; // counters from other cards don't count toward Urgal's limit
  s = advanceTo(s, 1, { choose: (d) => (d.options.includes(a) ? a : d.options[0]) });
  assert.equal(s.perms[a].countersFrom['urgal-the-whisperer'], 3, 'second counter is refused at the cap');
  assert.equal(s.perms[a].counters, 5);
});

test('Goblin Whelpcaller makes 2 tokens; with Grukza it makes 3', () => {
  let s = setup();
  const w = toHand(s, 0, 'Goblin Whelpcaller');
  giveMana(s, 0, 3);
  s = act(s, { type: 'play', player: 0, card: w });
  s = settle(s);
  assert.equal(count(s, 0, 'goblin-token'), 2);

  s = setup();
  put(s, 0, 'Grukza, the Goblin Mother');
  const w2 = toHand(s, 0, 'Goblin Whelpcaller');
  giveMana(s, 0, 3);
  s = act(s, { type: 'play', player: 0, card: w2 });
  s = settle(s);
  assert.equal(count(s, 0, 'goblin-token'), 3);
});

test('Goblin #1: HASTE, and +1/+1 whenever a creature boosts during the turn it entered', () => {
  let s = setup();
  const g1 = toHand(s, 0, 'Goblin #1');
  const helper = put(s, 0, 'Goblin Token');
  giveMana(s, 0, 4);
  s = act(s, { type: 'play', player: 0, card: g1 });
  s = settle(s);
  s = attack(s, 0, g1, 1, { atkBoost: [helper] });
  assert.equal(s.perms[g1].counters, 1);
  assert.equal(attackOf(s, g1), 2);
  s = advanceTo(s, 1);
  const a = put(s, 1, 'Goblin Rusher');
  const h2 = put(s, 1, 'Goblin Token');
  s = attack(s, 1, a, 2, { atkBoost: [h2] });
  assert.equal(s.perms[g1].counters, 1, 'only on the turn it entered');
});

test('Forest: first attack each turn draws; third attack gains CRITICAL (or DOUBLE STRIKE if already CRITICAL)', () => {
  let s = setup({ fields: ['forest'] });
  const a1 = put(s, 0, 'Goblin Token');
  const a2 = put(s, 0, 'Goblin Token');
  const a3 = put(s, 0, 'Goblin Marksman'); // already CRITICAL
  const hand = handSize(s, 0);
  s = attack(s, 0, a1, 1);
  assert.equal(handSize(s, 0), hand + 1, 'first attack draws');
  s = attack(s, 0, a2, 2);
  assert.equal(handSize(s, 0), hand + 1, 'second attack does not');
  s = attack(s, 0, a3, 3);
  assert.equal(life(s, 3), 5, 'Marksman gained DOUBLE STRIKE on the third attack');
});

test('Goblin berserker gains DOUBLE STRIKE from a Goblin boost even when unblocked', () => {
  let s = setup();
  const bz = put(s, 0, 'Goblin berserker');
  const g = put(s, 0, 'Goblin Token');
  s = attack(s, 0, bz, 1, { atkBoost: [g] });
  assert.equal(life(s, 1), 5);
});
