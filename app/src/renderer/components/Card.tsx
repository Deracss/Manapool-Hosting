// Draws a card in the ManaPool "banner" frame: text only, no art. Cards are laid out at full size (340×476) and scaled.
import type { CSSProperties, MouseEvent, PointerEvent } from 'react';
import { ART, artUrl } from '../art';
import { emblemFor } from '../emblems';
import { ME } from '../me';
import { attackOf, defenseOf, defOf, getDef, keywordsOf } from '../engine';
import type { CardDef, GameState, Iid } from '../engine';
import { meaningOf } from '../glossary';
import { setHovered } from '../hover';

export type BadgeTone = 'gold' | 'red' | 'grey' | 'green' | 'dark';

export interface CardShow {
  name: string;
  type: string;
  tribe?: string;
  crack?: number; // 0–1: how much of its defense the damage took this turn
  cost: number | null;
  atk: number | string | null;
  def: number | string | null;
  text: string;
  incantation: boolean;
  placeholderName?: boolean;
  atkMod?: 'up' | 'down';
  defMod?: 'up' | 'down';
  keywords?: { k: string; granted: boolean }[]; // shown on the keyword line
  extra?: string; // state in words, for the inspect popup
  badges?: { label: string; tone: BadgeTone }[]; // shown on the card's corner: counters, damage, equipment…
  veil?: 'infected';
  number?: string;
  works?: boolean; // false when the card's effect isn't scripted yet
  baseAtk?: number | string | null; // printed stats, when the card is in play
  baseDef?: number | string | null;
  notes?: string[]; // current state, for the inspect popup
  art?: string; // full-art image (card id), when the card has art
}

const THEMES: Record<string, Record<string, string>> = {
  Creature: { frame: '#B8892B', edge: '#5E4512', panel: '#F8EED3', ink: '#2A1F0A', banner: '#1b1608' },
  Token: { frame: '#D2B061', edge: '#6E5418', panel: '#FBF4E2', ink: '#2A1F0A', banner: '#1b1608' },
  Artifact: { frame: '#8A8F96', edge: '#3A3F45', panel: '#EEF0F2', ink: '#1C2024', banner: '#111316' },
  Spell: { frame: '#2F64A8', edge: '#132C50', panel: '#E4ECF8', ink: '#0E1B31', banner: '#FFFFFF' },
  Incantation: { frame: '#B2382C', edge: '#57150F', panel: '#F9E5E1', ink: '#2E0B07', banner: '#FFFFFF' },
  Anthem: { frame: '#E7DDC3', edge: '#8F7D52', panel: '#FFFCF4', ink: '#2B2414', banner: '#2B2414' },
  Field: { frame: '#33793F', edge: '#16421D', panel: '#E3F1E3', ink: '#0E2713', banner: '#FFFFFF' },
  'Mana Token': { frame: '#3A3F66', edge: '#14162B', panel: '#E7E8F3', ink: '#121429', banner: '#FFFFFF' },
};

export function themeColor(type: string): string {
  return (THEMES[type] ?? THEMES.Creature).frame;
}
export function themeEdge(type: string): string {
  return (THEMES[type] ?? THEMES.Creature).edge;
}

/** Removes keywords that open the rules text ("DMG GAIN, FACEOFF. At the end…"): they're on the keyword line. */
function stripLeadingKeywords(text: string, kws: string[]): string {
  let t = text.trim();
  for (let again = true; again; ) {
    again = false;
    for (const k of kws) {
      if (t.toUpperCase().startsWith(k) && !/[A-Za-z]/.test(t.charAt(k.length))) {
        t = t.slice(k.length).replace(/^[\s,;.\-–]+/, '');
        again = true;
      }
    }
  }
  return t;
}

/** Printed card (deck builder, hand). */
export function showDef(d: CardDef, number?: number): CardShow {
  const kws = (d.script.keywords ?? []) as string[];
  return {
    name: d.name,
    art: ART.has(d.id) ? d.id : undefined,
    type: d.type,
    tribe: d.tribe,
    cost: d.cost,
    atk: d.attack ?? null,
    def: d.defense ?? null,
    // A token with no rules text still says what it is ("Zombie token.").
    text: stripLeadingKeywords(d.text, kws) || (d.type === 'Token' && d.tribe && !kws.length ? `${d.tribe} token.` : ''),
    keywords: kws.map((k) => ({ k, granted: false })),
    incantation: d.type === 'Incantation' || d.speed === 'incantation' || kws.includes('FLASH'),
    placeholderName: /#\d+$/.test(d.name),
    works: d.scripted || d.text.trim() === '',
    number: number ? `MP-${String(number).padStart(3, '0')}` : d.type === 'Field' ? 'FIELD' : d.type === 'Token' ? 'TOKEN' : undefined,
  };
}

