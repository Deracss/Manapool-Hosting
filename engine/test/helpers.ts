// Test harness: builds games in a chosen state and drives them forward.
import { apply, cardIdByName, createGame, whoMustAct } from '../src/index.ts';
import type { Action, Decision, GameState, Iid, PlayerId } from '../src/index.ts';
import { newInstance } from '../src/engine/util.ts';

export const FILLER = 'research'; // an unscripted Spell used to pad test decks

export interface SetupOpts {
  players?: number;
  fields?: (string | null)[];
  deckSize?: number;
  seed?: number;
}

/** A game where everyone kept and player 0 is in their first Main phase. */
export function setup(opts: SetupOpts = {}): GameState {
  const n = opts.players ?? 4;
  let s = createGame({
    players: Array.from({ length: n }, (_, i) => ({
      name: `P${i}`,
      deck: Array(opts.deckSize ?? 20).fill(FILLER),
      field: opts.fields?.[i] ?? null,
    })),
    seed: opts.seed ?? 7,
    validateDecks: false,
  });
  for (let i = 0; i < n; i++) s = apply(s, { type: 'keep', player: i });
  return passRound(passRound(s)); // through the Upkeep and Draw windows into Main
}

export const id = (name: string) => cardIdByName(name);

/** Puts a card straight onto a player's field (no triggers). */
export function put(s: GameState, pid: PlayerId, name: string, o: { sick?: boolean; tapped?: boolean } = {}): Iid {
  const c = newInstance(s, id(name), pid, name.endsWith('Token'));
  s.players[pid].field.push(c.iid);
  s.perms[c.iid] = {
    iid: c.iid,
    controller: pid,
    tapped: o.tapped ?? false,
    sick: o.sick ?? false,
    enteredTurn: s.turn,
    counters: 0,
    counterAtk: 0,
    counterDef: 0,
    countersFrom: {},
    damage: 0,
    mods: [],
    flags: { boostedThisTurn: false, wasBoostedThisTurn: false, dealtPlayerDamageThisTurn: false },
    abilitiesUsed: [],
    memo: [],
  };
  return c.iid;
}

export function toHand(s: GameState, pid: PlayerId, name: string): Iid {
  const c = newInstance(s, id(name), pid);
  s.players[pid].hand.push(c.iid);
  return c.iid;
}

export function toDeckTop(s: GameState, pid: PlayerId, name: string): Iid {
  const c = newInstance(s, id(name), pid);
  s.players[pid].deck.unshift(c.iid);
  return c.iid;
}

export function giveMana(s: GameState, pid: PlayerId, n: number): void {
  s.players[pid].rocks += n;
}

export function act(s: GameState, a: Action): GameState {
  return apply(s, a);
}

/** Everyone passes once around the current window. */
export function passRound(s: GameState): GameState {
  const n = s.players.filter((p) => !p.eliminated).length;
  for (let i = 0; i < n && s.window && !s.decision; i++) s = apply(s, { type: 'pass', player: s.window.holder });
  return s;
}

export interface Choices {
  block?: Iid | null;
  atkBoost?: Iid[];
  defBoost?: Iid[];
  choose?: (d: Extract<Decision, { kind: 'choose' }>) => Iid | null;
  confirm?: boolean; // answer to "may" questions (default yes)
  answer?: (d: Extract<Decision, { kind: 'confirm' }>) => boolean; // per-question answers (e.g. who accepts an OFFER)
  mode?: number; // answer to "choose one" questions (default the first)
  guide?: (cards: Iid[]) => { top: Iid[]; bottom: Iid[] }; // default: keep the order
  player?: PlayerId; // answer to "choose a player" questions
}

/** Answers decisions and passes priority until the active player is free in their Main phase again. */
export function settle(s: GameState, c: Choices = {}): GameState {
  for (let guard = 0; guard < 200; guard++) {
    const d = s.decision;
    if (s.phase === 'over') return s;
    if (d) {
      if (d.kind === 'block') s = apply(s, { type: 'block', player: d.player, blocker: c.block ?? null });
      else if (d.kind === 'boostAttack') s = apply(s, { type: 'boost', player: d.player, creatures: c.atkBoost ?? [] });
      else if (d.kind === 'boostDefense') s = apply(s, { type: 'boost', player: d.player, creatures: c.defBoost ?? [] });
      else if (d.kind === 'confirm') s = apply(s, { type: 'confirm', player: d.player, accept: c.answer ? c.answer(d) : (c.confirm ?? true) });
      else if (d.kind === 'mode') s = apply(s, { type: 'mode', player: d.player, index: c.mode ?? 0 });
      else if (d.kind === 'guide') s = apply(s, { type: 'guide', player: d.player, ...(c.guide ? c.guide(d.cards) : { top: d.cards, bottom: [] }) });
      else if (d.kind === 'choosePlayer') s = apply(s, { type: 'choosePlayer', player: d.player, choice: c.player ?? d.options.find((o) => o !== d.player) ?? d.options[0] });
      else s = apply(s, { type: 'choose', player: d.player, choice: c.choose ? c.choose(d) : d.options[0] });
      continue;
    }
    if (s.window && s.window.then !== 'endMain' && s.phase === 'main') {
      s = apply(s, { type: 'pass', player: s.window.holder });
      continue;
    }
    return s;
  }
  throw new Error('settle() did not finish');
}

export function attack(s: GameState, pid: PlayerId, attacker: Iid, target: PlayerId, c: Choices & { targetCreature?: Iid } = {}): GameState {
  s = apply(s, { type: 'attack', player: pid, attacker, target, targetCreature: c.targetCreature });
  return settle(s, c);
}

/** Ends the current turn and plays through to `pid`'s next free Main phase, answering choices with `c`. */
export function advanceTo(s: GameState, pid: PlayerId, c: Choices = {}): GameState {
  for (let guard = 0; guard < 500; guard++) {
    if (s.phase === 'over') return s;
    if (s.decision) {
      s = settle(s, c);
      continue;
    }
    if (s.phase === 'main' && !s.window && s.active === pid && s.log.at(-1) !== undefined && guard > 0) return s;
    const who = whoMustAct(s)!;
    s = apply(s, { type: 'pass', player: who });
  }
  throw new Error('advanceTo() did not finish');
}

export const life = (s: GameState, pid: PlayerId) => s.players[pid].life;
export const handSize = (s: GameState, pid: PlayerId) => s.players[pid].hand.length;
export const fieldNames = (s: GameState, pid: PlayerId) => s.players[pid].field.map((i) => s.cards[i].cardId);
