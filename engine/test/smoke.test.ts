import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allDefs, apply, createGame, validateDeck } from '../src/index.ts';
import { botAction } from '../src/bot.ts';
import { goblinDeck } from '../src/decks.ts';

test('sample Goblin decks are legal', () => {
  for (let i = 0; i < 4; i++) assert.deepEqual(validateDeck(goblinDeck(i * 9)), []);
});

test('25 four-player bot games run without rules errors and keep the game state consistent', () => {
  let finished = 0;
  for (let seed = 1; seed <= 25; seed++) {
    let s = createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ name: `P${i}`, deck: goblinDeck(i * 9), field: 'forest' })) });
    let steps = 0;
    while (s.phase !== 'over' && s.turn <= 120 && steps < 30000) {
      s = apply(s, botAction(s));
      steps++;
      // Every card is in exactly one place.
      if (steps % 50 === 0) {
        const seen = new Set<string>();
        for (const p of s.players) {
          for (const iid of [...p.deck, ...p.hand, ...p.discard, ...p.field, ...p.orbs.map((o) => o.iid)]) {
            assert.ok(!seen.has(iid), `seed ${seed}: ${iid} is in two places`);
            seen.add(iid);
          }
        }
        for (const iid of Object.keys(s.perms)) assert.ok(s.players[s.perms[iid].controller].field.includes(iid));
      }
    }
    if (s.phase === 'over') {
      finished++;
      assert.equal(s.players.filter((p) => !p.eliminated).length, 1);
    }
  }
  assert.ok(finished >= 20, `only ${finished}/25 games reached a winner`);
});

test('bots play Artifacts and Anthems too: a bot with a mostly non-creature deck still builds a board', () => {
  const defs = allDefs();
  const pick = (f: (d: (typeof defs)[number]) => boolean, n: number) => defs.filter(f).slice(0, n).map((d) => d.id);
  const deck = [...pick((d) => d.tribe === 'Druid', 8), ...pick((d) => d.type === 'Anthem', 20), ...pick((d) => d.type === 'Artifact', 20), ...pick((d) => d.type === 'Spell', 12)];
  assert.deepEqual(validateDeck(deck), []);
  let good = 0;
  for (let seed = 1; seed <= 10; seed++) {
    let s = createGame({ seed, players: [goblinDeck(0), deck, goblinDeck(40), goblinDeck(0)].map((d, i) => ({ name: `P${i}`, deck: d })) });
    let most = 0;
    for (let steps = 0; s.phase !== 'over' && s.turn < 30 && steps < 20000; steps++) {
      s = apply(s, botAction(s));
      most = Math.max(most, s.players[1].field.length);
    }
    if (most >= 3) good++;
  }
  assert.ok(good >= 8, `the bot built a board (3+ permanents) in only ${good}/10 games`);
});
