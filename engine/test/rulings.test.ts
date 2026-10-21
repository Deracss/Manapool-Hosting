// Cards scripted from rulings 4–24.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activatedOf, attackOf, defenseOf, hasKeyword, isCreature, whoMustAct } from '../src/index.ts';
import type { GameState, Iid } from '../src/index.ts';
import { act, advanceTo, attack, fieldNames, giveMana, handSize, life, put, settle, setup, toDeckTop, toHand } from './helpers.ts';

const play = (s: GameState, pid: number, name: string, targets: string[] = [], mana = 10) => {
  const c = toHand(s, pid, name);
  giveMana(s, pid, mana);
  return act(s, { type: 'play', player: pid, card: c, targets });
};
const activate = (s: GameState, pid: number, card: Iid, ability = 0) => act(s, { type: 'activate', player: pid, card, ability });
const count = (s: GameState, pid: number, id: string) => fieldNames(s, pid).filter((x) => x === id).length;

// ---------- OFFER ----------

test('OFFER: each opponent may accept; each acceptance is a contract (Demon Shade)', () => {
  let s = setup();
  const before = [0, 1, 2, 3].map((p) => handSize(s, p));
  s = settle(play(s, 0, 'Demon Shade'), { answer: (d) => d.player !== 2 }); // P1 and P3 accept, P2 refuses
  assert.equal(s.players[0].souls, 2);
  assert.equal(handSize(s, 1), before[1] + 1);
  assert.equal(handSize(s, 2), before[2]);
  assert.equal(handSize(s, 0), before[0] + 2); // 1 card per contract
});

test('Demon Leecher and Demon Pup react to your OFFER; Win/Win pays when nobody accepts', () => {
  let s = setup();
  const pup = put(s, 0, 'Demon Pup');
  put(s, 0, 'Demon Leecher');
  put(s, 0, 'Win / Win');
  const hand = handSize(s, 0);
  const rocks = s.players[0].rocks;
  s = settle(play(s, 0, 'Demon Shade', [], 2), { answer: (d) => d.offerFrom === undefined }); // everyone refuses; Leecher's draw is yes
  assert.equal(s.perms[pup].counters, 1);
  assert.equal(handSize(s, 0), hand + 1); // Leecher (the Shade itself left the hand)
  assert.equal(s.players[0].rocks, rocks + 1); // Win / Win
});

test('Beelzebub: gift for acceptors, then you may repeat it per contract', () => {
  let s = setup();
  const rocks1 = s.players[1].rocks;
  s = settle(play(s, 0, 'Beelzebub, Lord of the Flies', [], 4), { answer: (d) => d.offerFrom === undefined || d.player === 1 });
  assert.equal(s.players[1].rocks, rocks1 + 1);
  assert.equal(s.players[0].rocks, 1);
  assert.equal(s.players[0].souls, 1);
});

test('Paimon: acceptors get a Rock (2 mana each for you); refusers are COMMANDED to destroy an Anthem and an Artifact', () => {
  let s = setup();
  const anthem = put(s, 2, 'War Cry');
  const art = put(s, 2, 'Mana Tree');
  s = settle(play(s, 0, 'Paimon, Great King of Hell', [], 5), { answer: (d) => d.player !== 2 });
  assert.equal(s.players[0].floating, 4);
  assert.ok(!s.perms[anthem] && !s.perms[art]);
  assert.equal(s.players[0].souls, 3); // 2 OFFER contracts + 1 COMMAND
});

test('Infernal Tutor gives a 1/1 Demon with "Tap: draw"; Carnival Games tutors and doubles Souls', () => {
  let s = setup();
  s = settle(play(s, 0, 'Infernal Tutor', [], 3), { answer: (d) => d.player === 1 });
  const tok = s.players[1].field.find((i) => s.cards[i].cardId === 'demon-token')!;
  assert.equal(attackOf(s, tok), 1);
  assert.equal(activatedOf(s, tok)[0].label, 'Tap: draw a card');
  let t = setup();
  t = settle(play(t, 0, 'Carnival Games', [], 2), { answer: (d) => d.player === 1 });
  assert.equal(t.players[0].souls, 2);
});

