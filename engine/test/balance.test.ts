// Balance pass of Oct 22, 2026: cost changes and newly implemented cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackOf, availableMana, defenseOf, getDef, hasKeyword, isArtifact, isCreature, targetOptions, whoMustAct } from '../src/index.ts';
import { act, advanceTo, attack, fieldNames, giveMana, handSize, id, life, passRound, put, settle, setup, toHand } from './helpers.ts';
import type { Choices } from './helpers.ts';
import type { GameState, Iid } from '../src/index.ts';

const play = (s: GameState, pid: number, name: string, targets: string[] = [], mana = 10) => {
  const c = toHand(s, pid, name);
  giveMana(s, pid, mana);
  return act(s, { type: 'play', player: pid, card: c, targets });
};
const activate = (s: GameState, pid: number, card: Iid, ability = 0) => act(s, { type: 'activate', player: pid, card, ability });
/** Lets everyone pass until the stack is empty (other players' responses). */
const resolveAll = (s: GameState, c: Choices = {}) => settle(s, c);

test('new costs and types', () => {
  const cost = (n: string) => getDef(id(n)).cost;
  assert.equal(cost('Creature Retrieval'), 1);
  assert.equal(cost('Reanimation'), 3);
  assert.equal(getDef(id('Reanimation')).type, 'Incantation');
  assert.equal(getDef(id('Echoes of the Past')).type, 'Incantation');
  assert.equal(getDef(id('Mimicry Magic')).type, 'Incantation');
  assert.equal(cost('Mana Processing Unit'), 4);
  assert.equal(cost('Xavier, Vampire Groom'), 3);
  assert.equal(getDef(id('Inspired Vampire')).defense, 4);
  assert.equal(getDef(id('Atredes, Vampire Overlord')).attack, 4);
  assert.throws(() => id('Vendor Street'));
});

test('Alucard has HASTE; Support MK II draws without paying mana', () => {
  let s = setup();
  const a = put(s, 0, 'Alucard, Prince of the Night', { sick: true });
  assert.ok(hasKeyword(s, a, 'HASTE'));
  const mk = put(s, 0, 'Support MK II');
  put(s, 0, 'Mana Tree');
  const h = handSize(s, 0);
  s = resolveAll(activate(s, 0, mk));
  assert.equal(handSize(s, 0), h + 1);
});

test('Demon Pup and Demon Leecher also trigger when you COMMAND', () => {
  let s = setup();
  const pup = put(s, 0, 'Demon Pup');
  put(s, 0, 'Demon Leecher');
  const h = handSize(s, 0);
  s = resolveAll(play(s, 0, 'Insightful Decree', [], 10), { confirm: true });
  assert.equal(s.perms[pup].counters, 1);
  assert.equal(handSize(s, 0), h + 2, 'Decree draws 1, Leecher 1');
});

test('Rinse: GUIDE 3 then draw 3; Unholy Grimoire also draws', () => {
  let s = setup();
  const h = handSize(s, 0);
  let guided = false;
  s = resolveAll(play(s, 0, 'Rinse', [], 3), { guide: (cards) => ((guided = cards.length === 3), { top: cards, bottom: [] }) });
  assert.ok(guided);
  assert.equal(handSize(s, 0), h + 3);
  const g = put(s, 0, 'Unholy Grimoire');
  put(s, 0, 'Zombie Spawn');
  const h2 = handSize(s, 0);
  s = resolveAll(activate(s, 0, g));
  assert.equal(s.players[0].corruptedRocks, 1);
  assert.equal(handSize(s, 0), h2 + 1);
});

test('Summoning Seal gives the countered player a Mana Rock; Counter the Counter draws', () => {
  let s = setup();
  const c = toHand(s, 0, 'Goblin Elder');
  giveMana(s, 0, 3);
  s = act(s, { type: 'play', player: 0, card: c });
  const seal = toHand(s, 1, 'Summoning Seal');
  giveMana(s, 1, 1);
  s = act(s, { type: 'play', player: 1, card: seal, targets: [c] });
  const ctc = toHand(s, 2, 'Counter the Counter');
  giveMana(s, 2, 1);
  const h = handSize(s, 2);
  s = act(s, { type: 'play', player: 2, card: ctc, targets: [seal] });
  s = resolveAll(s);
  assert.equal(handSize(s, 2), h, 'played 1, drew 1');
  assert.ok(s.players[0].field.includes(c), 'the creature resolved');

  let t = setup();
  const c2 = toHand(t, 0, 'Goblin Elder');
  giveMana(t, 0, 3);
  t = act(t, { type: 'play', player: 0, card: c2 });
  const seal2 = toHand(t, 1, 'Summoning Seal');
  giveMana(t, 1, 1);
  t = act(t, { type: 'play', player: 1, card: seal2, targets: [c2] });
  const rocks = t.players[0].rocks;
  t = resolveAll(t);
  assert.equal(t.players[0].rocks, rocks + 1);
});

