import { useMemo, useState } from 'react';
import { Card, showDef, themeColor } from '../components/Card';
import { allDefs, getDef, validateDeck } from '../engine';
import type { CardDef } from '../engine';
import { allDecks, cardNumber, loadDecks, saveDecks } from '../storage';
import type { Deck } from '../storage';
import { BackButton } from './common';

const TYPES = ['All', 'Creature', 'Artifact', 'Spell', 'Incantation', 'Anthem'];
const TRIBES = ['Goblin', 'Zombie', 'Vampire', 'Human', 'Druid', 'Construct', 'Demon', 'Dragon', 'Dragon Rider', 'God', 'Demigod'];
const COSTS = ['1', '2', '3', '4', '5', '6', '7', '8+'];

const DECKABLE: CardDef[] = allDefs().filter((d) => !['Token', 'Mana Token', 'Field'].includes(d.type));

function newDeck(): Deck {
  return { id: `deck-${Date.now()}`, name: 'New deck', cards: [] };
}

export function DeckBuilder({ initialDeckId, onBack, onPlay }: { initialDeckId?: string; onBack: () => void; onPlay: (deckId: string) => void }) {
  const [saved, setSaved] = useState<Deck[]>(() => loadDecks());
  const [deck, setDeck] = useState<Deck>(() => {
    const found = allDecks().find((d) => d.id === initialDeckId) ?? loadDecks()[0];
    return found ? { ...found, cards: [...found.cards] } : newDeck();
  });
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('All');
  const [tribe, setTribe] = useState<string | null>(null);
  const [cost, setCost] = useState<string | null>(null);
  const [playableOnly, setPlayableOnly] = useState(false);
  const [hover, setHover] = useState<CardDef | null>(null);
  const [notice, setNotice] = useState('');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return DECKABLE.filter((d) => {
      if (type !== 'All' && d.type !== type) return false;
      if (tribe && d.tribe !== tribe) return false;
      if (cost) {
        const c = d.cost ?? 0;
        if (cost === '8+' ? c < 8 : c !== Number(cost)) return false;
      }
      if (playableOnly && !d.scripted && d.type !== 'Creature') return false;
      if (playableOnly && d.type === 'Creature' && !d.scripted && d.text.trim() !== '') return false;
      if (q && !d.name.toLowerCase().includes(q) && !d.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [search, type, tribe, cost, playableOnly]);

  const inDeck = new Set(deck.cards);
  const problems = validateDeck(deck.cards);
  const sorted = [...deck.cards].map(getDef).sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0) || a.name.localeCompare(b.name));
  const curve = [1, 2, 3, 4, 5, 6, 7].map((c) => deck.cards.filter((id) => (c === 7 ? (getDef(id).cost ?? 0) >= 7 : (getDef(id).cost ?? 0) === c || (c === 1 && (getDef(id).cost ?? 0) === 0))).length);
  const maxCurve = Math.max(1, ...curve);

  const edit = (cards: string[]) => {
    // Editing a sample deck makes your own copy.
    if (deck.sample) setDeck({ id: `deck-${Date.now()}`, name: `${deck.name} (copy)`, cards });
    else setDeck({ ...deck, cards });
    setDirty(true);
    setNotice('');
  };
  const toggle = (id: string) => {
    if (inDeck.has(id)) edit(deck.cards.filter((c) => c !== id));
    else if (deck.cards.length >= 60) setNotice('The deck already has 60 cards. Remove one first.');
    else edit([...deck.cards, id]);
  };
  const save = () => {
    if (deck.sample) return;
    const next = [...saved.filter((d) => d.id !== deck.id), deck];
    saveDecks(next);
    setSaved(next);
    setDirty(false);
    setNotice('Deck saved.');
  };
  const remove = () => {
    const next = saved.filter((d) => d.id !== deck.id);
    saveDecks(next);
    setSaved(next);
    setDeck(next[0] ?? newDeck());
    setDirty(false);
    setNotice('Deck deleted.');
  };
  const open = (id: string) => {
    const d = allDecks().find((x) => x.id === id);
    if (d) {
      setDeck({ ...d, cards: [...d.cards] });
      setDirty(false);
      setNotice('');
    }
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <BackButton onClick={onBack} />
        <h1>Deck builder</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          <label className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            Open
            <select className="field-input" value={allDecks().some((d) => d.id === deck.id) ? deck.id : ''} onChange={(e) => open(e.target.value)}>
              {!allDecks().some((d) => d.id === deck.id) && <option value="">{deck.name} (unsaved)</option>}
              {allDecks().map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.sample ? ' (sample)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => { setDeck(newDeck()); setDirty(false); }}>
            New deck
          </button>
          <button type="button" className="btn" onClick={save} disabled={deck.sample || !dirty}>
            Save
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={problems.length > 0}
            onClick={() => {
              if (!deck.sample) save();
              onPlay(deck.id);
            }}
          >
            Play with this deck
          </button>
        </div>
      </header>
      <div className="builder">
        <aside className="builder-filters" aria-label="Filters">
          <label className="label" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            SEARCH
            <input className="field-input" type="search" placeholder="Name or text" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="label">TYPE</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TYPES.map((t) => (
                <button key={t} type="button" className="chip" aria-pressed={type === t} onClick={() => setType(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="label">TRIBE</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TRIBES.map((t) => (
                <button key={t} type="button" className="chip" aria-pressed={tribe === t} onClick={() => setTribe(tribe === t ? null : t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="label">COST</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COSTS.map((c) => (
                <button key={c} type="button" className="chip" aria-pressed={cost === c} onClick={() => setCost(cost === c ? null : c)} style={{ fontFamily: 'var(--display)' }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15 }}>
            <input type="checkbox" checked={playableOnly} onChange={(e) => setPlayableOnly(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--gold)' }} />
            Fully working cards only
          </label>
          {hover && (
            <div style={{ marginTop: 'auto' }}>
              <Card show={showDef(hover, cardNumber(hover.id))} scale={0.645} />
            </div>
          )}
        </aside>
        <main className="builder-grid">
          <p className="muted" style={{ marginBottom: 14, fontSize: 15 }}>
            {shown.length} cards · click to add or remove · hover to read · hold Alt over a card for details
          </p>
          <div className="cards">
            {shown.map((d) => (
              <div key={d.id} className="grid-card">
                <Card show={showDef(d, cardNumber(d.id))} scale={0.5} dim={inDeck.has(d.id)} label={`${d.name}${inDeck.has(d.id) ? ', in deck' : ''}`} onClick={() => toggle(d.id)} onHover={() => setHover(d)} />
                {inDeck.has(d.id) && <span className="badge">IN DECK</span>}
                {!d.scripted && d.text.trim() !== '' && <span className="unscripted">Effect not working yet</span>}
              </div>
            ))}
          </div>
        </main>
        <aside className="builder-deck" aria-label="Your deck">
          <label className="label" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            DECK NAME
            <input
              className="field-input"
              value={deck.name}
              onChange={(e) => {
                setDeck({ ...deck, name: e.target.value, ...(deck.sample ? { id: `deck-${Date.now()}`, sample: false } : {}) });
                setDirty(true);
              }}
              style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18 }}
            />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 26, fontWeight: 700 }}>
                {deck.cards.length} <span className="muted" style={{ fontSize: 16 }}>/ 60</span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: problems.length ? 'var(--red)' : 'var(--green)' }}>
                {deck.cards.length < 60 ? `Add ${60 - deck.cards.length} more` : problems.length ? 'Fix the deck' : 'Ready to play'}
              </span>
            </div>
            <div aria-hidden="true" style={{ height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{ width: `${(deck.cards.length / 60) * 100}%`, height: 8, background: 'var(--gold)' }} />
            </div>
            {deck.sample && <p className="muted" style={{ fontSize: 13 }}>Sample decks can't be changed. Editing makes your own copy.</p>}
            {notice && <p style={{ fontSize: 13, color: 'var(--gold)' }}>{notice}</p>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="label">MANA CURVE</span>
            <div className="curve" role="img" aria-label={`Cards by cost: ${curve.map((n, i) => `${i === 6 ? '7+' : i + 1}: ${n}`).join(', ')}`}>
              {curve.map((n, i) => (
                <div key={i}>
                  <i style={{ height: Math.round((n / maxCurve) * 44) }} />
                  {i === 6 ? '7+' : i + 1}
                </div>
              ))}
            </div>
          </div>
          <div className="deck-list">
            {sorted.length === 0 && <p className="muted" style={{ fontSize: 14 }}>Click cards on the left to add them. A deck has exactly 60 different cards.</p>}
            {sorted.map((d) => (
              <div key={d.id} className="deck-row" onMouseEnter={() => setHover(d)}>
                <span className="strip" style={{ background: themeColor(d.type) }} />
                <span className="cost">{d.cost ?? 0}</span>
                <span className="nm">{d.name}</span>
                <button type="button" aria-label={`Remove ${d.name}`} onClick={() => toggle(d.id)}>
                  −
                </button>
              </div>
            ))}
          </div>
          {!deck.sample && saved.some((d) => d.id === deck.id) && (
            <button type="button" className="btn danger ghost" onClick={remove}>
              Delete this deck
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