test('Pact of Insight: at its Upkeep, the token holder and the offerer may both draw', () => {
  let s = setup();
  s = settle(play(s, 0, 'Pact of Insight', [], 3), { answer: (d) => d.player === 1 });
  assert.ok(s.players[1].field.some((i) => s.cards[i].override?.name === 'Pact Token'));
  const h0 = handSize(s, 0);
  s = advanceTo(s, 1);
  assert.equal(handSize(s, 0), h0 + 1);
});

test('Demon Pit: first OFFER of your turn adds an Orb-swap OFFER and Rocks per contract', () => {
  let s = setup();
  put(s, 0, 'Demon Pit');
  const orb = toHand(s, 1, 'Research');
  s.players[1].orbs.push({ iid: orb, filled: false });
  s.players[1].hand = s.players[1].hand.filter((x) => x !== orb);
  const rocks = s.players[0].rocks;
  s = settle(play(s, 0, 'Demon Shade', [], 2), { answer: (d) => d.player === 1 });
  assert.ok(s.players[1].hand.includes(orb));
  assert.equal(s.players[1].orbs.length, 1);
  assert.ok(s.players[1].orbs[0].filled);
  assert.equal(s.players[0].rocks, rocks + 1); // only P1 accepted the Pit OFFER
});

test('Evil Spirit finds an OFFER Spell; Demon #1 COMMANDS a Mana Rock', () => {
  let s = setup();
  toDeckTop(s, 0, 'Pact of Insight');
  s = settle(play(s, 0, 'Evil Spirit', [], 3));
  assert.ok(s.players[0].hand.some((i) => s.cards[i].cardId === 'pact-of-insight'));
  let t = setup();
  put(t, 0, 'Demon #1');
  const imp = put(t, 0, 'Demon Spawn');
  const r = t.players[1].rocks;
  t = attack(t, 0, imp, 1, { block: null });
  assert.equal(t.players[1].rocks, r + 1);
  assert.equal(t.players[0].souls, 1);
});

test('Demon Field: +1/1 at 5 Souls, DOUBLE STRIKE at 15, pay 2 Souls for a counter', () => {
  let s = setup();
  s.players[0].fieldCard = 'demon-field';
  const d = put(s, 0, 'Demon Spawn');
  assert.equal(attackOf(s, d), 2);
  s.players[0].souls = 5;
  assert.equal(attackOf(s, d), 3);
  s.players[0].souls = 15;
  assert.ok(hasKeyword(s, d, 'DOUBLE STRIKE'));
  s = settle(activate(s, 0, 'field:0'), { choose: () => d });
  assert.equal(s.players[0].souls, 13);
  assert.equal(s.perms[d].counters, 1);
});

// ---------- Vampires ----------

test('Vampire Feeder buffs only your Vampires; Butler grows when another Vampire gets a counter (no loop)', () => {
  let s = setup();
  put(s, 0, 'Vampire Feeder');
  const mine = put(s, 0, 'Lurking Vampire');
  const theirs = put(s, 1, 'Lurking Vampire');
  assert.equal(defenseOf(s, mine), 4);
  assert.equal(defenseOf(s, theirs), 3);
  const b1 = put(s, 0, 'Vampire Butler');
  const b2 = put(s, 0, 'Vampire Butler');
  const merchant = put(s, 0, 'Vampire Merchant');
  void merchant;
  // A DMG GAIN counter on a Vampire: both Butlers get one, and they don't trigger each other.
  const duke = put(s, 0, 'Vampire Duke');
  const atk = put(s, 1, 'Zombie Spawn');
  s.active = 1;
  s.players[1].attacksThisTurn = 0;
  s = act(s, { type: 'attack', player: 1, attacker: atk, target: 0 });
  s = settle(s, { block: duke });
  s = settle(s);
  assert.equal(s.perms[b1].counters, 1);
  assert.equal(s.perms[b2].counters, 1);
});