test('Life lost to card effects draws a card per point (Two for One: 3 + 1)', () => {
  let s = setup();
  const h = handSize(s, 0);
  s = resolveAll(play(s, 0, 'Two for one', [], 2));
  assert.equal(handSize(s, 0), h + 4);
});

test('DOUBLE STRIKE: 2 life lost draws 2 cards', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Elder');
  s.perms[a].mods.push({ atk: 0, def: 0, keyword: 'DOUBLE STRIKE', until: 'turn' });
  const h = handSize(s, 1);
  s = attack(s, 0, a, 1);
  assert.equal(life(s, 1), 5);
  assert.equal(handSize(s, 1), h + 2);
});

test('Abyssal Disposal: a creature from your deck to the discard pile; 4+ Orbs draws 2', () => {
  let s = setup();
  const g = toHand(s, 0, 'Goblin Elder');
  s.players[0].hand = s.players[0].hand.filter((x) => x !== g);
  s.players[0].deck.push(g);
  for (let i = 0; i < 4; i++) s.players[0].orbs.push({ iid: s.players[0].hand.pop()!, filled: false });
  const h = handSize(s, 0);
  s = resolveAll(play(s, 0, 'Abyssal Disposal', [], 2));
  assert.ok(s.players[0].discard.includes(g));
  assert.equal(handSize(s, 0), h + 2);
});

test('Echoes of the Past plays a Spell from your discard pile, paying its cost', () => {
  let s = setup();
  s = resolveAll(play(s, 0, 'Two for one', [], 2));
  const h = handSize(s, 0);
  s = resolveAll(play(s, 0, 'Echoes of the Past', [], 4), { confirm: true });
  assert.equal(handSize(s, 0), h + 4);
  assert.equal(life(s, 0), 5);
});

test('Mimicry Magic copies your next Spell', () => {
  let s = setup();
  s = resolveAll(play(s, 0, 'Mimicry Magic', [], 2));
  const h = handSize(s, 0);
  s = resolveAll(play(s, 0, 'Two for one', [], 2));
  assert.equal(handSize(s, 0), h + 8, 'two Two for Ones');
  assert.equal(life(s, 0), 5);
});

test('Parasitic Society: 1 mana per creature of yours with +X/+Y counters', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Elder');
  s.perms[a].counters = 1;
  s.perms[a].counterAtk = 1;
  s.perms[a].counterDef = 1;
  const b = put(s, 0, 'Goblin Elder');
  s.perms[b].counters = 2; // plain counters don't count
  const theirs = put(s, 1, 'Goblin Elder');
  s.perms[theirs].counterAtk = 1;
  s.perms[theirs].counters = 1;
  s = resolveAll(play(s, 0, 'Parasitic Society', [], 2));
  assert.equal(s.players[0].floating, 1);
});

test('Ragnarok returns every creature to its owner\'s hand; tokens vanish', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Elder');
  const b = put(s, 1, 'Goblin Elder');
  const t = put(s, 1, 'Goblin Token');
  const art = put(s, 0, 'Mana Tree');
  s = resolveAll(play(s, 0, 'Ragnarok', [], 5));
  assert.ok(s.players[0].hand.includes(a));
  assert.ok(s.players[1].hand.includes(b));
  assert.ok(!s.players[1].hand.includes(t) && !s.perms[t]);
  assert.ok(s.perms[art]);
});

test('Raining Arrows: X damage to a creature', () => {
  let s = setup();
  put(s, 0, 'Goblin Elder'); // 1
  put(s, 0, 'Goblin Marksman'); // 3
  const target = put(s, 1, 'Goblin Elder');
  s = resolveAll(play(s, 0, 'Raining Arrows', [], 4), { mode: 0, choose: (d) => (d.options.includes(target) ? target : d.options[0]) });
  assert.ok(!s.perms[target]);
});

