// Priority windows and the stack, working like Magic: The Gathering.
// - Each step that has a response window starts with the active player holding priority.
// - When a player adds something to the stack, priority goes to the player on their left, then clockwise.
// - When every living player passes in a row, only the TOP item resolves. Then the active player gets
//   priority again, and players may respond before the next item resolves.
// - When everyone passes with an empty stack, the step ends.
import type { Effect, EffectCtx, GameState, Iid, PlayerId, StackItem, WindowThen } from '../types.ts';
import { afterBlock, afterDeclare, resolveCombat } from './combat.ts';
import { runQueue } from './effects.ts';
import { afterDraw, afterEnd, afterUpkeep, endMain } from './turns.ts';
import { alive, defOf, fail, log, nameOf, nextAlive, player, pname } from './util.ts';
import { checkState, enterField } from './zones.ts';
import { payMana } from './mana.ts';

/** Moves waiting triggered abilities onto the stack (in the order they happened). */
export function flushTriggers(s: GameState): boolean {
  let any = false;
  for (const t of s.pendingTriggers) {
    if (player(s, t.controller).eliminated) continue;
    s.stack.push({ id: s.nextId++, kind: 'ability', source: t.source, controller: t.controller, label: t.label, effects: t.effects, ctx: t.ctx });
    log(s, `${nameOf(s, t.source)} triggers: ${t.label}.`);
    any = true;
  }
  s.pendingTriggers = [];
  return any;
}

/** Opens a response window for a step. Waiting triggers go on the stack first; the active player acts first. */
export function openRound(s: GameState, then: WindowThen): void {
  flushTriggers(s);
  s.window = { holder: s.active, passes: 0, then };
}

export function addToStack(s: GameState, item: StackItem, by: number): void {
  s.stack.push(item);
  if (!s.window) s.window = { holder: s.active, passes: 0, then: 'returnMain' };
  s.window.passes = 0;
  s.window.holder = nextAlive(s, by);
}

export function passPriority(s: GameState, pid: number): void {
  const w = s.window;
  if (!w) fail('Nothing to pass.');
  if (w.holder !== pid) fail(`It is ${pname(s, w.holder)}'s priority, not ${pname(s, pid)}'s.`);
  w.passes++;
  if (w.passes < alive(s).length) {
    w.holder = nextAlive(s, w.holder);
    return;
  }
  if (s.stack.length) resolveTop(s);
  else closeWindow(s);
}

function closeWindow(s: GameState): void {
  const then = s.window!.then;
  s.window = null;
  runThen(s, then);
}

export function runThen(s: GameState, then: WindowThen): void {
  if (s.phase === 'over') return;
  switch (then) {
    case 'returnMain':
      if (s.pendingTriggers.length) openRound(s, 'returnMain');
      return;
    case 'afterDeclare':
      return afterDeclare(s);
    case 'afterBlock':
      return afterBlock(s);
    case 'afterBoost':
      return resolveCombat(s);
    case 'endMain':
      return endMain(s);
    case 'afterUpkeep':
      return afterUpkeep(s);
    case 'afterDraw':
      return afterDraw(s);
    case 'afterEnd':
      return afterEnd(s);
  }
}

function resolveItem(s: GameState, item: StackItem): 'done' | 'paused' {
  if (item.kind === 'ability') {
    log(s, `Resolving ${nameOf(s, item.source)}: ${item.label}.`);
    return runQueue(s, [...item.effects], item.ctx);
  }
  const d = defOf(s, item.iid);
  log(s, `Resolving ${d.name}.`);
  if (d.type === 'Creature' || d.type === 'Artifact' || d.type === 'Anthem') {
    enterField(s, item.iid, item.controller);
    return 'done';
  }
  if (!s.cards[item.iid].isToken) player(s, item.controller).discard.push(item.iid); // copies simply vanish
  if (!d.scripted) log(s, `(${d.name} is not scripted yet, so it does nothing.)`);
  const ctx: EffectCtx = { source: item.iid, controller: item.controller, targets: item.targets, vars: {} };
  return runQueue(s, [...(d.script.resolve ?? [])], ctx);
}