test('Herald gains 1 life when blocked below 5 life; Atredes rewards 9+ attack', () => {
  let s = setup();
  const h = put(s, 0, 'Herald, Food Critic');
  put(s, 1, 'Lurking Vampire');
  s.players[0].life = 4;
  s = attack(s, 0, h, 1, { block: s.players[1].field[0] });
  assert.equal(life(s, 0), 5);
  let t = setup();
  put(t, 0, 'Atredes, Vampire Overlord');
  const v1 = put(t, 0, 'Isolde, Bloodborne Mistress');
  const v2 = put(t, 0, 'Vampire Infiltrator');
  const v3 = put(t, 0, 'Lurking Vampire');
  t = attack(t, 0, v1, 1, { block: null }); // 6
  t = attack(t, 0, v2, 2, { block: null, atkBoost: [v3] }); // 2 + 1 boost = 3 → total 9
  t = advanceTo(t, 1);
  assert.equal(count(t, 0, 'vampire-token'), 1);
});

test('Isolde copies the creature she clashes with, as a Vampire; Alucard rewards a kill', () => {
  let s = setup();
  const iso = put(s, 0, 'Isolde, Bloodborne Mistress');
  const blocker = put(s, 1, 'Dread Envoy');
  s = attack(s, 0, iso, 1, { block: blocker });
  const copy = s.players[0].field.find((i) => s.cards[i].cardId === 'dread-envoy')!;
  assert.ok(copy);
  assert.equal(s.cards[copy].override?.tribe, 'Vampire');
  let t = setup();
  const al = put(t, 0, 'Alucard, Prince of the Night');
  const v = put(t, 0, 'Lurking Vampire');
  const victim = put(t, 1, 'Zombie Spawn');
  t = attack(t, 0, al, 1, { targetCreature: victim, choose: () => v });
  assert.equal(attackOf(t, v), 2);
});

test('Arsen equips to a Vampire: +1/1 and FACEOFF, and becomes an Artifact', () => {
  let s = setup();
  const arsen = put(s, 0, 'Arsen, Vampire Familiar');
  const v = put(s, 0, 'Lurking Vampire');
  s = settle(activate(s, 0, arsen));
  assert.equal(attackOf(s, v), 2);
  assert.ok(hasKeyword(s, v, 'FACEOFF'));
  assert.ok(!isCreature(s, arsen));
});

test('City Night: EVASIVE only at +4 attack above printed', () => {
  const s = setup();
  s.players[0].fieldCard = 'city-night';
  const v = put(s, 0, 'Lurking Vampire');
  s.perms[v].counterAtk = 3;
  assert.ok(!hasKeyword(s, v, 'EVASIVE'));
  s.perms[v].counterAtk = 4;
  assert.ok(hasKeyword(s, v, 'EVASIVE'));
});

// ---------- Zombies ----------

test("Krr'ask: INFECT turns the creature into your 1/1 Zombie at the end of its controller's next turn", () => {
  let s = setup();
  const k = put(s, 0, "Krr'ask, Virulent Contagion");
  const victim = put(s, 1, 'Vampire Duke', { tapped: true });
  s = settle(activate(s, 0, k));
  assert.equal(s.perms[victim].infectedBy, 0);
  s = advanceTo(s, 1); // P1's turn starts: armed
  assert.equal(s.perms[victim].controller, 1);
  s = advanceTo(s, 2); // end of P1's turn: transformed
  assert.equal(s.perms[victim].controller, 0);
  assert.equal(attackOf(s, victim), 1);
  assert.ok(s.cards[victim].override?.tribe === 'Zombie');
});

test("Krr'ask: an INFECTED creature that is destroyed gives you a 1/1 Zombie Token", () => {
  let s = setup();
  const k = put(s, 0, "Krr'ask, Virulent Contagion");
  const victim = put(s, 1, 'Lurking Vampire', { tapped: true });
  s = settle(activate(s, 0, k));
  s = settle(play(s, 0, 'Divine Judgment', [victim]));
  assert.equal(count(s, 0, 'zombie-token'), 1);
});

