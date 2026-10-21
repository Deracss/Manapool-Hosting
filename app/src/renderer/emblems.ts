// Faint line-drawn emblems in the middle of each card: the creature's tribe, or a symbol for its type.
// Paths are drawn on a 24×24 grid with round strokes.
const TRIBE: Record<string, string> = {
  Goblin: 'M12 4c-3 0-5 2.5-5 6v2l-5-3 2 6 3 1c.6 3 2.6 5 5 5s4.4-2 5-5l3-1 2-6-5 3v-2c0-3.5-2-6-5-6z M9.5 12.5h.01 M14.5 12.5h.01',
  Vampire: 'M3 8c3 0 5 1 6 3 1-2 2-3 3-3s2 1 3 3c1-2 3-3 6-3-1 3-3 5-6 5l-1 3-2-2-2 2-1-3c-3 0-5-2-6-5z M10.5 13l.5 2.5.5-2.5 M12.5 13l.5 2.5.5-2.5',
  Zombie: 'M3 20h18 M8 20v-6l-2-5 1-1 2 3V6l1-1 1 1v5V4l1-1 1 1v7V5l1-1 1 1v8l1-2 1 1-1 4v4',
  Demon: 'M5 3c0 4 1 6 3 7-1 1-2 3-2 5 0 4 3 6 6 6s6-2 6-6c0-2-1-4-2-5 2-1 3-3 3-7-2 2-4 3-6 3h-2C9 6 7 5 5 3z M9.5 14h.01 M14.5 14h.01',
  Construct: 'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1',
  Human: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z M12 8v8 M8.5 11h7',
  God: 'M12 5a3 3 0 1 0 0 6 3 3 0 1 0 0-6z M12 1v2 M12 13v1 M4 8H2 M22 8h-2 M6 3l1.5 1.5 M18 3l-1.5 1.5 M5 21c1-5 3-7 7-7s6 2 7 7 M3 16c2 1 3 3 3 5 M21 16c-2 1-3 3-3 5',
  Druid: 'M20 4C10 4 5 9 5 16c0 1 0 2 .5 3C7 13 11 10 16 8c-4 3-7 6-9 11 1 .5 2 1 4 1 7 0 9-6 9-16z',
  Dragon: 'M3 18c4-1 6-4 7-8l-3-1 4-2 1-4 2 4 5 1-3 3c1 4 4 6 5 7-5 0-8-2-10-5-1 3-4 5-8 5z',
};
const ALIAS: Record<string, string> = { Demigod: 'God', 'Dragon Rider': 'Dragon' };
const TYPE: Record<string, string> = {
  Spell: 'M12 2l2.4 6.6L21 9l-5 4.4L17.5 21 12 17l-5.5 4L8 13.4 3 9l6.6-.4z',
  Incantation: 'M13 2L5 13h6l-1 9 8-12h-6z',
  Artifact: 'M6 3h12l3 6-9 12L3 9z M3 9h18 M9 3l3 6 3-6 M12 9v12',
  Anthem: 'M5 21V3 M5 4h12l-3 4 3 4H5',
  Field: 'M3 20l6-9 4 5 3-4 5 8z M17 5a2 2 0 1 0 0 4 2 2 0 1 0 0-4z',
};

export function emblemFor(type: string, tribe: string | null | undefined): string | null {
  const t = tribe ? (ALIAS[tribe] ?? tribe) : null;
  if (t && TRIBE[t]) return TRIBE[t];
  return TYPE[type] ?? null;
}