/** A card in a game: shows current attack/defense, granted keywords, counters and other state. */
export function showInGame(s: GameState, iid: Iid): CardShow {
  const inst = s.cards[iid];
  const perm = s.perms[iid];
  // On the field a card can be changed (Anthropomorph, INFECT, special tokens): show it as it is now.
  const d = perm ? defOf(s, iid) : getDef(inst.cardId);
  const base = showDef(d);
  const printed = (d.script.keywords ?? []) as string[];
  if (!perm) {
    const extra = inst.extraKeywords.filter((k) => !printed.includes(k));
    if (extra.length) base.keywords = [...(base.keywords ?? []), ...extra.map((k) => ({ k, granted: true }))];
    return base;
  }
  if (inst.isToken && d.type !== 'Token' && d.type !== 'Mana Token') base.number = 'TOKEN COPY';
  const granted = keywordsOf(s, iid).filter((k) => !printed.includes(k));
  base.keywords = [...printed.map((k) => ({ k, granted: false })), ...granted.map((k) => ({ k, granted: true }))];
  const extras: string[] = [];
  if (granted.length) extras.push(`Has ${granted.join(', ')} from other cards`);
  const badges: { label: string; tone: BadgeTone }[] = [];
  const notes: string[] = [];
  if (inst.override && !inst.isToken) {
    const orig = getDef(inst.cardId).name;
    const lost = inst.override.scriptFrom === null;
    badges.push({ label: lost ? 'No abilities' : 'Changed', tone: 'red' });
    notes.push(`Originally ${orig}.${lost ? ' It has lost all its abilities while it stays on the field.' : ''}`);
    if (base.name === orig && inst.override.tribe) base.name = `${orig} (${inst.override.tribe})`;
  }
  if (perm.attachedTo && s.cards[perm.attachedTo]) {
    const to = getDef(s.cards[perm.attachedTo].cardId).name;
    badges.push({ label: `→ ${to}`, tone: 'grey' });
    extras.push(`Equipped to ${to}`);
  }
  for (const other of Object.values(s.perms)) {
    if (other.attachedTo === iid) badges.push({ label: getDef(s.cards[other.iid].cardId).name, tone: 'grey' });
  }
  if (extras.length) base.extra = extras.join(' · ');
  if (perm.damage > 0 && (typeof d.attack === 'number' || d.attack === '*')) base.crack = Math.min(1, perm.damage / (perm.damage + Math.max(0, defenseOf(s, iid))));
  if (typeof d.attack === 'number' || d.attack === '*') {
    const a = attackOf(s, iid);
    const df = defenseOf(s, iid);
    const ba = typeof d.attack === 'number' ? d.attack : 0;
    const bd = typeof d.defense === 'number' ? d.defense : 0;
    base.atk = a;
    base.def = df;
    if (a !== ba) base.atkMod = a > ba ? 'up' : 'down';
    if (df !== bd) base.defMod = df > bd ? 'up' : 'down';
  }
  const sick = perm.sick && typeof d.attack === 'number' && !keywordsOf(s, iid).includes('HASTE');
  if (perm.counters) {
    const n = `${perm.counters} counter${perm.counters === 1 ? '' : 's'}`;
    if (!perm.counterAtk && !perm.counterDef) {
      // Plain counters (no stat change), e.g. Machinist's Reservoir.
      badges.push({ label: n, tone: 'gold' });
      notes.push(`Has ${n}.`);
    } else {
      const per = `+${perm.counterAtk}/+${perm.counterDef}`;
      badges.push({ label: perm.counters > 1 ? `${per} ×${perm.counters}` : per, tone: 'gold' });
      notes.push(`Counters: ${per} from ${n}.`);
    }
  }
  if (perm.damage) {
    badges.push({ label: `−${perm.damage} dmg`, tone: 'red' });
    notes.push(`Has taken ${perm.damage} damage (wears off at the end of the turn).`);
  }
  if (sick) {
    badges.push({ label: 'New', tone: 'dark' });
    notes.push("Summoning sickness: it can block and boost, but it can't attack or use TAP abilities until its controller's next turn.");
  }
  if (perm.swapped) {
    badges.push({ label: 'Switched', tone: 'gold' });
    notes.push('Confused Knight: its attack and defense are switched (buffs switch too).');
  }
  if (inst.override?.untilEndOfTurn) notes.push(`Shifting Relic: a copy of ${d.name} until the end of the turn.`);
  if (perm.infectedBy !== undefined) {
    const by = perm.infectedBy === ME ? 'you' : s.players[perm.infectedBy].name;
    base.veil = 'infected';
    badges.push({ label: `INFECTED · ${perm.infectedBy === ME ? 'You' : by}`, tone: 'green' });
    notes.push(`INFECTED by ${by}: it becomes their 1/1 Zombie at the end of its controller's next turn.`);
  }
  if (perm.tapped) notes.push("Tapped: it can't attack, block or boost until it untaps.");
  notes.push(`Controlled by ${perm.controller === ME ? 'you' : s.players[perm.controller].name}.`);
  base.badges = badges;
  base.notes = notes;
  base.baseAtk = d.attack ?? null;
  base.baseDef = d.defense ?? null;
  return base;
}