test('Isolated Sentinel grows when any Zombie dies; Deathly Reconjurer brings one back to attack too', () => {
  let s = setup();
  const sen = put(s, 0, 'Isolated Sentinel');
  const z = put(s, 1, 'Zombie Spawn');
  s = settle(play(s, 0, 'Divine Judgment', [z]));
  assert.equal(attackOf(s, sen), 3);
  let t = setup();
  const dead = toHand(t, 0, 'Zombie Spawn');
  t.players[0].hand = t.players[0].hand.filter((x) => x !== dead);
  t.players[0].discard.push(dead);
  const rec = put(t, 0, 'Deathly Reconjurer');
  const l = life(t, 1);
  t = attack(t, 0, rec, 1, { block: null, choose: () => dead });
  assert.ok(t.perms[dead]);
  assert.equal(life(t, 1), l - 2); // both attacks hit
});

// ---------- Support ----------

test('Counter the Counter only hits cards that negate', () => {
  let s = setup();
  s.active = 0;
  const seal = toHand(s, 1, 'Summoning Seal');
  giveMana(s, 1, 5);
  giveMana(s, 0, 10);
  s = act(s, { type: 'play', player: 0, card: toHand(s, 0, 'Lurking Vampire') });
  while (whoMustAct(s) !== 1) s = act(s, { type: 'pass', player: whoMustAct(s)! });
  const vamp = s.stack[0].kind === 'card' ? s.stack[0].iid : '';
  s = act(s, { type: 'play', player: 1, card: seal, targets: [vamp] });
  const ctc = toHand(s, 0, 'Counter the Counter');
  while (whoMustAct(s) !== 0) s = act(s, { type: 'pass', player: whoMustAct(s)! });
  assert.throws(() => act(s, { type: 'play', player: 0, card: ctc, targets: [vamp] }));
  s = act(s, { type: 'play', player: 0, card: ctc, targets: [seal] });
  s = settle(s);
  assert.ok(s.players[0].field.includes(vamp));
});

test('Arcane Vanishing: your permanents FADE OUT and return at the End Phase with counters', () => {
  let s = setup();
  const v = put(s, 0, 'Lurking Vampire');
  s.perms[v].counters = 1;
  s.perms[v].counterAtk = 1;
  s.perms[v].counterDef = 1;
  s = settle(play(s, 0, 'Arcane Vanishing'));
  assert.ok(!s.perms[v]);
  s = advanceTo(s, 1);
  assert.ok(s.perms[v]);
  assert.equal(attackOf(s, v), 2);
});

test('Anthropomorph: a 1/1 Human with no abilities', () => {
  let s = setup();
  const d = put(s, 1, 'Vampire Duke');
  s = settle(play(s, 0, 'Anthropomorph', [d]));
  assert.equal(attackOf(s, d), 1);
  assert.equal(defenseOf(s, d), 1);
  assert.ok(!hasKeyword(s, d, 'DMG GAIN'));
});

test('Blood Vial: every 2nd creature Tap ability draws and adds mana; Frog Song on creature triggers', () => {
  let s = setup();
  put(s, 0, 'Blood Vial');
  const m1 = put(s, 0, 'Meditating Monk');
  const m2 = put(s, 0, 'Meditating Monk');
  const h = handSize(s, 0);
  s = settle(activate(s, 0, m1));
  assert.equal(handSize(s, 0), h);
  s = settle(activate(s, 0, m2));
  assert.equal(handSize(s, 0), h + 1);
  assert.equal(s.players[0].floating, 3);
  let t = setup();
  put(t, 0, 'Frog Song');
  const hh = handSize(t, 0);
  t = settle(play(t, 0, 'Demon Shade', [], 2), { answer: (d) => d.offerFrom === undefined });
  // Demon Shade's ETB is a creature trigger, so Frog Song draws 1.
  assert.equal(handSize(t, 0), hh + 1);
});

