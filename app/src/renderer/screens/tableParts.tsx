// Pieces of the game table: mana bar, stack panel, log, expanded field view, and the effects layer
// (attack arrow, play announcements, floating numbers, destroyed-card ghosts).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ME } from '../me';
import type { ReactNode } from 'react';
import { Card, showInGame, themeColor } from '../components/Card';
import type { CardShow } from '../components/Card';
import { getDef, isCreature } from '../engine';
import type { GameState, Iid, PlayerId } from '../engine';
import { youify } from '../text';
import { FIELD_GLYPHS, FIELD_SCENES } from '../fieldScenes';
import { playSound } from '../sound';


// ---------- small icons ----------
const ICONS: Record<string, string> = {
  turn: 'M12 7v5l3 2M21 12a9 9 0 1 1-9-9',
  draw: 'M7 3h10v18H7zM10 8h4',
  mana: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z',
  play: 'M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17.5 6.5 21 8 13.5 3 9l6.5-.5z',
  attack: 'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
  block: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  death: 'M9 10h.01M15 10h.01M8 21v-3a8 8 0 1 1 8 0v3z',
  soul: 'M8 4h8l3 4-7 12L5 8z',
  other: 'M12 12h.01',
  expand: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  ping: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z',
};

export function Icon({ name, size = 16 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name] ?? ICONS.other} />
    </svg>
  );
}

export function RockIcon({ corrupted, size = 20 }: { corrupted?: boolean; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 2 21 8v8l-9 6-9-6V8z" fill={corrupted ? '#4a2a52' : '#3a3f66'} stroke={corrupted ? '#c48ad2' : '#9aa3e0'} strokeWidth="1.5" />
      {corrupted && <path d="M9 9l6 6M15 9l-6 6" stroke="#e3c4ea" strokeWidth="1.5" />}
    </svg>
  );
}

// ---------- mana bar ----------
export interface PayPreview {
  name: string;
  orbs: Set<Iid>;
  rocks: number;
  corrupted: number;
  floating: number;
}

export function payPreviewText(p: PayPreview): string {
  const parts: string[] = [];
  if (p.floating) parts.push(`${p.floating} floating`);
  if (p.orbs.size) parts.push(`${p.orbs.size} Orb${p.orbs.size === 1 ? '' : 's'}`);
  if (p.rocks) parts.push(`${p.rocks} Rock${p.rocks === 1 ? '' : 's'}`);
  if (p.corrupted) parts.push(`${p.corrupted} Corrupted`);
  return parts.length ? `${p.name}: ${parts.join(' + ')}` : `${p.name}: free`;
}

export function ManaBar({
  s,
  pay,
  spent,
  arriving,
  chargeText,
  chargeOk,
  onOrbEnter,
  onRockEnter,
  onLeave,
}: {
  s: GameState;
  pay: PayPreview | null;
  spent: Set<Iid>;
  arriving: Set<Iid>;
  chargeText: string;
  chargeOk: boolean;
  onOrbEnter: (iid: Iid, filled: boolean) => void;
  onRockEnter: (corrupted: boolean) => void;
  onLeave: () => void;
}) {
  const me = s.players[ME];
  const filled = me.orbs.filter((o) => o.filled).length;
  const avail = me.floating + filled + me.rocks;
  const cost = pay ? pay.orbs.size + pay.rocks + pay.floating : 0;
  const many = (n: number, el: (i: number) => JSX.Element) => Array.from({ length: Math.min(n, 4) }, (_, i) => el(i));
  return (
    <div className={`manabar pool-bar${pay ? ' previewing' : ''}${!avail && !me.corruptedRocks ? ' dry' : ''}`} aria-label="Your mana" data-zone="mana">
      <div className="rain" aria-hidden="true">
        {RAIN.map((r, i) => (
          <i key={i} style={{ left: `${r.x}%`, top: `${r.y}%`, animationDelay: `${r.d}s`, animationDuration: `${r.ms}s` }} />
        ))}
        {[...arriving].map((iid) => (
          <i key={`s${iid}`} className="splash" style={{ left: `${8 + (me.orbs.findIndex((o) => o.iid === iid) + 1) * 4.2}%`, top: '55%' }} />
        ))}
      </div>
      <div className="mp-main">
        <span className="mb-label">MANA POOL</span>
        <div className="mp-row">
          <div className="orbs">
            {me.orbs.map((o, i) => (
              <span
                key={o.iid}
                data-orb={o.iid}
                className={`orb inspectable${o.filled ? ' full' : ''}${pay?.orbs.has(o.iid) ? ' paying' : ''}${spent.has(o.iid) ? ' spent' : ''}${arriving.has(o.iid) ? ' arrive' : ''}`}
                style={{ animationDelay: `${(i % 5) * -0.7}s` }}
                aria-label={`Mana Orb (${o.filled ? 'filled' : 'used'}): ${getDef(s.cards[o.iid].cardId).name}`}
                onMouseEnter={() => onOrbEnter(o.iid, o.filled)}
                onMouseLeave={onLeave}
              />
            ))}
            {!me.orbs.length && <span className="mp-hint">Charge a card to fill the pool</span>}
          </div>
          {me.orbs.length > 0 && (
            <span className="mp-cap">
              {filled} of {me.orbs.length} filled{filled < me.orbs.length ? ' · refill at your Upkeep' : ''}
            </span>
          )}
        </div>
        {me.rocks > 0 && (
          <span key={`r${me.rocks}`} className={`mp-sym rock inspectable${pay?.rocks ? ' paying' : ''}`} onMouseEnter={() => onRockEnter(false)} onMouseLeave={onLeave} aria-label={`${me.rocks} Mana Rocks`}>
            <span className="mp-icons">{many(me.rocks, (i) => <RockIcon key={i} size={22} />)}</span>
            <b>{me.rocks} Mana Rock{me.rocks === 1 ? '' : 's'}</b>
          </span>
        )}
        {me.corruptedRocks > 0 && (
          <span key={`c${me.corruptedRocks}`} className={`mp-sym corrupt inspectable${pay?.corrupted ? ' paying' : ''}`} onMouseEnter={() => onRockEnter(true)} onMouseLeave={onLeave} aria-label={`${me.corruptedRocks} Corrupted Mana Rocks`}>
            <span className="mp-icons">{many(me.corruptedRocks, (i) => <RockIcon key={i} size={22} corrupted />)}</span>
            <b>{me.corruptedRocks} Corrupted</b>
          </span>
        )}
        {me.floating > 0 && (
          <span key={`f${me.floating}`} className={`mp-sym floating${pay?.floating ? ' paying' : ''}`} aria-label={`${me.floating} floating mana until the end of the turn`}>
            <span className="mp-icons">{many(me.floating, (i) => <Sparkle key={i} />)}</span>
            <span className="mp-two">
              <b>+{me.floating} floating</b>
              <small>until end of turn</small>
            </span>
          </span>
        )}
        <span style={{ flex: 1 }} />
      </div>
      <div className={`mp-total${pay && cost > 0 ? ' paying' : ''}`}>
        <span key={avail} className="mp-num">
          {pay && !pay.corrupted && cost > 0 ? (
            <>
              {avail}
              <span className="after"> → {avail - cost}</span>
            </>
          ) : (
            avail
          )}
        </span>
        <span className="mp-two">
          <b>AVAILABLE</b>
          {pay ? <small className="mp-paytext">{payPreviewText(pay)}</small> : me.corruptedRocks > 0 ? <small>+{me.corruptedRocks} Corrupted for discard creatures</small> : <small>Charge <span style={{ color: chargeOk ? 'var(--green)' : 'var(--faint)', fontWeight: 800 }}>{chargeText}</span></small>}
        </span>
      </div>
    </div>
  );
}

/** Where the raindrops land on the pool (fixed, so the pattern doesn't jump on every render). */
const RAIN = Array.from({ length: 9 }, (_, i) => ({ x: 6 + ((i * 37) % 88), y: 22 + ((i * 53) % 60), d: -((i * 1.37) % 3.6), ms: 3.2 + ((i * 0.71) % 1.6) }));

function Sparkle() {
  return (
    <svg className="sparkle" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
      <path d="M12 3 13.6 10.4 21 12 13.6 13.6 12 21 10.4 13.6 3 12 10.4 10.4z" fill="#f6d27a" />
      <path d="M19 3 19.6 5.4 22 6 19.6 6.6 19 9 18.4 6.6 16 6 18.4 5.4z" fill="#fff1cf" />
    </svg>
  );
}

