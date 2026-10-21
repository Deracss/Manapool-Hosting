import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activatedOf, hasKeyword } from '../src/index.ts';
import type { GameState, Iid } from '../src/index.ts';
import { act, advanceTo, giveMana, put, settle, setup, toHand as putInHand } from './helpers.ts';

const activate = (s: GameState, pid: number, card: Iid, ability = 0) => act(s, { type: 'activate', player: pid, card, ability });

test('Equipment: pay to equip, pay again to move, stays behind when the creature leaves', () => {
  let s = setup();
  const fangs = put(s, 0, 'Fangs');
  const a = put(s, 0, 'Meditating Monk', { sick: false });
  const b = put(s, 0, 'Mischievous Child', { sick: false });
  giveMana(s, 0, 12);
  s = settle(activate(s, 0, fangs), { choose: () => a });
  assert.ok(hasKeyword(s, a, 'DMG GAIN'));
  s = settle(activate(s, 0, fangs), { choose: () => b });
  assert.ok(!hasKeyword(s, a, 'DMG GAIN'));
  assert.ok(hasKeyword(s, b, 'DMG GAIN'));
  s = settle(act(s, { type: 'play', player: 0, card: putInHand(s, 0, 'End of War') }));
  assert.ok(s.perms[fangs] && !s.perms[fangs].attachedTo);
});

test('Equip is spell speed: not while something is on the stack', () => {
  let s = setup();
  const fangs = put(s, 0, 'Fangs');
  put(s, 0, 'Meditating Monk', { sick: false });
  const monk2 = put(s, 0, 'Meditating Monk', { sick: false });
  giveMana(s, 0, 4);
  s = activate(s, 0, monk2); // a Tap ability goes on the stack
  assert.throws(() => activate(s, 0, fangs), /cannot activate/);
});

test('RECONFIGURE: untap once per round, any time you have priority', () => {
  let s = setup();
  const cf = put(s, 0, 'Crystalforge Automaton', { sick: false });
  s = settle(activate(s, 0, cf));
  assert.equal(s.players[0].rocks, 1);
  const rc = activatedOf(s, cf).findIndex((ab) => ab.reconfigure);
  assert.ok(rc > 0);
  s = activate(s, 0, cf, rc);
  assert.equal(s.perms[cf].tapped, false);
  s = settle(activate(s, 0, cf));
  assert.equal(s.players[0].rocks, 2);
  assert.throws(() => activate(s, 0, cf, rc), /already used RECONFIGURE/);
  s = advanceTo(s, 0);
  s = settle(activate(s, 0, cf));
  s = activate(s, 0, cf, rc);
  assert.equal(s.perms[cf].tapped, false);
});

test('Recalibrator Sentinel gives your Artifacts RECONFIGURE; Runes grant it', () => {
  let s = setup();
  const well = put(s, 0, 'Elemental Well');
  assert.ok(!hasKeyword(s, well, 'RECONFIGURE'));
  const rec = put(s, 0, 'Recalibrator Sentinel');
  assert.ok(hasKeyword(s, well, 'RECONFIGURE'));
  assert.ok(hasKeyword(s, rec, 'RECONFIGURE')); // Constructs are Artifacts
  let t = setup();
  const runes = put(t, 0, 'Runes of Configuration');
  const tree = put(t, 0, 'Mana Tree');
  t = settle(activate(t, 0, runes), { choose: () => tree });
  assert.ok(hasKeyword(t, tree, 'RECONFIGURE'));
});