test('Combat Mk II: DOUBLE STRIKE when it untaps outside the Untap step', () => {
  let s = setup();
  const mk = put(s, 0, 'Combat Mk II', { tapped: true });
  const serv = put(s, 0, 'Clockwork Servitor');
  s = settle(activate(s, 0, serv), { choose: () => mk });
  assert.ok(hasKeyword(s, mk, 'DOUBLE STRIKE'));
  assert.ok(hasKeyword(s, mk, 'CRITICAL'));
});

// ---------- Corrupted Mana and Graveyard ----------

test('Corrupted Mana: only pays for creatures played from your discard pile, and must pay all of it', () => {
  let s = setup();
  const z = toHand(s, 0, 'Zombie Spawn'); // cost 1
  s.players[0].hand = s.players[0].hand.filter((x) => x !== z);
  s.players[0].discard.push(z);
  const spell = toHand(s, 0, 'Rinse');
  s.players[0].corruptedRocks = 4;
  assert.throws(() => act(s, { type: 'play', player: 0, card: spell }), /needs 4 mana/);
  s = settle(act(s, { type: 'play', player: 0, card: z }));
  assert.ok(s.players[0].field.includes(z));
  assert.equal(s.players[0].corruptedRocks, 3);
  const r = toHand(s, 0, 'Divine Judgment');
  s.players[0].hand = s.players[0].hand.filter((x) => x !== r);
  s.players[0].discard.push(r);
  assert.throws(() => act(s, { type: 'play', player: 0, card: r, targets: [z] }), /Only creatures/);
});

test('Graveyard: 1st death draws, 2nd adds mana, 3rd lets you play a card from your discard pile', () => {
  let s = setup();
  s.players[0].fieldCard = 'graveyard';
  const a = put(s, 0, 'Zombie Spawn');
  const b = put(s, 0, 'Zombie Spawn');
  const c = put(s, 0, 'Zombie Spawn');
  const h = handSize(s, 0);
  s = settle(play(s, 0, 'Divine Judgment', [a], 2));
  assert.equal(handSize(s, 0), h + 1);
  s = settle(play(s, 0, 'Divine Judgment', [b], 2));
  assert.equal(s.players[0].floating, 1);
  s = settle(play(s, 0, 'Divine Judgment', [c], 2));
  assert.equal(s.players[0].discardPlays, 1);
  const dj = s.players[0].discard.find((x) => s.cards[x].cardId === 'divine-judgment')!;
  const enemy = put(s, 1, 'Zombie Spawn');
  s.players[0].corruptedRocks = 2;
  s = settle(act(s, { type: 'play', player: 0, card: dj, targets: [enemy] }));
  assert.ok(!s.perms[enemy]);
  assert.equal(s.players[0].discardPlays, 0);
});

test('Construct tokens show RECONFIGURE', () => {
  let s = setup();
  const forge = put(s, 0, 'Automaton Forge');
  s = settle(act(s, { type: 'activate', player: 0, card: forge, ability: 0 }));
  const tok = s.players[0].field.find((i) => s.cards[i].cardId === 'construct-token')!;
  assert.ok(hasKeyword(s, tok, 'RECONFIGURE'));
});

test('An attack fizzles when the blocker leaves the field, even if it comes right back', () => {
  let s = setup();
  const atk = put(s, 0, 'Vampire Duke');
  const rev = put(s, 1, 'Resilient Revenant');
  s = act(s, { type: 'attack', player: 0, attacker: atk, target: 1 });
  while (!s.decision) s = act(s, { type: 'pass', player: whoMustAct(s)! });
  s = act(s, { type: 'block', player: 1, blocker: rev });
  // With the block on the table, P0 destroys the blocker at Incantation speed; Revenant returns.
  const dj = toHand(s, 0, 'Divine judgment');
  giveMana(s, 0, 5);
  s = act(s, { type: 'play', player: 0, card: dj, targets: [rev] });
  s = settle(s);
  assert.ok(s.perms[rev], 'Revenant came back');
  assert.equal(life(s, 1), 7, 'no damage: the attack fizzled');
  assert.ok(s.log.some((l) => l.includes('fizzles')));
  assert.equal(s.combat, null);
});

