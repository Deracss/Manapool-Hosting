// Saved decks and settings, kept on this computer (in the app's local storage).
import { allDefs, deckCardIds, PRECON_DEFS, preconCards, validateDeck } from './engine';

export interface Deck {
  id: string;
  name: string;
  cards: string[];
  sample?: boolean; // a precon: can't be edited, only copied
  field?: string | null; // suggested Field
  tribe?: string;
}

export interface AutoPass {
  skipNothing: boolean; // pass automatically when you can't do anything
  stopAttacked: boolean; // …but stop before damage when you're attacked
  stopTargeted: boolean; // …and when a card targets your things
  stopOppEnd: boolean; // …and at every opponent's End Phase
  skipOwnSteps: boolean; // skip your own empty Upkeep and Draw
  passAll: boolean; // the table toggle: pass every response chance, even when you could act
}

export interface Settings {
  botSpeed: 'slow' | 'normal' | 'fast';
  autoPass: AutoPass;
  sound: boolean;
  volume: number; // 0–1
}

export const AUTO_PASS_DEFAULTS: AutoPass = { skipNothing: true, stopAttacked: true, stopTargeted: true, stopOppEnd: false, skipOwnSteps: true, passAll: false };

const DECKS_KEY = 'manapool.decks.v1';
const SETTINGS_KEY = 'manapool.settings.v1';

export const SAMPLE_DECKS: Deck[] = [
  ...PRECON_DEFS.map((p) => ({ id: p.id, name: p.name, cards: preconCards(p), sample: true, field: p.field, tribe: p.tribe })),
];

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable: nothing else to do
  }
}

const known = new Set(deckCardIds());

export function loadDecks(): Deck[] {
  // Drop card ids that no longer exist (the card list changes between versions).
  return read<Deck[]>(DECKS_KEY, []).map((d) => ({ ...d, cards: d.cards.filter((c) => known.has(c)) }));
}

export function saveDecks(decks: Deck[]): void {
  write(
    DECKS_KEY,
    decks.filter((d) => !d.sample),
  );
}

export function allDecks(): Deck[] {
  return [...SAMPLE_DECKS, ...loadDecks()];
}

export function isLegal(deck: Deck): boolean {
  return validateDeck(deck.cards).length === 0;
}

export function loadSettings(): Settings {
  const saved = read<{ botSpeed?: Settings['botSpeed']; autoPass?: AutoPass | boolean; sound?: boolean; volume?: number }>(SETTINGS_KEY, {});
  const ap = typeof saved.autoPass === 'object' ? { ...AUTO_PASS_DEFAULTS, ...saved.autoPass } : { ...AUTO_PASS_DEFAULTS, skipNothing: saved.autoPass !== false };
  return { botSpeed: saved.botSpeed ?? 'normal', autoPass: ap, sound: saved.sound ?? true, volume: typeof saved.volume === 'number' ? saved.volume : 0.5 };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}

export const BOT_DELAY: Record<Settings['botSpeed'], number> = { slow: 900, normal: 450, fast: 120 };

/** MP number as printed on the card frame. */
const numbers = new Map(deckCardIds().map((id, i) => [id, i + 1]));
export function cardNumber(id: string): number | undefined {
  return numbers.get(id);
}

export const FIELDS = allDefs().filter((d) => d.type === 'Field');
