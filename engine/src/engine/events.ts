// Game events and the triggered abilities that listen for them.
import { getDef } from '../cards/registry.ts';
import type { EffectCtx, GameEvent, GameState, PlayerId, TriggeredAbility } from '../types.ts';
import { evalCondition, runQueue } from './effects.ts';
import { isCreature, matches } from './stats.ts';
import { defOf, log, nameOf } from './util.ts';

interface Listener {
  source: string;
  controller: PlayerId;
  ab: TriggeredAbility;
}

function listeners(s: GameState, ev: GameEvent): Listener[] {
  const out: Listener[] = [];
  for (const p of s.players) {
    if (p.eliminated) continue;
    for (const iid of p.field) for (const ab of defOf(s, iid).script.triggers ?? []) out.push({ source: iid, controller: p.id, ab });
    if (p.fieldCard) for (const ab of getDef(p.fieldCard).script.triggers ?? []) out.push({ source: `field:${p.id}`, controller: p.id, ab });
  }
  // A destroyed card still sees its own "when destroyed" ability, and a charged card its own "ON CHARGE THIS CARD".
  if (ev.name === 'destroyed' && ev.subject && ev.player !== undefined && !s.perms[ev.subject]) {
    for (const ab of defOf(s, ev.subject).script.triggers ?? []) out.push({ source: ev.subject, controller: ev.player, ab });
  }
  if (ev.name === 'charge' && ev.subject && ev.player !== undefined) {
    // Only "ON CHARGE THIS CARD" abilities work from the mana pool; "whenever you charge" ones need the card on the field.
    for (const ab of defOf(s, ev.subject).script.triggers ?? []) if (ab.subject === 'self') out.push({ source: ev.subject, controller: ev.player, ab });
  }
  return out;
}

export function emit(s: GameState, ev: GameEvent): void {
  for (const { source, controller, ab } of listeners(s, ev)) {
    if (ab.on !== ev.name) continue;
    if (ab.subject === 'self' && ev.subject !== source) continue;
    if (ab.subject && ab.subject !== 'self' && (!ev.subject || !matches(s, ev.subject, ab.subject, controller, source))) continue;
    const ctx: EffectCtx = { source, controller, targets: [], vars: {}, event: ev };
    if (ab.condition && !evalCondition(s, ab.condition, ctx)) continue;
    if (ab.immediate) {
      log(s, `${nameOf(s, source)}: ${ab.label}.`);
      runQueue(s, [...ab.effects], ctx);
    } else {
      // Twin Rhythms: your Upkeep effects trigger twice (once more per copy).
      const times = ev.name === 'upkeep' ? 1 + s.players[controller].field.filter((iid) => s.perms[iid] && (defOf(s, iid).script.statics ?? []).some((x) => x.kind === 'twinUpkeep')).length : 1;
      for (let i = 0; i < times; i++) s.pendingTriggers.push({ source, controller, label: ab.label, effects: ab.effects, ctx: i === 0 ? ctx : structuredClone(ctx) });
    }
    // Frog Song listens for your creatures' triggered abilities.
    if (ab.on !== 'creatureTriggered' && s.perms[source] && isCreature(s, source)) emit(s, { name: 'creatureTriggered', subject: source, player: controller });
  }
}