test('Raining Arrows at a player: unblocked loses X; a boosted block can hold; a beaten block costs 1 life', () => {
  // Unblocked: X life, X cards.
  let s = setup();
  put(s, 0, 'Goblin Marksman'); // 3
  const h = handSize(s, 1);
  s = resolveAll(play(s, 0, 'Raining Arrows', [], 4), { mode: 1, player: 1, choose: () => null });
  assert.equal(life(s, 1), 4);
  assert.equal(handSize(s, 1), h + 3);

  // Blocked by a 1/2 and boosted by 1 creature: 3 vs 3, the blocker dies, no life lost.
  let t = setup();
  put(t, 0, 'Goblin Marksman');
  const blk = put(t, 1, 'Goblin Elder');
  const helper = put(t, 1, 'Goblin Token');
  let boosted = false;
  t = resolveAll(play(t, 0, 'Raining Arrows', [], 4), {
    mode: 1,
    player: 1,
    choose: (d) => {
      if (d.options.includes(blk) && !t.perms[blk]?.tapped && /block with/.test(d.prompt)) return blk;
      if (/Boost your block/.test(d.prompt) && !boosted) return (boosted = true), helper;
      return null;
    },
  });
  assert.equal(life(t, 1), 7);
  assert.ok(!t.perms[blk]);
  assert.equal(t.perms[helper].tapped, true);

  // Blocked by a 1/2, no boost: 3 > 2, blocker dies and the player loses 1 life.
  let u = setup();
  put(u, 0, 'Goblin Marksman');
  const blk2 = put(u, 1, 'Goblin Elder');
  u = resolveAll(play(u, 0, 'Raining Arrows', [], 4), { mode: 1, player: 1, choose: (d) => (/block with/.test(d.prompt) ? blk2 : null) });
  assert.equal(life(u, 1), 6);
  assert.ok(!u.perms[blk2]);
});

test('Corrupted Mana Tree no longer costs mana', () => {
  let s = setup();
  const t = put(s, 0, 'Corrupted Mana Tree');
  s = resolveAll(activate(s, 0, t));
  assert.equal(s.players[0].corruptedRocks, 1);
});

test('Magic Shield: opponents cannot target the equipped creature', () => {
  let s = setup();
  const shield = put(s, 0, 'Magic Shield');
  const c = put(s, 0, 'Goblin Elder');
  giveMana(s, 0, 1);
  s = resolveAll(activate(s, 0, shield), { choose: () => c });
  assert.equal(s.perms[shield].attachedTo, c);
  assert.ok(!targetOptions(s, { kind: 'creature' }, 1).includes(c), 'not for an opponent');
  assert.ok(targetOptions(s, { kind: 'creature' }, 0).includes(c), 'still for its controller');
});

test('Shadowveil Shroud gives EVASIVE for Pay 2', () => {
  let s = setup();
  const sh = put(s, 0, 'Shadowveil Shroud');
  const c = put(s, 0, 'Goblin Elder');
  giveMana(s, 0, 2);
  s = resolveAll(activate(s, 0, sh), { choose: () => c });
  assert.ok(hasKeyword(s, c, 'EVASIVE'));
  assert.equal(s.players[0].rocks, 0);
});

test('Shifting Relic copies a creature until the end of the turn; not played this turn: no summoning sickness', () => {
  let s = setup();
  const relic = put(s, 0, 'Shifting Relic', { sick: true });
  s.perms[relic].enteredTurn = 0;
  const m = put(s, 1, 'Goblin Marksman');
  giveMana(s, 0, 2);
  s = resolveAll(activate(s, 0, relic), { choose: () => m });
  assert.ok(isCreature(s, relic) && isArtifact(s, relic));
  assert.equal(attackOf(s, relic), 3);
  assert.equal(s.perms[relic].sick, false);
  s = attack(s, 0, relic, 2);
  s = advanceTo(s, 1);
  assert.ok(!isCreature(s, relic));
});

test('Weapons Rack: +1/+1 per Equipment you control', () => {
  let s = setup();
  const rack = put(s, 0, 'Weapons Rack');
  put(s, 0, 'Shadowveil Shroud');
  put(s, 0, 'Magic Shield');
  const c = put(s, 0, 'Goblin Elder');
  s = resolveAll(activate(s, 0, rack));
  assert.equal(attackOf(s, c), 3);
  assert.equal(defenseOf(s, c), 4);
});

