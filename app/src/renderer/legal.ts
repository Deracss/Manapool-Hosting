// What the human player can do right now. Legality is checked by asking the engine:
// an action is legal exactly when apply() accepts it.
import { activatedOf, apply, canAttack, getDef, isCreature, keywordsOf, RulesError, targetOptions, whoMustAct } from './engine';
import type { Action, GameState, Iid, PlayerId } from './engine';

export function tryApply(s: GameState, a: Action): { ok: true; state: GameState } | { ok: false; error: string } {
  try {
    return { ok: true, state: apply(s, a) };
  } catch (e) {
    if (e instanceof RulesError) return { ok: false, error: e.message };
    throw e;
  }
}

export function isLegal(s: GameState, a: Action): boolean {
  return tryApply(s, a).ok;
}

/** Legal choices for each target slot of a card (before checking cost and timing). */
export function targetSlots(s: GameState, me: PlayerId, card: Iid): string[][] {
  return (getDef(s.cards[card].cardId).script.targets ?? []).map((spec) => targetOptions(s, spec, me, card));
}

/** What each target slot asks for. */
export function targetPrompts(cardId: string): string[] {
  return (getDef(cardId).script.targets ?? []).map(
    (spec) => spec.prompt ?? (spec.kind === 'stackCard' ? `Choose a ${spec.types.join(' or ')} on the stack` : spec.kind === 'creature' ? 'Choose a creature' : `Choose ${spec.filter.type ? `a${/^[AEIOU]/.test(spec.filter.type) ? 'n' : ''} ${spec.filter.type}` : 'a card'}`),
  );
}

/** One set of different targets, one per slot, if there is one. */
export function firstCombo(slots: string[][], picked: string[] = []): string[] | null {
  if (picked.length === slots.length) return picked;
  for (const t of slots[picked.length]) {
    if (picked.includes(t)) continue;
    const r = firstCombo(slots, [...picked, t]);
    if (r) return r;
  }
  return null;
}

export interface HandOption {
  play: { legal: boolean; why?: string; slots: string[][]; needsTarget: boolean };
  charge: { legal: boolean; why?: string };
}

export function handOptions(s: GameState, me: PlayerId, card: Iid): HandOption {
  const needsTarget = (getDef(s.cards[card].cardId).script.targets?.length ?? 0) > 0;
  let play: HandOption['play'];
  if (needsTarget) {
    const slots = targetSlots(s, me, card);
    const combo = firstCombo(slots);
    if (!combo) {
      const r = tryApply(s, { type: 'play', player: me, card, targets: [] });
      const why = r.ok || /Choose \d target/.test(r.error) ? 'No legal targets.' : r.error;
      play = { legal: false, why, slots, needsTarget };
    } else {
      const r = tryApply(s, { type: 'play', player: me, card, targets: combo });
      play = { legal: r.ok, why: r.ok ? undefined : r.error, slots, needsTarget };
    }
  } else {
    const r = tryApply(s, { type: 'play', player: me, card });
    play = { legal: r.ok, why: r.ok ? undefined : r.error, slots: [], needsTarget };
  }
  const c = tryApply(s, { type: 'charge', player: me, card });
  return { play, charge: { legal: c.ok, why: c.ok ? undefined : c.error } };
}

export interface FieldOption {
  attackTargets: PlayerId[];
  faceoffTargets: { player: PlayerId; creature: Iid }[];
  abilities: { index: number; label: string; legal: boolean; why?: string }[];
}

export function fieldOptions(s: GameState, me: PlayerId, card: Iid): FieldOption {
  const out: FieldOption = { attackTargets: [], faceoffTargets: [], abilities: [] };
  const free = s.phase === 'main' && s.active === me && !s.window && !s.decision && !s.combat && !s.stack.length;
  if (free && isCreature(s, card) && canAttack(s, card)) {
    for (const p of s.players) if (p.id !== me && !p.eliminated) out.attackTargets.push(p.id);
    if (keywordsOf(s, card).includes('FACEOFF')) {
      for (const p of s.players) {
        if (p.id === me || p.eliminated) continue;
        for (const c of p.field) if (isCreature(s, c)) out.faceoffTargets.push({ player: p.id, creature: c });
      }
    }
  }
  activatedOf(s, card).forEach((ab, index) => {
    const r = tryApply(s, { type: 'activate', player: me, card, ability: index });
    out.abilities.push({ index, label: ab.label, legal: r.ok, why: r.ok ? undefined : r.error });
  });
  return out;
}

/** True when the human holds priority but has nothing they could possibly do with it. */
export function nothingToRespondWith(s: GameState, me: PlayerId): boolean {
  if (whoMustAct(s) !== me || s.decision || !s.window) return false;
  const p = s.players[me];
  for (const c of p.hand) if (handOptions(s, me, c).play.legal) return false;
  for (const c of p.field) if (fieldOptions(s, me, c).abilities.some((a) => a.legal)) return false;
  return true;
}