test('Graveyard counts sacrificed creatures too', () => {
  let s = setup();
  s.players[0].fieldCard = 'graveyard';
  const mine = put(s, 0, 'Zombie Spawn');
  const theirs = put(s, 1, 'Zombie Spawn');
  const h = handSize(s, 0);
  s = settle(play(s, 0, 'Sacrifice', [mine, theirs], 2));
  assert.equal(handSize(s, 0), h + 1, '1st death (the sacrifice) draws a card');
});

test('Mana Ramp charges a filled Mana Orb you can spend right away', () => {
  let s = setup();
  s = settle(play(s, 0, 'Mana Ramp', [], 2), { choose: (d) => d.options[0] });
  const orbs = s.players[0].orbs;
  assert.equal(orbs.length, 1);
  assert.equal(orbs[0].filled, true);
});

test('Charges made by card effects arrive as filled Mana Orbs (Mana Ramp, Cosmic Channeling)', () => {
  let s = setup();
  const card = toHand(s, 0, 'Rinse');
  s = settle(play(s, 0, 'Mana Ramp', [], 2), { choose: () => card });
  assert.deepEqual(s.players[0].orbs.map((o) => o.filled), [true]);
  s = settle(play(s, 0, 'Cosmic Channeling', [], 2));
  // Paying for Cosmic Channeling spent the first Orb (auto-pay uses Orbs before Rocks); the new one is filled.
  assert.equal(s.players[0].orbs.length, 2);
  assert.equal(s.players[0].orbs[1].filled, true);
});

test('Mana Portal: the swap is once per round (not again on opponents’ turns)', () => {
  let s = setup();
  const portal = put(s, 0, 'Mana Portal');
  const a = toHand(s, 0, 'Rinse');
  s = act(s, { type: 'charge', player: 0, card: a });
  toHand(s, 0, 'Research');
  s = settle(act(s, { type: 'activate', player: 0, card: portal, ability: 1 }));
  assert.throws(() => act(s, { type: 'activate', player: 0, card: portal, ability: 1 }), /once per round/);
  s = act(s, { type: 'pass', player: 0 }); // end Main: on to P1's turn
  s = advanceTo(s, 1);
  assert.throws(() => act(s, { type: 'activate', player: 0, card: portal, ability: 1 }), /once per round|priority|cannot/);
  s = advanceTo(s, 0);
  s = settle(act(s, { type: 'activate', player: 0, card: portal, ability: 1 }));
});

test('Steelshaper Vanguard: saying No ends the keyword offers; each Yes offers again', () => {
  let s = setup();
  const vg = put(s, 0, 'Steelshaper Vanguard');
  for (let i = 0; i < 6; i++) put(s, 0, 'Mana Tree');
  s = act(s, { type: 'attack', player: 0, attacker: vg, target: 1 });
  while (!(s.decision && s.decision.kind === 'confirm') && whoMustAct(s) !== null) s = act(s, { type: 'pass', player: whoMustAct(s)! });
  assert.equal(s.decision?.kind, 'confirm');
  // Yes once: tap two Artifacts, pick DOUBLE STRIKE, and get asked again.
  s = act(s, { type: 'confirm', player: 0, accept: true });
  const trees = s.players[0].field.filter((i) => s.cards[i].cardId === 'mana-tree');
  s = act(s, { type: 'choose', player: 0, choice: trees[0] });
  s = act(s, { type: 'choose', player: 0, choice: trees[1] });
  s = act(s, { type: 'mode', player: 0, index: 1 });
  assert.ok(hasKeyword(s, vg, 'DOUBLE STRIKE'));
  assert.equal(s.decision?.kind, 'confirm', 'offered again after a Yes');
  // No: no more offers.
  s = act(s, { type: 'confirm', player: 0, accept: false });
  assert.notEqual(s.decision?.kind, 'confirm');
  assert.equal(s.log.filter((l) => l.includes('decline')).length, 1);
});
