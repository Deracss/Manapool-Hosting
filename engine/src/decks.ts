// Sample decks for tests: every Goblin and the scripted Incantations, then other cards to reach 60.
import { allDefs } from './cards/registry.ts';

export function goblinDeck(offset = 0): string[] {
  const defs = allDefs().filter((d) => !['Token', 'Mana Token', 'Field'].includes(d.type));
  const core = defs.filter((d) => d.tribe === 'Goblin' || ['fireball', 'swords-up', 'shields-up', 'no'].includes(d.id)).map((d) => d.id);
  const filler = defs.filter((d) => !core.includes(d.id)).map((d) => d.id);
  const start = offset % filler.length;
  const rotated = [...filler.slice(start), ...filler.slice(0, start)];
  return [...core, ...rotated.slice(0, 60 - core.length)];
}
