// Merges printed card data (data/cards.json) with card scripts into one lookup.
import rawDb from '../../data/cards.json' with { type: 'json' };
import type { CardData, CardDef, CardScript } from '../types.ts';
import { goblinScripts } from './goblins.ts';
import { incantationScripts } from './incantations.ts';
import { fieldScripts } from './fields.ts';
import { druidScripts } from './druids.ts';
import { essentialScripts } from './essentials.ts';
import { constructScripts, demonScripts, vampireScripts, zombieScripts } from './tribes.ts';
import { rulingScripts } from './rulings.ts';

interface RawDb {
  keywords: Record<string, string>;
  cards: CardData[];
  fields: CardData[];
  tokens: CardData[];
}

const raw = rawDb as unknown as RawDb;

const scripts: Record<string, CardScript> = {
  ...goblinScripts,
  ...incantationScripts,
  ...fieldScripts,
  ...druidScripts,
  ...essentialScripts,
  ...vampireScripts,
  ...zombieScripts,
  ...constructScripts,
  ...demonScripts,
  ...rulingScripts,
};

const defs = new Map<string, CardDef>();
for (const c of [...raw.cards, ...raw.fields, ...raw.tokens]) {
  const data: CardData = {
    id: c.id,
    name: c.name,
    type: c.type,
    tribe: c.tribe ?? undefined,
    speed: c.speed ?? undefined,
    cost: c.cost ?? null,
    attack: c.attack ?? null,
    defense: c.defense ?? null,
    text: c.text ?? '',
  };
  defs.set(c.id, { ...data, script: scripts[c.id] ?? {}, scripted: c.id in scripts && !scripts[c.id].todo });
}

for (const id of Object.keys(scripts)) {
  if (!defs.has(id)) throw new Error(`Script for unknown card id "${id}"`);
}

/** In online games, cards you can't see (other players' hands, every deck, face-down Orbs) arrive as this. */
export const HIDDEN_CARD = 'hidden';
const hiddenDef: CardDef = { id: HIDDEN_CARD, name: 'Face-down card', type: 'Spell', cost: 0, attack: null, defense: null, text: '', script: {}, scripted: true } as unknown as CardDef;

export function getDef(cardId: string): CardDef {
  if (cardId === HIDDEN_CARD) return hiddenDef;
  const d = defs.get(cardId);
  if (!d) throw new Error(`Unknown card id "${cardId}"`);
  return d;
}

export function allDefs(): CardDef[] {
  return [...defs.values()];
}

/** Ids of deck-buildable cards (not tokens or fields). */
export function deckCardIds(): string[] {
  return raw.cards.map((c) => c.id);
}

export function cardIdByName(name: string): string {
  for (const d of defs.values()) if (d.name.toLowerCase() === name.toLowerCase()) return d.id;
  throw new Error(`No card named "${name}"`);
}

/** Short rules explanations for each keyword, from the rules document. */
export function keywordGlossary(): Record<string, string> {
  return { ...raw.keywords };
}
