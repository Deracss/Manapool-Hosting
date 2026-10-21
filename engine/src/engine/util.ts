import { getDef } from '../cards/registry.ts';
import type { CardDef, CardInstance, GameState, Iid, Player, PlayerId } from '../types.ts';
import { RulesError } from '../types.ts';

export function log(s: GameState, msg: string): void {
  s.log.push(`[T${s.turn}] ${msg}`);
}

export function player(s: GameState, pid: PlayerId): Player {
  const p = s.players[pid];
  if (!p) throw new RulesError(`No player ${pid}`);
  return p;
}

export function inst(s: GameState, iid: Iid): CardInstance {
  const c = s.cards[iid];
  if (!c) throw new RulesError(`No card ${iid}`);
  return c;
}

/** The card as it is now: the printed card with any overrides applied (Anthropomorph, special tokens). */
export function defOf(s: GameState, iid: Iid): CardDef {
  const c = inst(s, iid);
  const d = getDef(c.cardId);
  const o = c.override;
  if (!o) return d;
  const script = o.scriptFrom === undefined ? d.script : o.scriptFrom === null ? {} : getDef(o.scriptFrom).script;
  const text = o.text ?? (o.scriptFrom === undefined ? d.text : o.scriptFrom === null ? '' : getDef(o.scriptFrom).text);
  return {
    ...d,
    name: o.name ?? d.name,
    type: o.type ?? d.type,
    tribe: o.tribe ?? d.tribe,
    attack: o.attack ?? d.attack,
    defense: o.defense ?? d.defense,
    text,
    script,
    scripted: o.scriptFrom === undefined ? d.scripted : o.scriptFrom === null ? true : getDef(o.scriptFrom).scripted,
  };
}

export function nameOf(s: GameState, iid: Iid | null | undefined): string {
  if (!iid) return '(nothing)';
  if (iid.startsWith('field:')) {
    const fid = player(s, Number(iid.slice(6))).fieldCard;
    return fid ? getDef(fid).name : 'Field';
  }
  return defOf(s, iid).name;
}

export function pname(s: GameState, pid: PlayerId): string {
  return player(s, pid).name;
}

export function alive(s: GameState): PlayerId[] {
  return s.players.filter((p) => !p.eliminated).map((p) => p.id);
}

/** The next living player clockwise (to the left). */
export function nextAlive(s: GameState, pid: PlayerId): PlayerId {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const q = (pid + i) % n;
    if (!s.players[q].eliminated) return q;
  }
  return pid;
}

export function onField(s: GameState, iid: Iid | null | undefined): iid is Iid {
  return !!iid && !!s.perms[iid];
}

export function controllerOf(s: GameState, iid: Iid): PlayerId {
  return s.perms[iid]?.controller ?? inst(s, iid).owner;
}

export function newInstance(s: GameState, cardId: string, owner: PlayerId, isToken = false): CardInstance {
  const c: CardInstance = { iid: `c${s.nextId++}`, cardId, owner, isToken, extraKeywords: [] };
  s.cards[c.iid] = c;
  return c;
}

// Seeded RNG (mulberry32), stored in the state so games replay exactly.
export function random(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(s: GameState, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function fail(msg: string): never {
  throw new RulesError(msg);
}
