import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { Card, showDef, themeColor } from '../components/Card';
import { allDefs, getDef, validateDeck } from '../engine';
import type { CardDef } from '../engine';
import { allDecks, cardNumber, FIELDS, loadDecks, loadSettings, saveDecks } from '../storage';
import type { Deck } from '../storage';
import { configureSound, playSound } from '../sound';
import { decodeDeck, encodeDeck } from '../deckCode';
import { FIELD_SCENES } from '../fieldScenes';
import { termsIn, TYPE_HELP } from '../glossary';
import { BackButton } from './common';

const TYPES = ['Creature', 'Artifact', 'Spell', 'Incantation', 'Anthem'];
const TYPE_ORDER: Record<string, number> = { Creature: 0, Artifact: 1, Anthem: 2, Spell: 3, Incantation: 4 };
const TYPE_PLURAL: Record<string, string> = { Creature: 'Creatures', Artifact: 'Artifacts', Anthem: 'Anthems', Spell: 'Spells', Incantation: 'Incantations' };
const TRIBES = ['Goblin', 'Zombie', 'Vampire', 'Human', 'Druid', 'Construct', 'Demon', 'Dragon', 'Dragon Rider', 'God', 'Demigod'];
const COSTS = ['1', '2', '3', '4', '5', '6', '7+'];
const PLAYABLE_FIELDS = FIELDS.filter((f) => f.scripted);
const DECKABLE: CardDef[] = allDefs().filter((d) => !['Token', 'Mana Token', 'Field'].includes(d.type) && d.id !== 'hidden');
const VIEW_KEY = 'manapool.builderView';

type Sort = 'cost' | 'name' | 'type' | 'number';
type Show = 'all' | 'notIn' | 'in';
type Modal =
  | { kind: 'unsaved'; then: () => void }
  | { kind: 'delete' }
  | { kind: 'share'; code: string; copied: boolean }
  | { kind: 'import'; text: string; error: string }
  | { kind: 'hand'; cards: string[] }
  | { kind: 'details'; def: CardDef };
interface Flight {
  id: number;
  def: CardDef;
  from: DOMRect;
  to: DOMRect;
}

function newDeck(): Deck {
  return { id: `deck-${Date.now()}`, name: 'New deck', cards: [], field: PLAYABLE_FIELDS[0]?.id ?? null };
}
function loadView(): { sort: Sort; size: number } {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as { sort?: Sort; size?: number };
    return { sort: v.sort ?? 'cost', size: typeof v.size === 'number' ? v.size : 0.5 };
  } catch {
    return { sort: 'cost', size: 0.5 };
  }
}
const costOf = (d: CardDef) => d.cost ?? 0;
const working = (d: CardDef) => d.scripted || d.text.trim() === '';
const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