const KW = /\b[A-Z]{2,}[A-Z'-]*(?:\s+[A-Z]{2,}[A-Z'-]*)*\b/g;

function RulesText({ text }: { text: string }) {
  // A number stays on the same line as the word after it ("10 SOULS", "3 counters").
  const lines = text ? text.replace(/(\d) (?=\S)/g, '$1\u00a0').split('\n') : [];
  return (
    <>
      {lines.map((line, i) => {
        const parts: { t: string; k: boolean }[] = [];
        let last = 0;
        for (const m of line.matchAll(KW)) {
          if (m.index! > last) parts.push({ t: line.slice(last, m.index), k: false });
          parts.push({ t: m[0], k: true });
          last = m.index! + m[0].length;
        }
        if (last < line.length) parts.push({ t: line.slice(last), k: false });
        return <p key={i}>{parts.map((p, j) => (p.k ? <b key={j}>{p.t}</b> : <span key={j}>{p.t}</span>))}</p>;
      })}
    </>
  );
}

export interface CardProps {
  show: CardShow | 'back';
  scale?: number;
  tapped?: boolean;
  ring?: 'select' | 'chosen' | 'attack';
  dim?: boolean;
  label?: string;
  iid?: Iid; // marks the card on the table (for arrows and animations)
  tag?: string; // a label on the card, e.g. "Target"
  tagTone?: 'cyan' | 'red' | 'green' | 'gold' | 'grey';
  badges?: boolean; // show state badges (default true)
  className?: string;
  onClick?: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  onHover?: () => void;
  onLeave?: () => void;
  onPointerDown?: (e: PointerEvent) => void;
  tapDelay?: number; // ms before a tap / untap turn starts (the Upkeep untap wave)
}

export function Card({ show, scale = 1, tapped, ring, dim, label, iid, tag, tagTone = 'cyan', badges = true, className, onClick, onContextMenu, onHover, onLeave, onPointerDown, tapDelay }: CardProps) {
  const w = (tapped ? 476 : 340) * scale;
  const h = (tapped ? 340 : 476) * scale;
  const transform = tapped ? `translateX(${476 * scale}px) rotate(90deg) scale(${scale})` : `scale(${scale})`;
  const cls = ['card-box', 'inspectable', onClick ? 'clickable' : '', ring ? `ring-${ring}` : '', dim ? 'dim' : '', show !== 'back' && show.veil ? `veil-${show.veil}` : '', className ?? ''].join(' ');
  const name = show === 'back' ? 'Face-down card' : show.name;
  const body =
    show === 'back' ? (
      <div className="card back">
        <div className="inner">
          <div className="orbbig" />
        </div>
      </div>
    ) : show.art ? (
      <FullArtFace c={show} />
    ) : (
      <CardFace c={show} />
    );
  const style: CSSProperties = { width: w, height: h, borderRadius: 18 * scale, transitionDelay: tapDelay ? `${tapDelay}ms` : undefined };
  const enter = () => {
    if (show !== 'back') setHovered(show);
    onHover?.();
  };
  const leave = () => {
    setHovered(null);
    onLeave?.();
  };
  const extras = (
    <>
      <div className="card-scaler" style={{ transform, transitionDelay: tapDelay ? `${tapDelay}ms` : undefined }}>
        {body}
      </div>
      {badges && show !== 'back' && show.badges && show.badges.length > 0 && (
        <div className="badges" style={{ fontSize: Math.max(10, Math.min(13, 34 * scale)) }}>
          {show.badges.map((b) => (
            <span key={b.label} className={`badge ${b.tone}`}>
              {b.label}
            </span>
          ))}
        </div>
      )}
      {tag && <span className={`card-tag ${tagTone}`}>{tag}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} style={{ ...style, padding: 0, border: 'none', background: 'none' }} data-iid={iid} aria-label={label ?? name} onClick={onClick} onContextMenu={onContextMenu} onMouseEnter={enter} onMouseLeave={leave} onFocus={onHover} onPointerDown={onPointerDown}>
        {extras}
      </button>
    );
  }
  return (
    <div className={cls} style={style} data-iid={iid} aria-label={label ?? name} onMouseEnter={enter} onMouseLeave={leave} onContextMenu={onContextMenu}>
      {extras}
    </div>
  );
}

