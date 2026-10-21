// Deck share codes: a short text a player can copy and a friend can paste ("MP1-…").
// It holds the deck's name, its Field and its cards (by card number, so it stays short).
import { deckCardIds } from './engine';
import { cardNumber } from './storage';

const PREFIX = 'MP1-';

const idByNumber = new Map<number, string>();
for (const id of deckCardIds()) {
  const n = cardNumber(id);
  if (n !== undefined) idByNumber.set(n, id);
}

function toBase64Url(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4))));
}

export function encodeDeck(name: string, field: string | null | undefined, cards: string[]): string {
  const nums = cards.map((c) => cardNumber(c)).filter((n): n is number => n !== undefined);
  return PREFIX + toBase64Url(JSON.stringify({ n: name, f: field ?? null, c: nums }));
}

export function decodeDeck(code: string): { name: string; field: string | null; cards: string[]; unknown: number } | null {
  const t = code.trim().replace(/\s+/g, '');
  if (!t.startsWith(PREFIX)) return null;
  try {
    const o = JSON.parse(fromBase64Url(t.slice(PREFIX.length))) as { n?: string; f?: string | null; c?: number[] };
    if (!Array.isArray(o.c)) return null;
    const cards: string[] = [];
    let unknown = 0;
    for (const n of o.c) {
      const id = idByNumber.get(n);
      if (id && !cards.includes(id)) cards.push(id);
      else if (!id) unknown++;
    }
    return { name: String(o.n ?? 'Imported deck').slice(0, 40), field: o.f ?? null, cards, unknown };
  } catch {
    return null;
  }
}