export function DeckBuilder({ initialDeckId, onBack, onPlay }: { initialDeckId?: string; onBack: () => void; onPlay: (deckId: string) => void }) {
  const [saved, setSaved] = useState<Deck[]>(() => loadDecks());
  const [deck, setDeck] = useState<Deck>(() => {
    const found = allDecks().find((d) => d.id === initialDeckId) ?? loadDecks()[0];
    return found ? { ...found, cards: [...found.cards], field: found.field ?? PLAYABLE_FIELDS[0]?.id ?? null } : newDeck();
  });
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<Deck[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [tribes, setTribes] = useState<Set<string>>(new Set());
  const [costs, setCosts] = useState<Set<string>>(new Set());
  const [show, setShow] = useState<Show>('all');
  const [workingOnly, setWorkingOnly] = useState(false);
  const [view, setView] = useState(loadView);
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [peek, setPeek] = useState<{ def: CardDef; y: number } | null>(null);
  const pendingFlight = useRef<{ def: CardDef; from: DOMRect } | null>(null);
  const lastHoverSound = useRef(0);
  const completeOf = useRef<{ id: string; complete: boolean } | null>(null);

  useEffect(() => {
    const st = loadSettings();
    configureSound(st.sound, st.volume);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      /* ignore */
    }
  }, [view]);

  const inDeck = new Set(deck.cards);
  const problems = validateDeck(deck.cards);
  const complete = deck.cards.length === 60 && problems.length === 0;

  // Deck complete: the ring pulses and a small fanfare plays (only when it becomes complete, not when opening a deck).
  useEffect(() => {
    const prev = completeOf.current;
    completeOf.current = { id: deck.id, complete };
    if (prev && prev.id === deck.id && !prev.complete && complete) playSound('deckComplete');
  }, [complete, deck.id]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = DECKABLE.filter((d) => {
      if (types.size && !types.has(d.type)) return false;
      if (tribes.size && !tribes.has(d.tribe ?? '')) return false;
      if (costs.size) {
        const c = costOf(d);
        if (!costs.has(c >= 7 ? '7+' : String(Math.max(1, c)))) return false;
      }
      if (workingOnly && !working(d)) return false;
      if (show === 'notIn' && inDeck.has(d.id)) return false;
      if (show === 'in' && !inDeck.has(d.id)) return false;
      if (q) {
        const kws = ((d.script.keywords ?? []) as string[]).join(' ');
        const hay = `${d.name} ${d.text} ${d.type} ${d.tribe ?? ''} ${kws}`.toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const by: Record<Sort, (a: CardDef, b: CardDef) => number> = {
      cost: (a, b) => costOf(a) - costOf(b) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      type: (a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || costOf(a) - costOf(b) || a.name.localeCompare(b.name),
      number: (a, b) => (cardNumber(a.id) ?? 0) - (cardNumber(b.id) ?? 0),
    };
    return list.sort(by[view.sort]);
    // inDeck changes with the deck
  }, [search, types, tribes, costs, workingOnly, show, view.sort, deck.cards]);

  const deckDefs = deck.cards.map(getDef);
  const groups = Object.keys(TYPE_ORDER)
    .map((t) => ({ type: t, cards: deckDefs.filter((d) => d.type === t).sort((a, b) => costOf(a) - costOf(b) || a.name.localeCompare(b.name)) }))
    .filter((g) => g.cards.length || leaving.some((id) => getDef(id).type === g.type));
  const curve = [1, 2, 3, 4, 5, 6, 7].map((c) => deckDefs.filter((d) => (c === 7 ? costOf(d) >= 7 : Math.max(1, costOf(d)) === c)).length);
  const maxCurve = Math.max(4, ...curve);
  const avg = deckDefs.length ? deckDefs.reduce((n, d) => n + costOf(d), 0) / deckDefs.length : 0;
  const byType = Object.keys(TYPE_ORDER).map((t) => ({ t, n: deckDefs.filter((d) => d.type === t).length })).filter((x) => x.n);

  // ---------- editing ----------
  const commit = (next: Deck) => {
    setHistory((h) => [...h.slice(-49), deck]);
    // Editing a sample deck makes your own copy.
    setDeck(deck.sample ? { ...next, id: `deck-${Date.now()}`, name: `${deck.name} (copy)`, sample: false } : next);
    setDirty(true);
    setNotice('');
  };
  const toggle = (def: CardDef, e?: ReactMouseEvent) => {
    if (inDeck.has(def.id)) {
      commit({ ...deck, cards: deck.cards.filter((c) => c !== def.id) });
      setLeaving((l) => [...l, def.id]);
      setTimeout(() => setLeaving((l) => l.filter((x) => x !== def.id)), 260);
      setAdded((a) => {
        const n = new Set(a);
        n.delete(def.id);
        return n;
      });
      playSound('deckRemove');
    } else if (deck.cards.length >= 60) {
      setNotice('The deck already has 60 cards. Remove one first.');
    } else {
      commit({ ...deck, cards: [...deck.cards, def.id] });
      setAdded((a) => new Set(a).add(def.id));
      if (e) pendingFlight.current = { def, from: (e.currentTarget as HTMLElement).getBoundingClientRect() };
      playSound('deckAdd');
    }
  };
  // The added card flies into its row in the deck list.
  useLayoutEffect(() => {
    const p = pendingFlight.current;
    if (!p) return;
    pendingFlight.current = null;
    const row = document.querySelector(`[data-deck-row="${p.def.id}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    const f: Flight = { id: Date.now() + Math.random(), def: p.def, from: p.from, to: row.getBoundingClientRect() };
    setFlights((fs) => [...fs, f]);
    setTimeout(() => setFlights((fs) => fs.filter((x) => x.id !== f.id)), 520);
  });
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setDeck(prev);
    setDirty(true);
    playSound('deckRemove');
  };
  const save = () => {
    if (deck.sample) return;
    const next = [...saved.filter((d) => d.id !== deck.id), deck];
    saveDecks(next);
    setSaved(next);
    setDirty(false);
    setAdded(new Set());
    setNotice('Deck saved.');
    playSound('confirm');
  };
  const guard = (then: () => void) => (dirty && !deck.sample ? setModal({ kind: 'unsaved', then }) : then());
  const load = (d: Deck) => {
    setDeck({ ...d, cards: [...d.cards], field: d.field ?? PLAYABLE_FIELDS[0]?.id ?? null });
    setDirty(false);
    setHistory([]);
    setAdded(new Set());
    setNotice('');
  };
  const open = (id: string) => {
    const d = allDecks().find((x) => x.id === id);
    if (d) guard(() => load(d));
  };
  const duplicate = () => {
    setDeck({ ...deck, id: `deck-${Date.now()}`, name: `${deck.name} (copy)`, sample: false, cards: [...deck.cards] });
    setDirty(true);
    setHistory([]);
    setNotice('Copy made. Save it to keep it.');
  };
  const remove = () => {
    const next = saved.filter((d) => d.id !== deck.id);
    saveDecks(next);
    setSaved(next);
    load(next[0] ?? newDeck());
    setModal(null);
    setNotice('Deck deleted.');
  };
  const dealHand = (n: number, keep: string[] = []) => {
    const pool = shuffle(deck.cards.filter((c) => !keep.includes(c)));
    const cards = [...keep, ...pool.slice(0, n)];
    setModal({ kind: 'hand', cards });
    for (let i = keep.length; i < cards.length; i++) playSound('deal', (i - keep.length) * 90);
  };
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  };

  // ---------- hover: tilt toward the mouse, sheen, soft tick ----------
  const tilt = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(x * 14).toFixed(1)}deg`);
    el.style.setProperty('--rx', `${(-y * 10).toFixed(1)}deg`);
    el.style.setProperty('--gx', `${Math.round((x + 0.5) * 100)}%`);
  };
  const enter = () => {
    const now = performance.now();
    if (now - lastHoverSound.current > 80) {
      lastHoverSound.current = now;
      playSound('cardHover');
    }
  };
  const leave = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty('--ry', '0deg');
    e.currentTarget.style.setProperty('--rx', '0deg');
  };

  const setOf = (s: Set<string>, v: string) => {
    const n = new Set(s);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };
  const anyFilter = search || types.size || tribes.size || costs.size || show !== 'all' || workingOnly;
  const fieldId = deck.field ?? null;
  const ring = 2 * Math.PI * 31;

  return (
    <div className="screen db">
      <header className="screen-header db-head">
        <BackButton onClick={() => guard(onBack)} />
        <h1>Deck builder</h1>
        <div className="db-actions">
          <select className="field-input" aria-label="Open a deck" value={allDecks().some((d) => d.id === deck.id) ? deck.id : ''} onChange={(e) => open(e.target.value)}>
            {!allDecks().some((d) => d.id === deck.id) && <option value="">{deck.name} (unsaved)</option>}
            {allDecks().map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.sample ? ' (precon)' : ''}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => guard(() => load(newDeck()))}>
            New
          </button>
        </div>
        <div className="db-actions right">
          <button type="button" className="btn ghost" disabled={!history.length} onClick={undo} title="Undo your last change">
            ↶ Undo
          </button>
          <button type="button" className="btn" disabled={deck.cards.length < 7} onClick={() => dealHand(7)}>
            Sample hand
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={deck.sample || !dirty}>
            Save
          </button>
          <button
            type="button"
            className={`btn play${complete ? ' ready' : ''}`}
            disabled={!complete}
            onClick={() => {
              if (!deck.sample) save();
              onPlay(deck.id);
            }}
          >
            Play with this deck
          </button>
        </div>
      </header>

      <div className="db-body">
        <section className="db-main" aria-label="Cards">
          <div className="db-filters">
            <div className="db-row">
              <input className="field-input db-search" type="search" placeholder="Search name, text or keyword (e.g. haste)" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search cards" />
              {TYPES.map((t) => (
                <button key={t} type="button" className="chip" aria-pressed={types.has(t)} onClick={() => setTypes(setOf(types, t))}>
                  {t}
                </button>
              ))}
              <span className="db-view">
                <label>
                  Sort
                  <select className="field-input small" value={view.sort} onChange={(e) => setView({ ...view, sort: e.target.value as Sort })}>
                    <option value="cost">Cost</option>
                    <option value="name">Name</option>
                    <option value="type">Type</option>
                    <option value="number">Card number</option>
                  </select>
                </label>
                <label>
                  Size
                  <input type="range" min={0.36} max={0.66} step={0.02} value={view.size} onChange={(e) => setView({ ...view, size: Number(e.target.value) })} />
                </label>
              </span>
            </div>
            <div className="db-row">
              <span className="label">TRIBE</span>
              {TRIBES.map((t) => (
                <button key={t} type="button" className="chip sm" aria-pressed={tribes.has(t)} onClick={() => setTribes(setOf(tribes, t))}>
                  {t}
                </button>
              ))}
            </div>
            <div className="db-row">
              <span className="label">COST</span>
              {COSTS.map((c) => (
                <button key={c} type="button" className="chip sm cost" aria-pressed={costs.has(c)} onClick={() => setCosts(setOf(costs, c))}>
                  {c}
                </button>
              ))}
              <span className="label" style={{ marginLeft: 12 }}>
                SHOW
              </span>
              {(
                [
                  ['all', 'All'],
                  ['notIn', 'Not in deck'],
                  ['in', 'In deck'],
                ] as [Show, string][]
              ).map(([k, l]) => (
                <button key={k} type="button" className="chip sm" aria-pressed={show === k} onClick={() => setShow(k)}>
                  {l}
                </button>
              ))}
              <button type="button" className="chip sm" aria-pressed={workingOnly} onClick={() => setWorkingOnly(!workingOnly)}>
                Working only
              </button>
              {anyFilter ? (
                <button
                  type="button"
                  className="link-btn"
                  style={{ marginLeft: 'auto', color: 'var(--gold)' }}
                  onClick={() => {
                    setSearch('');
                    setTypes(new Set());
                    setTribes(new Set());
                    setCosts(new Set());
                    setShow('all');
                    setWorkingOnly(false);
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>
          <p className="db-count muted">
            {shown.length} card{shown.length === 1 ? '' : 's'} · click to add, click again to remove · right-click for details
          </p>
          <div className="db-grid" style={{ gridTemplateColumns: `repeat(auto-fill, ${Math.round(340 * view.size)}px)` }}>
            {shown.map((d) => {
              const has = inDeck.has(d.id);
              return (
                <div key={d.id} className={`db-card${has ? ' in' : ''}`} onMouseMove={tilt} onMouseEnter={enter} onMouseLeave={leave}>
                  <Card
                    show={showDef(d, cardNumber(d.id))}
                    scale={view.size}
                    label={`${d.name}${has ? ', in deck' : ''}`}
                    onClick={(e) => toggle(d, e)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setModal({ kind: 'details', def: d });
                    }}
                  />
                  <span className="sheen" aria-hidden="true" />
                  {has && (
                    <>
                      <span className="check" aria-hidden="true">
                        ✓
                      </span>
                      <span className="in-tag">IN DECK</span>
                    </>
                  )}
                  {!working(d) && <span className="unscripted">Effect not working yet</span>}
                  <span className="hint" aria-hidden="true">
                    {has ? 'Click to remove' : deck.cards.length >= 60 ? 'Deck is full' : 'Click to add'}
                  </span>
                </div>
              );
            })}
            {!shown.length && <p className="muted">No cards match these filters.</p>}
          </div>
        </section>

        <aside className="db-deck" aria-label="Your deck">
          <div className={`db-banner mood-${fieldId ?? 'none'}`}>
            {fieldId && FIELD_SCENES[fieldId] && <div className="scene" aria-hidden="true" dangerouslySetInnerHTML={{ __html: FIELD_SCENES[fieldId] }} />}
            <div className="shade" />
            <div className="db-banner-body">
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  className="db-name"
                  aria-label="Deck name"
                  value={deck.name}
                  onChange={(e) => {
                    setDeck({ ...deck, name: e.target.value, ...(deck.sample ? { id: `deck-${Date.now()}`, sample: false } : {}) });
                    setDirty(true);
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <label className="db-field">
                  <span className="muted">Field</span>
                  <select className="field-input small" value={fieldId ?? ''} onChange={(e) => commit({ ...deck, field: e.target.value })}>
                    {PLAYABLE_FIELDS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={`db-ring${complete ? ' done' : ''}`} key={complete ? 'done' : 'not'} role="img" aria-label={`${deck.cards.length} of 60 cards`}>
                <svg width="78" height="78" viewBox="0 0 74 74" aria-hidden="true">
                  <circle cx="37" cy="37" r="31" fill="none" stroke="#2a2e38" strokeWidth="7" />
                  <circle cx="37" cy="37" r="31" fill="none" stroke={complete ? '#f6e2b0' : '#e3b95a'} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(ring * Math.min(60, deck.cards.length)) / 60} ${ring}`} transform="rotate(-90 37 37)" />
                </svg>
                <span>
                  {deck.cards.length}
                  <small>/60</small>
                </span>
              </div>
            </div>
          </div>

          <div className="db-stats">
            <div className="db-status">
              <b className={complete ? 'ok' : deck.cards.length > 60 ? 'bad' : 'todo'}>{complete ? 'Ready to play' : deck.cards.length < 60 ? `${60 - deck.cards.length} more to go` : problems[0]}</b>
              <span className="muted">avg cost {avg.toFixed(1)}</span>
            </div>
            {deck.sample && <p className="muted small">This is a precon: editing it makes your own copy.</p>}
            {notice && <p className="db-notice">{notice}</p>}
            <div className="db-curve" role="img" aria-label={`Cards by cost: ${curve.map((n, i) => `${i === 6 ? '7+' : i + 1}: ${n}`).join(', ')}`}>
              {curve.map((n, i) => (
                <div key={i}>
                  <span>{n || ''}</span>
                  <i style={{ height: `${Math.round((n / maxCurve) * 64)}px` }} />
                  <em>{i === 6 ? '7+' : i + 1}</em>
                </div>
              ))}
            </div>
            {byType.length > 0 && (
              <>
                <div className="db-typebar" aria-hidden="true">
                  {byType.map((x) => (
                    <i key={x.t} style={{ flex: x.n, background: themeColor(x.t) }} />
                  ))}
                </div>
                <div className="db-legend">
                  {byType.map((x) => (
                    <span key={x.t}>
                      <i style={{ background: themeColor(x.t) }} />
                      {TYPE_PLURAL[x.t]} {x.n}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="db-list" onMouseLeave={() => setPeek(null)}>
            {!deck.cards.length && <p className="muted small">Click cards to add them. A deck has exactly 60 different cards.</p>}
            {groups.map((g) => (
              <div key={g.type} className="db-group">
                <span className="label">
                  {TYPE_PLURAL[g.type].toUpperCase()} · {g.cards.length}
                </span>
                {g.cards.map((d) => (
                  <div
                    key={d.id}
                    data-deck-row={d.id}
                    className={`db-strip${added.has(d.id) ? ' added' : ''}`}
                    style={{ '--c': themeColor(d.type) } as CSSProperties}
                    onMouseEnter={(e) => setPeek({ def: d, y: e.currentTarget.getBoundingClientRect().top })}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setModal({ kind: 'details', def: d });
                    }}
                  >
                    <span className="cost">{d.cost ?? 0}</span>
                    <span className="nm">{d.name}</span>
                    {added.has(d.id) && <span className="new">ADDED</span>}
                    <button type="button" aria-label={`Remove ${d.name}`} onClick={() => toggle(d)}>
                      −
                    </button>
                  </div>
                ))}
                {leaving
                  .filter((id) => getDef(id).type === g.type)
                  .map((id) => (
                    <div key={`out-${id}`} className="db-strip leaving" style={{ '--c': themeColor(getDef(id).type) } as CSSProperties}>
                      <span className="cost">{getDef(id).cost ?? 0}</span>
                      <span className="nm">{getDef(id).name}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
          <div className="db-tools">
          <button type="button" className="btn sm" onClick={duplicate}>
            Duplicate
          </button>
          <button type="button" className="btn sm" disabled={!deck.cards.length} onClick={() => setModal({ kind: 'share', code: encodeDeck(deck.name, fieldId, deck.cards), copied: false })}>
            Share code
          </button>
          <button type="button" className="btn sm" onClick={() => setModal({ kind: 'import', text: '', error: '' })}>
            Import
          </button>
            {!deck.sample && saved.some((d) => d.id === deck.id) && (
              <button type="button" className="btn sm danger ghost" style={{ marginLeft: 'auto' }} onClick={() => setModal({ kind: 'delete' })}>
                Delete
              </button>
            )}
          </div>
        </aside>
      </div>

      {peek && (
        <div className="db-peek" style={{ top: Math.max(70, Math.min(window.innerHeight - 340, peek.y - 120)) }} aria-hidden="true">
          <Card show={showDef(peek.def, cardNumber(peek.def.id))} scale={0.66} />
        </div>
      )}

      {flights.map((f) => (
        <div
          key={f.id}
          className="db-fly"
          aria-hidden="true"
          style={{
            left: f.to.left,
            top: f.to.top + f.to.height / 2 - f.from.height / 2,
            width: f.from.width,
            height: f.from.height,
            ['--dx' as string]: `${f.from.left - f.to.left}px`,
            ['--dy' as string]: `${f.from.top - (f.to.top + f.to.height / 2 - f.from.height / 2)}px`,
          }}
        >
          <Card show={showDef(f.def, cardNumber(f.def.id))} scale={f.from.width / 340} badges={false} />
        </div>
      ))}

      {modal && (
        <div className="modal-back" onClick={() => modal.kind !== 'unsaved' && setModal(null)}>
          <div className="modal db-modal" role="dialog" aria-labelledby="dbm-h" onClick={(e) => e.stopPropagation()}>
            {modal.kind === 'unsaved' && (
              <>
                <h2 id="dbm-h">Save changes to “{deck.name}”?</h2>
                <p className="muted">You have changes that aren't saved yet.</p>
                <div className="db-modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const then = modal.then;
                      setModal(null);
                      setDirty(false);
                      then();
                    }}
                  >
                    Don't save
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    autoFocus
                    onClick={() => {
                      const then = modal.then;
                      save();
                      setModal(null);
                      then();
                    }}
                  >
                    Save
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'delete' && (
              <>
                <h2 id="dbm-h">Delete “{deck.name}”?</h2>
                <p className="muted">This can't be undone.</p>
                <div className="db-modal-actions">
                  <button type="button" className="btn ghost" autoFocus onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  <button type="button" className="btn danger" onClick={remove}>
                    Delete deck
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'share' && (
              <>
                <h2 id="dbm-h">Share “{deck.name}”</h2>
                <p className="muted">Send this code to a friend. They choose Import in their deck builder and paste it.</p>
                <textarea className="field-input db-code" readOnly value={modal.code} onFocus={(e) => e.currentTarget.select()} />
                <div className="db-modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    autoFocus
                    onClick={async () => {
                      const ok = await copyText(modal.code);
                      if (ok) playSound('confirm');
                      setModal({ ...modal, copied: ok });
                    }}
                  >
                    {modal.copied ? 'Copied!' : 'Copy code'}
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'import' && (
              <>
                <h2 id="dbm-h">Import a deck</h2>
                <p className="muted">Paste a deck code (it starts with MP1-).</p>
                <textarea className="field-input db-code" autoFocus value={modal.text} onChange={(e) => setModal({ ...modal, text: e.target.value, error: '' })} placeholder="MP1-…" />
                {modal.error && <p className="net-error">{modal.error}</p>}
                <div className="db-modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={!modal.text.trim()}
                    onClick={() => {
                      const d = decodeDeck(modal.text);
                      if (!d) return setModal({ ...modal, error: "That doesn't look like a deck code." });
                      const field = d.field && PLAYABLE_FIELDS.some((f) => f.id === d.field) ? d.field : (PLAYABLE_FIELDS[0]?.id ?? null);
                      const go = () => {
                        setDeck({ id: `deck-${Date.now()}`, name: d.name, cards: d.cards.slice(0, 60), field });
                        setDirty(true);
                        setHistory([]);
                        setAdded(new Set());
                        setNotice(`Imported ${d.cards.length} cards${d.unknown ? ` (${d.unknown} unknown left out)` : ''}. Save it to keep it.`);
                        playSound('confirm');
                      };
                      setModal(null);
                      guard(go);
                    }}
                  >
                    Import
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'hand' && (
              <>
                <h2 id="dbm-h">Sample hand</h2>
                <p className="muted">
                  {modal.cards.length} random cards from “{deck.name}”, like an opening hand.
                </p>
                <div className="db-hand">
                  {modal.cards.map((c, i) => {
                    const mid = (modal.cards.length - 1) / 2;
                    return (
                      <div key={`${c}-${i}`} className="db-hand-card" style={{ ['--rot' as string]: `${(i - mid) * 3}deg`, ['--d' as string]: `${i < 7 ? i * 90 : 0}ms` }}>
                        <Card show={showDef(getDef(c), cardNumber(c))} scale={0.42} onContextMenu={(e) => { e.preventDefault(); setModal({ kind: 'details', def: getDef(c) }); }} />
                      </div>
                    );
                  })}
                </div>
                <div className="db-modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                    Close
                  </button>
                  <button type="button" className="btn" disabled={modal.cards.length >= deck.cards.length} onClick={() => dealHand(1, modal.cards)}>
                    Draw 1 more
                  </button>
                  <button type="button" className="btn primary" autoFocus onClick={() => dealHand(7)}>
                    Draw again
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'details' && (
              <div className="db-details">
                <Card show={showDef(modal.def, cardNumber(modal.def.id))} scale={0.86} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                  <h2 id="dbm-h">{modal.def.name}</h2>
                  <p className="muted" style={{ margin: 0 }}>
                    {modal.def.type}
                    {modal.def.tribe ? ` · ${modal.def.tribe}` : ''} · cost {modal.def.cost ?? 0}
                    {typeof modal.def.attack === 'number' ? ` · ${modal.def.attack}/${modal.def.defense}` : ''}
                    {cardNumber(modal.def.id) ? ` · MP-${String(cardNumber(modal.def.id)).padStart(3, '0')}` : ''}
                  </p>
                  {TYPE_HELP[modal.def.type] && <p style={{ margin: 0, lineHeight: 1.45 }}>{TYPE_HELP[modal.def.type]}</p>}
                  {termsIn(`${modal.def.text} ${((modal.def.script.keywords ?? []) as string[]).join(' ')}`).map((k) => (
                    <p key={k.term} style={{ margin: 0, lineHeight: 1.45 }}>
                      <b style={{ color: 'var(--gold)' }}>{k.term}</b> · {k.meaning}
                    </p>
                  ))}
                  {!working(modal.def) && <p className="net-error">This card's effect doesn't work in the digital game yet.</p>}
                  <div className="db-modal-actions">
                    <button type="button" className="btn ghost" onClick={() => setModal(null)}>
                      Close
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      autoFocus
                      disabled={!inDeck.has(modal.def.id) && deck.cards.length >= 60}
                      onClick={() => {
                        toggle(modal.def);
                        setModal(null);
                      }}
                    >
                      {inDeck.has(modal.def.id) ? 'Remove from deck' : 'Add to deck'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