/** Resolves the top item of the stack. */
function resolveTop(s: GameState): void {
  const item = s.stack.pop()!;
  s.resolving = true;
  const r = resolveItem(s, item);
  if (r === 'paused') return; // a player must choose; continueAfterChoice finishes it
  finishResolution(s);
}

function finishResolution(s: GameState): void {
  s.resolving = false;
  checkState(s);
  if (s.phase === 'over') return;
  flushTriggers(s);
  const w = s.window;
  if (!w) return;
  // In the active player's Main phase, an empty stack hands control back to them.
  if (!s.stack.length && s.phase === 'main' && !s.combat && (w.then === 'returnMain' || w.then === 'endMain')) {
    s.window = null;
    return;
  }
  w.passes = 0;
  w.holder = s.active;
}

export function continueAfterChoice(s: GameState, choice: Iid | null): void {
  const d = s.decision;
  if (!d || d.kind !== 'choose') fail('No choice is pending.');
  if (choice === null && !d.optional) fail('You must choose one.');
  if (choice !== null && !d.options.includes(choice)) fail('That is not one of the options.');
  s.decision = null;
  d.ctx.vars[d.as] = choice;
  if (runQueue(s, d.queue, d.ctx) === 'paused') return;
  if (s.resolving) finishResolution(s);
  else checkState(s);
}

export function continueAfterConfirm(s: GameState, accept: boolean): void {
  const d = s.decision;
  if (!d || d.kind !== 'confirm') fail('Nothing to confirm.');
  s.decision = null;
  if (accept) {
    payMana(s, d.player, d.cost);
    d.queue.unshift(...d.then);
  } else {
    log(s, `${pname(s, d.player)} declines.`);
    if (d.else) d.queue.unshift(...d.else);
  }
  if (runQueue(s, d.queue, d.ctx) === 'paused') return;
  if (s.resolving) finishResolution(s);
  else checkState(s);
}

/** Finishes the effect that was waiting on a decision. */
function resume(s: GameState, queue: Effect[], ctx: EffectCtx): void {
  if (runQueue(s, queue, ctx) === 'paused') return;
  if (s.resolving) finishResolution(s);
  else checkState(s);
}

/** GUIDE: `top` go back on top (top[0] uppermost), `bottom` go under the deck in that order. */
export function continueAfterGuide(s: GameState, top: Iid[], bottom: Iid[]): void {
  const d = s.decision;
  if (!d || d.kind !== 'guide') fail('Nothing to guide.');
  const all = [...top, ...bottom];
  if (all.length !== d.cards.length || new Set(all).size !== all.length || all.some((c) => !d.cards.includes(c))) fail('Place every card you looked at exactly once.');
  s.decision = null;
  const p = player(s, d.player);
  const rest = p.deck.slice(d.cards.length);
  p.deck = [...top, ...rest, ...bottom];
  log(s, `${p.name} guides: ${top.length} on top, ${bottom.length} on the bottom.`);
  resume(s, d.queue, d.ctx);
}

export function continueAfterMode(s: GameState, index: number): void {
  const d = s.decision;
  if (!d || d.kind !== 'mode') fail('No choice is pending.');
  if (!d.modes[index]) fail('That is not one of the options.');
  s.decision = null;
  log(s, `${pname(s, d.player)} chooses: ${d.labels[index]}.`);
  d.queue.unshift(...d.modes[index]);
  resume(s, d.queue, d.ctx);
}

export function continueAfterChoosePlayer(s: GameState, choice: PlayerId): void {
  const d = s.decision;
  if (!d || d.kind !== 'choosePlayer') fail('No choice is pending.');
  if (!d.options.includes(choice)) fail('That player is not an option.');
  s.decision = null;
  d.ctx.vars[`p:${d.as}`] = choice;
  resume(s, d.queue, d.ctx);
}
