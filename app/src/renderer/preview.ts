// "If nobody responds": play the game forward on a copy, with everyone passing, until the thing on top of the
// stack (or the current combat) is finished, and report what happened in plain lines from the log.
import { apply, botAction, getDef, whoMustAct } from './engine';
import { ME } from './me';
import type { Action, GameState, Iid, PlayerId } from './engine';
import { youify } from './text';


/** Log lines that say what happened (not who passed or paid). */
export function meaningfulLines(lines: string[]): string[] {
  return lines
    .map((l) => l.replace(/^\[T\d+\] /, ''))
    .filter((l) => !/^---|passes|^Resolving |pays \d+ mana|ends their Main phase|^Combat: /.test(l))
    .map(youify);
}

/** What you'd answer if you did nothing: don't block, don't boost, decline, keep the order. */
function passiveAnswer(s: GameState): Action {
  const d = s.decision!;
  const pid = d.player;
  switch (d.kind) {
    case 'block':
      return { type: 'block', player: pid, blocker: null };
    case 'boostAttack':
    case 'boostDefense':
      return { type: 'boost', player: pid, creatures: [] };
    case 'confirm':
      return { type: 'confirm', player: pid, accept: false };
    case 'guide':
      return { type: 'guide', player: pid, top: d.cards, bottom: [] };
    case 'mode':
      return { type: 'mode', player: pid, index: 0 };
    case 'choosePlayer':
      return { type: 'choosePlayer', player: pid, choice: d.options.find((o) => o !== pid) ?? d.options[0] };
    case 'choose':
      return { type: 'choose', player: pid, choice: d.optional ? null : d.options[0] };
  }
}

export interface Outcome {
  lines: string[];
  after: GameState;
  /** You lose a card on the field or life. */
  hurtsYou: boolean;
}

/** Plays forward until the top stack item has resolved, or (with an empty stack) the combat has ended. */
export function ifNobodyResponds(s: GameState): Outcome | null {
  const top = s.stack[s.stack.length - 1];
  const combat = !top && s.combat;
  if (!top && !combat) return null;
  let t = s;
  try {
    for (let i = 0; i < 120; i++) {
      if (t.phase === 'over') break;
      if (top && !t.stack.some((it) => it.id === top.id) && !t.resolving) break;
      if (combat && !t.combat) break;
      if (t.decision) {
        t = apply(t, t.decision.player === ME ? passiveAnswer(t) : botAction(t));
        continue;
      }
      const who = whoMustAct(t);
      if (who === null) break;
      if (!t.window) break; // back in someone's Main phase
      t = apply(t, { type: 'pass', player: who });
    }
  } catch {
    return null;
  }
  const lines = meaningfulLines(t.log.slice(s.log.length));
  const mine = Object.keys(s.perms).filter((iid) => s.perms[iid].controller === ME);
  const hurtsYou = mine.some((iid) => !t.perms[iid] || t.perms[iid].controller !== ME) || t.players[ME].life < s.players[ME].life;
  return { lines, after: t, hurtsYou };
}

/** "Cat's Divine judgment", "Your Forest: first attack draws". */
export function stackItemTitle(s: GameState, i: number): string {
  const it = s.stack[i];
  const owner = it.controller === ME ? 'Your' : `${s.players[it.controller].name}'s`;
  if (it.kind === 'card') return `${owner} ${getDef(s.cards[it.iid].cardId).name}`;
  const src = it.source.startsWith('field:') ? 'Field' : getDef(s.cards[it.source].cardId).name;
  return `${owner} ${src}: ${it.label}`;
}

/** The cards an item on the stack is aimed at (and its source). */
export function stackItemCards(s: GameState, i: number): { source: Iid | null; targets: Iid[] } {
  const it = s.stack[i];
  if (it.kind === 'card') return { source: it.iid, targets: it.targets };
  return { source: it.source.startsWith('field:') ? null : it.source, targets: it.ctx.targets };
}

/** "your Vampire Duke", "Ben's Goblin Rusher", "Cat's Morale Boost on the stack". */
export function describeTarget(s: GameState, id: string): string {
  const card = s.cards[id];
  if (!card) return id;
  const name = getDef(card.cardId).name;
  const perm = s.perms[id];
  if (perm) return perm.controller === ME ? `your ${name}` : `${s.players[perm.controller].name}'s ${name}`;
  const st = s.stack.find((x) => x.kind === 'card' && x.iid === id);
  if (st) return `${st.controller === ME ? 'your' : `${s.players[st.controller].name}'s`} ${name} (on the stack)`;
  return name;
}