function typeLineOf(c: CardShow): string {
  if (c.type === 'Creature') return `Creature — ${c.tribe}`;
  if (c.type === 'Token') return `Token Creature — ${c.tribe}`;
  if (c.type === 'Field') return `Field — ${c.tribe}`;
  return c.type;
}

function CardFace({ c }: { c: CardShow }) {
  const th = THEMES[c.type] ?? THEMES.Creature;
  const vars = { '--frame': th.frame, '--edge': th.edge, '--cpanel': th.panel, '--cink': th.ink, '--banner': th.banner } as CSSProperties;
  const nameSize = c.name.length <= 14 ? 36 : c.name.length <= 22 ? 31 : 27;
  const kws = c.keywords ?? [];
  const reminder = !c.text.trim() && kws.length ? meaningOf(kws[0].k) : null;
  const weight = c.text.length + 30 * Math.max(0, c.text.split('\n').length - 1) + (kws.length ? 40 : 0);
  const textSize = weight <= 70 ? 23 : weight <= 120 ? 21 : weight <= 170 ? 19 : weight <= 230 ? 17 : 15.5;
  const hasStats = c.atk !== null && c.atk !== undefined;
  const emblem = emblemFor(c.type, c.tribe);
  return (
    <div className="card" style={vars}>
      <div className="banner">
        <div className={`name${c.placeholderName ? ' ph' : ''}`} style={{ fontSize: nameSize }}>
          {c.name}
        </div>
        {c.cost !== null && c.cost !== undefined && <div className="cost">{c.cost}</div>}
      </div>
      <div className="typeline">
        <span>{typeLineOf(c).toUpperCase()}</span>
        {c.incantation && (
          <svg role="img" aria-label="Incantation speed" width="20" height="20" viewBox="0 0 24 24" fill={th.edge} style={{ flex: 'none' }}>
            <path d="M13.5 2 4.5 13.5h6L9.5 22l9-12h-6l1-8z" />
          </svg>
        )}
      </div>
      {kws.length > 0 && (
        <div className="kwline">
          {kws.map((k, i) => (
            <span key={k.k} className={k.granted ? 'granted' : ''}>
              {i > 0 && <i className="sep"> · </i>}
              {k.k}
            </span>
          ))}
        </div>
      )}
      <div className="text" style={{ fontSize: textSize }}>
        {emblem && (
          <svg className={`emblem${c.text.trim() || reminder ? '' : ' strong'}`} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d={emblem} />
          </svg>
        )}
        {c.text.trim() ? <RulesText text={c.text} /> : reminder ? <p className="reminder">{reminder}</p> : null}
      </div>
      {c.crack ? (
        <svg className="cracks" viewBox="0 0 340 476" aria-hidden="true">
          <path d="M60 120 l40 50 -25 40 45 55 -15 45 M100 170 l60 -20 M120 265 l-50 30" />
          {c.crack > 0.34 && <path d="M260 90 l-35 60 30 35 -40 70 20 50 M255 185 l45 20 M215 255 l-40 -10" />}
          {c.crack > 0.67 && <path d="M170 300 l-20 50 35 30 -30 60 M150 350 l-55 15 M185 380 l50 -5 M120 60 l30 40 -10 30" />}
        </svg>
      ) : null}
      {hasStats ? (
        <div className="stats">
          <small>ATK</small>
          <span className={c.atkMod ?? ''}>{c.atk}</span>
          <i>/</i>
          <span className={c.defMod ?? ''}>{c.def}</span>
          <small>DEF</small>
        </div>
      ) : (
        <div className="footnum">{c.number ?? ''}</div>
      )}
    </div>
  );
}