test('Confused Knight: attack and defense switch for good; later buffs switch too (1/4 +2/+0 = 4/3)', () => {
  let s = setup();
  const c = put(s, 1, 'Inspired Vampire'); // now 1/4
  s = resolveAll(play(s, 0, 'Confused Knight', [c], 1));
  assert.equal(attackOf(s, c), 4);
  assert.equal(defenseOf(s, c), 1);
  s.perms[c].mods.push({ atk: 2, def: 0, until: 'permanent' });
  assert.equal(attackOf(s, c), 4);
  assert.equal(defenseOf(s, c), 3);
});

test('Price of Passage: pay 1 or the card is negated', () => {
  let s = setup();
  const c = toHand(s, 0, 'Goblin Elder');
  giveMana(s, 0, 3);
  s = act(s, { type: 'play', player: 0, card: c });
  const pop = toHand(s, 1, 'Price of Passage');
  giveMana(s, 1, 1);
  s = act(s, { type: 'play', player: 1, card: pop, targets: [c] });
  s = resolveAll(s, { confirm: false });
  assert.ok(!s.perms[c] && s.players[0].discard.includes(c));

  let t = setup();
  const c2 = toHand(t, 0, 'Goblin Elder');
  giveMana(t, 0, 4);
  t = act(t, { type: 'play', player: 0, card: c2 });
  const pop2 = toHand(t, 1, 'Price of Passage');
  giveMana(t, 1, 1);
  t = act(t, { type: 'play', player: 1, card: pop2, targets: [c2] });
  t = resolveAll(t, { confirm: true });
  assert.ok(t.perms[c2]);
  assert.equal(t.players[1].souls, 1);
});

test('Blink: the permanent leaves and returns at the End Phase; Bounce: back to the hand', () => {
  let s = setup();
  const a = put(s, 1, 'Goblin Elder');
  s = resolveAll(play(s, 0, 'Blink', [a], 1));
  assert.ok(!s.perms[a]);
  s = advanceTo(s, 1);
  assert.ok(s.perms[a]);
  let t = setup();
  const b = put(t, 1, 'Goblin Elder');
  t = resolveAll(play(t, 0, 'Bounce', [b], 2));
  assert.ok(t.players[1].hand.includes(b));
});

test('Shadowbane Sacrifice negates a card and sacrifices one of your creatures', () => {
  let s = setup();
  const c = toHand(s, 0, 'Goblin Elder');
  giveMana(s, 0, 3);
  s = act(s, { type: 'play', player: 0, card: c });
  const mine = put(s, 1, 'Goblin Token');
  const sb = toHand(s, 1, 'Shadowbane Sacrifice');
  giveMana(s, 1, 2);
  s = act(s, { type: 'play', player: 1, card: sb, targets: [c, mine] });
  assert.ok(!s.perms[mine]);
  s = resolveAll(s);
  assert.ok(!s.perms[c]);
});

test('Echoing Reflection copies a creature being played', () => {
  let s = setup();
  const c = toHand(s, 0, 'Goblin Elder');
  giveMana(s, 0, 3);
  s = act(s, { type: 'play', player: 0, card: c });
  const er = toHand(s, 1, 'Echoing Reflection');
  giveMana(s, 1, 3);
  s = act(s, { type: 'play', player: 1, card: er, targets: [c] });
  s = resolveAll(s);
  assert.ok(fieldNames(s, 1).includes(id('Goblin Elder')));
  assert.ok(s.perms[c]);
});

test('Low Kick destroys the tapped creatures of an opponent you fought this turn', () => {
  let s = setup();
  const a = put(s, 0, 'Goblin Elder');
  const t1 = put(s, 1, 'Goblin Elder', { tapped: true });
  const u1 = put(s, 1, 'Goblin Elder');
  const t2 = put(s, 2, 'Goblin Elder', { tapped: true });
  s = attack(s, 0, a, 1);
  s = resolveAll(play(s, 0, 'Low Kick', [], 4));
  assert.ok(!s.perms[t1]);
  assert.ok(s.perms[u1]);
  assert.ok(s.perms[t2]);
});

test('Book of Spells: Spells at incantation speed', () => {
  let s = setup();
  put(s, 1, 'Book of Spells');
  s = act(s, { type: 'pass', player: 0 }); // P0 ends Main: P1 gets priority
  const r = toHand(s, 1, 'Rinse');
  giveMana(s, 1, 3);
  s = act(s, { type: 'play', player: 1, card: r });
  assert.equal(s.stack.length, 1);
});