// ---------- stack ----------
export function StackPanel({
  s,
  who,
  hidden,
  setHidden,
  targetSet,
  onHover,
  onPick,
}: {
  s: GameState;
  who: PlayerId | null;
  hidden: boolean;
  setHidden: (h: boolean) => void;
  targetSet: Set<string>;
  onHover: (iid: Iid | null) => void;
  onPick: (iid: Iid) => void;
}) {
  const items = [...s.stack].reverse();
  const nameOf = (id: string) => (s.cards[id] ? getDef(s.cards[id].cardId).name : id);
  const waiting = who !== null && who !== ME && s.phase !== 'over' ? s.players[who].name : null;
  if (hidden) {
    return (
      <button type="button" className="stack-pill" onClick={() => setHidden(false)}>
        Stack · {items.length}
        {items[0] ? ` · ${items[0].kind === 'card' ? nameOf(items[0].iid) : items[0].label} on top` : ''}
      </button>
    );
  }
  return (
    <section className={`stack-panel${items.length ? ' busy' : ''}`} aria-label="Stack">
      <div className="sp-head">
        <span className="label" style={{ color: items.length ? 'var(--gold)' : undefined }}>
          STACK{items.length ? ` · ${items.length}` : ''}
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" className="sp-btn" onClick={() => setHidden(true)}>
          Hide
        </button>
      </div>
      {items.length === 0 && <div className="sp-empty">Nothing is waiting to resolve.</div>}
      <div className="sp-list">
        {items.map((it, i) => {
          const iid = it.kind === 'card' ? it.iid : null;
          const src = it.kind === 'card' ? it.iid : it.source.startsWith('field:') ? null : it.source;
          const color = it.kind === 'card' ? themeColor(getDef(s.cards[it.iid].cardId).type) : '#4a5060';
          const label = it.kind === 'card' ? nameOf(it.iid) : `${src ? nameOf(src) : 'Field'}: ${it.label}`;
          const targets = it.kind === 'card' ? it.targets : it.ctx.targets;
          const owner = it.controller === ME ? 'You' : s.players[it.controller].name;
          const isTarget = !!iid && targetSet.has(iid);
          return (
            <button
              key={it.id}
              type="button"
              data-stack={it.id}
              data-target={it.kind === 'card' ? it.iid : undefined}
              className={`sp-item${i === 0 ? ' top' : ''}${isTarget ? ' target' : ''}`}
              onMouseEnter={() => onHover(src)}
              onMouseLeave={() => onHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                if (iid && isTarget) onPick(iid);
              }}
            >
              <span className="sp-chip" style={{ background: color }} />
              <span className="sp-body">
                <b>{label}</b>
                <small>
                  {owner}
                  {targets.length ? ` → ${targets.map(nameOf).join(', ')}` : ''}
                </small>
              </span>
              {i === 0 && <span className="sp-top">TOP</span>}
            </button>
          );
        })}
      </div>
      {waiting && (
        <div className="sp-wait">
          <span className="dot" /> Waiting on <b>{waiting}</b>…
        </div>
      )}
    </section>
  );
}

// ---------- log ----------
type LogKind = 'turn' | 'attack' | 'block' | 'death' | 'play' | 'soul' | 'mana' | 'draw' | 'other' | 'ping';
const KIND_STYLE: Record<LogKind, { bg: string; fg: string; icon: string }> = {
  turn: { bg: '#3a3220', fg: '#e3b95a', icon: 'turn' },
  attack: { bg: '#2a1512', fg: '#ffcfc7', icon: 'attack' },
  block: { bg: '#1a2433', fg: '#c9e9ff', icon: 'block' },
  death: { bg: '#2a1512', fg: '#ff9f90', icon: 'death' },
  play: { bg: '#2a1d1b', fg: '#ffb4a8', icon: 'play' },
  soul: { bg: '#3a3220', fg: '#e3b95a', icon: 'soul' },
  mana: { bg: '#10222c', fg: '#9be3f0', icon: 'mana' },
  draw: { bg: '#242832', fg: '#eee9df', icon: 'draw' },
  other: { bg: '#1f2229', fg: '#8e887c', icon: 'other' },
  ping: { bg: '#10222c', fg: '#7fd6e8', icon: 'ping' },
};

function kindOf(t: string): LogKind {
  if (t.startsWith('---')) return 'turn';
  if (/^(You|\w+) pings? .*: (Look|Careful|Attack this|Help\?)$/.test(t)) return 'ping';
  if (/\battacks\b|^Combat:|loses \d+ life|\bboosts\b|DMG GAIN|clash/.test(t)) return 'attack';
  if (/\bblocks\b|does not block/.test(t)) return 'block';
  if (/destroyed|sacrific|is INFECTED|FADE OUT|takes \d+ damage/.test(t)) return 'death';
  if (/contract|Souls?\b|OFFERS|accepted/.test(t)) return 'soul';
  if (/\bplays\b|\bactivates\b|triggers:|RECONFIGURE/.test(t)) return 'play';
  if (/mana|Mana|Orb|Rock|\bcharges\b|\bpays\b/.test(t)) return 'mana';
  if (/\bdraws?\b/.test(t)) return 'draw';
  return 'other';
}

const FILTERS: { id: string; label: string; kinds?: LogKind[] }[] = [
  { id: 'all', label: 'All' },
  { id: 'combat', label: 'Combat', kinds: ['attack', 'block', 'death'] },
  { id: 'play', label: 'Cards', kinds: ['play'] },
  { id: 'mana', label: 'Mana', kinds: ['mana'] },
  { id: 'soul', label: 'Souls', kinds: ['soul'] },
  { id: 'me', label: 'Me' },
];