const FA_LIGHT: Record<string, string> = { Creature: '#f3d58a', Token: '#f3d58a', Artifact: '#d6dbe4', Spell: '#9cc0ff', Incantation: '#ff9c8a', Anthem: '#f4ecd6', Field: '#9fd7a8' };

/** Full-art frame: the art fills the card; the top and bottom darken behind the name and the text. */
function FullArtFace({ c }: { c: CardShow }) {
  const th = THEMES[c.type] ?? THEMES.Creature;
  const vars = { '--frame': th.frame, '--edge': th.edge, '--light': FA_LIGHT[c.type] ?? '#f3d58a' } as CSSProperties;
  const kws = c.keywords ?? [];
  const reminder = !c.text.trim() && kws.length ? meaningOf(kws[0].k) : null;
  const weight = c.text.length + 30 * Math.max(0, c.text.split('\n').length - 1) + (kws.length ? 40 : 0);
  const textSize = weight <= 70 ? 19 : weight <= 130 ? 17.5 : weight <= 190 ? 16 : 14.5;
  const hasStats = c.atk !== null && c.atk !== undefined;
  // Less text: the fade starts lower, so more of the art shows.
  const fadeFrom = weight <= 60 ? 64 : weight <= 110 ? 58 : weight <= 170 ? 52 : 46;
  const comma = c.name.indexOf(', ');
  const [title, epithet] = comma > 0 ? [c.name.slice(0, comma), c.name.slice(comma + 2)] : [c.name, ''];
  const nameSize = title.length <= 14 ? 25 : title.length <= 20 ? 22 : 19;
  return (
    <div className="card fullart" style={vars}>
      <img className="fa-art" src={artUrl(c.art!)} alt="" draggable={false} />
      <div className="fa-shade" style={{ background: `linear-gradient(180deg, rgba(5,6,9,0.8) 0, rgba(5,6,9,0) 92px, rgba(5,6,9,0) ${fadeFrom}%, rgba(5,6,9,0.86) ${fadeFrom + 18}%, rgba(5,6,9,0.96) 100%)` }} />
      <div className="fa-rim" />
      <div className="fa-top">
        <div className={`fa-name${c.placeholderName ? ' ph' : ''}`} style={{ fontSize: nameSize }}>
          {title}
          {epithet && <span className="fa-epithet">{epithet}</span>}
        </div>
        {c.cost !== null && c.cost !== undefined && <div className="fa-cost">{c.cost}</div>}
      </div>
      <div className="fa-bottom">
        <div className="fa-type">
          <span>{typeLineOf(c).toUpperCase()}</span>
          {c.incantation && (
            <svg role="img" aria-label="Incantation speed" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ flex: 'none' }}>
              <path d="M13.5 2 4.5 13.5h6L9.5 22l9-12h-6l1-8z" />
            </svg>
          )}
          <i />
        </div>
        {kws.length > 0 && (
          <div className="fa-kw">
            {kws.map((k, i) => (
              <span key={k.k} className={k.granted ? 'granted' : ''}>
                {i > 0 && <i className="sep"> · </i>}
                {k.k}
              </span>
            ))}
          </div>
        )}
        <div className="fa-text" style={{ fontSize: textSize }}>
          {c.text.trim() ? <RulesText text={c.text} /> : reminder ? <p className="reminder">{reminder}</p> : null}
        </div>
        {hasStats && (
          <div className="fa-stats">
            <small>ATK</small>
            <span className={c.atkMod ?? ''}>{c.atk}</span>
            <i />
            <span className={c.defMod ?? ''}>{c.def}</span>
            <small>DEF</small>
          </div>
        )}
      </div>
      {c.crack ? (
        <svg className="cracks" viewBox="0 0 340 476" aria-hidden="true">
          <path d="M60 120 l40 50 -25 40 45 55 -15 45 M100 170 l60 -20 M120 265 l-50 30" />
          {c.crack > 0.34 && <path d="M260 90 l-35 60 30 35 -40 70 20 50 M255 185 l45 20 M215 255 l-40 -10" />}
          {c.crack > 0.67 && <path d="M170 300 l-20 50 35 30 -30 60 M150 350 l-55 15 M185 380 l50 -5 M120 60 l30 40 -10 30" />}
        </svg>
      ) : null}
    </div>
  );
}