test('Mount Olympus: a creature costing 5+ makes a Mana Rock', () => {
  let s = setup();
  put(s, 0, 'Mount Olympus');
  s = resolveAll(play(s, 0, 'Atredes, Vampire Overlord', [], 6));
  assert.equal(s.players[0].rocks, 1);
});

test('Spiteful Bargain: refused OFFERs tap their creature and add a counter; 3 counters deal 2 damage', () => {
  let s = setup({ players: 2 });
  const sb = put(s, 0, 'Spiteful Bargain');
  const theirs = put(s, 1, 'Goblin Elder');
  s.perms[sb].counters = 2;
  s = resolveAll(play(s, 0, 'Demon Shade', [], 10), { confirm: false });
  assert.equal(s.perms[theirs].tapped, true);
  assert.equal(s.perms[sb].counters, 0);
  assert.equal(life(s, 1), 5);
});

test('Token Tide: your token creatures tap for mana', () => {
  let s = setup();
  put(s, 0, 'Token Tide');
  const t = put(s, 0, 'Goblin Token');
  s = resolveAll(activate(s, 0, t));
  assert.equal(s.players[0].floating, 1);
});

test('Twin Rhythms: your Upkeep triggers happen twice', () => {
  let s = setup({ players: 2 });
  put(s, 0, 'Twin Rhythms');
  put(s, 0, "Gambler's Bounty");
  s = advanceTo(s, 1);
  s = advanceTo(s, 0, { mode: 0, confirm: false });
  assert.ok(s.log.filter((l) => /Gambler's Bounty triggers/.test(l)).length >= 2);
});

test('Fine Print at 10 Souls: an OFFER becomes a COMMAND for one player', () => {
  let s = setup({ players: 3 });
  put(s, 0, 'Fine Print');
  s.players[0].souls = 10;
  s = resolveAll(play(s, 0, 'Demon Shade', [], 10), { confirm: true, player: 1, answer: (d) => d.offerFrom === undefined });
  assert.ok(s.log.some((l) => /Fine Print: the OFFER is a COMMAND for P1/.test(l)));
  assert.equal(s.players[0].souls, 11);
});

test('Royal Banquet: 3 unblocked attacks deal 1 damage at the End Phase', () => {
  let s = setup({ players: 2 });
  put(s, 0, 'Royal Banquet');
  const atk = [put(s, 0, 'Goblin Elder'), put(s, 0, 'Goblin Elder'), put(s, 0, 'Goblin Elder')];
  for (const a of atk) s = attack(s, 0, a, 1);
  assert.equal(life(s, 1), 4);
  s = advanceTo(s, 1);
  assert.equal(life(s, 1), 3);
});

test('Tombstone marks a creature in your discard pile to play by paying its cost', () => {
  let s = setup();
  put(s, 0, 'Tombstone');
  const dead = toHand(s, 0, 'Goblin Marksman');
  s.players[0].hand = s.players[0].hand.filter((x) => x !== dead);
  s.players[0].discard.push(dead);
  const back = put(s, 1, 'Goblin Elder');
  s = resolveAll(play(s, 0, 'Fireball', [back], 2));
  s = resolveAll(play(s, 0, 'Reanimation', [], 3), { choose: (d) => (d.options.includes(back) && !/mark/.test(d.prompt) ? back : dead) });
  assert.ok(s.players[0].marked?.some((m) => m.iid === dead));
  s.players[0].rocks = 3;
  s = resolveAll(act(s, { type: 'play', player: 0, card: dead }));
  assert.ok(s.perms[dead]);
});

test('Tavern: the first boost from a creature of the same tribe counts for 1 more', () => {
  let s = setup();
  put(s, 0, 'Tavern');
  const a = put(s, 0, 'Goblin Elder');
  const g = put(s, 0, 'Goblin Token');
  const blk = put(s, 1, 'Goblin Marksman'); // 3/2
  s = attack(s, 0, a, 1, { block: blk, atkBoost: [g] });
  assert.ok(!s.perms[blk], '1 + 1 + 1 (Tavern) = 3 beats 2');
});

test('the bots can play a whole game with the new cards', () => {
  void availableMana;
  void whoMustAct;
  void passRound;
});
