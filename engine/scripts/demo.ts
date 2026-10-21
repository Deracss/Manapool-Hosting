// Plays a 4-player game between simple bots and prints the log.
// Usage: npm run demo -- [seed]
import { apply, createGame } from '../src/index.ts';
import { botAction } from '../src/bot.ts';
import { goblinDeck } from '../src/decks.ts';

const seed = Number(process.argv[2] ?? 42);
let s = createGame({
  seed,
  players: ['Ana', 'Ben', 'Cat', 'Dev'].map((name, i) => ({ name, deck: goblinDeck(i * 9), field: i % 2 === 0 ? 'forest' : null })),
});

let steps = 0;
while (s.phase !== 'over' && s.turn <= 80 && steps < 20000) {
  s = apply(s, botAction(s));
  steps++;
}
console.log(s.log.join('\n'));
console.log(`\n${steps} actions, ${s.turn} turns. ${s.winner !== null ? `Winner: ${s.players[s.winner].name}` : 'No winner yet.'}`);
console.log(s.players.map((p) => `${p.name}: ${p.eliminated ? 'eliminated' : `${p.life} life`}, ${p.deck.length} cards in deck`).join('\n'));