export function LogPanel({ s, onHoverName }: { s: GameState; onHoverName: (iid: Iid | null) => void }) {
  const [filter, setFilter] = useState('all');
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.log.length, filter]);
  // Card names on the field (and in your hand) can be hovered to light the card up.
  const named = new Map<string, Iid>();
  for (const p of s.players) for (const iid of [...p.field, ...(p.id === ME ? p.hand : [])]) named.set(getDef(s.cards[iid].cardId).name, iid);
  const names = [...named.keys()].sort((a, b) => b.length - a.length);
  const re = names.length ? new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g') : null;
  const f = FILTERS.find((x) => x.id === filter)!;
  const lines = s.log.slice(-200).map((line) => {
    const raw = line.replace(/^\[T\d+\] /, '');
    const t = youify(raw.replace(/^--- (.*) ---$/, '$1'));
    return raw.startsWith('---') ? `--- ${t} ---` : t;
  });
  const shown = lines
    .map((text) => ({ text, kind: kindOf(text) }))
    .filter((l) => l.kind !== 'other' || filter === 'all')
    .filter((l) => (f.kinds ? f.kinds.includes(l.kind) : f.id === 'me' ? /^You\b|\byou\b|\byour\b/i.test(l.text) || l.kind === 'turn' : true))
    .filter((l) => !/^Resolving /.test(l.text));
  const render = (text: string): ReactNode[] => {
    if (!re) return [text];
    return text.split(re).map((part, i) =>
      named.has(part) ? (
        <span key={i} className="log-name" onMouseEnter={() => onHoverName(named.get(part)!)} onMouseLeave={() => onHoverName(null)}>
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  };
  return (
    <section className="log-panel" aria-label="Log">
      <div className="log-filters">
        <span className="label">LOG</span>
        <span style={{ flex: 1 }} />
        {FILTERS.map((x) => (
          <button key={x.id} type="button" className="lf" aria-pressed={filter === x.id} onClick={() => setFilter(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <ol className="log" ref={ref}>
        {shown.map((l, i) => {
          const st = KIND_STYLE[l.kind];
          const text = l.kind === 'turn' ? l.text.replace(/^--- (.*) ---$/, '$1') : l.text;
          return (
            <li key={i} className={l.kind === 'turn' ? 'turn' : ''}>
              <span className="li-icon" style={{ background: st.bg, color: st.fg }}>
                <Icon name={st.icon} size={13} />
              </span>
              <span>{render(text)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ---------- expanded field ----------
export function ExpandedField({
  s,
  pid,
  setPid,
  onClose,
  onHover,
  onDiscard,
  ringFor,
}: {
  s: GameState;
  pid: PlayerId;
  setPid: (p: PlayerId) => void;
  onClose: () => void;
  onHover: (iid: Iid) => void;
  onDiscard: (p: PlayerId) => void;
  ringFor: (iid: Iid) => 'select' | 'chosen' | 'attack' | undefined;
}) {
  const p = s.players[pid];
  const fieldDef = p.fieldCard ? getDef(p.fieldCard) : null;
  const faded = (s.fadedOut ?? []).filter((x) => x.controller === pid);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal expanded" role="dialog" aria-labelledby="ex-h" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {s.players.map((q) => (
            <button key={q.id} type="button" className="chip" aria-pressed={q.id === pid} onClick={() => setPid(q.id)}>
              {q.id === ME ? 'You' : q.name}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn primary" autoFocus onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
          <h2 id="ex-h" style={{ fontSize: 28 }}>
            {pid === ME ? 'Your field' : `${p.name}'s field`}
          </h2>
          <span className="life">
            LIFE <b>{p.life}</b>
          </span>
          <span className="muted">Hand <b style={{ color: 'var(--text)' }}>{p.hand.length}</b></span>
          <span className="muted">Deck <b style={{ color: 'var(--text)' }}>{p.deck.length}</b></span>
          <span className="muted">Orbs <b style={{ color: '#9be3f0' }}>{p.orbs.filter((o) => o.filled).length}/{p.orbs.length}</b></span>
          <span className="muted">Rocks <b style={{ color: '#c3c8f0' }}>{p.rocks}</b></span>
          {p.corruptedRocks > 0 && <span className="muted">Corrupted <b style={{ color: '#e3c4ea' }}>{p.corruptedRocks}</b></span>}
          <span className="muted">Souls <b style={{ color: 'var(--gold)' }}>{p.souls}</b></span>
          <button type="button" className="link-btn" onClick={() => onDiscard(pid)}>
            Discard pile ({p.discard.length})
          </button>
        </div>
        {fieldDef && (
          <div className="ex-field">
            <b>{fieldDef.name}</b>
            <span>{fieldDef.text.replace(/\n/g, ' · ')}</span>
          </div>
        )}
        {(() => {
          const card = (iid: Iid) => <Card key={iid} iid={iid} show={showInGame(s, iid)} scale={0.46} tapped={s.perms[iid]?.tapped} ring={ringFor(iid)} onHover={() => onHover(iid)} />;
          const creatures = p.field.filter((iid) => permRank(s, iid) === 0);
          const artifacts = p.field.filter((iid) => permRank(s, iid) === 1);
          const anthems = p.field.filter((iid) => permRank(s, iid) >= 2);
          return (
            <div className={`ex-board ${moodOf(p.fieldCard)}`}>
              <FieldScene field={p.fieldCard} />
              <section className="ex-row">
                <span className="label">CREATURES · {creatures.length}</span>
                <div className="choices">{creatures.length ? creatures.map(card) : <p className="muted">None</p>}</div>
              </section>
              <div className="ex-bottom">
                <section className="ex-row">
                  <span className="label">ARTIFACTS · {artifacts.length}</span>
                  <div className="choices">{artifacts.length ? artifacts.map(card) : <p className="muted">None</p>}</div>
                </section>
                <section className="ex-row right">
                  <span className="label">ANTHEMS · {anthems.length}</span>
                  <div className="choices">{anthems.length ? anthems.map(card) : <p className="muted">None</p>}</div>
                </section>
              </div>
            </div>
          );
        })()}
        <div className="choices" style={{ gap: 20, padding: '0 6px' }}>
          {faded.map((perm) => (
            <div key={perm.iid} className="card-box ghost" style={{ width: 170, height: 238 }}>
              {getDef(s.cards[perm.iid].cardId).name}
              <br />
              FADED OUT · back at the End Phase
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- effects layer ----------
type Rect = { x: number; y: number; w: number; h: number };
export interface Announce {
  id: number;
  kind: 'play' | 'turn' | 'out' | 'reveal' | 'coin';
  heads?: boolean; // coin: the result
  iid?: Iid;
  show?: CardShow;
  who: string; // play: "Cat plays"; turn/out: the big words
  sub?: string; // turn/out: the line under them
  mine?: boolean;
  field?: string | null; // turn: the active player's Field (colors the band)
  targets: string[];
  ms: number;
}
export interface Milestone {
  id: number;
  head: string; // small caps line ("DEMON FIELD")
  big: string; // "10 SOULS"
  text: string;
  tone: 'gold' | 'blue' | 'green';
}
/** A player who is out: when, and what finished them. */
export interface OutInfo {
  pid: PlayerId;
  turn: number;
  by: string | null; // "your Steelshaper Vanguard"
  byPlayer: PlayerId | null;
}
interface Ghost {
  id: number;
  show: CardShow;
  rect: Rect;
  tapped: boolean;
  faded: boolean;
}
interface Float {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: 'red' | 'green' | 'gold' | 'cyan';
}
/** A card (or a piece of one) flying across the table. It sits at its end box and animates in from the offset. */
export interface Flight {
  id: number;
  kind: 'face' | 'back' | 'toFace' | 'toBack' | 'shard' | 'mote' | 'wisp';
  show?: CardShow;
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  mx: number; // scatter point (shards), as an offset like dx/dy
  my: number;
  s0: number;
  s1: number;
  o1: number;
  ms: number;
  delay: number;
  color?: string;
}
/** An effect drawn in place: a negated stack card, a breaking Orb, a counter pip. */
export interface Burst {
  id: number;
  kind: 'negate' | 'orb' | 'pip' | 'sparkle' | 'clash';
  rect: Rect;
  show?: CardShow;
  text?: string;
  delay: number;
}
export interface Arrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Watches the game state and produces the visual effects for each change. */
export function useTableFx(s: GameState, enabled: boolean) {
  const rects = useRef(new Map<string, Rect>());
  const prev = useRef<GameState | null>(null);
  const nextId = useRef(1);
  const [queue, setQueue] = useState<Announce[]>([]);
  const lastSeen = useRef(0);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [floats, setFloats] = useState<Float[]>([]);
  const [flash, setFlash] = useState<{ spent: Set<Iid>; arriving: Set<Iid>; entering: Set<Iid>; lunge: Iid | null }>({ spent: new Set(), arriving: new Set(), entering: new Set(), lunge: null });
  const [arrow, setArrow] = useState<Arrow | null>(null);
  const [links, setLinks] = useState<Arrow[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [marks, setMarks] = useState<{ landing: Map<Iid, number>; token: Set<Iid>; reform: Set<Iid>; hit: Set<Iid>; counter: Set<Iid>; hurt: Set<PlayerId>; heal: Set<PlayerId>; bump: Set<string>; flare: Set<PlayerId>; shake: boolean }>({ landing: new Map(), token: new Set(), reform: new Set(), hit: new Set(), counter: new Set(), hurt: new Set(), heal: new Set(), bump: new Set(), flare: new Set(), shake: false });
  const prevRects = useRef(new Map<string, Rect>());
  const lastHit = useRef(new Map<PlayerId, { by: string; byPlayer: PlayerId }>());
  const outs = useRef<OutInfo[]>([]);

  // Remember where every card, life total and player strip is on screen (keeping the last spot of cards that left).
  useLayoutEffect(() => {
    prevRects.current = new Map(rects.current);
    const keep = (sel: string, attr: string, prefix: string) =>
      document.querySelectorAll(sel).forEach((el) => {
        const v = el.getAttribute(attr);
        if (v !== null) rects.current.set(`${prefix}:${v}`, rectOf(el));
      });
    keep('[data-deck]', 'data-deck', 'deck');
    keep('[data-hand-count]', 'data-hand-count', 'hand');
    keep('[data-discard]', 'data-discard', 'discard');
    keep('[data-orbs]', 'data-orbs', 'orbs');
    keep('[data-orb]', 'data-orb', 'orb');
    keep('[data-stack]', 'data-stack', 'stack');
    keep('[data-souls]', 'data-souls', 'souls');
    document.querySelectorAll('[data-iid]').forEach((el) => {
      const id = el.getAttribute('data-iid');
      if (id) rects.current.set(id, rectOf(el));
    });
    document.querySelectorAll('[data-life]').forEach((el) => rects.current.set(`life:${el.getAttribute('data-life')}`, rectOf(el)));
    document.querySelectorAll('[data-strip]').forEach((el) => rects.current.set(`strip:${el.getAttribute('data-strip')}`, rectOf(el)));
    // The attack arrow follows the cards.
    const c = s.combat;
    let next: Arrow | null = null;
    if (c && s.perms[c.attacker]) {
      const from = document.querySelector(`[data-iid="${c.attacker}"]`);
      const defending = c.blocker && s.perms[c.blocker] ? c.blocker : c.targetCreature && s.perms[c.targetCreature] ? c.targetCreature : null;
      const to = defending ? document.querySelector(`[data-iid="${defending}"]`) : document.querySelector(`[data-life="${c.defender}"]`);
      if (from && to) {
        const a = rectOf(from);
        const b = rectOf(to);
        const ax = a.x + a.w / 2;
        const ay = a.y + a.h / 2;
        const bx = b.x + b.w / 2;
        const by = b.y + b.h / 2;
        // Start and end at the card edges, not their centers.
        const t1 = Math.min(0.45, (Math.min(a.h, a.w) / 2) / Math.max(1, Math.hypot(bx - ax, by - ay)));
        const t2 = Math.min(0.45, (Math.min(b.h, b.w) / 2 + 6) / Math.max(1, Math.hypot(bx - ax, by - ay)));
        next = { x1: ax + (bx - ax) * t1, y1: ay + (by - ay) * t1, x2: bx - (bx - ax) * t2, y2: by - (by - ay) * t2 };
      }
    }
    setArrow((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
    // The top of the stack points at its targets.
    const top = s.stack[s.stack.length - 1];
    const ls: Arrow[] = [];
    if (top) {
      const fromEl = document.querySelector(`[data-stack="${top.id}"]`);
      const targets = top.kind === 'card' ? top.targets : top.ctx.targets;
      for (const t of targets) {
        const toEl = document.querySelector(`.table [data-iid="${t}"]`) ?? document.querySelector(`[data-stack] [data-tgt="${t}"]`);
        if (!fromEl || !toEl) continue;
        const a = rectOf(fromEl);
        const b = rectOf(toEl);
        ls.push({ x1: a.x, y1: a.y + a.h / 2, x2: b.x + b.w / 2, y2: b.y + b.h / 2 });
      }
    }
    setLinks((old) => (JSON.stringify(old) === JSON.stringify(ls) ? old : ls));
  });

  useEffect(() => {
    const before = prev.current;
    prev.current = s;
    if (!before || !enabled || before === s) return;
    const newFloats: Float[] = [];
    const add = (key: string, text: string, tone: Float['tone']) => {
      const r = rects.current.get(key);
      if (r) newFloats.push({ id: nextId.current++, x: r.x + r.w / 2, y: r.y + Math.min(r.h / 2, 40), text, tone });
    };
    const owner = (pid: PlayerId) => (pid === ME ? 'your' : `${s.players[pid].name}'s`);
    const queued: Announce[] = [];
    // A new turn: a band sweeps across the table.
    if (s.turn !== before.turn && s.phase !== 'over') {
      const p = s.players[s.active];
      const mine = s.active === ME;
      queued.push({
        id: nextId.current++,
        kind: 'turn',
        who: mine ? 'YOUR TURN' : `${p.name.toUpperCase()}'S TURN`,
        sub: mine ? `TURN ${s.turn} · ${p.orbs.filter((o) => o.filled).length}/${p.orbs.length} ORBS READY · ${p.life} LIFE` : `TURN ${s.turn} · ${p.life} LIFE · ${p.hand.length} CARDS IN HAND`,
        mine,
        field: p.fieldCard,
        targets: [],
        ms: 1100,
      });
    }
    // Who hurt whom (to name what finished a player).
    for (const p of s.players) {
      if (p.life >= before.players[p.id].life) continue;
      const c = before.combat;
      const top = before.stack[before.stack.length - 1];
      if (c && c.defender === p.id && s.cards[c.attacker]) lastHit.current.set(p.id, { by: `${owner(c.attackerController)} ${getDef(s.cards[c.attacker].cardId).name}`, byPlayer: c.attackerController });
      else if (top) {
        const src = top.kind === 'card' ? top.iid : top.source.startsWith('field:') ? null : top.source;
        if (src && s.cards[src]) lastHit.current.set(p.id, { by: `${owner(top.controller)} ${getDef(s.cards[src].cardId).name}`, byPlayer: top.controller });
      }
    }
    // Eliminations.
    for (const p of s.players) {
      if (!p.eliminated || before.players[p.id].eliminated) continue;
      const hit = lastHit.current.get(p.id) ?? null;
      const deckOut = s.log.slice(before.log.length).some((l) => l.includes(`${p.name} is eliminated: had to draw from an empty deck`));
      outs.current.push({ pid: p.id, turn: s.turn, by: deckOut ? null : hit?.by ?? null, byPlayer: deckOut ? null : hit?.byPlayer ?? null });
      const left = s.players.filter((q) => !q.eliminated).length;
      queued.push({
        id: nextId.current++,
        kind: 'out',
        who: p.id === ME ? 'YOU ARE OUT' : `${p.name.toUpperCase()} IS OUT`,
        sub: `${deckOut ? 'Ran out of cards' : hit ? `Finished by ${hit.by}` : 'Eliminated'} · turn ${s.turn}${left > 1 ? ` · ${left} players left` : ''}`,
        targets: [],
        ms: 1800,
      });
    }
    // Milestones (everyone's): Souls thresholds and unlocked plays.
    const ms: Milestone[] = [];
    for (const p of s.players) {
      const o = before.players[p.id];
      const tone = p.id === ME ? 'gold' : 'blue';
      for (const n of [5, 10, 15]) {
        if (o.souls < n && p.souls >= n) {
          const field = p.fieldCard ? getDef(p.fieldCard) : null;
          const line = field?.text.split('\n').find((l) => l.startsWith(`${n} SOULS`));
          ms.push({ id: nextId.current++, head: p.id === ME ? (field?.name.toUpperCase() ?? 'SOULS') : `${p.name.toUpperCase()}${field ? ` · ${field.name.toUpperCase()}` : ''}`, big: `${n} SOULS`, text: line ? `Now: ${line.replace(/^\d+ SOULS:\s*/, '')}` : `${p.id === ME ? 'You have' : `${p.name} has`} ${n} Souls.`, tone });
        }
      }
      if (p.discardPlays > o.discardPlays) {
        ms.push({ id: nextId.current++, head: `${p.id === ME ? '' : `${p.name.toUpperCase()} · `}GRAVEYARD · 3RD DEATH`, big: p.id === ME ? 'Play 1 card from your discard pile' : `${p.name} may replay a card`, text: 'Until the End Phase. Corrupted Mana can help pay.', tone: p.id === ME ? 'green' : 'blue' });
      }
    }
    if (ms.length) {
      setMilestones((m) => [...m, ...ms]);
      setTimeout(() => setMilestones((m) => m.filter((x) => !ms.some((y) => y.id === x.id))), 1900);
    }
    // Cards played: announce them in the middle of the table.
    const seen = new Set(before.stack.map((it) => it.id));
    const fresh = s.stack.filter((it) => it.kind === 'card' && !seen.has(it.id));
    for (const it of fresh) {
      const iid = (it as { iid: Iid }).iid;
      const nm = (id: string) => (s.cards[id] ? getDef(s.cards[id].cardId).name : id);
      queued.push({ id: nextId.current++, kind: 'play', iid, show: showInGame(s, iid), who: it.controller === ME ? 'You play' : `${s.players[it.controller].name} plays`, targets: (it as { targets: string[] }).targets.map(nm), ms: it.controller === ME ? 800 : 1400 });
    }
    // Revealed cards (Mana Sage, searches) and coin flips: shown to everyone in the middle of the table.
    for (const r of s.reveals ?? []) {
      if (r.seq <= lastSeen.current || !s.cards[r.iid]) continue;
      lastSeen.current = r.seq;
      queued.push({ id: nextId.current++, kind: 'reveal', iid: r.iid, show: showInGame(s, r.iid), who: r.player === ME ? 'You reveal' : `${s.players[r.player].name} reveals`, sub: r.note ? youify(r.note) : undefined, targets: [], ms: 2000 });
    }
    for (const f of s.flips ?? []) {
      if (f.seq <= lastSeen.current) continue;
      lastSeen.current = f.seq;
      const src = s.cards[f.source] ? getDef(s.cards[f.source].cardId) : null;
      const side = src?.text.match(new RegExp(`ON ${f.heads ? 'HEADS' : 'TAILS'}\\s*-\\s*([^.]*)`, 'i'))?.[1]?.trim();
      queued.push({ id: nextId.current++, kind: 'coin', heads: f.heads, who: `${f.player === ME ? 'You flip' : `${s.players[f.player].name} flips`} a coin${src ? ` · ${src.name}` : ''}`, sub: `${f.heads ? 'Heads' : 'Tails'}${side ? `: ${side}` : ''}`, targets: [], ms: 2400 });
    }
    // Falling behind (very fast bots): skip banners and announcements, keep the "X is out" ones.
    if (queued.length) setQueue((q) => [...q, ...(q.length > 3 ? queued.filter((a) => a.kind === 'out' || a.kind === 'coin' || a.kind === 'reveal') : queued)]);
    // Cards that left the field: a ghost cracks and fades where they were.
    const faded = new Set((s.fadedOut ?? []).map((p) => p.iid));
    const gone = Object.keys(before.perms).filter((iid) => !s.perms[iid] && rects.current.has(iid));
    if (gone.length) {
      const gs = gone.map((iid) => ({ id: nextId.current++, show: showInGame(before, iid), rect: rects.current.get(iid)!, tapped: !!before.perms[iid].tapped, faded: faded.has(iid) }));
      setGhosts((g) => [...g, ...gs]);
      setTimeout(() => setGhosts((g) => g.filter((x) => !gs.some((y) => y.id === x.id))), 900);
    }
    // ---------- card movement: draws, discards, charges, destruction, negation… (with sounds) ----------
    if (s.phase !== 'mulligan' && before.phase !== 'mulligan') {
      const R = rects.current;
      const P = prevRects.current;
      const CARD = { w: 84, h: 118 };
      const fl: Flight[] = [];
      const bs: Burst[] = [];
      const landing = new Map<Iid, number>();
      const bump = new Set<string>();
      const token = new Set<Iid>();
      const reform = new Set<Iid>();
      const hit = new Set<Iid>();
      const counter = new Set<Iid>();
      const hurt = new Set<PlayerId>();
      const heal = new Set<PlayerId>();
      const sounds: { k: Parameters<typeof playSound>[0]; d: number }[] = [];
      const flare = new Set<PlayerId>();
      let shake = false;
      const newLog = s.log.slice(before.log.length);
      const snd = (k: Parameters<typeof playSound>[0], d = 0) => sounds.push({ k, d });
      const mid = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      let stagger = 0;
      const nextDelay = () => (stagger++ % 8) * 80;
      /** A flight from one rect to another. `box`: 'to' = land exactly on the destination; 'card' = a card-sized box centred on it. */
      const fly = (kind: Flight['kind'], from: Rect | undefined, to: Rect | undefined, o: { show?: CardShow; ms?: number; delay?: number; box?: 'to' | 'card'; s0?: number; s1?: number; o1?: number; scatter?: number; color?: string; size?: { w: number; h: number } }) => {
        if (!from || !to || fl.length > 40) return;
        const size = o.size ?? (o.box === 'to' ? { w: to.w, h: to.h } : CARD);
        const c = mid(to);
        const f = mid(from);
        const x = c.x - size.w / 2;
        const y = c.y - size.h / 2;
        const dx = f.x - c.x;
        const dy = f.y - c.y;
        const sc = o.scatter ?? 0;
        const ang = Math.random() * Math.PI * 2;
        fl.push({ id: nextId.current++, kind, show: o.show, x, y, w: size.w, h: size.h, dx, dy, mx: dx + Math.cos(ang) * sc, my: dy + Math.sin(ang) * sc - sc * 0.4, s0: o.s0 ?? Math.max(0.25, from.w / size.w), s1: o.s1 ?? 1, o1: o.o1 ?? 1, ms: o.ms ?? 500, delay: o.delay ?? 0, color: o.color });
      };
      const handRect = (pid: PlayerId) => R.get(`hand:${pid}`);
      const where = (b: GameState, pid: PlayerId, iid: Iid): 'hand' | 'deck' | 'discard' | 'orbs' | 'field' | 'stack' | 'faded' | null => {
        const pl = b.players[pid];
        if (pl.hand.includes(iid)) return 'hand';
        if (pl.deck.includes(iid)) return 'deck';
        if (pl.discard.includes(iid)) return 'discard';
        if (pl.orbs.some((o) => o.iid === iid)) return 'orbs';
        if (b.perms[iid]?.controller === pid) return 'field';
        if (b.stack.some((it) => it.kind === 'card' && it.iid === iid)) return 'stack';
        if ((b.fadedOut ?? []).some((x) => x.iid === iid)) return 'faded';
        return null;
      };
      const ownerOf = (iid: Iid): PlayerId => (s.cards[iid]?.owner ?? before.cards[iid]?.owner ?? 0) as PlayerId;

      for (const p of s.players) {
        const b = before.players[p.id];
        // 1–2 · Draws (from the deck into the hand).
        for (const iid of p.hand.filter((c) => !b.hand.includes(c) && b.deck.includes(c))) {
          const d = nextDelay();
          if (p.id === ME) {
            fly('toFace', R.get(`deck:${ME}`), R.get(iid), { show: showInGame(s, iid), box: 'to', s0: 0.6, ms: 500, delay: d });
            landing.set(iid, 500 + d);
            snd('draw', d);
          } else {
            fly('back', R.get(`deck:${p.id}`), handRect(p.id), { s0: 0.5, s1: 0.35, o1: 0, ms: 400, delay: d, size: { w: 50, h: 70 } });
            bump.add(`hand:${p.id}`);
            snd('drawOpp', d);
          }
        }
        // 12 · Back to hand (from the field).
        for (const iid of p.hand.filter((c) => !b.hand.includes(c) && before.perms[c])) {
          const d = nextDelay();
          if (p.id === ME) {
            fly('face', P.get(iid), R.get(iid), { show: showInGame(s, iid), box: 'to', ms: 550, delay: d });
            landing.set(iid, 550 + d);
          } else fly('face', P.get(iid), handRect(p.id), { show: showInGame(before, iid), s1: 0.3, o1: 0, ms: 550, delay: d });
          bump.add(`hand:${p.id}`);
          snd('bounce', d);
        }
        // 3 · Discards straight from the hand.
        for (const iid of p.discard.filter((c) => !b.discard.includes(c) && b.hand.includes(c))) {
          const d = nextDelay();
          fly('face', p.id === ME ? P.get(iid) : handRect(p.id), R.get(`discard:${p.id}`), { show: showInGame(s, iid), s0: p.id === ME ? undefined : 0.4, s1: 0.3, o1: 0.2, ms: 450, delay: d });
          bump.add(`discard:${p.id}`);
          snd('discard', d);
        }
        // 5 · Charges (a card becomes a Mana Orb).
        for (const o of p.orbs.filter((x) => !b.orbs.some((y) => y.iid === x.iid))) {
          const d = nextDelay();
          const from = where(before, p.id, o.iid) === 'deck' ? R.get(`deck:${p.id}`) : p.id === ME ? P.get(o.iid) : handRect(p.id);
          if (p.id === ME) fly('toBack', from, R.get(`orb:${o.iid}`), { show: showInGame(s, o.iid), s1: 0.2, o1: 0, ms: 600, delay: d });
          else fly('back', from, R.get(`orbs:${p.id}`), { s0: 0.5, s1: 0.25, o1: 0, ms: 600, delay: d, size: { w: 50, h: 70 } });
          bump.add(`orbs:${p.id}`);
          snd('charge', d);
        }
        // 13 · Mana Orbs destroyed.
        for (const o of b.orbs.filter((x) => !p.orbs.some((y) => y.iid === x.iid) && p.discard.includes(x.iid))) {
          const d = nextDelay();
          const at = p.id === ME ? P.get(`orb:${o.iid}`) : R.get(`orbs:${p.id}`);
          if (at) bs.push({ id: nextId.current++, kind: 'orb', rect: at, delay: d });
          fly('face', at, R.get(`discard:${p.id}`), { show: showInGame(s, o.iid), s0: 0.25, s1: 0.3, o1: 0.2, ms: 450, delay: d + 250 });
          bump.add(`discard:${p.id}`);
          snd('orbBreak', d);
        }
        // 10 · Life (a player going out gets the bell instead).
        if (p.eliminated && !b.eliminated) snd('out');
        else if (p.life < b.life) {
          hurt.add(p.id);
          snd('lifeLoss');
        }
        if (p.life > b.life) {
          heal.add(p.id);
          snd('lifeGain');
        }
      }

      // 4 · Destroyed / sacrificed (left the field for the discard pile, or a token vanished), and 12 · FADE OUT.
      const fadedNow = new Set((s.fadedOut ?? []).map((x) => x.iid));
      for (const iid of Object.keys(before.perms)) {
        if (s.perms[iid]) continue;
        const from = P.get(iid);
        const owner = ownerOf(iid);
        if (fadedNow.has(iid)) {
          snd('fadeOut');
          continue;
        }
        const w = where(s, owner, iid);
        if (w === 'hand' || w === 'deck') continue;
        if (w === 'discard' || before.cards[iid]?.isToken) {
          const d = nextDelay();
          const def = getDef(before.cards[iid].cardId);
          const color = themeColor(def.type);
          const dest = w === 'discard' ? R.get(`discard:${owner}`) : undefined;
          for (let k = 0; k < 6 && from; k++) {
            if (dest) fly('shard', from, dest, { color, size: { w: 14, h: 11 }, s0: 1, s1: 0.5, o1: 0.15, ms: 750, delay: d + 220, scatter: 50 });
            else fly('shard', from, { x: mid(from).x + (Math.random() - 0.5) * 120, y: mid(from).y + 40 + Math.random() * 40, w: 1, h: 1 }, { color, size: { w: 14, h: 11 }, s0: 1, s1: 0.6, o1: 0, ms: 650, delay: d + 220 });
          }
          if (dest) bump.add(`discard:${owner}`);
          snd('destroy', d);
        }
      }
      // FADE OUT returns reform out of the mist; 8 · tokens appear in a ring of light; tap / untap clicks.
      const wasFaded = new Set((before.fadedOut ?? []).map((x) => x.iid));
      let untaps = 0;
      let taps = 0;
      for (const [iid, perm] of Object.entries(s.perms)) {
        const old = before.perms[iid];
        if (!old) {
          if (wasFaded.has(iid)) reform.add(iid);
          else {
            if (s.cards[iid]?.isToken) token.add(iid);
            snd(etbSound(s, iid), 60);
          }
          continue;
        }
        if (perm.tapped && !old.tapped) taps++;
        if (!perm.tapped && old.tapped) untaps++;
        if (perm.counters > old.counters) {
          counter.add(iid);
          const r = R.get(iid);
          if (r) bs.push({ id: nextId.current++, kind: 'pip', rect: r, text: counterText(perm, old), delay: 0 });
          snd('counter');
        }
      }
      if (taps) snd('tap');

      // 1 · Playing a card: a sound for its type.
      const PLAY_SOUND: Record<string, Parameters<typeof playSound>[0]> = { Creature: 'playCreature', Spell: 'playSpell', Incantation: 'playIncantation', Artifact: 'playArtifact', Anthem: 'playAnthem' };
      for (const it of fresh) {
        const k = PLAY_SOUND[getDef(s.cards[(it as { iid: Iid }).iid].cardId).type];
        if (k) snd(k);
      }

      // 3 · Mana flows from the Orbs you spent into what you're playing.
      const spentOrbs = before.players[ME].orbs.filter((o) => o.filled && s.players[ME].orbs.some((n) => n.iid === o.iid && !n.filled)).map((o) => o.iid);
      const newMine = s.stack.filter((it) => it.controller === ME && !before.stack.some((b) => b.id === it.id));
      if (spentOrbs.length && newMine.length) {
        const it = newMine[newMine.length - 1];
        const to = it.kind === 'card' ? { x: window.innerWidth / 2 - 159, y: window.innerHeight / 2 - 1, w: 2, h: 2 } : R.get(`stack:${it.id}`);
        spentOrbs.forEach((o, i) => {
          for (let k = 0; k < 3; k++) fly('mote', P.get(`orb:${o}`) ?? R.get(`orb:${o}`), to, { size: { w: 9, h: 9 }, s0: 1, s1: 0.5, o1: 0, ms: 520, delay: i * 70 + k * 60, scatter: 40, color: '#7fd6e8' });
        });
        snd('manaFlow');
      }

      // 2 · Clash impact: attacker and defender knock together.
      if (before.combat && (!s.combat || s.combat.attacker !== before.combat.attacker) && newLog.some((l) => l.includes('Combat:'))) {
        const c = before.combat;
        const def = c.blocker ?? c.targetCreature;
        const at = def ? P.get(def) : undefined;
        if (def && at) {
          const big = !s.perms[def];
          bs.push({ id: nextId.current++, kind: 'clash', rect: at, delay: 0 });
          if (big) shake = true;
          snd(big ? 'clashBig' : 'clash');
        }
      }

      // 4 · The Field reacts to big moments for its tribe.
      const tribeOf = (g: GameState, iid: Iid) => {
        const c = g.cards[iid];
        return c ? (c.override?.tribe ?? getDef(c.cardId).tribe ?? '') : '';
      };
      const typeOf = (g: GameState, iid: Iid) => (g.cards[iid] ? getDef(g.cards[iid].cardId).type : '');
      for (const p of s.players) {
        const f = p.fieldCard;
        if (!f || p.eliminated) continue;
        const mineNew = Object.keys(s.perms).filter((i) => !before.perms[i] && s.perms[i].controller === p.id);
        let hit = false;
        if (f === 'demon-field') hit = mineNew.some((i) => tribeOf(s, i) === 'Demon');
        if (f === 'celestial-citadel') hit = mineNew.some((i) => ['God', 'Demigod'].includes(tribeOf(s, i)));
        if (f === 'forest') hit = !!s.combat && s.combat.attackerController === p.id && (!before.combat || before.combat.attacker !== s.combat.attacker) && tribeOf(s, s.combat.attacker) === 'Goblin';
        if (f === 'graveyard') hit = Object.keys(before.perms).some((i) => !s.perms[i] && before.perms[i].controller === p.id && tribeOf(before, i) === 'Zombie' && !fadedNow.has(i));
        if (f === 'city-night') hit = Object.entries(s.perms).some(([i, q]) => q.controller === p.id && before.perms[i] && q.counters > before.perms[i].counters && tribeOf(s, i) === 'Vampire');
        if (f === 'neural-nexus') hit = Object.entries(s.perms).some(([i, q]) => q.controller === p.id && q.tapped && before.perms[i] && !before.perms[i].tapped && (typeOf(s, i) === 'Artifact' || tribeOf(s, i) === 'Construct'));
        if (hit) {
          flare.add(p.id);
          if (p.id === ME) snd(`flare-${f}` as Parameters<typeof playSound>[0]);
        }
      }
      if (untaps) snd('untap');

      // 6 · Negated, or 7 · resolved, cards leaving the stack.
      for (const it of before.stack) {
        if (s.stack.some((x) => x.id === it.id) || it.kind !== 'card') continue;
        const at = P.get(`stack:${it.id}`);
        const name = getDef(before.cards[it.iid].cardId).name;
        if (newLog.some((l) => l.includes(`${name} is negated`))) {
          if (at) bs.push({ id: nextId.current++, kind: 'negate', rect: at, show: showInGame(before, it.iid), delay: 0 });
          snd('negate');
        } else if (newLog.some((l) => l.includes(`Resolving ${name}`))) {
          const type = getDef(before.cards[it.iid].cardId).type;
          if (type !== 'Spell' && type !== 'Incantation') continue;
          const targets = it.targets.filter((tg) => R.get(tg));
          for (const tg of targets) {
            for (let k = 0; k < 4; k++) fly('mote', at, R.get(tg), { size: { w: 10, h: 10 }, s0: 1, s1: 0.6, o1: 0, ms: 520, delay: k * 50, scatter: 30, color: themeColor(type) });
            hit.add(tg);
          }
          if (!targets.length && at) bs.push({ id: nextId.current++, kind: 'sparkle', rect: at, delay: 0 });
          snd(type === 'Spell' ? 'resolveSpell' : 'resolveIncantation');
        }
      }

      // 14 · Contracts: a soul wisp flies from the other player to the one who gains the Soul.
      const pidByName = (n: string) => s.players.find((q) => q.name === n)?.id;
      for (const l of newLog) {
        const m = /\] (.+?) makes a contract with (.+?) \(/.exec(l);
        if (!m) continue;
        const to = pidByName(m[1]);
        const from = pidByName(m[2]);
        if (to === undefined || from === undefined) continue;
        const d = nextDelay();
        fly('wisp', R.get(`life:${from}`) ?? R.get(`strip:${from}`), R.get(`souls:${to}`) ?? R.get(`life:${to}`), { size: { w: 18, h: 18 }, s0: 1, s1: 0.7, o1: 0.3, ms: 650, delay: d, scatter: 60 });
        bump.add(`souls:${to}`);
        snd('soul', d);
      }

      if (fl.length) {
        setFlights((f) => [...f, ...fl]);
        const life = Math.max(...fl.map((x) => x.ms + x.delay)) + 100;
        setTimeout(() => setFlights((f) => f.filter((x) => !fl.some((y) => y.id === x.id))), life);
      }
      if (bs.length) {
        setBursts((x) => [...x, ...bs]);
        setTimeout(() => setBursts((x) => x.filter((y) => !bs.some((z) => z.id === y.id))), 900);
      }
      if (landing.size || bump.size || token.size || reform.size || hit.size || counter.size || hurt.size || heal.size || flare.size || shake) {
        const m = { landing, token, reform, hit, counter, hurt, heal, bump, flare, shake };
        setMarks(m);
        const longest = Math.max(flare.size ? 1500 : 900, ...[...landing.values()].map((v) => v + 100));
        setTimeout(() => setMarks((cur) => (cur === m ? { landing: new Map(), token: new Set(), reform: new Set(), hit: new Set(), counter: new Set(), hurt: new Set(), heal: new Set(), bump: new Set(), flare: new Set(), shake: false } : cur)), longest);
      }
      for (const x of sounds) playSound(x.k, x.d);
    }
    // Damage, counters and life changes float up as numbers.
    for (const [iid, perm] of Object.entries(s.perms)) {
      const old = before.perms[iid];
      if (!old) continue;
      if (perm.damage > old.damage) add(iid, `−${perm.damage - old.damage}`, 'red');
      if (perm.counters > old.counters) add(iid, counterText(perm, old), 'gold');
    }
    for (const p of s.players) {
      const o = before.players[p.id];
      if (p.life < o.life) add(`life:${p.id}`, `−${o.life - p.life}`, 'red');
      if (p.life > o.life) add(`life:${p.id}`, `+${p.life - o.life}`, 'green');
      if (p.souls > o.souls) add(`life:${p.id}`, `+${p.souls - o.souls} Soul`, 'gold');
    }
    if (newFloats.length) {
      setFloats((f) => [...f, ...newFloats]);
      setTimeout(() => setFloats((f) => f.filter((x) => !newFloats.some((y) => y.id === x.id))), 1300);
    }
    // Spent Orbs flash, new cards pop in, a new attacker lunges.
    const spent = new Set(before.players[ME].orbs.filter((o) => o.filled && s.players[ME].orbs.some((n) => n.iid === o.iid && !n.filled)).map((o) => o.iid));
    const entering = new Set(Object.keys(s.perms).filter((iid) => !before.perms[iid]));
    const lunge = s.combat && (!before.combat || before.combat.attacker !== s.combat.attacker) ? s.combat.attacker : null;
    const arriving = new Set(s.players[ME].orbs.filter((o) => !before.players[ME].orbs.some((b) => b.iid === o.iid)).map((o) => o.iid));
    if (spent.size || arriving.size || entering.size || lunge) {
      setFlash({ spent, arriving, entering, lunge });
      setTimeout(() => setFlash({ spent: new Set(), arriving: new Set(), entering: new Set(), lunge: null }), 900);
    }
  }, [s, enabled]);

  // Each announcement holds for a moment, then the next one shows.
  useEffect(() => {
    if (!queue.length) return;
    if (queue[0].kind === 'coin') {
      playSound('coin');
      playSound('coinLand', 1100);
    }
    if (queue[0].kind === 'reveal') playSound('reveal');
    const t = setTimeout(() => setQueue((q) => q.slice(1)), queue[0].ms);
    return () => clearTimeout(t);
  }, [queue]);

  return { announce: queue[0] ?? null, busy: queue.length > 0, ghosts, floats, flash, arrow, links, milestones, flights, bursts, marks, outs: outs.current, skip: () => setQueue((q) => q.slice(1)) };
}

export function FxLayer({ fx, label }: { fx: ReturnType<typeof useTableFx>; label: string | null }) {
  const a = fx.announce;
  return (
    <div className="fx-layer" aria-hidden="true">
      {fx.arrow && (
        <svg className="fx-arrow" width="100%" height="100%">
          <defs>
            <marker id="fx-ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" fill="#e8705f" />
            </marker>
          </defs>
          <path
            d={`M ${fx.arrow.x1} ${fx.arrow.y1} Q ${(fx.arrow.x1 + fx.arrow.x2) / 2 + (fx.arrow.y2 - fx.arrow.y1) * 0.15} ${(fx.arrow.y1 + fx.arrow.y2) / 2 - Math.abs(fx.arrow.x2 - fx.arrow.x1) * 0.15}, ${fx.arrow.x2} ${fx.arrow.y2}`}
            fill="none"
            stroke="#e8705f"
            strokeWidth="5"
            strokeLinecap="round"
            markerEnd="url(#fx-ah)"
            className="fx-arrow-path"
          />
        </svg>
      )}
      {fx.links.length > 0 && (
        <svg className="fx-arrow" width="100%" height="100%">
          <defs>
            <marker id="fx-ah2" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
              <path d="M0 0 10 5 0 10z" fill="#e3b95a" />
            </marker>
          </defs>
          {fx.links.map((l, i) => (
            <path
              key={i}
              d={`M ${l.x1} ${l.y1} Q ${(l.x1 + l.x2) / 2} ${Math.min(l.y1, l.y2) - 60}, ${l.x2} ${l.y2}`}
              fill="none"
              stroke="#e3b95a"
              strokeWidth="4"
              strokeDasharray="10 8"
              strokeLinecap="round"
              markerEnd="url(#fx-ah2)"
              className="fx-link"
            />
          ))}
        </svg>
      )}
      {fx.arrow && label && (
        <div className="fx-clash" style={{ left: (fx.arrow.x1 + fx.arrow.x2) / 2, top: (fx.arrow.y1 + fx.arrow.y2) / 2 }}>
          {label}
        </div>
      )}
      {fx.ghosts.map((g) => (
        <div key={g.id} className={`fx-ghost${g.faded ? ' faded' : ''}`} style={{ left: g.rect.x, top: g.rect.y, width: g.rect.w, height: g.rect.h }}>
          <Card show={g.show} scale={(g.tapped ? g.rect.h : g.rect.w) / 340} tapped={g.tapped} badges={false} />
        </div>
      ))}
      {fx.flights.map((f) => (
        <div
          key={f.id}
          className={`fx-fly ${f.kind}`}
          style={{ left: f.x, top: f.y, width: f.w, height: f.h, ['--dx' as string]: `${f.dx}px`, ['--dy' as string]: `${f.dy}px`, ['--mx' as string]: `${f.mx}px`, ['--my' as string]: `${f.my}px`, ['--s0' as string]: f.s0, ['--s1' as string]: f.s1, ['--o1' as string]: f.o1, animationDuration: `${f.ms}ms`, animationDelay: `${f.delay}ms`, ['--c' as string]: f.color ?? '#e3b95a' }}
        >
          {(f.kind === 'face' || f.kind === 'toFace' || f.kind === 'toBack') && f.show && (
            <div className="fly-face" style={{ animationDuration: `${f.ms}ms`, animationDelay: `${f.delay}ms` }}>
              <Card show={f.show} scale={f.w / 340} badges={false} />
            </div>
          )}
          {(f.kind === 'back' || f.kind === 'toFace' || f.kind === 'toBack') && (
            <div className="fly-back" style={{ animationDuration: `${f.ms}ms`, animationDelay: `${f.delay}ms` }}>
              <Card show="back" scale={f.w / 340} badges={false} />
            </div>
          )}
        </div>
      ))}
      {fx.bursts.map((b) => (
        <div key={b.id} className={`fx-burst ${b.kind}`} style={{ left: b.rect.x, top: b.rect.y, width: b.rect.w, height: b.rect.h, animationDelay: `${b.delay}ms` }}>
          {b.kind === 'negate' && b.show && (
            <>
              <div className="half l">
                <Card show={b.show} scale={Math.min(0.24, (b.rect.h * 1.6) / 476)} badges={false} />
              </div>
              <div className="half r">
                <Card show={b.show} scale={Math.min(0.24, (b.rect.h * 1.6) / 476)} badges={false} />
              </div>
              <span className="slash" />
              <span className="stamp">NEGATED</span>
            </>
          )}
          {b.kind === 'orb' && (
            <svg width="100%" height="100%" viewBox="0 0 24 24">
              <path d="M12 2 L10 9 L14 12 L11 22" fill="none" stroke="#e8705f" strokeWidth="2.4" />
            </svg>
          )}
          {b.kind === 'pip' && <span className="pip">{b.text}</span>}
          {b.kind === 'clash' && (
            <svg className="star" viewBox="0 0 100 100" aria-hidden="true">
              <path d="M50 4 L60 36 L94 26 L68 50 L94 74 L60 64 L50 96 L40 64 L6 74 L32 50 L6 26 L40 36 Z" />
            </svg>
          )}
        </div>
      ))}
      {fx.floats.map((f) => (
        <div key={f.id} className={`fx-float ${f.tone}`} style={{ left: f.x, top: f.y }}>
          {f.text}
        </div>
      ))}
      {a && a.kind === 'play' && a.show && (
        <div className="fx-announce" key={a.id}>
          <span className="fx-who">{a.who}</span>
          <Card show={a.show} scale={0.62} badges={false} />
          {a.targets.length > 0 && <span className="fx-target">→ {a.targets.join(', ')}</span>}
        </div>
      )}
      {a && a.kind === 'reveal' && a.show && (
        <div className="fx-announce reveal" key={a.id} onClick={fx.skip}>
          <span className="fx-who">{a.who}</span>
          <Card show={a.show} scale={0.62} badges={false} />
          {a.sub && <span className="fx-target">{a.sub}</span>}
        </div>
      )}
      {a && a.kind === 'coin' && (
        <div className="fx-coin" key={a.id} onClick={fx.skip}>
          <span className="fx-who">{a.who}</span>
          <div className={`coin ${a.heads ? 'heads' : 'tails'}`}>
            <span>{a.heads ? 'H' : 'T'}</span>
          </div>
          <b className="coin-text">{a.sub}</b>
        </div>
      )}
      {a && a.kind !== 'play' && a.kind !== 'reveal' && a.kind !== 'coin' && (
        <div className={`fx-band ${a.kind}${a.mine ? ' mine' : ''} ${a.kind === 'turn' ? moodOf(a.field) : ''}`} key={a.id} onClick={fx.skip}>
          <span className="big">
            {a.kind === 'turn' && a.field && FIELD_GLYPHS[a.field] && <span className="glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: FIELD_GLYPHS[a.field] }} />}
            {a.who}
            {a.kind === 'turn' && a.field && FIELD_GLYPHS[a.field] && <span className="glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: FIELD_GLYPHS[a.field] }} />}
          </span>
          {a.sub && <span className="sub">{a.sub}</span>}
        </div>
      )}
      {fx.milestones.map((m, i) => (
        <div key={m.id} className={`fx-milestone ${m.tone}`} style={{ top: 110 + i * 150 }}>
          <span className="head">{m.head}</span>
          <span className="big">{m.big}</span>
          <span className="text">{m.text}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- choices grouped by player ----------
/** Where a card is, from the human's point of view: "You", "Ben", "On the stack", "Your discard pile"… */
function placeOf(s: GameState, id: string): { key: string; label: string; order: number } {
  const who = (pid: PlayerId) => (pid === ME ? 'You' : s.players[pid].name);
  if (s.perms[id]) {
    const c = s.perms[id].controller;
    return { key: `field:${c}`, label: c === ME ? 'Your field' : `${who(c)}'s field`, order: c };
  }
  if (s.stack.some((it) => it.kind === 'card' && it.iid === id)) return { key: 'stack', label: 'On the stack', order: 10 };
  for (const p of s.players) {
    const pre = p.id === ME ? 'Your' : `${p.name}'s`;
    if (p.hand.includes(id)) return { key: `hand:${p.id}`, label: `${pre} hand`, order: 20 + p.id };
    if (p.discard.includes(id)) return { key: `discard:${p.id}`, label: `${pre} discard pile`, order: 30 + p.id };
    if (p.deck.includes(id)) return { key: `deck:${p.id}`, label: `${pre} deck`, order: 40 + p.id };
    if (p.orbs.some((o) => o.iid === id)) return { key: `orbs:${p.id}`, label: `${pre} Mana Orbs`, order: 50 + p.id };
  }
  return { key: 'other', label: 'Other', order: 99 };
}

export function GroupedChoices({
  s,
  ids,
  chosen,
  onPick,
  onHover,
}: {
  s: GameState;
  ids: string[];
  chosen: string[];
  onPick: (id: string) => void;
  onHover: (id: string) => void;
}) {
  const groups = new Map<string, { label: string; order: number; ids: string[] }>();
  for (const id of ids) {
    const p = placeOf(s, id);
    if (!groups.has(p.key)) groups.set(p.key, { label: p.label, order: p.order, ids: [] });
    groups.get(p.key)!.ids.push(id);
  }
  const list = [...groups.values()].sort((a, b) => a.order - b.order);
  return (
    <div className="grouped">
      {list.map((g) => (
        <section key={g.label} className="group">
          <span className="label">
            {g.label.toUpperCase()} · {g.ids.length}
          </span>
          <div className="choices">
            {g.ids.map((id) => (
              <Card
                key={id}
                show={showInGame(s, id)}
                scale={0.42}
                tapped={!!s.perms[id]?.tapped}
                ring={chosen.includes(id) ? 'chosen' : 'select'}
                onHover={() => onHover(id)}
                onClick={() => onPick(id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Field order: creatures, then artifacts, then anthems (and anything else). */
export function permRank(s: GameState, iid: Iid): number {
  if (isCreature(s, iid)) return 0;
  const t = getDef(s.cards[iid].cardId).type;
  if (t === 'Artifact' || (s.cards[iid].override?.type ?? t) === 'Artifact' || s.perms[iid]?.attachedTo) return 1;
  if (t === 'Anthem') return 2;
  return 3;
}

const HAND_TYPE: Record<string, number> = { Creature: 0, Artifact: 1, Anthem: 2, Field: 3, Spell: 4, Incantation: 5 };
/** Your hand: cost low to high, then Creature · Artifact · Anthem · Field · Spell · Incantation, then name. */
export function sortHand(s: GameState, ids: Iid[]): Iid[] {
  const key = (iid: Iid) => {
    const d = getDef(s.cards[iid].cardId);
    return { c: d.cost ?? 0, t: HAND_TYPE[d.type] ?? 9, n: d.name };
  };
  return [...ids].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return x.c - y.c || x.t - y.t || x.n.localeCompare(y.n);
  });
}

/** A Field's painted scene, sitting behind a player's area. */
export function FieldScene({ field }: { field: string | null | undefined }) {
  if (!field || !FIELD_SCENES[field]) return null;
  return <div className="scene" aria-hidden="true" dangerouslySetInnerHTML={{ __html: FIELD_SCENES[field] }} />;
}

/** The mood class for a Field ("mood-forest"), or '' without one. */
export function moodOf(fieldCard: string | null | undefined): string {
  return fieldCard ? `mood-${fieldCard}` : '';
}

export function sortField(s: GameState, ids: Iid[]): Iid[] {
  return ids.map((iid, i) => ({ iid, i, r: permRank(s, iid) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.iid);
}

// ---------- pings ----------
export type PingKind = 'look' | 'careful' | 'attack' | 'help';
export const PING_LABEL: Record<PingKind, string> = { look: 'Look', careful: 'Careful', attack: 'Attack this', help: 'Help?' };
export interface Ping {
  id: number;
  sel: string; // CSS selector of the pinged thing; the ring follows it
  kind: PingKind;
  who: string;
}

/** Rings that pulse around pinged things for a few seconds, following them as the table moves. */
export function PingLayer({ pings, onGone }: { pings: Ping[]; onGone: (id: number) => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!pings.length) return;
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pings.length]);
  return (
    <div className="ping-layer" aria-hidden="true">
      {pings.map((p) => {
        const el = document.querySelector(`.game ${p.sel}`);
        if (!el) {
          setTimeout(() => onGone(p.id), 0);
          return null;
        }
        const r = el.getBoundingClientRect();
        return (
          <div key={p.id} className={`ping-ring ${p.kind}`} style={{ left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 }}>
            <span className="ping-chip">
              {p.who}: {PING_LABEL[p.kind]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** "+1/+1" for stat counters, "+1 counter" for plain ones. */
function counterText(perm: { counters: number; counterAtk: number; counterDef: number }, old: { counters: number; counterAtk: number; counterDef: number }): string {
  const a = perm.counterAtk - old.counterAtk;
  const d = perm.counterDef - old.counterDef;
  if (a || d) return `+${a}/+${d}`;
  const n = perm.counters - old.counters;
  return `+${n} counter${n === 1 ? '' : 's'}`;
}

/** The sound a permanent makes as it enters the field: by type, and creatures by kindred. */
function etbSound(s: GameState, iid: Iid): Parameters<typeof playSound>[0] {
  const d = s.cards[iid] ? getDef(s.cards[iid].cardId) : null;
  const o = s.cards[iid]?.override;
  if (!d) return 'etbCreature';
  if (isCreature(s, iid)) {
    const tribe0 = (o?.tribe ?? d.tribe ?? '').toLowerCase().replace(/\s+/g, '-');
    // Every Human uses the Herald's fanfare.
    const tribe = tribe0 === 'human' ? 'human-herald' : tribe0;
    const known = ['goblin', 'vampire', 'demon', 'zombie', 'human', 'construct', 'god', 'demigod', 'druid', 'dragon', 'dragon-rider', 'shapeshifter', 'illusion', 'human-herald'];
    return known.includes(tribe) ? (`etb-${tribe}` as Parameters<typeof playSound>[0]) : 'etbCreature';
  }
  if (d.type === 'Anthem') return 'etbAnthem';
  return 'etbArtifact';
}
