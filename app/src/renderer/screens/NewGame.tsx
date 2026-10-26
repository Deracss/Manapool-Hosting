import { useMemo, useState } from 'react';
import { allDecks, deckField, FIELDS, isLegal } from '../storage';
import type { Deck } from '../storage';
import { BackButton } from './common';

export interface SeatSetup {
  name: string;
  deck: string[];
  deckName: string;
  field: string | null;
}

export interface GameSetup {
  me: SeatSetup;
  bots: SeatSetup[];
  seed: number;
  first?: number; // seat that takes the first turn (0 = you)
}

export type RematchMode = 'same' | 'swap' | 'random';

/** The next game after a rematch: same decks, your deck traded with the one you pick (`take` = that seat), or new random precons. */
export function rematchSetup(prev: GameSetup, mode: RematchMode, take = 1): GameSetup {
  const seats = [prev.me, ...prev.bots];
  let next: SeatSetup[] = seats;
  if (mode === 'swap') {
    const k = Math.min(Math.max(1, take), seats.length - 1);
    next = seats.map((s, i) => (i === 0 ? { ...seats[k], name: s.name } : i === k ? { ...seats[0], name: s.name } : s));
  }
  if (mode === 'random') {
    const pool = allDecks().filter((d) => d.sample && isLegal(d));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    next = seats.map((s, i) => {
      const d = shuffled[i % shuffled.length];
      return { name: s.name, deck: d.cards, deckName: d.name, field: d.field ?? null };
    });
  }
  return { me: next[0], bots: next.slice(1), seed: Math.floor(Math.random() * 1e9) };
}

const BOT_NAMES = ['Ben', 'Cat', 'Dev'];
const RANDOM = 'random';
const DECK_FIELD = 'deck'; // a bot uses its deck's suggested Field (a random one if the deck has none)
const PLAYABLE_FIELDS = FIELDS.filter((f) => f.scripted);
const randomField = () => PLAYABLE_FIELDS[Math.floor(Math.random() * PLAYABLE_FIELDS.length)].id;

export function NewGame({ initialDeckId, onBack, onBuilder, onStart }: { initialDeckId?: string; onBack: () => void; onBuilder: () => void; onStart: (s: GameSetup) => void }) {
  const decks = useMemo(() => allDecks(), []);
  const legal = decks.filter(isLegal);
  const [deckId, setDeckId] = useState(initialDeckId && decks.some((d) => d.id === initialDeckId && isLegal(d)) ? initialDeckId : legal[0]?.id);
  const [field, setField] = useState<string>(() => deckField(decks.find((d) => d.id === deckId)));
  const [botDecks, setBotDecks] = useState<string[]>([RANDOM, RANDOM, RANDOM]);
  const [botFields, setBotFields] = useState<string[]>([DECK_FIELD, DECK_FIELD, DECK_FIELD]);
  const mine = decks.find((d) => d.id === deckId);

  const start = () => {
    if (!mine) return;
    const pick = (id: string): Deck => (id === RANDOM ? legal[Math.floor(Math.random() * legal.length)] : decks.find((d) => d.id === id)!);
    onStart({
      me: { name: 'You', deck: mine.cards, deckName: mine.name, field },
      bots: BOT_NAMES.map((name, i) => {
        const d = pick(botDecks[i]);
        const f = botFields[i] === DECK_FIELD ? (d.field ?? randomField()) : botFields[i];
        return { name, deck: d.cards, deckName: d.name, field: f };
      }),
      seed: Math.floor(Math.random() * 1e9),
    });
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <BackButton onClick={onBack} />
        <h1>New game</h1>
        <p className="muted" style={{ marginLeft: 'auto' }}>
          You vs 3 bots · 7 life each · last player standing wins
        </p>
      </header>
      <div className="setup-grid">
        <section className="setup-col" aria-labelledby="deck-h">
          <h2 id="deck-h">1 · Your deck</h2>
          {decks.map((d) => {
            const ok = isLegal(d);
            return (
              <button key={d.id} type="button" className="option" aria-pressed={d.id === deckId} disabled={!ok} onClick={() => {
                  setDeckId(d.id);
                  setField(deckField(d));
                }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                  <span className="name">{d.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: ok ? 'var(--green)' : 'var(--red)' }}>{d.cards.length} / 60</span>
                </span>
                <span className="muted" style={{ fontSize: 15 }}>
                  {d.sample ? `Precon · ${d.tribe}${d.field ? ` · ${FIELDS.find((f) => f.id === d.field)?.name}` : ''}` : ok ? 'Your deck' : 'Not ready: a deck needs exactly 60 different cards'}
                </span>
              </button>
            );
          })}
          <button type="button" className="btn ghost" style={{ borderStyle: 'dashed' }} onClick={onBuilder}>
            Open deck builder
          </button>
        </section>
        <section className="setup-col" aria-labelledby="field-h">
          <h2 id="field-h">2 · Your field</h2>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>Every player plays with a Field.</p>
          {FIELDS.map((f) => (
            <button key={f.id} type="button" className="option" aria-pressed={f.id === field} onClick={() => setField(f.id)} style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
              <span aria-hidden="true" style={{ flex: 'none', width: 10, height: 60, borderRadius: 5, background: '#33793F' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span className="name" style={{ fontSize: 16 }}>
                  {f.name} <span className="muted" style={{ fontFamily: 'var(--body)', fontWeight: 500, fontSize: 14 }}>· {f.tribe}{f.scripted ? '' : ' · not playable yet'}</span>
                </span>
                <span style={{ fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.3, color: '#d6d0c4', whiteSpace: 'pre-line' }}>{f.text}</span>
              </span>
            </button>
          ))}
        </section>
        <section className="setup-col" aria-labelledby="opp-h">
          <h2 id="opp-h">3 · Opponents</h2>
          {BOT_NAMES.map((name, i) => (
            <div key={name} className="option" style={{ gap: 10 }}>
              <span className="name">{name}</span>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }} className="muted">
                Deck
                <select className="field-input" value={botDecks[i]} onChange={(e) => setBotDecks(botDecks.map((v, j) => (j === i ? e.target.value : v)))}>
                  <option value={RANDOM}>Random ready deck</option>
                  {legal.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }} className="muted">
                Field
                <select className="field-input" value={botFields[i]} onChange={(e) => setBotFields(botFields.map((v, j) => (j === i ? e.target.value : v)))}>
                  <option value={DECK_FIELD}>Deck's own Field</option>
                  {PLAYABLE_FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
            You take the first turn; play goes clockwise. Bot actions show in the game log.
          </p>
        </section>
      </div>
      <footer className="setup-footer">
        <p className="muted" style={{ marginRight: 'auto' }}>
          {mine ? `${mine.name} · ${FIELDS.find((f) => f.id === field)?.name} · 3 opponents` : 'Build a 60-card deck to play'}
        </p>
        <button type="button" className="btn primary big" style={{ padding: '0 36px' }} disabled={!mine} onClick={start}>
          Start game
        </button>
      </footer>
    </div>
  );
}
